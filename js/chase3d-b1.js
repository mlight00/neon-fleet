// ── B1 소형 크리처 절차적 3D (AURORA 승인 후 1종 — 같은 파이프라인) ──
//  단일 진실: 원본 B1.webp 알파 디지타이즈(아래 B1_ROWS, tests/fixtures/b1-planform.json 동일 출처, aspect 0.4617).
//  정체성: 상단 첨두 + 계단식 등갑 + 좌우로 굽은 뿔(마젠타 내연) + 하단 전면 주황 코어 + 긴 꼬리침.
//  좌표: 등 첨두 = +Z(먼쪽), 코어·침 = −Z(플레이어/카메라쪽 전면) — 접근 방향이 코어로 읽힌다(§4.2).
//  버킷 3(hull/glow/core) → 스웜을 InstancedMesh 3개(=3 draw)로 그릴 수 있게 버킷별 단일 지오메트리 병합.
//  THREE 주입 → Node 검증 가능. Math.random 금지(mulberry32).
import { mulberry32, mergeGeos } from './chase3d-aurora-geometry.js';

export const B1_ROWS = [[[0.005,0.041]],[[0.005,0.078]],[[0.005,0.115]],[[0.005,0.134]],[[0.005,0.143]],[[0.005,0.161]],[[0.005,0.189],[0.871,0.954]],[[0.005,0.207],[0.862,0.982]],[[0.005,0.235],[0.853,0.991]],[[0.005,0.235],[0.825,1]],[[0.005,0.272],[0.788,1]],[[0.005,0.272],[0.733,1]],[[0.005,0.309],[0.677,1]],[[0.005,0.346],[0.641,0.991]],[[0.005,0.373],[0.594,0.991]],[[0.005,0.401],[0.539,0.982]],[[0.005,0.419],[0.567,0.972]],[[0.005,0.438],[0.558,0.954]],[[0.005,0.438],[0.512,0.917]],[[0.005,0.889]],[[0.005,0.733],[0.779,0.871]],[[0.005,0.687],[0.797,0.834]],[[0.005,0.668]],[[0.005,0.65]],[[0.005,0.641]],[[0.005,0.631],[0.659,0.677]],[[0.005,0.714]],[[0.005,0.724]],[[0.005,0.733]],[[0.005,0.733]],[[0.005,0.733]],[[0.005,0.724]],[[0.005,0.714]],[[0.005,0.705]],[[0.005,0.687]],[[0.005,0.668]],[[0.005,0.641]],[[0.005,0.622]],[[0.005,0.594]],[[0.005,0.567]],[[0.005,0.484]],[[0.005,0.475]],[[0.005,0.512]],[[0.005,0.493]],[[0.005,0.484]],[[0.005,0.465]],[[0.005,0.447]],[[0.005,0.429]],[[0.005,0.401]],[[0.005,0.373]],[[0.005,0.327]],[[0.005,0.327]],[[0.005,0.309]],[[0.005,0.272]],[[0.005,0.244]],[[0.005,0.207]],[[0.005,0.18]],[[0.005,0.134]],[[0.005,0.115]],[[0.005,0.097]],[[0.005,0.078]],[[0.005,0.06]],[[0.005,0.032]],[[0.005,0.02]]];
export const B1_ASPECT = 0.4617;
export const B1_LENGTH = 1.0;              // 모델 단위 전장(배치 시 r 로 스케일)
const HW = 0.5 * B1_ASPECT * B1_LENGTH;    // 최대 반폭

const L_ = (a, b, t) => a + (b - a) * t;
function rowsAt(zf) {
  const f = Math.min(0.999999, Math.max(0, zf)) * B1_ROWS.length - 0.5;
  const i0 = Math.max(0, Math.min(B1_ROWS.length - 1, Math.floor(f)));
  const i1 = Math.min(B1_ROWS.length - 1, i0 + 1);
  const t = Math.min(1, Math.max(0, f - i0));
  return { r0: B1_ROWS[i0], r1: B1_ROWS[i1], t };
}
/** 중앙 몸통 반폭(첫 런) — 뿔 합류행(r19, 0.889)은 몸통 캡 0.75 로 절단(뿔이 재현) */
export function b1Body(zf) {
  const { r0, r1, t } = rowsAt(zf);
  return Math.min(0.75, L_(r0[0][1], r1[0][1], t));
}
function keys(z, table) {
  if (z <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) if (z <= table[i][0]) { const [z0, v0] = table[i - 1], [z1, v1] = table[i]; return L_(v0, v1, (z - z0) / (z1 - z0)); }
  return table[table.length - 1][1];
}
// 높이 프로파일(전장 비율): 등쪽 융기(갑충 방패), 배쪽 얕음. 코어 구간(0.68~0.78) 배가 부풂.
const hTop = (z) => keys(z, [[0, 0.012], [0.12, 0.05], [0.3, 0.085], [0.45, 0.095], [0.6, 0.08], [0.75, 0.06], [0.9, 0.028], [1, 0.008]]) * B1_LENGTH;
const hBot = (z) => keys(z, [[0, 0.008], [0.12, 0.03], [0.3, 0.05], [0.45, 0.058], [0.62, 0.062], [0.72, 0.07], [0.82, 0.045], [0.92, 0.02], [1, 0.006]]) * B1_LENGTH;
const zOf = (zf) => (0.5 - zf) * B1_LENGTH;   // +Z=등 첨두, −Z=전면 침
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
// 닫힌 링 loft(캡 포함) — 몸통·뿔·핀 공용
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

