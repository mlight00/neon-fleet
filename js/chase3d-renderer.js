// ── Neon Fleet 실제 3D — RC2 상태를 읽어 3D 장면을 동기화·렌더링하는 오케스트레이터 ──
//  게임의 진실은 계속 2D(§3.1). 이 모듈은 매 프레임 살아있는 world 를 "읽기만" 해서 3D 로 보여준다.
//  실패·컨텍스트 손실 시 available=false 로 떨어뜨려 main 이 RC2 로 복귀하게 한다(§3.3). `?chase3d=1`에서만 동적 import(§3.2).
//  Opus5 hero 하이브리드(§9): opts.hero=true 면 3D 레이어는 "AURORA 기함 1척"만 — 적·이펙트·드론은 main 이 RC2 로 유지.
//  구 전체-3D 경로는 개발 fallback(chase3dTest 레거시 장면)으로 보존(§9.1), hero 에선 사용하지 않음.
import * as THREE from './vendor/three.module.js';
import { createChaseScene } from './chase3d-scene.js';
import { makeChaseCamera, buildSnapshot, computeSceneModel, screenXToWorldX as invX, CAMERA } from './chase3d-mapping.js';
import { transitionT, shouldRender3D, QUALITY } from './chase3d-config.js';
import { createAuroraModel } from './chase3d-aurora-model.js';
import { forgeEnvEquirect } from './chase3d-aurora-materials.js';
import { createBillboardParts } from './chase3d-billboards.js';
import { loadEnemyGlbParts } from './chase3d-glb.js';
import { createDroneGeometry, createCruiserGeometry, createDroneMaterials, createCruiserMaterials, DRONE_INSTANCE_MAX, CRUISER_INSTANCE_MAX } from './chase3d-allies.js';
import { PROP_KEYS, PROP_CAPS, PROP_BASE_COLOR, createPropGeometry, createPropMaterial, createProjMaterial, createPickupParts, createEnemyBulletParts } from './chase3d-props.js';
import { ENEMY3D } from './chase3d-prop-defs.js';

// 적 12종 동시 표시 상한은 ENEMY3D(chase3d-prop-defs) 단일 진실 — 아래는 기존 외부 참조 호환용 파생.
export const B1_INSTANCE_MAX = ENEMY3D.b1.cap;
export const B2_INSTANCE_MAX = ENEMY3D.b2.cap;
export const B4_INSTANCE_MAX = ENEMY3D.b4.cap;
export const B5_INSTANCE_MAX = ENEMY3D.b5.cap;
export const B6_INSTANCE_MAX = ENEMY3D.b6.cap;

export function createChase3D(canvas3d, opts = {}) {
  if (opts.hero) return createHero3D(canvas3d, opts);
  return createLegacy3D(canvas3d);
}

