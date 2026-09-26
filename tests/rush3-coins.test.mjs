// rush3-coins — r4.3(v4 ③단계) 코인(획득·지급·저장) + 순차 해금. 이사 지시(원문) "스테이지에 획득된 코인을 누적해서",
//  이사님 결정 N2 = (나) 순차 해금 + 기존 기록 엄격 인정(기획 v4.1 0장 인용 블록), 공식 = P2(기획 v4.1 3-3 (라)).
//  묶음: COIN-1~6(공식·소환 0·접촉 소멸 0·개발용 판 0·포기·패배 지급·첫 클리어 1회) · WALLET-1~10(지급 1회·여운·보너스 이탈·r4.5 [구매] 같은 프레임 연타 1회(4)·새로고침·
//   저장 실패/차단·복수 탭·r4.5 구매 = 잔액·단계 한 번에 저장(8)·포기 → 다시 도전·여운 중 ⏸) · UNLOCK(네 진입 경로 거부·dev 예외·옛 기록 연속 인정) · V3-PURE-COIN · RESULT-ENTER · HUD·결과 화면 글자.
//  ⚠️봇 결과는 정해진 입력으로 한 판씩 돌린 값이다(사람의 수입이 아니다). 셸 검사는 실제 boot() 결선(가짜 캔버스·저장·오디오·rAF)을 두드린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage, ALL_STAGE_IDS, stageVersion } from '../rush3/stages.js';
import { BAL3 } from '../rush3/balance.js';
import { COIN, stageValue, scheduledEnemyCount, bossCount, bonusCoins, clearCoins, createTally, addEvents, tallyTotal, mainCoins, runCoins } from '../rush3/coins.js';
import { createSave3, KEY3, WALLET_KEY, TAB_KEY, COIN_MAX, PAID_KEEP, normWallet } from '../rush3/save.js';
import { createRenderer3, HUD_ROW, SAVE_WARN } from '../rush3/render.js';
import { boot, HUD_BTN, TITLE_GRID, LOCK_NOTICE, ALL_CLEAR_LINE, unlockedThrough, causeLine, coinBreakdown } from '../rush3/main.js';
import { ADVICE_DEFAULT } from '../rush3/advice.js';
import { pickInput, weakenBosses } from './lib/rush3-policies.mjs';
import { seedOldClears } from './lib/rush3-unlock.mjs';

const C = BAL3.colors;

// ─────────────────────────────── 규칙 계층 도우미 ───────────────────────────────
//  한 판을 봇으로 끝까지(또는 maxSteps) — 이벤트 전부를 모아 돌려준다
//  r4.7: opts.win = 보스가 나오면 체력 1(weakenBosses — 보스 체력 바닥으로 봇이 게임 줄 1번을 못 이긴다. 코인 공식 검사가 '이긴 판'의 이벤트를 얻는 도구, 난이도와 무관)
function playEvents(id, policy, difficulty = 'brutal', maxSteps = 14400, opts = {}) {
  const stage = buildStage(id, { difficulty });
  const run = createRun(stage);
  const events = [];
  let n = 0;
  while (!run.over && n < maxSteps) { if (opts.win) weakenBosses(run); stepRun(run, pickInput(policy, run), STEP); events.push(...drainEvents(run)); n++; }
  return { stage, run, events };
}

// ─────────────────────────────── 셸 하네스 ───────────────────────────────
function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  const writes = [];
  return { m, writes, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push(k); m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
}
function fakeCanvas(texts) {
  const grad = { addColorStop() {} };
  const listeners = {};
  const ctx = new Proxy({ canvas: null }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'fillText') texts.push({ text: String(args[0]), x: args[1], y: args[2], fill: t.fillStyle });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: String(args[0]).length * 8 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return {
    width: 480, height: 800, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }),
    addEventListener: (n, f) => { (listeners[n] ??= []).push(f); },
    fire: (n, e) => { for (const f of listeners[n] ?? []) f(e); },
  };
}
function fakeAudio() {
  const played = [];
  return { played, unlock() {}, sfx(n) { played.push(n); return true; }, bgmPlay() {}, bgmPause() {}, bgmResume() {}, setVolume() {}, getVolume() { return 1; }, setMuted() {}, isMuted() { return false; }, duck() {} };
}
//  가짜 BroadcastChannel: 같은 이름의 다른 채널에 **동기**로 배달(실제는 비동기 — 순서만 같으면 판정은 같다)
function fakeBus() {
  const chans = [];
  return class FakeBC {
    constructor(name) { this.name = name; this.onmessage = null; this.closed = false; chans.push(this); }
    postMessage(data) { for (const c of chans) if (c !== this && !c.closed && c.name === this.name && c.onmessage) c.onmessage({ data }); }
    close() { this.closed = true; }
  };
}
async function bootApp({ storage = memStorage(), search = '', BroadcastChannel, dateNow = () => 1_700_000_000_000, difficulty, save } = {}) {
  const texts = [];
  const canvas = fakeCanvas(texts);
  const L = {};
  const win = { devicePixelRatio: 1, location: { search }, addEventListener: (n, f) => { (L[n] ??= []).push(f); }, fire: (n, e = {}) => { for (const f of L[n] ?? []) f(e); } };
  const queue = [];
  let nowMs = 1000;
  const sv = save ?? createSave3(storage);
  const audio = fakeAudio();
  const deps = { win, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save: sv, audio, dateNow, sprites: { get: () => null, ready: new Set() } };
  if (BroadcastChannel !== undefined) deps.BroadcastChannel = BroadcastChannel;
  if (difficulty) deps.difficulty = difficulty;
  const app = boot(canvas, deps);
  await app.ready;
  const frames = (n = 1) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  //  논리 좌표(480×800) 클릭 — 캔버스 CSS 240×400 이라 절반
  const tap = (x, y) => canvas.fire('pointerdown', { clientX: x / 2, clientY: y / 2, pointerType: 'mouse' });
  const key = (code) => win.fire('keydown', { code, preventDefault() {} });
  const textNow = () => { texts.length = 0; frames(1); return texts.map((t) => t.text); };
  return { app, save: sv, storage, texts, frames, tap, key, textNow, audio, win };
}
//  봇 입력을 셸 입력 칸에 넣으며 조건까지 진행(도로 x + 광장 dragDy)
//  r4.7: opts.win = 보스가 나오면 체력 1(weakenBosses) — 보스 체력 바닥으로 봇이 게임 줄 1번을 못 이겨, 이긴 판이 필요한 셸 흐름 검사가 이 칸을 켠다(난이도와 무관)
const WIN = Object.freeze({ win: true });
function drive(h, policy, cond, max = 20000, opts = {}) {
  let n = 0;
  while (!cond() && n < max) {
    const run = h.app.getRun();
    if (opts.win && run && h.app.getState() === 'run') weakenBosses(run);
    if (run && h.app.getState() === 'run') {
      const inp = pickInput(policy, run);
      h.app.input.state.pointerX = inp.pointerX;
      if (inp.dragDy) h.app.input.state.dragDy += inp.dragDy;
    }
    h.frames(1);
    n++;
  }
  return n;
}
const wallet = (h) => h.save.wallet.get();
const rawWallet = (h) => JSON.parse(h.storage.getItem(WALLET_KEY));

// ═══════════════════════════════ COIN — 공식(규칙 계층 + coins.js) ═══════════════════════════════

