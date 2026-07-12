import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prismRoute, stageScale, droneReward, scavengerPayout } from '../js/adaptive-logic.js';

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

test('droneReward: 원 보상 100 → 경제 0.32 적용 시 실수령 32 (스캐빈저 저장 기준과 동일)', () => {
  assert.equal(droneReward(100, 1, 0.32, 1), 32);
  assert.equal(droneReward(100, 1.3, 0.32, 1.1), Math.round(100 * 1.3 * 0.32 * 1.1));  // 보상모듈·군체 반영
});

test('scavengerPayout: 보관(32) → ×1.5=48, 미보관(0) → 0 (도주 전 처치만 지급)', () => {
  assert.equal(scavengerPayout(32, 1.5), 48);
  assert.equal(scavengerPayout(0, 1.5), 0);
});
