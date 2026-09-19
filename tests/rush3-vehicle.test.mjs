// rush3-vehicle — 움직이는 보급(차량) 규칙·배치·화면·셸(계약서 r3.13 · 8장 V3-VEHICLE)을 잠근다.
//  배우는 것 = "움직이는 것을 맞히려면 앞을 봐야 한다". 통의 z 는 고정, x 만 삼각파로 왕복한다.
//  합성 스테이지는 buildStage 대신 createRun({ ... }) 로 만든다(V3-SUPPLY 의 makeRun 꼴 · 난수 0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSupply, moveSupply, vehicleX, ENTER_Z, sweepContactSupply, hitSupply, structurallyLost, supplyActive } from '../rush3/supply.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage, stageVersion } from '../rush3/stages.js';
import { BAL3 } from '../rush3/balance.js';
import { makeBullet } from '../rush3/weapons.js';
import { playPolicy } from './lib/rush3-policies.mjs';
import { createRenderer3 } from '../rush3/render.js';
import { boot, VEHICLE_GUIDE_TEXT, SHUTTER_GUIDE_TEXT } from '../rush3/main.js';
import { createSave3 } from '../rush3/save.js';

const R = BAL3.supply.r;
const IN = { pointerX: 240, dragDx: 0, keyDir: 0 };
const MV = (x0, x1, period) => ({ x0, x1, period });
//  합성 스테이지 → run. supplies 는 통 정의 배열(kind 별 payload 포함)
function synth(supplies, { startUnits = 5, walls = [], length = 6000 } = {}) {
  return createRun({ id: 'veh', version: 1, length, startUnits, startWeapon: 'rifle', supplies, gateRows: [], walls, spawns: [], elite: null });
}
const vehDef = (o = {}) => ({ id: 'v1', z: 3000, x: 120, kind: 'soldier', durability: 6, payload: { n: 3 }, move: MV(120, 360, 4), ...o });
//  탄 1발을 통의 z 줄에 직접 놓는다(그 STEP 의 moveBullets 가 [z, z + vz·STEP] 스윕으로 통 원 안에 들어간다)
const dropBullet = (run, x, z) => run.bullets.push(makeBullet('rifle', x, z - 5, 0, 1, 0));
const evOf = (run, type) => drainEvents(run).filter((e) => e.type === type);

// ─────────────────────────────────────────────────────────────────────────────
test('V3-VEHICLE VEH-1: 형식 — move 깊은 복사·homeX·moveT null·prevX, 정지 통은 move null, S6 차량 3(c1·c2·c4)·S12 차량 1(c4), ENTER_Z = BAL3.enterZ', () => {
  const def = vehDef();
  const a = makeSupply(def), b = makeSupply(def);
  assert.deepEqual(a.move, { x0: 120, x1: 360, period: 4 });
  assert.notEqual(a.move, def.move, 'move 는 복사본');
  assert.notEqual(a.move, b.move);
  assert.deepEqual(a, b, '같은 def 두 번 → deepEqual');
  assert.equal(a.homeX, 120); assert.equal(a.moveT, null); assert.equal(a.prevX, 120);
  const st = makeSupply({ id: 'c', z: 1, x: 2, kind: 'soldier', durability: 6, payload: { n: 2 } });
  assert.equal(st.move, null); assert.equal(st.prevX, st.x); assert.equal(st.homeX, 2);
  assert.equal(ENTER_Z, BAL3.enterZ, '진입선 상수는 balance 와 같은 값(순수 모듈이라 복제)');
  const s6 = buildStage(6), s12 = buildStage(12);
  assert.deepEqual(s6.supplies.filter((s) => s.move).map((s) => s.id), ['c1', 'c2', 'c4']);
  assert.deepEqual(s12.supplies.filter((s) => s.move).map((s) => s.id), ['c4'], 'S12 차량 = z7200 병사 8 통(설계서의 c5 는 오기 — 코드 순서상 c4)');
  for (const s of [...s6.supplies, ...s12.supplies]) if (!s.move) assert.equal(s.move, null, s.id + ' 정지 통은 null');
  //  buildStage 두 번: deepEqual 이되 move 참조는 다르다
  const s6b = buildStage(6);
  assert.deepEqual(s6, s6b);
  assert.notEqual(s6.supplies[0].move, s6b.supplies[0].move);
  //  createRun 이 만든 통도 정의와 참조를 공유하지 않는다
  const run = createRun(s6);
  assert.notEqual(run.supplies[0].move, s6.supplies[0].move);
  assert.deepEqual(run.supplies[0].move, s6.supplies[0].move);
});

