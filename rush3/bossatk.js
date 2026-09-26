// rush3/bossatk.js — 보스 공격의 설계. r4.8(공용 패턴 + 안전 구역) → **r4.9 보스별 고유 공격**(이사님 실플레이 4차 2026-09-26
//  "모든 보스를 같은 패턴으로 만들지 말고 각 보스마다 특색있는 패턴을 만들어주자" · "날아오는 총알의 경우는 (안내를) 없애자. 광역 대미지가 있는 구역에 대한 경보만 주자").
//  순수 규칙 모듈: 난수·시계·화면·저장 없음(V3-PURE). 세 가지를 맡는다.
//   ① 판 정의 시점: 보스 정의 → 고유 공격 배정(atkPlanFor — buildStage 가 게임 화면 줄에서만 부른다). 스킨 5종 × 3종 = 15종, 서로 겹치지 않는다.
//   ② 공격 한 번의 설계(planAttack): 위험(탄 = 정해진 길 path · 광역 = 구역 모양)을 만들고, 부대가 닿는 시간 안에 설 수 있는 **안전 상자**를 찾는다.
//      안전 상자 = 부대(반폭 hw × 대형 깊이 — 유닛 원 끝까지) + 사방 margin/2(24px) → 폭 ≥ 부대 폭 + 48. 부대 중심이 moveMax × 닿는 시간 × reachK 안에서 닿는다.
//      닿는 시간 = 광역은 경보 초(첫 구역이 터지기까지), 탄은 첫 탄이 부대 띠(부대가 움직이는 축에 수직인 띠 — 도로는 부대 상자의 z 범위)에 들어오기까지 초.
//      가는 동안에는 띠 안에 탄이 없고, 도착한 뒤에는 모든 탄 길·구역이 상자와 겹치지 않는다 → 그 공격에서 피해 0. 보장이 안 되면 null(그 공격을 고르지 않는다).
//      안전 상자는 규칙만 안다(화면에 그리지 않는다 — r4.9 (가)). 부대가 설 곳은 한 축(도로 = 가로 · 광장 = 가로나 세로 중 덜 움직이는 쪽) 위에서 찾는다.
//   ③ 기하: 위험 모양(seg 탄 길·레일 · circ 원 · rect 사각 · poly 볼록 다각형(부채꼴) · ring 끊긴 고리)과 상자·병사 원의 겹침, 탄 길 따라가기(pathAt).
//  좌표: x = 도로 가로(80~400, 광장 40~440), z = 트랙(클수록 앞). 탄 길 = [[t, x, z], …](발사 순간부터 초 · 사이는 직선) — 규칙(combat)이 이 길 그대로 움직인다.
//  난수 없음: 빈틈 위치·겨누는 쪽은 이 보스가 그 공격을 쓴 횟수 k 로 번갈아 정한다.
import { BAL3 } from './balance.js';
import { formation, formationHalfWidth } from './squad.js';

const BA = BAL3.bossAtk, SQ = BAL3.squad, ROAD = BAL3.road, KD = BA.kinds;
const M = BA.margin / 2;
const DEG = Math.PI / 180;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 고유 공격 15종(스킨마다 3종) */
export const ATK_KINDS = Object.freeze(Object.keys(KD));
//  그림이 없는 보스(1~5번 등 skin 없음, 10번 포격 역할) = 기본 보스 그림 B1 그레이더('elite' 그림 키도 B1_grader.png)
export const ATK_DEFAULT_SKIN = 'B1_grader';
/** 공격 종류: 'shot'(날아오는 탄 — 도로에 안내 없음, 장전 번쩍임 뒤 발사) | 'aoe'(광역 — 붉은 경보 구역) */
export const atkType = (kind) => (KD[kind] ? KD[kind].type : null);
/** 보스 정의 → 공격을 정하는 스킨(없으면 기본 B1) */
export const atkSkinOf = (def) => (def && def.skin && BA.skins[def.skin] ? def.skin : ATK_DEFAULT_SKIN);
/** 스킨의 고유 공격(순서대로) */
export const skinKinds = (skin) => [...BA.skins[skin].seq];

/** 보스 정의 → 공격 배정 { skin, seq, open, gap, look, phaseAt, rage }(새 객체). 역할이 있는 보스(포격·소환·장갑 — 복수 보스 판)는 **자기 스킨의 고유 공격 중**
 *  역할에 맞는 것만(포격 = 탄 · 소환 = 광역 하나 · 장갑 = 광역). phases false(페이즈가 없는 판 1·2번)는 스킨의 early 를 처음부터 모두 연다.
 *  r4.9 (다) phaseAt = 게임 줄 페이즈 문턱(50%·30%) · rage = 광분(문턱·간격 배수·탄 속도 배수) — 이 칸이 있는 보스(게임 줄)만 광분한다.
 *  arena 는 r4.8 호출 모양을 지키려고 남긴 인자다(고유 공격은 도로·광장 모두 같은 3종 — 광장 기하는 설계가 맡는다) */
export function atkPlanFor(def, arena = false, { phases = true } = {}) {
  void arena;
  const skin = atkSkinOf(def);
  const S = BA.skins[skin];
  const role = def.role ?? 'elite';
  const R = role !== 'elite' ? BA.roles[role] : null;
  let seq = S.seq, open = BA.open;
  if (R) { seq = S.seq.filter((k) => KD[k].type === R.type); if (R.max) seq = seq.slice(0, R.max); }
  else if (!phases && S.early) { seq = S.early; open = S.early.length; }
  return { skin, seq: [...seq], open: Math.min(open, seq.length), gap: S.gap, look: S.look, phaseAt: [...BA.phaseAt], rage: { ...BA.rage } };
}

/** 지금 열린 공격: seq 의 앞 open + 페이즈 개(페이즈 50% = 1 · 30% = 2(게임 줄 phaseAt) — 하나씩 더 열린다) */
export function unlockedAtk(atk, phase = 0) {
  return atk.seq.slice(0, Math.min(atk.seq.length, atk.open + (phase || 0)));
}

/** 부대 틀. hw = 반폭(유닛 원 끝까지) — 대형이 가장자리에서 풀려도 넘지 않는 값 min(대형 반폭, 보스전 상한 run.hwCap).
 *  dyMin/dyMax = 대형 앞·뒤 오프셋(앞 = 음수) · 부대 띠 z [zLo, zHi] · 가장자리 [eLo, eHi](도로·광장) · 중심 x 가 설 수 있는 범위 [cLo, cHi](squad.clampCenter 의 벽 밖 규칙) ·
 *  중심 z 가 설 수 있는 범위 [zcLo, zcHi](광장만 넓다 — 도로는 zc 하나) · W = 필요한 안전 폭(2·hw + margin) · zFloor = 유닛이 내려갈 수 있는 가장 낮은 z ·
 *  slowT = 그물 느려짐 남은 초(닿는 거리 계산) · runZ = 카메라 z(탄 길의 위쪽 끝) */
