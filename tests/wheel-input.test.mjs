import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeWheelDelta,
  createWheelStepAccumulator,
  resolveWheelZoom,
  LINE_HEIGHT_PX,
  DEFAULT_THRESHOLD_PX,
} from '../js/wheel-input.js';

// RC1 §2·§4: 가로 휠 오인·정밀 터치패드 과민을 실제 이벤트 형태 객체로 검증(소스 정규식 아님).
//  부호 규약: 휠 위(deltaY<0)=확대(+1), 아래(deltaY>0)=축소(-1).
const ev = (o) => ({ deltaX: 0, deltaY: 0, deltaMode: 0, ctrlKey: false, metaKey: false, ...o });
const zoomCtx = (acc, extra = {}) => ({ canZoom: true, accumulator: acc, now: 0, viewportHeight: 800, ...extra });

// 1. deltaY=0 수평 휠 → 줌 변화 0, preventDefault 0
test('WI-01: deltaY=0 수평 휠 → step 0, preventDefault 안 함', () => {
  const r = resolveWheelZoom(ev({ deltaX: 40, deltaY: 0 }), zoomCtx(createWheelStepAccumulator()));
  assert.equal(r.step, 0);
  assert.equal(r.preventDefault, false);
});

// 2. abs(deltaX) >= abs(deltaY) → 줌 변화 0, preventDefault 0
test('WI-02: 수평 우세(|dx|>=|dy|) → step 0, preventDefault 안 함', () => {
  for (const [dx, dy] of [[40, 10], [40, -40], [5, -5]]) {
    const r = resolveWheelZoom(ev({ deltaX: dx, deltaY: dy }), zoomCtx(createWheelStepAccumulator()));
    assert.equal(r.step, 0, `dx=${dx},dy=${dy}`);
    assert.equal(r.preventDefault, false, `dx=${dx},dy=${dy} preventDefault`);
  }
});

// 3. deltaY=-1 × 6 → 줌 변화 0 (정밀 터치패드 과민 방지). 수직이므로 페이지 스크롤은 차단(preventDefault=true).
test('WI-03: deltaY=-1 × 6회 → 배율 변화 0 (임계 미도달)', () => {
  const acc = createWheelStepAccumulator();
  let steps = 0;
  for (let i = 0; i < 6; i++) {
    const r = resolveWheelZoom(ev({ deltaY: -1 }), zoomCtx(acc, { now: i * 10 }));
    steps += r.step;
    assert.equal(r.preventDefault, true, '유효 수직 입력이면 페이지 스크롤 차단');
  }
  assert.equal(steps, 0, '작은 6이벤트 합(-6px)은 임계(60px) 미만');
});

// 4. 누적값이 임계값을 넘으면 +5% 정확히 1회
test('WI-04: 누적 임계 초과 시 +1 정확히 1회', () => {
  const acc = createWheelStepAccumulator();               // threshold 60px
  assert.equal(resolveWheelZoom(ev({ deltaY: -20 }), zoomCtx(acc, { now: 0 })).step, 0);   // -20
  assert.equal(resolveWheelZoom(ev({ deltaY: -20 }), zoomCtx(acc, { now: 10 })).step, 0);  // -40
  assert.equal(resolveWheelZoom(ev({ deltaY: -20 }), zoomCtx(acc, { now: 20 })).step, 1);  // -60 → +1
  assert.equal(acc.residual, 0, '단계 발생 후 잔여 0으로 초기화');
});

// 5. 전통 휠 deltaY=-100 → +5% 정확히 1회
test('WI-05: 전통 휠 deltaY=-100 → +1 한 번', () => {
  const acc = createWheelStepAccumulator();
  const r = resolveWheelZoom(ev({ deltaY: -100 }), zoomCtx(acc));
  assert.equal(r.step, 1);
  assert.equal(r.preventDefault, true);
  // 아래로 한 칸은 -1
  assert.equal(resolveWheelZoom(ev({ deltaY: 100 }), zoomCtx(createWheelStepAccumulator())).step, -1);
});

