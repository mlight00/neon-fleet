// ── AURORA 모델 검사실 (Opus5 §8) — ?chase3d=1&chase3dLab=aurora 전용, 기본 URL 미로드 ──
//  재현성: 고정 seed·고정 카메라·시간 정지(freeze) → 같은 픽셀. 캡처 훅은 window.__NF3D.lab.
//  Three.js r160 + WebGL2. 색관리: SRGB 출력 + ACESFilmic(§7.3).
import * as THREE from './vendor/three.module.js';
import { createAuroraModel } from './chase3d-aurora-model.js';
import { createB1Model, createB1Geometry, createB1Materials } from './chase3d-b1.js';
import { createB2Model } from './chase3d-b2.js';
import { createB4Model } from './chase3d-b4.js';
import { createBillboardModel } from './chase3d-billboards.js';
import { createGlbShowcase } from './chase3d-glb.js';
import { ENEMY3D, FLAG3D, WEAPON3D } from './chase3d-prop-defs.js';
import { createAlliesModel } from './chase3d-allies.js';
import { createPickupsShowcase } from './chase3d-props.js';
import { forgeEnvEquirect } from './chase3d-aurora-materials.js';
import { CAMERA } from './chase3d-mapping.js';

const VIEWS = {
  top: { pos: [0, 8.2, 0.0], look: [0, 0, 0], up: [0, 0, 1], ortho: 2.65 },   // 노즈(+Z)가 화면 위 — A4 비교 방향
  front: { pos: [0, 1.1, 6.8], look: [0, 0.1, 0] },
  rear: { pos: [0, 1.0, -6.8], look: [0, 0.1, 0] },
  'rear-high': { pos: [0, 3.6, -5.4], look: [0, 0, 0.4] },
  left: { pos: [-6.4, 1.4, -0.8], look: [0, 0.05, 0] },
  right: { pos: [6.4, 1.4, -0.8], look: [0, 0.05, 0] },
  bottom: { pos: [0, -7.8, -0.4], look: [0, 0, 0], up: [0, 0, 1] },
  gameplay: { pos: [0, CAMERA.chase.height, -CAMERA.chase.dist], look: [0, CAMERA.chase.lookY, CAMERA.chase.lookZ], fov: CAMERA.chase.fov },
};

