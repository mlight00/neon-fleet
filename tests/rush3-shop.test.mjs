// rush3-shop — r4.5(v4 ⑤단계) 화면: 타이틀 [로봇 강화] · 강화 화면 · 결과 화면 보조 버튼 · 첫 구매 안내 · 로봇 탄 테.
//  이사님 결정(기획 v4.1 0장 인용 블록): D1 = (다) 메인 로봇 전용 무기 3트랙 · N3 = (나) 추가 탄은 게이트·증원 설비에 무효 · N1 = (나) 원안 순서(⑤ = 화면).
//  근거 = 기획 v4.1 3-4 (가)(나)(상점 미리보기·첫 구매 주 가설 = 다연발 1·'추천' 한 번) · 3-9(결과 화면: 로봇 강화는 보조, 돌아오면 방금 판 결과·기본 버튼 유지) ·
//   3-7 원칙 4(포기에도 결과 화면) · 원본 v4 3-5 화면 표·4장 ⑤. CLAUDE.md '다른 화면으로 이동시키는 기능은 원래 화면으로 복귀'.
//  묶음: SHELL-FLOW(결과 → 로봇 강화 → 돌아가기 → 방금 판 결과 · 타이틀 → 로봇 강화 → 구매 → 저장 → 돌아가기) · UP-HINT(첫 구매 안내 1회·추천 1회) ·
//   UP-BLOCK(읽기 전용 탭·코인 저장 실패 = 구매 막힘 + 결과 '저장 안 됨') · UP-TEXT(미리보기 글 = 소총 기준 계산값) · V3-RENDER-SHOP(그리기 오류 없음·hit 영역) ·
//   V3-RENDER-HERO-BULLET(로봇 탄 테). WALLET-4·WALLET-8 은 rush3-coins 의 WALLET 묶음 번호 자리에 있다.
//  셸 검사는 실제 boot() 결선(가짜 캔버스·저장·오디오·rAF)을 두드린다 — 좌표는 논리 480×800(캔버스 CSS 240×400 이라 절반으로 넣는다)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage } from '../rush3/stages.js';
import { createSave3, KEY3, WALLET_KEY } from '../rush3/save.js';
import { createRenderer3, UPGRADE_UI, upgradeCard, upgradeBuyBox, HERO_BULLET_RIM, EXTRA_BULLET_COLOR, SAVE_WARN, UNSAVED_TAG } from '../rush3/render.js';
import { boot, hitButton, TITLE_UPGRADE_BTN, RESULT_UPGRADE_SLOT, UPGRADE_HEAD, UP_BLOCK_TEXT, UP_HINT_LINE, UP_REC_TEXT, UP_TRACK_NAME,
         upgradeLines, shotsToKill, canBuyAny } from '../rush3/main.js';
import { UP_TRACKS, UP_COST, effects } from '../rush3/meta.js';
import { pickInput, weakenBosses, wipeSquad } from './lib/rush3-policies.mjs';

const Z0 = { power: 0, rate: 0, multi: 0 };

// ─────────────────────────────── 셸 하네스(rush3-coins 와 같은 꼴) ───────────────────────────────
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
        if (k === 'fillText') texts.push({ text: String(args[0]), x: args[1], y: args[2], fill: t.fillStyle, alpha: t.globalAlpha });
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
function fakeBus() {
  const chans = [];
  return class FakeBC {
    constructor(name) { this.name = name; this.onmessage = null; this.closed = false; chans.push(this); }
    postMessage(data) { for (const c of chans) if (c !== this && !c.closed && c.name === this.name && c.onmessage) c.onmessage({ data }); }
    close() { this.closed = true; }
  };
}
async function bootApp({ storage = memStorage(), search = '', BroadcastChannel, dateNow = () => 1_700_000_000_000, save } = {}) {
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
  const app = boot(canvas, deps);
  await app.ready;
  const frames = (n = 1) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  const tap = (x, y) => canvas.fire('pointerdown', { clientX: x / 2, clientY: y / 2, pointerType: 'mouse' });
  //  지금 화면의 버튼(id)의 가운데를 누른다 — 버튼 목록은 프레임마다 view 가 다시 만든다
  const btn = (id) => app.getButtons().find((b) => b.id === id) ?? null;
  const tapId = (id) => { const b = btn(id); assert.ok(b, '버튼 ' + id + ' 이 화면에 있다: ' + app.getButtons().map((x) => x.id).join(',')); tap(b.x + b.w / 2, b.y + b.h / 2); };
  const key = (code) => win.fire('keydown', { code, preventDefault() {} });
  const textNow = () => { texts.length = 0; frames(1); return texts.map((t) => t.text); };
  return { app, save: sv, storage, texts, frames, tap, tapId, btn, key, textNow, audio, win };
}
//  r4.7: opts.win = 보스가 나오면 체력 1(weakenBosses — 보스 체력 바닥으로 봇이 게임 줄 1번을 못 이긴다. 이긴 판이 필요한 셸 흐름 검사용, 난이도와 무관)
const WIN = Object.freeze({ win: true });
//  r4.10: opts.loseAt = 처치 수가 이 수에 닿으면 부대 전멸(wipeSquad — 게임 줄 1번 대물결 판은 center 봇도 결승선을 넘어 이겨, 패배 흐름을 이 도구로 만든다. 난이도와 무관)
function drive(h, policy, cond, max = 20000, opts = {}) {
  let n = 0;
  while (!cond() && n < max) {
    const run = h.app.getRun();
    if (opts.win && run && h.app.getState() === 'run') weakenBosses(run);
    if (opts.loseAt != null && run && h.app.getState() === 'run' && run.kills >= opts.loseAt) wipeSquad(run);
    if (run && h.app.getState() === 'run') h.app.input.state.pointerX = pickInput(policy, run).pointerX;
    h.frames(1);
    n++;
  }
  return n;
}
const walletStore = (coins, up = Z0, extra = {}) => memStorage({ [WALLET_KEY]: JSON.stringify({ coins, runNo: 0, paid: [], firstClears: [], up, ...extra }) });
const rawWallet = (h) => JSON.parse(h.storage.getItem(WALLET_KEY));
const walletWrites = (h) => h.storage.writes.filter((k) => k === WALLET_KEY).length;

