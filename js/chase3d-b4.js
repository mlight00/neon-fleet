// ── B4 저격수(Sniper) 절차적 3D (이사 승인 — "저격수부터 순서대로") ──
//  단일 진실: 원본 B4.webp 알파 디지타이즈(아래 B4_ROWS, tests/fixtures/b4-planform.json 동일 출처, aspect 0.3447).
//  정체성: 세로로 긴 창날 실루엣 + 헤드의 "거대한 주황 조준경 눈" + 어깨 핀 2 + 눈 밑 마젠타 촉수 다발
//         + 몸통 중앙 발광 마디 라인 + 하단 화염 창끝.
//  좌표: 헤드 = +Z(먼쪽), 창끝 = −Z(플레이어쪽) — 조준하며 내려꽂히는 인상. 버킷 3(hull/glow/core) 유지.
import { mulberry32, mergeGeos } from './chase3d-aurora-geometry.js';

export const B4_ROWS = [[[0,0.099]],[[0,0.284]],[[0,0.358]],[[0,0.407]],[[0,0.395]],[[0,0.444],[0.938,0.988]],[[0,0.481],[0.864,0.975]],[[0,0.531],[0.778,0.963]],[[0,0.556],[0.691,0.938]],[[0,0.901]],[[0,0.852]],[[0,0.383],[0.432,0.815]],[[0,0.358],[0.469,0.753]],[[0,0.358],[0.481,0.679]],[[0,0.37],[0.481,0.593]],[[0,0.395]],[[0,0.444]],[[0,0.481]],[[0,0.481]],[[0,0.494]],[[0,0.531]],[[0,0.531]],[[0,0.506]],[[0,0.543]],[[0,0.531]],[[0,0.519]],[[0,0.506]],[[0,0.494]],[[0,0.444]],[[0,0.42]],[[0,0.407]],[[0,0.395]],[[0,0.383]],[[0,0.37]],[[0,0.37]],[[0,0.358]],[[0,0.333]],[[0,0.333]],[[0,0.321]],[[0,0.309]],[[0,0.296]],[[0,0.296]],[[0,0.284]],[[0,0.272]],[[0,0.259]],[[0,0.247]],[[0,0.247]],[[0,0.235]],[[0,0.222]],[[0,0.21]],[[0,0.21]],[[0,0.198]],[[0,0.185]],[[0,0.173]],[[0,0.173]],[[0,0.16]],[[0,0.148]],[[0,0.148]],[[0,0.123]],[[0,0.111]],[[0,0.099]],[[0,0.086]],[[0,0.062]],[[0,0.025]]];
export const B4_ASPECT = 0.3447;
export const B4_LENGTH = 1.0;
const HW = 0.5 * B4_ASPECT * B4_LENGTH;

const L_ = (a, b, t) => a + (b - a) * t;
function rowsAt(zf) {
  const f = Math.min(0.999999, Math.max(0, zf)) * B4_ROWS.length - 0.5;
  const i0 = Math.max(0, Math.min(B4_ROWS.length - 1, Math.floor(f)));
  const i1 = Math.min(B4_ROWS.length - 1, i0 + 1);
  const t = Math.min(1, Math.max(0, f - i0));
  return { r0: B4_ROWS[i0], r1: B4_ROWS[i1], t };
}
/** 중앙 몸통 반폭(첫 런). 핀 합류 구간(r9~10, 0.85+)은 캡 0.56 로 절단(핀이 재현). */
export function b4Body(zf) {
  const { r0, r1, t } = rowsAt(zf);
  return Math.min(0.56, L_(r0[0][1], r1[0][1], t));
}
function keys(z, table) {
  if (z <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) if (z <= table[i][0]) { const [z0, v0] = table[i - 1], [z1, v1] = table[i]; return L_(v0, v1, (z - z0) / (z1 - z0)); }
  return table[table.length - 1][1];
}
// 높이: 헤드(0.05~0.24) 두툼, 창날은 납작하게 테이퍼(날 단면).
const hTop = (z) => keys(z, [[0, 0.010], [0.07, 0.052], [0.15, 0.066], [0.24, 0.055], [0.4, 0.040], [0.6, 0.028], [0.8, 0.016], [1, 0.005]]) * B4_LENGTH;
const hBot = (z) => keys(z, [[0, 0.008], [0.07, 0.040], [0.15, 0.050], [0.24, 0.042], [0.4, 0.030], [0.6, 0.020], [0.8, 0.012], [1, 0.004]]) * B4_LENGTH;
const zOf = (zf) => (0.5 - zf) * B4_LENGTH;
const xOf = (run) => run * HW;

