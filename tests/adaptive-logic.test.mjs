import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prismRoute, stageScale } from '../js/adaptive-logic.js';

const cores = () => [{ side: -1, hp: 22 }, { side: 1, hp: 22 }];
const OFF = 18, X = 240;

test('프리즘: 중앙 정면 탄은 코어 아님(-1) → 본체 감소(full=false)', () => {
  const r = prismRoute({ x: X }, X, cores(), OFF);
  assert.deepEqual(r, { hitCore: -1, full: false });
});

test('프리즘: 좌/우 코어 위치 탄은 해당 코어 명중', () => {
  assert.equal(prismRoute({ x: X - OFF }, X, cores(), OFF).hitCore, 0);
  assert.equal(prismRoute({ x: X + OFF }, X, cores(), OFF).hitCore, 1);
});

test('프리즘: 파괴된 코어 위치는 명중 안 함(본체로)', () => {
  const cs = cores(); cs[0].hp = 0;
  assert.equal(prismRoute({ x: X - OFF }, X, cs, OFF).hitCore, -1);
});

test('프리즘: 일반 랜스는 정면 감소(full=false), 강습3단+ 랜스만 관통(full=true)', () => {
  assert.deepEqual(prismRoute({ lance: true, pierceDefense: false }, X, cores(), OFF), { hitCore: -1, full: false });
  assert.deepEqual(prismRoute({ lance: true, pierceDefense: true }, X, cores(), OFF), { hitCore: -1, full: true });
});

test('프리즘: 문맥 없는 광역(도탄·폭발)은 코어 조준 불가 → 본체 감소', () => {
  assert.deepEqual(prismRoute(null, X, cores(), OFF), { hitCore: -1, full: false });
});

test('stageScale: 완만 상승 + 상한', () => {
  assert.equal(stageScale(1, 0.18, 2.6), 1);
  assert.ok(Math.abs(stageScale(3, 0.18, 2.6) - 1.36) < 1e-9);   // 1+0.18×2
  assert.equal(stageScale(50, 0.18, 2.6), 2.6);                   // 상한
});