// ═══════════════════════════════ SHELL-FLOW ═══════════════════════════════

test('SHELL-FLOW: 결과 → [로봇 강화] → [돌아가기] = 방금 판 결과 화면(같은 결과·기본 버튼 유지) — 승리 = [다음 작전](Enter), 패배·포기 = [다시 도전](Enter)', async () => {
  //  ① 승리(1번 evLead — 새 사용자의 첫 승리, 53 코인(r4.10 대물결 판 — 종전 보스 판 54)) → [로봇 강화] 보조 버튼 → 강화 화면에서 다연발 구매 → [돌아가기]
  const h = await bootApp();
  h.app.startRun(1);
  drive(h, 'evLead', () => h.app.getState() === 'result', 20000, WIN);
  const r = h.app.getResult();
  assert.equal(r.won, true); assert.equal(r.nextId, 2);
  const g = r.coins.gained;
  assert.ok(g >= 40 && g - 40 < 40, '첫 승리 코인으로 다연발 1단계(40)만 살 수 있다: ' + g);
  h.frames(1);
  const up = h.btn('upgrade');
  assert.ok(up, '살 수 있는 단계가 있으면 보조 버튼 [로봇 강화]');
  const title = h.btn('title');
  assert.deepEqual({ x: up.x, y: up.y, w: up.w, h: up.h }, { x: RESULT_UPGRADE_SLOT.x, y: title.y + RESULT_UPGRADE_SLOT.dy, w: RESULT_UPGRADE_SLOT.w, h: RESULT_UPGRADE_SLOT.h }, '[스테이지 선택] 아래 자리');
  assert.ok(!up.primary && up.small, '강조하지 않는다(보조·작게)');
  assert.ok(h.btn('next').primary, '기본 버튼 = [다음 작전]');
  h.tapId('upgrade');
  assert.equal(h.app.getState(), 'upgrade');
  assert.equal(h.app.dbg().upgradeFrom, 'result');
  h.frames(1);
  h.tapId('buy_multi');
  assert.deepEqual(h.save.wallet.get().up, { power: 0, rate: 0, multi: 1 });
  assert.equal(h.save.wallet.get().coins, g - 40);
  h.frames(1);
  h.tapId('back');
  assert.equal(h.app.getState(), 'result', '돌아가기 → 결과 화면');
  assert.equal(h.app.getResult(), r, '방금 판의 결과 그대로(새 판·새 결과가 아니다)');
  assert.equal(h.app.getRun().stageId, 1);
  const t = h.textNow();
  assert.ok(t.includes('작전 성공!') && t.includes('획득 코인 +' + g), '같은 결과 화면: ' + t.slice(0, 6).join(' | '));
  assert.ok(t.includes('보유 코인 ' + (g - 40)), '보유 코인은 산 뒤 값으로');
  assert.ok(h.btn('next').primary, '기본 버튼 [다음 작전] 유지');
  assert.equal(h.btn('upgrade'), null, '더 살 수 있는 단계가 없으면(' + (g - 40) + ' < 40) 보조 버튼은 사라진다');
  h.key('Enter');
  assert.equal(h.app.getState(), 'run'); assert.equal(h.app.getRun().stageId, 2, '승리 Enter = 다음 작전(2번)');
  assert.deepEqual(h.app.getRun().up, { power: 0, rate: 0, multi: 1 }, '다음 판은 산 강화로');

  //  ② 패배(1번 center — 진다) + 코인 넉넉 → [로봇 강화] → ESC(= 돌아가기) → 결과 → Enter = 다시 도전(1번)
  const h2 = await bootApp({ storage: walletStore(100) });
  h2.app.startRun(1);
  drive(h2, 'center', () => h2.app.getState() === 'result', 20000, { loseAt: 4 });
  const r2 = h2.app.getResult();
  assert.equal(r2.won, false); assert.equal(r2.aborted, false);
  h2.frames(1);
  assert.ok(h2.btn('retry').primary, '패배 기본 = [다시 도전]');
  h2.tapId('upgrade');
  assert.equal(h2.app.getState(), 'upgrade');
  h2.frames(1);
  h2.key('Enter');
  assert.equal(h2.app.getState(), 'upgrade', '강화 화면의 Enter 는 아무 일도 하지 않는다(실수로 사거나 출격하지 않게)');
  h2.key('Escape');
  assert.equal(h2.app.getState(), 'result', 'ESC = [돌아가기]');
  assert.equal(h2.app.getResult(), r2);
  h2.frames(1);
  assert.ok(h2.btn('retry').primary, '[다시 도전] 기본 유지');
  h2.key('Enter');
  assert.equal(h2.app.getRun().stageId, 1, '패배 Enter = 다시 도전');

  //  ③ 포기(작전 중단) 결과도 같은 흐름
  const h3 = await bootApp({ storage: walletStore(100) });
  h3.app.startRun(1);
  drive(h3, 'evLead', () => h3.app.getRun().kills >= 3, 4000);
  h3.app.pause(); h3.app.giveUp();
  assert.equal(h3.app.getResult().aborted, true);
  h3.frames(1);
  h3.tapId('upgrade');
  h3.frames(1);
  h3.tapId('back');
  assert.equal(h3.app.getState(), 'result');
  assert.ok(h3.textNow().includes('작전 중단'));
  h3.key('Enter');
  assert.equal(h3.app.getRun().stageId, 1, '포기 Enter = 다시 도전');
  //  ④ 살 수 있는 단계가 없으면 보조 버튼 자체가 없다(패배·포기에서 구매로 몰지 않는다)
  const h4 = await bootApp();
  h4.app.startRun(1);
  drive(h4, 'evLead', () => h4.app.getRun().kills >= 1, 4000);
  h4.app.pause(); h4.app.giveUp();
  h4.frames(1);
  assert.ok(h4.save.wallet.get().coins < 40);
  assert.equal(h4.btn('upgrade'), null, '코인 부족 = [로봇 강화] 없음');
});

