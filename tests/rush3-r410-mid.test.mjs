// rush3-r410-mid — r4.10 중간 보스 MIDBOSS(이사님 실플레이 5차, 2026-09-26 "일반 스테이지는 많은 수의 일반 적이나 좀 더 강한 중간 보스로 대체하자").
//  게임 화면 줄(brutal) 중간 보스 판 2·5·8·11·14·17·20·23: 그 판 일반 적 그림을 크게(2.2~2.6배) 키운 강한 적 1체 — 머리 위 '중간 보스' 이름표·체력 막대.
//  **보스와 다르다**: 탄막·광분·고유 공격·페이즈·소환 없음. 행동은 한 가지 — 정지 거리에서 좌우로 움직이다 가끔 붉은 경보 줄(0.8초)을 띄운 뒤 그 줄로 돌진했다 제자리로
//  (광역 경보 규칙 그대로, 피할 수 있음 보장 — bossatk.planCharge). 체력 = 상한 화력 × 12초(BAL3.midBossSec — firepower.js 재사용). 잡으면 승리 + 판 끝 목표 몫 코인.
//  ⚠️난이도 판단이 아니다(이사님 지시 "난이도는 너의 봇테스트로 하지 말도록") — '피할 수 있음'의 기계적 증명·동작 확인이다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAL3 } from '../rush3/balance.js';
import { buildStage, ALL_STAGE_IDS, stageKindOf } from '../rush3/stages.js';
import { STAGE_END } from '../rush3/courses.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { bossFloor, bossUpperBound } from '../rush3/firepower.js';
import { squadFrame, shapeHitsBox } from '../rush3/bossatk.js';
import { stageValue, runCoins } from '../rush3/coins.js';
import { createRenderer3, MID_LOOK, ATK_DANGER } from '../rush3/render.js';
import { makeFx, MID_BANNER_TEXT, coinBreakdown, upgradeLines } from '../rush3/main.js';
import { bootApp } from './lib/rush3-shell.mjs';

const MID_IDS = [2, 5, 8, 11, 14, 17, 20, 23];
const M = BAL3.midBoss, P = M.charge;
const inp = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0 });

