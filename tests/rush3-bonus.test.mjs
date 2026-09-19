// rush3-bonus — 보너스전(r3.15, 실게임 구현계획 B-1 장치 4 · 01 §5-9 "승리 후 시간제 보너스"). 배우는 것 = "살려 온 군단이 곧 보상".
//  본전투 승리 조건이 처음 성립하는 STEP 에 won·wonAt·mainResult 를 **확정**하고(over 는 세우지 않는다) phase 'bonus' 로 들어가
//  sec 초 동안 움직이는 표적(t1..)을 맞혀 score·tier 를 올린다. 시간이 다 되면 bonusEnd + over. 기록은 본전투 확정값, 보너스 점수는 bestBonus(희소).
//  ⚠️규칙(bonus/combat/stages)은 순수 — 검사도 STEP 만 돌린다. 보너스가 없는 스테이지(1~3·8 제외 코스)는 종전대로 승리 STEP 에 over.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage, stageVersion, STAGE_IDS, MAX_DY, DEFS } from '../rush3/stages.js';
import { COURSE_IDS } from '../rush3/courses.js';
import { makeBullet, WEAPONS } from '../rush3/weapons.js';
import { targetX, tierOf, makeTarget } from '../rush3/bonus.js';
import { vehicleX } from '../rush3/supply.js';
import { triWave } from '../rush3/motion.js';
import { BAL3 } from '../rush3/balance.js';
import { createSave3, KEY3 } from '../rush3/save.js';
import { createRenderer3, HUD_ROW } from '../rush3/render.js';
import { boot, bonusLine } from '../rush3/main.js';
import { playPolicy, pickX } from './lib/rush3-policies.mjs';

const C = BAL3.colors;
const R = BAL3.bonus.targetR;
const NONE = { pointerX: null, dragDx: 0, keyDir: 0 };
const at = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0 });
const bossOr = (x) => (run) => at(run.boss ? run.boss.x : x);
const count = (ev, type) => ev.filter((e) => e.type === type).length;
const holdFire = (run) => { for (const u of run.units) u.fireT = 1e9; };

//  합성 스테이지 조립기(rush3-combat 의 mkStage + bonus 칸). 표적 정의는 buildStage 가 만드는 꼴(id/max/r 포함)로 직접 적는다
function mkStage(o = {}) {
  return {
    id: o.id ?? 't', version: 1, title: 'test', startUnits: o.startUnits ?? 1, startWeapon: o.startWeapon ?? 'rifle',
    length: o.length ?? 100000, eliteZ: o.elite ? o.elite.z : null,
    gateRows: (o.gates || []).map((g, i) => ({ id: g.id ?? 'g' + (i + 1), z: g.z, h: 24, maxValue: g.maxValue ?? 15, bypass: !!g.bypass, armZ: g.armZ === undefined ? null : g.armZ, cells: g.cells })),
    supplies: (o.supplies || []).map((s, i) => ({ id: s.id ?? 'c' + (i + 1), z: s.z, x: s.x, r: 30, kind: s.kind, durability: s.durability, maxDurability: s.durability, payload: s.payload, coverZ: s.coverZ ?? null, pairId: s.pairId ?? null })),
    walls: [],
    spawns: (o.spawns || []).map((s) => ({ z: s.z, kind: s.kind, n: s.xs.length, xs: s.xs, zs: s.zs, corridorHw: s.corridorHw ?? null })),
    elite: o.elite ? { z: o.elite.z, hp: o.elite.hp, summon: !!o.elite.summon } : null,
    bonus: o.bonus ?? null,
  };
}
const tdef = (id, o = {}) => ({ id, dz: o.dz ?? 300, x0: o.x0 ?? 240, x1: o.x1 ?? 240, period: o.period ?? 1, phase: o.phase ?? 0,
                                hp: o.hp ?? 3, max: o.hp ?? 3, value: o.value ?? 7, respawn: o.respawn ?? 0.5, r: R });
//  진입까지 굴린다(입력은 함수/객체). 반환 = 진입 STEP 에 나온 이벤트
function enterBonus(run, input = NONE, max = 6000) {
  for (let i = 0; i < max; i++) {
    stepRun(run, typeof input === 'function' ? input(run) : input, STEP);
    const ev = drainEvents(run);
    if (run.phase === 'bonus') return ev;
    if (run.over) throw new Error('보너스 전에 끝남: won=' + run.won);
  }
  throw new Error('보너스 진입 실패 z=' + run.z);
}
const snapTargets = (run) => run.bonusTargets.map((t) => [t.x, t.z, t.alive, t.hp]);

