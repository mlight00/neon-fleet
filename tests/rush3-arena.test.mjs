// rush3-arena — 아레나 보스(계약서 r3.17 · 실게임 구현계획 B-1 장치 6 · 01 §5-1·§5-8). ID 접두 V3-ARENA.
//  "여기서는 위아래로도 움직인다"(10) · "피할 수 없는 자리가 생긴다"(11, 범위·소환) · 최종(24).
//  잠그는 것: 형식·파생·불변식(A-1) · 진입·스크롤 정지(A-2) · 도로에서 세로 입력 무시(A-3) · 클램프·상한·x 확장(A-4) · 추격·범위(A-5) ·
//  예고→돌진→충격(A-6) · 자동 조준·탄 정리(A-7) · 승패(A-8) · 결정성(A-9) · 봇 완주·소환 추격(A-10) · 입력 모듈(A-11) · 렌더(A-12) · 셸(A-13).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage, stageVersion, coverZFor, DEFS } from '../rush3/stages.js';
import { makeCourses } from '../rush3/courses.js';
import { BAL3 } from '../rush3/balance.js';
import { makeBullet, weaponStats } from '../rush3/weapons.js';
import { formationHalfWidth, SQUAD_DEFAULTS } from '../rush3/squad.js';
import { createInput, isSteerKey } from '../rush3/input.js';
import { createRenderer3 } from '../rush3/render.js';
import { boot, ARENA_GUIDE_TEXT } from '../rush3/main.js';
import { projectorFor } from '../rush3/project.js';
//  r3.20 검수 반영(2026-09-20): 셸의 세로 드래그(dragDy)도 부대 줄 기울기 near 로 나눈다 — 화면 −100 논리 px = −100/1.45 트랙 px
const NEAR = projectorFor('standard').near;
import { createSave3 } from '../rush3/save.js';
import { pickX, pickInput, botArena } from './lib/rush3-policies.mjs';

const AR = BAL3.arena, SQ = BAL3.squad, LINE_Y = BAL3.view.LINE_Y;
const ARENA_IDS = [10, 11, 24];
const NONE = { pointerX: null, dragDx: 0, keyDir: 0 };
const at = (x, o = {}) => ({ pointerX: x, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0, ...o });
const count = (ev, type) => ev.filter((e) => e.type === type).length;
const squadZ = (run) => run.z - run.ay;

//  합성 아레나 스테이지(buildStage 정규화 꼴을 그대로 흉내 — createRun 은 stage.arena·stage.elites 만 읽는다). 게이트·통·스폰 없음, 진입 z 600(≈ 190 STEP)
function synthArena(o = {}) {
  const B = AR.boss;
  const z = o.z ?? 600;
  //  r3.18 재기준: 합성 판은 보호막(guard)을 기본 끈다 — 조준·돌진·승패 기계 검사(A-7·A-8)는 첫 충격 전에도 맞는 것을 전제한다.
  //   보호막 규칙 자체는 V3-ARMGUARD(rush3-armguard.test.mjs)가 guard true 로 따로 잠근다. o.guard 로 켤 수 있다
  const boss = { ...B, guard: o.guard ?? false, ...(o.speed != null ? { speed: o.speed } : {}), ...(o.touchDmg != null ? { touchDmg: o.touchDmg } : {}),
                 dash: { ...B.dash, ...(o.dash ?? {}) }, shock: { ...B.shock, ...(o.shock ?? {}) },
                 summon: o.summon ? { ...o.summon } : null, shoot: o.shoot ? { ...o.shoot } : null };
  const elites = [{ z, hp: o.hp ?? 500, summon: !!o.summon }];
  return { id: 'ta', version: 1, title: 'arena', startUnits: o.startUnits ?? 40, startWeapon: o.startWeapon ?? 'rifle', length: z + 400, eliteZ: z,
           gateRows: [], supplies: [], walls: [], spawns: [], elites, elite: elites[0], arena: { z, w: [...AR.w], depth: [...AR.depth], boss } };
}
//  같은 꼴의 도로 스테이지(아레나 없음, 정예 없음)
function synthRoad(o = {}) {
  return { id: 'tr', version: 1, title: 'road', startUnits: o.startUnits ?? 40, startWeapon: 'rifle', length: 100000, eliteZ: null,
           gateRows: [], supplies: [], walls: [], spawns: [], elites: [], elite: null, arena: null };
}
function play(run, n, input = NONE, onStep = null) {
  const all = [];
  for (let i = 0; i < n && !run.over; i++) {
    stepRun(run, typeof input === 'function' ? input(run, i) : input, STEP);
    const ev = drainEvents(run);
    all.push(...ev);
    if (onStep) onStep(run, ev, i);
  }
  return all;
}
//  조건이 될 때까지. 반환 { steps, events }
function until(run, cond, input = NONE, max = 6000) {
  const events = [];
  let n = 0;
  //  조건은 STEP 뒤에도(판이 끝난 STEP 포함) 한 번 더 본다 — 마지막 충격으로 전멸한 판의 bossShock 도 잡힌다
  for (;;) {
    if (cond(run, events) || run.over || n >= max) break;
    stepRun(run, typeof input === 'function' ? input(run, n) : input, STEP);
    events.push(...drainEvents(run));
    n++;
  }
  return { steps: n, events };
}
const enter = (run, input = NONE) => until(run, (r) => r.phase === 'arena', input);
const pick = (run) => ({ x: run.x, z: run.z, ay: run.ay, tay: run.tay, units: run.units.map((u) => [u.id, u.hp, u.dx, u.dy]), bullets: run.bullets.length,
                         enemies: run.enemies.length, kills: run.kills, time: run.time, lossByShock: run.lossByShock, lossByTouch: run.lossByTouch, lossByShot: run.lossByShot,
                         won: run.won, over: run.over, phase: run.phase });
const bossPick = (bo) => bo ? { x: bo.x, z: bo.z, hp: bo.hp, state: bo.state, dashT: bo.dashT, dashTx: bo.dashTx, dashTz: bo.dashTz, dashLeft: bo.dashLeft } : null;

