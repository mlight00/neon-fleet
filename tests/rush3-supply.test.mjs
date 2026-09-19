// rush3-supply — 보급 통·연속 증원 규칙(계약서 3-3 · 8장 V3-SUPPLY / V3-CHAIN)을 잠근다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSupply, hitSupply, passSupply, takePads, sweepHitsSupply, activateChain, applySupplyReward, supplyActive } from '../rush3/supply.js';
import { makeUnit, layoutUnits, formation } from '../rush3/squad.js';
import { createRun, stepRun, drainEvents } from '../rush3/combat.js';
import { buildStage, STAGE_IDS, coverZFor, VZ_MIN, MAX_DY, lotteryPick } from '../rush3/stages.js';
import { WEAPONS } from '../rush3/weapons.js';
import { BAL3 } from '../rush3/balance.js';
import { POLICIES, playPolicy } from './lib/rush3-policies.mjs';

// 테스트용 run: 실제 squad.js 유닛(makeUnit + layoutUnits). 콜백 주입 없음 — supply.js 가 squad.addUnits 를 직접 호출한다.
function makeRun(n, x = 240) {
  const run = { z: 0, prevZ: 0, x, units: [], nextUnitId: 1, weapon: 'auto', pendingRewards: [], missedSupplies: 0, badGatesPassed: 0, lossByGate: 0 };
  for (let i = 0; i < n; i++) run.units.push(makeUnit(run.nextUnitId++));
  layoutUnits(run.units);
  return run;
}
const bullet = (x, z = 0, pz = 0, dmg = 1) => ({ x, z, pz, dmg, gateHit: 1, dead: false });
const RANK = { rifle: 1, auto: 2, heavy: 3 };
const rank = (id) => RANK[id] ?? 0;
const cross = (run, z) => { run.prevZ = z - 1; run.z = z; };
const soldierCrate = (dur = 10, n = 2) => makeSupply({ id: 'c1', z: 2100, x: 240, kind: 'soldier', durability: dur, payload: { n } });
const chainCrate = () => makeSupply({ id: 'ch', z: 2800, x: 240, kind: 'chain', durability: 10, payload: { pads0: 5, maxPads: 15 } });
// 열릴 때까지 dmg 1 탄을 쏜다
const openWith = (s, run, ev) => { let k = 0; while (!s.opened && k < 100) { hitSupply(s, bullet(s.x), ev, run); k++; } return k; };

test('V3-SUPPLY: 내구 10·병사 2 통에 dmg 1 탄 10발 → 보상 정확히 1회·정확히 2명 합류', () => {
  const s = soldierCrate(10, 2), run = makeRun(1), ev = [];
  for (let i = 0; i < 9; i++) {
    const b = bullet(240);
    assert.equal(hitSupply(s, b, ev, run), true);
    assert.equal(b.dead, true, '통은 탄을 흡수한다');
    assert.equal(s.opened, false);
  }
  assert.equal(s.durability, 1);
  assert.equal(ev.filter((e) => e.type === 'supplyHit').length, 9);
  assert.equal(ev[8].durability, 1);
  assert.equal(run.pendingRewards.length, 0, '열리기 전엔 보상 없음');
  hitSupply(s, bullet(240), ev, run);
  assert.equal(s.opened, true);
  assert.equal(s.durability, 0);
  assert.equal(run.pendingRewards.length, 1);
  assert.deepEqual(run.pendingRewards[0], { kind: 'soldier', payload: { n: 2 }, x: 240, z: 2100, id: 'c1' });
  assert.equal(ev.filter((e) => e.type === 'supplyOpen').length, 1);
  assert.equal(ev.at(-1).reward, undefined, 'supplyOpen 이벤트는 보상을 싣지 않는다(경로는 pendingRewards 하나)');
  for (const r of run.pendingRewards) applySupplyReward(r, run, ev);
  assert.equal(run.units.length, 3, '1 + 2 = 정확히 3명');
  assert.deepEqual(run.units.map((u) => u.id), [1, 2, 3]);
  assert.equal(run.nextUnitId, 4);
  assert.deepEqual(run.units.map((u) => [u.dx, u.dy]), formation(3).map((p) => [p.dx, p.dy]), '합류 후 layoutUnits');
  assert.equal(ev.at(-1).type, 'joinMany');
  assert.equal(ev.at(-1).n, 2);
});

test('V3-SUPPLY: squad.js 실제 run({ units:[makeUnit(1)], nextUnitId:2 })으로 병사 통 +2 결합 검사', () => {
  const run = { z: 0, prevZ: 0, x: 240, units: [makeUnit(1)], nextUnitId: 2, weapon: 'rifle', pendingRewards: [], missedSupplies: 0, badGatesPassed: 0, lossByGate: 0 };
  const s = soldierCrate(1, 2), ev = [];
  hitSupply(s, bullet(240), ev, run);
  applySupplyReward(run.pendingRewards[0], run, ev);
  assert.equal(run.units.length, 3);
  assert.equal(run.units[2].id, 3);
  assert.equal(run.units[2].hp, 2);
});

test('V3-SUPPLY: 병사 보상은 unitCap 150 에서 클램프(joinMany.n = 실제 추가 수)', () => {
  const run = makeRun(149), s = soldierCrate(1, 5), ev = [];
  hitSupply(s, bullet(240), ev, run);
  applySupplyReward(run.pendingRewards[0], run, ev);
  assert.equal(run.units.length, 150);
  assert.equal(ev.at(-1).n, 1);
});