test('COIN-1: 공식 P2 — V(s) = 24 + 2s, 일정 스폰 1마리 = V ÷ 일정 스폰 총수, 보스 = V × 0.5 ÷ 보스 수, 첫 클리어 V · 재클리어 5, 한 단위 한 번 반올림 — 1번 evLead 첫 승리 54 · 재승리 33(F_summary 계산 예)', () => {
  assert.deepEqual([stageValue(1), stageValue(12), stageValue(24)], [26, 48, 72]);
  assert.equal(stageValue('proto3'), 0, '공개 판 번호가 아니면 0');
  //  일정 스폰 총수 = buildStage 의 spawns n 합(물결·무리 수·extraSpawns 포함) — 1번 기본 줄 44(F 계산 예의 분모), 2번 38
  assert.equal(scheduledEnemyCount(buildStage(1, { difficulty: 'brutal' })), 44);
  assert.equal(scheduledEnemyCount(buildStage(2, { difficulty: 'brutal' })), 38);
  assert.ok(scheduledEnemyCount(buildStage(1, { difficulty: 'brutal' })) > scheduledEnemyCount(buildStage(1)), '기본 줄은 extraSpawns 가 붙어 배수 1 줄보다 많다');
  assert.deepEqual([1, 10, 23, 24].map((id) => bossCount(buildStage(id, { difficulty: 'brutal' }))), [1, 2, 3, 1], '보스 수(도로 정예 배열 · 광장 1)');
  //  1번 evLead(기본 줄) 첫 승리: 일정 스폰 26마리 × 26/44 = 15.36 + 보스 13 = 28.36 → 28, 첫 클리어 26 → 54. 재승리 28 + 5 = 33
  //  r4.7: 보스 체력 바닥(30초 × 상한 화력)으로 봇이 1번을 못 이겨 보스가 나오면 체력 1 로 깎아 '이긴 판'을 만든다(보스 전 처치 26마리는 종전 판 그대로)
  const r = playEvents(1, 'evLead', 'brutal', 14400, { win: true });
  assert.equal(r.run.won, true, 'evLead + 보스 체력 1 = 이긴 판');
  const kills = r.events.filter((e) => e.type === 'kill');
  assert.equal(kills.filter((e) => !e.summoned).length, 26, '일정 스폰 26마리 처치(F 계산 예)');
  assert.deepEqual(runCoins(r.stage, r.events, { cleared: true, firstClear: true }), { enemy: 15, boss: 13, clear: 26, bonus: 0, total: 54 });
  assert.deepEqual(runCoins(r.stage, r.events, { cleared: true, firstClear: false }), { enemy: 15, boss: 13, clear: 5, bonus: 0, total: 33 });
  //  2번 evLead 패배 = 일정 스폰 10마리 × V(2) 28 ÷ 38 = 7.37 → 7(F '2번에서 한 번 지면 7코인')
  const r2 = playEvents(2, 'evLead');
  assert.equal(r2.run.won, false);
  assert.equal(runCoins(r2.stage, r2.events, { cleared: false }).total, 7);
  //  반올림은 한 단위에 한 번: 보스 1체 몫 11.67 + 적 1마리 1 = 12.67 → 13(따로 반올림해 더해도 합은 한 번 반올림과 같게 — 보스 몫을 먼저 반올림하고 나머지를 적에 둔다)
  const t = createTally({ id: 23, spawns: [{ n: 70 }], elites: [{}, {}, {}] });
  assert.equal(t.perBoss, 70 * 0.5 / 3);
  addEvents(t, [{ type: 'bossKill' }, { type: 'kill', summoned: false }]);
  const m = mainCoins(t, { cleared: false });
  assert.equal(tallyTotal(t), 13);
  assert.equal(m.enemy + m.boss, Math.round(70 * 0.5 / 3 + 70 / 70));
  assert.equal(m.boss, Math.round(70 * 0.5 / 3));
  //  8번 보너스전: 보상 단계 K × round(V(8) × 0.25) = K × 10
  assert.equal(stageValue(8) * COIN.bonusTierShare, 10);
  assert.deepEqual([0, 1, 2, 3].map((k) => bonusCoins(8, k)), [0, 10, 20, 30]);
  assert.equal(clearCoins(5, { cleared: false, firstClear: true }), 0, '진 판은 클리어 보너스 없음');
});

test('COIN-2: 보스 소환 적은 0 코인 — kill 이벤트 summoned(도로 정예·광장 소환 모두), 일정 스폰 적 객체엔 표식 키가 없다, hpMax 는 스폰 체력', () => {
  //  10번(도로 정예 2체, 소환형 포함): evLead 는 소환 잡졸을 많이 잡는다 — 코인 셈은 소환 처치를 빼도 같아야 한다
  const r = playEvents(10, 'evLead');
  const kills = r.events.filter((e) => e.type === 'kill');
  const summoned = kills.filter((e) => e.summoned === true), sched = kills.filter((e) => e.summoned === false);
  assert.ok(summoned.length > 50, '소환 잡졸 처치가 있다: ' + summoned.length);
  assert.equal(summoned.length + sched.length, kills.length, 'summoned 는 늘 불리언');
  assert.ok(kills.every((e) => Number.isFinite(e.hpMax) && e.hpMax > 0), 'kill 이벤트에 hpMax');
  const all = runCoins(r.stage, r.events, { cleared: r.run.won });
  const noSumm = runCoins(r.stage, r.events.filter((e) => !(e.type === 'kill' && e.summoned)), { cleared: r.run.won });
  assert.deepEqual(all, noSumm, '소환 처치를 빼도 코인이 같다(소환 = 0)');
  assert.equal(runCoins(r.stage, summoned, {}).total, 0, '소환 처치만 넣으면 0');
  //  D 방식(한 STEP 안에서 spawn 이 summon 보다 먼저 번호를 받는다) 판별과 규칙 표식이 같다
  {
    const stage = buildStage(10, { difficulty: 'brutal' });
    const run = createRun(stage);
    const byId = new Map();
    let n = 0, mismatch = 0, checked = 0;
    while (!run.over && n < 14400) {
      const id0 = run.nextEnemyId;
      stepRun(run, pickInput('evLead', run), STEP); n++;
      const ev = drainEvents(run);
      let nSched = 0;
      for (const e of ev) if (e.type === 'spawn') nSched += e.n;
      for (let id = id0; id < run.nextEnemyId; id++) byId.set(id, id - id0 >= nSched);
      for (const e of ev) if (e.type === 'kill') { checked++; if (byId.get(e.id) !== e.summoned) mismatch++; }
    }
    assert.ok(checked > 100); assert.equal(mismatch, 0, 'ID 순서 판별과 summoned 표식 불일치 0');
  }
  //  광장(20번) 소환도 summoned — 무입력으로 광장에 들어가 소환이 난 STEP 의 새 적은 표식이 있고, 죽으면 kill 에 실린다
  {
    const run = createRun(buildStage(20, { difficulty: 'brutal' }));
    let n = 0, got = null;
    while (!run.over && n < 14400 && !got) {
      stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); n++;
      const ev = drainEvents(run);
      if (ev.some((e) => e.type === 'summon')) got = run.enemies.filter((e) => e.chase);
    }
    assert.ok(got && got.length > 0, '광장 소환 적이 생겼다');
    assert.ok(got.every((e) => e.summoned === true), '광장 소환 적 = summoned');
    for (const e of got) { e.hp = 0; e.dead = true; }
    stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP);
    const k = drainEvents(run).filter((e) => e.type === 'kill');
    assert.ok(k.length >= got.length && k.filter((e) => got.some((g) => g.id === e.id)).every((e) => e.summoned === true), '광장 소환 처치 kill.summoned');
    assert.ok(run.enemies.filter((e) => !e.chase).every((e) => !('summoned' in e)), '일정 스폰 적 객체에는 summoned 키가 없다(희소)');
  }
});

test('COIN-3: 부딪혀 사라진 적은 0 코인 — touch 이벤트의 적은 kill 이벤트가 없고, 코인은 kill 만 센다', () => {
  const r = playEvents(1, 'center');
  const touched = new Set(r.events.filter((e) => e.type === 'touch' && e.kind !== 'elite').map((e) => e.id));
  assert.ok(touched.size > 0, '접촉 소멸이 있다(center 봇)');
  const killed = new Set(r.events.filter((e) => e.type === 'kill').map((e) => e.id));
  for (const id of touched) assert.equal(killed.has(id), false, '부딪혀 사라진 적 ' + id + ' 은 kill 이 없다');
  assert.equal(runCoins(r.stage, r.events.filter((e) => e.type === 'touch'), {}).total, 0, 'touch 이벤트만 넣으면 0');
  const t = addEvents(createTally(r.stage), r.events);
  assert.equal(t.kills, r.events.filter((e) => e.type === 'kill' && !e.summoned).length, '누계 처치 수 = 일정 스폰 kill 수');
});