test('SHELL-FLOW: 타이틀 → [로봇 강화] → [구매] → 저장 → [돌아가기] = 타이틀 — 산 단계는 새로 읽어도 남고, 다음 출격 판에 걸린다', async () => {
  const h = await bootApp({ storage: walletStore(100) });
  h.frames(1);
  const tb = h.btn('upgrade');
  assert.deepEqual({ x: tb.x, y: tb.y, w: tb.w, h: tb.h }, { ...TITLE_UPGRADE_BTN }, '타이틀 [로봇 강화] = 종전 난이도 토글 줄(y 382)');
  const t0 = h.textNow();
  assert.ok(t0.includes('로봇 강화') && t0.includes('보유 코인 100'), '타이틀: [로봇 강화] + 보유 코인: ' + JSON.stringify(t0.filter((s) => /코인|강화/.test(s))));
  h.tapId('upgrade');
  assert.equal(h.app.getState(), 'upgrade');
  const t1 = h.textNow();
  for (const s of ['로봇 강화', ...UPGRADE_HEAD, '보유 코인 100', UP_TRACK_NAME.power, UP_TRACK_NAME.rate, UP_TRACK_NAME.multi, '돌아가기']) assert.ok(t1.includes(s), '강화 화면 글: ' + s);
  const w0 = walletWrites(h);
  h.tapId('buy_power');
  assert.equal(walletWrites(h), w0 + 1, '구매 = 지갑 쓰기 1회');
  assert.deepEqual(rawWallet(h).up, { power: 1, rate: 0, multi: 0 }); assert.equal(rawWallet(h).coins, 60);
  assert.ok(h.audio.played.includes('weaponSwap'), '구매 효과음');
  h.frames(1);
  h.tapId('back');
  assert.equal(h.app.getState(), 'title', '[돌아가기] → 타이틀(들어온 화면)');
  assert.equal(h.app.getRun(), null);
  assert.ok(h.textNow().includes('보유 코인 60'));
  //  새로 읽어도(새로고침) 잔액·단계가 한 벌로 남는다
  const h2 = await bootApp({ storage: h.storage });
  assert.deepEqual(h2.save.wallet.get().up, { power: 1, rate: 0, multi: 0 }); assert.equal(h2.save.wallet.get().coins, 60);
  h2.app.startRun(1);
  assert.deepEqual(h2.app.getRun().up, { power: 1, rate: 0, multi: 0 }, '다음 출격 판 = 산 강화');
  assert.equal(h2.app.getRun().heroUp.dmgMul, effects({ power: 1 }).dmgMul);
});

