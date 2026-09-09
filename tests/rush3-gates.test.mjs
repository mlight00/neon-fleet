// rush3-gates — 사격형 게이트 행 규칙(계약서 3-2 · 8장 V3-GATE / V3-GATE-SCROLL)을 잠근다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeGateRow, hitGateCell, passGateRow, cellAt, gateColor, gateLabel, sweepHitsGate, GATE_H } from '../rush3/gates.js';
import { makeSupply, sweepHitsSupply, hitSupply } from '../rush3/supply.js';
import { makeUnit, layoutUnits, formation } from '../rush3/squad.js';

const STEP = 1 / 60;
const SCROLL = 190;

// 테스트용 run: 실제 squad.js 유닛(makeUnit + layoutUnits). 콜백 주입 없음 — gates.js 가 squad.js 를 직접 호출한다.
function makeRun(n, x = 240) {
  const run = { z: 0, prevZ: 0, x, units: [], nextUnitId: 1, pendingRewards: [], missedSupplies: 0, badGatesPassed: 0, lossByGate: 0 };
  for (let i = 0; i < n; i++) run.units.push(makeUnit(run.nextUnitId++));
  layoutUnits(run.units);
  return run;
}
const bullet = (x, z = 0, pz = 0) => ({ x, z, pz, dmg: 1, gateHit: 1, dead: false });
const twoCells = (l, r, extra = {}) => makeGateRow({ id: 'g', z: 1140, maxValue: 15, cells: [{ x0: 80, x1: 240, value: l }, { x0: 240, x1: 400, value: r }], ...extra });
// 부대를 row.z 를 막 넘긴 STEP 상태로 둔다
const cross = (run, z) => { run.prevZ = z - 1; run.z = z; };

test('V3-GATE: −2 칸에 유효탄 3발 → +1 (0 이상으로 넘어가는 탄은 gateFlip)', () => {
  const row = twoCells(-2, 5), ev = [];
  const cell = row.cells[0];
  for (let i = 0; i < 3; i++) {
    const b = bullet(150);
    assert.equal(hitGateCell(cell, b, ev), true);
    assert.equal(b.dead, true, '탄은 흡수된다');
  }
  assert.equal(cell.value, 1);
  assert.deepEqual(ev.map((e) => e.type), ['gateHit', 'gateFlip', 'gateHit']);
  assert.equal(ev[1].value, 0);
  assert.equal(ev[0].id, 'g');
  assert.equal(cell.flashT, 0.12);
});

test('V3-GATE: 통과 시 칸 값만큼 병력 증가(+1 → 1명)', () => {
  const row = twoCells(0, 1), run = makeRun(3, 300), ev = [];
  cross(run, 1140);
  assert.equal(passGateRow(row, run, ev), true);
  assert.equal(run.units.length, 4);
  assert.equal(ev[0].type, 'gatePass');
  assert.deepEqual([ev[0].id, ev[0].value, ev[0].applied], ['g', 1, 1]);
  assert.equal(run.badGatesPassed, 0);
});

test('V3-GATE: 통과 뒤 탄 5발 → 값·병력 불변(passed 행은 후보 제외, 흡수도 없음)', () => {
  const row = twoCells(2, 3), run = makeRun(3, 300), ev = [];
  cross(run, 1140);
  passGateRow(row, run, ev);
  const before = row.cells.map((c) => c.value), n = run.units.length;
  for (let i = 0; i < 5; i++) {
    const b = bullet(300, 1150, 1130);
    assert.equal(sweepHitsGate(row, row.cells[1], b), false);
    assert.equal(b.dead, false);
  }
  assert.deepEqual(row.cells.map((c) => c.value), before);
  assert.equal(run.units.length, n);
  assert.equal(passGateRow(row, run, ev), false, '두 번 통과되지 않는다');
});

test('V3-GATE: maxValue 클램프(15 위로 올라가지 않음, 탄은 여전히 흡수)', () => {
  const row = twoCells(13, 0), ev = [];
  for (let i = 0; i < 10; i++) {
    const b = bullet(100);
    hitGateCell(row.cells[0], b, ev);
    assert.equal(b.dead, true);
  }
  assert.equal(row.cells[0].value, 15);
  assert.equal(row.cells[0].maxValue, 15);
  const r40 = makeGateRow({ id: 'h', z: 1, maxValue: 40, cells: [{ x0: 80, x1: 400, value: 39 }] });
  hitGateCell(r40.cells[0], bullet(100), ev);
  hitGateCell(r40.cells[0], bullet(100), ev);
  assert.equal(r40.cells[0].value, 40);
});

test('V3-GATE: 0 칸 통과 → 무효과(병력·손실·badGates 불변, passed 는 됨)', () => {
  const row = twoCells(0, 4), run = makeRun(5, 100), ev = [];
  cross(run, 1140);
  assert.equal(passGateRow(row, run, ev), true);
  assert.equal(run.units.length, 5);
  assert.equal(run.lossByGate, 0);
  assert.equal(run.badGatesPassed, 0);
  assert.equal(row.passed, true);
  assert.deepEqual([ev[0].value, ev[0].applied], [0, 0]);
});

