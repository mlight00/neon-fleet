// rush3-hero — r4.4(v4 ④단계) 메인 로봇 표시·보호 규칙. 이사님 결정(기획 v4.1 0장 인용 블록):
//  D4′-a = (나) 원안 "메인 로봇은 음수 게이트·랜덤 길 함정으로 절대 빠지지 않습니다. 병력보다 큰 감소를 지나도 로봇 1명이 남습니다(원본 검사안 HERO-2 그대로)"
//  D4′-b = (가) 적 피해 이전 채택 "hp > 0 호위가 1명 이상 있는 동안, 로봇이 맞은 적 피해는 가장 가까운 hp > 0 호위 1명에게 한 번만 넘어갑니다"
//  묶음: HERO-0(표시) · HERO-1(게이트: 병사 먼저) · HERO-2(병력보다 큰 감소·함정 −10·1번 판 −9 칸) · HERO-3(피해 이전) · HERO-4(착지 충격 손실 수 불변) ·
//   HERO-5(heroGuard 꺼짐 = 종전 동작) · V4-REAL(셸 실제 설정 brutal + heroGuard + 강화 0 으로 1~24 × 봇 3종 결과를 기준값 파일로 잠금).
//  ⚠️봇 결과는 정해진 입력으로 한 판씩 돌린 값이다(사람의 성공률이 아니다).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRun, stepRun, drainEvents, STEP, guardEscort } from '../rush3/combat.js';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { makeGateRow, passGateRow } from '../rush3/gates.js';
import { addUnits } from '../rush3/squad.js';
import { createRenderer3, HERO_RING_COLOR } from '../rush3/render.js';
import { hashSeed } from '../rush/rng.js';
import { playPolicy } from './lib/rush3-policies.mjs';
import { V4_BOTS, V4_FIXTURE, v4RealRun } from './lib/rush3-v4real.mjs';

const NONE = { pointerX: null, dragDx: 0, keyDir: 0 };
const at = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0 });
const holdFire = (run) => { for (const u of run.units) u.fireT = 1e9; };
const ids = (run) => run.units.map((u) => u.id);
const heroes = (run) => run.units.filter((u) => u.hero);

//  최소 도로 스테이지(buildStage 정규화 꼴 — createRun 이 읽는 칸만). 적·게이트·통 없음, 끝없는 길
function road(startUnits) {
  return { id: 'th', version: 1, title: 'hero', startUnits, startWeapon: 'rifle', length: 1e6, eliteZ: null,
           gateRows: [], supplies: [], walls: [], spawns: [], elites: [], elite: null, arena: null };
}
//  한 STEP 에 적탄을 부대 중심(= 로봇 자리)으로 떨어뜨린다. z 는 이번 STEP 의 전진(scroll × STEP)을 넘도록 넉넉히
function shotAtCenter(run, dmg) {
  const z = run.z + 12;
  return { x: run.x, z, px: run.x, pz: z, vx: 0, vz: 1200, dmg, r: 5, dead: false };
}
function stepOnce(run, input = NONE) { stepRun(run, input, STEP); return drainEvents(run); }

// ─────────────────────────────── HERO-0 표시 ───────────────────────────────

