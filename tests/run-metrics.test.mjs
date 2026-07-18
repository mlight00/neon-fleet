import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunMetrics, percentile } from '../js/run-metrics.js';

// Gate 1 §6.1 — 런 로그 계약 필드와 idempotency 검증.

test('스냅샷이 §6.1 필수 필드를 모두 포함한다', () => {
  const rm = createRunMetrics({ runId: 'r1', seed: 42 });
  const s = rm.snapshot(0);
  for (const k of ['runId', 'seed', 'durationSec', 'choiceTimes', 'behaviorUpgradeTimes',
    'secondWeaponSec', 'firstResonanceSec', 'hullTierTimes', 'framePickSec', 'bossStartSec',
    'bossEndSec', 'bossId', 'bossTtkSec', 'damageByWeapon', 'damageByResonance', 'hullDamageTaken',
    'hullRepairs', 'cruiserLosses', 'emergencyRebuilds', 'gameOverReason', 'fpsLowPercentile']) {
    assert.ok(k in s, `필드 ${k} 존재`);
  }
  assert.equal(s.seed, 42);
});

test('secondWeapon·firstResonance·framePick은 최초 1회만 기록(idempotent)', () => {
  const rm = createRunMetrics();
  rm.secondWeapon(75); rm.secondWeapon(120);
  rm.firstResonance(270); rm.firstResonance(300);
  rm.framePick(330); rm.framePick(400);
  const s = rm.snapshot();
  assert.equal(s.secondWeaponSec, 75);
  assert.equal(s.firstResonanceSec, 270);
  assert.equal(s.framePickSec, 330);
});

test('행동 변화 선택은 choiceTimes와 behaviorUpgradeTimes에 함께 쌓인다', () => {
  const rm = createRunMetrics();
  rm.choice(30, { behavior: true });
  rm.choice(50);                       // 수치 카드(행동 변화 아님)
  rm.choice(70, { behavior: true });
  const s = rm.snapshot();
  assert.deepEqual(s.choiceTimes, [30, 50, 70]);
  assert.deepEqual(s.behaviorUpgradeTimes, [30, 70]);
});

test('보스 TTK = bossEnd - bossStart, id 보존', () => {
  const rm = createRunMetrics();
  rm.bossStart(430, 'B22');
  rm.bossStart(500, 'B7');             // 두 번째 호출 무시
  rm.bossEnd(482);
  const s = rm.snapshot();
  assert.equal(s.bossId, 'B22');
  assert.equal(s.bossStartSec, 430);
  assert.equal(s.bossEndSec, 482);
  assert.equal(s.bossTtkSec, 52);
});

test('무기별·공명별 피해를 구분 집계하고 공명 기여도를 계산한다', () => {
  const rm = createRunMetrics();
  rm.weaponDamage('vulcan', 700);
  rm.weaponDamage('laser', 200);
  rm.weaponDamage('vulcan', 100);      // 누적
  rm.resonanceDamage('railStorm', 200);
  const s = rm.snapshot();
  assert.equal(s.damageByWeapon.vulcan, 800);
  assert.equal(s.damageByWeapon.laser, 200);
  assert.equal(s.damageByResonance.railStorm, 200);
  // 공명 기여도 = 200 / (1000 + 200) ≈ 0.167 → §6.2 통과 범위(0.08~0.30)
  assert.ok(s.resonanceShare > 0.08 && s.resonanceShare < 0.30, `공명비율 ${s.resonanceShare}`);
});

test('내구도 피해·수리·순양함 손실·긴급재건 카운트', () => {
  const rm = createRunMetrics();
  rm.hullDamage(8); rm.hullDamage(16);
  rm.hullRepair();
  rm.cruiserLoss(); rm.cruiserLoss(2);
  rm.emergencyRebuild();
  const s = rm.snapshot();
  assert.equal(s.hullDamageTaken, 24);
  assert.equal(s.hullRepairs, 1);
  assert.equal(s.cruiserLosses, 3);
  assert.equal(s.emergencyRebuilds, 1);
});

test('gameOver 사유·시간 기록, 최초 사유 고정', () => {
  const rm = createRunMetrics();
  rm.gameOver('hull', 512);
  rm.gameOver('quit', 999);            // 무시
  const s = rm.snapshot();
  assert.equal(s.gameOverReason, 'hull');
  assert.equal(s.durationSec, 512);
});

test('fpsLowPercentile은 저사양 체감(5백분위)을 반영한다', () => {
  const rm = createRunMetrics();
  for (const f of [60, 60, 58, 59, 30, 60, 61, 57, 60, 60]) rm.fpsSample(f);
  const s = rm.snapshot();
  assert.ok(s.fpsLowPercentile <= 40, `p5=${s.fpsLowPercentile} 는 저프레임을 잡아야 함`);
});

test('percentile 순수 함수: 빈 배열 null, 경계 안전', () => {
  assert.equal(percentile([], 5), null);
  assert.equal(percentile([10], 5), 10);
  assert.equal(percentile([1, 2, 3, 4, 5], 100), 5);
});