//  중간 보스전만 떼어 낸 판: n 명, 중간 보스가 자리(hold)를 잡을 때까지(부대 x0). 부대는 쏘지 않는다(fireT 큼 — 체력을 깎지 않고 행동만 본다)
function midRun(id, n, x0, { fire = false } = {}) {
  const st = buildStage(id, { difficulty: 'brutal' });
  const stage = { ...st, startUnits: n, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
  const run = createRun(stage, { heroGuard: true });
  run.z = run.prevZ = stage.eliteZ - 2;
  let s = 0;
  while (!(run.boss && run.boss.state === 'hold') && s++ < 1200) { stepRun(run, inp(x0), STEP); drainEvents(run); }
  if (!fire) for (const u of run.units) u.fireT = 1e9;
  return run;
}
//  돌진 한 번: mode 'move' = 경보를 보면(midWarn) 설계의 설 곳으로 · 'stay' = 제자리. 반환 { plan(경보 순간의 설계 사본), at(경보 순간 부대), hurt, lost, hits, steps }
function oneCharge(run, mode, x0) {
  let plan = null, at = null, hurt = 0, lost = 0, hits = null, warnStep = null, dashStep = null, steps = 0;
  for (let i = 0; i < 60 * 8; i++) {
    const c = run.boss && run.boss.charge;
    stepRun(run, inp(mode === 'move' && c ? c.goal.x : x0), STEP); steps++;
    for (const e of drainEvents(run)) {
      if (e.type === 'midWarn') { plan = JSON.parse(JSON.stringify(run.boss.charge)); at = { x: run.x, hw: run.units.reduce((m, u) => Math.max(m, Math.abs(u.dx)), 0) + BAL3.squad.unitR, F: squadFrame(run) }; warnStep = steps; }
      if (e.type === 'midDash') dashStep = steps;
      if (e.type === 'hurt') hurt += e.n;
      if (e.type === 'unitLost') lost++;
      if (e.type === 'midBoom') hits = e.hits;
      if (e.type === 'midBack') return { plan, at, hurt, lost, hits, steps, warnSteps: dashStep - warnStep };
    }
  }
  return { plan, at, hurt, lost, hits, steps, unfinished: true };
}

test('MIDBOSS 체력·크기·그림: 체력 = 상한 화력 × 12초(BAL3.midBossSec — firepower.js 같은 계산기, 계산 내역 stage.midFloor) · 반지름 = 그 적 종류 표 반지름 × 2.2~2.6 · 그 판에 나오는 일반 적 그림 — 8판 모두 다른 그림 · 정지 거리 360 · 밀집 대형', (t) => {
  assert.equal(BAL3.midBossSec, 12);
  const looks = new Set();
  for (const id of MID_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    const e = st.elites[0], f = st.midFloor;
    assert.ok(e.mid && st.elites.length === 1, `S${id} 중간 보스 1체`);
    //  체력: 원값 1(× 1.5 → 2)을 상한 화력 × 12초로 — 계산기 결과와 같다
    const ub = bossUpperBound(st);
    assert.equal(f.sec, 12); assert.ok(Math.abs(f.dps - ub.dps) < 1e-9, `S${id} 상한 화력`);
    assert.equal(e.hp, Math.ceil(12 * ub.dps), `S${id} 체력 = ceil(12 × ${ub.dps.toFixed(1)})`);
    assert.ok(e.hp / ub.dps >= 12 - 1e-9 && e.hp / ub.dps < 12 + 1 / ub.dps + 1e-9, `S${id} ${(e.hp / ub.dps).toFixed(2)}초`);
    //  크기·그림: 표의 look · 반지름 = 표 반지름 × scale(2.2~2.6) · 그 판의 일반 적(대물결·현상금 제외 스폰)에 있는 그림
    const look = STAGE_END[id].look;
    assert.deepEqual(e.look, look);
    const sc = M.scale[look.kind];
    assert.ok(sc >= 2.2 && sc <= 2.6, `S${id} 배율 ${sc}`);
    assert.ok(Math.abs(e.r - BAL3.enemies[look.kind].r * sc) < 0.01, `S${id} 반지름 ${e.r}`);
    const seen = new Set(st.spawns.filter((s) => s.kind !== 'bounty' && !s.horde).map((s) => s.kind + ':' + (s.skin ?? '')));
    assert.ok(seen.has(look.kind + ':' + (look.skin ?? '')), `S${id} 그 판에 나오는 적 그림 ${look.kind}/${look.skin ?? '-'}`);
    looks.add(look.kind + ':' + (look.skin ?? ''));
    assert.equal(e.holdAhead, M.holdAhead);
    assert.equal(st.bossHw, BAL3.difficulty.brutal.bossHw, `S${id} 밀집 대형(피할 자리)`);
    t.diagnostic(`MIDBOSS S${id} ${look.kind}/${look.skin ?? '기본'} r${e.r} 체력 ${e.hp} = 12초 × ${f.units}명 ${f.weapon} Mk${f.mk} ${f.dps.toFixed(1)}/s`);
  }
  assert.equal(looks.size, 8, '8판 모두 다른 그림');
  //  상수 한 곳: 초를 두 배로 하면 체력도 두 배(계산만)
  const st2 = buildStage(2, { difficulty: 'brutal' });
  const f24 = bossFloor({ ...st2, elites: st2.elites.map((e) => ({ ...e, hp: 2 })) }, 24);
  assert.ok(f24.minSec >= 24 - 1e-9 && f24.hp[0] >= 2 * st2.elites[0].hp - 1, '24초 = 두 배');
  //  배수 1 줄에는 중간 보스가 없다(모든 판 보스 그대로)
  for (const id of ALL_STAGE_IDS) assert.ok(buildStage(id).elites.every((e) => !e.mid) && !('midFloor' in buildStage(id)), `S${id} 배수 1 줄`);
});

test('MIDBOSS 보스와 다르다: 탄막·광분·고유 공격·페이즈·소환 없음 — 20초 동안 적탄 0 · 보스 공격/광분/페이즈/소환 이벤트 0 · 행동은 경보(0.8초 붉은 줄) → 돌진 → 제자리 되풀이 · 체력이 30% 아래여도 광분하지 않는다', () => {
  for (const id of MID_IDS) {
    const run = midRun(id, 60, 240);
    const bo = run.boss;
    assert.ok(bo.mid && !bo.atk && !bo.shoot && !bo.summon && !('bossAtk' in run), `S${id}: 사격·소환·고유 공격 칸 없음`);
    bo.hp = bo.max * 0.2;   // 광분 문턱(30%)·페이즈 문턱 아래 — 그래도 광분·페이즈 없음
    const cnt = {};
    let eshots = 0;
    for (let i = 0; i < 60 * 20; i++) {
      for (const u of run.units) u.hp = 1e9;
      const c = run.boss.charge;
      stepRun(run, inp(c ? c.goal.x : 240), STEP);
      for (const e of drainEvents(run)) cnt[e.type] = (cnt[e.type] || 0) + 1;
      eshots += run.eshots.length;
    }
    assert.equal(eshots, 0, `S${id}: 적탄 없음(탄막 없음)`);
    for (const k of ['bossRage', 'bossPhase', 'bossTele', 'bossCharge', 'bossFire', 'bossBoom', 'summon', 'eshot']) assert.ok(!cnt[k], `S${id}: ${k} 없음`);
    assert.ok(!bo.rage && !bo.phase, `S${id}: 광분·페이즈 칸 없음`);
    assert.ok(cnt.midWarn >= 2 && cnt.midDash === cnt.midWarn && cnt.midBoom >= cnt.midWarn - 1 && cnt.midBack >= cnt.midWarn - 1, `S${id}: 경보 → 돌진 → 제자리 되풀이 ${JSON.stringify(cnt)}`);
  }
  //  경보 시간 = 0.8초(광역 경보 규칙) — 경보 STEP 부터 돌진 STEP 까지
  const r = oneCharge(midRun(5, 30, 240), 'stay', 240);
  assert.equal(P.tele, 0.8);
  assert.equal(r.warnSteps, Math.round(P.tele / STEP), '경보 0.8초');
});

test('MIDBOSS 피할 수 있음: 8판 × 병력 1·30·60·100 × 시작 자리 3곳 — 경보를 보고 설 곳(안전 상자 가운데)으로 간 부대는 피해 0 · 안전 상자 = 부대 폭 + 48 · 경보 줄과 떨어짐 · 닿는 거리 = 250 × 0.8 × 0.8 안 / 제자리 부대는 치인다(병력 30 이상 — 손실은 피해 풀 18 = 병사 9명까지)', (t) => {
  const BA = BAL3.bossAtk;
  let sims = 0;
  for (const id of MID_IDS) {
    let stayHit = 0;
    for (const n of [1, 30, 60, 100]) for (const x0 of [140, 240, 340]) {
      const label = `S${id} ${n}명 x${x0}`;
      const r = oneCharge(midRun(id, n, x0), 'move', x0);
      sims++;
      assert.ok(r.plan && !r.unfinished, label + ': 돌진이 설계되고 끝난다');
      assert.equal(r.hurt, 0, label + ': 설 곳으로 간 부대는 피해 0');
      const p = r.plan, F = r.at.F;
      assert.ok(r.at.hw <= p.hw + 1e-9, label + ': 설계 반폭 ≥ 실제');
      assert.ok(p.safe[1] - p.safe[0] >= 2 * p.hw + BA.margin - 1e-9, label + ': 안전 상자 폭 ≥ 부대 폭 + 48');
      assert.ok(p.safe[0] >= 80 - 1e-9 && p.safe[1] <= 400 + 1e-9, label + ': 안전 상자가 도로 안');
      const box = { x0: p.safe[0], x1: p.safe[1], z0: p.safeZ[0], z1: p.safeZ[1] };
      assert.ok(!shapeHitsBox(p.zones[0].shape, box), label + ': 경보 줄이 안전 상자와 떨어져 있다');
      assert.equal(p.tele, P.tele); assert.equal(p.reachT, P.tele);
      assert.ok(Math.abs(p.reachD - BA.reachK * BAL3.squad.moveMax * P.tele) < 1e-6, label + ': 닿는 거리 = 250 × 경보 × 0.8');
      assert.ok(Math.abs(p.goal.x - r.at.x) <= p.reachD + 1e-9, label + ': 설 곳까지 닿는 거리 안');
      assert.ok(p.zones[0].at >= P.tele, label + ': 치는 때 ≥ 경보 끝');
      assert.equal(p.zones[0].shape.r, run0r(id), label + ': 줄 폭 = 몸');
      void F;
      if (n >= 30) {
        const q = oneCharge(midRun(id, n, x0), 'stay', x0);
        sims++;
        if (q.lost > 0) stayHit++;
        assert.ok(q.lost <= Math.round(M.crush * BAL3.difficulty.brutal.touchDmg / BAL3.squad.unitHp), label + ': 한 번에 잃는 병사 ≤ 9(피해 풀 18)');
      }
    }
    assert.ok(stayHit > 0, `S${id}: 제자리 부대가 치인다(위협)`);
  }
  t.diagnostic('MIDBOSS 돌진 시뮬레이션 ' + sims + '판');
});
const run0r = (id) => buildStage(id, { difficulty: 'brutal' }).elites[0].r;

test('MIDBOSS 처치 = 승리 + 판 끝 목표 몫 코인(V × 0.5 — 결과 내역 이름 \'중간 보스\') · 부딪힘 = 돌진에 치인 병사 여럿(현상금 적과 같은 피해 풀 18) · 겹침 접촉 피해는 없다', () => {
  for (const id of MID_IDS) {
    const run = midRun(id, 30, 240, { fire: true });
    assert.equal(run.midCrush, M.crush * BAL3.difficulty.brutal.touchDmg, `S${id} 피해 풀 18`);
    assert.equal(run.midCrush, BAL3.bounty.touchDmg * BAL3.difficulty.brutal.touchDmg, '현상금 적과 같은 규모');
    run.boss.hp = 1;
    const log = [];
    for (let i = 0; i < 60 * 5 && !run.over; i++) { for (const u of run.units) u.hp = 1e9; stepRun(run, inp(run.boss ? run.boss.x : 240), STEP); log.push(...drainEvents(run)); }
    assert.ok(run.won && run.over && run.bossDefeated, `S${id}: 중간 보스를 잡으면 승리`);
    const kills = log.filter((e) => e.type === 'bossKill');
    assert.equal(kills.length, 1, `S${id}: 처치 이벤트`);
    const c = runCoins(run.stage ?? buildStage(id, { difficulty: 'brutal' }), log, { cleared: true, firstClear: false });
    assert.equal(c.boss, Math.round(stageValue(id) * 0.5), `S${id}: 판 끝 목표 몫 = V × 0.5`);
  }
  assert.equal(coinBreakdown({ enemy: 3, boss: 14, goal: 'mid' }), '적 3 · 중간 보스 14');
  //  강화 화면 직격 화력 미리보기: 중간 보스 판은 '중간 보스' · 대물결 판(보스 없음)은 그 줄이 없다
  const Z0 = { power: 0, rate: 0, multi: 0 };
  assert.match(upgradeLines(Z0, 'power', { stageId: 2, bossHp: 2765, mid: true }).lines[1], /^2번 중간 보스\(체력 2765\): 2765발 → \d+발$/);
  assert.equal(upgradeLines(Z0, 'power', { stageId: 4, bossHp: null }).lines[1], null);
  //  겹침 접촉: 중간 보스가 부대 위에 올라앉아도(돌진 밖) 접촉 피해가 없다
  const r = midRun(5, 30, 240);
  r.boss.x = r.x; r.boss.z = r.z; r.boss.chargeT = 1e9;
  let hurt = 0;
  for (let i = 0; i < 60; i++) { r.boss.x = r.x; r.boss.z = r.z; stepRun(r, inp(240), STEP); for (const e of drainEvents(r)) if (e.type === 'hurt') hurt++; }
  assert.equal(hurt, 0, '겹침 접촉 피해 없음');
});

//  호출 기록 ctx: 호출마다 { op, args, fill, stroke }
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
        ops.push({ op: k, args, fill: t.fillStyle, stroke: t.strokeStyle });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
const drawOps = (run) => { const { ctx, ops } = recCtx(); createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: makeFx(), hud: { distM: 0 }, buttons: [], saveOk: true }); return ops; };
const hasColor = (ops, c) => ops.some((o) => ((o.op === 'fill' || o.op === 'fillRect') && o.fill === c) || (o.op === 'stroke' && o.stroke === c));

