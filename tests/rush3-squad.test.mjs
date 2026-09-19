// rush3-squad — 대형·유닛·통로 제약(계약서 3-5·3-6)을 잠근다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SQUAD_DEFAULTS, formation, formationHalfWidth, makeUnit, layoutUnits, compressUnits,
  clampCenter, hitUnit, overlappingUnits, frontmostUnit, removeUnits, addUnits,
} from '../rush3/squad.js';

const R = SQUAD_DEFAULTS.unitR;
const WALL = { id: 'w1', z0: 1800, z1: 3000, x0: 228, x1: 252 };

function mkRun(n, x = 240, z = 0, prevZ = null) {
  const run = { x, tx: x, z, prevZ: prevZ === null ? z : prevZ, units: [], nextUnitId: 1, wallSide: {} };
  addUnits(run, n, 0.5);
  return run;
}
function unitXs(run) { return run.units.map((u) => run.x + u.dx); }
function inCorridor(run, lo, hi) { return unitXs(run).every((ux) => ux - R >= lo && ux + R <= hi); }

test('V3-SQUAD: formation 은 히어로(0,0) 중심·중복 없음·전방 90도 개방', () => {
  for (const n of [1, 2, 7, 30, 60, 150]) {
    const f = formation(n);
    assert.equal(f.length, n);
    assert.deepEqual(f[0], { dx: 0, dy: 0 });
    const keys = new Set(f.map((p) => p.dx + ',' + p.dy));
    assert.equal(keys.size, n, `n=${n} 오프셋 중복`);
    for (let i = 1; i < n; i++) {
      // 전방(dy<0) 부채꼴 ±45도 안에는 병사가 없다: |dx| > -dy
      const p = f[i];
      if (p.dy < 0) assert.ok(Math.abs(p.dx) > -p.dy - 1, `n=${n} i=${i} 전방 개방 위반 ${JSON.stringify(p)}`);
    }
  }
  assert.equal(formation(0).length, 0);
});

test('V3-SQUAD: formationHalfWidth = |dx| 최대 + unitR, n 이 커질수록 단조 증가', () => {
  assert.equal(formationHalfWidth(1), R);
  let prev = 0;
  for (const n of [1, 5, 10, 30, 60, 150]) {
    const f = formation(n);
    const m = Math.max(...f.map((p) => Math.abs(p.dx)));
    assert.equal(formationHalfWidth(n), m + R);
    assert.ok(formationHalfWidth(n) >= prev);
    prev = formationHalfWidth(n);
  }
});

test('V3-SQUAD: makeUnit 위상·hp, layoutUnits 재부여(id 유지)', () => {
  const u = makeUnit(3, 0.6);
  assert.equal(u.hp, 2);
  assert.equal(u.fireT, ((3 * 7) % 12) / 12 * 0.6);
  assert.equal(makeUnit(12, 0.5).fireT, 0);
  const units = [makeUnit(1), makeUnit(2), makeUnit(3), makeUnit(4)];
  layoutUnits(units);
  const f = formation(4);
  units.forEach((x, i) => { assert.equal(x.dx, f[i].dx); assert.equal(x.dy, f[i].dy); assert.equal(x.id, i + 1); });
  units.splice(1, 1);
  layoutUnits(units);
  const f3 = formation(3);
  assert.deepEqual(units.map((x) => x.id), [1, 3, 4]);
  units.forEach((x, i) => assert.equal(x.dx, f3[i].dx));
});

test('V3-SQUAD: compressUnits 는 좌·우 비례 압축, 필요 없으면 formation 값 유지, 넓어지면 복원', () => {
  const units = layoutUnits(Array.from({ length: 30 }, (_, i) => makeUnit(i + 1)));
  const f = formation(30);
  const minDx = Math.min(...f.map((p) => p.dx)), maxDx = Math.max(...f.map((p) => p.dx));
  assert.ok(minDx < -20 && maxDx > 20);
  compressUnits(units, -20, 10);
  for (const u of units) assert.ok(u.dx >= -20 && u.dx <= 10, `dx ${u.dx}`);
  assert.equal(Math.min(...units.map((u) => u.dx)), -20);
  assert.equal(Math.max(...units.map((u) => u.dx)), 10);
  // 부호는 보존, 0 은 0
  units.forEach((u, i) => assert.equal(Math.sign(u.dx), Math.sign(f[i].dx)));
  compressUnits(units, -500, 500);
  units.forEach((u, i) => assert.equal(u.dx, f[i].dx));
});

