// rush3-proto3 — r3.11(2026-09-19) 격리 시제품 '세 갈래': 3칸 게이트 + 사선만 막는 차폐물(kind 'cover').
//  완료 기준(실게임 구현계획 §7 착수 2): ① 3칸 행이 도로 80~400 을 빈틈없이 덮고 부대 중심 1칸만 적용 ② 차폐물이 탄을 흡수하고
//  통로는 막지 않는다 ③ 전용 검사 ④ 기존 검사 회귀 0(STAGE_IDS 불변 — 시제품은 목록 밖).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { STAGE_IDS, PROTO_IDS, buildStage } from '../rush3/stages.js';
import { cellAt } from '../rush3/gates.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { makeBullet } from '../rush3/weapons.js';
import { clampCenter, layoutUnits } from '../rush3/squad.js';

const NO = { pointerX: null, dragDx: 0, keyDir: 0 };
const play = (run, n, input = NO) => { const ev = []; for (let i = 0; i < n; i++) { stepRun(run, input, STEP); ev.push(...drainEvents(run)); } return ev; };

test('V3-PROTO3 P-1: 시제품은 STAGE_IDS 밖(격리)이고 buildStage 가 결정적으로 만든다', () => {
  assert.deepEqual(STAGE_IDS, [1, 2, 3]);
  assert.deepEqual(PROTO_IDS, ['proto3']);
  const a = buildStage('proto3'), b = buildStage('proto3');
  assert.deepEqual(a, b);
  assert.equal(a.gateRows.length, 2);
  assert.equal(a.walls.filter((w) => w.kind === 'cover').length, 2, '차폐물 2');
  assert.equal(a.walls.filter((w) => w.kind !== 'cover').length, 0, '진짜 벽 없음');
});

test('V3-PROTO3 P-2: 3칸 행이 도로 80~400 을 빈틈없이 덮는다(1px 마다 정확히 한 칸), 경계 400 은 없음', () => {
  const st = buildStage('proto3');
  for (const row of st.gateRows) {
    assert.equal(row.cells.length, 3);
    assert.equal(row.cells[0].x0, 80); assert.equal(row.cells[2].x1, 400);
    for (let i = 1; i < 3; i++) assert.equal(row.cells[i].x0, row.cells[i - 1].x1, '칸 경계가 맞물린다');
    for (let x = 80; x < 400; x += 1) {
      const hits = row.cells.filter((c) => x >= c.x0 && x < c.x1);
      assert.equal(hits.length, 1, `x=${x} 는 정확히 한 칸`);
      assert.equal(cellAt(row, x), hits[0]);
    }
    assert.equal(cellAt(row, 400), null); assert.equal(cellAt(row, 79.9), null);
  }
});

test('V3-PROTO3 P-3: 부대가 넓어도 통과 판정은 중심 1칸 — 중앙이면 idx 1, 왼쪽이면 idx 0 만 정확히 1회', () => {
  for (const [px, idx] of [[240, 1], [120, 0], [360, 2]]) {
    const run = createRun(buildStage('proto3'));
    //  부대를 넓게(12명) 만들어 여러 칸에 걸치게 한다
    run.units.length = 0; for (let i = 1; i <= 12; i++) run.units.push({ id: i, dx: 0, dy: 0, hp: 2, fireT: 1e9 });
    layoutUnits(run.units);
    const ev = play(run, Math.ceil(1700 / 60 / STEP), { pointerX: px, dragDx: 0, keyDir: 0 });
    const passes = ev.filter((e) => e.type === 'gatePass' && e.id === 'g1');
    assert.equal(passes.length, 1, `x=${px}: g1 통과 이벤트 1회`);
    assert.equal(passes[0].idx, idx, `x=${px}: 중심 칸 idx`);
  }
});

test('V3-PROTO3 P-4: 차폐물은 탄을 흡수하고(coverHit, 칸 값 불변) 그 x 밖의 탄은 게이트에 닿는다(gateHit)', () => {
  const run = createRun(buildStage('proto3'));
  for (const u of run.units) u.fireT = 1e9;
  const row = run.gateRows[0]; row.armed = true;   // 셔터는 이 검사의 대상이 아니다
  //  화면 앞 정리(cull.bulletAhead) 안에 차폐(1120~1160)·행(1500)이 들어오도록 부대를 z 900 에 둔다
  run.z = 900; run.prevZ = 900;
  const cover = run.covers[0];
  const before = row.cells.map((c) => c.value);
  //  차폐물 x 안(240)에서 차폐물 뒤(z 1000)에서 쏜 탄 → 흡수
  run.bullets.push(makeBullet('rifle', 240, 1000, 1));
  //  차폐물 x 밖(120)에서 쏜 탄 → 왼쪽 칸(−4)에 닿아 +1
  run.bullets.push(makeBullet('rifle', 120, 1000, 1));
  const ev = play(run, 60);
  assert.equal(ev.filter((e) => e.type === 'coverHit').length, 1, '차폐 흡수 1');
  assert.ok(ev.some((e) => e.type === 'gateHit' && e.id === 'g1' && e.idx === 0), '왼쪽 칸 피격');
  assert.equal(row.cells[1].value, before[1], '가운데 칸 값 불변');
  assert.equal(row.cells[0].value, before[0] + 1, '왼쪽 칸 +1');
  assert.ok(cover.x0 <= 240 && 240 < cover.x1);
});

test('V3-PROTO3 P-5: 차폐물은 통로를 막지 않는다 — run.walls 에 없고 clampCenter 가 그 x 를 허용하며 부대가 그 위를 지난다', () => {
  const run = createRun(buildStage('proto3'));
  assert.equal(run.walls.length, 0); assert.equal(run.covers.length, 2);
  const c = clampCenter(run, run.walls);
  assert.ok(c.dxLo < 0 && c.dxHi > 0);
  //  차폐물 1(x 190~290, z 1120~1160) 한가운데(240)로 붙여 두고 z 가 그 구간을 지나는 동안 x 가 240 에 머문다
  let inside = 0;
  for (let i = 0; i < 2400 && run.z < 1300; i++) {
    stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run);
    if (run.z >= 1120 && run.z <= 1160) { inside++; assert.ok(Math.abs(run.x - 240) < 1, 'z=' + run.z + ' x=' + run.x); }
  }
  assert.ok(inside > 0, '차폐 구간을 실제로 지났다');
  assert.ok(run.units.length > 0);
});

test('V3-PROTO3 P-6: 적탄도 차폐물에 막힌다(사선 차단은 양방향)', () => {
  const run = createRun(buildStage('proto3'));
  for (const u of run.units) u.fireT = 1e9;
  //  부대를 z 900 근처로 옮겨 적탄이 차폐물(1120~1160)을 지나 내려오게 한다
  run.z = 900; run.prevZ = 900;
  run.eshots.push({ x: 240, z: 1300, px: 240, pz: 1300, vx: 0, vz: 260, dmg: 1, r: 5, dead: false });
  run.eshots.push({ x: 100, z: 1300, px: 100, pz: 1300, vx: 0, vz: 260, dmg: 1, r: 5, dead: false });
  const u0 = run.units.length;
  const ev = play(run, 120);
  assert.ok(!ev.some((e) => e.type === 'hurt' && e.cause === 'shot' && Math.abs(e.x - 240) < 30), 'x240 적탄은 차폐에 막힌다');
  assert.ok(u0 >= run.units.length);
});
