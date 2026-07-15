import { test } from 'node:test';
import assert from 'node:assert/strict';
import { progressionFor, copyCount } from '../js/logic.js';
import { affixChanceForSector, rollAffixes } from '../js/affixes.js';
import { chunkMinTier } from '../js/chunks.js';
import { BAL } from '../js/balance.js';

const DEPTH = BAL.sector.depth;   // 5 → 섹터당 col 0..5 (6열)

// Phase B §4.8 — 진행 축과 난이도 분리.

// ─── 1. 섹터 1 col 0~5 난이도 1.0~2.0 ───────────────────────
test('섹터 1의 col 0~5 난이도는 1.0, 1.2, 1.4, 1.6, 1.8, 2.0', () => {
  const expected = [1.0, 1.2, 1.4, 1.6, 1.8, 2.0];
  for (let col = 0; col <= 5; col++) {
    assert.equal(progressionFor(1, col, DEPTH).difficultyLevel.toFixed(2), expected[col].toFixed(2));
  }
});

// ─── 2. 섹터 증가 → 난이도 단조 증가 ────────────────────────
test('진행(섹터·열) 순서대로 난이도는 단조 증가한다', () => {
  let prev = -Infinity;
  for (let s = 1; s <= 6; s++) for (let col = 0; col <= 5; col++) {
    const d = progressionFor(s, col, DEPTH).difficultyLevel;
    assert.ok(d > prev, `섹터${s} col${col} 난이도 ${d} > 이전 ${prev}`);
    prev = d;
  }
});

test('같은 열이면 섹터가 클수록 난이도가 높다', () => {
  for (let col = 0; col <= 5; col++)
    assert.ok(progressionFor(3, col, DEPTH).difficultyLevel > progressionFor(2, col, DEPTH).difficultyLevel);
});

// ─── 3. 콘텐츠 해금 등급은 노드 열과 무관 ───────────────────
test('contentTier는 섹터와 같고 노드 열과 무관하다', () => {
  for (let col = 0; col <= 5; col++) {
    assert.equal(progressionFor(2, col, DEPTH).contentTier, 2);
    assert.equal(progressionFor(5, col, DEPTH).contentTier, 5);
  }
});

// ─── 4·5·6. 변이 확률·2중 변이 ──────────────────────────────
test('섹터 1 변이 확률은 0', () => {
  assert.equal(affixChanceForSector(1), 0);
  assert.deepEqual(rollAffixes('creature', 1, () => 0), []);   // 확률 0 → 항상 없음
});

test('섹터 2 변이 확률은 0.08', () => {
  assert.equal(affixChanceForSector(2), 0.08);
  assert.equal(affixChanceForSector(3).toFixed(2), '0.16');
  assert.equal(affixChanceForSector(99), 0.50);                // 상한
});

test('2중 변이는 섹터 4부터만 가능', () => {
  assert.equal(rollAffixes('creature', 3, () => 0).length, 1);  // 섹터 3: 최대 1
  assert.equal(rollAffixes('creature', 4, () => 0).length, 2);  // 섹터 4: 2중
});

// ─── 7·8·9. 콘텐츠 해금 티어 ────────────────────────────────
test('섹터 1에는 기본 적만 (소형 생물·유성은 티어 1)', () => {
  assert.equal(chunkMinTier({ items: [{ type: 'creature', size: 'small' }, { type: 'crystal', value: 10 }] }), 1);
  assert.equal(chunkMinTier({ items: [{ type: 'meteor' }] }), 1);
  // 진보한 적은 티어 ≥ 2 → contentTier=1(섹터1)에서 해금 안 됨
  for (const t of ['sniper', 'turret', 'blinker', 'corruptedGate', 'shielder', 'zapper']) {
    assert.ok(chunkMinTier({ items: [{ type: t }] }) >= 2, `${t} 티어 ${chunkMinTier({ items: [{ type: t }] })}`);
  }
});

test('저격·감염 게이트는 섹터 3 이전에 등장하지 않는다 (티어 3)', () => {
  assert.equal(chunkMinTier({ items: [{ type: 'sniper' }] }), 3);
  assert.equal(chunkMinTier({ items: [{ type: 'corruptedGate', y: 0.4, left: {}, right: {} }] }), 3);
});

test('블링커는 섹터 6 이전에 등장하지 않는다 (티어 6)', () => {
  assert.equal(chunkMinTier({ items: [{ type: 'blinker' }] }), 6);
});

// ─── 10·11. 적 복제 수 ──────────────────────────────────────
test('첫 섹터(난이도 1.0~2.0)의 복제 수는 2', () => {
  for (let col = 0; col <= 5; col++) {
    const d = progressionFor(1, col, DEPTH).difficultyLevel;
    assert.equal(copyCount(d, false), 2, `섹터1 col${col} 난이도 ${d}`);
  }
});

test('고난도에서도 복제 수는 8을 넘지 않는다', () => {
  for (const d of [7, 10, 50, 999]) assert.ok(copyCount(d, false) <= 8, `난이도 ${d}`);
  assert.equal(copyCount(999, false), 8);
});

// ─── 12. 배경·표시 기록은 섹터를 사용 ──────────────────────
test('progressionFor의 표시/기록 축(sector·bossTier)은 사용자 섹터와 같다', () => {
  const p = progressionFor(4, 3, DEPTH);
  assert.equal(p.sector, 4);
  assert.equal(p.bossTier, 4);       // 보스 정체성/순서 = 섹터
  assert.equal(p.contentTier, 4);
});

// ─── 입력 보정 ──────────────────────────────────────────────
test('progressionFor 입력 최소값 보정 (sector>=1, nodeCol>=0, depth>=1)', () => {
  const p = progressionFor(0, -3, 0);
  assert.equal(p.sector, 1);
  assert.equal(p.nodeCol, 0);
  assert.equal(p.difficultyLevel, 1);   // 1 + 0 + 0/1
});
