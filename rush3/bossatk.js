// rush3/bossatk.js — r4.8 보스 공격 패턴의 설계(이사님 실플레이 3차 2026-09-26: "병사를 아무리 많이 모아도 보스에 가면 … 피할 수가 없이 모든 총알을 맞게 된다" ·
//  "적 보스의 공격 쏘는 패턴을 다양하게 만들자. 모든 보스가 같은 패턴의 같은 총알만 쏟아낸다").
//  순수 규칙 모듈: 난수·시계·화면·저장 없음(V3-PURE). 두 가지를 맡는다.
//   ① 판 정의 시점: 보스 정의 → 패턴 배정(atkPlanFor — buildStage 가 게임 화면 줄에서만 부른다)
//   ② 공격 한 번의 설계(planAttack): 지금 부대 자리·대형에서 **안전 구역을 먼저 정하고** 그 밖에 위험(탄·기둥)을 둔다.
//      안전 구역 = x 구간 [s0, s1] — 폭 ≥ 부대 폭(2 × 반폭) + margin · 가운데에 부대 중심이 설 수 있고 · 지금 중심에서 moveMax × 닿는 시간 × reachK 안.
//      r4.9 (가): 닿는 시간 = 광역은 경보 초, 탄은 첫 탄이 부대 띠에 닿기까지 초(탄 공격은 도로에 안내가 없다 — 안전 구역은 규칙만 안다).
//      위험은 부대 띠(부대가 차지하는 z 범위)에서 차지하는 x 범위로 잰다 — 부대 전체(유닛 원 끝까지)가 안전 구역 안에 있으면 어떤 탄·기둥에도 닿지 않는다.
//      보장이 안 되면 null(그 패턴을 고르지 않는다 — 부르는 쪽이 다음 패턴으로). 진행(예고 시간·탄 생성·피해)은 combat.js 가 한다.
//  좌표: x = 도로 가로(80~400, 광장 40~440), z = 트랙(클수록 앞). 탄의 방향 (ux, uz) 는 단위 벡터(uz < 0 = 부대 쪽 아래로).
import { BAL3 } from './balance.js';
import { formation, formationHalfWidth } from './squad.js';

const BA = BAL3.bossAtk, SQ = BAL3.squad, ROAD = BAL3.road;
export const ATK_KINDS = Object.freeze(['aim', 'wall', 'pillar', 'sweep', 'burst']);
/** r4.9 (가) 공격 종류: 'shot'(날아오는 탄 — 도로에 안내 없음, 장전 번쩍임 뒤 발사) | 'aoe'(광역 — 붉은 경보 구역) */
export const atkType = (kind) => (BA[kind] && BA[kind].type) || 'aoe';
//  그림이 없는 보스(1~5번 등 skin 없음) = 기본 보스 그림 B1 그레이더
export const ATK_DEFAULT_SKIN = 'B1_grader';
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** 보스 정의 → 패턴 배정 { seq, open, gap, look }(새 객체). arena = 광장 보스.
 *  광장 = 스킨의 arena 순서 · 역할이 있는 보스(포격·소환·장갑 — 복수 보스 판) = 역할 순서 · 그 밖(정예) = 스킨의 road 순서. 간격·탄 모양은 스킨 */
export function atkPlanFor(def, arena = false) {
  const skin = def.skin && BA.skins[def.skin] ? def.skin : ATK_DEFAULT_SKIN;
  const S = BA.skins[skin];
  const role = def.role ?? 'elite';
  let seq, open = BA.open;
  if (arena) seq = S.arena ?? BA.skins.B5_crownbreaker.arena;
  else if (role !== 'elite' && BA.roles[role]) { seq = BA.roles[role].seq; open = BA.roles[role].open; }
  else seq = S.road ?? BA.skins[ATK_DEFAULT_SKIN].road;
  return { seq: [...seq], open, gap: S.gap, look: S.look };
}

/** 지금 열린 패턴: seq 의 앞 open + 페이즈 개(페이즈 50% = 1 · 20% = 2 — 하나씩 더 열린다) */
export function unlockedAtk(atk, phase = 0) {
  return atk.seq.slice(0, Math.min(atk.seq.length, atk.open + (phase || 0)));
}

