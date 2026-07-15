import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isGrazeDistance, addFlow, updateFlow, onFlowHit } from '../js/flow.js';
import { EnemyShot, Squad, NeonArbiter } from '../js/entities.js';
import { freshKeystoneState } from '../js/keystones.js';
import { BAL } from '../js/balance.js';

const cfg = () => BAL.flow;

// ── 8.1 FLOW 순수 로직 ─────────────────────────────────────
test('실제 피격 경계 내부는 graze가 아니다', () => {
  // hitDist = 15+8 = 23. 경계 안(22)은 graze 아님
  assert.equal(isGrazeDistance(22, 15, 8, 18), false);
  assert.equal(isGrazeDistance(23, 15, 8, 18), false);   // 경계 정확히 = 피격, graze 아님
});

test('실제 피격 경계 바로 바깥은 graze다', () => {
  assert.equal(isGrazeDistance(23.001, 15, 8, 18), true);
  assert.equal(isGrazeDistance(30, 15, 8, 18), true);
});

test('grazeBand 바깥은 graze가 아니다', () => {
  // hitDist+band = 23+18 = 41. 41은 포함, 41.001은 제외
  assert.equal(isGrazeDistance(41, 15, 8, 18), true);
  assert.equal(isGrazeDistance(41.001, 15, 8, 18), false);
});

test('FLOW가 정확히 100(max)에서 RUSH를 시작하고 FLOW 0으로 초기화', () => {
  const s = addFlow({ flow: 90, rushT: 0, combo: 9, sinceGraze: 5 }, cfg());
  assert.equal(s.rushStarted, true);
  assert.equal(s.flow, 0);
  assert.equal(s.rushT, cfg().rushDuration);
});

test('FLOW 90 미만에서는 RUSH가 시작되지 않는다', () => {
  const s = addFlow({ flow: 70, rushT: 0, combo: 0, sinceGraze: 5 }, cfg());
  assert.equal(s.rushStarted, false);
  assert.equal(s.flow, 80);
});

test('RUSH 중 graze는 FLOW를 올리지 않는다(콤보만 증가)', () => {
  const s = addFlow({ flow: 0, rushT: 2, combo: 3, sinceGraze: 0 }, cfg());
  assert.equal(s.flow, 0);
  assert.equal(s.rushT, 2);
  assert.equal(s.combo, 4);
});

test('마지막 graze 후 decayDelay(1.5초) 전에는 감소하지 않는다', () => {
  const s = updateFlow({ flow: 50, rushT: 0, combo: 5, sinceGraze: 1.0 }, 0.4, cfg());
  assert.equal(s.flow, 50);   // sinceGraze 1.4 < 1.5
});

test('감소 시작 후 초당 decayPerSec(8)씩 감소하고 0 아래로 안 내려감', () => {
  const s = updateFlow({ flow: 50, rushT: 0, combo: 5, sinceGraze: 2.0 }, 1.0, cfg());
  assert.ok(Math.abs(s.flow - 42) < 1e-9);   // 50 - 8
  const z = updateFlow({ flow: 3, rushT: 0, combo: 5, sinceGraze: 2.0 }, 1.0, cfg());
  assert.equal(z.flow, 0);
  assert.equal(z.combo, 0);   // 0 도달 시 콤보 리셋
});

test('RUSH 타이머는 dt로 감소하고 0에서 rushEnded', () => {
  const a = updateFlow({ flow: 0, rushT: 0.3, combo: 5, sinceGraze: 0 }, 0.2, cfg());
  assert.ok(a.rushT > 0 && !a.rushEnded);
  const b = updateFlow({ flow: 0, rushT: 0.1, combo: 5, sinceGraze: 0 }, 0.2, cfg());
  assert.equal(b.rushT, 0);
  assert.equal(b.rushEnded, true);
});

test('일반 피격 시 FLOW hitLoss(35) 감소, 콤보 0', () => {
  const s = onFlowHit({ flow: 60, rushT: 0, combo: 4, sinceGraze: 1 }, cfg());
  assert.equal(s.flow, 25);
  assert.equal(s.combo, 0);
  assert.equal(s.rushEnded, false);
});

