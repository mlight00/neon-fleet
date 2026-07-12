import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Crystal, DronePod, GatePair } from '../js/entities.js';
import { Scavenger, GateParasite } from '../js/adaptive-enemies.js';
import { BAL } from '../js/balance.js';

// 실제 클래스를 구동하는 최소 world 스텁 (계산식 복사 아님 — 지시서 §3.4 요구).
function makeWorld() {
  const squad = {
    count: 0, cruisers: 0, doctrine: null, x: 240, y: 640,
    applyDelta(n) { this.count += n; },
    setCount(n) { this.count = n; },
    get rewardGainMult() { return (this.doctrine === 'swarm' && this.cruisers > 0) ? 1 + BAL.doctrine.swarm.droneGainBonus : 1; },
  };
  const noop = () => {};
  return {
    squad, entities: [], enemyBullets: [], bullets: [], coins: 0, mfx: {},
    scrollSpeed: 0, logicalW: 480, logicalH: 776, phase: 'track',
    stageMods: { enemyHp: 1 },
    addCoins(n) { this.coins += n; },
    spawnEntity(e) { this.entities.push(e); },
    spawnEnemyBullet(b) { this.enemyBullets.push(b); },
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop },
  };
}

// ─── 스캐빈저 보상·예약·도주 ───────────────────────────────
test('Crystal(100) 기본 실수령 = round(100×0.32) = 32', () => {
  const w = makeWorld();
  assert.equal(new Crystal(0, 0, 100).getDroneReward(w), 32);
});

test('podRewardMult·rewardGainMult가 Crystal·DronePod에 동일 적용', () => {
  const w = makeWorld();
  const cr = new Crystal(0, 0, 100), pod = new DronePod(0, 0, 'mid');
  const cr1 = cr.getDroneReward(w), pod1 = pod.getDroneReward(w);
  w.mfx.podRewardMult = 2;                        // 보상 모듈 ×2
  assert.equal(cr.getDroneReward(w), cr1 * 2);
  assert.equal(pod.getDroneReward(w), pod1 * 2);
  w.mfx.podRewardMult = 1; w.squad.doctrine = 'swarm'; w.squad.cruisers = 1;  // 군체 +10%
  assert.equal(cr.getDroneReward(w), Math.round(100 * BAL.economy.droneGainMult * 1.1));
});

test('스캐빈저가 Crystal(100)을 훔치면 원시값 100이 아니라 실수령 32를 저장', () => {
  const w = makeWorld();
  const cr = new Crystal(100, 300, 100); w.entities.push(cr);
  const sc = new Scavenger(100); sc.y = 250; w.entities.push(sc);
  for (let i = 0; i < 30 && sc.state !== 'flee'; i++) sc.update(0.1, w);
  assert.equal(sc.state, 'flee');
  assert.equal(cr.dead, true);
  assert.equal(sc.stored, 32);            // 원시 100 아님
});

test('스캐빈저 처치 시 48만 지급 + 사망 두 번 호출해도 한 번만', () => {
  const w = makeWorld();
  const cr = new Crystal(100, 300, 100); w.entities.push(cr);
  const sc = new Scavenger(100); sc.y = 250; w.entities.push(sc);
  for (let i = 0; i < 30 && sc.state !== 'flee'; i++) sc.update(0.1, w);
  const before = w.squad.count;
  sc.hitByBullet(999, w);
  assert.equal(w.squad.count - before, 48);   // 32 × 1.5
  sc.hitByBullet(999, w);                       // 중복 처리
  assert.equal(w.squad.count - before, 48);   // 여전히 48 (한 번만)
});

test('훔치지 않은 스캐빈저 처치 → 드론 없음, 코인만', () => {
  const w = makeWorld();
  const sc = new Scavenger(240); w.entities.push(sc);
  const coins0 = w.coins;
  sc.hitByBullet(999, w);
  assert.equal(w.squad.count, 0);                       // 드론 보상 없음
  assert.equal(w.coins - coins0, BAL.adaptiveEnemies.scavenger.coin);
});

test('보상을 들고 화면 밖으로 도주하면 드론 보상 미지급', () => {
  const w = makeWorld();
  const cr = new Crystal(100, 300, 100); w.entities.push(cr);
  const sc = new Scavenger(100); sc.y = 250; w.entities.push(sc);
  for (let i = 0; i < 30 && sc.state !== 'flee'; i++) sc.update(0.1, w);
  assert.equal(sc.stored, 32);
  const before = w.squad.count;
  for (let i = 0; i < 100 && !sc.dead; i++) sc.update(0.1, w);   // 위로 도주 → 화면 밖
  assert.equal(sc.dead, true);
  assert.equal(w.squad.count - before, 0);              // 지급 없음
});

test('두 스캐빈저가 같은 보상을 동시에 예약하지 못한다 (claimedBy)', () => {
  const w = makeWorld();
  const cr = new Crystal(100, 300, 40); w.entities.push(cr);
  const s1 = new Scavenger(100); s1.y = 250; const s2 = new Scavenger(110); s2.y = 255;
  w.entities.push(s1, s2);
  s1.pick(w); s2.pick(w);
  assert.equal(cr.claimedBy, s1);       // 먼저 예약한 s1
  assert.notEqual(s2.target, cr);       // s2는 이 보상을 못 잡음
});

test('예약한 스캐빈저가 강탈 전에 죽으면 예약이 해제된다', () => {
  const w = makeWorld();
  const cr = new Crystal(100, 300, 40); w.entities.push(cr);
  const sc = new Scavenger(100); sc.y = 250; w.entities.push(sc);
  sc.pick(w);
  assert.equal(cr.claimedBy, sc);
  sc.hitByBullet(999, w);               // 강탈 전 처치 (seek, stored 0)
  assert.equal(cr.claimedBy, null);     // 예약 해제
});

