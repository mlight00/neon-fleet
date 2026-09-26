// rush3/firepower.js — 상한 화력 계산기(r4.7, 이사님 지시 2026-09-26 "적 보스 체력: 적어도 보스와 30초는 싸울 수 있도록 조정").
//  순수 함수: 난수·시계·화면·저장 없음. 판 정의(buildStage 결과)만 보고 **그 판을 가장 잘 했을 때** 어느 지점(z)에 도착하는 부대의
//  병력·무기와, 그 부대가 목표(보스)에 **실제로 닿는** 초당 피해를 계산한다. 난이도를 봇 승패로 정하지 않기 위한 계산이다(이사님 지시 "난이도는 너의 봇테스트로 하지 말도록").
//
//  병력 상한(그 z 까지, z 순서대로):
//   · 시작 병력 + 보스 전 게이트 행마다 **쏴서 올릴 수 있는 최선 칸의 상한(maxValue)** 으로 통과(음수 칸도 상한까지 올린 값 — 그 칸이 최선이면 그 값).
//     통로가 칸으로 다 덮이지 않은 행(우회로·분리벽 통로)은 '칸 없음 = 0' 도 고를 수 있다. 음수만 남으면 병력이 줄어든다(로봇 1명은 남는다)
//   · 보급 통(병사·구출 캡슐·연속 증원 = 발판 maxPads 전부) 전부 획득 · 병력 상한 BAL3.squad.unitCap(100) · 적에게 잃는 병력 0
//   · **둘 중 하나만 고르는 길**(분리벽 좌/우 통로 · 배제 쌍 pairId)은 조합을 전부 따져 **더 좋은 쪽 하나만**
//   · 랜덤 길(3-9)은 추첨 결과가 아니라 풀의 **좋은 결과 중 최선**(판마다 바뀌는 시드와 무관하게 같은 값)
//  무기 = 그 z 까지 얻을 수 있는 무기 통 중(판 시작 무기 포함) **목표에 닿는 초당 피해가 가장 큰 무기와 Mk**(같은 무기 통 수 = Mk, 최대 III).
//   피해 = 직격만(무기 + Mk). 폭발·연쇄는 한 목표 기준이라 넣지 않는다(직격한 목표는 폭발에서 빠지고, 연쇄는 다른 목표로 간다). 메인 로봇 강화 = 0.
//  목표에 닿는 탄(한 번 쏠 때 맞는 발 수):
//   · 도로 보스 = 부대 대형(formation, 도로 안으로 압축)의 유닛마다·부채꼴 발마다 탄이 지나는 직선이 보스 원(반지름 r + 탄 반폭)을
//     정지 거리(holdAhead 420 · 장갑형 360)에서 지나는가. 사거리 무기(산탄포 420)는 **그 유닛 자리에서** 사거리 안에 닿아야 한다(뒷줄은 못 닿는다).
//     보스 1체 = 보스가 도로를 고르게 왕복하고 부대가 그 바로 아래를 완벽하게 따라갈 때의 평균(도로 끝에서 대형이 눌리는 몫 포함) ·
//     보스 여럿 = 보스는 제 차선 가운데, 부대는 맞는 발 수가 가장 많은 x 에 선다
//   · 광장 보스 = 자동 조준이라 모든 발이 닿는다(상한 — 붙어 서면 산탄포 바깥 알갱이까지)
//  같은 상한 부대를 **현상금 적이 나오는 z 까지로 잘라** 현상금 적 체력도 계산한다(파일 끝 bountyFloor — r4.7 (c))
import { BAL3 } from './balance.js';
import { WEAPONS, weaponStats, fanAngles, fanSpeeds, MK_MAX } from './weapons.js';
import { formation, formationHalfWidth, compressUnits } from './squad.js';

const SQ = BAL3.squad, ROAD = BAL3.road;
//  아군 탄이 정리되는 전방 거리(부대 중심 기준) — combat.cleanup 의 ahead(LINE_Y + bulletAhead)
const CULL_AHEAD = BAL3.view.LINE_Y + BAL3.cull.bulletAhead;
//  도로 보스 1체 왕복 평균을 잴 때 보스 x 간격(px)
const PATROL_STEP = 4;

