// rush3/squad.js — 병사 유닛·대형·통로 제약(계약서 3-5·3-6). 순수 모듈: 난수·balance import 없음.
// 좌표 규약: 유닛 위치 = (run.x + dx, run.z - dy). dy 양수 = 뒤(화면 아래). "앞줄" = dy 작은 순, "뒤쪽" = dy 큰 순.

// 기본값 = 계약서 값. 호출자가 opts 로 덮어쓸 수 있다(balance.js 를 여기서 import하지 않는다).
//  unitCap 100(r3.21, 이사 결정 2026-09-20 B안 ⑤ — BAL3.squad.unitCap 과 같은 값. combat 은 cap 인자 없이 addUnits 를 부르므로 실제 상한은 이 칸이다. V3-DIFFB 가 둘의 일치를 잠근다)
export const SQUAD_DEFAULTS = Object.freeze({
  unitR: 9, unitHp: 2, ringStart: 26, ringGap: 19, soldierSize: 22,
  roadLo: 80, roadHi: 400, wallLead: 60, wallMargin: 6, freeHalfMax: 60, unitCap: 100,
});

function cfg(opts) { return opts ? { ...SQUAD_DEFAULTS, ...opts } : SQUAD_DEFAULTS; }

// n 별 대형 캐시(옵션이 기본값일 때만). 결정적이므로 재계산과 같다.
const formCache = new Map();

/** 라스트워식 둥근 군집: 히어로(0,0) 중심 동심 링. 전방 ±45도(90도)는 비운다.
 *  기존 rush/squad.js 링 알고리즘을 옮겨 적음(drawCap 없음, n 그대로). 반환 [{dx, dy}] 길이 n. */
export function formation(n, opts) {
  const o = cfg(opts);
  const useCache = o === SQUAD_DEFAULTS;
  if (useCache && formCache.has(n)) return formCache.get(n);
  const out = [];
  if (n > 0) out.push({ dx: 0, dy: 0 });
  let k = 1;
  while (out.length < n) {
    const r = o.ringStart + (k - 1) * o.ringGap;
    // 전방 90도 부채꼴 제외 → 사용 가능 호 = 270도
    const usable = Math.PI * 1.5;
    const slots = Math.max(3, Math.round(usable * r / o.soldierSize));
    for (let i = 0; i < slots && out.length < n; i++) {
      // a: 0=전방(위), π=정후방. 홀짝 링은 반 칸 어긋나게.
      const a = Math.PI * 0.25 + (i + (k % 2) * 0.5) * (usable / slots);
      out.push({ dx: Math.round(Math.sin(a) * r), dy: Math.round(-Math.cos(a) * r) });
    }
    k++;
  }
  const res = out.slice(0, n);
  if (useCache) formCache.set(n, res);
  return res;
}

/** 대형 반폭 = 오프셋 |dx| 최대 + unitR. n=0 이면 unitR. */
export function formationHalfWidth(n, opts) {
  const o = cfg(opts);
  let m = 0;
  for (const p of formation(n, opts)) if (Math.abs(p.dx) > m) m = Math.abs(p.dx);
  return m + o.unitR;
}

/** 유닛 생성. fireT 위상 = ((id*7)%12)/12 * interval(결정적 분산). */
export function makeUnit(id, interval = 0.5, opts) {
  const o = cfg(opts);
  return { id, dx: 0, dy: 0, hp: o.unitHp, fireT: ((id * 7) % 12) / 12 * interval };
}

/** 배열 순서대로 formation(units.length) 오프셋을 재부여(id 유지). 반환 units. */
export function layoutUnits(units, opts) {
  const f = formation(units.length, opts);
  for (let i = 0; i < units.length; i++) { units[i].dx = f[i].dx; units[i].dy = f[i].dy; }
  return units;
}

/** 유닛 dx 를 **중심 기준 상대 범위** [dxLo, dxHi] 안으로 비례 압축(좌·우 따로). 반환 units.
 *  ⚠️ 인자는 절대 좌표도, clampCenter 의 중심 허용 범위(lo/hi)도 아니다.
 *  combat 은 `const c = clampCenter(run, walls); compressUnits(run.units, c.dxLo, c.dxHi)` 로 호출한다
 *  (dxLo = 통로 가장자리 lo + unitR − run.x, dxHi = 가장자리 hi − unitR − run.x → 유닛 원까지 통로 안).
 *  기준은 현재 dx 가 아니라 formation 오프셋이므로 범위가 넓어지면 원래 대형으로 되돌아온다(매 STEP 호출 안전).
 *  압축 필요 없으면 formation 값 그대로. */
