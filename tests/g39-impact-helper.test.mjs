import test from 'node:test';
import assert from 'node:assert/strict';
import { impactPolicy, emitProjectileImpactFeedback, IMPACT } from '../js/impact-feedback.js';

const fakeFx = () => { const c = { spark: 0, burst: 0 }; return { c,
  hitSpark: () => { c.spark++; return true; }, burst: () => { c.burst++; } }; };

test('G39-IMPACT-POLICY: 무기별 정책이 kind 하나에 의존하지 않는다', () => {
  //  ⚠️진화형·공명은 kind 가 같아도 소스가 다르다. sourceWeaponId 를 함께 본다.
  assert.equal(impactPolicy({ kind: 'vulcan' }).kind, 'spark');
  assert.equal(impactPolicy({ kind: 'laser' }).kind, 'spark');
  assert.equal(impactPolicy({ kind: 'homing' }).kind, 'none', '미사일은 기존 폭발이 담당');
  assert.equal(impactPolicy({ sourceWeaponId: 'vulcan' }).kind, 'spark', 'kind 없어도 소스로 판단');
  assert.equal(impactPolicy({ lance: true }).kind, 'none', '랜스는 경로 연출이 담당');
});

test('G39-IMPACT-COUNTS: 발칸·레이저 한 적중당 입자 수가 확정값이다', () => {
  assert.equal(impactPolicy({ kind: 'vulcan' }).count, IMPACT.vulcanParticles);
  assert.equal(impactPolicy({ kind: 'laser' }).count, IMPACT.laserParticles);
  assert.equal(IMPACT.vulcanParticles, 2);
  assert.equal(IMPACT.laserParticles, 2);
});

test('G39-IMPACT-NO-DOUBLE-MISSILE: 미사일은 스파크를 추가하지 않는다', () => {
  //  ⚠️기존 폭발과 겹치면 중복이다.
  const fx = fakeFx();
  emitProjectileImpactFeedback({ hp: 5, maxHp: 10 }, { kind: 'homing' }, 0, 0, 3, { effects: fx }, 1);
  assert.equal(fx.c.spark, 0, '미사일에 스파크 없음');
  assert.equal(fx.c.burst, 0, '이 helper 가 폭발을 또 만들지 않음');
});

test('G39-IMPACT-EFFECTIVE-GATE: 실효 피해 0 이면 아무것도 안 만든다', () => {
  const fx = fakeFx();
  emitProjectileImpactFeedback({ hp: 5, maxHp: 10 }, { kind: 'vulcan' }, 0, 0, 0, { effects: fx }, 1);
  assert.equal(fx.c.spark, 0);
});

test('G39-IMPACT-FRAME-BUDGET: 프레임당 신규 생성 상한을 지킨다', () => {
  //  관통 레이저가 한 프레임에 여러 적을 맞혀도 폭주하지 않아야 한다.
  const fx = fakeFx();
  for (let i = 0; i < 200; i++) {
    emitProjectileImpactFeedback({ hp: 9, maxHp: 10 }, { kind: 'laser' }, 0, 0, 1, { effects: fx }, 1);
  }
  assert.ok(fx.c.spark <= IMPACT.perFrame, `프레임당 ${fx.c.spark} — ${IMPACT.perFrame} 이하`);
});

test('G39-IMPACT-FRAME-RESET: 다음 프레임이면 예산이 회복된다', () => {
  const fx = fakeFx();
  for (let i = 0; i < 200; i++) emitProjectileImpactFeedback({ hp: 9, maxHp: 10 }, { kind: 'laser' }, 0, 0, 1, { effects: fx }, 1);
  const first = fx.c.spark;
  for (let i = 0; i < 200; i++) emitProjectileImpactFeedback({ hp: 9, maxHp: 10 }, { kind: 'laser' }, 0, 0, 1, { effects: fx }, 2);
  assert.ok(fx.c.spark > first, '새 프레임에서 다시 생성된다');
});