test("MIDBOSS 그림: 머리 위 이름표 '중간 보스' + 체력 막대(주황 — 남은 체력 비율) · 이름표는 HUD 띠 아래 · 돌진 경보 = 붉은 경보 줄(광역 경보와 같은 색 — 경보 동안만) · HUD 정예 막대 대신 목표 줄 '중간 보스 전투!' · 그리기는 run 을 읽기만 한다", () => {
  assert.equal(MID_LOOK.label, '중간 보스');
  for (const id of MID_IDS) {
    const run = midRun(id, 30, 240);
    const snap = JSON.stringify(run);
    const ops = drawOps(run);
    assert.equal(JSON.stringify(run), snap, `S${id}: 그리기 전후 run 이 같다`);
    const tag = ops.find((o) => o.op === 'fillText' && o.args[0] === MID_LOOK.label);
    assert.ok(tag, `S${id}: 이름표`);
    assert.ok(tag.args[2] > 80, `S${id}: 이름표가 HUD 띠(목표 줄 y 62) 아래 — y ${tag.args[2].toFixed(1)}`);
    assert.ok(hasColor(ops, MID_LOOK.bar), `S${id}: 체력 막대`);
    assert.ok(ops.some((o) => o.op === 'fillText' && o.args[0] === '중간 보스 전투!'), `S${id}: HUD 목표 줄`);
    assert.ok(!ops.some((o) => o.op === 'fillText' && /^정예 /.test(String(o.args[0]))), `S${id}: HUD 정예 막대 글 없음`);
    assert.ok(!hasColor(ops, ATK_DANGER), `S${id}: 경보 전에는 붉은 줄 없음`);
  }
  //  경보 동안 붉은 줄 → 치고 나면 없다
  const run = midRun(8, 30, 240);
  let n = 0;
  while (!(run.boss.charge && run.boss.charge.state === 'warn') && n++ < 600) { stepRun(run, inp(240), STEP); drainEvents(run); }
  assert.ok(hasColor(drawOps(run), ATK_DANGER), '경보 = 붉은 경보 줄');
  while (!(run.boss.charge && run.boss.charge.hit) && n++ < 1200) { stepRun(run, inp(240), STEP); drainEvents(run); }
  assert.ok(!hasColor(drawOps(run), ATK_DANGER), '친 뒤에는 경보 줄이 없다');
});