test('V3-WALL: x 240 무조작 진입 → 한쪽 통로 스냅, lo<=hi, 유닛 dx 통로 안(n=1)', () => {
  const run = mkRun(1, 240, 1741, 1738);
  const c = clampCenter(run, [WALL]);
  assert.equal(run.wallSide.w1, 'L');
  assert.ok(c.lo <= c.hi);
  assert.ok(run.x >= c.lo && run.x <= c.hi);
  assert.ok(run.x + R <= WALL.x0, '벽 안에 남지 않음');
  compressUnits(run.units, c.dxLo, c.dxHi);
  assert.ok(inCorridor(run, 80, 228));
});

test('V3-WALL: n=60 진입 → 반폭이 통로에 맞게 줄고 유닛 전원 통로 안', () => {
  const run = mkRun(60, 240, 1741, 1738);
  assert.ok(formationHalfWidth(60) > 68, '60명 대형은 통로 반폭보다 넓어야 압축이 의미 있다');
  const c = clampCenter(run, [WALL]);
  assert.equal(run.wallSide.w1, 'L');
  assert.ok(c.lo <= c.hi);
  assert.equal(c.hw, (228 - 80) / 2 - 6);
  compressUnits(run.units, c.dxLo, c.dxHi);
  assert.ok(inCorridor(run, 80, 228), `유닛 x 범위 ${Math.min(...unitXs(run))}~${Math.max(...unitXs(run))}`);
});

test('V3-WALL: 오른쪽에서 진입하면 R, 중앙이면 tx 로 결정, 벽 끝 뒤 해제', () => {
  const r1 = mkRun(3, 300, 1741, 1738);
  clampCenter(r1, [WALL]);
  assert.equal(r1.wallSide.w1, 'R');
  assert.ok(r1.x - R >= WALL.x1);
  const r2 = mkRun(3, 240, 1741, 1738);
  r2.tx = 300;
  clampCenter(r2, [WALL]);
  assert.equal(r2.wallSide.w1, 'R');
  // 활성 구간에서는 진입 때 정한 쪽을 유지(중심이 반대편에 있어도 뒤집히지 않는다)
  r2.x = 100; r2.tx = 100; r2.prevZ = 2000; r2.z = 2003;
  const c = clampCenter(r2, [WALL]);
  assert.equal(r2.wallSide.w1, 'R');
  assert.ok(r2.x >= c.lo && c.lo >= WALL.x1);
  // 벽 끝 뒤 해제 → 도로 범위
  r2.prevZ = 2999; r2.z = 3002;
  const c2 = clampCenter(r2, [WALL]);
  assert.equal(r2.wallSide.w1, undefined);
  assert.equal(c2.wallId, null);
  assert.equal(c2.lo, 80 + formationHalfWidth(3));
  assert.equal(c2.hi, 400 - formationHalfWidth(3));
});

test('V3-WALL: 벽 밖 도로 클램프는 hw\' = min(반폭, 60), tx 도 범위로 클램프', () => {
  const run = mkRun(150, 50, 100, 97);
  run.tx = 740;
  const c = clampCenter(run, [WALL]);
  assert.ok(formationHalfWidth(150) > 60);
  assert.equal(c.lo, 140);
  assert.equal(c.hi, 340);
  assert.equal(run.x, 140);
  assert.equal(run.tx, 340);
  // 벽 안에서도 tx 클램프
  const r2 = mkRun(5, 150, 1741, 1738);
  r2.tx = 740;
  const c2 = clampCenter(r2, [WALL]);
  assert.equal(r2.tx, c2.hi);
  assert.ok(c2.hi + R <= WALL.x0);
});

test('V3-HIT: hitUnit — 빈틈 통과 시 null, 겹치면 명중, 스윕 지원(후보 0~1명)', () => {
  const run = mkRun(2, 240, 1000);
  // n=2 실측 formation: 히어로(0,0)·병사(24,-10) → 절대 (240,1000)·(264,1010). x=+40=280 열은 어느 원에도 안 닿는다(r 5 탄, 간격 16 > 14)
  assert.deepEqual(formation(2), [{ dx: 0, dy: 0 }, { dx: 24, dy: -10 }]);
  assert.equal(hitUnit(run.units, 240 + 40, 1000, 5, { z: 1600 }, run), null);
  // x=240 열: 히어로만 후보(병사는 거리 24 > 14)
  const h = hitUnit(run.units, 240, 1000 - 30, 5, { z: 1600 }, run);
  assert.equal(h && h.id, 1);
  // x=258 열: 병사(264,1010)까지 6 ≤ 14 로 후보, 히어로는 18 > 14 로 후보 아님 → 병사
  const s = hitUnit(run.units, 258, 990, 5, { z: 1600 }, run);
  assert.equal(s && s.id, 2);
  // 원만(스윕 없음): 유닛 사이 점
  assert.equal(hitUnit(run.units, 240 + 60, 1000, 5, null, run), null);
  assert.equal(hitUnit(run.units, 240, 1000, 5, null, run).id, 1);
  // 스윕이 도중에 끝나(z 1100 → 1050) 유닛에 못 미치면 null
  assert.equal(hitUnit(run.units, 240, 1050, 5, { z: 1100 }, run), null);
});

