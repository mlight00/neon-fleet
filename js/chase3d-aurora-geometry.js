// ── AURORA 절차적 지오메트리 (Opus5 §6) — Three.js r160 + WebGL2, 코어 three 만 사용 ──
//  단일 진실: 원본 A4.webp 알파 디지타이즈(아래 A4_ROWS, tests/fixtures/a4-planform.json 과 동일 출처).
//  주 선체 = 다단 cross-section 스트립 loft(indexed BufferGeometry, 상/측/하 체적 분리, 크리스=스트립 경계 정점 분리).
//  주익/꼬리붐/척추 = 전용 loft·beveled extrude. 원시도형은 §6.4 허용부(반응로 링·노즐·그리블)에만.
//  THREE 는 인자 주입 → Node(WebGL 없이)에서 실제 지오메트리를 생성·검증한다.
//  좌표: 전방 +Z, 상단 +Y, X 대칭(§6.2). zFrac 0=노즈, 1=함미 → z3d = (0.5 - zFrac)·LENGTH.

// A4.webp 96행 × 우반폭 알파 런(정규화). 출처: 356×512, 함선 y4..507, halfW 173.5px (2026-07-30 추출).
export const A4_ROWS = [[[0.003,0.02]],[[0.003,0.032]],[[0.003,0.049]],[[0.003,0.061]],[[0.003,0.072]],[[0.003,0.084]],[[0.003,0.095]],[[0.003,0.107]],[[0.003,0.118]],[[0.003,0.13]],[[0.003,0.141]],[[0.003,0.153]],[[0.003,0.164]],[[0.003,0.176]],[[0.003,0.182]],[[0.003,0.193]],[[0.003,0.205]],[[0.003,0.21]],[[0.003,0.222]],[[0.003,0.233]],[[0.003,0.239]],[[0.003,0.256]],[[0.003,0.268]],[[0.003,0.28]],[[0.003,0.291]],[[0.003,0.303]],[[0.003,0.314]],[[0.003,0.326]],[[0.003,0.343]],[[0.003,0.378]],[[0.003,0.406]],[[0.003,0.435]],[[0.003,0.458]],[[0.003,0.493]],[[0.003,0.499]],[[0.003,0.499]],[[0.003,0.499]],[[0.003,0.481]],[[0.003,0.47]],[[0.003,0.481]],[[0.003,0.504]],[[0.003,0.527]],[[0.003,0.55]],[[0.003,0.573]],[[0.003,0.597]],[[0.003,0.62]],[[0.003,0.643]],[[0.003,0.666]],[[0.003,0.689]],[[0.003,0.706]],[[0.003,0.735]],[[0.003,0.752]],[[0.003,0.775]],[[0.003,0.798]],[[0.003,0.821]],[[0.003,0.844]],[[0.003,0.862]],[[0.003,0.885]],[[0.003,0.896]],[[0.003,0.908]],[[0.003,0.925]],[[0.003,0.931]],[[0.003,0.937]],[[0.003,0.948]],[[0.003,0.954]],[[0.003,0.96]],[[0.003,0.965]],[[0.003,0.977]],[[0.003,0.983]],[[0.003,0.983]],[[0.003,0.66],[0.695,0.988]],[[0.003,0.648],[0.729,0.988]],[[0.003,0.47],[0.539,0.585],[0.764,0.994]],[[0.003,0.47],[0.55,0.573],[0.793,0.994]],[[0.003,0.47],[0.827,1]],[[0.003,0.47],[0.862,1]],[[0.003,0.47],[0.89,0.988]],[[0.003,0.458],[0.925,0.965]],[[0.003,0.159],[0.17,0.447]],[[0.003,0.159],[0.176,0.429]],[[0.003,0.159],[0.187,0.424]],[[0.003,0.159],[0.216,0.412]],[[0.003,0.159],[0.228,0.412]],[[0.003,0.159],[0.245,0.401]],[[0.003,0.159],[0.256,0.389]],[[0.003,0.159],[0.268,0.383]],[[0.003,0.153],[0.28,0.372]],[[0.003,0.147],[0.291,0.354]],[[0.003,0.141]],[[0.003,0.118]],[[0.003,0.118]],[[0.003,0.112]],[[0.003,0.055],[0.072,0.089]],[[0.003,0.055]],[[0.003,0.049]],[[0.003,0.037]]];
export const ASPECT = 0.6885;            // 전폭/전장(A4 실측)
export const LENGTH = 4.6;               // 월드 단위 전장(기존 기함 스케일과 정합)
export const HALFW = 0.5 * ASPECT * LENGTH;   // 최대 반폭(월드 단위)

