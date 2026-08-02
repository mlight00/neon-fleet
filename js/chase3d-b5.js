// ── B5 터렛(포탑) 3D — §G-4 자유 디자인(이사 8/2 "2D 제약 해제, 3D 를 멋지게") ──
//  원본 2D(B5.webp 자주 장갑 요새+주황 용광로)의 종족 정체성만 계승: 자주 키틴 장갑 + 주황 용광로 + 마젠타 발광.
//  조형 = 팔각 요새 실루엣(스커트→몸통→돔) + 전방 포탑 하우징 + 2연장 포신 + 전면 돌출 용광로 구.
//  재질 = B1 키틴 텍스처 재사용(종족 통일)이되 터렛 전용 파라미터 — 평면이 많은 조형이라 반사 뭉침을 러프니스로 눌러야
//  자주색이 산다(1차 시도에서 B1 재질 그대로 쓰니 환경맵 파랑이 장갑을 덮음 — 실측 교훈).
//  계약: buckets {hull, glow, core}(makeSwarm 3 draw), 전장 1.0, 결정적, THREE 주입.
import { mergeGeos } from './chase3d-aurora-geometry.js';
import { forgeB1Hull } from './chase3d-b1.js';

export const B5_LENGTH = 1.0;

/** 수직(y) 로프트 — 원통 UV. prof=[r,t] (t=0 바닥 → 1 꼭대기), y = t-0.5. */
function lathe(THREE, prof, N = 8) {
  const pos = [], uv = [], idx = [];
  for (let s = 0; s < prof.length; s++) {
    const [r, t] = prof[s];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2 + Math.PI / N;
      pos.push(Math.cos(a) * r, t - 0.5, Math.sin(a) * r);
      uv.push(i / N, t);
    }
  }
  const C = N + 1;
  for (let s = 0; s < prof.length - 1; s++) for (let i = 0; i < N; i++) { const a = s * C + i, b = a + 1, d = a + C, e = d + 1; idx.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

/** UV 를 좁은 평탄 영역으로 눌러 절차 무늬를 지운다(격자 뭉침 방지 — 매끈한 장갑 부위용). */
function flattenUV(geo, u0 = 0.32, v0 = 0.30, s = 0.08) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) * s, v0 + uv.getY(i) * s);
  return geo;
}

export function createTurretGeometry(THREE, { lod = 0 } = {}) {
  const N = lod >= 2 ? 6 : 8;
  // 요새 실루엣: 벌어진 스커트 → 장갑 몸통 → 낮은 돔(위가 평평한 포탑 느낌)
  const body = lathe(THREE, [
    [0.34, 0.02], [0.46, 0.10], [0.44, 0.22],   // 스커트
    [0.40, 0.30], [0.40, 0.55],                 // 몸통 드럼
    [0.33, 0.68], [0.24, 0.82], [0.12, 0.92], [0, 0.96],   // 돔
  ], N);
  // 전방 포탑 하우징(-z 돌출 — 실전 yawBase π 로 포신이 카메라·아군 쪽). UV 평탄 — 격자 뭉침 방지.
  const housing = flattenUV(new THREE.BoxGeometry(0.34, 0.18, 0.32), 0.30, 0.28, 0.06);
  housing.translate(0, -0.04, -0.46);
  // 2연장 포신 — 포구를 살짝 위로(+0.12): 추적 카메라(위에서 내려봄)에서 단축을 줄여 길이가 읽히게.
  //  (1차 실측: 아래 기울임은 위 시점에서 포신이 점으로 압축되어 돔에 가려짐)
  const mkBarrel = (x, u0) => {
    const b = flattenUV(new THREE.CylinderGeometry(0.045, 0.06, 0.50, lod >= 2 ? 5 : 7), u0, 0.55, 0.05);
    b.rotateX(Math.PI / 2 + 0.12);
    b.translate(x, -0.05, -0.76);
    return b;
  };
  const hull = mergeGeos(THREE, [body, housing, mkBarrel(-0.10, 0.18), mkBarrel(0.10, 0.62)]);
  // 용광로 구 — 돔 꼭대기 크레이터(원본 2D 의 "중앙 주황 용광로"는 위에서 본 모습 — 추적 카메라와 같은 시점).
  //  2차 실측: 정규화(k≈0.7) 후 돔에 파묻혀 가장자리만 보임 → 중심을 돔 표면 위로 확실히 돌출.
  const core = new THREE.SphereGeometry(0.17, lod >= 2 ? 8 : 10, lod >= 2 ? 6 : 8);
  core.scale(1, 0.8, 1); core.translate(0, 0.46, -0.02);
  // 발광: 머즐 링 2 + 몸통 상단 밀착 링 + 몸통 표면 슬릿 2
  const mkMuzzle = (x) => {
    const m = new THREE.CylinderGeometry(0.052, 0.052, 0.05, lod >= 2 ? 5 : 7);
    m.rotateX(Math.PI / 2 + 0.12); m.translate(x, -0.017, -1.025);
    return m;
  };
  const ring = new THREE.TorusGeometry(0.405, 0.016, lod >= 2 ? 4 : 6, N); ring.rotateX(Math.PI / 2); ring.translate(0, 0.0, 0);   // 몸통 드럼(r 0.40) 표면 위 발광 띠
  const sL = new THREE.BoxGeometry(0.035, 0.14, 0.05); sL.translate(-0.385, -0.02, -0.06);
  const sR = sL.clone(); sR.translate(0.77, 0, 0);
  const glow = mergeGeos(THREE, [mkMuzzle(-0.10), mkMuzzle(0.10), ring, sL, sR]);
  const buckets = { hull, glow, core };
  // 전장 1.0 정규화(hull 기준, 전 버킷 동일 배율)
  hull.computeBoundingBox();
  const bb = hull.boundingBox;
  const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z) || 1;
  const k = 1 / span;
  let triangles = 0;
  for (const key in buckets) { buckets[key].scale(k, k, k); buckets[key].computeVertexNormals(); triangles += buckets[key].index.count / 3; }
  return { buckets, triangles: Math.round(triangles) };
}