function grid(THREE, rows, flip = false) {
  const R = rows.length, C = rows[0].length;
  const pos = new Float32Array(R * C * 3), uv = new Float32Array(R * C * 2);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const p = rows[r][c], k = r * C + c; pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2]; uv[k * 2] = c / (C - 1); uv[k * 2 + 1] = r / (R - 1); }
  const idx = [];
  for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) { const a = r * C + c, b = a + 1, d = a + C, e = d + 1; if (flip) idx.push(a, b, d, b, e, d); else idx.push(a, d, b, b, d, e); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
function loft(THREE, secs, caps = true) {
  const S = secs.length, N = secs[0].pts.length;
  const rows = [];
  for (let s = 0; s < S; s++) { const row = []; for (let i = 0; i <= N; i++) { const p = secs[s].pts[i % N]; row.push([p[0], p[1], p[2]]); } rows.push(row); }
  const g = grid(THREE, rows);
  if (!caps) return g;
  const capGeo = (endIdx, front) => {
    const sec = secs[endIdx], n = sec.pts.length;
    const cx = sec.pts.reduce((a, p) => a + p[0], 0) / n, cy = sec.pts.reduce((a, p) => a + p[1], 0) / n, cz = sec.pts.reduce((a, p) => a + p[2], 0) / n;
    const pos = [cx, cy, cz]; const idx = [];
    for (let i = 0; i < n; i++) pos.push(sec.pts[i][0], sec.pts[i][1], sec.pts[i][2]);
    for (let i = 0; i < n; i++) { const a = 1 + i, b = 1 + ((i + 1) % n); if (front) idx.push(0, a, b); else idx.push(0, b, a); }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    cg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((n + 1) * 2).fill(0.5), 2));
    cg.setIndex(idx); cg.computeVertexNormals(); return cg;
  };
  return mergeGeos(THREE, [g, capGeo(0, true), capGeo(S - 1, false)]);
}

