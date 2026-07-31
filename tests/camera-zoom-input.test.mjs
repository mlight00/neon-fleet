import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCamera, screenToWorldX } from '../js/camera-zoom.js';

// P0-3/§6: 입력 좌표 역변환. canvas/window를 모킹해 실제 input.js 배선을 검증한다.
//  s2w 콜백 = screenToWorldX(x, camera) — input이 카메라 모듈을 직접 import하지 않는다.

function mockEnv() {
  const canH = {}, winH = {};
  globalThis.window = { addEventListener: (t, h) => { (winH[t] ||= []).push(h); }, removeEventListener: () => {} };
  const canvas = {
    addEventListener: (t, h) => { (canH[t] ||= []).push(h); },
    getBoundingClientRect: () => ({ left: 0, width: 480 }),   // 브라우저px==논리px 로 단순화(logicalW=480)
    setPointerCapture: () => {},
  };
  return { canvas, canH, winH, fire: (map, t, e) => (map[t] || []).forEach((h) => h(e)) };
}
const { createInput } = await import('../js/input.js');

test('CI-01: zoom=1 → targetX = 화면 X (기존 동작 불변)', () => {
  const { canvas, canH, fire } = mockEnv();
  const cam = createCamera(1.0); cam.anchorX = 240;
  const input = createInput(canvas, 480, { screenToWorldX: (x) => screenToWorldX(x, cam) });
  fire(canH, 'pointermove', { pointerType: 'mouse', clientX: 360 });
  assert.ok(Math.abs(input.targetX - 360) < 0.01, `${input.targetX}`);
});

test('CI-02: 100/140/180/220%에서 마우스 논리 X 정확도 (anchor=240)', () => {
  for (const zoom of [1.0, 1.4, 1.8, 2.2]) {
    const { canvas, canH, fire } = mockEnv();
    const cam = createCamera(zoom); cam.anchorX = 240;
    const input = createInput(canvas, 480, { screenToWorldX: (x) => screenToWorldX(x, cam) });
    const mouseScreen = 360;
    fire(canH, 'pointermove', { pointerType: 'mouse', clientX: mouseScreen });
    const expected = Math.max(0, Math.min(480, 240 + (mouseScreen - 240) / cam.current));
    assert.ok(Math.abs(input.targetX - expected) < 0.01, `zoom ${cam.current}: ${input.targetX} vs ${expected}`);
  }
});

test('CI-03: 월드 X 범위로 clamp (85% 축소로 화면 밖 매핑돼도 0~logicalW)', () => {
  const { canvas, canH, fire } = mockEnv();
  const cam = createCamera(0.85); cam.anchorX = 60;   // anchor가 왼쪽 → 오른쪽 끝 마우스가 월드 480 초과 시도
  const input = createInput(canvas, 480, { screenToWorldX: (x) => screenToWorldX(x, cam) });
  fire(canH, 'pointermove', { pointerType: 'mouse', clientX: 480 });
  assert.ok(input.targetX >= 0 && input.targetX <= 480, `clamp ${input.targetX}`);
});

test('CI-04: 카메라 보간 중 정지된 마우스 목표 재계산 (§6.5·§6.6 튀지 않음)', () => {
  const { canvas, canH, fire } = mockEnv();
  const cam = createCamera(1.0); cam.anchorX = 240;
  const input = createInput(canvas, 480, { screenToWorldX: (x) => screenToWorldX(x, cam) });
  fire(canH, 'pointermove', { pointerType: 'mouse', clientX: 360 });   // 마우스 고정
  const at1 = input.targetX;
  cam.current = 1.50;                                                   // 줌만 변함(마우스 정지)
  input.tick(1 / 60);                                                  // 매 프레임 재계산
  const expected = 240 + (360 - 240) / 1.50;
  assert.ok(Math.abs(input.targetX - expected) < 0.01, `재계산 ${input.targetX} vs ${expected}`);
  assert.ok(Math.abs(input.targetX - at1) > 1, '줌 변화가 목표에 반영됨(정합 유지)');
});

test('CI-05: 키보드 이동은 기존 속도·경계 그대로 (마우스 재계산에 안 덮임)', () => {
  const { canvas, canH, winH, fire } = mockEnv();
  const cam = createCamera(1.50); cam.anchorX = 240;
  const input = createInput(canvas, 480, { screenToWorldX: (x) => screenToWorldX(x, cam) });
  fire(canH, 'pointermove', { pointerType: 'mouse', clientX: 100 });   // 마우스로 한 번 이동
  fire(winH, 'keydown', { key: 'ArrowRight', repeat: false, code: 'ArrowRight' });  // 이후 키보드
  const before = input.targetX;
  input.tick(1 / 60);
  assert.ok(input.targetX > before, '오른쪽 키 → 증가');
  assert.ok(Math.abs((input.targetX - before) - 420 / 60) < 1e-6, 'KEY_SPEED(420)·dt 그대로');
});

test('CI-06: 터치 드래그도 확대 배율 역변환(§6.8), 기존 조작 유지', () => {
  const { canvas, canH, fire } = mockEnv();
  const cam = createCamera(1.50); cam.anchorX = 240;
  const input = createInput(canvas, 480, { screenToWorldX: (x) => screenToWorldX(x, cam) });
  fire(canH, 'pointerdown', { pointerType: 'touch', clientX: 360, pointerId: 1 });
  const expected = 240 + (360 - 240) / 1.50;
  assert.ok(Math.abs(input.targetX - expected) < 0.01, `터치 ${input.targetX} vs ${expected}`);
  assert.equal(input.active, true);
});

test('CI-07: 콜백 미주입이면 항등(줌 미적용 = 기존 동작)', () => {
  const { canvas, canH, fire } = mockEnv();
  const input = createInput(canvas, 480);   // opts 없음
  fire(canH, 'pointermove', { pointerType: 'mouse', clientX: 300 });
  assert.ok(Math.abs(input.targetX - 300) < 0.01);
});