// ─────────────────────────────────────────────────────────────────────────────
test('V3-BONUS B-1: 형식 — buildStage(8).bonus { sec 20, tiers = BAL3, 표적 4(t1~t4) 도로 안·탄 정리선 안·period>0 }, 결정적·참조 비공유, version 2, 1~3 은 null, 보너스 구간(eliteZ 뒤)에 게이트·통·스폰 없음(빌드 guard 가 throw), 표적 삼각파 = 차량 통 vehicleX 와 같은 공식', () => {
  const a = buildStage(8), b = buildStage(8);
  assert.ok(a.bonus, 'S8 에 bonus');
  assert.equal(a.bonus.sec, 20);
  assert.deepEqual(a.bonus.tiers, [...BAL3.bonus.tiers]);
  assert.equal(a.bonus.targets.length, 4, '검수 반영: 표적 4개(기관총 50명 이상에서 셋이 동시에 죽어 있는 프레임 완화)');
  assert.deepEqual(a.bonus.targets.map((t) => t.id), ['t1', 't2', 't3', 't4']);
  assert.deepEqual(a.bonus.targets.map((t) => t.dz), [240, 320, 400, 480], '화면 y 400/320/240/160 으로 80px 간격');
  assert.equal(new Set(a.bonus.targets.map((t) => t.phase)).size, 4, '출발 위상이 전부 다르다(동시에 같은 끝에 몰리지 않게)');
  const reach = BAL3.view.LINE_Y + BAL3.cull.bulletAhead;
  for (const t of a.bonus.targets) {
    assert.equal(t.r, R);
    assert.ok(t.x0 - t.r >= 80 && t.x1 + t.r <= 400 && t.x0 <= t.x1, t.id + ' 왕복 범위 도로 안');
    assert.ok(t.dz + t.r < reach, t.id + ' 탄 정리선 안');
    assert.ok(t.period > 0 && t.hp > 0 && t.value > 0 && t.respawn > 0, t.id + ' 양수');
    assert.equal(t.max, t.hp);
    assert.ok(t.phase >= 0 && t.phase < 1);
  }
  //  이 스테이지에서 얻을 수 있는 사거리 무기(시작 무기 + 무기 통)는 전진 중에도 표적에 닿아야 한다: range × (vz − scroll) / vz − 대형 깊이 ≥ dz + r
  const obtainable = [a.startWeapon, ...a.supplies.filter((s) => s.kind === 'weapon').map((s) => s.payload.weapon)].map((id) => WEAPONS[id]).filter((w) => w && w.range != null);
  for (const w of obtainable) for (const t of a.bonus.targets) assert.ok(w.range * (w.vz - BAL3.scroll) / w.vz - MAX_DY >= t.dz + t.r, w.id + ' 가 ' + t.id + ' 에 닿지 않는다');
  assert.deepEqual(a, b, '결정성');
  assert.notEqual(a.bonus, b.bonus); assert.notEqual(a.bonus.targets, b.bonus.targets); assert.notEqual(a.bonus.targets[0], b.bonus.targets[0]); assert.notEqual(a.bonus.tiers, b.bonus.tiers);
  assert.equal(stageVersion(8), 2);
  for (const id of STAGE_IDS) assert.equal(buildStage(id).bonus, null, 'S' + id);
  //  보너스 구간 불변식: 게이트·통·스폰 z 가 전부 eliteZ 이하(stepBonus 는 셔터·보상·스폰을 부르지 않는다).
  //   검수 반영으로 buildStage 가 같은 조건을 빌드 시점 guard 로 잠갔다(아래 DEFS[999]) — 이 S8 루프는 실측 대조군으로 그대로 둔다
  for (const row of a.gateRows) assert.ok(row.z <= a.eliteZ, row.id);
  for (const s of a.supplies) assert.ok(s.z + s.r <= a.eliteZ, s.id);
  for (const sp of a.spawns) assert.ok(sp.z <= a.eliteZ, '스폰 z' + sp.z);
  //  빌드 시점 guard: 보너스 스테이지에 eliteZ 뒤 게이트·통·스폰이 하나라도 있으면 throw(DEFS 는 def() 조회의 첫 자리 — 임시 정의를 넣었다 뺀다).
  //   eliteZ 가 없는(정예 없는) 보너스 스테이지는 length 가 경계. 보너스가 없는 스테이지는 뒤에 무엇이 있어도 guard 밖(종전 규칙)
  const okDef = () => ({ version: 1, title: '검사', startUnits: 1, startWeapon: 'rifle', length: 3000, eliteZ: 2600,
    gates: [{ z: 1000, maxValue: 15, cells: [[80, 240, 1], [240, 400, 1]] }], supplies: [{ z: 1400, x: 120, kind: 'soldier', durability: 2, n: 1 }],
    walls: [], spawns: [{ z: 1800, kind: 'grunt', n: 1, xs: [240] }], elite: { z: 2600, hp: 10, summon: false },
    bonus: { sec: 5, targets: [{ dz: 300, x0: 200, x1: 280, period: 2, hp: 3, value: 1 }] } });
  try {
    DEFS[999] = okDef();
    assert.doesNotThrow(() => buildStage(999), '경계 안이면 정상 빌드');
    DEFS[999] = { ...okDef(), gates: [{ z: 2700, maxValue: 15, cells: [[80, 240, 1], [240, 400, 1]] }] };
    assert.throws(() => buildStage(999), /보너스 스테이지의 게이트 g1/);
    DEFS[999] = { ...okDef(), supplies: [{ z: 2580, x: 120, kind: 'soldier', durability: 2, n: 1 }] };
    assert.throws(() => buildStage(999), /보너스 스테이지의 통 c1/, '통은 반지름까지 본다(z + r > eliteZ)');
    DEFS[999] = { ...okDef(), spawns: [{ z: 2601, kind: 'grunt', n: 1, xs: [240] }] };
    assert.throws(() => buildStage(999), /보너스 스테이지의 스폰/);
    DEFS[999] = { ...okDef(), eliteZ: null, elite: null, spawns: [{ z: 3001, kind: 'grunt', n: 1, xs: [240] }] };
    assert.throws(() => buildStage(999), /z > 3000/, '정예 없는 보너스 스테이지는 length 가 경계');
    DEFS[999] = { ...okDef(), bonus: undefined, spawns: [{ z: 2900, kind: 'grunt', n: 1, xs: [240] }] };
    assert.doesNotThrow(() => buildStage(999), '보너스가 없으면 guard 밖');
  } finally { delete DEFS[999]; }
  assert.throws(() => buildStage(999), /unknown stage/);
  //  본전투는 근사 시절 그대로(C-2·C-3 유지)
  assert.equal(a.length, 7800); assert.equal(a.eliteZ, 7400); assert.equal(a.gateRows.length, 3); assert.equal(a.elite.summon, true);
  //  순수 헬퍼
  const t = makeTarget(tdef('t1', { x0: 100, x1: 300, period: 2, phase: 0 }), 1000);
  assert.equal(t.x, 100); assert.equal(t.z, 1300); assert.equal(t.alive, true); assert.equal(t.max, 3);
  assert.equal(targetX(t, 0.5), 200); assert.equal(targetX(t, 1), 300); assert.equal(targetX(t, 1.5), 200); assert.equal(targetX(t, 2), 100);
  assert.equal(targetX(makeTarget(tdef('t2', { x0: 100, x1: 300, period: 2, phase: 0.5 })), 0), 300, '위상 0.5 = 반대 끝에서 출발');
  assert.equal(targetX(makeTarget(tdef('t3', { x0: 150, x1: 150, period: 0 })), 3), 150, 'period 0 → x0');
  //  삼각파는 motion.triWave 한 곳(검수 반영): 표적 targetX(phase 0 / 0.5) 와 차량 통 vehicleX(homeX x0 / x1) 가 같은 t 에 같은 x
  const mv = { x0: 100, x1: 300, period: 2 };
  const t0 = makeTarget(tdef('t1', { ...mv, phase: 0 })), t5 = makeTarget(tdef('t2', { ...mv, phase: 0.5 }));
  for (let i = 0; i <= 240; i++) {
    const tt = i * STEP;
    assert.equal(targetX(t0, tt), vehicleX(mv, 100, tt), 'phase 0 ↔ homeX x0 @' + tt);
    assert.equal(targetX(t5, tt), vehicleX(mv, 300, tt), 'phase 0.5 ↔ homeX x1 @' + tt);
    assert.equal(targetX(t0, tt), triWave(100, 300, 2, 0, tt));
  }
  assert.equal(triWave(100, 300, 0, 0, 7), 100, 'period 0 → x0');
  assert.equal(triWave(100, 300, 2, 0.25, 0), 200, 'u0 0.25 = 가운데에서 오른쪽으로');
  assert.deepEqual([0, 9, 10, 24, 25, 50, 999].map((s) => tierOf(s, [10, 25, 50])), [0, 0, 1, 1, 2, 3, 3]);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-BONUS B-2: 승리 확정 — 정예 격파 STEP 에 won·wonAt·mainResult 확정, over 는 아님, phase bonus·bonus {t 0, sec, score 0, tier 0, hits 0}, 같은 STEP 이벤트 win 1·bonusStart 1, 진입 시 적·적탄 0', () => {
  const bonus = { sec: 5, tiers: [10, 25, 50], targets: [tdef('t1'), tdef('t2', { dz: 400, x0: 120, x1: 360, period: 3 })] };
  const stage = mkStage({ startUnits: 10, elite: { z: 500, hp: 3 }, bonus });
  const run = createRun(stage);
  assert.equal(run.phase, 'main'); assert.equal(run.bonus, null); assert.deepEqual(run.bonusTargets, []); assert.equal(run.mainResult, null);
  assert.equal(run.bonusDef, stage.bonus, 'bonusDef = createRun 에 넘긴 stage.bonus 그 참조'); assert.equal(run.bonusDef.sec, 5);
  const ev = enterBonus(run, bossOr(240));
  assert.equal(count(ev, 'bossKill'), 1); assert.equal(count(ev, 'win'), 1); assert.equal(count(ev, 'bonusStart'), 1);
  const st = ev.find((e) => e.type === 'bonusStart');
  assert.deepEqual([st.sec, st.n], [5, 2]);
  assert.equal(run.won, true); assert.equal(run.over, false, '승리 확정 STEP 에 over 가 아니다');
  assert.equal(run.wonAt, run.time);
  assert.deepEqual(run.mainResult, { wonAt: run.time, survivors: run.units.length, peak: run.peak, kills: run.kills });
  assert.ok(run.units.length >= 1);
  assert.equal(run.phase, 'bonus');
  assert.deepEqual(run.bonus, { t: 0, sec: 5, score: 0, tier: 0, hits: 0 });
  assert.equal(run.enemies.length, 0); assert.equal(run.eshots.length, 0); assert.equal(run.boss, null);
  assert.equal(run.bonusTargets.length, 2);
  assert.deepEqual(run.bonusTargets.map((t) => t.id), ['t1', 't2']);
  for (const t of run.bonusTargets) { assert.equal(t.z, run.z + t.dz); assert.equal(t.alive, true); }
  //  정예 없는 변형(length 600): 도달 직전에 적탄을 하나 넣어 두면 진입 STEP 에 비워진다. 날아가던 아군 탄은 남는다
  const run2 = createRun(mkStage({ startUnits: 4, length: 600, bonus }));
  while (run2.z < 600 - 2 * BAL3.scroll * STEP) { stepRun(run2, at(240), STEP); drainEvents(run2); }
  run2.eshots.push({ x: 240, z: run2.z + 500, px: 240, pz: run2.z + 500, vx: 0, vz: 0, dmg: 1, r: 5, dead: false });
  const bullets = run2.bullets.length;
  const ev2 = enterBonus(run2, at(240), 10);
  assert.equal(count(ev2, 'win'), 1); assert.equal(count(ev2, 'bonusStart'), 1);
  assert.equal(run2.eshots.length, 0, '진입 시 적탄 0'); assert.equal(run2.enemies.length, 0);
  assert.ok(run2.bullets.length >= Math.min(1, bullets), '아군 탄은 지우지 않는다');
  assert.equal(run2.over, false); assert.equal(run2.won, true);
  assert.equal(run2.spawnCursor, run2.spawns.length);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-BONUS B-3: 결정성·도로 안 — 같은 입력열 두 판의 표적 [x, z, alive, hp] 가 STEP 마다 같고, 1200 STEP 내내 x ∈ [80+r, 400−r]·z === run.z + dz', () => {
  const s8 = buildStage(8);
  const make = () => createRun(mkStage({ startUnits: 20, startWeapon: 'auto', elite: { z: 500, hp: 1 }, bonus: s8.bonus }));
  const input = (i) => at(240 + Math.round(100 * Math.sin(i / 40)));
  const a = make(), b = make();
  enterBonus(a, bossOr(240)); enterBonus(b, bossOr(240));
  assert.deepEqual(snapTargets(a), snapTargets(b));
  let hitsA = 0;
  for (let i = 0; i < 1200 && !a.over; i++) {
    stepRun(a, input(i), STEP); stepRun(b, input(i), STEP);
    hitsA += count(drainEvents(a), 'bonusHit'); drainEvents(b);
    assert.deepEqual(snapTargets(a), snapTargets(b), 'STEP ' + i);
    assert.deepEqual([a.bonus.score, a.bonus.tier, a.bonus.hits, a.z, a.x], [b.bonus.score, b.bonus.tier, b.bonus.hits, b.z, b.x]);
    for (const t of a.bonusTargets) {
      assert.ok(t.x >= 80 + R - 1e-9 && t.x <= 400 - R + 1e-9, t.id + ' x=' + t.x);
      assert.ok(Math.abs(t.z - (a.z + t.dz)) < 1e-9, t.id + ' z');
    }
  }
  assert.equal(a.over, true); assert.equal(a.bonus.t, 20);
  assert.ok(hitsA > 0, '기관총 20명이면 맞힌다: ' + hitsA);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-BONUS B-4: 명중·점수·단계 — 직격 hp −dmg·bonusTargetHit, 0 이면 bonusHit{value}·score·hits·alive false, respawn 뒤 bonusRespawn·hp=max, 문턱 넘는 STEP 에 bonusTier 1회(내려가지 않음), 죽은 표적은 통과, 저격총은 같은 표적 재타격 없음', () => {
  const bonus = { sec: 30, tiers: [7, 14, 100], targets: [tdef('t1', { hp: 3, value: 7, respawn: 0.5 })] };
  const run = createRun(mkStage({ startUnits: 1, length: 300, bonus }));
  enterBonus(run, at(240));
  holdFire(run);
  const t = run.bonusTargets[0];
  assert.equal(t.x, 240);
  const shoot = (kind = 'rifle', dz = -30) => { const b = makeBullet(kind, 240, t.z + dz, 1); run.bullets.push(b); stepRun(run, at(240), STEP); return [drainEvents(run), b]; };
  //  1발: hp 3 → 2, 탄 소멸
  let [ev, b] = shoot();
  assert.equal(t.hp, 2); assert.equal(count(ev, 'bonusTargetHit'), 1); assert.equal(b.dead, true); assert.equal(run.bullets.includes(b), false);
  assert.deepEqual(ev.find((e) => e.type === 'bonusTargetHit').id, 't1');
  assert.equal(count(ev, 'bonusHit'), 0);
  shoot();
  [ev] = shoot();
  assert.equal(t.alive, false); assert.equal(t.hp, 0); assert.equal(t.respawnT, 0.5);
  const hit = ev.find((e) => e.type === 'bonusHit');
  assert.deepEqual([hit.id, hit.value, hit.score, hit.hits], ['t1', 7, 7, 1]);
  assert.equal(run.bonus.score, 7); assert.equal(run.bonus.hits, 1);
  const tier1 = ev.filter((e) => e.type === 'bonusTier');
  assert.equal(tier1.length, 1); assert.deepEqual([tier1[0].tier, tier1[0].score], [1, 7]); assert.equal(run.bonus.tier, 1);
  //  죽은 표적은 탄이 통과한다(후보 제외)
  [ev, b] = shoot();
  assert.equal(b.dead, false); assert.equal(count(ev, 'bonusTargetHit') + count(ev, 'bonusHit'), 0); assert.equal(t.hp, 0);
  run.bullets.length = 0;
  //  respawn 0.5s = 30 STEP 뒤(첫 STEP 은 이미 지났다) 같은 궤적에 재등장
  let respawned = 0, steps = 0;
  while (!t.alive && steps < 60) { stepRun(run, at(240), STEP); respawned += count(drainEvents(run), 'bonusRespawn'); steps++; }
  assert.equal(t.alive, true); assert.equal(respawned, 1); assert.equal(t.hp, t.max); assert.equal(t.respawnT, 0);
  assert.ok(steps >= 28 && steps <= 30, 'respawn 뒤 STEP ' + steps);
  //  두 번째 파괴 → score 14 → 단계 2 정확히 1회. 세 번째 파괴(21)는 단계 유지(문턱 100 전) — 내려가지도 않는다
  shoot(); shoot(); [ev] = shoot();
  assert.equal(run.bonus.score, 14); assert.equal(count(ev, 'bonusTier'), 1); assert.equal(run.bonus.tier, 2);
  run.bullets.length = 0;
  while (!t.alive) { stepRun(run, at(240), STEP); drainEvents(run); }
  shoot(); shoot(); [ev] = shoot();
  assert.equal(run.bonus.score, 21); assert.equal(run.bonus.hits, 3); assert.equal(count(ev, 'bonusTier'), 0); assert.equal(run.bonus.tier, 2);
  run.bullets.length = 0;
  while (!t.alive) { stepRun(run, at(240), STEP); drainEvents(run); }
  //  저격총(dmg 3, pierce 2): hp 10 표적을 한 번 맞히고 살아서 계속 가되 같은 표적은 다시 안 맞는다
  t.hp = 10; t.max = 10;
  [ev, b] = shoot('sniper');
  assert.equal(t.hp, 7); assert.equal(b.dead, false); assert.deepEqual(b.hit, ['t1']); assert.equal(run.bullets.includes(b), true);
  for (let i = 0; i < 3; i++) { stepRun(run, at(240), STEP); ev = drainEvents(run); assert.equal(count(ev, 'bonusTargetHit'), 0, 'STEP ' + i); }
  assert.equal(t.hp, 7);
  //  본전투 통계는 보너스 중 불변(병력·peak·kills)
  assert.equal(run.units.length, run.mainResult.survivors); assert.equal(run.kills, run.mainResult.kills);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-BONUS B-5: 종료 — bonusStart 부터 sec×60 STEP 뒤 over·bonusEnd 정확히 1회(payload = run.bonus)·won/wonAt/mainResult 불변·units = survivors, over 뒤 stepRun 은 무변화', () => {
  const bonus = { sec: 5, tiers: [10, 25, 50], targets: [tdef('t1', { x0: 120, x1: 360, period: 2 })] };
  const run = createRun(mkStage({ startUnits: 6, startWeapon: 'auto', elite: { z: 400, hp: 2 }, bonus }));
  enterBonus(run, bossOr(240));
  const wonAt = run.wonAt, main = JSON.stringify(run.mainResult);
  let steps = 0, ends = 0, endEv = null;
  while (!run.over && steps < 1000) {
    stepRun(run, at(240), STEP);
    for (const e of drainEvents(run)) if (e.type === 'bonusEnd') { ends++; endEv = e; }
    steps++;
  }
  assert.equal(run.over, true); assert.equal(steps, 5 * 60, 'sec/STEP');
  assert.equal(ends, 1);
  assert.deepEqual([endEv.score, endEv.tier, endEv.hits], [run.bonus.score, run.bonus.tier, run.bonus.hits]);
  assert.equal(endEv.time, run.time);
  assert.equal(run.bonus.t, 5);
  assert.equal(run.won, true); assert.equal(run.wonAt, wonAt); assert.equal(JSON.stringify(run.mainResult), main);
  assert.equal(run.units.length, run.mainResult.survivors);
  assert.equal(run.phase, 'bonus');
  const snap = JSON.stringify(run);
  stepRun(run, at(120), STEP);
  assert.equal(JSON.stringify(run), snap, 'over 뒤 무변화');
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-BONUS B-6: 회귀(보너스 없음) — 1~3 은 won 이 처음 true 인 STEP 에 over·phase main·bonus null·mainResult.survivors = units, 4~24(8 제외)는 bonusStart 없음', () => {
  for (const id of STAGE_IDS) {
    const run = createRun(buildStage(id));
    let wonStep = -1, overStep = -1, steps = 0;
    while (!run.over && steps < 14400) {
      stepRun(run, at(pickX('planBoss', run)), STEP); drainEvents(run);
      if (run.won && wonStep < 0) wonStep = steps;
      if (run.over && overStep < 0) overStep = steps;
      steps++;
    }
    assert.equal(run.won, true, 'S' + id);
    assert.equal(wonStep, overStep, 'S' + id + ' 승리 STEP 에 over');
    assert.equal(run.phase, 'main'); assert.equal(run.bonus, null); assert.deepEqual(run.bonusTargets, []); assert.equal(run.bonusDef, null);
    assert.deepEqual(run.mainResult, { wonAt: run.wonAt, survivors: run.units.length, peak: run.peak, kills: run.kills });
  }
  for (const id of COURSE_IDS) {
    if (id === 8) continue;
    const r = playPolicy(id, 'planBoss', 14400, 'normal');
    assert.equal(r.events.bonusStart, undefined, 'S' + id);
    assert.equal(r.run.phase, 'main'); assert.equal(r.run.bonus, null);
    if (r.run.won) assert.equal(r.run.mainResult.survivors, r.run.units.length, 'S' + id);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
function memStorage(init = {}) { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, raw: m }; }
test('V3-BONUS B-7: 저장 — bestBonus 는 희소 필드(유한수만·max 병합), STAGE_DEFAULTS 4필드 불변, 재로드 유지, cleared 갱신에 보존, 난이도 접미 칸도 같은 규칙', () => {
  const st = memStorage();
  const s = createSave3(st);
  s.updateStage(8, { bestBonus: 12 }, 2);
  assert.deepEqual(s.getStage(8, 2), { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0, bestBonus: 12 });
  assert.deepEqual(s.getStage(1), { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 }, '다른 스테이지엔 키 없음');
  assert.deepEqual(s.getStage(8, 1), { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 }, '다른 버전 칸엔 키 없음');
  //  max 병합: 낮은 점수 조각은 무시, 높은 점수는 갱신
  s.updateStage(8, { bestBonus: 5 }, 2);
  assert.equal(s.getStage(8, 2).bestBonus, 12);
  s.updateStage(8, { bestBonus: 40 }, 2);
  assert.equal(s.getStage(8, 2).bestBonus, 40);
  //  cleared 만 갱신해도 보존
  s.updateStage(8, { cleared: true, attempts: 3 }, 2);
  assert.deepEqual(s.getStage(8, 2), { cleared: true, attempts: 3, bestSurvivors: 0, bestTime: 0, bestBonus: 40 });
  //  재로드 뒤 유지 + 원문에 키가 있다
  const s2 = createSave3(st);
  assert.equal(s2.getStage(8, 2).bestBonus, 40);
  assert.equal(JSON.parse(st.raw.get(KEY3)).stages['8'].versions['2'].bestBonus, 40);
  //  비수·NaN 은 키가 생기지 않는다
  const s3 = createSave3(memStorage());
  s3.updateStage(8, { bestBonus: 'x' }, 2);
  assert.equal('bestBonus' in s3.getStage(8, 2), false);
  s3.updateStage(8, { bestBonus: NaN }, 2);
  assert.equal('bestBonus' in s3.getStage(8, 2), false);
  //  난이도 접미 칸
  s3.updateStage(8, { bestBonus: 9 }, 2, 'hard');
  assert.equal(s3.getStage(8, 2, 'hard').bestBonus, 9);
  assert.equal('bestBonus' in s3.getStage(8, 2), false);
  assert.equal('bestBonus' in s3.getStage(8, 2, 'brutal'), false);
  //  로드 원문 + patch({ stages }) 경로도 max
  const s4 = createSave3(memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: { 8: { versions: { 2: { bestBonus: 30, cleared: true } } } } }) }));
  assert.equal(s4.getStage(8, 2).bestBonus, 30);
  s4.patch({ stages: { 8: { versions: { 2: { bestBonus: 10, attempts: 2 } } } } });
  assert.deepEqual(s4.getStage(8, 2), { cleared: true, attempts: 2, bestSurvivors: 0, bestTime: 0, bestBonus: 30 });
  assert.deepEqual(s4.getStageVersions(8), { 2: { cleared: true, attempts: 2, bestSurvivors: 0, bestTime: 0, bestBonus: 30 } });
  //  bonusLine 순수 함수
  assert.equal(bonusLine({ score: 12, tier: 1, hits: 4, isBestBonus: false }), '보너스 12점 · 단계 1');
  assert.equal(bonusLine({ score: 207, tier: 3, hits: 69, isBestBonus: true }), '보너스 207점 · 단계 3 · 신기록');
  assert.equal(bonusLine(null), null);
});