test('V3-SUPPLY: 11발째는 무효(열린 통은 후보 제외, 흡수도 보상도 없음)', () => {
  const s = soldierCrate(10, 2), run = makeRun(1), ev = [];
  openWith(s, run, ev);
  const b = bullet(240, 2110, 2090);
  assert.equal(sweepHitsSupply(s, b), false);
  assert.equal(hitSupply(s, b, ev, run), false);
  assert.equal(b.dead, false);
  assert.equal(run.pendingRewards.length, 1);
  assert.equal(supplyActive(s), false);
});

test('V3-SUPPLY: 내구 4 통에 한 STEP 10발 → 4발 소모, 6발은 뒤 물체로(스윕 후보에서 빠짐)', () => {
  const s = soldierCrate(4, 2), run = makeRun(1), ev = [];
  const bullets = Array.from({ length: 10 }, () => bullet(240, 2120, 2080));
  let consumed = 0, passed = 0;
  for (const b of bullets) {
    if (sweepHitsSupply(s, b)) { hitSupply(s, b, ev, run); consumed++; } else passed++;
  }
  assert.equal(consumed, 4);
  assert.equal(passed, 6);
  assert.equal(bullets.filter((b) => b.dead).length, 4);
  assert.equal(run.pendingRewards.length, 1);
});

test('V3-SUPPLY: dmg 3(heavy) 탄은 내구를 3 깎고, 초과분은 버린다(0 클램프)', () => {
  const s = soldierCrate(4, 2), run = makeRun(1), ev = [];
  hitSupply(s, bullet(240, 0, 0, 3), ev, run);
  assert.equal(s.durability, 1);
  hitSupply(s, bullet(240, 0, 0, 3), ev, run);
  assert.equal(s.durability, 0);
  assert.equal(s.opened, true);
});

test('V3-SUPPLY: 통과 시 미개봉이면 missed(피해 없음·missedSupplies+1), missed 뒤 탄 20발 → 불변', () => {
  const s = soldierCrate(10, 2), run = makeRun(3), ev = [];
  hitSupply(s, bullet(240), ev, run);
  cross(run, 2100);
  assert.equal(passSupply(s, run, ev), true);
  assert.equal(s.missed, true);
  assert.equal(run.missedSupplies, 1);
  assert.equal(run.units.length, 3);
  assert.equal(ev.at(-1).type, 'supplyMissed');
  const snap = JSON.stringify(s);
  for (let i = 0; i < 20; i++) {
    const b = bullet(240, 2110, 2090);
    assert.equal(sweepHitsSupply(s, b), false);
    assert.equal(hitSupply(s, b, ev, run), false);
    assert.equal(b.dead, false);
  }
  assert.equal(JSON.stringify(s), snap);
  assert.equal(run.pendingRewards.length, 0);
  assert.equal(passSupply(s, run, ev), false, '두 번 missed 되지 않는다');
  assert.equal(run.missedSupplies, 1);
});

test('V3-SUPPLY: 열린 통은 통과해도 missed 가 아니다', () => {
  const s = soldierCrate(2, 2), run = makeRun(1), ev = [];
  openWith(s, run, ev);
  cross(run, 2100);
  assert.equal(passSupply(s, run, ev), false);
  assert.equal(s.missed, false);
  assert.equal(run.missedSupplies, 0);
});

test('V3-SUPPLY: weapon 통 보상은 pendingRewards 에 무기 id 로 쌓이고, 같은 무기는 Mk 강화(r3.10)·하급은 무시(weaponSame)', () => {
  const run = makeRun(1), ev = [];
  const same = makeSupply({ id: 'w1', z: 4000, x: 240, kind: 'weapon', durability: 1, payload: { weapon: 'auto' } });
  const lower = makeSupply({ id: 'w2', z: 4100, x: 240, kind: 'weapon', durability: 1, payload: { weapon: 'rifle' } });
  const higher = makeSupply({ id: 'w3', z: 4200, x: 240, kind: 'weapon', durability: 1, payload: { weapon: 'heavy' } });
  for (const s of [same, lower, higher]) hitSupply(s, bullet(240), ev, run);
  assert.deepEqual(run.pendingRewards.map((r) => [r.kind, r.payload.weapon]), [['weapon', 'auto'], ['weapon', 'rifle'], ['weapon', 'heavy']]);
  assert.equal(run.weapon, 'auto', 'hitSupply 는 무기를 바꾸지 않는다');
  assert.equal(applySupplyReward(run.pendingRewards[0], run, ev, { weaponRank: rank }), true, '같은 무기 = Mk 강화');
  assert.equal(run.weapon, 'auto'); assert.equal(run.weaponMk, 2); assert.equal(ev.at(-1).type, 'weaponMk');
  assert.equal(applySupplyReward(run.pendingRewards[1], run, ev, { weaponRank: rank }), false);
  assert.equal(run.weapon, 'auto', '하급 무시');
  assert.equal(ev.filter((e) => e.type === 'weaponSame').length, 1);
  assert.equal(applySupplyReward(run.pendingRewards[2], run, ev, { weaponRank: rank }), true);
  assert.equal(run.weapon, 'heavy');
  assert.equal(ev.at(-1).type, 'weaponSwap');
});

test('V3-SUPPLY: run(pendingRewards) 없이 hitSupply 를 부르면 throw(보상 경로는 하나뿐)', () => {
  const s = soldierCrate(1, 4), ev = [];
  assert.throws(() => hitSupply(s, bullet(240), ev), TypeError);
  assert.throws(() => hitSupply(s, bullet(240), ev, { z: 0 }), TypeError);
  assert.equal(s.opened, false, 'throw 전에 상태를 바꾸지 않는다');
  assert.equal(ev.length, 0);
});

