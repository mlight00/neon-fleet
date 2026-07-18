import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createLoadout, activeSlots, findSlot, isFull, slotWeapons, hasPair, levelOf,
  equip, replaceSlot, levelUp, loadoutFromLegacy, legacyView, SLOT_NAMES,
} from '../js/weapon-loadout.js';

// Gate 1 §5.3 — 무기 2슬롯 독립성·장착 규칙·호환 어댑터 검증.

test('시작 로드아웃: main=시작무기 Lv1, wing 비어 있음', () => {
  const lo = createLoadout('vulcan');
  assert.deepEqual(SLOT_NAMES, ['main', 'wing']);
  assert.equal(lo.slots[0].weaponId, 'vulcan');
  assert.equal(lo.slots[0].level, 1);
  assert.equal(lo.slots[1].weaponId, null);
  assert.equal(activeSlots(lo).length, 1);      // 발사 대상은 1개
  assert.equal(isFull(lo), false);
});

test('새 무기 획득은 기존 무기를 교체하지 않고 빈 wing에 장착한다', () => {
  const lo = createLoadout('vulcan');
  const r = equip(lo, 'laser');
  assert.equal(r.result, 'equipped');
  assert.equal(r.filledWing, true);
  assert.deepEqual(slotWeapons(lo), ['vulcan', 'laser']);   // 발칸 유지
  assert.equal(activeSlots(lo).length, 2);                   // 두 무기 동시 발사 대상
  assert.equal(isFull(lo), true);
});

test('두 슬롯은 독립 레벨을 가진다', () => {
  const lo = createLoadout('vulcan');
  equip(lo, 'laser');
  equip(lo, 'vulcan');   // vulcan 레벨업
  equip(lo, 'vulcan');   // 또 레벨업(→3)
  assert.equal(levelOf(lo, 'vulcan'), 3);
  assert.equal(levelOf(lo, 'laser'), 1);        // 레이저는 그대로
});

test('이미 장착한 무기 재획득은 레벨업(maxLv 상한)', () => {
  const lo = createLoadout('vulcan');
  const a = equip(lo, 'vulcan', 3);
  assert.equal(a.result, 'leveled');
  assert.equal(levelOf(lo, 'vulcan'), 2);
  equip(lo, 'vulcan', 3); // →3
  const capped = equip(lo, 'vulcan', 3); // 3에서 상한
  assert.equal(capped.changed, false);
  assert.equal(levelOf(lo, 'vulcan'), 3);
});

test('슬롯이 가득 차면 새 무기는 full — 자동 교체 안 함', () => {
  const lo = createLoadout('vulcan');
  equip(lo, 'laser');
  const r = equip(lo, 'homing');   // 세 번째 무기
  assert.equal(r.result, 'full');
  assert.deepEqual(slotWeapons(lo), ['vulcan', 'laser']);  // 빌드 안 바뀜
});

test('명시적 교체만 슬롯 무기를 바꾼다', () => {
  const lo = createLoadout('vulcan');
  equip(lo, 'laser');
  const r = replaceSlot(lo, 'wing', 'homing');
  assert.equal(r.result, 'replaced');
  assert.equal(r.prev, 'laser');
  assert.deepEqual(slotWeapons(lo), ['vulcan', 'homing']);
  assert.equal(levelOf(lo, 'homing'), 1);   // 교체 무기는 Lv1
});

test('공명 쌍 판정: 두 무기가 모두 장착돼야 true', () => {
  const lo = createLoadout('vulcan');
  assert.equal(hasPair(lo, ['vulcan', 'laser']), false);
  equip(lo, 'laser');
  assert.equal(hasPair(lo, ['vulcan', 'laser']), true);
  assert.equal(hasPair(lo, ['vulcan', 'homing']), false);
});

test('구 단일 무기 구조 ↔ 로드아웃 호환 어댑터', () => {
  const lo = loadoutFromLegacy('laser', 2);
  assert.equal(lo.slots[0].weaponId, 'laser');
  assert.equal(lo.slots[0].level, 2);
  assert.equal(lo.slots[1].weaponId, null);
  const legacy = legacyView(lo);
  assert.deepEqual(legacy, { weapon: 'laser', weaponLv: 2 });
});

test('levelUp: 미장착 무기는 false, 장착 무기는 상한까지', () => {
  const lo = createLoadout('vulcan');
  assert.equal(levelUp(lo, 'homing'), false);
  assert.equal(levelUp(lo, 'vulcan', 3), true);
  assert.equal(levelOf(lo, 'vulcan'), 2);
});
