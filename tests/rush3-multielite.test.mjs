// rush3-multielite — 복수 정예(계약서 r3.16 · 실게임 구현계획 B-1 장치 5 · 01 §5-8 · 02 V24). ID 접두 V3-MULTIELITE.
//  "목표가 둘이면 순서를 골라야 한다" — 2~3체가 같은 STEP 에 등장하고 역할(포격·소환·장갑)이 다르며 전원을 잡아야 승리다.
//  잠그는 것: 형식·정규화(ME-1) · 동시 등장·z 정지(ME-2) · 역할 행동(ME-3) · 별칭 이동·부분 승리 없음(ME-4) · 단수 회귀(ME-5) ·
//  C[9]·C[23] 봇 완주(ME-6) · 결정성·순서(ME-7) · 렌더(ME-8) · 셸(ME-9).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, drainEvents, makeBoss, STEP } from '../rush3/combat.js';
import { buildStage, stageVersion, ALL_STAGE_IDS } from '../rush3/stages.js';
import { BAL3 } from '../rush3/balance.js';
import { createRenderer3 } from '../rush3/render.js';
import { boot } from '../rush3/main.js';
import { createSave3 } from '../rush3/save.js';
import { pickX, playPolicy } from './lib/rush3-policies.mjs';

const E = BAL3.enemies.elite, ROLES = BAL3.elites.roles, LANE_HW = BAL3.elites.laneHw;
const ROAD_LO = BAL3.road.x0 + E.r, ROAD_HI = BAL3.road.x1 - E.r;
const NONE = { pointerX: null, dragDx: 0, keyDir: 0 };
const at = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0 });
const count = (ev, type) => ev.filter((e) => e.type === type).length;
const holdFire = (run) => { for (const u of run.units) u.fireT = 1e9; };

//  합성 스테이지 조립기(rush3-combat 의 mkStage 꼴 + elites 배열). buildStage 를 거치지 않으므로 elites 원소는 그대로 run 에 실린다
function mkStage(o = {}) {
  const elites = o.elites ?? (o.elite ? [{ z: o.elite.z, hp: o.elite.hp, summon: !!o.elite.summon }] : null);
  return {
    id: o.id ?? 't', version: 1, title: 'test', startUnits: o.startUnits ?? 1, startWeapon: o.startWeapon ?? 'rifle',
    length: o.length ?? 100000, eliteZ: elites ? elites[0].z : null,
    gateRows: [], supplies: [], walls: [],
    spawns: (o.spawns || []).map((s) => ({ z: s.z, kind: s.kind, n: s.xs.length, xs: s.xs, zs: s.zs, corridorHw: null })),
    //  elites 를 준 경우에만 배열을 싣고, 단수 elite 만 준 경우는 rush3-combat 과 같은 꼴(createRun 이 정규화한다)
    ...(o.elites ? { elites: o.elites } : {}),
    elite: elites ? elites[0] : null,
  };
}
function play(run, n, input = NONE, onStep = null) {
  const all = [];
  for (let i = 0; i < n && !run.over; i++) {
    stepRun(run, typeof input === 'function' ? input(run) : input, STEP);
    const ev = drainEvents(run);
    all.push(...ev);
    if (onStep) onStep(run, ev, i);
  }
  return all;
}
//  정책 봇으로 조건까지 굴린다. 반환 = { steps, events(전부) }
function driveUntil(run, policy, cond, max = 14400) {
  const events = [];
  let n = 0;
  while (!run.over && n < max && !cond(run)) {
    stepRun(run, at(pickX(policy, run)), STEP);
    events.push(...drainEvents(run));
    n++;
  }
  return { steps: n, events };
}
const hpSum = (st) => st.elites.reduce((a, e) => a + e.hp, 0);