test('V3-SUPPLY: 스윕 판정 = 수직 선분 vs 원(r 30), x 가 r 밖이면 불명중', () => {
  const s = soldierCrate();
  assert.equal(sweepHitsSupply(s, bullet(240, 2075, 2060)), true, '아래 가장자리 접촉');
  assert.equal(sweepHitsSupply(s, bullet(240, 2069, 2050)), false, '아래 가장자리 직전');
  assert.equal(sweepHitsSupply(s, bullet(271, 2100, 2090)), false, 'x 가 r 밖');
  assert.equal(sweepHitsSupply(s, bullet(270, 2100, 2090)), true);
  assert.equal(sweepHitsSupply(s, bullet(264, 2080, 2070)), false, '원 모서리 밖(dx 24 → 반현 18, 사각형이면 맞을 위치)');
  assert.equal(sweepHitsSupply(s, bullet(264, 2083, 2070)), true, '반현 안쪽은 명중');
  assert.equal(sweepHitsSupply(s, bullet(240, 2300, 2000)), true, '한 STEP 에 통째로 건너뛰어도 스윕이 잡는다');
});

test('V3-SUPPLY: makeSupply 는 def 를 복사하고 초기 상태를 보장한다', () => {
  const def = { id: 'c', z: 1, x: 2, kind: 'soldier', durability: 6, payload: { n: 2 } };
  const a = makeSupply(def), b = makeSupply(def);
  assert.deepEqual(a, b);
  assert.notEqual(a.payload, b.payload);
  assert.notEqual(a.payload, def.payload);
  assert.equal(a.r, 30);
  assert.equal(a.maxDurability, 6);
  assert.deepEqual([a.opened, a.missed, a.locked, a.pads], [false, false, false, []]);
});

// ---- chain(연속 증원 컨테이너) ----

test('V3-CHAIN: 개봉 → 보상 1회, 활성화 → 발판 5개(z = s.z + 60 + i*40, 같은 차선)', () => {
  const s = chainCrate(), run = makeRun(1), ev = [];
  assert.equal(openWith(s, run, ev), 10);
  assert.equal(run.pendingRewards.length, 1);
  assert.deepEqual(run.pendingRewards[0].payload, { pads0: 5, maxPads: 15 });
  assert.equal(s.pads.length, 0, '활성화(9단계) 전엔 발판 없음');
  assert.equal(applySupplyReward(run.pendingRewards[0], run, ev, { supplies: [s] }), true);
  assert.equal(s.pads.length, 5);
  assert.deepEqual(s.pads.map((p) => p.z), [2860, 2900, 2940, 2980, 3020]);
  assert.ok(s.pads.every((p) => p.x === 240 && p.taken === false));
  assert.equal(ev.at(-1).type, 'chainOn');
  assert.equal(activateChain(s, ev), false, '두 번 활성화되지 않는다');
  assert.equal(s.pads.length, 5);
});

test('V3-CHAIN: 한 STEP 에 12발(개봉 10 + 후속 2) → STEP 9 활성화 뒤 발판 7·chainOn 1·padAdd 2', () => {
  const s = chainCrate(), run = makeRun(1), ev = [];
  const bullets = Array.from({ length: 12 }, () => bullet(240, 2820, 2780));
  let consumed = 0;
  for (const b of bullets) if (sweepHitsSupply(s, b)) { hitSupply(s, b, ev, run); consumed++; }
  assert.equal(consumed, 12, '열린 chain 은 계속 후보라 같은 STEP 탄이 전부 들어온다');
  assert.equal(s.opened, true);
  assert.equal(s.activated, false);
  assert.equal(s.pads.length, 0, '활성화 전엔 발판을 만들지 않는다');
  assert.equal(s.queuedPads, 2);
  assert.equal(ev.filter((e) => e.type === 'padAdd').length, 0);
  assert.equal(run.pendingRewards.length, 1);
  assert.equal(applySupplyReward(run.pendingRewards[0], run, ev, { supplies: [s] }), true);
  assert.equal(s.pads.length, 7);
  assert.deepEqual(s.pads.map((p) => p.z), [2860, 2900, 2940, 2980, 3020, 3060, 3100]);
  assert.equal(ev.filter((e) => e.type === 'chainOn').length, 1);
  assert.equal(ev.filter((e) => e.type === 'padAdd').length, 2);
  assert.equal(s.queuedPads, 0);
  assert.equal(activateChain(s, ev), false, '두 번 활성화되지 않는다');
});

test('V3-CHAIN: 한 STEP 에 30발 → 활성화 뒤 15 클램프·chainOn 1·padAdd 10, 탄은 전부 흡수', () => {
  const s = chainCrate(), run = makeRun(1), ev = [];
  const bullets = Array.from({ length: 30 }, () => bullet(240, 2820, 2780));
  for (const b of bullets) if (sweepHitsSupply(s, b)) hitSupply(s, b, ev, run);
  assert.equal(bullets.filter((b) => b.dead).length, 30);
  applySupplyReward(run.pendingRewards[0], run, ev, { supplies: [s] });
  assert.equal(s.pads.length, 15);
  assert.equal(ev.filter((e) => e.type === 'chainOn').length, 1);
  assert.equal(ev.filter((e) => e.type === 'padAdd').length, 10);
  hitSupply(s, bullet(240), ev, run);
  assert.equal(s.pads.length, 15, '활성화 뒤에도 15 위로 늘지 않는다');
});