test('HERO-0: createRun 이 첫 유닛에 hero 표시(희소 — 병사엔 키가 없다), 증원·재배치 뒤에도 hero 는 배열 0번 = 부대 중심(0,0) · 표시는 heroGuard 와 무관', () => {
  for (const heroGuard of [false, true]) {
    const run = createRun(road(5), { heroGuard });
    assert.equal(run.heroGuard, heroGuard);
    assert.deepEqual(heroes(run).map((u) => u.id), [1], '로봇 = 첫 유닛(id 1) 하나');
    assert.ok(run.units.slice(1).every((u) => !('hero' in u)), '병사에는 hero 키가 없다');
    addUnits(run, 40);
    assert.equal(run.units[0].hero, true);
    assert.deepEqual([run.units[0].dx, run.units[0].dy], [0, 0], '로봇은 늘 부대 중심 자리');
    stepOnce(run, at(120));
    assert.equal(run.units[0].hero, true);
    assert.deepEqual([run.units[0].dx, run.units[0].dy], [0, 0], '조향·압축(재배치) 뒤에도 중심');
  }
  //  보호막 표시: heroGuard 이고 hp > 0 호위가 있으면 켜진 채 시작, 1명 판은 꺼진 채 시작, 끈 판은 늘 false
  assert.equal(createRun(road(3), { heroGuard: true }).heroShield, true);
  assert.equal(createRun(road(1), { heroGuard: true }).heroShield, false);
  assert.equal(createRun(road(3)).heroShield, false);
  assert.equal(createRun(buildStage(1, { difficulty: 'brutal' }), { heroGuard: true }).units[0].hero, true, '실제 판도 같다');
});

// ─────────────────────────────── HERO-1 게이트: 병사 먼저 ───────────────────────────────

//  병력 N 판(로봇 포함)에 값 −k 칸 하나짜리 행을 한 번 통과시킨다(규칙 passGateRow 그대로)
function gateOnce(N, k, heroGuard) {
  const run = createRun(road(N), { heroGuard });
  const before = run.units.map((u, i) => ({ id: u.id, dy: u.dy, i, hero: !!u.hero }));
  const row = makeGateRow({ id: 'g', z: 5, armZ: null, cells: [{ x0: 0, x1: 480, value: -k }] });
  run.prevZ = 0; run.z = 5;
  const ev = [];
  passGateRow(row, run, ev);
  return { run, before, pass: ev.find((e) => e.type === 'gatePass') };
}

test('HERO-1: heroGuard 면 음수 게이트는 로봇을 빼지 않고 병사만 종전 순서(dy 큰 순, 같으면 나중 유닛)로 뺀다 — 병력 1~40 × 감소 여러 값', () => {
  for (let N = 1; N <= 40; N++) {
    for (const k of new Set([1, 2, 3, Math.max(1, N >> 1), Math.max(1, N - 1), N, N + 5])) {
      const { run, before, pass } = gateOnce(N, k, true);
      const soldiers = before.filter((e) => !e.hero).sort((a, b) => b.dy - a.dy || b.i - a.i);
      const drop = new Set(soldiers.slice(0, Math.min(soldiers.length, k)).map((e) => e.id));
      const want = before.filter((e) => !drop.has(e.id)).map((e) => e.id);
      assert.deepEqual(ids(run), want, `N${N} −${k}: 남는 유닛 = 로봇 + 뒤에서 뺀 나머지 병사`);
      assert.equal(run.units[0].hero, true, `N${N} −${k}: 로봇이 남아 배열 0번`);
      assert.equal(pass.applied, drop.size ? -drop.size : 0, 'applied = −실제로 뺀 병사 수(0 이면 0 — −0 이 아니다)');
      assert.equal(run.lossByGate, drop.size);
      assert.equal(run.badGatesPassed, 1);
    }
  }
  //  B_gate-removal 의 대표 칸: 5명 −3 은 종전과 같고, 5명 −4 는 종전(로봇이 빠지고 id2 가 남음)과 달리 로봇이 남는다
  assert.deepEqual(ids(gateOnce(5, 3, true).run), [1, 2]);
  assert.deepEqual(ids(gateOnce(5, 3, false).run), [1, 2]);
  assert.deepEqual(ids(gateOnce(5, 4, true).run), [1]);
  assert.deepEqual(ids(gateOnce(5, 4, false).run), [2], '끈 판(종전): 로봇(dy 0)이 앞줄 병사(dy −10)보다 먼저 빠진다');
  assert.deepEqual(ids(gateOnce(6, 5, false).run), [2]);
  assert.deepEqual(ids(gateOnce(6, 5, true).run), [1], '20번 판 첫 행 −5 칸 · 시작 6명(B_summary)');
});

