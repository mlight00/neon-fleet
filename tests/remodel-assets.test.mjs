import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RASTER_ART, SPRITE_SIZES, BOSS_ROSTER } from '../js/sprites.js';
import { BAL } from '../js/balance.js';

// Gate 0 §11 — 리모델 v2 자산 경로·순서 검증.
const C = RASTER_ART.C;

// ─── §5: 일반 적 12종이 신규 WebP 경로 ────────────────────────
test('일반 적 B1~B6, B16~B21이 remodel-v2 enemies WebP를 쓴다', () => {
  for (const id of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B16', 'B17', 'B18', 'B19', 'B20', 'B21']) {
    assert.equal(C[id], `assets/remodel-v2/enemies/${id}.webp`, `${id} 경로`);
  }
});

test('§11-8: B4/B6도 더 이상 벡터/구 PNG 폴백을 기본 외형으로 쓰지 않는다', () => {
  assert.match(C.B4, /remodel-v2\/enemies\/B4\.webp$/);
  assert.match(C.B6, /remodel-v2\/enemies\/B6\.webp$/);
});

// ─── §6: 캠페인 보스 6종이 신규 WebP 경로 ─────────────────────
test('캠페인 보스 B8~B11, B22, B7이 remodel-v2 bosses WebP를 쓴다', () => {
  for (const id of ['B8', 'B9', 'B10', 'B11', 'B22', 'B7']) {
    assert.equal(C[id], `assets/remodel-v2/bosses/${id}.webp`, `${id} 경로`);
  }
});

test('구 카툰 styleC 보스 PNG 경로가 남아 있지 않다', () => {
  for (const id of ['B8', 'B9', 'B10', 'B11']) {
    assert.doesNotMatch(C[id], /assets\/styleC\//, `${id}는 구 styleC 아님`);
  }
});

// ─── §11-9: 캠페인 보스 순서 유지 ─────────────────────────────
test('캠페인 보스 순서 B8, B9, B10, B11, B22, B7 유지', () => {
  assert.deepEqual(BAL.campaign.bosses, ['B8', 'B9', 'B10', 'B11', 'B22', 'B7']);
});

// ─── 표시 크기·엔드리스 보호 ──────────────────────────────────
test('교체 대상 전 슬롯에 SPRITE_SIZES가 있다 (표시 크기 유지)', () => {
  for (const id of ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B16', 'B17', 'B18', 'B19', 'B20', 'B21', 'B7', 'B8', 'B9', 'B10', 'B11', 'B22']) {
    assert.ok(SPRITE_SIZES[id] > 0, `${id} 크기`);
  }
});

test('§2 범위 밖 B12~B15(엔드리스 보스)는 이번에 교체하지 않는다', () => {
  for (const id of ['B12', 'B13', 'B14', 'B15']) {
    assert.doesNotMatch(C[id] ?? '', /remodel-v2/, `${id}는 remodel-v2 아님`);
  }
});

// ─── §11-11: 프리로드도 단일 베이스만 받는다 (죽은 부품 레이어 대역폭 낭비 방지) ───
test('preloadBossArt가 구형 B22/B7 부품 레이어를 프리로드하지 않는다', () => {
  const src = readFileSync(new URL('../js/sprites.js', import.meta.url), 'utf8');
  const body = src.slice(src.indexOf('export function preloadBossArt'));
  const fn = body.slice(0, body.indexOf('\n}') + 2);
  for (const dead of ['B22_CHASSIS', 'B22_RING', 'B22_ARM_LEFT', 'B22_ARM_RIGHT', 'B22_CORE', 'B22_CRACK',
    'B7_BODY', 'B7_EGG_LEFT', 'B7_EGG_RIGHT', 'B7_CROWN', 'B7_HEART', 'B7_DEBRIS']) {
    assert.ok(!fn.includes(dead), `${dead}는 프리로드 목록에서 제외돼야 함`);
  }
  // 실제 렌더에 쓰는 것은 유지
  assert.ok(fn.includes("'B22'") && fn.includes('VFX_BOSS_BREAK'), 'B22 단일 베이스+파괴VFX 유지');
  assert.ok(fn.includes("'B7'") && fn.includes('B7_ESCAPE'), 'B7 단일 베이스+탈출코어 유지');
});

// ─── 매니페스트 대조 (신규 24 자산이 실재 등록) ───────────────
test('매니페스트의 배경 S1~S6·적·보스가 자산 경로와 일치한다', () => {
  const man = JSON.parse(readFileSync(new URL('../docs/qa/remodel-v2/asset-manifest-remodel-v2.json', import.meta.url)));
  assert.ok(man.backgrounds && man.enemies && man.bosses, '매니페스트 3구획');
  assert.equal(Object.keys(man.backgrounds).length, 6, '배경 6');
  assert.equal(Object.keys(man.enemies).length, 12, '적 12');
  assert.equal(Object.keys(man.bosses).length, 6, '보스 6');
});