// ═══════════════════════════════ UP-HINT — 첫 구매 안내 ═══════════════════════════════

test('UP-HINT: 잔액이 처음으로 1단계 비용(40) 이상이 된 **승리** 결과 화면에서만 "로봇 강화 가능" 1회 · 강화 화면 다연발 "추천" 1회(저장 seenUpHint·seenUpRec)', async () => {
  assert.equal(Math.min(...UP_TRACKS.map((t) => UP_COST[t][0])), 40, '가장 싼 1단계 = 40');
  //  ① 포기 결과는 잔액이 넉넉해도 안내하지 않는다(승리 화면에서만)
  const hA = await bootApp({ storage: walletStore(60) });
  hA.app.startRun(1);
  drive(hA, 'evLead', () => hA.app.getRun().kills >= 1, 4000);
  hA.app.pause(); hA.app.giveUp();
  assert.equal(hA.app.getResult().upHint, null, '포기 결과엔 안내 없음');
  assert.equal(hA.save.get().seenUpHint, false);
  //  ② 새 사용자 1번 첫 승리(53 코인 — r4.10 대물결 판) — 안내 + 보조 버튼 바로 아래 금색 한 줄
  const h = await bootApp();
  assert.equal(h.save.get().seenUpHint, false); assert.equal(h.save.get().seenUpRec, false);
  h.app.startRun(1);
  drive(h, 'evLead', () => h.app.getState() === 'result', 20000, WIN);
  assert.equal(h.app.getResult().upHint, UP_HINT_LINE);
  assert.equal(h.save.get().seenUpHint, true, '본 적 있음 저장');
  h.texts.length = 0; h.frames(1);
  const hint = h.texts.find((x) => x.text === UP_HINT_LINE);
  const ub = h.btn('upgrade');
  assert.ok(hint && ub && hint.y > ub.y + ub.h && hint.y < 800, '안내 = [로봇 강화] 아래 한 줄: ' + JSON.stringify(hint));
  //  강화 화면: 다연발 줄에 '추천'(이번 방문 동안), 다른 줄엔 없다
  h.tapId('upgrade');
  const view1 = h.textNow();
  assert.equal(view1.filter((s) => s === UP_REC_TEXT).length, 1, '추천 한 곳');
  assert.equal(h.save.get().seenUpRec, true, '추천 본 적 있음 저장');
  //  돌아가면 결과 화면의 안내는 내린다(이미 봤다) — 강화 화면을 다시 열어도 추천은 없다
  h.tapId('back');
  assert.equal(h.app.getResult().upHint, null);
  assert.ok(!h.textNow().includes(UP_HINT_LINE));
  h.tapId('upgrade');
  assert.ok(!h.textNow().includes(UP_REC_TEXT), '추천은 한 번만');
  h.tapId('back');
  //  ③ 다음 승리(2번 강제 승리)엔 안내가 다시 뜨지 않는다 — 새로 읽어도(저장)
  const h2 = await bootApp({ storage: h.storage });
  h2.app.startRun(1);
  const run = h2.app.getRun();
  run.won = true; run.wonAt = run.time; run.over = true;
  run.events.push({ type: 'win', time: run.time, units: run.units.length, x: run.x, z: run.z });
  drive(h2, 'center', () => h2.app.getState() === 'result', 200);
  assert.equal(h2.app.getResult().won, true);
  assert.equal(h2.app.getResult().upHint, null, '안내는 사용자당 1회');
  //  ④ 이미 무엇이든 산 사용자(첫 구매가 끝남)는 안내·추천 없음
  const h3 = await bootApp({ storage: walletStore(500, { power: 1, rate: 0, multi: 0 }) });
  h3.app.startRun(1);
  const r3 = h3.app.getRun();
  r3.won = true; r3.wonAt = r3.time; r3.over = true;
  r3.events.push({ type: 'win', time: r3.time, units: r3.units.length, x: r3.x, z: r3.z });
  drive(h3, 'center', () => h3.app.getState() === 'result', 200);
  assert.equal(h3.app.getResult().upHint, null);
  h3.frames(1);
  h3.tapId('upgrade');
  assert.ok(!h3.textNow().includes(UP_REC_TEXT));
  //  ⑤ 추천이 떠 있는 방문 중 무엇이든 사면 내린다(첫 구매를 위한 표시)
  const h4 = await bootApp({ storage: walletStore(200) });
  h4.frames(1);
  h4.tapId('upgrade');
  assert.ok(h4.textNow().includes(UP_REC_TEXT));
  h4.tapId('buy_rate');
  assert.ok(!h4.textNow().includes(UP_REC_TEXT), '구매 뒤엔 추천을 내린다');
});