// ── hero: AURORA 전용 씬 (색관리 §7.3 + IBL + 프리웜 §10.2) ──
function createHero3D(canvas3d, opts = {}) {
  const ctl = {
    available: false, degraded: false, hero: true, reason: '', THREE,
    _t: 0, _zoom: 1, _lastW: 0, _lastH: 0, _lastDpr: 0, _rendered: false,
    prewarm: { done: false, programsBefore: -1, programsAfter: -1, ms: 0 },
  };
  let renderer, model, scene, camera, envRT;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas3d, alpha: true, premultipliedAlpha: false, antialias: true, powerPreference: 'high-performance' });
  } catch (e1) {
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas3d, alpha: true, antialias: false }); }
    catch (e2) { ctl.reason = 'renderer-create-failed'; return ctl; }
  }
  try {
    renderer.setClearColor(0x000000, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;            // §7.3 색관리
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.06;
    scene = new THREE.Scene();
    const envRaw = forgeEnvEquirect(7);
    const envTex = new THREE.DataTexture(envRaw.data, envRaw.w, envRaw.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    envTex.colorSpace = THREE.SRGBColorSpace; envTex.mapping = THREE.EquirectangularReflectionMapping; envTex.needsUpdate = true;
    const pmrem = new THREE.PMREMGenerator(renderer);
    envRT = pmrem.fromEquirectangular(envTex);
    scene.environment = envRT.texture;
    pmrem.dispose(); envTex.dispose();
    const key = new THREE.DirectionalLight(0xffe9cf, 2.1); key.position.set(-4.5, 6.5, 3.5);
    const fill = new THREE.DirectionalLight(0x9fc2ff, 0.65); fill.position.set(5, 2.5, 1.5);
    const rim = new THREE.DirectionalLight(0x8fe8ff, 0.9); rim.position.set(2.5, 3.2, -6.5);
    const hemi = new THREE.HemisphereLight(0x2a3038, 0x0c0e12, 0.5);
    const sternAux = new THREE.PointLight(0x66d8ff, 9, 8, 2); sternAux.position.set(0, 0.3, -3.2);   // 함미 보조광(§7.3)
    scene.add(key, fill, rim, hemi, sternAux);
    // 모바일 판정 = 세로(portrait)·협폭 창(§9.3 DPR 제한과 동일 축). 데스크톱 800×450 같은 가로 소형창은 데스크톱.
    ctl._mobile = (typeof window !== 'undefined' && window.innerHeight > window.innerWidth && window.innerWidth <= 500);
    model = createAuroraModel(THREE, { seed: 7, mobile: ctl._mobile, lods: [0, 1] });
    scene.add(model.group);
    camera = new THREE.PerspectiveCamera(CAMERA.chase.fov, 1, CAMERA.near, CAMERA.far);
  } catch (e) { ctl.reason = 'hero-scene-exception:' + String(e && e.message || e); try { renderer.dispose(); } catch {} return ctl; }
  ctl.available = true;

  // ── 실전 스웜(크리처·아군 공용): 종별 버킷 InstancedMesh — 마리 수와 무관하게 종당 +버킷수 draw.
  //  버킷 키는 지오메트리가 정의(크리처 hull/glow/core, 드론 hull/glow, 순양함 hull/trim/glow) — 재질 키와 1:1.
  //  배치는 "2.5D 투영 화면 좌표·크기"에 정합(main 이 계산해 전달) — 2D 세계(탄·드론·다른 적)와 같은 자리·같은 원근.
  function makeSwarm(makeGeo, makeMats, seed, cap) {
    try {
      const geo = makeGeo(THREE, { lod: ctl._mobile ? 1 : 0 });
      const bmat = makeMats(THREE, { seed, mobile: ctl._mobile });
      const sw = { meshes: [], count: 0 };
      for (const k of Object.keys(geo.buckets)) {
        const im = new THREE.InstancedMesh(geo.buckets[k], bmat.mats[k], cap);
        im.count = 0; im.frustumCulled = false;   // 화면 정합 배치라 항상 시야 안 — 컬링 계산 생략
        scene.add(im); sw.meshes.push(im);
      }
      return sw;
    } catch (e) { return null; /* 스웜 실패는 비치명 — AURORA 단독으로 계속 */ }
  }
  // §G-4 적 12종 = 이사 제작(Gemini) 고품질 렌더 빌보드(조형 스웜 전면 대체 — 회전·측면 노출 없는 하강 적이라 판 티가 없다)
  function makeBillboardSwarm(key, cap) {
    try {
      const sw = { meshes: [], count: 0 };
      for (const part of createBillboardParts(THREE, key)) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, cap);
        im.count = 0; im.frustumCulled = false;
        scene.add(im); sw.meshes.push(im);
      }
      return sw;
    } catch (e) { return null; /* 비치명 — 초과분은 2D 폴백 */ }
  }
  // glb 필드가 있는 종 = 실모델(비동기 로드, 실패 시 빌보드 폴백) — §G-5 이사 VARCO 파이프라인
  function makeGlbSwarm(key, def) {
    const sw = { meshes: [], count: 0 };
    const attach = (parts) => {
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, def.cap);
        im.count = 0; im.frustumCulled = false;
        scene.add(im); sw.meshes.push(im);
      }
    };
    loadEnemyGlbParts(THREE, def.glb, def)
      .then(attach)
      .catch(() => { try { attach(createBillboardParts(THREE, key)); } catch (e) {} });
    return sw;
  }
  const eswarm = {};
  for (const k of Object.keys(ENEMY3D)) {
    const def = ENEMY3D[k];
    eswarm[k] = def.glb ? makeGlbSwarm(k, def) : makeBillboardSwarm(k, def.cap);
  }
  // 아군 호위(§G-1 위계: 기함 > 순양함 > 드론) — 노즈가 +Z(소실점 쪽) = yawBase 0 으로 배치
  let drone = makeSwarm(createDroneGeometry, createDroneMaterials, 0, DRONE_INSTANCE_MAX);
  let cruiser = makeSwarm(createCruiserGeometry, createCruiserMaterials, 0, CRUISER_INSTANCE_MAX);
  // 프레임 중 할당 금지(§10.1): 배치 수학용 스크래치는 여기서 1회 생성해 재사용.
  const _sV = new THREE.Vector3(), _sDir = new THREE.Vector3(), _sFwd = new THREE.Vector3(),
        _sPos = new THREE.Vector3(), _sScl = new THREE.Vector3(), _sEul = new THREE.Euler(),
        _sQ = new THREE.Quaternion(), _sM = new THREE.Matrix4(), _sCol = new THREE.Color();
  // ── 소품 스웜(이사: "무기·배지 3D") — 기본 OFF. opts.propsEnabled(=chase3dProps=1)일 때만 GPU 자원까지 생성.
  //  Codex 재검토 P2: 표시만 OFF 가 아니라 지오메트리·재질·InstancedMesh·프리웜 비용 자체를 0 으로.
  let props = null;
  if (opts.propsEnabled) {
    try {
      const pm = createPropMaterial(THREE);
      props = {};
      for (const k of PROP_KEYS) {
        // §G-2 발사체 3종=원본 가산 재질(이사 승인) / §G-3 픽업 5종=순수 조형 멀티 파트(이사 "2D 이어붙이기 금지")
        //  / ebullet 은 §G-4 순수 조형 예정 — 임시로 공용 자발광 유지.
        const isProj = (k === 'pbullet' || k === 'missile' || k === 'laser');
        const isPickup = (k === 'crystal' || k === 'coin' || k === 'pow' || k === 'pod' || k === 'capsule');
        if (isPickup || k === 'ebullet') {
          // §G-3 픽업 / §G-4 적탄(플라즈마 3파트) — 파트별 InstancedMesh, placeSwarm 이 한 몸으로 구동
          const maker = k === 'ebullet' ? createEnemyBulletParts : createPickupParts;
          const meshes = [];
          for (const part of maker(THREE, k)) {
            const im = new THREE.InstancedMesh(part.geo, part.mat, PROP_CAPS[k]);
            im.count = 0; im.frustumCulled = false;
            if (k === 'ebullet') { _sCol.setHex(PROP_BASE_COLOR.ebullet); for (let i = 0; i < PROP_CAPS[k]; i++) im.setColorAt(i, _sCol); }
            scene.add(im); meshes.push(im);
          }
          props[k] = { meshes, count: 0, colored: k === 'ebullet' };   // 적탄만 instanceColor(적 종별 탄색 틴트)
          continue;
        }
        const mat = isProj ? createProjMaterial(THREE, k) : pm;
        const im = new THREE.InstancedMesh(createPropGeometry(THREE, k), mat, PROP_CAPS[k]);
        im.count = 0; im.frustumCulled = false;
        _sCol.setHex(isProj ? 0xffffff : PROP_BASE_COLOR[k]);   // 발사체=원색(그림이 색을 가짐), ebullet=기본색
        for (let i = 0; i < PROP_CAPS[k]; i++) im.setColorAt(i, _sCol);
        scene.add(im);
        props[k] = { meshes: [im], count: 0, colored: true };
      }
    } catch (e) { props = null; /* 소품 실패는 비치명 */ }
  }

  const onLost = (ev) => { ev.preventDefault(); ctl.degraded = true; ctl.reason = 'context-lost'; };
  const onRestored = () => { ctl.degraded = false; ctl.reason = ''; };
  canvas3d.addEventListener('webglcontextlost', onLost, false);
  canvas3d.addEventListener('webglcontextrestored', onRestored, false);

  function pixelRatioFor(viewW) {
    const cap = viewW <= QUALITY.MOBILE_MAX_W ? QUALITY.PIXEL_RATIO_MOBILE : QUALITY.PIXEL_RATIO_DESKTOP;
    return Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, cap);
  }
  function applyCam(cam3d, followPx = 0, viewHPx = 0) {
    camera.fov = cam3d.fov; camera.aspect = cam3d.aspect;
    camera.up.set(0, 1, 0);
    // 부분 추종(이사): 2D 카메라의 기함 화면 이탈(followPx, 화면픽셀)만큼 3D 카메라도 트럭 이동(회전 없는 평행이동)
    //  → 3D 기함이 2D 기함(C0)과 같은 화면 X 에서 좌우로 실제 이동해 보인다. 픽셀당 3D 단위는 기함 깊이·수직 fov 로 환산.
    let ox = 0;
    if (followPx && viewHPx > 0) {
      const ex = cam3d.eye, tg = cam3d.target;
      const fx = tg[0] - ex[0], fy = tg[1] - ex[1], fz = tg[2] - ex[2];
      const fl = Math.hypot(fx, fy, fz) || 1;
      const depth = (-ex[0] * fx - ex[1] * fy - ex[2] * fz) / fl;   // 원점(기함)의 시선방향 깊이
      const unitPerPx = 2 * depth * Math.tan(cam3d.fov * Math.PI / 360) / viewHPx;
      ox = followPx * unitPerPx;   // 화면 오른쪽 = -x(카메라가 +z 를 봄) → 기함을 화면 +x 로 보이려면 카메라를 +x 로
    }
    camera.position.set(cam3d.eye[0] + ox, cam3d.eye[1], cam3d.eye[2]);
    camera.lookAt(cam3d.target[0] + ox, cam3d.target[1], cam3d.target[2]);
    camera.updateProjectionMatrix();
  }
  /** 셰이더 프리웜(§10.2): compileAsync(가능 시) + 게임 카메라로 대표 프레임 1회 실렌더 → 전투 중 컴파일 히치 0. */
  async function prewarm(logicalW = 480, logicalH = 800, cssW = 480, cssH = 800) {
    const t0 = performance.now();
    ctl.prewarm.programsBefore = renderer.info.programs ? renderer.info.programs.length : -1;
    try {
      renderer.setPixelRatio(pixelRatioFor(cssW)); renderer.setSize(cssW, cssH, false);
      applyCam(makeChaseCamera(logicalW, logicalH, 1));
      if (renderer.compileAsync) await renderer.compileAsync(scene, camera);
      model.setLOD(1); model.update(0.5, {}); renderer.render(scene, camera);   // LOD1 변형
      model.setLOD(0); model.update(0.5, {}); renderer.render(scene, camera);   // LOD0 변형(본선)
      renderer.clear(true, true, true);
    } catch (e) { /* 프리웜 실패는 치명 아님 — 기록만 */ }
    ctl.prewarm.programsAfter = renderer.info.programs ? renderer.info.programs.length : -1;
    ctl.prewarm.ms = Math.round(performance.now() - t0);
    ctl.prewarm.done = true;
    ctl._lastW = 0;   // 다음 frame 에서 실제 뷰포트로 재설정
    return ctl.prewarm;
  }

  const bankMax = CAMERA.bankMax;
  /** 스웜 인스턴스 배치(크리처·소품 공용): buf[i] = { sx, sy(2.5D 투영 화면좌표, 논리px), px(화면 전장 논리px), wob, col? }.
   *  화면점을 카메라 광선으로 되쏘아 "그 화면 크기가 나오는 깊이"에 놓는다 → 위치·크기 모두 2D 와 정합.
   *  깊이는 [6,60] 클램프(near/far·조명 안전권) — 클램프 시 스케일이 보정해 화면 크기는 항상 정확. 모델은 전장 1.0 공통.
   *  mode: 'wob'(크리처 — sin 감쇠 롤) | 'direct'(탄·아군 — wob 을 롤로 그대로) | 'spin'(픽업 — 시간 스핀).
   *  yawBase: π=전면이 카메라(적·소품 기본) / 0=노즈가 소실점 쪽(아군 — 위로 비행). */
  function placeSwarm(sw, buf, n, cap, mode = 'wob', time = 0, yawBase = Math.PI, pitchBase = -0.12) {
    if (!sw) return;
    const count = Math.min(n | 0, cap);
    const fpx = (ctl._lastLogH * 0.5) / Math.tan(camera.fov * Math.PI / 360);   // 논리px 초점거리
    camera.getWorldDirection(_sFwd);
    for (let i = 0; i < count; i++) {
      const o = buf[i];
      _sV.set((o.sx / ctl._lastLogW) * 2 - 1, -((o.sy / ctl._lastLogH) * 2 - 1), 0.5).unproject(camera);
      _sDir.subVectors(_sV, camera.position).normalize();
      const depth = Math.min(60, Math.max(6, fpx / Math.max(1e-3, o.px)));      // 전장 1.0 모델 기준
      const scl = (o.px * depth) / fpx;                                         // 클램프 보정 → 화면 전장 = o.px 유지
      _sPos.copy(camera.position).addScaledVector(_sDir, depth / Math.max(1e-4, _sDir.dot(_sFwd)));
      if (mode === 'spin') _sEul.set(-0.12, yawBase + time * 1.4 + i * 0.73, 0);
      else if (mode === 'direct') _sEul.set(-0.12, yawBase, o.wob);
      else _sEul.set(pitchBase, yawBase, Math.sin(o.wob) * 0.15);
      _sQ.setFromEuler(_sEul);
      _sM.compose(_sPos, _sQ, _sScl.setScalar(scl));
      for (const im of sw.meshes) {
        im.setMatrixAt(i, _sM);
        if (sw.colored && o.col >= 0) { _sCol.setHex(o.col); im.setColorAt(i, _sCol); }
      }
    }
    for (const im of sw.meshes) {
      im.count = count;
      if (count) { im.instanceMatrix.needsUpdate = true; if (sw.colored && im.instanceColor) im.instanceColor.needsUpdate = true; }
    }
    sw.count = count;
  }
  function frame(run, zoom, logicalW, logicalH, cssW, cssH, time, followX = 0, swarms = null) {
    ctl._zoom = zoom;
    const t = transitionT(zoom);
    ctl._t = t;
    if (!ctl.available || ctl.degraded) { hide(); return 0; }
    if (!shouldRender3D(zoom) || t <= 0.001) { hide(); return 0; }
    const sq = run && run.squad;
    if (!sq || sq.dead) { hide(); return 0; }
    // 이중 기함 방지 최종형(이사 3회 지적): "겹침 0·공백 0" 하드 컷 — 3D 는 t≥0.5 에서만 "완전 불투명", 2D 는 t<0.5 에서만.
    //  중간 페이드 금지: t=0.5 부근에서 양쪽 다 흐려져 함선이 사라지고(계곡), 반투명 3D 뒤로 2D 요소가 비쳐 "두 척"으로 보였다.
    //  스왑 순간의 형태 교체는 main 의 워프 플래시가 가린다.
    if (t < 0.5) { hide(); return t; }   // t 는 그대로 반환 → main 의 2D 게이트가 같은 t 로 판단
    const dpr = pixelRatioFor(cssW);
    if (cssW !== ctl._lastW || cssH !== ctl._lastH || dpr !== ctl._lastDpr) {
      renderer.setPixelRatio(dpr); renderer.setSize(cssW, cssH, false);
      ctl._lastW = cssW; ctl._lastH = cssH; ctl._lastDpr = dpr;
    }
    try {
      ctl._lastLogW = logicalW; ctl._lastLogH = logicalH;
      // followX = 2D 기함의 화면 중앙 이탈(논리 px, main 이 C0−centerX 로 전달) → 캔버스 픽셀로 환산해 트럭 이동
      applyCam(makeChaseCamera(logicalW, logicalH, t), followX * (cssW / logicalW), cssH);
      // 기함 상태 읽기(§3.1 읽기 전용): 롤은 실게임 bank 신호(2D draw 와 동일), 판정 미반영(§9.3)
      const bankSrc = Number.isFinite(sq.bank) && sq.bank !== 0 ? sq.bank * 0.45 : -(sq.vx || 0) * 0.0016;
      const bank = Math.max(-bankMax, Math.min(bankMax, bankSrc));
      model.setLOD(ctl._mobile ? 1 : 0);   // 창 기준 판정(세로 게임 컬럼 폭 아님)
      model.update(time, { bank, charging: !!sq.charging, chargeFrac: sq.chargeFrac || 0 });
      // 실전 스웜(크리처+소품) — t≥0.5 에서만 이 지점에 도달 = 2D 스킵과 같은 하드 컷
      if (swarms) {
        for (const k of Object.keys(ENEMY3D)) {
          const sk = swarms[k];
          if (sk) placeSwarm(eswarm[k], sk.buf, sk.n, ENEMY3D[k].cap, 'wob', 0, Math.PI, ENEMY3D[k].pitch ?? -0.12);
          else placeSwarm(eswarm[k], null, 0, ENEMY3D[k].cap);
        }
        if (swarms.drone) placeSwarm(drone, swarms.drone.buf, swarms.drone.n, DRONE_INSTANCE_MAX, 'direct', 0, 0);     // 아군: 노즈가 소실점(전진 방향)
        if (swarms.cruiser) placeSwarm(cruiser, swarms.cruiser.buf, swarms.cruiser.n, CRUISER_INSTANCE_MAX, 'direct', 0, 0);   // 실측: hero 카메라 기준 yaw 0 = 지오 +z 가 소실점 → 지오를 노즈 +z 로 로프트
        if (props && swarms.props) for (const k of PROP_KEYS) {
          const s = swarms.props[k];
          if (s) placeSwarm(props[k], s.buf, s.n, PROP_CAPS[k], (k === 'pbullet' || k === 'ebullet' || k === 'missile' || k === 'laser') ? 'direct' : 'spin', time);
        }
      } else {
        for (const k of Object.keys(ENEMY3D)) placeSwarm(eswarm[k], null, 0, ENEMY3D[k].cap);
        placeSwarm(drone, null, 0, DRONE_INSTANCE_MAX); placeSwarm(cruiser, null, 0, CRUISER_INSTANCE_MAX);
        if (props) for (const k of PROP_KEYS) placeSwarm(props[k], null, 0, PROP_CAPS[k]);
      }
      renderer.render(scene, camera);
      ctl._rendered = true;
      show(1);
      return t;
    } catch (e) { ctl.degraded = true; ctl.reason = 'render-exception:' + String(e && e.message || e); hide(); return 0; }
  }
  function show(a) { canvas3d.style.opacity = String(a); canvas3d.style.visibility = 'visible'; }
  function hide() { canvas3d.style.opacity = '0'; canvas3d.style.visibility = 'hidden'; ctl._rendered = false; }
  function screenXToWorldX(screenX, logicalW, logicalH, squadX, zoom) {   // API 호환(hero 입력은 RC2 — 미사용)
    return invX(makeChaseCamera(logicalW, logicalH, transitionT(zoom)), screenX, squadX);
  }
  function info() {
    const r = renderer.info;
    return {
      hero: true, t: +ctl._t.toFixed(3), zoom: +ctl._zoom.toFixed(3), available: ctl.available, degraded: ctl.degraded, reason: ctl.reason, rendered: ctl._rendered,
      calls: r.render.calls, triangles: r.render.triangles, programs: r.programs ? r.programs.length : -1,
      geometries: r.memory.geometries, textures: r.memory.textures, aurora: model ? model.stats() : null,
      ...Object.fromEntries(Object.keys(ENEMY3D).map((k) => [k + 'Count', eswarm[k] ? eswarm[k].count : -1])),
      droneCount: drone ? drone.count : -1, cruiserCount: cruiser ? cruiser.count : -1,
      propCounts: props ? Object.fromEntries(PROP_KEYS.map((k) => [k, props[k].count])) : null,   // Codex P2: 진단이 확장 범위를 따라가게
      prewarm: { ...ctl.prewarm },
    };
  }
  function dispose() {
    try { canvas3d.removeEventListener('webglcontextlost', onLost); canvas3d.removeEventListener('webglcontextrestored', onRestored); } catch {}
    if (model) model.dispose();
    for (const sw of [...Object.values(eswarm), drone, cruiser]) if (sw) for (const im of sw.meshes) { im.geometry.dispose(); if (im.material.map) im.material.map.dispose(); im.material.dispose(); im.dispose && im.dispose(); }
    if (props) { let matDone = false; for (const k of PROP_KEYS) { const im = props[k].meshes[0]; im.geometry.dispose(); if (!matDone) { im.material.dispose(); matDone = true; } im.dispose && im.dispose(); } }
    for (const k of Object.keys(eswarm)) eswarm[k] = null;
    drone = null; cruiser = null; props = null;
    if (envRT) envRT.dispose();
    renderer.dispose();
    ctl.available = false;
  }
  function forceContextLoss() {
    try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_lose_context'); if (ext) { ext.loseContext(); return true; } } catch {}
    return false;
  }
  ctl.frame = frame; ctl.prewarmRun = prewarm; ctl.screenXToWorldX = screenXToWorldX; ctl.info = info;
  ctl.dispose = dispose; ctl.forceContextLoss = forceContextLoss; ctl.renderer = renderer; ctl.model = model; ctl.scene = { scene, camera };
  return ctl;
}