// ── 시드 PRNG(결정성 §12.1) — Math.random 금지 ──
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// ── planform 샘플러: zFrac(0..1) → {outline, hull, wingIn, boomIn, boomOut} (반폭 정규값) ──
function rowAt(zFrac) {
  const f = Math.min(0.999999, Math.max(0, zFrac)) * A4_ROWS.length - 0.5;
  const i0 = Math.max(0, Math.min(A4_ROWS.length - 1, Math.floor(f)));
  const i1 = Math.min(A4_ROWS.length - 1, i0 + 1);
  return { r0: A4_ROWS[i0], r1: A4_ROWS[i1], t: Math.min(1, Math.max(0, f - i0)) };
}
const L_ = (a, b, t) => a + (b - a) * t;
function runsOf(r) {   // {first:[in,out], last:[in,out], outline}
  const first = r[0], last = r[r.length - 1];
  return { firstOut: first[1], lastIn: last[0], lastOut: last[1], outline: last[1] };
}
export function samplePlanform(zFrac) {
  const { r0, r1, t } = rowAt(zFrac);
  const a = runsOf(r0), b = runsOf(r1);
  const outline = L_(a.outline, b.outline, t);
  const firstOut = L_(a.firstOut, b.firstOut, t);
  // 선체 폭 = 중앙 런을 0.50 캡(원본의 첫 어깨 플래토와 일치) — 그 밖은 주익/붐이 재현
  const hull = Math.min(firstOut, hullCap(zFrac));
  const split0 = r0.length > 1, split1 = r1.length > 1;
  const boom = (split0 || split1) && zFrac > 0.79 ? {
    inn: L_(split0 ? r0[r0.length - 1][0] : a.firstOut, split1 ? r1[r1.length - 1][0] : b.firstOut, t),
    out: L_(a.lastOut, b.lastOut, t),
  } : null;
  return { outline, hull, firstOut, boom };
}
function hullCap(z) { return sampleKeys(z, [[0, 0.02], [0.08, 0.11], [0.2, 0.3], [0.32, 0.47], [0.4, 0.5], [0.76, 0.5], [0.86, 0.24], [1, 0.06]]); }
function sampleKeys(z, keys) {
  if (z <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) if (z <= keys[i][0]) { const [z0, v0] = keys[i - 1], [z1, v1] = keys[i]; return L_(v0, v1, (z - z0) / (z1 - z0)); }
  return keys[keys.length - 1][1];
}
// 높이 프로파일(전장 비율) — 다층 체적: 노즈 얇음 → 반응로 구간 최대 → 함미 테이퍼
const hTop = (z) => sampleKeys(z, [[0, 0.01], [0.06, 0.024], [0.15, 0.042], [0.3, 0.06], [0.45, 0.072], [0.6, 0.078], [0.72, 0.073], [0.8, 0.056], [0.88, 0.04], [0.97, 0.02]]) * LENGTH;
const hBot = (z) => sampleKeys(z, [[0, 0.008], [0.06, 0.017], [0.15, 0.029], [0.3, 0.044], [0.45, 0.054], [0.6, 0.058], [0.72, 0.05], [0.8, 0.036], [0.88, 0.024], [0.97, 0.011]]) * LENGTH;
const zOf = (zFrac) => (0.5 - zFrac) * LENGTH;
const xOf = (run) => run * HALFW;

