// rush3-lottery — 랜덤 길(계약서 3-9 · 8장 V3-LOTTERY). 이사 지시(2026-09-16)
//  "3스테이지에 빈 길은 무의미하다. 빈 길이 아니라 랜덤 길을 만들어서 진입 시마다 로또처럼 좋거나 꽝인 선택이 랜덤으로 나오게".
//  잠그는 것: ① 시드 고정 결정성 ② 풀 5종 균등 ③ 확정선 전 흡수(정적+실사격) ④ 좋음 3종 보상 ⑤ 꽝 ④ 막을 수 있는 게이트 ⑥ 꽝 ⑤ 확정 손실 게이트
//   ⑦ 반대 통로 선택 시 skipped + 결과 공개 문구 ⑧ stepRun 무분기(정적) ⑨ 봇 시뮬 회귀.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildStage, lotteryPick, LOTTERY_DEFAULT_SEED, coverZFor, VZ_MIN } from '../rush3/stages.js';
import { makeSupply, hitSupply, activateChain, applySupplyReward, supplyActive } from '../rush3/supply.js';
import { hitGateCell, passGateRow, updateGateArm, cellAt } from '../rush3/gates.js';
import { makeUnit, layoutUnits, addUnits } from '../rush3/squad.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { lotteryLine, emptyLotteryOutcome, collectLotteryOutcome } from '../rush3/main.js';
import { isTrapGateRow } from '../rush3/render.js';
import { adviceLine } from '../rush3/advice.js';
import { BAL3 } from '../rush3/balance.js';
import { WEAPONS } from '../rush3/weapons.js';
import { hashSeed } from '../rush/rng.js';
import { pickX, playPolicy } from './lib/rush3-policies.mjs';

const POOL = BAL3.lottery.pool;
const POOL_IDS = POOL.map((p) => p.id);
//  검사용 시드 20개(계약서 3-9 검증 ②). 셸과 같은 조립 규칙이되 시계 대신 인덱스를 쓴다 — 검사는 결정적이어야 한다
const SEEDS = Array.from({ length: 20 }, (_, i) => hashSeed('lot:3:' + i));
//  풀 5종의 대표 시드(위 20개 안에서 처음 그 항목이 나오는 자리 — _probe_lottery.mjs 실측)
const SEED_OF = { trapGate: SEEDS[0], soldier8: SEEDS[1], chain6: SEEDS[4], heavy: SEEDS[6], badGate: SEEDS[11] };

//  ⚠ 풀이 바뀌어 대표 시드가 사라지면 lotterySeed 가 undefined → buildStage 가 **기본 시드로 조용히 폴백**한다.
//   그러면 없어진 id 를 도는 루프가 엉뚱한(그리고 이미 검사한) 판을 한 번 더 보게 된다. 여기서 먼저 막는다.
const stageFor = (pick) => {
  assert.ok(SEED_OF[pick], pick + ': SEED_OF 에 대표 시드가 없다(풀이 바뀌었다) — 기본 시드 폴백 금지');
  return buildStage(3, { lotterySeed: SEED_OF[pick] });
};
const lotSupply = (st) => st.supplies.find((s) => s.id === st.lottery.supplyId);
const lotRow = (st) => st.gateRows.find((r) => r.id === st.lottery.rowId);
const bullet = (x, z = 0, pz = 0, dmg = 1) => ({ x, z, pz, dmg, gateHit: 1, dead: false });

//  통 판정만 쓰는 최소 run(보상 경로 = pendingRewards 하나). z 는 차폐가 걷힌 뒤로 둔다
function miniRun(n, { z = 99999, x = 330, weapon = 'rifle' } = {}) {
  const run = { z, prevZ: z, x, units: [], nextUnitId: 1, weapon, pendingRewards: [],
                missedSupplies: 0, skippedSupplies: 0, badGatesPassed: 0, lossByGate: 0 };
  for (let i = 0; i < n; i++) run.units.push(makeUnit(run.nextUnitId++));
  layoutUnits(run.units);
  return run;
}
const rank = (id) => (WEAPONS[id] ? WEAPONS[id].rank : 0);