export function squadFrame(run) {
  const arena = run.phase === 'arena' && run.arena;
  const n = run.units.length;
  let dyMin = 0, dyMax = 0;
  for (const p of formation(n)) { if (p.dy < dyMin) dyMin = p.dy; if (p.dy > dyMax) dyMax = p.dy; }
  const fw = formationHalfWidth(n);
  const hw = run.hwCap != null && run.hwCap < fw ? run.hwCap : fw;
  const eLo = arena ? run.arena.w[0] : ROAD.x0, eHi = arena ? run.arena.w[1] : ROAD.x1;
  const hwc = Math.min(hw, SQ.hwMax);
  const zc = run.z - (run.ay || 0);
  const zcLo = arena ? run.z - run.arena.depth[1] : zc, zcHi = arena ? run.z - run.arena.depth[0] : zc;
  return { arena: !!arena, x: run.x, zc, hw, dyMin, dyMax, zLo: zc - dyMax - SQ.unitR, zHi: zc - dyMin + SQ.unitR,
           zFloor: zcLo - dyMax - SQ.unitR, eLo, eHi, cLo: eLo + hwc, cHi: eHi - hwc, zcLo, zcHi, W: 2 * hw + BA.margin,
           slowT: run.slowT > 0 ? run.slowT : 0, runZ: run.z, vx: run.svx || 0, vz: run.svz || 0 };
}
/** 앞질러 겨누기(겨누는 공격): 부대 속도 × T 초(가로·세로 각각 ±leadMax 안) — 가만히 선 부대는 [0, 0] */
export function leadOf(F, T) {
  return [clamp(F.vx * T, -BA.leadMax, BA.leadMax), clamp(F.vz * T, -BA.leadMax, BA.leadMax)];
}
/** 부대 중심 (gx, gz) 에 섰을 때의 안전 상자 { x0, x1, z0, z1 } = 부대(유닛 원 끝까지) + 사방 margin/2 */
export function squadBox(F, gx = F.x, gz = F.zc) {
  return { x0: gx - F.hw - M, x1: gx + F.hw + M, z0: gz - F.dyMax - SQ.unitR - M, z1: gz - F.dyMin + SQ.unitR + M };
}

//  ── 기하 ─────────────────────────────────────────────────────────────────────────────────────────────
/** 선분 (ax,az)→(bx,bz)(반지름 r)이 상자와 겹치는가 — 상자를 r 만큼 넓혀 Liang–Barsky(모서리는 사각으로 넓혀 안전 쪽) */
export function segHitsBox(ax, az, bx, bz, r, B) {
  const x0 = B.x0 - r, x1 = B.x1 + r, z0 = B.z0 - r, z1 = B.z1 + r;
  const dx = bx - ax, dz = bz - az;
  const p = [-dx, dx, -dz, dz], q = [ax - x0, x1 - ax, az - z0, z1 - az];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) { if (q[i] < 0) return false; continue; }
    const t = q[i] / p[i];
    if (p[i] < 0) { if (t > t1) return false; if (t > t0) t0 = t; }
    else { if (t < t0) return false; if (t < t1) t1 = t; }
  }
  return true;
}
function circHitsBox(x, z, R, B) {
  const dx = Math.max(B.x0 - x, 0, x - B.x1), dz = Math.max(B.z0 - z, 0, z - B.z1);
  return dx * dx + dz * dz <= R * R;
}
//  볼록 다각형 × 상자: 분리축(상자 두 축 + 다각형 변의 법선)
function polyHitsBox(pts, B) {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, z] of pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (z < z0) z0 = z; if (z > z1) z1 = z; }
  if (x1 < B.x0 || x0 > B.x1 || z1 < B.z0 || z0 > B.z1) return false;
  const cs = [[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [B.x0, B.z1]];
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const nx = az - bz, nz = bx - ax;
    let p0 = Infinity, p1 = -Infinity, q0 = Infinity, q1 = -Infinity;
    for (const [x, z] of pts) { const d = x * nx + z * nz; if (d < p0) p0 = d; if (d > p1) p1 = d; }
    for (const [x, z] of cs) { const d = x * nx + z * nz; if (d < q0) q0 = d; if (d > q1) q1 = d; }
    if (q1 < p0 || q0 > p1) return false;
  }
  return true;
}
//  점이 끊긴 틈(쐐기: 꼭짓점 (h.x, h.z), 방향 h.ang, 반각 half) 안인가
function angOff(h, x, z) {
  let d = Math.atan2(z - h.z, x - h.x) - h.ang;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return Math.abs(d);
}
//  끊긴 고리(원판 반지름 R + 두께 th 에서 끊긴 틈 쐐기를 뺀 곳) × 상자: 원판과 안 겹치거나, 상자가 통째로 쐐기 안이면 안전(쐐기는 볼록 — 반각 < 90°)
function ringHitsBox(h, B) {
  if (!circHitsBox(h.x, h.z, h.R + h.th, B)) return false;
  for (const [x, z] of [[B.x0, B.z0], [B.x1, B.z0], [B.x1, B.z1], [B.x0, B.z1]]) {
    if (Math.hypot(x - h.x, z - h.z) < 1e-6 || angOff(h, x, z) >= h.half - 1e-9) return true;
  }
  return false;
}
/** 위험 모양 × 상자 겹침 */
export function shapeHitsBox(s, B) {
  switch (s.t) {
    case 'seg': return segHitsBox(s.ax, s.az, s.bx, s.bz, s.r, B);
    case 'circ': return circHitsBox(s.x, s.z, s.R, B);
    case 'rect': return s.x0 <= B.x1 && B.x0 <= s.x1 && s.z0 <= B.z1 && B.z0 <= s.z1;
    case 'poly': return polyHitsBox(s.pts, B);
    case 'ring': return ringHitsBox(s, B);
    default: return true;
  }
}
function distSeg(px, pz, ax, az, bx, bz) {
  const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz;
  const t = L2 > 0 ? clamp(((px - ax) * vx + (pz - az) * vz) / L2, 0, 1) : 0;
  return Math.hypot(ax + vx * t - px, az + vz * t - pz);
}
function inPoly(pts, x, z) {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[(i + 1) % pts.length];
    const c = (bx - ax) * (z - az) - (bz - az) * (x - ax);
    if (c !== 0) { if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false; }
  }
  return true;
}
/** 병사 원(가운데 (x, z), 반지름 ur)이 광역 구역에 드는가(피해 판정) */
export function shapeHitsUnit(s, x, z, ur) {
  switch (s.t) {
    case 'seg': return distSeg(x, z, s.ax, s.az, s.bx, s.bz) <= s.r + ur;
    case 'circ': return Math.hypot(x - s.x, z - s.z) <= s.R + ur;
    case 'rect': { const dx = Math.max(s.x0 - x, 0, x - s.x1), dz = Math.max(s.z0 - z, 0, z - s.z1); return dx * dx + dz * dz <= ur * ur; }
    case 'poly': {
      if (inPoly(s.pts, x, z)) return true;
      for (let i = 0; i < s.pts.length; i++) { const [ax, az] = s.pts[i], [bx, bz] = s.pts[(i + 1) % s.pts.length]; if (distSeg(x, z, ax, az, bx, bz) <= ur) return true; }
      return false;
    }
    case 'ring': {
      const d = Math.hypot(x - s.x, z - s.z);
      if (d > s.R + s.th + ur) return false;
      if (d <= ur) return true;
      return angOff(s, x, z) > s.half - Math.asin(Math.min(1, ur / d));
    }
    default: return false;
  }
}