//  ── 부대 대형(유닛 자리) ──
//  n 명 대형을 부대 중심 x = sx 에서 도로 안으로 압축한 유닛 오프셋 [{ dx, dy }](combat 과 같은 squad.compressUnits)
export function squadOffsets(n, sx = ROAD.center) {
  const units = formation(n).map((p) => ({ dx: p.dx, dy: p.dy }));
  compressUnits(units, ROAD.x0 + SQ.unitR - sx, ROAD.x1 - SQ.unitR - sx);
  return units;
}
//  부대 중심이 설 수 있는 x 범위(벽 없는 도로 — squad.clampCenter 와 같은 식)
export function squadCenterRange(n) {
  const hw = Math.min(formationHalfWidth(n), 60);
  return [ROAD.x0 + hw, ROAD.x1 - hw];
}

/** 직선 탄(출발 (ux, uz), 기울기 t = dx/dz, +z 로 전진)이 원(cx, cz, R)에 닿는 첫 z. 출발 뒤 zMax 안에서 닿지 않으면 null */
export function lineCircleZ(ux, uz, t, cx, cz, R, zMax) {
  const c0 = ux - t * uz - cx;
  const A = t * t + 1, B = t * c0 - cz, C = c0 * c0 + cz * cz - R * R;
  const D = B * B - A * C;
  if (D < 0) return null;
  const s = Math.sqrt(D);
  const z1 = (-B - s) / A, z2 = (-B + s) / A;
  if (z2 < uz) return null;
  const z = Math.max(z1, uz);
  return z <= zMax ? z : null;
}

/** 한 번 쏠 때 목표에 닿는 발 수(도로). targets = [{ x, z(부대 중심 기준 전방 거리), r }]. sx = 부대 중심 x.
 *  유닛 자리 (sx + dx, −dy) 에서 부채꼴 발마다 직선을 긋고 가장 먼저 닿는 목표 하나에만 센다(탄 1발 = 1명중 — 관통탄도 목표가 겹치지 않으면 1) */
export function roadHits(n, weaponId, mk, targets, sx) {
  return roadHitsFrom(squadOffsets(n, sx), weaponId, mk, targets, sx);
}
//  같은 계산 — 유닛 오프셋을 미리 받는다(현상금 적 계산이 한 자리에서 거리만 바꿔 여러 번 부른다).
//   tw = 목표의 **세계 속도**(+z, px/s). 보스는 0(부대가 멈춘 보스전 — 종전 계산 그대로). 현상금 적은 부대와 함께 가며 다가오므로 scroll − vz(= 60).
//   탄은 세계 속도 vb(= 무기 vz × 발 속도 배수)로 날고 목표도 tw 로 달아나므로, 목표에 붙어 보면 탄이 **옆으로 k = vb ÷ (vb − tw) 배 더 벌어지고**
//   (부채꼴 발의 x 는 세계 거리로 벌어진다) 사거리(세계 거리) 안에 닿는 거리는 range ÷ k 로 줄어든다(산탄포 420 → 약 370)
function roadHitsFrom(offs, weaponId, mk, targets, sx, tw = 0) {
  const s = weaponStats(weaponId, mk);
  const angles = fanAngles(s.id);
  const speeds = fanSpeeds(s.id);
  const half = s.w / 2;
  const ks = angles.map((_, i) => (tw ? (s.vz * speeds[i]) / (s.vz * speeds[i] - tw) : 1));
  let hits = 0;
  for (const u of offs) {
    const ux = sx + u.dx, uz = -u.dy;
    for (let i = 0; i < angles.length; i++) {
      const k = ks[i];
      const t = Math.tan(angles[i]) * k;
      const zMax = s.range != null ? Math.min(uz + s.range / k, CULL_AHEAD) : CULL_AHEAD;
      for (const tg of targets) {
        if (lineCircleZ(ux, uz, t, tg.x, tg.z, tg.r + half, zMax) !== null) { hits++; break; }
      }
    }
  }
  return hits;
}

/** 무기·Mk 의 직격 초당 피해 = 맞는 발 수 × 발당 피해 ÷ 간격 */
export function dpsOf(weaponId, mk, hits) {
  const s = weaponStats(weaponId, mk);
  return hits * s.dmg / s.interval;
}

