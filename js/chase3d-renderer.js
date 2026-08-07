// ── Neon Fleet 실제 3D — RC2 상태를 읽어 3D 장면을 동기화·렌더링하는 오케스트레이터 ──
//  게임의 진실은 계속 2D(§3.1). 이 모듈은 매 프레임 살아있는 world 를 "읽기만" 해서 3D 로 보여준다.
//  실패·컨텍스트 손실 시 available=false 로 떨어뜨려 main 이 RC2 로 복귀하게 한다(§3.3). `?chase3d=1`에서만 동적 import(§3.2).
//  Opus5 hero 하이브리드(§9): opts.hero=true 면 3D 레이어는 "AURORA 기함 1척"만 — 적·이펙트·드론은 main 이 RC2 로 유지.
//  구 전체-3D 경로는 개발 fallback(chase3dTest 레거시 장면)으로 보존(§9.1), hero 에선 사용하지 않음.
import * as THREE from './vendor/three.module.js';
import { createChaseScene } from './chase3d-scene.js';
import { makeChaseCamera, buildSnapshot, computeSceneModel, screenXToWorldX as invX, CAMERA, SCALE_Z } from './chase3d-mapping.js';
import { transitionT, shouldRender3D, QUALITY } from './chase3d-config.js';
import { createAuroraModel } from './chase3d-aurora-model.js';
import { forgeEnvEquirect } from './chase3d-aurora-materials.js';
import { createBillboardParts } from './chase3d-billboards.js';
import { loadEnemyGlbParts } from './chase3d-glb.js';
import { createDroneGeometry, createCruiserGeometry, createDroneMaterials, createCruiserMaterials, DRONE_INSTANCE_MAX, CRUISER_INSTANCE_MAX } from './chase3d-allies.js';
import { PROP_KEYS, PROP_CAPS, PROP_BASE_COLOR, createPropGeometry, createPropMaterial, createProjMaterial, createPickupParts, createEnemyBulletParts } from './chase3d-props.js';
import { ENEMY3D, ALLY3D, PICKUP3D, FLAG3D, WEAPON3D, MOUNT_POINTS, SHOT_KEYS, SHOT_LEN, SHOT_W, SHOT_MIN_PX } from './chase3d-prop-defs.js';
import { BAL } from './balance.js';   // 순수 수치 표(로직 없음) — 차지 만충 시간 환산에만 읽는다(§3.1 읽기 전용)

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

/** 접근성: 모션 최소화 사용자는 피격 파편·흔들림을 받지 않는다(main 의 동명 헬퍼와 같은 계약). */
function prefersReducedMotion3D() {
  try { return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches; }
  catch { return false; }
}