// ── 몸통: 방패형 8점 단면 링 loft(등 융기·배 좁음) ──
function buildBody(THREE, stations) {
  const secs = [];
  for (let s = 0; s <= stations; s++) {
    const zf = 0.004 + (s / stations) * 0.992;
    const w = Math.max(0.008, xOf(b1Body(zf))), ht = hTop(zf), hb = hBot(zf), z = zOf(zf);
    secs.push({ z, pts: [
      [w, 0.1 * ht, z], [w * 0.72, ht * 0.7, z], [w * 0.3, ht, z], [-w * 0.3, ht, z], [-w * 0.72, ht * 0.7, z], [-w, 0.1 * ht, z],
      [-w * 0.6, -hb * 0.8, z], [0, -hb, z], [w * 0.6, -hb * 0.8, z],
    ] });
  }
  return loft(THREE, secs, true);
}
// ── 등갑 계단판 3장: 위로 겹치는 챔퍼 방패(정체성 "계단식 등갑") ──
function buildCarapace(THREE) {
  // 몸통 "위에 얹히는" 좁은 융기판 — 몸통 밖으로 삐져나오지 않게 폭 0.58, 리프트로 계단 강조
  const list = [];
  for (const [zf0, zf1, lift] of [[0.08, 0.30, 1.10], [0.26, 0.52, 1.18], [0.48, 0.72, 1.10]]) {
    const secs = [];
    for (let s = 0; s <= 6; s++) {
      const zf = zf0 + (s / 6) * (zf1 - zf0);
      const edge = s === 0 || s === 6 ? 0.55 : 1;   // 앞뒤 끝은 좁혀 몸통에 파묻힘(절단면 은닉)
      const w = xOf(b1Body(zf)) * 0.58 * edge, y = hTop(zf) * lift, z = zOf(zf);
      const th = 0.013 * B1_LENGTH * edge;
      secs.push({ z, pts: [[w, y - th, z], [w * 0.55, y + th * 0.6, z], [0, y + th, z], [-w * 0.55, y + th * 0.6, z], [-w, y - th, z], [0, y - th * 1.6, z]] });
    }
    list.push(loft(THREE, secs, true));
  }
  return mergeGeos(THREE, list);
}
// ── 굽은 뿔(위 큰 쌍 + 중간 핀 쌍): 원본 둘째 런의 굽이를 따라가는 콘형 loft ──
function hornCurve(THREE, side, base, tip, segs, r0) {
  // base→tip 을 2차 곡선(바깥→위→뒤)으로 보간, 반경은 테이퍼
  const secs = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const mid = [L_(base[0], tip[0], 0.5) + side * 0.06, L_(base[1], tip[1], 0.5) + 0.02, L_(base[2], tip[2], 0.5)];
    const P = (i) => { const a = L_(base[i], mid[i], t), b = L_(mid[i], tip[i], t); return L_(a, b, t); };
    const cx = P(0), cy = P(1), cz = P(2);
    const r = Math.max(0.004, r0 * (1 - t * 0.92));
    secs.push({ z: cz, pts: [[cx + r, cy, cz], [cx + r * 0.5, cy + r * 0.9, cz], [cx - r * 0.5, cy + r * 0.9, cz], [cx - r, cy, cz], [cx - r * 0.5, cy - r * 0.9, cz], [cx + r * 0.5, cy - r * 0.9, cz]] });
  }
  return loft(THREE, secs, true);
}
function buildHorns(THREE, segs) {
  const hull = [], glow = [];
  for (const side of [-1, 1]) {
    // 큰 뿔: 몸통 측면(zf 0.28)에서 바깥·위·뒤(+Z 첨두 방향)로 — 원본 r6~18 분리 런의 끝(1.0 폭, zf≈0.15)
    hull.push(hornCurve(THREE, side, [side * xOf(0.30), hTop(0.30) * 0.5, zOf(0.30)], [side * xOf(0.97), hTop(0.3) * 1.9, zOf(0.115)], segs, 0.035 * B1_LENGTH));
    // 중간 핀: r20~21 [0.78~0.87] — 짧고 뒤로 굽음
    hull.push(hornCurve(THREE, side, [side * xOf(0.55), hTop(0.33) * 0.25, zOf(0.325)], [side * xOf(0.845), hTop(0.33) * 0.9, zOf(0.30)], Math.max(4, segs - 3), 0.02 * B1_LENGTH));
    // 마젠타 내연 스트립(뿔 안쪽) — 원본의 발광 홈
    const gs = [];
    for (let s = 0; s <= 5; s++) {
      const t = s / 5;
      const cx = side * L_(xOf(0.34), xOf(0.88), t), cy = L_(hTop(0.3) * 0.62, hTop(0.3) * 1.75, t) , cz = L_(zOf(0.295), zOf(0.13), t);
      const r = 0.011 * B1_LENGTH * (1 - t * 0.6);
      gs.push({ z: cz, pts: [[cx + r, cy, cz], [cx, cy + r, cz], [cx - r, cy, cz], [cx, cy - r, cz]] });
    }
    glow.push(loft(THREE, gs, true));
  }
  return { hull: mergeGeos(THREE, hull), glow: mergeGeos(THREE, glow) };
}
// ── 전면 주황 코어(−Z 하부) + 소켓 링 ──
function buildCore(THREE, seg) {
  // 전면 하부 배면을 뚫고 돌출하는 눈/코어(원본의 주황 발광) — 배 표면 밖으로 확실히 노출
  const zf = 0.74, y = -hBot(zf) * 0.72, z = zOf(zf);
  const core = new THREE.SphereGeometry(0.055 * B1_LENGTH, seg, Math.max(6, seg >> 1));
  core.scale(0.78, 0.9, 1.15); core.translate(0, y - 0.015 * B1_LENGTH, z - 0.01);
  const ring = new THREE.TorusGeometry(0.06 * B1_LENGTH, 0.013 * B1_LENGTH, 6, seg);
  ring.rotateX(Math.PI * 0.42);   // 배면 경사에 맞춘 소켓 링
  ring.translate(0, y - 0.006 * B1_LENGTH, z + 0.01);
  return { core, ring };
}

