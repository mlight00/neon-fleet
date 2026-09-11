// rush3-sim — 봇으로 기준 전투 3개를 실제 stepRun 으로 완주한다(계약서 8장 V3-SIM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage, STAGE_IDS } from '../rush3/stages.js';
import { BAL3 } from '../rush3/balance.js';
import { POLICIES, FIXED_POLICIES, playPolicy } from './lib/rush3-policies.mjs';

// 봇: 가장 가까운(z 최소) 미개봉 통 / 미회수 발판 / 미통과 게이트의 최대값 칸(음수·bypass 면 빈 길) 차선으로 pointerX
function botX(run) {
  let best = null, bz = Infinity;
  for (const s of run.supplies) {
    if (s.missed) continue;
    for (const p of s.pads) if (!p.taken && p.z > run.z && p.z < bz) { bz = p.z; best = p.x; }
    if ((s.opened && s.kind !== 'chain') || s.locked) continue;
    if (s.z > run.z && s.z < bz) { bz = s.z; best = s.x; }
  }
  for (const row of run.gateRows) {
    if (row.passed || row.z <= run.z || row.z >= bz) continue;
    let c = null;
    for (const k of row.cells) if (!c || k.value > c.value) c = k;
    bz = row.z;
    best = c.value < 0 && row.bypass ? (c.x0 === 80 ? 320 : 160) : (c.x0 + c.x1) / 2;
  }
  return best;
}

function playStage(id, pick, maxSteps = 7000) {
  const run = createRun(buildStage(id));
  const stats = { steps: 0, bossKillStep: -1, wonStep: -1, events: {} };
  while (!run.over && stats.steps < maxSteps) {
    stepRun(run, { pointerX: pick(run), dragDx: 0, keyDir: 0 }, STEP);
    for (const e of drainEvents(run)) {
      stats.events[e.type] = (stats.events[e.type] || 0) + 1;
      if (e.type === 'bossKill') stats.bossKillStep = stats.steps;
    }
    if (run.won && stats.wonStep < 0) stats.wonStep = stats.steps;
    stats.steps++;
  }
  return { run, stats };
}

for (const id of STAGE_IDS) {
  test(`V3-SIM: 봇이 S${id} 를 완주한다(정예 격파 → won, 120초 안)`, () => {
    const { run, stats } = playStage(id, botX);
    assert.equal(run.won, true, `S${id} 미완주: over=${run.over} units=${run.units.length} z=${run.z.toFixed(0)} t=${run.time.toFixed(1)}`);
    assert.ok(run.time < 120);
    assert.ok(stats.events.elite === 1 && stats.events.bossKill === 1);
    assert.equal(stats.wonStep, stats.bossKillStep, '정예 격파 후 1 STEP 안 won');
    assert.ok(run.peak > run.units.length - 1 && run.peak >= 2);
    assert.equal(run.enemies.length, 0);
  });
}

test('V3-SIM: 무조작 봇(x 240 고정)이 S1 을 완주한다', () => {
  const { run, stats } = playStage(1, () => 240);
  assert.equal(run.won, true, `무조작 S1 미완주: units=${run.units.length} z=${run.z.toFixed(0)}`);
  assert.equal(run.x, 240);
  assert.equal(stats.wonStep, stats.bossKillStep);
  // 좌 −9 게이트는 우회(빈 길), 통 두 개(x 150/330)는 놓친다
  assert.equal(run.badGatesPassed, 0);
  assert.equal(run.missedSupplies, 2);
});

