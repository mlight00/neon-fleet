// rush3-gatefixed — r3.30 확정 칸 통과(이사 지시 2026-09-23 "파괴되어서 수치가 확정된 게이트는 총알을 통과시키자") V3-GATE-FIXED.
//  확정 칸 = 셔터가 열려 있고(armed) 값이 상한(maxValue)에 닿은 칸. 더 쏴도 오르지 않으므로 탄을 흡수하지 않고 통과시켜
//  뒤의 적을 맞히게 한다. 닫힌 셔터는 여전히 흡수(함정 칸도 열리기 전에는 막는다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGateRow, isGateCellFixed } from '../rush3/gates.js';
import { createRun, stepRun, STEP } from '../rush3/combat.js';

const NO = { pointerX: null, dragDx: 0, keyDir: 0 };

//  게이트 한 줄(칸 1개, x 80~400) + 그 바로 뒤 잡졸 1마리. 부대는 x 240 에서 위로 쏜다
function scene({ value, maxValue, armZ = null }) {
  const stage = { id: 97, version: 1, title: 'T', length: 20000, eliteZ: 19000, startUnits: 1, startWeapon: 'rifle',
                  gateRows: [{ id: 'g1', z: 900, armZ, cells: [{ x0: 80, x1: 400, value, maxValue }] }],
                  supplies: [], walls: [], spawns: [], elite: { z: 19000, hp: 10, summon: false } };
  const run = createRun(stage);
  run.enemies.push({ id: 500, kind: 'grunt', x: 240, z: 1000, px: 240, pz: 1000, vz: 0, hp: 999, hpMax: 999, r: 14, dead: false, touched: false });
  return run;
}
function stepN(run, n) {
  const ev = [];
  for (let i = 0; i < n && !run.over; i++) { stepRun(run, NO, STEP); ev.push(...run.events); run.events.length = 0; }
  return ev;
}

test('V3-GATE-FIXED 판정: 열린 셔터 + 값이 상한이면 확정 칸, 그 밖은 아니다', () => {
  const open = makeGateRow({ id: 'a', z: 100, armZ: null, cells: [{ x0: 80, x1: 400, value: 15, maxValue: 15 }] });
  assert.equal(isGateCellFixed(open, open.cells[0]), true);
  const below = makeGateRow({ id: 'b', z: 100, armZ: null, cells: [{ x0: 80, x1: 400, value: 14, maxValue: 15 }] });
  assert.equal(isGateCellFixed(below, below.cells[0]), false, '상한 아래는 아직 오른다');
  const shut = makeGateRow({ id: 'c', z: 100, armZ: 340, cells: [{ x0: 80, x1: 400, value: -10, maxValue: -10 }] });
  assert.equal(shut.armed, false);
  assert.equal(isGateCellFixed(shut, shut.cells[0]), false, '닫힌 셔터는 확정 칸이 아니다(흡수)');
});

test('V3-GATE-FIXED 통과: 확정 칸에 닿는 탄은 흡수되지 않고 뒤의 적을 맞힌다, 칸 값은 그대로', () => {
  const run = scene({ value: 8, maxValue: 8 });
  const ev = stepN(run, 240);
  assert.equal(ev.filter((e) => e.type === 'gateHit' || e.type === 'gateFlip').length, 0, '칸이 탄을 받지 않는다');
  assert.ok(ev.filter((e) => e.type === 'enemyHit' && e.id === 500).length > 0, '뒤의 적이 맞는다');
  assert.equal(run.gateRows[0].cells[0].value, 8, '값은 그대로');
});

test('V3-GATE-FIXED 대조: 상한 아래인 칸은 종전대로 흡수하며 값이 오르고, 상한에 닿은 뒤부터 통과한다', () => {
  const run = scene({ value: 5, maxValue: 7 });
  const ev = stepN(run, 240);
  const hits = ev.filter((e) => e.type === 'gateHit' || e.type === 'gateFlip');
  assert.equal(hits.length, 2, '5 → 7 까지 두 발만 흡수');
  assert.equal(run.gateRows[0].cells[0].value, 7);
  assert.ok(ev.filter((e) => e.type === 'enemyHit' && e.id === 500).length > 0, '상한 뒤 탄은 적에게 간다');
});

test('V3-GATE-FIXED 셔터: 값이 상한이어도 셔터가 닫혀 있으면 흡수(gateBlock) — 뒤의 적은 맞지 않는다', () => {
  const run = scene({ value: -10, maxValue: -10, armZ: 100 });   // 게이트 z 900 이라 한참 동안 닫혀 있다
  const ev = stepN(run, 120);
  assert.ok(ev.filter((e) => e.type === 'gateBlock').length > 0, '닫힌 셔터가 막는다');
  assert.equal(ev.filter((e) => e.type === 'enemyHit' && e.id === 500).length, 0, '뒤의 적은 맞지 않는다');
});