test('V3-VEHICLE VEH-2: 진입 전엔 안 움직인다 — 3000 − run.z <= 760 이 처음 성립하는 STEP 에 moveT 0·x 그대로, 다음 STEP 부터 v·STEP 씩', () => {
  const run = synth([vehDef()], { startUnits: 1 });
  const s = run.supplies[0];
  let enterStep = -1;
  for (let i = 0; i < 900; i++) {
    stepRun(run, IN, STEP);
    if (s.moveT === null) {
      assert.ok(s.z - run.z > ENTER_Z, 'STEP ' + i + ': 진입 전');
      assert.equal(s.x, 120); assert.equal(s.prevX, 120);
      continue;
    }
    if (enterStep < 0) {
      enterStep = i;
      assert.ok(s.z - run.z <= ENTER_Z && s.z - run.prevZ > ENTER_Z, '이 STEP 에 처음 진입');
      assert.equal(s.moveT, 0, '진입 STEP 은 시계만 0');
      assert.equal(s.x, 120, '진입 STEP 의 x 는 아직 homeX');
      continue;
    }
    if (i === enterStep + 1) {
      const v = 2 * (360 - 120) / 4;
      assert.ok(Math.abs(s.moveT - STEP) < 1e-12);
      assert.ok(Math.abs(s.x - (120 + v * STEP)) < 1e-9, '첫 이동 = v·STEP (' + s.x + ')');
      assert.equal(s.prevX, 120);
      break;
    }
  }
  assert.ok(enterStep > 0, '진입 STEP 을 찾았다');
  //  break 시점까지 돌린 STEP 수 = enterStep + 2(0-based enterStep 다음 STEP 에서 끊는다)
  assert.equal(Math.round(run.z), Math.round((enterStep + 2) * BAL3.scroll * STEP), 'run.z 는 입력과 무관한 STEP 누적');
});

test('V3-VEHICLE VEH-3: 범위·왕복 — 두 주기 동안 x0 <= x <= x1·점프 없음·양 끝에서만 돈다(반전 4회)·x1 출발은 왼쪽으로 먼저', () => {
  const m = MV(120, 360, 4), v = 2 * (360 - 120) / 4;
  //  vehicleX 순수 함수: 위상 원점
  assert.equal(vehicleX(m, 120, 0), 120); assert.equal(vehicleX(m, 360, 0), 360);
  assert.ok(Math.abs(vehicleX(m, 120, 2) - 360) < 1e-9, '반 주기 뒤 반대쪽 끝');
  assert.ok(Math.abs(vehicleX(m, 120, 4) - 120) < 1e-9, '한 주기 뒤 제자리');
  assert.ok(vehicleX(m, 360, STEP) < 360, 'x1 출발은 왼쪽으로 먼저');
  assert.ok(vehicleX(m, 120, STEP) > 120, 'x0 출발은 오른쪽으로 먼저');
  //  moveSupply 로 두 주기(진입 뒤 480 STEP)
  const s = makeSupply(vehDef({ z: 700 }));       // run.z 0 에서 바로 진입(700 <= 760)
  const run = { z: 0 };
  moveSupply(s, run, STEP);
  assert.equal(s.moveT, 0);
  let flips = 0, lastDir = 0, halfSeen = false, fullSeen = false;
  //  두 주기(480 STEP) + 여유 10 STEP: 네 번째 반전(t = 8)이 창 안에 들어온다(다음 반전은 t = 10)
  for (let i = 1; i <= 490; i++) {
    moveSupply(s, run, STEP);
    assert.ok(s.x >= 120 - 1e-9 && s.x <= 360 + 1e-9, 'x 범위 ' + s.x);
    const d = s.x - s.prevX;
    assert.ok(Math.abs(d) <= v * STEP + 1e-9, '점프 없음 ' + d);
    const dir = Math.sign(d);
    if (dir !== 0 && lastDir !== 0 && dir !== lastDir) {
      flips++;
      //  방향이 바뀐 STEP 은 끝점 근처(한 STEP 이동 이내)
      assert.ok(Math.min(Math.abs(s.prevX - 120), Math.abs(s.prevX - 360)) <= v * STEP + 1e-9, '양 끝에서만 돈다 ' + s.prevX);
    }
    if (dir !== 0) lastDir = dir;
    if (Math.abs(s.moveT - 2) < STEP / 2) { halfSeen = true; assert.ok(Math.abs(s.x - 360) <= v * STEP + 1e-9); }
    if (Math.abs(s.moveT - 4) < STEP / 2) { fullSeen = true; assert.ok(Math.abs(s.x - 120) <= v * STEP + 1e-9); }
  }
  assert.ok(halfSeen && fullSeen);
  assert.equal(flips, 4, '두 주기에 반전 4회(t = 2·4·6·8)');
  //  x1 출발 통은 첫 이동이 왼쪽
  const s2 = makeSupply(vehDef({ z: 700, x: 360 }));
  moveSupply(s2, run, STEP); moveSupply(s2, run, STEP);
  assert.ok(s2.x < 360 && s2.homeX === 360);
});

