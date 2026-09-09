// rush3-combat — 전투 STEP 통합 규칙(계약서 4장 · 8장 V3-GATE-SCROLL/ORDER/FIRE/WEAPON/WALL/HIT/DEAD/HP/RETRY/WIN/CHAIN)을
// 실제 stepRun 으로 잠근다. 모든 좌표는 트랙 z.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage } from '../rush3/stages.js';
import { makeBullet } from '../rush3/weapons.js';
import { addUnits, removeUnits, layoutUnits, formation, formationHalfWidth } from '../rush3/squad.js';
import { BAL3 } from '../rush3/balance.js';

const R = BAL3.squad.unitR;
const NONE = { pointerX: null, dragDx: 0, keyDir: 0 };
const at = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0 });

// 최소 스테이지 조립기(buildStage 와 같은 형태). gates/supplies 는 정의만 넣으면 createRun 이 make 함수로 다시 만든다.
function mkStage(o = {}) {
  return {
    id: o.id ?? 't', version: 1, title: 'test', startUnits: o.startUnits ?? 1, startWeapon: o.startWeapon ?? 'rifle',
    length: o.length ?? 100000, eliteZ: o.elite ? o.elite.z : null,
    gateRows: (o.gates || []).map((g, i) => ({ id: g.id ?? 'g' + (i + 1), z: g.z, h: 24, maxValue: g.maxValue ?? 15, bypass: !!g.bypass, cells: g.cells })),
    supplies: (o.supplies || []).map((s, i) => ({ id: s.id ?? 'c' + (i + 1), z: s.z, x: s.x, r: 30, kind: s.kind, durability: s.durability, maxDurability: s.durability, payload: s.payload })),
    walls: (o.walls || []).map((w, i) => ({ id: 'w' + (i + 1), z0: w.z0, z1: w.z1, x0: 228, x1: 252 })),
    spawns: (o.spawns || []).map((s) => ({ z: s.z, kind: s.kind, n: s.xs.length, xs: s.xs, zs: s.zs })),
    elite: o.elite ? { z: o.elite.z, hp: o.elite.hp, summon: !!o.elite.summon } : null,
  };
}
// n STEP 진행하며 이벤트를 모은다. 매 STEP 뒤 onStep(run, events) 호출 가능
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
const count = (ev, type) => ev.filter((e) => e.type === type).length;
const holdFire = (run) => { for (const u of run.units) u.fireT = 1e9; };
const soldierCrate = (z, x, durability, n, id) => ({ id, z, x, kind: 'soldier', durability, payload: { n } });

test('V3-GATE-SCROLL: 스크롤 켠 채 탄 위상 20분할 전 구간에서 게이트 명중 100%·뒤 통 내구 불변(실제 stepRun)', () => {
  const VZ = BAL3.weapons.rifle.vz;
  // 게이트는 탄 정리선(run.z + LINE_Y + 140 = 780 앞) 안에 둔다 — 그보다 먼 탄은 규칙대로 정리되어 닿지 못한다
  for (let p = 0; p < 20; p++) {
    const gz = 700 + (p / 20) * VZ * STEP;
    const run = createRun(mkStage({
      gates: [{ z: gz, cells: [{ x0: 80, x1: 400, value: 0 }] }],
      supplies: [soldierCrate(gz + 60, 240, 4, 2, 'c1')],
    }));
    const row = run.gateRows[0], sup = run.supplies[0];
    let fired = 0, hits = 0;
    play(run, 180, NONE, (r, ev) => {
      for (const e of ev) { if (e.type === 'fire') fired += e.count; if (e.type === 'gateHit' || e.type === 'gateFlip') hits++; }
      for (const b of r.bullets) assert.ok(b.z < row.z - row.h / 2, `위상 ${p}/20: 게이트를 통과한 탄이 있다 z=${b.z}`);
    });
    assert.ok(run.z < row.z - 20, '부대는 아직 게이트 앞');
    assert.ok(hits >= 3, `위상 ${p}/20: 명중 ${hits}`);
    assert.equal(hits, fired - run.bullets.length, `위상 ${p}/20: 발사 ${fired} = 명중 ${hits} + 비행 중 ${run.bullets.length}`);
    assert.equal(row.cells[0].value, Math.min(15, hits));
    assert.equal(sup.durability, 4, `위상 ${p}/20: 뒤 통 불변`);
  }
});

