// rush3-r49-rage — r4.9 (다) 보스 광분 모드 BOSS-RAGE(이사님 지시 2026-09-26 "보스 체력이 30% 남으면 광분 모드를 넣자").
//  게임 화면 줄(보스 정의에 atk 가 있는 줄)만: 페이즈 문턱 50%·20% → 50%·30%, 30% 단계 = 광분 — 붉은 오라·맥박·잔떨림·붉은 체력 막대 · '광분!' 배너 + 경고음 + 흔들림 ·
//   공격 간격 × 0.8(그 단계 rate 에 더) · 탄 속도 × 1.12. 경보 시간·한 번에 한 공격·피할 수 있음 보장은 그대로(광분 상태 BOSS-DODGE 는 rush3-r49-dodge-*).
//  1·2번(페이즈 없음)도 광분은 켠다(새 공격 해금은 3번부터 그대로). 배수 1 줄(normal)은 광분이 없다(봇 지문 240/240 불변).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAL3 } from '../rush3/balance.js';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, bossPhaseOf, STEP } from '../rush3/combat.js';
import { planAttack, unlockedAtk, atkPlanFor } from '../rush3/bossatk.js';
import { createRenderer3, RAGE_COLOR } from '../rush3/render.js';
import { makeFx, RAGE_TEXT } from '../rush3/main.js';
import { bootApp } from './lib/rush3-shell.mjs';
import { atkRun, inp, botInput, playInput, isStart } from './lib/rush3-bossatk.mjs';