// ── 격자 스트립 → indexed BufferGeometry (rows[r] = [x,y,z,u,v][], flip=와인딩 반전) ──
//  와인딩 규약: 행=노즈→함미(z 감소), 열=좌→우 기준일 때 기본은 −Y(하면). 상면 스트립은 flip=true 로 +Y.
function gridGeometry(THREE, rows, flip = false) {
  const R = rows.length, C = rows[0].length;
  const pos = new Float32Array(R * C * 3), uv = new Float32Array(R * C * 2);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
    const p = rows[r][c], k = r * C + c;
    pos[k * 3] = p[0]; pos[k * 3 + 1] = p[1]; pos[k * 3 + 2] = p[2];
    uv[k * 2] = p[3]; uv[k * 2 + 1] = p[4];
  }
  const idx = [];
  for (let r = 0; r < R - 1; r++) for (let c = 0; c < C - 1; c++) {
    const a = r * C + c, b = a + 1, d = a + C, e = d + 1;
    if (flip) idx.push(a, b, d, b, e, d);
    else idx.push(a, d, b, b, d, e);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
// 닫힌 링 loft(붐·척추): sections[s] = {z, pts:[[x,y],...]}(닫힘, CCW)
function ringLoft(THREE, sections, capEnds = true) {
  const S = sections.length, N = sections[0].pts.length;
  const rows = [];
  for (let s = 0; s < S; s++) {
    const sec = sections[s], row = [];
    for (let i = 0; i <= N; i++) { const p = sec.pts[i % N]; row.push([p[0], p[1], sec.z, i / N, s / (S - 1)]); }
    rows.push(row);
  }
  const g = gridGeometry(THREE, rows);
  if (!capEnds) return g;
  const caps = [];
  for (const endIdx of [0, S - 1]) {
    const sec = sections[endIdx];
    const cx = sec.pts.reduce((a, p) => a + p[0], 0) / N, cy = sec.pts.reduce((a, p) => a + p[1], 0) / N;
    const pos = [], idx = [];
    pos.push(cx, cy, sec.z);
    for (let i = 0; i < N; i++) pos.push(sec.pts[i][0], sec.pts[i][1], sec.z);
    for (let i = 0; i < N; i++) { const a = 1 + i, b = 1 + ((i + 1) % N); if (endIdx === 0) idx.push(0, a, b); else idx.push(0, b, a); }
    const cg = new THREE.BufferGeometry();
    cg.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    cg.setAttribute('uv', new THREE.BufferAttribute(new Float32Array((N + 1) * 2).fill(0.5), 2));
    cg.setIndex(idx); cg.computeVertexNormals(); caps.push(cg);
  }
  return mergeGeos(THREE, [g, ...caps]);
}
// indexed 병합(코어 three 만) — normal/uv 보존, 재계산 없음
export function mergeGeos(THREE, list) {
  let vTot = 0, iTot = 0;
  const items = list.map((g) => {
    const ig = g.index ? g : (() => { const n = g.attributes.position.count; const idx = new Uint32Array(n); for (let i = 0; i < n; i++) idx[i] = i; g.setIndex(new THREE.BufferAttribute(idx, 1)); return g; })();
    vTot += ig.attributes.position.count; iTot += ig.index.count; return ig;
  });
  const pos = new Float32Array(vTot * 3), nor = new Float32Array(vTot * 3), uv = new Float32Array(vTot * 2);
  const idx = iTot > 65000 ? new Uint32Array(iTot) : new Uint16Array(iTot);
  let vo = 0, io = 0;
  for (const g of items) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    pos.set(p.array.subarray(0, p.count * 3), vo * 3);
    if (n) nor.set(n.array.subarray(0, n.count * 3), vo * 3);
    if (u) uv.set(u.array.subarray(0, u.count * 2), vo * 2);
    for (let i = 0; i < g.index.count; i++) idx[io + i] = g.index.array[i] + vo;
    vo += p.count; io += g.index.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  return out;
}
const applyMat4 = (g, m) => { g.applyMatrix4(m); return g; };

// ── 선체: 상(armorTop)/측(armorSide)/하(under) 3 스트립 loft — 크리스는 스트립 경계에서 자연 분리 ──
function buildHull(THREE, stations) {
  const zs = [];
  for (let s = 0; s <= stations; s++) zs.push(0.005 + (s / stations) * 0.965);
  const topRows = [], sideR = [], sideL = [], underRows = [];
  for (const zf of zs) {
    const { hull } = samplePlanform(zf);
    const hw = Math.max(0.004, xOf(hull)), ht = hTop(zf), hb = hBot(zf), z = zOf(zf);
    const v = zf;
    // 데크(좌→우 관통): 에지 → 챔퍼 베벨 → 스텝(융기 내갑판) → 크라운. 스텝·베벨 = "다층 장갑" 정체성(참고사례 챔퍼 규율).
    const deck = (sgn) => [[sgn * hw, ht * 0.35, z], [sgn * hw * 0.965, ht * 0.52, z], [sgn * hw * 0.90, ht * 0.62, z], [sgn * hw * 0.875, ht * 0.72, z], [sgn * hw * 0.86, ht * 0.80, z], [sgn * hw * 0.52, ht * 0.94, z], [sgn * hw * 0.20, ht * 1.0, z]];
    const dl = deck(-1), dr = deck(1).reverse();   // 좌에서 우로
    const row = [...dl, [0, ht * 1.02, z], ...dr].map((p, i, arr) => [p[0], p[1], p[2], i / (arr.length - 1), v]);
    topRows.push(row);
    // 측벽(하부 챠인 → 데크 에지, 챔퍼 중간점 2) — 좌/우 분리 스트립
    sideR.push([[hw * 0.86, -hb * 0.35, z, 0, v], [hw * 0.96, -hb * 0.18, z, 0.33, v], [hw * 0.985, -hb * 0.02, z, 0.66, v], [hw, ht * 0.35, z, 1, v]]);
    sideL.push([[-hw, ht * 0.35, z, 0, v], [-hw * 0.985, -hb * 0.02, z, 0.33, v], [-hw * 0.96, -hb * 0.18, z, 0.66, v], [-hw * 0.86, -hb * 0.35, z, 1, v]]);
    // 하부(좌→우): 킬 중심 V + 챔퍼
    const und = [[-hw * 0.86, -hb * 0.35, z], [-hw * 0.7, -hb * 0.62, z], [-hw * 0.55, -hb * 0.85, z], [-hw * 0.2, -hb * 0.99, z], [0, -hb, z], [hw * 0.2, -hb * 0.99, z], [hw * 0.55, -hb * 0.85, z], [hw * 0.7, -hb * 0.62, z], [hw * 0.86, -hb * 0.35, z]];
    underRows.push(und.map((p, i, arr) => [p[0], p[1], p[2], i / (arr.length - 1), v]));
  }
  return {
    armorTop: gridGeometry(THREE, topRows, true),   // 상면은 +Y 와인딩(§13.3 데크 홀 방지). 측/하면은 기본 와인딩이 이미 바깥향(수식 검증).
    armorSide: mergeGeos(THREE, [gridGeometry(THREE, sideR), gridGeometry(THREE, sideL)]),
    under: gridGeometry(THREE, underRows),
  };
}

// ── 주익: planform 폴리곤(원본 외곽 그대로) → beveled extrude + 두께 테이퍼 ──
function wingPolygon(samples) {
  // z 0.295→0.70 앞전=외곽, 팁 0.70→0.815, 뒷전(노치 내연) 0.815→0.72, 루트 컷 = 선체 폭·0.9(중첩 매립)
  const pts = [];
  for (let i = 0; i <= samples; i++) { const zf = 0.295 + (i / samples) * (0.70 - 0.295); pts.push([samplePlanform(zf).outline, zf]); }
  for (let i = 1; i <= 4; i++) { const zf = 0.70 + (i / 4) * (0.815 - 0.70); pts.push([samplePlanform(zf).outline, zf]); }
  const notch = [[0.925, 0.795], [0.86, 0.775], [0.79, 0.755], [0.73, 0.735], [0.695, 0.72]];   // 실측 둘째 런 시작(내연)
  for (const [x, zf] of notch) pts.push([x, zf]);
  for (let i = 0; i <= 6; i++) { const zf = 0.70 - (i / 6) * (0.70 - 0.295); pts.push([Math.min(samplePlanform(zf).hull * 0.9 + 0.02, samplePlanform(zf).outline - 0.01), zf]); }
  return pts;
}
function buildWing(THREE, side, detail) {
  const pts = wingPolygon(detail);
  const shape = new THREE.Shape();
  pts.forEach(([xr, zf], i) => { const X = xOf(xr) * side, Z = zOf(zf); if (i === 0) shape.moveTo(X, Z); else shape.lineTo(X, Z); });
  const thick = 0.085 * LENGTH;
  const g = new THREE.ExtrudeGeometry(shape, { depth: thick * 0.5, bevelEnabled: true, bevelThickness: thick * 0.25, bevelSize: 0.035, bevelSegments: 2, steps: 1, curveSegments: 4 });
  // (x, z평면 shape, y=extrude) → 회전 없이 축 재배치: shape 는 (x, y=zWorld) 로 만들었으므로 y↔z 스왑
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i); p.setY(i, z); p.setZ(i, y); }
  // 두께 테이퍼: 루트(선체측) 두껍고 팁 얇게 + 데크 높이에 접합
  const rootX = xOf(0.45) * side, tipX = xOf(1.0) * side;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), f = Math.min(1, Math.max(0, (x - rootX) / (tipX - rootX + 1e-9)));
    p.setY(i, p.getY(i) * (1 - 0.62 * f) + hTop(0.55) * 0.34);
  }
  g.deleteAttribute('normal'); g.computeVertexNormals();
  if (side < 0) flipWinding(g);
  return g;
}
function flipWinding(g) {   // indexed·non-indexed(Extrude) 모두 지원 — 미러 시 겉면 유지
  if (g.index) { const idx = g.index.array; for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } }
  else {
    for (const name of ['position', 'uv', 'normal']) {
      const at = g.attributes[name]; if (!at) continue;
      const a = at.array, n = at.itemSize;
      for (let i = 0; i < at.count; i += 3) for (let c = 0; c < n; c++) { const p = (i + 1) * n + c, q = (i + 2) * n + c; const t = a[p]; a[p] = a[q]; a[q] = t; }
    }
  }
  g.computeVertexNormals();
}