test('V3-ORDER: 한 발이 앞의 통과 뒤의 게이트를 동시에 처리하지 않는다(통이 흡수, 게이트 값 불변)', () => {
  const run = createRun(mkStage({
    supplies: [soldierCrate(1100, 240, 999, 1, 'c1')],
    gates: [{ z: 1130, cells: [{ x0: 80, x1: 400, value: 0 }] }],
  }));
  const ev = play(run, 200);
  assert.ok(count(ev, 'supplyHit') >= 5, '통에 여러 발 명중');
  assert.equal(count(ev, 'gateHit'), 0);
  assert.equal(run.gateRows[0].cells[0].value, 0);
  assert.equal(run.supplies[0].durability, 999 - count(ev, 'supplyHit'));
});

test('V3-ORDER: 동일 STEP 에 hp 2 잡졸에 30발 → 2발 소모·kills 1·28발 관통', () => {
  const run = createRun(mkStage({ spawns: [{ z: 0, kind: 'grunt', xs: [240], zs: [400] }] }));
  holdFire(run);
  for (let i = 0; i < 30; i++) run.bullets.push(makeBullet('rifle', 240, 380, 1));
  const ev = play(run, 1);
  assert.equal(run.kills, 1);
  assert.equal(count(ev, 'kill'), 1);
  assert.equal(count(ev, 'enemyHit'), 2);
  assert.equal(run.enemies.length, 0);
  assert.equal(run.bullets.length, 28, '남은 28발은 살아서 계속 날아간다');
  assert.ok(run.bullets.every((b) => !b.dead && b.z > 380));
});

test('V3-ORDER: 5단계에서 격파된 잡졸은 같은 STEP 8단계에서 유닛을 깎지 않는다(touched=false, kills+1)', () => {
  const run = createRun(mkStage({ spawns: [{ z: 0, kind: 'grunt', xs: [240], zs: [10] }] }));
  holdFire(run);
  run.bullets.push(makeBullet('rifle', 240, -5, 1));
  run.bullets.push(makeBullet('rifle', 240, -5, 1));
  const ev = play(run, 1);
  assert.equal(run.kills, 1);
  assert.equal(count(ev, 'touch'), 0);
  assert.equal(count(ev, 'hurt'), 0);
  assert.equal(run.units[0].hp, 2);
  assert.equal(run.lossByTouch, 0);
  assert.equal(count(ev, 'kill'), 1);
});

test('V3-ORDER: 유닛 1명 hp 1 인 STEP 에 통 개봉 +2 와 접촉 −1 이 겹쳐도 over=false(보상이 사망보다 먼저)', () => {
  const run = createRun(mkStage({
    supplies: [soldierCrate(30, 240, 1, 2, 'c1')],
    spawns: [{ z: 0, kind: 'grunt', xs: [240], zs: [20] }],
  }));
  holdFire(run);
  run.units[0].hp = 1;
  run.bullets.push(makeBullet('rifle', 240, -5, 1));
  const ev = play(run, 1);
  assert.equal(count(ev, 'supplyOpen'), 1, '탄은 더 가까운 통에 흡수된다');
  assert.equal(count(ev, 'touch'), 1, '잡졸은 살아서 접촉한다');
  assert.equal(run.lossByTouch, 1);
  assert.equal(run.over, false);
  assert.equal(run.units.length, 2, '접촉으로 0명 → 보상 +2');
  assert.ok(run.units.every((u) => u.id !== 1), '죽은 유닛은 제거됐다');
});

test('V3-FIRE: 병사 1/10/30명에서 2초 누적 탄 수가 비례한다', () => {
  const shots = {};
  for (const n of [1, 10, 30]) {
    const run = createRun(mkStage({ startUnits: n }));
    let total = 0;
    for (const e of play(run, 120)) if (e.type === 'fire') total += e.count;
    shots[n] = total;
    assert.ok(count(drainEvents(run), 'fire') <= 1, 'STEP 당 fire 이벤트 1개');
  }
  assert.ok(shots[1] >= 3 && shots[1] <= 5, `1명 2초 ${shots[1]}발`);
  assert.ok(Math.abs(shots[10] / shots[1] - 10) <= 1.5, `10명 비례 ${shots[10]}/${shots[1]}`);
  assert.ok(Math.abs(shots[30] / shots[1] - 30) <= 4.5, `30명 비례 ${shots[30]}/${shots[1]}`);
});

