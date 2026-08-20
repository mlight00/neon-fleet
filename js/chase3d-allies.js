// ── 아군 호위 3D: 드론(A1) + 순양함(A2) — 이사 §G-1 "순양함↔드론 차별화, 드론 단순화" ──
//  구 소품 기각 교훈: 원본 스프라이트와 무관한 창작 금지 → 크리처 파이프라인과 동일하게
//  원본 알파 디지타이즈(assets/styleC/A1.png·A2.png → tests/fixtures/allies-planform.json)에서
//  뽑은 64행 반폭 프로파일을 단일 진실로 로프트한다.
//  위계 계약: 기함 AURORA(금 트림) > 순양함(은 패널 함선) > 드론(무패널 델타 셔틀).
//  전장 1.0 정규화(placeSwarm 계약), 결정적(난수 없음), THREE 주입(Node 검증 가능).
import { mergeGeos } from './chase3d-aurora-geometry.js';

export const DRONE_INSTANCE_MAX = 60;    // BAL.squad.drawCap 과 동일(초과분은 기존 2D 무리 표기)
export const CRUISER_INSTANCE_MAX = 10;  // 순양함+호위기 슬롯 상한

// ⚠️ 원본 = 게임 2D 가 실제 로드하는 art2-webp/styleC/A1.webp·A2.webp(신세대 아트 — 구 styleC png 와 다른 그림).
// A1.webp(256×512, aspect 0.5) 64행 반폭  ⚠️§G-48 재크롭 아트로 다시 디지타이즈
//  노즈 뾰족 → 행 53 최대 델타 → 행 58 날개 종료 급감 → 쌍발 노즐 꼬리.
export const A1_HALF = [0.049, 0.107, 0.131, 0.156, 0.18, 0.205, 0.23, 0.238, 0.254, 0.27, 0.295, 0.32, 0.336, 0.352, 0.377, 0.393, 0.41, 0.426, 0.443, 0.459, 0.492, 0.541, 0.574, 0.615, 0.656, 0.689, 0.721, 0.77, 0.811, 0.844, 0.877, 0.91, 0.934, 0.959, 0.984, 0.992, 1.0, 1.0, 0.992, 0.975, 0.402, 0.377, 0.352, 0.32, 0.287, 0.254, 0.246, 0.23, 0.221, 0.213, 0.205, 0.197, 0.172, 0.148, 0.115, 0.115, 0.107, 0.098, 0.09, 0.074, 0.057, 0.041, 0.0, 0.0];
export const A1_ASPECT = 0.5;

// A2.webp(278×512, aspect 0.543) 64행 반폭  ⚠️§G-48 재크롭 아트로 다시 디지타이즈
//  나셀 사이 틈·음영은 텍스처가 표현). 노즈 → 어깨 → 나셀 최대(행 53) → 행 56 종료 급감 → 쌍발 꼬리.
export const A2_HALF = [0.117, 0.131, 0.153, 0.161, 0.175, 0.197, 0.204, 0.212, 0.226, 0.234, 0.241, 0.255, 0.263, 0.263, 0.27, 0.27, 0.277, 0.292, 0.613, 0.642, 0.672, 0.693, 0.715, 0.752, 0.781, 0.81, 0.839, 0.861, 0.876, 0.898, 0.92, 0.927, 0.942, 0.956, 0.964, 0.971, 0.985, 0.993, 1.0, 1.0, 1.0, 0.657, 0.642, 0.628, 0.613, 0.599, 0.584, 0.577, 0.555, 0.182, 0.175, 0.161, 0.139, 0.124, 0.117, 0.102, 0.095, 0.088, 0.08, 0.08, 0.066, 0.058, 0.036, 0.0];
export const A2_ASPECT = 0.543;

/** t∈[0,1](0=노즈) → 반폭. 64행 3점 가중 스무딩(디지타이즈 3자리 반올림 지그재그가 표면 밴딩이 되는 것 방지) 후 선형 보간. */
const sampleHalf = (arr, t, cap = 1) => {
  const at = (i) => { const j = Math.min(63, Math.max(0, i)); return (arr[Math.max(0, j - 1)] + arr[j] * 2 + arr[Math.min(63, j + 1)]) / 4; };
  const f = Math.min(63, Math.max(0, t * 63));
  const i = Math.floor(f), u = f - i;
  const v = at(i) * (1 - u) + at(i + 1) * u;
  return Math.min(cap, v);
};
export const a1Half = (t) => sampleHalf(A1_HALF, t);
export const a2Half = (t) => sampleHalf(A2_HALF, t);

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

