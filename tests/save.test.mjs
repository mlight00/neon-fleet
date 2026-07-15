import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSave } from '../js/save.js';

test('저장/로드 왕복', () => {
  const mem = new Map();
  const fake = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = createSave(fake);
  s.set({ best: 120 });
  assert.equal(createSave(fake).get().best, 120);
  assert.equal(s.available, true);
});

test('기본값: 저장 없으면 best 0, coins 0, stage 1, style C(미선택), 강화 0', () => {
  const mem = new Map();
  const fake = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = createSave(fake);
  assert.deepEqual(s.get(), {
    best: 0, coins: 0, stage: 1, style: 'C', styleChosen: false, introSeen: false, firstGuideSeen: false, stageMigrated: true,
    up: { drones: 0, dmg: 0, rate: 0, coin: 0 },
    snd: { bgm: 0.5, sfx: 0.8, mute: false },
  });
});

test('stage 마이그레이션: 옛 부풀려진 stage(내부 난이도)를 섹터로 1회 환산', () => {
  const cases = [[6, 1], [12, 2], [18, 3], [1, 1], [7, 2]];   // 옛 stage → 섹터
  for (const [old, expected] of cases) {
    const mem = new Map([['neonFleet.v1', JSON.stringify({ best: 100, coins: 50, stage: old })]]);
    const fake = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
    const s = createSave(fake);
    assert.equal(s.get().stage, expected, `old ${old} → ${expected}`);
    assert.equal(s.get().best, 100);                         // 다른 값은 보존
    // 재생성해도 다시 줄어들지 않음(멱등: 플래그로 재환산 차단)
    assert.equal(createSave(fake).get().stage, expected, `old ${old} 멱등`);
  }
});

test('마이그레이션: 신규 저장(stageMigrated=true)은 stage를 건드리지 않는다', () => {
  const mem = new Map([['neonFleet.v1', JSON.stringify({ stage: 3, stageMigrated: true })]]);
  const fake = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  assert.equal(createSave(fake).get().stage, 3);   // 섹터 3 그대로 유지
});

test('reset: 진행 초기화하되 사운드·인트로 시청 여부는 유지', () => {
  const mem = new Map();
  const fake = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const s = createSave(fake);
  s.set({ best: 500, coins: 999, stage: 7, introSeen: true, snd: { bgm: 0.2, sfx: 0.3, mute: true }, up: { drones: 5, dmg: 3, rate: 2, coin: 1 } });
  s.reset();
  const d = s.get();
  assert.equal(d.best, 0);
  assert.equal(d.coins, 0);
  assert.equal(d.stage, 1);
  assert.deepEqual(d.up, { drones: 0, dmg: 0, rate: 0, coin: 0 });
  assert.equal(d.introSeen, true);            // 유지
  assert.deepEqual(d.snd, { bgm: 0.2, sfx: 0.3, mute: true }); // 유지
});

test('구버전 저장(up/snd 없음)을 읽어도 기본값이 채워진다', () => {
  const mem = new Map([['neonFleet.v1', JSON.stringify({ best: 10, coins: 5, stage: 2 })]]);
  const fake = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) };
  const d = createSave(fake).get();
  assert.equal(d.best, 10);
  assert.deepEqual(d.up, { drones: 0, dmg: 0, rate: 0, coin: 0 });
  assert.deepEqual(d.snd, { bgm: 0.5, sfx: 0.8, mute: false });
});

test('깨진 JSON이면 기본값으로 복구', () => {
  const fake = { getItem: () => '{oops', setItem: () => {} };
  assert.equal(createSave(fake).get().best, 0);
});

test('storage 불능 시 메모리 폴백 + available=false', () => {
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const s = createSave(broken);
  assert.equal(s.available, false);
  s.set({ best: 5 });
  assert.equal(s.get().best, 5); // 세션 내 메모리 유지
});