//  ── 탄 길 ───────────────────────────────────────────────────────────────────────────────────────────
/** 길 path([[t, x, z], …]) 위 시각 t 의 자리·속도. vz 는 적탄 규약(양수 = z 가 줄어드는 쪽). i = 지금 조각 번호(다음에 힌트로), done = 길 끝을 지났다 */
export function pathAt(path, t, i0 = 0) {
  const n = path.length;
  if (t > path[n - 1][0] + 1e-9) { const [, x, z] = path[n - 1]; return { x, z, vx: 0, vz: 0, i: n - 2, done: true }; }
  let i = Math.max(0, Math.min(n - 2, i0));
  while (i > 0 && t < path[i][0]) i--;
  while (i < n - 2 && t > path[i + 1][0]) i++;
  const [ta, xa, za] = path[i], [tb, xb, zb] = path[i + 1];
  const dt = tb - ta, u = dt > 1e-12 ? clamp((t - ta) / dt, 0, 1) : 1;
  const vx = dt > 1e-12 ? (xb - xa) / dt : 0, vzz = dt > 1e-12 ? (zb - za) / dt : 0;
  return { x: xa + (xb - xa) * u, z: za + (zb - za) * u, vx, vz: -vzz, i, done: false };
}
//  곧은 탄 길의 끝: 부대가 있을 수 있는 가장 낮은 z(zFloor) 아래로 다 지나갔거나 · 좌우 가장자리 30px 밖 · 위로는 화면 위(카메라 + 760)
function rayLen(F, x0, z0, ux, uz, r) {
  let s = 2000;
  if (uz < -1e-9) s = Math.min(s, (z0 - (F.zFloor - r - 4)) / -uz);
  if (uz > 1e-9) s = Math.min(s, (F.runZ + 760 - z0) / uz);
  if (ux < -1e-9) s = Math.min(s, (x0 - (F.eLo - 30)) / -ux);
  if (ux > 1e-9) s = Math.min(s, (F.eHi + 30 - x0) / ux);
  return Math.max(1, s);
}
function rayPath(F, x0, z0, ux, uz, v, r, t0 = 0) {
  const s = rayLen(F, x0, z0, ux, uz, r);
  return [[t0, x0, z0], [t0 + s / v, x0 + ux * s, z0 + uz * s]];
}
/** 탄들의 길 → 위험 선분(시간 칸 t0·t1 포함) */
export function shotSegs(shots) {
  const out = [];
  for (const s of shots) for (let i = 0; i + 1 < s.path.length; i++) {
    const [t0, ax, az] = s.path[i], [t1, bx, bz] = s.path[i + 1];
    out.push({ t: 'seg', ax, az, bx, bz, r: s.r, t0, t1 });
  }
  return out;
}
/** 설계의 위험 모양 전부(탄 = 길 선분 · 광역 = 구역) — 검사가 안전 상자와 다시 대 본다 */
export function planHazards(plan) {
  return plan.type === 'shot' ? shotSegs(plan.shots) : plan.zones.map((z) => z.shape);
}
/** 탄 공격의 닿는 시간: 가장 이른 탄이 부대 띠(axis 'x' = 부대 상자의 z 범위 · 'z' = x 범위, 탄 반지름만큼 넓힘)에 들어오는 시각 */
export function enterTime(segs, F, axis) {
  const B = squadBox(F);
  let best = Infinity;
  for (const g of segs) {
    const lo = (axis === 'z' ? B.x0 : B.z0) - g.r, hi = (axis === 'z' ? B.x1 : B.z1) + g.r;
    const a = axis === 'z' ? g.ax : g.az, b = axis === 'z' ? g.bx : g.bz;
    let t = null;
    if (a >= lo && a <= hi) t = g.t0;
    else if (a > hi && b <= hi) t = g.t0 + (a - hi) / (a - b) * (g.t1 - g.t0);
    else if (a < lo && b >= lo) t = g.t0 + (lo - a) / (b - a) * (g.t1 - g.t0);
    if (t != null && t < best) best = t;
  }
  return best;
}
/** 닿는 거리(px): T 초 동안 부대가 한 축으로 갈 수 있는 거리 × reachK. 그물 느려짐(slowT 초 동안 moveMax × slowMul)을 뺀다. 탄이 띠에 끝내 안 들어오면 3초로 본다 */
export function reachDist(F, T) {
  const t = Number.isFinite(T) ? Math.max(0, T) : 3;
  const s = Math.min(F.slowT, t);
  return BA.reachK * SQ.moveMax * (KD.web.slowMul * s + (t - s));
}