test('V3-CHAIN: 활성 뒤 유효탄 3발(무기 무관) → 발판 8, 이벤트 padAdd', () => {
  const s = chainCrate(), run = makeRun(1), ev = [];
  openWith(s, run, ev);
  activateChain(s, ev);
  assert.equal(supplyActive(s), true, '열린 chain 은 계속 후보');
  assert.equal(sweepHitsSupply(s, bullet(240, 2810, 2790)), true);
  for (const dmg of [1, 3, 1]) {
    const b = bullet(240, 0, 0, dmg);
    assert.equal(hitSupply(s, b, ev, run), true);
    assert.equal(b.dead, true);
  }
  assert.equal(s.pads.length, 8);
  assert.equal(s.pads[7].z, 2800 + 60 + 7 * 40);
  assert.equal(ev.filter((e) => e.type === 'padAdd').length, 3);
  assert.equal(run.pendingRewards.length, 1, '보상은 여전히 1회');
});

test('V3-CHAIN: maxPads 클램프(15 위로 늘지 않음, 탄은 흡수)', () => {
  const s = chainCrate(), run = makeRun(1), ev = [];
  openWith(s, run, ev);
  activateChain(s, ev);
  for (let i = 0; i < 20; i++) {
    const b = bullet(240);
    hitSupply(s, b, ev, run);
    assert.equal(b.dead, true);
  }
  assert.equal(s.pads.length, 15);
  assert.equal(ev.filter((e) => e.type === 'padAdd').length, 10);
});

test('V3-CHAIN: 통과 시 발판당 1회 유닛 +1(|x 차| <= 70), 같은 발판 재판정 없음', () => {
  const s = chainCrate(), run = makeRun(1), ev = [];
  openWith(s, run, ev);
  activateChain(s, ev);
  const STEP = 1 / 60, SCROLL = 190;
  run.z = 2800; run.prevZ = 2800;
  let takes = 0;
  for (let i = 0; i < 120; i++) {
    run.prevZ = run.z; run.z += SCROLL * STEP;
    if (takePads(s, run, ev)) takes++;
  }
  assert.ok(run.z > 3020);
  assert.equal(run.units.length, 6, '1 + 발판 5');
  assert.deepEqual(run.units.map((u) => u.id), [1, 2, 3, 4, 5, 6], 'squad.addUnits 로 실제 유닛이 생긴다');
  assert.deepEqual(run.units.map((u) => [u.dx, u.dy]), formation(6).map((p) => [p.dx, p.dy]), '가져갈 때마다 layoutUnits');
  assert.equal(takes, 5, 'STEP 마다 최대 1개(간격 40 > 3.2)');
  assert.equal(ev.filter((e) => e.type === 'padTake').length, 5);
  assert.ok(ev.filter((e) => e.type === 'padTake').every((e) => e.applied === 1));
  assert.ok(s.pads.every((p) => p.taken));
  run.prevZ = 2850; run.z = 3030;
  assert.equal(takePads(s, run, ev), false, '이미 가져간 발판은 다시 안 준다');
  assert.equal(run.units.length, 6);
});

test('V3-CHAIN: unitCap 150 에서는 발판이 소모되되 applied 0 으로 알린다', () => {
  const s = chainCrate(), run = makeRun(150), ev = [];
  openWith(s, run, ev);
  activateChain(s, ev);
  run.prevZ = 2850; run.z = 2870;
  assert.equal(takePads(s, run, ev), true);
  assert.equal(run.units.length, 150);
  assert.equal(s.pads[0].taken, true);
  assert.equal(ev.at(-1).type, 'padTake');
  assert.equal(ev.at(-1).applied, 0);
});

test('V3-CHAIN: 다른 차선(|x 차| > 70)의 발판은 가져가지 못한다', () => {
  const s = chainCrate(), run = makeRun(1, 311), ev = [];
  openWith(s, run, ev);
  activateChain(s, ev);
  run.prevZ = 2850; run.z = 3030;
  assert.equal(takePads(s, run, ev), false);
  assert.equal(run.units.length, 1);
  run.x = 310;
  assert.equal(takePads(s, run, ev), true, '경계 70 은 포함');
  assert.equal(run.units.length, 6);
});

test('V3-CHAIN: 통을 지나면 locked → 이후 히트 무효(발판 불변·흡수 없음), 이미 있는 발판은 계속 유효', () => {
  const s = chainCrate(), run = makeRun(1), ev = [];
  openWith(s, run, ev);
  activateChain(s, ev);
  cross(run, 2800);
  assert.equal(passSupply(s, run, ev), true);
  assert.equal(s.locked, true);
  assert.equal(s.missed, false, '열린 chain 은 missed 가 아니다');
  assert.equal(run.missedSupplies, 0);
  const b = bullet(240, 2810, 2790);
  assert.equal(sweepHitsSupply(s, b), false);
  assert.equal(hitSupply(s, b, ev, run), false);
  assert.equal(b.dead, false);
  assert.equal(s.pads.length, 5);
  run.prevZ = 2850; run.z = 2870;
  assert.equal(takePads(s, run, ev), true);
  assert.equal(run.units.length, 2);
});

