import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSave, SAVE_VERSION } from '../js/save.js';
import { firstDefeatUpgradeOptions, FIRST_DEFEAT_KEYS } from '../js/logic.js';

// P0-A: 첫 실제 사망 무료 긴급 개조 (작업지시서 §7.1).
// 저장·자격은 행동으로, 지급/게이팅 배선은 소스로 검증한다.

const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const UPG = { drones: { step: 2, unit: '기' }, hull: { step: 16, unit: '' }, dmg: { step: 0.1, unit: '' }, rate: {}, coin: {}, magnet: {}, cruiser: {} };
const fullUp = { drones: 0, dmg: 0, rate: 0, coin: 0, magnet: 0, hull: 0, cruiser: 0 };
const mockStore = (seed) => { const m = new Map(); if (seed) m.set('neonFleet.v1', JSON.stringify(seed)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('FD-01: 구 버전 저장을 불러오면 firstDefeatUpgrade=null 백필 + SAVE_VERSION 3', () => {
  const s = createSave(mockStore({ saveVersion: 2, coins: 37, up: { drones: 1 }, stageMigrated: true }));
  const d = s.get();
  assert.equal(SAVE_VERSION, 3);
  assert.equal(d.saveVersion, 3);
  assert.equal(d.firstDefeatUpgrade, null);
  assert.equal(d.coins, 37, '기존 코인 보존');
  assert.equal(d.up.drones, 1, '기존 강화 레벨 보존');
});

test('FD-02: 같은 구 저장을 여러 번 불러와도 강화 레벨이 변하지 않는다(멱등)', () => {
  const store = mockStore({ saveVersion: 2, up: { drones: 3, hull: 2 }, stageMigrated: true });
  createSave(store); createSave(store); createSave(store);
  const d = createSave(store).get();
  assert.equal(d.up.drones, 3);
  assert.equal(d.up.hull, 2);
});

test('FD-03: 새 저장은 무료 선택 자격이 있다(세 항목)', () => {
  assert.deepEqual(firstDefeatUpgradeOptions({ firstDefeatUpgrade: null, up: fullUp }, UPG, 10), ['drones', 'hull', 'dmg']);
});

test('FD-04: quit·완료·개발종료(BossLab)는 자격을 만들지 않는다 (실사망만 계산 — endExpedition 게이트)', () => {
  // firstDefeatUpgradeOptions는 저장만 본다; reason 게이팅은 endExpedition의 분기가 담당.
  // death여도 개발용 BossLab(r.bossLab) 사망은 제외한다(Codex P2: 개발 화면 사망이 첫 사망 혜택을 소모하면 안 됨).
  assert.match(mainSrc, /const freeKeys = reason === 'death' && !r\.bossLab\s*\n?\s*\? firstDefeatUpgradeOptions/);
});

test('FD-05: 하나를 고르면 그 레벨만 +1 (지급 로직)', () => {
  const store = mockStore({ saveVersion: 3, coins: 12, firstDefeatUpgrade: null, up: { ...fullUp } });
  const s = createSave(store);
  const d = s.get();
  s.set({ up: { ...d.up, hull: (d.up.hull || 0) + 1 }, firstDefeatUpgrade: 'hull' });
  const after = s.get();
  assert.equal(after.up.hull, 1);
  assert.equal(after.up.drones, 0, '다른 항목 불변');
  assert.equal(after.firstDefeatUpgrade, 'hull');
});

test('FD-06: 무료 선택 전후 코인이 동일하다', () => {
  const store = mockStore({ saveVersion: 3, coins: 12, firstDefeatUpgrade: null, up: { ...fullUp } });
  const s = createSave(store);
  s.set({ up: { ...s.get().up, drones: 1 }, firstDefeatUpgrade: 'drones' });
  assert.equal(s.get().coins, 12);
  // 지급 콜백이 코인을 건드리지 않는다(소스): set에 coins 키가 없다
  assert.match(mainSrc, /save\.set\(\{ up: \{ \.\.\.d\.up, \[key\]: lv \+ 1 \}, firstDefeatUpgrade: key \}\)/);
});

test('FD-07: 허용되지 않은 키는 거부된다', () => {
  assert.deepEqual(FIRST_DEFEAT_KEYS, ['drones', 'hull', 'dmg']);
  assert.ok(!FIRST_DEFEAT_KEYS.includes('coin') && !FIRST_DEFEAT_KEYS.includes('magnet') && !FIRST_DEFEAT_KEYS.includes('rate') && !FIRST_DEFEAT_KEYS.includes('cruiser'));
  assert.match(mainSrc, /if \(!FIRST_DEFEAT_KEYS\.includes\(key\)\) return/);
});

test('FD-08: 최대 레벨 항목은 선택 후보에서 제외된다', () => {
  const opts = firstDefeatUpgradeOptions({ firstDefeatUpgrade: null, up: { drones: 10, hull: 0, dmg: 10 } }, UPG, 10);
  assert.deepEqual(opts, ['hull']);
  const none = firstDefeatUpgradeOptions({ firstDefeatUpgrade: null, up: { drones: 10, hull: 10, dmg: 10 } }, UPG, 10);
  assert.deepEqual(none, []);
  assert.match(mainSrc, /if \(!def \|\| lv >= BAL\.hangar\.maxLv\) return/);
});

test('FD-09: 이미 받은 뒤에는 자격이 없다(두 번째 사망·재호출·연속 클릭 무효)', () => {
  assert.deepEqual(firstDefeatUpgradeOptions({ firstDefeatUpgrade: 'drones', up: fullUp }, UPG, 10), []);
  assert.match(mainSrc, /if \(d\.firstDefeatUpgrade != null\) return/, '지급 콜백이 이미 받음을 재검사');
});

test('FD-10: 전체 초기화 후 firstDefeatUpgrade·up이 기본값으로 복귀한다', () => {
  const store = mockStore({ saveVersion: 3, coins: 999, firstDefeatUpgrade: 'dmg', up: { ...fullUp, dmg: 5 }, snd: { bgm: 0.3, sfx: 0.5, mute: true }, introSeen: true });
  const s = createSave(store);
  const fresh = s.reset();
  assert.equal(fresh.firstDefeatUpgrade, null);
  assert.equal(fresh.up.dmg, 0);
  assert.equal(fresh.coins, 0);
  assert.deepEqual(fresh.snd, { bgm: 0.3, sfx: 0.5, mute: true }, '사운드는 보존');
  assert.equal(fresh.introSeen, true, '인트로 시청 여부 보존');
});

test('FD-11: 완료 문구는 방금 지급한 흐름에서만(이후 사망엔 카드도 문구도 없음)', () => {
  // 실측으로 잡은 회귀: justClaimed 플래그로 완료 문구를 최초 지급 재렌더에만 표시.
  assert.match(mainSrc, /function showLoseResult\(snap, freeKeys, justClaimed = false\)/);
  assert.match(mainSrc, /showLoseResult\(snap, \[\], true\)/, '지급 후 재렌더는 justClaimed=true');
  assert.match(mainSrc, /\} else if \(justClaimed\) \{/, '완료 문구는 justClaimed일 때만');
});
