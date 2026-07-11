import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHUNKS, pickTier, pickChunk, mulberry32, isSafeChunk } from '../js/chunks.js';

test('pickTier: 진행도에 따라 easy→mid→hard', () => {
  assert.equal(pickTier(0.0), 'easy');
  assert.equal(pickTier(0.35), 'mid');
  assert.equal(pickTier(0.8), 'hard');
});

test('청크 풀: easy≥5, mid≥6, hard≥4', () => {
  const c = (t) => CHUNKS.filter((k) => k.tier === t).length;
  assert.ok(c('easy') >= 5, `easy=${c('easy')}`);
  assert.ok(c('mid') >= 6, `mid=${c('mid')}`);
  assert.ok(c('hard') >= 4, `hard=${c('hard')}`);
});

test('청크 데이터 형식: 좌표는 0~1 비율, type은 알려진 것만', () => {
  const known = new Set(['crystal', 'gatePair', 'creature', 'meteor', 'power', 'storm', 'sniper', 'turret', 'weaver', 'capsule', 'splitter', 'charger', 'mine', 'debris', 'bomber', 'zapper', 'orbiter', 'shielder', 'carrier', 'blinker']);
  for (const c of CHUNKS) {
    for (const it of c.items) {
      assert.ok(known.has(it.type), `unknown type ${it.type}`);
      if (it.x !== undefined) assert.ok(it.x >= 0 && it.x <= 1);
      assert.ok(it.y >= 0 && it.y <= 1);
    }
  }
});

test('pickChunk: 시드 고정 시 재현 가능, 직전 청크 연속 회피', () => {
  const rng1 = mulberry32(42);
  const rng2 = mulberry32(42);
  assert.equal(pickChunk('easy', rng1, null), pickChunk('easy', rng2, null));
  const rng = mulberry32(7);
  let prev = null;
  for (let i = 0; i < 50; i++) {
    const c = pickChunk('mid', rng, prev);
    assert.notEqual(c, prev, '직전 청크가 연속으로 나오면 안 됨');
    prev = c;
  }
});

// ─── 노드 타입 필터 보장 (GPT 지적 #3 회귀 방지: 조용한 일반 폴백 금지) ───
test('pickChunk: 보급 필터는 항상 crystal/capsule 청크, 위험 필터는 항상 debris/mine 청크를 낸다', () => {
  const supplyFilter = (c) => isSafeChunk(c) && c.items.some((it) => ['crystal', 'capsule'].includes(it.type));
  const hazardFilter = (c) => c.items.some((it) => ['debris', 'mine'].includes(it.type));
  const rng = mulberry32(2024);
  for (const tier of ['easy', 'mid', 'hard']) {
    for (let i = 0; i < 40; i++) {
      assert.ok(supplyFilter(pickChunk(tier, rng, null, supplyFilter)), `보급 필터 위반 (${tier}, ${i})`);
      assert.ok(hazardFilter(pickChunk(tier, rng, null, hazardFilter)), `위험 필터 위반 (${tier}, ${i})`);
    }
  }
});

// ─── 스테이지별 적 도입 (chunkMinStage) ───
const { chunkMinStage } = await import('../js/chunks.js');

test('chunkMinStage: 샤드/크리스탈만 있으면 스테이지 1', () => {
  assert.equal(chunkMinStage({ items: [{ type: 'creature', size: 'small' }, { type: 'crystal', value: 10 }] }), 1);
});
test('chunkMinStage: 단일 적은 도입 스테이지 (저격=3, 포탑=4, 분열=5)', () => {
  assert.equal(chunkMinStage({ items: [{ type: 'sniper' }] }), 3);
  assert.equal(chunkMinStage({ items: [{ type: 'turret' }] }), 4);
  assert.equal(chunkMinStage({ items: [{ type: 'splitter' }] }), 5);
});
test('chunkMinStage: 3종 이상 조합 청크는 6스테이지 이후', () => {
  const combo = { items: [{ type: 'turret' }, { type: 'sniper' }, { type: 'creature', size: 'mid' }] };
  assert.ok(chunkMinStage(combo) >= 6);
});
test('chunkMinStage: 명시 minStage 우선', () => {
  assert.equal(chunkMinStage({ minStage: 9, items: [{ type: 'crystal', value: 1 }] }), 9);
});