// 6. 한 이벤트에서 최대 한 단계
test('WI-06: 한 이벤트 최대 한 단계(deltaY=-1000이어도 +1, 잔여 0)', () => {
  const acc = createWheelStepAccumulator();
  const r = resolveWheelZoom(ev({ deltaY: -1000 }), zoomCtx(acc));
  assert.equal(r.step, 1, '여러 단계로 튀지 않음');
  assert.equal(acc.residual, 0, '초과분은 버려 다음 이벤트로 이월 안 됨');
});

// 7. 방향 전환 시 잔여 누적 초기화
test('WI-07: 방향 전환 시 잔여 초기화', () => {
  const acc = createWheelStepAccumulator();
  assert.equal(resolveWheelZoom(ev({ deltaY: -40 }), zoomCtx(acc, { now: 0 })).step, 0);   // acc=-40
  const r = resolveWheelZoom(ev({ deltaY: 40 }), zoomCtx(acc, { now: 10 }));                // 방향 전환
  assert.equal(r.step, 0);
  assert.equal(acc.residual, 40, '이전 -40 폐기 후 +40만 남음(합산 0이 아님)');
});

// 8. idle 시간 초과 시 잔여 누적 초기화
test('WI-08: idle 초과 시 잔여 초기화(스퓨리어스 단계 방지)', () => {
  const acc = createWheelStepAccumulator();               // idleReset 200ms
  assert.equal(resolveWheelZoom(ev({ deltaY: -40 }), zoomCtx(acc, { now: 0 })).step, 0);    // acc=-40
  // 300ms 뒤 같은 -40: idle 초과로 잔여 폐기 → 누적 -40뿐이라 단계 없음(폐기 없으면 -80으로 +1이 됐을 것)
  const r = resolveWheelZoom(ev({ deltaY: -40 }), zoomCtx(acc, { now: 300 }));
  assert.equal(r.step, 0, 'idle 리셋으로 오래된 -40이 합산되지 않아 단계 미발생');
  assert.equal(acc.residual, -40);
});

// 9. deltaMode 0/1/2 정규화
test('WI-09: deltaMode 0/1/2 픽셀 정규화', () => {
  assert.equal(normalizeWheelDelta({ deltaY: 50, deltaMode: 0 }).deltaY, 50);              // PIXEL 그대로
  assert.equal(normalizeWheelDelta({ deltaY: 3, deltaMode: 1 }).deltaY, 3 * LINE_HEIGHT_PX); // LINE → px (99)
  assert.equal(normalizeWheelDelta({ deltaY: 2, deltaMode: 2 }, 500).deltaY, 1000);         // PAGE → viewportHeight×2
  // LINE 한 칸(3줄=99px)은 전통 픽셀 한 칸(100px)과 비슷 → 임계 초과로 한 단계
  const acc = createWheelStepAccumulator();
  assert.equal(resolveWheelZoom({ deltaX: 0, deltaY: -3, deltaMode: 1 }, zoomCtx(acc)).step, 1);
});

// 10. Ctrl/Cmd+휠 → 줌 변화 0, preventDefault 0 (브라우저 확대 보존)
test('WI-10: Ctrl/Cmd+휠 → step 0, preventDefault 안 함', () => {
  const ctrl = resolveWheelZoom(ev({ deltaY: -100, ctrlKey: true }), zoomCtx(createWheelStepAccumulator()));
  assert.deepEqual(ctrl, { step: 0, preventDefault: false });
  const meta = resolveWheelZoom(ev({ deltaY: -100, metaKey: true }), zoomCtx(createWheelStepAccumulator()));
  assert.deepEqual(meta, { step: 0, preventDefault: false });
});

// 11. 전투 밖·일시정지·드래프트·결과 화면 → 줌 변화 0
test('WI-11: canZoom=false(전투 밖/오버레이) → step 0, preventDefault 안 함', () => {
  const r = resolveWheelZoom(ev({ deltaY: -100 }), zoomCtx(createWheelStepAccumulator(), { canZoom: false }));
  assert.deepEqual(r, { step: 0, preventDefault: false });
});

// 보강: 임계·상수 방어(회귀 시 조기 경보)
test('WI-th: 기본 임계 50~70px, 줄높이 양수', () => {
  assert.ok(DEFAULT_THRESHOLD_PX >= 50 && DEFAULT_THRESHOLD_PX <= 70, `threshold=${DEFAULT_THRESHOLD_PX}`);
  assert.ok(LINE_HEIGHT_PX > 0);
});
