// ── B2 중형 크리처 절차적 3D (이사 승인 — B1 과 같은 파이프라인) ──
//  단일 진실: 원본 B2.webp 알파 디지타이즈(아래 B2_ROWS, tests/fixtures/b2-planform.json 동일 출처, aspect 0.7617).
//  정체성: 방추형 세그먼트 몸통 + 등면 주황 벌집 코어 + 좌우 "낫형 블레이드 팔"(마젠타 힘줄, 끝은 뼈색 클로)
//         + 노즈 옆 작은 뿔 2 + 후방 측면 침 2.
//  좌표: 노즈 = +Z(먼쪽), 팔 끝 = −Z(플레이어/카메라쪽) — mid Creature(리퍼)의 낫이 카메라를 향해 덮쳐온다.
//  버킷 3(hull/glow/core) 유지 → 실전 InstancedMesh 3개(=+3 draw). THREE 주입, Math.random 금지(mulberry32).
import { mulberry32, mergeGeos } from './chase3d-aurora-geometry.js';

export const B2_ROWS = [[[0,0.028]],[[0,0.056]],[[0,0.078]],[[0,0.101]],[[0,0.112]],[[0,0.145]],[[0,0.173]],[[0,0.184]],[[0,0.179],[0.257,0.307]],[[0,0.168],[0.257,0.335]],[[0,0.196],[0.251,0.358]],[[0,0.374]],[[0,0.385]],[[0,0.391]],[[0,0.397]],[[0,0.391],[0.57,0.603]],[[0,0.385],[0.57,0.648]],[[0,0.313],[0.33,0.369],[0.575,0.693]],[[0,0.296],[0.581,0.726]],[[0,0.313],[0.363,0.38],[0.581,0.76]],[[0,0.391],[0.553,0.788]],[[0,0.391],[0.553,0.816]],[[0,0.385],[0.547,0.838]],[[0,0.38],[0.52,0.86]],[[0,0.363],[0.486,0.877]],[[0,0.899]],[[0,0.916]],[[0,0.933]],[[0,0.944]],[[0,0.955]],[[0,0.966]],[[0,0.972]],[[0,0.402],[0.458,0.978]],[[0,0.397],[0.492,0.983]],[[0,0.402],[0.508,0.989]],[[0,0.441],[0.592,0.994]],[[0,0.458],[0.615,1]],[[0,0.464],[0.62,1]],[[0,0.464],[0.631,1]],[[0,0.458],[0.637,1]],[[0,0.436],[0.637,0.994]],[[0,0.402],[0.631,0.989]],[[0,0.385],[0.626,0.978]],[[0,0.346],[0.637,0.978]],[[0,0.363],[0.642,0.966]],[[0,0.179],[0.229,0.369],[0.642,0.955]],[[0,0.162],[0.246,0.363],[0.62,0.944]],[[0,0.173],[0.251,0.346],[0.615,0.927]],[[0,0.151],[0.251,0.335],[0.609,0.916]],[[0,0.117],[0.24,0.307],[0.598,0.894]],[[0,0.101],[0.223,0.279],[0.57,0.877]],[[0,0.101],[0.207,0.24],[0.559,0.86]],[[0,0.078],[0.547,0.832]],[[0,0.05],[0.531,0.81]],[[0,0.022],[0.52,0.782]],[[0.48,0.749]],[[0.464,0.721]],[[0.441,0.687]],[[0.413,0.642]],[[0.385,0.598]],[[0.352,0.547]],[[0.313,0.48]],[[0.268,0.413]],[[0.223,0.313]]];
export const B2_ASPECT = 0.7617;
export const B2_LENGTH = 1.0;              // 모델 단위 전장(배치 시 화면 크기로 스케일)
const HW = 0.5 * B2_ASPECT * B2_LENGTH;    // 최대 반폭

