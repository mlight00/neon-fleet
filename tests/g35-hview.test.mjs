// ── §G-35 §1-1 — full chase 가로 시야 실패 재현 (P0-1) ──
//
//  Codex 6차 A-1[치명]: G34 의 목표는 full chase 에서 **가로 zoom 제거**였다.
//      chaseX = centerX + (worldX − cameraWorldX) · lateral(depth)      ← zoom 없음
//      visibleHalfWorld = logicalW / (2 · nearLateral)                 ← zoom 이 없다
//  그런데 구현은 `nearL = zoom · nearLateral` 로 남아 있었다:
//      가로 기울기 = zoom × nearLateral → 확대할수록 시야가 **좁아졌다**(2.2 에서 36.4%)
//
//  ⚠️더 나쁜 것은 내가 그 값을 **성공값으로 보고하고 테스트로 잠갔다**는 점이다.
//
//  ⚠️⚠️**§G-36 C안(이사님 결정 2026-08-12)으로 목표값이 바뀌었다**: 384(80%) → **240(50%)**.
//   80% + 트랙밖 0 + 카메라 이동 240px 은 480 트랙에서 **동시에 성립할 수 없다**(Codex 7차 §2).
//   셋 중 **조준 정합**과 **트랙밖 0** 을 지키고 가시 폭을 양보했다.
//   `nearLateral: 1.25 → 2.00` → 가시 반폭 **120**, 카메라 [120, 360], 이동 **240px**.
//   이 파일이 검증하는 것은 여전히 "가로 zoom 이 제거됐는가"이며, **목표 숫자만** 바뀌었다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createChaseProjection, projectPoint, visibleHalfWorld, PROJECTION } from '../js/chase-camera.js';

const LW = 480, LH = 800, SQY = 670;
/** full chase(blend=1) 투영. 카메라는 트랙 중앙. */
const full = (zoom, cameraWorldX = LW / 2) => createChaseProjection({
  logicalW: LW, logicalH: LH, zoom, chaseBlend: 1, squadX: cameraWorldX, squadY: SQY, cameraWorldX,
});

test('G35-HVIEW-HALF: full chase 가시 반폭은 zoom 과 무관하게 120 이어야 한다(C안)', () => {
  //  목표식(C안): logicalW / (2 · nearLateral) = 480 / 4.0 = 120
  const want = LW / (2 * PROJECTION.nearLateral);
  assert.equal(want, 120, `계약 자체가 120 이어야 한다(C안) — nearLateral=${PROJECTION.nearLateral}`);
  for (const zoom of [2.0, 2.2]) {
    const got = visibleHalfWorld(LW, zoom, PROJECTION);
    assert.ok(Math.abs(got - 120) < 0.01,
      `zoom=${zoom}: 가시 반폭 ${got.toFixed(2)} — 120 이어야 한다(C안). zoom 이 곱해지면 안 된다`);
  }
});

test('G35-HVIEW-EDGE: 카메라에서 ±120 떨어진 월드 점이 화면 양끝에 온다', () => {
  for (const zoom of [2.0, 2.2]) {
    const cam = LW / 2;
    const p = full(zoom, cam);
    const left = projectPoint({ x: cam - 120, y: SQY }, p).x;
    const right = projectPoint({ x: cam + 120, y: SQY }, p).x;
    assert.ok(Math.abs(left - 0) < 1,
      `zoom=${zoom}: 카메라−120 은 화면 0 에 와야 한다 — 실측 ${left.toFixed(2)}`);
    assert.ok(Math.abs(right - LW) < 1,
      `zoom=${zoom}: 카메라+120 은 화면 ${LW} 에 와야 한다 — 실측 ${right.toFixed(2)}`);
  }
});

