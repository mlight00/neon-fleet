// ── §G39-R1 — 모든 실효 피해 경로가 몸체 플래시를 남기는가 ─────────────────────────────
//
//  Codex 구현검수 §1(P0): 설계가 명시한 8개 피해 경로 중 **5개가 피격 기록을 전혀 남기지 않았다.**
//  원본 랜스·메아리 랜스·시즈 광역·처치 연쇄·APEX 는 `hitByBullet()` 만 부르고 지나갔다.
//  → 3D 함미모드에서 그 무기로 적을 때리면 **아무 변화가 없었다.** 이사님이 제보한 바로 그 증상이다.
//
//  ⚠️이 파일의 원칙: **실제 production 함수를 실행한다.**
//   helper 에 가짜 target 을 직접 넣는 단위 테스트는 이 누락을 못 잡는다(그게 반려 사유였다).
//   `Squad.fireLance` · `Squad._fireEcho` · `HomingMissile.onHit` 은 entities.js 의 진짜 메서드를 부른다.
//   연쇄·APEX·일반탄 3종은 호출부가 main.js 안에 있고 main.js 는 export 가 없어 Node 로 못 띄운다 →
//   그 경로들이 **실제로 호출하는 production 함수**(`hitWithFeedback` / `emitProjectileImpactFeedback`)를
//   같은 인자 모양으로 실행한다. 실행되지 않는 링크는 보고서 §미검증에 명시한다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { Squad, Creature, HomingMissile, Debris } from '../js/entities.js';
import { makeBoss } from '../js/bosses.js';
import { hitWithFeedback, emitProjectileImpactFeedback } from '../js/impact-feedback.js';
import { readDamageFlash, FEEDBACK } from '../js/damage-feedback.js';

const noop = () => {};
/** 시각을 우리가 쥐는 가짜 시계 — production 의 `feedbackClock` 과 같은 계약(now/advance). */
function fakeClock(t = 0) { return { now: () => t, set(v) { t = v; }, advance(d) { t += d; } }; }

function makeWorld(squad, clock = fakeClock(0)) {
  return {
    squad, logicalW: 480, logicalH: 776,
    bullets: [], enemyBullets: [], entities: [], bosses: [], coins: 0,
    phase: 'track', boss: null,
    mfx: { explodeRadius: 0, explodeDmgFrac: 0.5, bossDmgMult: 1 },
    stageMods: { enemyHp: 1, shotCap: 999 },
    feedbackClock: clock,          // §G39-R1: entities.js 피해 경로가 읽는 시각원
    addCoins: noop,
    spawnEntity(e) { this.entities.push(e); },
    notifyEnemyKilled: noop,
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop, hitSpark: () => false },
  };
}
function squadAt(x = 240, y = 640) { const s = new Squad(480, 776, 100); s.x = x; s.y = y; return s; }
/** 랜스 컬럼 안에서 **죽지 않을 만큼** 튼튼한 적 — 사망 타격은 기록 대상이 아니므로 생존해야 관측된다. */
function toughAt(x, y, hp = 1e9) { const c = new Creature(x, y, 'small'); c.hp = c.maxHp = hp; return c; }

// ── 경로 1~3: 일반 발사체(일반 적 / 보스 / 관통 레이저) ────────────────────────────────
//  main.js:2708(보스)·2730(일반)이 실제로 부르는 함수를 그대로 실행한다.

test('G39R1-PATH-BULLET: 일반탄이 실효 피해를 주면 기록되고, 0 피해면 기록되지 않는다', () => {
  const w = makeWorld(squadAt());
  const hit = toughAt(100, 300), miss = toughAt(140, 300);
  const bullet = { kind: 'vulcan', sourceWeaponId: 'vulcan', x: 100, y: 300 };

  const before = hit.hp; hit.hitByBullet(50, w);
  emitProjectileImpactFeedback(hit, bullet, 100, 300, Math.max(0, before - hit.hp), w, 0);
  assert.ok(readDamageFlash(hit, 0) > 0, 'HP 가 줄었으면 기록돼야 한다');

  emitProjectileImpactFeedback(miss, bullet, 140, 300, 0, w, 0);   // 실효 피해 0
  assert.equal(readDamageFlash(miss, 0), 0, '0 피해는 기록되면 안 된다');
});

test('G39R1-PATH-BOSS-BULLET: 보스탄 분기도 같은 계약을 지킨다', () => {
  const w = makeWorld(squadAt());
  const boss = makeBoss(480, 1, 6, 1, 'B7'); boss.x = 240; boss.y = 200;
  const bullet = { kind: 'laser', sourceWeaponId: 'laser', x: 240, y: 200 };

  const before = boss.hp; boss.hitByBullet(40, w);
  const eff = Math.max(0, before - boss.hp);
  assert.ok(eff > 0, '전제: 보스 HP 가 실제로 줄어야 한다');
  emitProjectileImpactFeedback(boss, bullet, 240, 200, eff, w, 0);
  assert.ok(readDamageFlash(boss, 0) > 0, '보스도 기록돼야 한다');
});