const L_ = (a, b, t) => a + (b - a) * t;
function rowsAt(zf) {
  const f = Math.min(0.999999, Math.max(0, zf)) * B2_ROWS.length - 0.5;
  const i0 = Math.max(0, Math.min(B2_ROWS.length - 1, Math.floor(f)));
  const i1 = Math.min(B2_ROWS.length - 1, i0 + 1);
  const t = Math.min(1, Math.max(0, f - i0));
  return { r0: B2_ROWS[i0], r1: B2_ROWS[i1], t };
}
/** 중앙 몸통 반폭. 첫 런의 시작이 0.1 이하일 때만 몸통(그 외 = 팔 런). 합류 구간(r25~31, 0.9+)은 캡 0.47 로 절단(팔이 재현). */
export function b2Body(zf) {
  const { r0, r1, t } = rowsAt(zf);
  const w0 = r0[0][0] < 0.1 ? r0[0][1] : 0;
  const w1 = r1[0][0] < 0.1 ? r1[0][1] : 0;
  return Math.min(0.47, L_(w0, w1, t));
}
function keys(z, table) {
  if (z <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) if (z <= table[i][0]) { const [z0, v0] = table[i - 1], [z1, v1] = table[i]; return L_(v0, v1, (z - z0) / (z1 - z0)); }
  return table[table.length - 1][1];
}
// 높이 프로파일(전장 비율): 중형답게 두툼한 방추. 등 융기 최대 zf 0.45, 코어 구간(0.40~0.60) 등이 부풂.
const hTop = (z) => keys(z, [[0, 0.012], [0.12, 0.06], [0.28, 0.10], [0.45, 0.118], [0.58, 0.105], [0.72, 0.075], [0.86, 0.03], [1, 0.008]]) * B2_LENGTH;
const hBot = (z) => keys(z, [[0, 0.008], [0.12, 0.04], [0.3, 0.062], [0.5, 0.072], [0.7, 0.055], [0.86, 0.022], [1, 0.006]]) * B2_LENGTH;
const zOf = (zf) => (0.5 - zf) * B2_LENGTH;   // +Z=노즈, −Z=팔 끝
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
/** UV v 리매핑 — 텍스처 세로 밴드 배정(몸통 0~0.5 / 팔 0.55~1.0, 팔 끝 0.9+ = 뼈색 클로 밴드). */
function remapV(geo, a, b) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, a + uv.getY(i) * (b - a));
  uv.needsUpdate = true;
  return geo;
}