//  ── 판 정의에서 고를 수 있는 길 ──
const solidWalls = (stage) => (stage.walls || []).filter((w) => w.kind !== 'cover');
//  물체가 벽의 활성 구간(통로 확정선 z0 − wallLead ~ z1) 안인가 — supply.structurallyLost 와 같은 구간
const inWall = (w, z) => w.z0 - SQ.wallLead <= z && z <= w.z1;
//  통이 그 통로에서 열 수 있는가(supply.structurallyLost 의 벽 배제 반대)
const supplyOnSide = (s, w, side) => (side === 'L' ? !(s.x - s.r > w.x0) : !(s.x + s.r < w.x1));
//  게이트 행: 부대 중심이 설 수 있는 x 범위 [lo, hi](도로 전체 또는 통로) 안에서 고를 수 있는 값들. 칸이 다 덮지 못하면 0(칸 없음)도 고를 수 있다
function rowBest(row, lo, hi) {
  let best = -Infinity, covered = lo;
  const cells = row.cells.filter((c) => c.x1 > lo && c.x0 < hi).sort((a, b) => a.x0 - b.x0);
  for (const c of cells) {
    if (c.maxValue > best) best = c.maxValue;
    if (c.x0 <= covered) covered = Math.max(covered, c.x1);
  }
  if (covered < hi || !cells.length) best = Math.max(best, 0);
  return best;
}

/** 고를 수 있는 길의 조합 전부(분리벽 좌/우 × 배제 쌍 × 랜덤 길의 좋은 결과). 반환 [{ sides: { 벽 id: 'L'|'R' }, pairs: { pairId: 통 id }, lottery: 풀 항목 | null }] */
export function routeChoices(stage) {
  const walls = solidWalls(stage);
  const lot = stage.lottery ?? null;
  const pairIds = [...new Set((stage.supplies || []).filter((s) => s.pairId != null && !(lot && s.id === lot.supplyId)).map((s) => s.pairId))];
  const goods = BAL3.lottery.pool.filter((e) => e.good);
  const out = [];
  const nW = walls.length;
  for (let m = 0; m < (1 << nW); m++) {
    const sides = {};
    walls.forEach((w, i) => { sides[w.id] = (m >> i) & 1 ? 'R' : 'L'; });
    const lotOpts = lot && sides[lot.wallId] === 'R' ? goods : [null];
    //  배제 쌍: 쌍마다 한 통(또는 아무것도 — 통로가 막으면 그 통은 어차피 못 연다)
    const pairOpts = pairIds.map((pid) => [null, ...stage.supplies.filter((s) => s.pairId === pid).map((s) => s.id)]);
    const rec = (i, pairs) => {
      if (i === pairIds.length) { for (const lo of lotOpts) out.push({ sides, pairs: { ...pairs }, lottery: lo }); return; }
      for (const id of pairOpts[i]) rec(i + 1, { ...pairs, [pairIds[i]]: id });
    };
    rec(0, {});
  }
  return out;
}

/** 한 조합으로 zLimit(미만)까지 갔을 때의 상한 병력과 얻는 무기 통 수. 반환 { units, crates: { 무기 id: 통 수 } } */
export function routeLoadout(stage, route, zLimit) {
  const walls = solidWalls(stage);
  const lot = stage.lottery ?? null;
  const cap = SQ.unitCap;
  const ev = [];
  //  게이트 행(랜덤 길 행은 빼고 아래 풀 항목으로)
  for (const row of stage.gateRows || []) {
    if (lot && row.id === lot.rowId) continue;
    if (!(row.z < zLimit)) continue;
    let lo = ROAD.x0, hi = ROAD.x1;
    for (const w of walls) if (inWall(w, row.z)) { if (route.sides[w.id] === 'L') hi = Math.min(hi, w.x0); else lo = Math.max(lo, w.x1); }
    ev.push({ z: row.z, add: rowBest(row, lo, hi) });
  }
  const crates = {};
  const takeSupply = (s) => {
    if (s.kind === 'weapon') { if (s.z < zLimit) ev.push({ z: s.z, weapon: s.payload.weapon }); return; }
    if (s.kind === 'chain') {
      const pads = Math.min(s.payload.maxPads ?? 0, 1e6);
      for (let i = 0; i < pads; i++) { const pz = s.z + (s.padStart ?? 60) + i * (s.padGap ?? 40); if (pz < zLimit) ev.push({ z: pz, add: 1 }); }
      return;
    }
    if (s.z < zLimit) ev.push({ z: s.z, add: s.payload.n ?? 0 });
  };
  for (const s of stage.supplies || []) {
    if (lot && s.id === lot.supplyId) continue;
    if (s.pairId != null && route.pairs[s.pairId] !== s.id) continue;
    let ok = true;
    for (const w of walls) if (inWall(w, s.z) && !supplyOnSide(s, w, route.sides[w.id])) { ok = false; break; }
    if (ok) takeSupply(s);
  }
  //  랜덤 길 풀 항목(좋은 결과) — 통로 오른쪽 자리(lot.z, lot.x)의 통으로
  if (route.lottery) {
    const e = route.lottery;
    if (e.kind === 'soldier') takeSupply({ kind: 'soldier', z: lot.z, x: lot.x, r: BAL3.supply.r, payload: { n: e.n } });
    else if (e.kind === 'weapon') takeSupply({ kind: 'weapon', z: lot.z, x: lot.x, r: BAL3.supply.r, payload: { weapon: e.weapon } });
    else if (e.kind === 'chain') takeSupply({ kind: 'chain', z: lot.z, x: lot.x, r: BAL3.supply.r, payload: { pads0: e.pads0, maxPads: e.maxPads } });
  }
  ev.sort((a, b) => a.z - b.z);
  let units = stage.startUnits | 0;
  for (const e of ev) {
    if (e.weapon) { crates[e.weapon] = (crates[e.weapon] || 0) + 1; continue; }
    if (e.add > 0) units = Math.min(cap, units + e.add);
    else if (e.add < 0) units = Math.max(1, units + e.add);
  }
  return { units, crates };
}

