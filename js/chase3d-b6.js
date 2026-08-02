// ── B6 위버 3D — §G-4 자유 디자인(이사 8/2 "2D 제약 해제") ──
//  원본 2D(B6.webp 6방 낫 별+중앙 눈)의 정체성만 계승: 방사형 낫 팔 + 주황 눈 + 자주 키틴.
//  조형 = **xy 평면의 별**(법선 -z=카메라) — 실전 yawBase π 정면 카메라에서 별 실루엣이 활짝 보여야 한다
//  (1차 시도 xz 수평 팔랑개비는 정면에서 엣지만 보임 — 실측 교훈). 중앙 6각 허브 + 6방 2절 낫 팔 + 팔끝 발광 침 + 전면 눈.
//  재질 = 터렛 포지 공유(자주 키틴 텍스처 + 평면용 반사 억제). 계약: buckets {hull, glow, core}, 전장 1.0, 결정적.
import { mergeGeos } from './chase3d-aurora-geometry.js';
import { createTurretMaterials } from './chase3d-b5.js';

export const B6_LENGTH = 1.0;

/** UV 를 좁은 평탄 영역으로 눌러 격자 뭉침을 지운다(터렛과 동일 기법 — 팔은 s 를 키워 은은한 얼룩만 남김). */
function flattenUV(geo, u0, v0, s) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * s, v0 + uv.getY(i) * s);
  return geo;
}

export function createWeaverGeometry(THREE, { lod = 0 } = {}) {
  const ARMS = 6;
  const BEND = 0.75;   // 낫 꺾임각(접선 방향 — 회전하는 톱니바퀴 인상)
  // 중앙 허브: 6각 드럼(축 z — 정면이 카메라) + 전면 베벨 콘
  const hub = new THREE.CylinderGeometry(0.20, 0.20, 0.10, 6); hub.rotateX(Math.PI / 2);
  const hubF = new THREE.ConeGeometry(0.20, 0.07, 6); hubF.rotateX(-Math.PI / 2); hubF.translate(0, 0, -0.085);
  const hubB = new THREE.ConeGeometry(0.20, 0.07, 6); hubB.rotateX(Math.PI / 2); hubB.translate(0, 0, 0.085);
  const armParts = [];
  const tips = [];
  for (let i = 0; i < ARMS; i++) {
    const a = (i / ARMS) * Math.PI * 2;
    // 1절: 허브에서 방사(+x) — 굵은 날 뿌리
    const seg1 = flattenUV(new THREE.BoxGeometry(0.30, 0.12, 0.06), 0.28 + i * 0.07, 0.30, 0.10);
    seg1.translate(0.33, 0, 0);
    // 2절: 접선(+y) 쪽으로 꺾인 낫 날(얇음)
    const seg2 = flattenUV(new THREE.BoxGeometry(0.26, 0.085, 0.05), 0.30 + i * 0.05, 0.55, 0.10);
    seg2.translate(0.13, 0, 0);
    seg2.rotateZ(BEND);
    seg2.translate(0.45, 0.01, 0);
    const arm = mergeGeos(THREE, [seg1, seg2]);
    arm.rotateZ(a);
    armParts.push(arm);
    // 팔끝 발광 침 — 낫 날 방향(BEND) 그대로 연장
    const tip = new THREE.ConeGeometry(0.035, 0.15, lod >= 2 ? 4 : 5);
    tip.rotateZ(BEND - Math.PI / 2);           // 콘 +y 축을 낫 방향으로
    tip.translate(0.45 + 0.245 * Math.cos(BEND), 0.01 + 0.245 * Math.sin(BEND), 0);   // seg2 끝 + 반침 길이
    tip.rotateZ(a);
    tips.push(tip);
  }
  const hull = mergeGeos(THREE, [hub, hubF, hubB, ...armParts]);
  const glow = mergeGeos(THREE, tips);
  // 중앙 눈(주황 코어) — 전면(-z) 돌출
  const core = new THREE.SphereGeometry(0.115, lod >= 2 ? 8 : 10, lod >= 2 ? 6 : 8);
  core.scale(1, 1, 0.75); core.translate(0, 0, -0.10);
  const buckets = { hull, glow, core };
  hull.computeBoundingBox();
  const bb = hull.boundingBox;
  const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 1;
  const k = 1 / span;
  let triangles = 0;
  for (const key in buckets) { buckets[key].scale(k, k, k); buckets[key].computeVertexNormals(); triangles += buckets[key].index.count / 3; }
  return { buckets, triangles: Math.round(triangles) };
}

/** 재질 = 터렛 전용 포지 공유(자주 키틴 텍스처 + 평면용 반사 억제 — B5 실측 교훈), 시드만 상이. */
export function createWeaverMaterials(THREE, { seed = 6, mobile = false } = {}) {
  return createTurretMaterials(THREE, { seed, mobile });
}

/** 검사실 모델(chase3dLab=b6). */
export function createWeaverModel(THREE, { seed = 6, mobile = false, lods = [0, 1, 2] } = {}) {
  const matlib = createWeaverMaterials(THREE, { seed, mobile });
  const group = new THREE.Group(); group.name = 'B6';
  const lodGroups = new Map(); const geos = []; const triByLod = {};
  for (const lod of lods) {
    const geo = createWeaverGeometry(THREE, { lod });
    geos.push(geo); triByLod[lod] = geo.triangles;
    const g = new THREE.Group(); g.name = 'B6_LOD' + lod;
    for (const k in geo.buckets) { const m = new THREE.Mesh(geo.buckets[k], matlib.mats[k]); m.name = 'b6_' + k; g.add(m); }
    g.visible = false; group.add(g); lodGroups.set(lod, g);
  }
  let active = lods[0]; lodGroups.get(active).visible = true;
  function setLOD(lod) { if (!lodGroups.has(lod) || lod === active) return active; lodGroups.get(active).visible = false; lodGroups.get(lod).visible = true; active = lod; return active; }
  function update(time) {
    group.rotation.z = time * 0.8;   // 별 자전(정면 평면 — 실전 wob 롤과 같은 축)
    if (matlib.mats.core) matlib.mats.core.emissiveIntensity = 2.0 + Math.sin(time * 5.3) * 0.55;
    if (matlib.mats.glow) matlib.mats.glow.emissiveIntensity = 2.1 + Math.sin(time * 3.7 + 1) * 0.4;
  }
  function stats() { return { lod: active, triangles: triByLod[active], triByLod: { ...triByLod } }; }
  function dispose() { for (const geo of geos) for (const k in geo.buckets) geo.buckets[k].dispose(); matlib.dispose(); }
  return { group, setLOD, update, stats, dispose, matlib, get lod() { return active; } };
}

export default { createWeaverGeometry, createWeaverMaterials, createWeaverModel };