// ── 몸통: 9점 방추 링 loft ──
function buildBody(THREE, stations) {
  const secs = [];
  for (let s = 0; s <= stations; s++) {
    const zf = 0.006 + (s / stations) * 0.87;   // 몸통은 zf~0.876 에서 끝(이후는 팔뿐)
    const w = Math.max(0.008, xOf(b2Body(zf))), ht = hTop(zf), hb = hBot(zf), z = zOf(zf);
    secs.push({ z, pts: [
      [w, 0.08 * ht, z], [w * 0.74, ht * 0.66, z], [w * 0.32, ht, z], [-w * 0.32, ht, z], [-w * 0.74, ht * 0.66, z], [-w, 0.08 * ht, z],
      [-w * 0.62, -hb * 0.8, z], [0, -hb, z], [w * 0.62, -hb * 0.8, z],
    ] });
  }
  return remapV(loft(THREE, secs, true), 0, 0.5);
}
// ── 세그먼트 장갑판 4장(원본의 계단 플레이트) ──
function buildPlates(THREE) {
  const list = [];
  for (const [zf0, zf1, lift] of [[0.05, 0.20, 1.10], [0.17, 0.35, 1.16], [0.32, 0.52, 1.14], [0.49, 0.68, 1.08]]) {
    const secs = [];
    for (let s = 0; s <= 6; s++) {
      const zf = zf0 + (s / 6) * (zf1 - zf0);
      const edge = s === 0 || s === 6 ? 0.5 : 1;
      const w = xOf(b2Body(zf)) * 0.62 * edge, y = hTop(zf) * lift, z = zOf(zf);
      const th = 0.015 * B2_LENGTH * edge;
      secs.push({ z, pts: [[w, y - th, z], [w * 0.55, y + th * 0.6, z], [0, y + th, z], [-w * 0.55, y + th * 0.6, z], [-w, y - th, z], [0, y - th * 1.6, z]] });
    }
    list.push(remapV(loft(THREE, secs, true), 0, 0.5));
  }
  return mergeGeos(THREE, list);
}
// ── 낫형 블레이드 팔(정체성 핵심): 원본 팔 런의 궤적 키프레임을 따라가는 납작 단면 loft ──
//  [zf, 중심x(halfW 비), 반폭(halfW 비), y(전장 비)] — fixture r15~63 실측.
const ARM_PATH = [
  [0.245, 0.585, 0.020, 0.045],
  [0.320, 0.660, 0.095, 0.035],
  [0.430, 0.745, 0.150, 0.022],
  [0.560, 0.805, 0.185, 0.008],
  [0.680, 0.800, 0.165, -0.004],
  [0.790, 0.720, 0.145, -0.014],
  [0.880, 0.600, 0.115, -0.020],
  [0.945, 0.450, 0.075, -0.024],
  [0.995, 0.270, 0.032, -0.026],
];
function armAt(t) {
  const f = t * (ARM_PATH.length - 1);
  const i0 = Math.max(0, Math.min(ARM_PATH.length - 2, Math.floor(f)));
  const u = Math.min(1, Math.max(0, f - i0));
  const a = ARM_PATH[i0], b = ARM_PATH[i0 + 1];
  return { zf: L_(a[0], b[0], u), cx: L_(a[1], b[1], u), w: L_(a[2], b[2], u), y: L_(a[3], b[3], u) * B2_LENGTH };
}
function buildArms(THREE, segs) {
  const hull = [], glow = [];
  for (const side of [-1, 1]) {
    const secs = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const p = armAt(t);
      const cx = side * xOf(p.cx), z = zOf(p.zf);
      const w = Math.max(0.006, xOf(p.w)), th = Math.max(0.005, 0.022 * B2_LENGTH * (1 - t * 0.55));
      // 납작 블레이드 단면 6점(수평 폭 w, 위로 약간 볼록) — 바깥 모서리가 칼날
      secs.push({ z, pts: [
        [cx + w * side, p.y, z], [cx + w * 0.45 * side, p.y + th, z], [cx - w * 0.75 * side, p.y + th * 0.7, z],
        [cx - w * side, p.y, z], [cx - w * 0.45 * side, p.y - th * 0.8, z], [cx + w * 0.5 * side, p.y - th * 0.7, z],
      ] });
    }
    hull.push(remapV(loft(THREE, secs, true), 0.55, 1.0));   // 끝(v 0.9+) = 뼈색 클로 밴드
    // 팔 안쪽 마젠타 힘줄 스트립
    const gs = [];
    for (let s = 0; s <= Math.max(4, segs - 4); s++) {
      const t = 0.12 + (s / Math.max(4, segs - 4)) * 0.72;
      const p = armAt(t);
      const cx = side * xOf(p.cx - p.w * 0.55), z = zOf(p.zf);
      const r = 0.012 * B2_LENGTH * (1 - t * 0.45);
      gs.push({ z, pts: [[cx + r, p.y + 0.004, z], [cx, p.y + 0.004 + r, z], [cx - r, p.y + 0.004, z], [cx, p.y + 0.004 - r, z]] });
    }
    glow.push(loft(THREE, gs, true));
  }
  return { hull: mergeGeos(THREE, hull), glow: mergeGeos(THREE, glow) };
}
// ── 노즈 옆 작은 뿔 2(r8~10) + 후방 측면 침 2(r45~51) ──
function buildSpurs(THREE, segs) {
  const list = [];
  const spike = (side, base, tip, r0) => {
    const secs = [];
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const cx = L_(base[0], tip[0], t) * side, cy = L_(base[1], tip[1], t), cz = L_(base[2], tip[2], t);
      const r = Math.max(0.004, r0 * (1 - t * 0.9));
      secs.push({ z: cz, pts: [[cx + r, cy, cz], [cx, cy + r, cz], [cx - r, cy, cz], [cx, cy - r, cz]] });
    }
    return remapV(loft(THREE, secs, true), 0, 0.5);
  };
  for (const side of [-1, 1]) {
    list.push(spike(side, [xOf(0.17), hTop(0.14) * 0.5, zOf(0.145)], [xOf(0.35), hTop(0.14) * 1.1, zOf(0.115)], 0.020 * B2_LENGTH));   // 노즈 뿔
    list.push(spike(side, [xOf(0.14), 0, zOf(0.74)], [xOf(0.345), -hBot(0.74) * 0.4, zOf(0.775)], 0.018 * B2_LENGTH));                // 후방 침
  }
  return mergeGeos(THREE, list);
}
// ── 등면 주황 벌집 코어(+Y, 원본 정중앙 — 가장 눈에 띄는 정체성) + 소켓 링 + 몸 중앙선 힘줄 ──
//  세그먼트 장갑판(lift ~1.16)보다 확실히 위로 돌출시켜 top/함미 시점에서 항상 보이게 한다.
function buildCore(THREE, seg) {
  const zf = 0.50, y = hTop(zf) * 1.18, z = zOf(zf);
  const core = new THREE.SphereGeometry(0.095 * B2_LENGTH, seg, Math.max(6, seg >> 1));
  core.scale(0.74, 0.5, 1.05); core.translate(0, y, z);
  const ring = new THREE.TorusGeometry(0.10 * B2_LENGTH, 0.017 * B2_LENGTH, 6, seg);
  ring.rotateX(Math.PI * 0.5);   // 등면에 눕힌 소켓 링
  ring.translate(0, y - 0.012 * B2_LENGTH, z);
  return { core, ring: remapV(ring, 0, 0.5) };
}
function buildSinew(THREE, segs) {
  // 몸 중앙선(노즈→코어→꼬리) 마젠타 힘줄 — 장갑판(lift ≤1.16) 위로 노출
  const gs = [];
  for (let s = 0; s <= segs; s++) {
    const t = s / segs;
    const zf = L_(0.10, 0.82, t);
    const y = hTop(zf) * 1.20 + 0.004, z = zOf(zf);
    const r = 0.011 * B2_LENGTH * (1 - Math.abs(t - 0.5) * 0.8);
    gs.push({ z, pts: [[r, y, z], [0, y + r, z], [-r, y, z], [0, y - r, z]] });
  }
  return loft(THREE, gs, true);
}