const BA = BAL3.bossAtk;
//  r4.10(이사님 실플레이 5차 — 보스는 3·6·9·12·15·18·21·24 판에만): 게임 줄 보스 판. 페이즈 없는 학습 구간(1·2번)에는 이제 보스가 없어
//   '페이즈 없는 보스'는 보스 판을 페이즈 없이 세운 합성 판(noPhase — 옛 1·2번과 같은 배정 early · 페이즈 끔)으로 본다(규칙 경로는 같다)
const BOSS_IDS = BAL3.difficulty.brutal.bossStages;
//  보스전만 떼어 낸 판(보스 공격·체력을 손대지 않은 채 — 광분 문턱을 체력으로 넘긴다)
function bossRun(id, n = 30, noPhase = false) {
  const st0 = buildStage(id, { difficulty: 'brutal' });
  const st = noPhase ? { ...st0, bossPhases: false, elites: st0.elites.map((e) => ({ ...e, atk: atkPlanFor(e, false, { phases: false }) })) } : st0;
  const stage = { ...st, startUnits: n, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
  const run = createRun(stage, { heroGuard: true });
  run.z = run.prevZ = stage.eliteZ - 2;
  let s = 0;
  while (!run.bosses.length && s++ < 600) { stepRun(run, inp(240), STEP); drainEvents(run); }
  for (const b of run.bosses) b.summon = false;
  for (const u of run.units) { u.hp = 1e9; u.fireT = 1e9; }
  return run;
}
const steps = (run, n, input = inp(240)) => { const evs = []; for (let i = 0; i < n; i++) { stepRun(run, typeof input === 'function' ? input(run) : input, STEP); evs.push(...drainEvents(run)); } return evs; };

test('BOSS-RAGE 문턱: 게임 줄 보스의 페이즈 문턱 = 50%·30%(atk.phaseAt) — 30% 가 광분 단계 · 배수 1 줄·합성 판은 종전 50%·20% 그대로 · 광분 표(간격 × 0.8 · 탄 속도 × 1.12) · 1~24 모든 게임 줄 보스에 광분 칸, 배수 1 줄에는 없다', () => {
  assert.deepEqual(BA.phaseAt, [0.5, 0.3]);
  assert.deepEqual(BA.rage, { at: 0.3, gapMul: 0.8, vMul: 1.12 });
  assert.equal(BA.rage.at, BA.phaseAt[1], '광분 = 두 번째 페이즈');
  assert.ok(BA.rage.vMul >= 1.1 && BA.rage.vMul <= 1.15 && BA.rage.gapMul < 1, '탄 속도 +10~15% · 간격 더 짧게');
  assert.deepEqual(BAL3.bossPhases.at, [0.5, 0.2], '배수 1 줄·합성 판 문턱 그대로');
  assert.equal(bossPhaseOf(31, 100, { at: BA.phaseAt }), 1);
  assert.equal(bossPhaseOf(30, 100, { at: BA.phaseAt }), 2, '정확히 30% 에서 광분 단계');
  assert.equal(bossPhaseOf(30, 100), 1, '종전 표는 30% 가 1단계');
  for (const id of BOSS_IDS) assert.ok(buildStage(id, { difficulty: 'brutal' }).elites.length > 0, `S${id} 보스 판`);
  for (const id of ALL_STAGE_IDS) {
    //  r4.10 중간 보스(mid)는 광분이 없다(검사 MIDBOSS) — 보스만
    for (const e of buildStage(id, { difficulty: 'brutal' }).elites.filter((x) => !x.mid)) { assert.deepEqual(e.atk.phaseAt, BA.phaseAt, `S${id}`); assert.deepEqual(e.atk.rage, BA.rage, `S${id}`); }
    assert.ok(buildStage(id).elites.every((e) => !('atk' in e)), `S${id} 배수 1 줄: 광분 칸 없음`);
  }
});

test('BOSS-RAGE 들어가기: 체력이 30% 를 넘는 STEP 에 한 번 광분(이벤트 bossRage 1회 · bo.rage) — 31% 에서는 아니다 · 체력이 다시 올라도 되돌아가지 않고 이벤트도 다시 안 난다 · 3번 이상은 같은 STEP 에 세 번째 공격이 열린다(페이즈 2)', () => {
  for (const id of [3, 9, 12, 24]) {
    const run = bossRun(id);
    steps(run, 60 * 3);
    const bo = run.bosses[0];
    bo.hp = bo.max * 0.31;
    let evs = steps(run, 30);
    assert.ok(!bo.rage && !evs.some((e) => e.type === 'bossRage'), `S${id}: 31% 는 광분 아님`);
    assert.equal(bo.phase, 1, `S${id}: 31% 는 1단계`);
    bo.hp = bo.max * 0.3;
    evs = steps(run, 1);
    const rg = evs.filter((e) => e.type === 'bossRage');
    assert.equal(rg.length, 1, `S${id}: 30% 에서 광분 이벤트 한 번`);
    assert.equal(rg[0].id, bo.id);
    assert.ok(bo.rage === true && bo.phase === 2, `S${id}: 광분 + 페이즈 2`);
    assert.equal(unlockedAtk(bo.atk, bo.phase).length, 3, `S${id}: 세 번째 고유 공격이 30% 에서 열린다`);
    bo.hp = bo.max * 0.95;
    evs = steps(run, 60 * 2);
    assert.ok(bo.rage === true && bo.phase === 2 && !evs.some((e) => e.type === 'bossRage'), `S${id}: 되돌아가지 않고 다시 알리지 않는다`);
  }
});

test('BOSS-RAGE 페이즈 없는 보스: 페이즈가 없는 판(학습 구간 배정 — r4.10 게임 줄에는 없어 3·6번을 페이즈 없이 세운 합성 판)도 광분은 켠다(이벤트·bo.rage) — 페이즈는 0 그대로라 새 공격은 열리지 않는다(삽날 밀기·잔해 튕기기 두 가지 그대로)', () => {
  for (const id of [3, 6]) {
    const run = bossRun(id, 30, true);
    steps(run, 60 * 3);
    const bo = run.bosses[0];
    bo.hp = bo.max * 0.25;
    const evs = steps(run, 2);
    assert.equal(evs.filter((e) => e.type === 'bossRage').length, 1, `S${id}: 광분`);
    assert.ok(bo.rage === true && (bo.phase ?? 0) === 0, `S${id}: 광분 + 페이즈 0`);
    //  3번 B1 = 학습 구간 배정(삽날 밀기·잔해 튕기기 둘 다) · 6번 B2 = early 가 없는 스킨이라 처음 하나(갈고리 낙하) — 광분해도 그대로
    assert.deepEqual(unlockedAtk(bo.atk, bo.phase), id === 3 ? ['blade', 'ricochet'] : ['hook'], `S${id}: 공격 그대로`);
  }
});

test('BOSS-RAGE 배수: 광분 중 다음 공격까지 간격 = 스킨 간격 × 페이즈 rate × 0.8 · 탄 공격의 탄 속도 × 1.12(같은 자리의 같은 공격 설계로 비교) · 광역 경보 시간은 그대로', () => {
  //  간격: 3번 B1 — 광분 전(페이즈 2 를 강제로) · 광분 뒤 공격이 끝난 STEP 의 대기 시간
  for (const rage of [false, true]) {
    const { run, bo } = atkRun(3, 30, 0, 'blade', 240, 0, { mod: (r, b) => { b.phase = 2; if (rage) b.rage = true; } });
    let end = null;
    for (let i = 0; i < 60 * 8 && !end; i++) { stepRun(run, botInput(run, 240), STEP); for (const e of drainEvents(run)) if (e.type === 'bossAtkEnd' && !e.cancelled) end = e; }
    assert.ok(end, '공격이 끝났다');
    const want = bo.atk.gap * BAL3.bossPhases.rate[2] * (rage ? BA.rage.gapMul : 1);
    assert.ok(Math.abs(run.bossAtk.wait - want) < 1e-9, `간격 ${run.bossAtk.wait} = ${want}(광분 ${rage})`);
  }
  //  탄 속도: 같은 판·자리·k 의 설계에서 탄 길 첫 조각의 속도 비 = 1.12(발사 순간의 설계 — 탄 공격 여섯 가지)
  for (const [id, kind] of [[3, 'blade'], [3, 'ricochet'], [6, 'needles'], [9, 'chain'], [12, 'slag'], [24, 'blades']]) {
    const speeds = [false, true].map((rage) => {
      const { run, bo } = atkRun(id, 30, 0, kind, 240, 0);
      bo.rage = rage;
      const p = planAttack(run, bo, kind, 0);
      assert.ok(p, `${kind} 설계(광분 ${rage})`);
      const [a, b] = p.shots[0].path;
      return Math.hypot(b[1] - a[1], b[2] - a[2]) / (b[0] - a[0]);
    });
    assert.ok(Math.abs(speeds[1] / speeds[0] - BA.rage.vMul) < 1e-6, `${kind}: 탄 속도 × ${BA.rage.vMul} (${speeds.map((v) => v.toFixed(1))})`);
  }
  //  광역 경보는 그대로
  for (const [id, kind] of [[6, 'hook'], [9, 'rail'], [12, 'pour'], [24, 'quake']]) {
    const tele = [false, true].map((rage) => { const { run, bo } = atkRun(id, 30, 0, kind, 240, 0); bo.rage = rage; return planAttack(run, bo, kind, 0).tele; });
    assert.equal(tele[0], tele[1], `${kind}: 광분 중에도 경보 시간 그대로`);
  }
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
        ops.push({ op: k, args, fill: t.fillStyle, stroke: t.strokeStyle, font: t.font });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
const hasColor = (ops, c) => ops.some((o) => ((o.op === 'fill' || o.op === 'fillRect') && o.fill === c) || (o.op === 'stroke' && o.stroke === c));

test('BOSS-RAGE 그림: 광분 보스는 붉은 오라(RAGE_COLOR)·붉은 체력 막대 — 오라 맥박·잔떨림은 규칙 시계(run.time)로 결정적(같은 run 이면 같은 그림, 시각이 다르면 다른 자리) · 광분 전에는 없다 · 그리기는 run 을 읽기만 한다', () => {
  const run = bossRun(3);
  steps(run, 60 * 3);
  const draw = (fx = makeFx()) => { const { ctx, ops } = recCtx(); createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx, hud: { distM: 0 }, buttons: [], saveOk: true }); return ops; };
  assert.ok(!hasColor(draw(), RAGE_COLOR), '광분 전: 붉은 오라·막대 없음');
  run.bosses[0].hp = run.bosses[0].max * 0.29;
  steps(run, 1);
  const snap = JSON.stringify(run);
  const a = draw(), b = draw();
  assert.equal(JSON.stringify(run), snap, '그리기 전후 run 이 같다');
  assert.ok(hasColor(a, RAGE_COLOR), '광분: 붉은 오라');
  assert.ok(a.some((o) => o.op === 'fill' && o.fill === RAGE_COLOR && o.args.length === 0) , '붉은 채움');
  assert.deepEqual(a.map((o) => JSON.stringify(o.args)), b.map((o) => JSON.stringify(o.args)), '같은 규칙 시각 → 같은 그림(결정적)');
  run.time += 0.05;
  const c = draw();
  assert.notDeepEqual(a.map((o) => JSON.stringify(o.args)), c.map((o) => JSON.stringify(o.args)), '규칙 시각이 바뀌면 맥박·잔떨림이 움직인다');
  run.time -= 0.05;
});

test('BOSS-RAGE 셸: 광분에 들어가는 프레임에 화면 가운데 \'광분!\' 배너(한 어절) + 경고음(bossRage) + 흔들림 · 약 1초 뒤 배너가 사라진다 · 같은 STEP 의 페이즈 글자(보스 광분!)는 두 번 알리지 않는다 · 체력 막대가 붉다', async () => {
  const h = await bootApp({ withOps: true, unlockThrough: 2 });
  h.app.startRun(3);
  h.frames(2);
  const run = h.app.getRun();
  run.z = run.prevZ = run.eliteZ - 4;
  run.spawnCursor = run.spawns.length; run.enemies.length = 0;
  let n = 0;
  while (!(run.boss && run.boss.state === 'hold') && n++ < 60 * 10) { for (const u of run.units) u.hp = 1e9; h.frames(1); }
  assert.ok(run.boss && run.boss.state === 'hold', '보스 자리');
  h.frames(10);
  run.boss.hp = run.boss.max * 0.29;
  h.texts.length = 0; h.ops.length = 0;
  const before = h.audio.played.length;
  h.frames(1);
  const fx = h.app.getFx();
  assert.ok(run.boss.rage, '광분');
  assert.ok(h.audio.played.slice(before).includes('bossRage'), '경고음');
  assert.ok(fx.shakeT > 0, '흔들림');
  assert.equal(RAGE_TEXT, '광분!');
  assert.ok(!/\s/.test(RAGE_TEXT), '한 어절(줄바꿈 없음)');
  const banner = h.texts.filter((t) => t.text === RAGE_TEXT);
  assert.ok(banner.length > 0 && banner.every((t) => Math.abs(t.x - 240) < 1 && t.y > 300 && t.y < 500), '화면 가운데 배너');
  assert.ok(!h.texts.some((t) => t.text === '보스 광분!'), '페이즈 글자와 겹쳐 두 번 알리지 않는다');
  assert.ok(hasColor(h.ops, RAGE_COLOR), '붉은 오라·체력 막대');
  h.frames(Math.round(60 * (BAL3.fx.rageBannerSec + 0.1)));
  h.texts.length = 0;
  h.frames(1);
  assert.ok(!h.texts.some((t) => t.text === RAGE_TEXT), '약 1초 뒤 배너가 사라진다');
});

test('BOSS-RAGE 한 번에 한 공격·경보 그대로: 광분(보스 판 3·12·18·24번 — r4.10) 20초 — 시작~끝 사이에 새 공격이 없고, 광역 경보는 0.7초 이상, 보이는 탄·경보로 설 곳에 간 봇은 피해 0', () => {
  for (const id of [3, 12, 18, 24]) {
    const run = bossRun(id, 60);
    for (const b of run.bosses) { b.hp = b.max = 1e9; }
    steps(run, 60 * 2, (r) => botInput(r, 240));
    for (const b of run.bosses) { b.rage = true; if (run.bossPhases !== false) b.phase = 2; }
    if (run.arena) { run.arena.boss.touchDmg = 0; run.arena.boss.shock.dmg = 0; }
    let open = null, starts = 0, hurt = 0;
    for (let i = 0; i < 60 * 20; i++) {
      stepRun(run, playInput(run), STEP);
      for (const u of run.units) if (u.hp < 2) u.hp = 2;
      for (const e of drainEvents(run)) {
        if (isStart(e)) { assert.equal(open, null, `S${id} 광분: 앞 공격이 끝나기 전에 새 공격`); open = e.serial; starts++; if (e.type === 'bossTele') assert.ok(e.tele >= 0.7, `S${id}: 경보 ${e.tele}`); }
        if (e.type === 'bossAtkEnd') open = null;
        if (e.type === 'hurt' && e.cause === 'shot') hurt++;
      }
    }
    assert.ok(starts >= 4, `S${id} 광분: 공격 ${starts}번`);
    assert.equal(hurt, 0, `S${id} 광분: 피해 0`);
  }
});