/** 부대 틀. hw = 반폭(유닛 원 끝까지) — 대형이 가장자리에서 풀려도 넘지 않는 값 min(대형 반폭, 보스전 상한 run.hwCap).
 *  부대 띠 z [zLo, zHi](대형의 앞·뒤 끝 + 유닛 반지름) · 가장자리 [eLo, eHi](도로·광장) · 중심이 설 수 있는 범위 [cLo, cHi](squad.clampCenter 의 벽 밖 규칙) ·
 *  필요한 안전 구역 폭 W = 2·hw + margin · zFloor = 부대 유닛이 내려갈 수 있는 가장 낮은 z(광장은 아래로 depth[1] 까지 움직일 수 있다) */
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
  const zFloor = (arena ? run.z - run.arena.depth[1] : zc) - dyMax - SQ.unitR;
  return { x: run.x, zc, hw, zLo: zc - dyMax - SQ.unitR, zHi: zc - dyMin + SQ.unitR, zFloor, eLo, eHi, cLo: eLo + hwc, cHi: eHi - hwc, W: 2 * hw + BA.margin };
}

//  안전 구역 가운데 t 가 될 수 있는 범위: 구역이 가장자리 안 · 부대 중심이 설 수 있는 곳
function centerRange(F) {
  const h = F.W / 2;
  return [Math.max(F.eLo + h, F.cLo), Math.min(F.eHi - h, F.cHi)];
}
/** 위치 번호(0 왼쪽 · 1 가운데 · 2 오른쪽)의 안전 구역을 지금 부대가 닿는 곳(±D)으로 당긴다. 안 되면 null */
export function cycledZone(F, pos, D) {
  const h = F.W / 2;
  const [lo, hi] = centerRange(F);
  if (lo > hi + 1e-9) return null;
  const want = pos === 0 ? F.eLo + h : pos === 2 ? F.eHi - h : (F.eLo + F.eHi) / 2;
  const t = clamp(clamp(want, F.x - D, F.x + D), lo, hi);
  if (Math.abs(t - F.x) > D + 1e-9) return null;
  return [t - h, t + h];
}
/** 위험 x 범위 [d0, d1] 의 왼쪽·오른쪽 빈 곳 가운데 부대가 덜 움직여도 되는 안전 구역. 안 되면 null */
export function zoneBeside(F, d0, d1, D) {
  const h = F.W / 2;
  const [lo, hi] = centerRange(F);
  let best = null;
  for (const [a, b] of [[F.eLo, d0 - 1], [d1 + 1, F.eHi]]) {
    const l = Math.max(lo, a + h), r = Math.min(hi, b - h);
    if (l > r + 1e-9) continue;
    const t = clamp(F.x, l, r);
    if (Math.abs(t - F.x) > D + 1e-9) continue;
    if (best === null || Math.abs(t - F.x) < Math.abs(best - F.x)) best = t;
  }
  return best === null ? null : [best - h, best + h];
}

/** 원점 (ox, oz) 에서 단위 방향 (ux, uz) 로 가는 탄(반지름 r)이 부대 띠 z ∈ [zLo, zHi] 에서 차지하는 x 범위 [lo, hi](탄 두께 r ÷ |uz| 포함) | null(띠에 닿지 않음) */
export function rayBand(ox, oz, ux, uz, r, zLo, zHi) {
  if (Math.abs(uz) < 1e-6) return null;
  const sA = (zLo - r - oz) / uz, sB = (zHi + r - oz) / uz;
  const s1 = Math.max(sA, sB);
  if (s1 < 0) return null;
  const s0 = Math.max(0, Math.min(sA, sB));
  const x0 = ox + ux * s0, x1 = ox + ux * s1, h = r / Math.abs(uz);
  return [Math.min(x0, x1) - h, Math.max(x0, x1) + h];
}
//  두 구간이 겹치는가(경계 포함)
export const overlaps = (a, b) => a[0] <= b[1] && b[0] <= a[1];

//  탄이 나오는 z(탄 공격): 벽 = 도로는 보스 앞 · 광장은 광장 위쪽 끝 / 그 밖(조준 대포·쓸기) = 보스 가운데
function shotOriginZ(run, bo, kind, P) {
  if (kind === 'wall') return bo.arena ? run.z + run.arena.bossZ[1] : bo.z - bo.r - 6;
  return bo.z;
}
/** r4.9 (가) 탄 공격의 닿는 시간(초): 첫 탄이 부대 띠 앞끝(zHi)에 닿기까지. 탄은 아래로 v 보다 빨리 내려올 수 없으므로
 *  (나온 z − 반지름 − zHi) ÷ v 가 가장 이른 값이다(비스듬한 탄은 더 늦다 — 안전 쪽으로 어림) */
export function shotReachTime(run, bo, kind, F = squadFrame(run)) {
  const P = BA[kind];
  return Math.max(0, (shotOriginZ(run, bo, kind, P) - P.r - F.zHi) / P.v);
}