export const B2_LODS = [
  { stations: 26, armSegs: 14, seg: 12, spurSegs: 6 },
  { stations: 14, armSegs: 9, seg: 8, spurSegs: 4 },
  { stations: 8, armSegs: 6, seg: 6, spurSegs: 3 },
];
/** B2 지오메트리(버킷 3: hull/glow/core). triangles 는 실측 합계. */
export function createB2Geometry(THREE, { lod = 0 } = {}) {
  const P = B2_LODS[Math.max(0, Math.min(2, lod))];
  const arms = buildArms(THREE, P.armSegs);
  const c = buildCore(THREE, P.seg);
  const buckets = {
    hull: mergeGeos(THREE, [buildBody(THREE, P.stations), buildPlates(THREE), arms.hull, buildSpurs(THREE, P.spurSegs), c.ring]),
    glow: mergeGeos(THREE, [arms.glow, buildSinew(THREE, Math.max(6, P.armSegs - 4))]),
    core: c.core,
  };
  let triangles = 0;
  for (const k in buckets) triangles += buckets[k].index.count / 3;
  return { buckets, triangles: Math.round(triangles), length: B2_LENGTH, halfW: HW };
}

// ── 결정적 키틴 텍스처 — B1 파이프라인 + B2 팔레트 + 뼈색 클로 밴드(v>0.90) ──
export function forgeB2Hull(seed = 11, S = 128) {
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
  const mid = [0x7c, 0x55, 0x90], dark = [0x35, 0x20, 0x3f], bone = [0xd8, 0xcb, 0xaa];
  for (let r = 0; r < S; r++) for (let cIdx = 0; cIdx < S; cIdx++) {
    const v = (r + 0.5) / S, u = (cIdx + 0.5) / S;
    const i4 = (r * S + cIdx) * 4, i1 = r * S + cIdx;
    const claw = v > 0.90 ? 1 : 0;                                        // 팔 끝 클로 밴드(뼈색·매끈)
    const groove = Math.abs(((u * 7) % 1) - 0.5) < 0.07 ? 1 : 0;
    const seam = Math.abs(((v * 5) % 1) - 0.5) < 0.04 ? 1 : 0;
    const n = noise(u * 15, v * 15) * 0.6 + noise(u * 6, v * 6) * 0.4;
    const k = 0.5 + n * 0.55;
    let rr, gg, bb;
    if (claw) { const kb = 0.75 + n * 0.3; rr = bone[0] * kb; gg = bone[1] * kb; bb = bone[2] * kb; }
    else {
      rr = L_(dark[0], mid[0], k); gg = L_(dark[1], mid[1], k); bb = L_(dark[2], mid[2], k);
      const dim = 1 - groove * 0.26 - seam * 0.2;
      rr *= dim; gg *= dim; bb *= dim;
    }
    albedo[i4] = rr; albedo[i4 + 1] = gg; albedo[i4 + 2] = bb; albedo[i4 + 3] = 255;
    height[i1] = claw ? (n - 0.5) * 0.2 : (n - 0.5) * 0.5 - groove * 0.7 - seam * 0.5;
    orm[i4] = 255 * (1 - (claw ? 0 : groove * 0.25 + seam * 0.2));
    orm[i4 + 1] = claw ? 70 : 100 + (n - 0.5) * 90 + groove * 40;
    orm[i4 + 2] = 30;
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

/** B2 재질 3종 + 텍스처. mobile 이면 64². */
export function createB2Materials(THREE, { seed = 11, mobile = false } = {}) {
  const f = forgeB2Hull(seed, mobile ? 64 : 128);
  const mk = (data, srgb) => { const t = new THREE.DataTexture(data, f.w, f.h, THREE.RGBAFormat, THREE.UnsignedByteType); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = 2; t.channel = 0; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true; return t; };
  const map = mk(f.albedo, true), normal = mk(f.normal, false), orm = mk(f.orm, false);
  const mats = {
    hull: new THREE.MeshStandardMaterial({ map, normalMap: normal, normalScale: new THREE.Vector2(0.9, 0.9), aoMap: orm, roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, envMapIntensity: 0.5 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x30081c, emissive: 0xc93579, emissiveIntensity: 2.0, metalness: 0.1, roughness: 0.35 }),
    core: new THREE.MeshStandardMaterial({ color: 0x2a1404, emissive: 0xff9a2e, emissiveIntensity: 1.6, metalness: 0.05, roughness: 0.3 }),
  };
  return { mats, textures: [map, normal, orm], dispose() { for (const t of [map, normal, orm]) t.dispose(); for (const k in mats) mats[k].dispose(); } };
}

/** 단일 B2 모델(검사실·전시용). update 로 발광 펄스. */
export function createB2Model(THREE, { seed = 11, mobile = false, lods = [0, 1, 2] } = {}) {
  const matlib = createB2Materials(THREE, { seed, mobile });
  const group = new THREE.Group(); group.name = 'B2';
  const lodGroups = new Map(); const geos = []; const triByLod = {};
  for (const lod of lods) {
    const geo = createB2Geometry(THREE, { lod });
    geos.push(geo); triByLod[lod] = geo.triangles;
    const g = new THREE.Group(); g.name = 'B2_LOD' + lod;
    for (const k in geo.buckets) { const m = new THREE.Mesh(geo.buckets[k], matlib.mats[k]); m.name = 'b2_' + k; g.add(m); }
    g.visible = false; group.add(g); lodGroups.set(lod, g);
  }
  let active = lods[0]; lodGroups.get(active).visible = true;
  function setLOD(lod) { if (!lodGroups.has(lod) || lod === active) return active; lodGroups.get(active).visible = false; lodGroups.get(lod).visible = true; active = lod; return active; }
  function update(time) {
    matlib.mats.core.emissiveIntensity = 1.6 + Math.sin(time * 4.1) * 0.4;
    matlib.mats.glow.emissiveIntensity = 1.9 + Math.sin(time * 3.1 + 2) * 0.35;
  }
  function stats() { return { lod: active, triangles: triByLod[active], triByLod: { ...triByLod } }; }
  function dispose() { for (const geo of geos) for (const k in geo.buckets) geo.buckets[k].dispose(); matlib.dispose(); }
  return { group, setLOD, update, stats, dispose, matlib, get lod() { return active; } };
}
export default { createB2Geometry, createB2Model, createB2Materials, forgeB2Hull, b2Body, B2_ROWS, B2_LODS, B2_LENGTH, B2_ASPECT };
