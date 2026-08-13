// ── §G-39 — 피드백 전용 **게임 누적 시계** ─────────────────────────────────────────────
//
//  왜 벽시계가 아닌가:
//   `main.js:3616` 은 일시정지 중 `update()` 만 건너뛰고 `draw()` 는 계속 돈다.
//   벽시계(`performance.now()`·`frame(t)`)를 쓰면 정지 화면에서 플래시가 혼자 사라진다 —
//   "멈췄다"는 약속을 깬다. dt 누적이면 update 가 멈출 때 시간도 함께 멈춘다.
//
//  ⚠️`advance()` 는 반드시 **실제 update guard 안**에서 부른다.
//   `frame()` 상단에서 부르면 pause 중에도 rAF·dt 가 계속 와서 시간이 흐른다.

export function createFeedbackClock() {
  let t = 0;
  return {
    now() { return t; },
    advance(dt) { if (Number.isFinite(dt) && dt > 0) t += dt; },
    reset() { t = 0; },
  };
}