// ── 몸통: 8점 "창날" 단면(옆 모서리 날카로움) 링 loft ──
function buildBody(THREE, stations) {
  const secs = [];
  for (let s = 0; s <= stations; s++) {
    const zf = 0.006 + (s / stations) * 0.986;
    const w = Math.max(0.006, xOf(b4Body(zf))), ht = hTop(zf), hb = hBot(zf), z = zOf(zf);
    secs.push({ z, pts: [
      [w, 0, z], [w * 0.62, ht * 0.72, z], [w * 0.22, ht, z], [-w * 0.22, ht, z], [-w * 0.62, ht * 0.72, z],
      [-w, 0, z], [-w * 0.5, -hb * 0.85, z], [w * 0.5, -hb * 0.85, z],
    ] });
  }
  return buildRemapV(loft(THREE, secs, true), 0, 0.62);
}
function buildRemapV(geo, a, b) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, a + uv.getY(i) * (b - a));
  uv.needsUpdate = true;
  return geo;
}
// ── 헤드 장갑 덮개 + 어깨 핀 2(원본 r5~14 분리 런: 위 바깥 → 아래 안으로 굽는 날개) ──
function buildHead(THREE, segs) {
  const list = [];
  // 헤드 덮개: 몸통 위(zf 0.03~0.25)에 살짝 크게 얹는 링
  const secs = [];
  for (let s = 0; s <= 6; s++) {
    const zf = 0.03 + (s / 6) * 0.22;
    const edge = s === 0 || s === 6 ? 0.6 : 1;
    const w = xOf(b4Body(zf)) * 1.04 * edge, y = hTop(zf) * 1.06, z = zOf(zf);
    const th = 0.016 * B4_LENGTH * edge;
    secs.push({ z, pts: [[w, y - th, z], [w * 0.5, y + th * 0.5, z], [0, y + th, z], [-w * 0.5, y + th * 0.5, z], [-w, y - th, z], [0, y - th * 1.5, z]] });
  }
  list.push(buildRemapV(loft(THREE, secs, true), 0, 0.62));
  // 어깨 핀: 원본 분리 런(r5~14) 실측 궤적 — 바깥 위 첨두에서 아래·안쪽으로 붙는 큰 삼각 날개(납작 단면).
  //  [zf, 중심(halfW 비), 반폭(halfW 비)]: 0.085→(0.965,0.025), 0.135→(0.815,0.125), 0.18→(0.625,0.195), 0.225→(0.535,0.055)
  const FIN = [[0.085, 0.965, 0.025], [0.135, 0.815, 0.125], [0.180, 0.625, 0.195], [0.225, 0.535, 0.055]];
  const finAt = (t) => {
    const f = t * (FIN.length - 1);
    const i0 = Math.max(0, Math.min(FIN.length - 2, Math.floor(f)));
    const u = Math.min(1, Math.max(0, f - i0));
    const a = FIN[i0], b = FIN[i0 + 1];
    return { zf: L_(a[0], b[0], u), cx: L_(a[1], b[1], u), w: L_(a[2], b[2], u) };
  };
  for (const side of [-1, 1]) {
    const fs = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const p = finAt(t);
      const cx = side * xOf(p.cx), z = zOf(p.zf);
      const w = Math.max(0.005, xOf(p.w)), th = Math.max(0.004, 0.016 * B4_LENGTH * (1 - Math.abs(t - 0.5)));
      const cy = L_(hTop(0.1) * 0.85, hTop(0.22) * 0.35, t);
      fs.push({ z, pts: [
        [cx + w * side, cy, z], [cx + w * 0.4 * side, cy + th, z], [cx - w * 0.7 * side, cy + th * 0.7, z],
        [cx - w * side, cy, z], [cx - w * 0.4 * side, cy - th, z], [cx + w * 0.5 * side, cy - th * 0.7, z],
      ] });
    }
    list.push(buildRemapV(loft(THREE, fs, true), 0, 0.62));
  }
  return mergeGeos(THREE, list);
}
// ── glow: 마젠타 촉수 4가닥(눈 밑 → 몸통) + 몸통 중앙 발광 라인 ──
function buildGlow(THREE, segs) {
  const list = [];
  for (const [sx, ex] of [[-0.30, -0.16], [-0.11, -0.05], [0.11, 0.05], [0.30, 0.16]]) {
    const gs = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const cx = xOf(L_(sx, ex, t)) * (1 + Math.sin(t * Math.PI) * 0.35);
      const cz = zOf(L_(0.155, 0.315, t));
      const cy = L_(hTop(0.16) * 0.85, hTop(0.31) * 0.55, t) + Math.sin(t * Math.PI * 2) * 0.006;
      const r = 0.012 * B4_LENGTH * (1 - t * 0.5);
      gs.push({ z: cz, pts: [[cx + r, cy, cz], [cx, cy + r, cz], [cx - r, cy, cz], [cx, cy - r, cz]] });
    }
    list.push(loft(THREE, gs, true));
  }
  // 중앙 발광 라인(창 마디) — 등면 얇은 튜브
  const spine = [];
  for (let s = 0; s <= segs + 3; s++) {
    const t = s / (segs + 3);
    const zf = L_(0.30, 0.90, t);
    const y = hTop(zf) * 1.04 + 0.003, z = zOf(zf);
    const r = 0.0062 * B4_LENGTH * (0.62 + Math.sin(t * Math.PI * 5) * 0.38);   // 마디 맥동(원본 점점이 발광) — 가늘게
    spine.push({ z, pts: [[r, y, z], [0, y + r, z], [-r, y, z], [0, y - r, z]] });
  }
  list.push(loft(THREE, spine, true));
  return mergeGeos(THREE, list);
}
// ── core: 조준경 눈(등면 큰 구) + 화염 창끝 ──
function buildCore(THREE, seg) {
  const zfEye = 0.115, yEye = hTop(zfEye) * 1.12, zEye = zOf(zfEye);
  const eye = new THREE.SphereGeometry(0.060 * B4_LENGTH, seg, Math.max(6, seg >> 1));
  eye.scale(1.0, 0.72, 1.0); eye.translate(0, yEye, zEye);
  const tip = new THREE.ConeGeometry(0.020 * B4_LENGTH, 0.10 * B4_LENGTH, Math.max(5, seg >> 1));
  tip.rotateX(-Math.PI / 2); tip.translate(0, 0, zOf(1.0) - 0.028 * B4_LENGTH);   // 창끝 화염(−Z 아래로)
  return mergeGeos(THREE, [eye, tip]);
}
// ── 동공(hull 버킷 — 어두운 세로 슬릿): 눈 위에 살짝 얹음 ──
function buildPupil(THREE) {
  const p = new THREE.SphereGeometry(0.022 * B4_LENGTH, 6, 5);
  p.scale(0.45, 0.7, 1.25);
  const zfEye = 0.115;
  p.translate(0, hTop(zfEye) * 1.12 + 0.048 * B4_LENGTH, zOf(zfEye));
  return buildRemapV(p, 0, 0.1);   // 텍스처 어두운 상단부
}

