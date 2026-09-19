// rush3-armguard — 대항 검수 반영(r3.18, 2026-09-19) 두 규칙을 잠근다.
//  ① 통 피격 활성 구간 armZ: 차량·캡슐은 s.z − run.z <= 440(화면 y ≥ 200)에서만 탄이 먹히고, 그 전엔 흡수(supplyBlock reason 'arm')·내구 불변 = "보인 뒤에 열린다"
//  ② 아레나 보스 보호막 guard: 첫 착지 충격까지 피격 무효(탄 흡수 bossGuard·폭발/연쇄 무효), 첫 bossShock 과 같은 STEP 에 bossGuardOff = "최소 1회 예고·돌진·충격을 본다"
//  형식(AG-1·AG-4) · 흡수 규칙(AG-2·AG-5) · 봇 실측(AG-3·AG-6) · 결정성(AG-7) · 렌더·셸(AG-8)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { makeSupply, supplyArmed, hitSupply } from '../rush3/supply.js';
import { BAL3 } from '../rush3/balance.js';
import { createRenderer3 } from '../rush3/render.js';
import { playPolicy, pickInput, pickX } from './lib/rush3-policies.mjs';

const ARM = BAL3.supply.armZ;
const at = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
const ARMED_IDS = { 6: ['c1', 'c2', 'c4'], 7: ['c2'], 12: ['c4'] };
const ARENA_IDS = [10, 11, 24];

//  합성 아레나(rush3-arena 의 synthArena 와 같은 꼴, guard 만 켠다)
function synthArena(o = {}) {
  const B = BAL3.arena.boss;
  const z = o.z ?? 600;
  const boss = { ...B, guard: o.guard ?? true, dash: { ...B.dash, ...(o.dash ?? {}) }, shock: { ...B.shock, ...(o.shock ?? {}) }, summon: null, shoot: null };
  const elites = [{ z, hp: o.hp ?? 500, summon: false }];
  return { id: 'tg', version: 1, title: 'guard', startUnits: o.startUnits ?? 40, startWeapon: o.startWeapon ?? 'rifle', length: z + 400, eliteZ: z,
           gateRows: [], supplies: [], walls: [], spawns: [], elites, elite: elites[0], arena: { z, w: [...BAL3.arena.w], depth: [...BAL3.arena.depth], boss } };
}
function drive(run, cond, input = at(240), max = 6000) {
  const events = [];
  let n = 0;
  while (!cond(run, events) && !run.over && n < max) { stepRun(run, typeof input === 'function' ? input(run) : input, STEP); events.push(...drainEvents(run)); n++; }
  return events;
}
const count = (ev, type) => ev.filter((e) => e.type === type).length;