// ─────────────────────────────────────────────────────────────────────────────
test('V3-ARENA A-1: 형식·파생·불변식 — 10·11·24 정의에 arena 만(elite 없음), buildStage 결정적·version 2·BAL3 기본값 병합·stage.elite 파생·물체 z ≤ arena.z − 800·elite+arena 동시 정의는 throw', () => {
  const C = makeCourses({ coverZFor });
  for (const id of ARENA_IDS) {
    assert.ok(C[id].arena && C[id].arena.boss, 'S' + id + ' arena 정의');
    assert.equal(C[id].elite, undefined, 'S' + id + ' elite 없음'); assert.equal(C[id].elites, undefined, 'S' + id + ' elites 없음');
    assert.equal(C[id].eliteZ, C[id].arena.z, 'S' + id + ' eliteZ = arena.z');
    const a = buildStage(id), b = buildStage(id);
    assert.deepEqual(a, b, 'S' + id + ' 결정성');
    assert.notEqual(a.arena, b.arena, '호출마다 새 객체');
    assert.equal(stageVersion(id), 3); assert.equal(a.version, 3);
    //  기본값 병합: w/depth/bossZ 는 BAL3.arena, 정의가 적지 않은 boss 칸(r·spawnAhead·touchEvery·touchDmg·dash.recover)은 BAL3.arena.boss
    assert.deepEqual(a.arena.w, AR.w); assert.deepEqual(a.arena.depth, AR.depth);
    assert.equal(a.arena.boss.r, AR.boss.r); assert.equal(a.arena.boss.spawnAhead, AR.boss.spawnAhead);
    assert.equal(a.arena.boss.touchEvery, AR.boss.touchEvery); assert.equal(a.arena.boss.touchDmg, AR.boss.touchDmg);
    assert.equal(a.arena.boss.dash.recover, C[id].arena.boss.dash.recover ?? AR.boss.dash.recover);
    assert.equal(a.arena.boss.speed, C[id].arena.boss.speed);
    assert.equal(a.arena.boss.hp, undefined, 'hp 는 arena 사본에 두지 않는다(stage.elite.hp 가 진실)');
    //  파생 정예: 단수 정의와 같은 키 집합 { z, hp, summon, skin }
    assert.deepEqual(a.elite, { z: C[id].arena.z, hp: C[id].arena.boss.hp, summon: !!C[id].arena.boss.summon, skin: C[id].arena.boss.skin });
    assert.equal(a.elites.length, 1); assert.equal(a.elite, a.elites[0]); assert.equal(a.eliteZ, a.arena.z);
    //  불변식: 광장 앞 800px 안에 물체 없음
    const endZ = a.arena.z - 800;
    for (const row of a.gateRows) assert.ok(row.z <= endZ, 'S' + id + ' ' + row.id);
    for (const s of a.supplies) assert.ok(s.z + s.r <= endZ, 'S' + id + ' ' + s.id);
    for (const w of a.walls) assert.ok(w.z1 <= endZ, 'S' + id + ' ' + w.id);
    for (const sp of a.spawns) assert.ok(sp.z <= endZ, 'S' + id + ' 스폰 ' + sp.z);
  }
  //  소환·사격 칸: 10 없음 · 11 소환 · 24 소환 + 사격
  assert.equal(buildStage(10).arena.boss.summon, null); assert.equal(buildStage(10).arena.boss.shoot, null);
  assert.deepEqual(buildStage(11).arena.boss.summon, { every: 5, kind: 'grunt', n: 2, dx: 44, dz: -40 }); assert.equal(buildStage(11).arena.boss.shoot, null);
  assert.deepEqual(buildStage(24).arena.boss.shoot, { every: 2.4, fan: 5, fanDeg: 14 }); assert.equal(buildStage(24).arena.boss.summon.n, 3);
  //  아레나 없는 스테이지는 arena null(자기 스테이지 버전만 단정 — 다른 번호의 version 은 보지 않는다)
  assert.equal(buildStage(1).arena, null); assert.equal(buildStage(9).arena, null); assert.equal(createRun(buildStage(1)).arena, null);
  //  guard: elite 와 arena 를 함께 적으면 throw · 광장 앞 여유 안의 스폰도 throw(DEFS 는 def() 조회의 첫 자리 — 임시 정의를 넣었다 뺀다)
  const base = { version: 1, title: '검사', startUnits: 1, startWeapon: 'rifle', length: 3000, eliteZ: 2600, gates: [], supplies: [], walls: [], spawns: [] };
  DEFS[998] = { ...base, elite: { z: 2600, hp: 10, summon: false }, arena: { z: 2600, boss: { hp: 10 } } };
  DEFS[997] = { ...base, spawns: [{ z: 2000, kind: 'grunt', n: 1, xs: [240], corridorHw: null }], arena: { z: 2600, boss: { hp: 10 } } };
  DEFS[996] = { ...base, eliteZ: 2500, arena: { z: 2600, boss: { hp: 10 } } };
  try {
    assert.throws(() => buildStage(998), /arena/);
    assert.throws(() => buildStage(997), /광장 앞 여유/);
    assert.throws(() => buildStage(996), /eliteZ/);
  } finally { delete DEFS[998]; delete DEFS[997]; delete DEFS[996]; }
});

test('V3-ARENA A-2: 진입 — createRun 직후 phase main·ay 0, 무입력 진행에서 arenaEnter 와 elite 가 같은 STEP, 보스 arena·chase, 그 뒤 run.z 정지·스폰 커서 정지', () => {
  const run = createRun(synthArena());
  assert.equal(run.phase, 'main'); assert.equal(run.ay, 0); assert.equal(run.tay, 0); assert.ok(run.arena && run.arena.z === 600);
  assert.equal(run.lossByShock, 0);
  let enterEv = null;
  const { events } = until(run, (r, ev) => { const i = ev.findIndex((e) => e.type === 'arenaEnter'); if (i >= 0) enterEv = ev; return i >= 0; },
    NONE, 400);
  assert.ok(enterEv, '진입 이벤트');
  const ae = events.find((e) => e.type === 'arenaEnter'), el = events.find((e) => e.type === 'elite');
  assert.ok(ae && el, 'arenaEnter 와 elite 둘 다');
  assert.deepEqual(ae.w, AR.w); assert.deepEqual(ae.depth, AR.depth); assert.equal(ae.z, run.z);
  assert.deepEqual([el.id, el.index, el.total, el.role], ['b1', 0, 1, 'elite']);
  assert.equal(run.phase, 'arena'); assert.equal(run.eliteSpawned, true);
  assert.ok(run.boss && run.boss.arena === true && run.boss.state === 'chase' && run.bosses.length === 1);
  //  등장 z = run.z + spawnAhead(이벤트 값). 같은 STEP 의 6단계에서 이미 speed·STEP 만큼 추격했으므로 보스 z 는 그보다 한 STEP 이동 안
  assert.equal(el.z, run.z + AR.boss.spawnAhead); assert.equal(el.x, 240);
  assert.ok(Math.abs(run.boss.z - el.z) <= AR.boss.speed * STEP + 1e-9); assert.equal(el.hp, 500); assert.equal(run.boss.max, 500);
  assert.ok(run.boss.hp <= 500 && run.boss.hp > 0, '같은 STEP 에 날아가던 탄이 맞을 수 있다');
  assert.ok(run.z >= 600, '진입 z 는 arena.z 이상');
  const z0 = run.z, cursor = run.spawnCursor;
  play(run, 300, at(240), (r) => { assert.equal(r.z, z0, 'run.z 정지'); assert.equal(r.prevZ, z0); });
  assert.equal(run.spawnCursor, cursor);
  assert.equal(run.phase, 'arena', '단방향 — 광장에서 도로로 되돌아가지 않는다');
});

