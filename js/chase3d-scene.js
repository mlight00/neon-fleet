// ── Neon Fleet 실제 3D — scene / camera / light / object pool 수명주기 (작업지시서 §5·§9) ──
//  WebGLRenderer + PerspectiveCamera + HemisphereLight/DirectionalLight. 그림자·포스트프로세싱·블룸 없음(§9.1).
//  개체는 pool 로 재사용하고 프레임마다 Geometry/Material 을 새로 만들지 않는다(§9.2). teardown 시 dispose(§9.4).
//  이 모듈은 `?chase3d=1`에서 동적 import되는 renderer 를 통해서만 로드된다(§3.2).
import * as THREE from './vendor/three.module.js';
import { createModelKit } from './chase3d-models.js';
import { CAMERA } from './chase3d-mapping.js';

// pooled Group/Mesh 는 kit 의 공유 geometry/material 을 참조 → pool.dispose 는 scene 에서 제거만(공유 자원은 kit 이 해제).
class Pool {
  constructor(scene, factory) { this.scene = scene; this.factory = factory; this.items = []; }
  sync(n) {
    while (this.items.length < n) { const m = this.factory(); m.visible = false; this.scene.add(m); this.items.push(m); }
    for (let i = 0; i < this.items.length; i++) this.items[i].visible = i < n;
    return this.items;
  }
  active() { return this.items.filter((m) => m.visible).length; }
  clear() { for (const m of this.items) { this.scene.remove(m); } this.items.length = 0; }
}

/**
 * WebGL 장면을 만든다. 실패하면 { ok:false, reason } 을 돌려 renderer 가 RC2 로 복귀하게 한다(§3.3).
 * @returns scene 핸들 또는 실패 정보
 */
