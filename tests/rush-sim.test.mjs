// rush-sim — 부대·전투·완주 시뮬레이션. 게임 규칙 계층이 화면 없이 완주 가능한지 잠근다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierFor, formation, clampX } from '../rush/squad.js';
import { BAL } from '../rush/balance.js';

test('SQUAD-TIER: 임계 1/25/75/150/300', () => {
  const cases = [[1, 0], [24, 0], [25, 1], [74, 1], [75, 2], [149, 2], [150, 3], [299, 3], [300, 4], [999, 4]];
  for (const [n, t] of cases) assert.equal(tierFor(n), t, n + '기');
});

test('SQUAD-FORM: 개수 상한·쐐기(뒤로 갈수록 넓다)·중복 없음', () => {
  assert.equal(formation(1).length, 1);
  assert.equal(formation(10).length, 10);
  assert.equal(formation(500).length, BAL.squad.drawCap);
  const f = formation(60);
  const rows = new Map();
  for (const p of f) {
    const key = Math.round(p.y);
    rows.set(key, Math.max(rows.get(key) ?? 0, Math.abs(p.x)));
  }
  const ys = [...rows.keys()].sort((a, b) => a - b);
  assert.ok(rows.get(ys[ys.length - 1]) >= rows.get(ys[0]), '뒷줄이 앞줄보다 넓거나 같다');
  const set = new Set(f.map((p) => Math.round(p.x) + ',' + Math.round(p.y)));
  assert.equal(set.size, f.length, '겹치는 자리 없음');
});

test('SQUAD-CLAMP: 중심 x 는 화면 안', () => {
  assert.equal(clampX(-999), 40);
  assert.equal(clampX(999), 440);
  assert.equal(clampX(240), 240);
});