test('V3-ARENA A-3: 도로에서는 dragDy·keyDirY 를 읽지 않는다 — 진입 전 60 STEP 세로 입력 → ay·tay 0, S1 을 세로 입력 유무로 두 번 돌려 상태 동일', () => {
  const run = createRun(synthArena());
  play(run, 60, at(240, { dragDy: 100, keyDirY: 1 }));
  assert.equal(run.phase, 'main'); assert.equal(run.ay, 0); assert.equal(run.tay, 0);
  const a = createRun(buildStage(1)), b = createRun(buildStage(1));
  play(a, 900, at(240));
  play(b, 900, at(240, { dragDy: 50, keyDirY: 1 }));
  assert.deepEqual(pick(a), pick(b));
  assert.equal(b.ay, 0); assert.equal(b.tay, 0);
  //  종전 3칸 입력(dragDy·keyDirY 없음)도 그대로 받는다
  const c = createRun(buildStage(1));
  play(c, 900, { pointerX: 240, dragDx: 0, keyDir: 0 });
  assert.deepEqual(pick(c), pick(a));
});

test('V3-ARENA A-4: 클램프·속도 상한·x 확장 — 광장에서 dragDy −10000 → STEP 당 |Δay| ≤ moveMax·STEP·최종 depth[0], keyDirY 1 → depth[1], pointerX 0/480 → 40+hw/440−hw(도로는 80+hw/400−hw)', () => {
  //  보스는 해치지 못하게(충격 0·접촉 0) — 병력이 줄면 대형 반폭이 바뀐다
  const run = createRun(synthArena({ startUnits: 40, hp: 1e9, shock: { dmg: 0 }, touchDmg: 0 }));
  enter(run);
  const [d0, d1] = run.arena.depth;
  const cap = SQ.moveMax * STEP + 1e-9;
  let prev = run.ay;
  play(run, 300, at(240, { dragDy: -10000 }), (r) => { assert.ok(Math.abs(r.ay - prev) <= cap, 'Δay ' + (r.ay - prev)); prev = r.ay; });
  assert.ok(Math.abs(run.ay - d0) < 1e-6, 'ay ' + run.ay); assert.equal(run.tay, d0);
  play(run, 300, at(240, { keyDirY: 1 }));
  assert.ok(Math.abs(run.ay - d1) < 1e-6, 'ay ' + run.ay); assert.equal(run.tay, d1);
  //  x 확장: 광장 폭 40~440 − 대형 반폭(최대 60)
  const hw = Math.min(formationHalfWidth(run.units.length), SQUAD_DEFAULTS.freeHalfMax);
  assert.equal(hw, 60, '40명 대형은 반폭 상한 60 을 쓴다');
  play(run, 300, at(0));
  assert.ok(Math.abs(run.x - (AR.w[0] + hw)) < 1e-6, 'x ' + run.x);
  play(run, 300, at(480));
  assert.ok(Math.abs(run.x - (AR.w[1] - hw)) < 1e-6, 'x ' + run.x);
  //  같은 STEP 수를 더 돌려도(applyRewards 의 클램프) 도로 폭으로 튕기지 않는다
  play(run, 120, at(480));
  assert.ok(run.x > 360, 'applyRewards 가 도로 폭(340)으로 되돌리지 않는다: ' + run.x);
  //  도로: 종전 80+hw / 400−hw
  const road = createRun(synthRoad({ startUnits: 40 }));
  play(road, 300, at(0));
  assert.ok(Math.abs(road.x - (80 + hw)) < 1e-6, '도로 x ' + road.x);
  play(road, 300, at(480));
  assert.ok(Math.abs(road.x - (400 - hw)) < 1e-6, '도로 x ' + road.x);
  assert.equal(road.ay, 0);
});

test('V3-ARENA A-5: 추격·범위 — 부대 고정이면 chase 동안 STEP 마다 거리가 speed·STEP 씩 줄고, dash.first 동안 chase, 보스는 광장 x·bossZ 범위를 벗어나지 않는다', () => {
  const run = createRun(synthArena({ startUnits: 10 }));
  enter(run, at(240));
  const B = run.arena.boss;
  const dist = () => Math.hypot(run.boss.x - run.x, run.boss.z - squadZ(run));
  let prev = dist(), chaseSteps = 0;
  const firstSteps = Math.round(B.dash.first / STEP);
  play(run, firstSteps - 1, at(240), (r) => {
    assert.equal(r.boss.state, 'chase');
    const d = dist();
    assert.ok(Math.abs((prev - d) - B.speed * STEP) < 1e-6, '감소량 ' + (prev - d));
    prev = d; chaseSteps++;
  });
  assert.equal(chaseSteps, firstSteps - 1);
  //  범위(600 STEP, 돌진·충격 포함)
  const r = run.boss.r, [w0, w1] = run.arena.w, [z0, z1] = run.arena.bossZ;
  play(run, 600, at(240), (rr) => {
    const bo = rr.boss; if (!bo) return;
    assert.ok(bo.x >= w0 + r - 1e-9 && bo.x <= w1 - r + 1e-9, 'x ' + bo.x);
    assert.ok(bo.z >= rr.z + z0 - 1e-9 && bo.z <= rr.z + z1 + 1e-9, 'z ' + bo.z);
  });
});