// ─────────────────────────────── HERO-2 병력보다 큰 감소 ───────────────────────────────

test('HERO-2: 병력보다 큰 음수 게이트·랜덤 길 함정 −10 을 지나도 로봇 1명이 남는다(원안) — 끈 판은 종전대로 전멸 = 패배', () => {
  //  ① 합성 행: 감소량 ≥ 병력
  for (const [N, k] of [[1, 1], [1, 9], [5, 5], [5, 6], [10, 10], [3, 50]]) {
    const on = gateOnce(N, k, true), off = gateOnce(N, k, false);
    assert.deepEqual(ids(on.run), [1], `N${N} −${k}: 로봇 1명`);
    assert.equal(on.pass.applied, N > 1 ? -(N - 1) : 0);
    assert.equal(off.run.units.length, 0, `N${N} −${k}: 끈 판은 전멸`);
  }
  //  ② 실제 랜덤 길 함정(3번 판 기본 줄, 추첨 = −10 확정 게이트): 병력 1~14 로 stepRun 경로를 그대로 지나간다
  const seed = hashSeed('lot:3:0');
  for (const N of [1, 5, 8, 10, 11, 14]) {
    const res = {};
    for (const heroGuard of [true, false]) {
      const run = createRun(buildStage(3, { difficulty: 'brutal', lotterySeed: seed }), { heroGuard });
      assert.equal(run.lottery.pick, 'trapGate');
      const row = run.gateRows.find((r) => r.id === run.lottery.rowId);
      const cx = (row.cells[0].x0 + row.cells[0].x1) / 2;
      run.units.length = 1;
      addUnits(run, N - 1);
      run.spawnCursor = run.spawns.length; run.enemies.length = 0; run.eshots.length = 0;
      holdFire(run);
      run.z = row.z - 40; run.prevZ = run.z; run.x = run.tx = cx;
      let pass = null, n = 0;
      while (!pass && !run.over && n++ < 60) pass = stepOnce(run, at(cx)).find((e) => e.type === 'gatePass' && e.id === row.id) ?? null;
      assert.ok(pass, `N${N}: 함정 행을 지났다`);
      assert.equal(pass.value, -10);
      res[heroGuard] = { units: run.units.length, hero: heroes(run).length, over: run.over, won: run.won };
    }
    assert.deepEqual(res[true], { units: Math.max(1, N - 10), hero: 1, over: false, won: false }, `N${N} heroGuard: 로봇이 남는다`);
    assert.equal(res[false].units, Math.max(0, N - 10), `N${N} 끈 판: 제거 수 = min(병력, 10)`);
    if (N <= 10) assert.equal(res[false].over, true, `N${N} 끈 판: 전멸 = 패배`);
    if (N >= 11 && N <= 14) assert.equal(res[false].hero, 0, `N${N} 끈 판: 로봇이 빠지고 병사가 남는다(종전 동작)`);
  }
  //  ③ 1번 판(기본 줄) 1명 부대가 x 160 에 머물러 −9 칸(g2)을 지난다: 끈 판 = 16.02초 패배(B_gate-removal stage1Left), heroGuard = 로봇이 살아 계속 간다
  const pass1 = {};
  for (const heroGuard of [true, false]) {
    const run = createRun(buildStage(1, { difficulty: 'brutal' }), { heroGuard });
    let pass = null, n = 0;
    while (!pass && !run.over && n++ < 3000) pass = stepOnce(run, at(160)).find((e) => e.type === 'gatePass' && e.id === 'g2') ?? null;
    assert.ok(pass, 'g2 를 지났다');
    assert.ok(pass.value < 0, '칸 값이 음수인 채 통과');
    pass1[heroGuard] = { t: Math.round(run.time * 100) / 100, units: run.units.length, hero: heroes(run).length, over: run.over, applied: pass.applied, lossByGate: run.lossByGate };
  }
  assert.deepEqual(pass1[false], { t: 16.02, units: 0, hero: 0, over: true, applied: -1, lossByGate: 1 }, '끈 판(종전): −9 칸에서 전멸');
  assert.deepEqual(pass1[true], { t: 16.02, units: 1, hero: 1, over: false, applied: 0, lossByGate: 0 }, 'heroGuard: 로봇 혼자 −9 칸을 지나도 산다');
});