export const B1_LODS = [
  { stations: 30, hornSegs: 9, coreSeg: 14 },
  { stations: 16, hornSegs: 6, coreSeg: 10 },
  { stations: 8, hornSegs: 4, coreSeg: 6 },
];
/** B1 지오메트리(버킷 3: hull/glow/core). triangles 는 실측 합계. */
export function createB1Geometry(THREE, { lod = 0 } = {}) {
  const P = B1_LODS[Math.max(0, Math.min(2, lod))];
  const horns = buildHorns(THREE, P.hornSegs);
  const c = buildCore(THREE, P.coreSeg);
  const buckets = {
    hull: mergeGeos(THREE, [buildBody(THREE, P.stations), buildCarapace(THREE), horns.hull, c.ring]),
    glow: horns.glow,
    core: c.core,
  };
  let triangles = 0;
  for (const k in buckets) triangles += buckets[k].index.count / 3;
  return { buckets, triangles: Math.round(triangles), length: B1_LENGTH, halfW: HW };
}

// ── 결정적 키틴 텍스처(순수) — 보라 그라데이션 + 세로 홈 + 플레이트 심 ──
export function forgeB1Hull(seed = 7, S = 128) {
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
  const mid = [0x9f, 0x7c, 0xa9], dark = [0x3a, 0x24, 0x40];
  for (let r = 0; r < S; r++) for (let cIdx = 0; cIdx < S; cIdx++) {
    const v = (r + 0.5) / S, u = (cIdx + 0.5) / S;
    const i4 = (r * S + cIdx) * 4, i1 = r * S + cIdx;
    const groove = Math.abs(((u * 6) % 1) - 0.5) < 0.075 ? 1 : 0;         // 세로 홈(갑각 골) — 과밀 방지
    const seam = Math.abs(((v * 4) % 1) - 0.5) < 0.045 ? 1 : 0;          // 가로 플레이트 심
    const n = noise(u * 14, v * 14) * 0.6 + noise(u * 5, v * 5) * 0.4;
    const k = 0.55 + n * 0.5;                                             // 밝은 상단→어두운 하단은 그라데이션 대신 노이즈 혼합
    let rr = L_(dark[0], mid[0], k), gg = L_(dark[1], mid[1], k), bb = L_(dark[2], mid[2], k);
    const dim = 1 - groove * 0.28 - seam * 0.2;
    albedo[i4] = rr * dim; albedo[i4 + 1] = gg * dim; albedo[i4 + 2] = bb * dim; albedo[i4 + 3] = 255;
    height[i1] = (n - 0.5) * 0.5 - groove * 0.7 - seam * 0.5;
    orm[i4] = 255 * (1 - groove * 0.25 - seam * 0.2);
    orm[i4 + 1] = 96 + (n - 0.5) * 90 + groove * 40;                      // 키틴 = 반질(낮은 rough)
    orm[i4 + 2] = 40;                                                     // 비금속
    orm[i4 + 3] = 255;
  }
  // normal (aurora materials 의 방식과 동일한 Sobel)
  const nrm = new Uint8Array(S * S * 4);
  const at = (x, y) => height[((y + S) % S) * S + ((x + S) % S)];
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 1.8, dy = (at(x, y + 1) - at(x, y - 1)) * 1.8;
    const inv = 1 / Math.hypot(dx, dy, 1); const i4 = (y * S + x) * 4;
    nrm[i4] = (-dx * inv * 0.5 + 0.5) * 255; nrm[i4 + 1] = (dy * inv * 0.5 + 0.5) * 255; nrm[i4 + 2] = (inv * 0.5 + 0.5) * 255; nrm[i4 + 3] = 255;
  }
  return { albedo, normal: nrm, orm, w: S, h: S };
}