function createLegacy3D(canvas3d) {
  const ctl = {
    available: false, degraded: false, reason: '', THREE,
    _scene: null, _t: 0, _zoom: 1, _lastW: 0, _lastH: 0, _lastDpr: 0, _rendered: false,
  };

  let scn;
  try {
    scn = createChaseScene(canvas3d);
    if (!scn || !scn.ok) { ctl.reason = scn ? scn.reason : 'scene-null'; return ctl; }
  } catch (e) { ctl.reason = 'scene-exception:' + String(e && e.message || e); return ctl; }
  ctl._scene = scn;
  ctl.available = true;

  // 컨텍스트 손실 → RC2 폴백. 리스너는 여기서 1회만 등록(§9.4 중복 금지). 복원되면 재개.
  const onLost = (ev) => { ev.preventDefault(); ctl.degraded = true; ctl.reason = 'context-lost'; };
  const onRestored = () => { ctl.degraded = false; ctl.reason = ''; };
  canvas3d.addEventListener('webglcontextlost', onLost, false);
  canvas3d.addEventListener('webglcontextrestored', onRestored, false);

  function pixelRatioFor(viewW) {
    const cap = viewW <= QUALITY.MOBILE_MAX_W ? QUALITY.PIXEL_RATIO_MOBILE : QUALITY.PIXEL_RATIO_DESKTOP;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    return Math.min(dpr, cap);
  }

  /**
   * 한 프레임: 줌에 따라 휴면/렌더. 반환 t(0~1)로 main 이 2D 월드 alpha=1-t 를 준다.
   *  logicalW/H = 카메라·입력 좌표 공간(논리 px), cssW/H = #game3d 캔버스 CSS 픽셀(렌더 해상도).
   *  run 은 살아있는 게임 상태(읽기 전용). 절대 수정하지 않는다.
   */
  function frame(run, zoom, logicalW, logicalH, cssW, cssH, time) {
    ctl._zoom = zoom;
    const t = transitionT(zoom);
    ctl._t = t;
    if (!ctl.available || ctl.degraded) { hide(); return 0; }
    if (!shouldRender3D(zoom) || t <= 0.001) { hide(); return 0; }   // 160% 미만 휴면(§9.4)

    // 렌더 해상도/픽셀비율 갱신(크기 변할 때만 — 중복 setSize 방지)
    const dpr = pixelRatioFor(cssW);
    if (cssW !== ctl._lastW || cssH !== ctl._lastH || dpr !== ctl._lastDpr) {
      scn.setViewport(cssW, cssH, dpr);
      ctl._lastW = cssW; ctl._lastH = cssH; ctl._lastDpr = dpr;
    }
    try {
      const cam3d = makeChaseCamera(logicalW, logicalH, t);   // aspect=논리비(=css비), 입력과 동일 카메라
      scn.setCamera(cam3d);
      const snap = buildSnapshot(run);                 // 읽기 전용
      const model = computeSceneModel(snap);           // 순수
      scn.apply(model, t, time);
      scn.render();
      ctl._rendered = true;
      show(t);
      return t;
    } catch (e) {
      ctl.degraded = true; ctl.reason = 'render-exception:' + String(e && e.message || e);
      hide(); return 0;
    }
  }

  function show(t) { canvas3d.style.opacity = String(t); canvas3d.style.visibility = 'visible'; }
  function hide() { canvas3d.style.opacity = '0'; canvas3d.style.visibility = 'hidden'; ctl._rendered = false; }

  /** 입력 역변환(§8): 화면 X(논리) → 논리 worldX. 현재 전환 t 에 맞는 카메라로 역변환(전환 중에도 일관). */
  function screenXToWorldX(screenX, logicalW, logicalH, squadX, zoom) {
    const t = transitionT(zoom);
    const cam3d = makeChaseCamera(logicalW, logicalH, t);
    return invX(cam3d, screenX, squadX);
  }

  function info() {
    const base = ctl.available && !ctl.degraded && ctl._rendered ? scn.info() : { calls: 0, triangles: 0, models: 0, instances: 0, geometries: 0, textures: 0 };
    return { ...base, t: +ctl._t.toFixed(3), zoom: +ctl._zoom.toFixed(3), available: ctl.available, degraded: ctl.degraded, reason: ctl.reason, rendered: ctl._rendered };
  }

  function dispose() {
    try { canvas3d.removeEventListener('webglcontextlost', onLost); canvas3d.removeEventListener('webglcontextrestored', onRestored); } catch {}
    if (scn) scn.dispose();
    ctl.available = false;
  }

  // 개발/테스트용: 강제 컨텍스트 손실(§11 context loss fallback 시험)
  function forceContextLoss() {
    try { const gl = scn.renderer.getContext(); const ext = gl.getExtension('WEBGL_lose_context'); if (ext) { ext.loseContext(); return true; } } catch {}
    return false;
  }

  ctl.frame = frame; ctl.screenXToWorldX = screenXToWorldX; ctl.info = info; ctl.dispose = dispose;
  ctl.forceContextLoss = forceContextLoss; ctl.renderer = scn.renderer; ctl.scene = scn;
  return ctl;
}

export default { createChase3D };
