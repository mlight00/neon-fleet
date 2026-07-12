import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claimKill } from '../js/kill-events.js';
import { Squad, Creature, Crystal, DronePod, HomingMissile } from '../js/entities.js';
import { freshKeystoneState } from '../js/keystones.js';
import { BAL } from '../js/balance.js';

const noop = () => {};
// main.js의 중앙 킬 함수 계약을 그대로 반영한 테스트 world 스텁 (§3.4 참조 구현).
//  실제 Squad.onEnemyKill(군체 용광로)·claimKill(멱등·isEnemy)·연쇄를 그대로 구동한다.
function makeWorld(squad) {
  const w = {
    squad, logicalW: 480, logicalH: 776, bullets: [], enemyBullets: [], entities: [], bosses: [], coins: 0,
    mfx: { explodeRadius: 0, explodeDmgFrac: 0.5 }, stageMods: { enemyHp: 1, shotCap: 999 },
    addCoins(n) { this.coins += n; },
    spawnEntity(e) { this.entities.push(e); },
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop },
    notifyEnemyKilled(e) {
      if (!claimKill(e)) return;
      const mfx = this.mfx;
      if (mfx && mfx.explodeRadius > 0) {
        const dmg = Math.max(2, (e.maxHp || 20) * mfx.explodeDmgFrac);
        for (const o of this.entities) {
          if (o === e || o.dead || !o.hitByBullet) continue;
          if (Math.hypot(o.x - e.x, o.y - e.y) <= mfx.explodeRadius + (o.r || 0)) {
            o.hitByBullet(dmg, this);
            if (o.dead) this.notifyEnemyKilled(o);   // 연쇄 처치 재귀 (claimKill로 1회)
          }
        }
      }
      this.squad.onEnemyKill(this, e);
    },
  };
  return w;
}
function forgeSquad(kills = 0) {
  const s = new Squad(480, 776, 100); s.x = 240; s.y = 640;
  s.keystone = 'swarm_forge'; s.keystoneState = freshKeystoneState(); s.keystoneState.kills = kills;
  return s;
}
function enemyAt(x, y, hp = 1) { const c = new Creature(x, y, 'small'); c.hp = c.maxHp = hp; return c; }

// ── claimKill 순수 계약 ───────────────────────────────────
test('claimKill: 살아있는 적은 청구 안 됨, 죽은 적은 1회만', () => {
  const e = enemyAt(0, 0); e.dead = false;
  assert.equal(claimKill(e), false);         // 아직 살아있음
  e.dead = true;
  assert.equal(claimKill(e), true);          // 첫 청구
  assert.equal(claimKill(e), false);         // 중복 차단
});

test('claimKill: 비적대(크리스탈·수송선)는 청구되지 않는다', () => {
  const cr = new Crystal(0, 0, 100); cr.dead = true;
  const pod = new DronePod(0, 0, 'mid'); pod.dead = true;
  assert.equal(claimKill(cr), false);
  assert.equal(claimKill(pod), false);
});

// ── 킬 이벤트 통합 (실 클래스) ───────────────────────────
test('일반 처치가 1킬로 집계된다', () => {
  const s = forgeSquad(); const w = makeWorld(s);
  const e = enemyAt(240, 200); e.dead = true;
  w.notifyEnemyKilled(e);
  assert.equal(s.keystoneState.kills, 1);
});

test('동일 적에 중앙 알림을 두 번 호출해도 1킬', () => {
  const s = forgeSquad(); const w = makeWorld(s);
  const e = enemyAt(240, 200); e.dead = true;
  w.notifyEnemyKilled(e); w.notifyEnemyKilled(e);
  assert.equal(s.keystoneState.kills, 1);
});

test('실제 Squad.fireLance로 9→10킬 시 유령 순양함(forgeT=8) 발동', () => {
  const s = forgeSquad(9); s.tier = 0; s.weapon = 'vulcan';
  const w = makeWorld(s);
  const e = enemyAt(240, 400, 1);   // 편대(y=640) 앞쪽 컬럼, 저체력
  w.entities.push(e);
  s.fireLance(w, 3);                // 3단 차지 랜스 직격 → 처치
  assert.equal(e.dead, true);
  assert.equal(s.keystoneState.kills, 0);            // 10 도달 → 0으로 롤오버
  assert.equal(s.keystoneState.forgeT, BAL.keystone.swarmForge.ghostDuration);  // 8초 발동
});

test('시즈 토피도 광역 연쇄 처치가 각각 한 번씩 집계된다', () => {
  const s = forgeSquad(); const w = makeWorld(s);
  w.mfx.explodeRadius = 80;   // 폭발 탄두 모듈 활성
  // 중심 적 + 반경 내 2적
  const center = enemyAt(240, 200, 1); center.dead = true;
  const near1 = enemyAt(250, 210, 1); const near2 = enemyAt(260, 220, 1);
  w.entities.push(center, near1, near2);
  w.notifyEnemyKilled(center);   // center + 폭발 연쇄로 near1·near2 처치
  assert.ok(near1.dead && near2.dead, '연쇄 처치됨');
  assert.equal(s.keystoneState.kills, 3);   // 3마리 각 1회
});

test('연쇄 폭발 중 같은 적이 중복 처리되지 않는다', () => {
  const s = forgeSquad(); const w = makeWorld(s);
  w.mfx.explodeRadius = 200;   // 서로가 서로 범위에 → 상호 연쇄
  const a = enemyAt(240, 200, 1); a.dead = true;
  const b = enemyAt(245, 205, 1);
  w.entities.push(a, b);
  w.notifyEnemyKilled(a);
  assert.equal(s.keystoneState.kills, 2);   // a,b 각 1회 (무한 재귀·중복 없음)
});

test('크리스탈·DronePod는 킬로 집계되지 않는다', () => {
  const s = forgeSquad(); const w = makeWorld(s);
  const cr = new Crystal(240, 200, 100); cr.dead = true;
  const pod = new DronePod(240, 220, 'mid'); pod.dead = true;
  w.notifyEnemyKilled(cr); w.notifyEnemyKilled(pod);
  assert.equal(s.keystoneState.kills, 0);
});

test('군체 용광로가 아닌 키스톤에서는 킬 이벤트가 부작용을 만들지 않는다', () => {
  const s = new Squad(480, 776, 100); s.keystone = 'phase_afterimage'; s.keystoneState = freshKeystoneState();
  const w = makeWorld(s);
  const e = enemyAt(240, 200); e.dead = true;
  w.notifyEnemyKilled(e);
  assert.equal(s.keystoneState.kills, 0);   // 군체 아님 → 카운트 없음
  assert.equal(s.keystoneState.forgeT, 0);
});