test('V3-VEHICLE VEH-4: 결정성 — S6 두 판(입력열 두 가지)에서 STEP 마다 [c1.x, c2.x, c4.x, moveT] 가 같다', () => {
  const trace = (inputAt) => {
    const run = createRun(buildStage(6));
    const [c1, c2, c4] = ['c1', 'c2', 'c4'].map((id) => run.supplies.find((s) => s.id === id));
    const out = [];
    let openAt = Infinity;
    for (let i = 0; i < 1500 && !run.over; i++) {
      stepRun(run, inputAt(i), STEP); drainEvents(run);
      out.push([c1.x, c2.x, c4.x, c1.moveT, c2.moveT, c4.moveT]);
      if (c1.opened && openAt === Infinity) openAt = i;
    }
    return { out, openAt };
  };
  const fixed = () => IN;
  const sway = (i) => ({ pointerX: Math.floor(i / 180) % 2 ? 160 : 320, dragDx: 0, keyDir: 0 });
  assert.deepEqual(trace(fixed).out, trace(fixed).out, '같은 입력 두 판');
  const a = trace(fixed), b = trace(sway);
  //  입력이 달라도 통의 x 궤적은 같다(진입·위상이 run.z 에만 매달린다). 열린 STEP 까지는 같고 그 다음 STEP 부터 정지하므로
  //  두 판 중 먼저 열린 STEP 까지만 비교한다(그 STEP 자체는 3-c 이동 뒤 5단계에서 열리므로 아직 같다).
  //  r3.18 재기준: 내구 40·armZ 로 x240 고정·좌우 흔들기 둘 다 c1 을 못 연다(의도 — VEH-11) → 그 경우 지나칠 때까지(1500 STEP) 전 구간 비교
  const upto = Math.min(a.openAt, b.openAt, 1499);
  assert.ok(upto > 400, '진입(STEP ~392) 뒤에도 비교 구간이 있다: ' + upto);
  for (let i = 0; i <= upto; i++) assert.deepEqual([a.out[i][0], a.out[i][3]], [b.out[i][0], b.out[i][3]], 'STEP ' + i + ' c1 궤적');
  //  c2·c4 는 두 판 모두 아직 열리기 전이므로 전 구간 같다(진입 전 null 포함)
  for (let i = 0; i <= upto; i++) assert.deepEqual(a.out[i].slice(1, 3).concat(a.out[i].slice(4)), b.out[i].slice(1, 3).concat(b.out[i].slice(4)), 'STEP ' + i + ' c2·c4');
});

test('V3-VEHICLE VEH-5: 이동 중 명중 — supplyHit 의 x 가 homeX 와 다르고 내구가 줄어 결국 열린다. joinMany.x === supplyOpen.x, 그 뒤 x 불변', () => {
  const run = synth([vehDef({ z: 2600 })], { startUnits: 5 });
  const s = run.supplies[0];
  const hits = [], opens = [], joins = [];
  let openStep = -1;
  for (let i = 0; i < 1200 && openStep < 0; i++) {
    stepRun(run, IN, STEP);
    for (const e of drainEvents(run)) {
      if (e.type === 'supplyHit') hits.push(e);
      if (e.type === 'supplyOpen') { opens.push(e); openStep = i; }
      if (e.type === 'joinMany') joins.push(e);
    }
  }
  assert.ok(hits.length >= 1, '이동 중 맞았다');
  for (const h of hits) assert.notEqual(h.x, s.homeX, '맞은 자리는 출발 x 가 아니다');
  for (let i = 1; i < hits.length; i++) assert.ok(hits[i].durability < hits[i - 1].durability, '내구가 준다');
  assert.equal(opens.length, 1); assert.equal(joins.length, 1);
  assert.equal(joins[0].x, opens[0].x, '보상 팝은 열린 순간의 x');
  assert.equal(opens[0].x, s.x, '열린 STEP 의 s.x');
  assert.equal(run.units.length, 8, '5 + 3');
  const xAtOpen = s.x;
  for (let i = 0; i < 120; i++) { stepRun(run, IN, STEP); drainEvents(run); assert.equal(s.x, xAtOpen, '열린 뒤 정지'); assert.equal(s.prevX, xAtOpen); }
});

