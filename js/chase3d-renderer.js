// ── Neon Fleet 실제 3D — RC2 상태를 읽어 3D 장면을 동기화·렌더링하는 오케스트레이터 ──
//  게임의 진실은 계속 2D(§3.1). 이 모듈은 매 프레임 살아있는 world 를 "읽기만" 해서 3D 로 보여준다.
//  실패·컨텍스트 손실 시 available=false 로 떨어뜨려 main 이 RC2 로 복귀하게 한다(§3.3 · §G-21 §5.1 — 손실 후 자동 재개는 하지 않는다).
//  이 모듈은 **사용자가 200%(FULL_ZOOM) 이상을 요청한 순간** main 이 동적 import 한다(§G-22 §4.1).
//   타이틀·100%·150% 플레이에서는 로드되지 않으므로 Three.js 도 GLB 도 그때까지 네트워크를 타지 않는다.
//  Opus5 hero 하이브리드(§9): opts.hero=true 면 3D 레이어는 "AURORA 기함 1척"만 — 적·이펙트·드론은 main 이 RC2 로 유지.
//  구 전체-3D 경로는 개발 fallback(chase3dTest 레거시 장면)으로 보존(§9.1), hero 에선 사용하지 않음.
import * as THREE from './vendor/three.module.js';
import { createChaseScene } from './chase3d-scene.js';
import { makeChaseCamera, buildSnapshot, computeSceneModel, screenXToWorldX as invX, CAMERA, SCALE_Z } from './chase3d-mapping.js';
import { transitionT, shouldRender3D, QUALITY, performanceProfileForViewport, WORLD_OBJ_VIS_DROP, LANCE_3D_WIDTH_MULT } from './chase3d-config.js';
import { createAuroraModel } from './chase3d-aurora-model.js';
import { forgeEnvEquirect } from './chase3d-aurora-materials.js';
import { createBillboardParts } from './chase3d-billboards.js';
import { loadEnemyGlbParts } from './chase3d-glb.js';
import { createDroneGeometry, createCruiserGeometry, createDroneMaterials, createCruiserMaterials, DRONE_INSTANCE_MAX, CRUISER_INSTANCE_MAX } from './chase3d-allies.js';
import { PROP_KEYS, PROP_CAPS, PROP_BASE_COLOR, createPropGeometry, createPropMaterial, createProjMaterial, createPickupParts, createEnemyBulletParts, createTurretFallbackParts, createVulcanTracerGlow } from './chase3d-props.js';
import { ENEMY3D, ALLY3D, PICKUP3D, FLAG3D, WEAPON3D, MOUNT_POINTS, NOZZLE_POINTS, SHOT_KEYS, SHOT_LEN, SHOT_W, SHOT_MIN_PX } from './chase3d-prop-defs.js';
import { shotDepth, shotYaw, focalPx, shotScale, placeOnRay, worldRadiusForScreenHalfW, toNdcX, toNdcY, SHOT_DEPTH_MAX } from './chase3d-shot-place.js';   // §G-21 §6.3 순수 배치 수학(테스트가 이걸 직접 검증)
import { BAL } from './balance.js';   // 순수 수치 표(로직 없음) — 차지 만충 시간 환산에만 읽는다(§3.1 읽기 전용)

// §G-22 §9: 프레임 중 `Object.keys(ENEMY3D)` 를 부르면 매 프레임 새 배열이 생긴다 — 모듈 초기화 때 한 번만 만든다.
const ENEMY_KEYS = Object.keys(ENEMY3D);
const PICKUP_KEYS = PROP_KEYS.filter((k) => !SHOT_KEYS.includes(k));
// 적 12종 동시 표시 상한은 ENEMY3D(chase3d-prop-defs) 단일 진실 — 아래는 기존 외부 참조 호환용 파생.
export const B1_INSTANCE_MAX = ENEMY3D.b1.cap;
export const B2_INSTANCE_MAX = ENEMY3D.b2.cap;
export const B4_INSTANCE_MAX = ENEMY3D.b4.cap;
export const B5_INSTANCE_MAX = ENEMY3D.b5.cap;
export const B6_INSTANCE_MAX = ENEMY3D.b6.cap;

/**
 * §G-36 P1 — 기함 표시 묶음이 준비됐는가(**순수 판정**). production 과 테스트가 이 함수를 공유한다.
 *
 *  ⚠️G35 의 `G35-READY-BUNDLE` 은 `(a, b) => a && b` 복제 lambda 만 검사해서,
 *   제품이 다시 `flagship()` 만 보도록 바뀌어도 통과했다(Codex 7차 §4). 그래서 판정을 여기로 뺐다.
 *  @param flagRec  `flags[tier]`  — { ok }
 *  @param mountRec `mounts3[wKey]` — { ok, meshes }
 */
export function isFlagshipBundleReady(flagRec, mountRec) {
  return !!(flagRec && flagRec.ok)
    && !!(mountRec && mountRec.ok && mountRec.meshes && mountRec.meshes.length > 0);
}

export function createChase3D(canvas3d, opts = {}) {
  if (opts.hero) return createHero3D(canvas3d, opts);
  return createLegacy3D(canvas3d);
}