//  ── 설 곳 찾기 ────────────────────────────────────────────────────────────────────────────────────────
//  축 위에서 부대 중심이 설 수 있는 범위: 가로 = 안전 상자 폭이 가장자리 안에 들고 중심이 설 수 있는 곳 · 세로(광장) = 중심 z 범위
function goalRange(F, axis) {
  return axis === 'z' ? [F.zcLo, F.zcHi] : [Math.max(F.eLo + F.W / 2, F.cLo), Math.min(F.eHi - F.W / 2, F.cHi)];
}
const boxOn = (F, axis, v) => (axis === 'z' ? squadBox(F, F.x, v) : squadBox(F, v, F.zc));
const boxClear = (hz, B) => !hz.some((h) => shapeHitsBox(h, B));
//  한 축 위에서 안전 상자가 되는 부대 중심 — prefer(없으면 지금 자리)에서 가까운 것부터 2px 씩(같은 거리는 작은 쪽 먼저). 닿는 거리 D·설 수 있는 범위 안. 없으면 null
function searchAxis(F, hz, axis, D, prefer) {
  const [g0, g1] = goalRange(F, axis);
  const c = axis === 'z' ? F.zc : F.x;
  const lo = Math.max(g0, c - D), hi = Math.min(g1, c + D);
  if (lo > hi + 1e-9) return null;
  //  후보 상자들을 모두 덮는 큰 상자와 겹치는 위험만 본다(탄 길 선분이 많을 때 빠르게 — 결과는 같다)
  const a0 = boxOn(F, axis, lo), b0 = boxOn(F, axis, hi);
  const U = { x0: Math.min(a0.x0, b0.x0), x1: Math.max(a0.x1, b0.x1), z0: Math.min(a0.z0, b0.z0), z1: Math.max(a0.z1, b0.z1) };
  const near = hz.filter((h) => shapeHitsBox(h, U));
  const p = clamp(prefer ?? c, lo, hi);
  if (boxClear(near, boxOn(F, axis, p))) return p;
  for (let d = 2; p - d > lo - 2 || p + d < hi + 2; d += 2) {
    const a = Math.max(lo, p - d), b = Math.min(hi, p + d);
    if (boxClear(near, boxOn(F, axis, a))) return a;
    if (boxClear(near, boxOn(F, axis, b))) return b;
  }
  return null;
}
//  축 목록에서 가장 덜 움직이는 설 곳 { axis, v, move }. Dof(axis) = 그 축의 닿는 거리
function searchGoal(F, hz, axes, Dof) {
  let best = null;
  for (const axis of axes) {
    const v = searchAxis(F, hz, axis, Dof(axis), null);
    if (v == null) continue;
    const move = Math.abs(v - (axis === 'z' ? F.zc : F.x));
    if (!best || move < best.move - 1e-9) best = { axis, v, move };
  }
  return best;
}
//  빈틈 먼저 정하는 공격(줄·부채·방울): 위치 번호 k % 3(가장자리 한쪽 · 가운데 · 다른 쪽)을 닿는 곳으로 당긴 부대 중심. 안 되면 null
function cycledGoal(F, axis, k, D) {
  const [lo, hi] = goalRange(F, axis);
  if (lo > hi + 1e-9) return null;
  const c = axis === 'z' ? F.zc : F.x;
  const pos = k % 3;
  const want = pos === 0 ? lo : pos === 2 ? hi : (lo + hi) / 2;
  const g = clamp(clamp(want, c - D, c + D), lo, hi);
  return Math.abs(g - c) <= D + 1e-9 ? g : null;
}
//  겨누는 자리 어긋남: 0 부터 step 씩 벌려 가며(첫 쪽은 k 로 번갈아) lim 까지 — 앞쪽일수록 부대 몸통에 깊이 걸친다(가만히 있으면 맞는다)
function* offsets(lim, k, step = 4) {
  yield 0;
  const s = k % 2 ? -1 : 1;
  for (let o = step; o <= lim + 1e-9; o += step) { yield s * o; yield -s * o; }
}
//  마지막 확인 + 설계 객체. 안전 상자가 모든 위험과 떨어져 있고, 설 곳이 닿는 거리 안이어야 한다
function finish(F, kind, hz, goal, T, D, extra) {
  const gx = goal.axis === 'z' ? F.x : goal.v, gz = goal.axis === 'z' ? goal.v : F.zc;
  const B = squadBox(F, gx, gz);
  if (!boxClear(hz, B)) return null;
  if (Math.abs(gx - F.x) > D + 1e-9 || Math.abs(gz - F.zc) > D + 1e-9) return null;
  return { kind, type: KD[kind].type, axis: goal.axis, goal: { x: gx, z: gz }, safe: [B.x0, B.x1], safeZ: [B.z0, B.z1],
           reachT: T, reachD: D, hw: F.hw, band: [F.zLo, F.zHi], zFloor: F.zFloor, from: { x: F.x, z: F.zc }, ...extra };
}
function finishShot(F, kind, shots, axis, v, extra) {
  const segs = shotSegs(shots);
  const T = enterTime(segs, F, axis);
  return finish(F, kind, segs, { axis, v }, T, reachDist(F, T), { shots, ...extra });
}
function finishAoe(F, kind, zones, goal, extra) {
  const T = Math.min(...zones.map((z) => z.at));
  return finish(F, kind, zones.map((z) => z.shape), goal, T, reachDist(F, T), { zones, tele: T, ...extra });
}
//  구역 하나로 겨누는 광역(갈고리·그물·레일·쇳물 붓기): 어긋남 off 마다 구역을 만들어(make(off) → 구역 목록 | null) 설 곳이 나오는 첫 자리
function aimAoe(F, kind, P, k, lim, axes, make, extra = () => ({}), step = 4) {
  const D = reachDist(F, P.tele);
  const [lx, lz] = leadOf(F, P.tele);
  for (const off of offsets(lim, k, step)) {
    const zones = make(off, lx, lz);
    if (!zones) continue;
    const g = searchGoal(F, zones.map((z) => z.shape), axes, () => D);
    if (!g) continue;
    const plan = finishAoe(F, kind, zones, g, extra(off));
    if (plan) return plan;
  }
  return null;
}
//  부대가 한쪽(보스 쪽) 끝까지 뻗은 길이: 부대 상자(여유 없이)의 꼭짓점을 방향 (ux, uz) 로 비춘 최댓값
function frontExt(F, ux, uz) {
  let m = 0;
  for (const [dx, dz] of [[-F.hw, -F.dyMax - SQ.unitR], [F.hw, -F.dyMax - SQ.unitR], [F.hw, -F.dyMin + SQ.unitR], [-F.hw, -F.dyMin + SQ.unitR]]) m = Math.max(m, dx * ux + dz * uz);
  return m;
}

//  ── r4.10 중간 보스 돌진(보스 고유 공격 15종과 따로 — 중간 보스의 한 가지 행동) ─────────────────────────────────────
/** 중간 보스 돌진 한 번의 설계(광역 경보와 같은 안전 상자 보장 — r4.9 규칙 그대로). P = BAL3.midBoss.charge, k = 이 중간 보스가 돌진한 횟수(겨누는 쪽 번갈이).
 *  붉은 경보 줄 = 중간 보스 자리(bo.x, bo.z)에서 곧게 — 부대 한가운데 z 에서 겨누는 x 를 지나 부대가 있을 수 있는 가장 낮은 z 아래까지. 줄 폭 = 몸(반지름 bo.r).
 *  겨누는 x 는 부대 한가운데에서 조금씩 벌려 가며(첫 쪽은 k 로 번갈아) 설 곳(안전 상자 — 부대 폭 + 48)이 경보 시간 × moveMax × 0.8 안에 나오는 첫 자리.
 *  벌림 한계 = 줄이 부대 몸통에 걸치는 만큼(가만히 있으면 치인다). 몸이 부대 띠 위끝에 닿는 때(at) = 경보 + 그 길이 ÷ 돌진 속도(닿는 거리는 경보 시간으로 잰다 — 안전 쪽).
 *  반환 { kind 'charge', type 'aoe', axis 'x', goal, safe, safeZ, reachT, reachD, hw, band, zFloor, from, tele, zones: [{ shape(seg), at }], lane: { ax, az, bx, bz }, len, ux, uz } | null */