test('V3-VEHICLE VEH-6: 빠른 왕복에서도 스윕 명중(캡슐) — 극단 속도 77.8px/STEP 에서 supplyHit, 거짓 음성 0, 정지 통 회귀 0', () => {
  //  (a) 극단 차량(x0 100 x1 380 period 0.12 → 한 STEP 에 지름 60 을 넘게 뛴다) + x240 탄을 STEP 마다 통 z 줄에 직접
  const run = synth([vehDef({ z: 700, x: 100, durability: 100000, move: MV(100, 380, 0.12) })], { startUnits: 1 });
  const s = run.supplies[0];
  let hits = 0, tunnelHits = 0;
  for (let i = 0; i < 200; i++) {
    dropBullet(run, 240, s.z);
    stepRun(run, IN, STEP);
    const n = evOf(run, 'supplyHit').length;
    hits += n;
    //  점 판정(지금 s.x 만)이라면 놓쳤을 STEP 에서 맞았는가 — 캡슐이 잡은 터널링
    if (n > 0 && Math.abs(s.x - 240) > R && Math.abs(s.prevX - 240) > R) tunnelHits += n;
  }
  assert.ok(hits > 0, '극단 속도에서도 맞는다(' + hits + ')');
  assert.ok(tunnelHits > 0, '점 판정으로는 놓쳤을 STEP 에서 캡슐이 잡았다(' + tunnelHits + ')');
  //  (b) 성질: 탄 x 80~400(2px)·위상 60가지에 대해 64 서브샘플 연속 판정이 '맞음' 이면 캡슐 판정도 반드시 '맞음'(거짓 음성 0)
  const m = MV(100, 380, 0.12);
  const point = (sx, bx) => Math.abs(bx - sx) <= R;
  let checked = 0;
  for (let k = 0; k < 60; k++) {
    const t0 = k * 0.12 / 60;
    const c = makeSupply(vehDef({ z: 1000, x: 100, move: m }));
    c.prevX = vehicleX(m, 100, t0); c.x = vehicleX(m, 100, t0 + STEP);
    for (let bx = 80; bx <= 400; bx += 2) {
      let fine = false;
      for (let j = 0; j <= 64 && !fine; j++) fine = point(c.prevX + (c.x - c.prevX) * j / 64, bx);
      const b = { x: bx, z: 1005, pz: 990 };
      const capsule = sweepContactSupply(c, b) !== null;
      if (fine) { assert.ok(capsule, `위상 ${k} 탄 x ${bx}: 세밀 판정은 맞음인데 캡슐이 놓쳤다`); checked++; }
    }
  }
  assert.ok(checked > 500, '검사한 명중 사례 수 ' + checked);
  //  (c) 정지 통(prevX === x): 개정 전 점 판정과 x 80~400·z 창 전부에서 같다(회귀 0)
  const ref = (s, b) => {
    if (!supplyActive(s)) return null;
    const dx = Math.abs(b.x - s.x);
    if (dx > s.r) return null;
    const half = Math.sqrt(s.r * s.r - dx * dx);
    const zlo = Math.min(b.pz, b.z), zhi = Math.max(b.pz, b.z);
    if (!(zhi >= s.z - half && zlo <= s.z + half)) return null;
    return Math.max(s.z - half, zlo);
  };
  const st = makeSupply({ id: 'c', z: 2100, x: 240, kind: 'soldier', durability: 6, payload: { n: 2 } });
  let same = 0;
  for (let bx = 80; bx <= 400; bx += 1) for (let pz = 2040; pz <= 2140; pz += 7) {
    const b = { x: bx, pz, z: pz + 12 };
    assert.equal(sweepContactSupply(st, b), ref(st, b), `정지 통 x ${bx} pz ${pz}`);
    same++;
  }
  assert.ok(same > 4000);
});

