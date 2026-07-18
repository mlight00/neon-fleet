import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createRunDirector, tickDirector, elapsed, nextEvent, timeToNextBehavior,
  isRunComplete, behaviorUpgradeSchedule,
} from '../js/run-director.js';
import { BAL } from '../js/balance.js';

const T = BAL.gate1.timeline;

/** paused=false로 총 secs초를 step초씩 진행하며 모든 발화 사건을 모은다. */
function run(dir, secs, step = 0.5) {
  const all = [];
  for (let t = 0; t < secs; t += step) all.push(...tickDirector(dir, step).events);
  return all;
}

// Gate 1 §5.1/5.2 / §6.4 — 8분 디렉터 사건 순서·시간정지 검증.

test('명시 사건이 계약 시각(±허용) 순서대로 1회씩 발화한다', () => {
  const dir = createRunDirector(T);
  const evs = run(dir, T.resultAt + 5);
  const firstOf = (type) => evs.find((e) => e.type === type);
  assert.ok(firstOf('secondWeapon').t >= T.secondWeapon && firstOf('secondWeapon').t <= T.secondWeapon + 1);
  assert.ok(firstOf('firstResonance').t >= T.firstResonance && firstOf('firstResonance').t <= T.firstResonance + 1);
  assert.ok(firstOf('framePick').t >= T.framePick);
  assert.ok(firstOf('bossStart').t >= T.bossStart);
  assert.ok(firstOf('result').t >= T.resultAt);
  // 순서: secondWeapon < firstResonance < framePick < bossStart < result
  const order = ['secondWeapon', 'firstResonance', 'framePick', 'bossStart', 'result'].map((t) => firstOf(t).t);
  for (let i = 1; i < order.length; i++) assert.ok(order[i] >= order[i - 1], '사건 순서');
});

test('각 명시 사건은 한 번만 발화한다(중복 없음)', () => {
  const dir = createRunDirector(T);
  const evs = run(dir, T.resultAt + 30);
  for (const type of ['secondWeapon', 'firstResonance', 'framePick', 'bossStart', 'result']) {
    assert.equal(evs.filter((e) => e.type === type).length, 1, `${type} 1회`);
  }
});

test('일시정지·선택 중에는 런 시간이 흐르지 않는다(§5.2)', () => {
  const dir = createRunDirector(T);
  for (let i = 0; i < 200; i++) tickDirector(dir, 0.5, true);   // 100초 분량을 paused로
  assert.equal(elapsed(dir), 0);
  assert.equal(nextEvent(dir).type, 'behaviorUpgrade');         // 아직 아무 것도 발화 안 함
});

test('행동 변화 간격: 중앙값 30~50초, 75초 이상 공백 0회(§6.2)', () => {
  const dir = createRunDirector(T);
  run(dir, T.resultAt + 5);
  const times = behaviorUpgradeSchedule(dir);
  assert.ok(times.length >= 5);
  const gaps = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  gaps.sort((a, b) => a - b);
  const median = gaps[Math.floor(gaps.length / 2)];
  assert.ok(median >= 30 && median <= 50, `중앙값 ${median}`);
  assert.ok(Math.max(...gaps) < 75, `최대 공백 ${Math.max(...gaps)}`);
  assert.ok(times[0] <= 45, `첫 행동 변화 ${times[0]} (25~45)`);
});

test('nextEvent / timeToNextBehavior 카운트다운', () => {
  const dir = createRunDirector(T);
  run(dir, 20);   // 20초 경과(첫 사건 30초 전)
  const nx = nextEvent(dir);
  assert.ok(nx.inSec > 0 && nx.inSec <= T.firstBehaviorUpgrade);
  assert.ok(timeToNextBehavior(dir) > 0);
});

test('result 사건 발화 시 런 완료로 표시', () => {
  const dir = createRunDirector(T);
  assert.equal(isRunComplete(dir), false);
  run(dir, T.resultAt + 2);
  assert.equal(isRunComplete(dir), true);
});
