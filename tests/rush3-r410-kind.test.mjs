// rush3-r410-kind — r4.10 판 종류(이사님 실플레이 5차, 2026-09-26) STAGE-KIND · HORDE.
//  이사님 원문: "테스트 해봤다. 긴장감도 있고 좋다. 보스가 모든 스테이지에 나오다보니 지루한 느낌이 든다. 우리가 가진 보스가 모든 스테이지에 등장할 필요는 없다.
//   보스 등장 횟수를 3, 6, 9, 12, 15, 18, 21, 24 스테이지로 줄이고 일반 스테이지는 많은 수의 일반 적이나 좀 더 강한 중간 보스로 대체하자."
//  게임 화면 줄(brutal — 줄 표의 bossStages)만: 보스 판 8 · 대물결 판 8(1·4·7·…) · 중간 보스 판 8(2·5·8·…). 검사용 배수 1 줄(normal)은 모든 판 보스 그대로
//   (V3-DIFF2ROW 가 바이트 단위로 · 봇 지문 240/240).
//  STAGE-KIND = 판 종류 표·보스 배정·보스 없는 판에 보스 정의 없음 · HORDE = 대물결(겹·결승선·돌파 승리·코인·그림·셸).
//  ⚠️난이도 판단이 아니다(이사님 지시 "난이도는 너의 봇테스트로 하지 말도록") — 봇 승패를 잠그지 않는다(판이 끝나는가·끝나는 조건이 도는가만).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAL3 } from '../rush3/balance.js';
import { buildStage, ALL_STAGE_IDS, stageKindOf } from '../rush3/stages.js';
import { STAGE_END } from '../rush3/courses.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { stageValue, bossCount, createTally, addEvents, mainCoins, scheduledEnemyCount } from '../rush3/coins.js';
import { createRenderer3, FINISH_LOOK } from '../rush3/render.js';
import { makeFx, HORDE_BANNER_TEXT, FINISH_TEXT, goalKind } from '../rush3/main.js';
import { bootApp } from './lib/rush3-shell.mjs';

const BOSS_IDS = [3, 6, 9, 12, 15, 18, 21, 24];
const MID_IDS = [2, 5, 8, 11, 14, 17, 20, 23];
const HORDE_IDS = [1, 4, 7, 10, 13, 16, 19, 22];
const inp = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0 });

// ═══════════════════════════════ STAGE-KIND ═══════════════════════════════

test('STAGE-KIND 표: 게임 줄 1~24 = 보스 8(3·6·9·12·15·18·21·24) · 중간 보스 8(2·5·8·…·23) · 대물결 8(1·4·7·…·22) — 줄 표 bossStages 와 판 종류 표(STAGE_END)가 같은 판을 가리킨다 · 배수 1 줄은 판 종류가 없다(모든 판 보스 그대로)', () => {
  assert.deepEqual(BAL3.difficulty.brutal.bossStages, BOSS_IDS);
  assert.equal(BAL3.difficulty.normal.bossStages, null);
  const by = { boss: [], mid: [], horde: [] };
  for (const id of ALL_STAGE_IDS) by[stageKindOf(id, 'brutal')].push(id);
  assert.deepEqual(by, { boss: BOSS_IDS, mid: MID_IDS, horde: HORDE_IDS });
  for (const id of ALL_STAGE_IDS) {
    assert.equal(STAGE_END[id].kind, stageKindOf(id, 'brutal'), `S${id} 판 종류 표`);
    assert.equal(buildStage(id, { difficulty: 'brutal' }).endKind, stageKindOf(id, 'brutal'), `S${id} stage.endKind`);
    assert.equal(stageKindOf(id), null, `S${id} 배수 1 줄(인자 생략)`);
    assert.equal(stageKindOf(id, 'normal'), null, `S${id} 배수 1 줄`);
    const n = buildStage(id);
    assert.ok(n.elites.length >= 1, `S${id} 배수 1 줄은 모든 판 보스 그대로`);
    for (const k of ['endKind', 'hordeZ', 'finishZ']) assert.ok(!(k in n), `S${id} 배수 1 줄에는 ${k} 칸이 없다`);
  }
  assert.equal(stageKindOf('proto3', 'brutal'), null, '시제품·합성 판은 판 종류가 없다');
});