test('V3-VEHICLE VEH-7: 지나침 — 미개봉 차량을 지나면 supplyMissed 정확히 1회, 이후 x 고정·moveT 정지. 짝(pairId) 배제는 차량에도 같다', () => {
  const run = synth([vehDef({ z: 900, durability: 100000 })], { startUnits: 1 });
  const s = run.supplies[0];
  let missed = 0;
  for (let i = 0; i < 400; i++) { stepRun(run, IN, STEP); missed += evOf(run, 'supplyMissed').length; }
  assert.ok(run.z > 900);
  assert.equal(missed, 1); assert.equal(run.missedSupplies, 1); assert.equal(s.missed, true);
  const x = s.x, t = s.moveT;
  for (let i = 0; i < 60; i++) { stepRun(run, IN, STEP); drainEvents(run); }
  assert.equal(s.x, x, '지나친 뒤 x 고정'); assert.equal(s.moveT, t, '시계도 멈춘다'); assert.equal(s.prevX, x);
  //  짝: 차량 v1(좌) 을 열고 짝 v2(우) 를 지나면 supplySkipped(기존 PAIR 규칙 그대로)
  const run2 = synth([vehDef({ id: 'v1', z: 900, x: 120, durability: 1, pairId: 'p', move: MV(120, 200, 4) }),
                      vehDef({ id: 'v2', z: 900, x: 330, durability: 100000, pairId: 'p', move: MV(280, 330, 4) })], { startUnits: 1 });
  const [v1, v2] = run2.supplies;
  const ev = [];
  hitSupply(v1, { x: 120, z: 900, pz: 890, dmg: 1, dead: false }, ev, run2);
  assert.equal(v1.opened, true);
  assert.equal(structurallyLost(v2, run2), true, '짝이 열렸으니 v2 는 구조적으로 얻을 수 없다');
  let skipped = 0;
  for (let i = 0; i < 400; i++) { stepRun(run2, IN, STEP); skipped += evOf(run2, 'supplySkipped').length; }
  assert.equal(skipped, 1); assert.equal(v2.skipped, true); assert.equal(run2.skippedSupplies, 1);
});

test('V3-VEHICLE VEH-8: 차폐(coverZ) 유지 — run.z < coverZ 동안 탄은 supplyBlock·내구 불변이지만 x 는 움직인다, 개방 뒤엔 supplyHit', () => {
  const run = synth([vehDef({ z: 2000, coverZ: 1800, durability: 100000 })], { startUnits: 1 });
  const s = run.supplies[0];
  let blocks = 0, hitsBefore = 0, hitsAfter = 0, moved = false;
  for (let i = 0; i < 700; i++) {
    if (s.moveT !== null) dropBullet(run, s.x, s.z);   // 지금 통이 있는 x 에 탄을 놓는다(반드시 닿는다)
    stepRun(run, IN, STEP);
    const ev = drainEvents(run);
    if (run.z < 1800) {
      blocks += ev.filter((e) => e.type === 'supplyBlock').length;
      hitsBefore += ev.filter((e) => e.type === 'supplyHit').length;
      if (s.moveT !== null && s.x !== s.homeX) moved = true;
      assert.equal(s.durability, 100000, '차폐 중 내구 불변');
      if (s.moveT !== null) assert.equal(structurallyLost(s, run), true, '차폐 미개방 = 구조적 불가');
    } else hitsAfter += ev.filter((e) => e.type === 'supplyHit').length;
  }
  assert.ok(blocks > 0, '차폐 중 흡수 ' + blocks); assert.equal(hitsBefore, 0);
  assert.ok(moved, '차폐 중에도 달린다');
  assert.ok(hitsAfter > 0, '개방 뒤 명중 ' + hitsAfter); assert.ok(s.durability < 100000);
});

test('V3-VEHICLE VEH-9: chain 차량 — 열리면 정지하고 발판 x 가 전부 열린 순간의 s.x(한 줄)', () => {
  const run = synth([vehDef({ z: 2400, kind: 'chain', durability: 1, payload: { pads0: 5, maxPads: 15 } })], { startUnits: 1 });
  const s = run.supplies[0];
  let openX = null;
  for (let i = 0; i < 700 && openX === null; i++) {
    if (s.moveT !== null) dropBullet(run, s.x, s.z);
    stepRun(run, IN, STEP);
    for (const e of drainEvents(run)) if (e.type === 'supplyOpen') openX = e.x;
  }
  assert.notEqual(openX, null, '열렸다');
  assert.equal(s.activated, true);
  assert.equal(s.pads.length, 5);
  for (const p of s.pads) assert.equal(p.x, openX, '발판은 열린 x 한 줄');
  assert.notEqual(openX, s.homeX, '출발 x 가 아닌 곳에서 열렸다');
  for (let i = 0; i < 60; i++) { stepRun(run, IN, STEP); drainEvents(run); assert.equal(s.x, openX); }
});