// ═══════════════════════════════ UP-BLOCK — 저장되지 않는 탭 ═══════════════════════════════

test('UP-BLOCK: 읽기 전용 탭은 구매를 거절한다(wallet.buy → "readOnly", 메모리 잔액·단계도 그대로) · 화면 [구매] 흐림 + 이유 한 줄 · 결과 화면 획득·보유 코인에 "저장 안 됨"', async () => {
  //  ① 저장 계층: 읽기 전용이면 메모리에도 반영하지 않는다(종전: saved false 인 구매가 메모리에 남아 그 탭의 다음 판이 사지 않은 강화로 돌았다)
  const st = walletStore(100);
  const s = createSave3(st);
  s.setReadOnly(true);
  const n0 = st.writes.length;
  const r = s.wallet.buy('multi');
  assert.deepEqual(r, { ok: false, reason: 'readOnly', cost: 40, coins: 100, up: { ...Z0 }, saved: false });
  assert.deepEqual(s.wallet.get().up, Z0); assert.equal(s.wallet.get().coins, 100, '메모리 잔액 그대로');
  assert.equal(st.writes.length, n0, '쓰기 없음');
  s.setReadOnly(false);
  assert.equal(s.wallet.buy('multi').ok, true, '쓰기 가능해지면 산다');
  //  ② 셸: 먼저 열린 탭이 있는 나중 탭(읽기 전용) — [구매] 흐림 + 이유, 눌러도 안 산다
  const BC = fakeBus();
  const shared = walletStore(100);
  await bootApp({ storage: shared, BroadcastChannel: BC, dateNow: () => 1_700_000_000_000 });
  const b = await bootApp({ storage: shared, BroadcastChannel: BC, dateNow: () => 1_700_000_005_000 });
  assert.equal(b.save.readOnly, true);
  b.frames(1);
  b.tapId('upgrade');
  const t = b.textNow();
  assert.ok(t.includes(UP_BLOCK_TEXT.readOnly), '이유 한 줄: ' + JSON.stringify(t.slice(0, 8)));
  for (const tr of UP_TRACKS) assert.equal(b.btn('buy_' + tr).disabled, true, tr + ' [구매] 흐림');
  const box = upgradeBuyBox(2);
  b.tap(box.x + box.w / 2, box.y + box.h / 2);
  assert.deepEqual(b.save.wallet.get().up, Z0, '눌러도 사지 않는다');
  assert.equal(b.app.buyTrack('multi'), null, 'API 로 불러도 막힌다');
  //  결과 화면(읽기 전용 탭): 획득·보유 코인 뒤에 '저장 안 됨'(흐리게)
  b.tapId('back');
  b.app.startRun(1);
  drive(b, 'evLead', () => b.app.getRun().kills >= 3, 4000);
  b.app.pause(); b.app.giveUp();
  const g = b.app.getResult().coins.gained;
  b.texts.length = 0; b.frames(1);
  const gained = b.texts.find((x) => x.text === '획득 코인 +' + g + ' · ' + UNSAVED_TAG);
  const bal = b.texts.find((x) => x.text.startsWith('보유 코인 ') && x.text.endsWith(' · ' + UNSAVED_TAG));
  assert.ok(gained && bal, '저장 안 됨 표기: ' + JSON.stringify(b.texts.slice(0, 6).map((x) => x.text)));
  assert.ok(gained.alpha < 1, '흐리게');
  assert.equal(b.btn('upgrade'), null, '읽기 전용 탭 결과 화면엔 [로봇 강화] 보조 버튼 없음');
  //  ③ 코인 저장 실패(쓰기 예외) — 이유 줄은 '저장되지 않는 상태'
  const bad = { getItem: (k) => (k === WALLET_KEY ? JSON.stringify({ coins: 100, runNo: 0, paid: [], firstClears: [], up: Z0 }) : null), setItem: () => { throw new Error('quota'); } };
  const sv = createSave3(bad);
  sv.wallet.pay({ id: '9:main', amount: 1 });           // 쓰기 실패 → wallet.ok false
  assert.equal(sv.wallet.ok, false);
  const c = await bootApp({ save: sv });
  c.frames(1);
  c.tapId('upgrade');
  const tc = c.textNow();
  assert.ok(tc.includes(UP_BLOCK_TEXT.unsaved), '코인 저장 실패 이유');
  assert.ok(tc.includes(SAVE_WARN.both) || tc.includes(SAVE_WARN.coin), '맨 아래 경고도 그대로');
  for (const tr of UP_TRACKS) assert.equal(c.btn('buy_' + tr).disabled, true);
  //  ④ 정상 탭 결과 화면 글자는 한 글자도 바뀌지 않는다('저장 안 됨' 없음)
  const ok = await bootApp();
  ok.app.startRun(1);
  drive(ok, 'evLead', () => ok.app.getRun().kills >= 3, 4000);
  ok.app.pause(); ok.app.giveUp();
  assert.ok(!ok.textNow().some((x) => x.includes(UNSAVED_TAG)));
});