/** 무기 후보: 판 시작 무기(Mk I, 같은 무기 통이 있으면 그만큼 +) + 얻은 무기 통마다(통 수 = Mk, 최대 III).
 *  교체 규칙(supply.applySupplyReward): 다른 무기 통은 **지금 무기보다 순위(rank)가 높을 때만** 교체된다(같은 순위·낮은 순위 = 교체 없음).
 *   → 시작 무기보다 순위가 높지 않은 무기는 얻을 수 없다(후보에서 뺀다). 통은 안 쏘고 지나칠 수 있으므로 다른 무기 통을 건너뛰고
 *   한 무기의 통만 모으는 길이 있다 — 통 수 = Mk 는 그 길의 값이다. 1~24 는 모두 소총(순위 1)으로 시작해 이 거름으로 결과가 바뀌지 않는다 */
export function weaponOptions(startWeapon, crates) {
  const out = [];
  const sw = WEAPONS[startWeapon] ? startWeapon : 'rifle';
  out.push({ weapon: sw, mk: Math.min(MK_MAX, 1 + (crates[sw] || 0)) });
  for (const [w, c] of Object.entries(crates)) {
    if (w === sw || !WEAPONS[w] || !(WEAPONS[w].rank > WEAPONS[sw].rank)) continue;
    out.push({ weapon: w, mk: Math.min(MK_MAX, c) });
  }
  return out;
}

//  보스 목표(부대 중심 기준). 도로: 역할 표의 정지 거리·보스 x(정의 x 가 없으면 부대와 같은 x = null) · 광장: null(자동 조준)
function bossTargets(stage) {
  if (stage.arena) return null;
  const E = BAL3.enemies.elite;
  return (stage.elites || []).map((e) => ({ x: e.x ?? null, z: BAL3.elites.roles[e.role ?? 'elite'].holdAhead, r: E.r }));
}

/** 한 부대(n 명·무기·Mk)가 이 판 보스에 닿는 상한 초당 피해. 반환 { dps, hits, sx } */
export function bossDpsFor(stage, n, weaponId, mk) {
  const s = weaponStats(weaponId, mk);
  const tg = bossTargets(stage);
  if (!tg) { const hits = n * s.fan; return { dps: dpsOf(weaponId, mk, hits), hits, sx: null }; }
  if (tg.every((t) => t.x === null)) {
    //  보스 1체(차선 없음 = 도로 전체를 왕복): 보스 x 가 차선 [x0 + r, x1 − r] 를 고르게 오가는 동안 부대가 그 바로 아래(설 수 있는 범위로 자름)를
    //   **완벽하게 따라간다**고 보고 맞는 발 수를 평균한다(4px 간격). 보스가 도로 끝에 가면 부대가 가장자리에 눌려 대형이 좁아져 더 많이 맞는다 — 그 몫까지 들어간다
    const [lo, hi] = squadCenterRange(n);
    const r = tg[0].r, b0 = ROAD.x0 + r, b1 = ROAD.x1 - r;
    let sum = 0, cnt = 0;
    for (let bx = b0; bx <= b1 + 1e-9; bx += PATROL_STEP) {
      const sx = Math.max(lo, Math.min(hi, bx));
      sum += roadHits(n, weaponId, mk, tg.map((t) => ({ ...t, x: bx })), sx);
      cnt++;
    }
    const hits = sum / cnt;
    return { dps: dpsOf(weaponId, mk, hits), hits, sx: null };
  }
  //  보스 여럿: 보스는 제 차선 가운데(정의 x), 부대 중심 x 를 2px 간격으로 훑어 가장 많이 맞는 자리
  const [lo, hi] = squadCenterRange(n);
  const fixed = tg.map((t) => ({ ...t, x: t.x ?? ROAD.center }));
  let best = { hits: -1, sx: lo };
  for (let sx = lo; sx <= hi + 1e-9; sx += 2) {
    const h = roadHits(n, weaponId, mk, fixed, sx);
    if (h > best.hits) best = { hits: h, sx };
  }
  return { dps: dpsOf(weaponId, mk, best.hits), hits: best.hits, sx: best.sx };
}