test('V3-VEHICLE VEH-10: 배치 불변식 — S6·S12 차량은 범위·출발점·속도·벽·hint 를 지키고 코스 버전 2', () => {
  assert.equal(stageVersion(6), 2); assert.equal(stageVersion(12), 2);
  for (const id of [6, 12]) {
    const st = buildStage(id);
    const solid = st.walls.filter((w) => w.kind !== 'cover');
    const vehicles = st.supplies.filter((s) => s.move);
    assert.ok(vehicles.length >= 1);
    for (const s of vehicles) {
      const m = s.move;
      assert.ok(m.x0 < m.x1, `S${id} ${s.id} x0<x1`);
      assert.ok(m.x0 - s.r >= 80 && m.x1 + s.r <= 400, `S${id} ${s.id} 도로 안`);
      assert.ok(m.period > 0 && Number.isFinite(m.period));
      assert.ok(s.x === m.x0 || s.x === m.x1, `S${id} ${s.id} 양 끝 출발`);
      assert.ok(2 * (m.x1 - m.x0) / m.period * STEP <= s.r, `S${id} ${s.id} 속도`);
      for (const w of solid) if (w.z0 - BAL3.squad.wallLead <= s.z && s.z <= w.z1) assert.fail(`S${id} ${s.id} 벽 ${w.id} 활성 구간 안`);
      assert.ok(typeof s.hint === 'string' && s.hint.length > 0, `S${id} ${s.id} hint(기본 문구 방지)`);
      assert.equal(s.coverZ, null); assert.equal(s.pairId, null);
    }
  }
  assert.equal(buildStage(6).supplies.length, 5); assert.equal(buildStage(12).supplies.length, 5);
});

//  r3.18 재기준(대항 검수 반영): 종전엔 planBoss(도로에서 x240 고정 = 무입력)가 S6 차량 3대를 전부 열었다 — '갈 자리에 미리 서라'가 필요 없다는 지적.
//   내구 40/40/48 + armZ 440 뒤에는 무입력이 셋 다 못 열고, 선행 조준 봇(lead)만 연다. S12 c4(내구 128)는 도착 병력이 커 무입력도 연다(courses.js 주석)
test('V3-VEHICLE VEH-11: 완주 — planBoss 보통이 S6·S12 를 완주하되 S6 차량은 못 열고, 선행 조준 봇(lead)은 세 대를 전부 연다(봇 결과 — 사람 성공률 아님)', (t) => {
  const r6 = playPolicy(6, 'planBoss', 14400, 'normal');
  assert.equal(r6.run.won, true, 'S6 완주');
  for (const id of ['c1', 'c2', 'c4']) assert.ok(!r6.opened.includes(id), 'S6 무입력이 ' + id + ' 를 열면 안 된다: ' + r6.opened.join(','));
  const l6 = playPolicy(6, 'lead', 14400, 'normal');
  assert.equal(l6.run.won, true, 'S6 lead 완주');
  for (const id of ['c1', 'c2', 'c4']) assert.ok(l6.opened.includes(id), 'S6 lead ' + id + ' 개봉: ' + l6.opened.join(','));
  const l6b = playPolicy(6, 'lead', 14400, 'brutal');
  for (const id of ['c1', 'c2', 'c4']) assert.ok(l6b.opened.includes(id), 'S6 lead(지옥) ' + id + ' 개봉: ' + l6b.opened.join(','));
  const r12 = playPolicy(12, 'planBoss', 14400, 'normal');
  assert.equal(r12.run.won, true, 'S12 완주');
  assert.ok(r12.opened.includes('c4'), 'S12 c4(차량) 개봉: ' + r12.opened.join(','));
  const l12 = playPolicy(12, 'lead', 14400, 'normal');
  assert.ok(l12.opened.includes('c4') && l12.run.won);
  t.diagnostic(`VEHICLE S6 planBoss units=${r6.run.units.length} opened=${r6.opened.join(',')} · lead units=${l6.run.units.length} opened=${l6.opened.join(',')} · S12 units=${r12.run.units.length} opened=${r12.opened.join(',')}`);
});