export function planCharge(run, bo, P, k = 0) {
  if (!run.units.length) return null;
  const F = squadFrame(run);
  const r = bo.r, ax = bo.x, az = bo.z;
  if (az - F.zc < r + 40) return null;
  const zEnd = F.zFloor - r - 4;
  const top = squadBox(F).z1;
  const D = reachDist(F, P.tele);
  const lim = F.hw - SQ.unitR + r - 6;
  for (const off of offsets(lim, k, 4)) {
    const tx = clamp(F.x + off, F.eLo + r, F.eHi - r);
    const bx = ax + (tx - ax) * (az - zEnd) / (az - F.zc);
    const shape = { t: 'seg', ax, az, bx, bz: zEnd, r };
    const g = searchGoal(F, [shape], ['x'], () => D);
    if (!g) continue;
    const B = squadBox(F, g.v, F.zc);
    if (!boxClear([shape], B) || Math.abs(g.v - F.x) > D + 1e-9) continue;
    const len = Math.hypot(bx - ax, zEnd - az), ux = (bx - ax) / len, uz = (zEnd - az) / len;
    const sHit = clamp((az - (top + r)) / -uz, 0, len);
    return { kind: 'charge', type: 'aoe', axis: 'x', goal: { x: g.v, z: F.zc }, safe: [B.x0, B.x1], safeZ: [B.z0, B.z1], reachT: P.tele, reachD: D, hw: F.hw,
             band: [F.zLo, F.zHi], zFloor: F.zFloor, from: { x: F.x, z: F.zc }, tele: P.tele,
             zones: [{ shape, at: P.tele + sHit / P.speed }], lane: { ax, az, bx, bz: zEnd }, len, ux, uz };
  }
  return null;
}

//  ── 공격 한 번의 설계 ─────────────────────────────────────────────────────────────────────────────────
/** bo = 공격하는 보스(자리 bo.x·bo.z·반지름 bo.r), kind = 고유 공격, k = 이 보스가 이 공격을 쓴 횟수(빈틈 위치·겨누는 쪽 번갈이).
 *  반환(공통) { kind, type, axis, goal: { x, z }(부대가 설 곳), safe: [x0, x1]·safeZ: [z0, z1](안전 상자), reachT(닿는 시간), reachD(닿는 거리), hw, band, zFloor, from, pause } +
 *   탄 = shots: [{ path, r }] · 광역 = zones: [{ shape, at(경보 시작부터 터지는 초), linger?, tick?, slow? }], tele | null */
export function planAttack(run, bo, kind, k = 0) {
  const P = KD[kind];
  if (!P || !run.units.length) return null;
  const F = squadFrame(run);
  //  r4.9 (다) 광분 중에는 탄 속도 × vMul — 탄 길을 빨라진 속도로 설계하므로 닿는 시간·설 곳 보장도 빨라진 탄으로 잰다(광역 경보 시간은 그대로)
  const vm = bo.rage && bo.atk && bo.atk.rage ? bo.atk.rage.vMul : 1;
  switch (kind) {
    case 'blade': return planBlade(bo, F, P, k, vm);
    case 'smoke': return planSmoke(bo, F, P, k);
    case 'ricochet': return planRicochet(bo, F, P, k, vm);
    case 'hook': return planHook(bo, F, P, k);
    case 'needles': return planNeedles(bo, F, P, k, vm);
    case 'web': return planWeb(bo, F, P, k);
    case 'rail': return planRail(bo, F, P, k);
    case 'chain': return planChain(bo, F, P, k, vm);
    case 'crossrail': return planCrossrail(bo, F, P, k);
    case 'pour': return planPour(bo, F, P, k);
    case 'slag': return planSlag(bo, F, P, k, vm);
    case 'rain': return planRain(bo, F, P, k);
    case 'mace': return planMace(bo, F, P, k);
    case 'blades': return planBlades(bo, F, P, k, vm);
    case 'quake': return planQuake(bo, F, P, k);
    default: return null;
  }
}

//  ── B1 그레이더 ──
//  삽날 밀기(탄): 빈틈(안전 상자 폭)을 먼저 정하고(위치 k % 3) 그 양옆 가장자리까지 잔해 덩어리를 gap 간격으로 한 줄 — 삽날 앞에서 곧게 내려온다
function planBlade(bo, F, P, k, vm) {
  const v = P.v * vm, r = P.r, z0 = bo.z - bo.r - 6;
  const B0 = squadBox(F);
  if (z0 - r <= B0.z1 + 1) return null;
  const gx = cycledGoal(F, 'x', k, reachDist(F, (z0 - r - B0.z1) / v));
  if (gx == null) return null;
  const Bw = squadBox(F, gx);
  const xs = [];
  for (let x = Bw.x0 - r - 2; x > F.eLo - r; x -= P.gap) xs.unshift(x);
  for (let x = Bw.x1 + r + 2; x < F.eHi + r; x += P.gap) xs.push(x);
  if (!xs.length) return null;
  return finishShot(F, 'blade', xs.map((x) => ({ path: rayPath(F, x, z0, 0, -1, v, r), r })), 'x', gx, { pause: true, z0 });
}
//  굴뚝 매연탄(광역): 설 곳(k % 3)을 먼저 정하고, 그 밖 두 조각(부대에 가까운 쪽부터)에 경보 원 2~3개(조각마다 1~2개, 반지름 Rmin~Rmax). 차례로 stagger 초씩 늦게 터진다
function planSmoke(bo, F, P, k) {
  const gx = cycledGoal(F, 'x', k, reachDist(F, P.tele));
  if (gx == null) return null;
  const Bw = squadBox(F, gx);
  const parts = [[F.eLo, Bw.x0 - 2], [Bw.x1 + 2, F.eHi]].filter(([a, b]) => b - a >= 2 * P.Rmin)
    .sort((p, q) => Math.abs((p[0] + p[1]) / 2 - F.x) - Math.abs((q[0] + q[1]) / 2 - F.x) || p[0] - q[0]);
  const zones = [];
  for (const [a, b] of parts) {
    const m = Math.min(2, Math.ceil((b - a) / (2 * P.Rmax)), P.max - zones.length);
    if (m <= 0) break;
    const R = Math.min(P.Rmax, (b - a) / (2 * m));
    for (let i = 0; i < m; i++) {
      const n = zones.length;
      zones.push({ shape: { t: 'circ', x: a + R + 2 * R * i, z: F.zc + (n % 2 ? 20 : -12), R }, at: P.tele + n * P.stagger });
    }
  }
  if (!zones.length) return null;
  return finishAoe(F, 'smoke', zones, { axis: 'x', v: gx }, { from0: { x: bo.x + bo.r * 0.35, z: bo.z + bo.r * 0.5 } });
}
//  잔해 튕기기(탄): 설 곳(k % 3)을 먼저 정하고, 그 밖 조각마다 그쪽 벽으로 한 줄기 — 삽날 끝에서 벽까지 v1 로 날아가 한 번 튕긴 뒤 안쪽 아래로 v2(기울기 ≤ slopeMax).
//   튕김 높이·기울기는 튕긴 뒤의 잔해가 부대 띠를 지나는 동안 그 조각 안에만 있게 정한다(띠 위에서 튕긴다). n 개가 every 초 간격으로 같은 길(지그재그 한 줄기)
function planRicochet(bo, F, P, k, vm) {
  const v1 = P.v1 * vm, v2 = P.v2 * vm, r = P.r;
  const B0 = squadBox(F);
  const zTop = B0.z1 + r, zBot = B0.z0 - r, depth = zTop - zBot;
  const lz = bo.z - bo.r * 0.4;
  if (lz - zTop < 80) return null;
  const gx = cycledGoal(F, 'x', k, reachDist(F, (lz - zTop) / Math.max(v1, v2)));
  if (gx == null) return null;
  const Bw = squadBox(F, gx);
  const shots = [];
  for (const side of [-1, 1]) {
    const wall = side < 0 ? F.eLo + r : F.eHi - r;
    const far = side < 0 ? Bw.x0 - 2 - r : Bw.x1 + 2 + r;
    const room = side < 0 ? far - wall : wall - far;
    if (room < 12) continue;
    let s = P.slopeMax, h = room / s - depth;
    const hMax = lz - 60 - zTop;
    if (h > hMax) { h = hMax; s = room / (h + depth); }
    if (h < 2) { h = 2; s = room / (h + depth); }
    if (s < 0.06) continue;
    const zb = zTop + h, zEnd = F.zFloor - r - 4, xEnd = wall - side * s * (zb - zEnd);
    const lx = bo.x + side * bo.r * 0.7;
    const L1 = Math.hypot(wall - lx, zb - lz), L2 = Math.hypot(xEnd - wall, zEnd - zb);
    for (let i = 0; i < P.n; i++) {
      const t0 = i * P.every;
      shots.push({ path: [[t0, lx, lz], [t0 + L1 / v1, wall, zb], [t0 + L1 / v1 + L2 / v2, xEnd, zEnd]], r });
    }
  }
  if (!shots.length) return null;
  return finishShot(F, 'ricochet', shots, 'x', gx, { pause: true });
}