test('COIN-4: 개발용 판(devWeapon·proto3·?dev=1 로 연 잠긴 판)은 0 코인 — 공식·셸 모두, 지갑에 식별자도 남기지 않는다', async () => {
  const r = playEvents(1, 'evLead');
  assert.deepEqual(runCoins(r.stage, r.events, { cleared: true, firstClear: true, dev: true, bonusTier: 3 }), { enemy: 0, boss: 0, clear: 0, bonus: 0, total: 0 });
  //  셸: ?weapon= 개발 판 — 적을 잡고 포기해도 0, 지갑 불변. HUD 코인 칩도 없다(coins null)
  const h = await bootApp({ search: '?weapon=scatter' });
  h.app.startRun(1);
  assert.equal(h.app.getRun().devWeapon, true);
  drive(h, 'evLead', () => h.app.getRun().kills >= 3, 3000);
  assert.equal(h.app.dbg().coins, null, '개발용 판은 HUD 코인 없음');
  h.app.pause(); h.app.giveUp();
  const res = h.app.getResult();
  assert.equal(res.aborted, true);
  assert.equal(res.coins.dev, true); assert.equal(res.coins.gained, 0);
  assert.deepEqual(wallet(h), { coins: 0, runNo: 1, paid: [], firstClears: [], up: { power: 0, rate: 0, multi: 0 } }, '지갑엔 출격 번호만 오르고 지급 식별자는 없다');
  assert.ok(h.textNow().includes('개발용 판 — 코인 없음'));
  //  proto3(시제품)도 개발용 판
  const hp = await bootApp({ search: '?stage=proto3' });
  hp.key('Enter');
  assert.equal(hp.app.getState(), 'run'); assert.equal(hp.app.getRun().stageId, 'proto3'); assert.equal(hp.app.getRun().devWeapon, true);
  assert.equal(hp.app.dbg().coins, null);
});

test('COIN-5: 포기·패배도 그때까지의 처치분을 받는다(클리어 보너스 없음)', async () => {
  //  포기: 1번에서 적을 몇 마리 잡고 ⏸ → [작전 중단]
  const h = await bootApp();
  h.app.startRun(1);
  drive(h, 'evLead', () => h.app.getRun().kills >= 6, 4000);
  const kills = h.app.getRun().kills;
  const want = Math.round(kills * stageValue(1) / 44);
  assert.equal(h.app.dbg().coins, want, 'HUD 누계 = 정산 전 값');
  h.app.pause();
  h.frames(1);                   // 일시정지 화면의 버튼 목록이 잡히는 프레임
  h.tap(120 + 120, 480 + 22);    // 일시정지 [작전 중단](giveup) 버튼
  assert.equal(h.app.getState(), 'result');
  const res = h.app.getResult();
  assert.equal(res.aborted, true); assert.equal(res.won, false);
  assert.deepEqual({ gained: res.coins.gained, clear: res.coins.clear, balance: res.coins.balance }, { gained: want, clear: 0, balance: want });
  assert.deepEqual(wallet(h).paid, ['1:main']);
  //  패배: 2번(옛 기록 1번 시드)을 evLead 로 — 2번 보스 전에 진다(봇). 적분만
  const h2 = await bootApp();
  seedOldClears(h2.save, 1);
  h2.app.startRun(2);
  drive(h2, 'evLead', () => h2.app.getState() === 'result', 20000);
  const r2 = h2.app.getResult();
  assert.equal(r2.won, false); assert.equal(r2.aborted, false);
  assert.equal(r2.coins.gained, Math.round(h2.app.getRun().kills * stageValue(2) / 38), '패배 = 처치분(보스 0)');
  assert.ok(r2.coins.gained > 0);
  assert.equal(wallet(h2).coins, r2.coins.gained);
});

test('COIN-6: 첫 클리어 보너스는 판마다 1회 — 옛 지옥 칸 클리어가 있어도(=commitMain 이 cleared 를 먼저 써도) V(s), 다음 승리는 재클리어 5', async () => {
  const st = memStorage();
  const pre = createSave3(st);
  pre.updateStage(1, { cleared: true, attempts: 4, bestSurvivors: 9, bestTime: 50 }, stageVersion(1), 'brutal');   // 옛 지옥 칸 = 이미 cleared
  const h = await bootApp({ storage: st });
  h.app.startRun(1);
  drive(h, 'evLead', () => h.app.getRun().won, 20000, WIN);
  //  승리 확정 프레임: 정산이 commitMain 보다 먼저 끝났고, 첫 클리어 표식은 지갑에만 있다
  assert.deepEqual(wallet(h).firstClears, [1]);
  const first = h.app.getRun();
  drive(h, 'evLead', () => h.app.getState() === 'result', 400);
  const r1 = h.app.getResult();
  assert.equal(r1.coins.clearKind, 'first'); assert.equal(r1.coins.clear, stageValue(1));
  assert.ok(first.kills > 0);
  //  두 번째 승리 = 재클리어 5
  h.key('Enter');                   // 승리 결과 Enter = [다음 작전](2번) — 1번 재도전은 [다시 도전] 버튼
  assert.equal(h.app.getRun().stageId, 2, '승리 결과의 Enter 는 다음 작전');
  h.app.toTitle();
  h.app.startRun(1);
  drive(h, 'evLead', () => h.app.getState() === 'result', 20000, WIN);
  const r2 = h.app.getResult();
  assert.equal(r2.won, true);
  assert.equal(r2.coins.clearKind, 'replay'); assert.equal(r2.coins.clear, 5);
  assert.deepEqual(wallet(h).firstClears, [1], '첫 클리어 표식은 한 번');
  assert.equal(wallet(h).coins, r1.coins.gained + r2.coins.gained);
  //  공식의 첫 승리 기대값(봇 셸 판은 입력 타이밍이 규칙 검사와 같아 54)
  assert.equal(r1.coins.gained, 54, '1번 evLead 첫 승리 54(COIN-1 과 같은 값)');
  assert.equal(r2.coins.gained, 33, '재승리 33');
});

// ═══════════════════════════════ WALLET — 지급·저장 ═══════════════════════════════

test('WALLET-1: 이긴 판은 한 번만 지급 — commitMain(승리 프레임)·finishRun(1.3초 뒤) 둘 다 돌아도 지갑 쓰기는 출격 1회 + 지급 1회', async () => {
  const h = await bootApp();
  h.app.startRun(1);
  assert.deepEqual(rawWallet(h), { coins: 0, runNo: 1, paid: [], firstClears: [], up: { power: 0, rate: 0, multi: 0 } }, '출격 때 runNo +1 을 쓴다');
  drive(h, 'evLead', () => h.app.getState() === 'result', 20000, WIN);
  const r = h.app.getResult();
  assert.equal(r.won, true);
  const wWrites = h.storage.writes.filter((k) => k === WALLET_KEY).length;
  assert.equal(wWrites, 2, '지갑 쓰기 = 출격 1 + 지급 1');
  assert.deepEqual(rawWallet(h), { coins: r.coins.gained, runNo: 1, paid: ['1:main'], firstClears: [1], up: { power: 0, rate: 0, multi: 0 } }, '잔액·식별자·첫 클리어 표식이 한 번에');
  //  r4.4 재기준(D9′): 셸의 기록은 v4 칸 `${ver}:v4`
  assert.equal(JSON.parse(h.storage.getItem(KEY3)).stages['1'].versions[stageVersion(1) + ':v4'].cleared, true, 'v3 기록은 그대로 따로');
  //  결과 화면에서 몇 프레임 더 — 추가 지급 없음
  h.frames(30);
  assert.equal(h.storage.writes.filter((k) => k === WALLET_KEY).length, 2);
  //  같은 식별자로 다시 지급하려 해도 막힌다(저장소를 다시 읽어 판정)
  const again = h.save.wallet.pay({ id: '1:main', amount: 999 });
  assert.equal(again.paid, false); assert.equal(wallet(h).coins, r.coins.gained);
});