export function createAuroraLab(canvas, opts = {}) {
  const q = new URLSearchParams(typeof location !== 'undefined' ? location.search : '');
  const state = {
    view: opts.view || q.get('labView') || 'rear-high',
    freeze: opts.freeze ?? q.get('labFreeze') === '1',
    rotate: q.get('labRotate') === '1',
    mode: 'lit',            // lit | wireframe | albedo | normal | orm | emissive
    lod: 0, light: true, glow: true, time: 0.6,
  };
  const renderer = new THREE.WebGLRenderer({ canvas, alpha: false, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });   // 검사실 전용: toDataURL 캡처가 직전 뷰 잔상과 섞이지 않게(실측 아티팩트)
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x14161c);   // 중립 어두운 스튜디오(§8)
  // 절차적 IBL(§7.3 참고 교훈): 금속 반사에 환경을 준다 — 무IBL 금속=흑색 방지. PMREM 은 코어 three.
  const envRaw = forgeEnvEquirect(7);
  const envTex = new THREE.DataTexture(envRaw.data, envRaw.w, envRaw.h, THREE.RGBAFormat, THREE.UnsignedByteType);
  envTex.colorSpace = THREE.SRGBColorSpace; envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(envTex);
  scene.environment = envRT.texture;
  pmrem.dispose(); envTex.dispose();

  // 조명(§7.3): key(웜)/fill(쿨)/rim + 하부 바운스 + 함미 보조광
  const lights = new THREE.Group();
  const key = new THREE.DirectionalLight(0xffe9cf, 2.6); key.position.set(-4.5, 6.5, 3.5);
  const fill = new THREE.DirectionalLight(0x9fc2ff, 0.85); fill.position.set(5, 2.5, 1.5);
  const rim = new THREE.DirectionalLight(0x8fe8ff, 1.1); rim.position.set(2.5, 3.2, -6.5);
  const bounce = new THREE.HemisphereLight(0x2a3038, 0x0c0e12, 0.55);
  const sternAux = new THREE.PointLight(0x66d8ff, 12, 9, 2); sternAux.position.set(0, 0.4, -3.4);   // 함미가 검게 뭉개지지 않게(§7.3)
  lights.add(key, fill, rim, bounce, sternAux);
  scene.add(lights);

  const mobile = Math.min(canvas.width, canvas.height) <= 480;
  const target = opts.target || 'aurora';   // 'aurora' | 'b1' | 'b2' | 'swarm'
  const t0 = performance.now();
  let model, swarm = null;
  if (target === 'b1') {
    model = createB1Model(THREE, { seed: 7, mobile, lods: [0, 1, 2] });
    model.group.scale.setScalar(4.2);   // 스튜디오에서 크게(전장 1.0 모델)
  } else if (target === 'b2') {
    model = createB2Model(THREE, { seed: 11, mobile, lods: [0, 1, 2] });
    model.group.scale.setScalar(4.2);   // 전장 1.0 모델 — B1 과 같은 스튜디오 배율
  } else if (target === 'b4') {
    model = createB4Model(THREE, { seed: 13, mobile, lods: [0, 1, 2] });
    model.group.scale.setScalar(4.2);
  } else if (target === 'models') {
    model = createGlbShowcase(THREE, ENEMY3D);   // §G-5 실모델 전 종 격자 진열(이사: 진행 없이 한 화면 평가)
    model.group.scale.setScalar(0.9);   // 1.15 는 좌우 열 잘림(실측)
  } else if (target === 'a0') {
    // §G-7 기함 VARCO 단독 진열 — 현행(aurora 타깃)과 A/B 비교용. 회전=아군 함선 규약(rotX -π/2 + rotY π) 가설, 실측 보정.
    model = createGlbShowcase(THREE, { a0: { glb: 'assets/3d/a0_model.glb', rotX: -Math.PI / 2, rotY: Math.PI } });
    model.group.scale.setScalar(2.0);
  } else if (target === 'hazards') {
    //  §G-16 위험물 4종(운석·잔해·돌격기·기뢰) 진열 — 방향 판독용. labView=front 필수.
    model = createGlbShowcase(THREE, { h1: ENEMY3D.h1, h2: ENEMY3D.h2, h3: ENEMY3D.h3, h4: ENEMY3D.h4 });
    model.group.scale.setScalar(0.62);
  } else if (target === 'weapons') {
    model = createGlbShowcase(THREE, WEAPON3D);   // §G-12 기함 무기 5종 격자(포탑3·미사일·포구) — 방향 판독용
    model.group.scale.setScalar(0.62);
  } else if (target === 'flags') {
    model = createGlbShowcase(THREE, FLAG3D);   // §G-8 기함 6등급 격자 진열(T0 EMBER ~ T5 QUASAR) — 진화 순서 육안 확인
    model.group.scale.setScalar(0.62);   // 3열×2행 격자(GAP 1.5)가 세로 뷰포트에 들어오는 배율(실측)
  } else if (target === 'b5' || target === 'b6') {
    model = createBillboardModel(THREE, target);   // §G-4 터렛·위버 = 이사 제작(Gemini) 렌더 빌보드(실전과 동일 판)
    model.group.scale.setScalar(3.3);   // 4.0 은 좌우 잘림(실측) — 여백 확보
  } else if (target === 'allies') {
    model = createAlliesModel(THREE);   // §G-1 위계 비교: 순양함 1 + 드론 3
    model.group.scale.setScalar(1.15);
  } else if (target === 'pickups') {
    model = createPickupsShowcase(THREE);   // §G-3 평가(이사: 수송선이 빨리 터져 평가 불가) — 5종 회전 진열
    model.group.scale.setScalar(0.55);
  } else {
    model = createAuroraModel(THREE, { seed: 7, mobile, lods: [0, 1, 2] });
    if (target === 'swarm') {
      // 스웜: B1 버킷별 InstancedMesh 3개(=3 draw)로 12마리 — "대량 형태 판독" + 전투 구도 미리보기
      const geo = createB1Geometry(THREE, { lod: 0 });
      const bmat = createB1Materials(THREE, { seed: 7, mobile });
      swarm = { geo, bmat, meshes: [] };
      const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3();
      for (const k of ['hull', 'glow', 'core']) {
        const im = new THREE.InstancedMesh(geo.buckets[k], bmat.mats[k], 12);
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * Math.PI * 1.25 - Math.PI * 0.625;
          const R = 5.2 + (i % 3) * 1.5;
          P.set(Math.sin(a) * R, 0.4 + (i % 4) * 0.22, 4.5 + Math.cos(a) * R * 0.55);
          Q.setFromEuler(new THREE.Euler(0, Math.PI + a * 0.2, 0));   // 전면(코어)이 카메라 쪽
          S.setScalar(1.35);
          M.compose(P, Q, S); im.setMatrixAt(i, M);
        }
        im.instanceMatrix.needsUpdate = true;
        scene.add(im); swarm.meshes.push(im);
      }
    }
  }
  const buildMs = Math.round(performance.now() - t0);
  scene.add(model.group);

  const persp = new THREE.PerspectiveCamera(46, 1, 0.1, 120);
  const ortho = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 120);
  let camera = persp;

  // 맵 단독 보기용 베이직 재질(원 재질 참조 보존 → 복귀 가능)
  const solo = { albedo: new Map(), normal: new Map(), orm: new Map(), emissive: new Map() };
  const flat = (tex) => new THREE.MeshBasicMaterial({ map: tex || null, color: tex ? 0xffffff : 0x101010 });
  /** §G-21 §8: 메시 1개를 맵 단독보기 대상으로 등록(멱등).
   *  예전에는 생성 직후 한 번만 traverse 해서, **비동기로 늦게 붙는 GLB**(weapons·hazards·flags 검사실)는
   *  litMat 이 없어 wireframe/albedo/normal 모드가 통째로 먹히지 않았다(Codex P1).
   *  이제는 새 메시가 발견될 때마다 그 시점의 원본 재질을 잡아 등록한다 — 등록은 메시당 1회라 모드 전환마다
   *  재질을 새로 만들지 않고, 원본 참조(litMat)도 잃지 않는다. */
  function registerMesh(o) {
    if (o.userData.litMat) return;
    const m = o.material;
    if (!m) return;
    solo.albedo.set(o, flat(m.map));
    solo.normal.set(o, flat(m.normalMap));
    solo.orm.set(o, flat(m.roughnessMap));
    solo.emissive.set(o, flat(m.emissiveMap || null));
    o.userData.litMat = m;
  }

  function applyMode() {
    model.group.traverse((o) => {
      if (!o.isMesh) return;
      registerMesh(o);   // 늦게 붙은 GLB 메시도 여기서 처음 등록된다(원본 재질이 아직 원본인 시점)
      const lit = o.userData.litMat;
      if (!lit) return;
      if (state.mode === 'lit') { o.material = lit; lit.wireframe = false; }
      else if (state.mode === 'wireframe') { o.material = lit; lit.wireframe = true; }
      else o.material = solo[state.mode].get(o) || lit;
      if (o.name === 'aurora_glow' || o.name === 'aurora_core') o.visible = state.glow || state.mode !== 'lit';
    });
    lights.visible = state.light;
  }
  //  GLB 가 붙는 시점을 이벤트로 알 수 없으므로(로더가 검사실 밖에 있다) 메시 수 변화로 감지한다.
  //  변하지 않으면 아무 일도 하지 않는다 — 매 프레임 재질을 다시 세팅하지 않기 위해서다.
  //  §G-22 §10: 가능하면 로더가 주는 개정 번호(stats().revision)를 쓴다 — 같은 수의 메시가 **교체**되는
  //  경우도 잡힌다. 개정 번호를 제공하지 않는 모델은 메시 수 비교로 폴백한다(개수만이 단일 진실은 아니다).
  let _meshN = -1, _rev = -1;
  function syncLateMeshes() {
    let rev = -1;
    try { const s = model.stats && model.stats(); if (s && Number.isFinite(s.revision)) rev = s.revision; } catch (e) {}
    let n = 0;
    model.group.traverse((o) => { if (o.isMesh) n++; });
    if (n === _meshN && rev === _rev) return;
    _meshN = n; _rev = rev;
    applyMode();
  }
  function applyView() {
    const v = VIEWS[state.view] || VIEWS['rear-high'];
    const aspect = canvas.width / Math.max(1, canvas.height);
    if (v.ortho) {
      camera = ortho;
      const h = v.ortho, w = h * aspect;
      ortho.left = -w; ortho.right = w; ortho.top = h; ortho.bottom = -h;
    } else {
      camera = persp;
      persp.fov = v.fov || 46;
    }
    camera.up.set(...(v.up || [0, 1, 0]));
    camera.position.set(...v.pos);
    camera.lookAt(...v.look);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    if (camera === ortho) { ortho.updateProjectionMatrix(); }
  }
  function setSize(w, h, dpr = 1) {
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    applyView();
  }
  function render() {
    syncLateMeshes();   // 비동기 GLB 가 붙었으면 현재 모드를 그 메시에도 적용(§8)
    if (state.rotate && !state.freeze) model.group.rotation.y += 0.004;
    model.update(state.freeze ? 0.6 : state.time, {});
    renderer.render(scene, camera);
  }
  function step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) { if (!state.freeze) state.time += dt; render(); } return info(); }
  function info() {
    const r = renderer.info;
    return {
      target, view: state.view, mode: state.mode, lod: model.lod, freeze: state.freeze, buildMs,
      calls: r.render.calls, triangles: r.render.triangles, programs: r.programs ? r.programs.length : -1,
      geometries: r.memory.geometries, textures: r.memory.textures,
      stats: model.stats(), swarm: swarm ? { count: 12, meshes: swarm.meshes.length } : null,
    };
  }
  function set(patch) {
    Object.assign(state, patch);
    if (patch.lod !== undefined) model.setLOD(patch.lod);
    applyMode(); applyView();
    return info();
  }
  function dispose() {
    model.dispose();
    if (swarm) { for (const im of swarm.meshes) { scene.remove(im); im.dispose(); } for (const k in swarm.geo.buckets) swarm.geo.buckets[k].dispose(); swarm.bmat.dispose(); }
    for (const m of Object.values(solo)) for (const mat of m.values()) { if (mat.map) { /* 공유 텍스처: model.dispose 가 해제 */ } mat.dispose(); }
    renderer.dispose();
  }
  applyMode(); applyView();
  return { renderer, scene, camera: () => camera, model, state, set, step, render, setSize, info, dispose, VIEWS };
}
export default { createAuroraLab };
