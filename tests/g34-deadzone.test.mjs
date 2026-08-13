// ── §G-34 §5 (P0-2) — 데드존 카메라 + 카메라 중심 가로식 ──
//  이사님 아이디어: "기함이 좌/우 경계를 넘어가면 그쪽 가려졌던 영역이 점진적으로 보이게 하자."
//  구현 계약:
//   ① 데드존 **안** — 카메라 고정. 기함이 화면에서 1:1로 움직인다(조종감).
//   ② 데드존 **밖** — 카메라가 넘어간 만큼만 따라간다 → 그쪽 영역이 드러난다.
//   ③ 렌더와 역변환이 **같은 affine** 을 쓴다(§4-1 의 가로 버전).
//   ④ 경계에서 떨지 않는다(히스테리시스) · 프레임률과 무관하다(dt 기반 감쇠) · 월드 밖을 비추지 않는다.
//  ⚠️전부 제품 함수를 실행해 검증한다(수식 복제 금지).
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createChaseCameraState, updateChaseCameraX, visibleHalfWorld, deadZoneHalf,
  createChaseProjection, projectObject, screenToWorldXAtPlayer, PROJECTION,
} from '../js/chase-camera.js';

const LW = 480, LH = 800, SQY = 670;
const mk = (squadX, cameraWorldX, zoom = 2.2) =>
  createChaseProjection({ logicalW: LW, logicalH: LH, zoom, chaseBlend: 1, squadX, squadY: SQY, cameraWorldX });

test('G34-DEADZONE-FOLLOW: 데드존을 넘으면 빠르게 따라간다(그쪽 영역이 드러난다)', () => {
  const st = createChaseCameraState(240);
  const o = { deadHalf: 60, hysteresis: 6, tau: 0.12, tauRecenter: 0.9 };
  updateChaseCameraX(st, 400, 1 / 60, o);
  assert.ok(st.active, '데드존 밖 → 추종 시작');
  const fast = st.x - 240;
  //  같은 한 프레임을 데드존 **안** 조건으로 돌리면 훨씬 덜 움직인다 — 속도가 실제로 갈린다.
  const st2 = createChaseCameraState(240);
  updateChaseCameraX(st2, 400, 1 / 60, { ...o, deadHalf: 400 });
  const slow = st2.x - 240;
  assert.ok(fast > slow * 3, `데드존 밖이 안보다 훨씬 빠르다 — 밖 ${fast.toFixed(2)}px vs 안 ${slow.toFixed(2)}px`);
  //  드러남의 증거: 카메라가 따라간 뒤 오른쪽 개체가 화면 안쪽으로 들어온다.
  for (let i = 0; i < 240; i++) updateChaseCameraX(st, 400, 1 / 60, o);
  const far = { x: 470, y: SQY, r: 8 };
  const before = projectObject(far, 'enemy', mk(400, 240)).x;
  const after = projectObject(far, 'enemy', mk(400, st.x)).x;
  assert.ok(after < before, `오른쪽 개체가 화면 안쪽으로 들어온다 — ${before.toFixed(1)} → ${after.toFixed(1)}`);
});

test('G34-DEADZONE-HOLD: 데드존 안에서는 카메라가 급히 따라붙지 않는다', () => {
  //  ⚠️계약 정정(2026-08-11 이사님 실기 제보): 데드존은 카메라를 **정지**시키는 것이 아니라
  //   **느리게** 만드는 것이다. 정지시키면 카메라가 한 번 뒤처진 뒤 영영 돌아오지 않아
  //   기함이 화면 28%/72% 에 붙박인다(실측). 목표는 언제나 기함이고, 데드존은 속도를 가른다.
  const st = createChaseCameraState(240);
  const o = { deadHalf: 60, hysteresis: 6, tau: 0.12, tauRecenter: 0.9 };
  updateChaseCameraX(st, 270, 1 / 60, o);
  assert.ok(Math.abs(st.x - 240) < 1.0, `한 프레임 이동이 1px 미만 — 실측 ${(st.x - 240).toFixed(3)}`);
  assert.equal(st.active, false, '데드존 안에서는 추종 상태가 아니다');
  const before = st.x;
  for (let i = 0; i < 12; i++) updateChaseCameraX(st, 295, 1 / 60, o);   // 0.2초
  assert.ok(Math.abs(st.x - before) < 12, `0.2초에도 조금만 움직인다 — 실측 ${(st.x - before).toFixed(2)}px`);
});

