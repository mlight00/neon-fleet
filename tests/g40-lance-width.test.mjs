// ── §G-40 — 차지 빔 폭을 2D 와 맞춘다 ─────────────────────────────────────────────────
//
//  이사님 제보(2026-08-13): "함미모드에서 차지샷 넓이가 완전 좁아. 2D 랑 차이가 크다."
//
//  실측 원인 2가지:
//   ① 3D 반지름이 **고정 상수**였다 — 2D 는 기함 크기·단계에 비례해 넓어지는데 3D 는 안 따라갔다.
//      tier0·3단계: 2D 29px / tier3: 2D 104px / tier5: 2D 158px — 3D 는 전부 ~61px 고정.
//   ② `CylinderGeometry(radiusTop 0.06, ...)` 원뿔이라 **원근 축소 위에 기하 축소가 겹쳤다.**
//      실측 화면 y=560 61.4px → y=160 4.7px.
import test from 'node:test';
import assert from 'node:assert/strict';

import { worldRadiusForScreenHalfW, focalPx } from '../js/chase3d-shot-place.js';
import { BAL } from '../js/balance.js';
import { SHIP_DEFS } from '../js/ships.js';

/** 2D `fireLance` 와 **같은 식**. ⚠️여기서 상수를 새로 적지 않는다 — BAL 이 진실이다. */
const lanceHalfW = (tier, stage) => {
  const shipHalfW = (SHIP_DEFS[Math.min(tier, SHIP_DEFS.length - 1)].visualWidth || 40) * 0.5;
  return shipHalfW * (BAL.charge.widthShipMult ?? 1.05) * (1 + (BAL.charge.widthStageStep ?? 0.18) * (stage - 1));
};

test('G40-WIDTH-ROUNDTRIP: 월드 반지름 → 화면 폭 왕복이 정확하다', () => {
  const fpx = focalPx(800, 52);
  for (const half of [10, 30, 80]) {
    for (const depth of [8, 14, 40]) {
      const rad = worldRadiusForScreenHalfW(half, depth, fpx);
      const back = (rad * fpx) / depth;          // 화면 폭 = 반지름 × 초점 / 깊이
      assert.ok(Math.abs(back - half) < 1e-9, `half=${half} depth=${depth} → ${back}`);
    }
  }
});

test('G40-WIDTH-DEPTH: 멀수록 같은 화면 폭에 더 큰 반지름이 필요하다', () => {
  const fpx = focalPx(800, 52);
  const near = worldRadiusForScreenHalfW(30, 10, fpx);
  const far = worldRadiusForScreenHalfW(30, 40, fpx);
  assert.ok(far > near * 3.9 && far < near * 4.1, `깊이 4배 → 반지름 4배여야 한다 (${near} → ${far})`);
});

test('G40-WIDTH-GUARD: 비정상 입력은 0 을 돌려준다', () => {
  const fpx = focalPx(800, 52);
  for (const bad of [[0, 10, fpx], [-1, 10, fpx], [30, 0, fpx], [30, -5, fpx], [30, 10, 0], [NaN, 10, fpx], [30, NaN, fpx]]) {
    assert.equal(worldRadiusForScreenHalfW(...bad), 0, `${JSON.stringify(bad)} → 0 이어야 한다`);
  }
});

test('G40-2D-WIDTH-SCALES: 2D 빔 폭은 기함 등급·단계에 따라 크게 달라진다', () => {
  //  ⭐이 사실이 이번 수정의 이유다. 3D 가 고정 상수면 상위 등급에서 격차가 5배 이상 벌어진다.
  const t0s1 = lanceHalfW(0, 1), t0s3 = lanceHalfW(0, 3), t5s3 = lanceHalfW(5, 3);
  assert.ok(t0s3 > t0s1 * 1.3, `단계가 오르면 넓어져야 한다 — ${t0s1} → ${t0s3}`);
  assert.ok(t5s3 > t0s3 * 3, `상위 등급은 훨씬 넓어야 한다 — tier0 ${t0s3} vs tier5 ${t5s3}`);
});

test('G40-HIT-MATCHES-3D-DRAW: 판정 폭이 3D 가 실제로 그리는 폭과 같다', async () => {
  //  이사님 결정(2026-08-13): "판정을 그림폭에 맞춰줘".
  //  ⚠️게임 판정(balance.js)은 렌더 상수(chase3d-config.js)를 **import 하지 않는다** — 경계 규칙.
  //   그래서 두 값이 조용히 갈라질 수 있다. 이 테스트가 그걸 막는 유일한 장치다.
  const { LANCE_3D_WIDTH_MULT } = await import('../js/chase3d-config.js');

  //  3D 가 그리는 반폭 = halfW × (0.7 + 0.5·p) × LANCE_3D_WIDTH_MULT.
  //  판정은 발사 순간 한 번 계산된다 → 그때 p=1(빔이 가장 굵을 때)의 배수와 맞아야 한다.
  const drawMultAtFire = (0.7 + 0.5 * 1) * LANCE_3D_WIDTH_MULT;
  assert.ok(Math.abs(BAL.charge.hitWidthMult - drawMultAtFire) < 1e-9,
    `판정 배수 ${BAL.charge.hitWidthMult} ≠ 3D 발사시점 그림 배수 ${drawMultAtFire}. `
    + `LANCE_3D_WIDTH_MULT(${LANCE_3D_WIDTH_MULT})를 바꿨다면 BAL.charge.hitWidthMult 도 같이 바꿔라.`);

  //  실제 픽셀 폭으로도 확인 — tier 별로 판정과 3D 그림이 일치해야 한다.
  for (const tier of [0, 3, 5]) {
    const halfW = lanceHalfW(tier, 3);
    const hit = halfW * BAL.charge.hitWidthMult;
    const draw3d = halfW * (0.7 + 0.5) * LANCE_3D_WIDTH_MULT;
    assert.ok(Math.abs(hit - draw3d) < 1e-9, `tier ${tier}: 판정 ${hit} vs 3D 그림 ${draw3d}`);
  }
});
