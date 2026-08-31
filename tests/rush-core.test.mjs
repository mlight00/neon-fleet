// rush-core — 시드 RNG·게이트 수학·트랙 생성이 결정적으로 도는지 잠근다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, hashSeed, dateSeed } from '../rush/rng.js';
import { applyGate, makeGatePair, isGood, GATE_OPS } from '../rush/gates.js';
import { BAL } from '../rush/balance.js';

test('RNG-DET: 같은 시드는 같은 수열, 다른 시드는 다른 수열', () => {
  const a = mulberry32(123), b = mulberry32(123), c = mulberry32(124);
  const sa = [a(), a(), a()], sb = [b(), b(), b()], sc = [c(), c(), c()];
  assert.deepEqual(sa, sb);
  assert.notDeepEqual(sa, sc);
  for (const v of sa) assert.ok(v >= 0 && v < 1);
});

test('RNG-DATE: 날짜 시드는 날짜에만 의존한다', () => {
  const d1 = dateSeed(new Date(2026, 8, 1, 3, 0)), d2 = dateSeed(new Date(2026, 8, 1, 23, 59));
  assert.equal(d1.key, '2026-09-01');
  assert.equal(d1.seed, d2.seed);
  assert.notEqual(d1.seed, dateSeed(new Date(2026, 8, 2)).seed);
  assert.equal(hashSeed('x'), hashSeed('x'));
});

test('GATE-APPLY: 사칙 적용·하한 0·나눗셈 올림', () => {
  assert.equal(applyGate(10, { op: 'add', value: 20 }), 30);
  assert.equal(applyGate(10, { op: 'mul', value: 3 }), 30);
  assert.equal(applyGate(10, { op: 'sub', value: 15 }), 0);   // 음수 금지
  assert.equal(applyGate(11, { op: 'div', value: 2 }), 6);    // ceil(11/2)
});

test('GATE-PAIR: 쌍은 항상 두 연산이 다르고 값이 양수·진행도에 따라 커진다', () => {
  let early = 0, late = 0;
  for (let i = 0; i < 200; i++) {
    const p0 = makeGatePair(mulberry32(i), 0.05), p1 = makeGatePair(mulberry32(i), 0.95);
    for (const p of [p0, p1]) {
      assert.ok(GATE_OPS.includes(p.left.op) && GATE_OPS.includes(p.right.op));
      assert.ok(p.left.value > 0 && p.right.value > 0);
      assert.notEqual(isGood(p.left.op) + ':' + p.left.op + p.left.value, isGood(p.right.op) + ':' + p.right.op + p.right.value,
        '완전 동일 쌍 금지');
    }
    early += p0.left.value + p0.right.value; late += p1.left.value + p1.right.value;
  }
  assert.ok(late > early, '후반 게이트 값이 더 크다');
});

test('BAL-SHAPE: 계획이 쓰는 키가 전부 있다', () => {
  for (const k of ['track', 'squad', 'tiers', 'gates', 'enemies', 'boss', 'coins', 'fx', 'upgrades']) {
    assert.ok(BAL[k], 'BAL.' + k + ' 누락');
  }
  assert.deepEqual(BAL.tiers, [1, 25, 75, 150, 300]);
});
