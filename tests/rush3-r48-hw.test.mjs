// rush3-r48-hw — r4.8 (가) 보스전 밀집 대형 BOSS-HW(이사님 실플레이 3차, 2026-09-26).
//  이사님 원문: "가장 큰 문제는 내가 병사를 아무리 많이 모아도 보스에 가면 총알을 많이 쏟아부으니까 피할 수가 없이 모든 총알을 맞게 된다는 점이다."
//  원인: 100명 대형 반폭 약 130px(폭 260) = 도로 폭 320 의 80% — 어디로 가도 누군가 맞는다.
//  처방: 게임 화면 줄(brutal)에서만 보스 등장 ~ 승리 동안 대형 반폭 상한 bossHw 64(분리벽 통로와 같은 압축 경로 squad.clampCenter 의 capHw).
//   상한은 보스가 나온 STEP 의 반폭에서 BAL3.squad.bossHwRate px/s 로 줄어든다(한 번에 뭉개지지 않게 — '전환 뒤' 64 이하).
//   상한 화력 계산기(firepower)도 같은 대형으로 잰다 — 보스 체력 = 상한 화력 × 30초(BOSS-30S 는 rush3-r47-boss 가 그대로 잠근다).
//  배수 1 줄(normal)은 칸이 없어 종전 대형 그대로다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAL3 } from '../rush3/balance.js';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { formationHalfWidth } from '../rush3/squad.js';
import { squadOffsets, squadCenterRange } from '../rush3/firepower.js';

const HW = 64;
const halfW = (run) => run.units.reduce((m, u) => Math.max(m, Math.abs(u.dx)), 0) + BAL3.squad.unitR;
const inp = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0 });

//  r4.10(이사님 실플레이 5차 — 보스는 3·6·9·12·15·18·21·24 판에만): 게임 줄 보스 판 = 줄 표의 bossStages. 보스 없는 대물결 판에는 밀집 대형 칸이 없다
const BOSS_IDS = BAL3.difficulty.brutal.bossStages;
//  보스전만 떼어 낸 판(게이트·통·스폰·벽 없음): n 명으로 보스 등장 직전에서 시작. 보스 공격·소환·접촉은 끈다(대형만 본다)
//   bonusFrom = 보너스전 정의를 가져올 판(보스 판 정의에 붙여 '승리 뒤 보너스전'을 본다 — r4.10 에서 8번 보너스 판이 보스 판이 아니게 되어서)
function fightRun(id, n, difficulty = 'brutal', keepBonus = false, bonusFrom = null) {
  const st = buildStage(id, { difficulty });
  const bonus = bonusFrom != null ? buildStage(bonusFrom, { difficulty }).bonus : keepBonus ? st.bonus : null;
  const stage = { ...st, startUnits: n, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus };
  const run = createRun(stage);
  run.z = run.prevZ = stage.eliteZ - 2;
  return run;
}
function quiet(run) {
  for (const b of run.bosses) { b.shoot = false; b.summon = false; b.atk = null; b.hp = b.max = 1e9; }
  if (run.arena) { run.arena.boss.touchDmg = 0; run.arena.boss.shock.dmg = 0; }
  for (const u of run.units) u.hp = 1e9;
}

test('BOSS-HW-1: 표 — 게임 줄 bossHw 64 · 배수 1 줄 null · buildStage 는 게임 줄에서 보스가 있는 판(보스 판 8개 — r4.10)에만 stage.bossHw(대물결 판·배수 1 줄은 키 없음)', () => {
  assert.equal(BAL3.difficulty.brutal.bossHw, HW);
  assert.equal(BAL3.difficulty.normal.bossHw, null);
  assert.ok(BAL3.squad.bossHwRate > 0);
  for (const id of BOSS_IDS) assert.equal(buildStage(id, { difficulty: 'brutal' }).bossHw, HW, `S${id} 게임 줄 보스 판`);
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    if (st.elites.length) assert.equal(st.bossHw, HW, `S${id} 게임 줄(보스가 있는 판)`);
    else assert.ok(!('bossHw' in st), `S${id} 게임 줄 보스 없는 판은 칸이 없다`);
    assert.ok(!('bossHw' in buildStage(id)), `S${id} 배수 1 줄은 칸이 없다`);
    assert.ok(!('bossHw' in createRun(buildStage(id))) && !('hwCap' in createRun(buildStage(id))), `S${id} 배수 1 줄 run 에도 없다`);
  }
});