test('WALLET-2: 여운(승리 1.3초·패배 1.0초) 중 이탈해도 지급은 이미 끝났다 — 한 번, 잃지 않음', async () => {
  //  승리 여운 중 toTitle(API = 종전 ⏸→스테이지 선택 경로 — commitMain 안전망만 남았다)
  const h = await bootApp();
  h.app.startRun(1);
  drive(h, 'evLead', () => h.app.getRun().over, 20000, WIN);
  assert.equal(h.app.getState(), 'run', '여운 중');
  const paid = wallet(h).coins;
  assert.equal(paid, 54);
  h.app.toTitle();
  assert.equal(h.app.getState(), 'title');
  assert.deepEqual({ coins: wallet(h).coins, paid: wallet(h).paid }, { coins: 54, paid: ['1:main'] });
  //  패배 여운 중 이탈: 1번 center 봇(지고, 적을 몇 마리 잡는다)
  const h2 = await bootApp();
  h2.app.startRun(1);
  drive(h2, 'center', () => h2.app.getRun().over, 20000);
  assert.equal(h2.app.getRun().won, false);
  const lossCoins = Math.round(h2.app.getRun().kills * stageValue(1) / 44);
  assert.equal(wallet(h2).coins, lossCoins, '패배 이벤트에서 이미 지급');
  h2.app.toTitle();
  assert.equal(wallet(h2).coins, lossCoins);
  assert.deepEqual(wallet(h2).paid, ['1:main']);
});

test('WALLET-3: 8번 보너스 도중 이탈 = 본전투분만(보너스 점수·보너스 코인 버림), 끝까지 가면 보너스분 K × 10 을 따로 한 번', async () => {
  //  보너스 셸 검사(B-8)와 같이 배수 1 줄 판(deps.difficulty — 검사 전용 주입)으로 planBoss 가 8번을 이긴다
  const h = await bootApp({ difficulty: 'normal' });
  seedOldClears(h.save, 7);
  h.app.startRun(8);
  drive(h, 'planBoss', () => h.app.getRun().phase === 'bonus', 12000);
  const main = wallet(h).coins;
  assert.ok(main > 0, '승리 프레임에 본전투분 지급: ' + main);
  assert.deepEqual(wallet(h).paid, ['1:main']);
  drive(h, 'planBoss', () => h.app.getRun().bonus.score > 0 && h.app.getRun().bonus.t >= 3, 2000);
  h.app.pause();
  assert.ok(h.textNow().includes('결과 보기'), '보너스 중 ⏸ 메뉴는 [결과 보기]');
  h.app.giveUp();
  const r = h.app.getResult();
  assert.equal(r.won, true); assert.equal(r.aborted, false);
  assert.equal(r.bonus, null, '미완 보너스 점수는 버린다');
  assert.equal(r.coins.bonus, 0); assert.equal(r.coins.gained, main);
  assert.deepEqual(wallet(h).paid, ['1:main'], '보너스 식별자 없음');
  assert.equal('bestBonus' in h.save.getStage(8, stageVersion(8)), false, 'bestBonus 미기록(종전 B-8 규칙과 같음)');
  //  끝까지: 보너스 종료 때 `${runNo}:bonus` 로 한 번
  h.app.startRun(8);
  drive(h, 'planBoss', () => h.app.getState() === 'result', 14000);
  const r2 = h.app.getResult();
  assert.ok(r2.bonus && r2.bonus.tier >= 1, '보너스 단계에 닿았다: ' + JSON.stringify(r2.bonus));
  assert.equal(r2.coins.bonus, r2.bonus.tier * 10);
  assert.deepEqual(wallet(h).paid, ['1:main', '2:main', '2:bonus']);
  assert.equal(wallet(h).coins, main + r2.coins.gained);
});

//  r4.5(v4 ⑤단계) — 강화 화면 [구매]. 번호 4·8 은 ③단계 때 비워 둔 자리(기획 v4.1 3-7 표 '결과 화면 버튼 연타 — 새로 넣는 [로봇 강화] 버튼은 같은 프레임 연타 주의')
async function upgradeScreen(coins, up = { power: 0, rate: 0, multi: 0 }) {
  const storage = memStorage({ [WALLET_KEY]: JSON.stringify({ coins, runNo: 0, paid: [], firstClears: [], up }) });
  const h = await bootApp({ storage });
  h.frames(1);
  h.app.openUpgrade('title');
  h.frames(1);
  const at = (id) => { const b = h.app.getButtons().find((x) => x.id === id); return [b.x + b.w / 2, b.y + b.h / 2]; };
  return { h, storage, at };
}

test('WALLET-4: 강화 화면 [구매] 같은 프레임 연타 = 1회만(두 번 살 잔액이 있어도) — 누른 즉시 버튼이 흐려지고, 다음 프레임부터 다시 살 수 있다', async () => {
  const { h, storage, at } = await upgradeScreen(500);
  const w0 = storage.writes.filter((k) => k === WALLET_KEY).length;
  const [mx, my] = at('buy_multi'), [px, py] = at('buy_power');
  //  같은 프레임(프레임 사이에 frames 없음)에 다연발 두 번 + 직격 화력 한 번
  h.tap(mx, my); h.tap(mx, my); h.tap(px, py);
  assert.deepEqual(wallet(h).up, { power: 0, rate: 0, multi: 1 }, '다연발 1단계만(2단계 120 을 살 잔액이 있어도)');
  assert.equal(wallet(h).coins, 460);
  assert.equal(storage.writes.filter((k) => k === WALLET_KEY).length, w0 + 1, '지갑 쓰기 1회');
  //  누른 즉시 반영: 이번 프레임의 [구매] 버튼이 모두 흐리다(hitButton 이 건너뛴다)
  assert.ok(h.app.getButtons().filter((b) => b.id.startsWith('buy_')).every((b) => b.disabled), '같은 프레임엔 [구매] 전부 흐림');
  assert.equal(h.app.buyTrack('rate'), null, 'API 로 불러도 같은 프레임은 막힌다');
  //  다음 프레임: 다시 산다(다연발 2단계 120)
  h.frames(1);
  h.tap(mx, my);
  assert.deepEqual(wallet(h).up, { power: 0, rate: 0, multi: 2 });
  assert.equal(wallet(h).coins, 340);
  assert.equal(storage.writes.filter((k) => k === WALLET_KEY).length, w0 + 2);
});

test('WALLET-8: 구매 = 잔액·단계를 **한 번에** 저장(지갑 쓰기 1회, 한 원문) — 새로 읽어도(새로고침·새 앱) 유지, 잔액 부족·최대 단계는 쓰지 않는다', async () => {
  const { h, storage, at } = await upgradeScreen(125, { power: 0, rate: 4, multi: 0 });
  const writes = () => storage.writes.filter((k) => k === WALLET_KEY).length;
  const w0 = writes();
  const [rx, ry] = at('buy_rate');
  h.tap(rx, ry);                                      // 연사 4 → 5(330) — 잔액 부족: 흐린 버튼이라 눌리지 않는다
  assert.equal(writes(), w0, '잔액 부족 = 쓰기 없음');
  const [px, py] = at('buy_power');
  h.tap(px, py);                                      // 직격 화력 0 → 1(40)
  assert.equal(writes(), w0 + 1, '구매 1회 = 쓰기 1회');
  const raw = JSON.parse(storage.getItem(WALLET_KEY));
  assert.deepEqual({ coins: raw.coins, up: raw.up }, { coins: 85, up: { power: 1, rate: 4, multi: 0 } }, '잔액·단계가 한 원문에');
  //  새로 읽기(새 저장 객체 · 새 앱)
  assert.deepEqual(createSave3(storage).wallet.get().up, { power: 1, rate: 4, multi: 0 });
  const h2 = await bootApp({ storage });
  assert.equal(h2.save.wallet.get().coins, 85);
  h2.frames(1);
  h2.app.openUpgrade('title');
  h2.frames(1);
  const t = h2.textNow();
  assert.ok(t.includes('보유 코인 85') && t.includes('1/5단계') && t.includes('4/5단계'), '새 앱 강화 화면에 산 단계: ' + JSON.stringify(t.filter((s) => /단계|코인/.test(s))));
  //  최대 단계 버튼은 흐림(쓰기 없음)
  const { h: h3, storage: st3, at: at3 } = await upgradeScreen(9999, { power: 5, rate: 5, multi: 3 });
  const n3 = st3.writes.filter((k) => k === WALLET_KEY).length;
  for (const id of ['buy_power', 'buy_rate', 'buy_multi']) { const [x, y] = at3(id); h3.tap(x, y); }
  assert.equal(st3.writes.filter((k) => k === WALLET_KEY).length, n3, '최대 단계 = 쓰기 없음');
  assert.ok(h3.app.getButtons().filter((b) => b.id.startsWith('buy_')).every((b) => b.disabled && b.label === '최대 단계'));
});