test('G39R1-PATH-LASER-PIERCE: 관통 레이저가 한 프레임에 여러 적을 때려도 각각 기록된다', () => {
  const w = makeWorld(squadAt());
  const targets = [toughAt(100, 300), toughAt(100, 260), toughAt(100, 220)];
  const bullet = { kind: 'laser', sourceWeaponId: 'laser' };
  for (const t of targets) {
    const before = t.hp; t.hitByBullet(30, w);
    emitProjectileImpactFeedback(t, bullet, t.x, t.y, Math.max(0, before - t.hp), w, 0);
  }
  for (const t of targets) assert.ok(readDamageFlash(t, 0) > 0, '관통 대상 전부 기록돼야 한다');
});

// ── 경로 4: 원본 랜스 — **실제 Squad.fireLance 실행** ──────────────────────────────────

test('G39R1-PATH-LANCE: 실제 fireLance 가 컬럼 안 적에게 몸체 플래시를 남긴다', () => {
  const s = squadAt(240, 640);
  const clock = fakeClock(0);
  const w = makeWorld(s, clock);
  const inColumn = toughAt(240, 300);      // 기함 바로 위 = 랜스 컬럼 안
  const outside = toughAt(20, 300);        // 화면 반대편 = 컬럼 밖
  w.entities.push(inColumn, outside);

  const hpBefore = inColumn.hp;
  s.fireLance(w, 3);                       // ⭐진짜 production 메서드

  assert.ok(inColumn.hp < hpBefore, '전제: 컬럼 안 적의 HP 가 줄어야 한다');
  assert.ok(readDamageFlash(inColumn, 0) > 0, 'HP 감소 → 기록');
  assert.equal(readDamageFlash(outside, 0), 0, '컬럼 밖(0 피해) → 미기록');
});

test('G39R1-PATH-LANCE-BOSS: 실제 fireLance 가 컬럼 안 보스에게도 남긴다', () => {
  const s = squadAt(240, 640);
  const w = makeWorld(s);
  const boss = makeBoss(480, 1, 6, 1, 'B7'); boss.x = 240; boss.y = 240;
  w.bosses.push(boss);

  const hpBefore = boss.hp;
  s.fireLance(w, 3);

  assert.ok(boss.hp < hpBefore, '전제: 보스 HP 가 줄어야 한다');
  assert.ok(readDamageFlash(boss, 0) > 0, '보스도 기록돼야 한다');
});

// ── 경로 5: 메아리 랜스 — **실제 _fireEcho 실행** ─────────────────────────────────────

test('G39R1-PATH-ECHO: 실제 _fireEcho 가 몸체 플래시를 남긴다', () => {
  const s = squadAt(240, 640);
  const w = makeWorld(s);
  const inColumn = toughAt(240, 320), outside = toughAt(20, 320);
  w.entities.push(inColumn, outside);

  const hpBefore = inColumn.hp;
  s._fireEcho(w, { x: 240, halfW: 40, dmg: 500, pierceDefense: false, stage: 3 });   // ⭐진짜 메서드

  assert.ok(inColumn.hp < hpBefore, '전제: 메아리가 실제 피해를 줘야 한다');
  assert.ok(readDamageFlash(inColumn, 0) > 0, 'HP 감소 → 기록');
  assert.equal(readDamageFlash(outside, 0), 0, '컬럼 밖 → 미기록');
});

// ── 경로 6: 시즈 광역 — **실제 HomingMissile.onHit 실행** ──────────────────────────────

test('G39R1-PATH-SIEGE-AOE: 실제 onHit 의 광역 피해 대상에도 남는다', () => {
  const w = makeWorld(squadAt());
  const direct = toughAt(200, 300);        // 직격 대상(main 이 담당) — onHit 은 건드리지 않는다
  const splash = toughAt(215, 300);        // 폭발 반경 안
  const far = toughAt(200, 60);            // 반경 밖
  w.entities.push(direct, splash, far);

  const m = new HomingMissile(200, 300, 1, null, 1);
  m.x = 200; m.y = 300; m.damage = 400; m.blast = { radius: 60, frac: 0.5 };
  const splashBefore = splash.hp;
  m.onHit(direct, w);                      // ⭐진짜 메서드

  assert.ok(splash.hp < splashBefore, '전제: 광역 대상의 HP 가 줄어야 한다');
  assert.ok(readDamageFlash(splash, 0) > 0, '광역 피해 대상도 기록돼야 한다');
  assert.equal(readDamageFlash(far, 0), 0, '반경 밖 → 미기록');
});