/** 상한 부대(보스 앞 z 까지의 모든 조합 중 보스 초당 피해가 가장 큰 것). 반환 { units, weapon, mk, dps, hits, route }
 *  같은 (병력, 무기, Mk) 는 조합이 달라도 한 번만 잰다(결과는 같다) */
export function bossUpperBound(stage) {
  const zLimit = stage.eliteZ ?? stage.length ?? Infinity;
  const memo = new Map();
  let best = null;
  for (const route of routeChoices(stage)) {
    const lo = routeLoadout(stage, route, zLimit);
    for (const w of weaponOptions(stage.startWeapon, lo.crates)) {
      const key = lo.units + ':' + w.weapon + ':' + w.mk;
      let r = memo.get(key);
      if (!r) { r = bossDpsFor(stage, lo.units, w.weapon, w.mk); memo.set(key, r); }
      if (!best || r.dps > best.dps + 1e-9) best = { units: lo.units, weapon: w.weapon, mk: w.mk, dps: r.dps, hits: r.hits, route };
    }
  }
  return best;
}

//  계산 결과 캐시: 판 정의 중 계산에 쓰는 칸만 모은 지문(문자열) → 결과. 같은 지문이면 결과가 같다(순수 함수) —
//   buildStage 가 게임 줄을 부를 때마다 조합을 다시 훑지 않게. 지문에 정의 내용이 다 들어가므로 정의가 바뀌면(검사가 정의를 고쳐도) 새로 잰다
const FLOOR_CACHE = new Map();
function floorKey(stage, sec) {
  return JSON.stringify([sec, stage.startUnits, stage.startWeapon, stage.eliteZ, stage.length,
    (stage.gateRows || []).map((r) => [r.id, r.z, r.cells.map((c) => [c.x0, c.x1, c.maxValue])]),
    (stage.supplies || []).map((s) => [s.id, s.z, s.x, s.r, s.kind, s.payload, s.pairId, s.padStart, s.padGap]),
    (stage.walls || []).map((w) => [w.id, w.kind, w.z0, w.z1, w.x0, w.x1]),
    stage.lottery ? [stage.lottery.z, stage.lottery.x, stage.lottery.wallId, stage.lottery.supplyId, stage.lottery.rowId] : null,
    (stage.elites || []).map((e) => [e.hp, e.x, e.role]), !!stage.arena]);
}

/** 보스 체력 바닥(r4.7): 보스 체력 합 ÷ 상한 화력 ≥ sec 초. 모자라면 체력 비율을 지키며 늘린다(각 체력은 올림 — 옛 체력 아래로 내려가지 않는다).
 *  광장 보스의 보호막 시간은 이 초에 들어가지 않는다(보호막 동안은 피해가 0 이라 체력 = 보호막 뒤 피해 시간 × 화력).
 *  반환 { sec, units, weapon, mk, dps, base: [옛 체력], hp: [새 체력], minSec: 새 체력 합 ÷ 상한 화력 } */