test('V3-FIRE: 30명 탄의 x 열 수 ≥ 20(한 점으로 모이지 않는다)·탄은 유닛 자기 위치에서 나간다', () => {
  const run = createRun(mkStage({ startUnits: 30 }));
  const xs = new Set();
  play(run, 40, NONE, (r) => { for (const b of r.bullets) xs.add(b.x); });
  assert.ok(xs.size >= 20, `x 열 ${xs.size}`);
  const f = formation(30);
  const allowed = new Set(f.map((p) => 240 + p.dx));
  for (const x of xs) assert.ok(allowed.has(x), `탄 x ${x} 는 유닛 위치가 아니다`);
});

test('V3-WEAPON: auto 통 파괴 → weapon=auto(9단계 적용)·발사 간격이 바뀐다', () => {
  const run = createRun(mkStage({ supplies: [{ id: 'w', z: 600, x: 240, kind: 'weapon', durability: 1, payload: { weapon: 'auto' } }] }));
  const ev = play(run, 120);
  assert.equal(count(ev, 'supplyOpen'), 1);
  assert.equal(count(ev, 'weaponSwap'), 1);
  assert.equal(run.weapon, 'auto');
  assert.ok(ev.some((e) => e.type === 'fire' && e.weapon === 'auto'));
  assert.ok(run.bullets.some((b) => b.kind === 'auto' && b.vz === BAL3.weapons.auto.vz));
});

test('V3-WEAPON: 병력 30→1 감소 뒤에도 무기 유지(강등 없음)', () => {
  const run = createRun(mkStage({ startUnits: 30, supplies: [{ id: 'w', z: 600, x: 240, kind: 'weapon', durability: 1, payload: { weapon: 'auto' } }] }));
  play(run, 120);
  assert.equal(run.weapon, 'auto');
  removeUnits(run.units, 29, 'back');
  layoutUnits(run.units);
  play(run, 30);
  assert.equal(run.units.length, 1);
  assert.equal(run.weapon, 'auto');
});

test('V3-WEAPON: 동급·하급 무기 통(rifle)은 무시(weaponSame)·heavy 는 상급이라 교체', () => {
  const run = createRun(mkStage({ startWeapon: 'auto', supplies: [
    { id: 'r', z: 500, x: 240, kind: 'weapon', durability: 1, payload: { weapon: 'rifle' } },
    { id: 'a', z: 700, x: 240, kind: 'weapon', durability: 1, payload: { weapon: 'auto' } },
    { id: 'h', z: 900, x: 240, kind: 'weapon', durability: 1, payload: { weapon: 'heavy' } },
  ] }));
  const ev = play(run, 360);
  assert.equal(count(ev, 'supplyOpen'), 3);
  assert.equal(count(ev, 'weaponSame'), 2);
  assert.equal(count(ev, 'weaponSwap'), 1);
  assert.equal(run.weapon, 'heavy');
});

// S2 벽(z 1800~3000, x 228~252) 통합
test('V3-WALL: x 240 무조작으로 벽 진입 → 한쪽 통로로 스냅·n=1/n=60 유닛 전원 통로 안·벽 끝 뒤 해제(S2 실제·벽만 있는 스테이지)', () => {
  for (const [n, stage] of [[2, buildStage(2)], [60, buildStage(2)], [1, mkStage({ walls: [{ z0: 1800, z1: 3000 }] })], [60, mkStage({ walls: [{ z0: 1800, z1: 3000 }] })]]) {
    const run = createRun(stage);
    if (n > run.units.length) addUnits(run, n - run.units.length);
    if (stage.id === 't') holdFire(run);
    const wall = run.walls[0];
    let sawActive = false;
    // 진입 STEP(prevZ < z0-60 <= z)의 9단계 재배치가 그 STEP 안에 스냅한다 — 매 STEP 끝(화면에 나가는 상태)에서 검사
    play(run, 1000, NONE, (r) => {
      if (r.z >= wall.z0 - 60 && r.z <= wall.z1) {
        sawActive = true;
        const side = r.wallSide[wall.id];
        assert.ok(side === 'L' || side === 'R', 'wallSide 기록');
        const lo = side === 'L' ? 80 : wall.x1, hi = side === 'L' ? wall.x0 : 400;
        assert.ok(r.x <= wall.x0 || r.x >= wall.x1, `중심이 벽 안(x=${r.x})`);
        for (const u of r.units) {
          const ux = r.x + u.dx;
          assert.ok(ux - R >= lo && ux + R <= hi, `n=${n} z=${r.z.toFixed(0)} 유닛 ${u.id} x=${ux} 통로 [${lo},${hi}] 밖`);
        }
      }
    });
    assert.ok(sawActive);
    assert.equal(run.over, false);
    assert.ok(run.z > wall.z1);
    assert.equal(run.wallSide[wall.id], undefined, '벽 끝 뒤 해제');
  }
});