// ── 꼬리붐(쌍): 실측 둘째 런 [inn,out] 을 따라가는 육각 링 loft ──
function buildBoom(THREE, side, detail) {
  const secs = [];
  for (let i = 0; i <= detail; i++) {
    const zf = 0.80 + (i / detail) * (0.925 - 0.80);
    const s = samplePlanform(zf);
    const inn = s.boom ? s.boom.inn : 0.20, out = s.boom ? s.boom.out : 0.30;
    const cx = xOf((inn + out) / 2) * side, hw = Math.max(0.01, xOf(out - inn) / 2);
    const hh = Math.max(0.012, hBot(zf) * 0.85);
    secs.push({ z: zOf(zf), pts: [[cx + hw, 0], [cx + hw * 0.7, hh], [cx - hw * 0.7, hh], [cx - hw, 0], [cx - hw * 0.7, -hh], [cx + hw * 0.7, -hh]].map(([x, y]) => [x, y + hh * 0.1]) });
  }
  return ringLoft(THREE, secs, true);
}

// ── 금색 지휘 척추: 노즈 다트 → 반응로 → 함미 팁 연속 loft(오각 단면·폭 가변) ──
function buildSpine(THREE, detail) {
  // 완만한 폭 변화(구슬화 방지) — 노즈 다트에서 넓고, 반응로 앞에서 좁아지고, 함미 팁까지 가늘게
  const secs = [];
  const wOf = (zf) => sampleKeys(zf, [[0.03, 0.008], [0.08, 0.034], [0.13, 0.042], [0.26, 0.033], [0.55, 0.031], [0.63, 0.030], [0.665, 0.017], [0.80, 0.024], [0.9, 0.016], [0.965, 0.006]]);
  for (let i = 0; i <= detail; i++) {
    const zf = 0.03 + (i / detail) * (0.965 - 0.03);
    const w = wOf(zf) * LENGTH * 0.5, h = w * 0.62;
    const y0 = hTop(zf) * 0.99;   // 데크에 밀착
    secs.push({ z: zOf(zf), pts: [[w, y0], [w * 0.55, y0 + h], [0, y0 + h * 1.2], [-w * 0.55, y0 + h], [-w, y0], [0, y0 - h * 0.25]] });
  }
  return ringLoft(THREE, secs, true);
}