// ═══════════════════════════════ UP-TEXT — 미리보기 글 ═══════════════════════════════

test('UP-TEXT: 강화 화면 미리보기 = 지금 든 무기(기본 소총) 기준 "지금 → 다음" — 직격 화력 1.0 → 1.3 · 1번 보스 180 을 180발 → 139발, 연사 0.50초 → 0.44초, 다연발 1발 → 2발(게이트는 원래 1발만)', () => {
  const ref = { stageId: 1, bossHp: 180 };
  const p0 = upgradeLines(Z0, 'power', ref);
  assert.deepEqual(p0, { name: '직격 화력', level: 0, max: 5, cost: 40, lines: ['로봇 직격 피해 1.0 → 1.3', '1번 보스(체력 180): 180발 → 139발', '소총 기준 · 폭발·연쇄에는 적용 안 됨'] });
  const r0 = upgradeLines(Z0, 'rate', ref);
  assert.deepEqual(r0.lines, ['로봇 발사 간격 0.50초 → 0.44초', '1초에 2.0발 → 2.3발', '소총 기준 · 게이트 숫자도 더 빨리 오름']);
  const m0 = upgradeLines(Z0, 'multi', ref);
  assert.deepEqual(m0.lines, ['로봇이 한 번에 1발 → 2발', '게이트는 원래 1발만 오름', '추가 탄(연보라)은 적·보급 통에만 맞음']);
  //  최대 단계 = '최대 단계 · 지금 값', 비용 null
  const pm = upgradeLines({ power: 5 }, 'power', ref);
  assert.equal(pm.cost, null); assert.equal(pm.lines[0], '최대 단계 · 로봇 직격 피해 2.5'); assert.equal(pm.lines[1], '1번 보스(체력 180): 72발');
  assert.equal(upgradeLines({ multi: 3 }, 'multi').lines[0], '최대 단계 · 로봇이 한 번에 4발');
  //  단계별 값이 규칙 효과와 같다(meta.effects) — 발 수는 규칙처럼 여유값을 둔 계산(보스 330·피해 2.2 = 150발, UP-INT 와 같은 값)
  assert.equal(shotsToKill(180, effects({ power: 1 }).dmgMul), 139);
  assert.equal(shotsToKill(330, effects({ power: 4 }).dmgMul), 150);
  assert.equal(shotsToKill(8, effects({ power: 2 }).dmgMul), 5);
  //  보스를 모르면 보스 줄 없음
  assert.equal(upgradeLines(Z0, 'power', null).lines[1], null);
  //  canBuyAny = 살 수 있는 트랙이 하나라도
  assert.equal(canBuyAny({ coins: 39, up: Z0 }), false); assert.equal(canBuyAny({ coins: 40, up: Z0 }), true);
  assert.equal(canBuyAny({ coins: 9999, up: { power: 5, rate: 5, multi: 3 } }), false, '모두 최대면 없음');
  //  줄에 어절 중간 줄바꿈이 없다(글 안에 줄바꿈 문자 없음 — 렌더는 줄을 더 나누지 않는다)
  for (const t of UP_TRACKS) for (const k of [0, 2, 5]) for (const l of upgradeLines({ [t]: k }, t, { stageId: 24, bossHp: 6300 }).lines) if (l) assert.ok(!/\n/.test(l), l);
});

// ═══════════════════════════════ V3-RENDER-SHOP ═══════════════════════════════