test('G35-HVIEW-WIDTH: 보이는 전체 월드 폭이 240(트랙의 50% — C안)', () => {
  for (const zoom of [2.0, 2.2]) {
    const width = visibleHalfWorld(LW, zoom, PROJECTION) * 2;
    assert.ok(Math.abs(width - 240) < 0.02,
      `zoom=${zoom}: 보이는 폭 ${width.toFixed(2)} — 240 이어야 한다(C안)`);
    const frac = width / LW;
    assert.ok(frac > 0.49 && frac < 0.51, `트랙의 50% — 실측 ${(frac * 100).toFixed(1)}%`);
  }
});

test('G35-HVIEW-ZOOM-INVARIANT: full chase 가로 시야는 zoom 2.0 과 2.2 가 같다', () => {
  //  전술→추적 전환이 끝난 뒤에는 배율이 **세로 원근**만 바꾸고 가로 시야는 건드리지 않는다.
  //  (가로에 zoom 이 남아 있으면 220% 로 올릴수록 시야가 좁아진다 — 목적과 반대다.)
  const a = visibleHalfWorld(LW, 2.0, PROJECTION);
  const b = visibleHalfWorld(LW, 2.2, PROJECTION);
  assert.ok(Math.abs(a - b) < 1e-9,
    `zoom 2.0 → ${a.toFixed(2)} / 2.2 → ${b.toFixed(2)} 가 같아야 한다`);
});

test('G35-HVIEW-SLOPE: 근거리 가로 기울기는 nearLateral(C안 2.00) 이다', () => {
  //  `slope = lerp(zoom, nearLateral, chaseBlend)` — blend=1 이면 nearLateral 그대로.
  for (const zoom of [2.0, 2.2]) {
    const p = full(zoom);
    assert.ok(Math.abs(p.slope - PROJECTION.nearLateral) < 1e-9,
      `zoom=${zoom}: slope ${p.slope.toFixed(3)} — ${PROJECTION.nearLateral} 여야 한다(zoom 이 곱해지면 안 된다)`);
  }
  //  전술 성분은 그대로 zoom 을 쓴다(blend=0 에서 기존 화면과 픽셀 차이 0).
  const tac = createChaseProjection({ logicalW: LW, logicalH: LH, zoom: 1.5, chaseBlend: 0, squadX: 240, squadY: SQY });
  assert.ok(Math.abs(tac.slope - 1.5) < 1e-9, `전술 구간 slope 는 zoom 그대로 — 실측 ${tac.slope}`);
});

test('G35-HVIEW-CLAMP: 카메라 한계는 제품과 같은 함수가 정한다', async () => {
  //  §G-36 P0-1: 한계를 테스트에서 다시 계산하지 않는다 — `chaseCameraBounds` 를 **공유**한다.
  //   G35 에서 테스트가 수식을 복사해 두는 바람에 production 이 오버스캔으로 바뀐 뒤에도
  //   옛 범위로 적분해 회귀를 가렸다(앵커 오차 112~150px 을 "0.00px" 로 보고).
  const { chaseCameraBounds } = await import('../js/chase-camera.js');
  const vh = visibleHalfWorld(LW, 2.2, PROJECTION);
  const b = chaseCameraBounds(LW, vh, PROJECTION);
  assert.ok(Math.abs(vh - 120) < 0.01, `가시 반폭 120(C안) — 실측 ${vh.toFixed(2)}`);
  assert.ok(Math.abs(b.min - 120) < 0.01 && Math.abs(b.max - 360) < 0.01,
    `카메라 [120, 360] — 실측 [${b.min.toFixed(1)}, ${b.max.toFixed(1)}]`);
  assert.ok(Math.abs((b.max - b.min) - 240) < 0.01,
    `이동 여유 240px — 실측 ${(b.max - b.min).toFixed(1)}`);
  //  C안의 핵심: 오버스캔 0 → 트랙 밖을 비추지 않는다.
  assert.equal(PROJECTION.edgeOverscanPx, 0,
    `C안은 오버스캔 0 이다 — 실측 ${PROJECTION.edgeOverscanPx}(0 이 아니면 조준 정합이 깨진다)`);
  assert.ok(b.min >= vh - 1e-9 && b.max <= LW - vh + 1e-9, '카메라 시야가 트랙을 벗어나지 않는다');
});