test('V3-ARENA A-6: 예고→돌진→충격 — warn STEP 의 목표 = 부대 중심, warn/STEP 뒤 dash, 착지점 = 목표, hits = 원 안 유닛 수(독립 계산)·그 유닛만 hp −1·hurt cause shock, lossByShock, 피하면 hits 0', () => {
  const run = createRun(synthArena({ startUnits: 40, hp: 1e9 }));
  enter(run, at(240));
  const B = run.arena.boss;
  //  warn
  const w = until(run, (r, ev) => ev.some((e) => e.type === 'bossDashWarn'), at(240));
  const warnEv = w.events.find((e) => e.type === 'bossDashWarn');
  assert.equal(run.boss.state, 'warn');
  assert.equal(run.boss.dashTx, run.x); assert.equal(run.boss.dashTz, run.z - run.ay);
  assert.deepEqual([warnEv.tx, warnEv.tz, warnEv.warn], [run.x, run.z, B.dash.warn]);
  //  dash: warn/STEP ± 1
  const d = until(run, (r, ev) => ev.some((e) => e.type === 'bossDash'), at(240));
  assert.ok(Math.abs(d.steps - Math.round(B.dash.warn / STEP)) <= 1, 'warn 길이 ' + d.steps);
  assert.equal(run.boss.state, 'dash');
  const dashEv = d.events.find((e) => e.type === 'bossDash');
  assert.ok(dashEv.range <= B.dash.range && dashEv.range > 0);
  const tx = run.boss.dashTx, tz = run.boss.dashTz;
  //  shock: 착지점 = 목표(사거리 안), hits 독립 계산 — 위치는 **그 STEP 직전** 스냅샷으로(같은 STEP 에 접촉으로 죽은 유닛이 있으면 대형이 다시 깔린다)
  let snap = null, shockEv = null, hurts = [];
  until(run, (r, ev) => { shockEv = ev.find((e) => e.type === 'bossShock') ?? null; if (shockEv) hurts = ev.filter((e) => e.type === 'hurt'); return !!shockEv; },
    (r) => { snap = { x: r.x, z: squadZ(r), units: r.units.map((u) => ({ id: u.id, dx: u.dx, dy: u.dy, hp: u.hp })) }; return at(240); });
  assert.ok(shockEv, '충격');
  assert.ok(Math.abs(run.boss.x - tx) < 1e-6 && Math.abs(run.boss.z - tz) < 1e-6, '착지점 ' + run.boss.x + ',' + run.boss.z + ' vs ' + tx + ',' + tz);
  assert.equal(shockEv.r, B.shock.r);
  const rr = B.shock.r + SQUAD_DEFAULTS.unitR;
  //  돌진 마지막 STEP 에 보스 원과 겹친 앞줄 1명은 접촉(cause 'boss', −3)을 먼저 받아 충격 후보에서 빠진다(hp ≤ 0)
  const touched = new Set(hurts.filter((h) => h.cause === 'boss').map((h) => h.unitId));
  const inside = snap.units.filter((u) => !touched.has(u.id) && Math.hypot(snap.x + u.dx - shockEv.x, snap.z - u.dy - shockEv.z) <= rr);
  assert.ok(inside.length > 0 && inside.length < snap.units.length, '일부만 맞는 배치: ' + inside.length + '/' + snap.units.length);
  assert.equal(shockEv.hits, inside.length);
  const shocks = hurts.filter((h) => h.cause === 'shock');
  assert.equal(shocks.length, inside.length); assert.ok(shocks.every((h) => h.n === B.shock.dmg));
  assert.deepEqual(new Set(shocks.map((h) => h.unitId)), new Set(inside.map((u) => u.id)), '맞은 유닛 = 원 안 유닛');
  const hpBefore = new Map(snap.units.map((u) => [u.id, u.hp]));
  const insideIds = new Set(inside.map((u) => u.id));
  for (const u of run.units) if (!touched.has(u.id)) assert.equal(u.hp, hpBefore.get(u.id) - (insideIds.has(u.id) ? B.shock.dmg : 0), '유닛 ' + u.id);
  assert.equal(run.lossByShock, 0, 'hp 2 → 1 이라 충격 손실 없음'); assert.equal(run.lossByTouch, touched.size); assert.equal(run.boss.state, 'recover');
  //  recover → chase, dashT = every
  until(run, (r) => r.boss.state === 'chase', at(240));
  assert.ok(Math.abs(run.boss.dashT - B.dash.every) < 1e-9);
  //  손실 집계: hp 1 로 만들고 다음 충격
  for (const u of run.units) u.hp = 1;
  let shock2 = null;
  until(run, (r, ev) => { shock2 = ev.find((e) => e.type === 'bossShock') ?? null; return !!shock2; }, at(240));
  assert.ok(shock2 && shock2.hits > 0);
  //  충격 손실 = 충격 hits(hp 1 → 0). 보스가 부대 위에 앉아 있던 3.6초 동안의 접촉 손실(0.5초마다 1명, cause 'boss')은 따로 센다
  assert.equal(run.lossByShock, shock2.hits); assert.ok(run.lossByTouch > 0 && run.lossByTouch < 12, '접촉 손실 ' + run.lossByTouch);
  //  피하기: 예고 순간부터 반대쪽(x 380·아래)으로 → hits 0
  const run2 = createRun(synthArena({ startUnits: 5 }));
  enter(run2, at(240));
  until(run2, (r) => r.boss.state === 'warn', at(240));
  let s2 = null;
  until(run2, (r, ev) => { s2 = ev.find((e) => e.type === 'bossShock') ?? null; return !!s2; }, at(380, { dragDy: 10000 }));
  assert.ok(s2, '충격은 난다'); assert.equal(s2.hits, 0, '피한 판은 맞지 않는다');
  assert.equal(run2.lossByShock, 0);
});

test('V3-ARENA A-7: 자동 조준·탄 정리 — 새 탄의 속력 = 무기 vz·방향 = 보스 쪽·aimed, 아래 보스도 명중, 산탄포 부채꼴 각도 차 = spreadDeg, 600 STEP 뒤 탄 수 상한, 도로 makeBullet 은 종전 모양', () => {
  const freeze = (run) => { run.boss.state = 'recover'; run.boss.recoverT = 1e9; };
  const fresh = (run) => { for (const u of run.units) u.fireT = 0; const n0 = run.bullets.length; stepRun(run, at(240), STEP); drainEvents(run); return run.bullets.slice(n0); };
  //  옆(같은 z)
  const run = createRun(synthArena({ startUnits: 5 }));
  enter(run, at(240)); freeze(run);
  run.boss.x = 380; run.boss.z = squadZ(run);
  const vz = weaponStats('rifle').vz;
  const side = fresh(run);
  assert.equal(side.length, 5);
  for (const b of side) {
    assert.ok(Math.abs(Math.hypot(b.vx, b.vz) - vz) < 1e-6, '속력');
    assert.ok(b.vx > 0, '오른쪽으로'); assert.equal(b.aimed, true); assert.ok(Math.abs(b.x - b.x0 - b.vx * STEP) < 1e-6, 'x0 = 출발 x');
  }
  //  아래(z < 부대 z): vz < 0 이고 계속 돌리면 보스 명중
  run.boss.z = run.z - 60;
  const down = fresh(run);
  assert.ok(down.every((b) => b.vz < 0), '아래로');
  const hit = until(run, (r, ev) => ev.some((e) => e.type === 'enemyHit' && e.kind === 'elite'), at(240), 120);
  assert.ok(hit.events.some((e) => e.type === 'enemyHit' && e.kind === 'elite'), '아래 보스 명중');
  assert.ok(run.boss.hp < 500);
  //  산탄포: 한 유닛의 3발 각도 차 = ±spreadDeg
  const sc = createRun(synthArena({ startUnits: 1, startWeapon: 'scatter' }));
  enter(sc, at(240)); freeze(sc);
  sc.boss.x = 380; sc.boss.z = squadZ(sc) + 200;
  const fan = fresh(sc);
  assert.equal(fan.length, 3);
  const ang = fan.map((b) => Math.atan2(b.vx, b.vz)).sort((a, b) => a - b);
  const s = BAL3.weapons.scatter.spreadDeg * Math.PI / 180;
  assert.ok(Math.abs((ang[1] - ang[0]) - s) < 1e-9 && Math.abs((ang[2] - ang[1]) - s) < 1e-9, ang.join(','));
  assert.ok(fan.every((b) => b.range === BAL3.weapons.scatter.range && b.aimed));
  //  탄 정리: 옆 보스에 600 STEP — 빗나간 탄은 x 범위·behind 로 정리돼 상한 안
  const r3 = createRun(synthArena({ startUnits: 5, hp: 1e9 }));
  enter(r3, at(240)); freeze(r3);
  r3.boss.x = 380; r3.boss.z = squadZ(r3) - 60;
  play(r3, 600, at(100));
  const st = weaponStats('rifle');
  const bound = r3.units.length * st.fan * Math.ceil(2.5 / st.interval + 1);
  assert.ok(r3.bullets.length <= bound, '탄 ' + r3.bullets.length + ' ≤ ' + bound);
  assert.ok(r3.bullets.every((b) => b.z >= r3.z - BAL3.cull.enemyBehind && b.x > -40 && b.x < 520));
  //  도로 탄은 종전 모양 그대로(angle null)
  assert.deepEqual(makeBullet('rifle', 100, 200, 7), { x: 100, z: 200, pz: 200, vz: 700, dmg: 1, w: 4, kind: 'rifle', gateHit: 1, ownerId: 7, dead: false });
  assert.deepEqual(makeBullet('scatter', 100, 200, 7, 1, 30), { x: 100, z: 200, pz: 200, vz: 520, dmg: 1, w: 4, kind: 'scatter', gateHit: 1, ownerId: 7, dead: false, vx: 30, range: 420, z0: 200 });
});