test('V3-WALL: 아군 탄·적탄 모두 벽 사각형에서 소멸(통로 쪽 탄은 살아남는다)', () => {
  const run = createRun(buildStage(2));
  holdFire(run);
  run.z = run.prevZ = 2000;
  run.bullets.push(makeBullet('rifle', 240, 1990, 1));
  run.bullets.push(makeBullet('rifle', 100, 1990, 1));
  run.eshots.push({ x: 240, z: 2100, px: 240, pz: 2100, vx: 0, vz: 260, dmg: 1, r: 5, dead: false });
  run.eshots.push({ x: 380, z: 2100, px: 380, pz: 2100, vx: 0, vz: 260, dmg: 1, r: 5, dead: false });
  const ev = play(run, 1);
  assert.equal(count(ev, 'wallHit'), 1);
  assert.deepEqual(run.bullets.map((b) => b.x), [100]);
  assert.deepEqual(run.eshots.map((s) => s.x), [380]);
  assert.equal(count(ev, 'hurt'), 0);
});

test('V3-WALL: 좌측 shooter 가 우측 통로 부대를 쏜 탄은 벽에서 소멸(피해 0)', () => {
  const run = createRun(mkStage({
    startUnits: 5, walls: [{ z0: 1800, z1: 3000 }],
    spawns: [{ z: 0, kind: 'shooter', xs: [120], zs: [2600] }],
  }));
  holdFire(run);
  run.z = run.prevZ = 1900;
  let shots = 0;
  play(run, 300, at(330), (r, ev) => {
    for (const e of ev) if (e.type === 'eshot') shots += e.n;
    assert.equal(r.wallSide.w1, r.z <= 3000 ? 'R' : undefined);
    for (const s of r.eshots) assert.ok(s.x < 228, `적탄이 벽을 넘었다 x=${s.x}`);
  });
  assert.ok(shots >= 1, `저격수 발사 ${shots}`);
  assert.equal(run.lossByShot, 0);
  assert.ok(run.units.every((u) => u.hp === 2));
});

test('V3-WALL: 드래그 +500 누적 뒤 −20 → 그 STEP 에 tx 감소(범위 클램프)', () => {
  const run = createRun(buildStage(2));
  holdFire(run);
  run.z = run.prevZ = 2000;
  play(run, 3, { pointerX: null, dragDx: 500, keyDir: 0 });
  const side = run.wallSide.w1;
  const hw = formationHalfWidth(run.units.length);
  const hi = side === 'L' ? 228 - hw : 400 - hw;
  assert.equal(run.tx, hi, '통로 위쪽 끝에 클램프');
  play(run, 1, { pointerX: null, dragDx: -20, keyDir: 0 });
  assert.equal(run.tx, hi - 20);
  assert.ok(run.x < hi + 1e-9);
});

test('V3-HIT: 대형 빈틈을 지나는 적탄은 피해 0', () => {
  const run = createRun(mkStage({ startUnits: 3 }));
  holdFire(run);
  // formation(3) = (0,0),(24,-10),(24,10): x −20 열은 어느 유닛 원(r 9 + 탄 r 5)에도 닿지 않는다
  run.eshots.push({ x: 220, z: 60, px: 220, pz: 60, vx: 0, vz: 260, dmg: 1, r: 5, dead: false });
  const ev = play(run, 60);
  assert.equal(count(ev, 'hurt'), 0);
  assert.ok(run.units.every((u) => u.hp === 2));
  assert.equal(run.eshots.length, 0, '부대 뒤로 지나가 정리됐다');
});

