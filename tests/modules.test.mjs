import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMfx, draftOptions, moduleSummary, MODULE_DEFS, MODULE_BY_ID } from '../js/modules.js';

// 간단 시드 난수 (테스트용)
function lcg(seed) {
  let a = seed >>> 0;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
}

test('computeMfx: 모듈 없으면 전부 중립', () => {
  const m = computeMfx([]);
  assert.equal(m.dmgMult, 1);
  assert.equal(m.fireRateMult, 1);
  assert.equal(m.pierceBonus, 0);
  assert.equal(m.bossDmgMult, 1);
  assert.equal(m.evolveCostMult, 1);
  assert.equal(m.swarmPerDrone, 0);
  assert.equal(m.shieldRegen, 0);
});

test('computeMfx: 스택은 곱/합으로 누적', () => {
  assert.ok(Math.abs(computeMfx(['dmg', 'dmg']).dmgMult - 1.1664) < 1e-9);   // 1.08^2
  assert.equal(computeMfx(['pierce', 'pierce', 'pierce']).pierceBonus, 3);
  assert.ok(Math.abs(computeMfx(['boss']).bossDmgMult - 1.10) < 1e-9);
  assert.ok(Math.abs(computeMfx(['swarm', 'swarm']).swarmPerDrone - 0.24) < 1e-9);
  assert.ok(Math.abs(computeMfx(['evolve']).evolveCostMult - 0.85) < 1e-9);
  assert.ok(Math.abs(computeMfx(['shieldregen', 'shieldregen']).shieldRegen - 6.3) < 1e-9); // 9 * 0.7
});

test('computeMfx: 폭발/치명/보상 누적', () => {
  const m = computeMfx(['explode', 'crit', 'crit', 'harvest']);
  assert.ok(m.explodeRadius > 0 && m.explodeDmgFrac > 0);
  assert.ok(Math.abs(m.crit - 0.10) < 1e-9);
  assert.ok(Math.abs(m.podRewardMult - 1.3) < 1e-9);
});

test('draftOptions: 서로 다른 3장', () => {
  const rng = lcg(12345);
  for (let i = 0; i < 30; i++) {
    const opts = draftOptions([], rng, 3);
    assert.equal(opts.length, 3);
    assert.equal(new Set(opts).size, 3, '중복 없음');
    for (const id of opts) assert.ok(MODULE_BY_ID[id], `유효 id ${id}`);
  }
});

test('draftOptions: 만렙 모듈은 후보에서 제외', () => {
  const maxedDmg = Array(MODULE_BY_ID.dmg.max).fill('dmg');
  const rng = lcg(999);
  for (let i = 0; i < 50; i++) {
    const opts = draftOptions(maxedDmg, rng, 3);
    assert.ok(!opts.includes('dmg'), 'dmg는 만렙이라 제외');
  }
});

test('draftOptions: 남은 모듈이 요청보다 적으면 그만큼만', () => {
  // 마지막 2종만 남기고 전부 만렙
  const picks = [];
  for (const m of MODULE_DEFS.slice(0, MODULE_DEFS.length - 2)) {
    for (let i = 0; i < m.max; i++) picks.push(m.id);
  }
  const opts = draftOptions(picks, lcg(7), 3);
  assert.equal(opts.length, 2);
  assert.equal(new Set(opts).size, 2);
});

test('moduleSummary: 스택 수 집계 (정의 순서)', () => {
  const s = moduleSummary(['pierce', 'dmg', 'dmg']);
  assert.deepEqual(s.map((x) => [x.id, x.count]), [['dmg', 2], ['pierce', 1]]);
});
