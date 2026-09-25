// rush3-capsule — 구출 캡슐(r3.14, 실게임 구현계획 B-1 장치 3). 배우는 것 = "끝까지 가는 것 말고 다른 목표가 있다".
//  놓쳐도 실패는 아니고 보상만 없다(계획서 B-2 7번). 통 종류 'capsule' + 판 목표 run.objective + 저장 rescued(희소) + 셸 배너·결과 한 줄·타이틀 '구출✓'.
//  ⚠️규칙(supply/combat/stages)은 순수 상태·순수 함수 — 검사도 STEP 만 돌린다. 승패(run.won)는 정예 처치로만 결정된다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSupply, hitSupply, passSupply, applySupplyReward, CAPSULE_N_DEFAULT } from '../rush3/supply.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage, stageVersion, DEFS, ALL_STAGE_IDS } from '../rush3/stages.js';
import { COURSE_IDS } from '../rush3/courses.js';
import { BAL3 } from '../rush3/balance.js';
import { playPolicy, pickX } from './lib/rush3-policies.mjs';
import { createRenderer3 } from '../rush3/render.js';
import { boot, OBJECTIVE_BANNER_TEXT, SHUTTER_GUIDE_TEXT, objectiveLine } from '../rush3/main.js';
import { createSave3 } from '../rush3/save.js';
import { seedOldClears } from './lib/rush3-unlock.mjs';

const C = BAL3.colors;
const bullet = (x, z, pz, dmg = 1) => ({ x, z, pz, dmg, gateHit: 1, dead: false });
const capsuleDef = (o = {}) => ({ id: 'c2', z: 4800, x: 120, kind: 'capsule', durability: 4, payload: { n: 3 }, ...o });
//  합성 run(rush3-supply 검사와 같은 꼴 — objective 없음). 있으면 obj 로 준다
const synthRun = (o = {}) => ({ z: 4200, prevZ: 4196, x: 120, units: [], nextUnitId: 1, pendingRewards: [], missedSupplies: 0, skippedSupplies: 0, ...o });
const freshObjective = () => ({ kind: 'capsule', supplyId: 'c2', done: false, missed: false, n: 0 });
const types = (ev) => ev.map((e) => e.type);

