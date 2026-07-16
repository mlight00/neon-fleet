import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Squad } from '../js/entities.js';
import { BAL } from '../js/balance.js';

// 강등 안전망(onDronesDepleted) 회귀 테스트.
// 버그: applyDelta가 checkEvolution(드론→순양함 합체)으로 count가 0이 된 것을
// '전멸'로 오판해, 승급 직후 등급이 거꾸로 강등되던 문제(인터셉터 → 스카웃).

const noop = () => {};
const E = BAL.escort;
function makeWorld(sq) {
  return {
    squad: sq, logicalW: 480, logicalH: 776, enemyBullets: [], bullets: [], entities: [], bosses: [],
    coins: 0, addCoins(n) { this.coins += n; },
    stats: { startCount: BAL.squad.start },
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop }, mfx: {},
  };
}
function mkSquad({ count, cruisers = 0, tier = 0 }) {
  const s = new Squad(480, 776, count); s.x = 240; s.y = 640;
  s.count = count; s.cruisers = cruisers; s.tier = tier;
  return s;
}

// ─── 핵심 회귀: 합체로 드론이 0이 돼도 강등되면 안 된다 ───────────
test('드론이 순양함으로 합체돼 0이 되어도 등급이 강등되지 않는다 (승급 역강등 버그)', () => {
  const need = E.dronesPerCruiser;
  const s = mkSquad({ count: need - 5, cruisers: 0, tier: 1 });   // 인터셉터, 순양함 0(승급으로 소진한 상태)
  const w = makeWorld(s);
  s.applyDelta(5, w);            // 정확히 need 도달 → 전량 합체 → 잔여 드론 0
  assert.equal(s.cruisers, 1, '순양함 1척으로 합체');
  assert.equal(s.count, 0, '합체로 잔여 드론 0');
  assert.equal(s.tier, 1, '합체는 소모이지 전멸이 아니다 → 등급 유지(강등 금지)');
  assert.equal(s.dead, false, '사망 아님');
});

test('최하 등급(스카웃)에서도 합체로 0이 되면 사망하지 않는다', () => {
  const s = mkSquad({ count: E.dronesPerCruiser, cruisers: 0, tier: 0 });
  const w = makeWorld(s);
  s.applyDelta(0, w);            // checkEvolution만 태워도 합체 발생
  assert.equal(s.dead, false, '합체로 드론 0 → 사망 금지');
});

// ─── 진짜 전멸은 여전히 안전망이 동작해야 한다 ──────────────────
test('피해로 드론이 0이 되면 순양함 1척을 희생해 재건 (등급 유지)', () => {
  const s = mkSquad({ count: 10, cruisers: 2, tier: 1 });
  const w = makeWorld(s);
  s.applyDelta(-10, w);          // 전멸
  assert.equal(s.cruisers, 1, '순양함 1척 희생');
  assert.equal(s.tier, 1, '순양함이 있으면 등급 유지');
  assert.equal(s.count, BAL.squad.start, '편대 재건');
  assert.equal(s.dead, false);
});

test('순양함이 없으면 피해 전멸 시 한 등급 강등 후 재건', () => {
  const s = mkSquad({ count: 10, cruisers: 0, tier: 1 });   // 인터셉터
  const w = makeWorld(s);
  s.applyDelta(-10, w);
  assert.equal(s.tier, 0, '스카웃으로 강등(안전망 정상 동작)');
  assert.equal(s.count, BAL.squad.start, '편대 재건');
  assert.equal(s.dead, false);
});

test('최하 등급 + 순양함 없이 피해 전멸 = 진짜 사망', () => {
  const s = mkSquad({ count: 10, cruisers: 0, tier: 0 });
  const w = makeWorld(s);
  s.applyDelta(-10, w);
  assert.equal(s.dead, true, '스카웃에서 전멸하면 사망');
});