// ─────────────────────────────────────────────────────────────────────────────
//  셸 하네스(rush3-capsule 의 bootFake 최소판): 가짜 캔버스(찍힌 글 기록)·저장·오디오(효과음·BGM 기록)·rAF 큐
function fakeCanvas(texts) {
  const grad = { addColorStop() {} };
  const ctx = new Proxy({ canvas: null }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => { if (k === 'fillText') texts.push(String(args[0])); if (k.startsWith('create')) return grad; if (k === 'measureText') return { width: 10 }; return undefined; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { width: 480, height: 800, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }), addEventListener() {} };
}
function fakeAudio() {
  const played = [], bgm = [];
  return { played, bgm, unlock() {}, sfx(n) { played.push(n); return true; }, bgmPlay(n) { bgm.push(n); }, bgmPause() {}, bgmResume() {}, setVolume() {}, getVolume() { return 1; }, setMuted() {}, isMuted() { return false; }, duck() {} };
}
function fakeStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
async function bootFake(storage = fakeStorage()) {
  const queue = [];
  let nowMs = 1000;
  const texts = [];
  const save = createSave3(storage);
  const audio = fakeAudio();
  const app = boot(fakeCanvas(texts), { win: null, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save, audio, sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  const frames = (n) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  return { app, frames, save, storage, texts, audio };
}
function driveUntil(h, policy, cond, max = 6000) {
  let n = 0;
  while (!cond() && n < max) {
    const run = h.app.getRun();
    h.app.input.state.pointerX = typeof policy === 'number' ? policy : pickX(policy, run);
    h.frames(1);
    n++;
  }
  return n;
}

test('V3-BONUS B-8: 셸 결선 — S8 승리 확정 프레임에 state run(결과 아님)·joinMany·스테이지 BGM·배너 "보너스전! 20초"·HUD "보너스 N초 · N점 · 단계 K", ⏸ 동작, 결과 화면 "보너스 N점 · 단계 K"·저장 bestBonus/bestSurvivors/bestTime', async () => {
  const h = await bootFake();
  h.app.setDifficulty('normal');
  h.app.startRun(8);
  const run = () => h.app.getRun();
  assert.equal(h.app.dbg().phase, 'main'); assert.equal(h.app.dbg().bonus, null); assert.equal(h.app.dbg().bossX, null);
  h.frames(1);
  driveUntil(h, 'planBoss', () => run().phase === 'bonus', 9000);
  assert.equal(run().phase, 'bonus', '보너스 진입');
  assert.equal(run().won, true); assert.equal(run().over, false);
  assert.equal(h.app.getState(), 'run', '승리 확정 시점에 결과 화면으로 가지 않는다');
  h.texts.length = 0; h.audio.played.length = 0;
  h.frames(1);
  assert.ok(h.audio.bgm.at(-1) === 'nf_bgm_sector3a', '보스 BGM 해제 → 스테이지 BGM: ' + h.audio.bgm.at(-1));
  assert.ok(h.texts.includes('보너스전! 20초'), '시작 배너: ' + h.texts.join(' | '));
  const hud = h.texts.find((t) => /^보너스 (20|19)초 · \d+점 · 단계 \d$/.test(t));
  assert.ok(hud, 'HUD 보너스 줄: ' + h.texts.filter((t) => t.startsWith('보너스')).join(' | '));
  assert.ok(h.texts.some((t) => t.startsWith('다음 단계까지 ')), '진행 막대 글');
  assert.equal(h.texts.includes('작전 완료'), false, "비보너스 '작전 완료' 줄은 없다");
  const d = h.app.dbg();
  assert.equal(d.phase, 'bonus'); assert.deepEqual(Object.keys(d.bonus), ['t', 'sec', 'score', 'tier', 'hits']); assert.ok(d.targets.length >= 1);
  //  joinMany 는 진입 프레임에 났다(진입 프레임의 played 를 비우기 전에 확인하려면 다시 진입해야 하므로 여기서는 이벤트 처리 전체를 다시 본다)
  //  ⏸: 30 프레임 동안 z·bonus.t 불변 → 계속
  const z0 = h.app.dbg().z, t0 = run().bonus.t;
  h.app.pause();
  assert.equal(h.app.getState(), 'paused');
  h.frames(30);
  assert.equal(h.app.dbg().z, z0); assert.equal(run().bonus.t, t0);
  h.app.resume();
  assert.equal(h.app.getState(), 'run');
  //  결과 화면까지
  driveUntil(h, 'planBoss', () => h.app.getState() === 'result', 3000);
  assert.equal(h.app.getState(), 'result');
  const r = run();
  assert.equal(r.over, true); assert.equal(r.bonus.t, 20);
  assert.ok(r.bonus.score > 0, '봇이 표적을 맞힌다: ' + r.bonus.score);
  h.texts.length = 0;
  h.frames(1);
  const line = '보너스 ' + r.bonus.score + '점 · 단계 ' + r.bonus.tier + ' · 신기록';
  assert.ok(h.texts.includes(line), '결과 한 줄: ' + h.texts.filter((t) => t.startsWith('보너스')).join(' | '));
  assert.ok(h.texts.includes('작전 성공!'));
  assert.ok(h.texts.includes(r.mainResult.survivors + '명'), '생존 = 본전투 확정값');
  const rec = h.save.getStage(8, 2);
  assert.deepEqual(rec, { cleared: true, attempts: 1, bestSurvivors: r.mainResult.survivors, bestTime: r.wonAt, bestBonus: r.bonus.score });
  assert.equal('bestBonus' in h.save.getStage(8, 2, 'brutal'), false);
  //  두 번째 판: bestBonus 는 max 로만 오르고, '신기록' 은 앞 판보다 높을 때만 붙는다(프레임 경계가 달라 점수는 조금 다를 수 있다 — STEP 결정성은 B-3)
  h.app.startRun(8);
  h.frames(1);
  driveUntil(h, 'planBoss', () => h.app.getState() === 'result', 12000);
  const r2 = run();
  h.texts.length = 0; h.frames(1);
  const better = r2.bonus.score > r.bonus.score;
  assert.ok(h.texts.includes('보너스 ' + r2.bonus.score + '점 · 단계 ' + r2.bonus.tier + (better ? ' · 신기록' : '')), '신기록 표기는 앞 판보다 높을 때만: ' + r.bonus.score + ' → ' + r2.bonus.score);
  assert.equal(h.save.getStage(8, 2).bestBonus, Math.max(r.bonus.score, r2.bonus.score));
  assert.equal(h.save.getStage(8, 2).attempts, 2);
  //  검수 반영(Important): 세 번째 판 — 보너스 20초 창에서 ⏸→[스테이지 선택](= toTitle, finishRun 을 거치지 않는 경로)으로 나가도
  //   승리 확정 프레임에 commitMain 이 쓴 cleared·bestSurvivors·bestTime 은 남는다. bestBonus 는 보너스가 끝나야(over) 쓰므로 앞 판 값 그대로
  const before = h.save.getStage(8, 2);
  h.app.startRun(8);
  h.frames(1);
  driveUntil(h, 'planBoss', () => run().phase === 'bonus', 9000);
  const r3 = run();
  assert.equal(r3.won, true); assert.equal(r3.over, false); assert.equal(h.app.getState(), 'run');
  const expSurv = Math.max(before.bestSurvivors, r3.mainResult.survivors), expTime = Math.min(before.bestTime, r3.wonAt);
  const atWin = h.save.getStage(8, 2);
  assert.deepEqual(atWin, { cleared: true, attempts: 3, bestSurvivors: expSurv, bestTime: expTime, bestBonus: before.bestBonus }, '승리 확정 프레임에 본전투 기록이 이미 저장돼 있다(bestBonus 는 아직)');
  assert.deepEqual(r3.mainRecord, { isBest: r3.mainResult.survivors > before.bestSurvivors, survivors: r3.mainResult.survivors, time: r3.wonAt }, '판당 1회 표식');
  driveUntil(h, 'planBoss', () => run().bonus.t >= 3, 600);
  assert.ok(run().bonus.t >= 3 && run().bonus.score > 0, '보너스 진행 중 점수 ' + run().bonus.score);
  h.app.pause();
  assert.equal(h.app.getState(), 'paused');
  h.app.toTitle();
  assert.equal(h.app.getState(), 'title'); assert.equal(h.app.getRun(), null);
  assert.deepEqual(h.save.getStage(8, 2), { cleared: true, attempts: 3, bestSurvivors: expSurv, bestTime: expTime, bestBonus: before.bestBonus }, '나가도 확정된 승리·기록은 그대로, 미완 보너스 점수는 기록에 들어가지 않는다');
  assert.equal(h.app.dbg().state, 'title');
  //  보너스가 없는 판(1)은 dbg 가 종전 꼴
  h.app.startRun(1);
  assert.equal(h.app.dbg().bonus, null); assert.equal(h.app.dbg().phase, 'main'); assert.deepEqual(h.app.dbg().targets, []);
});

test('V3-BONUS B-8b: 셸 진입 프레임 — joinMany 효과음은 bonusStart 프레임에 1회, bonusHit 마다 crateBreak·"+값" 플로터, bonusTier 에 "보상 단계 K!"', async () => {
  const h = await bootFake();
  h.app.setDifficulty('normal');
  h.app.startRun(8);
  const run = () => h.app.getRun();
  h.frames(1);
  driveUntil(h, 'planBoss', () => !!run().boss, 9000);
  h.audio.played.length = 0;
  driveUntil(h, 'planBoss', () => run().phase === 'bonus', 3000);
  assert.equal(h.audio.played.filter((n) => n === 'joinMany').length, 1, '진입 프레임 joinMany 1회: ' + h.audio.played.join(','));
  assert.ok(h.audio.played.includes('win'), 'bossKill 승리음도 그대로');
  h.texts.length = 0; h.audio.played.length = 0;
  driveUntil(h, 'planBoss', () => run().bonus.hits >= 1, 1200);
  h.frames(2);
  assert.ok(h.audio.played.includes('crateBreak'), '파괴 효과음');
  assert.ok(h.texts.some((t) => /^\+\d$/.test(t)), "'+값' 플로터: " + h.texts.filter((t) => t.startsWith('+')).join(','));
  driveUntil(h, 'planBoss', () => run().bonus.tier >= 1, 1200);
  h.frames(2);
  assert.ok(h.texts.includes('보상 단계 1!'), '단계 플로터');
  assert.ok(h.audio.played.includes('weaponSwap'));
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-BONUS B-9: C[8] 완주 — planBoss(보통) won·over·steps < 14400·bonusStart 1·bonusEnd 1·bonusHit ≥ 1, 점수·단계는 진단으로(tiers 근거)', (t) => {
  for (const d of ['normal', 'hard', 'brutal']) {
    const r = playPolicy(8, 'planBoss', 14400, d);
    if (d === 'normal') {
      assert.equal(r.run.won, true); assert.equal(r.run.over, true); assert.ok(r.steps < 14400);
      assert.equal(r.events.bonusStart, 1); assert.equal(r.events.bonusEnd, 1); assert.ok(r.events.bonusHit >= 1);
      assert.equal(r.events.win, 1);
      assert.equal(r.steps, Math.round(r.run.mainResult.wonAt / STEP) + 20 * 60, '본전투 STEP + 1200(승리 STEP 포함)');
    }
    t.diagnostic(`BONUS S8 ${d} won=${r.run.won} units=${r.run.units.length} weapon=${r.run.weapon} steps=${r.steps} score=${r.run.bonus ? r.run.bonus.score : '-'} tier=${r.run.bonus ? r.run.bonus.tier : '-'} hits=${r.run.bonus ? r.run.bonus.hits : '-'}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-BONUS B-10: 정적 — bonus.js 에 Math.random·rng·Date.now 없음, combat.js stepRun 이후에 lottery·랜덤 길·difficult·Date.now 없음', () => {
  const read = (f) => readFileSync(new URL('../rush3/' + f, import.meta.url), 'utf8');
  const bonus = read('bonus.js');
  assert.ok(!/Math\.random/.test(bonus)); assert.ok(!/Date\.now/.test(bonus)); assert.ok(!/from\s*['"][^'"]*rng\.js['"]/.test(bonus));
  assert.ok(!/\brng\b/.test(bonus.replace(/\/\/.*$/gm, ''))); assert.ok(!/balance\.js/.test(bonus), 'bonus.js 는 balance 를 모른다');
  const combat = read('combat.js');
  const after = combat.slice(combat.indexOf('export function stepRun'));
  assert.ok(!/lottery/i.test(after)); assert.ok(!/랜덤 길/.test(after)); assert.ok(!/difficult/i.test(after)); assert.ok(!/Date\.now/.test(after));
  assert.ok(/phase === 'bonus'/.test(after.slice(0, 400)), 'phase 분기는 stepRun 첫머리 한 곳');
  assert.equal((combat.match(/phase === 'bonus'/g) || []).length, 1);
});

// ─────────────────────────────────────────────────────────────────────────────
//  기록 ctx(rush3-capsule 의 recCtx 와 같은 꼴)
function recCtx() {
  const ops = [];
  const grad = { addColorStop() {} };
  const stack = [];
  const state = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', canvas: null };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'save') stack.push({ ...t });
        if (k === 'restore') { const s = stack.pop(); if (s) Object.assign(t, s); }
        ops.push({ op: k, args, alpha: t.globalAlpha, fill: t.fillStyle, stroke: t.strokeStyle, font: t.font });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
const fxLike = (o = {}) => ({ parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0,
                              shutterT: 0, shutterText: null, lotOpen: 0, lotSeen: false, lotSame: false, ...o });
const textOps = (ops) => ops.filter((o) => o.op === 'fillText');
const textOf = (ops, text) => textOps(ops).find((o) => o.args[0] === text);
function drawRun(run, fx = fxLike()) {
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx, hud: { distM: 10 }, buttons: [], saveOk: true });
  return ops;
}
function drawResult(run, result) {
  const { ctx, ops } = recCtx();
  const base = { stageId: 8, stageVersion: 2, difficulty: 'normal', title: '남은 군단', won: true, survivors: 64, peak: 64, time: 41, timeText: '41.0초', kills: 15,
                 missedLine: '놓친 것 없음', advice: null, lottery: null, isBest: false, saveOk: true, nextId: 9, objective: null, objectiveLine: null, bonus: null, bonusLine: null };
  createRenderer3(ctx, null).draw({ state: 'result', now: 1, run, fx: fxLike(), hud: { distM: 0 }, result: { ...base, ...result }, buttons: [], saveOk: true });
  return ops;
}

test('V3-BONUS B-11: 렌더 — 표적 노란 상자·리본·"+값"·내구 숫자(살아 있는 것만), HUD 보너스 줄(금색, distCy)·진행 막대 글, 시작 배너 y224 금색 띠, 결과 줄 y212/230/248 스택, 옛 fx 꼴 관용', () => {
  const s8 = buildStage(8);
  const run = createRun(mkStage({ startUnits: 5, elite: { z: 400, hp: 1 }, bonus: s8.bonus }));
  enterBonus(run, bossOr(240));
  const ops = drawRun(run);
  const t1 = run.bonusTargets[0];
  //  roundRect 는 render 안의 경로 헬퍼(ctx 메서드가 아니다) — 기록되는 것은 fill 과 경로 시작 moveTo(x + 6, y)
  assert.equal(ops.filter((o) => o.op === 'fill' && o.fill === C.bonusBox).length, 4, '노란 상자 4개');
  assert.ok(ops.some((o) => o.op === 'moveTo' && o.args[0] === t1.x - R + 6), '상자 경로가 표적 x 에서 시작');
  assert.ok(ops.some((o) => o.op === 'fillRect' && o.fill === C.bonusRibbon), '리본');
  assert.ok(textOf(ops, '+2') && textOf(ops, '+3') && textOf(ops, '+5'), "'+값' 소자");
  const hp = textOps(ops).find((o) => o.args[0] === String(t1.hp) && o.args[1] === t1.x && o.fill === C.bulletHeavy);
  assert.ok(hp, '내구 숫자(주황) 표적 x 에');
  const hud = textOps(ops).find((o) => String(o.args[0]).startsWith('보너스 20초 · 0점 · 단계 0'));
  assert.ok(hud && hud.args[2] === HUD_ROW.distCy && hud.fill === C.gold, 'HUD 보너스 줄: ' + JSON.stringify(hud));
  assert.equal(textOps(ops).some((o) => String(o.args[0]).startsWith('남은 거리')), false);
  assert.equal(textOf(ops, '작전 완료'), undefined);
  assert.ok(textOf(ops, '다음 단계까지 ' + BAL3.bonus.tiers[0] + '점'), '진행 막대 글');
  //  죽은 표적은 그리지 않는다
  t1.alive = false;
  const ops2 = drawRun(run);
  assert.equal(ops2.filter((o) => o.op === 'fill' && o.fill === C.bonusBox).length, 3, '나머지 표적 3개만 그린다');
  assert.equal(ops2.some((o) => o.op === 'moveTo' && o.args[0] === t1.x - R + 6), false);
  t1.alive = true;
  //  만렙: '최고 단계'
  run.bonus.tier = 3; run.bonus.score = 250;
  assert.ok(textOf(drawRun(run), '최고 단계'));
  run.bonus.tier = 0; run.bonus.score = 0;
  //  시작 배너: fx.bonusT > 0 이면 y224 에, 0 이면 없음. 옛 fx 꼴(칸 없음)도 그린다
  const opsB = drawRun(run, fxLike({ bonusT: 1, bonusText: '보너스전! 20초' }));
  const ban = textOf(opsB, '보너스전! 20초');
  assert.ok(ban && ban.args[2] === 224 && ban.fill === C.outline, '배너 글');
  assert.ok(opsB.some((o) => o.op === 'fillRect' && o.fill === 'rgba(246,200,74,0.9)' && o.args[1] === 196 && o.args[3] === 56), '금색 띠 y196 h56');
  assert.equal(textOf(drawRun(run, fxLike({ bonusT: 0, bonusText: '보너스전! 20초' })), '보너스전! 20초'), undefined);
  assert.ok(drawRun(run, fxLike()).length > 0);
  //  본전투 중(phase main) 인 run 은 종전 HUD('남은 거리')·표적 없음
  const runM = createRun(mkStage({ startUnits: 5, bonus: s8.bonus }));
  stepRun(runM, at(240), STEP);
  const opsM = drawRun(runM);
  assert.ok(textOps(opsM).some((o) => String(o.args[0]).startsWith('남은 거리')));
  assert.equal(opsM.some((o) => o.op === 'fill' && o.fill === C.bonusBox), false);
  //  결과 줄: 혼자면 y212, 랜덤 길 줄 뒤면 230, 랜덤 길 + 목표 뒤면 248. null 이면 없음
  const line = '보너스 207점 · 단계 3 · 신기록';
  const r1 = drawResult(run, { bonus: { score: 207, tier: 3, hits: 69, isBestBonus: true }, bonusLine: line });
  assert.ok(textOf(r1, line) && textOf(r1, line).args[2] === 212 && textOf(r1, line).fill === C.gold);
  //  검수 반영: 진행 막대·'다음 단계까지 N점'(y111) 은 run·paused 에서만 — 결과 화면은 run 장면 위에 덮이는 규약이라 그 글이 '작전 성공!' 바로 위에 비쳐 겹쳐 읽혔다
  assert.ok(textOf(r1, '작전 성공!'), '결과 화면이 그려졌다');
  assert.equal(textOf(r1, '다음 단계까지 ' + BAL3.bonus.tiers[0] + '점'), undefined, '결과 화면엔 진행 막대 글이 없다');
  {
    const { ctx: pc, ops: pops } = recCtx();
    createRenderer3(pc, null).draw({ state: 'paused', now: 1, run, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true });
    assert.ok(textOf(pops, '다음 단계까지 ' + BAL3.bonus.tiers[0] + '점'), '일시 정지 중에는 진행 막대 글이 그대로');
    assert.ok(textOf(pops, '일시 정지'));
  }
  const r2 = drawResult(run, { lottery: '오른쪽 랜덤 길은 이번 판엔 병사 8 이었습니다', bonusLine: line });
  assert.equal(textOf(r2, line).args[2], 230);
  const r3 = drawResult(run, { lottery: '오른쪽 랜덤 길은 이번 판엔 병사 8 이었습니다', objective: { kind: 'capsule', done: true, missed: false, n: 3 }, objectiveLine: '구출 성공 · +3명', bonusLine: line });
  assert.equal(textOf(r3, '구출 성공 · +3명').args[2], 230); assert.equal(textOf(r3, line).args[2], 248);
  //  결과 화면 아래에는 run 장면(HUD '보너스 N초 …')이 그대로 깔린다 — 결과 줄 꼴('보너스 N점 · 단계')만 없음을 본다
  assert.equal(textOps(drawResult(run, {})).some((o) => /^보너스 \d+점 · 단계/.test(String(o.args[0]))), false);
  assert.ok(textOf(r1, '작전 성공!'));
});