// ─────────────────────────────────────────────────────────────────────────────
test('V3-CAPSULE CAP-1: 개봉 — 캡슐은 일반 통과 같은 내구·개봉 경로(흡수·supplyHit·마지막 탄에 supplyOpen kind capsule·보상 1회), payload 기본 n = 3', () => {
  const s = makeSupply(capsuleDef()), run = synthRun(), ev = [];
  for (let i = 1; i <= 4; i++) {
    const b = bullet(120, 4790, 4780);
    assert.equal(hitSupply(s, b, ev, run), true, i + '발째 처리');
    assert.equal(b.dead, true, '통은 탄을 흡수한다');
    if (i < 4) {
      assert.equal(s.opened, false);
      assert.equal(ev.at(-1).type, 'supplyHit');
      assert.equal(ev.at(-1).durability, 4 - i);
    }
  }
  assert.equal(s.opened, true);
  assert.equal(s.durability, 0);
  assert.equal(ev.filter((e) => e.type === 'supplyHit').length, 3);
  assert.deepEqual(ev.filter((e) => e.type === 'supplyOpen'), [{ type: 'supplyOpen', id: 'c2', kind: 'capsule', x: 120, z: 4800 }]);
  assert.deepEqual(run.pendingRewards, [{ kind: 'capsule', payload: { n: 3 }, x: 120, z: 4800, id: 'c2' }], '보상 정확히 1회');
  //  열린 뒤의 탄은 무시(흡수도 없음)
  const b5 = bullet(120, 4790, 4780);
  assert.equal(hitSupply(s, b5, ev, run), false);
  assert.equal(b5.dead, false);
  //  payload 생략 → CAPSULE_N_DEFAULT
  assert.equal(CAPSULE_N_DEFAULT, 3);
  assert.equal(makeSupply({ id: 'k', z: 100, x: 120, kind: 'capsule', durability: 2 }).payload.n, 3);
  assert.equal(makeSupply({ id: 'k', z: 100, x: 120, kind: 'capsule', durability: 2, payload: { n: 5 } }).payload.n, 5, '명시 n 은 그대로');
  //  일반 통은 기본값을 받지 않는다(soldier payload 그대로)
  assert.deepEqual(makeSupply({ id: 's', z: 100, x: 120, kind: 'soldier', durability: 2, payload: { n: 2 } }).payload, { n: 2 });
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-CAPSULE CAP-2: 보상 — applySupplyReward 가 joinMany + capsuleRescue 를 그 순서로 내고 병사가 합류, objective 가 이 통이면 done/n, 없거나 다른 통이면 불변', () => {
  const reward = { kind: 'capsule', payload: { n: 3 }, x: 120, z: 4800, id: 'c2' };
  //  objective 가 이 통을 가리키는 run
  const run = synthRun({ objective: freshObjective() }), ev = [];
  assert.equal(applySupplyReward(reward, run, ev), true);
  assert.equal(run.units.length, 3);
  assert.deepEqual(types(ev), ['joinMany', 'capsuleRescue']);
  assert.deepEqual(ev[0], { type: 'joinMany', id: 'c2', n: 3, x: 120, z: 4800 });
  assert.deepEqual(ev[1], { type: 'capsuleRescue', id: 'c2', n: 3, x: 120, z: 4800 });
  assert.deepEqual(run.objective, { kind: 'capsule', supplyId: 'c2', done: true, missed: false, n: 3 });
  //  objective 없는 합성 run: throw 없이 같은 이벤트
  const run2 = synthRun(), ev2 = [];
  assert.equal(applySupplyReward(reward, run2, ev2), true);
  assert.deepEqual(types(ev2), ['joinMany', 'capsuleRescue']);
  assert.equal(run2.units.length, 3);
  assert.equal(run2.objective, undefined);
  //  supplyId 가 다른 objective 는 불변
  const run3 = synthRun({ objective: { ...freshObjective(), supplyId: 'c9' } }), ev3 = [];
  applySupplyReward(reward, run3, ev3);
  assert.deepEqual(run3.objective, { kind: 'capsule', supplyId: 'c9', done: false, missed: false, n: 0 });
  //  unitCap 클램프: 149 명 + n 3 → 실제 1 명 = n
  const run4 = synthRun({ objective: freshObjective() }), ev4 = [];
  applySupplyReward({ kind: 'soldier', payload: { n: BAL3.squad.unitCap - 1 }, x: 240, z: 100, id: 'c0' }, run4, ev4);
  assert.equal(run4.units.length, BAL3.squad.unitCap - 1);
  ev4.length = 0;
  applySupplyReward(reward, run4, ev4);
  assert.equal(run4.units.length, BAL3.squad.unitCap);
  assert.equal(ev4[0].n, 1); assert.equal(ev4[1].n, 1);
  assert.equal(run4.objective.n, 1, 'n = 실제 합류 수(클램프 뒤)');
  assert.equal(run4.objective.done, true);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-CAPSULE CAP-3: 놓침 — 미개봉 캡슐의 z 를 지나면 supplyMissed + capsuleMissed(reason missed) 1회, objective.missed, 이후 탄 무시. 차폐 중이면 skipped 갈래', () => {
  const s = makeSupply(capsuleDef()), run = synthRun({ z: 4801, prevZ: 4796, objective: freshObjective() }), ev = [];
  assert.equal(passSupply(s, run, ev), true);
  assert.deepEqual(types(ev), ['supplyMissed', 'capsuleMissed']);
  assert.deepEqual(ev[0], { type: 'supplyMissed', id: 'c2', kind: 'capsule', x: 120, z: 4800 });
  assert.deepEqual(ev[1], { type: 'capsuleMissed', id: 'c2', x: 120, z: 4800, reason: 'missed' });
  assert.deepEqual(run.objective, { kind: 'capsule', supplyId: 'c2', done: false, missed: true, n: 0 });
  assert.equal(run.missedSupplies, 1, '캡슐도 놓친 통으로 센다(advice 가 캡슐 hint 를 고르게)');
  //  한 번 더: 아무 일 없음
  const ev2 = [];
  assert.equal(passSupply(s, run, ev2), false);
  assert.equal(ev2.length, 0);
  assert.equal(hitSupply(s, bullet(120, 4790, 4780), ev2, run), false, '놓친 캡슐은 탄을 무시한다');
  //  objective 없는 합성 run 도 throw 없음
  const s0 = makeSupply(capsuleDef()), run0 = synthRun({ z: 4801, prevZ: 4796 }), ev0 = [];
  assert.equal(passSupply(s0, run0, ev0), true);
  assert.deepEqual(types(ev0), ['supplyMissed', 'capsuleMissed']);
  //  차폐(coverZ) 가 아직 안 열린 채 지나면 skipped 갈래 — capsuleMissed reason 'skipped', objective.missed 는 그대로 true
  const sc = makeSupply(capsuleDef({ coverZ: 5000 })), runc = synthRun({ z: 4801, prevZ: 4796, objective: freshObjective() }), evc = [];
  assert.equal(passSupply(sc, runc, evc), true);
  assert.deepEqual(types(evc), ['supplySkipped', 'capsuleMissed']);
  assert.equal(evc[1].reason, 'skipped');
  assert.equal(runc.skippedSupplies, 1); assert.equal(runc.missedSupplies, 0);
  assert.deepEqual(runc.objective, { kind: 'capsule', supplyId: 'c2', done: false, missed: true, n: 0 });
  //  이미 구출한 뒤의 objective 는 놓침으로 뒤집히지 않는다(열린 통은 passSupply 가 조기 반환)
  const sd = makeSupply(capsuleDef({ durability: 1 })), rund = synthRun({ objective: freshObjective() }), evd = [];
  hitSupply(sd, bullet(120, 4790, 4780), evd, rund);
  for (const r of rund.pendingRewards) applySupplyReward(r, rund, evd);
  rund.prevZ = 4796; rund.z = 4801;
  assert.equal(passSupply(sd, rund, evd), false);
  assert.deepEqual(rund.objective, { kind: 'capsule', supplyId: 'c2', done: true, missed: false, n: 3 });
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-CAPSULE CAP-4: 빌드·판 상태 — S7 version 3(r3.21 검수 반영: 코스 버전 +1)·objective { capsule, c2 }·c2 payload { n: 2 }·내구 24(r3.21: gain 0.575·재산정)·armZ 440(r3.18)·x120·hint, createRun 이 objective 를 초기화, 다른 스테이지는 null, 잘못된 supplyId 는 throw', () => {
  const a = buildStage(7), b = buildStage(7);
  assert.deepEqual(a, b, '결정성');
  assert.equal(a.version, 3); assert.equal(stageVersion(7), 3);
  assert.deepEqual(a.objective, { kind: 'capsule', supplyId: 'c2' });
  const c2 = a.supplies[1];
  assert.equal(c2.id, 'c2'); assert.equal(c2.kind, 'capsule');
  assert.equal(c2.x, 120); assert.equal(c2.z, 4800);
  //  r3.18 대항 검수 반영: 내구 20 → 80 + 피격 활성 구간 armZ 440(화면 y 200 아래에서만 열린다 — CAP-9)
  assert.equal(c2.durability, 24); assert.equal(c2.maxDurability, 24);   // r3.21: 80 → 24
  assert.equal(c2.armZ, BAL3.supply.armZ); assert.equal(c2.armZ, 440);
  assert.deepEqual(c2.payload, { n: 2 });   // r3.21: 정의 3 × gain(7) 0.575 = 1.7 → 2
  assert.equal(c2.coverZ, null); assert.equal(c2.pairId, null); assert.equal(c2.move, null);
  assert.equal(typeof c2.hint, 'string'); assert.ok(c2.hint.length > 0);
  assert.equal(a.supplies.filter((s) => s.kind === 'capsule').length, 1, '캡슐은 하나');
  //  놓치기 쉬운 자리(갓길 끝) 그대로 — 통 원이 도로 안
  assert.ok(c2.x - c2.r >= 80);
  //  createRun 초기화
  const run = createRun(a);
  assert.deepEqual(run.objective, { kind: 'capsule', supplyId: 'c2', done: false, missed: false, n: 0 });
  assert.deepEqual(run.supplies[1].payload, { n: 2 });
  assert.equal(run.stageVersion, 3);
  //  다른 스테이지: objective null(1~3·나머지 코스). 버전은 자기 것만 단정한다(순차 적용에서 다른 장치가 올릴 수 있다)
  assert.equal(buildStage(1).objective, null);
  assert.equal(createRun(buildStage(1)).objective, null);
  for (const id of ALL_STAGE_IDS) {
    if (id === 7) continue;
    assert.equal(buildStage(id).objective, null, 'S' + id + ' objective');
    assert.equal(buildStage(id).supplies.some((s) => s.kind === 'capsule'), false, 'S' + id + ' 캡슐 없음');
  }
  assert.ok(COURSE_IDS.includes(7));
  //  guard: objective 가 캡슐 아닌 통을 가리키면 buildStage 가 throw(DEFS 는 def() 조회의 첫 자리 — 임시 정의를 넣었다 뺀다)
  const bad = { version: 1, title: '검사', startUnits: 1, startWeapon: 'rifle', length: 3000, eliteZ: 2600,
    gates: [], supplies: [{ z: 1000, x: 120, kind: 'soldier', durability: 2, n: 1 }, { z: 1400, x: 120, kind: 'capsule', durability: 2, n: 1 }],
    walls: [], spawns: [], elite: { z: 2600, hp: 10, summon: false }, objective: { kind: 'capsule', supplyId: 'c1' } };
  DEFS[999] = bad;
  try {
    assert.throws(() => buildStage(999), /objective supplyId/);
    bad.objective.supplyId = 'c2';
    const st = buildStage(999);
    assert.deepEqual(st.objective, { kind: 'capsule', supplyId: 'c2' });
    assert.deepEqual(st.supplies[1].payload, { n: 1 });
    //  n 생략이면 기본 3
    delete bad.supplies[1].n;
    assert.deepEqual(buildStage(999).supplies[1].payload, { n: CAPSULE_N_DEFAULT });
  } finally { delete DEFS[999]; }
  assert.throws(() => buildStage(999), /unknown stage/);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-CAPSULE CAP-5: 완주·구출(봇 결과) — left 정책이 S7 캡슐을 열고 완주한다. capsuleRescue 1·capsuleMissed 0·objective.done·n 2(r3.21), 승리는 정예 처치로 결정', (t) => {
  const r = playPolicy(7, 'left', 14400, 'normal');
  assert.equal(r.run.over, true); assert.equal(r.run.won, true);
  assert.equal(r.events.capsuleRescue, 1);
  assert.equal(r.events.capsuleMissed, undefined);
  assert.ok(r.opened.includes('c2'), '캡슐 c2 를 열었다');
  assert.deepEqual(r.run.objective, { kind: 'capsule', supplyId: 'c2', done: true, missed: false, n: 2 });
  assert.equal(r.run.won, r.run.bossDefeated, '승리 = 정예 격파');
  t.diagnostic(`CAPSULE S7 left won=${r.run.won} units=${r.run.units.length} steps=${r.steps} opened=${r.opened.join(',')}`);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-CAPSULE CAP-6: 놓침은 실패가 아니다 — planBoss(x240) 가 캡슐을 지나쳐도 완주(run.won true), 구출이 승리를 만들지도 않는다', (t) => {
  const r = playPolicy(7, 'planBoss', 14400, 'normal');
  assert.equal(r.run.over, true);
  assert.equal(r.run.won, true, 'planBoss 완주');
  assert.equal(r.events.capsuleMissed, 1);
  assert.equal(r.events.capsuleRescue, undefined);
  assert.equal(r.run.objective.done, false); assert.equal(r.run.objective.missed, true);
  assert.ok(!r.opened.includes('c2'));
  //  옛 근사 통(병사 8) 시절 실측 63명 / 2845 STEP 와 나란히 보기 위한 진단 줄
  t.diagnostic(`CAPSULE S7 planBoss won=${r.run.won} units=${r.run.units.length} steps=${r.steps} (old approx 63 / 2845)`);
  //  대조군: 캡슐을 연 뒤 병력이 전멸하면 패배 — objective.done 은 남지만 run.won 은 false
  const run = createRun(buildStage(7));
  let n = 0;
  while (!run.objective.done && !run.over && n < 14400) { stepRun(run, { pointerX: 160, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); n++; }
  assert.equal(run.objective.done, true);
  run.units.length = 0;
  stepRun(run, { pointerX: 160, dragDx: 0, keyDir: 0 }, STEP);
  assert.equal(run.over, true); assert.equal(run.won, false);
  assert.deepEqual(run.objective, { kind: 'capsule', supplyId: 'c2', done: true, missed: false, n: 2 });   // r3.21 n 2
  assert.equal(drainEvents(run).some((e) => e.type === 'lose'), true);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-CAPSULE CAP-9: 보인 뒤에 열린다(r3.18 대항 검수 반영) — 캡슐은 화면 y ≥ 200(dz ≤ armZ 440)에서만 열리고, 활성 전 탄은 supplyBlock(arm)·내구 불변', (t) => {
  for (const [name, px] of [['x120', 120], ['x160', 160], ['aim', null]]) {
    const run = createRun(buildStage(7));
    let openEv = null, blocks = 0, hitsBefore = 0, n = 0;
    while (!run.over && !openEv && n < 14400) {
      const x = px ?? pickX('aim', run);
      stepRun(run, { pointerX: x, dragDx: 0, keyDir: 0 }, STEP);
      for (const e of drainEvents(run)) {
        if (e.id !== 'c2') continue;
        const dz = 4800 - run.z;
        if (e.type === 'supplyBlock') { assert.equal(e.reason, 'arm'); assert.ok(dz > BAL3.supply.armZ, name + ' 흡수는 활성 전에만(dz ' + dz + ')'); blocks++; }
        if (e.type === 'supplyHit') { assert.ok(dz <= BAL3.supply.armZ, name + ' 피격은 활성 뒤에만'); if (dz > BAL3.supply.armZ) hitsBefore++; }
        if (e.type === 'supplyOpen') openEv = { dz, y: BAL3.view.LINE_Y - dz };
      }
      n++;
    }
    assert.ok(openEv, name + ' 캡슐이 열린다');
    assert.ok(openEv.dz <= BAL3.supply.armZ && openEv.y >= 200, name + ' 개봉 dz ' + openEv.dz + ' y ' + openEv.y);
    assert.ok(blocks > 0, name + ' 활성 전 흡수가 있었다(탄 줄기가 캡슐까지 닿는다)');
    assert.equal(hitsBefore, 0);
    t.diagnostic(`CAPSULE S7 ${name} open dz=${openEv.dz} y=${Math.round(openEv.y)} blocks=${blocks}`);
  }
  //  무입력(x240)은 종전처럼 못 연다(놓침) — 활성 구간 규칙이 '더 쉽게' 만들지 않는다
  const r = playPolicy(7, 'center', 14400, 'normal');
  assert.ok(!r.opened.includes('c2') && r.events.capsuleMissed === 1);
});

// ─────────────────────────────────────────────────────────────────────────────
const memStorage = (init = {}) => { const m = new Map(Object.entries(init)); return {
  m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const KEY = 'starforgeRush.v3';

test('V3-CAPSULE CAP-7: 저장 rescued — 희소 필드(true 일 때만 존재), 칸별(버전·난이도), 재로드 유지, 단조(false·비불리언 패치 무시), 로드 정규화', () => {
  const st = memStorage();
  const s = createSave3(st);
  const before = s.getStage(7, 3);
  assert.equal('rescued' in before, false, '구출 전엔 키 자체가 없다');
  assert.deepEqual(before, { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 });
  s.updateStage(7, { rescued: true }, 3);
  assert.equal(s.getStage(7, 3).rescued, true);
  assert.equal('rescued' in s.getStage(7, 3, 'hard'), false, '다른 난이도 칸엔 없다');
  assert.equal('rescued' in s.getStage(7, 1), false, '다른 버전 칸엔 없다');
  const raw = JSON.parse(st.getItem(KEY));
  assert.equal(raw.stages['7'].versions['3'].rescued, true);
  assert.deepEqual(Object.keys(raw.stages['7'].versions), ['3']);
  //  다른 필드 갱신이 rescued 를 지우지 않는다
  s.updateStage(7, { attempts: 3, cleared: true }, 3);
  assert.deepEqual(s.getStage(7, 3), { cleared: true, attempts: 3, bestSurvivors: 0, bestTime: 0, rescued: true });
  //  재로드 유지
  assert.equal(createSave3(st).getStage(7, 3).rescued, true);
  //  단조: false·'yes' 패치 뒤에도 true
  s.updateStage(7, { rescued: false }, 3);
  assert.equal(s.getStage(7, 3).rescued, true);
  s.updateStage(7, { rescued: 'yes' }, 3);
  assert.equal(s.getStage(7, 3).rescued, true);
  assert.equal(JSON.parse(st.getItem(KEY)).stages['7'].versions['3'].rescued, true);
  //  구출한 적 없는 칸에 false 를 보내도 키가 생기지 않는다
  s.updateStage(7, { rescued: false, attempts: 1 }, 3, 'hard');
  assert.deepEqual(s.getStage(7, 3, 'hard'), { cleared: false, attempts: 1, bestSurvivors: 0, bestTime: 0 });
  assert.equal('rescued' in JSON.parse(st.getItem(KEY)).stages['7'].versions['3:hard'], false);
  //  로드 정규화: 비불리언 rescued 는 버린다, attempts 는 남는다
  const s2 = createSave3(memStorage({ [KEY]: JSON.stringify({ v: 3, stages: { 7: { versions: { 3: { rescued: 'yes', attempts: 1 } } } } }) }));
  assert.deepEqual(s2.getStage(7, 3), { cleared: false, attempts: 1, bestSurvivors: 0, bestTime: 0 });
  //  로드: true 는 유지(getStageVersions 사본에도)
  const s3 = createSave3(memStorage({ [KEY]: JSON.stringify({ v: 3, stages: { 7: { versions: { 3: { rescued: true } } } } }) }));
  assert.equal(s3.getStage(7, 3).rescued, true);
  assert.deepEqual(s3.getStageVersions(7), { 3: { cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0, rescued: true } });
  //  patch({ stages }) 경로도 같은 규칙
  s3.patch({ stages: { 7: { versions: { 3: { rescued: false, attempts: 2 } } } } });
  assert.deepEqual(s3.getStage(7, 3), { cleared: false, attempts: 2, bestSurvivors: 0, bestTime: 0, rescued: true });
});

// ─────────────────────────────────────────────────────────────────────────────
//  기록 ctx(rush3-render 의 recCtx 와 같은 꼴): 호출마다 { op, args, alpha, fill, stroke, font }
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
  //  r3.20 원근 투영: 이 검사는 장치의 '무엇을 어디에(트랙 좌표 기준)' 를 잠그므로 평면 변환(flat = 항등)으로 그린다 — 원근 기하는 V3-PROJECT 가 따로 잠근다
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx, hud: { distM: 10 }, buttons: [], saveOk: true, flat: true });
  return ops;
}
function drawResult(run, result) {
  const { ctx, ops } = recCtx();
  const base = { stageId: 7, stageVersion: 2, difficulty: 'normal', title: '갓길의 보상', won: true, survivors: 60, peak: 63, time: 47, timeText: '47.0초', kills: 30,
                 missedLine: '놓친 것 없음', advice: null, lottery: null, isBest: false, saveOk: true, nextId: 8, objective: null, objectiveLine: null };
  createRenderer3(ctx, null).draw({ state: 'result', now: 1, run, fx: fxLike(), hud: { distM: 0 }, result: { ...base, ...result }, buttons: [], saveOk: true });
  return ops;
}