export function bossFloor(stage, sec = BAL3.bossMinFightSec) {
  const key = floorKey(stage, sec);
  const hit = FLOOR_CACHE.get(key);
  if (hit) return { ...hit, base: [...hit.base], hp: [...hit.hp] };
  const res = bossFloorCalc(stage, sec);
  if (FLOOR_CACHE.size > 500) FLOOR_CACHE.clear();
  FLOOR_CACHE.set(key, res);
  return { ...res, base: [...res.base], hp: [...res.hp] };
}
function bossFloorCalc(stage, sec) {
  const base = (stage.elites || []).map((e) => e.hp);
  const ub = bossUpperBound(stage);
  const sum = base.reduce((a, b) => a + b, 0);
  const need = sec * ub.dps;
  const k = sum > 0 && sum < need ? need / sum : 1;
  const hp = base.map((h) => (k === 1 ? h : Math.ceil(h * k)));
  const total = hp.reduce((a, b) => a + b, 0);
  return { sec, units: ub.units, weapon: ub.weapon, mk: ub.mk, dps: ub.dps, hits: ub.hits, base, hp, minSec: ub.dps > 0 ? total / ub.dps : Infinity };
}

//  ── 현상금 적(r4.7 (c) — 이사님 지시 2026-09-26 "체력이 특수한 높은 일반 적 … 내가 가진 최대의 무기로 끝까지 쏴야 깰 수 있는 긴장감") ──
//  체력 = 사거리에 들어와서 부대에 닿기까지 **그 자리(트리거 z)까지의 상한 부대**가 줄 수 있는 직격 피해 합 × BAL3.bounty.hpFactor(0.45 — r4.7 보정, 처음 0.9).
//   상한 부대 = 위 보스 계산과 같은 규칙(병력·무기·Mk — 분리벽 한쪽·병력 100·강화 0·손실 0)을 **트리거 z 까지로 잘라** 쓴다.
//   현상금 적은 부대 x 를 따라오므로 부대 바로 앞에 있다고 보고, 거리마다 **실제로 닿는** 발 수(roadHits — 산탄포 사거리는 유닛 자리 기준)로 잰다.
//   폭발·연쇄는 한 대상 기준이라 넣지 않고, 전격 기절은 현상금 적에 걸리지 않는다(combat.stun). 다른 적이 탄을 받아 내는 몫은 빼지 않는다(상한 — 계수가 여유)
const BT = BAL3.bounty;
const ENTER_Z = BAL3.enterZ;
//  거리 적분 간격(px) · 부대 중심 x 훑기 간격(px)
const D_STEP = 10, SX_STEP = 8;

/** 현상금 적이 부대에 닿는 거리(부대 중심 기준 전방 거리): 적 원(tx, d, r)과 유닛 원(unitR)이 처음 겹치는 d — 가장 앞에서 닿는 유닛 기준(combat 의 overlappingUnits 와 같은 원 겹침) */
export function bountyContactDist(offs, sx, tx, r = BT.r) {
  const R = r + SQ.unitR;
  let best = -Infinity;
  for (const u of offs) {
    const ax = sx + u.dx - tx;
    if (Math.abs(ax) > R) continue;
    const d = -u.dy + Math.sqrt(R * R - ax * ax);
    if (d > best) best = d;
  }
  return best === -Infinity ? 0 : best;
}

/** 사선 창: 트리거 z 에서 나온 현상금 적과 부대 사이(부대 ~ 적)에 물체가 끼어들 수 있는 트랙 z 구간 [a, b] — 배치 규칙(보급 통·게이트·벽이 이 안에 없어야 한다).
 *  적은 트리거 순간 부대 앞 ENTER(760)에서 나와 화면 기준 vz 로 다가오고 탄은 부대 앞 CULL_AHEAD(650)까지 닿는다 →
 *   사거리에 드는 때 t1 = (ENTER − (CULL_AHEAD + r)) ÷ vz · 가장 늦게 닿는 때 T = (ENTER − (r + unitR)) ÷ vz(부대가 가장 작을 때).
 *   그동안 부대는 scroll 로 전진하므로 사선이 지나는 트랙 = [z + scroll·t1, z + scroll·T + r + unitR]. tIn = 사거리 안 최대 시간(초) */
export function bountyWindow(z, B = BT) {
  const dMin = B.r + SQ.unitR;
  const t1 = (ENTER_Z - (CULL_AHEAD + B.r)) / B.vz, T = (ENTER_Z - dMin) / B.vz;
  return { a: z + BAL3.scroll * t1, b: z + BAL3.scroll * T + dMin, tIn: T - t1 };
}

