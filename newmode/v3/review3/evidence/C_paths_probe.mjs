// C_paths_probe.mjs — 검토 4번(자유 진입·순차 해금)·9번(코인 중복 정산) 증거 수집용 측정 스크립트.
//  읽기 전용: rush3/·tests/ 는 import 만 한다(수정 없음). 결과는 같은 폴더의 C_paths_result.json 에 쓴다.
//  셸(main.js boot)을 tests/rush3-bonus.test.mjs L334-371 의 bootFake 와 같은 방식으로 Node 에서 띄우고,
//  저장소(setItem)를 감싸 "어느 함수가(스택) 언제 무엇을 몇 번 썼는지" 기록한다.
//  봇 = tests/lib/rush3-policies.mjs 의 pickX(정해진 입력). 결과는 봇 한 판 결과이지 사람의 성공률이 아니다.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { boot } from '../../../../rush3/main.js';
import { createSave3, KEY3, BAK3, recordKey } from '../../../../rush3/save.js';
import { ALL_STAGE_IDS, stageVersion } from '../../../../rush3/stages.js';
import { pickX } from '../../../../tests/lib/rush3-policies.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const out = { generatedAt: new Date().toISOString(), node: process.version, note: '봇 결과는 정해진 입력으로 한 판씩 돌린 결과이며 사람의 성공률이 아니다', paths: {}, save: {}, unlock: {} };