/** 공격 한 번의 설계. bo = 공격하는 보스(자리 bo.x·bo.z), kind = 패턴, k = 이 보스가 이 패턴을 쓴 횟수(위치 번갈이·겨누는 쪽).
 *  닿는 시간(r4.9 (가)): 광역 = 경보 tele 초 · 탄 = 첫 탄이 부대 띠에 닿기까지(shotReachTime — 도로에 안내가 없으니 탄을 본 순간부터 잰다).
 *  반환 { kind, type, tele(광역만, 탄 0), reachT(닿는 시간), reachD(닿는 거리), safe: [s0, s1], danger: [[x0, x1], …](부대 띠에서의 위험 x 범위), band: [zLo, zHi], zFloor, … 패턴별 칸 } | null */
export function planAttack(run, bo, kind, k = 0) {
  const P = BA[kind];
  if (!P || !ATK_KINDS.includes(kind) || !run.units.length) return null;
  const F = squadFrame(run);
  const type = atkType(kind);
  const T = type === 'shot' ? shotReachTime(run, bo, kind, F) : P.tele;
  const D = SQ.moveMax * T * BA.reachK;
  const plan = kind === 'wall' ? planWall(run, bo, F, P, D, k)
    : kind === 'pillar' ? planPillar(F, P, D, k)
    : kind === 'aim' ? planAim(bo, F, P, D, k)
    : kind === 'sweep' ? planSweep(bo, F, P, D, k)
    : planBurst(bo, F, P, D, k);
  if (!plan) return null;
  //  마지막 확인: 안전 구역이 모든 위험과 떨어져 있다
  if (plan.danger.some((d) => overlaps(d, plan.safe))) return null;
  return { ...plan, type, tele: type === 'shot' ? 0 : P.tele, reachT: T, reachD: D, band: [F.zLo, F.zHi], zFloor: F.zFloor, hw: F.hw, from: F.x };
}

//  ② 탄막 벽: 안전 구역(빈틈) = 위치 번호 k % 3 을 닿는 곳으로 당긴 자리. 탄은 빈틈 양옆에서 가장자리까지 gap 간격(병사 원이 빠져나갈 수 없다)
function planWall(run, bo, F, P, D, k) {
  const safe = cycledZone(F, k % 3, D);
  if (!safe) return null;
  const xs = [];
  for (let x = safe[0] - P.r - 2; x > F.eLo - 1; x -= P.gap) xs.unshift(x);
  for (let x = safe[1] + P.r + 2; x < F.eHi + 1; x += P.gap) xs.push(x);
  if (!xs.length) return null;
  //  탄 줄이 나오는 z: 도로 = 보스 앞 · 광장 = 광장 위쪽 끝(보스가 부대 가까이 있어도 벽이 부대 위에서 내려와 지나가게)
  const z = shotOriginZ(run, bo, 'wall', P);
  if (z - P.r <= F.zHi) return null;
  return { kind: 'wall', safe, danger: xs.map((x) => [x - P.r, x + P.r]), xs, z, r: P.r, v: P.v, pos: k % 3 };
}

//  ③ 기둥 포격: 안전 구역 = 위치 번호 k % 3. 기둥은 그 밖 두 조각에 고르게(조각마다 들어가는 만큼, 모두 max 개까지 — 넘치면 부대에서 먼 것부터 뺀다)
function planPillar(F, P, D, k) {
  const safe = cycledZone(F, k % 3, D);
  if (!safe) return null;
  const ph = P.w / 2;
  const xs = [];
  for (const [a, b] of [[F.eLo, safe[0] - 2], [safe[1] + 2, F.eHi]]) {
    const L = b - a;
    if (L < P.w) continue;
    const m = Math.min(P.max, Math.floor((L + P.space) / (P.w + P.space)));
    for (let i = 0; i < m; i++) xs.push(m === 1 ? (a + b) / 2 : a + ph + (L - P.w) * i / (m - 1));
  }
  if (!xs.length) return null;
  xs.sort((p, q) => Math.abs(p - F.x) - Math.abs(q - F.x) || p - q);
  const keep = xs.slice(0, P.max).sort((p, q) => p - q);
  return { kind: 'pillar', safe, danger: keep.map((x) => [x - ph, x + ph]), xs: keep, w: P.w, pos: k % 3 };
}