export function compressUnits(units, dxLo, dxHi, opts) {
  const f = formation(units.length, opts);
  let minDx = 0, maxDx = 0;
  for (const p of f) { if (p.dx < minDx) minDx = p.dx; if (p.dx > maxDx) maxDx = p.dx; }
  const lo2 = Math.min(dxLo, 0), hi2 = Math.max(dxHi, 0);
  const kL = minDx < lo2 ? lo2 / minDx : 1;
  const kR = maxDx > hi2 ? hi2 / maxDx : 1;
  for (let i = 0; i < units.length; i++) {
    const b = f[i].dx;
    units[i].dx = b < 0 ? Math.round(b * kL) : (b > 0 ? Math.round(b * kR) : 0);
    units[i].dy = f[i].dy;
  }
  return units;
}

// 벽 진입 시 통로 선택: 중심 x 가 벽 중앙보다 왼쪽이면 L, 오른쪽이면 R, 정확히 중앙이면 tx 로(둘 다 중앙이면 L).
function pickSide(run, wall) {
  const mid = (wall.x0 + wall.x1) / 2;
  if (run.x < mid) return 'L';
  if (run.x > mid) return 'R';
  // 계약서 괄호 규정: 중심·tx 둘 다 정확히 중앙이면 'L'
  return run.tx <= mid ? 'L' : 'R';
}

/** 부대 중심 제약(계약서 3-5·3-6). run.x·run.tx 를 클램프하고 run.wallSide 를 갱신한다.
 *  반환 { lo, hi, edgeLo, edgeHi, hw, dxLo, dxHi, wallId } — 이름이 세 뜻으로 갈리므로 주의:
 *   lo/hi     = **중심** 허용 범위(절대 x). compressUnits 에 넣으면 안 된다(대형이 hw 폭으로 뭉개진다).
 *   edgeLo/hi = 통로(또는 도로) **가장자리**(절대 x). hw = 적용 반폭.
 *   dxLo/dxHi = compressUnits 에 그대로 넘길 **상대** 범위(= edge ± unitR − run.x). wallId = 활성 벽 id 또는 null. */
export function clampCenter(run, walls, opts) {
  const o = cfg(opts);
  if (!run.wallSide) run.wallSide = {};
  if (!run.wallSideLog) run.wallSideLog = {};
  const n = run.units ? run.units.length : 0;
  const fw = formationHalfWidth(n, opts);
  const prevZ = Number.isFinite(run.prevZ) ? run.prevZ : run.z;
  let edgeLo = o.roadLo, edgeHi = o.roadHi, hw = Math.min(fw, o.freeHalfMax), wallId = null;
  for (const w of walls || []) {
    const enterZ = w.z0 - o.wallLead;
    if (run.z > w.z1) { delete run.wallSide[w.id]; continue; }
    if (run.z < enterZ) continue;
    // 활성 구간: enterZ <= z <= z1
    let side = run.wallSide[w.id];
    //  wallSideLog 는 벽을 빠져나가도 남는다(결과 화면이 '어느 통로로 갔는가'를 읽는다)
    if (prevZ < enterZ || !side) { side = pickSide(run, w); run.wallSide[w.id] = side; run.wallSideLog[w.id] = side; }
    const cLo = side === 'L' ? o.roadLo : w.x1;
    const cHi = side === 'L' ? w.x0 : o.roadHi;
    // 여러 벽이 겹치면 교집합
    if (cLo > edgeLo) edgeLo = cLo;
    if (cHi < edgeHi) edgeHi = cHi;
    wallId = w.id;
  }
  if (wallId !== null) hw = Math.min(fw, (edgeHi - edgeLo) / 2 - o.wallMargin);
  const lo = edgeLo + hw, hi = edgeHi - hw;
  run.x = Math.max(lo, Math.min(hi, run.x));
  if (Number.isFinite(run.tx)) run.tx = Math.max(lo, Math.min(hi, run.tx));
  return { lo, hi, edgeLo, edgeHi, hw, dxLo: edgeLo + o.unitR - run.x, dxHi: edgeHi - o.unitR - run.x, wallId };
}

// 점 p 와 선분 ab 의 최근접 파라미터 t(0..1)와 거리 제곱
function segNearest(ax, az, bx, bz, px, pz) {
  const vx = bx - ax, vz = bz - az;
  const len2 = vx * vx + vz * vz;
  let t = 0;
  if (len2 > 0) t = Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / len2));
  const qx = ax + vx * t - px, qz = az + vz * t - pz;
  return { t, d2: qx * qx + qz * qz };
}

