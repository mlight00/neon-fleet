import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIP_DEFS, CRUISER_VISUAL_W, DRONE_VISUAL_W } from '../js/ships.js';
import { BAL } from '../js/balance.js';

// Phase B 작업묶음 A — 기함 시각 위계와 피격 핵 분리 (지시서 §6.1)
// F1: "기함이 작고 드론·순양함과 같은 색이라 안 보임"

// 지시서 §6.1 표시 크기 목표
const TARGET_WIDTH = [34, 50, 68, 88, 112, 140];
const MIN_VS_CRUISER = [1.0, 1.4, 1.8, 2.3, 3.0, 3.5];

test('H0~H5 표시 폭이 지시서 목표와 일치', () => {
  assert.equal(SHIP_DEFS.length, 6, '함체 6티어');
  SHIP_DEFS.forEach((d, t) => {
    assert.equal(d.visualWidth, TARGET_WIDTH[t], `H${t} 표시 폭 ${TARGET_WIDTH[t]}px`);
  });
});

test('H0~H5 표시 폭이 단조 증가한다 (상위 티어 축소 금지)', () => {
  for (let t = 1; t < SHIP_DEFS.length; t++) {
    assert.ok(
      SHIP_DEFS[t].visualWidth > SHIP_DEFS[t - 1].visualWidth,
      `H${t}(${SHIP_DEFS[t].visualWidth}) > H${t - 1}(${SHIP_DEFS[t - 1].visualWidth})`,
    );
  }
});

test('H1 이상이 순양함보다 지정 배율 이상 크다', () => {
  SHIP_DEFS.forEach((d, t) => {
    const ratio = d.visualWidth / CRUISER_VISUAL_W;
    assert.ok(ratio >= MIN_VS_CRUISER[t] - 1e-9,
      `H${t} 폭 ${d.visualWidth} / 순양함 ${CRUISER_VISUAL_W} = ${ratio.toFixed(2)}배 ≥ ${MIN_VS_CRUISER[t]}배`);
  });
});

test('기함(H1+)은 순양함·드론보다 확실히 크다 — 위계가 눈으로 구분됨', () => {
  assert.ok(CRUISER_VISUAL_W > DRONE_VISUAL_W, '순양함 > 드론');
  for (let t = 1; t < SHIP_DEFS.length; t++) {
    assert.ok(SHIP_DEFS[t].visualWidth > CRUISER_VISUAL_W * 1.35, `H${t}는 순양함보다 확실히 큼`);
  }
});

// ─── 피격 핵은 시각 폭과 독립 ─────────────────────────────────
test('피격 핵 반경이 시각 폭과 독립이다 (커져도 회피 난이도가 비례해 오르지 않음)', () => {
  SHIP_DEFS.forEach((d) => {
    assert.equal(typeof d.hitCoreRadius, 'number');
    assert.ok(d.hitCoreRadius > 0);
  });
  // 시각 폭은 4.1배(34→140) 커지지만 피격 핵은 2배 미만이어야 한다 = 독립적으로 관리됨
  const visRatio = SHIP_DEFS[5].visualWidth / SHIP_DEFS[0].visualWidth;
  const coreRatio = SHIP_DEFS[5].hitCoreRadius / SHIP_DEFS[0].hitCoreRadius;
  assert.ok(visRatio > 4, `시각 폭 배율 ${visRatio.toFixed(2)}`);
  assert.ok(coreRatio < 2, `피격 핵 배율 ${coreRatio.toFixed(2)} — 시각 폭과 함께 커지지 않음`);
});

test('피격 핵은 항상 함체 시각 폭보다 훨씬 작다 (날개·포대는 판정에 미포함)', () => {
  SHIP_DEFS.forEach((d, t) => {
    assert.ok(d.hitCoreRadius * 2 < d.visualWidth * 0.75,
      `H${t} 피격 핵 지름 ${d.hitCoreRadius * 2} < 시각 폭 ${d.visualWidth}의 75%`);
  });
});

test('피격 핵 지름은 안전 통로 계약(2×hitCore+20px)이 화면 폭 안에 들어갈 만큼 작다', () => {
  const maxCore = Math.max(...SHIP_DEFS.map((d) => d.hitCoreRadius));
  const corridor = 2 * maxCore + 20;
  assert.ok(corridor < BAL.logicalW * 0.35, `안전 통로 최소폭 ${corridor}px < 화면 폭의 35%`);
});

// ─── 분리된 구조 필드 ────────────────────────────────────────
test('함체 정의가 시각·판정·대형·포대·엔진을 각각 별도 필드로 노출한다', () => {
  SHIP_DEFS.forEach((d, t) => {
    assert.ok(Number.isFinite(d.visualWidth), `H${t} visualWidth`);
    assert.ok(Number.isFinite(d.visualHeight), `H${t} visualHeight`);
    assert.ok(Number.isFinite(d.hitCoreRadius), `H${t} hitCoreRadius`);
    assert.ok(Number.isFinite(d.formationRadius), `H${t} formationRadius`);
    assert.ok(Array.isArray(d.weaponMounts) && d.weaponMounts.length > 0, `H${t} weaponMounts`);
    assert.ok(Array.isArray(d.engineMounts) && d.engineMounts.length > 0, `H${t} engineMounts`);
  });
});

test('포대 수가 티어에 따라 줄지 않는다 (상위 함체가 더 많은 하드포인트)', () => {
  for (let t = 1; t < SHIP_DEFS.length; t++) {
    assert.ok(SHIP_DEFS[t].weaponMounts.length >= SHIP_DEFS[t - 1].weaponMounts.length,
      `H${t} 포대 ${SHIP_DEFS[t].weaponMounts.length} ≥ H${t - 1} ${SHIP_DEFS[t - 1].weaponMounts.length}`);
  }
});

test('호위 대형 이격은 함체가 커질수록 넓어진다 (호위가 선체에 박히지 않음)', () => {
  for (let t = 1; t < SHIP_DEFS.length; t++) {
    assert.ok(SHIP_DEFS[t].formationRadius > SHIP_DEFS[t - 1].formationRadius, `H${t} 대형 반경 증가`);
  }
  // 대형 반경은 함체 반폭보다 커야 호위가 겹치지 않는다
  SHIP_DEFS.forEach((d, t) => {
    assert.ok(d.formationRadius >= d.visualWidth * 0.35, `H${t} 대형 반경이 함체 반폭 수준 이상`);
  });
});

test('모바일 폭(480) 대비 최대 기함이 회피 공간을 지우지 않는다', () => {
  const titan = SHIP_DEFS[5];
  assert.ok(titan.visualWidth < BAL.logicalW * 0.32, `타이탄 ${titan.visualWidth}px < 화면 폭 480의 32%`);
  // 실제 회피는 피격 핵 기준이라 여유가 훨씬 크다
  assert.ok(titan.hitCoreRadius * 2 < BAL.logicalW * 0.09, '타이탄 피격 핵 지름이 화면 폭의 9% 미만');
});
