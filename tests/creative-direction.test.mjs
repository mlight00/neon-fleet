import test from 'node:test';
import assert from 'node:assert/strict';
import { STORY, ZONES, zoneForSector, upgradeGrade, flagshipProfile } from '../js/creative-direction.js';

test('6개 배경 구역은 섹터 1~6에 1:1 대응하고 7+는 최종 구역을 유지한다 (Gate 0 §4.4)', () => {
  // 리모델 지시서 §4.2: 이전 (sector-1)/2 두 섹터 묶음을 폐기하고 섹터마다 다른 구역을 쓴다.
  assert.equal(zoneForSector(1).id, 'cold-wake');
  assert.equal(zoneForSector(2).id, 'prism-grave');
  assert.equal(zoneForSector(3).id, 'furnace-line');
  assert.equal(zoneForSector(4).id, 'broken-armada');
  assert.equal(zoneForSector(5).id, 'choir-veil');
  assert.equal(zoneForSector(6).id, 'crown-core');
  assert.equal(zoneForSector(7).id, 'crown-core');   // 7+ 최종 구역 고정
  assert.equal(zoneForSector(99).id, 'crown-core');
});

test('구역은 6개이며 모두 서로 다른 id를 가진다', () => {
  assert.equal(ZONES.length, 6);
  assert.equal(new Set(ZONES.map((z) => z.id)).size, 6);
});

test('업그레이드 연출 등급은 무기 레벨보다 진화와 기함 승급을 크게 취급한다', () => {
  assert.equal(upgradeGrade('weapon', 1), 1);
  assert.equal(upgradeGrade('weapon', 3), 3);
  assert.equal(upgradeGrade('switch'), 2);
  assert.equal(upgradeGrade('evolution'), 4);
  assert.equal(upgradeGrade('super'), 5);
  assert.equal(upgradeGrade('flagship'), 5);
});

test('기함 정체성과 티어 프로필은 유효 범위로 고정된다', () => {
  assert.equal(STORY.flagship, 'NF-0 LUMEN');
  assert.equal(flagshipProfile(-2).tier, 0);
  assert.equal(flagshipProfile(20).tier, 5);
  assert.ok(flagshipProfile(5).mountPresence > flagshipProfile(0).mountPresence);
});