test('V3-CHAIN: 미개봉 chain 을 지나면 missed + locked, 보상 없음', () => {
  const s = chainCrate(), run = makeRun(1), ev = [];
  hitSupply(s, bullet(240), ev, run);
  cross(run, 2800);
  passSupply(s, run, ev);
  assert.deepEqual([s.missed, s.locked, s.opened], [true, true, false]);
  assert.equal(run.missedSupplies, 1);
  assert.equal(run.pendingRewards.length, 0);
  assert.equal(hitSupply(s, bullet(240), ev, run), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-SUPPLY-PAIR / COVER — 배제 쌍(pairId)·차폐(coverZ)·구조적 획득 불가(skipped). 계약서 3-3·3-6 · 개정 r3 §3-3·§4-2·§6-1
//  배제를 만드는 것은 '같은 z' 가 아니라 **벽 + 비행시간 보정선 coverZ** 다. 셋 중 하나만 있으면 배제가 아니다.
// ─────────────────────────────────────────────────────────────────────────────

//  쌍 하나(좌·우)를 벽 안에 둔 run. run.walls·run.wallSide 를 직접 세워 passSupply 판정만 본다
function pairRun(side, opts = {}) {
  const run = makeRun(1, side === 'L' ? 150 : 330);
  run.skippedSupplies = 0;
  run.walls = [{ id: 'w1', z0: 1800, z1: 3000, x0: 228, x1: 252 }];
  run.wallSide = side ? { w1: side } : {};
  const mk = (id, x, kind, extra) => makeSupply({
    id, z: 2300, x, kind, durability: 6, pairId: opts.noPair ? null : 'w1',
    coverZ: opts.noCover ? null : 1953, payload: kind === 'chain' ? { pads0: 5, maxPads: 15 } : { n: 3 }, ...extra });
  run.supplies = [mk('L', 120, opts.chainLeft ? 'chain' : 'soldier'), mk('R', 326, 'soldier')];
  return run;
}
const byId = (run, id) => run.supplies.find((s) => s.id === id);

test('V3-SUPPLY-PAIR PAIR-1: 쌍 중 하나를 열고 다른 하나를 지나면 skipped(missed 아님)·통 z 를 지나는 STEP 에만 1회', () => {
  for (const chainLeft of [false, true]) {
    const run = pairRun('L', { chainLeft });
    const L = byId(run, 'L'), R = byId(run, 'R'), ev = [];
    //  좌 통을 z 2000(차폐 개방 뒤)에서 연다
    run.prevZ = 1999; run.z = 2000;
    L.opened = true;
    //  파트너를 연 STEP 에는 skipped 가 켜지지 않는다(아직 깰 수 있는 통이다)
    assert.equal(passSupply(R, run, ev), false);
    assert.equal(R.skipped, false);
    assert.deepEqual(ev, []);
    //  통 z 를 지나는 STEP 에만 정확히 1회
    cross(run, 2300);
    assert.equal(passSupply(R, run, ev), true);
    assert.equal(R.skipped, true);
    assert.equal(R.missed, false);
    assert.equal(run.skippedSupplies, 1);
    assert.equal(run.missedSupplies, 0);
    assert.deepEqual(ev.map((e) => e.type), ['supplySkipped']);
    assert.equal(passSupply(R, run, ev), false, '두 번 세지 않는다');
    assert.equal(run.skippedSupplies, 1);
    //  지나간 통은 충돌 후보가 아니다
    assert.equal(supplyActive(R), false);
    //  좌 통이 chain 이면 지나는 STEP 에 locked
    if (chainLeft) {
      const ev2 = [];
      L.opened = false;
      L.skipped = false;
      const run2 = pairRun('R', { chainLeft: true });
      const L2 = byId(run2, 'L');
      byId(run2, 'R').opened = true;
      cross(run2, 2300);
      assert.equal(passSupply(L2, run2, ev2), true);
      assert.equal(L2.skipped, true);
      assert.equal(L2.locked, true, 'skipped 분기에서도 미개봉 chain 은 locked');
    }
  }
});

test('V3-SUPPLY-PAIR PAIR-2: 벽·차폐가 없는 쌍을 둘 다 안 열고 지나면 둘 다 missed', () => {
  const run = pairRun(null, { noCover: true });
  run.walls = [];
  run.wallSide = {};
  const ev = [];
  cross(run, 2300);
  passSupply(byId(run, 'L'), run, ev);
  passSupply(byId(run, 'R'), run, ev);
  assert.equal(run.missedSupplies, 2);
  assert.equal(run.skippedSupplies, 0);
  assert.deepEqual(ev.map((e) => e.type), ['supplyMissed', 'supplyMissed']);
});

test('V3-SUPPLY-PAIR PAIR-3: pairId 도 벽도 없는 통은 종전대로 missed 만', () => {
  const run = makeRun(1);
  run.skippedSupplies = 0;
  run.walls = [];
  const s = soldierCrate(6, 2), ev = [];
  assert.equal(s.pairId, null);
  assert.equal(s.coverZ, null);
  cross(run, s.z);
  assert.equal(passSupply(s, run, ev), true);
  assert.equal(s.missed, true);
  assert.equal(s.skipped, false);
  assert.deepEqual([run.missedSupplies, run.skippedSupplies], [1, 0]);
});

test('V3-SUPPLY-PAIR PAIR-5: 우 통로를 골랐는데 우 통을 못 깨면 좌 skipped · 우 missed(구조적 불가와 실제 손실 구분)', () => {
  const run = pairRun('R'), ev = [];
  cross(run, 2300);
  passSupply(byId(run, 'L'), run, ev);
  passSupply(byId(run, 'R'), run, ev);
  assert.equal(byId(run, 'L').skipped, true, '좌 통은 벽 반대편 = 구조적 획득 불가');
  assert.equal(byId(run, 'R').missed, true, '우 통은 실제 기회 손실');
  assert.deepEqual([run.skippedSupplies, run.missedSupplies], [1, 1]);
  assert.deepEqual(ev.map((e) => e.type), ['supplySkipped', 'supplyMissed']);
  //  좌 통이 chain 이면 skipped 와 함께 locked
  const run2 = pairRun('R', { chainLeft: true }), ev2 = [];
  cross(run2, 2300);
  passSupply(byId(run2, 'L'), run2, ev2);
  assert.deepEqual([byId(run2, 'L').skipped, byId(run2, 'L').locked], [true, true]);
});

test('V3-SUPPLY-PAIR PAIR-5b: 짝이 없는 통도 벽 반대편이면 skipped(S3 z6300 형태)', () => {
  const run = makeRun(1, 330);
  run.skippedSupplies = 0;
  run.walls = [{ id: 'w3', z0: 6000, z1: 7200, x0: 228, x1: 252 }];
  run.wallSide = { w3: 'R' };
  const s = makeSupply({ id: 'c9', z: 6300, x: 150, kind: 'soldier', durability: 20, coverZ: 6094, payload: { n: 10 } });
  const ev = [];
  cross(run, 6300);
  assert.equal(passSupply(s, run, ev), true);
  assert.deepEqual([s.skipped, s.missed], [true, false]);
  assert.deepEqual([run.skippedSupplies, run.missedSupplies], [1, 0]);
  //  같은 통을 좌 통로에서 지나면 '놓침'이다(얻을 수 있었다)
  const run2 = makeRun(1, 150);
  run2.skippedSupplies = 0;
  run2.walls = run.walls;
  run2.wallSide = { w3: 'L' };
  const s2 = makeSupply({ id: 'c9', z: 6300, x: 150, kind: 'soldier', durability: 20, coverZ: 6094, payload: { n: 10 } });
  cross(run2, 6300);
  passSupply(s2, run2, []);
  assert.deepEqual([s2.skipped, s2.missed], [false, true]);
});

test('V3-SUPPLY-COVER COVER-1: coverZ 앞에서 탄 20발 → 내구 불변·탄 전부 흡수·supplyBlock 20 / supplyHit 0', () => {
  const run = makeRun(1, 120);
  run.z = 1800; run.prevZ = 1800;
  const s = makeSupply({ id: 'c1', z: 2300, x: 120, kind: 'soldier', durability: 6, coverZ: 1953, payload: { n: 3 } });
  const ev = [];
  for (let i = 0; i < 20; i++) {
    const b = bullet(120, 2300, 2290);
    assert.equal(hitSupply(s, b, ev, run), true);
    assert.equal(b.dead, true, '차폐된 통도 탄을 흡수한다(통과가 아니다)');
  }
  assert.equal(s.durability, 6);
  assert.equal(s.opened, false);
  assert.equal(ev.filter((e) => e.type === 'supplyBlock').length, 20);
  assert.equal(ev.filter((e) => e.type === 'supplyHit' || e.type === 'supplyOpen').length, 0);
  assert.deepEqual(run.pendingRewards, []);
  //  차폐 중에도 충돌 후보로는 남는다(그래야 흡수가 성립한다)
  assert.equal(supplyActive(s), true);
});

test('V3-SUPPLY-COVER COVER-2: run.z >= coverZ 뒤에는 정상 개봉(보상 정확히 1회)', () => {
  const run = makeRun(1, 120);
  run.z = 1953; run.prevZ = 1952;
  const s = makeSupply({ id: 'c1', z: 2300, x: 120, kind: 'soldier', durability: 6, coverZ: 1953, payload: { n: 3 } });
  const ev = [];
  for (let i = 0; i < 6; i++) hitSupply(s, bullet(120, 2300, 2290), ev, run);
  assert.equal(s.opened, true);
  assert.equal(ev.filter((e) => e.type === 'supplyOpen').length, 1);
  assert.equal(run.pendingRewards.length, 1);
});

test('V3-SUPPLY-COVER COVER-3: coverZ 가 null 인 통은 현행과 완전히 동일(회귀)', () => {
  const run = makeRun(1);
  run.z = 0; run.prevZ = 0;
  const s = soldierCrate(4, 2);
  assert.equal(s.coverZ, null);
  const ev = [];
  for (let i = 0; i < 4; i++) hitSupply(s, bullet(240, 2100, 2090), ev, run);
  assert.equal(s.opened, true);
  assert.equal(ev.filter((e) => e.type === 'supplyBlock').length, 0);
});

// ── PAIR-4 계열: 배제가 '봇 정책'이 아니라 '규칙'으로 잠겼는지 stepRun 으로 확인한다 ──
//  ⚠️r3 초안의 오류: 같은 z 에 좌·우를 두는 것만으로는 배제가 아니다(사거리 662px = 3.48초 동안 좌↔우 이동 0.72초).
//   배제 = 벽(확정 뒤 반대편을 못 쏨) + coverZ(확정 전에 쏜 비행 중 탄도 못 닿음). 아래 검사가 그 둘을 함께 잠근다.

const PAIR_STEP = 1 / 60;
const PAIR_SCROLL = 190;

//  벽 1개 + 배제 쌍 1개만 있는 합성 스테이지(짧게 돌기 위해). 실제 배치와 같은 기하
function pairStage(o) {
  const cover = o.coverZ ?? coverZFor(o.wallZ0, o.z);
  return {
    id: 'p', version: 2, title: 'pair', startUnits: o.n, startWeapon: o.weapon ?? 'rifle',
    length: o.z + 2000, eliteZ: null,
    gateRows: [], walls: [{ id: 'w1', z0: o.wallZ0, z1: o.wallZ1, x0: 228, x1: 252 }], spawns: [], elite: null,
    supplies: [
      { id: 'L', z: o.z, x: o.lx ?? 150, r: 30, kind: 'soldier', durability: o.ld, maxDurability: o.ld,
        payload: { n: 1 }, opened: false, missed: false, locked: false, skipped: false, pads: [], coverZ: cover, pairId: 'p', hint: null },
      { id: 'R', z: o.z, x: o.rx ?? 330, r: 30, kind: 'soldier', durability: o.rd, maxDurability: o.rd,
        payload: { n: 1 }, opened: false, missed: false, locked: false, skipped: false, pads: [], coverZ: cover, pairId: 'p', hint: null },
    ],
  };
}

//  구간별 목표 x 스크립트로 한 판. 쌍을 지날 때까지만 돈다
function runScript(stage, pick, untilZ) {
  const run = createRun(stage);
  for (let i = 0; i < 20000 && !run.over && run.z <= untilZ; i++) {
    stepRun(run, { pointerX: pick(run), dragDx: 0, keyDir: 0 }, PAIR_STEP);
    drainEvents(run);
  }
  return run;
}

test('V3-SUPPLY-PAIR PAIR-4: 실제 S3 의 p1·p2 는 8정책 전부에서 최대 1개만 열린다', () => {
  const st = buildStage(3);
  const pairs = {};
  for (const s of st.supplies) if (s.pairId) (pairs[s.pairId] ??= []).push(s.id);
  assert.deepEqual(Object.keys(pairs).sort(), ['p1', 'p2']);
  for (const ids of Object.values(pairs)) assert.equal(ids.length, 2);
  for (const policy of POLICIES) {
    const { run } = playPolicy(3, policy);
    for (const [pid, ids] of Object.entries(pairs)) {
      const opened = ids.filter((id) => run.supplies.find((s) => s.id === id).opened);
      assert.ok(opened.length <= 1, `S3 ${policy} ${pid} 에서 ${opened.length} 개가 열렸다(${opened})`);
    }
  }
});

test('V3-SUPPLY-PAIR PAIR-4: 합성 쌍(병력 5·10·15·25·40)에서도 최대 1개 — 벽을 빼면 둘 다 열린다(대조군)', () => {
  const base = { wallZ0: 2400, wallZ1: 2900, z: 2800, ld: 10, rd: 10 };
  for (const n of [5, 10, 15, 25, 40]) {
    //  탐욕(좌를 열고 우로) 노선
    const greedy = (r) => (r.supplies[0].opened ? 330 : 150);
    const run = runScript(pairStage({ ...base, n }), greedy, base.z + 100);
    const opened = run.supplies.filter((s) => s.opened).length;
    assert.equal(opened, 1, `n=${n} 벽 + coverZ 인데 ${opened} 개가 열렸다`);
    //  대조군: 같은 배치에서 벽만 빼면 둘 다 열린다(배제를 만드는 것은 같은 z 가 아니라 벽이다)
    const noWall = pairStage({ ...base, n });
    noWall.walls = [];
    noWall.supplies.forEach((s) => { s.coverZ = null; });
    const run2 = runScript(noWall, greedy, base.z + 100);
    assert.equal(run2.supplies.filter((s) => s.opened).length, 2, `n=${n} 대조군(벽·차폐 없음)은 둘 다 열려야 한다`);
  }
});

test('V3-SUPPLY-PAIR PAIR-4b: 확정 직전 대시 정책(양방향 T 스윕)에서도 같은 쌍이 동시에 열리지 않는다', () => {
  //  실제 4개 지점의 기하 그대로. T = 확정선 −400 … 확정선 을 10px 간격으로 훑는다(1px·양방향 전수는 review/verify 스크립트)
  const spots = [
    { name: 'S2 w1', wallZ0: 1800, wallZ1: 3000, z: 2300, lx: 120, rx: 326, ld: 6, rd: 12, ns: [4, 5, 6, 8, 12] },
    { name: 'S3 p1', wallZ0: 2400, wallZ1: 2900, z: 2800, lx: 150, rx: 330, ld: 10, rd: 10, ns: [8, 10, 12, 25] },
    { name: 'S3 p2', wallZ0: 3150, wallZ1: 3550, z: 3500, lx: 150, rx: 330, ld: 12, rd: 24, ns: [10, 25, 30, 40] },
    { name: 'S3 wD', wallZ0: 6000, wallZ1: 7200, z: 6300, lx: 150, rx: 330, ld: 20, rd: 20, ns: [40] },
  ];
  for (const sp of spots) {
    const commitZ = sp.wallZ0 - 60;
    for (const n of sp.ns) {
      for (const dir of ['LR', 'RL']) {
        const a = dir === 'LR' ? sp.lx : sp.rx, b = dir === 'LR' ? sp.rx : sp.lx;
        for (let T = commitZ - 400; T <= commitZ; T += 10) {
          const run = runScript(pairStage({ ...sp, n }), (r) => (r.z < T ? a : b), sp.z + 60);
          const opened = run.supplies.filter((s) => s.opened).map((s) => s.id);
          assert.ok(opened.length <= 1, `${sp.name} n=${n} ${dir} T=${T} 에서 ${opened} 가 동시에 열렸다`);
        }
      }
    }
  }
});

//  랜덤 길(3-9) 통이 나오는 시드. 기본 시드의 랜덤 길은 **게이트**라 buildStage(3) 만 보면 랜덤 길 통을 한 번도 검사하지 못한다.
//   정수 시드를 앞에서부터 훑어 풀의 통 종류마다 첫 시드를 고른다(결정적이고 파일 밖 의존이 없다).
function lotterySupplySeeds() {
  const want = new Set(BAL3.lottery.pool.filter((p) => p.kind !== 'gate').map((p) => p.id));
  const out = new Map();
  for (let seed = 1; seed <= 20000 && out.size < want.size; seed++) {
    const { entry } = lotteryPick(seed);
    if (want.has(entry.id) && !out.has(entry.id)) out.set(entry.id, seed);
  }
  assert.equal(out.size, want.size, '랜덤 길 통 시드를 못 찾았다: ' + JSON.stringify([...out.keys()]));
  return [...out];
}

test('V3-SUPPLY-PAIR PAIR-4c: 차폐(coverZ)를 가진 모든 통 — 배제 쌍 4 + 짝 없는 c9 + 랜덤 길 통 — 의 coverZ 가 비행시간 보정선 공식과 정확히 같다', () => {
  //  r3.10: 사거리 제한 무기(산탄포)는 차폐선 기준에서 제외(stages.VZ_MIN 과 같은 식)
  const vzMin = Math.min(...Object.values(WEAPONS).filter((w) => w.range == null).map((w) => w.vz));
  assert.equal(vzMin, VZ_MIN);
  //  ⚠ 옛 순회는 'pairId 있는 통만' 이라 S3 좌 통 c9(z6300, coverZ 6094)와 랜덤 길 통이 공식 검사에서 통째로 빠졌다
  //   (c9 를 옛 값 6046 으로 되돌려도 검사 전건이 통과했다 — 2026-09-17 변이 검사). 이제 coverZ 가 있으면 전부 본다.
  const stages = STAGE_IDS.map((id) => ({ id, st: buildStage(id), tag: 'S' + id }));
  for (const [pick, seed] of lotterySupplySeeds()) stages.push({ id: 3, st: buildStage(3, { lotterySeed: seed }), tag: 'S3(랜덤 길=' + pick + ')' });

  for (const { id, st, tag } of stages) {
    let covered = 0;
    for (const s of st.supplies) {
      if (s.coverZ == null) continue;
      const wall = st.walls.find((w) => w.z0 - 60 <= s.z && s.z <= w.z1);
      if (!wall) {
        //  예외 1건 — 선택 C 의 z3900 통(S3 c8)은 벽이 아니라 **게이트(z4000)와 사격창을 나눠 쓰는 '저울'** 이다.
        //   차폐선 = 그 게이트의 셔터 개시선(4000 − BAL3.gate.armZ = 3660). 다른 통이 벽 밖에서 coverZ 를 갖는 것은 허용하지 않는다.
        assert.equal(id, 3, tag + ' ' + s.id + ': 벽 밖 coverZ 는 S3 에만 있다');
        assert.equal(s.id, 'c8', tag + ' ' + s.id + ': 벽 밖 coverZ 예외는 S3 c8(저울) 하나뿐이다');
        assert.equal(s.coverZ, 4000 - BAL3.gate.armZ, tag + ' c8 의 차폐선은 게이트 z4000 셔터 개시선');
        covered++;
        continue;
      }
      //  ①1 STEP 지연(통로 확정은 직전 STEP 의 run.z 로 판정된다) + ②대형 깊이(탄은 run.z - dy 에서 출발한다)를 함께 얹는다
      const commitZ = wall.z0 - 60;
      const fireZ = commitZ + BAL3.scroll * BAL3.STEP;
      const want = Math.ceil(fireZ + (s.z + MAX_DY - fireZ) * BAL3.scroll / vzMin);
      assert.equal(s.coverZ, want, tag + ' ' + s.id + ' coverZ');
      assert.equal(s.coverZ, coverZFor(wall.z0, s.z), tag + ' ' + s.id + ' coverZ 는 stages.coverZFor 과 같다');
      assert.ok(s.coverZ > commitZ, tag + ' ' + s.id + ': coverZ 는 확정선보다 뒤여야 한다(확정 직전에 쏜 탄이 도착하는 지점)');
      assert.ok(s.coverZ < s.z, tag + ' ' + s.id + ': coverZ 는 통보다 앞이어야 한다(개방 뒤 사격창이 남는다)');
      covered++;
    }
    //  배제 쌍은 차폐 + 벽을 함께 갖는다(둘 중 하나라도 빠지면 위 순회에서 조용히 빠져나간다)
    for (const s of st.supplies) if (s.pairId) {
      assert.ok(s.coverZ != null, tag + ' ' + s.id + ' 배제 쌍에 coverZ 가 없다');
      assert.ok(st.walls.some((w) => w.z0 - 60 <= s.z && s.z <= w.z1), tag + ' ' + s.id + ' 배제 쌍은 벽 안에 있어야 한다');
    }
    //  검사 대상 개수를 못 박는다 — 통에서 coverZ 를 떼어 내 검사를 빠져나가는 변경을 여기서 잡는다
    const wantCovered = id === 1 ? 0 : id === 2 ? 2 : (st.lottery && st.lottery.supplyId ? 7 : 6);
    assert.equal(covered, wantCovered, tag + ': 차폐(coverZ) 통 개수');
  }
});