// ── hero: AURORA 전용 씬 (색관리 §7.3 + IBL + 프리웜 §10.2) ──
function createHero3D(canvas3d, opts = {}) {
  const ctl = {
    available: false, degraded: false, hero: true, reason: '', THREE,
    _t: 0, _zoom: 1, _lastW: 0, _lastH: 0, _lastDpr: 0, _rendered: false,
    prewarm: { done: false, programsBefore: -1, programsAfter: -1, ms: 0 },
  };
  let renderer, model, scene, camera, envRT, flagRig;
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
    // §G-5 얼굴 보조광(이사): 실모델 적의 얼굴은 face 모드로 항상 카메라를 향한다 →
    //  카메라 쪽에서 전방(+z)으로 쏘는 디렉셔널 하나로 전 적의 얼굴을 밝힌다(개체별 라이트 불요).
    const faceLight = new THREE.DirectionalLight(0xffe8dc, 1.15);
    faceLight.position.set(0, 2.5, -9); faceLight.target.position.set(0, 0, 10);
    scene.add(faceLight, faceLight.target);
    scene.add(key, fill, rim, hemi, sternAux);
    // 모바일 판정 = 세로(portrait)·협폭 창(§9.3 DPR 제한과 동일 축). 데스크톱 800×450 같은 가로 소형창은 데스크톱.
    ctl._mobile = (typeof window !== 'undefined' && window.innerHeight > window.innerWidth && window.innerWidth <= 500);
    model = createAuroraModel(THREE, { seed: 7, mobile: ctl._mobile, lods: [0, 1] });
    // §G-8 기함 리그: 절차 AURORA + 등급별 GLB 홀더를 한 리그에 담아 피격 흔들림을 공통 적용
    flagRig = new THREE.Group();
    flagRig.add(model.group);
    scene.add(flagRig);
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
  function makeGlbSwarm(key, def, fallback) {
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
      .catch(() => { try { attach(fallback ? fallback() : createBillboardParts(THREE, key)); } catch (e) {} });
    return sw;
  }
  const eswarm = {};
  for (const k of Object.keys(ENEMY3D)) {
    const def = ENEMY3D[k];
    eswarm[k] = def.glb ? makeGlbSwarm(k, def) : makeBillboardSwarm(k, def.cap);
  }
  // 아군 호위(§G-1 위계: 기함 > 순양함 > 드론) — 노즈가 +Z(소실점 쪽) = yawBase 0 으로 배치.
  //  §G-6: 이사 제작 실모델(GLB) 우선, 로드 실패 시 기존 디지타이즈 조형 폴백.
  function allyFallbackParts(makeGeo, makeMats, seed) {
    const geo = makeGeo(THREE, { lod: ctl._mobile ? 1 : 0 });
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
        _sQ2 = new THREE.Quaternion(), _sAxisZ = new THREE.Vector3(0, 0, 1);
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
      .catch(() => { /* 실패 = 해당 티어만 절차 AURORA 유지 */ });
  }
  // ── §G-12 기함 무기 실모델(이사 VARCO): 갑판 포탑 3종 + 기수 차지 포구 ──
  //  포탑은 2D drawWeaponRig 과 같은 장착점·같은 개수 규칙을 쓴다(표시만 3D — 판정·규칙 무관).
  //  종당 InstancedMesh 1(파트 1) → 한 무기만 보이므로 드로우 +1.
  const mountRig = new THREE.Group();
  mountRig.visible = false;
  flagRig.add(mountRig);
  const mounts3 = {};
  for (const k of ['vulcan', 'laser', 'homing']) {
    const rec = { meshes: [], ok: false };
    mounts3[k] = rec;
    loadEnemyGlbParts(THREE, WEAPON3D[k].glb, WEAPON3D[k])
      .then((parts) => {
        for (const p of parts) {
          const im = new THREE.InstancedMesh(p.geo, p.mat, WEAPON3D[k].cap);
          im.count = 0; im.frustumCulled = false; im.visible = false;
          mountRig.add(im); rec.meshes.push(im);
        }
        rec.ok = true;
      })
      .catch(() => { /* 실패 = 해당 무기만 포탑 미표시(기함 본체는 그대로) */ });
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
  //  발사 빔: 기수(+z)로 뻗는 원통. 길이 1 로 만들고 scale.z 로 늘린다(회전 없이 축 정렬).
  const lanceGeo = new THREE.CylinderGeometry(1, 1, 1, 18, 1, true);
  lanceGeo.rotateX(Math.PI / 2);   // 기본 y축 → +z 축
  const lanceCore = new THREE.Mesh(lanceGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const lanceGlow = new THREE.Mesh(lanceGeo, new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  const chargeRig = new THREE.Group();
  chargeRig.add(chargeCore, chargeHalo, lanceCore, lanceGlow);
  chargeRig.visible = false;
  flagRig.add(chargeRig);
  //  §G-12 차지 포구(W5): 충전·발사 동안만 기수에 전개된다 — 상시 표시하면 기함 실루엣이 바뀐다.
  //  코어보다 살짝 뒤에 두어 집속 구체가 포구 입에서 자라는 것처럼 보이게 한다.
  const muzzleRig = new THREE.Group();
  muzzleRig.visible = false;
  chargeRig.add(muzzleRig);
  loadEnemyGlbParts(THREE, WEAPON3D.muzzle.glb, WEAPON3D.muzzle)
    .then((parts) => { for (const p of parts) muzzleRig.add(new THREE.Mesh(p.geo, p.mat)); muzzleRig.visible = true; })
    .catch(() => { /* 실패 = 기존 코어·헤일로만 */ });
  let _lanceT = 0, _lanceStage = 1, _prevCharge = 0;

  const DEBRIS_MAX = 16;
  const debris = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.30, 0.08, 0.44),
    new THREE.MeshStandardMaterial({ color: 0xe3e6ea, roughness: 0.55, metalness: 0.12, emissive: 0x17191d }),
    DEBRIS_MAX);
  debris.count = 0; debris.frustumCulled = false; scene.add(debris);
  const _deb = [];
  let _shakeT = 0, _prevFlash = 0, _lcg = 7;
  const _rnd = () => ((_lcg = (_lcg * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
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
      //  §G-15: 발칸·레이저는 원본 그림(주황 로켓·크리스탈)을 입히지 않는다 — 2D 는 진화색 단색이라 색이 어긋났다.
      const im = new THREE.InstancedMesh(createPropGeometry(THREE, k), createProjMaterial(THREE, k, false), PROP_CAPS[k]);
      im.count = 0; im.frustumCulled = false;
      _sCol.setHex(0xffffff);   // 실제 색은 매 프레임 instanceColor(2D 탄색)로 들어온다
      for (let i = 0; i < PROP_CAPS[k]; i++) im.setColorAt(i, _sCol);
      scene.add(im);
      shots[k] = { meshes: [im], count: 0, colored: true };
    }
  } catch (e) { shots = null; /* 실패는 비치명 — 수집 스탬프가 없으면 2D 가 그대로 그린다 */ }

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
   *  yawBase: π=전면이 카메라(적·소품 기본) / 0=노즈가 소실점 쪽(아군 — 위로 비행).
   *  behindFlag(이사 "적·수송선이 기함 위로 지나가는 느낌"): 적·픽업은 깊이 하한을 기함 기수 뒤로 밀어
   *  겹침 구간에서 기함이 개체를 가리게 한다(정면에 부딪히거나 밑을 스치는 그림). 광선상 이동+스케일 보정이라
   *  화면 위치·크기는 불변, [6,FB) → [FB,FB+1.5) 단조 리매핑이라 개체끼리의 앞뒤 순서도 유지.
   *  아군·아군탄(기함에서 발사)·적탄(기함에 명중)은 기함 앞이 맞으므로 제외. */
  const FLAG_NOSE_CLEAR = 2.8;   // 기함 원점→기수 끝 시선깊이 실측 +2.2(전장 4.78, boxZ +2.28) + 여유
  function placeSwarm(sw, buf, n, cap, mode = 'wob', time = 0, yawBase = Math.PI, pitchBase = -0.12, behindFlag = false) {
    if (!sw) return;
    const count = Math.min(n | 0, cap);
    const fpx = (ctl._lastLogH * 0.5) / Math.tan(camera.fov * Math.PI / 360);   // 논리px 초점거리
    camera.getWorldDirection(_sFwd);
    const flagBehind = -camera.position.dot(_sFwd) + FLAG_NOSE_CLEAR;   // 기함(원점) 시선깊이 + 기수 여유 — 매 프레임 카메라 추종
    for (let i = 0; i < count; i++) {
      const o = buf[i];
      _sV.set((o.sx / ctl._lastLogW) * 2 - 1, -((o.sy / ctl._lastLogH) * 2 - 1), 0.5).unproject(camera);
      _sDir.subVectors(_sV, camera.position).normalize();
      let depth = Math.min(60, Math.max(6, fpx / Math.max(1e-3, o.px)));        // 전장 1.0 모델 기준
      if (behindFlag && depth < flagBehind && flagBehind > 6.5) depth = flagBehind + ((depth - 6) / (flagBehind - 6)) * 1.5;
      const scl = (o.px * depth) / fpx;                                         // 클램프 보정 → 화면 전장 = o.px 유지
      _sPos.copy(camera.position).addScaledVector(_sDir, depth / Math.max(1e-4, _sDir.dot(_sFwd)));
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
    const fpx = (ctl._lastLogH * 0.5) / Math.tan(camera.fov * Math.PI / 360);   // 논리px 초점거리
    camera.getWorldDirection(_sFwd);
    for (let i = 0; i < count; i++) {
      const o = buf[i];
      _sV.set((o.sx / ctl._lastLogW) * 2 - 1, -((o.sy / ctl._lastLogH) * 2 - 1), 0.5).unproject(camera);
      _sDir.subVectors(_sV, camera.position).normalize();
      // 시선 깊이 = 탄이 기함보다 얼마나 앞서 나갔는지(월드) + 카메라가 기함 뒤에 있는 거리
      const depth = Math.min(80, Math.max(3.5, (sqy - o.wy) * SCALE_Z + CAMERA.chase.dist));
      _sPos.copy(camera.position).addScaledVector(_sDir, depth / Math.max(1e-4, _sDir.dot(_sFwd)));
      //  노즈는 −z(loftProjectile "노즈(−z)=그림 상단", 미사일 GLB 도 rotY 0 으로 통일) → π 로 뒤집는다.
      //  3D X 축은 화면 좌우와 반대(추적 카메라 lookAt 기저 실측)라 진행각 부호도 뒤집는다.
      //  아군탄 wob≈0 → +z(소실점으로), 적탄 wob≈π → −z(카메라로), 퍼짐탄은 실제 벌어진 방향 그대로.
      _sEul.set(0, Math.PI - (o.wob || 0), 0);
      _sQ.setFromEuler(_sEul);
      //  화면 최소 전장 보정(§G-15 이사 "탄이 화면 끝까지 안 가고 중간에서 사라진다"): 2D 의 KIND_SCALE.minRel 과
      //  같은 성격의 하한. 진짜 원근이라 멀어지면 무한히 작아져 시야에서 먼저 지워졌다.
      //  §G-20 종류별 크기 배율(o.mul) — 드론 예광탄은 기함 발칸보다 작다(2D 위계 계승).
      //   최소 화면 크기 하한은 배율까지 반영한 실제 크기(len×mul) 기준으로 재야 위계가 안 뒤집힌다.
      const mul = o.mul || 1;
      const k2 = minPx > 0 ? Math.max(1, (minPx * depth) / (fpx * len * mul)) : 1;
      const m2 = mul * k2;
      _sM.compose(_sPos, _sQ, _sScl.set(len * wRel * m2, len * wRel * m2, len * m2));
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
      // §G-8 등급 스왑(이사 "B 로 하자"): squad.tier 의 실모델이 준비됐으면 그것만, 아니면 절차 AURORA 유지.
      //  절차 모델의 bank·bob 은 model.update 가 담당 — GLB 홀더는 같은 bank 를 롤로 직접 적용.
      const tier = Math.max(0, Math.min(5, sq.tier | 0));
      const useGlb = flags[tier] && flags[tier].ok;
      for (const k of Object.keys(flags)) flags[k].holder.visible = (useGlb && +k === tier);
      model.group.visible = !useGlb;
      if (useGlb) flags[tier].holder.rotation.z = bank;
      ctl._flagTier = useGlb ? tier : -1;
      // §G-12 갑판 포탑: 현재 무기 1종을 장착점 수만큼(2D 와 동일 규칙) 세운다 — 실모델 기함일 때만.
      const wKey = sq.weapon === 'laser' ? 'laser' : sq.weapon === 'homing' ? 'homing' : 'vulcan';
      mountRig.visible = useGlb && placeMounts(tier, wKey, sq.weaponLv | 0, flags[tier].box, FLAG_LEN * (TIER_SCALE[tier] ?? 1));
      mountRig.rotation.z = bank;
      ctl._mountKey = mountRig.visible ? wKey : '';
      // 프레임 간격(차지 감쇠·파편 적분 공용) — time 은 초 단위 누적
      const dt = Math.min(0.05, Math.max(0, time - (ctl._prevTime || time)));
      ctl._prevTime = time;
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
      } else {
        chargeCore.material.opacity = 0; chargeHalo.material.opacity = 0;
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
        const len = 110, rad = (0.34 + 0.24 * p) * (_lanceStage >= 3 ? 1.5 : 1);   // 2D 는 화면 끝까지 뻗는다 — 소실점까지 닿게
        for (const [m, r, o] of [[lanceCore, rad * 0.42, 0.9 * p], [lanceGlow, rad, 0.5 * p]]) {
          m.position.set(0, 0.35, NOSE_Z + len / 2);
          m.scale.set(r, r, len);
          m.material.opacity = o;
        }
        if (_lanceStage >= 3) lanceGlow.material.color.setHex(0xffd166); else lanceGlow.material.color.setHex(0x66e0ff);
      } else {
        lanceCore.material.opacity = 0; lanceGlow.material.opacity = 0;
      }
      chargeRig.visible = chg > 0 || _lanceT > 0;
      // §G-8 피격 연출(이사: 섬광 대신 "부품 이탈 + 기체 흔들림") — flash 상승 에지에서 발화
      const fl = sq.flash || 0;
      if (fl > _prevFlash + 0.1 && !prefersReducedMotion3D()) {
        _shakeT = 0.42;
        const n = Math.min(7, DEBRIS_MAX - _deb.length);
        for (let i = 0; i < n; i++) {
          const a = _rnd() * Math.PI * 2, sp = 1.6 + _rnd() * 2.4;
          //  기함 전장 FLAG_LEN(≈4.8) 기준 — 기수 앞·갑판 위에서 튀어나와야 함체에 파묻히지 않는다(실측).
          _deb.push({
            x: (_rnd() - 0.5) * 2.4, y: 0.5 + _rnd() * 0.9, z: 1.6 + _rnd() * 1.2,
            vx: Math.cos(a) * sp, vy: 1.6 + _rnd() * 2.4, vz: 1.6 + _rnd() * 3.0,     // +z=카메라 쪽(뒤로 흩어짐)
            rx: (_rnd() - 0.5) * 9, ry: (_rnd() - 0.5) * 9, rz: (_rnd() - 0.5) * 9,
            ax: _rnd() * 6.28, ay: _rnd() * 6.28, az: _rnd() * 6.28,
            life: 0.85 + _rnd() * 0.45, t: 0, s: 1.1 + _rnd() * 1.1,
          });
        }
      }
      _prevFlash = fl;
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
        _sM.compose(_sPos.set(d.x, d.y, d.z), _sQ, _sScl.setScalar(d.s * (0.45 + k * 0.55)));
        debris.setMatrixAt(dn++, _sM);
        _deb[dn - 1] = d;   // 살아있는 것만 앞으로 압축(별도 배열 할당 없이)
      }
      _deb.length = dn;
      debris.count = dn;
      if (dn) debris.instanceMatrix.needsUpdate = true;
      // 기체 흔들림: 감쇠 진동(피격 방향 무관 — 충격 직후 크게, 0.42s 안에 잦아든다). 카메라는 건드리지 않는다(멀미 방지).
      if (_shakeT > 0) {
        _shakeT = Math.max(0, _shakeT - dt);
        const k = _shakeT / 0.42, w = time * 46;
        flagRig.position.set(Math.sin(w) * 0.16 * k, Math.sin(w * 1.7 + 1.1) * 0.11 * k, 0);
        flagRig.rotation.z = Math.sin(w * 1.3 + 0.6) * 0.09 * k;
        flagRig.rotation.x = Math.sin(w * 0.9) * 0.05 * k;
      } else if (flagRig.position.x !== 0 || flagRig.rotation.z !== 0) {
        flagRig.position.set(0, 0, 0); flagRig.rotation.set(0, 0, 0);
      }
      // 실전 스웜(크리처+소품) — t≥0.5 에서만 이 지점에 도달 = 2D 스킵과 같은 하드 컷
      if (swarms) {
        for (const k of Object.keys(ENEMY3D)) {
          const sk = swarms[k];
          if (sk) placeSwarm(eswarm[k], sk.buf, sk.n, ENEMY3D[k].cap, ENEMY3D[k].glb ? 'face' : 'wob', 0, Math.PI, ENEMY3D[k].pitch ?? -0.12, true);   // 적=기함 뒤(이사: "위로 지나감" 교정)
          else placeSwarm(eswarm[k], null, 0, ENEMY3D[k].cap);
        }
        if (swarms.drone) placeSwarm(drone, swarms.drone.buf, swarms.drone.n, DRONE_INSTANCE_MAX, 'direct', 0, 0);     // 아군: 노즈가 소실점(전진 방향)
        if (swarms.cruiser) placeSwarm(cruiser, swarms.cruiser.buf, swarms.cruiser.n, CRUISER_INSTANCE_MAX, 'direct', 0, 0);   // 실측: hero 카메라 기준 yaw 0 = 지오 +z 가 소실점 → 지오를 노즈 +z 로 로프트
        if (props && swarms.props) for (const k of PROP_KEYS) {
          if (SHOT_KEYS.includes(k)) continue;   // 발사체는 아래 placeShots
          const s = swarms.props[k];
          if (s) placeSwarm(props[k], s.buf, s.n, PROP_CAPS[k], 'spin', time, Math.PI, -0.12, true);   // 픽업=기함 뒤(수송선·크리스탈)
        }
        // §G-13 발사체(상시 3D) — 탄은 기함 앞 유지(발사·명중 연출)
        if (shots) for (const k of SHOT_KEYS) {
          const s = swarms.props && swarms.props[k];
          placeShots(shots[k], s ? s.buf : null, s ? s.n : 0, PROP_CAPS[k], k, sq.y);
        }
      } else {
        for (const k of Object.keys(ENEMY3D)) placeSwarm(eswarm[k], null, 0, ENEMY3D[k].cap);
        placeSwarm(drone, null, 0, DRONE_INSTANCE_MAX); placeSwarm(cruiser, null, 0, CRUISER_INSTANCE_MAX);
        if (props) for (const k of PROP_KEYS) { if (!SHOT_KEYS.includes(k)) placeSwarm(props[k], null, 0, PROP_CAPS[k]); }
        if (shots) for (const k of SHOT_KEYS) placeShots(shots[k], null, 0, PROP_CAPS[k], k, sq.y);
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
      flagTier: ctl._flagTier ?? -1, debrisCount: debris ? debris.count : -1, shaking: _shakeT > 0,   // §G-8 기함 실모델·피격 연출 진단
      propCounts: props ? Object.fromEntries(PROP_KEYS.filter((k) => !SHOT_KEYS.includes(k)).map((k) => [k, props[k].count])) : null,   // Codex P2: 진단이 확장 범위를 따라가게
      shotCounts: shots ? Object.fromEntries(SHOT_KEYS.map((k) => [k, shots[k].count])) : null,   // §G-13 발사체(상시 3D)
      prewarm: { ...ctl.prewarm },
    };
  }
  function dispose() {
    try { canvas3d.removeEventListener('webglcontextlost', onLost); canvas3d.removeEventListener('webglcontextrestored', onRestored); } catch {}
    if (model) model.dispose();
    for (const sw of [...Object.values(eswarm), drone, cruiser]) if (sw) for (const im of sw.meshes) { im.geometry.dispose(); if (im.material.map) im.material.map.dispose(); im.material.dispose(); im.dispose && im.dispose(); }
    const disposeSw = (sw) => { if (!sw) return; for (const im of sw.meshes) { im.geometry.dispose(); if (im.material.map) im.material.map.dispose(); im.material.dispose(); im.dispose && im.dispose(); } };
    if (props) for (const k of PROP_KEYS) { if (!SHOT_KEYS.includes(k)) disposeSw(props[k]); }
    if (shots) for (const k of SHOT_KEYS) disposeSw(shots[k]);
    for (const k of Object.keys(eswarm)) eswarm[k] = null;
    for (const k of Object.keys(flags)) flags[k].holder.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (o.material.map) o.material.map.dispose(); o.material.dispose(); } });
    debris.geometry.dispose(); debris.material.dispose(); debris.dispose && debris.dispose();
    drone = null; cruiser = null; props = null; shots = null;
    if (envRT) envRT.dispose();
    renderer.dispose();
    ctl.available = false;
  }
  function forceContextLoss() {
    try { const gl = renderer.getContext(); const ext = gl.getExtension('WEBGL_lose_context'); if (ext) { ext.loseContext(); return true; } } catch {}
    return false;
  }
  //  §G-16 모델 준비 여부(비동기 GLB) — main 이 이걸 보고 수집할지 정한다. 모델이 없는 종을 3D 로 올렸다고
  //  표시해 버리면 2D 도 스킵돼 개체가 통째로 사라진다. 준비 안 된 종은 기존 2D 를 그대로 쓴다.
  ctl.swarmReady = (k) => !!(eswarm[k] && eswarm[k].meshes && eswarm[k].meshes.length);
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