test('G39R1-PATH-SIEGE-BOSS: 실제 onHit 의 보스 광역도 기록된다', () => {
  const w = makeWorld(squadAt());
  const boss = makeBoss(480, 1, 6, 1, 'B7'); boss.x = 200; boss.y = 300;
  w.boss = boss; w.phase = 'boss';
  const direct = toughAt(200, 300);
  w.entities.push(direct);

  const m = new HomingMissile(200, 300, 1, null, 1);
  m.x = 200; m.y = 300; m.damage = 400; m.blast = { radius: 80, frac: 0.5 };
  const hpBefore = boss.hp;
  m.onHit(direct, w);

  assert.ok(boss.hp < hpBefore, '전제: 보스가 광역 피해를 받아야 한다');
  assert.ok(readDamageFlash(boss, 0) > 0, '보스 광역도 기록돼야 한다');
});

// ── 경로 7~8: 처치 연쇄 / APEX ────────────────────────────────────────────────────────
//  main.js:2397(연쇄)·2066/2075(APEX)가 실제로 부르는 `hitWithFeedback` 을 같은 모양으로 실행한다.

test('G39R1-PATH-CHAIN: 연쇄 폭발 피해 대상이 기록된다', () => {
  const w = makeWorld(squadAt());
  const near = toughAt(100, 300);
  const eff = hitWithFeedback(near, w, 120);       // 연쇄가 부르는 그 함수
  assert.ok(eff > 0, '전제: 실효 피해가 있어야 한다');
  assert.ok(readDamageFlash(near, 0) > 0, '연쇄 대상도 기록돼야 한다');
});

test('G39R1-PATH-APEX-BOSS: APEX 로 살아남은 보스는 기록된다', () => {
  const w = makeWorld(squadAt());
  const boss = makeBoss(480, 1, 6, 1, 'B7');
  const eff = hitWithFeedback(boss, w, boss.maxHp * 0.2);
  assert.ok(eff > 0 && !boss.dead, '전제: 보스가 피해를 받고 살아남아야 한다');
  assert.ok(readDamageFlash(boss, 0) > 0, '생존한 보스는 기록돼야 한다');
});

test('G39R1-PATH-APEX-FATAL: APEX 로 즉사한 적은 기록하지 않는다(사망 폭발이 담당)', () => {
  const w = makeWorld(squadAt());
  const e = toughAt(100, 300, 50);
  const eff = hitWithFeedback(e, w, 99999);        // APEX 의 즉사 피해
  assert.ok(eff > 0 && e.dead, '전제: 실효 피해가 있고 죽어야 한다');
  assert.equal(readDamageFlash(e, 0), 0, '사망 타격은 기록하지 않는다');
});

// ── 제외 계약: 보호막 흡수 · 0 피해 · Debris · 사망/침몰 중 ──────────────────────────────

test('G39R1-EXCLUDE-SHIELD: 보호막이 완전 흡수하면 기록하지 않는다', () => {
  const w = makeWorld(squadAt());
  const e = toughAt(100, 300);
  e.shieldCharges = 1;                              // affixAbsorb 가 hp 를 줄이기 **전에** true 를 준다
  const hpBefore = e.hp;
  const eff = hitWithFeedback(e, w, 100);
  assert.equal(e.hp, hpBefore, '전제: 보호막이 흡수해 HP 가 그대로여야 한다');
  assert.equal(eff, 0, '실효 피해 0');
  assert.equal(readDamageFlash(e, 0), 0, '보호막 흡수는 기록하지 않는다');
});

test('G39R1-EXCLUDE-DEBRIS: 파괴 불가 잔해는 기록하지 않는다', () => {
  const w = makeWorld(squadAt());
  const d = new Debris(100, 300);
  assert.ok(d.indestructible, '전제: Debris 는 indestructible 이어야 한다');
  hitWithFeedback(d, w, 100);
  assert.equal(readDamageFlash(d, 0), 0, 'Debris 는 production 피해 대상이 아니다');
});

test('G39R1-EXCLUDE-DYING: 침몰 연출 중인 보스는 새 기록을 받지 않는다', () => {
  const w = makeWorld(squadAt());
  const boss = makeBoss(480, 1, 6, 1, 'B7');
  boss.dying = true;                                // 침몰 연출 진행 중
  hitWithFeedback(boss, w, 100);
  assert.equal(readDamageFlash(boss, 0), 0, 'dying 중에는 기록하지 않는다');
});

// ── 시각원 계약 ───────────────────────────────────────────────────────────────────────

test('G39R1-CLOCK-SOURCE: entities.js 경로가 world 의 게임 시계를 쓴다(벽시계 아님)', () => {
  const s = squadAt(240, 640);
  const clock = fakeClock(12.5);                    // 게임 누적 12.5초 시점
  const w = makeWorld(s, clock);
  const e = toughAt(240, 300);
  w.entities.push(e);

  s.fireLance(w, 3);

  //  12.5 에 기록됐다면 12.5 에서 최대, flashDur 뒤에는 0 이어야 한다.
  assert.ok(readDamageFlash(e, 12.5) > 0.99, '기록 시각에서 최대여야 한다');
  assert.equal(readDamageFlash(e, 12.5 + FEEDBACK.flashDur), 0, 'flashDur 뒤에는 사라져야 한다');
  assert.equal(readDamageFlash(e, 0), 0, '기록 이전 시각에서는 0 이어야 한다');
});
