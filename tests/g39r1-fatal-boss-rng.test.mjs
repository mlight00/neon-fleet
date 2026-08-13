// ── §G39-R1 — 사망 타격이 2D 재그리기로 전역 RNG 를 더 먹지 않는가 ─────────────────────
//
//  Codex 구현검수 §6(P1): `Boss.drawDying()` 은 함체 흔들림에 draw 마다 전역 `Math.random()` 을
//  **2회** 쓴다(bosses.js:313-314). 치명타로 보스가 죽은 직후에도 피격이 기록되면, 2D 플래시 wrapper 가
//  플래시가 남아 있는 동안 같은 `drawDying()` 을 **두 번** 부른다.
//
//      기존:              drawDying 1회 → Math.random 2회
//      G39(수정 전):      drawDying 2회 → Math.random 4회   ← 전투 RNG 순서가 밀린다
//
//  ⚠️왜 이게 게임 truth 문제인가: 전역 RNG 는 치명타·탄 분산·스폰과 같은 스트림이다.
//   연출이 난수를 더 먹으면 그 다음 판정이 다른 값을 뽑는다.
//
//  수정: 설계 적용표대로 `dead`/`dying` 은 피격 기록 대상에서 뺀다 — 사망 피드백은 사망 폭발이 담당한다.
//
//  ⚠️자체 조사(§G39-R1): `drawDying` 이 전역 RNG 를 쓰는 **유일한** draw 메서드인지 entities.js·bosses.js
//   전체를 훑어 확인했다. 다른 개체의 draw 는 전역 난수를 쓰지 않으므로 살아 있는 적의 2회 그리기는
//   RNG 를 건드리지 않는다. (코덱스가 짚은 범위가 맞았고, 추가 사례는 없었다.)
import test from 'node:test';
import assert from 'node:assert/strict';

import { makeBoss } from '../js/bosses.js';
import { hitWithFeedback } from '../js/impact-feedback.js';
import { readDamageFlash, FEEDBACK } from '../js/damage-feedback.js';
import { drawWithDamageFlash } from '../js/damage-flash-2d.js';
import { BAL } from '../js/balance.js';

const noop = () => {};
/** Canvas2D 표면만 갖춘 스텁 — 그리기 결과는 안 본다. RNG 소비 횟수만 센다. */
function makeCtx() {
  return new Proxy({}, {
    get: (t, k) => {
      if (k === 'canvas') return { width: 480, height: 800 };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'globalAlpha' || k === 'globalCompositeOperation') return t[k];
      return noop;
    },
    set: (t, k, v) => { t[k] = v; return true; },
  });
}
function makeWorld() {
  return {
    logicalW: 480, logicalH: 776, entities: [], bullets: [], enemyBullets: [], bosses: [],
    phase: 'boss', mfx: { bossDmgMult: 1 }, stageMods: { enemyHp: 1, shotCap: 999 },
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop },
    addCoins: noop, spawnEntity: noop, notifyEnemyKilled: noop,
  };
}
function countGlobalRandom(fn) {
  const orig = Math.random;
  let n = 0;
  Math.random = () => { n++; return orig(); };
  try { fn(); } finally { Math.random = orig; }
  return n;
}

test('G39R1-FATAL-BOSS-NO-FLASH: 치명타로 격침된 보스는 피격 기록을 남기지 않는다', () => {
  const w = makeWorld();
  const boss = makeBoss(480, 1, 6, 1, 'B7');
  const eff = hitWithFeedback(boss, w, boss.maxHp * 10);
  assert.ok(eff > 0, '전제: 실효 피해가 있어야 한다');
  assert.ok(boss.dead && boss.dying, '전제: 보스가 격침돼야 한다');
  assert.equal(readDamageFlash(boss, 0), 0, '사망 타격은 기록하지 않는다(사망 폭발이 피드백을 담당)');
});

test('G39R1-FATAL-BOSS-RNG-BASELINE: 격침 보스의 draw 가 §G-39 이전과 같은 횟수만 난수를 쓴다', () => {
  const w = makeWorld();
  const ctx = makeCtx();
  const boss = makeBoss(480, 1, 6, 1, 'B7');
  boss.x = 240; boss.y = 200;

  //  ① 기준선 — §G-39 이전의 그리기(플래시 wrapper 없음), 침몰 연출 상태에서.
  boss.dead = true; boss.dying = true; boss.deathT = BAL.bossDeath.duration * 0.3;
  const baseline = countGlobalRandom(() => boss.draw(ctx));
  assert.ok(baseline > 0, `전제: drawDying 이 실제로 전역 난수를 써야 한다 — 실측 ${baseline}`);

  //  ② 현재 — 치명타 기록을 시도한 뒤 wrapper 를 통해 그린다.
  const boss2 = makeBoss(480, 1, 6, 1, 'B7');
  boss2.x = 240; boss2.y = 200;
  hitWithFeedback(boss2, w, boss2.maxHp * 10);        // 치명타 → dead/dying
  boss2.deathT = BAL.bossDeath.duration * 0.3;
  const flash = readDamageFlash(boss2, 0);
  assert.equal(flash, 0, '전제: 사망 타격에 플래시가 없어야 한다');

  const actual = countGlobalRandom(() => drawWithDamageFlash(ctx, boss2, () => boss2.draw(ctx), flash, 1));
  assert.equal(actual, baseline, `격침 보스의 난수 소비가 기준선과 같아야 한다 — 기준 ${baseline} / 실측 ${actual}`);
});