test('V3-HIT: 후보 2명 이상 — 스윕은 진행 방향에서 먼저 닿는 유닛, 원만이면 거리 최소 유닛(n=7 대형)', () => {
  const run = mkRun(7, 240, 1000);
  // 실측 formation(7): id2 (24,-10)→(264,1010), id3 (24,10)→(264,990), id4 (10,24)→(250,976)
  assert.deepEqual(formation(7).slice(1, 4), [{ dx: 24, dy: -10 }, { dx: 24, dy: 10 }, { dx: 10, dy: 24 }]);
  // (a) 스윕 x=266, z 1600→900, r 5: id2·id3 거리 2 로 둘 다 후보, id4 는 16 > 14 로 제외.
  //     적탄은 z 감소 방향으로 오므로 z 큰 id2(1010)에 먼저 닿는다 — 거리는 둘 다 같아 t 가 결정한다
  const both = overlappingUnits(run.units, 266, 900, 5, { z: 1600 }, run);
  assert.deepEqual(both.map((u) => u.id).sort(), [2, 3]);
  assert.equal(hitUnit(run.units, 266, 900, 5, { z: 1600 }, run).id, 2);
  // 반대 방향 스윕(z 900→1600, 뒤에서 앞으로)이면 id3 이 먼저
  assert.equal(hitUnit(run.units, 266, 1600, 5, { x: 266, z: 900 }, run).id, 3);
  // (b) 원만(r 10, 판정 반경 19): (266,993) → id3 거리 3.6·id2 거리 17.1 둘 다 후보 → 거리 최소 id3
  assert.deepEqual(overlappingUnits(run.units, 266, 993, 10, null, run).map((u) => u.id).sort(), [2, 3]);
  assert.equal(hitUnit(run.units, 266, 993, 10, null, run).id, 3);
  // 같은 두 후보라도 원 중심이 id2 쪽(266,1007)이면 id2 — 배열 순서가 아니라 거리가 결정한다
  assert.deepEqual(overlappingUnits(run.units, 266, 1007, 10, null, run).map((u) => u.id).sort(), [2, 3]);
  assert.equal(hitUnit(run.units, 266, 1007, 10, null, run).id, 2);
  // 수동 units: 앞줄(dy -30)·히어로·뒷줄(dy 30) 한 열. 스윕은 앞줄 먼저, 원 중심이 히어로 쪽이면 히어로
  const col = [{ id: 1, dx: 0, dy: 0, hp: 2 }, { id: 2, dx: 0, dy: -30, hp: 2 }, { id: 3, dx: 0, dy: 30, hp: 2 }];
  assert.equal(hitUnit(col, 240, 900, 5, { z: 1600 }, run).id, 2);
  assert.equal(hitUnit(col, 240, 995, 30, null, run).id, 1);
  // hp 0 유닛은 후보에서 빠진다 → 그 다음 유닛
  col[1].hp = 0;
  assert.equal(hitUnit(col, 240, 900, 5, { z: 1600 }, run).id, 1);
});

test('V3-HIT: overlappingUnits 는 겹친 유닛 전부, frontmostUnit 과 조합하면 접촉 규칙(앞줄 1명)', () => {
  const run = mkRun(7, 240, 1000);
  // 스윕 x=266: id2(dy -10, 앞줄)·id3(dy 10) 2명과 겹친다
  const hits = overlappingUnits(run.units, 266, 900, 5, { z: 1600 }, run);
  assert.equal(hits.length, 2);
  const front = frontmostUnit(hits);
  assert.equal(front.id, 2);
  assert.equal(front.dy, Math.min(...hits.map((u) => u.dy)));
  // 앞줄 ≠ 가장 가까운: 뒤(z 작은 쪽, z 900→)에서 오는 스윕은 hitUnit 이 id3 을 고르지만 앞줄은 여전히 id2
  const back = overlappingUnits(run.units, 266, 1600, 5, { x: 266, z: 900 }, run);
  assert.equal(back.length, 2);
  assert.equal(hitUnit(run.units, 266, 1600, 5, { x: 266, z: 900 }, run).id, 3);
  assert.equal(frontmostUnit(back).id, 2);
  // 빈틈이면 빈 배열, frontmostUnit(빈 배열) = null
  const none = overlappingUnits(run.units, 280, 900, 5, { z: 1600 }, run);
  assert.deepEqual(none, []);
  assert.equal(frontmostUnit(none), null);
  // hp ≤ 0 은 제외
  run.units[1].hp = 0;
  assert.deepEqual(overlappingUnits(run.units, 266, 900, 5, { z: 1600 }, run).map((u) => u.id), [3]);
});