test('V3-GATE: 음수 칸 통과 → 뒤에서 제거·lossByGate·badGatesPassed(병력보다 큰 값은 있는 만큼만)', () => {
  const row = twoCells(-6, 0), run = makeRun(4, 100), ev = [];
  cross(run, 1140);
  passGateRow(row, run, ev);
  assert.equal(run.units.length, 0);
  assert.equal(run.lossByGate, 4);
  assert.equal(run.badGatesPassed, 1);
  assert.equal(ev[0].applied, -4);
  const row2 = twoCells(-2, 0), run2 = makeRun(5, 100), ev2 = [];
  const backIds = [...run2.units].sort((a, b) => b.dy - a.dy).slice(0, 2).map((u) => u.id);
  cross(run2, 1140);
  passGateRow(row2, run2, ev2);
  assert.equal(run2.units.length, 3);
  assert.ok(run2.units.every((u) => !backIds.includes(u.id)), '뒤쪽(dy 큰 순)부터 빠진다');
  assert.deepEqual(run2.units.map((u) => [u.dx, u.dy]), formation(3).map((p) => [p.dx, p.dy]), '제거 후 layoutUnits 로 대형 재배치');
});

test('V3-GATE: squad.js 실제 run({ units:[makeUnit(1)], nextUnitId:2 })으로 +1 / −6 결합 검사', () => {
  const run = { z: 0, prevZ: 0, x: 300, units: [makeUnit(1)], nextUnitId: 2, pendingRewards: [], missedSupplies: 0, badGatesPassed: 0, lossByGate: 0 };
  const ev = [];
  cross(run, 1140);
  passGateRow(twoCells(0, 1), run, ev);
  assert.equal(run.units.length, 2);
  assert.deepEqual(run.units.map((u) => u.id), [1, 2]);
  assert.equal(run.nextUnitId, 3);
  assert.equal(run.units[1].hp, 2, 'makeUnit 으로 만든 실제 유닛');
  assert.deepEqual(run.units.map((u) => [u.dx, u.dy]), formation(2).map((p) => [p.dx, p.dy]), '추가 후 대형 재배치');
  assert.equal(ev.at(-1).applied, 1);
  const row = twoCells(0, -6);
  row.z = 1200;
  cross(run, 1200);
  passGateRow(row, run, ev);
  assert.equal(run.units.length, 0, '2명뿐이면 2명만 빠진다');
  assert.equal(run.lossByGate, 2);
  assert.equal(run.badGatesPassed, 1);
  assert.equal(ev.at(-1).applied, -2);
});

test('V3-GATE: 양수 칸도 unitCap 150 에서 클램프(applied = 실제 추가 수)', () => {
  const row = twoCells(0, 9), run = makeRun(148, 300), ev = [];
  cross(run, 1140);
  passGateRow(row, run, ev);
  assert.equal(run.units.length, 150);
  assert.deepEqual([ev[0].value, ev[0].applied], [9, 2]);
});

test('V3-GATE: 두 칸 행에서 중심 240 → 우 칸 적용(반열림 [240,400))', () => {
  const row = twoCells(-8, 3);
  assert.equal(cellAt(row, 240), row.cells[1]);
  assert.equal(cellAt(row, 239.999), row.cells[0]);
  assert.equal(cellAt(row, 80), row.cells[0]);
  assert.equal(cellAt(row, 400), null, '400 은 도로 밖');
  const run = makeRun(2, 240), ev = [];
  cross(run, 1140);
  passGateRow(row, run, ev);
  assert.equal(run.units.length, 5);
  assert.equal(ev[0].idx, 1);
});

test('V3-GATE: 중심 기준 1칸만 적용(둘 다 양수여도 한쪽만)', () => {
  const row = twoCells(7, 9), run = makeRun(1, 150), ev = [];
  cross(run, 1140);
  passGateRow(row, run, ev);
  assert.equal(run.units.length, 8);
  assert.equal(ev.length, 1);
});

test('V3-GATE: 행 단위 passed(한 칸을 통과하면 옆 칸도 이후 탄을 무시)', () => {
  const row = twoCells(1, 1), run = makeRun(1, 100), ev = [];
  cross(run, 1140);
  passGateRow(row, run, ev);
  assert.equal(row.passed, true);
  assert.equal(sweepHitsGate(row, row.cells[1], bullet(300, 1150, 1130)), false);
  assert.equal(sweepHitsGate(row, row.cells[0], bullet(100, 1150, 1130)), false);
});