// ─────────────────────────────────────────────────────────────────────────────
// LOT-1 결정성 — 같은 시드면 같은 판, 시드를 안 주면 기준선(검사·봇 시뮬)
// ─────────────────────────────────────────────────────────────────────────────
test('V3-LOTTERY LOT-1: 시드를 고정하면 buildStage 두 번이 deepEqual — 랜덤 길만 판마다 바뀐다', () => {
  for (const id of POOL_IDS) {
    const seed = SEED_OF[id];
    const a = buildStage(3, { lotterySeed: seed }), b = buildStage(3, { lotterySeed: seed });
    assert.deepEqual(a, b, id + ': 같은 시드면 완전히 같은 배치');
    assert.notEqual(a.supplies, b.supplies, '호출마다 새 객체(구조 공유 금지)');
    assert.equal(a.lottery.seed, seed >>> 0);
    assert.equal(a.lottery.pick, id);
  }
  //  시드를 안 주면 결정적 기본 시드 — 기존 24판·27판 봇 검사가 서 있는 기준선
  assert.deepEqual(buildStage(3), buildStage(3));
  assert.equal(buildStage(3).lottery.seed, LOTTERY_DEFAULT_SEED >>> 0);
  //  S1·S2 는 랜덤 길이 없다(계약서 3-9 = S3 w3 우측 통로 한 곳)
  assert.equal(buildStage(1).lottery, null);
  assert.equal(buildStage(2).lottery, null);
  //  시드가 다르면 실제로 다른 판이 나온다(추첨이 시드에 매달려 있다는 증거)
  const picks = new Set(SEEDS.map((s) => buildStage(3, { lotterySeed: s }).lottery.pick));
  assert.ok(picks.size >= 2, '시드 20개에서 서로 다른 결과가 나온다');
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-2 풀 — 5종 전부 등장 · 풀 밖 없음 · 좋음 3 : 꽝 2
// ─────────────────────────────────────────────────────────────────────────────
test('V3-LOTTERY LOT-2: 시드 20개에서 풀 5종이 전부 최소 1회 나오고 풀 밖 결과는 없다(좋음 3 : 꽝 2)', () => {
  assert.equal(POOL.length, 5);
  assert.equal(POOL.filter((p) => p.good).length, 3, '좋음 3');
  assert.equal(POOL.filter((p) => !p.good).length, 2, '꽝 2');
  const count = {};
  for (const seed of SEEDS) {
    const { idx, entry } = lotteryPick(seed);
    assert.ok(POOL_IDS.includes(entry.id), '풀 밖 결과가 나오면 안 된다: ' + entry.id);
    assert.equal(POOL[idx].id, entry.id, 'idx 는 풀 인덱스와 일치한다');
    const st = buildStage(3, { lotterySeed: seed });
    assert.equal(st.lottery.pick, entry.id, 'buildStage 가 추첨 결과를 그대로 얹는다');
    assert.equal(st.lottery.good, !!entry.good);
    assert.equal(st.lottery.label, entry.label);
    count[entry.id] = (count[entry.id] || 0) + 1;
  }
  for (const id of POOL_IDS) assert.ok(count[id] > 0, id + ' 이 20 시드 안에 한 번도 안 나왔다: ' + JSON.stringify(count));
  //  추첨은 mulberry32 한 번(균등 1/5). 표본 20 이라 분포는 잠그지 않고 '전부 등장'만 잠근다
  assert.equal(Object.values(count).reduce((a, b) => a + b, 0), SEEDS.length);
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-2b 대표 시드 표 — SEED_OF 가 풀과 정확히 일치한다(풀을 고치면 여기서 먼저 깨진다)
// ─────────────────────────────────────────────────────────────────────────────
test('V3-LOTTERY LOT-2b: 검사용 대표 시드 표(SEED_OF)의 키가 풀 id 와 정확히 일치하고 각 시드가 그 항목을 뽑는다', () => {
  //  풀에서 항목을 빼거나 이름을 바꿔도 SEED_OF 는 그대로 남는다 → SEED_OF[없는 id] = undefined →
  //   buildStage/playPolicy 가 **기본 시드로 폴백**해 다른 판을 조용히 두 번 검사한다(2026-09-17 검수 지적 1).
  //   그 폴백은 통과로 보이기 때문에 사람이 못 잡는다. 풀과 표를 여기서 맞물려 둔다.
  assert.deepEqual(Object.keys(SEED_OF).slice().sort(), POOL_IDS.slice().sort(),
    'SEED_OF 키 ' + JSON.stringify(Object.keys(SEED_OF)) + ' vs 풀 ' + JSON.stringify(POOL_IDS));
  for (const id of POOL_IDS) {
    const seed = SEED_OF[id];
    assert.equal(typeof seed, 'number', id + ': 대표 시드가 숫자여야 한다');
    assert.ok(SEEDS.includes(seed), id + ': 대표 시드는 검사용 시드 20개 안에서 고른다');
    assert.notEqual(seed >>> 0, LOTTERY_DEFAULT_SEED >>> 0, id + ': 대표 시드가 기본 시드와 같으면 폴백을 구분할 수 없다');
    assert.equal(lotteryPick(seed).entry.id, id, id + ': 대표 시드가 그 항목을 뽑지 않는다');
    assert.equal(buildStage(3, { lotterySeed: seed }).lottery.pick, id, id + ': buildStage 결과도 그 항목이어야 한다');
  }
  //  좋음 3 : 꽝 2 의 **id 목록**도 고정한다 — 아래 LOT-7 이 꽝 2종을 문자열로 적기 때문이다
  assert.deepEqual(POOL.filter((p) => p.good).map((p) => p.id), ['soldier8', 'heavy', 'chain6']);
  assert.deepEqual(POOL.filter((p) => !p.good).map((p) => p.id), ['badGate', 'trapGate']);
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-3 가림 — 통로 확정선 전에는 사격이 흡수되고 내구·값이 변하지 않는다
// ─────────────────────────────────────────────────────────────────────────────
test('V3-LOTTERY LOT-3: 확정선 전 사격은 흡수되고 내구·값 불변, 확정(차폐 개방) 뒤에는 정상 처리', () => {
  //  ① 통 3종 — coverZ(비행시간 보정선) 앞에서는 supplyBlock
  for (const id of ['soldier8', 'heavy', 'chain6']) {
    const st = stageFor(id), s = lotSupply(st), lot = st.lottery;
    assert.equal(s.coverZ, coverZFor(st.walls[2].z0, lot.z), id + ': coverZ 는 공식 값이다');
    assert.ok(s.coverZ > lot.revealZ, id + ': 차폐는 확정선보다 뒤에 걷힌다(비행 중인 탄까지 막는다)');
    const run = miniRun(4, { z: lot.revealZ - 1 });
    const ev = [], dur0 = s.durability;
    for (let i = 0; i < 20; i++) {
      const b = bullet(s.x);
      assert.equal(hitSupply(s, b, ev, run), true);
      assert.equal(b.dead, true, '가려진 동안에도 탄은 흡수된다(통과가 아니다)');
    }
    assert.equal(s.durability, dur0, id + ': 가려진 동안 내구가 줄지 않는다');
    assert.equal(s.opened, false);
    assert.equal(ev.filter((e) => e.type === 'supplyBlock').length, 20);
    assert.equal(ev.filter((e) => e.type === 'supplyHit').length, 0);
    assert.equal(run.pendingRewards.length, 0);
    //  차폐가 걷힌 뒤에는 정상
    run.z = s.coverZ;
    hitSupply(s, bullet(s.x), ev, run);
    assert.equal(s.durability, dur0 - 1, id + ': 개방 뒤에는 내구가 준다');
    assert.equal(ev.at(-1).type, 'supplyHit');
  }
  //  ② 꽝 게이트 — 셔터(armZ)가 통의 차폐 개방선과 **같은 z** 에서 열린다(기본 340 이면 확정 전에 쏜 탄이 뒤늦게 값을 바꾼다)
  const st = stageFor('badGate'), row = lotRow(st), lot = st.lottery;
  assert.equal(lot.openZ, coverZFor(st.walls[2].z0, lot.z), 'openZ 는 통 3종의 coverZ 와 같은 선');
  assert.equal(row.armZ, lot.z - lot.openZ, '셔터 개방선 = openZ');
  assert.ok(row.armZ < BAL3.gate.armZ, '기본 340 보다 좁다(' + row.armZ + ' < ' + BAL3.gate.armZ + ')');
  assert.equal(row.armed, false);
  const openAt = row.z - row.armZ;
  assert.equal(openAt, lot.openZ);
  assert.ok(openAt > lot.revealZ, '셔터도 확정선을 지난 뒤에 열린다(' + openAt + ' > ' + lot.revealZ + ')');
  const run = miniRun(4, { z: lot.revealZ - 1 });
  const ev = [], cell = row.cells[0], v0 = cell.value;
  updateGateArm(row, run, ev);
  assert.equal(row.armed, false);
  for (let i = 0; i < 10; i++) {
    const b = bullet(330);
    hitGateCell(row, cell, b, ev);
    assert.equal(b.dead, true);
  }
  assert.equal(cell.value, v0, '가려진 동안 게이트 값이 변하지 않는다');
  assert.equal(ev.filter((e) => e.type === 'gateBlock').length, 10);
  assert.equal(ev.filter((e) => e.type === 'gateHit').length, 0);
  run.z = openAt;
  assert.equal(updateGateArm(row, run, ev), true);
  assert.equal(ev.filter((e) => e.type === 'gateArm').length, 1, 'gateArm 은 정확히 1회');
  hitGateCell(row, cell, bullet(330), ev);
  assert.equal(cell.value, v0 + 1, '열린 뒤에는 1발 = +1');
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-3b 실사격 회귀 — 공식 일치만으로는 못 잡는다. 확정 직전 STEP 까지 실제로 쏴 보고
//  반대편(랜덤 길)이 한 대도 안 맞는지 stepRun 으로 확인한다. 대조군(옛 공식)은 반드시 맞아야 한다.
// ─────────────────────────────────────────────────────────────────────────────
const COMMIT_Z = 6000 - BAL3.squad.wallLead;

/** 확정선 직전까지 중앙 바로 왼쪽(x239)에서 쏘다가 좌측으로 확정하는 판.
 *  대형이 크면 우측 끝 유닛(x ≈ 239 + dx)이 우측 통(x330, r30)을 겨누고, 그 탄은 확정 뒤에 도착한다.
 *  oldCover = true 면 차폐선을 **옛 공식**(1 STEP 지연·대형 깊이 미반영)으로 되돌린 대조군이다. */
function fireAcrossCommit(seed, { units = 80, weapon = 'heavy', oldCover = false } = {}) {
  const stage = buildStage(3, { lotterySeed: seed });
  const run = createRun(stage);
  const lot = run.lottery;
  run.weapon = weapon;
  addUnits(run, units - run.units.length, WEAPONS[weapon].interval);
  const startZ = 5700;
  run.z = startZ; run.prevZ = startZ; run.x = 239; run.tx = 239;
  run.spawnCursor = stage.spawns.filter((s) => s.z <= startZ).length;
  const sup = run.supplies.find((c) => c.id === lot.supplyId) || null;
  const row = run.gateRows.find((r) => r.id === lot.rowId) || null;
  if (oldCover) {
    if (sup) sup.coverZ = Math.ceil(COMMIT_Z + (lot.z - COMMIT_Z) * BAL3.scroll / VZ_MIN);
    if (row) row.armZ = BAL3.gate.armZ;
  }
  const seen = [];
  while (run.z < 6400 && !run.over) {
    //  차폐만 본다 — 적·적탄이 탄을 대신 먹으면 누출이 가려진다
    run.enemies.length = 0; run.eshots.length = 0;
    stepRun(run, { pointerX: run.z >= lot.revealZ ? 150 : 239, dragDx: 0, keyDir: 0 }, STEP);
    for (const e of drainEvents(run)) {
      if (lot.supplyId && e.id === lot.supplyId && (e.type === 'supplyHit' || e.type === 'supplyOpen')) seen.push(e.type + '@' + run.z.toFixed(2));
      if (lot.rowId && e.id === lot.rowId && (e.type === 'gateHit' || e.type === 'gateFlip')) seen.push(e.type + '@' + run.z.toFixed(2));
    }
  }
  return { run, lot, sup, row, seen };
}

test('V3-LOTTERY LOT-3b: 확정 직전까지 중화기로 쏘다가 좌측 확정 — 반대편 랜덤 길은 한 대도 맞지 않는다(시드 5종)', () => {
  for (const id of POOL_IDS) {
    const { run, lot, sup, row, seen } = fireAcrossCommit(SEED_OF[id]);
    assert.equal(run.wallSideLog.w3, 'L', id + ': 좌측으로 확정된 판이어야 한다');
    assert.deepEqual(seen, [], id + ': 확정 전에 쏜 탄이 반대편에 닿았다 — ' + JSON.stringify(seen));
    if (sup) {
      assert.equal(sup.durability, sup.maxDurability, id + ': 내구 불변');
      assert.equal(sup.opened, false);
    }
    if (row) assert.equal(row.cells[0].value, BAL3.lottery.pool[lot.idx].value, id + ': 게이트 값 불변');
  }
});

test('V3-LOTTERY LOT-3b 대조군: 옛 공식(1 STEP 지연·대형 깊이 미반영)으로 되돌리면 같은 판에서 실제로 뚫린다', () => {
  const leaked = [];
  for (const id of POOL_IDS) {
    const { lot, sup, row, seen } = fireAcrossCommit(SEED_OF[id], { oldCover: true });
    if (seen.length) leaked.push(id + ' ' + seen[0] + (sup ? ' 내구 ' + sup.maxDurability + '→' + sup.durability
      : ' 값 ' + BAL3.lottery.pool[lot.idx].value + '→' + row.cells[0].value));
  }
  //  5종 전부가 뚫려야 하는 것은 아니다(내구·상한이 달라 도달 1발의 결과가 다르다). 하나도 안 뚫리면 이 검사가 무의미하다
  assert.ok(leaked.length > 0, '옛 공식에서도 누출이 0 이면 LOT-3b 가 아무것도 잡지 못한다');
  assert.ok(leaked.length >= 3, '옛 공식 누출: ' + JSON.stringify(leaked));
});

/** LOT-3b 의 **반대 방향**(2026-09-17 검수 지적 2). 확정선 직전까지 중앙 바로 오른쪽(x 241)에서 쏘다가
 *  우측(랜덤 길)으로 확정하는 판. 이번에 지켜야 할 대상은 **좌 통 c9**(z6300 x150 r30, coverZ 6094) —
 *  pairId 가 없어서 PAIR-4c·STG-4 의 옛 순회(‘pairId 있는 통만’)에서 통째로 빠져 있던 통이다.
 *  대형은 상한(BAL3.squad.unitCap)까지 채운다: coverZ 공식의 MAX_DY 가 그 깊이를 전제로 하므로
 *  가장 늦게 도착하는 탄(뒷줄 유닛이 쏜 탄)이 여기서 나온다. 80명으로는 옛 공식으로도 안 뚫려 대조군이 성립하지 않는다.
 *  coverZ 인자를 주면 c9 의 차폐선만 그 값으로 바꾼 대조군이다 — DEFS·buildStage 는 건드리지 않고 run 객체만 손댄다. */
function fireAcrossCommitToRight(seed, { coverZ = null, units = BAL3.squad.unitCap, weapon = 'heavy' } = {}) {
  const stage = buildStage(3, { lotterySeed: seed });
  const run = createRun(stage);
  const lot = run.lottery;
  run.weapon = weapon;
  addUnits(run, units - run.units.length, WEAPONS[weapon].interval);
  const c9 = run.supplies.find((s) => s.id === 'c9');
  if (coverZ !== null) c9.coverZ = coverZ;
  const startZ = 5700;
  run.z = startZ; run.prevZ = startZ; run.x = 241; run.tx = 241;   // 241 = 벽 중심(240) 바로 오른쪽 → 우측 확정
  run.spawnCursor = stage.spawns.filter((s) => s.z <= startZ).length;
  const seen = [];
  let blocked = 0;
  while (run.z < 6400 && !run.over) {
    //  차폐만 본다 — 적·적탄이 탄을 대신 먹으면 누출이 가려진다
    run.enemies.length = 0; run.eshots.length = 0;
    stepRun(run, { pointerX: run.z >= lot.revealZ ? 330 : 241, dragDx: 0, keyDir: 0 }, STEP);
    for (const e of drainEvents(run)) {
      if (e.id !== 'c9') continue;
      if (e.type === 'supplyHit' || e.type === 'supplyOpen') seen.push(e.type + '@' + run.z.toFixed(2));
      if (e.type === 'supplyBlock') blocked++;
    }
  }
  return { run, lot, c9, seen, blocked };
}

test('V3-LOTTERY LOT-3b 반대 방향: 우측(랜덤 길)으로 확정하면 좌 통 c9 에 한 대도 닿지 않는다 — c9.coverZ 를 옛 값으로 되돌린 대조군은 뚫린다', () => {
  //  대조군 값 = 옛 공식(1 STEP 지연·대형 깊이 미반영)으로 계산한 c9 의 차폐선
  const OLD_C9_COVER = Math.ceil(COMMIT_Z + (6300 - COMMIT_Z) * BAL3.scroll / VZ_MIN);
  assert.equal(OLD_C9_COVER, 6046, '대조군은 옛 공식 값 6046');
  assert.equal(coverZFor(6000, 6300), 6094, '현행 공식 값 6094');
  const leaked = [];
  for (const id of POOL_IDS) {
    assert.ok(SEED_OF[id], id);
    const a = fireAcrossCommitToRight(SEED_OF[id]);
    assert.equal(a.run.wallSideLog.w3, 'R', id + ': 우측으로 확정된 판이어야 한다');
    assert.equal(a.c9.coverZ, coverZFor(6000, 6300), id + ': c9 는 현행 공식 차폐선');
    assert.ok(a.blocked > 0, id + ': 흡수(supplyBlock)가 0 이면 탄이 c9 쪽으로 아예 안 간 것 — 이 검사가 무의미해진다');
    assert.deepEqual(a.seen, [], id + ': 확정 전에 쏜 탄이 좌 통 c9 에 닿았다 — ' + JSON.stringify(a.seen));
    assert.equal(a.c9.durability, a.c9.maxDurability, id + ': c9 내구 불변');
    assert.equal(a.c9.opened, false, id + ': c9 는 열리지 않는다');
    //  대조군 — c9 의 차폐선만 옛 값으로 되돌리면 같은 판에서 실제로 뚫린다(공식 일치 검사만으로는 못 잡는 경로)
    const b = fireAcrossCommitToRight(SEED_OF[id], { coverZ: OLD_C9_COVER });
    assert.equal(b.run.wallSideLog.w3, 'R', id + ': 대조군도 같은 판(우측 확정)');
    if (b.seen.length) leaked.push(id + ' ' + b.seen[0] + ' 내구 ' + b.c9.maxDurability + '→' + b.c9.durability);
  }
  assert.equal(leaked.length, POOL_IDS.length,
    '옛 공식 대조군은 시드 5종 전부에서 뚫려야 한다(뚫리지 않으면 이 검사가 아무것도 잡지 못한다): ' + JSON.stringify(leaked));
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-4 좋음 3종 — 보상이 계약서 3-9 풀 표 그대로 적용된다
// ─────────────────────────────────────────────────────────────────────────────
test('V3-LOTTERY LOT-4 ①: 병사 통(내구 14) → 정확히 병사 8명 합류', () => {
  const st = stageFor('soldier8'), s = lotSupply(st);
  assert.equal(s.kind, 'soldier');
  assert.equal(s.durability, 14);
  assert.deepEqual(s.payload, { n: 8 });
  const run = miniRun(3), ev = [];
  for (let i = 0; i < 13; i++) hitSupply(s, bullet(s.x), ev, run);
  assert.equal(s.opened, false, '13발로는 안 열린다(내구 14)');
  hitSupply(s, bullet(s.x), ev, run);
  assert.equal(s.opened, true);
  assert.equal(run.pendingRewards.length, 1, '보상은 정확히 1회');
  applySupplyReward(run.pendingRewards[0], run, ev, { weaponRank: rank });
  assert.equal(run.units.length, 11, '3 + 8 = 11');
  assert.equal(ev.at(-1).type, 'joinMany');
  assert.equal(ev.at(-1).n, 8);
});

test('V3-LOTTERY LOT-4 ②: 무기 통(heavy, 내구 24) → 중화기 교체 · 이미 heavy 면 Mk 강화(r3.10, 교체 없음)', () => {
  const st = stageFor('heavy'), s = lotSupply(st);
  assert.equal(s.kind, 'weapon');
  assert.equal(s.durability, 24);
  assert.deepEqual(s.payload, { weapon: 'heavy' });
  //  소총 → 중화기 교체
  const run = miniRun(6), ev = [];
  for (let i = 0; i < 24; i++) hitSupply(s, bullet(s.x), ev, run);
  assert.equal(s.opened, true);
  applySupplyReward(run.pendingRewards[0], run, ev, { weaponRank: rank });
  assert.equal(run.weapon, 'heavy');
  assert.equal(ev.at(-1).type, 'weaponSwap');
  //  이미 중화기면 교체하지 않고 Mk 한 단계(r3.10). 만렙(III)이면 weaponSame
  const st2 = stageFor('heavy'), s2 = lotSupply(st2);
  const run2 = miniRun(6, { weapon: 'heavy' }), ev2 = [];
  for (let i = 0; i < 24; i++) hitSupply(s2, bullet(s2.x), ev2, run2);
  applySupplyReward(run2.pendingRewards[0], run2, ev2, { weaponRank: rank });
  assert.equal(run2.weapon, 'heavy');
  assert.equal(ev2.at(-1).type, 'weaponMk'); assert.equal(run2.weaponMk, 2);
  run2.weaponMk = 3;
  applySupplyReward(run2.pendingRewards[0], run2, ev2, { weaponRank: rank });
  assert.equal(ev2.at(-1).type, 'weaponSame');
});

test('V3-LOTTERY LOT-4 ③: 연속 증원(내구 8) → 발판 6 에서 시작해 최대 12 까지, 발판은 우측 차선', () => {
  const st = stageFor('chain6'), s = lotSupply(st);
  assert.equal(s.kind, 'chain');
  assert.equal(s.durability, 8);
  assert.deepEqual(s.payload, { pads0: 6, maxPads: 12 });
  const run = miniRun(5), ev = [];
  for (let i = 0; i < 8; i++) hitSupply(s, bullet(s.x), ev, run);
  assert.equal(s.opened, true);
  applySupplyReward(run.pendingRewards[0], run, ev, { weaponRank: rank, supplies: run.supplies || [s] });
  assert.equal(s.pads.length, 6, '활성화 = 발판 6');
  for (let i = 0; i < 6; i++) hitSupply(s, bullet(s.x), ev, run);
  assert.equal(s.pads.length, 12, '유효탄 1발 = 발판 +1, 상한 12');
  for (let i = 0; i < 5; i++) hitSupply(s, bullet(s.x), ev, run);
  assert.equal(s.pads.length, 12, 'maxPads 클램프');
  //  발판은 통과 같은 차선(우측) — 좌 통로를 고른 판이 주워 갈 수 없다
  assert.equal(s.x, st.lottery.x);
  for (const p of s.pads) assert.equal(p.x, 330, '발판 x 는 우측 차선 330');
  assert.ok(s.pads.every((p) => p.x > BAL3.wall.x1), '발판이 전부 벽 오른쪽');
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-5 꽝 ④ — 음수 게이트 −15, 상한 0(쏴서 무효화까지만)
// ─────────────────────────────────────────────────────────────────────────────
test('V3-LOTTERY LOT-5: 꽝 음수 게이트는 −15·상한 0 — 쏘면 0 까지, 안 쏘고 통과하면 손실이 |value|', () => {
  const st = stageFor('badGate'), row = lotRow(st), cell = row.cells[0];
  assert.equal(row.bypass, true, '좌측 통로는 이 행에 걸리지 않는다(한 칸 행)');
  assert.deepEqual([cell.x0, cell.x1], [252, 400], '우측 통로 한 칸');
  assert.equal(cell.value, -15);
  assert.equal(cell.maxValue, 0, '상한 0 = 무효화까지만 가능(이득으로 뒤집히지 않는다)');
  assert.equal(cellAt(row, 240), null, '중심 240(좌)이면 걸리는 칸이 없다');
  //  ① 쏘면 0 까지
  const run = miniRun(20, { z: row.z - row.armZ, x: 330 });
  const ev = [];
  updateGateArm(row, run, ev);
  assert.equal(row.armed, true);
  for (let i = 0; i < 15; i++) hitGateCell(row, cell, bullet(330), ev);
  assert.equal(cell.value, 0, '유효탄 15발 = −15 → 0');
  assert.equal(ev.filter((e) => e.type === 'gateFlip').length, 1, '음수 → 0 전환은 gateFlip 1회');
  hitGateCell(row, cell, bullet(330), ev);
  assert.equal(cell.value, 0, '상한 0 을 넘지 않는다');
  run.prevZ = row.z - 1; run.z = row.z;
  passGateRow(row, run, ev);
  assert.equal(run.units.length, 20, '0 통과는 무효과');
  assert.equal(run.lossByGate, 0);
  //  ② 안 쏘고 통과하면 |value| 만큼 잃는다
  const st2 = stageFor('badGate'), row2 = lotRow(st2);
  const run2 = miniRun(20, { x: 330 });
  const ev2 = [];
  run2.prevZ = row2.z - 1; run2.z = row2.z;
  passGateRow(row2, run2, ev2);
  assert.equal(run2.units.length, 5, '20 − 15 = 5');
  assert.equal(run2.lossByGate, 15);
  assert.equal(run2.badGatesPassed, 1);
  assert.equal(ev2.at(-1).type, 'gatePass');
  assert.equal(ev2.at(-1).value, -15);
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-6 꽝 ⑤ — 확정 손실 게이트. **우측을 고르면 실제로 병력이 줄어야 한다**
//  (이전 ⑤ 돌격체 4 는 이 지점 병력 68~69 에 접촉 전 전멸해 세 난이도 모두 손실 0 + 공짜 처치였다 = 꽝이 아니었다)
// ─────────────────────────────────────────────────────────────────────────────
//  w3 구간만 우측으로 가는 계획 봇(다른 구간은 PLAN[3] 과 같다) — LOT-7b 와 같은 노선
function rightAtW3(run) {
  if (run.z >= 4000 && run.z < 5940) return 320;
  if (run.z >= 5940 && run.z < 6600) return 330;
  return pickX('plan', run);
}
//  ⚠️결과 한 줄은 이제 **실제 적용값**을 읽는다(2026-09-17 2차 검수 N4). 셸이 하는 일을 여기서도 그대로 한다 —
//   규칙 계층 이벤트를 collectLotteryOutcome 에 흘려 run.lotteryOutcome 을 채운 뒤 lotteryLine 을 부른다.
function playRight(seed, difficulty = 'normal', route = rightAtW3) {
  const stage = buildStage(3, { difficulty, lotterySeed: seed });
  const run = createRun(stage);
  run.lotteryOutcome = emptyLotteryOutcome();
  let n = 0;
  while (!run.over && n < 14400) {
    stepRun(run, { pointerX: route(run), dragDx: 0, keyDir: 0 }, STEP);
    collectLotteryOutcome(run.lotteryOutcome, drainEvents(run), run);
    n++;
  }
  return { stage, run };
}
//  중화기를 미리 든 채 랜덤 길 중화기를 만나는 노선(선택 B 우측 = z3500 중화기 통 → w3 우측)
function heavyThenRight(run) {
  if (run.z >= 2400 && run.z < 3600) return 330;
  return rightAtW3(run);
}
//  분리벽 w3 를 빠져나온 직후(z 7200)의 병력. 랜덤 길이 실제로 얼마를 주고 얼마를 뺏었는지 그 자리에서 잰다
function unitsAtWallEnd(seed, side, difficulty) {
  const stage = buildStage(3, { difficulty, lotterySeed: seed });
  const run = createRun(stage);
  let n = 0, at = null;
  while (!run.over && n < 14400) {
    stepRun(run, { pointerX: side === 'R' ? rightAtW3(run) : pickX('plan', run), dragDx: 0, keyDir: 0 }, STEP);
    drainEvents(run);
    if (at === null && run.z >= 7200) at = { units: run.units.length, lossByGate: run.lossByGate, lossByTouch: run.lossByTouch };
    n++;
  }
  return at;
}

test('V3-LOTTERY LOT-6: 꽝 확정 게이트는 −10·상한이 자기 값 — 쏴도 오르지 않고 우측 통로 한 칸이다', () => {
  const st = stageFor('trapGate'), lot = st.lottery, row = lotRow(st), cell = row.cells[0];
  assert.equal(lot.kind, 'gate');
  assert.equal(lot.supplyId, null);
  assert.equal(row.bypass, true, '좌측 통로는 이 행에 걸리지 않는다(한 칸 행)');
  assert.deepEqual([cell.x0, cell.x1], [252, 400], '우측 통로 한 칸');
  assert.equal(cell.value, -10);
  assert.equal(cell.maxValue, -10, '상한이 자기 값 = 쏴도 오르지 않는다');
  assert.equal(cellAt(row, 240), null, '중심 240(좌)이면 걸리는 칸이 없다');
  //  셔터가 열린 뒤 40발을 넣어도 값이 그대로다(badGate 는 15발에 0 이 된다 — LOT-5)
  const run = miniRun(20, { z: row.z - row.armZ, x: 330 });
  const ev = [];
  assert.equal(updateGateArm(row, run, ev), true);
  for (let i = 0; i < 40; i++) hitGateCell(row, cell, bullet(330), ev);
  assert.equal(cell.value, -10, '유효탄 40발로도 −10 그대로');
  assert.equal(ev.filter((e) => e.type === 'gateFlip').length, 0, '0 으로 뒤집히지 않는다');
  assert.equal(ev.filter((e) => e.type === 'gateHit').length, 40, '탄은 흡수되고 피격 신호는 난다');
  //  통과하면 |value| 만큼 확정 손실
  run.prevZ = row.z - 1; run.z = row.z;
  passGateRow(row, run, ev);
  assert.equal(run.units.length, 10, '20 − 10 = 10');
  assert.equal(run.lossByGate, 10);
  assert.equal(run.badGatesPassed, 1);
});

test('V3-LOTTERY LOT-6b: 두 줄 모두(배수 1 · 기본 — r4.2 어려움 줄 삭제) — 우측(랜덤 길)을 고른 판은 확정 손실 10 이 나고 좌측보다 병력이 적다', (t) => {
  const rows = [];
  for (const difficulty of ['normal', 'brutal']) {
    const R = unitsAtWallEnd(SEED_OF.trapGate, 'R', difficulty);
    const L = unitsAtWallEnd(SEED_OF.trapGate, 'L', difficulty);
    assert.equal(R.lossByGate, 10, difficulty + ': 우측 선택은 확정 게이트로 정확히 10 을 잃는다');
    assert.equal(L.lossByGate, 0, difficulty + ': 좌측 선택은 이 행에 걸리지 않는다(bypass)');
    //  좌 통(병사 10) 과 확정 손실 10 이라 벽을 빠져나온 자리에서 차이가 20 쯤 난다
    assert.ok(L.units - R.units >= 15, difficulty + ': 좌 ' + L.units + ' vs 우 ' + R.units + ' — 꽝이 손해로 나타나야 한다');
    rows.push([difficulty, L.units, R.units, R.lossByGate].join('\t'));
    //  판 자체는 계속 완주 가능하다(꽝을 골라도 막히지 않는다)
    assert.equal(playRight(SEED_OF.trapGate, difficulty).run.won, true, difficulty + ': 꽝을 골라도 완주는 된다');
  }
  t.diagnostic('난이도\t좌(병사10)\t우(확정 −10)\t게이트 손실');
  for (const r of rows) t.diagnostic(r);
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-7 반대 통로 — skipped(놓침 아님) + 결과 공개 문구
// ─────────────────────────────────────────────────────────────────────────────
//  우측 노선(rightAtW3 / playRight)은 LOT-6b 위에 한 번만 정의해 두고 여기서도 그대로 쓴다

test('V3-LOTTERY LOT-7: 좌측 통로를 고르면 랜덤 길 통은 skipped(놓침 아님)이고 결과 한 줄이 이번 판 내용을 공개한다', () => {
  for (const id of ['soldier8', 'heavy', 'chain6']) {
    assert.ok(SEED_OF[id], id);   // 시드가 없으면 기본 시드로 폴백해 엉뚱한 판을 검사한다(LOT-2b 와 한 짝)
    const { run } = playPolicy(3, 'plan', 14400, 'normal', SEED_OF[id]);
    assert.equal(run.wallSideLog.w3, 'L', id + ': 계획 봇은 좌 통로');
    const s = run.supplies.find((c) => c.id === run.lottery.supplyId);
    assert.ok(s, id + ': 랜덤 길 통이 run 에 있다');
    assert.equal(s.skipped, true, id + ': 구조적으로 얻을 수 없던 대안 = skipped');
    assert.equal(s.missed, false, id + ': 실수가 아니므로 missed 가 아니다');
    assert.equal(supplyActive(s), false);
    assert.equal(lotteryLine(run), '오른쪽 랜덤 길은 이번 판엔 ' + run.lottery.label + ' 이었습니다');
  }
  //  꽝 2종도 안 고른 판에는 '이번 판엔 꽝'을 그대로 알린다(감추지 않는다)
  //   ⚠ 여기 id 는 **현행 풀의 꽝 2종**이어야 한다. 풀에서 빠진 id(옛 rusher4)를 적으면 SEED_OF[id] 가 undefined →
  //    기본 시드 폴백이라 badGate 판을 두 번 검사하고 trapGate 는 한 번도 보지 않는다(2026-09-17 검수 지적 1).
  const BAD_IDS = POOL.filter((p) => !p.good).map((p) => p.id);
  assert.deepEqual(BAD_IDS, ['badGate', 'trapGate'], '꽝 2종의 id');
  for (const id of BAD_IDS) {
    assert.ok(SEED_OF[id], id);
    const { run } = playPolicy(3, 'plan', 14400, 'normal', SEED_OF[id]);
    assert.equal(run.lottery.pick, id, id + ': 이 판의 추첨 결과가 그 꽝이어야 한다(기본 시드 폴백 금지)');
    assert.equal(run.lottery.good, false);
    assert.equal(run.wallSideLog.w3, 'L');
    assert.equal(lotteryLine(run), '오른쪽 랜덤 길은 이번 판엔 꽝(' + run.lottery.label + ')이었습니다');
  }
});

test('V3-LOTTERY LOT-7b: 우측 통로를 고르면 결과 한 줄이 실제 결과를 적는다', () => {
  const good = playRight(SEED_OF.soldier8);
  assert.equal(good.run.wallSideLog.w3, 'R');
  const s = good.run.supplies.find((c) => c.id === good.run.lottery.supplyId);
  assert.equal(s.opened, true, '병사 8 통(내구 14)을 열었다');
  assert.equal(lotteryLine(good.run), '랜덤 길: 병사 8 획득');
  //  좌 통(병사 10)은 그 판에서 구조적으로 불가 = skipped
  const leftCrate = good.run.supplies.find((c) => c.id === 'c9');
  assert.equal(leftCrate.skipped, true);
  assert.equal(leftCrate.missed, false);
  //  ⚠️−15 게이트를 0 까지 올려 통과한 판은 **손실이 0** 이다. 추첨 이름만 적으면 막아낸 것을 '꽝'이라고 전한다
  const bad = playRight(SEED_OF.badGate);
  assert.equal(bad.run.wallSideLog.w3, 'R');
  assert.equal(bad.run.lossByGate, 0, '쏴서 0 으로 만든 뒤 통과 = 실제 손실 0');
  assert.equal(lotteryLine(bad.run), '랜덤 길: 위험 게이트 무력화 · 손실 0');
  //  이미 중화기인 판이 중화기 통을 열면 r3.10 부터는 강화(Mk II)다 — '획득'도 '중복'도 아니라 '강화'로 적는다
  const hv = playRight(SEED_OF.heavy, 'normal', heavyThenRight);
  assert.equal(hv.run.weapon, 'heavy');
  assert.equal(hv.run.weaponMk, 2);
  assert.equal(lotteryLine(hv.run), '랜덤 길: 중화기 강화 · Mk II');
  //  만렙(III)이라 교체·강화 모두 없던 판은 '중복 · 교체 없음'(셸 opts.weaponSame 경로)
  assert.equal(lotteryLine(hv.run, { weaponSame: true }), '랜덤 길: 중화기 중복 · 교체 없음');
  //  랜덤 길이 없는 스테이지는 한 줄도 없다
  assert.equal(lotteryLine(createRun(buildStage(1))), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-11(2026-09-17 2차 검수 N4) — 결과 문구는 **추첨 종류의 이름이 아니라 실제 적용 결과**다.
//  근거: 같은 '−15 게이트'가 손실 0(무력화)로도, 손실 15 로도 끝난다. 이름만 적으면 잘한 판과 못한 판이 같은 문구가 된다.
// ─────────────────────────────────────────────────────────────────────────────
test('V3-LOTTERY LOT-11: 풀 5종 각각 실제 결과 문구가 나온다(무력화·함정 피해·발판 수·중복·획득)', (t) => {
  const rows = [];
  const seen = {};
  for (const id of POOL_IDS) {
    assert.ok(SEED_OF[id], id);
    const { run } = playRight(SEED_OF[id]);
    assert.equal(run.lottery.pick, id, id + ': 이 판의 추첨 결과(기본 시드 폴백 금지)');
    assert.equal(run.wallSideLog.w3, 'R', id + ': 우측 통로를 골랐다');
    const out = run.lotteryOutcome, line = lotteryLine(run);
    seen[id] = line;
    rows.push([id, line, out.applied, out.soldiers, out.pads + '/' + out.padsTotal, out.swapped].join('\t'));
  }
  //  ① 막을 수 있는 −15 게이트를 0 으로 만든 뒤 통과 → '손실 0'(이름이 아니라 결과)
  assert.equal(seen.badGate, '랜덤 길: 위험 게이트 무력화 · 손실 0');
  //  ② 확정 −10 은 쏴도 안 오르므로 실제 피해가 그대로 적힌다
  assert.equal(seen.trapGate, '랜덤 길: 함정 피해 −10명');
  //  ③ 연속 증원은 '밟은 발판 / 깔린 발판'
  assert.match(seen.chain6, /^랜덤 길: 증원 발판 \d+\/\d+개 확보$/);
  //  ④⑤ 병사·무기
  assert.equal(seen.soldier8, '랜덤 길: 병사 8 획득');
  assert.equal(seen.heavy, '랜덤 길: 중화기 획득');
  //  어느 문구도 '꽝'이라는 이름만 적고 끝내지 않는다
  for (const [id, line] of Object.entries(seen)) assert.ok(!/^랜덤 길: 꽝/.test(line), id + ': 이름만 적혀 있다 — ' + line);
  t.diagnostic('추첨\t결과 한 줄\t게이트 적용\t병사\t발판\t무기교체');
  for (const r of rows) t.diagnostic(r);
});

test('V3-LOTTERY LOT-11b: 집계는 규칙 계층의 기존 이벤트만 읽는다(랜덤 길 것만 골라 센다)', () => {
  const st = buildStage(3, { lotterySeed: SEED_OF.soldier8 });
  const run = createRun(st);
  const out = emptyLotteryOutcome();
  //  같은 종류의 이벤트라도 id 가 랜덤 길 것이 아니면 세지 않는다(c9 = 좌 통, g1 = 코스 게이트)
  collectLotteryOutcome(out, [
    { type: 'joinMany', id: 'c9', n: 10 },
    { type: 'gatePass', id: 'g1', value: -25, applied: -25 },
    { type: 'padTake', id: 'c9', idx: 0 },
  ], run);
  assert.deepEqual(out, emptyLotteryOutcome(), '다른 물체의 이벤트는 랜덤 길 결과가 아니다');
  collectLotteryOutcome(out, [{ type: 'joinMany', id: st.lottery.supplyId, n: 8 }], run);
  assert.equal(out.soldiers, 8);
  //  랜덤 길이 없는 판(S1·S2)은 집계 자체가 없다
  const none = createRun(buildStage(1));
  assert.equal(collectLotteryOutcome(null, [], none), null);
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-8 정적 — 규칙 STEP 안에 랜덤 길 분기가 없다(추첨은 buildStage 시점 한 번)
// ─────────────────────────────────────────────────────────────────────────────
test('V3-LOTTERY LOT-8: stepRun 이후 소스에 lottery 분기가 없다(V3-PURE 계열 정적 검사)', () => {
  const src = readFileSync(new URL('../rush3/combat.js', import.meta.url), 'utf8');
  const after = src.slice(src.indexOf('export function stepRun'));
  assert.ok(after.length > 0, 'stepRun 을 찾았다');
  assert.ok(!/lottery/i.test(after), 'stepRun 이후 소스에 lottery 참조가 없다');
  assert.ok(!/랜덤 길/.test(after), 'stepRun 이후 소스에 랜덤 길 주석/분기가 없다');
  //  규칙 모듈은 여전히 난수를 import 하지 않는다(추첨은 stages.js 안에서만)
  for (const f of ['combat.js', 'gates.js', 'supply.js', 'squad.js', 'weapons.js', 'advice.js']) {
    const s = readFileSync(new URL('../rush3/' + f, import.meta.url), 'utf8');
    assert.ok(!/Math\.random/.test(s), f + ' 에 Math.random 이 없다');
    assert.ok(!/from '\.\.\/rush\/rng\.js'/.test(s), f + ' 은 rng 를 import 하지 않는다');
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-9 봇 회귀 — 시드 5종에서 S3 완주가 유지되고 계획 봇 결과가 흔들리지 않는다
// ─────────────────────────────────────────────────────────────────────────────
test('V3-LOTTERY LOT-9: S3(normal) 시드 5종 — plan·aim 완주 유지, plan 은 좌측 선택·결과 불변, center 는 실패 유지', (t) => {
  const rows = [];
  let base = null;
  for (const id of POOL_IDS) {
    const seed = SEED_OF[id];
    const plan = playPolicy(3, 'plan', 14400, 'normal', seed);
    const aim = playPolicy(3, 'aim', 14400, 'normal', seed);
    const center = playPolicy(3, 'center', 14400, 'normal', seed);
    assert.equal(plan.run.won, true, id + ': 계획 봇 S3 완주 유지');
    assert.equal(aim.run.won, true, id + ': 탐욕 봇 S3 완주 유지');
    assert.equal(center.run.won, false, id + ': 무조작(center)은 종전대로 실패');
    assert.equal(plan.run.wallSideLog.w3, 'L', id + ': 계획 봇은 w3 에서 좌측(기존 결과 불변)');
    const pick = { survivors: plan.run.units.length, peak: plan.run.peak, weapon: plan.run.weapon, side: plan.run.wallSideLog.w3 };
    if (base === null) base = pick;
    else assert.deepEqual(pick, base, id + ': 계획 봇 결과는 랜덤 길과 무관하게 같다(좌측만 다닌다)');
    rows.push([id, plan.run.units.length, aim.run.units.length, aim.run.peak, center.run.peak].join('\t'));
  }
  t.diagnostic('pick\tplan생존\taim생존\taim최고\tcenter최고');
  for (const r of rows) t.diagnostic(r);
});

// ─────────────────────────────────────────────────────────────────────────────
// LOT-10 안내 문구 — w3 구간의 hint 가 '빈 길' 시절 문구로 남아 있지 않다
//  (배치 개정 때 hint 만 뒤처지면 화면이 표지·계약서와 반대로 안내한다. 결과 화면 제안 한 줄로 실제 출력된다)
// ─────────────────────────────────────────────────────────────────────────────
const STALE = /빈 길|아무것도 없|보상 ?0|안전하지만/;

test('V3-LOTTERY LOT-10: w3 구간 통·게이트 hint 에 빈 길 시절 표현이 없고, 좌 통은 오른쪽을 랜덤 길로 안내한다', () => {
  for (const seed of SEEDS.slice(0, 5)) {
    const st = buildStage(3, { lotterySeed: seed });
    const wall = st.walls[2];
    //  w3 통로 구간(확정선 앞 여유 포함)에 놓인 물체의 안내 문구만 본다 — S1 게이트의 '빈 길로 우회' 는 무관하다
    const near = [...st.supplies, ...st.gateRows].filter((o) => o.z >= wall.z0 - 600 && o.z <= wall.z1);
    //  좌 통 1개 + 랜덤 길이 얹은 통 또는 게이트 1개 = 항상 2개(풀 5종이 전부 통 아니면 게이트다)
    assert.equal(near.length, 2, 'w3 구간 물체: ' + near.length);
    for (const o of near) {
      if (!o.hint) continue;
      assert.ok(!STALE.test(o.hint), o.id + ' hint 가 빈 길 시절 문구다: ' + o.hint);
    }
    //  좌 통(c9)의 안내는 벽 표지 R = lottery 와 같은 말을 해야 한다
    assert.equal(wall.signs.R.kind, 'lottery');
    const left = st.supplies.find((s2) => s2.z === 6300 && s2.x === 150);
    assert.ok(/랜덤 길/.test(left.hint), '좌 통 hint 가 랜덤 길을 알리지 않는다: ' + left.hint);
  }
});

test('V3-LOTTERY LOT-10b: 좌 통을 못 연 판의 결과 제안 한 줄이 그 hint 를 그대로 내보낸다(문구가 죽은 데이터가 아니다)', () => {
  const st = buildStage(3, { lotterySeed: SEED_OF.badGate });
  const run = createRun(st);
  const left = run.supplies.find((s2) => s2.z === 6300 && s2.x === 150);
  left.missed = true;
  run.missedSupplies = 1;
  const line = adviceLine(run, run);
  assert.equal(line, left.hint, '2순위(놓친 통)로 좌 통 hint 가 출력된다');
  assert.ok(!STALE.test(line), '결과 화면에 빈 길 시절 문구가 나온다: ' + line);
  assert.ok(/랜덤 길/.test(line));
});

test('V3-LOTTERY LOT-6c: 뽑은 쪽(stage.lottery.trap)과 화면 판정(isTrapGateRow)이 확정 손실에서만 함께 참이다', () => {
  //  ⚠️풀의 '확정 손실' 정의는 한 가지다 — good:false 이면서 상한이 자기 값. 뽑는 쪽과 그리는 쪽이 다른 조건을 쓰면
  //   함정 외형이 엉뚱한 칸에 붙거나(또는 붙지 않고) 문구만 남는다. 여기서 두 판정을 같은 판에서 맞대어 본다.
  for (const id of POOL_IDS) {
    const st = stageFor(id);
    const entry = POOL.find((p) => p.id === id);
    const expected = entry.kind === 'gate' && !entry.good && entry.maxValue === entry.value;
    assert.equal(st.lottery.trap, expected, id + ': stage.lottery.trap');
    const row = lotRow(st);
    assert.equal(isTrapGateRow(row ?? null), expected, id + ': 화면 판정(isTrapGateRow)');
  }
  //  확정 손실은 trapGate 하나뿐이다(둘 다 참인 항목이 늘면 여기서 걸린다)
  assert.deepEqual(POOL_IDS.filter((id) => stageFor(id).lottery.trap), ['trapGate']);
});