// ─────────────────────────────────────────────────────────────────────────────
test('V3-ARMGUARD AG-1: 형식 — armZ 는 6(c1·c2·c4)·7(c2)·12(c4)만 440(= BAL3.supply.armZ), 나머지 통 전부 null, makeSupply 가 복사, supplyArmed 규칙, 내구 40/40/48·80·128', () => {
  assert.equal(ARM, 440);
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id);
    const want = ARMED_IDS[id] ?? [];
    for (const s of st.supplies) {
      if (want.includes(s.id)) assert.equal(s.armZ, ARM, `S${id} ${s.id} armZ`);
      else assert.equal(s.armZ, null, `S${id} ${s.id} 는 armZ 없음`);
    }
    assert.deepEqual(buildStage(id).supplies.map((s) => s.armZ), st.supplies.map((s) => s.armZ), `S${id} 결정성`);
  }
  const s6 = buildStage(6).supplies;
  assert.deepEqual(['c1', 'c2', 'c4'].map((id) => s6.find((s) => s.id === id).durability), [40, 40, 48]);
  assert.equal(buildStage(7).supplies[1].durability, 80);
  assert.equal(buildStage(12).supplies.find((s) => s.id === 'c4').durability, 128);
  //  makeSupply: def.armZ 복사, 없으면 null. run 이 없으면 활성으로 본다(옛 합성 호출 보호)
  const a = makeSupply({ id: 'a', z: 1000, x: 200, kind: 'soldier', durability: 5, payload: { n: 1 }, armZ: 300 });
  const b = makeSupply({ id: 'b', z: 1000, x: 200, kind: 'soldier', durability: 5, payload: { n: 1 } });
  assert.equal(a.armZ, 300); assert.equal(b.armZ, null);
  assert.equal(supplyArmed(a, { z: 699 }), false); assert.equal(supplyArmed(a, { z: 700 }), true); assert.equal(supplyArmed(a, { z: 900 }), true);
  assert.equal(supplyArmed(b, { z: 0 }), true); assert.equal(supplyArmed(a, null), true);
  //  createRun 의 통도 같은 값
  const run = createRun(buildStage(7));
  assert.equal(run.supplies[1].armZ, ARM); assert.equal(run.supplies[0].armZ, null);
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-ARMGUARD AG-2: 흡수 규칙 — 활성 전 탄은 dead·supplyBlock{reason arm}·내구 불변·보상 없음, 활성 뒤 같은 탄은 supplyHit, 차폐가 함께 걸리면 reason cover, 지나침 판정(missed)은 활성과 무관', () => {
  const s = makeSupply({ id: 'v', z: 1000, x: 200, kind: 'soldier', durability: 3, payload: { n: 2 }, armZ: 440 });
  const run = { z: 500, prevZ: 496, x: 200, units: [], nextUnitId: 1, pendingRewards: [], supplies: [s], walls: [], wallSide: {} };
  const bullet = () => ({ x: 200, z: 1010, pz: 990, dmg: 1, gateHit: 1, dead: false });
  let ev = [];
  for (let i = 0; i < 20; i++) { const b = bullet(); assert.equal(hitSupply(s, b, ev, run), true); assert.equal(b.dead, true); }
  assert.equal(count(ev, 'supplyBlock'), 20); assert.ok(ev.every((e) => e.type === 'supplyBlock' && e.reason === 'arm' && e.id === 'v'));
  assert.equal(s.durability, 3); assert.equal(s.opened, false); assert.equal(run.pendingRewards.length, 0);
  //  경계: dz == armZ 는 활성
  run.z = 560; ev = [];
  hitSupply(s, bullet(), ev, run);
  assert.deepEqual(ev.map((e) => e.type), ['supplyHit']); assert.equal(s.durability, 2);
  hitSupply(s, bullet(), ev, run); hitSupply(s, bullet(), ev, run);
  assert.equal(s.opened, true); assert.equal(run.pendingRewards.length, 1);
  //  차폐 + 활성 전: reason 은 cover(차폐 판정이 먼저)
  const c = makeSupply({ id: 'c', z: 1000, x: 200, kind: 'soldier', durability: 3, payload: { n: 2 }, armZ: 440, coverZ: 900 });
  const run2 = { ...run, z: 500, supplies: [c], pendingRewards: [] };
  ev = []; hitSupply(c, bullet(), ev, run2);
  assert.deepEqual(ev, [{ type: 'supplyBlock', id: 'c', x: 200, z: 1000, reason: 'cover' }]);
  //  차폐 걷힘·활성 전: arm
  run2.z = 500; c.coverZ = 400; ev = []; hitSupply(c, bullet(), ev, run2);
  assert.equal(ev[0].reason, 'arm');
  //  옛 차폐 흡수 이벤트에도 reason cover 가 붙는다(개수·id 는 종전 그대로 — V3-SUPPLY-COVER 가 센다)
  const d = makeSupply({ id: 'd', z: 1000, x: 200, kind: 'soldier', durability: 3, payload: { n: 2 }, coverZ: 900 });
  ev = []; hitSupply(d, bullet(), ev, { ...run, z: 500, supplies: [d], pendingRewards: [] });
  assert.equal(ev[0].reason, 'cover');
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-ARMGUARD AG-3: 보인 뒤에 열린다(봇 실측) — S6·S7·S12 의 armZ 통은 어떤 정책으로도 dz ≤ 440(y ≥ 200)에서만 열리고, 활성 전엔 supplyHit 이 0. 무입력·추종은 S6 을 못 열고 lead 만 연다', (t) => {
  const cases = [[6, ['center', 'sway', 'lead'], 'normal'], [6, ['lead'], 'brutal'], [7, ['left', 'aim'], 'normal'], [12, ['center', 'lead'], 'normal'], [12, ['center'], 'brutal']];
  for (const [id, pols, diff] of cases) for (const pol of pols) {
    const want = ARMED_IDS[id];
    const run = createRun(buildStage(id, { difficulty: diff }));
    const opened = {};
    let hitBefore = 0, blocks = 0;
    for (let i = 0; i < 14400 && !run.over; i++) {
      stepRun(run, pickInput(pol, run), STEP);
      for (const e of drainEvents(run)) {
        if (!want.includes(e.id)) continue;
        const s = run.supplies.find((x) => x.id === e.id);
        const dz = s.z - run.z;
        if (e.type === 'supplyHit' && dz > ARM) hitBefore++;
        if (e.type === 'supplyBlock') { assert.equal(e.reason, 'arm', `S${id} ${pol} ${e.id}`); assert.ok(dz > ARM); blocks++; }
        if (e.type === 'supplyOpen') opened[e.id] = dz;
      }
    }
    assert.equal(hitBefore, 0, `S${id} ${pol} 활성 전 피격`);
    for (const [cid, dz] of Object.entries(opened)) assert.ok(dz <= ARM && dz >= 0, `S${id} ${pol} ${cid} 개봉 dz ${dz}`);
    if (id === 6 && pol === 'lead') for (const cid of want) assert.ok(opened[cid] != null, `S6 lead(${diff}) ${cid} 개봉`);
    if (id === 6 && pol !== 'lead') for (const cid of want) assert.equal(opened[cid], undefined, `S6 ${pol} 가 ${cid} 를 열면 안 된다`);
    if (id === 7 || id === 12) for (const cid of want) assert.ok(opened[cid] != null, `S${id} ${pol} ${cid} 개봉`);
    t.diagnostic(`ARMGUARD S${id} ${pol}(${diff}) blocks=${blocks} open=${Object.entries(opened).map(([k, v]) => k + '@dz' + Math.round(v)).join(' ') || '없음'} units=${run.units.length}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-ARMGUARD AG-4: 보호막 형식 — BAL3.arena.boss.guard true, buildStage 10·11·24 의 arena.boss.guard 가 병합·복사되고 정의로 끌 수 있다, 진입 STEP 의 보스 guard true, 도로 정예엔 guard 없음, hp 2400·2600·4200', () => {
  assert.equal(BAL3.arena.boss.guard, true);
  for (const id of ARENA_IDS) {
    const st = buildStage(id);
    assert.equal(st.arena.boss.guard, true, `S${id}`);
    const run = createRun(st);
    drive(run, (r) => r.phase === 'arena');
    assert.equal(run.phase, 'arena'); assert.equal(run.boss.guard, true, `S${id} 진입 보스 보호막`);
  }
  assert.deepEqual(ARENA_IDS.map((id) => buildStage(id).elite.hp), [2400, 2600, 4200]);
  //  합성 정의로 끈다(A-7·A-8 기계 검사 경로)
  const off = createRun(synthArena({ guard: false }));
  drive(off, (r) => r.phase === 'arena');
  assert.equal(off.boss.guard, false);
  //  도로 정예(S9 2체·S1 단수)에는 guard 칸이 없다
  const r9 = createRun(buildStage(9));
  drive(r9, (r) => r.bosses.length > 0);
  assert.ok(r9.bosses.every((b) => b.guard === undefined));
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-ARMGUARD AG-5: 보호막 흡수 — 첫 충격 전 탄은 bossGuard 로 흡수(enemyHit 0·hp 불변·관통탄도), 중화기 폭발·전격포 연쇄도 무효, 첫 bossShock 과 같은 STEP 에 bossGuardOff 1회, 그 뒤 enemyHit 로 hp 가 준다', () => {
  for (const weapon of ['rifle', 'heavy', 'sniper', 'arc']) {
    const run = createRun(synthArena({ startUnits: 30, startWeapon: weapon, hp: 100000 }));
    drive(run, (r) => r.phase === 'arena');
    const hp0 = run.boss.hp;
    //  첫 충격까지: 흡수만
    const pre = drive(run, (r, ev) => ev.some((e) => e.type === 'bossShock'), at(240));
    assert.ok(count(pre, 'bossGuard') > 20, weapon + ' 흡수 ' + count(pre, 'bossGuard'));
    assert.equal(pre.filter((e) => e.type === 'enemyHit' && e.kind === 'elite').length, 0, weapon + ' 충격 전 명중 0');
    assert.equal(count(pre, 'bossShock'), 1); assert.equal(count(pre, 'bossGuardOff'), 1);
    const iShock = pre.findIndex((e) => e.type === 'bossShock'), iOff = pre.findIndex((e) => e.type === 'bossGuardOff');
    assert.equal(iOff, iShock + 1, '충격 직후 해제');
    assert.deepEqual(pre[iOff], { type: 'bossGuardOff', id: 'b1', x: pre[iOff].x, z: pre[iOff].z });
    assert.equal(run.boss.guard, false);
    assert.equal(run.boss.hp, hp0, weapon + ' hp 불변');
    //  해제 뒤: 명중·hp 감소, 흡수 없음
    const post = drive(run, (r, ev) => ev.some((e) => e.type === 'enemyHit' && e.kind === 'elite'), at(240), 120);
    assert.ok(post.some((e) => e.type === 'enemyHit' && e.kind === 'elite'), weapon + ' 해제 뒤 명중');
    assert.equal(count(post, 'bossGuard'), 0);
    assert.ok(run.boss.hp < hp0);
  }
  //  관통탄이 보호막에 흡수되면 죽는다(계속 날아가지 않는다)
  const sn = createRun(synthArena({ startUnits: 10, startWeapon: 'sniper', hp: 1e9 }));
  drive(sn, (r) => r.phase === 'arena');
  drive(sn, (r, ev) => ev.some((e) => e.type === 'bossGuard'), at(240));
  assert.ok(sn.bullets.every((b) => !b.hit || b.hit.length === 0), '보호막에 닿은 관통탄은 hit 기록 없이 소멸');
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-ARMGUARD AG-6: 최소 1회 돌진 보장(봇 실측) — 10·11·24 × 보통/어려움/지옥 × center/planBoss 에서 첫 bossShock 이 bossKill 보다 먼저(또는 보스가 죽지 않고 패배), planBoss 보통은 전부 승리', (t) => {
  for (const id of ARENA_IDS) for (const diff of ['normal', 'hard', 'brutal']) for (const pol of ['center', 'planBoss']) {
    const run = createRun(buildStage(id, { difficulty: diff }));
    let t0 = null, shock = null, kill = null, guardOff = null;
    for (let i = 0; i < 14400 && !run.over; i++) {
      stepRun(run, pickInput(pol, run), STEP);
      for (const e of drainEvents(run)) {
        if (e.type === 'arenaEnter') t0 = run.time;
        if (e.type === 'bossShock' && shock === null) shock = run.time;
        if (e.type === 'bossGuardOff') guardOff = run.time;
        if (e.type === 'bossKill') kill = run.time;
      }
    }
    assert.ok(t0 !== null, `S${id} ${diff} ${pol} 광장 진입`);
    if (kill !== null) { assert.ok(shock !== null && shock <= kill, `S${id} ${diff} ${pol} 첫 충격(${shock})이 격파(${kill})보다 먼저`); assert.equal(guardOff, shock); }
    if (pol === 'planBoss' && diff === 'normal') assert.equal(run.won, true, `S${id} planBoss 보통 승리`);
    t.diagnostic(`ARMGUARD S${id} ${diff} ${pol} won=${run.won} units=${run.units.length} firstShock=${shock == null ? '-' : (shock - t0).toFixed(1)} kill=${kill == null ? '-' : (kill - t0).toFixed(1)}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-ARMGUARD AG-7: 결정성 — S6(lead)·S7(x120)·S10(planBoss) 두 판이 이벤트 열·상태까지 같다, 규칙 모듈은 난수·시계 없음', () => {
  const trace = (id, pol) => {
    const run = createRun(buildStage(id));
    const ev = [];
    for (let i = 0; i < 14400 && !run.over; i++) { stepRun(run, pickInput(pol, run), STEP); for (const e of drainEvents(run)) ev.push(e.type + ':' + (e.id ?? '') + ':' + (e.reason ?? '')); }
    return { ev, z: run.z, units: run.units.length, won: run.won, boss: run.boss ? { hp: run.boss.hp, guard: run.boss.guard } : null, supplies: run.supplies.map((s) => [s.id, s.durability, s.opened, s.armZ]) };
  };
  for (const [id, pol] of [[6, 'lead'], [7, 'left'], [10, 'planBoss']]) assert.deepEqual(trace(id, pol), trace(id, pol), `S${id} ${pol}`);
});