// ─────────────────────────────── HERO-3 적 피해 이전 ───────────────────────────────

test('HERO-3: guardEscort — 로봇과 가장 가까운 hp > 0 호위 1명(거리 같으면 번호 큰 쪽), 로봇·hp ≤ 0·skip 은 빠지고 없으면 null', () => {
  const H = { id: 1, dx: 0, dy: 0, hp: 2, hero: true };
  const u = (id, dx, dy, hp = 2) => ({ id, dx, dy, hp });
  assert.equal(guardEscort([H, u(2, 30, 0), u(3, 0, 20), u(4, 40, 40)], H).id, 3, '가장 가까운 호위');
  assert.equal(guardEscort([H, u(2, 24, -10), u(5, -10, 24), u(3, 24, 10)], H).id, 5, '거리 같음(676) → 번호 큰 쪽');
  assert.equal(guardEscort([H, u(2, 5, 0, 0), u(3, 9, 0, -1), u(4, 20, 0)], H).id, 4, 'hp ≤ 0(같은 STEP 에 쓰러져 아직 정리 전)은 후보 밖');
  const a = u(2, 5, 0), b = u(3, 50, 0);
  assert.equal(guardEscort([H, a, b], H, new Set([a])).id, 3, 'skip(착지 충격 원 안) 제외');
  assert.equal(guardEscort([H], H), null);
  assert.equal(guardEscort([H, u(2, 1, 1, 0)], H), null, '살아 있는 호위가 없으면 null');
});

test('HERO-3: 한 STEP 적탄 2발이 로봇에 맞으면 발마다 가장 가까운 hp > 0 호위 1명에게 한 번씩 넘어간다(재이전 없음·원인 = 적탄) — 끈 판은 로봇이 맞는다', () => {
  //  병력 10: 1링 = id 2~7(모두 거리 26 — 반올림 오프셋 24²+10² = 676), 2링 = id 8~10(거리 45). 가장 가까운 쪽 중 번호 큰 순 → 7, 6
  const run = createRun(road(10), { heroGuard: true, difficulty: 'brutal' });
  holdFire(run);
  run.eshots.push(shotAtCenter(run, 3), shotAtCenter(run, 3));
  const ev = stepOnce(run);
  const tr = ev.filter((e) => e.type === 'heroGuard');
  assert.deepEqual(tr.map((e) => [e.heroId, e.unitId, e.cause]), [[1, 7, 'shot'], [1, 6, 'shot']], '1링(가장 가까움)·번호 큰 순, 발마다 1명');
  const hurts = ev.filter((e) => e.type === 'hurt');
  assert.deepEqual(hurts.map((e) => [e.unitId, e.n, e.cause]), [[7, 3, 'shot'], [6, 3, 'shot']], '피해는 호위가 받고 다시 넘어가지 않는다');
  assert.ok(tr.every((e) => Number.isFinite(e.x) && Number.isFinite(e.z) && Number.isFinite(e.tx) && Number.isFinite(e.tz)), '빛줄기 연출 좌표(로봇 → 호위)');
  assert.equal(run.units[0].hero, true); assert.equal(run.units[0].hp, 2, '로봇 hp 그대로');
  assert.deepEqual(ids(run), [1, 2, 3, 4, 5, 8, 9, 10], '쓰러진 호위 둘이 정리됐다');
  assert.equal(run.lossByShot, 2, '손실 원인 = 원래 피해원(적탄)');
  assert.equal(run.heroShield, true);
  //  hp 가 남는 피해(배수 1 줄 적탄 1)면 같은 호위가 두 번 받는다(첫 발 뒤에도 hp > 0 이라 여전히 가장 가까운 후보)
  const soft = createRun(road(10), { heroGuard: true });
  holdFire(soft);
  soft.eshots.push(shotAtCenter(soft, 1), shotAtCenter(soft, 1));
  assert.deepEqual(stepOnce(soft).filter((e) => e.type === 'heroGuard').map((e) => e.unitId), [7, 7]);
  assert.equal(soft.units.length, 9, 'id 7 이 2 → 0');
  //  로봇이 아닌 유닛이 맞은 피해는 넘기지 않는다(원래 대상 그대로 — 옆줄 x + 24 로 떨어지는 탄)
  const side = createRun(road(10), { heroGuard: true, difficulty: 'brutal' });
  holdFire(side);
  const s = shotAtCenter(side, 3); s.x = s.px = side.x + 24;
  side.eshots.push(s);
  const ev3 = stepOnce(side);
  assert.equal(ev3.filter((e) => e.type === 'heroGuard').length, 0);
  const sh = ev3.filter((e) => e.type === 'hurt');
  assert.equal(sh.length, 1); assert.notEqual(sh[0].unitId, 1, '맞은 병사가 그대로 받는다');
  assert.equal(side.units[0].hero, true);
  //  끈 판(종전): 같은 두 발에 로봇이 맞아 쓰러지고 정리된다 — 로봇 그림은 병사에게 넘어가지 않는다(hero 표시가 사라짐)
  const off = createRun(road(10), { difficulty: 'brutal' });
  holdFire(off);
  off.eshots.push(shotAtCenter(off, 3), shotAtCenter(off, 3));
  const evOff = stepOnce(off);
  assert.equal(evOff.filter((e) => e.type === 'heroGuard').length, 0);
  assert.equal(evOff.filter((e) => e.type === 'hurt')[0].unitId, 1, '첫 발은 로봇');
  assert.equal(heroes(off).length, 0, '로봇이 쓰러졌다');
  assert.ok(!('hero' in off.units[0]), '중심 자리에 선 병사는 로봇 표시를 이어받지 않는다');
});

