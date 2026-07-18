import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Gate 0 §11-10/11 — B22/B7이 모든 페이즈에서 단일 베이스로 렌더되는지 소스 정적 검증.
// (렌더는 캔버스라 순수 함수로 못 재므로, "구형 부품 레이어 통째 소거 분기가 없다"를 소스로 고정)
const src = readFileSync(new URL('../js/bosses.js', import.meta.url), 'utf8');

test('NeonArbiter/HiveQueen 렌더가 구형 부품 레이어 스프라이트를 합성하지 않는다', () => {
  // 이 스프라이트들은 신규 단일 베이스와 좌표·실루엣이 달라 겹치면 "쪼개져" 보인다.
  const forbidden = ['B22_CHASSIS', 'B22_RING', 'B22_ARM_LEFT', 'B22_ARM_RIGHT', 'B22_CORE', 'B22_CRACK',
    'B7_BODY', 'B7_EGG_LEFT', 'B7_EGG_RIGHT', 'B7_CROWN', 'B7_HEART'];
  for (const id of forbidden) {
    assert.ok(!src.includes(`getSprite('${id}')`), `${id} 레이어를 렌더에 쓰지 않아야 함`);
  }
});

test('B22/B7은 신규 단일 베이스 스프라이트를 사용한다', () => {
  assert.ok(src.includes("getSprite('B22')"), 'B22 단일 베이스');
  assert.ok(src.includes("getSprite('B7')"), 'B7 단일 베이스');
});

test('4단계 탈출 코어만 별도 개체로 허용된다 (§8)', () => {
  assert.ok(src.includes("getSprite('B7_ESCAPE')"), 'B7_ESCAPE는 4단계 전용으로 유지');
});

test('페이즈에 따라 베이스를 숨기는 hivePhase>=N ? (다른 스프라이트) 분기가 없다', () => {
  // 단일 베이스는 항상 그려야 한다. blit(base ...)가 페이즈 조건 밖에 있는지 대략 확인.
  assert.ok(src.match(/blit\(ctx, base, 0, 0, sc\)/g)?.length >= 2, 'B22·B7 모두 무조건 base blit');
});