export function createChaseScene(canvas) {
  let renderer;
  const rendererOpts = { canvas, alpha: true, premultipliedAlpha: false, antialias: true, powerPreference: 'high-performance' };
  try {
    renderer = new THREE.WebGLRenderer(rendererOpts);
  } catch (e1) {
    try { renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false }); }  // 안전 설정 1회 재시도(§5.1)
    catch (e2) { return { ok: false, reason: 'renderer-create-failed', error: String(e2 && e2.message || e2) }; }
  }
  renderer.setClearColor(0x000000, 0);   // 투명 — #game(2D)이 뒤에서 비침
  renderer.autoClear = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(CAMERA.chase.fov, 1, CAMERA.near, CAMERA.far);
  camera.matrixAutoUpdate = true;

  // 조명(§9.1): 절제된 반구광 + 방향광. 그림자 없음.
  const hemi = new THREE.HemisphereLight(0xbfd6ff, 0x161a2a, 1.05);
  const dir = new THREE.DirectionalLight(0xfff2d6, 1.35); dir.position.set(-4, 8, -3);
  const rim = new THREE.DirectionalLight(0x6fe8ff, 0.5); rim.position.set(3, 2, 10);   // 함미쪽 림라이트(엔진 강조)
  scene.add(hemi, dir, rim);

  const kit = createModelKit();

  // 개체
  const flagship = kit.flagship(); flagship.visible = false; scene.add(flagship);
  let droneCap = 32;
  let drones = kit.droneInstanced(droneCap); scene.add(drones);
  const pools = {
    cruiser: new Pool(scene, kit.cruiser),
    b1: new Pool(scene, kit.creatureB1),
    b4: new Pool(scene, kit.sniperB4),
    boss: new Pool(scene, kit.reaperB8),
    bullet: new Pool(scene, kit.laser),
    lance: new Pool(scene, kit.lance),
    ebullet: new Pool(scene, kit.enemyBullet),
    gatebar: new Pool(scene, kit.gateBar),
    pickup: new Pool(scene, kit.pickup),
  };

  // 재사용 임시 객체(프레임 할당 0)
  const _m = new THREE.Matrix4(); const _q = new THREE.Quaternion(); const _p = new THREE.Vector3(); const _s = new THREE.Vector3(); const _e = new THREE.Euler();
  let lastInstanceCount = 0;

  function setViewport(w, h, dpr) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);   // false: CSS 크기는 건드리지 않음(3캔버스 동일 CSS 크기 유지)
    camera.aspect = w > 0 && h > 0 ? w / h : 1;
    camera.updateProjectionMatrix();
  }

  // mapping.makeChaseCamera 와 동일한 eye/target/fov 로 THREE 카메라 설정 → 투영 일치(§8). 브라우저 QA 교차검증.
  function setCamera(cam3d) {
    camera.fov = cam3d.fov; camera.aspect = cam3d.aspect;
    camera.position.set(cam3d.eye[0], cam3d.eye[1], cam3d.eye[2]);
    camera.up.set(cam3d.up[0], cam3d.up[1], cam3d.up[2]);
    camera.lookAt(cam3d.target[0], cam3d.target[1], cam3d.target[2]);
    camera.updateProjectionMatrix();
  }

  function placeGroup(g, o, extraRotY = 0) {
    g.position.set(o.x, o.y, o.z);
    g.rotation.set(0, extraRotY, o.bank || 0);
  }

  /** 씬모델(순수 데이터) → mesh 배치. t: 전환(0~1)로 전체 3D 월드 페이드용 opacity 힌트. time: 유휴 애니메이션. */
  function apply(model, t, time) {
    const bob = Math.sin(time * 1.5) * 0.05;
    // 기함
    if (model.flagship) {
      flagship.visible = true;
      placeGroup(flagship, model.flagship);
      flagship.position.y += bob;
      flagship.rotation.z = model.flagship.bank || 0;
      const ei = 1.6 + (model.flagship.charging ? model.flagship.chargeFrac * 3 : 0) + Math.sin(time * 8) * 0.2;
      kit.materials.matEngine.emissiveIntensity = Math.max(0.6, ei);
    } else flagship.visible = false;

    // 드론 — InstancedMesh(§9.2). 활성 수 = instance count.
    const dn = model.drones.length;
    if (dn > droneCap) { scene.remove(drones); drones.dispose(); droneCap = Math.ceil(dn / 16) * 16; drones = kit.droneInstanced(droneCap); scene.add(drones); }
    drones.count = dn;
    for (let i = 0; i < dn; i++) {
      const d = model.drones[i];
      _q.setFromEuler(_e.set(time + i, time * 1.3 + i, 0));
      _s.set(1, 1, 1); _p.set(d.x, d.y + bob * 0.5, d.z);
      _m.compose(_p, _q, _s); drones.setMatrixAt(i, _m);
    }
    drones.instanceMatrix.needsUpdate = true;
    lastInstanceCount = dn;

    // 순양함
    const cr = pools.cruiser.sync(model.cruisers.length);
    model.cruisers.forEach((c, i) => { cr[i].position.set(c.x, c.y + bob * 0.5, c.z); cr[i].rotation.set(0, 0, 0); });

    // 적 — 종류별 분리 풀
    const b1 = model.enemies.filter((e) => e.kind === 'b1');
    const b4 = model.enemies.filter((e) => e.kind === 'b4');
    const others = model.enemies.filter((e) => e.kind === 'b8');   // 일반 목록에 섞인 보스급만 boss 풀로. 'unsupported'는 위장 렌더 금지(§5.2) — dev 장면에선 미표시.
    const b1m = pools.b1.sync(b1.length);
    b1.forEach((e, i) => { const sc = Math.max(0.6, (e.r || 12) / 14); b1m[i].position.set(e.x, e.y, e.z); b1m[i].scale.setScalar(sc); b1m[i].rotation.y = Math.PI; });
    const b4m = pools.b4.sync(b4.length);
    b4.forEach((e, i) => { const sc = Math.max(0.7, (e.r || 16) / 16); b4m[i].position.set(e.x, e.y, e.z); b4m[i].scale.setScalar(sc); b4m[i].rotation.y = Math.PI; });

    // 보스(리퍼로드) — 큰 체급. r 로 스케일.
    const bossList = model.bosses.filter((b) => b.kind === 'b8').concat(others);   // B8만 B8 모델(§5.2) — 다른 보스는 하이브리드에서 기존 2D 유지
    const bm = pools.boss.sync(bossList.length);
    bossList.forEach((b, i) => { const sc = Math.max(1.2, (b.r || 60) / 26); bm[i].position.set(b.x, b.y, b.z); bm[i].scale.setScalar(sc); bm[i].rotation.set(Math.sin(time * 0.4) * 0.1, time * 0.3, 0); });

    // 플레이어 레이저 — z(prev)→z1 방향으로 눕혀 길이 스케일
    const bl = pools.bullet.sync(model.bullets.filter((b) => !b.lance).length);
    const lances = model.bullets.filter((b) => b.lance);
    let bi = 0;
    model.bullets.filter((b) => !b.lance).forEach((b) => orientBeam(bl[bi++], b, 0.6));
    const lm = pools.lance.sync(lances.length);
    lances.forEach((b, i) => orientBeam(lm[i], b, 1.6));

    // 적 투사체
    const eb = pools.ebullet.sync(model.enemyBullets.length);
    model.enemyBullets.forEach((b, i) => { const sc = Math.max(0.7, (b.r || 4) / 4); eb[i].position.set(b.x, b.y, b.z); eb[i].scale.setScalar(sc); });

    // 3레인 게이트 — 레인 경계 기둥. 표시 위치가 판정(레인 rect)과 같은 좌표에서 나옴(§8).
    const bars = [];
    model.gates.forEach((g) => g.lanes.forEach((ln) => { bars.push({ x: ln.x0, z: ln.z }); bars.push({ x: ln.x1, z: ln.z }); }));
    const gb = pools.gatebar.sync(bars.length);
    bars.forEach((b, i) => { gb[i].position.set(b.x, 0.8, b.z); });

    // 픽업
    const pk = pools.pickup.sync(model.pickups.length);
    model.pickups.forEach((p, i) => { pk[i].position.set(p.x, p.y + bob, p.z); pk[i].rotation.set(time, time * 1.3, 0); });
  }

  function orientBeam(mesh, b, thick) {
    const z0 = b.z1 ?? b.z, z1 = b.z;
    const len = Math.max(0.5, Math.abs(z1 - z0) + 0.6);
    mesh.position.set(b.x, b.y, (z0 + z1) / 2);
    mesh.scale.set(thick, len, thick);
    mesh.rotation.set(Math.PI / 2, 0, 0);   // 세로 실린더를 Z축 정렬
  }

  function render() { renderer.render(scene, camera); }

  function info() {
    const r = renderer.info.render;
    let models = 1 * (flagship.visible ? 1 : 0);
    for (const k in pools) models += pools[k].active();
    return { calls: r.calls, triangles: r.triangles, models: models + (drones.count > 0 ? 1 : 0), instances: drones.count, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures };
  }

  let disposed = false;
  function dispose() {
    if (disposed) return; disposed = true;
    for (const k in pools) pools[k].clear();
    scene.remove(drones); drones.dispose();
    scene.remove(flagship);
    kit.dispose();
    scene.remove(hemi, dir, rim);
    renderer.dispose();
    if (renderer.forceContextLoss) { try { renderer.forceContextLoss(); } catch {} }
  }

  return { ok: true, renderer, scene, camera, setViewport, setCamera, apply, render, info, dispose, get instanceCount() { return lastInstanceCount; } };
}

export default { createChaseScene };