// 난이도 튜닝(2026-09-10, 기획 §10 "초반에는 명확한 성공 경로를 보장" = S1 만). S2·S3 는 조작(우회·통 사격) 없이는 실패해야 한다.
//  S2: 첫 게이트 우 칸 −20 은 2명 소총(화면 안 약 19발)으로 뒤집히지 않아 1명으로 줄고, 중앙 부근 돌격체(x 215/265)에 접촉해 전멸.
//  S3: 병사 통 3개·컨테이너가 x 160/320 에 있어 x 240 고정 사격이 닿지 않고(3명 유지), 게이트 우 칸 −25 → +4 로 7명. 정예(hp 500)를 못 깎고 부채꼴 탄에 전멸.
for (const id of [2, 3]) {
  test(`V3-SIM-NOOP: 무조작은 S${id} 에서 실패한다(units 0 → over, won 아님)`, () => {
    const { run, stats } = playStage(id, () => 240);
    assert.equal(run.over, true, `무조작 S${id} 가 끝나지 않음: z=${run.z.toFixed(0)} units=${run.units.length}`);
    assert.equal(run.won, false, `무조작 S${id} 완주됨: units=${run.units.length} peak=${run.peak}`);
    assert.equal(run.units.length, 0);
    assert.equal(stats.events.lose, 1);
    assert.equal(stats.events.win, undefined);
    assert.ok(run.z < run.length, `실패 지점 z=${run.z.toFixed(0)} 은 스테이지 길이 안(정예 발동 시 z 는 정예 z + 1 STEP 에서 멈춘다)`);
    // 성장 자체가 막힌다: 조준 봇 최대 병력의 1/4 미만
    const aim = playStage(id, botX);
    assert.ok(run.peak * 4 < aim.run.peak, `무조작 peak ${run.peak} vs 조준 봇 peak ${aim.run.peak}`);
  });
}