export const B4_LODS = [
  { stations: 26, seg: 12, tent: 6, fin: 6 },
  { stations: 14, seg: 8, tent: 4, fin: 4 },
  { stations: 8, seg: 6, tent: 3, fin: 3 },
];
/** B4 지오메트리(버킷 3: hull/glow/core). */
export function createB4Geometry(THREE, { lod = 0 } = {}) {
  const P = B4_LODS[Math.max(0, Math.min(2, lod))];
  const buckets = {
    hull: mergeGeos(THREE, [buildBody(THREE, P.stations), buildHead(THREE, P.fin), buildPupil(THREE)]),
    glow: buildGlow(THREE, P.tent),
    core: buildCore(THREE, P.seg),
  };
  let triangles = 0;
  for (const k in buckets) triangles += buckets[k].index.count / 3;
  return { buckets, triangles: Math.round(triangles), length: B4_LENGTH, halfW: HW };
}

// ── 결정적 장갑 텍스처(시드 13) — 다크 보라 + 세로 홈 + 세그 심 ──
export function forgeB4Hull(seed = 13, S = 128) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512); const pp = new Uint8Array(256);
  for (let i = 0; i < 256; i++) pp[i] = i;
  for (let i = 255; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; const t = pp[i]; pp[i] = pp[j]; pp[j] = t; }
  for (let i = 0; i < 512; i++) perm[i] = pp[i & 255];
  const hash = (x, y) => perm[(perm[x & 255] + y) & 255] / 255;
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (x, y) => { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi; const a = hash(xi, yi), b = hash(xi + 1, yi), cc = hash(xi, yi + 1), dd = hash(xi + 1, yi + 1); const u = sm(xf), v = sm(yf); return a + (b - a) * u + (cc - a) * v + (a - b - cc + dd) * u * v; };
  const albedo = new Uint8Array(S * S * 4), orm = new Uint8Array(S * S * 4);
  const height = new Float32Array(S * S);
  const mid = [0x4a, 0x2b, 0x52], dark = [0x24, 0x14, 0x30];
  for (let r = 0; r < S; r++) for (let cIdx = 0; cIdx < S; cIdx++) {
    const v = (r + 0.5) / S, u = (cIdx + 0.5) / S;
    const i4 = (r * S + cIdx) * 4, i1 = r * S + cIdx;
    const groove = Math.abs(((u * 5) % 1) - 0.5) < 0.065 ? 1 : 0;
    const seam = Math.abs(((v * 7) % 1) - 0.5) < 0.04 ? 1 : 0;
    const n = noise(u * 13, v * 13) * 0.6 + noise(u * 5, v * 5) * 0.4;
    const k = 0.5 + n * 0.55;
    let rr = L_(dark[0], mid[0], k), gg = L_(dark[1], mid[1], k), bb = L_(dark[2], mid[2], k);
    const dim = 1 - groove * 0.25 - seam * 0.22;
    albedo[i4] = rr * dim; albedo[i4 + 1] = gg * dim; albedo[i4 + 2] = bb * dim; albedo[i4 + 3] = 255;
    height[i1] = (n - 0.5) * 0.5 - groove * 0.6 - seam * 0.6;
    orm[i4] = 255 * (1 - groove * 0.22 - seam * 0.2);
    orm[i4 + 1] = 92 + (n - 0.5) * 80 + groove * 40;
    orm[i4 + 2] = 46;
    orm[i4 + 3] = 255;
  }
  const nrm = new Uint8Array(S * S * 4);
  const at = (x, y) => height[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 1.8, dy = (at(x, y + 1) - at(x, y - 1)) * 1.8;
    const inv = 1 / Math.hypot(dx, dy, 1); const i4 = (y * S + x) * 4;
    nrm[i4] = (-dx * inv * 0.5 + 0.5) * 255; nrm[i4 + 1] = (dy * inv * 0.5 + 0.5) * 255; nrm[i4 + 2] = (inv * 0.5 + 0.5) * 255; nrm[i4 + 3] = 255;
  }
  return { albedo, normal: nrm, orm, w: S, h: S };
}