test('STAGE-KIND 보스 배정: 3 = B1 그레이더 · 6 = B2 갠트리 위도우 · 9 = B3 레일 리바이어던 · 12 = B4 스멜터(도로) · 15 = B3 광장 · 18 = 합동전(B1 포격 + B2 소환 — 한 번에 한 공격) · 21 = B4 스멜터 광장(옛 20번 광장) · 24 = B5 크라운브레이커 광장 — 보스 체력 바닥·밀집 대형·고유 공격 그대로', () => {
  const want = {
    3: [['B1_grader', 'elite']], 6: [['B2_gantrywidow', 'elite']], 9: [['B3_railleviathan', 'elite']], 12: [['B4_smelter', 'elite']],
    15: [['B3_railleviathan', 'elite']], 18: [['B1_grader', 'gunner'], ['B2_gantrywidow', 'summoner']], 21: [['B4_smelter', 'elite']], 24: [['B5_crownbreaker', 'elite']],
  };
  const arenas = [15, 21, 24];
  for (const id of BOSS_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    assert.deepEqual(st.elites.map((e) => [e.atk.skin, e.role ?? 'elite']), want[id], `S${id} 보스 배정`);
    assert.equal(!!st.arena, arenas.includes(id), `S${id} 광장 여부`);
    assert.ok(st.bossFloor && st.bossFloor.minSec >= BAL3.bossMinFightSec - 1e-9, `S${id} 보스 최소 30초(상한 화력 × 30)`);
    assert.equal(st.bossHw, BAL3.difficulty.brutal.bossHw, `S${id} 밀집 대형`);
    assert.ok(st.elites.every((e) => e.atk && e.atk.rage), `S${id} 고유 공격·광분`);
    assert.ok(!('finishZ' in st) && !('hordeZ' in st), `S${id} 보스 판에는 결승선이 없다`);
  }
  //  21 광장 = 옛 20번 광장 보스(체력 원값·돌진·충격·소환)를 21번 코스 끝(z 9000)으로 — 광장 앞 여유(z − 800) 안에 21번 물체가 모두 든다(buildStage guard)
  const s21 = buildStage(21, { difficulty: 'brutal' }), s20n = buildStage(20);
  assert.equal(s21.arena.z, 9000); assert.equal(s21.eliteZ, 9000);
  assert.deepEqual({ ...s21.arena.boss }, { ...s20n.arena.boss }, '광장 보스 설정 = 옛 20번');
  assert.equal(s21.bossFloor.base[0], Math.round(2600 * BAL3.difficulty.brutal.eliteHp), '체력 원값 = 옛 20번 2600 × 1.5 (바닥이 30초로 올린다)');
  //  18 합동전 = 옛 10번의 복수 보스(차선 160·320)
  const s18 = buildStage(18, { difficulty: 'brutal' });
  assert.deepEqual(s18.elites.map((e) => [e.x, e.role, e.summon]), [[160, 'gunner', false], [320, 'summoner', false]]);
  assert.deepEqual(s18.elites.map((e) => e.atk.seq.join(',')), ['blade,ricochet', 'hook'], '역할 공격(포격 = 탄 · 소환 = 광역 하나)');
});

