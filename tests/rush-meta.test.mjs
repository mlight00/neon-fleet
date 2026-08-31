// rush-meta — 저장·업그레이드·일일·연출 상태기계. 재미설계의 규칙 수치를 그대로 잠근다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../rush/save.js';
import { upCost, buy, effects } from '../rush/upgrades.js';
import { todayKey, isFirstRunToday, shareText } from '../rush/daily.js';
import { recordWatcher, slowmoCtl, continueToken } from '../rush/fx-state.js';
import { SPRITE_KEYS } from '../rush/sprites.js';

const memStorage = () => { const m = new Map(); return {
  getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };

test('SAVE-ROUNDTRIP: 저장·복원·부분 갱신', () => {
  const st = memStorage();
  const s1 = createSave(st);
  s1.patch({ coins: 120, best: 88 });
  const s2 = createSave(st);
  assert.equal(s2.get().coins, 120);
  assert.equal(s2.get().best, 88);
  assert.equal(s2.get().up.startTroops, 0);
});

test('UP-BUY: 비용 차감·상한·잔액 부족', () => {
  const s = createSave(memStorage());
  s.patch({ coins: 35 });
  assert.equal(upCost('startTroops', 0), 30);
  assert.equal(buy(s, 'startTroops'), true);
  assert.equal(s.get().coins, 5);
  assert.equal(s.get().up.startTroops, 1);
  assert.equal(buy(s, 'startTroops'), false, '잔액 부족');
  s.patch({ up: { ...s.get().up, fireRate: 5 } });
  assert.equal(upCost('fireRate', 5), null, '상한 도달');
  assert.equal(buy(s, 'fireRate'), false);
});

test('UP-EFFECT: 효과 환산과 오늘의 도전 미적용', () => {
  const up = { startTroops: 3, fireRate: 2, magnet: 1 };
  assert.deepEqual(effects(up, false), { startCount: 4, fireRateMult: 1.1, magnetMult: 1.1 });
  assert.deepEqual(effects(up, true), { startCount: 1, fireRateMult: 1, magnetMult: 1 });
});

test('DAILY: 첫판 판정과 자랑 문구', () => {
  assert.match(todayKey(), /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(isFirstRunToday({ lastPlayDay: '2026-08-31' }, '2026-09-01'), true);
  assert.equal(isFirstRunToday({ lastPlayDay: '2026-09-01' }, '2026-09-01'), false);
  assert.equal(shareText('2026-09-01', 312), '스타포지 러시 9/1 도전 — 병력 312!');
});

test('FX-RECORD: 갱신 순간 1회만 break', () => {
  const w = recordWatcher(50);
  assert.equal(w.update(49), null);
  assert.equal(w.update(51), 'break');
  assert.equal(w.update(60), null, '두 번째는 연출 없음');
});

test('FX-SLOWMO: ≤5 진입 시 0.4배 0.5초, 판당 최대 2회', () => {
  const s = slowmoCtl();
  assert.equal(s.update(10, 1 / 60), 1);
  assert.equal(s.update(5, 1 / 60), 0.4);         // 진입
  let t = 0, scale = 0.4;
  while (scale !== 1 && t < 2) { scale = s.update(5, 1 / 60); t += 1 / 60; }
  assert.ok(t >= 0.45 && t <= 0.6, '지속 0.5초 안팎: ' + t.toFixed(2));
  s.update(10, 1 / 60);
  assert.equal(s.update(4, 1 / 60), 0.4, '2회차');
  s.update(10, 1 / 60);
  for (let i = 0; i < 60; i++) s.update(10, 1 / 60);
  assert.equal(s.update(3, 1 / 60), 1, '3회차는 없음');
});

test('FX-CONTINUE: 판당 1회, 오늘의 도전 불가', () => {
  const c = continueToken(false);
  assert.equal(c.canUse(), true);
  assert.equal(c.use(), true);
  assert.equal(c.canUse(), false);
  assert.equal(continueToken(true).canUse(), false);
});

test('SPRITES-KEYS: 11종 키가 파일명 규약과 일치한다', () => {
  assert.equal(Object.keys(SPRITE_KEYS).length, 11);
  assert.equal(SPRITE_KEYS.m1, 'M01');
  assert.equal(SPRITE_KEYS.e_boss, 'E5_crownbreaker');
  assert.equal(SPRITE_KEYS.gate, 'GATE');
});