//  호출 기록 ctx(rush3-render 와 같은 꼴 — 상태까지 기록)
function recCtx(measure = (t) => String(t).length * 8) {
  const ops = [];
  const stack = [];
  const state = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', canvas: null };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'save') stack.push({ ...t });
        if (k === 'restore') { const s = stack.pop(); if (s) Object.assign(t, s); }
        ops.push({ op: k, args, alpha: t.globalAlpha, fill: t.fillStyle, stroke: t.strokeStyle, font: t.font });
        if (k.startsWith('create')) return { addColorStop() {} };
        if (k === 'measureText') return { width: measure(args[0]) };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
//  roundRect(x, y, w, h, r) = moveTo(x + r, y) + arcTo×4 — 첫 arcTo(x+w, y, x+w, y+h, r) · 셋째 arcTo(x, y+h, x, y, r) 로 상자를 되살린다
function boxesByFill(ops, fill) {
  const arcs = ops.filter((o) => o.op === 'arcTo' && o.fill === fill).map((o) => o.args);
  const out = [];
  for (let i = 0; i + 3 < arcs.length; i += 4) out.push({ x: arcs[i + 2][0], y: arcs[i][1], w: arcs[i][0] - arcs[i + 2][0], h: arcs[i][3] - arcs[i][1] });
  return out;
}

test('V3-RENDER-SHOP: 강화 화면 그리기 오류 없음 — 카드 3장·[구매]·[돌아가기] 상자 = 누르는 상자(hitButton), 화면 안·서로 겹치지 않음, 트랙마다 이름·단계 막대·효과 글, 흐린 [구매]는 눌리지 않는다', async () => {
  const h = await bootApp({ storage: walletStore(100, { power: 5, rate: 1, multi: 0 }) });
  h.frames(1);
  h.tapId('upgrade');
  h.frames(1);
  const buttons = h.app.getButtons();
  assert.deepEqual(buttons.map((b) => b.id), ['buy_power', 'buy_rate', 'buy_multi', 'back']);
  //  ① 상자: [구매] = render.upgradeBuyBox(i) · [돌아가기] = UPGRADE_UI.back. 화면(480×800) 안, 서로 겹치지 않고, [구매]는 제 카드 안
  UP_TRACKS.forEach((t, i) => {
    const b = buttons[i], box = upgradeBuyBox(i), card = upgradeCard(i);
    assert.deepEqual({ x: b.x, y: b.y, w: b.w, h: b.h }, box, t + ' [구매] 상자 = 자리표');
    assert.ok(b.x >= card.x && b.y >= card.y && b.x + b.w <= card.x + card.w && b.y + b.h <= card.y + card.h, t + ' [구매]는 제 카드 안');
  });
  const back = buttons[3];
  assert.deepEqual({ x: back.x, y: back.y, w: back.w, h: back.h }, { ...UPGRADE_UI.back });
  for (const b of buttons) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 480 && b.y + b.h <= 800 - 30, b.id + ' 화면 안(맨 아래 경고 줄 위)');
  for (let i = 0; i < 3; i++) {
    const a = upgradeCard(i), c = i < 2 ? upgradeCard(i + 1) : { y: UPGRADE_UI.back.y };
    assert.ok(a.y + a.h < c.y, '카드 ' + i + ' 가 다음 칸과 겹치지 않는다');
  }
  assert.ok(upgradeCard(0).y > UPGRADE_UI.blockY, '카드는 머리(보유 코인·이유 줄) 아래');
  //  ② 상태: 직격 화력 최대(흐림·'최대 단계') · 연사 2단계 80 ≤ 100(누를 수 있음) · 다연발 40(누를 수 있음)
  assert.equal(buttons[0].disabled, true); assert.equal(buttons[0].label, '최대 단계');
  assert.equal(buttons[1].disabled, false); assert.equal(buttons[1].sub, '80 코인');
  assert.equal(buttons[2].disabled, false); assert.equal(buttons[2].sub, '40 코인');
  //  ③ hitButton: 각 상자 가운데 = 그 버튼, 흐린 버튼은 눌리지 않는다
  for (const b of buttons) assert.equal(hitButton(buttons, b.x + b.w / 2, b.y + b.h / 2), b.disabled ? null : b.id);
  //  ④ 실제 그리기(렌더러에 셸의 view 를 그대로) — 예외 없이 그려지고, 버튼 바탕 상자(drawButtons)가 셸 상자와 같다
  const { ctx, ops } = recCtx();
  const view = { state: 'upgrade', now: 1, buttons, saveOk: true, coinSaveOk: true, readOnly: false,
    upgrade: { head: UPGRADE_HEAD, coins: 100, coinSaveOk: true, blocked: null, flash: { i: 1, k: 0.5 },
      rows: UP_TRACKS.map((t) => ({ track: t, ...upgradeLines({ power: 5, rate: 1, multi: 0 }, t, { stageId: 1, bossHp: 180 }), rec: t === 'multi', recText: UP_REC_TEXT })) } };
  assert.doesNotThrow(() => createRenderer3(ctx, null).draw(view));
  const texts = ops.filter((o) => o.op === 'fillText').map((o) => String(o.args[0]));
  for (const s of ['로봇 강화', ...UPGRADE_HEAD, '보유 코인 100', '직격 화력', '연사', '다연발', '5/5단계', '1/5단계', '0/3단계', UP_REC_TEXT,
                   '최대 단계 · 로봇 직격 피해 2.5', '로봇 발사 간격 0.44초 → 0.38초', '로봇이 한 번에 1발 → 2발', '구매', '80 코인', '돌아가기']) assert.ok(texts.includes(s), '글: ' + s);
  //  단계 막대: 칸 수 = 최대 단계 합(5 + 5 + 3) — 산 단계는 채운 네모(fillRect 12×12), 남은 단계는 빈 네모(strokeRect)
  const filled = ops.filter((o) => o.op === 'fillRect' && o.args[2] === 12 && o.args[3] === 12).length;
  const hollow = ops.filter((o) => o.op === 'strokeRect' && Math.abs(o.args[2] - 10.5) < 1e-9).length;
  assert.equal(filled, 6, '산 단계 5 + 1 + 0'); assert.equal(hollow, 7, '남은 단계 0 + 4 + 3');
  //  버튼 상자: 주 버튼(누를 수 있는 [구매]) 바탕 = C.outline, 보조·흐림 = 반투명 네이비 — 셸 상자와 같은 자리에 그려진다
  const drawn = [...boxesByFill(ops, '#14233A'), ...boxesByFill(ops, 'rgba(20,35,58,0.82)')];
  for (const b of buttons) assert.ok(drawn.some((d) => d.x === b.x && d.y === b.y && d.w === b.w && d.h === b.h), b.id + ' 그린 상자 = 누르는 상자: ' + JSON.stringify(drawn.slice(0, 6)));
  //  카드 글은 [구매] 버튼과 겹치지 않는 폭(textMaxW) 안 — 글 시작 + maxWidth < [구매] 왼쪽
  const cardTexts = ops.filter((o) => o.op === 'fillText' && o.args[3] === UPGRADE_UI.textMaxW);
  assert.ok(cardTexts.length >= 9, '카드 글 세 줄 × 3');
  for (const o of cardTexts) assert.ok(o.args[1] + o.args[3] < upgradeBuyBox(0).x, '카드 글 폭이 [구매]에 닿지 않는다');
});