/** 드론(A1): 원본 델타 인터셉터 실루엣 그대로 — 디테일 0(단순화 계약), 콕핏·쌍발 노즐만 발광. */
export function createDroneGeometry(THREE) {
  const secPts = (hw, th) => [ [hw, 0], [hw * 0.5, th * 0.9], [0, th], [-hw * 0.5, th * 0.9], [-hw, 0], [0, -th * 0.75] ];   // 6점: 상면 볼록·하면 킬·날개 끝 칼날
  const hull = loftPlanform(THREE, a1Half, A1_ASPECT, 13, 0.09, secPts);
  // glow: 콕핏(행 ~18-26 상면 → 생성좌표 z −0.15) + 쌍발 노즐(행 59-63 분리 런 → z +0.47, x ±0.062) — 옥타 8tri 경량
  const cock = new THREE.OctahedronGeometry(0.045, 0); cock.scale(0.8, 0.4, 1.6); cock.translate(0, 0.03, -0.15);
  const eng = new THREE.OctahedronGeometry(0.034, 0); eng.scale(1, 0.6, 1.4);
  const eL = eng.clone(); eL.translate(-0.062, 0, 0.47);
  const eR = eng.clone(); eR.translate(0.062, 0, 0.47);
  eng.dispose();
  const buckets = { hull, glow: mergeGeos(THREE, [cock, eL, eR]) };
  let triangles = 0;
  for (const k in buckets) triangles += buckets[k].index.count / 3;
  return normalize(THREE, buckets, triangles, A1_ASPECT);
}

/** 순양함(A2): 원본 실루엣 외곽 로프트(날개+나셀 한 장) + 함교 + 갑판 스트립(trim) + 콕핏 창·쌍발 엔진(glow). */
export function createCruiserGeometry(THREE) {
  const secPts = (hw, th) => [ [hw, 0], [hw * 0.62, th * 0.85], [hw * 0.22, th], [-hw * 0.22, th], [-hw * 0.62, th * 0.85], [-hw, 0], [-hw * 0.5, -th * 0.7], [hw * 0.5, -th * 0.7] ];   // 8점: 평평한 등판(장갑) + 하면 이중 킬
  const body = loftPlanform(THREE, a2Half, A2_ASPECT, 20, 0.13, secPts);
  // 함교(상부 전방 — 원본 행 12~20 중앙 구조물 → z −0.246)
  const bridge = new THREE.BoxGeometry(0.08, 0.045, 0.12); bridge.translate(0, 0.075, -0.246);
  const hull = mergeGeos(THREE, [body, bridge]);
  // trim: 중앙 갑판 스트립(원본 중앙 스파인 행 20~45) — 텍스처가 이어지는 살짝 돌출 갑판
  const deck = new THREE.BoxGeometry(0.05, 0.012, 0.40); deck.translate(0, 0.058, 0.0);
  // glow: 콕핏 창(행 8~16 → z −0.31) + 쌍발 엔진(행 56~63 → z +0.444, x ±0.104)
  const win = new THREE.BoxGeometry(0.042, 0.018, 0.14); win.translate(0, 0.05, -0.31);
  const eng = new THREE.SphereGeometry(0.048, 7, 5); eng.scale(1, 0.7, 1.4);
  const eL = eng.clone(); eL.translate(-0.104, -0.01, 0.444);
  const eR = eng.clone(); eR.translate(0.104, -0.01, 0.444);
  eng.dispose();
  const buckets = { hull, trim: deck, glow: mergeGeos(THREE, [win, eL, eR]) };
  let triangles = 0;
  for (const k in buckets) triangles += buckets[k].index.count / 3;
  return normalize(THREE, buckets, triangles, A2_ASPECT);
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
function normalize(THREE, buckets, triangles, aspect = 1) {
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
    // 원본 스프라이트 투영 UV(이사: "2D 드론과 너무 다르다") — 최종 좌표 (x,z) 를 A1/A2 그림 (u,v) 로.
    //  노즈(+z)=이미지 상단(v=1, three flipY 기본). u 는 중심 기준 3% 수축(실루엣 밖 투명 픽셀 새어들기 방지).
    //  glow 는 발광 단색이라 제외.
    if (key !== 'glow') {
      const uv = g.attributes.uv.array;
      for (let i = 0, p = 0; i < uv.length; i += 2, p += 3) {
        uv[i] = Math.min(1, Math.max(0, (pos[p] / aspect) * 0.97 + 0.5));
        uv[i + 1] = Math.min(1, Math.max(0, (pos[p + 2]) * 0.97 + 0.5));
      }
      g.attributes.uv.needsUpdate = true;
    }
  }
  return { buckets, triangles: Math.round(triangles) };
}

/**
 * 아군 재질 — 원본 스프라이트(A1/A2 webp)를 albedo 로 그대로 입힌다(이사: "2D 드론과 너무 다르다·기함 대비 단순").
 * UV 는 normalize 가 planform (x,z)→그림 (u,v) 로 매핑 → 상면에서 2D 그림과 같은 패널·창·명암.
 * 브라우저 전용 로드(TextureLoader) — Node/실패 시 단색 폴백(형상·테스트는 텍스처와 무관).
 */
