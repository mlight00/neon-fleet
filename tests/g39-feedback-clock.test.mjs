import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackClock } from '../js/feedback-clock.js';

test('G39-CLOCK-ADVANCE: 진행한 dt 만큼만 증가한다', () => {
  const c = createFeedbackClock();
  assert.equal(c.now(), 0);
  c.advance(0.05);
  assert.ok(Math.abs(c.now() - 0.05) < 1e-9, `실측 ${c.now()}`);
});

test('G39-CLOCK-PAUSE: advance 를 부르지 않으면 시간이 흐르지 않는다', () => {
  //  ⚠️main.js:3616 은 pause 중 update 만 건너뛰고 draw 는 계속 돈다.
  //   벽시계를 쓰면 정지 화면에서 플래시가 혼자 사라진다 — "멈췄다"는 약속을 깬다.
  const c = createFeedbackClock();
  c.advance(1.0);
  const t = c.now();
  for (let i = 0; i < 60; i++) { /* draw 만 도는 상황 */ }
  assert.equal(c.now(), t, 'draw 를 아무리 돌려도 불변');
  c.advance(0.016);
  assert.ok(c.now() > t, 'update 가 재개되면 다시 증가');
});

test('G39-CLOCK-GUARD: 비정상 dt 를 무시한다', () => {
  const c = createFeedbackClock();
  c.advance(0.1);
  const t = c.now();
  for (const bad of [NaN, undefined, null, -1, Infinity]) c.advance(bad);
  assert.equal(c.now(), t, `비정상 dt 로 시간이 변했다 — ${c.now()}`);
});

test('G39-CLOCK-RESET: 새 출격에서 0 으로 돌아간다', () => {
  const c = createFeedbackClock();
  c.advance(5);
  c.reset();
  assert.equal(c.now(), 0);
});