// ═══════════════════════════════ V3-RENDER-HERO-BULLET ═══════════════════════════════

test('V3-RENDER-HERO-BULLET: 강화 1단계 이상 판에서 로봇 탄(원래 탄 + 추가 탄)에만 옅은 연보라 테 — 병사 탄·강화 0 판은 테 없음, 추가 탄 꼬리 색은 그대로', () => {
  //  최소 도로(적·게이트 없음) 로봇 + 병사 1명, 다연발 1 · 직격 화력 1
  const road = (n) => ({ id: 'tb', version: 1, title: 'tb', startUnits: n, startWeapon: 'rifle', length: 1e6, eliteZ: null, gateRows: [], supplies: [], walls: [], spawns: [], elites: [], elite: null, arena: null });
  const draw = (run) => {
    const { ctx, ops } = recCtx(() => 10);
    createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: { parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null, lotOpen: 0 }, hud: { distM: 1 }, buttons: [], saveOk: true });
    return ops;
  };
  const fireOnce = (run) => { for (const u of run.units) u.fireT = 0; stepRun(run, { pointerX: null, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); };
  const run = createRun(road(2), { up: { multi: 1, power: 1 }, heroGuard: true });
  fireOnce(run);
  const hero = run.units.find((u) => u.hero);
  const heroBullets = run.bullets.filter((b) => b.ownerId === hero.id), soldierBullets = run.bullets.filter((b) => b.ownerId !== hero.id);
  assert.equal(heroBullets.length, 2, '로봇 = 원래 탄 + 추가 탄'); assert.equal(soldierBullets.length, 1, '병사 1발');
  const ops = draw(run);
  const rims = ops.filter((o) => o.op === 'strokeRect' && o.stroke === HERO_BULLET_RIM);
  assert.equal(rims.length, 2, '로봇 탄 2발에만 테(그림 없는 폴백 = 막대 테)');
  //  추가 탄 꼬리 색은 그대로(연보라 막대 1) — 테와 같은 계열
  assert.equal(ops.filter((o) => o.op === 'fillRect' && o.fill === EXTRA_BULLET_COLOR).length, 1);
  assert.match(HERO_BULLET_RIM, /^rgba\(217,166,255,/, '추가 탄 색(#D9A6FF)과 같은 연보라 계열');
  //  강화 0 판(셸 새 사용자) = 로봇 탄에도 테 없음
  const plain = createRun(road(2), { heroGuard: true });
  fireOnce(plain);
  assert.equal(draw(plain).filter((o) => o.op === 'strokeRect' && o.stroke === HERO_BULLET_RIM).length, 0, '강화 0 = 테 없음');
  //  탄 그림이 있는 경로(브라우저)도 테를 두른다 — 타원 한 줄(ellipse + stroke)
  const img = { width: 8, height: 24 };
  const { ctx, ops: ops2 } = recCtx(() => 10);
  createRenderer3(ctx, { get: (k) => (k === 'bullet_rifle' ? img : null) }).draw({ state: 'run', now: 1, run, fx: { parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null, lotOpen: 0 }, hud: { distM: 1 }, buttons: [], saveOk: true });
  const strokes = ops2.filter((o) => o.op === 'stroke' && o.stroke === HERO_BULLET_RIM).length;
  assert.equal(strokes, 2, '그림 경로도 로봇 탄 2발에만 테');
});