test('STAGE-KIND 보스 없는 판: 대물결 판은 보스 정의가 없다(elites 없음 · 광장 없음 · 정예 z 없음) — 옛 보스 자리(정의 eliteZ)가 대물결 시작 · 판 길이 = 결승선 · 중간 보스 판은 보스 대신 중간 보스 1체(옛 광장 20·세 정예 23 도) · 같은 판의 배수 1 줄은 보스 그대로', () => {
  for (const id of HORDE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' }), n = buildStage(id);
    assert.deepEqual([st.elites.length, st.elite, st.arena, st.eliteZ], [0, null, null, null], `S${id} 보스 정의 없음`);
    assert.ok(!('bossFloor' in st) && !('bossHw' in st), `S${id} 보스 칸 없음`);
    assert.equal(st.hordeZ, n.eliteZ, `S${id} 대물결 시작 = 옛 보스 자리`);
    assert.equal(st.finishZ, n.eliteZ + BAL3.horde.finishAfter, `S${id} 결승선`);
    assert.equal(st.length, st.finishZ, `S${id} 판 길이 = 결승선`);
    assert.ok(n.elites.length >= 1, `S${id} 배수 1 줄은 보스 그대로`);
    const run = createRun(st);
    assert.deepEqual([run.finishZ, run.elites.length], [st.finishZ, 0]);
    assert.equal(goalKind(st), 'horde');
  }
  for (const id of BOSS_IDS) assert.ok(!('finishZ' in createRun(buildStage(id, { difficulty: 'brutal' }))), `S${id} 보스 판 run 에는 결승선 칸이 없다`);
  //  중간 보스 판: 보스 정의 없음 — 보스 자리(정의 eliteZ)에 중간 보스 1체(mid)만. 옛 광장(20)·복수 보스(23)도 게임 줄에서는 없다. 판 길이·정예 z 는 정의 그대로(결승선 없음)
  for (const id of MID_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' }), n = buildStage(id);
    assert.equal(st.elites.length, 1, `S${id} 중간 보스 1체`);
    assert.ok(st.elites[0].mid && !('atk' in st.elites[0]), `S${id} 중간 보스(보스 고유 공격 없음)`);
    assert.deepEqual([st.arena, st.eliteZ, st.length], [null, n.eliteZ, n.length], `S${id} 광장 없음 · 정의 자리`);
    assert.ok(!('bossFloor' in st) && !('finishZ' in st), `S${id} 보스 칸·결승선 없음`);
    assert.ok(n.elites.length >= 1 && n.elites.every((e) => !e.mid), `S${id} 배수 1 줄은 보스 그대로`);
    assert.equal(goalKind(st), 'mid');
  }
  assert.ok(buildStage(20).arena && buildStage(23).elites.length === 3, '배수 1 줄 20 광장 · 23 세 정예 그대로');
});

// ═══════════════════════════════ HORDE ═══════════════════════════════

test('HORDE 배치: 대물결 = 옛 보스 자리에서 겹겹이(0·120·240) 들어오는 줄 뿌리기 스폰(horde 표시) — 대물결 스폰 수가 그 판 평소 물결(가장 큰 한 무리)보다 많다 · 그 판에 나오는 적 종류·스킨만 · 모두 결승선 앞 · 1번은 가벼움(잡졸 한 겹)', (t) => {
  const totals = {};
  for (const id of HORDE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    const horde = st.spawns.filter((s) => s.horde), other = st.spawns.filter((s) => !s.horde && s.kind !== 'bounty');
    assert.ok(horde.length >= 1, `S${id} 대물결 겹`);
    const total = horde.reduce((a, s) => a + s.n, 0), maxWave = Math.max(...other.map((s) => s.n));
    totals[id] = total;
    assert.ok(total > maxWave, `S${id}: 대물결 ${total} > 평소 가장 큰 물결 ${maxWave}`);
    const seen = new Set(other.map((s) => s.kind + ':' + (s.skin ?? '')));
    for (const s of horde) {
      assert.ok(seen.has(s.kind + ':' + (s.skin ?? '')), `S${id}: 대물결 ${s.kind}${s.skin ? '(' + s.skin + ')' : ''} 은 그 판에 나오는 적`);
      assert.ok(s.z >= st.hordeZ && s.z <= st.hordeZ + 240, `S${id}: 대물결 겹 z ${s.z} = 시작 + 0~240`);
      assert.ok(s.zs.every((z) => z < st.finishZ), `S${id}: 대물결은 결승선(${st.finishZ}) 앞에 놓인다`);
      assert.ok(Number.isInteger(s.hp) && s.hp > 0, `S${id}: 체력 명시`);
    }
    t.diagnostic(`HORDE S${id} ${horde.map((s) => s.kind + (s.skin ? '/' + s.skin : '') + '×' + s.n + '(hp' + s.hp + ')').join(' + ')} = ${total} (평소 최대 ${maxWave})`);
  }
  //  1번 = 가벼운 대물결(튜토리얼): 잡졸 한 겹 · 다른 대물결 판보다 적다
  const s1 = buildStage(1, { difficulty: 'brutal' }).spawns.filter((s) => s.horde);
  assert.deepEqual(s1.map((s) => [s.kind, s.skin ?? null]), [['grunt', null]], '1번: 잡졸 한 겹');
  assert.ok(HORDE_IDS.filter((id) => id !== 1).every((id) => totals[id] > totals[1] * 2), '1번은 다른 대물결 판의 절반보다 적다');
  //  배수 1 줄에는 대물결이 없다
  for (const id of HORDE_IDS) assert.ok(!buildStage(id).spawns.some((s) => s.horde), `S${id} 배수 1 줄 대물결 없음`);
});

