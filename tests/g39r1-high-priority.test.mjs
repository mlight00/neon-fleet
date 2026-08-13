// ── §G39-R1 — 고우선 예약 슬롯이 실제 production 연출에 배선됐는가 ──────────────────────
//
//  Codex 구현검수 §3(P1): `burst()` 는 `{ priority:'high' }` 를 받게 만들어 놓고, `js/` 전체에서
//  실제로 그 옵션을 넘기는 production 호출이 **0개**였다. 옵션을 읽는 코드 한 줄만 있었다.
//  → 실게임에서는 `partsStats().high` 가 절대 오르지 않고, 일반 pool 480 이 차면
//    **보스 격침 대폭발도 발칸 스파크와 함께 통째로 생략**된다. 예약이 이름만 있었던 셈이다.
//
//  ⚠️이 파일의 원칙: `fx.burst(..., {priority:'high'})` 를 테스트가 직접 부르지 않는다.
//   그건 "API 가 작동한다"만 증명한다. **실제 게임 이벤트**(보스 사망·진화·기함 승급·긴급 재건)를
//   실행해서 그 결과로 high 가 오르는지 본다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { Squad, createEffects, EFFECT_BUDGET } from '../js/entities.js';
import { makeBoss } from '../js/bosses.js';
import { BAL } from '../js/balance.js';

const noop = () => {};
/** 실제 `createEffects()` 를 쓰는 world — 예산 계수를 진짜로 돌린다. */
function makeWorld(fx) {
  return {
    logicalW: 480, logicalH: 776, bullets: [], enemyBullets: [], entities: [], bosses: [], coins: 0,
    phase: 'track', boss: null, mfx: { bossDmgMult: 1 }, stageMods: { enemyHp: 1, shotCap: 999 },
    effects: fx, addCoins: noop, spawnEntity: noop, notifyEnemyKilled: noop, metrics: null,
  };
}
/** 일반 pool 을 480 까지 채운다 — 이 상태에서도 중요한 연출은 살아남아야 한다. */
function fillNormal(fx) {
  while (fx.partsStats().total < EFFECT_BUDGET.normal) fx.burst(0, 0, '#fff', 40, 100);
  assert.equal(fx.partsStats().high, 0, '전제: 아직 고우선 입자는 없어야 한다');
}

test('G39R1-HIGH-BOSS-DEATH: 일반 pool 이 찬 상태에서 실제 보스 격침 연출이 살아남는다', () => {
  const fx = createEffects();
  const w = makeWorld(fx);
  const boss = makeBoss(480, 1, 6, 1, 'B7');
  fillNormal(fx);

  boss.hitByBullet(boss.maxHp * 10, w);            // ⭐진짜 production: hp<=0 → dying → 격침 burst

  assert.ok(boss.dead && boss.dying, '전제: 보스가 실제로 격침돼야 한다');
  const st = fx.partsStats();
  assert.ok(st.high > 0, `보스 격침은 예약 슬롯을 써야 한다 (high=${st.high})`);
  assert.ok(st.total <= EFFECT_BUDGET.total, `전체 상한을 넘지 않는다 (total=${st.total})`);
});

test('G39R1-HIGH-EVOLUTION: 일반 pool 이 찬 상태에서 실제 무기 진화 연출이 살아남는다', () => {
  const fx = createEffects();
  const w = makeWorld(fx);
  const s = new Squad(480, 776, 100); s.x = 240; s.y = 640;
  //  진화 사다리에 올려둔다 — advanceWeapon 이 'evoUp' 분기로 가도록 최대 레벨 + 진화 선택 완료 상태.
  const wp = s.weapon;
  s.weaponLv = BAL.weapons.maxLv;
  s.weaponEvolutions[wp] = Object.keys(s.weaponEvolutions).length ? s.weaponEvolutions[wp] : null;
  s.weaponEvolutions[wp] = s.weaponEvolutions[wp] || 'any';   // 이미 1차 진화를 골랐다고 본다
  s.evoLevels[wp] = 1;
  s._evoProg = (BAL.weapons.evolveAdvanceCost || 1) - 1;      // 다음 1회로 발동
  fillNormal(fx);

  const lvBefore = s.evoLevels[wp];
  s.advanceWeapon(w);                              // ⭐진짜 production

  assert.ok(s.evoLevels[wp] > lvBefore, `전제: 진화 레벨이 실제로 올라야 한다 (${lvBefore} → ${s.evoLevels[wp]})`);
  const st = fx.partsStats();
  assert.ok(st.high > 0, `진화는 예약 슬롯을 써야 한다 (high=${st.high})`);
  assert.ok(st.total <= EFFECT_BUDGET.total, `전체 상한을 넘지 않는다 (total=${st.total})`);
});

test('G39R1-HIGH-FLAGSHIP-TIERUP: 실제 기함 등급 상승 연출도 예약을 쓴다', () => {
  const fx = createEffects();
  const w = makeWorld(fx);
  const s = new Squad(480, 776, 100); s.x = 240; s.y = 640;
  s.cruisers = 99;                                  // 승급 조건을 넘긴다
  fillNormal(fx);

  const tierBefore = s.tier;
  s.checkEvolution(w);                              // ⭐진짜 production

  assert.ok(s.tier > tierBefore, `전제: 기함 등급이 올라야 한다 (${tierBefore} → ${s.tier})`);
  const st = fx.partsStats();
  assert.ok(st.high > 0, `기함 승급은 예약 슬롯을 써야 한다 (high=${st.high})`);
  assert.ok(st.total <= EFFECT_BUDGET.total, `전체 상한을 넘지 않는다 (total=${st.total})`);
});

test('G39R1-HIGH-NORMAL-STAYS-NORMAL: 일반 폭발은 예약을 쓰지 않는다', () => {
  //  예약이 아무 데나 붙으면 120 슬롯이 순식간에 소모돼 예약의 의미가 사라진다.
  const fx = createEffects();
  fx.burst(0, 0, '#fff', 10, 100);                  // 옵션 없는 기존 호출
  assert.equal(fx.partsStats().high, 0, '옵션 없는 burst 는 normal 이어야 한다');
});

test('G39R1-HIGH-CAP-NO-EVICT: 예약이 다 차도 기존 입자를 제거하지 않는다', () => {
  const fx = createEffects();
  while (fx.partsStats().total < EFFECT_BUDGET.total) fx.burst(0, 0, '#fff', 40, 100, { priority: 'high' });
  const before = fx.partsStats();
  for (let i = 0; i < 20; i++) fx.burst(0, 0, '#fff', 40, 100, { priority: 'high' });
  const after = fx.partsStats();
  assert.equal(after.total, before.total, '상한 뒤에는 신규만 생략한다');
  assert.ok(after.total <= EFFECT_BUDGET.total, '전체 상한 유지');
});