test('HERO-3: 호위가 모두 쓰러지면 그다음 발부터 로봇이 맞고, 보호막은 STEP 끝에 꺼진다(heroGuardOff 1회) — 접촉·게이트로 마지막 호위가 빠져도 같다', () => {
  //  병력 2(로봇 + 호위 1): 두 발 → 첫 발 호위, 둘째 발 로봇 → 전멸 = 패배
  const run = createRun(road(2), { heroGuard: true, difficulty: 'brutal' });
  holdFire(run);
  run.eshots.push(shotAtCenter(run, 3), shotAtCenter(run, 3));
  const ev = stepOnce(run);
  assert.deepEqual(ev.filter((e) => e.type === 'hurt').map((e) => e.unitId), [2, 1]);
  assert.equal(ev.filter((e) => e.type === 'heroGuard').length, 1);
  assert.equal(run.over, true, '로봇까지 쓰러지면 병력 0 = 패배(판정은 그대로)');
  //  한 발이면 호위만 쓰러지고 보호막이 꺼진다(이벤트 1회, 다음 STEP 엔 다시 안 낸다)
  const one = createRun(road(2), { heroGuard: true, difficulty: 'brutal' });
  holdFire(one);
  one.eshots.push(shotAtCenter(one, 3));
  const e1 = stepOnce(one);
  assert.equal(e1.filter((e) => e.type === 'heroGuardOff').length, 1);
  assert.equal(one.heroShield, false);
  assert.equal(stepOnce(one).filter((e) => e.type === 'heroGuardOff').length, 0);
  //  다시 병사가 합류하면 켜진다(heroGuardOn)
  addUnits(one, 2);
  assert.equal(stepOnce(one).filter((e) => e.type === 'heroGuardOn').length, 1);
  assert.equal(one.heroShield, true);
  //  게이트가 마지막 호위를 빼는 STEP 에도 꺼짐 판정(게이트 처리 뒤·승패 판정 앞)
  const gate = createRun({ ...road(3), gateRows: [{ id: 'g', z: 20, h: 24, armZ: null, cells: [{ x0: 0, x1: 480, value: -5 }] }] }, { heroGuard: true });
  holdFire(gate);
  let off = null, n = 0;
  while (!off && n++ < 30) { const e = stepOnce(gate, at(240)); if (e.some((x) => x.type === 'gatePass')) off = e; }
  assert.ok(off.some((e) => e.type === 'heroGuardOff'), '게이트 통과 STEP 에 heroGuardOff');
  assert.deepEqual(ids(gate), [1]);
  assert.equal(gate.over, false);
  //  잡졸 접촉(앞줄 1명 = 로봇)도 넘어간다 — 원인은 접촉
  const t = createRun({ ...road(3), spawns: [{ z: 10, kind: 'grunt', n: 1, xs: [240], zs: [40], hp: 1 }] }, { heroGuard: true, difficulty: 'brutal' });
  holdFire(t);
  let tev = [];
  for (let i = 0; i < 40 && !tev.some((e) => e.type === 'touch'); i++) tev = stepOnce(t, at(240));
  const tr = tev.filter((e) => e.type === 'heroGuard');
  assert.equal(tr.length, 1); assert.equal(tr[0].cause, 'touch');
  assert.equal(t.lossByTouch, 1); assert.equal(t.units[0].hero, true); assert.equal(t.units[0].hp, 2);
});