/** B1 재질 3종 + 텍스처. mobile 이면 64². */
export function createB1Materials(THREE, { seed = 7, mobile = false } = {}) {
  const f = forgeB1Hull(seed, mobile ? 64 : 128);
  const mk = (data, srgb) => { const t = new THREE.DataTexture(data, f.w, f.h, THREE.RGBAFormat, THREE.UnsignedByteType); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 2; t.channel = 0; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  const map = mk(f.albedo, true), normal = mk(f.normal, false), orm = mk(f.orm, false);
  const mats = {
    hull: new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.9, 0.9), aoMap: orm, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, envMapIntensity: 0.5 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x2a0618, emissive: 0xc81d76, emissiveIntensity: 2.2, metalness: 0.1, roughness: 0.35 }),
    core: new THREE.MeshStandardMaterial({ color: 0x2a1404, emissive: 0xff7d14, emissiveIntensity: 1.5, metalness: 0.05, roughness: 0.3 }),
  };
  return { mats, textures: [map, normal, orm], dispose() { for (const t of [map, normal, orm]) t.dispose(); for (const k in mats) mats[k].dispose(); } };
}

/** 단일 B1 모델(검사실·전시용). update 로 발광 펄스. */
export function createB1Model(THREE, { seed = 7, mobile = false, lods = [0, 1, 2] } = {}) {
  const matlib = createB1Materials(THREE, { seed, mobile });
  const group = new THREE.Group(); group.name = 'B1';
  const lodGroups = new Map(); const geos = []; const triByLod = {};
  for (const lod of lods) {
    const geo = createB1Geometry(THREE, { lod });
    geos.push(geo); triByLod[lod] = geo.triangles;
    const g = new THREE.Group(); g.name = 'B1_LOD' + lod;
    for (const k in geo.buckets) { const m = new THREE.Mesh(geo.buckets[k], matlib.mats[k]); m.name = 'b1_' + k; g.add(m); }
    g.visible = false; group.add(g); lodGroups.set(lod, g);
  }
  let active = lods[0]; lodGroups.get(active).visible = true;
  function setLOD(lod) { if (!lodGroups.has(lod) || lod === active) return active; lodGroups.get(active).visible = false; lodGroups.get(lod).visible = true; active = lod; return active; }
  function update(time) {
    matlib.mats.core.emissiveIntensity = 1.5 + Math.sin(time * 5.3) * 0.35;
    matlib.mats.glow.emissiveIntensity = 2.0 + Math.sin(time * 3.7 + 1) * 0.4;
  }
  function stats() { return { lod: active, triangles: triByLod[active], triByLod: { ...triByLod } }; }
  function dispose() { for (const geo of geos) for (const k in geo.buckets) geo.buckets[k].dispose(); matlib.dispose(); }
  return { group, setLOD, update, stats, dispose, matlib, get lod() { return active; } };
}
export default { createB1Geometry, createB1Model, createB1Materials, forgeB1Hull, b1Body, B1_ROWS, B1_LODS, B1_LENGTH, B1_ASPECT };