test('BOSS-HW-2: 게임 줄 보스전 — 보스가 나온 STEP 부터 반폭 상한이 bossHwRate 로 줄고(한 번에 뭉개지지 않는다) 전환 뒤 반폭 ≤ 64 · 중심 범위는 지금 규칙 그대로(140~340, 광장 100~380)', () => {
  for (const [id, n] of [[12, 100], [3, 100], [18, 60], [9, 30], [24, 100], [15, 60]]) {
    const run = fightRun(id, n);
    let steps = 0;
    while (!run.bosses.length && steps < 600) { stepRun(run, inp(240), STEP); drainEvents(run); steps++; }
    assert.ok(run.bosses.length, `S${id} 보스 등장`);
    quiet(run);
    const fw = formationHalfWidth(n);
    assert.equal(run.hwCap, Math.max(HW, fw), `S${id} 상한은 지금 반폭에서 시작`);
    //  전환: STEP 마다 rate·dt 이하로만 줄고, 되돌아가지 않는다
    let prev = run.hwCap, t = 0;
    while (run.hwCap > HW && t < 5) {
      stepRun(run, inp(240), STEP); drainEvents(run); t += STEP;
      assert.ok(prev - run.hwCap <= BAL3.squad.bossHwRate * STEP + 1e-9 && run.hwCap <= prev, `S${id} 부드러운 전환`);
      assert.ok(halfW(run) <= Math.min(fw, prev) + 1e-9, `S${id} 대형은 상한 안`);
      prev = run.hwCap;
    }
    assert.equal(run.hwCap, HW, `S${id} 전환 끝`);
    assert.ok(t <= (fw - HW) / BAL3.squad.bossHwRate + 2 * STEP, `S${id} 전환 ${t.toFixed(2)}초`);
    //  전환 뒤: 어디에 서도 반폭 ≤ 64, 중심 범위 = 지금 규칙(벽 밖 hw' = min(반폭, 60))
    const [lo, hi] = run.arena ? [run.arena.w[0] + Math.min(fw, HW, 60), run.arena.w[1] - Math.min(fw, HW, 60)] : squadCenterRange(n, HW);
    for (const x of [0, 170, 240, 310, 480]) {
      for (let i = 0; i < 90; i++) { stepRun(run, inp(x), STEP); drainEvents(run); }
      assert.ok(halfW(run) <= HW + 1e-9, `S${id} n${n} x→${x}: 반폭 ${halfW(run)}`);
      if (x === 0) assert.ok(Math.abs(run.x - lo) < 1e-6, `S${id} 왼쪽 끝 중심 ${run.x} = ${lo}`);
      if (x === 480) assert.ok(Math.abs(run.x - hi) < 1e-6, `S${id} 오른쪽 끝 중심 ${run.x} = ${hi}`);
    }
    if (!run.arena && n >= 30) assert.deepEqual([lo, hi], [140, 340], '도로 중심 범위(지금 규칙 그대로)');
  }
});

test('BOSS-HW-3: 배수 1 줄은 그대로 — 같은 보스전에서 상한이 없고(hwCap 없음) 도로 가운데 대형 반폭 = formation 반폭', () => {
  for (const [id, n] of [[22, 100], [24, 100], [10, 60]]) {
    const run = fightRun(id, n, 'normal');
    let steps = 0;
    while ((!run.bosses.length || steps < 400) && steps < 2000) { stepRun(run, inp(240), STEP); drainEvents(run); steps++; if (run.bosses.length) quiet(run); }
    assert.ok(run.bosses.length && !('hwCap' in run) && !('bossHw' in run), `S${id} 배수 1 줄: 상한 칸 없음`);
    assert.equal(halfW(run), formationHalfWidth(n), `S${id} 가운데 대형 반폭 그대로`);
  }
});

test('BOSS-HW-4: 계산기 = 게임 대형 — firepower.squadOffsets(n, 중심, 64) 가 전환 뒤 실제 유닛 자리(dx·dy)와 같다(1·30·60·100명 × 중심 5곳)', () => {
  for (const n of [1, 30, 60, 100]) {
    const run = fightRun(12, n);
    let steps = 0;
    while ((!run.bosses.length || run.hwCap > HW) && steps < 2000) { stepRun(run, inp(240), STEP); drainEvents(run); steps++; if (run.bosses.length) quiet(run); }
    const [lo, hi] = squadCenterRange(n, HW);
    for (const sx of [lo, 200, 240, 300, hi]) {
      run.x = run.tx = sx;
      stepRun(run, inp(sx), STEP); drainEvents(run);
      assert.equal(run.x, sx);
      assert.deepEqual(run.units.map((u) => [u.dx, u.dy]), squadOffsets(n, sx, HW).map((u) => [u.dx, u.dy]), `n${n} 중심 ${sx}`);
    }
  }
  //  상한 없는 계산(현상금 적 — 보스전 밖)은 종전 그대로
  assert.deepEqual(squadOffsets(100, 240), squadOffsets(100, 240, null));
  assert.ok(squadOffsets(100, 240).some((u) => Math.abs(u.dx) > HW), '보스전 밖은 넓은 대형');
});

