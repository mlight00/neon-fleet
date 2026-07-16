import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Squad, EnemyShot } from '../js/entities.js';
import { BAL } from '../js/balance.js';

// 강등 안전망(onDronesDepleted) 회귀 테스트.
// 이 파일이 지키는 두 계약 — 서로 반대 방향이라 한쪽만 고치면 다른 쪽이 깨진다:
//  (A) 성장 소모로 count=0  → 강등·사망 금지 (드론 130기가 순양함 1척으로 합체되면 잔여 0)
//  (B) 실제 피해로 count=0  → 안전망이 정확히 한 번 작동 (합체로 이미 0이던 상태 포함)

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
  s.count = count; s.cruisers = cruisers; s.tier = tier; s.invulnT = 0;
  return s;
}
/** 정확히 전량 합체시켜 'count=0, cruisers=1' 상태를 만든다 (지시서 3.1 재현 상태). */
function mergedZero({ tier = 0, cruisers = null } = {}) {
  const s = mkSquad({ count: E.dronesPerCruiser, cruisers: 0, tier });
  const w = makeWorld(s);
  s.applyDelta(0, w);                       // checkEvolution → 합체 → count 0
  if (cruisers !== null) s.cruisers = cruisers;
  s.invulnT = 0;                            // 피격 가능 상태로 (합체 자체는 무적을 주지 않음)
  return { s, w };
}

// ─── (A) 성장 소모로 0 → 강등 금지 ────────────────────────────
test('[A] 드론이 순양함으로 합체돼 0이 되어도 등급이 강등되지 않는다 (승급 역강등 버그)', () => {
  const need = E.dronesPerCruiser;
  const s = mkSquad({ count: need - 5, cruisers: 0, tier: 1 });   // 인터셉터, 순양함 0(승급으로 소진)
  const w = makeWorld(s);
  s.applyDelta(5, w);            // 정확히 need 도달 → 전량 합체 → 잔여 0
  assert.equal(s.cruisers, 1, '순양함 1척으로 합체');
  assert.equal(s.count, 0, '합체로 잔여 드론 0');
  assert.equal(s.tier, 1, '합체는 소모이지 전멸이 아니다 → 등급 유지');
  assert.equal(s.dead, false);
});

test('[A] 최하 등급에서도 합체로 0이 되면 사망하지 않는다', () => {
  const { s } = mergedZero({ tier: 0 });
  assert.equal(s.count, 0);
  assert.equal(s.dead, false, '합체로 드론 0 → 사망 금지');
});

test('[A] 음수 델타여도 0이 된 원인이 합체면 강등되지 않는다', () => {
  // 200기에서 70 피해 → 130기(생존) → 합체로 0. 피해가 죽인 게 아니다.
  const s = mkSquad({ count: E.dronesPerCruiser + 70, cruisers: 0, tier: 1 });
  const w = makeWorld(s);
  s.applyDelta(-70, w);
  assert.equal(s.count, 0, '피해 후 남은 130기가 합체되어 0');
  assert.equal(s.cruisers, 1, '합체 성공');
  assert.equal(s.tier, 1, '피해가 전멸시킨 게 아니므로 등급 유지');
  assert.equal(s.dead, false);
});

test('[A] 합체 후 양수 보상·0 델타는 안전망을 발동시키지 않는다', () => {
  const { s, w } = mergedZero({ tier: 1 });
  const cruisers0 = s.cruisers;
  s.applyDelta(10, w);           // 양수 보상
  assert.equal(s.count, 10);
  assert.equal(s.cruisers, cruisers0, '순양함 희생 없음');
  assert.equal(s.tier, 1, '강등 없음');
  s.count = 0;                   // 다시 0으로 두고 0 델타(상태 확인 호출)
  s.applyDelta(0, w);
  assert.equal(s.tier, 1, '0 델타는 안전망 미발동');
  assert.equal(s.dead, false);
});

