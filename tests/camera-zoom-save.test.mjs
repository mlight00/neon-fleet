import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../js/save.js';
import { safeZoom } from '../js/camera-zoom.js';

// §7: 카메라 배율은 진행도가 아니라 보기 설정. 백필·왕복·reset 유지·손상 복구.
const mockStore = (seed) => { const m = new Map(); if (seed) m.set('neonFleet.v1', JSON.stringify(seed)); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) }; };

test('CS-01: 구 저장(view 없음) → 100% 안전 백필', () => {
  const s = createSave(mockStore({ saveVersion: 3, coins: 50, stageMigrated: true }));
  assert.deepEqual(s.get().view, { zoom: 1.0 });
});

test('CS-02: view.zoom 저장·복원 왕복(새로고침 후 유지)', () => {
  const store = mockStore();
  createSave(store).set({ view: { zoom: 1.15 } });
  assert.equal(createSave(store).get().view.zoom, 1.15);
});

test('CS-03: reset 후에도 zoom 유지(사운드·인트로처럼), 진행도는 초기화', () => {
  const store = mockStore({ saveVersion: 3, coins: 999, best: 500, view: { zoom: 1.30 }, snd: { bgm: 0.3, sfx: 0.5, mute: true }, up: { drones: 5 }, introSeen: true, stageMigrated: true });
  const fresh = createSave(store).reset();
  assert.equal(fresh.view.zoom, 1.30, '카메라 배율 유지');
  assert.equal(fresh.coins, 0); assert.equal(fresh.best, 0); assert.equal(fresh.up.drones, 0);
  assert.deepEqual(fresh.snd, { bgm: 0.3, sfx: 0.5, mute: true });
  assert.equal(fresh.introSeen, true);
});

test('CS-04: 손상 zoom(NaN·9·0.1·문자열·비격자)은 카메라 경계 safeZoom에서 복구', () => {
  for (const [raw, exp] of [[NaN, 1.0], [9, 2.20], [0.1, 1.0], ['x', 1.0], [1.04, 1.0], [Infinity, 1.0]]) {
    assert.equal(safeZoom(raw), exp, `${String(raw)} → ${exp}`);
  }
  // 저장에 손상값이 있어도 소비 측(createCamera(safeZoom(...)))에서 안전값으로 복구
  const s = createSave(mockStore({ saveVersion: 3, view: { zoom: 9 }, stageMigrated: true }));
  assert.equal(safeZoom(s.get().view.zoom), 2.20);
});

test('CS-05: view 추가가 진행·코인·해금·사운드·강화를 손상하지 않음', () => {
  const d = createSave(mockStore({ saveVersion: 3, best: 120, coins: 40, up: { drones: 3, hull: 2 }, snd: { bgm: 0.2, sfx: 0.3, mute: false }, endlessUnlocked: true, firstDefeatUpgrade: 'hull', stageMigrated: true })).get();
  assert.equal(d.best, 120); assert.equal(d.coins, 40);
  assert.equal(d.up.drones, 3); assert.equal(d.up.hull, 2);
  assert.equal(d.endlessUnlocked, true); assert.equal(d.firstDefeatUpgrade, 'hull');
  assert.deepEqual(d.snd, { bgm: 0.2, sfx: 0.3, mute: false });
  assert.equal(d.view.zoom, 1.0);
  assert.equal(d.saveVersion, 3, 'SAVE_VERSION 불변(백필로 충분 — 불필요한 버전 상향 없음)');
});

test('CS-06: 부분 view(zoom 없는)도 안전 병합', () => {
  const d = createSave(mockStore({ saveVersion: 3, view: {}, stageMigrated: true })).get();
  assert.equal(d.view.zoom, 1.0, '누락 zoom은 기본 백필');
});