// ─── 게이트 패러사이트·감염 게이트 ─────────────────────────
test('패러사이트 생성 시 지정 레인의 gate.corruptSide 설정', () => {
  const gate = new GatePair(480, 300, { op: '+', value: 40 }, { op: 'x', value: 2 });
  new GateParasite(gate, 1);            // 오른쪽 감염
  assert.equal(gate.corruptSide, 'right');
});

test('패러사이트 생존 시 감염 레인 통과 → 게이트 연산 반전 (×2 → /2)', () => {
  const w = makeWorld();
  const gate = new GatePair(480, 300, { op: '+', value: 40 }, { op: 'x', value: 2 });
  new GateParasite(gate, 1);
  w.squad.count = 100; w.squad.x = 360; w.squad.y = 300; gate.y = 300;  // 오른쪽 레인 통과
  gate.update(0, w);
  assert.equal(w.squad.count, 50);      // 100 ×2가 아니라 /2
});

test('패러사이트 HP 감소: 일반 공격은 dmg×0.65만 적중 (armorReduce 0.35 실결합)', () => {
  const w = makeWorld();
  const gate = new GatePair(480, 300, { op: '+', value: 40 }, { op: 'x', value: 2 });
  const par = new GateParasite(gate, 1); w.entities.push(par);
  const hp0 = par.hp;                    // round(45×1)=45
  par.hitByBullet(10, w, { x: 100 });    // 일반 탄환(문맥 있음, 관통 아님)
  assert.equal(par.dead, false);         // 45 - 6.5 = 38.5 → 생존
  assert.ok(Math.abs((hp0 - par.hp) - 6.5) < 1e-9, `실감소 ${hp0 - par.hp}, 기대 6.5`);
});

test('패러사이트 HP 감소: 랜스 강습 3단+는 dmg 전액 적중 (관통 > 일반)', () => {
  const w = makeWorld();
  const gate = new GatePair(480, 300, { op: '+', value: 40 }, { op: 'x', value: 2 });
  const parN = new GateParasite(gate, 1);
  const parP = new GateParasite(gate, 1);
  const hp0 = parN.hp;
  parN.hitByBullet(10, w, { x: 100 });                          // 일반
  parP.hitByBullet(10, w, { lance: true, pierceDefense: true });// 랜스 강습 3단+
  const dropN = hp0 - parN.hp, dropP = hp0 - parP.hp;
  assert.ok(Math.abs(dropP - 10) < 1e-9, `관통 실감소 ${dropP}, 기대 10`);
  assert.ok(dropP > dropN, '관통 감소 > 일반 감소');
});

test('패러사이트: 일반 공격만으로도 결국 처치된다 (완전 면역 없음)', () => {
  const w = makeWorld();
  const gate = new GatePair(480, 300, { op: '+', value: 40 }, { op: 'x', value: 2 });
  const par = new GateParasite(gate, 1); w.entities.push(par);
  let guard = 0;
  while (!par.dead && guard++ < 100) par.hitByBullet(10, w, { x: 100 });  // 일반 탄환 반복
  assert.equal(par.dead, true);          // 65% 적중이라도 누적되면 사망
  assert.equal(gate.corruptSide, null);  // 정화됨
});

test('패러사이트 처치 → corruptSide null + 정화 10드론 1회', () => {
  const w = makeWorld();
  const gate = new GatePair(480, 300, { op: '+', value: 40 }, { op: 'x', value: 2 });
  const par = new GateParasite(gate, 1); w.entities.push(par);
  const before = w.squad.count;
  par.hitByBullet(999, w);
  assert.equal(gate.corruptSide, null);
  assert.equal(w.squad.count - before, BAL.adaptiveEnemies.gateParasite.cleanseDrones);
  par.hitByBullet(999, w);              // 중복
  assert.equal(w.squad.count - before, BAL.adaptiveEnemies.gateParasite.cleanseDrones);  // 여전히 10
});

test('정화 후 감염 레인 통과 결과가 원래 연산과 일치 (×2 → 200)', () => {
  const w = makeWorld();
  const gate = new GatePair(480, 300, { op: '+', value: 40 }, { op: 'x', value: 2 });
  const par = new GateParasite(gate, 1);
  par.hitByBullet(999, w);              // 정화
  w.squad.count = 100; w.squad.x = 360; w.squad.y = 300; gate.y = 300;
  gate.update(0, w);
  assert.equal(w.squad.count, 200);     // 원래 ×2
});

test('비감염 반대 레인은 원래 연산 유지 (+40)', () => {
  const w = makeWorld();
  const gate = new GatePair(480, 300, { op: '+', value: 40 }, { op: 'x', value: 2 });
  new GateParasite(gate, 1);            // 오른쪽만 감염
  w.squad.count = 100; w.squad.x = 120; w.squad.y = 300; gate.y = 300;  // 왼쪽(비감염) 통과
  gate.update(0, w);
  assert.equal(w.squad.count, 140);     // +40 그대로
});

test('부모 게이트가 applied/dead면 자식 패러사이트가 다음 업데이트에서 정리 (보상 없음)', () => {
  const w = makeWorld();
  const gate = new GatePair(480, 300, { op: '+', value: 40 }, { op: 'x', value: 2 });
  const par = new GateParasite(gate, 1); w.entities.push(par);
  const before = w.squad.count;
  gate.applied = true;                  // 게이트 통과됨
  par.update(0.1, w);
  assert.equal(par.dead, true);
  assert.equal(w.squad.count - before, 0);   // 부모 소멸 정리는 정화 보상 없음
});