/** 한 부대(n 명·무기·Mk)가 현상금 적 1체에 사거리 진입부터 닿기까지 줄 수 있는 직격 피해 합.
 *  적 x = 부대 중심 x(도로 안으로 자름 — 적이 부대를 따라온다). 부대 중심 sx 는 설 수 있는 범위를 8px 간격으로 **고르게** 훑어 평균한다
 *   (보스 1체 계산과 같은 방식 — 부대가 도로 어디에 서 있든의 평균. 도로 끝에서 대형이 눌려 더 맞는 몫은 그 자리 비율만큼만 들어간다).
 *  자리마다: 거리 d 를 사거리 끝(CULL_AHEAD + r)에서 닿는 거리까지 10px 씩 줄이며 [그 거리에서 한 번 쏠 때 맞는 발 수(roadHits — 산탄포 사거리는 유닛 자리 기준,
 *   적이 부대와 함께 달아나는 몫(세계 속도 scroll − vz)으로 부채꼴이 더 벌어지고 사거리 안 거리가 줄어드는 것까지)
 *   × 발당 피해 ÷ 간격 × 10px 을 지나는 시간(÷ vz)] 을 더한다. 탄이 다가오는 적을 마주 날아가 실제로는 조금 더 자주 맞는 몫(접근 속도 ÷ 탄속, 약 +15%)은 넣지 않는다.
 *  반환 { dmg(평균), sec(사거리 안 시간 — 평균), max(가장 많이 주는 자리의 피해 합), maxSx } */
export function bountyDamageFor(n, weaponId, mk, B = BT) {
  const s = weaponStats(weaponId, mk);
  const per = s.dmg / s.interval;
  const [lo, hi] = squadCenterRange(n);
  const dEnter = CULL_AHEAD + B.r;
  //  현상금 적의 세계 속도(부대와 함께 가며 vz 만큼 다가온다)
  const tw = BAL3.scroll - B.vz;
  let sum = 0, secSum = 0, cnt = 0, max = -1, maxSx = lo;
  for (let sx = lo; sx <= hi + 1e-9; sx += SX_STEP) {
    const offs = squadOffsets(n, sx);
    const tx = Math.max(ROAD.x0 + B.r, Math.min(ROAD.x1 - B.r, sx));
    const dc = bountyContactDist(offs, sx, tx, B.r);
    let dmg = 0;
    for (let d = dEnter; d > dc + 1e-9; d -= D_STEP) {
      const dd = Math.min(D_STEP, d - dc);
      dmg += roadHitsFrom(offs, weaponId, mk, [{ x: tx, z: d - dd / 2, r: B.r }], sx, tw) * per * (dd / B.vz);
    }
    sum += dmg; secSum += (dEnter - dc) / B.vz; cnt++;
    if (dmg > max + 1e-9) { max = dmg; maxSx = sx; }
  }
  return { dmg: sum / cnt, sec: secSum / cnt, max, maxSx };
}

/** 현상금 적 1체의 체력(r4.7): 트리거 z 까지의 모든 길 조합 × 무기 후보 중 피해 합이 가장 큰 부대 → round(피해 합 × hpFactor)(최소 1).
 *  반환 { z, hp, units, weapon, mk, dmg(상한 피해 합), sec(사거리 안 시간), dps(= dmg ÷ sec) } */
export function bountyFloor(stage, z, B = BT) {
  const key = floorKey(stage, 'bounty:' + z + ':' + JSON.stringify(B));
  const hit = FLOOR_CACHE.get(key);
  if (hit) return { ...hit };
  const memo = new Map();
  let best = null;
  for (const route of routeChoices(stage)) {
    const lo = routeLoadout(stage, route, z);
    for (const w of weaponOptions(stage.startWeapon, lo.crates)) {
      const k = lo.units + ':' + w.weapon + ':' + w.mk;
      let r = memo.get(k);
      if (!r) { r = bountyDamageFor(lo.units, w.weapon, w.mk, B); memo.set(k, r); }
      if (!best || r.dmg > best.dmg + 1e-9) best = { units: lo.units, weapon: w.weapon, mk: w.mk, dmg: r.dmg, sec: r.sec };
    }
  }
  const res = { z, hp: Math.max(1, Math.round(best.dmg * B.hpFactor)), units: best.units, weapon: best.weapon, mk: best.mk,
                dmg: best.dmg, sec: best.sec, dps: best.sec > 0 ? best.dmg / best.sec : 0 };
  if (FLOOR_CACHE.size > 500) FLOOR_CACHE.clear();
  FLOOR_CACHE.set(key, res);
  return { ...res };
}