test('WALLET-5: 판 도중 새로고침 — 정산 전 코인만 사라지고(중복 없음), 다음 출격은 새 번호', async () => {
  const st = memStorage();
  const a = await bootApp({ storage: st });
  a.app.startRun(1);
  drive(a, 'evLead', () => a.app.getRun().kills >= 5, 4000);
  assert.ok(a.app.dbg().coins > 0);
  //  새로고침 = 같은 저장소로 새 앱
  const b = await bootApp({ storage: st });
  assert.deepEqual(wallet(b), { coins: 0, runNo: 1, paid: [], firstClears: [], up: { power: 0, rate: 0, multi: 0 } }, '정산 전 누계는 저장되지 않았다');
  b.app.startRun(1);
  drive(b, 'evLead', () => b.app.getRun().over, 20000, WIN);
  assert.deepEqual(wallet(b).paid, ['2:main'], '새 출격 번호 2');
  //  승리 여운 중 새로고침: 이미 지급 — 새 앱에서도 한 번뿐
  const c = await bootApp({ storage: st });
  assert.equal(wallet(c).coins, 54); assert.deepEqual(wallet(c).paid, ['2:main']);
  c.frames(10);
  assert.equal(wallet(c).coins, 54);
});

test('WALLET-6: 쓰기 실패·localStorage 차단 환경 — 결과·타이틀에 "코인이 저장되지 않습니다"(종전 "기록 저장 안 됨" 자리)', async () => {
  //  ① 쓰기 실패(quota): 기록·코인 둘 다
  const bad = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  const h = await bootApp({ save: createSave3(bad) });
  h.app.startRun(1);
  drive(h, 'evLead', () => h.app.getRun().kills >= 3, 4000);
  h.app.pause(); h.app.giveUp();
  assert.equal(h.app.getResult().coinSaveOk, false);
  let t = h.textNow();
  assert.ok(t.includes(SAVE_WARN.both), '결과 화면 경고: ' + t.filter((x) => x.includes('저장')).join(' | '));
  assert.ok(h.app.getResult().coins.balance > 0, '메모리 잔액은 보인다');
  h.app.toTitle();
  t = h.textNow();
  assert.ok(t.includes(SAVE_WARN.both), '타이틀 경고');
  //  ② 차단 환경: 저장소 자체가 없다(Node 에 localStorage 없음 = 브라우저 차단과 같은 경로) — 종전엔 ok true 라 아무 경고도 없었다
  const blocked = createSave3();
  assert.equal(blocked.persistent, false); assert.equal(blocked.ok, true); assert.equal(blocked.wallet.ok, false);
  const hb = await bootApp({ save: blocked });
  t = hb.textNow();
  assert.ok(t.includes(SAVE_WARN.coin), '차단 환경 타이틀 경고: ' + JSON.stringify(t.slice(-3)));
  assert.ok(!t.includes(SAVE_WARN.record), '기록 쓰기 예외는 없어서 기록 경고는 없다');
  //  ③ 정상 저장소엔 경고 없음
  const ok = await bootApp();
  const t3 = ok.textNow();
  for (const w of Object.values(SAVE_WARN)) assert.ok(!t3.includes(w), '정상 저장소 경고 없음: ' + w);
  //  ④ 쓰기가 실패하는 동안 메모리가 앞서 있으면 다음 지급의 기준은 메모리(잔액이 줄어 보이지 않는다)
  const flaky = memStorage();
  let fail = false;
  const fs = { getItem: flaky.getItem, setItem: (k, v) => { if (fail) throw new Error('quota'); flaky.setItem(k, v); } };
  const s = createSave3(fs);
  s.wallet.pay({ id: '1:main', amount: 10 });
  fail = true;
  s.wallet.pay({ id: '2:main', amount: 5 });
  assert.equal(s.wallet.get().coins, 15); assert.equal(s.wallet.ok, false);
  s.wallet.pay({ id: '3:main', amount: 1 });
  assert.equal(s.wallet.get().coins, 16, '실패 중에도 메모리 기준으로 쌓인다');
  fail = false;
  s.wallet.pay({ id: '4:main', amount: 1 });
  assert.equal(JSON.parse(flaky.getItem(WALLET_KEY)).coins, 17, '회복하면 메모리 값이 통째로 저장된다');
  assert.equal(s.wallet.ok, true);
});

test('WALLET-7: 복수 탭 — 먼저 열린 탭이 살아 있으면 나중 탭은 읽기 전용(기록·지갑 쓰기 안 함 + 화면 안내), 탭 표식 키. 지갑은 쓰기 직전 다시 읽어 합친다', async () => {
  const BC = fakeBus();
  const st = memStorage();
  const a = await bootApp({ storage: st, BroadcastChannel: BC, dateNow: () => 1_700_000_000_000 });
  const b = await bootApp({ storage: st, BroadcastChannel: BC, dateNow: () => 1_700_000_005_000 });
  assert.equal(a.app.dbg().readOnly, false, '먼저 연 탭은 쓰기 가능');
  assert.equal(b.app.dbg().readOnly, true, '나중 탭은 읽기 전용');
  assert.equal(JSON.parse(st.getItem(TAB_KEY)).id, b.app.dbg().tabId, '탭 표식(시각 + performance 기반 id)');
  assert.match(b.app.dbg().tabId, /^[0-9a-z]+-[0-9a-z]+$/);
  assert.ok(b.textNow().includes(SAVE_WARN.readOnly), '나중 탭 타이틀 안내');
  assert.ok(!a.textNow().includes(SAVE_WARN.readOnly));
  //  나중 탭이 출격·처치·포기해도 저장소는 한 글자도 바뀌지 않는다
  const before = [...st.m.entries()].map(([k, v]) => k + '=' + v).join('\n');
  b.app.startRun(1);
  drive(b, 'evLead', () => b.app.getRun().kills >= 3, 4000);
  b.app.pause(); b.app.giveUp();
  assert.ok(b.app.getResult().coins.gained > 0);
  assert.equal(b.app.getResult().readOnly, true);
  assert.ok(b.textNow().includes(SAVE_WARN.readOnly), '결과 화면 안내');
  assert.equal([...st.m.entries()].map(([k, v]) => k + '=' + v).join('\n'), before, '읽기 전용 탭은 저장소를 쓰지 않는다');
  //  먼저 연 탭은 그대로 쓴다
  a.app.startRun(1);
  assert.equal(JSON.parse(st.getItem(WALLET_KEY)).runNo, 1);
  //  채널이 없으면(옛 브라우저) 확인 없이 쓰기 가능 — 대신 지갑은 쓰기 직전 다시 읽어 합친다(paid 합집합, coins = 다시 읽은 값 + 이번 지급)
  const st2 = memStorage();
  const s1 = createSave3(st2), s2 = createSave3(st2);
  s1.wallet.pay({ id: '1:main', amount: 10, firstClear: 1 });
  s2.wallet.pay({ id: '1:bonus', amount: 5 });
  assert.deepEqual(JSON.parse(st2.getItem(WALLET_KEY)), { coins: 15, runNo: 0, paid: ['1:main', '1:bonus'], firstClears: [1], up: { power: 0, rate: 0, multi: 0 } });
  assert.equal(s2.wallet.pay({ id: '1:main', amount: 10 }).paid, false, '다른 탭이 이미 지급한 식별자는 다시 지급하지 않는다');
  assert.equal(s1.wallet.startRun(), 1); assert.equal(s2.wallet.startRun(), 2, 'runNo 는 다시 읽은 값에서 +1');
});