test('G39R1-FATAL-BOSS-RNG-WOULD-DOUBLE: 플래시가 남아 있었다면 실제로 2배가 된다(이 수정이 막은 것)', () => {
  //  "수정이 필요했다"는 근거 자체를 실행으로 남긴다 — 없으면 이 계약이 왜 있는지 나중에 알 수 없다.
  const ctx = makeCtx();
  const boss = makeBoss(480, 1, 6, 1, 'B7');
  boss.x = 240; boss.y = 200;
  boss.dead = true; boss.dying = true; boss.deathT = BAL.bossDeath.duration * 0.3;

  const once = countGlobalRandom(() => drawWithDamageFlash(ctx, boss, () => boss.draw(ctx), 0, 1));
  const twice = countGlobalRandom(() => drawWithDamageFlash(ctx, boss, () => boss.draw(ctx), 1, 1));
  assert.equal(twice, once * 2, `플래시가 있으면 body 를 2번 그려 난수도 2배가 된다 — ${once} → ${twice}`);
});

test('G39R1-NONFATAL-BOSS-STILL-FLASHES: 죽지 않은 보스는 여전히 기록된다', () => {
  const w = makeWorld();
  const boss = makeBoss(480, 1, 6, 1, 'B7');
  hitWithFeedback(boss, w, boss.maxHp * 0.1);
  assert.ok(!boss.dead, '전제: 보스가 살아 있어야 한다');
  assert.ok(readDamageFlash(boss, 0) > 0, '비치명 타격은 기록돼야 한다');
});

// ── §G39-R2 (Codex R1 재검수 P0) — 죽기 직전 기록이 사망 후에도 읽히던 경계 ────────────
//  ⚠️R1 은 `recordDamageFeedback` 의 **신규 기록**만 막았다. 그래서 위 테스트들처럼
//   "첫 타격이 곧 치명타"인 경우만 통과했고, **비치명타로 flash 를 남긴 뒤 곧바로 죽는**
//   실제 전투 흐름을 놓쳤다. 실측(수정 전): flash 0.5 가 남아 drawDying 이 2번 → RNG 2→4회.

test('G39R2-STALE-FLASH: 비치명타 직후 치명타면 남아 있던 flash 가 0 이 된다', () => {
  const w = makeWorld();
  const boss = makeBoss(480, 1, 6, 1, 'B7');
  const clock = { t: 0, now() { return this.t; } };
  w.feedbackClock = clock;

  hitWithFeedback(boss, w, boss.maxHp * 0.05);                 // ① 비치명타
  assert.ok(!boss.dead, '전제: 아직 살아 있어야 한다');
  assert.ok(readDamageFlash(boss, 0) > 0, '전제: 살아 있을 땐 플래시가 정상 동작해야 한다');

  clock.t = FEEDBACK.flashDur * 0.5;                            // ② flashDur 안에 치명타
  hitWithFeedback(boss, w, boss.maxHp * 10);
  assert.ok(boss.dead && boss.dying, '전제: 이번엔 격침돼야 한다');
  assert.equal(readDamageFlash(boss, clock.t), 0,
    '사망 후에는 **남아 있던 기록도** 읽히면 안 된다(기록 차단만으로는 부족하다)');
});

test('G39R2-STALE-FLASH-RNG: 그 경계에서도 전역 RNG 가 기준선과 같다', () => {
  const w = makeWorld();
  const ctx = makeCtx();
  const clock = { t: 0, now() { return this.t; } };
  w.feedbackClock = clock;

  const boss = makeBoss(480, 1, 6, 1, 'B7'); boss.x = 240; boss.y = 200;
  hitWithFeedback(boss, w, boss.maxHp * 0.05);                 // 비치명타로 flash 를 남긴다
  clock.t = FEEDBACK.flashDur * 0.5;
  hitWithFeedback(boss, w, boss.maxHp * 10);                   // 곧바로 격침
  boss.deathT = BAL.bossDeath.duration * 0.3;

  const base = makeBoss(480, 1, 6, 1, 'B7'); base.x = 240; base.y = 200;
  base.dead = true; base.dying = true; base.deathT = BAL.bossDeath.duration * 0.3;
  const baseline = countGlobalRandom(() => base.draw(ctx));

  const flash = readDamageFlash(boss, clock.t);
  const actual = countGlobalRandom(() => drawWithDamageFlash(ctx, boss, () => boss.draw(ctx), flash, 1));
  assert.equal(actual, baseline,
    `직전 비치명타가 있어도 난수 소비가 기준선과 같아야 한다 — 기준 ${baseline} / 실측 ${actual}`);
});

test('G39R2-ALIVE-UNAFFECTED: 살아 있는 대상의 플래시 판독은 그대로다', () => {
  //  ⚠️판독에 대상 판정을 넣으면서 정상 동작까지 죽이면 안 된다.
  const w = makeWorld();
  const boss = makeBoss(480, 1, 6, 1, 'B7');
  hitWithFeedback(boss, w, boss.maxHp * 0.05);
  assert.ok(readDamageFlash(boss, 0) > 0.99, '기록 시각에서 최대');
  assert.ok(readDamageFlash(boss, FEEDBACK.flashDur * 0.5) > 0, '감쇠 중에는 남아 있다');
  assert.equal(readDamageFlash(boss, FEEDBACK.flashDur), 0, 'flashDur 뒤에는 0');
});