test('V3-ARENA A-8: 승리·패배 — 보스 hp 1 → 다음 명중 STEP 에 bossKill·win·over(phase arena 유지), 병사 1(hp 1) 충격 → lose·lossByShock 1', () => {
  const run = createRun(synthArena({ startUnits: 10 }));
  enter(run, at(240));
  run.boss.hp = 1;
  const k = until(run, (r, ev) => ev.some((e) => e.type === 'bossKill'), at(240), 600);
  const kill = k.events.find((e) => e.type === 'bossKill');
  assert.ok(kill && kill.left === 0 && kill.total === 1 && kill.id === 'b1');
  assert.ok(k.events.some((e) => e.type === 'bossesLeft' && e.left === 0));
  assert.ok(k.events.some((e) => e.type === 'win'));
  assert.equal(run.won, true); assert.equal(run.over, true); assert.equal(run.wonAt, run.time); assert.equal(run.bossDefeated, true);
  assert.equal(run.phase, 'arena'); assert.equal(run.bonus, null);
  assert.deepEqual(run.mainResult, { wonAt: run.time, survivors: run.units.length, peak: run.peak, kills: run.kills });
  //  패배
  const lose = createRun(synthArena({ startUnits: 1 }));
  enter(lose, at(240));
  lose.units[0].hp = 1;
  const l = until(lose, (r) => r.over, at(240), 1200);
  assert.equal(lose.over, true); assert.equal(lose.won, false);
  assert.ok(l.events.some((e) => e.type === 'lose'));
  assert.equal(lose.units.length, 0);
  //  정지한 병사 1명은 돌진 마지막 STEP 의 보스 접촉(−3)이 착지 충격보다 한 STEP 먼저 닿을 수 있다 — 어느 쪽이든 아레나 보스에게 잃은 1명
  assert.equal(lose.lossByShock + lose.lossByTouch, 1); assert.equal(lose.lossByShot, 0);
  //  충격으로 지는 판: 병사를 돌진 경로 밖(옆)에서 원 안으로 끌어들인 경우 — 목표를 예고 순간의 위치로 잡고 부대가 살짝 옆으로 비켜 접촉 없이 충격만 받는다
  const lose2 = createRun(synthArena({ startUnits: 1, shock: { r: 200, dmg: 1 } }));
  enter(lose2, at(240));
  lose2.units[0].hp = 1;
  until(lose2, (r) => r.boss.state === 'warn', at(240));
  const l2 = until(lose2, (r) => r.over, at(330), 1200);
  assert.equal(lose2.over, true); assert.equal(lose2.won, false); assert.ok(l2.events.some((e) => e.type === 'lose'));
  assert.equal(lose2.lossByShock, 1); assert.equal(lose2.lossByTouch, 0);
});

test('V3-ARENA A-9: 결정성 — 같은 입력열(dragDy·keyDirY 포함) 두 판이 상태·보스까지 deepEqual(합성 + S10)', () => {
  const script = (r, i) => at(240 + Math.round(Math.sin(i / 30) * 120), { dragDy: i % 40 === 0 ? (i % 80 === 0 ? 60 : -60) : 0, keyDirY: (i % 200) < 50 ? 1 : (i % 200) < 100 ? -1 : 0 });
  const a = createRun(synthArena({ startUnits: 20, summon: { every: 2, kind: 'grunt', n: 2, dx: 44, dz: -40 }, shoot: { every: 1.5, fan: 3, fanDeg: 14 } }));
  const b = createRun(synthArena({ startUnits: 20, summon: { every: 2, kind: 'grunt', n: 2, dx: 44, dz: -40 }, shoot: { every: 1.5, fan: 3, fanDeg: 14 } }));
  const ea = play(a, 1500, script), eb = play(b, 1500, script);
  assert.deepEqual(pick(a), pick(b)); assert.deepEqual(bossPick(a.boss), bossPick(b.boss));
  assert.deepEqual(ea, eb);
  assert.equal(a.phase, 'arena');
  assert.ok(ea.some((e) => e.type === 'summon') && ea.some((e) => e.type === 'eshot'), '소환·사격이 실제로 돌았다');
  const s1 = createRun(buildStage(10)), s2 = createRun(buildStage(10));
  play(s1, 3600, script); play(s2, 3600, script);
  assert.deepEqual(pick(s1), pick(s2)); assert.deepEqual(bossPick(s1.boss), bossPick(s2.boss));
});