// ─────────────────────────────────────────────────────────────────────────────
test('V3-MULTIELITE ME-1: 형식·정규화 — 9 는 2체(gunner·summoner, x 160/320, 합 1320), 23 은 3체(tank patrol 0, 합 5640), 나머지는 단수 모양 그대로·결정적', () => {
  const s9 = buildStage(9);
  assert.equal(s9.elites.length, 2);
  assert.deepEqual(s9.elites.map((e) => e.role), ['gunner', 'summoner']);
  assert.deepEqual(s9.elites.map((e) => e.x), [160, 320]);
  assert.ok(s9.elites.every((e) => e.z === s9.eliteZ && e.z === 9000), '전원 eliteZ');
  //  r3.18 대항 검수 반영: 440 → 1320(무입력 도착 156 dps × 8초 안팎)
  assert.equal(hpSum(s9), 1320);
  assert.equal(s9.elite, s9.elites[0], 'stage.elite 는 첫 원소와 같은 객체');
  const s23 = buildStage(23);
  assert.equal(s23.elites.length, 3);
  assert.deepEqual(s23.elites.map((e) => e.role), ['gunner', 'summoner', 'tank']);
  const tank = s23.elites.find((e) => e.role === 'tank');
  assert.equal(tank.patrol, 0); assert.equal(tank.x, 240); assert.equal(tank.skin, 'B4_smelter');
  //  r3.18: 940 → 5640(무입력 도착 640 dps × 9초 안팎)
  assert.equal(hpSum(s23), 5640);
  assert.ok(s23.elites.every((e) => e.z === 10200));
  //  단수 정의 스테이지(9·23 제외 전부): elites 길이 1 이고 stage.elite 가 종전 키 집합 { z, hp, summon(, skin) } 그대로
  for (const id of ALL_STAGE_IDS) {
    if (id === 9 || id === 23) continue;
    const st = buildStage(id);
    assert.equal(st.elites.length, 1, 'S' + id + ' 단수');
    assert.equal(st.elite, st.elites[0]);
    assert.deepEqual(Object.keys(st.elite).filter((k) => k !== 'skin'), ['z', 'hp', 'summon'], 'S' + id + ' stage.elite 키 집합');
    assert.equal(st.elite.role, undefined); assert.equal(st.elite.x, undefined); assert.equal(st.elite.patrol, undefined);
  }
  assert.deepEqual(buildStage(1).elite, { z: 7200, hp: 120, summon: false });
  assert.deepEqual(buildStage(3).elite, { z: 10600, hp: 500, summon: true });
  //  결정성(두 번 빌드 deepEqual, 참조는 다르다) · 전 스테이지 원소가 표 안(x 도로 안·role 표 안·≤ 3체)
  for (const id of ALL_STAGE_IDS) {
    const a = buildStage(id), b = buildStage(id);
    assert.deepEqual(a.elites, b.elites, 'S' + id + ' 결정성');
    assert.notEqual(a.elites, b.elites); assert.notEqual(a.elites[0], b.elites[0]);
    assert.ok(a.elites.length >= 1 && a.elites.length <= 3, 'S' + id + ' 체 수');
    for (const e of a.elites) {
      assert.ok(e.hp > 0 && Number.isInteger(e.hp));
      if (e.x != null) assert.ok(e.x >= ROAD_LO && e.x <= ROAD_HI, 'S' + id + ' x ' + e.x);
      if (e.role != null) assert.ok(ROLES[e.role], 'S' + id + ' role ' + e.role);
    }
  }
  //  모르는 역할은 생성 시점에 막힌다(STEP 도중이 아니라)
  assert.throws(() => createRun(mkStage({ elites: [{ z: 0, hp: 10, role: 'wizard' }] })), /unknown elite role/);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-MULTIELITE ME-2: 동시 등장·z 정지 — S9 정예 2체가 같은 STEP 에 index 0·1 로 나오고, 별칭은 첫 보스, 다음 STEP 부터 run.z 정지, 스폰 x 160/320·760 앞', () => {
  const run = createRun(buildStage(9));
  let spawnEv = null, zAtSpawn = null;
  play(run, 14400, at(240), (r, ev) => {
    if (spawnEv) return;
    const es = ev.filter((e) => e.type === 'elite');
    if (es.length) { spawnEv = es; zAtSpawn = r.z; }
  });
  assert.ok(spawnEv, '정예 등장까지 도달');
  assert.equal(spawnEv.length, 2, '같은 STEP 에 2개');
  assert.deepEqual(spawnEv.map((e) => [e.id, e.index, e.total, e.role]), [['b1', 0, 2, 'gunner'], ['b2', 1, 2, 'summoner']]);
  assert.deepEqual(spawnEv.map((e) => e.x), [160, 320]);
  for (const e of spawnEv) { assert.equal(e.z - zAtSpawn, E.spawnAhead); assert.ok(e.hp > 0); }
  assert.deepEqual(spawnEv.map((e) => e.hp), [600, 720]);
  //  다시 굴려 등장 직후 상태를 본다(직접 루프)
  const run3 = createRun(buildStage(9));
  for (let i = 0; i < 14400 && !run3.bosses.length; i++) { stepRun(run3, at(240), STEP); drainEvents(run3); }
  assert.equal(run3.bosses.length, 2);
  assert.equal(run3.boss, run3.bosses[0], '별칭 = 첫 보스');
  assert.deepEqual(run3.bosses.map((b) => b.id), ['b1', 'b2']);
  assert.deepEqual(run3.bosses.map((b) => b.dir), [1, -1]);
  const z0 = run3.z;
  stepRun(run3, at(240), STEP); drainEvents(run3);
  assert.equal(run3.z, z0, '보스가 있으면 z 정지');
  assert.equal(run3.eliteSpawned, true);
  //  차선: gunner [128, 192] · summoner [288, 352]
  assert.deepEqual(run3.bosses.map((b) => [b.laneLo, b.laneHi]), [[160 - LANE_HW, 160 + LANE_HW], [320 - LANE_HW, 320 + LANE_HW]]);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-MULTIELITE ME-3: 역할 행동 — gunner 만 적탄(자기 차선에서), summoner 만 소환(자기 x±40), tank 는 둘 다 없고 느리게·가까이 정지·제자리', () => {
  const HP = 100000;
  const run = createRun(mkStage({ startUnits: 30, elites: [
    { z: 0, hp: HP, role: 'gunner', x: 160 }, { z: 0, hp: HP, role: 'summoner', x: 320 }, { z: 0, hp: HP, role: 'tank', x: 240, patrol: 0 },
  ] }));
  const SEC = 6, N = SEC * 60;
  let gunnerMin = Infinity, gunnerMax = -Infinity, tankXs = new Set(), drop1s = null;
  const ev = play(run, N, at(240), (r, _ev, i) => {
    const [g, , t] = r.bosses;
    gunnerMin = Math.min(gunnerMin, g.x); gunnerMax = Math.max(gunnerMax, g.x);
    tankXs.add(t.x);
    if (i === 59) drop1s = { tank: (r.z + E.spawnAhead) - t.z, gunner: (r.z + E.spawnAhead) - g.z };
  });
  const [g, s, t] = run.bosses;
  assert.deepEqual([g.shoot, g.summon, s.shoot, s.summon, t.shoot, t.summon], [true, false, false, true, false, false]);
  //  적탄: 전부 부채꼴 3발이고 gunner 차선 x 에서만. 6초면 shootEvery(1.0) 기준 5~6회
  const shots = ev.filter((e) => e.type === 'eshot');
  assert.ok(shots.length >= 5 && shots.length <= 6, '적탄 볼리 ' + shots.length);
  for (const e of shots) { assert.equal(e.n, E.fan); assert.ok(e.x >= 160 - LANE_HW - 1e-9 && e.x <= 160 + LANE_HW + 1e-9, 'gunner 차선 밖 적탄 x=' + e.x); }
  //  소환: summonEvery(4) 안에 1회 이상, 전부 summoner 자리(x±summonDx 안), 잡졸 2
  const sums = ev.filter((e) => e.type === 'summon');
  assert.ok(sums.length >= 1, '소환 ' + sums.length);
  for (const e of sums) { assert.equal(e.kind, 'grunt'); assert.equal(e.n, E.summonN); assert.ok(Math.abs(e.x - 320) <= LANE_HW + 1e-9, 'summoner 밖 소환 x=' + e.x); }
  assert.ok(ev.some((e) => e.type === 'spawn') === false, '스폰 표는 비어 있다');
  assert.ok(sums.every((e) => Math.abs(e.x - 240) > 30) && shots.every((e) => Math.abs(e.x - 240) > 30), 'tank(x240)는 쏘지도 소환하지도 않는다');
  //  정지 거리: tank 360 · gunner 420 · summoner 460(6초면 셋 다 hold)
  assert.deepEqual(run.bosses.map((b) => b.state), ['hold', 'hold', 'hold']);
  assert.ok(Math.abs((t.z - run.z) - ROLES.tank.holdAhead) < 1e-6);
  assert.ok(Math.abs((g.z - run.z) - ROLES.gunner.holdAhead) < 1e-6);
  assert.ok(Math.abs((s.z - run.z) - ROLES.summoner.holdAhead) < 1e-6);
  //  1초 시점 하강량: tank(0.7배) < gunner
  assert.ok(drop1s && drop1s.tank < drop1s.gunner, '1초 하강 ' + JSON.stringify(drop1s));
  assert.equal(t.descendSpeed, E.descendSpeed * ROLES.tank.descendMul);
  assert.equal(t.patrolSpeed, E.patrolSpeed * ROLES.tank.patrolMul);
  //  순찰: gunner 는 [128, 192] 안에서 양 끝을 다 찍고 벗어나지 않는다, tank(patrol 0)는 x 불변
  assert.ok(gunnerMin >= 128 - 1e-9 && gunnerMax <= 192 + 1e-9, 'gunner 차선 ' + gunnerMin + '~' + gunnerMax);
  assert.ok(gunnerMin <= 128 + 1 && gunnerMax >= 192 - 1, 'gunner 양 끝 도달 ' + gunnerMin + '~' + gunnerMax);
  assert.deepEqual([...tankXs], [240]);
  assert.deepEqual(run.bosses.map((b) => b.id), ['b1', 'b2', 'b3']);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-MULTIELITE ME-4: 별칭 이동·부분 승리 없음 — 첫 보스가 죽으면 bossKill{left 1}·별칭은 둘째로·잡졸은 남고 z 정지, 둘째까지 죽어야 bossDefeated·win·소거', () => {
  const run = createRun(mkStage({ startUnits: 1, elites: [{ z: 0, hp: 3, role: 'gunner', x: 160 }, { z: 0, hp: 3, role: 'gunner', x: 320 }],
    spawns: [{ z: 0, kind: 'grunt', xs: [100], zs: [3000] }] }));
  holdFire(run);
  play(run, 1);
  assert.equal(run.bosses.length, 2); assert.equal(run.enemies.length, 1);
  const [b1, b2] = run.bosses;
  assert.equal(run.boss, b1);
  const z0 = run.z;
  //  첫 보스를 직접 죽인다(hp 0 · dead) → 그 STEP 의 cleanup 이 거둔다
  b1.hp = 0; b1.dead = true;
  const ev1 = play(run, 1);
  const k1 = ev1.filter((e) => e.type === 'bossKill'), l1 = ev1.filter((e) => e.type === 'bossesLeft');
  assert.equal(k1.length, 1); assert.equal(l1.length, 1);
  assert.deepEqual([k1[0].id, k1[0].index, k1[0].role, k1[0].left, k1[0].total, k1[0].r], ['b1', 0, 'gunner', 1, 2, E.r]);
  assert.ok('x' in k1[0] && 'z' in k1[0], '종전 필드 x·z 유지');
  assert.deepEqual(l1[0], { type: 'bossesLeft', left: 1, total: 2, index: 0 });
  assert.equal(run.boss, b2, '별칭이 둘째로');
  assert.equal(b1.dead, true); assert.equal(b1.reaped, true); assert.equal(run.bosses.length, 2, '죽은 보스도 배열에 남는다');
  assert.equal(run.bossDefeated, false); assert.equal(run.won, false); assert.equal(run.over, false);
  assert.equal(run.z, z0, 'z 계속 정지');
  assert.equal(run.enemies.length, 1, '잡졸은 남는다(소거 안 됨)');
  assert.equal(run.kills, 1);
  assert.equal(count(ev1, 'win'), 0);
  //  둘째 보스 처치 → 전부 격파
  b2.hp = 0; b2.dead = true;
  const ev2 = play(run, 1);
  const k2 = ev2.filter((e) => e.type === 'bossKill'), l2 = ev2.filter((e) => e.type === 'bossesLeft');
  assert.deepEqual([k2.length, k2[0].index, k2[0].left, k2[0].total], [1, 1, 0, 2]);
  assert.deepEqual(l2[0], { type: 'bossesLeft', left: 0, total: 2, index: 1 });
  assert.equal(run.bossDefeated, true); assert.equal(run.boss, null);
  assert.equal(run.won, true); assert.equal(run.wonAt, run.time); assert.equal(run.over, true);
  assert.equal(count(ev2, 'win'), 1);
  assert.equal(run.enemies.length, 0); assert.equal(run.eshots.length, 0);
  assert.equal(run.kills, 2);
  //  같은 STEP 에 둘이 죽어도 left 는 1 → 0 으로 단조
  const run2 = createRun(mkStage({ startUnits: 1, elites: [{ z: 0, hp: 3 }, { z: 0, hp: 3 }] }));
  holdFire(run2); play(run2, 1);
  for (const b of run2.bosses) { b.hp = 0; b.dead = true; }
  const ev3 = play(run2, 1);
  assert.deepEqual(ev3.filter((e) => e.type === 'bossKill').map((e) => [e.index, e.left]), [[0, 1], [1, 0]]);
  assert.deepEqual(ev3.filter((e) => e.type === 'bossesLeft').map((e) => e.left), [1, 0]);
  assert.equal(run2.won, true); assert.equal(run2.kills, 2);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-MULTIELITE ME-5: 단수 회귀 — 1~3 은 elites 1·별칭·role elite, S1 완주에 elite 1·bossKill 1(left 0)·bossesLeft 1, 도로 전체 왕복, S3 는 사격+소환', () => {
  for (const id of [1, 2, 3]) {
    const run = createRun(buildStage(id));
    assert.equal(run.elites.length, 1); assert.equal(run.elite, run.elites[0]);
    assert.deepEqual(run.bosses, []); assert.equal(run.boss, null);
    const bo = makeBoss(run, run.elites[0], 0);
    assert.deepEqual([bo.id, bo.index, bo.role, bo.x, bo.dir, bo.laneLo, bo.laneHi, bo.holdAhead, bo.descendSpeed, bo.patrolSpeed, bo.shoot],
      ['b1', 0, 'elite', BAL3.road.center, 1, ROAD_LO, ROAD_HI, E.holdAhead, E.descendSpeed, E.patrolSpeed, true]);
    assert.equal(bo.summon, id === 3, 'S' + id + ' 소환 = 정의 플래그');
    assert.equal(bo.max, run.elites[0].hp);
  }
  //  S1 을 가운데 봇으로 완주: 이벤트 수·필드
  const run = createRun(buildStage(1));
  const { events } = driveUntil(run, 'center', () => false);
  assert.equal(run.won, true);
  const el = events.filter((e) => e.type === 'elite');
  assert.equal(el.length, 1);
  assert.deepEqual([el[0].id, el[0].index, el[0].total, el[0].role, el[0].x, el[0].hp], ['b1', 0, 1, 'elite', 240, 120]);
  assert.ok(typeof el[0].z === 'number');
  const bk = events.filter((e) => e.type === 'bossKill');
  assert.equal(bk.length, 1); assert.deepEqual([bk[0].left, bk[0].total, bk[0].index], [0, 1, 0]);
  assert.deepEqual(events.filter((e) => e.type === 'bossesLeft'), [{ type: 'bossesLeft', left: 0, total: 1, index: 0 }]);
  //  차선 기본값 = 도로 전체: 합성 단수 정예가 8초 안에 128·352 양 끝을 찍는다(병력 30 — 1명이면 적탄에 죽어 판이 먼저 끝난다)
  const run2 = createRun(mkStage({ startUnits: 30, elite: { z: 0, hp: 100000 } }));
  let mn = Infinity, mx = -Infinity;
  play(run2, 8 * 60, at(240), (r) => { mn = Math.min(mn, r.boss.x); mx = Math.max(mx, r.boss.x); });
  assert.ok(mn <= ROAD_LO + 1 && mx >= ROAD_HI - 1, '왕복 ' + mn + '~' + mx);
  assert.ok(mn >= ROAD_LO - 1e-9 && mx <= ROAD_HI + 1e-9);
  //  S3 정예(role elite + summon true): 6초 안에 적탄과 소환이 둘 다 난다
  const run3 = createRun(mkStage({ startUnits: 30, elite: { z: 0, hp: 100000, summon: true } }));
  const ev3 = play(run3, 6 * 60, at(240));
  assert.equal(run3.over, false);
  assert.ok(count(ev3, 'eshot') >= 5 && count(ev3, 'summon') >= 1);
});