//  대물결 판을 결승선까지(병사는 쓰러지지 않게 — 결승선 판정을 보는 검사 도구, 난이도와 무관)
function toFinish(id, x = 240) {
  const run = createRun(buildStage(id, { difficulty: 'brutal' }));
  const log = [];
  let steps = 0, prevZ = run.z, cross = null;
  while (!run.over && steps < 28800) {
    for (const u of run.units) u.hp = 1e9;
    const enemiesBefore = run.enemies.filter((e) => !e.dead).length;
    prevZ = run.z;
    stepRun(run, inp(x), STEP); steps++;
    const ev = drainEvents(run);
    log.push(...ev);
    if (ev.some((e) => e.type === 'finish')) cross = { prevZ, z: run.z, ev, enemiesBefore };
  }
  return { run, log, cross, steps };
}

test('HORDE 결승선: 부대가 결승선을 넘는 **그 STEP** 에 승리 — 같은 STEP 에 finish(돌파) → win, 남은 적이 있어도(거둔다) · 넘기 전 STEP 은 결승선 앞 · 끝나지 않는 판 없음 · 병력 0 이면 넘어도 승리가 아니다', () => {
  let withEnemies = 0;
  for (const id of HORDE_IDS) {
    const { run, cross, steps } = toFinish(id);
    assert.ok(cross, `S${id}: 결승선 돌파 이벤트`);
    assert.ok(cross.prevZ < run.finishZ && cross.z >= run.finishZ, `S${id}: 넘는 STEP(${cross.prevZ.toFixed(1)} → ${cross.z.toFixed(1)}, 결승선 ${run.finishZ})`);
    const types = cross.ev.map((e) => e.type);
    assert.ok(types.indexOf('finish') >= 0 && types.indexOf('finish') < types.indexOf('win'), `S${id}: 같은 STEP 에 finish → win`);
    assert.ok(run.won && run.over && run.wonAt === run.time, `S${id}: 승리로 끝남`);
    assert.equal(run.enemies.length + run.eshots.length, 0, `S${id}: 남은 적·적탄은 거둔다`);
    assert.ok(steps < 28800, `S${id}: 끝난다`);
    if (cross.enemiesBefore > 0) withEnemies++;
  }
  assert.ok(withEnemies > 0, '적이 남아 있어도 결승선을 넘으면 승리한다(한 판 이상에서 실제로)');
  //  병력 0: 결승선을 넘는 STEP 에 부대가 전멸하면 패배(승리 우선이지만 넘을 부대가 없다)
  const st = buildStage(4, { difficulty: 'brutal' });
  const run = createRun({ ...st, spawns: [], gateRows: [], supplies: [] });
  run.z = run.prevZ = st.finishZ - 1;
  for (const u of run.units) u.hp = 0;
  stepRun(run, inp(240), STEP);
  const ev = drainEvents(run);
  assert.ok(!ev.some((e) => e.type === 'finish') && ev.some((e) => e.type === 'lose') && !run.won, '병력 0 = 패배');
});

test('HORDE 코인: 보스 몫(V × 0.5)은 판 끝 목표에 — 대물결 판 = 결승선 돌파(finish) 1건 · 합계(적 전부 + 판 끝 목표)는 판 종류와 상관없이 round(1.5 × V) · 결과 내역 이름 = 돌파', () => {
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    const V = stageValue(id), n = scheduledEnemyCount(st), b = bossCount(st);
    assert.ok(b >= 1, `S${id} 판 끝 목표 ${b}`);
    const kind = stageKindOf(id, 'brutal');
    const goals = kind === 'horde' ? [{ type: 'finish' }] : Array.from({ length: b }, (_, i) => ({ type: 'bossKill', index: i }));
    const t = addEvents(createTally(st), [...Array.from({ length: n }, () => ({ type: 'kill', summoned: false })), ...goals]);
    const m = mainCoins(t, { cleared: false });
    assert.equal(m.enemy + m.boss, Math.round(1.5 * V), `S${id}(${kind}) 적 전부 + 판 끝 목표 = round(1.5 × ${V})`);
    assert.equal(m.boss, Math.round(V * 0.5), `S${id} 판 끝 목표 몫`);
  }
  //  실제 판: 대물결 판 결승선 돌파 = 보스 몫
  const { run, log } = toFinish(1);
  const t = addEvents(createTally(buildStage(1, { difficulty: 'brutal' })), log);
  assert.equal(mainCoins(t, { cleared: run.won }).boss, 13, '1번 돌파 13(V(1) 26 × 0.5)');
});