// ─────────────────────────────── HERO-4 착지 충격 ───────────────────────────────

//  24번 광장(기본 줄: 충격 r 90 · dmg 6 ≥ 병사 체력 2)에서 부대 중심에 착지 충격 한 번. 병력 n, 보스 겹침 접촉·소환·사격은 막는다
function shockOnce(heroGuard, n) {
  const run = createRun(buildStage(24, { difficulty: 'brutal' }), { heroGuard });
  run.spawnCursor = run.spawns.length; run.gateRows = []; run.supplies = [];
  run.z = run.elites[0].z; run.prevZ = run.z;
  stepOnce(run);
  assert.equal(run.phase, 'arena');
  run.enemies.length = 0; run.eshots.length = 0;
  run.units.length = 1;
  addUnits(run, n - 1);
  holdFire(run);
  const bo = run.boss;
  Object.assign(bo, { state: 'dash', dashLeft: 1e-6, dashUx: 0, dashUz: 0, x: run.x, z: run.z - run.ay, touchT: 99, spawnT: 99, shootT: 99, guard: false });
  const before = run.units.length;
  const ev = stepOnce(run);
  const shock = ev.find((e) => e.type === 'bossShock');
  assert.ok(shock, '충격');
  return { run, ev, shock, lost: before - run.units.length };
}

test('HERO-4: 착지 충격 한 번의 손실 인원은 이전 규칙 전후가 같다(충격 피해 ≥ 병사 체력) — 로봇 몫은 원 밖 가장 가까운 호위, 원 밖 호위가 없으면 로봇이 맞는다', () => {
  assert.equal(createRun(buildStage(24, { difficulty: 'brutal' })).arena.boss.shock.dmg, 6, '기본 줄 충격 6 ≥ 병사 체력 2');
  for (const n of [60, 80, 100]) {
    const off = shockOnce(false, n), on = shockOnce(true, n);
    assert.equal(on.shock.hits, off.shock.hits, `n${n}: 원 안 유닛 수 같음`);
    assert.equal(on.lost, off.lost, `n${n}: 손실 인원 같음(${off.lost})`);
    assert.equal(on.run.lossByShock, off.run.lossByShock, '원인 = 충격');
    assert.ok(on.shock.hits < n, `n${n}: 원 밖 호위가 있다`);
    const tr = on.ev.filter((e) => e.type === 'heroGuard');
    assert.equal(tr.length, 1, '로봇 몫 1건만 넘어간다');
    assert.equal(tr[0].cause, 'shock');
    assert.equal(on.run.units[0].hero, true, 'heroGuard: 로봇이 산다');
    assert.equal(heroes(off.run).length, 0, '끈 판: 로봇이 원 안에서 쓰러진다');
    //  넘겨받은 호위는 원 밖이었다(원 안 호위에게 넘기면 그 호위가 두 번 맞아 손실이 한 명 줄어든다)
    const shockHurts = on.ev.filter((e) => e.type === 'hurt' && e.cause === 'shock').map((e) => e.unitId);
    assert.equal(shockHurts.filter((id) => id === tr[0].unitId).length, 1, '대신 받은 호위는 제 몫이 없었다(원 밖)');
  }
  //  원 밖 호위가 없으면(20명 전원이 원 안) 로봇이 맞는다 — 둘 다 전멸
  const offAll = shockOnce(false, 20), onAll = shockOnce(true, 20);
  assert.equal(onAll.shock.hits, 20);
  assert.equal(onAll.ev.filter((e) => e.type === 'heroGuard').length, 0);
  assert.equal(onAll.lost, offAll.lost);
  assert.equal(onAll.run.over, true);
});