test('WALLET-9: 포기 → 결과("작전 중단") → 다시 도전(Enter) — 포기분은 한 번만, 새 판은 새 번호', async () => {
  const h = await bootApp();
  h.app.startRun(1);
  drive(h, 'evLead', () => h.app.getRun().kills >= 5, 4000);
  h.key('Escape');
  assert.equal(h.app.getState(), 'paused');
  assert.ok(h.textNow().includes('작전 중단'), '일시정지 메뉴 [작전 중단]');
  h.tap(240, 500);
  assert.equal(h.app.getState(), 'result');
  const g = h.app.getResult().coins.gained;
  assert.ok(g > 0);
  const t = h.textNow();
  assert.ok(t.includes('작전 중단') && t.includes('획득 코인 +' + g), '결과 제목·획득 코인: ' + t.slice(0, 8).join(' | '));
  h.key('Enter');                    // 포기 결과의 기본 버튼 = [다시 도전]
  assert.equal(h.app.getState(), 'run'); assert.equal(h.app.getRun().stageId, 1);
  assert.equal(wallet(h).coins, g, '포기분 1회');
  assert.equal(wallet(h).runNo, 2);
  h.app.pause(); h.app.giveUp();     // 바로 다시 포기 — 0 코인, 식별자는 남는다
  assert.equal(h.app.getResult().coins.gained, 0);
  assert.deepEqual(wallet(h).paid, ['1:main', '2:main']);
  assert.equal(wallet(h).coins, g);
});

test('WALLET-10: 승리·패배 여운 중 ⏸ 는 [결과 보기] → 원래 결과(작전 성공/실패) 화면, 추가 지급 없음', async () => {
  const h = await bootApp();
  h.app.startRun(1);
  drive(h, 'evLead', () => h.app.getRun().over, 20000, WIN);
  h.app.pause();
  assert.ok(h.textNow().includes('결과 보기'));
  h.app.giveUp();
  const r = h.app.getResult();
  assert.equal(r.won, true); assert.equal(r.aborted, false);
  assert.equal(r.coins.gained, 54); assert.equal(wallet(h).coins, 54);
  assert.ok(h.textNow().includes('작전 성공!'));
  const h2 = await bootApp();
  h2.app.startRun(1);
  drive(h2, 'center', () => h2.app.getRun().over, 20000);
  h2.app.pause(); h2.app.giveUp();
  const r2 = h2.app.getResult();
  assert.equal(r2.won, false); assert.equal(r2.aborted, false, '패배 여운 중 ⏸ 는 "작전 실패"(중단 아님)');
  assert.ok(h2.textNow().includes('작전 실패'));
  assert.deepEqual(wallet(h2).paid, ['1:main']);
});

test('WALLET 저장 형식: 별도 키 · 정규화(coins 0~999,999 정수 · paid 최근 20 · firstClears 정수 오름차순) · 손상 → 기본값 · v3 키 형식 v:3 그대로', () => {
  assert.equal(WALLET_KEY, 'starforgeRush.v3.wallet'); assert.notEqual(WALLET_KEY, KEY3);
  assert.deepEqual(normWallet({ coins: 1.9e7, runNo: -3, paid: ['1:main', 'x', 5, '1:main', '2:bonus'], firstClears: [3, 1, 1, 'a', 2.5, 0] }),
    { coins: COIN_MAX, runNo: 0, paid: ['1:main', '2:bonus'], firstClears: [1, 3], up: { power: 0, rate: 0, multi: 0 } });
  assert.deepEqual(normWallet(null), { coins: 0, runNo: 0, paid: [], firstClears: [], up: { power: 0, rate: 0, multi: 0 } });
  assert.equal(createSave3(memStorage({ [WALLET_KEY]: '{bad' })).wallet.get().coins, 0, '손상 → 기본값');
  const s = createSave3(memStorage());
  for (let i = 1; i <= 25; i++) s.wallet.pay({ id: i + ':main', amount: 1 });
  assert.equal(s.wallet.get().paid.length, PAID_KEEP); assert.equal(s.wallet.get().paid[0], '6:main');
  assert.equal(s.wallet.pay({ id: 'bad', amount: 5 }).paid, false, '식별자 형식이 아니면 지급하지 않는다');
  //  v3 키 형식은 그대로(지갑 칸이 v3 키에 섞이지 않는다) — 옛 코드가 v3 키를 통째로 다시 써도 지갑은 남는다
  const st = memStorage();
  const s2 = createSave3(st);
  s2.wallet.pay({ id: '1:main', amount: 40, firstClear: 1 });
  s2.patch({ mute: true });
  const v3 = JSON.parse(st.getItem(KEY3));
  assert.equal(v3.v, 3); assert.ok(!('coins' in v3) && !('wallet' in v3) && !('paid' in v3));
  st.setItem(KEY3, JSON.stringify({ v: 3, stages: {}, lastStage: 1, difficulty: 'brutal', volume: 1, mute: false }));   // 옛 코드 탭이 통째로 덮어씀
  assert.equal(createSave3(st).wallet.get().coins, 40);
});

// ═══════════════════════════════ UNLOCK — 순차 해금(N2) ═══════════════════════════════

test('UNLOCK: 해금 범위 = 1번부터 연속으로 이긴 판 + 1(순수) — 새 저장 1, 빈 판이 있으면 그 앞까지', () => {
  assert.equal(unlockedThrough(new Set()), 1);
  assert.equal(unlockedThrough([1, 2, 3]), 4);
  assert.equal(unlockedThrough([2, 3, 15]), 1, '1번이 없으면 1번만');
  assert.equal(unlockedThrough([1, 2, 4, 5]), 3, '빈 판(3) 앞까지');
  assert.equal(unlockedThrough(ALL_STAGE_IDS), 24, '24 넘어가지 않는다');
  assert.equal(unlockedThrough(['proto3', 1]), 2, '공개 판 번호만 센다');
});

test('UNLOCK: 옛 기록 연속 인정 — 모든 난이도·버전 칸의 cleared(보통·어려움·지옥·옛 코스 버전·구 형식) + 지갑 첫 클리어 표식, 중간 빈 판은 막는다', async () => {
  const stages = {
    1: { versions: { [stageVersion(1) + ':brutal']: { cleared: true } } },          // 지옥
    2: { versions: { [String(stageVersion(2))]: { cleared: true } } },               // 보통(접미 없음)
    3: { versions: { 1: { cleared: true, attempts: 1 } } },                            // 옛 코스 버전
    4: { cleared: true, attempts: 2 },                                                 // 구 형식(versions 없음 = 버전 1)
    5: { versions: { [stageVersion(5) + ':hard']: { attempts: 3 } } },                 // 도전만(클리어 없음) = 빈 판
    6: { versions: { [stageVersion(6) + ':brutal']: { cleared: true } } },            // 빈 판 뒤의 클리어 = 인정 안 됨
    proto3: { versions: { 1: { cleared: true } } },
  };
  const st = memStorage({ [KEY3]: JSON.stringify({ v: 3, stages, lastStage: 6 }) });
  const h = await bootApp({ storage: st });
  assert.equal(h.app.dbg().unlocked, 5, '1~4 연속 → 5 까지');
  h.app.startRun(5);
  assert.equal(h.app.getState(), 'run', '5 는 열림');
  h.app.toTitle();
  assert.equal(h.app.startRun(6), false, '6 은 cleared 여도 잠김(엄격)');
  assert.equal(h.app.getNotice(), LOCK_NOTICE);
  //  지갑의 v4 첫 클리어 표식도 이긴 판으로 센다(v3 키가 옛 코드 탭에 덮여도 진행이 남는다)
  const st2 = memStorage({ [WALLET_KEY]: JSON.stringify({ coins: 0, runNo: 3, paid: [], firstClears: [1, 2] }) });
  const h2 = await bootApp({ storage: st2 });
  assert.equal(h2.app.dbg().unlocked, 3);
});