//  ⚠️`G34-DEADZONE-RECENTER` 는 **삭제**했다. "정착하면 카메라가 기함에 맞춰 복귀한다"는 계약을
//   잠깐 넣었다가 되돌린 것이다 — 복귀가 있으면 조준 목표(`camX + (sx−centerX)/nearL`)가 계속
//   따라 밀려 기함이 트랙 끝까지 흘러가고 벽에서 튕긴다(이사님 실기 제보). 데드존 **안에서는
//   카메라가 멈춰야** 목표가 고정점이 된다. 그 성질은 아래 HOLD 가 검증한다.

test('G34-DEADZONE-HYST: 경계에서 떨지 않는다(히스테리시스)', () => {
  const st = createChaseCameraState(240);
  const deadHalf = 60, hysteresis = 6;
  //  일단 벗어나 추종을 켠 뒤, 경계 **바로 안쪽**으로 돌아온다.
  updateChaseCameraX(st, 240 + deadHalf + 2, 1 / 60, { deadHalf, hysteresis });
  assert.ok(st.active, '벗어나면 추종 시작');
  //  히스테리시스 구간(경계~경계−hys) 안에서는 아직 추종이 유지돼야 한다 — 여기서 꺼지면 매 프레임 뒤집힌다.
  const inBand = st.x + deadHalf - hysteresis / 2;
  updateChaseCameraX(st, inBand, 1 / 60, { deadHalf, hysteresis });
  assert.ok(st.active, `경계 안쪽 ${hysteresis / 2}px 에서는 아직 추종 유지(떨림 방지)`);
  //  충분히 안쪽으로 들어오면 멈춘다.
  updateChaseCameraX(st, st.x, 1 / 60, { deadHalf, hysteresis });
  assert.equal(st.active, false, '중심으로 돌아오면 추종 해제');
});

test('G34-DEADZONE-DT: 프레임률이 달라도 같은 시간에 같은 곳에 도달한다', () => {
  const run = (fps) => {
    const st = createChaseCameraState(240);
    const dt = 1 / fps, steps = fps;                 // 정확히 1초
    for (let i = 0; i < steps; i++) updateChaseCameraX(st, 400, dt, { deadHalf: 0, hysteresis: 0 });
    return st.x;
  };
  const a = run(30), b = run(60), c = run(144);
  assert.ok(Math.abs(a - b) < 0.5 && Math.abs(b - c) < 0.5,
    `1초 뒤 위치가 프레임률과 무관해야 한다(데드존 0 = 항상 추종) — 30fps ${a.toFixed(2)} / 60fps ${b.toFixed(2)} / 144fps ${c.toFixed(2)}`);
});

test('G34-DEADZONE-CLAMP: 카메라가 월드 밖을 비추지 않는다', () => {
  const visHalf = visibleHalfWorld(LW, 2.2, PROJECTION);
  const st = createChaseCameraState(240);
  const opt = { deadHalf: 0, hysteresis: 0, cameraMin: visHalf, cameraMax: LW - visHalf };
  //  기함이 트랙 끝까지 가도 카메라는 한계에서 멈춘다.
  for (let i = 0; i < 300; i++) updateChaseCameraX(st, 0, 1 / 60, opt);
  assert.ok(st.x >= visHalf - 1e-6, `왼쪽 한계 ${visHalf.toFixed(2)} 아래로 못 간다 — 실측 ${st.x.toFixed(2)}`);
  for (let i = 0; i < 300; i++) updateChaseCameraX(st, LW, 1 / 60, opt);
  assert.ok(st.x <= LW - visHalf + 1e-6, `오른쪽 한계 ${(LW - visHalf).toFixed(2)} 위로 못 간다 — 실측 ${st.x.toFixed(2)}`);
});