// ─── (B) 실제 피해로 0 → 안전망 정확히 한 번 ──────────────────
test('[B] 합체로 드론 0인 상태에서 피해를 받으면 순양함 1척 희생 + 재건 (무적 회귀 방지)', () => {
  const { s, w } = mergedZero({ tier: 1 });   // count 0, cruisers 1
  assert.equal(s.count, 0); assert.equal(s.cruisers, 1);
  s.applyDelta(-5, w);                        // 합체 후 첫 실제 피해
  assert.equal(s.cruisers, 0, '순양함 1척 희생');
  assert.equal(s.count, BAL.squad.start, '편대 재건');
  assert.equal(s.tier, 1, '순양함이 있었으므로 등급 유지');
  assert.equal(s.dead, false);
});

test('[B] 합체 후 순양함이 없으면 다음 피해에서 한 등급 강등 + 재건', () => {
  const { s, w } = mergedZero({ tier: 1, cruisers: 0 });   // count 0, cruisers 0, 인터셉터
  s.applyDelta(-5, w);
  assert.equal(s.tier, 0, '스카웃으로 강등');
  assert.equal(s.count, BAL.squad.start, '편대 재건');
  assert.equal(s.dead, false);
});

test('[B] 합체 후 순양함·등급이 모두 없으면 다음 피해에서 사망', () => {
  const { s, w } = mergedZero({ tier: 0, cruisers: 0 });
  s.applyDelta(-5, w);
  assert.equal(s.dead, true, '최하 등급 + 순양함 0 → 진짜 사망');
});

test('[B] 한 번의 피해로 안전망이 두 번 실행되지 않는다', () => {
  const { s, w } = mergedZero({ tier: 1, cruisers: 2 });
  s.applyDelta(-5, w);
  assert.equal(s.cruisers, 1, '순양함이 1척만 희생(2→1)');
  assert.equal(s.tier, 1, '같은 피해로 강등까지 겹치지 않음');
});

// ─── 기존 계약 (합체와 무관한 일반 피해) ──────────────────────
test('피해로 드론이 0이 되면 순양함 1척을 희생해 재건 (등급 유지)', () => {
  const s = mkSquad({ count: 10, cruisers: 2, tier: 1 });
  const w = makeWorld(s);
  s.applyDelta(-10, w);
  assert.equal(s.cruisers, 1);
  assert.equal(s.tier, 1);
  assert.equal(s.count, BAL.squad.start);
  assert.equal(s.dead, false);
});

test('순양함이 없으면 피해 전멸 시 한 등급 강등 후 재건', () => {
  const s = mkSquad({ count: 10, cruisers: 0, tier: 1 });
  const w = makeWorld(s);
  s.applyDelta(-10, w);
  assert.equal(s.tier, 0);
  assert.equal(s.count, BAL.squad.start);
  assert.equal(s.dead, false);
});

test('최하 등급 + 순양함 없이 피해 전멸 = 진짜 사망', () => {
  const s = mkSquad({ count: 10, cruisers: 0, tier: 0 });
  const w = makeWorld(s);
  s.applyDelta(-10, w);
  assert.equal(s.dead, true);
});

// ─── 통합: 실제 EnemyShot 경로 ────────────────────────────────
test('[통합] 합체로 드론 0인 상태에서 실제 적탄에 맞으면 안전망이 작동한다', () => {
  const { s, w } = mergedZero({ tier: 1 });   // count 0, cruisers 1
  const shot = new EnemyShot(s.x, s.y, 0, 0, { r: 8, dmgPct: 0.05, dmgMin: 4 });
  w.enemyBullets.push(shot);
  shot.update(1 / 60, w);                     // 기함 위치에서 갱신 → 피격
  assert.equal(shot.dead, true, '적탄이 기함에 명중해 소멸');
  assert.equal(s.cruisers, 0, '순양함 1척 희생(무적이 아니다)');
  assert.equal(s.count, BAL.squad.start, '편대 재건');
  assert.equal(s.dead, false);
});