//  호출 기록 ctx(rush3-render 의 recCtx 와 같은 꼴)
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
const fxLike = () => ({ parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0,
                        shutterT: 0, shutterText: null, lotOpen: 0, lotSeen: false, lotSame: false });
function drawRun(run) {
  const { ctx, ops } = recCtx();
  //  r3.20 원근 투영: 이 검사는 장치의 '무엇을 어디에(트랙 좌표 기준)' 를 잠그므로 평면 변환(flat = 항등)으로 그린다 — 원근 기하는 V3-PROJECT 가 따로 잠근다
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true, flat: true });
  return ops;
}
const wheels = (ops) => ops.filter((o) => o.op === 'arc' && o.args[2] === 6 && o.fill === BAL3.colors.outline).length;
const dashes = (ops) => ops.filter((o) => o.op === 'setLineDash' && Array.isArray(o.args[0]) && o.args[0][0] === 6 && o.args[0][1] === 6).length;

test('V3-VEHICLE VEH-12: 렌더 — +3 이 이동한 x 를 따라가고, 바퀴 arc 4·궤도 점선·진행 방향 화살표가 그려진다. 정지 통엔 바퀴 0', () => {
  const run = createRun(buildStage(6));
  const c1 = run.supplies[0];
  while (run.z < 1450) { stepRun(run, IN, STEP); drainEvents(run); }
  assert.ok(c1.moveT > 0 && !c1.opened, 'c1 이 움직이는 중');
  assert.notEqual(c1.x, c1.homeX);
  const ops = drawRun(run);
  const plus = ops.find((o) => o.op === 'fillText' && o.args[0] === '+3');
  assert.ok(plus, '+3 을 그린다');
  assert.equal(plus.args[1], c1.x, '+3 의 x = 이동한 c1.x'); assert.notEqual(plus.args[1], 120);
  assert.equal(wheels(ops), 4, '바퀴 4');
  assert.ok(dashes(ops) >= 1, '궤도 점선');
  //  화살표: 진행 방향(prevX → x) 쪽 꼭짓점 x = s.x + dir·(r + 22)
  const dir = Math.sign(c1.x - c1.prevX);
  assert.equal(dir, 1, 'x0 출발 첫 반주기 = 오른쪽');
  const y = BAL3.view.LINE_Y - (c1.z - run.z);
  const tip = ops.find((o) => o.op === 'moveTo' && Math.abs(o.args[0] - (c1.x + dir * (R + 22))) < 1e-9 && Math.abs(o.args[1] - y) < 1e-9);
  assert.ok(tip, '화살표 꼭짓점');
  assert.equal(tip.fill, BAL3.colors.gold);
  //  같은 프레임에서 c1 을 정지 통으로 바꿔 그리면 바퀴·점선이 사라진다(정지 통 경로 회귀 0)
  const saved = c1.move; c1.move = null;
  const ops2 = drawRun(run);
  c1.move = saved;
  assert.equal(wheels(ops2), 0); assert.equal(dashes(ops2), 0);
  assert.ok(ops2.find((o) => o.op === 'fillText' && o.args[0] === '+3'), '정지 통도 +3 은 그린다');
  //  내구 숫자도 차량을 따라간다. r3.18: z 1450 은 dz 550 > armZ 440 = 활성 전이라 회색(gateZero) + 자물쇠(roundRect 16×13)
  const dur = ops.find((o) => o.op === 'fillText' && o.args[0] === String(c1.durability) && o.fill === BAL3.colors.gateZero);
  assert.ok(dur && dur.args[1] === c1.x, '내구 숫자 x = c1.x');
  assert.ok(ops.some((o) => o.op === 'arc' && o.args[2] === 5 && o.args[3] === Math.PI && o.args[4] === 0), '활성 전 자물쇠(고리 arc)');
  //  활성 구간에 들면 주황
  const runA = createRun(buildStage(6));
  while (runA.supplies[0].z - runA.z > BAL3.supply.armZ) { stepRun(runA, IN, STEP); drainEvents(runA); }
  const opsA = drawRun(runA);
  const durA = opsA.find((o) => o.op === 'fillText' && o.args[0] === String(runA.supplies[0].durability) && o.fill === BAL3.colors.bulletHeavy);
  assert.ok(durA && durA.args[1] === runA.supplies[0].x, '활성 뒤 내구 숫자 주황');
  //  왼쪽으로 가는 반주기: 화살표 방향이 뒤집힌다
  while (!(c1.x < c1.prevX) && !c1.opened && run.z < 2000) { stepRun(run, IN, STEP); drainEvents(run); }
  if (!c1.opened) {
    const ops3 = drawRun(run);
    const y3 = BAL3.view.LINE_Y - (c1.z - run.z);
    assert.ok(ops3.find((o) => o.op === 'moveTo' && Math.abs(o.args[0] - (c1.x - (R + 22))) < 1e-9 && Math.abs(o.args[1] - y3) < 1e-9), '왼쪽 화살표');
  }
});