/** 접근성: 모션 최소화 사용자는 피격 파편·흔들림을 받지 않는다(main 의 동명 헬퍼와 같은 계약). */
function prefersReducedMotion3D() {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

// §G-21 §4.2 진단: 모델 로드 실패는 같은 파일에 대해 딱 한 번만 남긴다.
//  (원래는 전부 조용히 삼켜서, 어떤 GLB 가 빠졌는지 알 방법이 없었다 — 폴백이 떠도 원인을 못 봤다.)
//  로더는 파일당 1회 호출이라 구조적으로 프레임 반복이 없지만, Set 으로 한 번 더 못박는다.
const _warnedGlb = new Set();
function warnGlbOnce(url, e) {
  if (!url || _warnedGlb.has(url)) return;
  _warnedGlb.add(url);
  try { console.warn('[chase3d] GLB 로드 실패 → 폴백:', url, (e && e.message) || e); } catch (x) {}
}

// ── hero: AURORA 전용 씬 (색관리 §7.3 + IBL + 프리웜 §10.2) ──
function createHero3D(canvas3d, opts = {}) {
  const ctl = {
    available: false, degraded: false, hero: true, reason: '', THREE,
    _t: 0, _zoom: 1, _lastW: 0, _lastH: 0, _lastDpr: 0, _rendered: false,
    prewarm: { done: false, programsBefore: -1, programsAfter: -1, ms: 0 },
  };
  let renderer, model, scene, camera, envRT, flagRig;
  //  §G-35 P0-5: renderer 생성부를 **얇게 주입 가능**하게 한다(Codex 6차 §4).
  //   목적은 단 하나 — WebGL 이 없는 환경(CI·헤드리스)에서도 `frame()` 을 **실제로 실행**해
  //   `camOriginDepth` 같은 실행 경로 지역변수 누락을 잡는 것이다.
  //   ⚠️production 경로는 바뀌지 않는다: `opts.createRenderer` 가 없으면 예전과 완전히 같다.
  //   ⚠️THREE API 를 통째로 흉내 내지 말 것 — 주입은 renderer 한 겹뿐이고 씬·수학은 진짜를 쓴다.
  try {
    renderer = typeof opts.createRenderer === 'function'
      ? opts.createRenderer(THREE, canvas3d)
      : new THREE.WebGLRenderer({ canvas: canvas3d, alpha: true, premultipliedAlpha: false, antialias: true, powerPreference: 'high-performance' });
  } catch (e1) {
    try { renderer = new THREE.WebGLRenderer({ canvas: canvas3d, alpha: true, antialias: false }); }
    catch (e2) { ctl.reason = 'renderer-create-failed'; ctl.degraded = true; return ctl; }   // §5.1: available=false + degraded + reason 을 함께 남긴다
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
    //  §G-35 P0-5: PMREM 은 **실제 WebGL 을 요구**한다(프레임버퍼로 환경맵을 굽는다).
    //   주입 renderer(스모크)에서는 건너뛴다 — 조명 품질용이라 없어도 `frame()` 경로는 그대로 돈다.
    if (typeof opts.createRenderer !== 'function') {
      const pmrem = new THREE.PMREMGenerator(renderer);
      envRT = pmrem.fromEquirectangular(envTex);
      scene.environment = envRT.texture;
      pmrem.dispose();
    }
    envTex.dispose();
    const key = new THREE.DirectionalLight(0xffe9cf, 2.1); key.position.set(-4.5, 6.5, 3.5);
    const fill = new THREE.DirectionalLight(0x9fc2ff, 0.65); fill.position.set(5, 2.5, 1.5);
    const rim = new THREE.DirectionalLight(0x8fe8ff, 0.9); rim.position.set(2.5, 3.2, -6.5);
    const hemi = new THREE.HemisphereLight(0x2a3038, 0x0c0e12, 0.5);
    const sternAux = new THREE.PointLight(0x66d8ff, 9, 8, 2); sternAux.position.set(0, 0.3, -3.2);   // 함미 보조광(§7.3)
    // §G-5 얼굴 보조광(이사): 실모델 적의 얼굴은 face 모드로 항상 카메라를 향한다 →
    //  카메라 쪽에서 전방(+z)으로 쏘는 디렉셔널 하나로 전 적의 얼굴을 밝힌다(개체별 라이트 불요).
    const faceLight = new THREE.DirectionalLight(0xffe8dc, 1.15);
    faceLight.position.set(0, 2.5, -9); faceLight.target.position.set(0, 0, 10);
    scene.add(faceLight, faceLight.target);
    scene.add(key, fill, rim, hemi, sternAux);
    // 모바일 판정 = 세로(portrait)·협폭 창(§9.3 DPR 제한과 동일 축). 데스크톱 800×450 같은 가로 소형창은 데스크톱.
    //  §G-22 §5.1: 기기 프로필은 main 이 세션 시작 시 1회 계산해 넘긴다 — FPS 가드와 **같은 객체**를 쓴다.
    //  (넘어오지 않은 경우에만 같은 순수 함수로 직접 계산. 판정식이 두 벌로 갈라지지 않는다.)
    ctl._profile = opts.profile || performanceProfileForViewport(
      (typeof window !== 'undefined' && window.innerWidth) || 480,
      (typeof window !== 'undefined' && window.innerHeight) || 800);
    ctl._mobile = !!ctl._profile.mobile;
    model = createAuroraModel(THREE, { seed: 7, mobile: ctl._mobile, lods: [0, 1] });
    // §G-8 기함 리그: 절차 AURORA + 등급별 GLB 홀더를 한 리그에 담아 피격 흔들림을 공통 적용
    flagRig = new THREE.Group();
    flagRig.add(model.group);
    scene.add(flagRig);
    camera = new THREE.PerspectiveCamera(CAMERA.chase.fov, 1, CAMERA.near, CAMERA.far);
  } catch (e) { ctl.reason = 'hero-scene-exception:' + String(e && e.message || e); ctl.degraded = true; try { renderer.dispose(); } catch {} return ctl; }
  ctl.available = true;

  // ── 실전 스웜(크리처·아군 공용): 종별 버킷 InstancedMesh — 마리 수와 무관하게 종당 +버킷수 draw.
  //  버킷 키는 지오메트리가 정의(크리처 hull/glow/core, 드론 hull/glow, 순양함 hull/trim/glow) — 재질 키와 1:1.
  //  배치는 "2.5D 투영 화면 좌표·크기"에 정합(main 이 계산해 전달) — 2D 세계(탄·드론·다른 적)와 같은 자리·같은 원근.
  function makeSwarm(makeGeo, makeMats, seed, cap) {
    try {
      const geo = makeGeo(THREE, { lod: ctl._profile.lod });
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
  function makeGlbSwarm(key, def, fallback) {
    const sw = { meshes: [], count: 0 };
    const attach = (parts) => {
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, def.cap);
        im.count = 0; im.frustumCulled = false;
        scene.add(im); sw.meshes.push(im);
      }
      //  §G-39: 색 기능을 미리 확인한다(probe). instanceColor 는 첫 setColorAt 에 지연 할당되므로
      //   전 인스턴스를 흰색(1,1,1 — 원본 그대로, 무염색과 동일)으로 채워 실패 여부를 먼저 본다.
      //   여기서 실패하면 이 스웜만 색 없이 간다(placeSwarm 의 `if (sw.colored)` 가 통째로 건너뛴다) — 3D 는 유지.
      try {
        _sCol.setRGB(1, 1, 1);
        for (const im of sw.meshes) for (let i = 0; i < def.cap; i++) im.setColorAt(i, _sCol);
        sw.colored = true;
      } catch (e) { sw.colored = false; }
    };
    loadEnemyGlbParts(THREE, def.glb, def)
      .then(attach)
      .catch((e) => {
        warnGlbOnce(def.glb, e);
        //  §G-21 §4.2: 폴백을 "실제 준비 상태"로 등록해야 한다 — 여기서 파트가 붙어야 swarmReady 가 참이 되고,
        //   그때부터 main 이 이 종을 3D 로 수집한다. 폴백까지 실패하면 meshes 가 비어 영구히 2D 로 남는다(공백 없음).
        try { attach(fallback ? fallback() : createBillboardParts(THREE, key)); } catch (e2) {}
      });
    return sw;
  }
  const eswarm = {};
  //  §G-39 Task 8: 테스트가 실제 THREE 로 만든 얇은 적 파트를 주입할 수 있게 한다(순수 테스트 seam).
  //   ⚠️GLB 는 비동기 로드라 headless(Node) 환경에서는 meshes 가 비고, 그러면 ready.enemy() 가 거짓이라
  //    적이 3D 버퍼에 들어가지 않는다 — 배선을 실행으로 검증할 수 없었다(Task 8 이전까지의 공백).
  //   주입이 없으면(opts.createEnemyParts 미지정) 아래 로직은 전혀 안 타고 기존 경로 그대로다.
  const enemyPartsFactory = opts.createEnemyParts || null;
  for (const k of ENEMY_KEYS) {
    const def = ENEMY3D[k];
    if (enemyPartsFactory) {
      const sw = { meshes: [], count: 0 };
      const parts = enemyPartsFactory(k, def);
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, def.cap);
        im.count = 0; im.frustumCulled = false; scene.add(im); sw.meshes.push(im);
      }
      //  §G-39: 색 기능 probe(makeGlbSwarm.attach 와 동일한 계약) — 여기서는 아직 프레임 스크래치
      //   _sCol 이 선언되기 전(아래에서 선언)이라 공유하지 않고, 1회성 구성 단계라 로컬 Color 를 쓴다
      //   (프레임 중 할당 금지 규칙은 매 프레임 도는 frame()/placeSwarm 경로에 대한 것 — 여기는 해당 없음).
      try {
        const probe = new THREE.Color(1, 1, 1);
        for (const im of sw.meshes) for (let i = 0; i < def.cap; i++) im.setColorAt(i, probe);
        sw.colored = true;
      } catch (e) { sw.colored = false; }
      eswarm[k] = sw;
      continue;
    }
    eswarm[k] = def.glb ? makeGlbSwarm(k, def) : makeBillboardSwarm(k, def.cap);
  }
  // 아군 호위(§G-1 위계: 기함 > 순양함 > 드론) — 노즈가 +Z(소실점 쪽) = yawBase 0 으로 배치.
  //  §G-6: 이사 제작 실모델(GLB) 우선, 로드 실패 시 기존 디지타이즈 조형 폴백.
  function allyFallbackParts(makeGeo, makeMats, seed) {
    const geo = makeGeo(THREE, { lod: ctl._profile.lod });
    const bmat = makeMats(THREE, { seed, mobile: ctl._mobile });
    return Object.keys(geo.buckets).map((k) => ({ geo: geo.buckets[k], mat: bmat.mats[k] }));
  }
  let drone = ALLY3D.a1.glb
    ? makeGlbSwarm('a1', ALLY3D.a1, () => allyFallbackParts(createDroneGeometry, createDroneMaterials, 0))
    : makeSwarm(createDroneGeometry, createDroneMaterials, 0, DRONE_INSTANCE_MAX);
  let cruiser = ALLY3D.a2.glb
    ? makeGlbSwarm('a2', ALLY3D.a2, () => allyFallbackParts(createCruiserGeometry, createCruiserMaterials, 0))
    : makeSwarm(createCruiserGeometry, createCruiserMaterials, 0, CRUISER_INSTANCE_MAX);
  // 프레임 중 할당 금지(§10.1): 배치 수학용 스크래치는 여기서 1회 생성해 재사용.
  const _sV = new THREE.Vector3(), _sDir = new THREE.Vector3(), _sFwd = new THREE.Vector3(),
        _sPos = new THREE.Vector3(), _sScl = new THREE.Vector3(), _sEul = new THREE.Euler(),
        _sQ = new THREE.Quaternion(), _sM = new THREE.Matrix4(), _sCol = new THREE.Color(),
        _sQ2 = new THREE.Quaternion(), _sAxisZ = new THREE.Vector3(0, 0, 1),
        //  §G-25 차지 빔 배치 전용(프레임 중 할당 금지) — 발사체와 같은 광선 수학을 쓴다.
        _lnA = new THREE.Vector3(), _lnB = new THREE.Vector3(), _lnD = new THREE.Vector3(),
        _lnP = new THREE.Vector3(), _lnQ = new THREE.Quaternion(),
        _lnFwd = new THREE.Vector3(), _lnV = new THREE.Vector3(), _lnDir = new THREE.Vector3(),
        _lnV2 = new THREE.Vector3(),   // §G-31 빔 끝 두께 측정용
        _sShotScl = { x: 0, y: 0, z: 0 },   // shotScale 출력 재사용(§6.3 순수 수학 모듈과 공유하는 평범한 객체)
        //  §G-22 §6: 코어 파트를 "이 인스턴스에는 그리지 않음"으로 만드는 0 스케일 행렬(1회 생성·재사용).
        //  InstancedMesh 는 인스턴스를 개별로 끌 수 없으므로 퇴화 행렬로 지운다 — 프레임 중 할당 0.
        _sMHidden = new THREE.Matrix4().makeScale(0, 0, 0);
  // ── §G-8 기함 실모델(이사 승인 "B 로 하자"): squad.tier(0~5)별 GLB 홀더 — 로드 전·실패 시 절차 AURORA 폴백 ──
  const FLAG_LEN = 4.78;   // 절차 AURORA(T3) 실측 전장 — 전장 1.0 정규화 GLB 를 이 배율로(카메라·조명 구도 유지)
  //  등급 위엄: 2D SHIP_VISUAL_SIZE 비[34,50,68,88,112,140]/88 을 √로 압축 — 원비는 T5 가 1.59배라 화면을 넘긴다(구도 파괴).
  const TIER_SCALE = [0.62, 0.75, 0.88, 1.00, 1.13, 1.26];
  const flags = {};
  for (const t of Object.keys(FLAG3D)) {
    const holder = new THREE.Group();
    holder.visible = false; holder.scale.setScalar(FLAG_LEN * (TIER_SCALE[+t] ?? 1));
    flagRig.add(holder);
    flags[t] = { holder, ok: false, box: null };
    loadEnemyGlbParts(THREE, FLAG3D[t].glb, FLAG3D[t])
      .then((parts) => {
        const bb = new THREE.Box3();
        for (const p of parts) { p.geo.computeBoundingBox(); bb.union(p.geo.boundingBox); holder.add(new THREE.Mesh(p.geo, p.mat)); }
        flags[t].box = bb;   // §G-12 갑판 장착점 환산 기준(정규화 모델 단위 — 홀더 배율 S 를 곱해 쓴다)
        flags[t].ok = true;
      })
      .catch((e) => { warnGlbOnce(FLAG3D[t].glb, e); /* 실패 = 해당 티어만 절차 AURORA 유지(기함은 항상 보인다) */ });
  }
  // ── §G-12 기함 무기 실모델(이사 VARCO): 갑판 포탑 3종 + 기수 차지 포구 ──
  //  포탑은 2D drawWeaponRig 과 같은 장착점·같은 개수 규칙을 쓴다(표시만 3D — 판정·규칙 무관).
  //  종당 InstancedMesh 1(파트 1) → 한 무기만 보이므로 드로우 +1.
  const mountRig = new THREE.Group();
  mountRig.visible = false;
  flagRig.add(mountRig);
  const mounts3 = {};
  //  §G-22 §3.3: **절차 포탑을 먼저 붙이고**, GLB 가 도착하면 같은 holder 에서 교체한다.
  //   G21 은 GLB 를 기다렸다가 실패했을 때만 폴백을 붙여서, 로딩 중(수 초) 갑판 무기가 통째로 비었다
  //   — 2D 무기 리그는 기함과 함께 숨겨져 있어(flagshipAlpha=0) 대신 그려주지도 않는다.
  //   지금은 준비 상태가 처음부터 참이라 "무엇을 달고 있는지"가 한 프레임도 끊기지 않는다.
  function attachMounts(rec, parts, isGlb) {
    for (const p of parts) {
      const im = new THREE.InstancedMesh(p.geo, p.mat, WEAPON3D[rec.key].cap);
      im.count = 0; im.frustumCulled = false; im.visible = false;
      mountRig.add(im); rec.meshes.push(im);
    }
    rec.ok = rec.meshes.length > 0;
    rec.glb = !!isGlb;
  }
  /** 절차 포탑 → GLB 포탑 원자 교체. 옛 인스턴스는 씬에서 떼고 지오·재질을 정확히 해제한다. */
  function swapMounts(rec, parts) {
    const old = rec.meshes;
    rec.meshes = [];
    attachMounts(rec, parts, true);
    for (const im of old) {
      try { mountRig.remove(im); } catch (e) {}
      try { im.geometry.dispose(); } catch (e) {}
      try { if (im.material.map) im.material.map.dispose(); im.material.dispose(); } catch (e) {}
      try { im.dispose && im.dispose(); } catch (e) {}
    }
  }
  for (const k of ['vulcan', 'laser', 'homing']) {
    const rec = { key: k, meshes: [], ok: false, glb: false };
    mounts3[k] = rec;
    try { attachMounts(rec, createTurretFallbackParts(THREE, k), false); } catch (e) { /* 폴백조차 실패 = 그 무기만 미표시 */ }
    loadEnemyGlbParts(THREE, WEAPON3D[k].glb, WEAPON3D[k])
      .then((parts) => swapMounts(rec, parts))
      .catch((e) => { warnGlbOnce(WEAPON3D[k].glb, e); /* 실패 = 절차 포탑을 그대로 유지 */ });
  }
  const MOUNT_LEN = 0.135;   // 기함 배율 S 대비 포탑 전장(실측 — 갑판을 덮지 않고 실루엣에 얹히는 크기)
  /** 갑판 포탑 배치: 현재 무기 1종만 켠다. box=기함 GLB 바운딩(정규화), S=홀더 배율. */
  function placeMounts(tier, key, lv, box, S) {
    for (const k in mounts3) {
      if (k === key) continue;
      for (const m of mounts3[k].meshes) { m.count = 0; m.visible = false; }
    }
    const rec = mounts3[key];
    if (!rec || !rec.ok || !rec.meshes.length) return false;
    const pts = MOUNT_POINTS[tier] || MOUNT_POINTS[0];
    const n = Math.min(pts.length, Math.max(1, 1 + tier + Math.max(0, lv - 1)));   // 2D drawWeaponRig 과 동일한 개수 규칙
    const sx = box ? (box.max.x - box.min.x) : 0.62;
    const sz = box ? (box.max.z - box.min.z) : 1.0;
    const topY = box ? box.max.y : 0.12;
    _sScl.setScalar(MOUNT_LEN * S * (1 + Math.max(0, lv - 1) * 0.045));
    _sQ.identity();
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      //  x 는 0.88 로 안쪽으로(장착점 원본은 2D 스프라이트 폭 기준 — 3D 선체는 날개 끝이 얇아 그대로 쓰면 가장자리에 걸친다),
      //  y 는 상단의 66%(선체 곡면 위에 얹히되 뜨지 않는 높이 — 실측)
      _sPos.set(p[0] * sx * S * 0.88, topY * S * 0.66, -p[1] * sz * S);
      _sM.compose(_sPos, _sQ, _sScl);
      for (const m of rec.meshes) m.setMatrixAt(i, _sM);
    }
    for (const m of rec.meshes) { m.count = n; m.visible = true; m.instanceMatrix.needsUpdate = true; }
    return true;
  }
  // ── §G-43 기함 추진 제트(이사 "함미모드에서 분사구 제트가 전혀 안 보인다") ──────────────
  //  2D 는 `ships.js drawFlames()` 가 노즐마다 청록 외피 + 흰 코어 삼각형을 그린다. 3D 에는 그 연출이
  //  **아예 없었다.** 함미모드는 카메라가 선미를 정면으로 보는 시점이라 이 부재가 가장 크게 보인다.
  //
  //  ⚠️`flagRig` 에 붙인다 — 피격 흔들림·bank 롤·등급별 배율이 그대로 따라온다(포탑 리그와 같은 규칙).
  //  ⚠️가산 합성 + `depthWrite:false` — 검은 배경에서 발광체로 읽히고 선체를 가리지 않는다.
  //  ⚠️콘의 밑면이 노즐 쪽, 꼭짓점이 뒤(−z)다. 기본 `ConeGeometry` 는 +y 가 꼭짓점이라 x축 −90° 회전으로
  //   축을 −z 로 눕힌다. 그래야 함미모드에서 카메라를 향해 뻗는다.
  //  ⚠️길이 흔들림은 2D 와 같은 식이되 **전역 `Math.random()` 을 쓰지 않는다**(§G39-R1 계약) — 아래 `_rnd` LCG.
  const JET_MAX = 8;                       // 등급 최대 노즐 수(t4 = 5) 여유
  //  함미 카메라 구도 상수(월드 단위 — 등급 배율과 무관). §G-43 실측에서 나온 값이다.
  //  ⚠️카메라 각도·화각이 바뀌면 다시 재야 한다. 화면 어디에 놓을지를 정하는 값이지 게임 좌표가 아니다.
  //  §G-46 2차(이사 실기 "분사구와 전혀 다른 엉뚱한 위치에서 로켓추진 효과가 나타난다").
  //   §G-43 은 y 를 **카메라 기울기 보정식**(0.75·−jz − 0.90)으로만 잡았다 — 모델과 아무 관계가 없다.
  //   화면 밖으로 떨어지는 것만 막았지, 분사구에 맞춘 적이 없다.
  //  → 포탑(placeMounts)이 쓰는 방식과 같게 **모델 박스에서** 높이를 뽑는다.
  //     포탑: `topY * S * 0.66` (box.max.y 기준) · 제트: 아래 JET_Y_FRAC (box 세로 범위의 비율)
  //  ⚠️보정식으로 되돌리지 말 것. 그러면 등급마다 선체와 어긋난다.
  const JET_Y_FRAC = 0.42;   // 선체 세로 범위에서 분사구 높이 비율(0=바닥, 1=천장). 엔진은 중심보다 약간 아래.
  const jetRig = new THREE.Group();
  jetRig.visible = false;
  flagRig.add(jetRig);
  const jetGeo = new THREE.ConeGeometry(1, 1, 12, 1, true);
  jetGeo.translate(0, -0.5, 0);            // 밑면을 원점에 — 스케일이 "노즐에서 뒤로 자라는" 길이가 된다
  jetGeo.rotateX(Math.PI / 2);             // +y 축 → −z 축(선미 방향)
  const jetMat = (color, opacity) => new THREE.MeshBasicMaterial({
    color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  //  2D 와 같은 2겹: 바깥 청록 외피(COLORS.ally 대역) + 안쪽 흰 코어.
  //  §G-46 3차(이사 "제트도 좀 더 푸른 빛을"): 청록(0x3ff5e0) → **청보라 플라스마**.
  //   실제 우주 추진은 추진제로 색이 갈린다 — 케로신은 주황, 수소는 거의 투명한 옅은 파랑,
  //   제논 이온·홀 추력기는 **청보라**다. 네온 함대의 결에는 이온 쪽이 맞다.
  const jetShell = new THREE.InstancedMesh(jetGeo, jetMat(0x2f6cff, 0.44), JET_MAX);
  const jetCore = new THREE.InstancedMesh(jetGeo, jetMat(0xd8e8ff, 0.58), JET_MAX);   // 심은 순백이 아니라 청백
  //  ⚠️함미모드는 플룸을 **끝에서** 본다 — 원뿔만으로는 단축돼 거의 안 보인다(§G-43 1차 실측).
  //   그래서 노즐 자리에 시점 무관한 발광 구를 하나 더 둔다. 이것이 실제로 "분사구가 타는" 그림을 만든다.
  const jetGlowGeo = new THREE.SphereGeometry(1, 12, 8);
  const jetGlow = new THREE.InstancedMesh(jetGlowGeo, jetMat(0x6f9cff, 0.36), JET_MAX);
  for (const im of [jetShell, jetCore, jetGlow]) { im.count = 0; im.frustumCulled = false; jetRig.add(im); }

  /** 분사구 제트 배치. `placeMounts` 와 같은 좌표 규약을 쓴다(box=기함 GLB 바운딩, S=홀더 배율). */
  function placeJets(tier, box, S, time, thrust) {
    const pts = NOZZLE_POINTS[tier] || NOZZLE_POINTS[0];
    const sx = box ? (box.max.x - box.min.x) : 0.62;
    const sy = box ? (box.max.y - box.min.y) : 0.3;
    const sz = box ? (box.max.z - box.min.z) : 1.0;
    const n = Math.min(pts.length, JET_MAX);
    //  ⚠️반지름 상한은 **노즐 간격**에서 온다. 고정값을 쓰면 노즐이 많은 등급(t3=4·t4=5)에서
    //   발광이 서로 겹쳐 흰 덩어리가 된다(§G-43 실측: 간격 0.61 에 반지름 0.41 → 뭉개짐).
    let gap = Infinity;
    for (let i = 1; i < n; i++) gap = Math.min(gap, Math.abs((pts[i][0] - pts[i - 1][0]) * sx * S * 0.88));
    //  ⚠️절대 상한(월드 0.17)도 함께 건다. 비율만 쓰면 큰 등급에서 발광이 화면을 덮는 흰 원이 된다
    //   (§G-43 실측: t5 반지름 0.42 → 화면 지름 약 85px 로 선체를 가렸다).
    const rad = Math.min(sx * S * 0.055, Number.isFinite(gap) ? gap * 0.30 : Infinity, 0.17);
    //  ⚠️z 는 **선미 최후단**에 건다. 2D 의 y 비율을 그대로 깊이로 쓰면 선체 **안쪽**에 박혀
    //   깊이 검사에 가려 아무것도 안 보인다(§G-43 실측: t5 제트 z −2.66 vs 선미 −3.01 → 전부 가려짐).
    const sternZ = (box ? box.min.z : -0.5) * S;
    let maxP1 = 0;
    for (let i = 0; i < n; i++) if (pts[i][1] > maxP1) maxP1 = pts[i][1];
    _sQ.identity();
    for (let i = 0; i < n; i++) {
      const p = pts[i];
      //  2D 와 같은 맥동: 0.75 + 0.25·sin(t·38 + i·2.1) + 0.15·rand. rand 는 결정적 LCG.
      const pulse = 0.75 + 0.25 * Math.sin(time * 38 + i * 2.1) + 0.15 * _rnd();
      //  ⚠️길이 축은 **Z** 다. `jetGeo.rotateX` 로 회전을 지오메트리에 **구워 넣었으므로** 로컬 길이 방향이
      //   이미 −z 다 — 여기서 y 를 늘리면 화면 위아래로 뻗는 창이 된다(§G-43 최초 구현의 실제 증상).
      //  길이는 선체 깊이(sz·S) 기준: 2D 화염 비율 p[2] 를 얹어 등급마다 달라지게 한다.
      //  함미모드는 플룸을 정면에서 봐 단축되므로 2D 비율보다 길게 잡아야 같은 존재감이 난다.
      const len = sz * S * (0.22 + p[2] * 1.6) * pulse * thrust;
      //  x 는 장착점과 같은 0.88 안쪽 보정(3D 선체는 날개 끝이 얇다).
      //  z 는 선미 기준 — 2D 에서 더 뒤에 있던 노즐(p[1] 큰 것)이 실제로 더 뒤에 놓인다.
      const jz = sternZ + (maxP1 - p[1]) * sz * S * 0.6;
      //  ⚠️y 는 **카메라 내려다봄 보정**이다. 함미 카메라는 기함을 위에서 비스듬히 보므로
      //   뒤로 갈수록 화면에서 아래로 내려간다 — 선체 기준으로만 놓으면 큰 등급일수록 화면 밖으로 떨어진다.
      //   실측(§G-43): 화면 y 는 월드 z 1당 51~65px 내려가고 월드 y 1당 72~82px 올라간다
      //   → 기울기 0.71/0.75/0.79 (t0/t3/t5) 로 거의 일정. 0.75 로 보정하면 등급이 달라도 같은 높이에 온다.
      //   보정 전 실측: t3 화면 y 802 · t5 850(둘 다 화면 800 밖) → 보정 후 셋 다 725 부근.
      //  §G-46 2차: 높이를 **선체에서** 뽑는다(포탑과 같은 방식). 보정식이 아니다.
      const jy = (box ? box.min.y + (box.max.y - box.min.y) * JET_Y_FRAC : 0) * S;
      _sPos.set(p[0] * sx * S * 0.88, jy, jz);
      _sScl.set(rad, rad, len);
      _sM.compose(_sPos, _sQ, _sScl);
      jetShell.setMatrixAt(i, _sM);
      _sScl.set(rad * 0.42, rad * 0.42, len * 0.62);   // 코어는 가늘고 짧게(2D 와 같은 비율)
      _sM.compose(_sPos, _sQ, _sScl);
      jetCore.setMatrixAt(i, _sM);
      //  노즐 발광: 맥동에 함께 숨쉬되 크기 변화는 절반만(깜빡임이 과하면 눈이 아프다)
      const gr = rad * (0.95 + 0.30 * (pulse - 1)) * thrust;
      _sScl.setScalar(gr);
      _sM.compose(_sPos, _sQ, _sScl);
      jetGlow.setMatrixAt(i, _sM);
    }
    for (const im of [jetShell, jetCore, jetGlow]) { im.count = n; im.instanceMatrix.needsUpdate = true; }
    return n > 0;
  }

  // ── §G-8 피격 연출(이사 "섬광은 별로 — 부품이 떨어져 나가고 기체가 흔들리게") ──
  //  신호=squad.flash 상승 에지(takeShot 세트 — 로직 무수정). 파편=세라믹 장갑 조각 InstancedMesh 1 드로우,
  //  결정적 의사난수(LCG — Math.random 금지 계약). 흔들림=flagRig 감쇠 진동(절차·GLB 기함 공통).
  // ── §G-11 차지 연출 3D(이사 "기함 무기와 차지 이펙트도 3D") — 충전 집속 → 발사 빔 ──
  //  ⚠️실모델 스왑 이후 절차 AURORA 의 emissive 펄스(charging/chargeFrac)가 안 보이게 됐다(model.group 숨김).
  //   그래서 기함 모델 종류와 무관하게 리그에 붙는 별도 연출로 만든다: 기수 앞 집속 코어 + 발사 순간 빔.
  const chargeCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.30, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0xbfefff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const chargeHalo = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 20, 14),
    new THREE.MeshBasicMaterial({ color: 0x5fd8ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  //  §G-23 이중 광선 교정(이사): 함미 시점에서 차지 빔이 두 줄로 보였다 — 2D ChargeLance(월드 x 수직선)와
  //   3D 원통(카메라 축 +z)이 동시에 그려졌고, 기함이 화면 중앙을 벗어날수록 둘이 벌어졌기 때문이다.
  //   **이사 판정: 함미 시점에서는 소실점(중앙)으로 뻗는 3D 쪽이 맞다** — 정면으로 쏘는 빔이 원근에서
  //   소실점으로 수렴하는 것이 자연스럽고, 화면 상단으로 수직으로 뻗는 2D 는 함미 시점의 원근과 어긋난다.
  //   → 3D 빔을 남기고, 3D 구간에서는 main 이 2D ChargeLance 를 스킵한다(_in3dMap 스탬프).
  //  발사 빔: 길이 1 원통을 두 점(기수 → 도달점) 사이에 놓고 scale.z 로 늘린다.
  //  §G-25 사거리 교정(이사 "차지샷이 다른 발사체의 2/3 지점까지밖에 안 나간다"):
  //   빔을 기함 로컬 +z 로만 뻗었더니 **원근상 소실점으로 수렴**해 화면 상단에 영영 못 닿았다.
  //   실측(480×800·t=1): 기함 노즈 화면 y=561 · 빔 끝(len 110) y=227 · **소실점 y=184**
  //   → 길이를 400 으로 늘려도 y=197 로 13px 밖에 안 올라간다. 반면 발사체는 y=0(화면 상단)까지 간다.
  //   334px / 561px = 0.60 — 이사가 본 "2/3"의 정체다. 길이 문제가 아니라 **방향** 문제였다.
  //   발사체가 화면 상단에 놓이는 3D 지점은 (0, 23.8, 77.4) 로 **위로 올라간다**(추적 카메라가 아래를 봐서).
  //   그래서 빔도 발사체와 같은 광선 수학(placeOnRay)으로 그 지점을 향하게 한다 — 2D 가 화면을 세로로
  //   관통하는 그림과 같아지고, 두 모드가 같은 사거리로 보인다.
  //  ⚠️그래서 빔은 flagRig(기함 로컬)가 아니라 **씬 직속**이어야 한다 — 월드 좌표로 직접 배치한다.
  //  §G-29: 균일 두께 실린더는 끝이 뭉툭하게 **잘려** 보여 "여기서 멈췄다"는 인상을 준다.
  //   앞(+z)으로 갈수록 가늘어지는 원뿔로 만들면 소실점으로 사라지는 그림이 완성된다.
  //  §G-40(이사님 "차지샷 넓이가 완전 좁아"): radiusTop 0.06 → **1**(진짜 원기둥).
  //   0.06 이면 끝이 6% 로 줄어드는데, 원근이 이미 멀수록 좁혀 준다 → **이중 축소**로 바늘이 됐다.
  //   실측: 화면 y=560 61.4px → y=160 4.7px. 원기둥이면 원근만으로 자연스럽게 좁아진다.
  const lanceGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
  lanceGeo.rotateX(Math.PI / 2);   // 기본 y축 → +z 축(setFromUnitVectors 의 기준축) · radiusTop 이 +z 쪽 = 앞
  const lanceCore = new THREE.Mesh(lanceGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const lanceGlow = new THREE.Mesh(lanceGeo, new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const lanceRig = new THREE.Group();
  lanceRig.add(lanceCore, lanceGlow);
  lanceRig.visible = false;
  //  §G-28 P0-2: 빔은 길이 70+ unit 실린더다. 중심이 시야 밖으로 판정되면 통째로 사라진다 —
  //  화면 정합 배치라 항상 보여야 하므로 컬링을 끈다.
  lanceCore.frustumCulled = false; lanceGlow.frustumCulled = false;
  scene.add(lanceRig);
  //  §G-46 4차(이사 실기 "충전 이펙트가 너무 2D 같다 — 입체감을 주자").
  //   원인: 코어·헤일로 둘 다 **구**라 정면에서 보면 납작한 원반으로 읽힌다. 어느 각도에서 봐도 원이다.
  //  → 기울어진 **회전 링**을 두 개 넣는다. 원근에서 타원으로 눌리고, 돌면서 그 눌림이 계속 바뀌어
  //   "이건 공간에 있는 물건"이 즉시 읽힌다. 구를 아무리 밝혀도 안 생기는 단서다.
  //  ⚠️서로 반대로 돌린다 — 같은 방향이면 한 덩어리로 보여 링이 두 개인 의미가 없다.
  const chargeRingGeo = new THREE.TorusGeometry(1, 0.055, 8, 40);
  const chargeRingA = new THREE.Mesh(chargeRingGeo,
    new THREE.MeshBasicMaterial({ color: 0x7fe9ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const chargeRingB = new THREE.Mesh(chargeRingGeo,
    new THREE.MeshBasicMaterial({ color: 0xbfd4ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  const chargeRig = new THREE.Group();
  chargeRig.add(chargeCore, chargeHalo, chargeRingA, chargeRingB);
  chargeRig.visible = false;
  flagRig.add(chargeRig);
  //  §G-28 P0-2 포구 앵커: 빔 시작점을 **실제 포구의 월드 좌표**로 잡기 위한 빈 노드.
  //  chargeRig → flagRig 를 거치므로 피격 흔들림·롤·등급별 기수 길이가 전부 반영된다.
  //  (이전에는 씬 원점 기준 고정값이라, 기함이 흔들리면 빔만 제자리에 남아 발사구에서 떨어져 보였다.)
  const muzzleAnchor = new THREE.Object3D();
  chargeRig.add(muzzleAnchor);
  //  §G-12 차지 포구(W5): 충전·발사 동안만 기수에 전개된다 — 상시 표시하면 기함 실루엣이 바뀐다.
  //  코어보다 살짝 뒤에 두어 집속 구체가 포구 입에서 자라는 것처럼 보이게 한다.
  const muzzleRig = new THREE.Group();
  muzzleRig.visible = false;
  chargeRig.add(muzzleRig);
  loadEnemyGlbParts(THREE, WEAPON3D.muzzle.glb, WEAPON3D.muzzle)
    .then((parts) => { for (const p of parts) muzzleRig.add(new THREE.Mesh(p.geo, p.mat)); muzzleRig.visible = true; })
    .catch((e) => { warnGlbOnce(WEAPON3D.muzzle.glb, e); /* 실패 = 집속 코어·헤일로·단계 표시는 그대로 — 포구만 빠진다(기함 누락 아님) */ });
  let _lanceT = 0, _lanceStage = 1, _prevCharge = 0;
  //  §G-29 차지 빔 사거리·방향(이사 실기 3회차 정리)
  //   ① §G-23 이사 판정: 함미 시점의 빔은 **소실점으로 수렴하는 3D 원통**이 맞다(2D 의 화면 수직은 원근과 어긋난다).
  //   ② §G-25 이사 지적: "다른 발사체의 2/3 까지밖에 안 나간다" → 그때 화면 최상단을 향하게 바꿨는데,
  //      그러면 빔이 **화면에서 수직 직선**이 되어 ①을 어긴다(이사 재지적: "다시 직선으로 나가는데?").
  //   → 결론: 방향은 **기함 전방(+z)** 으로 되돌리고, 부족했던 건 길이였으므로 길이를 크게 늘린다.
  //     원근상 소실점으로 수렴하는 건 자연스럽고, 충분히 길면 "멀리 나간다"로 읽힌다.
  //   ③ §G-34 §4-3 최종: 길이는 **눈대중 상수가 아니라 world y=0 까지의 실제 깊이**다(발사 블록에서 계산).
  //      §G-31 은 "빔은 소실점 너머로 못 간다 → 그 너머를 2D 잔광으로 잇자"였는데, 전제가 틀렸다.
  //      finite top plane 계약(§4-1)에서 world y=0 은 **화면 안**에 있다 — 소실점 너머가 아니다.
  //      그래서 빔이 거기까지 닿으면 그만이고, 잔광은 필요 없다(그 잔광이 Codex G-2 의 104.4px 어긋남이었다).
  //  §G-34 §4-3: 잔광 제거로 `ctl.lanceScreen` 의 소비자가 사라졌다. 다만 진단(`info().lance`)과
  //   회귀 테스트가 "빔이 화면 어디에 놓였나"를 읽으므로 **계측값으로 계속 갱신**한다(그리기는 하지 않는다).
  //  §G-35 A안: 빔 끝점·카메라 전방 임시 벡터(프레임 무할당 — 모듈 스코프에서 재사용).
  const _lnEnd = new THREE.Vector3(), _sFwd0 = new THREE.Vector3();
  ctl.lanceScreen = { active: false, x0: 0, y0: 0, x1: 0, y1: 0, w1: 0, alpha: 0, stage: 1 };

  //  §G-46(이사 "적 피탄이 빨간 번쩍뿐이라 밋밋하다"): 기함 전용이던 파편을 **적 피격·격파**까지 쓴다.
  //   16 → 48. 드로우콜은 그대로 1개다(InstancedMesh) — 늘어나는 건 인스턴스 상한뿐.
  const DEBRIS_MAX = 48;
  //  §G-46 2차(이사 실기): "파편이 너무 사각형이라 생체 파편이 파손되는 느낌이 없다".
  //   적은 전부 생체 외계인이다 → 상자를 **저폴리 구체**로 바꾸고 인스턴스마다 눌러 타원체로 만든다.
  //   Icosahedron(detail 0) = 20면. 상자(12면)보다 살짝 무겁지만 인스턴스 1드로우라 실질 비용은 같다.
  //  ⚠️금속 광택을 뺀다 — 금속기가 남으면 장갑판 조각으로 읽힌다. 살점은 거칠고 약간 발광한다.
  const debris = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(0.5, 0),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0.0, emissive: 0x2a0406 }),
    DEBRIS_MAX);
  debris.count = 0; debris.frustumCulled = false; scene.add(debris);
  const _deb = [];
  let _shakeT = 0, _prevFlash = 0, _lcg = 7;
  const _rnd = () => ((_lcg = (_lcg * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);

  //  §G-46 프레임당 방출 총량. 적 60기가 동시에 맞아도 폭주하지 않게 막는다(사양서 §4).
  //  §G-46 3차(이사 실기 "파편 크기가 너무 크다 — 20% 로"): 전역 크기 배수.
  //   개별 방출부의 scale 인자는 **상대 비율**로 두고 최종 크기는 여기서 한 번에 조절한다.
  const DEBRIS_SIZE_MULT = 0.2;
  const DEBRIS_PER_FRAME = 12;
  let _debFrameBudget = DEBRIS_PER_FRAME;
  //  instanceColor 는 첫 setColorAt 에 지연 할당된다. 실패하면 색만 포기하고 파편은 계속 보인다.
  let _debColored = true;
  //  §G-46 격파 큐. main 의 중앙 킬 알림이 화면좌표로 채우고, frame() 이 3D 좌표로 바꿔 비운다.
  //   ⚠️상한을 둔다 — 3D 가 꺼져 있거나 frame 이 안 도는 동안 무한히 쌓이면 안 된다.
  const KILL_Q_MAX = 8;
  const _killQ = [];

  /**
   * §G-46 — 파편 방출(공용). 기함 피격·적 피격·적 격파가 **같은 InstancedMesh** 를 쓴다.
   *
   *  ⚠️난수는 `_rnd`(LCG)만 쓴다. 전역 `Math.random()` 은 치명타·탄 분산·스폰과 공유돼
   *   연출이 소비하면 **전투 결과가 달라진다**(§G-39 계약).
   *  ⚠️프레임 예산과 버퍼 상한을 둘 다 본다 — 둘 중 작은 쪽까지만 낸다.
   *
   *  @param x,y,z  월드 좌표(방출 중심)
   *  @param n      요청 개수(예산에 따라 줄어든다)
   *  @param sp     초기 속도 배수(격파는 크게)
   *  @param scale  파편 크기 배수(대형 적은 큰 조각)
   *  @param cr,cg,cb 파편 색(0..1). 생략하면 세라믹 흰색
   *  @returns 실제로 낸 개수
   */
  function emitDebris(x, y, z, n, sp, scale, cr, cg, cb) {
    const room = Math.min(n | 0, DEBRIS_MAX - _deb.length, _debFrameBudget);
    if (room <= 0) return 0;
    for (let i = 0; i < room; i++) {
      const a = _rnd() * Math.PI * 2, v = sp * (0.55 + _rnd() * 0.9);
      _deb.push({
        x: x + (_rnd() - 0.5) * 0.5 * scale, y: y + (_rnd() - 0.5) * 0.5 * scale, z: z + (_rnd() - 0.5) * 0.5 * scale,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v * 0.8 + 0.5 * sp, vz: 0.7 * sp + _rnd() * 1.4 * sp,   // +z=카메라 쪽
        rx: (_rnd() - 0.5) * 11, ry: (_rnd() - 0.5) * 11, rz: (_rnd() - 0.5) * 11,
        ax: _rnd() * 6.28, ay: _rnd() * 6.28, az: _rnd() * 6.28,
        life: 0.45 + _rnd() * 0.45, t: 0, s: scale * (0.6 + _rnd() * 0.7) * DEBRIS_SIZE_MULT,
        //  §G-46 2차: 조각마다 다른 비율로 눌러 **타원체**로 만든다(구가 그대로면 구슬처럼 보인다).
        ex: 0.7 + _rnd() * 0.8, ey: 0.5 + _rnd() * 0.6, ez: 0.8 + _rnd() * 0.9,
        //  §G-46 5차(실행 검증에서 발견): 색을 **조각마다** 흔든다.
        //   ⚠️앞서는 방출 1회당 색을 한 번만 뽑아 12개가 전부 같은 값이었다(실측:
        //    b1 파편 3개가 모두 0.93,0.20,0.20). 주석에는 "조각마다 다른 색조"라고 써 놓고
        //    코드는 그렇지 않았다 — 한 색이면 플라스틱 덩어리로 보인다.
        cr: (cr === undefined ? 1 : cr) * (0.78 + _rnd() * 0.44),
        cg: (cg === undefined ? 1 : cg) * (0.78 + _rnd() * 0.44),
        cb: (cb === undefined ? 1 : cb) * (0.78 + _rnd() * 0.44),
      });
    }
    _debFrameBudget -= room;
    return room;
  }

  /**
   * §G-46 2차(이사 실기 "파편 색상이 흰색이다") — 생체 파편 색.
   *
   *  ⚠️1차에서 적 슬롯 색(`o.cr/cg/cb`)을 썼는데 **그건 종류색이 아니라 체력 틴트**였다.
   *   만피면 (1,1,1) 흰색이고, 피격 순간엔 전 채널 같은 배수(3.74)라 여전히 무채색이다 —
   *   ×0.7 해도 회색이라 화면에서 흰 조각으로 보였다(실측 확인).
   *  → 슬롯에서 가져오지 않고 **붉은 팔레트에서 뽑는다.** 체력이 낮을수록 짙은 적색으로.
   *  @param hp 0..1 남은 체력(모르면 1). @param out 3칸 배열에 rgb 를 쓴다(무할당)
   */
  function bioDebrisColor(hp, out) {
    const t = _rnd();                       // 조각마다 다른 색조 — 한 색이면 플라스틱처럼 보인다
    const dark = 1 - Math.min(1, Math.max(0, hp)) * 0.35;   // 빈사일수록 짙게
    out[0] = (0.85 + t * 0.15) * (0.75 + dark * 0.25);      // 적: 항상 높게
    out[1] = (0.10 + t * 0.20) * dark;                      // 녹: 낮게 — 붉음을 만든다
    out[2] = (0.12 + t * 0.16) * dark;                      // 청: 낮게 (약간 보라기)
    return out;
  }
  const _bioCol = [1, 1, 1];

  /**
   * §G-46 3차(이사 "보급선 파편도 붉은 건 이상하잖아") — **피사체별** 파편 색.
   *  적은 전부 생체 외계인이라 붉게, 그 외는 그 물건의 재질색으로 낸다.
   *  ⚠️키가 없으면(모르는 종류) 생체로 보내지 않는다 — 회색 파편이 안전한 기본값이다.
   */
  const DEBRIS_TINT = {
    h1: [0.62, 0.52, 0.42],   // 운석 — 흙·암석
    h2: [0.58, 0.60, 0.64],   // 잔해 — 회색 금속
    h4: [0.95, 0.55, 0.20],   // 기뢰 — 주황 경고색
    crystal: [0.35, 0.85, 1.00],   // 크리스탈 — 청록 결정
    pod: [0.45, 0.95, 0.82],       // 보급선 — 청록 선체
    capsule: [0.80, 0.86, 0.92],   // 캡슐 — 흰 금속
    coin: [1.00, 0.82, 0.30],      // 코인 — 금색
    pow: [1.00, 0.86, 0.25],       // POW — 노랑
  };
  /** 이 키가 생체(=붉은 파편)인가. 적 로스터(b*)만 생체다. */
  const isBioKey = (k) => typeof k === 'string' && /^b\d+$/.test(k);

  /** 키에 맞는 파편 색을 out 에 쓴다(무할당). @param hp 0..1 */
  function debrisTintFor(key, hp, out) {
    if (isBioKey(key)) return bioDebrisColor(hp, out);
    const t = DEBRIS_TINT[key];
    const j = 0.85 + _rnd() * 0.3;   // 조각마다 밝기 변주 — 한 색이면 플라스틱처럼 보인다
    if (t) { out[0] = t[0] * j; out[1] = t[1] * j; out[2] = t[2] * j; }
    else { out[0] = 0.62 * j; out[1] = 0.64 * j; out[2] = 0.68 * j; }   // 모르는 종류 = 회색
    return out;
  }

  /** §G-46 품질 사다리 연동(§G-45). 프레임이 모자라면 **파편이 먼저 줄고**, 그 다음 해상도가 내려간다. */
  function debrisBudget(kind) {
    if (prefersReducedMotion3D()) return 0;
    const step = (ctl._profile && ctl._profile.qualityStep) | 0;
    if (kind === 'kill') return step <= 0 ? 12 : step === 1 ? 8 : step === 2 ? 4 : 2;
    if (kind === 'ember') return step <= 0 ? 1 : 0;         // 빈사 잔불 — 정상 품질에서만
    return step <= 0 ? 5 : step === 1 ? 3 : step === 2 ? 1 : 0;   // 'hit'
  }
  // ── 픽업 스웜(§G-14 상시, 이사 "픽업도 3D 로 켜줘") — 기본 OFF 였던 전제(임시 조형 "엉망")는
  //  §G-7 VARCO 실모델 교체로 사라졌다. 발사체는 §G-13 의 shots 가 따로 담당한다.
  let props = null;
  {
    try {
      const pm = createPropMaterial(THREE);
      props = {};
      for (const k of PROP_KEYS) {
        if (SHOT_KEYS.includes(k)) continue;   // §G-13 발사체는 아래 shots 로 분리(상시 ON) — 여기서도 만들면 이중 표시
        // §G-2 발사체 3종=원본 가산 재질(이사 승인) / §G-3 픽업 5종=순수 조형 멀티 파트(이사 "2D 이어붙이기 금지")
        //  / ebullet 은 §G-4 순수 조형 예정 — 임시로 공용 자발광 유지.
        //  §G-12 유도 미사일 탄체 = 이사 VARCO 실모델(W4). 나머지 발사체는 원본 텍스처 가산 재질 유지.
        if (k === 'missile' && WEAPON3D.missile.glb) {
          props[k] = makeGlbSwarm(k, WEAPON3D.missile, () => [{ geo: createPropGeometry(THREE, k), mat: createProjMaterial(THREE, k) }]);
          continue;
        }
        const isProj = (k === 'pbullet' || k === 'missile' || k === 'laser');
        const isPickup = (k === 'crystal' || k === 'coin' || k === 'pow' || k === 'pod' || k === 'capsule');
        if (isPickup || k === 'ebullet') {
          // §G-7 픽업 4종 = 이사 VARCO 실모델 우선(로드 실패·미지정 종은 순수 조형 폴백)
          if (isPickup && PICKUP3D[k] && PICKUP3D[k].glb) {
            props[k] = makeGlbSwarm(k, PICKUP3D[k], () => createPickupParts(THREE, k));
            continue;
          }
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
  // ── §G-13 발사체 스웜: 개발 플래그와 무관하게 항상 생성(이사 "발사체도 3D 모두 적용") ──
  //  픽업과 달리 발사체는 2D 로 두면 스프라이트가 화면축에 고정돼(회전 없음) 어디에 있든 "똑바로 선" 그림이 된다.
  //  그래서 소실점으로 날아가는 탄이 옆으로 미끄러지는 것처럼 보였다(이사 "무기를 집어 던지는 느낌").
  /** §G-23 발칸탄 절차 폴백(V1 실모델 로드 실패 시에만). 외곽(진화색 틴트) + 백열 코어 2겹 —
   *  §G-21 §6.2 의 "색은 남고 심지는 밝다" 구조를 그대로 유지한다. 코어는 같은 형상을 가늘고 짧게 줄인 것. */
  function vulcanFallbackParts() {
    const coreGeo = createPropGeometry(THREE, 'pbullet');
    coreGeo.scale(0.34, 0.34, 0.92);
    const coreMat = createProjMaterial(THREE, 'pbullet', false);
    coreMat.color.setHex(0xfffefb);
    return [
      { geo: createPropGeometry(THREE, 'pbullet'), mat: createProjMaterial(THREE, 'pbullet', false) },
      { geo: coreGeo, mat: coreMat },
    ];
  }
  let shots = null;
  try {
    shots = {};
    for (const k of SHOT_KEYS) {
      if (k === 'missile' && WEAPON3D.missile.glb) {
        //  §G-12 유도 미사일 탄체 = 이사 VARCO 실모델(W4). rotY 0 = 원본 그대로(노즈 −z) — 절차 발사체와 같은 규약.
        shots[k] = makeGlbSwarm(k, { ...WEAPON3D.missile, rotY: 0 }, () => [{ geo: createPropGeometry(THREE, k), mat: createProjMaterial(THREE, k) }]);
        continue;
      }
      if (k === 'ebullet') {   // §G-4 적탄 = 플라즈마 3파트 + 적 종별 탄색 틴트
        const meshes = [];
        for (const part of createEnemyBulletParts(THREE, k)) {
          const im = new THREE.InstancedMesh(part.geo, part.mat, PROP_CAPS[k]);
          im.count = 0; im.frustumCulled = false;
          _sCol.setHex(PROP_BASE_COLOR.ebullet); for (let i = 0; i < PROP_CAPS[k]; i++) im.setColorAt(i, _sCol);
          scene.add(im); meshes.push(im);
        }
        shots[k] = { meshes, count: 0, colored: true };
        continue;
      }
      if (k === 'pbullet' && WEAPON3D.round && WEAPON3D.round.glb) {
        //  §G-23 발칸 예광탄 = 이사 VARCO 실모델(V1). 기존 절차 방추(청록 조각)를 대체한다.
        //   §G-24 진화색: 실모델 본체는 자기 텍스처(은색·황동)를 그대로 쓰고(tint false — 틴트하면
        //   금속이 통째로 물든다), **탄두 발광 캡 파트만** 진화색으로 물들인다. 2D 스프라이트가 팁에
        //   진화색을 갖는 구조와 같은 그림이 된다. 캡은 corePart 로 지정해 백열 심과 같은 규칙을 따른다 —
        //   2D 예광탄에는 진화색도 백열도 없으므로 o.core=0 인 인스턴스에서는 캡이 숨는다(§G-22 §6).
        //   로드 실패 시에만 아래 절차 2겹(외곽 진화색 + 흰 코어)으로 되돌아간다.
        const sw = { meshes: [], count: 0, colored: false };
        const attachRound = (parts, meta) => {
          for (const p of parts) {
            const rim = new THREE.InstancedMesh(p.geo, p.mat, PROP_CAPS[k]);
            rim.count = 0; rim.frustumCulled = false;
            scene.add(rim); sw.meshes.push(rim);
          }
          if (meta) Object.assign(sw, meta);
        };
        loadEnemyGlbParts(THREE, WEAPON3D.round.glb, WEAPON3D.round)
          .then((parts) => {
            const tint = parts.map(() => false);   // 본체 파트는 원색 유지(초기화 1회 — 프레임 경로 아님)
            tint.push(true);                       // 마지막 = 탄두 발광 캡만 진화색
            attachRound(parts.concat([createVulcanTracerGlow(THREE)]),
              { colored: true, tint, corePart: parts.length });
          })
          .catch((e) => {
            warnGlbOnce(WEAPON3D.round.glb, e);
            try { attachRound(vulcanFallbackParts(), { colored: true, tint: [true, false], corePart: 1 }); } catch (e2) {}
          });
        shots[k] = sw;
        continue;
      }
      //  §G-15: 레이저는 원본 그림(크리스탈)을 입히지 않는다 — 2D 는 진화색 단색이라 색이 어긋났다.
      const im = new THREE.InstancedMesh(createPropGeometry(THREE, k), createProjMaterial(THREE, k, false), PROP_CAPS[k]);
      im.count = 0; im.frustumCulled = false;
      _sCol.setHex(0xffffff);   // 실제 색은 매 프레임 instanceColor(2D 탄색)로 들어온다
      for (let i = 0; i < PROP_CAPS[k]; i++) im.setColorAt(i, _sCol);
      scene.add(im);
      shots[k] = { meshes: [im], count: 0, colored: true };
    }
  } catch (e) { shots = null; /* 실패는 비치명 — swarmReady 가 false 를 반환해 main 이 수집·스탬프를 하지 않으므로 2D 가 그대로 그린다(§4.1) */ }

  // ── §G-21 §5.1 컨텍스트 손실 = 그 세션은 2D 고정 ──
  //  available 을 내리는 이유: 손실 이후의 GPU 객체(텍스처·버퍼·프로그램)는 전부 무효다. degraded 만 세우고
  //  available 을 참으로 두면 "3D 를 쓸 수 있다"는 계약과 화면이 어긋난다(Codex P0). 복원 이벤트에서도
  //  자동 재개하지 않는다 — 불완전한 객체를 그대로 재사용하지 않기 위해 명시적 재초기화(새 세션)만 허용한다.
  const onLost = (ev) => {
    ev.preventDefault();
    ctl.degraded = true; ctl.available = false; ctl.reason = 'context-lost';
    hide();
    try { console.warn('[chase3d] WebGL 컨텍스트 손실 → 이 세션은 2D 로 고정'); } catch (x) {}
  };
  const onRestored = () => { ctl.reason = 'context-lost-restored-not-resumed'; };
  canvas3d.addEventListener('webglcontextlost', onLost, false);
  canvas3d.addEventListener('webglcontextrestored', onRestored, false);

  //  §G-22 §5.1: 픽셀비율 상한도 세션 프로필에서 나온다(캔버스 폭이 아니라 뷰포트 기준 — LOD·FPS 하한과 동일 축).
  function pixelRatioFor() {
    return Math.min((typeof window !== 'undefined' && window.devicePixelRatio) || 1, ctl._profile.pixelRatioCap);
  }
  function applyCam(cam3d, followPx = 0, viewHPx = 0) {
    camera.fov = cam3d.fov; camera.aspect = cam3d.aspect;
    camera.up.set(0, 1, 0);
    // 부분 추종(이사): 2D 카메라의 기함 화면 이탈(followPx, 화면픽셀)만큼 3D 카메라도 트럭 이동(회전 없는 평행이동)
    //  → 3D 기함이 2D 기함(C0)과 같은 화면 X 에서 좌우로 실제 이동해 보인다. 픽셀당 3D 단위는 기함 깊이·수직 fov 로 환산.
    //  §G-34 §4-4(Codex A-2): 기함 원점의 **시선 방향 깊이**를 매 프레임 확정한다.
    //   예전에는 이 값을 followPx 가 있을 때만 구했고, 발사체는 대신 `CAMERA.chase.dist`(9.9) 고정값을 썼다.
    //   실제 카메라는 high↔chase 를 보간하므로 둘이 벌어진다 — 실측 t=0.5 에서 10.332 vs 9.9(+0.43),
    //   t=1 에서 11.202 vs 9.9(+1.30). 그 결과 발사체가 카메라 실제 위치보다 깊게 놓여
    //   하드 컷 직후 크기와 포구의 공간 관계가 틀어졌다. 이제 한 값을 카메라·발사체가 함께 쓴다.
    const _ex = cam3d.eye, _tg = cam3d.target;
    const _fx = _tg[0] - _ex[0], _fy = _tg[1] - _ex[1], _fz = _tg[2] - _ex[2];
    const _fl = Math.hypot(_fx, _fy, _fz) || 1;
    const originDepth = (-_ex[0] * _fx - _ex[1] * _fy - _ex[2] * _fz) / _fl;
    ctl._camOriginDepth = originDepth;
    let ox = 0;
    if (followPx && viewHPx > 0) {
      const unitPerPx = 2 * originDepth * Math.tan(cam3d.fov * Math.PI / 360) / viewHPx;
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
      renderer.setPixelRatio(pixelRatioFor()); renderer.setSize(cssW, cssH, false);
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
   *  yawBase: π=전면이 카메라(적·소품 기본) / 0=노즈가 소실점 쪽(아군 — 위로 비행).
   *  behindFlag(이사 "적·수송선이 기함 위로 지나가는 느낌"): 적·픽업은 깊이 하한을 기함 기수 뒤로 밀어
   *  겹침 구간에서 기함이 개체를 가리게 한다(정면에 부딪히거나 밑을 스치는 그림). 광선상 이동+스케일 보정이라
   *  화면 위치·크기는 불변, [6,FB) → [FB,FB+1.5) 단조 리매핑이라 개체끼리의 앞뒤 순서도 유지.
   *  아군·아군탄(기함에서 발사)·적탄(기함에 명중)은 기함 앞이 맞으므로 제외. */
  const FLAG_NOSE_CLEAR = 2.8;   // 기함 원점→기수 끝 시선깊이 실측 +2.2(전장 4.78, boxZ +2.28) + 여유
  /** §G39-R1: 색 쓰기가 실패한 스웜을 **원래 흰색(1,1,1)으로 되돌린다.**
   *
   *  ⚠️`colored=false` 만 내리면 직전 프레임의 저체력 틴트나 최대 밝기 번쩍이 버퍼에 그대로 남아
   *   그 색이 세션 내내 얼어붙는다(Codex 구현검수 §4). 여러 파트 중 두 번째에서 실패하면
   *   첫 파트만 새 색인 **부분 적용**까지 생긴다 — 실패는 원상복구여야지 마지막 상태 보존이면 안 된다.
   *  ⚠️`setColorAt` 자체가 고장 난 경우도 살리려고 버퍼(`instanceColor.array`)를 직접 채운다.
   *   three 의 instanceColor 는 Float32Array 라 1.0 = 흰색(곱셈 항등원) = 무염색과 같다.
   *  ⚠️복구가 또 실패해도 던지지 않는다 — 여기서 새면 frame() 의 render-exception 폴백이 3D 전체를 끈다.
   */
  function restoreSwarmWhite(sw) {
    try {
      for (const im of sw.meshes) {
        const ic = im.instanceColor;
        if (!ic || !ic.array) continue;
        ic.array.fill(1);
        ic.needsUpdate = true;   // colored=false 뒤엔 아래 갱신 루프가 건너뛰므로 여기서 직접 표시한다
      }
    } catch (e) { /* 복구도 실패 — 색만 포기하고 행렬·count 갱신과 3D 렌더는 계속 간다 */ }
    sw.colored = false;
  }
  function placeSwarm(sw, buf, n, cap, mode = 'wob', time = 0, yawBase = Math.PI, pitchBase = -0.12, behindFlag = false, visDrop = 0, debrisKey = null) {
    if (!sw) return;
    const count = Math.min(n | 0, cap);
    const fpx = focalPx(ctl._lastLogH, camera.fov);   // 논리px 초점거리
    //  applyCam 이 이번 프레임에 확정한 값. 아직 없으면(첫 프레임) full-chase 기준으로 안전하게 시작한다.
    const camOriginDepth = ctl._camOriginDepth > 0 ? ctl._camOriginDepth : CAMERA.chase.dist;
    camera.getWorldDirection(_sFwd);
    const flagBehind = -camera.position.dot(_sFwd) + FLAG_NOSE_CLEAR;   // 기함(원점) 시선깊이 + 기수 여유 — 매 프레임 카메라 추종
    for (let i = 0; i < count; i++) {
      const o = buf[i];
      let depth = Math.min(60, Math.max(6, fpx / Math.max(1e-3, o.px)));        // 전장 1.0 모델 기준
      if (behindFlag && depth < flagBehind && flagBehind > 6.5) depth = flagBehind + ((depth - 6) / (flagBehind - 6)) * 1.5;
      const scl = (o.px * depth) / fpx;                                         // 클램프 보정 → 화면 전장 = o.px 유지
      placeOnRay(camera, _sFwd, toNdcX(o.sx, ctl._lastLogW), toNdcY(o.sy, ctl._lastLogH), depth, _sPos, _sV, _sDir);
      //  §G-38: 시각 중심 보정 — 기함 모델이 원점보다 15px 낮게 보이는 만큼 적을 내린다.
      if (visDrop) _sPos.y -= visDrop;
      if (mode === 'face') {
        // 카메라 대면(§G-5 실모델): Matrix4.lookAt(개체, 카메라) 은 +z=개체-카메라 방향 → 전면(-z)이 카메라.
        //  화면 위(멀리)에서도 정면이 압축되지 않는다(이사: "정면이 보여야"). wob 은 로컬 z 롤.
        _sM.lookAt(_sPos, camera.position, camera.up);
        _sQ.setFromRotationMatrix(_sM);
        _sQ.multiply(_sQ2.setFromAxisAngle(_sAxisZ, Math.sin(o.wob) * 0.15));
      } else {
        if (mode === 'spin') _sEul.set(-0.12, yawBase + time * 1.4 + i * 0.73, 0);
        else if (mode === 'direct') _sEul.set(-0.12, yawBase, o.wob);
        else _sEul.set(pitchBase, yawBase, Math.sin(o.wob) * 0.15);
        _sQ.setFromEuler(_sEul);
      }
      _sM.compose(_sPos, _sQ, _sScl.setScalar(scl));
      for (const im of sw.meshes) im.setMatrixAt(i, _sM);
      //  §G-46 적 피격 파편 — **여기가 적의 월드 좌표가 확정된 유일한 지점**이라 추가 계산이 0이다.
      //   ⚠️`spark` 는 chase3d-collect 가 상승 에지로 딱 한 번 세운 값이다. 감쇠값(flash)으로 하면
      //    한 번 맞을 때마다 프레임 수만큼 쏟아진다.
      //   ⚠️적 스웜에만 적용한다 — 픽업·탄은 slot 에 spark 를 쓰지 않으므로 자연히 걸러진다.
      if (o.spark) {
        //  §G-46 3차: 피사체별 색. 적(b*)만 생체 붉은색, 운석·크리스탈·보급선은 각자 재질색.
        debrisTintFor(debrisKey, o.hp === undefined ? 1 : o.hp, _bioCol);
        emitDebris(_sPos.x, _sPos.y, _sPos.z, debrisBudget('hit'), 1.5 + scl * 0.5, 0.45 + scl * 0.5,
          _bioCol[0], _bioCol[1], _bioCol[2]);
      } else if (o.hp !== undefined && o.hp <= 0.3 && o.hp > 0 && _rnd() < 0.02) {
        //  빈사 잔불 — 확률로 드문드문. "곧 터진다"를 색이 아니라 움직임으로 알린다.
        emitDebris(_sPos.x, _sPos.y, _sPos.z, debrisBudget('ember'), 0.7, 0.3 + scl * 0.25, 1, 0.55, 0.25);
      }
      //  §G-39: 적·픽업의 피해 색(Task 6 의 cr/cg/cb, 또는 기존 픽업 col). ⚠️setHex 는 24비트라
      //   1 을 넘는 값(피격 번쩍)을 못 담는다 → setRGB. 색 쓰기가 실패해도 여기서 국소 격리한다 —
      //   밖으로 새면 frame() 의 render-exception 폴백(§5.1)이 이 세션의 3D 전체를 꺼버린다.
      //   그 스웜의 colored 만 내려 다음 프레임부터 이 블록을 건너뛰고, 모델(행렬)은 계속 갱신해 보인다.
      if (sw.colored) {
        try {
          if (o.cr !== undefined) _sCol.setRGB(o.cr, o.cg, o.cb);
          else if (o.col >= 0) _sCol.setHex(o.col);
          else _sCol.setRGB(1, 1, 1);
          for (const im of sw.meshes) im.setColorAt(i, _sCol);
        } catch (e) { restoreSwarmWhite(sw); }
      }
    }
    for (const im of sw.meshes) {
      im.count = count;
      if (count) { im.instanceMatrix.needsUpdate = true; if (sw.colored && im.instanceColor) im.instanceColor.needsUpdate = true; }
    }
    sw.count = count;
  }
  /** §G-13 발사체 배치. 두 값을 각각 옳은 출처에서 가져온다.
   *   ①화면 위치 = 2.5D 투영 좌표(o.sx/o.sy) — 적·기함·픽업이 전부 이 좌표계에 정합돼 있다. 발사체만 월드로
   *     따로 놓으면 가로 퍼짐이 1.5배 커져(실측 396px vs 270px) 탄이 적을 빗나가 보인다.
   *   ②깊이·자세 = 월드 좌표 — 2D 는 탄 스프라이트를 화면축 고정으로 그려(drawProjected 에 회전 없음) 어디에
   *     있든 "똑바로 선" 그림이 된다. 소실점으로 가야 할 탄이 옆으로 미끄러져 보이던 원인이 이것이다.
   *     3D 는 진행 방향으로 실제 회전시키고, 깊이도 픽셀 역산이 아니라 월드 진행축에서 준다. */
  function placeShots(sw, buf, n, cap, key, sqy) {
    if (!sw) return;
    const count = Math.min(n | 0, cap);
    const len = SHOT_LEN[key] || 0.5;
    const wRel = SHOT_W[key] ?? 1;
    const minPx = SHOT_MIN_PX[key] || 0;
    const fpx = focalPx(ctl._lastLogH, camera.fov);   // 논리px 초점거리
    //  §G-34 §4-4: **이번 프레임 카메라**의 원점 시선 깊이. `applyCam` 이 매 프레임 채운다.
    //  ⚠️이 선언이 빠지면 `placeShots` 가 첫 프레임에 ReferenceError 로 죽고, 렌더러가
    //   "이 세션은 2D 로 고정"으로 폴백해 **3D 기함이 아예 안 나온다**(2026-08-11 이사님 제보로 발견).
    //   전환 전 구간에서는 아직 값이 없을 수 있으니 full-chase 거리로 방어한다.
    const camOriginDepth = ctl._camOriginDepth > 0 ? ctl._camOriginDepth : CAMERA.chase.dist;
    camera.getWorldDirection(_sFwd);
    for (let i = 0; i < count; i++) {
      const o = buf[i];
      // 시선 깊이 = 탄이 기함보다 얼마나 앞서 나갔는지(월드) + 카메라가 기함 뒤에 있는 거리
      //  §G-34 §4-4: **이번 프레임 카메라**의 원점 깊이를 쓴다(고정 `CAMERA.chase.dist` 금지 — Codex A-2).
      const depth = shotDepth(sqy, o.wy, SCALE_Z, camOriginDepth);
      placeOnRay(camera, _sFwd, toNdcX(o.sx, ctl._lastLogW), toNdcY(o.sy, ctl._lastLogH), depth, _sPos, _sV, _sDir);
      //  노즈는 −z(loftProjectile "노즈(−z)=그림 상단", 미사일 GLB 도 rotY 0 으로 통일) → π 로 뒤집는다.
      //  3D X 축은 화면 좌우와 반대(추적 카메라 lookAt 기저 실측)라 진행각 부호도 뒤집는다.
      _sEul.set(0, shotYaw(o.wob), 0);
      _sQ.setFromEuler(_sEul);
      //  화면 최소 전장 보정(§G-15 이사 "탄이 화면 끝까지 안 가고 중간에서 사라진다"): 2D 의 KIND_SCALE.minRel 과
      //  같은 성격의 하한. 진짜 원근이라 멀어지면 무한히 작아져 시야에서 먼저 지워졌다.
      //  §G-20 종류별 크기 배율(o.mul) — 드론 예광탄은 기함 발칸보다 작다(2D 위계 계승).
      //  §G-21 §6.3 하한에서 mul 을 빼야 위계가 산다. 예전 식은 분모에 mul 이 있어 k2 가 mul 을 정확히 상쇄했고,
      //   그 결과 먼 거리에서는 예광탄도 발칸도 똑같이 minPx 로 수렴해 크기 차이가 사라졌다(Codex P1 실측).
      //   지금은 하한이 "종류별 실효 하한 = minPx × mul" 이 되어 근거리·원거리 모두에서 순서가 유지된다.
      shotScale(len, wRel, o.mul || 1, o.wmul || 1, minPx, depth, fpx, _sShotScl);
      _sM.compose(_sPos, _sQ, _sScl.set(_sShotScl.x, _sShotScl.y, _sShotScl.z));
      for (let j = 0; j < sw.meshes.length; j++) {
        const im = sw.meshes[j];
        //  §G-22 §6 tracer 코어 회귀: 발칸탄 스웜은 외곽+코어 2파트인데, 같은 스웜에 들어오는
        //  드론 예광탄에는 2D 에 백열 심이 없다. 코어 파트는 o.core 가 1인 인스턴스에만 그린다.
        if (sw.corePart === j && !o.core) im.setMatrixAt(i, _sMHidden);
        else im.setMatrixAt(i, _sM);
        //  sw.tint[j]=false 인 파트(발칸 백열 코어)는 개체색으로 물들이지 않는다 — 2D 가 스프라이트 위에
        //  흰 코어를 '덮어쓰기'로 그리는 구조와 같다(외곽은 진화색, 심지는 항상 백열).
        if (sw.colored && o.col >= 0 && (!sw.tint || sw.tint[j])) { _sCol.setHex(o.col); im.setColorAt(i, _sCol); }
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
    const dpr = pixelRatioFor();
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
      model.setLOD(ctl._profile.lod);   // §G-22 §5.1: LOD 도 세션 프로필(픽셀비율·FPS 하한과 같은 축)
      model.update(time, { bank, charging: !!sq.charging, chargeFrac: sq.chargeFrac || 0 });
      // §G-8 등급 스왑(이사 "B 로 하자"): squad.tier 의 실모델이 준비됐으면 그것만, 아니면 절차 AURORA 유지.
      //  절차 모델의 bank·bob 은 model.update 가 담당 — GLB 홀더는 같은 bank 를 롤로 직접 적용.
      const tier = Math.max(0, Math.min(5, sq.tier | 0));
      const useGlb = flags[tier] && flags[tier].ok;
      for (const k of Object.keys(flags)) flags[k].holder.visible = (useGlb && +k === tier);
      //  §G-34 후속(이사님 "큰 기체가 스쳐 나온다"): 절차 AURORA 폴백을 **띄우지 않는다.**
      //   예전엔 GLB 가 아직이면 절차 모델을 대신 그렸는데, 낮은 등급(EMBER)에서 그건
      //   **다른 배의 큰 모델**이라 확대하는 순간 스쳐 보였다.
      //   ⚠️main 의 `in3D` 게이트가 `ready.flagship(tier)` 를 보므로, GLB 전에는 **2D 기함이 그려진다.**
      //    즉 여기서 숨겨도 기함이 사라지지 않는다 — 오히려 "2D 하나만" 보이는 올바른 그림이 된다.
      //    (둘 다 켜져 있어서 2D 기함 위에 큰 3D 가 겹쳐 보이던 것이 이번 증상의 정체다.)
      model.group.visible = false;
      if (useGlb) flags[tier].holder.rotation.z = bank;
      ctl._flagTier = useGlb ? tier : -1;
      // §G-12 갑판 포탑: 현재 무기 1종을 장착점 수만큼(2D 와 동일 규칙) 세운다 — 실모델 기함일 때만.
      const wKey = sq.weapon === 'laser' ? 'laser' : sq.weapon === 'homing' ? 'homing' : 'vulcan';
      mountRig.visible = useGlb && placeMounts(tier, wKey, sq.weaponLv | 0, flags[tier].box, FLAG_LEN * (TIER_SCALE[tier] ?? 1));
      mountRig.rotation.z = bank;
      ctl._mountKey = mountRig.visible ? wKey : '';
      //  §G-43 추진 제트: 실모델 기함일 때만. 2D drawFlames 와 같은 노즐 자리에 낸다.
      //  ⚠️차지 중에는 추력을 살짝 낮춰(0.72) 기수의 집속 코어가 더 도드라지게 한다 — 연출 전용.
      jetRig.visible = useGlb && placeJets(tier, flags[tier].box, FLAG_LEN * (TIER_SCALE[tier] ?? 1), time, sq.charging ? 0.72 : 1);
      jetRig.rotation.z = bank;
      // 프레임 간격(차지 감쇠·파편 적분 공용) — time 은 초 단위 누적
      const dt = Math.min(0.05, Math.max(0, time - (ctl._prevTime || time)));
      ctl._prevTime = time;
      //  §G-28 P0-2: 피격 흔들림은 **차지 빔보다 먼저** 계산·적용한다. 빔 시작점을 포구의 월드 좌표에서
      //   읽는데, 흔들림이 뒤에 적용되면 빔이 늘 한 프레임 전 자세를 따라가 발사구에서 떨어져 보였다.
      // §G-8 피격 연출(이사: 섬광 대신 "부품 이탈 + 기체 흔들림") — flash 상승 에지에서 발화
      const fl = sq.flash || 0;
      if (fl > _prevFlash + 0.1 && !prefersReducedMotion3D()) {
        _shakeT = 0.42;
        //  §G-46: 공용 방출기로 통일. 기함은 **예산에서 먼저 가져간다**(플레이어 피격이 가장 중요한 신호).
        //   기수 앞·갑판 위 오프셋은 함체에 파묻히지 않게 실측으로 잡은 값이라 그대로 둔다.
        emitDebris((_rnd() - 0.5) * 2.4, 0.5 + _rnd() * 0.9, 1.9, 7, 2.4, 1.6);
      }
      _prevFlash = fl;
      if (_shakeT > 0) {
        _shakeT = Math.max(0, _shakeT - dt);
        const k = _shakeT / 0.42, w = time * 46;
        flagRig.position.set(Math.sin(w) * 0.16 * k, Math.sin(w * 1.7 + 1.1) * 0.11 * k, 0);
        flagRig.rotation.z = Math.sin(w * 1.3 + 0.6) * 0.09 * k;
        flagRig.rotation.x = Math.sin(w * 0.9) * 0.05 * k;
      } else if (flagRig.position.x !== 0 || flagRig.rotation.z !== 0) {
        flagRig.position.set(0, 0, 0); flagRig.rotation.set(0, 0, 0);
      }
      // §G-11 차지 연출: 충전 집속(기수 앞 코어가 커지며 밝아짐) → 발사 순간 빔(0.34s, 2D ChargeLance 수명과 동일)
      //  ⚠️실전 Squad 는 charging/chargeFrac 을 갖지 않는다 — 충전 상태는 charge(누적 초)·chargeStage 다.
      //   (charging/chargeFrac 은 검사용 합성 run 의 필드라, 그것만 읽던 §G-11 연출이 실플레이에서 한 번도
      //    뜨지 않았다 — 실측.) 합성 run 이면 그 값을, 실전이면 charge 를 만충 시간으로 정규화해 쓴다.
      const CHARGE_FULL = BAL.charge.stageTime * BAL.charge.maxStage;   // 단계시간×최대단계 = 만충(초)
      const chgOn = sq.charging !== undefined ? !!sq.charging : (sq.charge || 0) > 0.001;
      const chgFrac = sq.chargeFrac !== undefined ? sq.chargeFrac : (sq.charge || 0) / CHARGE_FULL;
      const chg = chgOn ? Math.max(0, Math.min(1, chgFrac)) : 0;
      if (_prevCharge > 0.25 && chg === 0) { _lanceT = 0.34; _lanceStage = _prevCharge >= 0.99 ? 3 : 1; }   // 충전 해제=발사
      _prevCharge = chg;
      //  기수 앞 = 실제 기함 바운딩의 +z 끝 + 여유. 상수 2.6(T3 기준)으로 두면 T4·T5 는 기수가 더 길어
      //  집속 코어·포구가 선체 안에 묻힌다(실측). 폴백은 절차 AURORA 기준값.
      const NOSE_Z = (flags[tier] && flags[tier].box ? flags[tier].box.max.z * (FLAG_LEN * (TIER_SCALE[tier] ?? 1)) : 2.25) + 0.35;
      if (chg > 0) {
        const puff = 1 + Math.sin(time * 18) * 0.08;
        chargeCore.position.set(0, 0.35, NOSE_Z);
        chargeCore.scale.setScalar((0.35 + chg * 1.15) * puff);
        chargeCore.material.opacity = 0.35 + chg * 0.55;
        chargeHalo.position.copy(chargeCore.position);
        chargeHalo.scale.setScalar((0.4 + chg * 1.5) * puff);
        chargeHalo.material.opacity = 0.12 + chg * 0.3;
        //  §G-46 4차: 기울어진 두 링을 반대로 돌린다. 충전이 찰수록 조여들며(반지름 ↓) 밝아진다 —
        //   "에너지가 한 점으로 모인다"가 크기 변화만으로 읽힌다.
        //  ⚠️품질 강등 시엔 끈다(§G-45 사다리). 링 2개 = 드로우콜 +2 다.
        const ringOn = ((ctl._profile && ctl._profile.qualityStep) | 0) === 0 && !prefersReducedMotion3D();
        const rr = (1.35 - chg * 0.55) * puff;
        for (const [ring, dir, tilt] of [[chargeRingA, 1, 0.55], [chargeRingB, -1, -0.95]]) {
          ring.visible = ringOn;
          if (!ringOn) { ring.material.opacity = 0; continue; }
          ring.position.copy(chargeCore.position);
          ring.scale.setScalar(rr * (dir > 0 ? 1 : 0.72));
          //  x 축으로 기울여 **정면에서도 타원**이 되게 하고, z 축 회전으로 그 타원을 돌린다.
          ring.rotation.set(tilt, time * 0.7 * dir, time * 2.2 * dir);
          ring.material.opacity = (0.10 + chg * 0.5) * (dir > 0 ? 1 : 0.7);
        }
      } else {
        chargeCore.material.opacity = 0; chargeHalo.material.opacity = 0;
        chargeRingA.material.opacity = 0; chargeRingB.material.opacity = 0;
        chargeRingA.visible = false; chargeRingB.visible = false;
      }
      //  §G-12 차지 포구(W5): 집속 코어를 감싸는 금색 조리개 링. 충전 중 천천히 돌아 "가동" 느낌을 준다.
      //  ⚠️조리개(금색 입)를 전방(+z)으로 두면 함미 추적 카메라에는 뚫린 뒷면만 보여 검은 덩어리가 된다(실측).
      //   그래서 리그에서 180° 돌려 조리개가 카메라를 향하게 하고, 코어를 그 앞에 둬 링 안에서 빛나게 한다.
      if (muzzleRig.children.length) {
        const ms = FLAG_LEN * (TIER_SCALE[tier] ?? 1) * 0.13;
        muzzleRig.position.set(0, 0.35, NOSE_Z - ms * 0.9);
        muzzleRig.scale.setScalar(ms);
        muzzleRig.rotation.set(0, Math.PI, time * 1.1);
      }
      if (_lanceT > 0) {
        _lanceT = Math.max(0, _lanceT - dt);
        const p = _lanceT / 0.34;                       // 1 → 0
        //  §G-40: 반지름을 **2D 가 실제로 그리는 폭**에서 끌어온다.
        //  ⚠️예전엔 `(0.34 + 0.24·p) × (3단계면 1.5)` 고정 상수였다 — 2D 는 기함이 커지면 빔도 넓어지는데
        //   3D 는 안 따라가서 tier5·3단계에서 2D 158px vs 3D ~61px 로 벌어졌다(실측).
        //  ⚠️main 이 값을 못 준 프레임(구 경로)만 옛 상수로 떨어진다 — 화면이 비지 않게.
        let rad = (0.34 + 0.24 * p) * (_lanceStage >= 3 ? 1.5 : 1);
        //  §G-25: 빔은 기수에서 **발사체가 화면 상단에 놓이는 그 3D 지점**까지 뻗는다(위 주석의 실측 근거).
        //  §G-28 P0-2: 시작점은 고정값이 아니라 **포구 앵커의 월드 좌표**다 — 흔들림·롤·등급별 기수 길이가
        //   전부 반영된다. 흔들림은 이 블록보다 위에서 이미 계산·적용됐다(한 프레임 지연 없음).
        //  ⚠️행렬 갱신 순서: flagRig(부모 체인) → 카메라. 둘 다 이 프레임 값이 확정된 뒤에 읽어야 한다.
        muzzleAnchor.position.set(0, 0.35, NOSE_Z);
        flagRig.updateMatrixWorld(true);                 // 포구 월드 좌표는 이 프레임 흔들림·롤이 확정된 뒤에 읽는다
        muzzleAnchor.getWorldPosition(_lnA);             // 실제 포구(월드)
        //  §G-29: 방향은 **기함 전방** 이다(화면 상단이 아니라). flagRig 의 회전을 그대로 받아
        //   피격 롤에 빔도 함께 기운다. 원근상 소실점으로 수렴하는 것이 이 시점의 올바른 그림이다.
        _lnD.set(0, 0, 1).applyQuaternion(flagRig.quaternion).normalize();
        //  §G-34 §4-3: 빔은 **world y=0(유한 상단면)** 에서 끝난다. 길이를 눈대중 상수로 잡을 필요가 없다 —
        //   발사체 깊이 규칙(`shotDepth`)에서 그대로 나온다:
        //     shotDepth(sqy, 0) − shotDepth(sqy, sqy) = (sqy−0)·SCALE_Z − 0 = **sqy · SCALE_Z**
        //   즉 "탄이 기함에서 화면 상단까지 가는 동안 늘어나는 깊이"가 곧 빔 길이다.
        //   → 빔 끝이 **발사체가 world y=0 에 있을 때 놓이는 바로 그 자리**에 온다(같은 규칙, 같은 그림).
        //  ⚠️예전 고정값 1400 은 소실점에 빔을 붙여 "무한히 뻗는" 그림을 만들려던 것이었고,
        //   그 때문에 화면 밖 구간을 2D 로 메우는 잔광이 필요했다. 그 잔광은 §4-3 에서 제거했다.
        const _sqy = sq ? sq.y : ctl._lastLogH * 0.84;
        let dist = Math.max(1, _sqy * SCALE_Z);
        //  §G-35 A안: main 이 준 **2D 화면 끝점**이 있으면 발사체와 같은 규칙(placeOnRay)으로 놓는다.
        //   그래야 2D 투영과 3D 빔이 같은 자리에서 끝난다. 없으면(구 경로) 위 깊이식 그대로.
        //  ⚠️방향까지 화면점으로 정한다 — 길이만 맞추면 기함이 화면 옆에 있을 때 각도가 어긋난다.
        camera.getWorldDirection(_sFwd0);   // placeOnRay 는 카메라 전방이 필요하다
        const _le = ctl.lanceEndScreen;
        if (_le && Number.isFinite(_le.x) && Number.isFinite(_le.y)) {
          const _d = shotDepth(_le.sqy || _sqy, _le.wy || 0, SCALE_Z, ctl._camOriginDepth > 0 ? ctl._camOriginDepth : CAMERA.chase.dist);
          placeOnRay(camera, _sFwd0, toNdcX(_le.x, ctl._lastLogW), toNdcY(_le.y, ctl._lastLogH), _d, _lnEnd, _lnV, _lnV2);
          _lnD.copy(_lnEnd).sub(_lnA);
          dist = Math.max(1, _lnD.length());
          _lnD.normalize();
        }
        _lnQ.setFromUnitVectors(_sAxisZ, _lnD);
        //  §G-28 P0-2 무할당: 중첩 배열 리터럴 루프를 없앤다(프레임마다 배열 3개 + 이터레이터가 생겼다).
        //  §G-40: 포구 깊이에서 2D 와 같은 화면 폭이 나오는 월드 반지름으로 바꾼다.
        //   화면 폭 = 반지름 × 초점거리 / 깊이 → 반지름 = 화면반폭 × 깊이 / 초점거리.
        const _lw = ctl.lanceWidthScreen;
        if (Number.isFinite(_lw) && _lw > 0) {
          const _nd = _lnA.dot(_sFwd0) - camera.position.dot(_sFwd0);   // 포구의 시선 깊이(무할당)
          //  §G-40: 3D 는 2D 의 `LANCE_3D_WIDTH_MULT` 배로 그린다(이사님 결정 — 함미 시점 체감 보정).
          //  ⚠️판정 폭은 2D 그대로다. 화면만 넓어진다.
          const _r2 = worldRadiusForScreenHalfW(_lw * (0.7 + 0.5 * p) * LANCE_3D_WIDTH_MULT, _nd, focalPx(ctl._lastLogH, camera.fov));
          if (_r2 > 0) rad = _r2;                                        // ⚠️2D 의 `w = halfW·(0.7+0.5p)` 와 같은 식
        }
        _lnB.copy(_lnA).addScaledVector(_lnD, dist * 0.5);   // 두 메시가 공유하는 중점 — _lnB 재사용
        lanceCore.position.copy(_lnB); lanceCore.quaternion.copy(_lnQ);
        lanceCore.scale.set(rad * 0.42, rad * 0.42, dist);
        lanceCore.material.opacity = 0.9 * p;
        lanceGlow.position.copy(_lnB); lanceGlow.quaternion.copy(_lnQ);
        lanceGlow.scale.set(rad, rad, dist);
        lanceGlow.material.opacity = 0.5 * p;
        if (_lanceStage >= 3) lanceGlow.material.color.setHex(0xffd166); else lanceGlow.material.color.setHex(0x66e0ff);
        lanceRig.visible = true;
        //  §G-31 A안: 빔의 화면 시작·끝과 끝 두께를 재서 main 에 넘긴다(HUD 잔광이 이어 그린다).
        //   `project` 는 인자 벡터를 덮어쓰므로 스크래치에 복사해 쓴 뒤 버린다(할당 0).
        camera.updateMatrixWorld();
        const LW2 = ctl._lastLogW || 480, LH2 = ctl._lastLogH || 800;
        _lnP.copy(_lnA).project(camera);
        const sx0 = (_lnP.x + 1) / 2 * LW2, sy0 = (1 - _lnP.y) / 2 * LH2;
        _lnV.copy(_lnA).addScaledVector(_lnD, dist).project(camera);       // 빔 끝(월드) → 화면
        const sx1 = (_lnV.x + 1) / 2 * LW2, sy1 = (1 - _lnV.y) / 2 * LH2;
        //  끝 두께: 끝점에서 카메라 오른쪽으로 반경만큼 옮긴 점을 함께 투영해 화면 폭을 얻는다.
        _lnV2.copy(_lnA).addScaledVector(_lnD, dist);
        _lnV2.x += rad * 0.06;                                             // 원뿔 끝 반경 = rad × radiusTop(0.06)
        _lnV2.project(camera);
        const w1 = Math.abs(((_lnV2.x + 1) / 2 * LW2) - sx1) * 2;
        const ls = ctl.lanceScreen;
        ls.active = true; ls.x0 = sx0; ls.y0 = sy0; ls.x1 = sx1; ls.y1 = sy1;
        ls.w1 = Math.max(1.2, w1); ls.alpha = 0.5 * p; ls.stage = _lanceStage;
      } else {
        lanceCore.material.opacity = 0; lanceGlow.material.opacity = 0;
        lanceRig.visible = false;
        ctl.lanceScreen.active = false;
      }
      chargeRig.visible = chg > 0;
      //  §G-46 격파 연출 — 큐를 비운다.
      //   ⚠️일반 적은 죽는 프레임에 배열에서 제거된다(main.js:2078 splice). 3D 가 목록을 훑는 방식으로는
      //    "터지는 중"을 볼 프레임이 없다 → main 의 중앙 킬 알림이 여기로 좌표를 넘긴다.
      //   ⚠️"목록에서 사라진 것"을 감지하는 대안은 쓰지 않는다 — 화면 밖 이탈·컬링과 구분이 안 돼
      //    멀쩡한 적이 폭발한다.
      if (_killQ.length) {
        const fpxK = focalPx(ctl._lastLogH, camera.fov);
        camera.getWorldDirection(_sFwd);
        for (let i = 0; i < _killQ.length; i++) {
          const k = _killQ[i];
          const depth = Math.min(60, Math.max(6, fpxK / Math.max(1e-3, k.px)));
          placeOnRay(camera, _sFwd, toNdcX(k.sx, ctl._lastLogW), toNdcY(k.sy, ctl._lastLogH), depth, _sPos, _sV, _sDir);
          _sPos.y -= WORLD_OBJ_VIS_DROP;   // 적과 같은 시각 중심 보정(§G-38) — 안 하면 파편만 떠 보인다
          const scl = (k.px * depth) / fpxK;
          //  §G-46 3차: 격파도 피사체 색으로. 적(b*)은 가장 짙은 적색(hp=0), 그 외는 재질색.
          debrisTintFor(k.key, 0, _bioCol);
          emitDebris(_sPos.x, _sPos.y, _sPos.z, debrisBudget('kill'), 2.6 + scl * 0.8, 0.55 + scl * 0.7,
            _bioCol[0], _bioCol[1], _bioCol[2]);
        }
        _killQ.length = 0;
      }
      // 파편 적분(중력 없음 — 우주) + 수명 소멸. 인스턴스 행렬 갱신은 살아있는 것만.
      let dn = 0;
      for (let i = 0; i < _deb.length; i++) {
        const d = _deb[i];
        d.t += dt;
        if (d.t >= d.life) continue;
        d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
        d.vx *= 0.985; d.vy *= 0.985; d.vz *= 0.985;
        d.ax += d.rx * dt; d.ay += d.ry * dt; d.az += d.rz * dt;
        const k = 1 - d.t / d.life;
        _sEul.set(d.ax, d.ay, d.az); _sQ.setFromEuler(_sEul);
        //  §G-46 2차: 균일 배율(setScalar) 대신 조각별 비율 — 구슬이 아니라 찢긴 살점으로 보이게.
        const ks = d.s * (0.45 + k * 0.55);
        _sM.compose(_sPos.set(d.x, d.y, d.z), _sQ, _sScl.set(ks * d.ex, ks * d.ey, ks * d.ez));
        debris.setMatrixAt(dn++, _sM);
        //  §G-46: 적 파편은 그 적의 색을 띤다 — 안 그러면 기함 장갑(세라믹 흰색)이 튄 것처럼 보인다.
        //   ⚠️색 쓰기 실패를 국소 격리한다. 밖으로 새면 frame() 의 render-exception 폴백이
        //    이 세션의 3D 를 통째로 꺼버린다(placeSwarm 의 sw.colored 와 같은 이유).
        if (_debColored) {
          try { debris.setColorAt(dn - 1, _sCol.setRGB(d.cr, d.cg, d.cb)); }
          catch (e) { _debColored = false; }
        }
        _deb[dn - 1] = d;   // 살아있는 것만 앞으로 압축(별도 배열 할당 없이)
      }
      _deb.length = dn;
      debris.count = dn;
      if (dn) debris.instanceMatrix.needsUpdate = true;
      if (dn && _debColored && debris.instanceColor) debris.instanceColor.needsUpdate = true;
      //  §G-46 프레임 예산 초기화 — 다음 프레임이 다시 12개를 쓴다.
      _debFrameBudget = DEBRIS_PER_FRAME;
      // 기체 흔들림: 감쇠 진동(피격 방향 무관 — 충격 직후 크게, 0.42s 안에 잦아든다). 카메라는 건드리지 않는다(멀미 방지).
      // 실전 스웜(크리처+소품) — t≥0.5 에서만 이 지점에 도달 = 2D 스킵과 같은 하드 컷
      //  §G-22 §9: 아래 루프의 키 목록은 전부 모듈 초기화 때 만든 고정 배열이다(프레임 중 새 배열 0).
      if (swarms) {
        for (let ki = 0; ki < ENEMY_KEYS.length; ki++) {
          const k = ENEMY_KEYS[ki];
          const sk = swarms[k];
          if (sk) placeSwarm(eswarm[k], sk.buf, sk.n, ENEMY3D[k].cap, ENEMY3D[k].glb ? 'face' : 'wob', 0, Math.PI, ENEMY3D[k].pitch ?? -0.12, true, WORLD_OBJ_VIS_DROP, k);   // 적·운석·잔해=기함 뒤(§G-26) + 시각 중심 보정(§G-38)
          else placeSwarm(eswarm[k], null, 0, ENEMY3D[k].cap);
        }
        if (swarms.drone) placeSwarm(drone, swarms.drone.buf, swarms.drone.n, DRONE_INSTANCE_MAX, 'direct', 0, 0);     // 아군: 노즈가 소실점(전진 방향)
        if (swarms.cruiser) placeSwarm(cruiser, swarms.cruiser.buf, swarms.cruiser.n, CRUISER_INSTANCE_MAX, 'direct', 0, 0);   // 실측: hero 카메라 기준 yaw 0 = 지오 +z 가 소실점 → 지오를 노즈 +z 로 로프트
        if (props && swarms.props) for (let ki = 0; ki < PICKUP_KEYS.length; ki++) {
          const k = PICKUP_KEYS[ki];
          const s = swarms.props[k];
          //  §G-38(이사님: "날아오는 모든 오브젝트 위치를 다 동일하게"): 픽업도 적과 **같은 보정**을 받는다.
          //  ⚠️발사체(SHOT_KEYS)는 여기 없다 — 포구·명중 정합이 깨지므로 제외한다.
          if (s) placeSwarm(props[k], s.buf, s.n, PROP_CAPS[k], 'spin', time, Math.PI, -0.12, true, WORLD_OBJ_VIS_DROP, k);   // 픽업=기함 뒤(수송선·크리스탈·코인·POW)
        }
        // §G-13 발사체(상시 3D) — 탄은 기함 앞 유지(발사·명중 연출)
        if (shots) for (let ki = 0; ki < SHOT_KEYS.length; ki++) {
          const k = SHOT_KEYS[ki];
          const s = swarms.props && swarms.props[k];
          placeShots(shots[k], s ? s.buf : null, s ? s.n : 0, PROP_CAPS[k], k, sq.y);
        }
      } else {
        for (let ki = 0; ki < ENEMY_KEYS.length; ki++) placeSwarm(eswarm[ENEMY_KEYS[ki]], null, 0, ENEMY3D[ENEMY_KEYS[ki]].cap);
        placeSwarm(drone, null, 0, DRONE_INSTANCE_MAX); placeSwarm(cruiser, null, 0, CRUISER_INSTANCE_MAX);
        if (props) for (let ki = 0; ki < PICKUP_KEYS.length; ki++) placeSwarm(props[PICKUP_KEYS[ki]], null, 0, PROP_CAPS[PICKUP_KEYS[ki]]);
        if (shots) for (let ki = 0; ki < SHOT_KEYS.length; ki++) placeShots(shots[SHOT_KEYS[ki]], null, 0, PROP_CAPS[SHOT_KEYS[ki]], SHOT_KEYS[ki], sq.y);
      }
      renderer.render(scene, camera);
      ctl._rendered = true;
      show(1);
      return t;
    } catch (e) {
      //  §5.1: 렌더 예외는 GPU 상태가 이미 어긋난 것으로 본다 — available 까지 내려 그 세션은 2D 로 고정.
      ctl.degraded = true; ctl.available = false; ctl.reason = 'render-exception:' + String(e && e.message || e);
      try { console.warn('[chase3d] 렌더 예외 → 이 세션은 2D 로 고정:', e); } catch (x) {}
      hide(); return 0;
    }
  }
  function show(a) { canvas3d.style.opacity = String(a); canvas3d.style.visibility = 'visible'; }
  /** §G-28 P0-2: 3D 를 숨기거나 끝낼 때 **일회성 연출을 즉시 없앤다.**
   *  프레임이 안 돌면 `_lanceT` 가 줄지 않는다 — 줌 아웃·컷신·사망으로 1초 쉬었다 돌아오면
   *  지난 차지 빔이 그대로 다시 보였다(3D 는 게임 상태가 아니라 **표현**이므로 이어붙이지 않는 게 맞다).
   *  `_prevCharge` 를 0 으로 두는 것도 필수다 — 복귀 첫 프레임에 "충전 중 → 0" 으로 읽혀
   *  쏘지도 않은 발사 에지가 만들어졌다. */
  function clearTransientFx() {
    _lanceT = 0; _prevCharge = 0; _shakeT = 0;
    lanceRig.visible = false;
    if (ctl.lanceScreen) ctl.lanceScreen.active = false;
    lanceCore.material.opacity = 0; lanceGlow.material.opacity = 0;
    chargeRig.visible = false;
    chargeCore.material.opacity = 0; chargeHalo.material.opacity = 0;
    chargeRingA.material.opacity = 0; chargeRingB.material.opacity = 0;
    chargeRingA.visible = false; chargeRingB.visible = false;
    //  §G-46 6차(이사 실기 "기함이 지나간 뒤에도 레이저 발사 위치의 빛이 남는다 · 파괴됐을 때도").
    //   ⚠️여기서 **기함에 붙은 리그를 전부** 내린다. 지금까지는 랜스·차지만 지웠고
    //    제트·갑판 포탑·선체 홀더는 `visible=true` + `count>0` 인 채로 남았다(사망 상태 재현으로 실측:
    //    Cone×4 · Cone×4 · Sphere×4 · 포탑 4 · 선체 메시 9 가 그대로 살아 있었다).
    //   캔버스를 숨기는 것만으로는 부족하다 — 다음에 캔버스가 다시 보이는 순간 **옛 자세 그대로** 한 프레임
    //   튀어나온다. 상태를 남기지 않는 것이 유일하게 안전한 방법이다.
    jetRig.visible = false;
    for (const im of [jetShell, jetCore, jetGlow]) { im.count = 0; im.visible = false; }
    mountRig.visible = false;
    for (const k of Object.keys(mounts3)) for (const m of mounts3[k].meshes) { m.count = 0; m.visible = false; }
    for (const k of Object.keys(flags)) flags[k].holder.visible = false;
    //  ⚠️절차 AURORA(폴백 선체)도 내린다. GLB 홀더만 내리면 **이 배가 대신 남는다** —
    //   사망 상태 실측에서 AURORA_LOD0 메시 8개가 그대로 보이고 있었다.
    if (model && model.group) model.group.visible = false;
    ctl._flagTier = -1; ctl._mountKey = '';
    flagRig.position.set(0, 0, 0); flagRig.rotation.set(0, 0, 0);
  }
  function hide() {
    canvas3d.style.opacity = '0'; canvas3d.style.visibility = 'hidden'; ctl._rendered = false;
    clearTransientFx();
  }
  function screenXToWorldX(screenX, logicalW, logicalH, squadX, zoom) {   // API 호환(hero 입력은 RC2 — 미사용)
    return invX(makeChaseCamera(logicalW, logicalH, transitionT(zoom)), screenX, squadX);
  }
  function info() {
    const r = renderer.info;
    return {
      hero: true, t: +ctl._t.toFixed(3), zoom: +ctl._zoom.toFixed(3), available: ctl.available, degraded: ctl.degraded, reason: ctl.reason, rendered: ctl._rendered,
      calls: r.render.calls, triangles: r.render.triangles, programs: r.programs ? r.programs.length : -1,
      geometries: r.memory.geometries, textures: r.memory.textures, aurora: model ? model.stats() : null,
      ...Object.fromEntries(ENEMY_KEYS.map((k) => [k + 'Count', eswarm[k] ? eswarm[k].count : -1])),
      droneCount: drone ? drone.count : -1, cruiserCount: cruiser ? cruiser.count : -1,
      flagTier: ctl._flagTier ?? -1, debrisCount: debris ? debris.count : -1, shaking: _shakeT > 0,   // §G-8 기함 실모델·피격 연출 진단
      //  §G-28 P0-2 차지 빔 진단 — 숨김 후 잔상·포구 정합을 **실행 중에** 잴 수 있어야 검증이 성립한다.
      //   muzzle/start 는 화면(논리 px) 좌표라 둘의 거리로 "포구에서 나가는가"를 바로 잰다.
      lance: (() => {
        const d = {
          t: +_lanceT.toFixed(4), stage: _lanceStage, prevCharge: +_prevCharge.toFixed(4),
          visible: !!lanceRig.visible,
          coreOpacity: +lanceCore.material.opacity.toFixed(4),
          glowOpacity: +lanceGlow.material.opacity.toFixed(4),
          chargeVisible: !!chargeRig.visible,
        };
        try {
          const W = ctl._lastLogW || 480, H = ctl._lastLogH || 800;
          flagRig.updateMatrixWorld(true); camera.updateMatrixWorld();
          muzzleAnchor.getWorldPosition(_lnV); _lnV.project(camera);
          d.muzzleX = +((_lnV.x + 1) / 2 * W).toFixed(2);
          d.muzzleY = +((1 - _lnV.y) / 2 * H).toFixed(2);
          if (_lanceT > 0) {
            //  빔 실린더의 뒤쪽 끝 = 시작점. position 은 중점이므로 축 방향으로 절반 되돌린다.
            _lnV.set(0, 0, -0.5).applyQuaternion(lanceCore.quaternion)
              .multiplyScalar(lanceCore.scale.z).add(lanceCore.position).project(camera);
            d.startX = +((_lnV.x + 1) / 2 * W).toFixed(2);
            d.startY = +((1 - _lnV.y) / 2 * H).toFixed(2);
            d.muzzleGapPx = +Math.hypot(d.startX - d.muzzleX, d.startY - d.muzzleY).toFixed(2);
            //  끝점(화면 상단 도달 여부)
            _lnV.set(0, 0, 0.5).applyQuaternion(lanceCore.quaternion)
              .multiplyScalar(lanceCore.scale.z).add(lanceCore.position).project(camera);
            d.endY = +((1 - _lnV.y) / 2 * H).toFixed(2);
          }
        } catch (e) { d.err = String(e && e.message || e); }
        return d;
      })(),
      propCounts: props ? Object.fromEntries(PICKUP_KEYS.map((k) => [k, props[k].count])) : null,   // Codex P2: 진단이 확장 범위를 따라가게
      shotCounts: shots ? Object.fromEntries(SHOT_KEYS.map((k) => [k, shots[k].count])) : null,   // §G-13 발사체(상시 3D)
      //  §G-21 §4 준비 상태 진단 — GLB 지연·404 시 "무엇이 아직 2D 인가"를 실행 중에 확인할 수 있게 한다.
      //  §G-22 §3.1 종류별 준비 상태(진단은 프레임 경로가 아니라 호출 시에만 만든다)
      ready: {
        ...Object.fromEntries(ENEMY_KEYS.map((k) => ['enemy:' + k, ctl.ready.enemy(k)])),
        ...Object.fromEntries(PICKUP_KEYS.map((k) => ['pickup:' + k, ctl.ready.pickup(k)])),
        ...Object.fromEntries(SHOT_KEYS.map((k) => ['shot:' + k, ctl.ready.shot(k)])),
        'ally:a1': ctl.ready.ally('a1'), 'ally:a2': ctl.ready.ally('a2'),
      },
      weaponReady: { vulcan: ctl.ready.weapon('vulcan'), laser: ctl.ready.weapon('laser'), homing: ctl.ready.weapon('homing') },
      weaponGlb: { vulcan: !!mounts3.vulcan.glb, laser: !!mounts3.laser.glb, homing: !!mounts3.homing.glb },   // 절차 폴백인지 실모델인지
      prewarm: { ...ctl.prewarm },
    };
  }
  /** §G-22 §5.4 best-effort 정리. **한 자원이 throw 해도 나머지 정리를 계속한다** —
   *  G21 은 첫 예외에서 중단돼 뒤쪽 자원(스웜·기함·환경맵·renderer)이 통째로 새고,
   *  available=false 도 세워지지 않아 상태 계약까지 어긋났다. 순서는 아래 주석대로 고정한다.
   *  자원별 오류는 최초 1회만 진단하고 게임으로 throw 하지 않는다. finally 가 상태·화면·참조를 반드시 마감한다. */
  let _disposeWarned = false;
  function dispose() {
    const step = (label, fn) => {
      try { fn(); } catch (e) {
        if (!_disposeWarned) { _disposeWarned = true; try { console.warn('[chase3d] dispose 부분 실패(계속 진행):', label, (e && e.message) || e); } catch (x) {} }
      }
    };
    const disposeSw = (sw) => { if (!sw) return; for (const im of sw.meshes) step('mesh', () => { im.geometry.dispose(); if (im.material.map) im.material.map.dispose(); im.material.dispose(); im.dispose && im.dispose(); }); };
    step('transient', clearTransientFx);   // §G-28 P0-2: 종료 경계에서도 일회성 연출을 남기지 않는다
    try {
      // ① 리스너 → ② 절차 기함 모델 → ③ 스웜(적·아군·픽업·발사체·포탑) → ④ 기함 GLB 홀더 → ⑤ 파편 → ⑥ 환경맵 → ⑦ renderer
      step('listeners', () => { canvas3d.removeEventListener('webglcontextlost', onLost); canvas3d.removeEventListener('webglcontextrestored', onRestored); });
      step('model', () => { if (model) model.dispose(); });
      for (const k of ENEMY_KEYS) disposeSw(eswarm[k]);
      disposeSw(drone); disposeSw(cruiser);
      if (props) for (const k of PICKUP_KEYS) disposeSw(props[k]);
      if (shots) for (const k of SHOT_KEYS) disposeSw(shots[k]);
      for (const k of Object.keys(mounts3)) disposeSw(mounts3[k]);
      for (const k of Object.keys(eswarm)) eswarm[k] = null;
      for (const k of Object.keys(flags)) step('flag:' + k, () => flags[k].holder.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } }));
      step('debris', () => { debris.geometry.dispose(); debris.material.dispose(); debris.dispose && debris.dispose(); });
      //  차지 연출 메시(집속 코어·헤일로·발사 빔) — 스웜이 아니라 개별 Mesh 라 위 disposeSw 가 닿지 않는다.
      //  §G-28 P0-2: lanceCore·lanceGlow 는 **같은 lanceGeo 를 공유**한다 — 지오메트리는 한 번만 버린다.
      step('charge', () => {
        chargeCore.geometry.dispose(); chargeCore.material.dispose();
        chargeHalo.geometry.dispose(); chargeHalo.material.dispose();
        lanceGeo.dispose();
        lanceCore.material.dispose(); lanceGlow.material.dispose();
      });
      step('envRT', () => { if (envRT) envRT.dispose(); });
      step('renderer', () => renderer.dispose());
    } finally {
      //  무슨 일이 있어도 상태·화면·참조는 마감한다 — main 이 이걸 보고 2D 로 확정 복귀한다.
      drone = null; cruiser = null; props = null; shots = null;
      ctl.available = false;
      try { hide(); } catch (e) {}
    }
  }
  function forceContextLoss() {
    try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_lose_context'); if (ext) { ext.loseContext(); return true; } } catch {}
    return false;
  }
  //  §G-16/§G-21 §4.1 / §G-22 §3.1 모델 준비 여부 — main 이 이걸 보고 "3D 로 올릴지"를 정한다.
  //  준비 안 된 종을 올렸다고 표시(_in3dMap 스탬프)하면 2D 도 그 개체를 스킵해 **어디에도 안 그려진다**.
  //  ⚠️G21 은 키 하나로 순차 조회했는데, `ebullet` 처럼 두 목록에 같은 이름이 있으면 잘못된 스웜을 고를 수 있었다.
  //   그래서 **종류(category)를 명시하는 API** 로 바꿨다 — 이름이 겹쳐도 틀린 스웜을 고를 수 없다.
  //  props/shots 초기화가 통째로 실패해 null 이어도 false 가 나와 2D 가 그대로 남는다.
  const _hasMeshes = (sw) => !!(sw && sw.meshes && sw.meshes.length);
  ctl.ready = {
    enemy: (k) => _hasMeshes(eswarm[k]),                       // 적 12 + 보스 6 + 위험물 4
    pickup: (k) => !!props && _hasMeshes(props[k]),            // 크리스탈·코인·POW·수송선·캡슐
    shot: (k) => !!shots && _hasMeshes(shots[k]),              // 발칸탄·적탄·미사일·레이저
    ally: (k) => (k === 'a1' ? _hasMeshes(drone) : k === 'a2' ? _hasMeshes(cruiser) : false),
    weapon: (k) => !!(mounts3[k] && mounts3[k].ok && mounts3[k].meshes.length),
    //  §G-34 후속: **이 등급의 기함 GLB** 가 실제로 올라왔는가.
    //  ⚠️렌더러가 준비된 것(`available`)과 기함 모델이 온 것은 다르다. GLB 는 그 뒤에 비동기로 온다.
    //   그 사이에는 절차 AURORA 폴백이 그려지는데, 낮은 등급(EMBER)에서 그건 **다른 배의 큰 모델**이라
    //   확대하는 순간 잠깐 스쳐 보인다(2026-08-11 이사님 제보). main 은 이 값이 true 가 되기 전까지
    //   2D 기함을 유지해 그 스침을 없앤다 — 잘못된 모델을 보여주느니 2D 가 정확하다.
    flagship: (tier) => !!(flags[tier] && flags[tier].ok),
    //  §G-35 P0-4(Codex 6차 §3): 기함은 **선체 + 선택 무기**를 묶어 판정한다.
    //   선체만 준비된 순간에 3D 로 넘기면, 2D 무기 리그는 기함과 함께 숨는데 3D 갑판은 비어 있다
    //   → 그 프레임 동안 **무기가 어디에도 없다**. 표시 묶음은 원자적이어야 한다.
    //  ⚠️`weapon(wKey)` 는 절차 폴백 포탑이 붙어도 true 다(디자인에 맞는 표현이면 GLB 를 기다릴 이유 없음).
    //   기함 선체만은 예외로 실제 티어 GLB 를 기다린다 — 폴백(AURORA)이 **다른 배**라서다.
    flagshipBundle: (tier, wKey) => isFlagshipBundleReady(flags[tier], mounts3[wKey]),
  };
  //  개발 진단(§3.1): 같은 키가 두 종류에 실제로 등록되면 즉시 알 수 있게 한다. 등록표가 바뀌면 바로 걸린다.
  try {
    const reg = { enemy: Object.keys(eswarm), pickup: props ? Object.keys(props) : [], shot: shots ? Object.keys(shots) : [] };
    const seen = new Map();
    for (const cat of Object.keys(reg)) for (const k of reg[cat]) {
      if (seen.has(k)) console.error('[chase3d] 준비표 키 중복 등록:', k, seen.get(k), '↔', cat);
      else seen.set(k, cat);
    }
  } catch (e) {}
  /**
   * §G-46 — 적 격파를 3D 연출 큐에 넣는다. main 의 중앙 킬 알림이 부른다.
   *  @param sx,sy 투영된 화면 좌표(적이 3D 로 그려지던 그 좌표계)
   *  @param px    화면 전장(px) — 깊이 환산에 쓴다. 큰 적이 크게 터진다
   *  @param key   3D 종류 키(b1·h1·crystal…). 파편 색을 여기서 고른다 — 모르면 회색
   *  ⚠️여기서 파편을 만들지 않는다. 카메라가 이번 프레임 값으로 확정되기 전이라
   *   좌표 변환이 한 프레임 어긋난다 — frame() 안에서 변환한다.
   */
  ctl.killBurst = (sx, sy, px, key) => {
    if (_killQ.length >= KILL_Q_MAX) return;
    _killQ.push({ sx, sy, px: px > 0 ? px : 40, key: key || null });
  };
  ctl.frame = frame; ctl.prewarmRun = prewarm; ctl.screenXToWorldX = screenXToWorldX; ctl.info = info;
  ctl.dispose = dispose; ctl.forceContextLoss = forceContextLoss; ctl.renderer = renderer; ctl.model = model; ctl.scene = { scene, camera };
  //  §G-39 Task 8 테스트 전용 — 배치된 적 메시를 들여다본다(다중 파트·instanceColor 실행 검증용).
  //   production 소비자 없음(main.js 는 읽지 않는다) — 순수 진단 seam.
  ctl.debugEnemyMeshes = (k) => (eswarm[k] ? eswarm[k].meshes : []);
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

  // 컨텍스트 손실 → RC2 폴백. 리스너는 여기서 1회만 등록(§9.4 중복 금지).
  //  §G-22 §7: hero 와 **같은 계약**을 쓴다 — 개발 장면이라는 이유로 자동 복구를 남기지 않는다.
  //  (손실 이후의 GPU 객체는 무효라 재개하면 잘못된 화면이 나온다. 그 세션은 2D 고정.)
  const onLost = (ev) => { ev.preventDefault(); ctl.degraded = true; ctl.available = false; ctl.reason = 'context-lost'; hide(); };
  const onRestored = () => { ctl.reason = 'context-lost-restored-not-resumed'; };
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