test('G34-DEADZONE-WIDE: 한계가 뒤집히면(=트랙보다 넓게 보이면) 카메라는 가운데 고정', () => {
  //  먼저 사실 확인: **실제 줌 범위에서는 늘 트랙보다 좁게 보인다**(nearLateral 1.25 로 가로 확대되므로).
  //  즉 데드존이 항상 의미를 갖는다 — 이게 §5 를 하는 이유이기도 하다.
  for (const zoom of [1.0, 1.6, 2.0, 2.2]) {
    const vh = visibleHalfWorld(LW, zoom, PROJECTION);
    assert.ok(vh < LW / 2, `zoom=${zoom}: 보이는 반폭 ${vh.toFixed(1)} < 트랙 반폭 ${LW / 2} — 항상 일부만 보인다`);
  }
  //  그래도 한계가 뒤집히는 입력(아주 낮은 배율·좁은 트랙)이 오면 흔들리지 말고 가운데로 고정해야 한다.
  const st = createChaseCameraState(240);
  for (let i = 0; i < 60; i++) {
    updateChaseCameraX(st, 40, 1 / 60, { deadHalf: 0, cameraMin: 300, cameraMax: 180 });   // min > max
  }
  assert.ok(Math.abs(st.x - 240) < 1e-6, `뒤집힌 한계면 중앙(240)에 고정 — 실측 ${st.x.toFixed(2)}`);
});

test('G34-DEADZONE-MARGIN: 데드존은 편대가 화면 밖으로 밀리지 않을 만큼만 잡는다', () => {
  const visHalf = visibleHalfWorld(LW, 2.2, PROJECTION);
  const half = deadZoneHalf(visHalf, 30 + 40 * 0.4);         // laneMargin + 기함폭·0.4
  assert.ok(half > 0, `추적 배율에서 데드존이 존재한다 — visHalf ${visHalf.toFixed(1)}, deadHalf ${half.toFixed(1)}`);
  assert.ok(half < visHalf, '데드존은 보이는 폭보다 좁다(편대 여백)');
  //  여백이 보이는 폭보다 크면 0 — 즉 항상 따라간다(편대를 놓치느니 카메라가 붙는다).
  assert.equal(deadZoneHalf(10, 40), 0, '여백이 크면 데드존 0');
});

//  ⚠️`G34-DEADZONE-AIM-STABLE`(카메라가 움직여도 목표 불변) 은 **삭제**했다(§G-35 P0-2).
//   그것은 A안 전제였다. 정확한 역함수를 쓰면 카메라가 움직이면 같은 화면점의 월드 목표도 당연히 변한다.
//   발산을 막는 것은 "목표 불변"이 아니라 **카메라 목표를 포인터에서 정하는 것**이다 → `G35-POINTER-*`.

test('G34-DEADZONE-CAMCENTER: 카메라가 보는 월드 x 가 화면 중앙에 온다', () => {
  //  카메라 중심 가로식의 정의 그 자체 — 이게 깨지면 "카메라"라는 말이 의미를 잃는다.
  for (const zoom of [1.8, 2.2]) {
    for (const camX of [140, 240, 360]) {
      const p = projectObject({ x: camX, y: SQY, r: 1 }, 'enemy', mk(240, camX, zoom));
      assert.ok(Math.abs(p.x - LW / 2) < 1e-6,
        `zoom=${zoom} camX=${camX}: 카메라 위치는 화면 중앙(${LW / 2})에 온다 — 실측 ${p.x.toFixed(4)}`);
    }
  }
});