//  셸 하네스(rush3-loop 의 bootFake 최소판): 가짜 캔버스·저장·rAF 큐
function fakeCanvas() {
  const grad = { addColorStop() {} };
  const ctx = new Proxy({ canvas: null }, {
    get(t, k) { if (k in t) return t[k]; if (typeof k !== 'string') return undefined; return () => (k.startsWith('create') ? grad : k === 'measureText' ? { width: 10 } : undefined); },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { width: 480, height: 800, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }), addEventListener() {} };
}
const fakeAudio = () => ({ unlock() {}, sfx() { return true; }, bgmPlay() {}, bgmPause() {}, bgmResume() {}, setVolume() {}, getVolume() { return 1; }, setMuted() {}, isMuted() { return false; }, duck() {} });
function fakeStorage() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
async function bootFake(storage = fakeStorage()) {
  const queue = [];
  let nowMs = 1000;
  const save = createSave3(storage);
  const app = boot(fakeCanvas(), { win: null, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save, audio: fakeAudio(), sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  const frames = (n) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  return { app, frames, save, storage };
}

test('V3-VEHICLE VEH-13: 셸 안내 — S6 첫 차량이 화면에 들어온 프레임에 배너 1회 + 저장 seenVehicle, 다음 판엔 안 뜬다. 저장 기본 false·비불리언은 false', async () => {
  const { app, frames, save, storage } = await bootFake();
  assert.equal(save.get().seenVehicle, false, '새 사용자');
  app.startRun(6);
  const run = () => app.getRun(), fx = () => app.getFx();
  let guard = 0;
  while (run().supplies[0].moveT === null && guard++ < 900) frames(1);
  assert.ok(guard < 900, 'c1 이 화면에 들어왔다');
  assert.equal(fx().vehicleTipSeen, true);
  assert.deepEqual(fx().shutterText, VEHICLE_GUIDE_TEXT);
  assert.ok(fx().shutterT > BAL3.fx.shutterGuideSec - 0.1 && fx().shutterT <= BAL3.fx.shutterGuideSec, '배너 시간 ' + fx().shutterT);
  assert.equal(save.get().seenVehicle, true, '사용자당 1회 — 저장에 남는다');
  assert.equal(save.get().seenShutter, true, '앞의 g1 셔터 배너는 이미 소진됐다(같은 슬롯이라 겹치지 않는다)');
  //  같은 저장의 다음 판: 배너 없음(vehicleTipSeen 은 판마다 다시 선다)
  app.startRun(6);
  guard = 0;
  while (run().supplies[0].moveT === null && guard++ < 900) frames(1);
  assert.ok(guard < 900);
  assert.equal(fx().vehicleTipSeen, true);
  assert.equal(fx().shutterT, 0, '두 번째 판에는 배너가 없다');
  assert.notDeepEqual(fx().shutterText, VEHICLE_GUIDE_TEXT);
  //  재로드 뒤에도 남고, 비불리언은 false 로 정규화
  assert.equal(createSave3(storage).get().seenVehicle, true);
  const s2 = createSave3(fakeStorage());
  assert.equal(s2.get().seenVehicle, false);
  s2.patch({ seenVehicle: 'yes' });
  assert.equal(s2.get().seenVehicle, false);
  //  차량이 없는 판(S1)에서는 아무것도 세우지 않는다
  const b2 = await bootFake();
  b2.app.startRun(1);
  b2.frames(300);
  assert.equal(b2.app.getFx().vehicleTipSeen, false);
  assert.equal(b2.save.get().seenVehicle, false);
  assert.notDeepEqual(b2.app.getFx().shutterText, VEHICLE_GUIDE_TEXT);
  void SHUTTER_GUIDE_TEXT;
});
