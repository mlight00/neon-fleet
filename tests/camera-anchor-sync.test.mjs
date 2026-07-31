import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCamera, screenToWorldX } from '../js/camera-zoom.js';

// RC1 §3: 입력 역변환이 '현재 프레임'의 함대 좌표(anchor)를 쓰는지 실제 input.js 배선으로 검증.
//  syncCameraAnchor()는 main.js 내부(브라우저 전용)라 import 불가 → 그 계약(anchor 갱신 후 tick)을 재현해 검증하고,
//  실제 호출 순서는 소스 배선 가드(AS-04)로 고정한다.
function mockEnv() {
  const canH = {}, winH = {};
  globalThis.window = { addEventListener: (t, h) => { (winH[t] ||= []).push(h); }, removeEventListener: () => {} };
  const canvas = {
    addEventListener: (t, h) => { (canH[t] ||= []).push(h); },
    getBoundingClientRect: () => ({ left: 0, width: 480 }),   // 브라우저px==논리px (logicalW=480)
    setPointerCapture: () => {},
  };
  return { canvas, canH, winH, fire: (map, t, e) => (map[t] || []).forEach((h) => h(e)) };
}
const { createInput } = await import('../js/input.js');

// 12. 현재 프레임 squad anchor로 screen→world 역변환
test('AS-01: 현재 프레임 함대 좌표로 역변환(직전 프레임 anchor 아님)', () => {
  const { canvas, canH, fire } = mockEnv();
  const cam = createCamera(1.50); cam.anchorX = 240;   // 직전 프레임 anchor
  const input = createInput(canvas, 480, { screenToWorldX: (x) => screenToWorldX(x, cam) });
  fire(canH, 'pointermove', { pointerType: 'mouse', clientX: 360 });
  // 이번 프레임: 함대가 300으로 이동 → syncCameraAnchor 등가로 tick 직전에 anchor 갱신
  cam.anchorX = 300;
  input.tick(1 / 60);
  const expected = 300 + (360 - 300) / 1.50;
  assert.ok(Math.abs(input.targetX - expected) < 0.01, `${input.targetX} vs ${expected}`);
});

// 13. 첫 전투 프레임에서 초기 anchor(0,0)를 사용하지 않음
test('AS-02: 첫 전투 프레임이 초기 anchor(0,0)를 쓰지 않음', () => {
  const { canvas, canH, fire } = mockEnv();
  const cam = createCamera(1.50);                       // anchorX 기본 0 (아직 그린 적 없음)
  const input = createInput(canvas, 480, { screenToWorldX: (x) => screenToWorldX(x, cam) });
  fire(canH, 'pointermove', { pointerType: 'mouse', clientX: 360 });
  cam.anchorX = 240;                                    // 첫 프레임 update의 syncCameraAnchor
  input.tick(1 / 60);
  const expectedSynced = 240 + (360 - 240) / 1.50;      // 332.31
  const wrongIfZero = 0 + (360 - 0) / 1.50;             // 276.92 (anchor 0일 때)
  assert.ok(Math.abs(input.targetX - expectedSynced) < 0.01, `synced ${input.targetX} vs ${expectedSynced}`);
  assert.ok(Math.abs(input.targetX - wrongIfZero) > 1, '확실히 (0,0) 기준이 아님');
});

// 14. 130%에서 빠른 좌우 이동 중 역변환 오차 ≤ 0.01
test('AS-03: 130% 빠른 좌우 이동 중 매 프레임 역변환 오차 ≤ 0.01', () => {
  const { canvas, canH, fire } = mockEnv();
  const cam = createCamera(1.50);
  const input = createInput(canvas, 480, { screenToWorldX: (x) => screenToWorldX(x, cam) });
  const mouseScreen = 360;
  fire(canH, 'pointermove', { pointerType: 'mouse', clientX: mouseScreen });   // 마우스 고정
  for (const squadX of [100, 250, 400, 120, 460, 60, 240]) {                    // 함대 급격한 좌우 이동
    cam.anchorX = squadX;                                                       // 매 프레임 tick 직전 동기화
    input.tick(1 / 60);
    const expected = Math.max(0, Math.min(480, squadX + (mouseScreen - squadX) / 1.50));
    assert.ok(Math.abs(input.targetX - expected) <= 0.01, `squadX=${squadX}: ${input.targetX} vs ${expected}`);
  }
});

// 배선 가드(정규식 아닌 실동작 12~14를 보완): 실제 호출 순서·가드를 소스로 고정
test('AS-04: main 배선 — update()의 input.tick 직전 sync, draw 재동기화, run/squad 가드', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /syncCameraAnchor\(\);[\s\S]{0,160}input\.tick\(dt\);/);                   // update: tick 직전(사이 rebuildChaseProjection 허용)
  assert.match(main, /const camActive = state === 'play'[\s\S]{0,140}syncCameraAnchor\(\);/);  // draw: 재동기화
  assert.match(main, /function syncCameraAnchor\(\) \{\s*\n\s*if \(state !== 'play' \|\| !run \|\| !run\.squad\) return;/);
});