test('RUSH 중 피격 시 RUSH 즉시 종료 + FLOW 0', () => {
  const s = onFlowHit({ flow: 0, rushT: 3, combo: 8, sinceGraze: 0 }, cfg());
  assert.equal(s.rushT, 0);
  assert.equal(s.flow, 0);
  assert.equal(s.rushEnded, true);
});

// ── 8.2 EnemyShot 실제 클래스 (최소 world 스텁 + 진짜 Squad/EnemyShot) ──
function makeWorld(squad) {
  const noop = () => {};
  return {
    squad, logicalW: 480, logicalH: 776, enemyBullets: [], bullets: [], entities: [], bosses: [],
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop },
    mfx: {},
  };
}
function freshSquad() {
  const sq = new Squad(480, 776, 100);
  sq.x = 240; sq.y = 640;
  return sq;
}
// 편대 바로 위에서 hitRadius 바깥 graze 밴드에 정확히 놓고, 아래로 지나가지 않게 느린 탄
function grazeShot(sq) {
  const gx = sq.x + sq.hitRadius + 3 + 8;  // dist ≈ hitRadius + 3(밴드 안) ; r=8
  return new EnemyShot(gx, sq.y, 0, 0, { r: 8, dmgPct: 0.05, dmgMin: 3 });
}

test('적 처치가 집중 게이지를 gainPerKill만큼 지급한다 (콤보 — 회피 대체)', () => {
  const sq = freshSquad(); const w = makeWorld(sq);
  sq.onEnemyKill(w, { isEnemy: true });
  assert.equal(sq.flow, BAL.flow.gainPerKill);
});

test('비적대(크리스탈·수송선 등) 처치는 집중 게이지를 올리지 않는다', () => {
  const sq = freshSquad(); const w = makeWorld(sq);
  sq.onEnemyKill(w, { isEnemy: false });
  assert.equal(sq.flow, 0);
});

test('적탄이 기함 코어를 스쳐 지나가도 더는 FLOW를 주지 않는다 (회피 폐지 회귀)', () => {
  const sq = freshSquad(); const w = makeWorld(sq);
  const shot = grazeShot(sq); shot.age = 1;
  for (let i = 0; i < 5; i++) shot.update(0.016, w);
  assert.equal(sq.flow, 0);
});

test('실제 명중한 탄은 graze를 지급하지 않는다', () => {
  const sq = freshSquad(); const w = makeWorld(sq);
  const shot = new EnemyShot(sq.x, sq.y, 0, 0, { r: 8, dmgPct: 0.05, dmgMin: 3 }); // 정중앙 = 피격
  shot.age = 1;
  shot.update(0.016, w);
  assert.equal(shot.dead, true);
  assert.equal(sq.flow, 0);        // graze 없음
  assert.ok(sq.count < 100);       // 실제 피해
});

test('생성 minBulletAge(0.12초) 이전 탄은 graze를 지급하지 않는다', () => {
  const sq = freshSquad(); const w = makeWorld(sq);
  const shot = grazeShot(sq); shot.age = 0.05;  // 너무 어림
  shot.update(0.016, w);
  assert.equal(sq.flow, 0);
  assert.equal(shot.grazed, false);
});

test('진화 무적 중에는 graze를 지급하지 않는다', () => {
  const sq = freshSquad(); sq.invulnT = 1; const w = makeWorld(sq);
  const shot = grazeShot(sq); shot.age = 1;
  shot.update(0.016, w);
  assert.equal(sq.flow, 0);
  assert.equal(shot.grazed, false);
});

test('무적 중 실제 피격은 FLOW 규칙도 적용하지 않는다(손실 0)', () => {
  const sq = freshSquad(); sq.invulnT = 1; sq.flow = 50; const w = makeWorld(sq);
  const shot = new EnemyShot(sq.x, sq.y, 0, 0, { r: 8, dmgPct: 0.05, dmgMin: 3 });
  shot.age = 1; shot.update(0.016, w);
  assert.equal(sq.count, 100);     // 무적 → 손실 0
  assert.equal(sq.flow, 50);       // FLOW 유지
});