//  ── B2 갠트리 위도우 ──
//  갈고리 낙하(광역): 부대 한가운데 z 의 한 점(부대 중심에서 어긋남 off)에 경보 원 → 갈고리가 내리꽂힌다
function planHook(bo, F, P, k) {
  return aimAoe(F, 'hook', P, k, F.hw - SQ.unitR + P.R - 6, ['x'],
    (off, lx) => [{ shape: { t: 'circ', x: clamp(F.x + lx + off, F.eLo, F.eHi), z: F.zc, R: P.R }, at: P.tele }],
    () => ({ from0: { x: bo.x, z: bo.z } }));
}
//  다리 끝 8곳(보스 반지름 48 기준 오프셋 — 보스 크기에 비례)
const LEGS = [[-70, -16], [-58, -38], [-38, -52], [-14, -58], [14, -58], [38, -52], [58, -38], [70, -16]];
//  거미다리 바늘(탄): 다리 끝마다 바늘이 부채처럼(±spread) volleys 번 — 설 곳(k % 3)을 먼저 정하고 그 상자를 지나는 바늘은 빼낸다(다리 사이 빈틈)
function planNeedles(bo, F, P, k, vm) {
  const v = P.v * vm, sc = bo.r / 48, half = (P.legs - 1) / 2;
  const all = [];
  for (let j = 0; j < P.volleys; j++) for (let i = 0; i < P.legs; i++) {
    const a = P.spread * (i + 0.5 * j - half) / half;
    const [dx, dz] = LEGS[i % LEGS.length];
    all.push({ path: rayPath(F, bo.x + dx * sc, bo.z + dz * sc, Math.sin(a), -Math.cos(a), v, P.r, j * P.every), r: P.r, leg: i });
  }
  const gx = cycledGoal(F, 'x', k, reachDist(F, enterTime(shotSegs(all), F, 'x')));
  if (gx == null) return null;
  const Bw = squadBox(F, gx);
  const shots = all.filter((s) => !shotSegs([s]).some((g) => shapeHitsBox(g, Bw)));
  if (shots.length < 3) return null;
  return finishShot(F, 'needles', shots, 'x', gx, { pause: true });
}
//  거미줄 그물(광역): 폭 w × 깊이 d 사각(부대 한가운데 z 둘레)을 부대 쪽(어긋남 off)에 → 안에 있으면 피해 + 느려짐(slow)
function planWeb(bo, F, P, k) {
  const h = P.w / 2;
  return aimAoe(F, 'web', P, k, F.hw - SQ.unitR + h - 6, ['x'], (off, lx) => {
    const tx = clamp(F.x + lx + off, F.eLo + h, F.eHi - h);
    return [{ shape: { t: 'rect', x0: tx - h, x1: tx + h, z0: F.zc - P.d / 2, z1: F.zc + P.d / 2 }, at: P.tele, slow: { sec: P.slowSec, mul: P.slowMul } }];
  }, () => ({ from0: { x: bo.x, z: bo.z } }));
}