test('V3-HIT: rusher 가 어느 위상으로 와도 정확히 1회 접촉(hp −2, 적 소모·kills 제외)', () => {
  for (let p = 0; p < 24; p++) {
    const run = createRun(mkStage({ startUnits: 5, spawns: [{ z: 0, kind: 'rusher', xs: [240], zs: [700 + p * 0.37] }] }));
    holdFire(run);
    const ev = play(run, 400);
    assert.equal(count(ev, 'touch'), 1, `위상 ${p}`);
    assert.deepEqual(ev.filter((e) => e.type === 'hurt').map((e) => [e.n, e.cause]), [[2, 'touch']]);
    assert.equal(run.kills, 0);
    assert.equal(run.lossByTouch, 1);
    assert.equal(run.units.length, 4);
  }
});

test('V3-HIT: 유닛 hp 가 개별로 깎인다(앞줄 유닛 먼저·다른 열은 무관)', () => {
  const run = createRun(mkStage({ startUnits: 3 }));
  holdFire(run);
  run.eshots.push({ x: 264, z: 60, px: 264, pz: 60, vx: 0, vz: 260, dmg: 1, r: 5, dead: false });
  run.eshots.push({ x: 240, z: 60, px: 240, pz: 60, vx: 0, vz: 260, dmg: 1, r: 5, dead: false });
  const ev = play(run, 60);
  assert.equal(count(ev, 'hurt'), 2);
  const hp = Object.fromEntries(run.units.map((u) => [u.id, u.hp]));
  assert.deepEqual(hp, { 1: 1, 2: 1, 3: 2 });
  assert.equal(run.lossByShot, 0);
});

test('V3-DEAD: 소각 탄·dead 적은 같은 STEP 의 뒤 처리에서 제외(벽 뒤 통 무피해·격파된 저격수는 쏘지 않음)', () => {
  const run = createRun(mkStage({
    walls: [{ z0: 1800, z1: 3000 }],
    supplies: [soldierCrate(2050, 240, 5, 1, 'c1')],
    spawns: [{ z: 0, kind: 'shooter', xs: [100], zs: [2400] }],
  }));
  holdFire(run);
  run.z = run.prevZ = 2000;
  run.bullets.push(makeBullet('rifle', 240, 2010, 1));
  let ev = play(run, 1);
  assert.equal(count(ev, 'wallHit'), 1);
  assert.equal(run.supplies[0].durability, 5, '벽에 소각된 탄은 뒤 통을 맞히지 않는다');
  const e = run.enemies[0];
  assert.equal(e.kind, 'shooter');
  e.aimT = STEP / 2; e.shootT = 1;
  for (let i = 0; i < 6; i++) run.bullets.push(makeBullet('rifle', 100, e.z - 28, 1));
  ev = play(run, 1);
  assert.equal(run.kills, 1);
  assert.equal(count(ev, 'eshot'), 0, '5단계에서 죽은 저격수는 6단계에서 쏘지 않는다');
  assert.equal(run.eshots.length, 0);
});

test('V3-HP: 적·정예 HP 가 등장 시 병력과 무관(스테이지 고정값)', () => {
  const hpOf = (n) => {
    const run = createRun(mkStage({ startUnits: n, spawns: [{ z: 0, kind: 'grunt', xs: [100, 380], zs: [900, 900] }, { z: 0, kind: 'rusher', xs: [240], zs: [1200] }], elite: { z: 0, hp: 40 } }));
    holdFire(run);
    play(run, 1);
    return { enemies: run.enemies.map((e) => [e.kind, e.hp]), boss: run.boss.hp, units: run.units.length };
  };
  const a = hpOf(1), b = hpOf(100);
  assert.equal(a.units, 1); assert.equal(b.units, 100);
  assert.deepEqual(a.enemies, [['grunt', 2], ['grunt', 2], ['rusher', 4]]);
  assert.deepEqual(b.enemies, a.enemies);
  assert.equal(a.boss, 40); assert.equal(b.boss, 40);
});