/** 터렛 전용 재질 — B1 키틴 텍스처(자주) 재사용 + 평면용 파라미터(반사 억제·러프 상향). */
export function createTurretMaterials(THREE, { seed = 5, mobile = false } = {}) {
  const f = forgeB1Hull(seed, mobile ? 64 : 128);
  const mk = (data, srgb) => {
    const t = new THREE.DataTexture(data, f.w, f.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 2; t.channel = 0;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true; return t;
  };
  const map = mk(f.albedo, true), normal = mk(f.normal, false);
  const mats = {
    // roughnessMap 미사용(키틴의 반질 값이 평면에서 거울 뭉침을 만든다) — 고정 러프 0.72 + 반사 0.3.
    //  color 틴트 = 자주 강화(검사실 파란 필/림 라이트가 보라 albedo 를 남색으로 밀어내는 것을 상쇄).
    hull: new THREE.MeshStandardMaterial({ map, color: 0xe8c2f2, normalMap: normal, normalScale: new THREE.Vector2(1.0, 1.0), roughness: 0.72, metalness: 0.08, envMapIntensity: 0.3 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x2a0618, emissive: 0xc81d76, emissiveIntensity: 2.2, metalness: 0.1, roughness: 0.35 }),
    core: new THREE.MeshStandardMaterial({ color: 0x2a1404, emissive: 0xff7d14, emissiveIntensity: 2.0, metalness: 0.05, roughness: 0.3 }),
  };
  return { mats, textures: [map, normal], dispose() { for (const t of [map, normal]) t.dispose(); for (const k in mats) mats[k].dispose(); } };
}

/** 검사실 모델(chase3dLab=b5). */
export function createTurretModel(THREE, { seed = 5, mobile = false, lods = [0, 1, 2] } = {}) {
  const matlib = createTurretMaterials(THREE, { seed, mobile });
  const group = new THREE.Group(); group.name = 'B5';
  const lodGroups = new Map(); const geos = []; const triByLod = {};
  for (const lod of lods) {
    const geo = createTurretGeometry(THREE, { lod });
    geos.push(geo); triByLod[lod] = geo.triangles;
    const g = new THREE.Group(); g.name = 'B5_LOD' + lod;
    for (const k in geo.buckets) { const m = new THREE.Mesh(geo.buckets[k], matlib.mats[k]); m.name = 'b5_' + k; g.add(m); }
    g.visible = false; group.add(g); lodGroups.set(lod, g);
  }
  let active = lods[0]; lodGroups.get(active).visible = true;
  function setLOD(lod) { if (!lodGroups.has(lod) || lod === active) return active; lodGroups.get(active).visible = false; lodGroups.get(lod).visible = true; active = lod; return active; }
  function update(time) {
    if (matlib.mats.core) matlib.mats.core.emissiveIntensity = 2.0 + Math.sin(time * 4.7) * 0.55;   // 용광로 맥동
    if (matlib.mats.glow) matlib.mats.glow.emissiveIntensity = 2.1 + Math.sin(time * 3.1 + 1) * 0.4;
  }
  function stats() { return { lod: active, triangles: triByLod[active], triByLod: { ...triByLod } }; }
  function dispose() { for (const geo of geos) for (const k in geo.buckets) geo.buckets[k].dispose(); matlib.dispose(); }
  return { group, setLOD, update, stats, dispose, matlib, get lod() { return active; } };
}

export default { createTurretGeometry, createTurretMaterials, createTurretModel };