//  겨누는 점 후보: 부대 중심에서 2px 씩 벌려 가며(첫 쪽은 k 로 번갈아) 부대 몸통(유닛 중심 범위) 안까지 — 가만히 있는 부대는 맞는다
function* aimPoints(F, k) {
  const lim = Math.max(0, F.hw - SQ.unitR - 2);
  const first = k % 2 ? -1 : 1;
  yield F.x;
  for (let off = 2; off <= lim + 1e-9; off += 2) { yield F.x + first * off; yield F.x - first * off; }
}

//  ① 조준 대포: 보스(멈춤) → 겨누는 점(부대 몸통 안)으로 큰 탄 1발. 조준선이 부대 띠를 지나는 x 범위 밖에 안전 구역이 나오는 첫 점
function planAim(bo, F, P, D, k) {
  if (bo.arena && bo.state !== 'chase') return null;
  const ox = bo.x, oz = bo.z, dz = F.zc - oz;
  for (const tx of aimPoints(F, k)) {
    const dx = tx - ox, L = Math.hypot(dx, dz);
    if (L < 1) continue;
    const ux = dx / L, uz = dz / L;
    //  아래로 60° 안쪽만(보스가 부대 옆·아래면 조준선이 띠를 비스듬히 덮어 안전 구역을 보장하기 어렵다)
    if (uz > -0.5) return null;
    const band = rayBand(ox, oz, ux, uz, P.r, F.zLo, F.zHi);
    if (!band) continue;
    const safe = zoneBeside(F, band[0], band[1], D);
    if (safe) return { kind: 'aim', safe, danger: [band], ox, oz, tx, tz: F.zc, ux, uz, r: P.r, v: P.v, pause: true };
  }
  return null;
}

//  ④ 쓸기: 부대 쪽 끝(도로 가운데보다 왼쪽이면 왼쪽 끝)에서 시작해 반대쪽 끝의 안전 구역 앞에서 멈춘다. 줄기 = 보스(멈춤)에서 부대 중심 z 의 x 들로 쏘는 탄.
//   끝 x = 그 줄기가 부대 띠에서 차지하는 x 범위가 안전 구역에 닿지 않는 가장 가까운 x. 줄기가 minSpan 보다 짧으면 null
function planSweep(bo, F, P, D, k) {
  if (bo.arena && bo.state !== 'chase') return null;
  const ox = bo.x, oz = bo.z, dz = F.zc - oz;
  if (dz > -150) return null;
  const mid = (F.eLo + F.eHi) / 2;
  const fromLeft = F.x < mid - 1e-9 ? true : F.x > mid + 1e-9 ? false : k % 2 === 0;
  const safe = cycledZone(F, fromLeft ? 2 : 0, D);
  if (!safe) return null;
  const rayAt = (x) => { const dx = x - ox, L = Math.hypot(dx, dz); return rayBand(ox, oz, dx / L, dz / L, P.r, F.zLo, F.zHi); };
  const clear = (b) => !b || (fromLeft ? b[1] < safe[0] : b[0] > safe[1]);
  const x0 = fromLeft ? F.eLo : F.eHi;
  let x1 = fromLeft ? safe[0] : safe[1];
  for (let i = 0; i < 800 && !clear(rayAt(x1)); i++) x1 += fromLeft ? -1 : 1;
  if (!clear(rayAt(x1)) || (fromLeft ? x1 - x0 : x0 - x1) < P.minSpan) return null;
  const n = Math.round(P.dur / P.every) + 1;
  const xs = [], bands = [];
  for (let i = 0; i < n; i++) { const x = x0 + (x1 - x0) * i / (n - 1); xs.push(x); bands.push(rayAt(x)); }
  if (!bands.every(clear)) return null;
  const on = bands.filter(Boolean);
  if (!on.length) return null;
  const danger = [[Math.min(...on.map((b) => b[0])), Math.max(...on.map((b) => b[1]))]];
  return { kind: 'sweep', safe, danger, ox, oz, xs, tz: F.zc, fromLeft, r: P.r, v: P.v, every: P.every, pause: true };
}

//  ⑤ 산개탄(광장): 떨어질 자리 = 겨누는 점(부대 몸통 안, 부대 중심 z). 위험 = 반지름 reach + r 원의 x 범위(부대 띠를 늘 지난다)
function planBurst(bo, F, P, D, k) {
  const R = P.reach + P.r;
  for (const tx of aimPoints(F, k)) {
    const safe = zoneBeside(F, tx - R, tx + R, D);
    if (safe) return { kind: 'burst', safe, danger: [[tx - R, tx + R]], ox: bo.x, oz: bo.z, tx, tz: F.zc, R, reach: P.reach, n: P.n, r: P.r, v: P.v, spin: k % 2 };
  }
  return null;
}
