// rush3-r48-motion — r4.8 (라) 적 걷기·굴러오기 그림(이사님 실플레이 3차, 2026-09-26). **그림만 — 규칙 불변(두 줄 공통)**.
//  이사님 원문: "적들이 걸어서 내려오는 듯한 스프라이트도 추가하자. 굴러내려오는건 굴러내려오는 모양으로 보이게 하고"
//  걷기 동작 시트가 없어 코드로 움직임을 준다(render.enemyMotionPose): 다리 달린 적 = 걸음 박자 튐·좌우 기울기·발 디딤 눌림 ·
//   바퀴(E5) = 바퀴 중심 회전(각 = 다가온 거리 ÷ 반지름) + 튐 + 흙먼지 · 차(E2·E7) = 떨림 + 흙먼지(돌리지 않는다) · 저격수 = 숨쉬기.
//  WALK/ROLL: 걷는 적은 박자에 따라 그리는 위치·기울기가 바뀌고, 바퀴 적은 각도가 속도에 비례해 늘어난다(그리기 호출 기록으로), 규칙 상태(run)는 읽기만.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer3, enemyMotionPose, ENEMY_MOTION, WALK, artBase3 } from '../rush3/render.js';
import { SHEETS3, ENEMY_ART3, loadSprites3 } from '../rush3/sprites.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { makeFx } from '../rush3/main.js';

const DEG = Math.PI / 180;
//  호출 기록 ctx
function recCtx() {
  const ops = [], stack = [], grad = { addColorStop() {} };
  const state = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', canvas: null };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'save') stack.push({ ...t });
        if (k === 'restore') { const s = stack.pop(); if (s) Object.assign(t, s); }
        ops.push({ op: k, args, fill: t.fillStyle, alpha: t.globalAlpha });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
//  적 한 기만 있는 판(부대는 멀리 뒤 — 적이 부대에 닿지 않게). kind·skin·hp
function oneEnemy(kind, skin = null, hp = 50) {
  const sp = { z: 0, kind, n: 1, xs: [240], zs: [600], hp, corridorHw: null };
  if (skin) sp.skin = skin;
  const stage = { id: 'm', version: 1, title: 'm', startUnits: 1, startWeapon: 'rifle', length: 90000, eliteZ: null,
                  gateRows: [], supplies: [], walls: [], spawns: [sp], elite: null };
  const run = createRun(stage);
  stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run);
  for (const u of run.units) u.fireT = 1e9;   // 적을 쏘지 않게(체력·피격 반응 불변)
  return run;
}
function draw(run, fx = makeFx(), sprites = null) {
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, sprites).draw({ state: 'run', now: 1, run, fx, hud: { distM: 0 }, buttons: [], saveOk: true });
  return ops;
}
const rotates = (ops) => ops.filter((o) => o.op === 'rotate').map((o) => o.args[0]);

test('MOTION-1: 움직임 표 — 다리 달린 적 = 걷기(E1·E3·E8) · 바퀴 = 굴러오기(E5) · 차 = 떨림(E2·E7, 돌리지 않음) · 저격수 = 숨쉬기 · 판에 나오는 모든 일반 적 그림에 종류가 있다 · 보스·현상금은 없음', () => {
  assert.equal(ENEMY_MOTION.E1_scrapbit, 'walk');
  assert.equal(ENEMY_MOTION.E5_wheeler, 'roll');
  assert.equal(ENEMY_MOTION.E6_signaler, 'hover');
  assert.deepEqual([ENEMY_MOTION.E2_ramhound, ENEMY_MOTION.E7_cartyard], ['drive', 'drive']);
  for (const k of ['E3_wallguard', 'E8_manholejumper']) assert.equal(ENEMY_MOTION[k], 'walk', k);
  for (const k of ['E9_spawnpod', 'E10_magnethead', 'E4_needleeye']) assert.equal(ENEMY_MOTION[k], 'hover', k);
  const used = new Set();
  for (const id of ALL_STAGE_IDS) for (const row of ['normal', 'brutal']) for (const sp of buildStage(id, { difficulty: row }).spawns) if (sp.kind !== 'bounty') used.add(artBase3(sp.kind, sp.skin));
  for (const a of used) assert.ok(ENEMY_MOTION[a], a + ' 움직임 종류');
  for (const a of ENEMY_ART3.filter((n) => n.startsWith('B'))) assert.equal(ENEMY_MOTION[a], undefined, a + ' 보스는 움직임 표 밖');
  //  걷기 시트 자리(파일은 아직 없다 — 들어오면 코드 움직임 대신 쓴다). 파일이 없는 동안(pending)은 불러오지 않는다 — 콘솔 404 없음
  assert.equal(SHEETS3.e_grunt_walk.file, 'E1_walk');
  assert.equal(SHEETS3.e_grunt_walk.pending, true);
});