test('V3-SIM: 같은 입력열이면 두 판의 최종 상태가 같다(결정성)', () => {
  const a = playStage(2, botX), b = playStage(2, botX);
  const pick = (r) => ({ z: r.z, x: r.x, units: r.units.map((u) => [u.id, u.hp, u.dx, u.dy]), kills: r.kills, time: r.time, weapon: r.weapon, peak: r.peak });
  assert.deepEqual(pick(a.run), pick(b.run));
  assert.deepEqual(a.stats, b.stats);
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-SIM-POLICY — 8정책 × 3스테이지 = 24판(계약서 8장 · 개정 r3 §5-2·§10).
//  이 표는 **봇 정책의 결과**다. 사람의 성공률이 아니며 1판 결정적 시뮬이라 분포도 아니다.
// ─────────────────────────────────────────────────────────────────────────────
const RUNS = {};
for (const id of STAGE_IDS) for (const p of POLICIES) RUNS[id + ':' + p] = playPolicy(id, p);
const R = (id, p) => RUNS[id + ':' + p];
//  S3 z4000 행에서 어느 칸을 통과했는지(idx 0 = 좌 +3 상한 12, idx 1 = 우 −25 상한 40)
const gateCell = (id, p, rowId) => R(id, p).gates.find((g) => g.id === rowId) ?? null;
const openedSet = (id, p) => new Set(R(id, p).opened);

test('V3-SIM-POLICY POL-1: 24판 전부 상한(14,400 STEP) 안에서 종료된다', () => {
  for (const id of STAGE_IDS) for (const p of POLICIES) {
    const r = R(id, p);
    assert.equal(r.run.over, true, `S${id} ${p} 가 끝나지 않음(steps=${r.steps} z=${r.run.z.toFixed(0)})`);
    assert.ok(r.steps < 14400);
  }
});

test('V3-SIM-POLICY POL-2: S1 center 성공 유지(입문 안전 경로)', () => {
  const r = R(1, 'center');
  assert.equal(r.run.won, true, `S1 center 미완주: units=${r.run.units.length} z=${r.run.z.toFixed(0)}`);
  assert.equal(r.run.x, 240);
  //  잡졸 track 0 으로 바뀌어도 무조작 완주가 깨지지 않는다(개정 r3 §2-3)
  assert.equal(BAL3.enemies.grunt.track, 0);
  assert.equal(r.run.lossByTouch, 0, '새 스폰 열은 무조작 부대와 접촉하지 않는다');
});

test('V3-SIM-POLICY POL-3: S2 center 실패 · S2 plan·aim 성공', () => {
  const c = R(2, 'center').run;
  assert.equal(c.units.length, 0);
  assert.equal(c.won, false);
  for (const p of ['plan', 'aim']) assert.equal(R(2, p).run.won, true, `S2 ${p} 미완주`);
  //  center±1 도 우 칸(−20)을 만나는 center+1 은 실패, 좌 칸으로 넘어가는 center−1 은 저성적 성공
  assert.equal(R(2, 'center+1').run.won, false);
});

test('V3-SIM-POLICY POL-4: S2 aim 은 벽 쌍 w1 중 정확히 1개만 opened, 나머지는 skipped(missed 아님)', () => {
  const run = R(2, 'aim').run;
  const pair = run.supplies.filter((s) => s.pairId === 'w1');
  assert.equal(pair.length, 2);
  assert.equal(pair.filter((s) => s.opened).length, 1);
  const other = pair.find((s) => !s.opened);
  assert.equal(other.skipped, true, '반대편 통은 구조적 획득 불가 = skipped');
  assert.equal(other.missed, false);
  assert.ok(run.skippedSupplies >= 1);
});

test('V3-SIM-POLICY POL-5: S3 plan 성공 · plan.peak >= 1.25 × max(left.peak, right.peak)', () => {
  const plan = R(3, 'plan').run, left = R(3, 'left').run, right = R(3, 'right').run;
  assert.equal(plan.won, true);
  const base = Math.max(left.peak, right.peak);
  assert.ok(plan.peak >= 1.25 * base, `plan.peak ${plan.peak} < 1.25 × ${base}`);
  //  고정 경로 독점 해소: 좌·우 고정은 계획 이동의 80% 이하
  assert.ok(left.peak <= 0.8 * plan.peak, `left.peak ${left.peak} / plan ${plan.peak}`);
  assert.ok(right.peak <= 0.8 * plan.peak, `right.peak ${right.peak} / plan ${plan.peak}`);
});

test('V3-SIM-POLICY POL-6: S3 화력 지수(생존 × 무기 초당 dmg)에서도 plan >= 1.25 × max(left, right)', () => {
  const p = R(3, 'plan').power, l = R(3, 'left').power, r = R(3, 'right').power;
  assert.ok(p >= 1.25 * Math.max(l, r), `plan ${p} vs left ${l} / right ${r}`);
});

test('V3-SIM-POLICY POL-7: S3 고정 정책 5종은 금지 조합을 얻지 못한다(개수 상한이 아니라 조합 금지)', () => {
  const st = buildStage(3);
  const chainId = st.supplies.find((s) => s.kind === 'chain').id;                  // p1 좌 = 연속증원
  const heavyId = st.supplies.find((s) => s.payload.weapon === 'heavy').id;        // p2 우 = 중화기
  const lateId = st.supplies.find((s) => s.z === 6300).id;                         // wD 좌 = 병사 10
  for (const p of FIXED_POLICIES) {
    const got = openedSet(3, p);
    const g = gateCell(3, p, 'g1');
    const maxRight = g && g.idx === 1 && g.value === 40;
    assert.ok(!(got.has(chainId) && maxRight), `S3 ${p}: 연속증원 + 우 칸 상한(+40) 동시 획득`);
    assert.ok(!(got.has(heavyId) && got.has(lateId)), `S3 ${p}: 중화기 + z6300 병사 통 동시 획득`);
  }
});

test('V3-SIM-POLICY POL-8: S3 plan.peak > sway.peak 이고 plan.peak >= aim.peak — 구분 축은 z4000 게이트 칸 선택', () => {
  const plan = R(3, 'plan').run, sway = R(3, 'sway').run, aim = R(3, 'aim').run;
  assert.ok(plan.peak > sway.peak, `plan ${plan.peak} vs sway ${sway.peak}`);
  assert.ok(plan.peak >= aim.peak, `plan ${plan.peak} vs aim ${aim.peak}`);
  //  두 판의 게이트 결과가 실제로 갈렸는가: 탐욕 봇은 '지금 값이 큰' 좌 +3(상한 12), plan 은 우 −25(상한 40)
  const gp = gateCell(3, 'plan', 'g1'), ga = gateCell(3, 'aim', 'g1');
  assert.deepEqual([gp.idx, gp.value], [1, 40], 'plan 은 우 칸을 상한까지 채운다');
  assert.deepEqual([ga.idx, ga.value], [0, 12], 'aim 은 좌 칸(상한 12)에 선다');
  //  3900 통은 둘 다 먹는다(r3.2 정정: 구분 축은 통이 아니다)
  const lateCrate = buildStage(3).supplies.find((s) => s.z === 3900).id;
  assert.ok(openedSet(3, 'plan').has(lateCrate) && openedSet(3, 'aim').has(lateCrate));
});

test('V3-SIM-POLICY POL-9: 선택 C 저울 — 3900 통을 연 판은 우 칸 상한 미만이거나 좌 칸 통과(병력 상한 초과는 예외 기록)', () => {
  const crate = buildStage(3).supplies.find((s) => s.z === 3900).id;
  //  4-4 실측 저울이 성립하는 병력 상한(그 위 대군은 통과 +40 을 둘 다 가져간다 — 감추지 않고 기록한다)
  const CAP = { rifle: 30, auto: 12, heavy: 25 };
  const exceptions = [];
  for (const p of POLICIES) {
    if (!openedSet(3, p).has(crate)) continue;
    const g = gateCell(3, p, 'g1');
    const both = g && g.idx === 1 && g.value === 40;
    if (!both) continue;
    const r = R(3, p).run;
    exceptions.push({ policy: p, weapon: r.weapon, peak: r.peak, gate: g.value });
  }
  //  예외 판은 실패시키지 않는다. 다만 '상한 초과' 라는 설명이 성립해야 한다(그 지점에서 상한을 넘는 병력이었다)
  for (const e of exceptions) {
    assert.ok(e.peak > (CAP[e.weapon] ?? 30),
      `S3 ${e.policy}: 통 + 우 칸 +40 을 둘 다 얻었는데 병력(${e.peak} ${e.weapon})이 저울 상한(${CAP[e.weapon]}) 이하다`);
  }
  //  plan 은 이 예외의 대표 사례로 예상된다(개정 r3 §4-4)
  assert.ok(exceptions.some((e) => e.policy === 'plan'), '예외 목록: ' + JSON.stringify(exceptions));
});

test('V3-GRUNT-STRAIGHT: 잡졸은 스폰 열을 그대로 직진한다(부대가 좌우로 크게 움직여도 x 불변)', () => {
  assert.equal(BAL3.enemies.grunt.track, 0);
  //  게이트·통이 없는 빈 코스에 잡졸만 넣고 부대를 좌우로 크게 흔든다(사격에 죽지 않게 hp 를 크게)
  const run = createRun({ id: 'g', version: 2, title: 'grunt', startUnits: 6, startWeapon: 'rifle',
                          length: 100000, eliteZ: null, gateRows: [], supplies: [], walls: [], spawns: [], elite: null });
  const xs = new Map();
  for (const x of [100, 160, 240, 320, 380]) {
    const e = { id: run.nextEnemyId++, kind: 'grunt', x, z: 5000, px: x, pz: 5000, vz: 60, hp: 99999, r: 14, dead: false, touched: false };
    run.enemies.push(e);
    xs.set(e.id, x);
  }
  let moved = 0;
  for (let i = 0; i < 600; i++) {
    stepRun(run, { pointerX: Math.floor(i / 30) % 2 ? 100 : 380, dragDx: 0, keyDir: 0 }, STEP);
    drainEvents(run);
    for (const e of run.enemies) if (e.kind === 'grunt' && xs.get(e.id) !== e.x) moved++;
  }
  assert.equal(xs.size, 5);
  assert.equal(run.enemies.length, 5, '잡졸이 사라지지 않았다');
  assert.equal(moved, 0, '잡졸 x 가 부대를 따라 움직였다');
});
