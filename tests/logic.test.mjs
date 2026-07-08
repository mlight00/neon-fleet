import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyGate, hitCrystal, stormDecay, scaleGate } from '../js/logic.js';

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

test('scaleGate: 정액(+/−)은 스테이지마다 커지고, 비율(×/÷)은 원본 유지', () => {
  // 비율 연산(자기 스케일)은 손대지 않음
  assert.deepEqual(scaleGate({ op: 'x', value: 2 }, 5, 0.6, 6), { op: 'x', value: 2 });
  assert.deepEqual(scaleGate({ op: '/', value: 2 }, 8, 0.6, 6), { op: '/', value: 2 });
  // 정액은 스테이지 1에서 원본, 깊을수록 커짐
  assert.equal(scaleGate({ op: '-', value: 30 }, 1, 0.6, 6).value, 30);   // ×1.0
  assert.equal(scaleGate({ op: '-', value: 30 }, 3, 0.6, 6).value, 66);   // ×2.2
  assert.equal(scaleGate({ op: '+', value: 45 }, 2, 0.6, 6).value, 72);   // ×1.6
  assert.equal(scaleGate({ op: '-', value: 10 }, 100, 0.6, 6).value, 60); // 상한 ×6
});

test('차악 게이트: 양쪽 다 감점이면 편대수에 따라 덜 나쁜 쪽이 갈린다', () => {
  const half = { op: '/', value: 2 };   // 절반 상실 (비율)
  const flat = { op: '-', value: 30 };  // 정액 상실
  // 편대 적을 때(40): 절반=20손실 < 정액=30손실 → ÷2가 차악
  assert.ok((40 - applyGate(40, half)) < (40 - applyGate(40, flat)));
  // 편대 많을 때(200): 절반=100손실 > 정액=30손실 → -30이 차악
  assert.ok((200 - applyGate(200, half)) > (200 - applyGate(200, flat)));
});

test('hitCrystal: 데미지 누적, 파괴 시 원래 값 보상', () => {
  assert.deepEqual(hitCrystal({ hp: 20, reward: 20 }, 6), { hp: 14, broken: false, reward: 0 });
  assert.deepEqual(hitCrystal({ hp: 3, reward: 20 }, 6), { hp: 0, broken: true, reward: 20 });
});

test('stormDecay: 초당 비율 감소, 최소 0', () => {
  assert.equal(stormDecay(100, 0.5, 0.10), 95);
  assert.equal(stormDecay(0, 1, 0.10), 0);
});

// ─── 드론 소모형 진화 ───
const { evolveStep } = await import('../js/logic.js');
const COSTS = [0, 60, 140, 280];
const RETAIN = 8;
const RATIO = 0.25;

test('evolveStep: 비용 미달이면 아무 일도 없다', () => {
  assert.deepEqual(evolveStep(59, 0, COSTS, RETAIN, RATIO), { tier: 0, count: 59, consumed: 0 });
  assert.deepEqual(evolveStep(139, 1, COSTS, RETAIN, RATIO), { tier: 1, count: 139, consumed: 0 });
});

test('evolveStep: 비용 도달 시 1티어 승급 + 흡수량의 25%만 새 호위로 잔류', () => {
  assert.deepEqual(evolveStep(60, 0, COSTS, RETAIN, RATIO), { tier: 1, count: 15, consumed: 45 });
  assert.deepEqual(evolveStep(140, 1, COSTS, RETAIN, RATIO), { tier: 2, count: 35, consumed: 105 });
});

test('evolveStep: 잔류가 기본 호위(retainBase)보다 작아질 수는 없다', () => {
  // ratio 0이면 시작 드론 수만큼은 남는다
  assert.deepEqual(evolveStep(60, 0, COSTS, RETAIN, 0), { tier: 1, count: 8, consumed: 52 });
});

test('evolveStep: 비용을 크게 초과해도(대형 크리스탈) 초과분까지 흡수되고 승급은 1단계만', () => {
  assert.deepEqual(evolveStep(400, 0, COSTS, RETAIN, RATIO), { tier: 1, count: 100, consumed: 300 });
});

test('evolveStep: 최고 티어에선 더 진화하지 않고 드론이 그대로 쌓인다', () => {
  assert.deepEqual(evolveStep(999, 3, COSTS, RETAIN, RATIO), { tier: 3, count: 999, consumed: 0 });
});

test('evolveStep: 강등 없음 — 드론이 줄어도 티어 유지 (바친 재료는 돌려받지 않는다)', () => {
  assert.deepEqual(evolveStep(3, 2, COSTS, RETAIN, RATIO), { tier: 2, count: 3, consumed: 0 });
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
  assert.ok(Math.abs(m.enemyHp - 2.0) < 1e-9);  // g=2: 1 + 1.0
  assert.ok(Math.abs(m.enemyRate - 0.84) < 1e-9);
  assert.ok(Math.abs(m.crystal - 2.0) < 1e-9);
  assert.ok(Math.abs(m.boss - 1.7) < 1e-9);   // g=2: 1 + 0.7
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

// ─── 차지 랜스 단계 ───
const { chargeStageFor } = await import('../js/logic.js');

test('chargeStageFor: 충전 시간에 따라 단계 상승, maxStage 상한', () => {
  assert.equal(chargeStageFor(0, 0.5, 3), 0);
  assert.equal(chargeStageFor(0.4, 0.5, 3), 0);   // 1단 미달
  assert.equal(chargeStageFor(0.5, 0.5, 3), 1);
  assert.equal(chargeStageFor(1.2, 0.5, 3), 2);
  assert.equal(chargeStageFor(1.6, 0.5, 3), 3);
  assert.equal(chargeStageFor(9, 0.5, 3), 3);     // 상한 3
  assert.equal(chargeStageFor(9, 0.5, 4), 4);     // 과부하 모듈 → 4단
});