test('MOTION-1b: 그림 불러오기 — 파일이 아직 없는 걷기 시트 자리(pending)는 요청하지 않는다(나머지 시트는 그대로 요청)', async () => {
  const requested = [];
  globalThis.Image = class { set src(v) { requested.push(v); setTimeout(() => this.onerror && this.onerror(), 0); } };
  try {
    await loadSprites3('assets/rush/', 'assets/rush3/');
  } finally { delete globalThis.Image; }
  assert.ok(!requested.some((s) => s.includes('E1_walk')), '걷기 시트 자리는 요청하지 않는다');
  assert.ok(requested.some((s) => s.includes('E1_hit')) && requested.some((s) => s.includes('E1_death')), '다른 시트는 그대로');
});

test('WALK-1: 걷는 잡졸 자세 — 걸음마다 한 번 튀고(발 디딤 = 튐 0 · 눌림 최대) · 기울기는 걸음마다 좌우가 바뀌어 두 걸음에 한 주기(±4°, 3~5°) · 박자 = 다가온 거리 ÷ 보폭(빠르기에 비례) · 위상은 id 로 어긋남 · 피격 중엔 흔들림 ×0.25 · 기절 중엔 멈춤', () => {
  const run = oneEnemy('grunt');
  const e = run.enemies[0];
  const at = (d, hitK = 1, ee = e) => { ee.z = run.z + d; return enemyMotionPose(ee, run, hitK); };
  let maxTilt = 0;
  for (let d = 700; d >= 100; d -= 3) {
    const p = at(d);
    assert.equal(p.kind, 'walk');
    assert.ok(p.bob >= 0 && p.bob <= WALK.bob + 1e-9);
    maxTilt = Math.max(maxTilt, Math.abs(p.tilt));
    assert.ok(p.sy <= 1 && p.sx >= 1, '발 디딤 눌림은 옆으로 퍼지고 위아래로 눌린다');
  }
  assert.ok(maxTilt >= 3 * DEG && maxTilt <= 5 * DEG + 1e-9, `기울기 최대 ${(maxTilt / DEG).toFixed(2)}°`);
  //  박자: 다가온 거리 Δ 만큼 걸음 수가 Δ ÷ 보폭 만큼 는다(1초에 다가온 거리 = 빠르기 → 박자 ∝ 빠르기)
  assert.ok(Math.abs((at(400).steps - at(520).steps) - 120 / WALK.stride) < 1e-9);
  //  걸음 한가운데(튐 최대)와 발 디딤(튐 0) · 좌우 번갈아
  const base = at(600).steps;
  const dAt = (steps) => 600 - (steps - base) * WALK.stride;
  const mid1 = at(dAt(Math.floor(base) + 1.5)), mid2 = at(dAt(Math.floor(base) + 2.5)), land = at(dAt(Math.floor(base) + 2));
  assert.ok(mid1.bob > WALK.bob * 0.99 && mid2.bob > WALK.bob * 0.99, '걸음 한가운데 = 가장 높이');
  assert.ok(Math.sign(mid1.tilt) === -Math.sign(mid2.tilt) && Math.abs(mid1.tilt) > 3.9 * DEG, '좌우로 번갈아 기울기');
  assert.ok(land.bob < 1e-6 && land.sy < 1 - WALK.squash * 0.99, '발 디딤 = 튐 0 · 눌림 최대');
  //  위상: 같은 자리의 다른 id 잡졸은 박자가 어긋난다
  const other = { ...e, id: e.id + 1 };
  assert.notEqual(at(300).steps, at(300, 1, other).steps);
  //  피격 반응 중엔 흔들림을 줄인다 · 기절 중엔 멈춘다
  assert.ok(Math.abs(at(dAt(Math.floor(base) + 1.5), WALK.hitDamp).tilt) <= WALK.tilt * WALK.hitDamp + 1e-9);
  e.stunT = 0.5; assert.equal(at(300), null); e.stunT = 0;
});

test('WALK-2: 그리기 호출 — 걷는 잡졸은 박자에 따라 그리는 자리(발밑 기준 translate)와 기울기(rotate)가 바뀐다 · 그리기 전후 run 이 같다(읽기만)', () => {
  const run = oneEnemy('grunt');
  const e = run.enemies[0];
  const frame = (d) => {
    e.z = run.z + d;
    const snap = JSON.stringify(run);
    const ops = draw(run);
    assert.equal(JSON.stringify(run), snap, '그리기 전후 run 동일');
    const p = enemyMotionPose(e, run, 1);
    const rot = rotates(ops).find((a) => Math.abs(a - p.tilt) < 1e-9);
    assert.ok(rot !== undefined, `d${d}: 기울기 ${p.tilt.toFixed(4)} 를 그린다`);
    return { p, rot, ops };
  };
  const base = enemyMotionPose((e.z = run.z + 500, e), run).steps;
  const a = frame(500 - (Math.floor(base) + 1.5 - base) * WALK.stride);
  const b = frame(500 - (Math.floor(base) + 2.5 - base) * WALK.stride);
  assert.ok(Math.sign(a.rot) === -Math.sign(b.rot), '두 박자의 기울기가 좌우로 다르다');
  //  발밑 기준 들어 올림: 첫 translate 의 y 가 튐만큼 위(두 박자의 튐이 같아도 기울기가 다르다 — 반 걸음이면 튐이 달라진다)
  const c = frame(500 - (Math.floor(base) + 2 - base) * WALK.stride);
  const ty = (f) => f.ops.find((o, i) => o.op === 'translate' && f.ops[i + 1] && f.ops[i + 1].op === 'rotate' && Math.abs(f.ops[i + 1].args[0] - f.rot) < 1e-9)?.args[1];
  assert.ok(ty(a) < ty(c) - 1, `걸음 한가운데(${ty(a)?.toFixed(1)})가 발 디딤(${ty(c)?.toFixed(1)})보다 위에 그려진다`);
});