test('V3-ARENA A-10: 봇 — planBoss 가 10·11·24 를 보통에서 완주(예고·충격 ≥ 1), center 는 S10 광장에서 충격을 맞는다, 소환 적은 chase 로 부대에 다가온다', (t) => {
  //  pickInput 으로 굴리며 이벤트 페이로드까지 모은다
  function drive(id, policy, max = 14400) {
    const run = createRun(buildStage(id, { difficulty: 'normal' }));
    const events = [];
    let n = 0, arenaSteps = 0;
    while (!run.over && n < max) {
      stepRun(run, pickInput(policy, run), STEP);
      events.push(...drainEvents(run));
      if (run.phase === 'arena') arenaSteps++;
      n++;
    }
    return { run, events, steps: n, arenaSteps };
  }
  for (const id of ARENA_IDS) {
    const r = drive(id, 'planBoss');
    assert.equal(r.run.over, true, 'S' + id + ' 끝나지 않음'); assert.ok(r.steps < 14400);
    assert.equal(r.run.won, true, 'S' + id + ' planBoss 미완주(보스 hp ' + (r.run.boss ? Math.ceil(r.run.boss.hp) : 0) + ', 병력 ' + r.run.units.length + ')');
    assert.ok(count(r.events, 'arenaEnter') === 1 && count(r.events, 'bossDashWarn') >= 1 && count(r.events, 'bossShock') >= 1, 'S' + id + ' 아레나가 실제로 돌았다');
    if (id !== 10) assert.ok(count(r.events, 'summon') >= 1, 'S' + id + ' 소환');
    t.diagnostic(`ARENA S${id} planBoss won units=${r.run.units.length} peak=${r.run.peak} weapon=${r.run.weapon} steps=${r.steps} arenaSteps=${r.arenaSteps} warn=${count(r.events, 'bossDashWarn')} shock=${count(r.events, 'bossShock')} lossShock=${r.run.lossByShock} lossTouch=${r.run.lossByTouch}`);
  }
  //  가만히 있으면 손해: center 는 광장에서 hits > 0 인 충격을 최소 1회 받는다
  const c = drive(10, 'center');
  const hitShocks = c.events.filter((e) => e.type === 'bossShock' && e.hits > 0);
  assert.ok(hitShocks.length >= 1, 'center 가 충격을 맞는다');
  t.diagnostic(`ARENA S10 center won=${c.run.won} units=${c.run.units.length} shocksHit=${hitShocks.length} lossShock=${c.run.lossByShock}`);
  //  소환 적(chase): 부대가 멈춰 있으면 STEP 마다 d.vz·STEP 씩 다가온다
  const run = createRun(synthArena({ startUnits: 10, hp: 1e9, summon: { every: 1, kind: 'grunt', n: 2, dx: 44, dz: -40 } }));
  enter(run, at(240));
  until(run, (r, ev) => ev.some((e) => e.type === 'summon'), at(240));
  const e = run.enemies.find((x) => x.chase);
  assert.ok(e && e.kind === 'grunt', '소환 적 chase');
  const vz = run.enemyDefs.grunt.vz;
  let prev = Math.hypot(e.x - run.x, e.z - squadZ(run));
  play(run, 30, at(240), (r) => {
    if (e.dead || prev <= vz * STEP) return;
    const d = Math.hypot(e.x - r.x, e.z - squadZ(r));
    assert.ok(Math.abs((prev - d) - vz * STEP) < 1e-6, '접근량 ' + (prev - d));
    prev = d;
  });
  //  botArena: 위협에서 가장 먼 후보(결정적)
  const bo = run.boss; bo.state = 'chase'; bo.x = 100; bo.z = run.z - 40;
  assert.deepEqual(botArena(run), { x: 380, ay: run.arena.depth[0] });
  bo.state = 'warn'; bo.dashTx = 380; bo.dashTz = run.z + 280;
  assert.deepEqual(botArena(run), { x: 100, ay: run.arena.depth[1] });
});