// ── 저장소 감시: setItem 마다 { seq, key, fns(main.js/save.js 호출 함수), changed(바뀐 경로) } 기록 ─────────────
function flatten(o, pre = '', acc = {}) {
  if (o && typeof o === 'object' && !Array.isArray(o)) { for (const [k, v] of Object.entries(o)) flatten(v, pre ? pre + '.' + k : k, acc); }
  else acc[pre] = o;
  return acc;
}
function diffPaths(a, b) {
  const fa = flatten(a ?? {}), fb = flatten(b ?? {});
  const ks = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  const ch = [];
  for (const k of ks) if (JSON.stringify(fa[k]) !== JSON.stringify(fb[k])) ch.push(k + ': ' + JSON.stringify(fa[k]) + ' → ' + JSON.stringify(fb[k]));
  return ch;
}
function callerFns(stack) {
  //  rush3/main.js·save.js 프레임의 함수 이름만(가까운 것부터)
  return stack.split('\n').slice(2)
    .filter((l) => /rush3[\\/](main|save)\.js/.test(l))
    .map((l) => { const m = /at (?:Object\.)?([\w$.<>]+) \(/.exec(l); const f = /rush3[\\/](main|save)\.js:(\d+)/.exec(l); return (m ? m[1] : '(anon)') + '@' + (f ? f[1] + ':' + f[2] : '?'); });
}
function watchedStorage(init = {}, { failSet = () => false } = {}) {
  const m = new Map(Object.entries(init));
  const log = [];
  let seq = 0;
  const st = {
    m, log,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => {
      if (failSet(k, v)) { log.push({ seq: ++seq, key: k, failed: true, fns: callerFns(new Error().stack) }); throw new Error('QuotaExceededError(모의)'); }
      const prev = m.has(k) ? JSON.parse(m.get(k)) : null;
      m.set(k, String(v));
      let next = null; try { next = JSON.parse(v); } catch { /* bak 원문 */ }
      log.push({ seq: ++seq, key: k, fns: callerFns(new Error().stack).map((s) => s.replace(/@.*$/, '')).filter((f, i, a) => a.indexOf(f) === i), changed: next ? diffPaths(prev, next) : ['(raw)'] });
    },
  };
  return st;
}

// ── 셸 하네스(tests/rush3-bonus.test.mjs L334-371 과 같은 꼴 + pointerdown 청취기 포획) ─────────────────────
function fakeCanvas(texts, listeners) {
  const grad = { addColorStop() {} };
  const ctx = new Proxy({ canvas: null }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => { if (k === 'fillText') texts.push(String(args[0])); if (k.startsWith('create')) return grad; if (k === 'measureText') return { width: 10 }; return undefined; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { width: 480, height: 800, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }), addEventListener(type, fn) { (listeners[type] ??= []).push(fn); } };
}
function fakeAudio() { return { unlock() {}, sfx() { return true; }, bgmPlay() {}, bgmPause() {}, bgmResume() {}, setVolume() {}, getVolume() { return 1; }, setMuted() {}, isMuted() { return false; }, duck() {} }; }
async function bootFake(storage, search = null) {
  const queue = [];
  let nowMs = 1000;
  const texts = [], listeners = {}, winL = {};
  //  search 를 주면 가짜 window(location.search + 청취기 포획) — ?stage=·?weapon= 경로와 키보드(Enter) 경로 확인용
  const win = search === null ? null : { location: { search }, devicePixelRatio: 1, addEventListener(type, fn) { (winL[type] ??= []).push(fn); } };
  const save = createSave3(storage);
  const app = boot(fakeCanvas(texts, listeners), { win, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save, audio: fakeAudio(), sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  const frames = (n) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  //  논리 좌표(480×800) → client(240×400 사각형이므로 /2)
  const tap = (lx, ly) => { for (const fn of listeners.pointerdown ?? []) fn({ clientX: lx / 2, clientY: ly / 2, pointerType: 'mouse', pointerId: 1 }); };
  const key = (code) => { for (const fn of winL.keydown ?? []) fn({ code, key: code, repeat: false, preventDefault() {} }); };
  return { app, frames, save, storage, texts, tap, key };
}
function driveUntil(h, policy, cond, max = 6000) {
  let n = 0;
  while (!cond() && n < max) {
    const run = h.app.getRun();
    if (run) h.app.input.state.pointerX = typeof policy === 'number' ? policy : pickX(policy, run);
    h.frames(1);
    n++;
  }
  return n;
}
const mark = (h) => h.storage.log.length;
const since = (h, m0) => h.storage.log.slice(m0).map(({ seq, fns, changed, failed }) => ({ seq, fns, changed, ...(failed ? { failed } : {}) }));
const rec = (h, id, diff) => h.save.getStage(id, stageVersion(id), diff);

// ── P1 출격(startRun) 한 번의 쓰기 ────────────────────────────────────────────────────────────────────
{
  const h = await bootFake(watchedStorage());
  h.app.setDifficulty('normal');
  const m0 = mark(h);
  h.app.startRun(1);
  out.paths.P1_startRun = { desc: 'startRun(1) 직후(첫 STEP 전)', writes: since(h, m0), state: h.app.getState() };
}

// ── P2 승리(보너스 없는 판: 1번 보통, planBoss) → 여운 1.3초 → 결과 ────────────────────────────────────
{
  const h = await bootFake(watchedStorage());
  h.app.setDifficulty('normal');
  h.app.startRun(1);
  const m0 = mark(h);
  const n1 = driveUntil(h, 'planBoss', () => h.app.getRun().won, 20000);
  const run = h.app.getRun();
  const atWin = { won: run.won, over: run.over, state: h.app.getState(), frames: n1, mainRecord: run.mainRecord ?? null, writes: since(h, m0) };
  const m1 = mark(h);
  const n2 = driveUntil(h, 'planBoss', () => h.app.getState() === 'result', 600);
  out.paths.P2_win_noBonus = { desc: '1번 보통 planBoss 봇 1판: 승리 프레임 → 결과 화면', atWinFrame: atWin, overDelayToResult: { frames: n2, state: h.app.getState(), writes: since(h, m1) }, record: rec(h, 1, 'normal'),
    storageHasRunMarker: /mainRecord|payout|paid/.test(h.storage.m.get(KEY3)) };
  // P7 결과 화면 버튼 연타: 같은 프레임 안에서 [다시 도전] 두 번
  const before = rec(h, 1, 'normal').attempts;
  const m2 = mark(h);
  h.tap(240, 508); h.tap(240, 508);
  const afterTap = { attemptsBefore: before, attemptsAfter: rec(h, 1, 'normal').attempts, state: h.app.getState(), writes: since(h, m2) };
  //  다음 프레임 뒤 같은 자리를 또 눌러도(이제 출격 화면) 출격이 새로 시작되지 않는지
  h.frames(1);
  const m3 = mark(h);
  const runObj = h.app.getRun();
  h.tap(240, 508);
  afterTap.afterNextFrameTap = { sameRun: h.app.getRun() === runObj, attempts: rec(h, 1, 'normal').attempts, writes: since(h, m3), state: h.app.getState() };
  out.paths.P7_result_retry_doubleTap = afterTap;
}

// ── P3 승리 + 보너스전(8번 보통) → 보너스 종료 → 결과 ─────────────────────────────────────────────────
{
  const h = await bootFake(watchedStorage());
  h.app.setDifficulty('normal');
  h.app.startRun(8);
  h.frames(1);
  const m0 = mark(h);
  const n1 = driveUntil(h, 'planBoss', () => h.app.getRun().phase === 'bonus', 20000);
  const run = h.app.getRun();
  const atWin = { phase: run.phase, won: run.won, over: run.over, state: h.app.getState(), frames: n1, writes: since(h, m0), recordAtWin: rec(h, 8, 'normal') };
  const m1 = mark(h);
  const n2 = driveUntil(h, 'planBoss', () => h.app.getState() === 'result', 3000);
  out.paths.P3_win_bonus8 = { desc: '8번 보통 planBoss 봇 1판: 승리 프레임(보너스 진입) → 20초 보너스 → 결과', stageVersion8: stageVersion(8), atWinFrame: atWin,
    bonusToResult: { frames: n2, state: h.app.getState(), bonusScore: h.app.getRun().bonus?.score, writes: since(h, m1) }, record: rec(h, 8, 'normal') };
}

// ── P4 8번 승리 → 보너스 3초 → ⏸ → [스테이지 선택](toTitle) ────────────────────────────────────────────
{
  const h = await bootFake(watchedStorage());
  h.app.setDifficulty('normal');
  h.app.startRun(8);
  h.frames(1);
  driveUntil(h, 'planBoss', () => h.app.getRun().phase === 'bonus', 20000);
  driveUntil(h, 'planBoss', () => h.app.getRun().bonus.t >= 3, 600);
  const score = h.app.getRun().bonus.score;
  const m0 = mark(h);
  h.app.pause();
  h.app.toTitle();
  out.paths.P4_bonus_giveup = { desc: '8번: 보너스 3초 진행 중 ⏸→toTitle', bonusScoreAtLeave: score, writes: since(h, m0), state: h.app.getState(), record: rec(h, 8, 'normal') };
  //  P9a 새로고침 모의: 같은 저장소로 새 createSave3 → 보너스 점수 흔적 없음
  const fresh = createSave3(h.storage);
  out.paths.P4_bonus_giveup.afterReloadRecord = fresh.getStage(8, stageVersion(8), 'normal');
}

// ── P5 패배 → 결과(finishRun 이 패배에도 쓰는가) ────────────────────────────────────────────────────────
async function findLoss() {
  for (const [id, diff, pol] of [[1, 'brutal', 'center'], [1, 'brutal', 'left'], [2, 'brutal', 'evLead'], [2, 'brutal', 'center']]) {
    const h = await bootFake(watchedStorage());
    h.app.setDifficulty(diff);
    h.app.startRun(id);
    driveUntil(h, pol, () => h.app.getRun().over, 20000);
    if (h.app.getRun().over && !h.app.getRun().won) return { id, diff, pol };
  }
  return null;
}
const lossCase = await findLoss();
out.paths.lossCaseUsed = lossCase;
if (lossCase) {
  const { id, diff, pol } = lossCase;
  {
    const h = await bootFake(watchedStorage());
    h.app.setDifficulty(diff);
    h.app.startRun(id);
    const m0 = mark(h);
    const n1 = driveUntil(h, pol, () => h.app.getRun().over, 20000);
    const atOver = { frames: n1, won: h.app.getRun().won, writes: since(h, m0) };
    const m1 = mark(h);
    driveUntil(h, pol, () => h.app.getState() === 'result', 600);
    out.paths.P5_loss_result = { desc: `${id}번 ${diff} '${pol}' 봇 1판 패배 → 결과`, atLoseFrame: atOver, overDelayToResult: { state: h.app.getState(), writes: since(h, m1) }, record: rec(h, id, diff) };
  }
  {
    //  P5b 패배 확정 뒤 여운(1.0초) 안에 ⏸→toTitle: finishRun 을 거치지 않는다
    const h = await bootFake(watchedStorage());
    h.app.setDifficulty(diff);
    h.app.startRun(id);
    driveUntil(h, pol, () => h.app.getRun().over, 20000);
    const stateAtOver = h.app.getState();
    const m0 = mark(h);
    h.app.pause();
    const pausedState = h.app.getState();
    h.app.toTitle();
    out.paths.P5b_loss_overDelay_giveup = { desc: '패배 확정(over) 직후 여운 1.0초 안에 ⏸→toTitle', stateAtOver, pausedState, writes: since(h, m0), finalState: h.app.getState() };
  }
}

// ── P5c 승리(보너스 없는 판) 확정 뒤 여운 1.3초 안에 ⏸→toTitle ─────────────────────────────────────────
{
  const h = await bootFake(watchedStorage());
  h.app.setDifficulty('normal');
  h.app.startRun(1);
  driveUntil(h, 'planBoss', () => h.app.getRun().won, 20000);
  const m0 = mark(h);
  const st = h.app.getState(), over = h.app.getRun().over;
  h.app.pause(); h.app.toTitle();
  out.paths.P5c_win_overDelay_giveup = { desc: '1번 승리 프레임 직후(over=true, 여운 중) ⏸→toTitle', stateBefore: st, runOver: over, writes: since(h, m0), record: rec(h, 1, 'normal'), finalState: h.app.getState() };
}

// ── P6 출격 중(승패 전) ⏸→[스테이지 선택] ────────────────────────────────────────────────────────────
{
  const h = await bootFake(watchedStorage());
  h.app.setDifficulty('normal');
  h.app.startRun(3);
  driveUntil(h, 'planBoss', () => h.app.getRun().kills >= 3 || h.app.getRun().over, 12000);
  const kills = h.app.getRun().kills, tAt = Math.round(h.app.getRun().time * 10) / 10;
  const m0 = mark(h);
  h.app.pause(); h.app.toTitle();
  out.paths.P6_midrun_giveup = { desc: '3번 보통 planBoss 봇, 처치 ' + kills + ' 시점(' + tAt + '초)에 ⏸→toTitle', killsAtLeave: kills, writes: since(h, m0), record: rec(h, 3, 'normal') };
  //  P9b 새로고침 모의(출격 중): 새 createSave3 로 다시 읽기
  const h2 = await bootFake(watchedStorage());
  h2.app.setDifficulty('normal');
  h2.app.startRun(3);
  driveUntil(h2, 'planBoss', () => h2.app.getRun().kills >= 3 || h2.app.getRun().over, 12000);
  const fresh = createSave3(h2.storage);
  out.paths.P9_reload_midrun = { desc: '3번 처치 3 이후 출격 중 새로고침 모의(같은 저장소로 새 createSave3)', killsInMemory: h2.app.getRun().kills, persistedRecord: fresh.getStage(3, stageVersion(3), 'normal'), writesTotal: h2.storage.log.length };
}

// ── P8 개발용 판(proto3 = devWeapon) ─────────────────────────────────────────────────────────────────
{
  const h = await bootFake(watchedStorage());
  const m0 = mark(h);
  h.app.startRun('proto3');
  const dev = h.app.getRun().devWeapon;
  const w0 = since(h, m0);
  const n = driveUntil(h, 'planBoss', () => h.app.getState() === 'result', 20000);
  const m1 = mark(h);
  out.paths.P8_devWeapon_proto3 = { desc: "startRun('proto3') — devWeapon 판", devWeapon: dev, startWrites: w0, reachedResult: h.app.getState() === 'result', frames: n,
    won: h.app.getRun()?.won ?? null, laterWrites: h.storage.log.slice(w0.length + m0).map(({ seq, fns, changed }) => ({ seq, fns, changed })),
    persistedStagesKeys: Object.keys(JSON.parse(h.storage.m.get(KEY3)).stages), persistedLastStage: JSON.parse(h.storage.m.get(KEY3)).lastStage };
}

// ── P8b 개발용 시작 무기(?weapon=scatter&mk=2) + 실제 스테이지 5 ─────────────────────────────────────────
{
  const h = await bootFake(watchedStorage(), '?weapon=scatter&mk=2');
  const m0 = mark(h);
  h.app.startRun(5);
  out.paths.P8b_devWeapon_realStage = { desc: '?weapon=scatter&mk=2 로 5번 출격(devWeapon)', devWeapon: h.app.getRun().devWeapon, weapon: h.app.getRun().weapon, writes: since(h, m0), record5: h.save.getStage(5, stageVersion(5), 'brutal') };
}

// ── P10 자유 진입(화면 버튼): 새 저장에서 8번·24번 버튼을 바로 누른다 ──────────────────────────────────────
{
  const h = await bootFake(watchedStorage());
  h.frames(1);
  h.tap(332, 653);                     // 1쪽 오른쪽 넷째 칸 = 8번(TITLE_GRID y446 + 3×60, x 60+184)
  const s8 = h.app.getRun()?.stageId ?? null;
  const h2 = await bootFake(watchedStorage());
  h2.frames(1); h2.tap(370, 714); h2.frames(1); h2.tap(370, 714); h2.frames(1);   // [다음 ▶] 두 번 → 3쪽(17~24)
  h2.tap(332, 653);                    // 3쪽 오른쪽 넷째 칸 = 24번
  out.paths.P10_freeEntry_buttons = { desc: '클리어 기록이 전혀 없는 새 저장에서 스테이지 버튼 누름', stage8_started: s8, stage24_started: h2.app.getRun()?.stageId ?? null, state24: h2.app.getState(), titleTextsHaveLockWord: h2.texts.some((t) => /잠|🔒|lock/i.test(t)) };
}

// ── P11 자유 진입(주소 ?stage=24 + Enter) · P7b 결과 화면 Enter 두 번 + 탭 한 번(같은 프레임) ─────────────────
{
  const h = await bootFake(watchedStorage(), '?stage=24');
  h.frames(1);
  h.key('Enter');
  out.paths.P11_freeEntry_urlEnter = { desc: '새 저장 + 주소 ?stage=24 에서 타이틀 Enter', started: h.app.getRun()?.stageId ?? null, devWeapon: h.app.getRun()?.devWeapon, writes: h.storage.log.map(({ fns, changed }) => ({ fns, changed })) };
}
{
  const h = await bootFake(watchedStorage(), '');
  h.app.setDifficulty('normal');
  h.app.startRun(1);
  driveUntil(h, 'planBoss', () => h.app.getState() === 'result', 20000);
  const a0 = rec(h, 1, 'normal').attempts;
  const m0 = mark(h);
  h.key('Enter'); h.key('Enter'); h.tap(240, 508);
  out.paths.P7b_result_enter_enter_tap = { desc: '결과 화면에서 같은 프레임에 Enter·Enter·[다시 도전] 탭', attemptsBefore: a0, attemptsAfter: rec(h, 1, 'normal').attempts, state: h.app.getState(), writes: since(h, m0).length };
}

// ── S1 복수 탭: 같은 저장소에 createSave3 두 개 ────────────────────────────────────────────────────────
{
  const st = watchedStorage();
  const A = createSave3(st), B = createSave3(st);
  A.updateStage(5, { cleared: true, bestSurvivors: 30, bestTime: 90 }, stageVersion(5), 'brutal');
  const afterA = JSON.parse(st.m.get(KEY3));
  const Bsees = B.getStage(5, stageVersion(5), 'brutal');
  B.patch({ volume: 0.4 });
  const afterB = JSON.parse(st.m.get(KEY3));
  const reread = createSave3(st).getStage(5, stageVersion(5), 'brutal');
  out.save.S1_multiTab = { desc: '탭 A 가 5번 지옥 클리어를 쓴 뒤, 먼저 열려 있던 탭 B 가 음량만 바꿈',
    A_wrote_stage5: !!afterA.stages['5'], B_inMemory_sees_A: Bsees.cleared, afterB_stage5_present: !!afterB.stages['5'], afterB_volume: afterB.volume, reloadedStage5: reread };
}

// ── S2 쓰기 실패(setItem throw) → ok=false, 메모리는 갱신 → 저장소 회복 뒤 다음 쓰기에 통째로 반영 ─────────
{
  let fail = true;
  const st = watchedStorage({}, { failSet: (k) => fail && k === KEY3 });
  const s = createSave3(st);
  const r = s.updateStage(2, { cleared: true, bestSurvivors: 12, bestTime: 70 }, stageVersion(2), 'brutal');
  const inMem = s.getStage(2, stageVersion(2), 'brutal');
  const persisted1 = st.m.get(KEY3) ?? null;
  const ok1 = s.ok;
  fail = false;
  s.patch({ mute: true });
  const persisted2 = JSON.parse(st.m.get(KEY3));
  out.save.S2_writeFail = { desc: 'setItem 이 던지는 동안 updateStage → 이후 저장소 회복 뒤 patch({mute})', updateStageReturn: r, inMemory: inMem, persistedDuringFailure: persisted1, okAfterFailure: ok1,
    okAfterRecovery: s.ok, persistedAfterRecovery_stage2: persisted2.stages['2'] ?? null, log: st.log.map(({ seq, failed, fns }) => ({ seq, failed: !!failed, fns })) };
}

// ── S3 localStorage 접근 자체가 막힌 환경(주입 없음) → store=null → 메모리 Map, ok 는 true 인가 ────────────────
{
  const desc0 = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let res;
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError(모의)'); } });
    const s = createSave3();
    s.updateStage(1, { cleared: true }, stageVersion(1), 'brutal');
    res = { ok: s.ok, inMemoryCleared: s.getStage(1, stageVersion(1), 'brutal').cleared, persistedAnywhere: false, note: '저장소가 없어 메모리 Map 에만 있다(새로고침하면 사라짐)' };
  } catch (e) { res = { error: String(e) }; }
  finally { if (desc0) Object.defineProperty(globalThis, 'localStorage', desc0); else delete globalThis.localStorage; }
  out.save.S3_noLocalStorage = res;
}

// ── S4 쓰기 1회 = setItem 1회(단일 키 전체 JSON) 확인 ────────────────────────────────────────────────────
{
  const st = watchedStorage();
  const s = createSave3(st);
  s.patch({ volume: 0.5, mute: true, stages: { 4: { versions: { [recordKey(stageVersion(4), 'brutal')]: { attempts: 3 } } } } });
  out.save.S4_singleBlob = { desc: 'patch 한 번에 최상위 2칸 + 기록 1칸', setItemCalls: st.log.length, keys: [...st.m.keys()], changed: st.log[0]?.changed };
  //  모르는 최상위 칸(coins)을 patch 하면 normalize 가 버리는가(현 코드 기준)
  s.patch({ coins: 100 });
  out.save.S4_unknownField = { desc: "현 코드에서 patch({coins:100})", persistedHasCoins: 'coins' in JSON.parse(st.m.get(KEY3)), inMemoryHasCoins: 'coins' in s.get() };
}

// ── U 순차 해금 계산 가능성: 스테이지별 현재 코스 버전 + 합성 저장에서 판별 ─────────────────────────────
{
  out.unlock.currentVersions = Object.fromEntries(ALL_STAGE_IDS.map((id) => [id, stageVersion(id)]));
  out.unlock.currentKeys = Object.fromEntries(ALL_STAGE_IDS.map((id) => [id, { normal: recordKey(stageVersion(id), 'normal'), hard: recordKey(stageVersion(id), 'hard'), brutal: recordKey(stageVersion(id), 'brutal') }]));
  //  합성 저장(가상의 기존 이용자): 1번은 지옥 현재 버전 클리어, 2번은 보통 현재 버전 클리어, 3번은 도전만,
  //  8번은 옛 버전(1)에서만 클리어, 15번은 자유 진입으로 건너뛰어 지옥 클리어, 구 형식(versions 없음) 4번 클리어
  const v = (id) => stageVersion(id);
  const synth = { v: 3, lastStage: 15, difficulty: 'brutal', stages: {
    1: { versions: { [recordKey(v(1), 'brutal')]: { cleared: true, attempts: 4, bestSurvivors: 20, bestTime: 80 } } },
    2: { versions: { [recordKey(v(2), 'normal')]: { cleared: true, attempts: 2, bestSurvivors: 10, bestTime: 60 }, [recordKey(v(2), 'brutal')]: { cleared: false, attempts: 5 } } },
    3: { versions: { [recordKey(v(3), 'brutal')]: { cleared: false, attempts: 7 } } },
    4: { cleared: true, attempts: 1, bestSurvivors: 9, bestTime: 50 },
    8: { versions: { 1: { cleared: true, attempts: 1, bestSurvivors: 5, bestTime: 40 } } },
    15: { versions: { [recordKey(v(15), 'brutal')]: { cleared: true, attempts: 1, bestSurvivors: 3, bestTime: 200 } } },
    proto3: { versions: { 1: { attempts: 2 } } },
  } };
  const s = createSave3(watchedStorage({ [KEY3]: JSON.stringify(synth) }));
  const per = {};
  for (const id of ALL_STAGE_IDS) {
    const all = s.getStageVersions(id);
    const keys = Object.keys(all);
    per[id] = {
      keys,
      clearedAnySlot: keys.some((k) => all[k].cleared === true),
      clearedBrutalAnyVersion: keys.some((k) => k.endsWith(':brutal') && all[k].cleared === true),
      clearedCurrentVersionBrutal: s.getStage(id, v(id), 'brutal').cleared,
      attemptsAnySlot: keys.reduce((n, k) => n + (all[k].attempts || 0), 0),
    };
  }
  const ids = ALL_STAGE_IDS;
  const contiguous = (pred) => { let n = 0; for (const id of ids) { if (pred(id)) n = id; else break; } return n; };
  const maxOf = (pred) => ids.filter(pred).reduce((a, b) => Math.max(a, b), 0);
  out.unlock.synthetic = {
    desc: '가상의 기존 저장(실사용자 저장 아님)으로 판별 규칙별 결과가 달라지는지 확인',
    perStage: Object.fromEntries(Object.entries(per).filter(([, r]) => r.keys.length)),
    rules: {
      'A 모든 칸 cleared — 1번부터 연속 클리어 끝': contiguous((id) => per[id].clearedAnySlot),
      'B 모든 칸 cleared — 최고 번호': maxOf((id) => per[id].clearedAnySlot),
      'C 지옥 칸만(옛 버전 포함) — 1번부터 연속': contiguous((id) => per[id].clearedBrutalAnyVersion),
      'D 지옥 칸만(옛 버전 포함) — 최고 번호': maxOf((id) => per[id].clearedBrutalAnyVersion),
      'E 지옥·현재 버전만 — 1번부터 연속': contiguous((id) => per[id].clearedCurrentVersionBrutal),
    },
    nonNumericStageKeysKept: Object.keys(s.get().stages).filter((k) => !ALL_STAGE_IDS.includes(Number(k))),
    lastStage: s.get().lastStage,
    hasAnyTimestampField: /time|date|at"/i.test(JSON.stringify(Object.keys(flatten(s.get()))).replace(/bestTime/g, '')),
  };
  //  신규 저장: 빈 저장소
  const fresh = createSave3(watchedStorage());
  out.unlock.newSave = { stages: fresh.get().stages, lastStage: fresh.get().lastStage, difficulty: fresh.get().difficulty, writesOnLoad: 0 };
  //  손상 저장: .bak 보존 후 기본값 → 신규와 구분 불가
  const bad = watchedStorage({ [KEY3]: '{not json' });
  const sb = createSave3(bad);
  out.unlock.corruptSave = { stagesAfterLoad: sb.get().stages, bakKept: bad.m.get(BAK3) };
}

writeFileSync(join(HERE, 'C_paths_result.json'), JSON.stringify(out, null, 2));
//  콘솔 요약
const brief = (p) => (p?.writes ?? []).map((w) => w.fns.join('<') + ' {' + w.changed.join(' ; ') + '}');
console.log(JSON.stringify({
  P1: brief(out.paths.P1_startRun),
  P2win: brief(out.paths.P2_win_noBonus?.atWinFrame), P2finish: brief(out.paths.P2_win_noBonus?.overDelayToResult),
  P3win: brief(out.paths.P3_win_bonus8?.atWinFrame), P3finish: brief(out.paths.P3_win_bonus8?.bonusToResult),
  P4: out.paths.P4_bonus_giveup?.writes?.length, P5: out.paths.lossCaseUsed, P5finish: brief(out.paths.P5_loss_result?.overDelayToResult), P5b: out.paths.P5b_loss_overDelay_giveup?.writes?.length,
  P5c: out.paths.P5c_win_overDelay_giveup?.writes?.length, P6: out.paths.P6_midrun_giveup?.writes?.length, P7: out.paths.P7_result_retry_doubleTap,
  P8: { dev: out.paths.P8_devWeapon_proto3?.devWeapon, start: brief({ writes: out.paths.P8_devWeapon_proto3?.startWrites }), later: out.paths.P8_devWeapon_proto3?.laterWrites?.length, keys: out.paths.P8_devWeapon_proto3?.persistedStagesKeys },
  S1: out.save.S1_multiTab, S2: { ok1: out.save.S2_writeFail.okAfterFailure, p1: out.save.S2_writeFail.persistedDuringFailure, p2: out.save.S2_writeFail.persistedAfterRecovery_stage2 }, S3: out.save.S3_noLocalStorage, S4: out.save.S4_singleBlob.setItemCalls, S4u: out.save.S4_unknownField,
  U: out.unlock.synthetic.rules,
}, null, 1));
