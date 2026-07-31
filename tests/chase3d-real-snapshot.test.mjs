import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Squad, Creature, Sniper, Crystal, Coin, TriGate, GatePair, Meteor, MidBoss, Turret } from '../js/entities.js';
import { makeBoss } from '../js/bosses.js';
import { BAL } from '../js/balance.js';
import { SHIP_DEFS } from '../js/ships.js';
import { buildSnapshot, computeSceneModel, realDrones, classifyBoss } from '../js/chase3d-mapping.js';

// Opus5 §12.3 — 실제 게임 클래스 인스턴스로 스냅샷 정확성을 검증한다(합성 목 아님).
//  실게임 600프레임 A/B 결정성은 Node에서 루프 자동화 불가(DOM) → 브라우저 QA에서 시드 고정으로 수행하고 보고서에 구분 기재.

function realRun(overrides = {}) {
  const squad = new Squad(480, 800, overrides.count ?? 40);
  Object.assign(squad, overrides.squad || {});
  const entities = overrides.entities || [];
  return { squad, bosses: overrides.bosses || [], world: { entities, bullets: [], enemyBullets: [] } };
}

test('R3D-01: 실제 Squad(count>0)의 드론 스냅샷은 비어 있지 않고 drawCap 을 넘지 않는다(§5.1)', () => {
  const squad = new Squad(480, 800, 40);   // tier 0 → clearR 12, width≈65.7 → 다수 표시
  const drones = realDrones(squad);
  assert.ok(drones.length > 0, `드론 ${drones.length} > 0`);
  assert.ok(drones.length <= BAL.squad.drawCap, `드론 ${drones.length} ≤ drawCap ${BAL.squad.drawCap}`);
  // 실제 draw 공식과 동일: clearR 내측 오프셋은 제외되어 있다
  const def = SHIP_DEFS[squad.tier];
  for (const d of drones) {
    const ox = d.worldX - squad.x, oyRaw = d.worldY - squad.y;   // oy 에는 sin bob ±2 포함
    assert.ok(Math.hypot(ox, oyRaw) >= def.clearR - 2.5, 'clearR 내측 드론 없음(bob 여유 2.5)');
    assert.ok(Number.isFinite(d.worldX) && Number.isFinite(d.worldY));
  }
  // count 를 cap 초과로 올려도 cap 에서 잘린다
  squad.count = BAL.squad.drawCap + 40;
  assert.ok(realDrones(squad).length <= BAL.squad.drawCap);
});

test('R3D-02: Gate/Crystal/Coin/Pow 류는 enemies 에 들어가지 않는다(§5.2)', () => {
  const ents = [new Creature(200, 300, 1), new Crystal(240, 400), new Coin(220, 420),
    new TriGate(480, 300, [{ kind: 'drones', value: 1 }, { kind: 'weaponLv' }, { kind: 'shield' }])];
  const snap = buildSnapshot(realRun({ entities: ents }));
  assert.equal(snap.enemies.length, 1, 'isEnemy 인 Creature 만');
  assert.equal(snap.enemies[0].kind, 'b1');
  assert.equal(snap.pickups.length, 2, 'Crystal+Coin 은 pickups');
  assert.equal(snap.gates.length, 1, 'TriGate 는 gates');
});

test('R3D-03: isEnemy !== true 개체는 enemies 제외 — 장애물(Meteor)은 obstacles(§5.2)', () => {
  const meteor = new Meteor(200, 100, () => 0.5);
  assert.notEqual(meteor.isEnemy, true, 'Meteor 는 isEnemy 아님');
  const snap = buildSnapshot(realRun({ entities: [meteor, new Sniper(300)] }));
  assert.equal(snap.enemies.length, 1);
  assert.equal(snap.enemies[0].kind, 'b4', 'Sniper→b4');
  assert.equal(snap.obstacles.length, 1, 'Meteor→obstacles');
});

test('R3D-04: 미지원 적은 b1 으로 위장하지 않고 unsupported(§5.2)', () => {
  const t = new Turret(160, 1, 480);
  assert.equal(t.isEnemy, true);
  const snap = buildSnapshot(realRun({ entities: [t] }));
  assert.equal(snap.enemies.length, 1);
  assert.equal(snap.enemies[0].kind, 'unsupported', 'Turret 은 unsupported (b1 아님)');
});

test('R3D-05: 실제 Boss 는 spriteId — B8 만 b8, 다른 보스는 unsupported(§5.2)', () => {
  const b8 = makeBoss(480, 1, 3, 1, 'B8');
  const b14 = makeBoss(480, 1, 3, 1, 'B14');
  assert.equal(b8.spriteId, 'B8');
  assert.notEqual(b14.spriteId, 'B8');
  const snap = buildSnapshot(realRun({ bosses: [b8, b14] }));
  assert.deepEqual(snap.bosses.map((b) => b.kind), ['b8', 'unsupported']);
});

test('R3D-06: MidBoss 는 def.id 기준 — B8 만 b8(§5.2)', () => {
  const m8 = new MidBoss(480, 2, 100, 'B8');
  const m7 = new MidBoss(480, 2, 100, 'B7');
  assert.equal(classifyBoss(m8), 'b8');
  assert.equal(classifyBoss(m7), 'unsupported');
  const snap = buildSnapshot(realRun({ entities: [m8, m7] }));
  assert.equal(snap.enemies.length, 0, 'MidBoss 는 enemies 가 아니라 bosses 로');
  assert.deepEqual(snap.bosses.map((b) => b.kind).sort(), ['b8', 'unsupported']);
});

test('R3D-07: 실인스턴스 snapshot 전후 deep 상태 동일 — 읽기 전용 증명(§5.3 정직 범위)', () => {
  const squad = new Squad(480, 800, 30);
  squad.t = 1.234; squad.bank = -0.21;
  const ents = [new Creature(200, 300, 1), new Sniper(300), new Crystal(240, 400),
    new TriGate(480, 300, [{ kind: 'drones', value: 1 }, { kind: 'weaponLv' }, { kind: 'shield' }]),
    new MidBoss(480, 2, 100, 'B8')];
  const run = { squad, bosses: [makeBoss(480, 1, 3, 1, 'B8')], world: { entities: ents, bullets: [], enemyBullets: [] } };
  const ser = () => JSON.stringify(run, (k, v) => (typeof v === 'function' ? undefined : v));
  const before = ser();
  const snap = buildSnapshot(run);
  const model = computeSceneModel(snap);
  assert.equal(ser(), before, 'buildSnapshot+computeSceneModel 은 실객체 상태를 1비트도 바꾸지 않음');
  assert.ok(model.flagship && Number.isFinite(model.flagship.x), '모델 유한');
  assert.ok(model.drones.length > 0, '실드론 모델 존재');
});