const ALLIES_TEX_URL = { drone: 'assets/art2-webp/styleC/A1.webp', cruiser: 'assets/art2-webp/styleC/A2.webp' };
function baseAlliesMaterials(THREE, kind) {
  let map = null;
  if (typeof document !== 'undefined') {
    try {
      // 투명부(실루엣 밖·나셀 틈)를 어두운 헐 색으로 채워 굽는다 — UV 경계 검은 띠·틈 새어보임 방지.
      const cv = document.createElement('canvas'); cv.width = 8; cv.height = 8;
      const cx = cv.getContext('2d'); cx.fillStyle = '#2a3542'; cx.fillRect(0, 0, 8, 8);
      map = new THREE.CanvasTexture(cv);
      map.colorSpace = THREE.SRGBColorSpace;
      map.wrapS = map.wrapT = THREE.ClampToEdgeWrapping;
      map.anisotropy = 4;
      const img = new Image();
      img.onload = () => {
        cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const c2 = cv.getContext('2d');
        c2.fillStyle = '#2a3542'; c2.fillRect(0, 0, cv.width, cv.height);
        c2.drawImage(img, 0, 0);
        map.needsUpdate = true;
      };
      img.src = ALLIES_TEX_URL[kind] || ALLIES_TEX_URL.drone;
    } catch (e) { map = null; }
  }
  const mats = {
    // 텍스처가 명암·패널을 제공 → color 는 백색(원색 유지), 미광은 실전 어둠 보정용으로 낮게.
    hull: new THREE.MeshStandardMaterial({ map, color: map ? 0xffffff : 0x5f7086, metalness: 0.45, roughness: 0.55, envMapIntensity: 0.4, flatShading: true, emissive: 0x39434f, emissiveIntensity: map ? 0.32 : 0.55 }),
    trim: new THREE.MeshStandardMaterial({ map, color: map ? 0xdfe8f0 : 0xa8bccd, metalness: 0.75, roughness: 0.36, envMapIntensity: 0.55, flatShading: true, emissive: 0x39434f, emissiveIntensity: 0.28 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x0a2530, emissive: 0x6ee7ff, emissiveIntensity: 2.4, metalness: 0.1, roughness: 0.4 }),
  };
  return { mats, dispose() { if (map) map.dispose(); for (const k in mats) mats[k].dispose(); } };
}
export function createDroneMaterials(THREE) { return baseAlliesMaterials(THREE, 'drone'); }
export function createCruiserMaterials(THREE) { return baseAlliesMaterials(THREE, 'cruiser'); }
/** (하위 호환) 종 미지정 공용 — 드론 텍스처 기준. */
export function createAlliesMaterials(THREE) { return baseAlliesMaterials(THREE, 'drone'); }

/** 검사실 전시용(위계 비교): 순양함 1 + 드론 3 나란히 — 종별 원본 텍스처 재질. */
export function createAlliesModel(THREE) {
  const droneMat = createDroneMaterials(THREE);
  const cruMat = createCruiserMaterials(THREE);
  const group = new THREE.Group(); group.name = 'ALLIES';
  const addAt = (geo, matlib, x, z, s) => {
    const g = new THREE.Group();
    for (const k in geo.buckets) g.add(new THREE.Mesh(geo.buckets[k], matlib.mats[k]));
    g.position.set(x, 0, z); g.scale.setScalar(s);
    group.add(g);
    return g;
  };
  const cru = createCruiserGeometry(THREE);
  const dro = createDroneGeometry(THREE);
  // 위계 비교 배치: 같은 깊이 평면에 가로 나란히(원근 착시 없는 정직한 크기 비교) — 실전 화면비 22/42≈0.52
  addAt(cru, cruMat, -0.55, 0, 1.9);
  addAt(dro, droneMat, 0.75, -0.65, 1.0); addAt(dro, droneMat, 0.75, 0.65, 1.0); addAt(dro, droneMat, 1.45, 0, 1.0);
  let tris = cru.triangles + dro.triangles * 3;
  function setLOD() { return 0; }
  function update(time) { const e = 2.2 + Math.sin(time * 4.3) * 0.4; droneMat.mats.glow.emissiveIntensity = e; cruMat.mats.glow.emissiveIntensity = e; }
  function stats() { return { lod: 0, triangles: tris, cruiser: cru.triangles, drone: dro.triangles }; }
  function dispose() { for (const k in cru.buckets) cru.buckets[k].dispose(); for (const k in dro.buckets) dro.buckets[k].dispose(); droneMat.dispose(); cruMat.dispose(); }
  return { group, setLOD, update, stats, dispose, matlib: droneMat, get lod() { return 0; } };
}
export default { createDroneGeometry, createCruiserGeometry, createAlliesMaterials, createDroneMaterials, createCruiserMaterials, createAlliesModel, DRONE_INSTANCE_MAX, CRUISER_INSTANCE_MAX };