//  ── B3 레일 리바이어던 ──
//  레일 돌진(광역): 폭 w 의 한 줄(레일)을 부대 쪽(어긋남 off)에 — 도로 = 세로 레일. 광장 = k 짝수 세로 · 홀수 가로(세로로 피한다), 안 되면 다른 방향
function planRail(bo, F, P, k) {
  const h = P.w / 2, top = F.runZ + 780, bot = F.runZ - 240;
  const dirs = F.arena ? (k % 2 ? ['h', 'v'] : ['v', 'h']) : ['v'];
  for (const d of dirs) {
    const horiz = d === 'h';
    const lim = (horiz ? Math.max(-F.dyMin, F.dyMax) : F.hw - SQ.unitR) + SQ.unitR + h - 6;
    const plan = aimAoe(F, 'rail', P, k, lim, [horiz ? 'z' : 'x'], (off, lx, lz) => {
      const x = clamp(F.x + lx + off, F.eLo, F.eHi), z = F.zc + lz + off;
      return [{ shape: horiz ? { t: 'seg', ax: F.eLo - 40, az: z, bx: F.eHi + 40, bz: z, r: h } : { t: 'seg', ax: x, az: top, bx: x, bz: bot, r: h }, at: P.tele }];
    }, () => ({ horiz }));
    if (plan) return plan;
  }
  return null;
}
//  객차 사슬의 길(점 목록 [x, z] — 앞에서 뒤로): 도로 = 입에서 겨눈 x 의 부대 띠 위까지 비스듬히 온 뒤 물결치며 곧게 아래로.
//   광장 = 입에서 겨눈 점 쪽으로 곧게 가며 옆으로 물결(가로·세로 성분 중 큰 쪽에 수직인 축이 피하는 축)
function chainTrack(F, bo, P, r, tx, tz) {
  const pts = [];
  if (!F.arena) {
    const mx = bo.x, mz = bo.z - bo.r * 0.8;
    const zq = Math.min(mz - 30, squadBox(F).z1 + r + 60);
    if (zq <= squadBox(F).z1 + r + 2) return null;
    pts.push([mx, mz]);
    const zEnd = F.zFloor - r - 4;
    for (let z = zq; z > zEnd - 10; z -= 10) pts.push([tx + P.amp * Math.sin(2 * Math.PI * (zq - z) / P.wave), Math.max(z, zEnd)]);
    return { pts, axis: 'x' };
  }
  const dx = tx - bo.x, dz = tz - bo.z, L = Math.hypot(dx, dz);
  if (L < bo.r + 40) return null;
  const ux = dx / L, uz = dz / L, nx = -uz, nz = ux;
  const mx = bo.x + ux * bo.r * 0.8, mz = bo.z + uz * bo.r * 0.8;
  const sEnd = rayLen(F, mx, mz, ux, uz, r);
  for (let s = 0; s <= sEnd + 1e-9; s += 10) { const w = P.amp * Math.sin(2 * Math.PI * s / P.wave); pts.push([mx + ux * s + nx * w, mz + uz * s + nz * w]); }
  return { pts, axis: Math.abs(uz) >= Math.abs(ux) ? 'x' : 'z' };
}
//  객차 연결탄(탄): 길 위를 cars 개 객차가 carGap 간격으로 줄지어 v 로 달린다(객차 i 는 i × carGap ÷ v 초 늦게 입에서 나온다). 겨누는 자리를 부대 쪽에서 벌려 가며 설 곳이 나오는 첫 자리
function planChain(bo, F, P, k, vm) {
  const v = P.v * vm, r = P.r;
  const lim = F.hw - SQ.unitR + P.amp + r;
  //  앞질러 겨누기: 사슬이 부대에 닿는 1초 안팎을 어림(부대가 가던 쪽 앞)
  const [lx, lz] = leadOf(F, 1);
  for (const off of offsets(lim, k, 6)) {
    const tr = chainTrack(F, bo, P, r, F.arena ? F.x + lx + off : clamp(F.x + lx + off, F.eLo + P.amp, F.eHi - P.amp), F.zc + lz);
    if (!tr) continue;
    if (F.arena && tr.axis === 'z') {
      //  광장에서 옆으로 달리는 사슬은 세로로 어긋나게 다시 겨눈다
      const t2 = chainTrack(F, bo, P, r, F.x + lx, F.zc + lz + off);
      if (!t2 || t2.axis !== 'z') continue;
      tr.pts = t2.pts;
    }
    const cum = [0];
    for (let i = 1; i < tr.pts.length; i++) cum.push(cum[i - 1] + Math.hypot(tr.pts[i][0] - tr.pts[i - 1][0], tr.pts[i][1] - tr.pts[i - 1][1]));
    const shots = [];
    for (let c = 0; c < P.cars; c++) {
      const t0 = c * P.carGap / v;
      shots.push({ path: tr.pts.map(([x, z], i) => [t0 + cum[i] / v, x, z]), r, car: c });
    }
    const segs = shotSegs(shots);
    const T = enterTime(segs, F, tr.axis), D = reachDist(F, T);
    const g = searchGoal(F, segs, [tr.axis], () => D);
    if (!g) continue;
    const plan = finish(F, 'chain', segs, g, T, D, { shots, pause: true });
    if (plan) return plan;
  }
  return null;
}
//  교차 레일(광역): 폭 w 의 두 줄이 부대 띠 한가운데 z(어긋남 off)에서 X 로 엇갈린다(기울기 slope = 가로 ÷ 세로). 광장 k 홀수 = 누운 X(세로로 피한다)
function planCrossrail(bo, F, P, k) {
  const h = P.w / 2, zm = (F.zLo + F.zHi) / 2, L = 1100;
  const dirs = F.arena ? (k % 2 ? ['flat', 'steep'] : ['steep', 'flat']) : ['steep'];
  for (const d of dirs) {
    const flat = d === 'flat';
    const lim = (flat ? Math.max(-F.dyMin, F.dyMax) : F.hw - SQ.unitR) + h + 20;
    const plan = aimAoe(F, 'crossrail', P, k, lim, [flat ? 'z' : 'x'], (off, lx, lz) => {
      const cx = flat ? F.x : clamp(F.x + lx + off, F.eLo, F.eHi), cz = flat ? zm + lz + off : zm;
      return [1, -1].map((sx) => {
        const [ex, ez] = flat ? [1, sx * P.slope] : [sx * P.slope, 1];
        const n = Math.hypot(ex, ez);
        return { shape: { t: 'seg', ax: cx - ex / n * L, az: cz - ez / n * L, bx: cx + ex / n * L, bz: cz + ez / n * L, r: h }, at: P.tele };
      });
    }, () => ({ flat }));
    if (plan) return plan;
  }
  return null;
}

//  ── B4 스멜터 ──
//  쇳물 붓기(광역): 경보 원(부대 쪽 어긋남 off) → 붓는 순간 피해, linger 초 동안 남아 tick 초마다 안의 병사에게 피해. 광장은 가로·세로로 겨눈다(k 로 순서)
function planPour(bo, F, P, k) {
  const axes = F.arena ? (k % 2 ? ['z', 'x'] : ['x', 'z']) : ['x'];
  for (const ax of axes) {
    const lim = (ax === 'z' ? Math.max(-F.dyMin, F.dyMax) : F.hw - SQ.unitR) + SQ.unitR + P.R - 6;
    const plan = aimAoe(F, 'pour', P, k, lim, [ax], (off, lx, lz) => [{
      shape: { t: 'circ', x: ax === 'z' ? F.x + lx : clamp(F.x + lx + off, F.eLo, F.eHi), z: ax === 'z' ? F.zc + lz + off : F.zc + lz, R: P.R },
      at: P.tele, linger: P.linger, tick: P.tick }], () => ({ from0: { x: bo.x, z: bo.z } }));
    if (plan) return plan;
  }
  return null;
}
//  슬래그 산탄(탄): 두 손(도가니)에서 번갈아 n 발이 넓게(±spread, 발마다 속도 배수 vm) — 도로 = 아래로 · 광장 = 부대 쪽으로. 설 곳(k % 3)을 먼저 정하고 그 상자를 지나는 덩이는 뺀다
function planSlag(bo, F, P, k, vm) {
  const dx = F.x - bo.x, dz = F.zc - bo.z;
  const base = F.arena && Math.hypot(dx, dz) > 1 ? Math.atan2(dx, -dz) : 0;
  const axis = F.arena ? (Math.abs(Math.cos(base)) >= Math.abs(Math.sin(base)) ? 'x' : 'z') : 'x';
  const all = [], half = (P.n - 1) / 2;
  for (let i = 0; i < P.n; i++) {
    const a = base + P.spread * (i - half) / half;
    const hx = bo.x + (i % 2 ? 1 : -1) * bo.r * 0.45, hz = bo.z - bo.r * 0.2;
    all.push({ path: rayPath(F, hx, hz, Math.sin(a), -Math.cos(a), P.v * vm * P.vm[i % P.vm.length], P.r), r: P.r });
  }
  const g0 = cycledGoal(F, axis, k, reachDist(F, enterTime(shotSegs(all), F, axis)));
  if (g0 == null) return null;
  const Bw = boxOn(F, axis, g0);
  const shots = all.filter((s) => !shotSegs([s]).some((g) => shapeHitsBox(g, Bw)));
  if (shots.length < 3) return null;
  return finishShot(F, 'slag', shots, axis, g0, { pause: true });
}
//  쇳물 비(광역): 설 곳(k % 3 — 광장 k 홀수는 세로)을 먼저 정하고, 부대 둘레 격자 자리 중 그 상자 밖 방울을 부대에 가까운 것부터 max 개 —
//   가로 한쪽 끝부터(k 로 방향) every 초 간격으로 차례로 떨어진다(첫 방울 = 경보 tele)
function planRain(bo, F, P, k) {
  const axis = F.arena && k % 2 ? 'z' : 'x';
  const g0 = cycledGoal(F, axis, k, reachDist(F, P.tele));
  if (g0 == null) return null;
  const Bw = boxOn(F, axis, g0);
  const stepX = 2 * P.R + 6;
  const rows = axis === 'z' ? [-2, -1, 0, 1, 2].map((i) => F.zc + i * P.row) : [F.zc - P.row, F.zc, F.zc + P.row];
  const cand = [];
  rows.forEach((z, ri) => { for (let x = F.eLo + P.R + (ri % 3) * stepX / 3; x <= F.eHi - P.R * 0.5 + 1e-9; x += stepX) cand.push([x, z]); });
  const ok = cand.filter(([x, z]) => !circHitsBox(x, z, P.R, Bw))
    .sort((p, q) => Math.hypot(p[0] - F.x, p[1] - F.zc) - Math.hypot(q[0] - F.x, q[1] - F.zc) || p[0] - q[0] || p[1] - q[1]).slice(0, P.max);
  if (ok.length < 3) return null;
  const dir = k % 2 ? -1 : 1;
  ok.sort((p, q) => dir * (p[0] - q[0]) || p[1] - q[1]);
  return finishAoe(F, 'rain', ok.map(([x, z], i) => ({ shape: { t: 'circ', x, z, R: P.R }, at: P.tele + i * P.every })), { axis, v: g0 }, {});
}