// ─────────────────────────────────────────────────────────────────────────────
function recCtx() {
  const ops = [];
  const grad = { addColorStop() {} };
  const state = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', canvas: null };
  const stack = [];
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'save') stack.push({ ...t });
        if (k === 'restore') { const s = stack.pop(); if (s) Object.assign(t, s); }
        ops.push({ op: k, args, alpha: t.globalAlpha, fill: t.fillStyle, stroke: t.strokeStyle });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
const fxLike = () => ({ parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0,
                        shutterT: 0, shutterText: null, lotOpen: 0, lotSeen: false, lotSame: false, shocks: [] });
function drawRun(run) {
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true });
  return ops;
}
test('V3-ARMGUARD AG-8: 렌더 — 보호막 중 보스에 하늘색 점선 링(r+16, dash [10,7])과 "보호막" 글자, 해제 뒤엔 없음. 활성 전 통엔 점선 링(dash [4,4])·자물쇠·회색 내구, 활성 뒤엔 주황', () => {
  const run = createRun(buildStage(10));
  drive(run, (r) => r.phase === 'arena', (r) => at(pickX('planBoss', r)));
  const bo = run.boss;
  const ops = drawRun(run);
  const texts = ops.filter((o) => o.op === 'fillText').map((o) => o.args[0]);
  assert.ok(texts.includes('보호막'), '보호막 글자');
  assert.ok(ops.some((o) => o.op === 'arc' && Math.abs(o.args[2] - (bo.r + 16)) < 1e-9 && o.stroke === BAL3.colors.gatePos), '점선 링 r+16');
  assert.ok(ops.some((o) => o.op === 'setLineDash' && Array.isArray(o.args[0]) && o.args[0][0] === 10 && o.args[0][1] === 7), 'dash [10,7]');
  drive(run, (r, ev) => ev.some((e) => e.type === 'bossGuardOff'), (r) => pickInput('planBoss', r));
  assert.equal(bo.guard, false);
  const ops2 = drawRun(run);
  assert.equal(ops2.filter((o) => o.op === 'fillText').map((o) => o.args[0]).includes('보호막'), false, '해제 뒤 글자 없음');
  assert.equal(ops2.some((o) => o.op === 'arc' && Math.abs(o.args[2] - (bo.r + 16)) < 1e-9 && o.stroke === BAL3.colors.gatePos), false);
  //  통: S7 캡슐 활성 전/후
  const r7 = createRun(buildStage(7));
  drive(r7, (r) => 4800 - r.z <= 700, at(120));
  const c2 = r7.supplies[1];
  assert.equal(c2.z - r7.z > ARM, true);
  const o1 = drawRun(r7);
  assert.ok(o1.some((o) => o.op === 'setLineDash' && Array.isArray(o.args[0]) && o.args[0][0] === 4 && o.args[0][1] === 4), '활성 전 점선 링');
  assert.ok(o1.some((o) => o.op === 'arc' && o.args[2] === 5 && o.args[3] === Math.PI && o.args[4] === 0), '자물쇠(고리 arc — roundRect 는 로컬 헬퍼라 ops 에 없다)');
  assert.ok(o1.some((o) => o.op === 'fillText' && o.args[0] === '80' && o.fill === BAL3.colors.gateZero), '회색 내구');
  drive(r7, (r) => c2.z - r.z <= ARM, at(120));
  const o2 = drawRun(r7);
  assert.equal(o2.some((o) => o.op === 'setLineDash' && Array.isArray(o.args[0]) && o.args[0][0] === 4 && o.args[0][1] === 4), false);
  assert.ok(o2.some((o) => o.op === 'fillText' && o.args[0] === String(Math.ceil(c2.durability)) && o.fill === BAL3.colors.bulletHeavy), '활성 뒤 주황');
});
