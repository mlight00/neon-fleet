import { test } from 'node:test';
import assert from 'node:assert/strict';
import { circleHit, circleRectHit } from '../js/collision.js';

test('circleHit: 겹치면 true, 접점 경계 포함', () => {
  assert.equal(circleHit(0, 0, 5, 8, 0, 4), true);   // 거리8 < 5+4
  assert.equal(circleHit(0, 0, 5, 9, 0, 4), true);   // 정확히 접함
  assert.equal(circleHit(0, 0, 5, 10, 0, 4), false); // 거리10 > 9
});

test('circleRectHit: 사각형 내부/모서리/바깥', () => {
  assert.equal(circleRectHit(5, 5, 2, 0, 0, 10, 10), true);   // 내부
  assert.equal(circleRectHit(12, 5, 3, 0, 0, 10, 10), true);  // 오른쪽 변에 걸침
  assert.equal(circleRectHit(15, 5, 3, 0, 0, 10, 10), false); // 바깥
});