// ── 반응로(§6.4 허용: 링/원시) — "환형" 링 스택(구멍 있는 진짜 링) + 방사 스포크 + 최상단 밝은 코어 ──
const REACTOR = { zf: 0.715, rFrac: 0.152 };   // A4 실측: 중심 z≈0.715, 반경 ≈0.152·전장
function annulus(THREE, r0, r1, h, seg) {   // 구멍 있는 링(lathe 4점 프로파일) — 솔리드 디스크 금지(§13.3 검은 원 방지)
  const prof = [new THREE.Vector2(r0, 0), new THREE.Vector2(r1, 0), new THREE.Vector2(r1, h), new THREE.Vector2(r0, h)];
  return new THREE.LatheGeometry(prof, seg);
}
function buildReactor(THREE, rings, spokes) {
  const R = REACTOR.rFrac * LENGTH, y = hTop(REACTOR.zf) * 0.96, z = zOf(REACTOR.zf);
  const dark = [], gold = [], core = [];
  const U = 0.012 * LENGTH;   // 층 두께 단위
  const put = (g, y0) => { g.translate(0, y0, 0); return g; };
  // 낮은 받침 플린스(짧은 원통 — 데크에 파묻힘) + 환형 링 스택(바깥→안, 위로 갈수록 상승)
  dark.push(put(new THREE.CylinderGeometry(R * 1.04, R * 1.08, U * 0.9, rings), y - U * 0.2));
  gold.push(put(annulus(THREE, R * 0.80, R * 0.99, U * 1.1, rings), y + U * 0.4));
  dark.push(put(annulus(THREE, R * 0.62, R * 0.80, U * 0.9, rings), y + U * 0.7));
  gold.push(put(annulus(THREE, R * 0.44, R * 0.62, U * 1.2, rings), y + U * 1.0));
  dark.push(put(annulus(THREE, R * 0.30, R * 0.44, U * 1.0, rings), y + U * 1.3));
  // 방사 스포크(골드) — 링 위를 가로지르는 원본의 방사 세부
  for (let i = 0; i < spokes; i++) {
    const a = (i / Math.max(1, spokes)) * Math.PI * 2;
    const b = new THREE.BoxGeometry(R * 0.56, U * 0.55, R * 0.055);
    b.translate(R * 0.66, y + U * 1.9, 0);
    b.rotateY(a);
    gold.push(b);
  }
  // 최상단: 밝은 코어 접시 + 골드 림 토러스(코어가 절대 파묻히지 않게 가장 높게)
  const cd = new THREE.CylinderGeometry(R * 0.26, R * 0.29, U * 0.9, rings); cd.translate(0, y + U * 2.1, 0); core.push(cd);
  const rimT = new THREE.TorusGeometry(R * 0.285, R * 0.035, 8, rings); rimT.rotateX(Math.PI / 2); rimT.translate(0, y + U * 2.6, 0); gold.push(rimT);
  // 플린스 기어치(다크) — LOD0 전용
  if (spokes > 0) for (let i = 0; i < spokes + 4; i++) {
    const a = (i / (spokes + 4)) * Math.PI * 2;
    const tooth = new THREE.BoxGeometry(R * 0.07, U * 0.7, R * 0.05);
    tooth.translate(R * 1.05, y + U * 0.1, 0); tooth.rotateY(a); dark.push(tooth);
  }
  const move = (g) => applyMat4(g, new THREE.Matrix4().makeTranslation(0, 0, z));
  return { dark: mergeGeos(THREE, dark.map(move)), gold: mergeGeos(THREE, gold.map(move)), core: mergeGeos(THREE, core.map(move)) };
}

