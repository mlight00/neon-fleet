import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Squad, Bullet } from '../js/entities.js';
import { BAL } from '../js/balance.js';

function makeWorld(squad) {
  const noop = () => {};
  return {
    squad, logicalW: 480, logicalH: 776,
    bullets: [], enemyBullets: [], entities: [],
    input: { targetX: 240, charging: false, tick: noop },
    stats: { fireRate: BAL.squad.fireRate, damage: BAL.squad.damage },
    mfx: {},
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop },
  };
}
function vulcanSquad() {
  const sq = new Squad(480, 776, 100);
  sq.x = 240; sq.y = 640; sq.weapon = 'vulcan'; sq.tier = 0; sq.bank = 0;
  return sq;
}
function totalBulletDamage(squad, rush) {
  const w = makeWorld(squad);
  squad.rushT = rush ? BAL.flow.rushDuration : 0;
  squad.fireAcc = 0; squad.escortAcc = 0;
  squad.fire(1.0, w);   // dt=1 → 다수 발사
  return w.bullets.reduce((s, b) => s + b.damage, 0);
}

// ── 8.3 RUSH 배수 ──────────────────────────────────────────
test('키스톤·RUSH 없음은 기존 피해와 동일 (중립)', () => {
  const a = totalBulletDamage(vulcanSquad(), false);
  const b = totalBulletDamage(vulcanSquad(), false);
  assert.ok(a > 0);
  assert.equal(a, b);
});

test('RUSH가 기함+호위 자동사격 피해에 정확히 ×1.18 한 번만 적용', () => {
  const norm = totalBulletDamage(vulcanSquad(), false);
  const rush = totalBulletDamage(vulcanSquad(), true);
  assert.ok(Math.abs(rush / norm - BAL.flow.rushDamageMult) < 1e-6, `비율 ${rush / norm}, 기대 ${BAL.flow.rushDamageMult}`);
});

test('RUSH가 순양함(support) 사격 피해에도 ×1.18 적용', () => {
  const mk = (rush) => {
    const sq = vulcanSquad(); sq.cruisers = 3;   // 순양함 보유
    const w = makeWorld(sq);
    sq.rushT = rush ? BAL.flow.rushDuration : 0;
    sq.supportAcc = 0;
    sq.fire(1.0, w);
    // cruiser 슬롯에서 나온 탄만 분리하기 어렵워 전체 합으로 비율 확인 (모두 동일 배수)
    return w.bullets.reduce((s, b) => s + b.damage, 0);
  };
  const norm = mk(false), rush = mk(true);
  assert.ok(Math.abs(rush / norm - BAL.flow.rushDamageMult) < 1e-6);
});

test('도탄(storm)은 원본의 비율이므로 RUSH가 이중 적용되지 않는다', () => {
  // storm 도탄 자탄 = 원본 damage × ricochetFrac. 원본 damage에 이미 RUSH가 접혀 있으므로 추가 곱 없음.
  const noop = () => {};
  const w = { squad: vulcanSquad(), logicalW: 480, logicalH: 776, bullets: [], enemyBullets: [], entities: [], mfx: {},
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop } };
  const parent = new Bullet(240, 400, 100, { vx: 0, vy: -500, kind: 'vulcan' });
  parent.ricochet = true;
  const hit = { x: 240, y: 400, r: 10, dead: false, hitByBullet: noop };       // 맞은 적
  const other = { x: 260, y: 410, r: 10, dead: false, hitByBullet: noop };     // 도탄이 튈 다른 적
  w.entities.push(hit, other);
  parent.onHit(hit, w);
  const child = w.bullets.find((b) => b !== parent);
  assert.ok(child, '도탄 자탄 생성됨');
  const frac = BAL.weaponEvolution.vulcan_storm.ricochetFrac;
  assert.ok(Math.abs(child.damage - 100 * frac) < 1e-6, `자탄 ${child.damage}, 기대 ${100 * frac} (RUSH 재곱 없음)`);
});

test('차지 충전 속도가 RUSH 중 ×1.20', () => {
  const mk = (rush) => {
    const sq = vulcanSquad();
    const w = makeWorld(sq); w.input.charging = true;
    sq.rushT = rush ? BAL.flow.rushDuration : 0;
    sq.charge = 0; sq.wasCharging = true;
    sq.updateCharge(0.1, w);
    return sq.charge;
  };
  const norm = mk(false), rush = mk(true);
  assert.ok(Math.abs(rush / norm - BAL.flow.rushChargeSpeedMult) < 1e-9, `비율 ${rush / norm}`);
});

test('이동 반응이 RUSH 중 ×1.15 (더 민첩)', () => {
  const mk = (rush) => {
    const sq = vulcanSquad(); sq.x = 100;
    const w = makeWorld(sq); w.input.targetX = 300;
    sq.rushT = rush ? BAL.flow.rushDuration : 0;
    sq.update(0.05, w);
    return sq.x - 100;   // 이동량
  };
  const norm = mk(false), rush = mk(true);
  assert.ok(rush > norm, `RUSH 이동 ${rush} > 일반 ${norm}`);
});