test('UNLOCK: 네 진입 경로 모두 startRun 에서 거부 — 스테이지 버튼(자물쇠·흐린 버튼, 눌러도 무반응) · 타이틀 Enter · ?stage=N · 결과 [다음 작전]. ?dev=1 은 ?stage=N 의 그 판만 예외(개발용 판)', async () => {
  //  ① 스테이지 선택 화면: 새 저장 = 1번만 열림, 2~8 은 '잠김' + disabled(hitButton 이 건너뛴다)
  const h = await bootApp();
  const t = h.textNow();
  assert.equal(t.filter((x) => x === '잠김').length, 7, '첫 쪽 8칸 중 7칸 잠김: ' + JSON.stringify(t));
  const col = (i) => 60 + (i % 2) * 184 + 88, row = (i) => TITLE_GRID.y + Math.floor(i / 2) * TITLE_GRID.dy + TITLE_GRID.h / 2;
  h.tap(col(1), row(1));                      // 2번 칸
  assert.equal(h.app.getState(), 'title', '잠긴 버튼은 눌러도 출격하지 않는다');
  //  API 로 불러도 startRun 이 막는다 → 안내 + 스테이지 선택
  assert.equal(h.app.startRun(2), false);
  assert.equal(h.app.getState(), 'title'); assert.equal(h.app.getNotice(), LOCK_NOTICE);
  assert.ok(h.textNow().includes(LOCK_NOTICE), '안내 글');
  h.frames(200);
  assert.equal(h.app.getNotice(), null, '안내는 잠깐(2.5초)');
  //  ② 타이틀 Enter — 옛 저장의 마지막 출격 판이 잠긴 판이면 열린 마지막 판으로 낮춰 출격(잠긴 판으로는 가지 않는다).
  //   종전(537e731)엔 거부 + 안내였으나, 옛 기록을 가진 사용자가 Enter 를 누를 때마다 막히는 문제가 있어 보정
  const h2 = await bootApp({ storage: memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: {}, lastStage: 5 }) }) });
  h2.key('Enter');
  assert.equal(h2.app.getState(), 'run'); assert.equal(h2.app.getRun().stageId, 1, '잠긴 5 대신 열린 마지막 판 1');
  const h2b = await bootApp({ storage: memStorage({ [KEY3]: JSON.stringify({ v: 3, stages: { 1: { cleared: true }, 2: { cleared: true } }, lastStage: 9 }) }) });
  h2b.key('Enter');
  assert.equal(h2b.app.getRun().stageId, 3, '1·2 클리어 + 마지막 9(잠김) → 3');
  //  ③ ?stage=N(개발 확인용) — ?dev=1 없이는 거부
  const h3 = await bootApp({ search: '?stage=5' });
  h3.key('Enter');
  assert.equal(h3.app.getState(), 'title'); assert.equal(h3.app.getNotice(), LOCK_NOTICE);
  assert.equal(h3.save.getStage(5, stageVersion(5), 'brutal').attempts, 0, '거부된 출격은 도전 기록도 안 남긴다');
  //  ?stage=5&dev=1 — 그 판만 예외, 개발용 판(코인·클리어 기록 없음)
  const h4 = await bootApp({ search: '?stage=5&dev=1' });
  h4.key('Enter');
  assert.equal(h4.app.getState(), 'run'); assert.equal(h4.app.getRun().stageId, 5); assert.equal(h4.app.getRun().devWeapon, true);
  assert.equal(h4.app.startRun(6), false, 'dev 예외는 ?stage=N 의 그 판만');
  //  ④ 결과 [다음 작전]: dev 로 연 5번을 이긴 결과(규칙의 정상 승리 이벤트) → 6 은 잠겨 있어 거부
  h4.app.startRun(5);
  const run = h4.app.getRun();
  run.won = true; run.wonAt = run.time; run.over = true;
  run.events.push({ type: 'win', time: run.time, units: run.units.length, x: run.x, z: run.z });
  drive(h4, 'center', () => h4.app.getState() === 'result', 200);
  const r = h4.app.getResult();
  assert.equal(r.won, true); assert.equal(r.nextId, 6); assert.equal(r.coins.dev, true);
  assert.equal(h4.save.getStage(5, stageVersion(5), 'brutal').cleared, false, '개발용 판은 클리어를 쓰지 않는다');
  h4.key('Enter');                          // 승리 = [다음 작전] → 6 잠김
  assert.equal(h4.app.getState(), 'title'); assert.equal(h4.app.getNotice(), LOCK_NOTICE);
  //  열린 판의 [다음 작전]은 그대로 간다: 1번 승리 → 2번(연속 인정)
  const h5 = await bootApp();
  h5.app.startRun(1);
  drive(h5, 'evLead', () => h5.app.getState() === 'result', 20000, WIN);
  assert.equal(h5.app.getResult().nextId, 2);
  h5.tap(240, 548 + 28);                    // [다음 작전] 버튼
  assert.equal(h5.app.getState(), 'run'); assert.equal(h5.app.getRun().stageId, 2);
});

// ═══════════════════════════════ 결과 화면·HUD·순수성 ═══════════════════════════════

test('RESULT-ENTER: 결과 화면 Enter — 승리 = [다음 작전], 패배·포기 = [다시 도전](종전: 승패와 상관없이 재도전)', async () => {
  const h = await bootApp();
  h.app.startRun(1);
  drive(h, 'evLead', () => h.app.getState() === 'result', 20000, WIN);
  assert.equal(h.app.getResult().won, true);
  h.key('Enter');
  assert.equal(h.app.getRun().stageId, 2, '승리 Enter = 다음 작전');
  //  2번 패배(evLead) → Enter = 2번 다시
  drive(h, 'evLead', () => h.app.getState() === 'result', 20000);
  assert.equal(h.app.getResult().won, false);
  const runNo = wallet(h).runNo;
  h.key('Enter');
  assert.equal(h.app.getState(), 'run'); assert.equal(h.app.getRun().stageId, 2, '패배 Enter = 다시 도전');
  assert.equal(wallet(h).runNo, runNo + 1);
  //  24번 승리(다음 없음) = '모든 작전 완료' + Enter 는 다시 도전
  const h24 = await bootApp();
  seedOldClears(h24.save, 23);
  h24.app.startRun(24);
  const run = h24.app.getRun();
  run.won = true; run.wonAt = run.time; run.over = true;
  run.events.push({ type: 'win', time: run.time, units: run.units.length, x: run.x, z: run.z });
  drive(h24, 'center', () => h24.app.getState() === 'result', 200);
  const r = h24.app.getResult();
  assert.equal(r.nextId, null); assert.equal(r.allClear, ALL_CLEAR_LINE);
  const t = h24.textNow();
  assert.ok(t.includes(ALL_CLEAR_LINE) && !t.includes('다음 작전'), '모든 작전 완료 안내, [다음 작전] 없음');
  h24.key('Enter');
  assert.equal(h24.app.getRun().stageId, 24);
});

test('RESULT 3-9 글자·배치: 맨 위 제목(성공/실패/중단) → 획득 코인 +N → 내역(적·보스·첫 클리어/재클리어·보너스) → 보유 코인, 패배·포기는 원인 한 줄이 제안보다 먼저, 승리 제안 = advice.js 승리 문구', async () => {
  const h = await bootApp();
  h.app.startRun(1);
  drive(h, 'evLead', () => h.app.getState() === 'result', 20000, WIN);
  const r = h.app.getResult();
  assert.equal(r.advice, ADVICE_DEFAULT.won);
  assert.equal(r.coinLine, '적 15 · 보스 13 · 첫 클리어 26');
  h.texts.length = 0; h.frames(1);
  const y = (s) => { const o = h.texts.find((x) => x.text === s); assert.ok(o, '글자 ' + s + ': ' + h.texts.map((x) => x.text).slice(0, 12).join(' | ')); return o.y; };
  assert.ok(y('작전 성공!') < y('획득 코인 +54') && y('획득 코인 +54') < y(r.coinLine) && y(r.coinLine) < y('보유 코인 54') && y('보유 코인 54') < 212, '맨 위 순서');
  assert.equal(h.texts.find((x) => x.text === '획득 코인 +54').fill, C.gold);
  //  포기: 원인(인원 손실 + 놓친 통) → 제안
  const h2 = await bootApp();
  h2.app.startRun(1);
  drive(h2, 'center', () => h2.app.getRun().lossByTouch + h2.app.getRun().lossByShot > 0 && h2.app.getRun().kills > 0, 6000);
  h2.app.pause(); h2.app.giveUp();
  const r2 = h2.app.getResult();
  assert.equal(r2.causeLine, causeLine(h2.app.getRun()));
  assert.match(r2.causeLine, /^인원 손실 /);
  assert.match(r2.causeLine, /놓친 통 /);
  h2.texts.length = 0; h2.frames(1);
  const causeY = h2.texts.find((x) => r2.causeLine.startsWith(x.text) || x.text.startsWith('인원 손실'));
  assert.ok(causeY, '원인 줄을 그린다');
  if (r2.advice) {
    const adv = h2.texts.find((x) => r2.advice.startsWith(x.text.split(' ')[0]) && x.fill === C.gatePos);
    assert.ok(adv && adv.y > causeY.y, '제안은 원인 아래');
  }
  assert.ok(h2.texts.some((x) => x.text === '작전 중단' && x.fill === C.bulletHeavy), '작전 중단 제목(주황)');
  //  원인 한 줄 순수 함수: 0 인 손실은 빼고, 이름·숫자는 줄바꿈 없는 공백
  assert.equal(causeLine({ lossByGate: 3, lossByShot: 0, lossByShock: 1, lossByTouch: 2, missedSupplies: 1 }), '인원 손실 게이트 3 · 충격 1 · 접촉 2 · 놓친 통 1개');
  assert.equal(causeLine({}), '인원 손실 없음 · 놓친 통 없음');
  assert.equal(coinBreakdown({ enemy: 7, boss: 0, clear: 5, clearKind: 'replay', bonus: 20 }), '적 7 · 재클리어 5 · 보너스 20');
  assert.equal(coinBreakdown({ dev: true }), '개발용 판 — 코인 없음');
});