// ── 함몰 데크 패널(§6.1: 단순 검은 사각형 금지 — 프레임 + 함몰 내면 + 청록 틱) ──
const PANELS = [   // [xFrac(halfW), zFrac, wFrac, hFrac] — A4 육안 배치(좌우 대칭 자동)
  [0.27, 0.375, 0.17, 0.075], [0.44, 0.46, 0.18, 0.08], [0.60, 0.56, 0.2, 0.09], [0.79, 0.665, 0.2, 0.1],
];
function octShape(THREE, w, h, cut) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2 + cut, -h / 2); s.lineTo(w / 2 - cut, -h / 2); s.lineTo(w / 2, -h / 2 + cut); s.lineTo(w / 2, h / 2 - cut);
  s.lineTo(w / 2 - cut, h / 2); s.lineTo(-w / 2 + cut, h / 2); s.lineTo(-w / 2, h / 2 - cut); s.lineTo(-w / 2, -h / 2 + cut);
  return s;
}
function buildPanels(THREE, withTicks) {
  const frame = [], face = [], tick = [];
  for (const side of [-1, 1]) for (const [xf, zf, wf, hf] of PANELS) {
    const w = wf * HALFW, h = hf * LENGTH, cut = Math.min(w, h) * 0.28;
    const outer = octShape(THREE, w, h, cut); outer.holes.push(new THREE.Path(octShape(THREE, w * 0.82, h * 0.82, cut * 0.82).getPoints(1).reverse()));
    const fg = new THREE.ExtrudeGeometry(outer, { depth: 0.010 * LENGTH, bevelEnabled: true, bevelThickness: 0.004 * LENGTH, bevelSize: 0.007, bevelSegments: 1, curveSegments: 1 });
    const ig = new THREE.ExtrudeGeometry(octShape(THREE, w * 0.82, h * 0.82, cut * 0.82), { depth: 0.003, bevelEnabled: false, curveSegments: 1 });
    const surfY = deckYAt(xf, zf);   // 실표면에 안착(부유 금지 §13.3)
    const place = (g, drop) => {
      g.rotateX(-Math.PI / 2);
      applyMat4(g, new THREE.Matrix4().makeTranslation(xOf(xf) * side, surfY - drop, zOf(zf)));
      return g;
    };
    frame.push(place(fg, 0.002));
    face.push(place(ig, 0.007 * LENGTH));   // 함몰(프레임보다 낮게)
    if (withTicks) { const t = new THREE.BoxGeometry(w * 0.28, 0.005 * LENGTH, 0.007 * LENGTH); t.translate(xOf(xf) * side, surfY + 0.012 * LENGTH, zOf(zf + hf * 0.6)); tick.push(t); }
  }
  return { frame: mergeGeos(THREE, frame), face: mergeGeos(THREE, face), tick: tick.length ? mergeGeos(THREE, tick) : null };
}

// ── 엔진(§6.1 함미: 쌍발 + 보조) — 붐 후단 벨 노즐(lathe) + 중앙 베르니어 ──
function nozzleGeo(THREE, r, len, seg) {
  // 이중 벨(외피+내피 왕복) 프로파일 — 실제 두께가 있는 노즐(참고사례 tubeZ 교훈)
  const prof = [[r * 0.33, 0], [r * 0.95, len * 0.1], [r * 0.8, len * 0.32], [r * 0.58, len * 0.55], [r * 0.8, len * 0.78], [r, len * 0.97], [r * 1.02, len], [r * 0.9, len], [r * 0.72, len * 0.8], [r * 0.5, len * 0.56]].map(([x, y]) => new THREE.Vector2(Math.max(0.001, x), y));
  const g = new THREE.LatheGeometry(prof, seg);
  g.rotateX(-Math.PI / 2);   // (x,y,z)→(x,z,−y): 프로파일 +y(len) → −Z(함미 후방) — 벨이 뒤를 향한다
  return g;
}
function buildEngines(THREE, seg) {
  // 함미 하부 수납(§13.1 top 실루엣 보존): 붐 아래 쌍발 + 중앙 베르니어 3. 후면·함미고각에서 보인다.
  const metal = [], glow = [];
  const nozR = 0.040 * LENGTH, nozL = 0.095 * LENGTH;
  const boomY = -hBot(0.9) * 0.38, boomZ = zOf(0.945), boomX = xOf(0.305);
  for (const side of [-1, 1]) {
    const n = nozzleGeo(THREE, nozR, nozL, seg);
    applyMat4(n, new THREE.Matrix4().makeTranslation(boomX * side, boomY, boomZ));
    metal.push(n);
    const rim = new THREE.TorusGeometry(nozR * 1.02, nozR * 0.12, 8, seg);   // 벨 출구 림(부착)
    applyMat4(rim, new THREE.Matrix4().makeTranslation(boomX * side, boomY, boomZ - nozL));
    metal.push(rim);
    const c = new THREE.CylinderGeometry(nozR * 0.62, nozR * 0.7, 0.02 * LENGTH, seg); c.rotateX(Math.PI / 2);
    c.translate(boomX * side, boomY, boomZ - nozL * 0.82);
    glow.push(c);
  }
  for (const [dxF, dyF] of [[0, -0.012], [-0.045, -0.004], [0.045, -0.004]]) {   // 중앙 베르니어 3(소형, 후방향)
    const v = new THREE.CylinderGeometry(0.014 * LENGTH, 0.018 * LENGTH, 0.05 * LENGTH, 8); v.rotateX(-Math.PI / 2);
    v.translate(dxF * LENGTH, dyF * LENGTH, zOf(0.945));
    metal.push(v);
    const g2 = new THREE.CylinderGeometry(0.009 * LENGTH, 0.011 * LENGTH, 0.012, 8); g2.rotateX(-Math.PI / 2);
    g2.translate(dxF * LENGTH, dyF * LENGTH, zOf(0.945) - 0.028 * LENGTH);
    glow.push(g2);
  }
  return { metal: mergeGeos(THREE, metal), glow: mergeGeos(THREE, glow) };
}

