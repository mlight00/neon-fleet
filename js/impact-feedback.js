// ── §G-39 — 발사체 명중 피드백(공용) ──────────────────────────────────────────────────
//
//  ⚠️일반 적과 보스는 **서로 다른 충돌 분기**다(main.js:2685 보스 / 2705 일반).
//   한쪽만 고치면 보스를 맞힌 발칸·레이저의 불꽃이 빠진다. 두 분기가 이 helper 를 부른다.
//  ⚠️2D effects 는 3D 로 투영되므로 여기서 **한 번만** 만든다. 3D 전용 불꽃을 따로 만들지 않는다.
import { recordDamageFeedback } from './damage-feedback.js';

/** 확정 수치(설계 §6-2). */
export const IMPACT = {
  vulcanParticles: 2,
  laserParticles: 2,
  perFrame: 24,          // 프레임당 신규 hit-spark 상한
  sparkSpeed: 90,
  vulcanColor: '#ffe08a',
  laserColor: '#bff4ff',
};

/**
 * 무기 정책. ⚠️`kind` 하나에 의존하지 않는다 — 진화형·공명은 kind 가 같아도 소스가 다르다.
 *  @returns `{ kind: 'spark'|'none', count, speed, color }`
 */
export function impactPolicy(projectile) {
  const p = projectile || {};
  if (p.lance || p.echo || p.blast) return { kind: 'none', count: 0, speed: 0, color: '' };
  const id = p.sourceWeaponId || p.kind || '';
  if (id === 'homing') return { kind: 'none', count: 0, speed: 0, color: '' };   // 기존 폭발이 담당
  if (id === 'laser') return { kind: 'spark', count: IMPACT.laserParticles, speed: IMPACT.sparkSpeed, color: IMPACT.laserColor };
  if (id === 'vulcan') return { kind: 'spark', count: IMPACT.vulcanParticles, speed: IMPACT.sparkSpeed, color: IMPACT.vulcanColor };
  return { kind: 'none', count: 0, speed: 0, color: '' };
}

/**
 * 피해를 입히고 **실효 피해가 있을 때만** 몸체 플래시를 기록한다 — production 의 모든 피해 경로가 공유한다.
 *
 *  §G39-R1 (Codex 구현검수 §1): 원본 랜스·메아리·시즈 광역·연쇄 폭발·APEX 는 `hitByBullet()` 만 부르고
 *  피격 기록을 남기지 않아, 3D 에서 **적이 맞아도 아무 변화가 없었다.** 다섯 곳에 같은 코드를 복제하는 대신
 *  이 어댑터를 공유한다.
 *
 *  ⚠️`hitByBullet()` 성공이 곧 피해가 아니다 — 보호막 변이(`affixes.js` `affixAbsorb`)는 hp 를 줄이기 **전에**
 *   true 를 돌려준다. 그래서 반드시 hp 전후를 재서 실효 피해를 구한다.
 *  ⚠️추가 입자를 만들지 않는다. 랜스·시즈·연쇄는 각자의 경로 연출이 이미 있다.
 *
 *  @param ctx `hitByBullet` 의 3번째 인자(랜스 문맥 등). 없으면 넘기지 않던 것과 동일하게 undefined.
 *  @returns 실효 피해량(0 이면 기록하지 않았다)
 */
export function hitWithFeedback(target, world, dmg, ctx) {
  const before = Number.isFinite(target.hp) ? target.hp : 0;
  target.hitByBullet(dmg, world, ctx);
  const after = Number.isFinite(target.hp) ? target.hp : 0;
  const effective = Math.max(0, before - after);
  //  now: 게임 누적 시간. world 에 시계가 없는 경로(테스트 스텁 등)는 0 — 기록 자체는 유효하다.
  if (effective > 0) {
    const now = world && world.feedbackClock ? world.feedbackClock.now() : 0;
    recordDamageFeedback(target, target.x, target.y, now, effective);
  }
  return effective;
}

let _frameKey = -1, _frameUsed = 0;

/**
 * 실효 피해가 있을 때만 몸체 플래시를 기록하고 명중 스파크를 만든다.
 *  @param effective `hpBefore − hpAfter`
 *  @param now       게임 누적 시간(초) — 프레임 예산 키로도 쓴다
 */
export function emitProjectileImpactFeedback(target, projectile, x, y, effective, world, now) {
  if (!(effective > 0)) return;
  //  ① 몸체 플래시 — 쿨다운·대상 판정은 사이드카가 한다.
  const fired = recordDamageFeedback(target, x, y, now, effective);
  //  ② 명중 스파크 — 플래시가 실제로 발동한 순간에만(같은 쿨다운을 공유해 연사 폭주를 막는다).
  if (!fired) return;
  const pol = impactPolicy(projectile);
  if (pol.kind !== 'spark') return;
  if (_frameKey !== now) { _frameKey = now; _frameUsed = 0; }
  if (_frameUsed >= IMPACT.perFrame) return;
  const fx = world && world.effects;
  if (!fx || typeof fx.hitSpark !== 'function') return;
  //  seed 는 위치·시간에서 유도 — 전역 RNG 를 쓰지 않는다.
  const seed = ((x * 73856093) ^ (y * 19349663) ^ (_frameUsed * 83492791)) | 0;
  if (fx.hitSpark(x, y, pol.color, pol.count, pol.speed, seed)) _frameUsed += pol.count;
}