// ─────────────────────────────────────────────────────────────────────────────
//  r3.18 재기준: '종전 단수 정예의 1.2~1.5배' 기준은 폐기(대항 검수 — 그 값은 무입력 도착 병력에 2~5초 만에 전멸해 순서 선택이 화면에 남지 않았다).
//   새 기준 = 무입력 도착 병력의 dps × 목표 전투 초. 합은 정확한 값으로, 그리고 등장 → 마지막 격파까지의 **최소 생존 초**를 planBoss 보통에서 잠근다(S9 ≥ 8초, S23 ≥ 6초 — 실측 15.6·10.2초)
test('V3-MULTIELITE ME-6: C[9]·C[23] planBoss 보통 완주 — won·상한 안, 체력 합 1320·5640, 등장→마지막 격파 최소 생존 초(9: 8초·23: 6초), 코스 버전 2', (t) => {
  for (const [id, expectSum, minSec] of [[9, 1320, 8], [23, 5640, 6]]) {
    const r = playPolicy(id, 'planBoss', 14400, 'normal');
    assert.equal(r.run.won, true, `S${id} planBoss 미완주(남은 보스 ${r.run.bosses.filter((b) => !b.dead).map((b) => b.id + ':' + Math.ceil(b.hp)).join(',')} 병력 ${r.run.units.length})`);
    assert.ok(r.steps < 14400);
    assert.equal(r.events.elite, buildStage(id).elites.length, '등장 이벤트는 보스 수만큼');
    assert.equal(r.events.bossKill, buildStage(id).elites.length);
    const sum = hpSum(buildStage(id));
    assert.equal(sum, expectSum, `S${id} 체력 합`);
    assert.equal(stageVersion(id), 2);
    //  처치 순서·잔여 병력·생존 초 기록(등장 STEP 의 run.time → 마지막 bossKill STEP 의 run.time)
    const run = createRun(buildStage(id));
    let spawnT = null, lastKillT = null;
    const order = [];
    for (let i = 0; i < 14400 && !run.over; i++) {
      stepRun(run, at(pickX('planBoss', run)), STEP);
      for (const e of drainEvents(run)) {
        if (e.type === 'elite' && spawnT === null) spawnT = run.time;
        if (e.type === 'bossKill') { lastKillT = run.time; order.push(e.id + '(' + e.role + ')'); }
      }
    }
    assert.ok(spawnT !== null && lastKillT !== null);
    assert.ok(lastKillT - spawnT >= minSec, `S${id} 정예 생존 ${(lastKillT - spawnT).toFixed(1)}초 < ${minSec}`);
    t.diagnostic(`MULTIELITE S${id} won=${run.won} units=${run.units.length} weapon=${run.weapon} time=${run.time.toFixed(1)} fight=${(lastKillT - spawnT).toFixed(1)}s order=${order.join('→')}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-MULTIELITE ME-7: 결정성·순서 — 같은 입력열 두 판 deepEqual, 저격총 한 발이 겹친 보스 둘을 각각 1회씩, 전격포 연쇄 순서가 두 판에서 같다', () => {
  const snap = (run) => run.bosses.map((b) => [b.id, b.hp, b.x, b.z, b.dead, b.reaped, b.state]);
  const a = createRun(buildStage(23)), b = createRun(buildStage(23));
  driveUntil(a, 'planBoss', () => false); driveUntil(b, 'planBoss', () => false);
  assert.deepEqual(snap(a), snap(b));
  assert.deepEqual([a.won, a.time, a.kills, a.units.length], [b.won, b.time, b.kills, b.units.length]);
  //  저격총(pierce 2): 같은 x·z 에 겹친 보스 둘 — 한 탄이 b1 → b2 순으로 1회씩, 같은 보스를 두 번 맞히지 않는다
  const run = createRun(mkStage({ startUnits: 1, startWeapon: 'sniper', elites: [
    { z: 0, hp: 100000, role: 'gunner', x: 240, patrol: 0 }, { z: 0, hp: 100000, role: 'gunner', x: 240, patrol: 0 },
  ] }));
  const ev = play(run, 5 * 60, at(240), (r) => {
    for (const bl of r.bullets) if (bl.hit) { assert.equal(new Set(bl.hit).size, bl.hit.length, '같은 보스 중복 ' + bl.hit); assert.ok(bl.hit.length <= 2); }
  });
  const hits = ev.filter((e) => e.type === 'enemyHit' && e.kind === 'elite');
  assert.ok(hits.length >= 4, '피격 ' + hits.length);
  assert.equal(hits.filter((e) => e.id === 'b1').length, hits.filter((e) => e.id === 'b2').length, 'b1·b2 피격 수 같음');
  assert.equal(run.bosses[0].hp, run.bosses[1].hp);
  //  첫 피격은 항상 b1(같은 교차 z 면 index 순)
  assert.equal(hits[0].id, 'b1');
  //  전격포: 직격 보스에서 chainR 안의 다른 보스로 연쇄 — arc 이벤트 순서가 두 판에서 같고 보스 id 정렬 열쇠가 NaN 이 아니다
  const mkArc = () => createRun(mkStage({ startUnits: 4, startWeapon: 'arc', elites: [
    { z: 0, hp: 100000, role: 'gunner', x: 200, patrol: 0 }, { z: 0, hp: 100000, role: 'gunner', x: 280, patrol: 0 }, { z: 0, hp: 100000, role: 'tank', x: 240, patrol: 0 },
  ] }));
  const r1 = mkArc(), r2 = mkArc();
  const arcs = (r) => play(r, 5 * 60, at(240)).filter((e) => e.type === 'arc' || (e.type === 'enemyHit' && e.arc)).map((e) => [e.type, e.id ?? null, e.tx ?? null, e.tz ?? null]);
  const a1 = arcs(r1), a2 = arcs(r2);
  assert.ok(a1.length >= 2, '연쇄 ' + a1.length);
  assert.deepEqual(a1, a2);
  assert.ok(a1.some((e) => e[0] === 'enemyHit' && typeof e[1] === 'string'), '보스로 연쇄가 간다');
});

// ─────────────────────────────────────────────────────────────────────────────
//  호출 기록 ctx(rush3-render 와 같은 꼴)
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
        ops.push({ op: k, args, alpha: t.globalAlpha, fill: t.fillStyle, stroke: t.strokeStyle, font: t.font, lw: t.lineWidth });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
//  옛 fx 꼴(새 칸 없음) — render 가 ?? 로 관용해야 한다
function makeFxLike(o = {}) {
  return { parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {},
           shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null,
           lotOpen: 0, lotSeen: false, lotSame: false, ...o };
}
const textsOf = (ops) => ops.filter((o) => o.op === 'fillText').map((o) => String(o.args[0]));

test('V3-MULTIELITE ME-8: 렌더 — 3체 중 1 격파 상태에서 HUD 3칸(격파·역할 hp/max)·"남은 목표 2/3"·역할 이름, 죽은 보스는 안 그린다, 단수는 종전 문구, 처치 배너', () => {
  const run = createRun(buildStage(23));
  for (let i = 0; i < 14400 && !run.bosses.length; i++) { stepRun(run, at(pickX('planBoss', run)), STEP); drainEvents(run); }
  assert.equal(run.bosses.length, 3);
  //  사격을 멈추고(중화기 128명이면 정지 전에 셋 다 죽는다) 셋 다 정지할 때까지
  for (let i = 0; i < 600 && !run.bosses.every((b) => b.state === 'hold'); i++) { holdFire(run); stepRun(run, at(240), STEP); drainEvents(run); }
  assert.deepEqual(run.bosses.map((b) => [b.state, b.dead]), [['hold', false], ['hold', false], ['hold', false]]);
  //  gunner(b1) 를 죽여 거둔다
  run.bosses[0].hp = 0; run.bosses[0].dead = true;
  stepRun(run, at(240), STEP); drainEvents(run);
  assert.equal(run.bosses.filter((b) => !b.dead).length, 2);
  for (const b of run.bosses) if (!b.dead) b.hp = b.max;
  const { ctx, ops } = recCtx();
  const fx = makeFxLike();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx, hud: { distM: 0 }, buttons: [], saveOk: true });
  const texts = textsOf(ops);
  assert.ok(texts.includes('정예 전투! 남은 목표 2/3'), texts.filter((t) => t.startsWith('정예')).join('|'));
  assert.ok(texts.includes('격파'), 'HUD 격파 칸');
  assert.ok(texts.includes('소환 1800/1800') && texts.includes('장갑 2280/2280'), 'HUD 역할 칸: ' + texts.filter((t) => /\d+\/\d+/.test(t)).join('|'));
  assert.ok(texts.includes('소환') && texts.includes('장갑'), '보스 발밑 역할 이름');
  assert.equal(texts.includes('포격'), false, '죽은 gunner 는 그리지 않는다');
  assert.ok(texts.includes('1800') && texts.includes('2280') && !texts.includes('1560'), '살아 있는 보스 hp 숫자만');
  //  막대 칸: 배경 3 + 채움 2(죽은 칸은 채움 없음) — render.roundRect 는 moveTo(x+r, 76) 로 시작하므로 y 76 의 moveTo 를 센다
  const barsOf = (o) => o.filter((q) => q.op === 'moveTo' && q.args[1] === 76).length;
  assert.equal(barsOf(ops), 5, '막대 수 ' + barsOf(ops));
  //  탱크 폴백 원 테두리(그림 없음): lineWidth 9 stroke 가 있다
  assert.ok(ops.some((o) => o.op === 'stroke' && o.lw === 9), '장갑형 두꺼운 테두리');
  //  처치 배너: fx 에 문구가 있으면 그린다
  const { ctx: c2, ops: o2 } = recCtx();
  createRenderer3(c2, null).draw({ state: 'run', now: 1, run, fx: makeFxLike({ bossBannerT: 1, bossBannerText: '정예 1 격파 — 남은 목표 2' }), hud: { distM: 0 }, buttons: [], saveOk: true });
  assert.ok(textsOf(o2).includes('정예 1 격파 — 남은 목표 2'));
  //  경고 배너 문구: eliteText 가 있으면 그것, 없으면 종전 문구
  const { ctx: c3, ops: o3 } = recCtx();
  createRenderer3(c3, null).draw({ state: 'run', now: 1, run, fx: makeFxLike({ eliteT: 0.5 }), hud: { distM: 0 }, buttons: [], saveOk: true });
  assert.ok(textsOf(o3).includes('정예 접근!'));
  const { ctx: c4, ops: o4 } = recCtx();
  createRenderer3(c4, null).draw({ state: 'run', now: 1, run, fx: makeFxLike({ eliteT: 0.5, eliteText: '정예 3체 접근!' }), hud: { distM: 0 }, buttons: [], saveOk: true });
  assert.ok(textsOf(o4).includes('정예 3체 접근!'));
  //  단수(S1): 종전 형식 '정예 hp / max' 와 '정예 전투!'
  const run1 = createRun(buildStage(1));
  for (let i = 0; i < 14400 && !run1.boss; i++) { stepRun(run1, at(240), STEP); drainEvents(run1); }
  const { ctx: c5, ops: o5 } = recCtx();
  createRenderer3(c5, null).draw({ state: 'run', now: 1, run: run1, fx: makeFxLike(), hud: { distM: 0 }, buttons: [], saveOk: true });
  const t5 = textsOf(o5);
  assert.ok(t5.includes('정예 전투!'));
  assert.ok(t5.some((t) => /^정예 \d+ \/ 120$/.test(t)), t5.filter((t) => t.startsWith('정예')).join('|'));
  assert.equal(t5.some((t) => t.includes('남은 목표')), false);
  //  전부 격파 뒤: 막대 없음·'작전 완료'
  for (const b of run.bosses) { b.hp = 0; b.dead = true; }
  stepRun(run, at(240), STEP); drainEvents(run);
  const { ctx: c6, ops: o6 } = recCtx();
  createRenderer3(c6, null).draw({ state: 'run', now: 1, run, fx: makeFxLike(), hud: { distM: 0 }, buttons: [], saveOk: true });
  assert.ok(textsOf(o6).includes('작전 완료'));
  assert.equal(barsOf(o6), 0, '격파 뒤 막대 없음');
});

// ─────────────────────────────────────────────────────────────────────────────
//  셸 하네스(rush3-bonus 의 bootFake 최소판)
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
async function bootFake() {
  const queue = [];
  let nowMs = 1000;
  const texts = [];
  const save = createSave3(fakeStorage());
  const audio = fakeAudio();
  const app = boot(fakeCanvas(texts), { win: null, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save, audio, sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  const frames = (n) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  return { app, frames, save, texts, audio };
}
function shellDrive(h, cond, max = 9000) {
  let n = 0;
  while (!cond() && n < max) { h.app.input.state.pointerX = pickX('planBoss', h.app.getRun()); h.frames(1); n++; }
  return n;
}

test('V3-MULTIELITE ME-9: 셸 — 2체 등장 프레임에 elite 효과음·보스 BGM 각 1회·배너 "정예 2체 접근!", 첫 처치에 kill 음·배너 "정예 N 격파 — 남은 목표 1", 마지막에 win, 결과·저장(version 2)', async () => {
  const h = await bootFake();
  h.app.setDifficulty('normal');
  h.app.startRun(9);
  const run = () => h.app.getRun();
  const dbg = () => h.app.dbg();
  assert.deepEqual(dbg().bosses, []); assert.equal(dbg().bossesLeft, 0);
  h.frames(1);
  h.audio.played.length = 0; h.audio.bgm.length = 0;
  shellDrive(h, () => !!run().boss);
  //  등장 프레임: elite 효과음 1·BGM 1(2체가 같은 프레임에 나와도)
  assert.equal(h.audio.played.filter((n) => n === 'elite').length, 1, '등장 효과음 1회: ' + h.audio.played.join(','));
  assert.equal(h.audio.bgm.length, 1, '보스 BGM 1회: ' + h.audio.bgm.join(','));
  assert.equal(h.app.getFx().eliteText, '정예 2체 접근!');
  h.texts.length = 0; h.frames(1);
  assert.ok(h.texts.includes('정예 2체 접근!'), h.texts.filter((t) => t.startsWith('정예')).join('|'));
  assert.ok(h.texts.includes('정예 전투! 남은 목표 2/2'));
  const d = dbg();
  assert.equal(d.bossesLeft, 2); assert.deepEqual(d.bosses.map((b) => [b.id, b.role, b.dead]), [['b1', 'gunner', false], ['b2', 'summoner', false]]);
  assert.equal(typeof d.bossX, 'number');
  //  첫 처치: kill 음(승리음 아님) + 처치 배너
  h.audio.played.length = 0;
  shellDrive(h, () => dbg().bossesLeft === 1);
  assert.equal(dbg().bossesLeft, 1, '한 마리 격파');
  assert.ok(h.audio.played.includes('kill') && !h.audio.played.includes('win'), '첫 처치 효과음: ' + h.audio.played.filter((n) => n === 'kill' || n === 'win').join(','));
  assert.match(h.app.getFx().bossBannerText, /^정예 [12] 격파 — 남은 목표 1$/);
  assert.ok(h.app.getFx().bossBannerT > 0);
  h.texts.length = 0; h.frames(1);
  assert.ok(h.texts.some((t) => /^정예 [12] 격파 — 남은 목표 1$/.test(t)), h.texts.filter((t) => t.startsWith('정예')).join('|'));
  assert.ok(h.texts.includes('정예 전투! 남은 목표 1/2'));
  assert.ok(h.texts.includes('격파'), 'HUD 격파 칸');
  assert.equal(run().won, false);
  //  마지막 처치: win 음 → 결과 → 저장 칸은 version 2
  h.audio.played.length = 0;
  shellDrive(h, () => dbg().bossesLeft === 0);
  assert.ok(h.audio.played.includes('win'), '승리음: ' + h.audio.played.join(','));
  assert.equal(run().won, true);
  shellDrive(h, () => h.app.getState() === 'result', 600);
  assert.equal(h.app.getState(), 'result');
  const rec = h.save.getStage(9, 2);
  assert.equal(rec.cleared, true);
  assert.equal(h.save.getStage(9, 1).cleared, false, '단수 정예 시절 기록 칸은 따로');
});