//  호출 기록 ctx: 호출마다 { op, args, fill }
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
const drawOps = (run, fx = makeFx()) => { const { ctx, ops } = recCtx(); createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx, hud: { distM: 12 }, buttons: [], saveOk: true }); return ops; };

test('HORDE 그림: 결승선이 화면에 보이면 도로를 가로지르는 체크무늬(밝은·어두운 칸)와 표지 \'결승\'(한 어절) — 결승선이 멀면·보스 판에는 없다 · HUD 목표 줄 \'결승선까지 Nm\' · 그리기는 run 을 읽기만 한다', () => {
  assert.equal(FINISH_LOOK.label, '결승'); assert.ok(!/\s/.test(FINISH_LOOK.label), '한 어절');
  const run = createRun(buildStage(4, { difficulty: 'brutal' }));
  run.z = run.prevZ = run.finishZ - 400;
  const snap = JSON.stringify(run);
  const ops = drawOps(run);
  assert.equal(JSON.stringify(run), snap, '그리기 전후 run 이 같다');
  const fills = ops.filter((o) => o.op === 'fill');
  assert.ok(fills.filter((o) => o.fill === FINISH_LOOK.light).length >= FINISH_LOOK.cells && fills.filter((o) => o.fill === FINISH_LOOK.dark).length >= FINISH_LOOK.cells, '체크무늬 두 줄');
  assert.ok(ops.some((o) => o.op === 'fillText' && o.args[0] === FINISH_LOOK.label), "표지 '결승'");
  assert.ok(ops.some((o) => o.op === 'fillText' && o.args[0] === '결승선까지 12m'), 'HUD 목표 줄');
  //  결승선이 화면 밖(멀리)이면 그리지 않는다 · 보스 판에는 결승선이 없다
  run.z = run.prevZ = run.finishZ - 2000;
  assert.ok(!drawOps(run).some((o) => o.op === 'fillText' && o.args[0] === FINISH_LOOK.label), '멀면 없음');
  const boss = createRun(buildStage(3, { difficulty: 'brutal' }));
  boss.z = boss.prevZ = boss.length - 400;
  assert.ok(!drawOps(boss).some((o) => o.op === 'fillText' && o.args[0] === FINISH_LOOK.label), '보스 판에는 결승선 없음');
});

test("HORDE 셸: 대물결 첫 겹에 '대물결 접근!'(경고음·정예 경고 슬롯) · 결승선을 넘는 순간 '결승선 돌파!' 금색 띠 + 승리음 + 부대 위 '+13 코인' · 결과 코인 내역 '돌파'", async () => {
  const h = await bootApp();
  h.app.startRun(1);
  const seen = new Set();
  let hordeAt = null, finishAt = null, n = 0;
  while (h.app.getState() === 'run' && n++ < 60 * 90) {
    const r = h.app.getRun();
    for (const u of r.units) u.hp = 1e9;   // 결승선까지 가는 흐름을 보는 검사 도구(난이도와 무관)
    h.app.input.state.pointerX = 240;
    const before = h.audio.played.length;
    h.texts.length = 0; h.frames(1);
    const played = h.audio.played.slice(before);
    for (const x of h.texts) seen.add(x.text);
    if (hordeAt == null && h.texts.some((x) => x.text === HORDE_BANNER_TEXT)) { hordeAt = n; assert.ok(played.includes('elite'), '대물결 경고음'); }
    if (finishAt == null && h.texts.some((x) => x.text === FINISH_TEXT)) { finishAt = n; assert.ok(played.includes('win'), '돌파 승리음'); }
  }
  assert.ok(hordeAt != null && finishAt != null && hordeAt < finishAt, `대물결 배너(${hordeAt}) → 돌파 배너(${finishAt})`);
  assert.ok(seen.has('+13 코인'), "부대 위 '+13 코인'(판 끝 목표 몫)");
  assert.ok([...seen].some((s) => /^결승선까지 \d+m$/.test(s)), "HUD '결승선까지 Nm'");
  assert.equal(h.app.getState(), 'result');
  const res = h.app.getResult();
  assert.equal(res.won, true);
  assert.equal(res.coins.goal, 'horde');
  assert.match(res.coinLine, /돌파 13/, '결과 내역 이름 = 돌파');
});