test('ROLL-1: 굴러오는 바퀴(E5) — 그림을 바퀴 중심으로 계속 돌리고, 한 STEP 에 도는 각 = 그 STEP 에 다가온 거리 ÷ 반지름(달려들며 빨라지면 회전도 빨라진다) · 흙먼지 · 그리기 전후 run 동일', () => {
  const run = oneEnemy('rusher', null, 1e6);
  const e = run.enemies[0];
  const angs = [], dds = [];
  let prevD = e.z - run.z, prevA = null;
  for (let i = 0; i < 60; i++) {
    stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run);
    const d = e.z - run.z;
    const snap = JSON.stringify(run);
    const ops = draw(run);
    assert.equal(JSON.stringify(run), snap);
    const p = enemyMotionPose(e, run, 1);
    assert.equal(p.kind, 'roll');
    const a = rotates(ops).find((v) => Math.abs(v - p.spin) < 1e-9);
    assert.ok(a !== undefined, '바퀴 회전각을 그린다');
    //  흙먼지 점(흙빛)
    assert.ok(ops.some((o) => o.op === 'fill' && o.fill === 'rgba(140,122,98,1)'), '흙먼지');
    if (prevA !== null) { angs.push(a - prevA); dds.push(prevD - d); }
    prevA = a; prevD = d;
  }
  //  각 증가 = 다가온 거리 ÷ 반지름(비례) · 돌격체는 가속하므로 뒤로 갈수록 한 STEP 각이 크다
  angs.forEach((da, i) => assert.ok(Math.abs(da - dds[i] / e.r) < 1e-9, `STEP ${i}: ${da} = ${dds[i]} / ${e.r}`));
  assert.ok(angs[angs.length - 1] > angs[0] * 1.2, `빨라지면 회전도 빨라진다 ${angs[0].toFixed(4)} → ${angs[angs.length - 1].toFixed(4)}`);
});

test('MOTION-2: 차(E2 돌격 트럭·E7 카트)는 몸통을 돌리지 않는다(작은 떨림만) · 저격수는 숨쉬기(위치 고정, 크기만 조금) · 걷기 시트가 들어오면 코드 움직임 대신 시트 칸을 그린다', () => {
  for (const [kind, skin] of [['rusher', 'E2_ramhound'], ['grunt', 'E7_cartyard']]) {
    const run = oneEnemy(kind, skin, 1e6);
    const e = run.enemies[0];
    for (let d = 600; d > 300; d -= 37) {
      e.z = run.z + d;
      const p = enemyMotionPose(e, run, 1);
      assert.equal(p.kind, 'drive');
      assert.ok(Math.abs(p.tilt) <= 0.023 && p.spin === 0, skin + ': 돌리지 않는다');
    }
  }
  const sh = oneEnemy('shooter', null, 1e6);
  const s = sh.enemies[0];
  const p = enemyMotionPose(s, sh, 1);
  assert.equal(p.kind, 'hover');
  assert.ok(p.tilt === 0 && p.spin === 0 && Math.abs(p.sy - 1) <= 0.03, '숨쉬기');
  //  걷기 시트(가짜 그림): 있으면 그 시트를 drawImage 로 그리고 코드 기울기는 없다
  const run = oneEnemy('grunt');
  const e = run.enemies[0];
  e.z = run.z + 400;
  const fakeImg = { width: 244 * 6, height: 255 * 2 };
  const sprites = { get: () => null, icon: () => null, sheet: (k) => (k === 'e_grunt_walk' ? { img: fakeImg, ...SHEETS3.e_grunt_walk } : null) };
  const ops = draw(run, makeFx(), sprites);
  assert.ok(ops.some((o) => o.op === 'drawImage' && o.args[0] === fakeImg), '걷기 시트를 그린다');
  const tilt = enemyMotionPose(e, run, 1).tilt;
  assert.ok(!rotates(ops).some((a) => Math.abs(a - tilt) < 1e-12 && tilt !== 0), '시트가 있으면 코드 기울기는 없다');
});