// ── 어깨 장갑 레이어 + 그리블(시드 결정) ──
function buildArmorLayers(THREE) {
  const list = [];
  for (const side of [-1, 1]) {
    // 계단 어깨(행 33~39 플래토)를 얇은 챔퍼 판으로 강조
    const s = new THREE.Shape();
    const seq = [[0.20, 0.30], [0.499, 0.355], [0.499, 0.385], [0.47, 0.40], [0.49, 0.44], [0.30, 0.44]];
    seq.forEach(([xr, zf], i) => { const X = xOf(xr) * side, Z = zOf(zf); if (i === 0) s.moveTo(X, Z); else s.lineTo(X, Z); });
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012 * LENGTH, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.01, bevelSegments: 1, curveSegments: 1 });
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i), z = p.getZ(i); p.setY(i, z); p.setZ(i, y); }
    for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) + hTop(0.4) * 0.92);
    g.deleteAttribute('normal'); g.computeVertexNormals();
    if (side < 0) flipWinding(g);
    list.push(g);
  }
  return mergeGeos(THREE, list);
}
// 데크 스텝 다크 프레임 레일 + 함미측 벤트 슬랫 + 윙팁 청록 블레이드(원본 "제한된 발광" 정체성)
function buildTrims(THREE, segs) {
  const dark = [], glow = [];
  for (const side of [-1, 1]) {
    for (let i = 0; i < segs; i++) {   // 스텝 경계 레일(z 0.18~0.74)
      const zf = 0.18 + (i / segs) * 0.56, zf2 = 0.18 + ((i + 0.8) / segs) * 0.56;
      const s = samplePlanform((zf + zf2) / 2);
      const x = xOf(s.hull * 0.875) * side;
      const b = new THREE.BoxGeometry(0.014 * LENGTH, 0.008 * LENGTH, Math.abs(zOf(zf2) - zOf(zf)));
      b.translate(x, hTop((zf + zf2) / 2) * 0.78, (zOf(zf) + zOf(zf2)) / 2);
      dark.push(b);
    }
    for (let i = 0; i < 6; i++) {   // 함미측 벤트 슬랫(실표면 안착)
      const zf = 0.80 + i * 0.016;
      const b = new THREE.BoxGeometry(0.038 * LENGTH, 0.005 * LENGTH, 0.006 * LENGTH);
      b.translate(xOf(0.10) * side, deckYAt(0.10, zf) + 0.004 * LENGTH, zOf(zf));
      dark.push(b);
    }
    // 윙팁 청록 블레이드 2매(앞전 팁·후단 팁)
    const t1 = new THREE.BoxGeometry(0.012 * LENGTH, 0.01 * LENGTH, 0.09 * LENGTH);
    t1.translate(xOf(0.985) * side, hTop(0.55) * 0.40, zOf(0.735)); glow.push(t1);
    const t2 = new THREE.BoxGeometry(0.03 * LENGTH, 0.008 * LENGTH, 0.012 * LENGTH);
    t2.translate(xOf(0.94) * side, hTop(0.55) * 0.40, zOf(0.80)); glow.push(t2);
    // 붐 측면 청록 바(원본 함미 청록 마크)
    const t3 = new THREE.BoxGeometry(0.01 * LENGTH, 0.008 * LENGTH, 0.05 * LENGTH);
    t3.translate(xOf(0.42) * side, hBot(0.86) * 0.4, zOf(0.86)); glow.push(t3);
  }
  return { dark: mergeGeos(THREE, dark), glow: mergeGeos(THREE, glow) };
}
function buildGreebles(THREE, count, seed) {
  // 소형 볼트·벤트(§6.4 허용). 회피영역: 척추 중심대·반응로 원·패널 사각 — 데크를 뒤덮지 않는다(§13.3).
  const rnd = mulberry32(seed);
  const list = [];
  const rx = REACTOR.rFrac * 1.3, rz = REACTOR.zf;
  let placed = 0, guard = 0;
  while (placed < count && guard++ < count * 8) {
    const zf = 0.20 + rnd() * 0.62;
    const s = samplePlanform(zf);
    if (s.hull < 0.19) continue;                                                 // 좁은 노즈 회피(어수선 방지)
    const xr = (0.38 + rnd() * 0.5) * s.hull;                                    // 바깥 절반 밴드 — 중앙 데크는 깨끗하게(A4)
    const side = rnd() < 0.5 ? -1 : 1;
    if (xr < 0.09) continue;                                                     // 척추 회피
    const dz = (zf - rz) * (LENGTH / (2 * HALFW));
    if (Math.hypot(xr, dz * (2 * HALFW) / LENGTH * 0.344) < rx && Math.abs(zf - rz) < 0.11) continue;   // 반응로 회피
    let onPanel = false;
    for (const [pxf, pzf, pwf, phf] of PANELS) if (Math.abs(xr - pxf) < pwf * 0.62 && Math.abs(zf - pzf) < phf * 0.72) onPanel = true;
    if (onPanel) continue;
    const w = (0.005 + rnd() * 0.008) * LENGTH, d = (0.006 + rnd() * 0.012) * LENGTH, h = (0.003 + rnd() * 0.005) * LENGTH;
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(xOf(xr) * side, deckYAt(xr, zf) + h * 0.4, zOf(zf));
    list.push(g); placed++;
  }
  return mergeGeos(THREE, list);
}
// (x,z) 위 실제 데크/윙 표면 높이 근사 — 패널·그리블이 표면에 앉게(부유 금지 §13.3)
function deckYAt(xr, zf) {
  const s = samplePlanform(zf);
  if (xr <= s.hull + 0.005) {
    const t = Math.min(1, xr / Math.max(0.02, s.hull));
    return hTop(zf) * (1.02 - 0.62 * Math.pow(t, 2.4));   // 크라운(1.02)→에지(0.40) 근사
  }
  // 주익 상면: 루트→팁 테이퍼(buildWing 과 동일 파라미터)
  const f = Math.min(1, Math.max(0, (xr - 0.45) / 0.55));
  return hTop(0.55) * 0.34 + 0.085 * LENGTH * 0.5 * (1 - 0.62 * f);
}

