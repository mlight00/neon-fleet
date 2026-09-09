// rush3-supply — 보급 통·연속 증원 규칙(계약서 3-3 · 8장 V3-SUPPLY / V3-CHAIN)을 잠근다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSupply, hitSupply, passSupply, takePads, sweepHitsSupply, activateChain, applySupplyReward, supplyActive } from '../rush3/supply.js';
import { makeUnit, layoutUnits, formation } from '../rush3/squad.js';

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

test('V3-SUPPLY: weapon 통 보상은 pendingRewards 에 무기 id 로 쌓이고, 동급·하급은 무시(weaponSame)', () => {
  const run = makeRun(1), ev = [];
  const same = makeSupply({ id: 'w1', z: 4000, x: 240, kind: 'weapon', durability: 1, payload: { weapon: 'auto' } });
  const lower = makeSupply({ id: 'w2', z: 4100, x: 240, kind: 'weapon', durability: 1, payload: { weapon: 'rifle' } });
  const higher = makeSupply({ id: 'w3', z: 4200, x: 240, kind: 'weapon', durability: 1, payload: { weapon: 'heavy' } });
  for (const s of [same, lower, higher]) hitSupply(s, bullet(240), ev, run);
  assert.deepEqual(run.pendingRewards.map((r) => [r.kind, r.payload.weapon]), [['weapon', 'auto'], ['weapon', 'rifle'], ['weapon', 'heavy']]);
  assert.equal(run.weapon, 'auto', 'hitSupply 는 무기를 바꾸지 않는다');
  assert.equal(applySupplyReward(run.pendingRewards[0], run, ev, { weaponRank: rank }), false);
  assert.equal(run.weapon, 'auto', '동급 무시');
  assert.equal(applySupplyReward(run.pendingRewards[1], run, ev, { weaponRank: rank }), false);
  assert.equal(run.weapon, 'auto', '하급 무시');
  assert.equal(ev.filter((e) => e.type === 'weaponSame').length, 2);
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
