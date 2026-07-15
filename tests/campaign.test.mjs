import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignBossId } from '../js/logic.js';
import { bossDefById } from '../js/sprites.js';
import { createSave } from '../js/save.js';
import { BAL } from '../js/balance.js';

const CB = BAL.campaign.bosses, EB = BAL.campaign.endlessBosses;
const mkSave = (seed) => {
  const mem = new Map(); if (seed) mem.set('neonFleet.v1', JSON.stringify(seed));
  return createSave({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v) });
};

// Phase D §6.6 — 캠페인 엔딩·엔드리스.

// ─── 1·2. 캠페인 보스 순서 ──────────────────────────────────
test('캠페인 섹터 1~6 보스 순서 = B8,B9,B10,B11,B22,B7', () => {
  const got = [1, 2, 3, 4, 5, 6].map((s) => campaignBossId(s, 'campaign', CB, EB));
  assert.deepEqual(got, ['B8', 'B9', 'B10', 'B11', 'B22', 'B7']);
});

test('섹터 6 보스는 B7 하이브 퀸', () => {
  assert.equal(campaignBossId(6, 'campaign', CB, EB), 'B7');
  assert.equal(bossDefById('B7').korName, '하이브 퀸');
  assert.equal(BAL.campaign.sectors, 6);           // 최종 섹터
});

test('캠페인 섹터가 상한을 넘어도 마지막 보스로 고정(안전)', () => {
  assert.equal(campaignBossId(7, 'campaign', CB, EB), 'B7');   // 캠페인은 6에서 끝 — 방어적 클램프
});

// ─── 엔드리스 보스 순환 ─────────────────────────────────────
test('엔드리스는 캠페인 이후 섹터(7)부터 endlessBosses를 순환', () => {
  assert.equal(campaignBossId(7, 'endless', CB, EB), EB[0]);        // B12
  assert.equal(campaignBossId(8, 'endless', CB, EB), EB[1]);        // B13
  assert.equal(campaignBossId(11, 'endless', CB, EB), EB[4]);       // B22
  assert.equal(campaignBossId(12, 'endless', CB, EB), EB[0]);       // 다시 B12 (순환)
});

// ─── 4. 캠페인 완료·엔드리스 해금 저장 ──────────────────────
test('campaignCleared·endlessUnlocked 기본값 false, 설정 시 저장', () => {
  const s = mkSave();
  assert.equal(s.get().campaignCleared, false);
  assert.equal(s.get().endlessUnlocked, false);
  s.set({ campaignCleared: true, endlessUnlocked: true });
  assert.equal(s.get().campaignCleared, true);
  assert.equal(s.get().endlessUnlocked, true);
});

// ─── 6. 구버전 저장 로드 시 기존 데이터 보존 (필드 병합만) ──
test('구버전 저장(신규 필드 없음) 로드 → 기존 데이터 보존 + 신규 필드는 기본값', () => {
  const old = { best: 300, coins: 700, stage: 5, stageMigrated: true, introSeen: true, up: { drones: 4, dmg: 2, rate: 1, coin: 3 }, snd: { bgm: 0.3, sfx: 0.6, mute: false } };
  const d = mkSave(old).get();
  assert.equal(d.best, 300);                 // 보존
  assert.equal(d.coins, 700);
  assert.equal(d.stage, 5);
  assert.deepEqual(d.up, { drones: 4, dmg: 2, rate: 1, coin: 3 });
  assert.equal(d.introSeen, true);
  assert.equal(d.campaignCleared, false);    // 신규 필드는 기본값 병합
  assert.equal(d.endlessUnlocked, false);
  assert.equal(d.endlessBest, 0);
});

// ─── 7. 엔드리스 기록과 캠페인 기록 분리 ────────────────────
test('endlessBest는 캠페인 best/stage와 별도 필드', () => {
  const s = mkSave({ best: 500, stage: 6, stageMigrated: true });
  s.set({ endlessBest: 9 });
  const d = s.get();
  assert.equal(d.endlessBest, 9);            // 엔드리스 기록
  assert.equal(d.best, 500);                 // 캠페인 화력 기록 불변
  assert.equal(d.stage, 6);                  // 캠페인 최고 섹터 불변
});