test('V3-WALL: compressUnits 는 상대 범위(dxLo/dxHi)를 받는다 — clampCenter 결과로 호출해도 대형이 뭉개지지 않음', () => {
  const run = mkRun(60, 240, 1741, 1738);
  const c = clampCenter(run, [WALL]);
  // n=60(반폭 111)은 통로(148)보다 넓어 hw = 68 → 중심 허용 범위는 여유 2·wallMargin = 12 뿐
  assert.equal(c.hw, 68);
  assert.equal(c.hi - c.lo, 2 * SQUAD_DEFAULTS.wallMargin);
  // formation(60) 실측 dx 범위 −83~102 → 양쪽 다 압축된다
  const f60 = formation(60);
  assert.ok(Math.min(...f60.map((p) => p.dx)) < c.dxLo && Math.max(...f60.map((p) => p.dx)) > c.dxHi);
  assert.equal(c.dxLo, c.edgeLo + R - run.x);
  assert.equal(c.dxHi, c.edgeHi - R - run.x);
  // 계약서 3-5 문장 '[가장자리 lo − run.x, 가장자리 hi − run.x]'(유닛 원 반경 포함)와 같은 값
  assert.equal(c.dxLo, 80 + R - run.x);
  assert.equal(c.dxHi, 228 - R - run.x);
  compressUnits(run.units, c.dxLo, c.dxHi);
  const xs = unitXs(run);
  assert.ok(inCorridor(run, 80, 228));
  // 뭉개지지 않음: 대형이 통로 안쪽 폭(148 − 2R = 130)을 거의 다 쓴다(좌·우 각각 절반 이상 펼침)
  assert.ok(Math.max(...xs) - Math.min(...xs) >= 120, `대형 폭 ${Math.max(...xs) - Math.min(...xs)}`);
  assert.ok(Math.min(...run.units.map((u) => u.dx)) <= -50);
  assert.ok(Math.max(...run.units.map((u) => u.dx)) >= 50);
  // 벽 밖(n=5, 여유 있음)에서는 clampCenter 결과로 호출해도 formation 그대로
  const r2 = mkRun(5, 240, 100, 97);
  const c2 = clampCenter(r2, [WALL]);
  compressUnits(r2.units, c2.dxLo, c2.dxHi);
  const f5 = formation(5);
  r2.units.forEach((u, i) => { assert.equal(u.dx, f5[i].dx); assert.equal(u.dy, f5[i].dy); });
});

test('V3-SQUAD: frontmostUnit·removeUnits(뒤쪽부터)·addUnits(cap)', () => {
  const run = mkRun(10);
  const front = frontmostUnit(run.units);
  assert.equal(front.dy, Math.min(...run.units.map((u) => u.dy)));
  assert.equal(frontmostUnit(run.units, (u) => u.id > 100), null);
  const maxDy = Math.max(...run.units.map((u) => u.dy));
  const backIds = run.units.filter((u) => u.dy === maxDy).map((u) => u.id);
  const removed = removeUnits(run.units, 1, 'back');
  assert.equal(removed, 1);
  assert.equal(run.units.length, 9);
  assert.equal(run.units.filter((u) => backIds.includes(u.id)).length, backIds.length - 1);
  // 뒤쪽 3명 제거 → 남은 유닛의 dy 최대는 제거 전보다 크지 않다
  const before = [...run.units].sort((a, b) => b.dy - a.dy).slice(0, 3).map((u) => u.id);
  assert.equal(removeUnits(run.units, 3, 'back'), 3);
  for (const id of before) assert.ok(!run.units.some((u) => u.id === id));
  assert.equal(removeUnits(run.units, 99), 6);
  assert.equal(run.units.length, 0);
  // addUnits: id 는 nextUnitId 로 이어지고 cap 에서 멈춘다
  const r2 = mkRun(98);
  assert.equal(r2.nextUnitId, 99);
  assert.equal(addUnits(r2, 5, 0.5, 100), 2);
  assert.equal(r2.units.length, 100);
  assert.deepEqual(r2.units.slice(-2).map((u) => u.id), [99, 100]);
  assert.equal(r2.nextUnitId, 101);
  assert.deepEqual(r2.units.map((u) => [u.dx, u.dy]), formation(100).map((p) => [p.dx, p.dy]));
});
