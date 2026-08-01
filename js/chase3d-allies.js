// ── 아군 호위 3D: 드론(A1) + 순양함(A2) — 이사 §G-1 "순양함↔드론 차별화, 드론 단순화" ──
//  구 소품 기각 교훈: 원본 스프라이트와 무관한 창작 금지 → 크리처 파이프라인과 동일하게
//  원본 알파 디지타이즈(assets/styleC/A1.png·A2.png → tests/fixtures/allies-planform.json)에서
//  뽑은 64행 반폭 프로파일을 단일 진실로 로프트한다.
//  위계 계약: 기함 AURORA(금 트림) > 순양함(은 패널 함선) > 드론(무패널 델타 셔틀).
//  전장 1.0 정규화(placeSwarm 계약), 결정적(난수 없음), THREE 주입(Node 검증 가능).
import { mergeGeos } from './chase3d-aurora-geometry.js';

export const DRONE_INSTANCE_MAX = 60;    // BAL.squad.drawCap 과 동일(초과분은 기존 2D 무리 표기)
export const CRUISER_INSTANCE_MAX = 10;  // 순양함+호위기 슬롯 상한

// 원본 A1.png(123×123, 콘텐츠 60×67, aspect 0.8955) 64행 주 런 반폭 — 위 뾰족 코쿤 → 델타 날개(최대 행 43~46) → 테일.
export const A1_HALF = [0.134, 0.134, 0.217, 0.233, 0.266, 0.283, 0.3, 0.317, 0.334, 0.35, 0.366, 0.383, 0.4, 0.417, 0.417, 0.433, 0.433, 0.45, 0.45, 0.483, 0.517, 0.55, 0.567, 0.567, 0.567, 0.567, 0.567, 0.567, 0.567, 0.534, 0.55, 0.6, 0.65, 0.7, 0.734, 0.766, 0.8, 0.85, 0.883, 0.917, 0.95, 0.95, 0.966, 0.983, 0.983, 0.983, 0.983, 0.966, 0.966, 0.966, 0.966, 0.95, 0.933, 0.917, 0.633, 0.334, 0.317, 0.3, 0.283, 0.266, 0.233, 0.233, 0.183, 0.084];
export const A1_ASPECT = 0.8955;

// 원본 A2.png(104×122, 콘텐츠 89×106, aspect 0.8396) 64행 주 런 반폭 — 노즈 → 어깨(행 20~22) → 포드 합류 구간은 0.70 캡(포드는 별도 지오).
export const A2_HALF = [0.168, 0.202, 0.247, 0.281, 0.292, 0.315, 0.349, 0.36, 0.382, 0.404, 0.404, 0.427, 0.517, 0.539, 0.562, 0.584, 0.584, 0.607, 0.607, 0.629, 0.629, 0.641, 0.641, 0.607, 0.573, 0.562, 0.562, 0.573, 0.584, 0.595, 0.629, 0.641, 0.674, 0.742, 0.921, 0.932, 0.944, 0.921, 0.921, 0.944, 0.944, 0.944, 0.932, 0.932, 0.932, 0.921, 0.786, 0.764, 0.73, 0.697, 0.663, 0.674, 0.415, 0.404, 0.404, 0.371, 0.337, 0.315, 0.292, 0.27, 0.259, 0.225, 0.157, 0.034];
export const A2_ASPECT = 0.8396;
export const A2_BODY_CAP = 0.70;   // 포드 합류 행(34~45)의 병합 런 과대 반폭 캡(B2 합류 캡과 동일 기법)

/** t∈[0,1](0=노즈) → 반폭. 64행 3점 가중 스무딩(디지타이즈 3자리 반올림 지그재그가 표면 밴딩이 되는 것 방지) 후 선형 보간. */
const sampleHalf = (arr, t, cap = 1) => {
  const at = (i) => { const j = Math.min(63, Math.max(0, i)); return (arr[Math.max(0, j - 1)] + arr[j] * 2 + arr[Math.min(63, j + 1)]) / 4; };
  const f = Math.min(63, Math.max(0, t * 63));
  const i = Math.floor(f), u = f - i;
  const v = at(i) * (1 - u) + at(i + 1) * u;
  return Math.min(cap, v);
};
export const a1Half = (t) => sampleHalf(A1_HALF, t);
export const a2Half = (t) => sampleHalf(A2_HALF, t, A2_BODY_CAP);

/**
 * planform 로프트 — 노즈 -z·테일 +z(크리처 컨벤션: placeSwarm 아군 yaw 0 = 노즈가 소실점).
 * 단면은 납작 다각(날개 끝 칼날) — flatShading 재질이 패널 각을 살린다.
 * @param halfAt (t)=>반폭(전장=1 기준 ×aspect/2 스케일 전)  @param segs 종세그  @param pts 단면점 배열 함수 (hw,th)=>[[x,y],...]
 */