// ── LOD 조립: 재질 버킷별 병합 지오메트리 + 명명 노드 ──
export const LODS = [
  { stations: 128, wingDetail: 30, boomDetail: 24, spineDetail: 64, reactorSeg: 48, spokes: 24, engineSeg: 28, greebles: 90, trims: 26, ticks: true },
  { stations: 48, wingDetail: 14, boomDetail: 10, spineDetail: 24, reactorSeg: 22, spokes: 10, engineSeg: 14, greebles: 30, trims: 10, ticks: true },
  { stations: 18, wingDetail: 8, boomDetail: 6, spineDetail: 10, reactorSeg: 10, spokes: 0, engineSeg: 8, greebles: 0, trims: 0, ticks: false },
];
export function createAuroraGeometry(THREE, { lod = 0, seed = 7 } = {}) {
  const P = LODS[Math.max(0, Math.min(2, lod))];
  const hull = buildHull(THREE, P.stations);
  const wings = mergeGeos(THREE, [buildWing(THREE, 1, P.wingDetail), buildWing(THREE, -1, P.wingDetail)]);
  const booms = mergeGeos(THREE, [buildBoom(THREE, 1, P.boomDetail), buildBoom(THREE, -1, P.boomDetail)]);
  const spine = buildSpine(THREE, P.spineDetail);
  const reactor = buildReactor(THREE, P.reactorSeg, P.spokes);
  const panels = buildPanels(THREE, P.ticks);
  const engines = buildEngines(THREE, P.engineSeg);
  const trims = P.trims ? buildTrims(THREE, P.trims) : null;
  const buckets = {
    armorTop: mergeGeos(THREE, [hull.armorTop, wings, buildArmorLayers(THREE)]),
    armorSide: hull.armorSide,
    under: mergeGeos(THREE, [hull.under, booms]),
    gold: mergeGeos(THREE, [spine, reactor.gold]),
    dark: mergeGeos(THREE, [reactor.dark, panels.frame, engines.metal, ...(trims ? [trims.dark] : []), ...(P.greebles ? [buildGreebles(THREE, P.greebles, seed)] : [])]),
    panel: panels.face,
    core: reactor.core,
    glow: mergeGeos(THREE, [engines.glow, ...(trims ? [trims.glow] : []), ...(panels.tick ? [panels.tick] : [])]),
  };
  // 상면류 버킷은 UV 를 선체 평면(plan) 공간으로 통일 — 재질 포지가 A4 배치 그대로 패널·심을 칠한다.
  //  u = x/전폭 + 0.5, v = zFrac(0=노즈..1=함미). armorSide 만 loft UV 유지(수직 리브 도장).
  const planarUV = (g) => {
    const p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (2 * HALFW) + 0.5, 0.5 - p.getZ(i) / LENGTH);
  };
  for (const k of ['armorTop', 'under', 'gold', 'dark', 'panel']) planarUV(buckets[k]);
  let triangles = 0;
  for (const k in buckets) triangles += buckets[k].index.count / 3;
  const nodes = {
    engineL: { x: -xOf(0.30), y: 0, z: zOf(0.94) }, engineR: { x: xOf(0.30), y: 0, z: zOf(0.94) },
    vernier: { x: 0, y: 0, z: zOf(0.985) }, reactor: { x: 0, y: hTop(REACTOR.zf), z: zOf(REACTOR.zf) },
    bowTip: { x: 0, y: 0, z: zOf(0.005) }, sternTip: { x: 0, y: 0, z: zOf(0.97) },
  };
  return { buckets, nodes, triangles: Math.round(triangles), length: LENGTH, halfW: HALFW };
}
export function disposeAurora(geo) { for (const k in geo.buckets) geo.buckets[k].dispose(); }
export default { createAuroraGeometry, disposeAurora, samplePlanform, mulberry32, mergeGeos, A4_ROWS, LODS, LENGTH, HALFW, ASPECT };
