import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Boss as EntityBoss } from '../js/entities.js';
import { Boss as DirectBoss } from '../js/bosses.js';

test('Boss 재export와 bosses.js 직접 import가 동일 클래스', () => {
  assert.equal(EntityBoss, DirectBoss);
});

test('new Boss 기본값: dead=false, hp=maxHp, pattern·spriteId 존재', () => {
  const b = new EntityBoss(480, 1, 1);
  assert.equal(b.dead, false);
  assert.equal(b.hp, b.maxHp);
  assert.ok(b.pattern, 'pattern 존재');
  assert.ok(b.spriteId, 'spriteId 존재');
});