function loftPlanform(THREE, halfAt, aspect, segs, thMax, secPts) {
  const secs = [];
  let hwMax = 0;
  for (let s = 0; s <= segs; s++) hwMax = Math.max(hwMax, halfAt(s / segs));
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const z = -0.5 + t;
    const hw = halfAt(t) * aspect * 0.5;
    // 두께: 종방향 반 사인(중앙 두껍) × 폭 비례(날개 구간 얇게 유지)
    const th = thMax * Math.sin(Math.PI * Math.min(1, 0.08 + t * 0.92)) * (0.45 + 0.55 * (halfAt(t) / hwMax));
    const ring = secPts(hw, Math.max(0.006, th));
    secs.push(ring.map(([x, y]) => [x, y, z]));
  }
  return loftClosed(THREE, secs);
}

/** 드론(A1): 원본 코쿤+델타 실루엣 그대로 — 디테일 0(단순화 계약), 콕핏·엔진만 발광. */
export function createDroneGeometry(THREE) {
  const secPts = (hw, th) => [ [hw, 0], [hw * 0.5, th * 0.9], [0, th], [-hw * 0.5, th * 0.9], [-hw, 0], [0, -th * 0.75] ];   // 6점: 상면 볼록·하면 킬·날개 끝 칼날
  const hull = loftPlanform(THREE, a1Half, A1_ASPECT, 12, 0.10, secPts);
  // glow: 콕핏(상면, 원본 밝은 창 행 12~25 → z≈-0.21) + 쌍발 엔진(행 55~60 분리 런 → z≈+0.42, x±0.10) — 옥타 8tri 경량
  const cock = new THREE.OctahedronGeometry(0.05, 0); cock.scale(0.85, 0.4, 1.5); cock.translate(0, 0.032, -0.21);
  const eng = new THREE.OctahedronGeometry(0.04, 0); eng.scale(1, 0.6, 1.4);
  const eL = eng.clone(); eL.translate(-0.10, 0, 0.38);
  const eR = eng.clone(); eR.translate(0.10, 0, 0.38);
  eng.dispose();
  const buckets = { hull, glow: mergeGeos(THREE, [cock, eL, eR]) };
  let triangles = 0;
  for (const k in buckets) triangles += buckets[k].index.count / 3;
  return normalize(THREE, buckets, triangles);
}

/** 순양함(A2): 원본 장갑함 실루엣 로프트 + 측면 포드 + 함교 + 은 패널(trim) + 콕핏 세로창·쌍발 엔진(glow). */
export function createCruiserGeometry(THREE) {
  const secPts = (hw, th) => [ [hw, 0], [hw * 0.62, th * 0.85], [hw * 0.22, th], [-hw * 0.22, th], [-hw * 0.62, th * 0.85], [-hw, 0], [-hw * 0.5, -th * 0.7], [hw * 0.5, -th * 0.7] ];   // 8점: 평평한 등판(장갑) + 하면 이중 킬
  const body = loftPlanform(THREE, a2Half, A2_ASPECT, 20, 0.15, secPts);
  // 측면 포드(원본 분리 런 행 29~56, x중심 ±0.866×aspect/2≈±0.364, 폭 0.427×aspect/2) — 납작 박스 + 후미 컷
  const podW = 0.427 * A2_ASPECT * 0.5 * 0.62, podH = 0.055, podL = (56 - 29) / 63 * 0.72;
  const podZ = -0.5 + ((29 + 56) / 2 / 63);
  const pL = new THREE.BoxGeometry(podW, podH, podL); pL.translate(-0.866 * A2_ASPECT * 0.5 * 0.94, -0.005, podZ);
  const pR = new THREE.BoxGeometry(podW, podH, podL); pR.translate(0.866 * A2_ASPECT * 0.5 * 0.94, -0.005, podZ);
  // 함교(상부 후방 — 원본 상단 중앙 구조물)
  const bridge = new THREE.BoxGeometry(0.10, 0.05, 0.14); bridge.translate(0, 0.085, 0.08);
  const hull = mergeGeos(THREE, [body, pL, pR, bridge]);
  // trim: 은 패널(위계 — 금은 기함 전용) — 노즈 갑판 스트립 + 어깨 패널 2
  const deck = new THREE.BoxGeometry(0.05, 0.014, 0.30); deck.translate(0, 0.062, -0.30);
  const shL = new THREE.BoxGeometry(0.10, 0.012, 0.16); shL.translate(-0.155, 0.055, -0.10);
  const shR = new THREE.BoxGeometry(0.10, 0.012, 0.16); shR.translate(0.155, 0.055, -0.10);
  // glow: 콕핏 세로창(원본 중앙 파란 창 행 12~30 → z≈-0.17) + 쌍발 엔진(행 52~58 → z≈+0.37, x±0.13)
  const win = new THREE.BoxGeometry(0.046, 0.02, 0.24); win.translate(0, 0.052, -0.17);
  const eng = new THREE.SphereGeometry(0.05, 7, 5); eng.scale(1, 0.7, 1.4);
  const eL = eng.clone(); eL.translate(-0.13, -0.01, 0.37);
  const eR = eng.clone(); eR.translate(0.13, -0.01, 0.37);
  eng.dispose();
  const buckets = { hull, trim: mergeGeos(THREE, [deck, shL, shR]), glow: mergeGeos(THREE, [win, eL, eR]) };
  let triangles = 0;
  for (const k in buckets) triangles += buckets[k].index.count / 3;
  return normalize(THREE, buckets, triangles);
}