test('V3-RETRY: 한 판 진행(통 파괴·게이트 피격·통과) 후 buildStage 재호출 → 초기값·참조 비공유', () => {
  const stage = buildStage(1);
  const run = createRun(stage);
  const ev = play(run, 900, at(240));
  assert.ok(count(ev, 'gateHit') > 0 && count(ev, 'gatePass') > 0 && count(ev, 'supplyOpen') > 0, '한 판이 진행됐다');
  assert.ok(run.units.length > 1);
  const again = buildStage(1);
  assert.deepEqual(again, buildStage(1));
  assert.deepEqual(again.gateRows.map((r) => [r.passed, r.cells.map((c) => c.value)]), [[false, [1]], [false, [-6]]]);
  for (const s of again.supplies) { assert.equal(s.opened, false); assert.equal(s.missed, false); assert.equal(s.durability, s.maxDurability); }
  assert.notEqual(again.gateRows[0], run.gateRows[0]);
  assert.notEqual(again.supplies[0], run.supplies[0]);
  assert.notEqual(again.gateRows[0], stage.gateRows[0]);
  const run2 = createRun(again);
  assert.equal(run2.units.length, 1);
  assert.equal(run2.z, 0);
  assert.equal(run2.gateRows[0].cells[0].value, 1);
  assert.equal(run2.supplies[0].durability, 4);
});

test('V3-WIN: 정예 격파 즉시(같은 STEP) won·wonAt 기록·bossKill 이벤트', () => {
  const run = createRun(mkStage({ startUnits: 10, elite: { z: 0, hp: 3 } }));
  let killedAt = -1, wonAt = -1;
  play(run, 600, NONE, (r, ev, i) => {
    if (ev.some((e) => e.type === 'bossKill')) killedAt = i;
    if (r.won && wonAt < 0) wonAt = i;
  });
  assert.ok(killedAt >= 0, '정예가 격파됐다');
  assert.equal(wonAt, killedAt);
  assert.equal(run.won, true);
  assert.equal(run.over, true);
  assert.equal(run.wonAt, run.time);
  assert.equal(run.boss, null);
  assert.equal(run.bossDefeated, true);
});

test('V3-WIN: 정예 없는 스테이지는 length 도달 && 적 없음일 때 승리', () => {
  const run = createRun(mkStage({ length: 600 }));
  play(run, 600);
  assert.equal(run.won, true);
  assert.ok(run.z >= 600 && run.z < 600 + 190 * STEP + 1e-9);
  // 적(도로 고정 저격수)이 남아 있으면 length 를 넘어도 적이 정리될 때까지 승리하지 않는다
  const run2 = createRun(mkStage({ length: 600, spawns: [{ z: 0, kind: 'shooter', xs: [100], zs: [700] }] }));
  holdFire(run2);
  play(run2, 190);
  assert.ok(run2.z > 600);
  assert.equal(run2.won, false);
  play(run2, 200);
  assert.equal(run2.won, true);
  assert.equal(run2.enemies.length, 0);
});

test('V3-CHAIN: 실제 사격으로 활성(chainOn)·발판 추가(padAdd)·통과 획득(padTake) → 병력 증가', () => {
  const run = createRun(mkStage({ supplies: [{ id: 'ch', z: 900, x: 240, kind: 'chain', durability: 3, payload: { pads0: 5, maxPads: 15 } }] }));
  const ev = play(run, 560);
  const s = run.supplies[0];
  assert.equal(count(ev, 'supplyOpen'), 1);
  assert.equal(count(ev, 'chainOn'), 1);
  assert.ok(count(ev, 'padAdd') >= 1, '개봉 뒤 유효탄이 발판을 늘린다');
  assert.ok(s.pads.length >= 6 && s.pads.length <= 15);
  assert.equal(s.locked, true);
  assert.equal(s.missed, false);
  assert.ok(run.z > s.pads[s.pads.length - 1].z, '마지막 발판을 지났다');
  assert.equal(count(ev, 'padTake'), s.pads.length);
  assert.ok(s.pads.every((p) => p.taken));
  assert.equal(run.units.length, 1 + s.pads.length);
  assert.deepEqual(s.pads.slice(0, 2).map((p) => p.z), [960, 1000]);
});