test("MIDBOSS 셸: 중간 보스가 나오면 '중간 보스 접근!'(정예 경고 슬롯) · 돌진 경보 = 경보음(lotWarn) · 처치 → 승리 · 결과 코인 내역 '중간 보스'", async () => {
  const h = await bootApp({ unlockThrough: 1 });
  h.app.startRun(2);
  h.frames(2);
  const run = h.app.getRun();
  run.z = run.prevZ = run.eliteZ - 4;
  run.spawnCursor = run.spawns.length; run.enemies.length = 0;
  let banner = false, warn = false, n = 0;
  while (h.app.getState() === 'run' && n++ < 60 * 30) {
    const r = h.app.getRun();
    for (const u of r.units) u.hp = 1e9;
    //  경보를 두 번 본 뒤 중간 보스 체력 1(처치 흐름을 보는 검사 도구)
    if (warn && r.boss && r.boss.mid && (r.boss.chargeK ?? 0) >= 2) r.boss.hp = Math.min(r.boss.hp, 1);
    const c = r.boss && r.boss.charge;
    h.app.input.state.pointerX = c ? c.goal.x : (r.boss ? r.boss.x : 240);
    const before = h.audio.played.length;
    h.texts.length = 0; h.frames(1);
    if (h.texts.some((x) => x.text === MID_BANNER_TEXT)) banner = true;
    if (h.audio.played.slice(before).includes('lotWarn')) warn = true;
  }
  assert.ok(banner, "'중간 보스 접근!' 배너");
  assert.ok(warn, '돌진 경보음');
  assert.equal(h.app.getState(), 'result');
  const res = h.app.getResult();
  assert.equal(res.won, true);
  assert.equal(res.coins.goal, 'mid');
  assert.match(res.coinLine, /중간 보스 \d+/, "결과 내역 이름 '중간 보스'");
  assert.equal(stageKindOf(2, 'brutal'), 'mid');
});