/** B4 재질 3종. */
export function createB4Materials(THREE, { seed = 13, mobile = false } = {}) {
  const f = forgeB4Hull(seed, mobile ? 64 : 128);
  const mk = (data, srgb) => { const t = new THREE.DataTexture(data, f.w, f.h, THREE.RGBAFormat, THREE.UnsignedByteType); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 2; t.channel = 0; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  const map = mk(f.albedo, true), normal = mk(f.normal, false), orm = mk(f.orm, false);
  const mats = {
    hull: new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.9, 0.9), aoMap: orm, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, envMapIntensity: 0.5 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x2c0a1e, emissive: 0xd4367f, emissiveIntensity: 2.0, metalness: 0.1, roughness: 0.35 }),
    core: new THREE.MeshStandardMaterial({ color: 0x2a1404, emissive: 0xff9a2e, emissiveIntensity: 1.8, metalness: 0.05, roughness: 0.3 }),
  };
  return { mats, textures: [map, normal, orm], dispose() { for (const t of [map, normal, orm]) t.dispose(); for (const k in mats) mats[k].dispose(); } };
}

/** 단일 B4 모델(검사실·전시용). */
export function createB4Model(THREE, { seed = 13, mobile = false, lods = [0, 1, 2] } = {}) {
  const matlib = createB4Materials(THREE, { seed, mobile });
  const group = new THREE.Group(); group.name = 'B4';
  const lodGroups = new Map(); const geos = []; const triByLod = {};
  for (const lod of lods) {
    const geo = createB4Geometry(THREE, { lod });
    geos.push(geo); triByLod[lod] = geo.triangles;
    const g = new THREE.Group(); g.name = 'B4_LOD' + lod;
    for (const k in geo.buckets) { const m = new THREE.Mesh(geo.buckets[k], matlib.mats[k]); m.name = 'b4_' + k; g.add(m); }
    g.visible = false; group.add(g); lodGroups.set(lod, g);
  }
  let active = lods[0]; lodGroups.get(active).visible = true;
  function setLOD(lod) { if (!lodGroups.has(lod) || lod === active) return active; lodGroups.get(active).visible = false; lodGroups.get(lod).visible = true; active = lod; return active; }
  function update(time) {
    matlib.mats.core.emissiveIntensity = 1.8 + Math.sin(time * 6.1) * 0.5;   // 조준 눈 맥동
    matlib.mats.glow.emissiveIntensity = 1.9 + Math.sin(time * 3.3 + 1) * 0.35;
  }
  function stats() { return { lod: active, triangles: triByLod[active], triByLod: { ...triByLod } }; }
  function dispose() { for (const geo of geos) for (const k in geo.buckets) geo.buckets[k].dispose(); matlib.dispose(); }
  return { group, setLOD, update, stats, dispose, matlib, get lod() { return active; } };
}
export default { createB4Geometry, createB4Model, createB4Materials, forgeB4Hull, b4Body, B4_ROWS, B4_LODS, B4_LENGTH, B4_ASPECT };