// 겹침 후보 수집: 원(x,z,r) 또는 스윕 선분(sweep → x,z)과 겹치는 살아 있는 유닛을 [{ u, t, d2 }] 로.
// t = 선분 파라미터(0 = 스윕 시작 = 먼저 닿음), d2 = 선분까지 거리 제곱. 원만이면 t 는 항상 0.
function overlapHits(units, x, z, r, sweep, origin, opts) {
  const o = cfg(opts);
  const ox = origin ? origin.x : 0, oz = origin ? origin.z : 0;
  const rr = (r + o.unitR) * (r + o.unitR);
  const ax = sweep ? (Number.isFinite(sweep.x) ? sweep.x : x) : x;
  const az = sweep ? sweep.z : z;
  const out = [];
  for (const u of units) {
    if (u.hp <= 0) continue;
    const ux = ox + u.dx, uz = oz - u.dy;
    const q = segNearest(ax, az, x, z, ux, uz);
    if (q.d2 <= rr) out.push({ u, t: q.t, d2: q.d2 });
  }
  return out;
}

/** 원(x, z, r) 또는 스윕 선분(sweep{x?,z} → x,z)과 유닛 원(중심 origin.x+dx, origin.z-dy, unitR)이 겹치는
 *  유닛 **전부**(입력 순서, hp ≤ 0 제외). origin 은 부대 중심 { x, z }(생략 시 0,0 = 상대 좌표 입력).
 *  접촉 규칙(계약서 3-7 '겹친 유닛 중 앞줄 1명')은 `frontmostUnit(overlappingUnits(...))` 로 쓴다. */
export function overlappingUnits(units, x, z, r, sweep = null, origin = null, opts) {
  return overlapHits(units, x, z, r, sweep, origin, opts).map((h) => h.u);
}

/** overlappingUnits 와 같은 겹침 중 **가장 가까운 1명**(계약서 3-5 피해 판정). 스윕이면 진행 방향에서
 *  먼저 닿는(t 최소) 유닛, 같으면 거리 최소. 원만이면 거리 최소. 겹치는 유닛 없으면 null.
 *  ⚠️ '가장 가까운' ≠ '앞줄' — 접촉의 앞줄 규칙에는 frontmostUnit(overlappingUnits()) 를 쓴다. */
export function hitUnit(units, x, z, r, sweep = null, origin = null, opts) {
  let best = null;
  for (const h of overlapHits(units, x, z, r, sweep, origin, opts)) {
    if (!best || h.t < best.t || (h.t === best.t && h.d2 < best.d2)) best = h;
  }
  return best ? best.u : null;
}

/** 앞줄(dy 최소) 유닛. filterFn 이 있으면 통과한 유닛 중에서. 없으면 null. */
export function frontmostUnit(units, filterFn) {
  let best = null;
  for (const u of units) {
    if (filterFn && !filterFn(u)) continue;
    if (!best || u.dy < best.dy) best = u;
  }
  return best;
}

/** n 명 제거(제자리 변경). from='back' = dy 큰 순, 'front' = dy 작은 순. 반환 제거된 수. layoutUnits 는 호출자 몫.
 *  keepHero(r4.4, 이사님 결정 D4′-a = 원안 '메인 로봇은 게이트·함정으로 절대 빠지지 않는다'): 참이면 hero 표시 유닛은 제거 후보에서 빠진다 —
 *   병사만 같은 순서로 빼고, 감소량이 병력 이상이어도 hero 1명이 남는다(제거 수 = min(병사 수, n)). 거짓(기본)이면 종전과 한 글자도 다르지 않다 */
export function removeUnits(units, n, from = 'back', keepHero = false) {
  const all = units.map((u, i) => ({ u, i }));
  const order = keepHero ? all.filter((e) => !e.u.hero) : all;
  const cnt = Math.max(0, Math.min(order.length, n | 0));
  if (cnt === 0) return 0;
  // 같은 dy 면 index 큰 쪽(나중 유닛)부터
  order.sort((a, b) => (from === 'front' ? a.u.dy - b.u.dy : b.u.dy - a.u.dy) || b.i - a.i);
  const drop = new Set(order.slice(0, cnt).map((e) => e.u));
  let w = 0;
  for (let i = 0; i < units.length; i++) if (!drop.has(units[i])) units[w++] = units[i];
  units.length = w;
  return cnt;
}

/** run.nextUnitId 로 n 명 생성해 run.units 에 추가(cap 클램프) 후 layoutUnits. 반환 추가된 수. */
export function addUnits(run, n, interval = 0.5, cap, opts) {
  const o = cfg(opts);
  const limit = Number.isFinite(cap) ? cap : o.unitCap;
  if (!Number.isFinite(run.nextUnitId)) run.nextUnitId = 1;
  let added = 0;
  while (added < (n | 0) && run.units.length < limit) {
    run.units.push(makeUnit(run.nextUnitId++, interval, opts));
    added++;
  }
  layoutUnits(run.units, opts);
  return added;
}