test('V3-GATE: bypass 행(한 칸)에서 빈 길로 지나면 적용 없음·passed 만', () => {
  const row = makeGateRow({ id: 'b', z: 1140, bypass: true, cells: [{ x0: 240, x1: 400, value: 1 }] });
  const run = makeRun(3, 150), ev = [];
  cross(run, 1140);
  assert.equal(passGateRow(row, run, ev), true);
  assert.equal(run.units.length, 3);
  assert.equal(row.passed, true);
  assert.deepEqual([ev[0].value, ev[0].applied, ev[0].idx], [0, 0, -1]);
});

test('V3-GATE: prevZ < row.z <= z 가 아닌 STEP 은 통과가 아니다', () => {
  const row = twoCells(1, 1), run = makeRun(1, 100), ev = [];
  run.prevZ = 1100; run.z = 1139.9;
  assert.equal(passGateRow(row, run, ev), false);
  run.prevZ = 1140; run.z = 1145;
  assert.equal(passGateRow(row, run, ev), false, '경계는 prevZ 쪽이 열림');
  run.prevZ = 1139; run.z = 1140;
  assert.equal(passGateRow(row, run, ev), true, 'row.z == z 는 통과');
});

test('V3-GATE: 판정 형상 = z 구간 [row.z - h/2, row.z + h/2] × 칸 x 범위(스윕 겹침)', () => {
  const row = twoCells(1, 1);
  const c = row.cells[0];
  assert.equal(row.h, GATE_H);
  assert.equal(sweepHitsGate(row, c, bullet(100, 1127, 1115)), false, '아래 경계 직전');
  assert.equal(sweepHitsGate(row, c, bullet(100, 1128, 1116)), true, '아래 경계 접촉');
  assert.equal(sweepHitsGate(row, c, bullet(100, 1165, 1153)), false, '위 경계 지남');
  assert.equal(sweepHitsGate(row, c, bullet(100, 1200, 1100)), true, '한 STEP 에 통째로 건너뛰어도 스윕이 잡는다');
  assert.equal(sweepHitsGate(row, c, bullet(240, 1140, 1130)), false, 'x 240 은 좌 칸 밖');
  assert.equal(sweepHitsGate(row, row.cells[1], bullet(240, 1140, 1130)), true);
});

test('V3-GATE: 색·부호 표기(+ 파랑 / − 빨강 / 0 회색)', () => {
  assert.equal(gateColor(3), '#35E5FF');
  assert.equal(gateColor(-6), '#FF6A3D');
  assert.equal(gateColor(0), '#9AA1AC');
  assert.equal(gateLabel(3), '+3');
  assert.equal(gateLabel(-6), '−6');
  assert.equal(gateLabel(0), '0');
});

test('V3-GATE: makeGateRow 는 def 를 복사하고 초기값(passed/flashT/value 정수)을 보장한다', () => {
  const def = { id: 'g', z: 1140, cells: [{ x0: 80, x1: 240, value: -6.7 }] };
  const row = makeGateRow(def), row2 = makeGateRow(def);
  assert.notEqual(row.cells[0], row2.cells[0]);
  assert.deepEqual(row, row2);
  assert.equal(row.cells[0].value, -6);
  assert.equal(row.cells[0].maxValue, 15);
  assert.equal(row.passed, false);
  assert.equal(row.bypass, false);
  assert.equal(def.cells[0].flashT, undefined, 'def 는 건드리지 않는다');
});

// 스크롤 켠 상태에서 탄 위상 0~1(20분할)을 훑어 명중 100%, 게이트 뒤 통은 불변
test('V3-GATE-SCROLL: 탄 위상 20분할 전 구간에서 게이트 명중 100%·뒤 통 내구 불변', () => {
  const VZ = 700;
  for (let p = 0; p < 20; p++) {
    const row = twoCells(0, 0), sup = makeSupply({ id: 's', z: 1200, x: 300, kind: 'soldier', durability: 4, payload: { n: 2 } });
    const run = { z: 700, prevZ: 700, x: 300, pendingRewards: [] };
    const b = { x: 300, z: run.z + (p / 20) * VZ * STEP, pz: 0, dmg: 1, gateHit: 1, dead: false };
    b.pz = b.z;
    const ev = [];
    let hitGate = false;
    for (let i = 0; i < 200 && !b.dead && b.z < 1400; i++) {
      run.prevZ = run.z; run.z += SCROLL * STEP;
      b.pz = b.z; b.z += VZ * STEP;
      const cands = [];
      for (const c of row.cells) if (sweepHitsGate(row, c, b)) cands.push({ z: row.z, hit: () => hitGateCell(c, b, ev) });
      if (sweepHitsSupply(sup, b)) cands.push({ z: sup.z, hit: () => hitSupply(sup, b, ev, run) });
      if (!cands.length) continue;
      cands.sort((a, c) => a.z - c.z);
      cands[0].hit();
      hitGate = cands[0].z === row.z;
    }
    assert.equal(hitGate, true, `위상 ${p}/20 에서 게이트 명중`);
    assert.equal(row.cells[1].value, 1);
    assert.equal(sup.durability, 4, `위상 ${p}/20 에서 뒤 통 불변`);
  }
});
