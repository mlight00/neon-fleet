import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave, SAVE_VERSION } from '../js/save.js';

// Gate 1 §10 — 세이브 마이그레이션: 구 저장 보존 + 새 필드 안전 백필 + 멱등.

/** 인메모리 localStorage 목. */
function makeStorage(initial) {
  const map = new Map(initial ? [[ 'neonFleet.v1', JSON.stringify(initial) ]] : []);
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    _raw: () => (map.has('neonFleet.v1') ? JSON.parse(map.get('neonFleet.v1')) : null),
  };
}

test('구 저장(코인·최고 섹터·클리어·엔드리스·사운드)을 보존한다', () => {
  const st = makeStorage({ coins: 1234, stage: 4, best: 9000, campaignCleared: true, endlessBest: 8,
    stageMigrated: true, snd: { bgm: 0.3, sfx: 0.9, mute: true } });
  const save = createSave(st);
  const d = save.get();
  assert.equal(d.coins, 1234);
  assert.equal(d.stage, 4);
  assert.equal(d.campaignCleared, true);
  assert.equal(d.endlessBest, 8);
  assert.deepEqual(d.snd, { bgm: 0.3, sfx: 0.9, mute: true });
});

test('새 필드가 없는 구 저장은 안전 기본값으로 백필된다', () => {
  const st = makeStorage({ coins: 50, stageMigrated: true });   // saveVersion·unlocks 없음
  const save = createSave(st);
  const d = save.get();
  assert.equal(d.saveVersion, SAVE_VERSION);
  assert.deepEqual(d.unlocks.startingWeapons, []);
  assert.deepEqual(d.unlocks.commandFrames, []);
  assert.deepEqual(d.blueprints, {});
  assert.equal(d.threatLevel, 0);
  assert.deepEqual(d.discoveredEnemies, []);
  assert.deepEqual(d.bossMemories, []);
});

test('saveVersion을 올리고 원본에 백필을 1회 기록한다', () => {
  const st = makeStorage({ coins: 50, stageMigrated: true });
  createSave(st);   // 생성 시 마이그레이션
  const rawAfter = st._raw();
  assert.equal(rawAfter.saveVersion, SAVE_VERSION);
  assert.ok(rawAfter.unlocks, '마이그레이션이 원본에 새 구조를 기록');
});

test('멱등: 같은 저장을 여러 번 로드해도 해금·설계도가 중복 생성되지 않는다', () => {
  const st = makeStorage({ coins: 50, stageMigrated: true,
    unlocks: { startingWeapons: ['laser'], commandFrames: [], fleetSystems: [], resonanceVariants: [] } });
  const a = createSave(st).get();
  const b = createSave(st).get();
  const c = createSave(st).get();
  assert.deepEqual(a.unlocks.startingWeapons, ['laser']);
  assert.deepEqual(b.unlocks.startingWeapons, ['laser']);   // 중복 append 없음
  assert.deepEqual(c.unlocks.startingWeapons, ['laser']);
});

test('신규 저장은 항상 현재 saveVersion을 가진다', () => {
  const st = makeStorage(null);
  const save = createSave(st);
  save.set({ coins: 10 });
  assert.equal(save.get().saveVersion, SAVE_VERSION);
});

test('reset은 진행을 지우되 saveVersion은 현재 버전을 유지한다', () => {
  const st = makeStorage({ coins: 999, stageMigrated: true });
  const save = createSave(st);
  const fresh = save.reset();
  assert.equal(fresh.coins, 0);
  assert.equal(save.get().saveVersion, SAVE_VERSION);
});
