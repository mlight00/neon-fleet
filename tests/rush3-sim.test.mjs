// rush3-sim — 봇으로 기준 전투 3개를 실제 stepRun 으로 완주한다(계약서 8장 V3-SIM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage, STAGE_IDS } from '../rush3/stages.js';

// 봇: 가장 가까운(z 최소) 미개봉 통 / 미회수 발판 / 미통과 게이트의 최대값 칸(음수·bypass 면 빈 길) 차선으로 pointerX
function botX(run) {
  let best = null, bz = Infinity;
  for (const s of run.supplies) {
    if (s.missed) continue;
    for (const p of s.pads) if (!p.taken && p.z > run.z && p.z < bz) { bz = p.z; best = p.x; }
    if ((s.opened && s.kind !== 'chain') || s.locked) continue;
    if (s.z > run.z && s.z < bz) { bz = s.z; best = s.x; }
  }
  for (const row of run.gateRows) {
    if (row.passed || row.z <= run.z || row.z >= bz) continue;
    let c = null;
    for (const k of row.cells) if (!c || k.value > c.value) c = k;
    bz = row.z;
    best = c.value < 0 && row.bypass ? (c.x0 === 80 ? 320 : 160) : (c.x0 + c.x1) / 2;
  }
  return best;
}

function playStage(id, pick, maxSteps = 7000) {
  const run = createRun(buildStage(id));
  const stats = { steps: 0, bossKillStep: -1, wonStep: -1, events: {} };
  while (!run.over && stats.steps < maxSteps) {
    stepRun(run, { pointerX: pick(run), dragDx: 0, keyDir: 0 }, STEP);
    for (const e of drainEvents(run)) {
      stats.events[e.type] = (stats.events[e.type] || 0) + 1;
      if (e.type === 'bossKill') stats.bossKillStep = stats.steps;
    }
    if (run.won && stats.wonStep < 0) stats.wonStep = stats.steps;
    stats.steps++;
  }
  return { run, stats };
}

for (const id of STAGE_IDS) {
  test(`V3-SIM: 봇이 S${id} 를 완주한다(정예 격파 → won, 120초 안)`, () => {
    const { run, stats } = playStage(id, botX);
    assert.equal(run.won, true, `S${id} 미완주: over=${run.over} units=${run.units.length} z=${run.z.toFixed(0)} t=${run.time.toFixed(1)}`);
    assert.ok(run.time < 120);
    assert.ok(stats.events.elite === 1 && stats.events.bossKill === 1);
    assert.equal(stats.wonStep, stats.bossKillStep, '정예 격파 후 1 STEP 안 won');
    assert.ok(run.peak > run.units.length - 1 && run.peak >= 2);
    assert.equal(run.enemies.length, 0);
  });
}

test('V3-SIM: 무조작 봇(x 240 고정)이 S1 을 완주한다', () => {
  const { run, stats } = playStage(1, () => 240);
  assert.equal(run.won, true, `무조작 S1 미완주: units=${run.units.length} z=${run.z.toFixed(0)}`);
  assert.equal(run.x, 240);
  assert.equal(stats.wonStep, stats.bossKillStep);
  // 좌 −6 게이트는 우회(빈 길), 통 두 개(x 150/330)는 놓친다
  assert.equal(run.badGatesPassed, 0);
  assert.equal(run.missedSupplies, 2);
});

test('V3-SIM: 같은 입력열이면 두 판의 최종 상태가 같다(결정성)', () => {
  const a = playStage(2, botX), b = playStage(2, botX);
  const pick = (r) => ({ z: r.z, x: r.x, units: r.units.map((u) => [u.id, u.hp, u.dx, u.dy]), kills: r.kills, time: r.time, weapon: r.weapon, peak: r.peak });
  assert.deepEqual(pick(a.run), pick(b.run));
  assert.deepEqual(a.stats, b.stats);
});