// ─────────────────────────────── HERO-5 heroGuard 꺼짐 = 종전 ───────────────────────────────

test('HERO-5: heroGuard 꺼짐(옵션 없이 부른 판 = 규칙 검사·봇)은 종전 동작 그대로 — 보호 이벤트 없음·옵션 false 와 옵션 없음이 같은 판', () => {
  const pick = (r) => ({ won: r.run.won, over: r.run.over, steps: r.steps, units: r.run.units.map((u) => [u.id, u.hp, u.dx, u.dy]), kills: r.run.kills, time: r.run.time,
                         peak: r.run.peak, loss: [r.run.lossByGate, r.run.lossByShot, r.run.lossByTouch, r.run.lossByShock], gates: r.gates, opened: r.opened, events: r.events });
  for (const [id, bot] of [[1, 'evLead'], [2, 'aimLead'], [3, 'planBoss'], [15, 'evLead']]) {
    const a = playPolicy(id, bot, 14400, 'brutal');
    const b = playPolicy(id, bot, 14400, 'brutal', undefined, { heroGuard: false });
    assert.deepEqual(pick(b), pick(a), `${id}/${bot}: heroGuard false = 옵션 없음`);
    for (const t of ['heroGuard', 'heroGuardOn', 'heroGuardOff']) assert.equal(a.events[t], undefined, `${id}/${bot}: ${t} 이벤트 없음`);
    assert.equal(a.run.heroGuard, false); assert.equal(a.run.heroShield, false);
  }
});

test('HERO-5: 그림은 hero 표시를 보고 그린다 — 로봇이 쓰러진 끈 판에서는 중심 자리 병사가 로봇 그림을 받지 않고, 보호막 고리는 heroShield 일 때만', () => {
  const M1 = { width: 10, height: 10 }, SOL = { width: 10, height: 10 };
  const draws = (run) => {
    const ops = [];
    const st = { globalAlpha: 1, fillStyle: '', strokeStyle: '', canvas: null };
    const stack = [];
    const ctx = new Proxy(st, {
      get(t, k) { if (k in t) return t[k]; if (typeof k !== 'string') return undefined;
        return (...args) => {
          if (k === 'save') stack.push({ ...t });
          if (k === 'restore') { const o = stack.pop(); if (o) Object.assign(t, o); }
          ops.push({ op: k, args, stroke: t.strokeStyle });
          if (k.startsWith('create')) return { addColorStop() {} }; if (k === 'measureText') return { width: 10 }; return undefined; }; },
      set(t, k, v) { t[k] = v; return true; },
    });
    const fx = { parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null, lotOpen: 0, beams: [] };
    createRenderer3(ctx, { get: (k) => (k === 'm1' ? M1 : k === 'soldier' ? SOL : null) }).draw({ state: 'run', now: 1, run, fx, hud: { distM: 1 }, buttons: [], saveOk: true });
    return { m1: ops.filter((o) => o.op === 'drawImage' && o.args[0] === M1).length, sol: ops.filter((o) => o.op === 'drawImage' && o.args[0] === SOL).length,
             ring: ops.filter((o) => o.op === 'ellipse' && o.stroke === HERO_RING_COLOR).length };
  };
  const on = createRun(road(10), { heroGuard: true });
  assert.deepEqual(draws(on), { m1: 1, sol: 9, ring: 1 }, '로봇 1 + 병사 9 + 보호막 고리');
  const off = createRun(road(10), { difficulty: 'brutal' });
  holdFire(off);
  off.eshots.push(shotAtCenter(off, 3));
  stepOnce(off);
  assert.equal(off.units.length, 9);
  assert.deepEqual(draws(off), { m1: 0, sol: 9, ring: 0 }, '로봇이 쓰러진 뒤엔 로봇 그림 없이 병사만');
  assert.deepEqual(draws(createRun(road(1), { heroGuard: true })), { m1: 1, sol: 0, ring: 0 }, '호위가 없으면 고리 없음');
});