//  ── B5 크라운브레이커(광장) ──
//  철퇴 휘두르기(광역): 보스 둘레 부채꼴(반각 half°) — 방향 = 부대 쪽 + 어긋남(0, ±12°, … — 부채꼴이 부대 한쪽을 물게), 반지름 = 부대의 보스 쪽 끝 + bite(Rmin~Rmax).
//   부대는 옆(부채꼴 밖)이나 뒤(반지름 밖)로 피한다 — 가로·세로 중 덜 움직이는 쪽
function planMace(bo, F, P, k) {
  const [lx, lz] = leadOf(F, P.tele);
  const dx = F.x + lx - bo.x, dz = F.zc + lz - bo.z, dist = Math.hypot(dx, dz);
  if (dist < 30) return null;
  const toSq = Math.atan2(dz, dx);
  const R = clamp(dist - frontExt(F, -dx / dist, -dz / dist) + P.bite, P.Rmin, P.Rmax);
  const D = reachDist(F, P.tele);
  const s = k % 2 ? -1 : 1;
  for (const o of [0, 12, -12, 24, -24, 36, -36, 48, -48, 60, -60]) {
    const phi = toSq + s * o * DEG, half = P.half * DEG;
    //  호의 점은 휘두르는 쪽 끝부터(렌더가 경보 채움·휩쓸기를 이 순서로 그린다)
    const pts = [[bo.x, bo.z]];
    for (let a = -half; a <= half + 1e-9; a += 6 * DEG) pts.push([bo.x + Math.cos(phi + s * a) * R, bo.z + Math.sin(phi + s * a) * R]);
    const zones = [{ shape: { t: 'poly', pts }, at: P.tele }];
    const g = searchGoal(F, [zones[0].shape], ['x', 'z'], () => D);
    if (!g) continue;
    const plan = finishAoe(F, 'mace', zones, g, { pause: true, apex: [bo.x, bo.z], phi, half, R, swing: s });
    if (plan) return plan;
  }
  return null;
}
//  왕관 칼날 회전(탄): 칼날 팔 arms 개(90° 간격)가 volleys 번(every 초 간격) turn° 씩 돌며 보스에서 곧게 뻗어 나간다 — 팔마다 칼날 per 배 속도(한 팔 = 한 줄).
//   가운데 번의 팔 하나가 부대 쪽(+어긋남) — 팔 사이(66° 안팎)로 피한다
function planBlades(bo, F, P, k, vm) {
  const dx = F.x - bo.x, dz = F.zc - bo.z;
  if (Math.hypot(dx, dz) < bo.r + 40) return null;
  const toSq = Math.atan2(dz, dx), dir = k % 2 ? -1 : 1;
  for (const o of [0, 14, -14, 28, -28, 40, -40]) {
    const th0 = toSq + (o - dir * P.turn * (P.volleys - 1) / 2) * DEG;
    const shots = [];
    for (let j = 0; j < P.volleys; j++) for (let a = 0; a < P.arms; a++) for (const pm of P.per) {
      const ang = th0 + (a * 360 / P.arms + dir * j * P.turn) * DEG, ux = Math.cos(ang), uz = Math.sin(ang);
      shots.push({ path: rayPath(F, bo.x + ux * bo.r * 0.6, bo.z + uz * bo.r * 0.6, ux, uz, P.v * vm * pm, P.r, j * P.every), r: P.r, spin: dir });
    }
    const segs = shotSegs(shots);
    const g = searchGoal(F, segs, ['x', 'z'], (ax) => reachDist(F, enterTime(segs, F, ax)));
    if (!g) continue;
    const T = enterTime(segs, F, g.axis);
    const plan = finish(F, 'blades', segs, g, T, reachDist(F, T), { shots, pause: true });
    if (plan) return plan;
  }
  return null;
}
//  집게 충격파(광역): 집게로 내려찍은 자리(부대 쪽 한 점 — 가로·세로 어긋남)에서 고리가 반지름 R 까지 퍼진다. 한 곳(방향 = 네 방향 중 하나, 반각 gapHalf°)이 끊겼다 —
//   끊긴 틈 쐐기 안이나 고리 밖으로 피한다(가로·세로 중 덜 움직이는 쪽)
function planQuake(bo, F, P, k) {
  const D = reachDist(F, P.tele);
  const lim = Math.max(F.hw, -F.dyMin, F.dyMax) + P.R - 10;
  const gaps = k % 2 ? [90, -90, 180, 0] : [-90, 90, 0, 180];
  const [lx, lz] = leadOf(F, P.tele);
  for (const off of offsets(lim, k, 8)) {
    for (const ax of ['x', 'z']) {
      if (off === 0 && ax === 'z') continue;
      const cx = clamp(F.x + lx + (ax === 'x' ? off : 0), F.eLo, F.eHi), cz = F.zc + lz + (ax === 'z' ? off : 0);
      for (const gd of gaps) {
        const shape = { t: 'ring', x: cx, z: cz, R: P.R, th: P.th, ang: gd * DEG, half: P.gapHalf * DEG };
        const g = searchGoal(F, [shape], ['x', 'z'], () => D);
        if (!g) continue;
        const plan = finishAoe(F, 'quake', [{ shape, at: P.tele }], g, { pause: true, from0: { x: bo.x, z: bo.z } });
        if (plan) return plan;
      }
    }
  }
  return null;
}
