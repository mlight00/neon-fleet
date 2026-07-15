import { test } from 'node:test';
import assert from 'node:assert/strict';
import { failureReward } from '../js/logic.js';
import { BAL } from '../js/balance.js';

const base = BAL.run.failBaseCoins, per = BAL.run.coinPerProgress;

// Phase A — 실패 정산 계약 (3.7 #1~#5). #6(중복 정산 차단)은 endExpedition의 r.settled로 브라우저 검증.
test('실패 보상: 진행도 0 = earned + failBaseCoins(12)', () => {
  assert.equal(failureReward({ earned: 10, progress: 0, base, perProgress: per }), 10 + 12);
  assert.equal(failureReward({ earned: 0, progress: 0, base, perProgress: per }), 12);
});

test('실패 보상: 진행도 0.5 = earned + 27 (12 + floor(0.5×30))', () => {
  assert.equal(failureReward({ earned: 0, progress: 0.5, base, perProgress: per }), 27);
  assert.equal(failureReward({ earned: 5, progress: 0.5, base, perProgress: per }), 32);
});

test('실패 보상: 진행도 1 = earned + 42 (12 + 30)', () => {
  assert.equal(failureReward({ earned: 0, progress: 1, base, perProgress: per }), 42);
});

test('실패 보상: 진행도는 0~1로 제한된다', () => {
  assert.equal(failureReward({ earned: 0, progress: -5, base, perProgress: per }), 12);  // clamp 0
  assert.equal(failureReward({ earned: 0, progress: 9, base, perProgress: per }), 42);   // clamp 1
});

test('자발적 종료(quit): base·perProgress 0 → 전투 획득만, 기본·진행도 보상 없음', () => {
  assert.equal(failureReward({ earned: 25, progress: 1, base: 0, perProgress: 0 }), 25);
  assert.equal(failureReward({ earned: 0, progress: 1, base: 0, perProgress: 0 }), 0);
});

test('실패 보상 계약값: failBaseCoins=12, coinPerProgress=30', () => {
  assert.equal(base, 12);
  assert.equal(per, 30);
});