// ─────────────────────────────── V4-REAL 셸 실제 설정 기준값 ───────────────────────────────

test('V4-REAL: 셸 실제 설정(기본 줄 + heroGuard + 강화 0) 1~24 × evLead·aimLead·planBoss 결과 = 기준값 파일(tests/fixtures/rush3-v4-real.json)', () => {
  const fx = JSON.parse(readFileSync(V4_FIXTURE, 'utf8'));
  assert.deepEqual(fx.meta.ids, ALL_STAGE_IDS);
  assert.deepEqual(fx.meta.bots, V4_BOTS);
  for (const bot of V4_BOTS) for (const id of ALL_STAGE_IDS) assert.deepEqual(v4RealRun(id, bot), fx.runs[bot + '/' + id], `${bot}/${id}`);
  //  r4.7: 끝나지 않는 판 0(상한 28,800 STEP 안에 모든 판이 over) — 동작 확인이다(봇 승패는 난이도 근거로 쓰지 않는다, 이사님 지시 2026-09-26)
  for (const [k, r] of Object.entries(fx.runs)) assert.equal(r.over, true, k + ': 상한 안에 끝난다');
  //  보호 규칙이 실제로 일한 판이 있다(기준값이 '보호 없음'과 같은 파일이 아니다)
  assert.ok(V4_BOTS.some((b) => fx.meta.summary[b].transfers > 0), '피해 이전이 일어난 판이 있다');
});

//  r4.4 검토 보정: 음수 칸을 applied 0 으로 지난 판의 문구는 로봇이 **살아 있을 때만** '로봇은 빠지지 않음'.
//   같은 STEP 에 적 피해로 로봇까지 쓰러져 병력 0 이면(applied 0) 그 말은 사실과 반대다
test('HERO-TEXT: 랜덤 길 함정 문구 — 로봇 생존이면 "로봇은 빠지지 않음", 병력 0(로봇 쓰러짐)이면 "함정 통과"만', async () => {
  const { lotteryLine } = await import('../rush3/main.js');
  const mk = (units) => ({
    lottery: { kind: 'gate', wallId: 'w1', label: '함정 −10', good: false },
    wallSideLog: { w1: 'R' }, units,
  });
  const out = { passed: true, value: -10, applied: 0 };
  assert.equal(lotteryLine(mk([{ hero: true, hp: 2 }]), { outcome: out }), '랜덤 길: 함정 통과 · 로봇은 빠지지 않음');
  assert.equal(lotteryLine(mk([]), { outcome: out }), '랜덤 길: 함정 통과');
  //  병사가 빠진 판은 종전 그대로
  assert.equal(lotteryLine(mk([{ hero: true, hp: 2 }]), { outcome: { passed: true, value: -10, applied: -3 } }), '랜덤 길: 함정 피해 −3명');
});