test('V3-CAPSULE CAP-8: 렌더 — 유리 캡슐(capsuleGlass)·목표 표지·내구 24(r3.21 — 활성 전 회색·활성 뒤 주황), 크레이트 폴백 없음, 목표 배너 2줄·셔터 아래 스택, 결과 목표 줄 y212/230, 타이틀 sub maxWidth', () => {
  //  ① S7 을 x120 으로 굴려 캡슐이 화면에 든 프레임(r3.18: z 4100 은 dz 700 > armZ 440 = 피격 활성 전 → 내구 숫자 회색 + 자물쇠)
  const run = createRun(buildStage(7));
  while (run.z < 4100) { stepRun(run, { pointerX: 120, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); }
  const c2 = run.supplies[1];
  assert.equal(c2.kind, 'capsule'); assert.equal(c2.opened, false);
  const ops0 = drawRun(run);
  const dur0 = textOf(ops0, '24');
  assert.ok(dur0 && dur0.fill === C.gateZero && dur0.args[1] === 120, '활성 전 내구 24 는 회색');
  //  활성 구간(dz ≤ 440)에 들어온 프레임: 주황
  while (c2.z - run.z > BAL3.supply.armZ) { stepRun(run, { pointerX: 120, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); }
  assert.equal(c2.opened, false);
  const ops = drawRun(run);
  assert.ok(textOf(ops, '목표'), "'목표' 표지");
  //  활성 STEP 에 이미 날아와 있던 탄이 맞아 숫자는 80 아래일 수 있다 — 현재 내구값을 본다
  const dur = textOf(ops, String(Math.max(0, Math.ceil(c2.durability))));
  assert.ok(dur && dur.fill === C.bulletHeavy && dur.args[1] === 120, '내구 숫자가 캡슐 x 에(주황)');
  assert.ok(ops.some((o) => o.op === 'fill' && o.fill === C.capsuleGlass), '유리 반투명 채움');
  assert.ok(ops.some((o) => o.op === 'stroke' && o.stroke === C.capsule), '청록 테');
  assert.ok(textOf(ops, '+2'), '합류 수(r3.21 n 2)');
  //  크레이트 폴백(supplyDark, 폭 2r = 60) 은 캡슐 x 에 그려지지 않는다(받침은 폭 1.8r = 54)
  assert.equal(ops.some((o) => o.op === 'roundRect' && o.fill === C.supplyDark && o.args[0] === 120 - 30 && o.args[2] === 60), false);
  //  놓친 캡슐엔 '목표' 표지가 없다
  const runM = createRun(buildStage(7));
  while (runM.z < 4100) { stepRun(runM, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(runM); }
  while (!runM.supplies[1].missed && runM.z < 5000) { stepRun(runM, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(runM); }
  assert.equal(runM.supplies[1].missed, true);
  assert.equal(textOf(drawRun(runM), '목표'), undefined);
  //  ② 목표 배너: objT > 0 이면 두 줄 전부, 0 이면 없음. 각 줄 24자 이하(어절 경계)
  for (const line of OBJECTIVE_BANNER_TEXT) assert.ok(line.length <= 24, line);
  const opsB = drawRun(run, fxLike({ objT: 2, objText: OBJECTIVE_BANNER_TEXT }));
  for (const line of OBJECTIVE_BANNER_TEXT) assert.ok(textOf(opsB, line), '배너 줄 ' + line);
  const opsB0 = drawRun(run, fxLike({ objT: 0, objText: OBJECTIVE_BANNER_TEXT }));
  for (const line of OBJECTIVE_BANNER_TEXT) assert.equal(textOf(opsB0, line), undefined);
  //  옛 fx 꼴(objT 칸 없음)도 그린다
  assert.ok(drawRun(run, fxLike()).length > 0);
  //  셔터 배너와 동시에 살아 있으면 목표 배너가 그 아래(y 가 더 크다)
  const opsS = drawRun(run, fxLike({ shutterT: 2, shutterText: SHUTTER_GUIDE_TEXT, objT: 2, objText: OBJECTIVE_BANNER_TEXT }));
  const yShutter = textOf(opsS, SHUTTER_GUIDE_TEXT[0]).args[2], yObj = textOf(opsS, OBJECTIVE_BANNER_TEXT[0]).args[2];
  assert.equal(yShutter, 332 + 23, '셔터 배너는 종전 자리');
  assert.ok(yObj > yShutter + 24 * 2, '목표 배너는 셔터 배너 아래 ' + yObj);
  const opsO = drawRun(run, fxLike({ objT: 2, objText: OBJECTIVE_BANNER_TEXT }));
  assert.equal(textOf(opsO, OBJECTIVE_BANNER_TEXT[0]).args[2], 332 + 23, '혼자면 슬롯 y332');
  //  ③ 결과 화면: 목표 줄 y 212(랜덤 길 줄이 있으면 230), null 이면 없음
  const line = '구출 성공 · +3명';
  const r1 = drawResult(run, { objective: { kind: 'capsule', done: true, missed: false, n: 3 }, objectiveLine: line });
  const t1 = textOf(r1, line);
  assert.ok(t1 && t1.args[2] === 212 && t1.fill === C.chainPad, '성공 줄 y212 청록');
  const r2 = drawResult(run, { objective: { kind: 'capsule', done: false, missed: true, n: 0 }, objectiveLine: '구출 실패 — 캡슐을 열지 못했습니다' });
  const t2 = textOf(r2, '구출 실패 — 캡슐을 열지 못했습니다');
  assert.ok(t2 && t2.args[2] === 212 && t2.fill === C.bulletHeavy, '실패 줄 y212 주황');
  assert.ok(textOf(r2, '작전 성공!'), '승리 제목은 그대로');
  const r3 = drawResult(run, { objectiveLine: null });
  assert.equal(textOps(r3).some((o) => String(o.args[0]).startsWith('구출')), false);
  const r4 = drawResult(run, { lottery: '오른쪽 랜덤 길은 이번 판엔 병사 8 이었습니다', objective: { kind: 'capsule', done: true, missed: false, n: 3 }, objectiveLine: line });
  assert.equal(textOf(r4, '오른쪽 랜덤 길은 이번 판엔 병사 8 이었습니다').args[2], 212);
  assert.equal(textOf(r4, line).args[2], 230);
  //  ④ 타이틀 sub 에 maxWidth(w − 12)
  const { ctx, ops: opsT } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'title', now: 1, buttons: [{ id: 'stage7', x: 60, y: 446, w: 176, h: 54, label: '7 갓길의 보상', sub: '도전 1회 · 구출✓', small: true }], saveOk: true });
  const sub = textOf(opsT, '도전 1회 · 구출✓');
  assert.ok(sub, 'sub 를 그린다');
  assert.equal(sub.args[3], 176 - 12);
  //  objectiveLine 순수 함수
  assert.equal(objectiveLine({ objective: { kind: 'capsule', done: true, n: 3 } }), line);
  assert.equal(objectiveLine({ objective: { kind: 'capsule', done: false, missed: true, n: 0 } }), '구출 실패 — 캡슐을 열지 못했습니다');
  assert.equal(objectiveLine({ objective: { kind: 'capsule', done: false, missed: false, n: 0 } }), '구출 실패 — 캡슐을 열지 못했습니다');
  assert.equal(objectiveLine({ objective: null }), null);
  assert.equal(objectiveLine(null), null);
});

// ─────────────────────────────────────────────────────────────────────────────
//  셸 하네스(rush3-loop 의 bootFake 최소판): 가짜 캔버스(찍힌 글 기록)·저장·오디오·rAF 큐
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
  const played = [];
  return { played, unlock() {}, sfx(n) { played.push(n); return true; }, bgmPlay() {}, bgmPause() {}, bgmResume() {}, setVolume() {}, getVolume() { return 1; }, setMuted() {}, isMuted() { return false; }, duck() {} };
}
function fakeStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
async function bootFake(storage = fakeStorage()) {
  const queue = [];
  let nowMs = 1000;
  const texts = [];
  const save = createSave3(storage);
  //  r4.3 순차 해금: 빈 저장은 1번만 열린다 — 이 하네스는 '옛 저장에 1~6번 클리어 기록이 있는 사용자'로 시작한다(검사하는 판 7 은 비워 둔다 — 그 판의 옛 칸 단언 보존)(옛 버전 칸 — 화면·코인 무영향, tests/lib/rush3-unlock.mjs)
  seedOldClears(save, 6);
  const audio = fakeAudio();
  //  r4.2: 종전 각 검사의 app.setDifficulty('normal') → 검사 전용 주입 deps.difficulty(게임 화면은 늘 brutal — 이 파일의 셸 검사는 배수 1 줄 판의 기대값을 그대로 쓴다)
  const app = boot(fakeCanvas(texts), { win: null, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save, audio, sprites: { get: () => null, ready: new Set() }, difficulty: 'normal' });
  await app.ready;
  const frames = (n) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  return { app, frames, save, storage, texts, audio };
}
//  정책 x 를 매 프레임 마우스 호버로 넣어 굴린다(조건이 참이 되거나 상한까지)
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

test('V3-CAPSULE-SHELL SHELL-1: 배너 1회 — S7 출격 직후 objT 3·두 줄 그림, 3초 뒤 0 이고 다시 켜지지 않는다. S1 은 0', async () => {
  const h = await bootFake();
  h.app.startRun(7);
  const fx = () => h.app.getFx();
  assert.equal(fx().objT, BAL3.fx.objectiveBannerSec);
  assert.deepEqual(fx().objText, OBJECTIVE_BANNER_TEXT);
  h.texts.length = 0;
  h.frames(1);
  for (const line of OBJECTIVE_BANNER_TEXT) assert.ok(h.texts.includes(line), '첫 프레임에 배너 줄 ' + line);
  h.frames(200);
  assert.equal(fx().objT, 0);
  h.texts.length = 0;
  h.frames(120);
  assert.equal(fx().objT, 0, '다시 켜지지 않는다');
  for (const line of OBJECTIVE_BANNER_TEXT) assert.equal(h.texts.includes(line), false);
  assert.equal(h.app.dbg().objective.kind, 'capsule');
  //  목표가 없는 판
  h.app.startRun(1);
  assert.equal(fx().objT, 0);
  assert.equal(fx().objText, null);
  assert.equal(h.app.dbg().objective, null);
});

test('V3-CAPSULE-SHELL SHELL-2: 구출 → 결과 → 저장 → 타이틀 — aim 정책으로 S7 캡슐을 열면 joinMany 효과음은 기록만(n 2 < joinManyAt 3 — 검수 반영, 규칙으로 잠그지 않음)·"구출 성공!"·"+2명 합류", 결과에 "구출 성공 · +2명"(r3.21 n 2)과 "작전 성공!", rescued 저장, 타이틀 sub 에 "구출✓"', async (t) => {
  const h = await bootFake();
  h.app.startRun(7);
  const run = () => h.app.getRun();
  h.frames(1);
  h.texts.length = 0; h.audio.played.length = 0;
  driveUntil(h, 'aim', () => run().objective.done, 6000);
  assert.equal(run().objective.done, true, '캡슐 구출');
  //  r3.24 손맛: '+n명 합류' 는 병사들이 캡슐 자리에서 부대로 **날아와 도착하는 순간**(BAL3.fx.joinFly.sec 0.5초 + 줄지어 출발) 뜬다 — 2프레임 → 45프레임(0.75초)
  h.frames(45);
  //  r3.21: 캡슐 n 3 → 2 라 셸 규칙(main.js joinMany 효과음은 ev.n >= FX.joinManyAt 3)에 걸리지 않는다 — 구출 성공에 소리가 없는 것은 사용자 체감 퇴행이라
  //   규칙으로 잠그지 않고 기록만 남긴다(검수 반영). 다음 회차 main.js joinManyAt 3 → 2 또는 캡슐 전용 효과음을 넣은 뒤 '효과음 있음' 단언으로 되돌린다. 보고서 difficulty-b-20260920 §6
  t.diagnostic(`CAPSULE SHELL-2 joinMany 효과음 ${h.audio.played.includes('joinMany') ? '있음' : '없음(n 2 < joinManyAt 3 — main.js 미수정)'}`);
  assert.ok(h.texts.includes('구출 성공!'), '구출 플로터');
  assert.ok(h.texts.includes('+2명 합류'), '합류 플로터');
  assert.ok(h.texts.includes('구출!'), '개봉 팝 문구');
  assert.equal(h.texts.includes('놓침'), false);
  //  계속 굴려 결과 화면까지
  driveUntil(h, 'aim', () => h.app.getState() === 'result', 9000);
  assert.equal(h.app.getState(), 'result');
  h.texts.length = 0;
  h.frames(1);
  assert.ok(h.texts.includes('구출 성공 · +2명'), '결과 목표 줄');
  assert.ok(h.texts.includes('작전 성공!'));
  assert.equal(h.save.getStage(7, 3).rescued, true, '구출 기록');
  assert.equal('rescued' in h.save.getStage(7, 3, 'brutal'), false, '다른 난이도 칸엔 없다');
  assert.equal(h.save.getStage(7, 3).cleared, true);
  //  타이틀: 7번 칸 sub 가 '완료 · … · 구출✓'
  h.app.toTitle();
  h.texts.length = 0;
  h.frames(2);
  const sub = h.texts.find((t) => t.endsWith('구출✓'));
  assert.ok(sub, "'구출✓' 가 붙는다: " + h.texts.filter((t) => t.includes('·')).join(' | '));
  assert.ok(sub.startsWith('완료 · '), sub);
});

test('V3-CAPSULE-SHELL SHELL-3: 놓침은 실패 아님 — x240 고정으로 S7 완주하면 "캡슐 놓침"·결과 "구출 실패 — 캡슐을 열지 못했습니다"와 "작전 성공!" 이 함께, rescued 없음', async () => {
  const h = await bootFake();
  h.app.startRun(7);
  const run = () => h.app.getRun();
  h.frames(1);
  h.texts.length = 0;
  driveUntil(h, 240, () => run().objective.missed, 6000);
  assert.equal(run().objective.missed, true);
  h.frames(2);
  assert.ok(h.texts.includes('캡슐 놓침'), '놓침 플로터');
  assert.equal(h.texts.includes('놓침'), false, "캡슐엔 '놓침' 을 겹쳐 띄우지 않는다");
  driveUntil(h, 240, () => h.app.getState() === 'result', 9000);
  assert.equal(h.app.getState(), 'result');
  h.texts.length = 0;
  h.frames(1);
  assert.ok(h.texts.includes('구출 실패 — 캡슐을 열지 못했습니다'));
  assert.ok(h.texts.includes('작전 성공!'), '놓쳐도 작전은 성공');
  assert.equal('rescued' in h.save.getStage(7, 3), false);
  assert.equal(h.save.getStage(7, 3).cleared, true);
  assert.equal(h.app.dbg().objective.missed, true);
  assert.equal(h.app.dbg().objective.done, false);
  h.app.toTitle();
  h.texts.length = 0;
  h.frames(2);
  assert.equal(h.texts.some((t) => t.endsWith('구출✓')), false);
});