// heavy 폭발 실험대: 잡졸 3기(x 196 · 220 · 262, 같은 z)에 x 220 직격탄 1발. 벽(228~252) z 구간은 1800~3000.
// 220↔262 거리 42 = 폭발 반경 28 + 잡졸 r 14(사거리 경계 안) 이므로 제외 여부는 오직 벽 판정에 달린다.
// 스폰(3단계)과 탄 이동(5단계)이 같은 STEP 이라 폭발 시점 좌표 = 스폰 좌표 그대로.
function heavyBlastRun(walls, ez) {
  const run = createRun(mkStage({
    startWeapon: 'heavy', startUnits: 1, walls,
    spawns: [{ z: 0, kind: 'grunt', xs: [196, 220, 262], zs: [ez, ez, ez] }],
  }));
  holdFire(run);
  run.z = run.prevZ = ez - 400;
  run.bullets.push(makeBullet('heavy', 220, ez - 22, 1));
  return { run, ev: play(run, 1) };
}
const enemyHits = (ev) => ev.filter((e) => e.type === 'enemyHit').map((e) => [e.id, e.hp, !!e.blast]);

test('V3-HEAVY: heavy 는 적 직격 시에만 폭발 — 통 명중은 폭발 없음·직격 적은 직격 3만·반경 안 잡졸은 폭발 2', () => {
  const run = createRun(mkStage({
    startWeapon: 'heavy', startUnits: 1,
    spawns: [{ z: 0, kind: 'grunt', xs: [220], zs: [2400] }],
    supplies: [soldierCrate(2200, 100, 10, 1, 'c1')],
  }));
  holdFire(run);
  run.z = run.prevZ = 2000;
  run.bullets.push(makeBullet('heavy', 100, 2160, 1));
  const ev = play(run, 1);
  assert.equal(run.supplies[0].durability, 7);
  assert.equal(count(ev, 'blast'), 0, '통 명중은 폭발 없음');
  assert.equal(run.enemies.length, 1, '잡졸은 아직 무사');
  // 벽 없는 실험대: 직격 id 2 는 3 만(폭발 제외), 양옆 id 1·3 은 폭발 2 로 hp 0
  const b = heavyBlastRun([], 2400);
  assert.equal(count(b.ev, 'blast'), 1);
  assert.deepEqual(enemyHits(b.ev), [[2, -1, false], [1, 0, true], [3, 0, true]], '직격 적은 직격 3만, 반경 안 잡졸은 폭발 2');
  assert.equal(b.run.kills, 3, '직격·폭발로 죽은 적 모두 kills');
  assert.deepEqual(b.run.enemies, []);
});

test('V3-HEAVY: 벽 반대편 잡졸은 폭발 제외 — 같은 배치를 벽 없이 돌리면 죽고, 벽 z 구간 밖이면 벽이 있어도 죽는다', () => {
  const WALL = [{ z0: 1800, z1: 3000 }];
  // (a) 벽 z 구간 안(2400): x 262 는 폭발 사거리 안(거리 42)이지만 벽 228~252 가 사이에 껴 제외 — hp 그대로
  const a = heavyBlastRun(WALL, 2400);
  assert.equal(count(a.ev, 'blast'), 1);
  assert.deepEqual(enemyHits(a.ev), [[2, -1, false], [1, 0, true]], '반대편 id 3 은 enemyHit 없음');
  assert.deepEqual(a.run.enemies.map((e) => [e.id, e.hp]), [[3, 2]], '벽 반대편 잡졸 hp 그대로');
  assert.equal(a.run.kills, 2);
  // (b) 같은 배치, 벽 없음: id 3 도 폭발 2 로 hp 0
  const b = heavyBlastRun([], 2400);
  assert.deepEqual(enemyHits(b.ev), [[2, -1, false], [1, 0, true], [3, 0, true]]);
  assert.deepEqual(b.run.enemies, []);
  // (c) 벽은 있지만 폭발이 벽 z 구간 밖(1700 < 1800): 벽 사이 판정이 꺼져 id 3 도 죽는다
  const c = heavyBlastRun(WALL, 1700);
  assert.deepEqual(enemyHits(c.ev), [[2, -1, false], [1, 0, true], [3, 0, true]], '벽 z 구간 밖에서는 wallBetween 미적용');
  assert.deepEqual(c.run.enemies, []);
  assert.equal(c.run.kills, 3);
});