test('V3-ARENA A-11: 입력 모듈 — 터치 드래그 y 상대량·마우스 y 상대량(첫 이동 0)·W/S/↑/↓ → keyDirY·isSteerKey·pointerX 해제·reset·snapshot 소비', () => {
  const inp = createInput();
  inp.onPointerDown(100, 'touch', 1, 300);
  inp.onPointerMove(110, 'touch', 1, 320);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 10, keyDir: 0, dragDy: 20, keyDirY: 0 });
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 }, '소비');
  inp.onPointerMove(105, 'touch', 1, 290);
  //  둘째 손가락·마우스 이동은 세로도 섞이지 않는다
  inp.onPointerMove(200, 'touch', 2, 500); inp.onPointerMove(200, 'mouse', undefined, 700);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: -5, keyDir: 0, dragDy: -30, keyDirY: 0 });
  inp.onPointerUp(1);
  //  마우스: x 절대, y 상대(첫 이동 0)
  const m = createInput();
  m.onPointerMove(300, 'mouse', undefined, 400);
  assert.deepEqual(m.snapshot(), { pointerX: 300, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
  m.onPointerMove(310, 'mouse', undefined, 380);
  assert.deepEqual(m.snapshot(), { pointerX: 310, dragDx: 0, keyDir: 0, dragDy: -20, keyDirY: 0 });
  //  y 없는 종전 호출은 세로 0
  m.onPointerMove(320, 'mouse');
  assert.deepEqual(m.snapshot(), { pointerX: 320, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
  //  키
  const k = createInput();
  k.onPointerMove(200, 'mouse', undefined, 100);
  for (const code of ['ArrowUp', 'KeyW', 'ArrowDown', 'KeyS']) assert.equal(isSteerKey(code), true, code);
  assert.equal(k.onKey('ArrowDown', true), true);
  assert.deepEqual(k.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 1 }, '누르면 pointerX 해제');
  assert.equal(k.state.device, 'key');
  k.onKey('KeyW', true);
  assert.equal(k.snapshot().keyDirY, 0, '위+아래 = 0');
  k.onKey('ArrowDown', false);
  assert.equal(k.snapshot().keyDirY, -1);
  k.onKey('ArrowRight', true);
  assert.deepEqual(k.snapshot(), { pointerX: null, dragDx: 0, keyDir: 1, dragDy: 0, keyDirY: -1 });
  //  마우스를 움직이면 네 방향 키 전부 해제
  k.onPointerMove(150, 'mouse', undefined, 100);
  assert.deepEqual(k.snapshot(), { pointerX: 150, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
  assert.equal(k.state.up, false); assert.equal(k.state.right, false);
  //  드래그 중 키는 세로도 반영하지 않는다
  k.onPointerDown(100, 'touch', 3, 100);
  assert.equal(k.onKey('KeyS', true), true);
  assert.equal(k.snapshot().keyDirY, 0);
  //  reset
  k.onPointerMove(120, 'touch', 3, 140);
  k.reset();
  assert.deepEqual(k.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
  assert.equal(k.state.lastY, null); assert.equal(k.state.down, false);
});

//  가짜 ctx(rush3-render 방식): 호출을 순서대로 기록
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
function makeFxLike(o = {}) {
  return { parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {},
           shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null, lotOpen: 0, lotSeen: false, lotSame: false, ...o };
}
function drawRun(run, fxOver = {}, now = Math.PI / 9) {
  const { ctx, ops } = recCtx();
  //  r3.20 원근 투영: 이 검사는 장치의 '무엇을 어디에(트랙 좌표 기준)' 를 잠그므로 평면 변환(flat = 항등)으로 그린다 — 원근 기하는 V3-PROJECT 가 따로 잠근다
  createRenderer3(ctx, null).draw({ state: 'run', now, run, fx: makeFxLike(fxOver), hud: { distM: 0 }, buttons: [], saveOk: true, flat: true });
  return ops;
}
const texts = (ops) => ops.filter((o) => o.op === 'fillText').map((o) => o.args[0]);
const hasRect = (ops, a) => ops.some((o) => o.op === 'fillRect' && o.args.length === 4 && o.args.every((v, i) => v === a[i]));
//  r3.20: 도로·광장 바닥은 fillRect 가 아니라 다각형(사다리꼴)이다 — 왼쪽 가장자리 첫 점 moveTo(x, −10) 으로 폭을 읽는다(flat 이라 x 는 전 구간 같다)
const roadLeft = (ops, x) => ops.some((o) => o.op === 'moveTo' && o.args[0] === x && o.args[1] === -10);

test('V3-ARENA A-12: 렌더 — 광장 바닥 40~440·히어로 y = LINE_Y + ay·예고 원(dashTx, sy(dashTz), shock.r)·충격 링·안내 배너·HUD 아레나 전투!, 옛 fx 꼴에도 throw 없음, 도로는 80~400 그대로', () => {
  const run = createRun(synthArena({ startUnits: 5 }));
  enter(run, at(240));
  play(run, 60, at(240, { dragDy: -10000 }));
  assert.ok(run.ay < -100);
  const ops = drawRun(run);
  assert.ok(roadLeft(ops, 40), '광장 바닥 40~440');
  assert.ok(!roadLeft(ops, 80), '도로 폭은 그리지 않는다');
  assert.ok(ops.some((o) => o.op === 'ellipse'), '광장 타원');
  //  히어로 폴백(그림 없음): moveTo(px, py − 23), now = π/9 → bob ≈ 0
  const heroY = LINE_Y + run.ay - SQ.heroSize / 2;
  assert.ok(ops.some((o) => o.op === 'moveTo' && Math.abs(o.args[1] - heroY) < 1e-6), '히어로 y ' + heroY);
  assert.ok(texts(ops).includes('아레나 전투!'), texts(ops).filter((s) => String(s).includes('전투')).join('|'));
  assert.ok(texts(ops).some((t) => /^정예 \d+ \/ 500$/.test(String(t))), 'HUD 정예 막대 그대로');
  //  예고 원 + 점선
  until(run, (r) => r.boss.state === 'warn', at(240));
  const sy = (z) => LINE_Y - (z - run.z);
  const opsW = drawRun(run);
  const bo = run.boss, R = run.arena.boss.shock.r;
  const arcs = opsW.filter((o) => o.op === 'arc' && o.args[0] === bo.dashTx && o.args[1] === sy(bo.dashTz) && o.args[2] === R);
  assert.ok(arcs.length >= 2, '예고 원(채움 + 선): ' + arcs.length);
  assert.ok(opsW.some((o) => o.op === 'setLineDash' && Array.isArray(o.args[0]) && o.args[0][0] === 8), '보스→목표 점선');
  //  충격 링
  const opsS = drawRun(run, { shocks: [{ x: 100, y: 500, r: 70, t: 0.1, life: 0.45 }] });
  const k = 0.1 / 0.45;
  assert.ok(opsS.some((o) => o.op === 'arc' && o.args[0] === 100 && o.args[1] === 500 && Math.abs(o.args[2] - 70 * (0.5 + 0.9 * k)) < 1e-9), '충격 링');
  //  안내 배너(두 줄)
  const opsB = drawRun(run, { arenaT: 1, arenaText: ARENA_GUIDE_TEXT });
  assert.ok(texts(opsB).includes(ARENA_GUIDE_TEXT[0]) && texts(opsB).includes(ARENA_GUIDE_TEXT[1]));
  //  열리는 중(arenaOpen = 0.3 → k 0.5): 도로 폭 60~420
  const opsO = drawRun(run, { arenaOpen: 0.3 });
  assert.ok(roadLeft(opsO, 60), '열리는 중 보간');
  //  도로: 80~400, 아레나 전투 문구 없음
  const road = createRun(buildStage(1));
  play(road, 60, at(240));
  const opsR = drawRun(road);
  assert.ok(roadLeft(opsR, 80) && !roadLeft(opsR, 40));
  assert.ok(!texts(opsR).includes('아레나 전투!'));
});

//  셸 하네스(rush3-loop 의 bootFake 최소판 + pointermove 를 두드리는 canvas)
function fakeCanvas(textsOut) {
  const grad = { addColorStop() {} };
  const ctx = new Proxy({ canvas: null }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => { if (k === 'fillText') textsOut.push(String(args[0])); if (k.startsWith('create')) return grad; if (k === 'measureText') return { width: 10 }; return undefined; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const listeners = {};
  return { width: 480, height: 800, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }),
           addEventListener: (n, f) => { (listeners[n] ??= []).push(f); }, fire: (n, e) => { for (const f of listeners[n] ?? []) f(e); } };
}
function fakeWin() { const l = {}; return { devicePixelRatio: 1, addEventListener: (n, f) => { (l[n] ??= []).push(f); }, fire: (n, e = {}) => { for (const f of l[n] ?? []) f(e); } }; }
function fakeAudio() { const played = [], bgm = []; return { played, bgm, unlock() {}, sfx(n) { played.push(n); return true; }, bgmPlay(n) { bgm.push(n); }, bgmPause() {}, bgmResume() {}, setVolume() {}, getVolume() { return 1; }, setMuted() {}, isMuted() { return false; }, duck() {} }; }
function fakeStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }

test('V3-ARENA A-13: 셸 — 진입 프레임에 배너·열림 연출·lotWarn/gateClang 효과음, 마우스 세로 이동이 다음 STEP 의 ay 로, dbg 에 arena/ay/bossState, 결과·저장 version 2', async () => {
  const queue = [];
  let nowMs = 1000;
  const shown = [];
  const save = createSave3(fakeStorage());
  const audio = fakeAudio();
  const canvas = fakeCanvas(shown), win = fakeWin();
  const app = boot(canvas, { win, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save, audio, sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  const frames = (n) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  app.setDifficulty('normal');
  app.startRun(10);
  const run = () => app.getRun(), dbg = () => app.dbg();
  assert.equal(dbg().arena, false); assert.equal(dbg().bossState, null);
  let n = 0;
  while (!dbg().arena && n < 9000) { app.input.state.pointerX = pickX('planBoss', run()); frames(1); n++; }
  assert.equal(dbg().arena, true, '광장 진입');
  const fx = app.getFx();
  assert.ok(fx.arenaT > 0 && fx.arenaOpen > 0, '배너·열림 연출 타이머');
  assert.deepEqual(fx.arenaText, ARENA_GUIDE_TEXT);
  assert.ok(audio.played.includes('elite') && audio.bgm.some((b) => b.includes('boss')), '정예 등장 결선 재사용');
  shown.length = 0; frames(1);
  assert.ok(shown.includes(ARENA_GUIDE_TEXT[0]) && shown.includes('아레나 전투!'), shown.filter((s) => s.includes('드래그') || s.includes('전투')).join('|'));
  //  마우스 세로 이동(캔버스 CSS 240×400 = 논리 절반): 첫 이동은 기준만 잡고, 둘째 이동 −50 CSS = −100 화면 논리 px = −100/near 트랙 px → 다음 STEP 에 ay < 0
  app.input.state.pointerX = 240;
  canvas.fire('pointermove', { clientX: 120, clientY: 300, pointerType: 'mouse', pointerId: 1 });
  canvas.fire('pointermove', { clientX: 120, clientY: 250, pointerType: 'mouse', pointerId: 1 });
  assert.ok(Math.abs(app.input.state.dragDy - (-100 / NEAR)) < 1e-9, 'dragDy ' + app.input.state.dragDy);
  frames(1);
  assert.ok(run().ay < 0 && Math.abs(run().tay - (-100 / NEAR)) < 1e-9, 'ay ' + run().ay + ' tay ' + run().tay);
  assert.equal(typeof dbg().ay, 'number'); assert.ok(['chase', 'warn', 'dash', 'recover'].includes(dbg().bossState));
  //  예고·돌진 효과음
  audio.played.length = 0;
  n = 0;
  //  r3.18 재기준: 보호막 흡수음(gateClang)이 진입 직후부터 나므로 '첫 돌진이 끝난 뒤(recover)'까지 돌린다
  while (dbg().bossState !== 'recover' && n < 600) { const c = botArena(run()); app.input.state.pointerX = c.x; app.input.state.dragDy += c.ay - run().tay; frames(1); n++; }
  assert.ok(audio.played.includes('lotWarn') && audio.played.includes('gateClang'), audio.played.join(','));
  //  결과·저장
  n = 0;
  while (app.getState() !== 'result' && n < 6000) { const c = botArena(run()) ?? { x: 240, ay: 0 }; app.input.state.pointerX = c.x; if (run().boss) app.input.state.dragDy += c.ay - run().tay; frames(1); n++; }
  assert.equal(app.getState(), 'result');
  assert.equal(save.getStage(10, 3).cleared, true); assert.equal(save.getStage(10, 2).cleared, false, 'r3.21 이전 판 기록 칸은 따로'); assert.equal(save.getStage(10, 1).cleared, false, '근사 시절 기록 칸은 따로');
});

// ─────────────────────────────────────────────────────────────────────────────
test('V3-ARENA A-14: 셸 — 정지 중 pointermove 누적 → 재개 후 tay 불변(대항 검수 반영), 재개 뒤 첫 이동은 기준만 잡고 둘째 이동부터 tay 가 움직인다', async () => {
  const queue = [];
  let nowMs = 1000;
  const shown = [];
  const save = createSave3(fakeStorage());
  const audio = fakeAudio();
  const canvas = fakeCanvas(shown), win = fakeWin();
  const app = boot(canvas, { win, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save, audio, sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  const frames = (n) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  app.setDifficulty('normal');
  app.startRun(24);
  const run = () => app.getRun(), dbg = () => app.dbg();
  let n = 0;
  while (!dbg().arena && n < 9000) { app.input.state.pointerX = pickX('planBoss', run()); frames(1); n++; }
  assert.equal(dbg().arena, true, '광장 진입');
  //  마우스로 위쪽으로 옮겨 둔다(첫 이동 기준 → 둘째 이동 −100 화면 논리 = −100/near 트랙)
  canvas.fire('pointermove', { clientX: 120, clientY: 300, pointerType: 'mouse', pointerId: 1 });
  canvas.fire('pointermove', { clientX: 120, clientY: 250, pointerType: 'mouse', pointerId: 1 });
  frames(1);
  const tay0 = run().tay;
  assert.ok(Math.abs(tay0 - (-100 / NEAR)) < 1e-9, 'tay0 ' + tay0);
  //  ⏸ 정지(HUD 버튼 자리 클릭과 같은 경로) → 정지 중 마우스가 ⏸(y34) → [계속하기](y428) 로 크게 이동(CSS 절반 크기라 clientY 17 → 214)
  app.pause();
  assert.equal(app.getState(), 'paused');
  assert.equal(app.input.state.dragDy, 0, 'pause 가 입력을 비운다');
  canvas.fire('pointermove', { clientX: 222, clientY: 17, pointerType: 'mouse', pointerId: 1 });
  canvas.fire('pointermove', { clientX: 120, clientY: 214, pointerType: 'mouse', pointerId: 1 });
  canvas.fire('pointermove', { clientX: 120, clientY: 214, pointerType: 'mouse', pointerId: 1 });
  assert.equal(app.input.state.dragDy, 0, '정지 중 이동은 누적되지 않는다');
  assert.equal(app.input.state.lastY, null);
  app.resume();
  assert.equal(app.getState(), 'run');
  frames(3);
  assert.equal(run().tay, tay0, '재개 뒤 tay 불변(' + run().tay + ')');
  //  재개 뒤: 첫 이동은 기준만(0), 둘째 이동 +50 CSS = +100 화면 논리 = +100/near 트랙 → tay 0
  canvas.fire('pointermove', { clientX: 120, clientY: 200, pointerType: 'mouse', pointerId: 1 });
  frames(1);
  assert.equal(run().tay, tay0, '첫 이동은 기준만');
  canvas.fire('pointermove', { clientX: 120, clientY: 250, pointerType: 'mouse', pointerId: 1 });
  frames(1);
  assert.ok(Math.abs(run().tay - (tay0 + 100 / NEAR)) < 1e-9, 'tay ' + run().tay);
  //  ESC 재개 경로도 같다(keydown Escape → pause, 이동, Escape → resume)
  win.fire('keydown', { code: 'Escape' });
  assert.equal(app.getState(), 'paused');
  const tay1 = run().tay;
  canvas.fire('pointermove', { clientX: 240, clientY: 30, pointerType: 'mouse', pointerId: 1 });
  canvas.fire('pointermove', { clientX: 240, clientY: 380, pointerType: 'mouse', pointerId: 1 });
  win.fire('keydown', { code: 'Escape' });
  assert.equal(app.getState(), 'run');
  frames(3);
  assert.equal(run().tay, tay1, 'ESC 재개 뒤 tay 불변');
  //  타이틀·결과 화면의 pointermove 도 입력에 닿지 않는다
  app.toTitle();
  canvas.fire('pointermove', { clientX: 10, clientY: 10, pointerType: 'mouse', pointerId: 1 });
  canvas.fire('pointermove', { clientX: 200, clientY: 300, pointerType: 'mouse', pointerId: 1 });
  assert.equal(app.input.state.dragDy, 0); assert.equal(app.input.state.pointerX, null);
});
