import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGate, hitCrystal, stormDecay } from '../js/logic.js';

test('applyGate: 덧셈/곱셈/뺄셈/나눗셈, 최소 0, 나눗셈 내림', () => {
  assert.equal(applyGate(10, { op: '+', value: 5 }), 15);
  assert.equal(applyGate(10, { op: 'x', value: 2 }), 20);
  assert.equal(applyGate(10, { op: '-', value: 50 }), 0);
  assert.equal(applyGate(7, { op: '/', value: 2 }), 3);
});

test('applyGate: 0기에서 좋은 게이트를 받으면 살아난다', () => {
  assert.equal(applyGate(0, { op: '+', value: 5 }), 5);
  assert.equal(applyGate(0, { op: 'x', value: 3 }), 0);
});

test('hitCrystal: 데미지 누적, 파괴 시 원래 값 보상', () => {
  assert.deepEqual(hitCrystal({ hp: 20, reward: 20 }, 6), { hp: 14, broken: false, reward: 0 });
  assert.deepEqual(hitCrystal({ hp: 3, reward: 20 }, 6), { hp: 0, broken: true, reward: 20 });
});

test('stormDecay: 초당 비율 감소, 최소 0', () => {
  assert.equal(stormDecay(100, 0.5, 0.10), 95);
  assert.equal(stormDecay(0, 1, 0.10), 0);
});

// ─── 진화 티어 (확장 설계 부록 §1) ───
const { tierFor } = await import('../js/logic.js');
const TH = [0, 30, 120, 320];

test('tierFor: 임계값 도달 시 승급', () => {
  assert.equal(tierFor(8, 0, TH, 0.6), 0);
  assert.equal(tierFor(30, 0, TH, 0.6), 1);
  assert.equal(tierFor(119, 1, TH, 0.6), 1);
  assert.equal(tierFor(120, 1, TH, 0.6), 2);
  assert.equal(tierFor(320, 2, TH, 0.6), 3);
});

test('tierFor: 여러 단계 한 번에 승급 (x3 게이트)', () => {
  assert.equal(tierFor(400, 0, TH, 0.6), 3);
});

test('tierFor: 히스테리시스 — 임계값 바로 아래로 떨어져도 강등 안 됨', () => {
  assert.equal(tierFor(119, 2, TH, 0.6), 2);  // 120 미만이지만 72 이상 → 유지
  assert.equal(tierFor(73, 2, TH, 0.6), 2);
});

test('tierFor: 60% 미만으로 떨어지면 강등', () => {
  assert.equal(tierFor(71, 2, TH, 0.6), 1);   // 120*0.6=72 미만 → T2
  assert.equal(tierFor(17, 2, TH, 0.6), 0);   // 30*0.6=18 미만 → 연쇄 강등 T1
  assert.equal(tierFor(191, 3, TH, 0.6), 2);  // 320*0.6=192 미만 → T3
});

test('tierFor: 경계에서 승급/강등 반복 없음 (히스테리시스 불변식)', () => {
  // 승급 직후 값이 강등 기준보다 항상 위: thresholds[t] >= thresholds[t]*0.6
  for (let t = 1; t < TH.length; t++) {
    const promoted = tierFor(TH[t], t - 1, TH, 0.6);
    assert.equal(promoted, t);
    assert.equal(tierFor(TH[t] - 1, promoted, TH, 0.6), t, `경계 ${TH[t]}에서 깜빡임`);
  }
});

// ─── 스테이지 난이도 스케일링 ───
const { stageMods } = await import('../js/logic.js');

test('stageMods: 스테이지 1은 기본값 (배수 1)', () => {
  const m = stageMods(1);
  assert.equal(m.enemyHp, 1);
  assert.equal(m.enemyRate, 1);
  assert.equal(m.crystal, 1);
  assert.equal(m.boss, 1);
  assert.equal(m.tierShift, 0);
});

test('stageMods: 스테이지가 오르면 적은 강하고 빠르게, 보상도 소폭 상승', () => {
  const m = stageMods(3);
  assert.ok(Math.abs(m.enemyHp - 1.7) < 1e-9);
  assert.ok(Math.abs(m.enemyRate - 0.84) < 1e-9);
  assert.ok(Math.abs(m.crystal - 2.0) < 1e-9);
  assert.ok(Math.abs(m.boss - 2.0) < 1e-9);
});

test('stageMods: 고스테이지에서도 하한/상한 존중', () => {
  const m = stageMods(20);
  assert.ok(m.enemyRate >= 0.6);
  assert.ok(m.tierShift <= 0.2);
  assert.ok(m.shotCap <= 20);
});

// ─── 격납고 비용 곡선 ───
const { hangarCost } = await import('../js/logic.js');

test('hangarCost: 레벨 0 = 기본가, 레벨마다 단조 증가', () => {
  assert.equal(hangarCost(60, 0, 1.6), 60);
  let prev = 0;
  for (let lv = 0; lv < 10; lv++) {
    const c = hangarCost(60, lv, 1.6);
    assert.ok(c > prev, `lv${lv} 비용이 증가해야 함`);
    assert.ok(Number.isInteger(c), '비용은 정수');
    prev = c;
  }
});

test('hangarCost: 성장 배수 반영 (1.6^lv)', () => {
  assert.equal(hangarCost(100, 2, 1.6), 256);
});