test('HUD 코인: 난이도 칩이 있던 자리(무기 칩 왼쪽)에 이번 판 누계 — 칩 셋이 같은 높이·중심선·간격, 적 처치 "+n" 없음, 보스 처치에만 "+코인"', async () => {
  //  렌더: hud.coins 가 숫자면 코인 칩(HUD_ROW.box.coin — x 194, w 64. r4.5 전 x 220)
  const run = createRun(buildStage(2, { difficulty: 'brutal' }));
  for (let i = 0; i < 60; i++) { stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); }
  const ops = [];
  const ctx = new Proxy({}, { get(t, k) { if (k in t) return t[k]; if (typeof k !== 'string') return undefined; return (...a) => { ops.push({ op: k, args: a, fill: t.fillStyle }); if (k === 'measureText') return { width: 10 }; if (k.startsWith('create')) return { addColorStop() {} }; return undefined; }; }, set(t, k, v) { t[k] = v; return true; } });
  const fxLike = { parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null, lotOpen: 0, lotSeen: false, lotSame: false };
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: fxLike, hud: { distM: 100, coins: 12 }, buttons: [{ ...HUD_BTN }], saveOk: true });
  const chips = [];
  const arcs = ops.filter((o) => o.op === 'arcTo' && o.fill === 'rgba(20,35,58,0.82)').map((o) => o.args);
  for (let i = 0; i + 3 < arcs.length; i += 4) chips.push({ left: arcs[i + 2][0], top: arcs[i][1], right: arcs[i][0], bottom: arcs[i][3] });
  chips.sort((a, b) => a.left - b.left);
  assert.equal(chips.length, 3, '코인·무기·⏸ 칩 셋');
  const cb = HUD_ROW.box.coin;
  assert.deepEqual(chips[0], { left: cb.x, top: cb.y, right: cb.x + cb.w, bottom: cb.y + cb.h });
  //  r4.5 재기준: 무기 칩이 'Mk II' 표기를 한 줄로 넣으려 122 → 148 로 넓어져 코인 칩은 그만큼 왼쪽(220 → 194). 무기 칩과는 간격 gap 그대로(겹치지 않는다)
  assert.equal(cb.x, 194, '무기 칩 왼쪽 같은 간격(종전 난이도 칩 자리 220 에서 무기 칩이 넓어진 만큼)');
  assert.equal(chips[1].left - chips[0].right, HUD_ROW.gap); assert.equal(chips[0].top, chips[1].top); assert.equal(chips[0].bottom, chips[2].bottom);
  const num = ops.find((o) => o.op === 'fillText' && o.args[0] === '12');
  assert.ok(num && num.fill === C.gold && num.args[2] === HUD_ROW.cy, '코인 숫자(금색, 칩 중심선)');
  //  셸: 출격 중 HUD 에 누계, 일반 적 처치에는 '+n' 글자가 없고 보스 처치 때만 '+13 코인'
  const h = await bootApp();
  h.app.startRun(1);
  const seen = new Set();
  let n = 0;
  while (h.app.getState() === 'run' && n++ < 20000) {
    const r = h.app.getRun();
    weakenBosses(r);   // r4.7: 보스 처치 글을 보려면 이겨야 한다(보스 체력 바닥 — 난이도와 무관한 검사 도구)
    h.app.input.state.pointerX = pickInput('evLead', r).pointerX;
    h.texts.length = 0; h.frames(1);
    for (const x of h.texts) seen.add(x.text);
  }
  assert.ok(seen.has('+13 코인'), '보스 처치 "+13 코인"(V(1) × 0.5)');
  //  코인 글자는 보스 처치의 그 하나뿐(일반 적 처치마다 '+n 코인' 을 띄우지 않는다 — '+n' 숫자 글자는 게이트·발판 연출의 것)
  assert.deepEqual([...seen].filter((s) => /코인$/.test(s)), ['+13 코인'], '코인 글자 = 보스 처치뿐');
  assert.ok(seen.has('28'), 'HUD 누계가 정산 전 값(28 = 15 + 13)까지 올라간다');
});

test('V3-PURE-COIN: 규칙 모듈은 코인·저장을 모른다 — combat/gates/supply/squad/weapons/bonus/advice/motion/stages/courses/balance 에 save·coins import·localStorage·wallet 없음, coins.js 는 순수(난수·시계·저장·화면 없음)', () => {
  const read = (f) => readFileSync(new URL('../rush3/' + f, import.meta.url), 'utf8');
  for (const f of ['combat.js', 'gates.js', 'supply.js', 'squad.js', 'weapons.js', 'bonus.js', 'advice.js', 'motion.js', 'stages.js', 'courses.js', 'balance.js']) {
    const code = read(f).replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(code, /from\s*['"][^'"]*(save|coins|main|render)\.js['"]/, f + ': 셸·저장·코인 import');
    assert.ok(!/localStorage|wallet|createSave3/.test(code), f + ': 저장 접근');
  }
  const coins = read('coins.js');
  const code = coins.replace(/\/\/.*$/gm, '');
  assert.ok(!/Math\.random|Date\.|performance\.|localStorage|\brng\b/.test(code), 'coins.js 는 난수·시계·저장이 없다');
  assert.ok(!/^import /m.test(coins), 'coins.js 는 아무것도 import 하지 않는다');
  //  DIFF-6 규약 유지: combat.js 의 stepRun 이후에 BAL3.enemies·EN[·EN.·difficult 가 없다(kill 이벤트 칸 추가 뒤에도)
  const combat = read('combat.js');
  const tail = combat.slice(combat.indexOf('export function stepRun'));
  for (const s of ['BAL3.enemies', 'EN[', 'EN.', 'difficult']) assert.ok(!tail.includes(s), 'DIFF-6: ' + s);
});

//  r4.5 보정: 출격 직후 [작전 중단] — 첫 플레이 안내 배너가 결과 화면 밑으로 비치지 않는다(캡처 06·09 에서 '최고 병력' 줄과 겹쳤음)
test('RESULT-NO-BANNER: 출격 직후 포기해도 결과 화면엔 첫 플레이 안내 배너를 그리지 않는다(출격 중에는 그린다)', async () => {
  const GUIDE = '좌우로 드래그 · 쏴서 숫자를 키우세요';
  const h = await bootApp();
  h.app.startRun(1);
  h.frames(10);
  assert.ok(h.textNow().includes(GUIDE), '출격 직후엔 안내 배너가 보인다(검사 전제)');
  h.app.giveUp();
  assert.equal(h.app.getState(), 'result');
  const t = h.textNow();
  assert.ok(t.includes('작전 중단'), '포기 결과 화면: ' + JSON.stringify(t.slice(0, 6)));
  assert.ok(!t.includes(GUIDE), '결과 화면 밑으로 안내 배너가 그려지면 안 된다');
});