//  보스전 실측(동작 확인 — 난이도 판단 아님): 상한 부대(stage.bossFloor 의 병력·무기·Mk)로 보스 공격을 끈 채 붙는다.
//   lead = 탄이 보스에 닿을 때(비행 시간 = 거리 ÷ 탄 속도) 보스가 있을 자리에 앞질러 선다. 밀집 대형은 보스(판정 폭 약 101px)와 폭이 비슷해
//   바로 아래만 따라가면(planBoss — BOSS-30S-3) 탄이 날아가는 동안 보스가 비켜 가 계산보다 오래 걸린다
function leadFight(id) {
  const st = buildStage(id, { difficulty: 'brutal' });
  const f = st.bossFloor;
  const stage = { ...st, startUnits: f.units, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
  const run = createRun(stage, { startWeapon: f.weapon, startMk: f.mk });
  run.z = run.prevZ = stage.eliteZ - 2;
  const vz = BAL3.weapons[f.weapon].vz;
  let steps = 0, t0 = null;
  while (!run.bossDefeated && steps < 28800) {
    let x = run.boss ? run.boss.x : 240;
    const bo = run.boss;
    if (bo && bo.state === 'hold') {
      x = bo.x + bo.dir * bo.patrolSpeed * ((bo.z - run.z) / vz);
      if (x > bo.laneHi) x = 2 * bo.laneHi - x;
      if (x < bo.laneLo) x = 2 * bo.laneLo - x;
    }
    stepRun(run, inp(x), STEP); drainEvents(run); steps++;
    for (const b of run.bosses) { b.shoot = false; b.summon = false; b.atk = null; }
    if (t0 === null && run.bosses.length) t0 = run.time;
  }
  return { won: run.bossDefeated, sec: run.time - t0 };
}

test('BOSS-HW-6: 계산(상한)은 밀집 대형에서도 닿을 수 있는 값 — 보스가 탄 도착 때 있을 자리에 앞질러 선 상한 부대는 30초 안팎(27~36초)', (t) => {
  for (const id of [3, 6, 9, 12]) {
    const r = leadFight(id);
    assert.ok(r.won && r.sec >= 27 && r.sec <= 36, `S${id}: ${r.sec.toFixed(1)}초`);
    t.diagnostic(`BOSS-LEAD S${id} → ${r.sec.toFixed(1)}초`);
  }
});

test('BOSS-HW-5: 승리 뒤(보너스전 — 8번의 표적전 정의)에는 같은 빠르기로 상한을 풀고 칸을 지운다 — 표적전은 종전 대형', () => {
  //  r4.10: 게임 줄 8번은 보스 판이 아니다 — 보스 판(3번)에 8번의 보너스전 정의를 붙여 '보스 격파 → 보너스전'을 본다(규칙 경로는 같다)
  const run = fightRun(3, 100, 'brutal', false, 8);
  assert.ok(run.bonusDef, '8번 = 보너스전 판');
  let steps = 0;
  while ((!run.bosses.length || run.hwCap > HW) && steps < 2000) { stepRun(run, inp(240), STEP); drainEvents(run); steps++; if (run.bosses.length && run.bosses[0].hp > 1) quiet(run); }
  assert.equal(run.hwCap, HW);
  run.bosses[0].hp = 0.5;
  while (run.phase !== 'bonus' && steps < 4000) { stepRun(run, inp(240), STEP); drainEvents(run); steps++; }
  assert.equal(run.phase, 'bonus', '보너스전 시작');
  let t = 0;
  while ('hwCap' in run && t < 3) { stepRun(run, inp(240), STEP); drainEvents(run); t += STEP; }
  assert.ok(!('hwCap' in run), `상한 해제(${t.toFixed(2)}초)`);
  assert.ok(t <= (formationHalfWidth(100) - HW) / BAL3.squad.bossHwRate + 3 * STEP, '같은 빠르기');
  assert.equal(halfW(run), formationHalfWidth(100), '종전 대형');
});