function loftClosed(THREE, secs) {
  const S = secs.length, N = secs[0].length;
  const pos = [], idx = [];
  for (let s = 0; s < S; s++) for (let i = 0; i <= N; i++) { const p = secs[s][i % N]; pos.push(p[0], p[1], p[2]); }
  const C = N + 1;
  for (let s = 0; s < S - 1; s++) for (let i = 0; i < N; i++) { const a = s * C + i, b = a + 1, d = a + C, e = d + 1; idx.push(a, d, b, b, d, e); }
  // 캡(앞·뒤)
  const capAt = (s, front) => {
    const base = pos.length / 3;
    let cx = 0, cy = 0, cz = 0;
    for (let i = 0; i < N; i++) { const p = secs[s][i]; cx += p[0] / N; cy += p[1] / N; cz += p[2] / N; }
    pos.push(cx, cy, cz);
    for (let i = 0; i < N; i++) { const a = s * C + i, b = s * C + ((i + 1) % N); if (front) idx.push(base, a, b); else idx.push(base, b, a); }
  };
  capAt(0, true); capAt(S - 1, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((pos.length / 3) * 2).fill(0.5), 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function normalize(THREE, buckets, triangles) {
  // 전장(최대 치수) 1.0 정규화 — hull 기준 배율을 전 버킷에 동일 적용(상대 위치 보존)
  const hull = buckets.hull;
  hull.computeBoundingBox();
  const bb = hull.boundingBox;
  const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 1;
  const k = 1 / span;
  for (const key in buckets) {
    const g = buckets[key];
    g.scale(k, k, k);
    // 노즈를 +z 로(실측: hero 카메라에서 yaw 0 의 +z 가 소실점=전진 방향). z 반전 + 감김 복구.
    const pos = g.attributes.position.array;
    for (let i = 2; i < pos.length; i += 3) pos[i] = -pos[i];
    const idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.attributes.position.needsUpdate = true; g.index.needsUpdate = true;
    g.computeVertexNormals(); g.computeBoundingBox(); g.computeBoundingSphere();
  }
  return { buckets, triangles: Math.round(triangles) };
}

/** 아군 공용 재질 — 원본 A1/A2 팔레트(짙은 회청 금속 + 청록 발광). flatShading 으로 패널 각. */
export function createAlliesMaterials(THREE) {
  const mats = {
    // 실전 hero 조명은 검사실보다 어둡다 — 미광(emissive)으로 아군 식별성 보장(원본 스프라이트도 자발광톤)
    hull: new THREE.MeshStandardMaterial({ color: 0x5f7086, metalness: 0.55, roughness: 0.5, envMapIntensity: 0.45, flatShading: true, emissive: 0x232e3d, emissiveIntensity: 0.55 }),
    trim: new THREE.MeshStandardMaterial({ color: 0xa8bccd, metalness: 0.8, roughness: 0.34, envMapIntensity: 0.6, flatShading: true, emissive: 0x2c3947, emissiveIntensity: 0.4 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x0a2530, emissive: 0x6ee7ff, emissiveIntensity: 2.4, metalness: 0.1, roughness: 0.4 }),
  };
  return { mats, dispose() { for (const k in mats) mats[k].dispose(); } };
}

/** 검사실 전시용(위계 비교): 순양함 1 + 드론 3 나란히. */
export function createAlliesModel(THREE) {
  const matlib = createAlliesMaterials(THREE);
  const group = new THREE.Group(); group.name = 'ALLIES';
  const addAt = (geo, x, z, s) => {
    const g = new THREE.Group();
    for (const k in geo.buckets) g.add(new THREE.Mesh(geo.buckets[k], matlib.mats[k]));
    g.position.set(x, 0, z); g.scale.setScalar(s);
    group.add(g);
    return g;
  };
  const cru = createCruiserGeometry(THREE);
  const dro = createDroneGeometry(THREE);
  // 위계 비교 배치: 같은 깊이 평면에 가로 나란히(원근 착시 없는 정직한 크기 비교) — 실전 화면비 22/42≈0.52
  addAt(cru, -0.55, 0, 1.9);
  addAt(dro, 0.75, -0.65, 1.0); addAt(dro, 0.75, 0.65, 1.0); addAt(dro, 1.45, 0, 1.0);
  let tris = cru.triangles + dro.triangles * 3;
  function setLOD() { return 0; }
  function update(time) { matlib.mats.glow.emissiveIntensity = 2.2 + Math.sin(time * 4.3) * 0.4; }
  function stats() { return { lod: 0, triangles: tris, cruiser: cru.triangles, drone: dro.triangles }; }
  function dispose() { for (const k in cru.buckets) cru.buckets[k].dispose(); for (const k in dro.buckets) dro.buckets[k].dispose(); matlib.dispose(); }
  return { group, setLOD, update, stats, dispose, matlib, get lod() { return 0; } };
}
export default { createDroneGeometry, createCruiserGeometry, createAlliesMaterials, createAlliesModel, DRONE_INSTANCE_MAX, CRUISER_INSTANCE_MAX };