test('실제 전투 피격 시 onCombatHit로 FLOW가 hitLoss만큼 감소', () => {
  const sq = freshSquad(); sq.flow = 50; const w = makeWorld(sq);
  const shot = new EnemyShot(sq.x, sq.y, 0, 0, { r: 8, dmgPct: 0.05, dmgMin: 3 });
  shot.age = 1; shot.update(0.016, w);
  assert.equal(sq.flow, 50 - BAL.flow.hitLoss);
});

// ── 후속 §2.4: 제거된(dead) 적탄이 같은 프레임에 피해·graze·STAGGER를 만들지 않는다 ──
test('dead EnemyShot은 update()해도 위치가 변하지 않는다', () => {
  const sq = freshSquad(); const w = makeWorld(sq);
  const shot = new EnemyShot(100, 100, 500, 500, { r: 8, dmgPct: 0.05, dmgMin: 3 });
  shot.dead = true; shot.age = 1;
  shot.update(0.1, w);
  assert.equal(shot.x, 100); assert.equal(shot.y, 100);
});

test('dead EnemyShot이 플레이어와 겹쳐도 드론 피해가 없다', () => {
  const sq = freshSquad(); const w = makeWorld(sq);
  const shot = new EnemyShot(sq.x, sq.y, 0, 0, { r: 8, dmgPct: 0.05, dmgMin: 3 });
  shot.dead = true; shot.age = 1;
  shot.update(0.016, w);
  assert.equal(sq.count, 100);   // 손실 없음
});

test('dead EnemyShot이 graze 거리여도 FLOW가 증가하지 않는다', () => {
  const sq = freshSquad(); const w = makeWorld(sq);
  const shot = grazeShot(sq); shot.dead = true; shot.age = 1;
  shot.update(0.016, w);
  assert.equal(sq.flow, 0);
});

test('위상 잔상이 처치로 제거한 탄은 그 후 update돼도 피해가 없다 (실클래스)', () => {
  const sq = freshSquad(); sq.keystone = 'phase_afterimage'; sq.keystoneState = freshKeystoneState();
  const w = makeWorld(sq);
  // 편대 위치에 실제 EnemyShot 5발을 반경 안에 배치
  const shots = [];
  for (let i = 0; i < 5; i++) { const s = new EnemyShot(sq.x, sq.y, 0, 0, { r: 8, dmgPct: 0.05, dmgMin: 3 }); w.enemyBullets.push(s); shots.push(s); }
  const N = BAL.keystone.phaseAfterimage.killsPerProc;
  for (let i = 0; i < N; i++) sq.onEnemyKill(w, { isEnemy: true });   // N번째 처치 → 파동 → 5발 dead
  assert.ok(shots.every((s) => s.dead), '반경 내 탄 제거');
  const count0 = sq.count;
  for (const s of shots) s.update(0.016, w);             // 제거탄 차례
  assert.equal(sq.count, count0);                        // 이후 피해 없음
});

test('적탄 update는 B22 STAGGER와 무관하다 (STAGGER는 플레이어 피해 누적 기반)', () => {
  const arb = new NeonArbiter(480, 1, 30, 1); arb.y = arb.targetY = 130;
  const sq = freshSquad(); const w = makeWorld(sq); w.bosses = [arb];
  const b = new EnemyShot(sq.x + 120, sq.y - 60, 0, 40, { r: 8, dmgPct: 0.05, dmgMin: 3 }); b.age = 1; w.enemyBullets.push(b);
  b.update(0.016, w);
  assert.equal(arb.stagger, 0);   // 적탄은 STAGGER를 올리지 않음
});

test('일반 적탄은 정상 이동하며 FLOW를 주지 않는다 (회피 폐지 회귀)', () => {
  const sq = freshSquad(); const w = makeWorld(sq);
  const shot = new EnemyShot(sq.x + 120, sq.y - 120, 0, 60, { r: 8, dmgPct: 0.05, dmgMin: 3 }); shot.age = 1;
  const y0 = shot.y;
  shot.update(0.016, w);
  assert.ok(shot.y > y0, '탄이 아래로 이동');
  assert.equal(sq.flow, 0, 'FLOW 미지급');
});
