// rush3-loop — 셸 묶음(계약서 8장 V3-DETERMINISM·V3-INPUT + boot 스모크). DOM 없이 main.js 를 import 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ZOOM } from '../rush3/render.js';
import { projectorFor } from '../rush3/project.js';
import { hitButton, makeLoop, boot, missedLine, timeText, lotteryLine, DIFF_TOGGLE, normDifficulty,
         emptyLotteryOutcome, GATE_TIP_CLOSED, GATE_TIP_OPEN, GATE_TIP_OPEN_FIXED, SHUTTER_GUIDE_TEXT,
         isFixedGateRow, TITLE_GRID } from '../rush3/main.js';
import { makeGateRow } from '../rush3/gates.js';
import { createInput } from '../rush3/input.js';
import { createRun, stepRun, STEP } from '../rush3/combat.js';
import { buildStage, stageVersion, DEFS, LOTTERY_DEFAULT_SEED } from '../rush3/stages.js';
import { createSave3 } from '../rush3/save.js';
import { RETRY_LOTTERY_NOTE } from '../rush3/render.js';
import { BAL3 } from '../rush3/balance.js';
import { hashSeed } from '../rush/rng.js';

// STEP 인덱스별 입력열(결정적): 호버 x 는 사인파, 40~60 STEP 마다 드래그·키 조향이 섞인다
function inputAt(i) {
  const phase = Math.floor(i / 300) % 3;
  if (phase === 0) return { pointerX: 240 + Math.round(Math.sin(i / 45) * 120), dragDx: 0, keyDir: 0 };
  if (phase === 1) return { pointerX: null, dragDx: i % 50 === 0 ? (i % 100 === 0 ? 60 : -60) : 0, keyDir: 0 };
  return { pointerX: null, dragDx: 0, keyDir: i % 120 < 60 ? -1 : 1 };
}

// dt 열(초)을 makeLoop 에 얹어 한 판을 돌린다. 반환 { steps, run }
function playWithLoop(stageId, dts) {
  const run = createRun(buildStage(stageId));
  let idx = 0, steps = 0;
  const loop = makeLoop({ step: STEP, onStep: () => { stepRun(run, inputAt(idx++), STEP); steps++; } });
  let now = 0;
  loop.start(now);
  for (const dt of dts) { now += dt; loop.frame(now); }
  return { steps, run };
}

const pick = (r) => ({ units: r.units.length, z: r.z, x: r.x, weapon: r.weapon, kills: r.kills, time: r.time, peak: r.peak,
  ids: r.units.map((u) => u.id), bullets: r.bullets.length, enemies: r.enemies.length });

test('V3-DETERMINISM: makeLoop — dt 3초 프레임 1개 → 정확히 5 STEP, 이어지는 16.7ms → 1 STEP, 정지 상태는 갱신 없음', () => {
  const log = [];
  const loop = makeLoop({ step: STEP, onStep: (s, i) => log.push([s, i]), maxSteps: 5 });
  assert.equal(loop.frame(1), 0, 'start 전에는 아무것도 안 한다');
  loop.start(1);
  assert.equal(loop.frame(4), 5);
  assert.deepEqual(log.map((e) => e[1]), [0, 1, 2, 3, 4]);
  assert.ok(log.every((e) => e[0] === STEP));
  assert.equal(loop.getAcc(), 0, '초과분은 폐기');
  assert.equal(loop.frame(4 + 0.0167), 1);
  // 일시정지: acc 0·last=now. 정지 중 프레임은 0, 해제 뒤 긴 공백도 0 STEP 부터
  loop.stop(10);
  assert.equal(loop.frame(20), 0);
  loop.start(30);
  assert.equal(loop.frame(30), 0, '해제 직후 프레임은 dt 0');
  assert.equal(loop.frame(30 + STEP * 2 + 1e-6), 2);
  // 60Hz 600프레임 = 정확히 600 STEP(누적 오차 없음)
  const l2 = makeLoop({ step: STEP, onStep: () => {} });
  let n = 0, t = 0;
  l2.start(0);
  for (let i = 0; i < 600; i++) { t += 1 / 60; n += l2.frame(t); }
  assert.equal(n, 600);
});

test('V3-DETERMINISM: 같은 STEP 입력열을 30/60/120Hz dt 열에 얹어도 STEP 수·최종 run 상태가 같다', () => {
  const T = 30;
  const seq = (hz) => Array.from({ length: T * hz }, () => 1 / hz);
  const a = playWithLoop(1, seq(30)), b = playWithLoop(1, seq(60)), c = playWithLoop(1, seq(120));
  assert.equal(a.steps, T * 60);
  assert.equal(b.steps, T * 60);
  assert.equal(c.steps, T * 60);
  assert.deepEqual(pick(a.run), pick(b.run));
  assert.deepEqual(pick(b.run), pick(c.run));
  // 의미 있는 판이었는지(입력·전투가 실제로 일어났다)
  assert.ok(a.run.z > 5000 && a.run.kills > 0 && a.run.peak >= 2, JSON.stringify(pick(a.run)));
  // 불규칙 dt(24~144Hz 섞임)도 STEP 총량이 같으면 같은 결과
  const irregular = [];
  let acc = 0;
  for (let i = 0; acc < T; i++) { const dt = [1 / 24, 1 / 60, 1 / 144, 1 / 90][i % 4]; irregular.push(dt); acc += dt; }
  const d = playWithLoop(1, irregular);
  // 마지막 프레임이 T 를 넘길 수 있으므로 STEP 수를 맞춘 뒤 비교
  assert.ok(d.steps >= T * 60);
  if (d.steps === T * 60) assert.deepEqual(pick(d.run), pick(a.run));
});

test('V3-INPUT: 마우스 = 호버 절대 x, 터치 = 드래그 상대 이동(댄 위치로 튀지 않음), snapshot 이 dragDx 를 소비', () => {
  const inp = createInput();
  inp.onPointerMove(300, 'mouse');
  assert.deepEqual(inp.snapshot(), { pointerX: 300, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
  // 터치 시작: 절대 위치 무시(pointerX null), 이동량만 누적
  inp.onPointerDown(400, 'touch');
  let s = inp.snapshot();
  assert.equal(s.pointerX, null, '손가락 댄 위치로 튀지 않는다');
  assert.equal(s.dragDx, 0);
  assert.equal(inp.state.dragging, true);
  inp.onPointerMove(420, 'touch');
  inp.onPointerMove(410, 'touch');
  s = inp.snapshot();
  assert.deepEqual(s, { pointerX: null, dragDx: 10, keyDir: 0, dragDy: 0, keyDirY: 0 });
  assert.equal(inp.snapshot().dragDx, 0, '스냅샷이 dragDx 를 소비');
  inp.onPointerMove(450, 'touch');
  inp.onPointerUp();
  assert.equal(inp.state.dragging, false);
  assert.equal(inp.snapshot().dragDx, 40, '뗀 뒤에도 마지막 이동량은 한 번 전달');
  inp.onPointerMove(500, 'touch');
  assert.equal(inp.snapshot().dragDx, 0, '드래그 중이 아니면 터치 이동은 무시');
  // 키: 좌우 동시면 0, 하나만 남으면 그쪽
  inp.onKey('ArrowLeft', true);
  assert.equal(inp.snapshot().keyDir, -1);
  inp.onKey('ArrowRight', true);
  assert.equal(inp.snapshot().keyDir, 0);
  inp.onKey('ArrowLeft', false);
  assert.equal(inp.snapshot().keyDir, 1);
  assert.equal(inp.onKey('KeyZ', true), false, '모르는 키는 false');
});

test('V3-INPUT: pointercancel/blur(reset) → dragging=false·dragDx=0·keyDir=0, 마우스 호버도 지운다', () => {
  const inp = createInput();
  inp.onPointerDown(200, 'touch');
  inp.onPointerMove(260, 'touch');
  inp.onKey('ArrowRight', true);
  assert.equal(inp.state.dragging, true);
  assert.equal(inp.state.dragDx, 60);
  inp.onPointerCancel();
  assert.equal(inp.state.dragging, false);
  assert.equal(inp.state.dragDx, 0);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
  inp.onPointerMove(330, 'mouse');
  inp.reset();
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
  // 드래그 중 마우스 이벤트가 섞여도 절대 x 로 튀지 않고 dragDx 에도 누적되지 않는다
  inp.onPointerDown(100, 'touch');
  inp.onPointerMove(150, 'mouse');
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
  inp.onPointerMove(110, 'touch');
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 10, keyDir: 0, dragDy: 0, keyDirY: 0 }, '마우스 혼입 뒤 손가락 이동은 손가락 이동량만');
  inp.onPointerDown(300, 'mouse');
  inp.onPointerMove(120, 'touch');
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 10, keyDir: 0, dragDy: 0, keyDirY: 0 }, '드래그 중 마우스 down 도 lastX 를 덮어쓰지 않는다');
});

test('V3-INPUT: 두 손가락 — 둘째 손가락의 down/move/up 은 첫 손가락 드래그에 섞이지 않는다', () => {
  const inp = createInput();
  inp.onPointerDown(100, 'touch', 1);
  inp.onPointerMove(110, 'touch', 1);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 10, keyDir: 0, dragDy: 0, keyDirY: 0 });
  // 둘째 손가락 down(멀리) → 첫 손가락 move: 첫 손가락 이동량만 누적(두 손가락 거리만큼 점프 없음)
  inp.onPointerDown(300, 'touch', 2);
  assert.equal(inp.state.pointerId, 1, '드래그 주인은 첫 손가락 그대로');
  inp.onPointerMove(120, 'touch', 1);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 10, keyDir: 0, dragDy: 0, keyDirY: 0 });
  // 둘째 손가락 move 는 무시
  inp.onPointerMove(350, 'touch', 2);
  inp.onPointerMove(340, 'touch', 2);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
  // 둘째 손가락 up 은 드래그를 끝내지 않는다 → 첫 손가락 이동 계속 반영
  inp.onPointerUp(2);
  assert.equal(inp.state.dragging, true);
  inp.onPointerMove(125, 'touch', 1);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 5, keyDir: 0, dragDy: 0, keyDirY: 0 });
  // 첫 손가락 up → 드래그 종료. 이후 둘째 손가락이 새로 down 하면 그 손가락이 새 드래그(댄 위치로 튀지 않음)
  inp.onPointerUp(1);
  assert.equal(inp.state.dragging, false);
  assert.equal(inp.state.pointerId, null);
  inp.onPointerDown(300, 'touch', 2);
  inp.onPointerMove(290, 'touch', 2);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: -10, keyDir: 0, dragDy: 0, keyDirY: 0 });
  // 드래그 중 pointercancel 은 손가락과 무관하게 reset
  inp.onPointerCancel();
  //  r3.17 재기준: 세로 입력 칸(dragDy·lastY·up·down·keyDirY)이 state 에 늘었다 — reset 은 그것들도 지운다
  assert.deepEqual(inp.state, { pointerX: null, dragDx: 0, keyDir: 0, dragging: false, pointerId: null, lastX: null, left: false, right: false, device: null,
                                dragDy: 0, lastY: null, up: false, down: false, keyDirY: 0 });
});

test('V3-INPUT-SWITCH: 마지막으로 쓴 장치가 이긴다 — 마우스→키·키 해제 뒤 복귀 없음·키→마우스 재개', () => {
  //  (1) 같은 조건(오른쪽 키 2초)에서 마우스를 먼저 x240 에 둔 판과 두지 않은 판의 최종 x 가 같아야 한다
  const play2s = (mouseFirst) => {
    const run = createRun(buildStage(1)), inp = createInput();
    if (mouseFirst) inp.onPointerMove(240, 'mouse', 1);
    inp.onKey('ArrowRight', true);
    for (let i = 0; i < 120; i++) stepRun(run, inp.snapshot(), STEP);
    return run.x;
  };
  const noMouse = play2s(false), afterMouse = play2s(true);
  assert.ok(noMouse > 380 && noMouse < 400, '키만: x=' + noMouse);
  assert.equal(afterMouse, noMouse, '마우스를 먼저 써도 키 조작 결과가 같다(마우스 목표에 묶이지 않음)');

  //  (2) 키를 놓아도 옛 마우스 위치로 되돌아가지 않는다
  const run = createRun(buildStage(1)), inp = createInput();
  inp.onPointerMove(240, 'mouse');
  inp.onKey('ArrowRight', true);
  for (let i = 0; i < 60; i++) stepRun(run, inp.snapshot(), STEP);
  const xKey = run.x;
  assert.ok(xKey > 300, '키로 오른쪽으로 갔다: ' + xKey);
  inp.onKey('ArrowRight', false);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 }, '키를 놓아도 pointerX 는 null 그대로');
  for (let i = 0; i < 60; i++) stepRun(run, inp.snapshot(), STEP);
  assert.ok(run.x >= xKey - 1e-9, '옛 마우스 위치(240)로 되돌아가지 않는다: ' + run.x);

  //  (3) 마우스를 다시 움직이면 마우스가 이긴다(눌린 키는 해제)
  inp.onKey('ArrowRight', true);
  inp.onPointerMove(160, 'mouse');
  assert.deepEqual(inp.snapshot(), { pointerX: 160, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
  assert.equal(inp.state.device, 'mouse');
  for (let i = 0; i < 180; i++) stepRun(run, inp.snapshot(), STEP);
  assert.ok(Math.abs(run.x - 160) < 2, '마우스 위치를 다시 따라간다: ' + run.x);
});

test('V3-INPUT-SWITCH: 터치↔키 — 드래그가 시작되면 마우스·키 목표 해제, 드래그 중 키는 무시(드래그 우선)', () => {
  const inp = createInput();
  //  키 조작 중 드래그 시작 → 키 방향 해제
  inp.onKey('ArrowRight', true);
  assert.equal(inp.snapshot().keyDir, 1);
  inp.onPointerDown(200, 'touch', 1);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 }, '드래그 시작이 키 방향을 지운다');
  assert.equal(inp.state.device, 'touch');
  //  드래그 중 키는 방향에 반영하지 않는다(아는 키라 셸에는 true 로 알린다)
  assert.equal(inp.onKey('ArrowLeft', true), true);
  inp.onPointerMove(260, 'touch', 1);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 60, keyDir: 0, dragDy: 0, keyDirY: 0 }, '드래그 중에는 이동량만');
  //  드래그가 끝난 뒤 다시 누르면 키가 듣는다
  inp.onPointerUp(1);
  inp.onKey('ArrowLeft', true);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: -1, dragDy: 0, keyDirY: 0 });
  assert.equal(inp.state.device, 'key');
  //  마우스 → 터치: 마우스 목표 해제
  inp.onPointerMove(300, 'mouse');
  assert.equal(inp.snapshot().pointerX, 300);
  inp.onPointerDown(50, 'touch', 2);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0, dragDy: 0, keyDirY: 0 });
  inp.onPointerMove(70, 'touch', 2);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 20, keyDir: 0, dragDy: 0, keyDirY: 0 });
});

test('V3-SHELL: main.js 는 DOM 없이 import 되고 hitButton 은 사각형 안·disabled 를 구분한다', () => {
  assert.equal(typeof boot, 'function');
  assert.equal(typeof makeLoop, 'function');
  const bs = [{ id: 'a', x: 10, y: 10, w: 100, h: 40 }, { id: 'b', x: 10, y: 60, w: 100, h: 40, disabled: true }];
  assert.equal(hitButton(bs, 50, 30), 'a');
  assert.equal(hitButton(bs, 110, 50), 'a');
  assert.equal(hitButton(bs, 111, 30), null);
  assert.equal(hitButton(bs, 50, 80), null, 'disabled 버튼은 눌리지 않는다');
  assert.equal(missedLine({ missedSupplies: 2, badGatesPassed: 1, lossByGate: 0, lossByTouch: 0, lossByShot: 3 }), '보급 통 2개를 놓침 · −게이트 1회 통과 · 피격 손실 3');
  assert.equal(missedLine({ missedSupplies: 0, badGatesPassed: 0 }), '놓친 것 없음');
  assert.equal(timeText(65.04), '1분 5.0초');
  assert.equal(timeText(40.86), '40.9초');
});

// ── boot 스모크: 가짜 캔버스(기록 ctx)·가짜 시계·rAF 큐로 타이틀 → 출격 → 일시정지 → 완주 → 결과 → 저장까지 ──
function fakeCanvas(calls, texts = [], rec = null) {
  const grad = { addColorStop() {} };
  const ctx = new Proxy({ canvas: null }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      //  texts: 화면에 실제로 찍힌 글(버튼 label/sub 검사용)
      //  rec: **켠 동안만** 인자(좌표)까지 남기는 기록. 기본은 꺼짐 — 한 판에 수천 프레임을 돌리는 검사들이 있어, 필요한 한 프레임만 켠다
      return (...args) => { calls.push(k); if (rec && rec.on) rec.ops.push({ op: k, args }); if (k === 'fillText') texts.push(String(args[0])); if (k.startsWith('create')) return grad; if (k === 'measureText') return { width: 10 }; return undefined; };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  const listeners = {};
  return {
    width: 480, height: 800,
    getContext: () => ctx,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }),
    addEventListener: (n, f) => { (listeners[n] ??= []).push(f); },
    fire: (n, e) => { for (const f of listeners[n] ?? []) f(e); },
  };
}
function fakeAudio() {
  const played = [];
  let vol = 1, muted = false;
  return { played, unlock() {}, sfx(n, o) { played.push([n, o?.vol]); return true; }, bgmPlay(n) { played.push(['bgm:' + n]); }, bgmPause() {}, bgmResume() {},
    setVolume(v) { vol = v; }, getVolume() { return vol; }, setMuted(v) { muted = v; }, isMuted() { return muted; }, duck() {} };
}
function fakeStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, map: m };
}
// 봇(V3-SIM 과 같은 규칙): 가장 가까운 통/발판/게이트 최대값 칸으로 pointerX
function botX(run) {
  let best = null, bz = Infinity;
  for (const s of run.supplies) {
    if (s.missed) continue;
    for (const p of s.pads) if (!p.taken && p.z > run.z && p.z < bz) { bz = p.z; best = p.x; }
    if ((s.opened && s.kind !== 'chain') || s.locked) continue;
    if (s.z > run.z && s.z < bz) { bz = s.z; best = s.x; }
  }
  for (const row of run.gateRows) {
    if (row.passed || row.z <= run.z || row.z >= bz) continue;
    let c = null;
    for (const k of row.cells) if (!c || k.value > c.value) c = k;
    bz = row.z;
    best = c.value < 0 && row.bypass ? (c.x0 === 80 ? 320 : 160) : (c.x0 + c.x1) / 2;
  }
  return best;
}

// 가짜 window: 셸이 거는 pointerup/pointercancel/blur/keydown 리스너를 실제 결선 경로로 두드린다
function fakeWin() {
  const listeners = {};
  return {
    devicePixelRatio: 1,
    addEventListener: (n, f) => { (listeners[n] ??= []).push(f); },
    fire: (n, e = {}) => { for (const f of listeners[n] ?? []) f(e); },
  };
}

async function bootFake(opts = {}) {
  const calls = [];
  const texts = [];
  //  rec.on 을 켠 프레임만 인자까지 기록한다(버튼 상자·글자의 실제 좌표를 그리기에서 꺼내려고)
  const rec = { on: false, ops: [] };
  const canvas = fakeCanvas(calls, texts, rec);
  const win = fakeWin();
  const queue = [];
  let nowMs = 1000;
  const storage = fakeStorage();
  const save = createSave3(storage);
  const audio = fakeAudio();
  const app = boot(canvas, { win, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save, audio,
    dateNow: opts.dateNow, sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  //  프레임 n 개를 dt(ms) 간격으로 돌린다
  const frames = (n, dtMs = 1000 / 60) => { for (let i = 0; i < n; i++) { nowMs += dtMs; const f = queue.shift(); f(nowMs); } };
  return { app, canvas, win, calls, texts, rec, frames, save, audio, storage, now: () => nowMs };
}
//  랜덤 길 시드를 고정한 boot 스모크(연출·효과음까지 보려면 bootLot 이 아니라 이쪽 — 프레임·오디오 기록이 필요하다)
const bootFakeLot = (dateNow) => bootFake({ dateNow });
//  타이틀의 스테이지 1 칸을 누른다(24스테이지 목록 2열×4행의 첫 칸 = main.TITLE_GRID). 논리 좌표 = 캔버스 CSS 240×400 이므로 절반 배율
const tapStage1 = (canvas) => canvas.fire('pointerdown', { clientX: (60 + 88) / 2, clientY: (TITLE_GRID.y + TITLE_GRID.h / 2) / 2, pointerType: 'mouse' });

test('V3-SHELL: boot 스모크 — 타이틀 렌더 → 출격 → 진행 → 일시정지 중 z 정지 → 재개 → 봇 완주 → 결과·저장', async () => {
  const { app, canvas, win, calls, frames, save, audio } = await bootFake();
  frames(2);
  assert.equal(app.getState(), 'title');
  assert.ok(calls.includes('fillText') && calls.includes('drawImage') === false, '타이틀은 그림 없이 폴백으로 그려진다');
  //  타이틀 버튼 클릭(스테이지 1): 논리 좌표 = 캔버스 CSS 240×400 이므로 절반 배율
  tapStage1(canvas);
  assert.equal(app.getState(), 'run');
  //  기록은 코스 버전 + 난이도 칸에 쌓인다 — 저장이 없는 새 사용자의 초기 선택은 지옥(brutal)이므로 `${ver}:brutal` 칸이다(계약서 3-8·6)
  assert.equal(app.getDifficulty(), 'brutal', '저장 없는 첫 부팅의 초기 선택 = 지옥');
  assert.equal(save.getStage(1, stageVersion(1), 'brutal').attempts, 1, '출격 때 attempts +1');
  assert.equal(save.getStage(1, stageVersion(1)).attempts, 0, 'normal 칸은 건드리지 않는다');
  assert.equal(save.get().lastStage, 1);
  frames(60);
  const d1 = app.dbg();
  assert.ok(d1.z > 150 && d1.z < 200, '1초 = 190px 전진: ' + JSON.stringify(d1));
  assert.ok(d1.bullets > 0, '병사가 쏜다');
  //  일시정지: 프레임이 지나도 z 불변, 렌더는 계속
  app.pause();
  assert.equal(app.getState(), 'paused');
  const before = calls.length;
  frames(30);
  assert.equal(app.dbg().z, d1.z);
  assert.ok(calls.length > before, '일시정지 중에도 그린다');
  app.resume();
  frames(1);
  assert.equal(app.getState(), 'run');
  //  발사음: 프레임 1회 볼륨 = min(1, 0.4 + count/40)
  const fires = audio.played.filter((p) => p[0] === 'fire_rifle');
  assert.ok(fires.length > 0 && fires.every((p) => p[1] >= 0.4 && p[1] <= 1));
  //  봇으로 완주(마우스 호버 = pointerX)
  let guard = 0;
  while (app.getState() === 'run' && guard++ < 5000) {
    const run = app.getRun();
    app.input.state.pointerX = botX(run) ?? 240;
    frames(1);
  }
  assert.equal(app.getState(), 'result', 'guard=' + guard + ' dbg=' + JSON.stringify(app.dbg()));
  const st = save.getStage(1, stageVersion(1), 'brutal');
  assert.equal(st.cleared, true);
  assert.ok(st.bestSurvivors >= 2 && st.bestTime > 30);
  assert.ok(audio.played.some((p) => p[0] === 'elite') && audio.played.some((p) => p[0] === 'win'));
  //  결과 화면: 버튼 3개(다시 도전·다음 작전·스테이지 선택). '다음 작전' 클릭 → S2 출격
  frames(1);
  canvas.fire('pointerdown', { clientX: 120, clientY: (548 + 28) / 2, pointerType: 'mouse' });
  assert.equal(app.getState(), 'run');
  assert.equal(app.dbg().stageId, 2);
  assert.equal(save.getStage(2, stageVersion(2), 'brutal').attempts, 1);
  //  터치 드래그: 손가락 댄 위치로 튀지 않고 이동량만 반영
  frames(1);
  const x0 = app.getRun().x;
  canvas.fire('pointerdown', { clientX: 200, clientY: 300, pointerType: 'touch', pointerId: 1 });
  frames(1);
  assert.ok(Math.abs(app.getRun().tx - x0) < 5, '터치 시작만으로 tx 가 튀지 않음: ' + app.getRun().tx);
  canvas.fire('pointermove', { clientX: 230, clientY: 300, pointerType: 'touch', pointerId: 1 });
  frames(1);
  assert.ok(app.getRun().tx > x0 + 40, '드래그 +30 CSS px = +60 논리 px 만큼 tx 증가: ' + app.getRun().tx);
  //  둘째 손가락 down(멀리)·마우스 move 가 섞여도 tx 는 그대로(실제 결선: e.pointerId·e.pointerType 전달)
  const tx1 = app.getRun().tx;
  canvas.fire('pointerdown', { clientX: 40, clientY: 300, pointerType: 'touch', pointerId: 2 });
  canvas.fire('pointermove', { clientX: 20, clientY: 300, pointerType: 'mouse', pointerId: 7 });
  canvas.fire('pointermove', { clientX: 60, clientY: 300, pointerType: 'touch', pointerId: 2 });
  frames(1);
  assert.equal(app.getRun().tx, tx1, '둘째 손가락·마우스 이동은 tx 에 반영되지 않는다');
  assert.equal(app.input.state.pointerId, 1);
  //  첫 손가락 +10 CSS px → tx +20 논리 px(둘째 손가락 위치와의 거리만큼 점프하지 않음)
  canvas.fire('pointermove', { clientX: 240, clientY: 300, pointerType: 'touch', pointerId: 1 });
  frames(1);
  assert.ok(Math.abs(app.getRun().tx - (tx1 + 20)) < 1e-6, 'tx=' + app.getRun().tx + ' 기대=' + (tx1 + 20));
  //  둘째 손가락 up 은 드래그를 끝내지 않고, 첫 손가락 up 이 끝낸다(window pointerup 에 pointerId 전달)
  win.fire('pointerup', { pointerId: 2, pointerType: 'touch' });
  assert.equal(app.input.state.dragging, true);
  win.fire('pointerup', { pointerId: 1, pointerType: 'touch' });
  assert.equal(app.input.state.dragging, false);
  //  실제 키 결선: ESC → 일시정지 → ESC → 재개. blur → 자동 일시정지(드래그 해제)
  win.fire('keydown', { code: 'Escape' });
  assert.equal(app.getState(), 'paused');
  win.fire('keydown', { code: 'Escape' });
  assert.equal(app.getState(), 'run');
  canvas.fire('pointerdown', { clientX: 200, clientY: 300, pointerType: 'touch', pointerId: 3 });
  assert.equal(app.input.state.dragging, true);
  win.fire('blur');
  assert.equal(app.getState(), 'paused');
  assert.equal(app.input.state.dragging, false);
  //  스테이지 선택 → 타이틀
  app.toTitle();
  assert.equal(app.getState(), 'title');
  assert.equal(app.dbg().stageId, null);
});

test('V3-SHELL: 게이트 피격 플래시는 셸 fx 타이머(0.12s) — 피격 직후 생기고, 행 통과 뒤 12프레임(0.2s)이면 사라진다', async () => {
  const { app, frames, audio } = await bootFake();
  frames(1);
  app.startRun(1);
  const run = app.getRun();
  const row = run.gateRows[0];
  const keyOf = (idx) => row.id + ':' + idx;
  //  S1 첫 게이트 칸 위(x 320)에서 진행 → 첫 gateHit 에 fx.gateFlash 항목이 생긴다(값은 0 < v ≤ 0.12)
  let guard = 0, firstHitFrame = -1;
  while (audio.played.every((p) => p[0] !== 'gateTick') && guard++ < 600) { app.input.state.pointerX = 320; frames(1); }
  firstHitFrame = guard;
  assert.ok(guard < 600, '10초 안에 게이트 피격이 난다');
  const fx = app.getFx();
  const keys = Object.keys(fx.gateFlash);
  assert.equal(keys.length, 1, '피격된 칸 1개만 플래시: ' + JSON.stringify(fx.gateFlash));
  assert.ok(row.cells.some((c) => keys[0] === keyOf(c.idx)), '키 = rowId:idx');
  assert.ok(fx.gateFlash[keys[0]] > 0 && fx.gateFlash[keys[0]] <= BAL3.gate.flashT + 1e-9);
  //  규칙 상태의 cell.flashT 는 셸이 건드리지 않는다(읽지도 않는다)
  assert.equal(row.cells.find((c) => keyOf(c.idx) === keys[0]).flashT, BAL3.gate.flashT);
  //  행을 통과할 때까지 계속 맞히면서 진행: 그동안 값은 항상 0.12 이하(재피격은 갱신만)
  guard = 0;
  while (!row.passed && guard++ < 2000) {
    app.input.state.pointerX = 320;
    frames(1);
    for (const v of Object.values(fx.gateFlash)) assert.ok(v > 0 && v <= BAL3.gate.flashT + 1e-9, 'v=' + v);
  }
  assert.equal(row.passed, true, '행 통과');
  assert.equal(app.getState(), 'run');
  //  통과한 행은 더 맞지 않으므로 12프레임(0.2s) 뒤엔 그 행의 플래시 항목이 전부 사라진다
  frames(12);
  assert.ok(Object.keys(fx.gateFlash).every((k) => !k.startsWith(row.id + ':')), '남은 플래시: ' + JSON.stringify(fx.gateFlash));
  assert.ok(firstHitFrame > 0);
});

test('V3-SHELL: 전멸 → 결과(실패)·놓친 것 한 줄, 저장 실패면 saveOk=false', async () => {
  const bad = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  const save = createSave3(bad);
  const calls = [];
  const canvas = fakeCanvas(calls);
  const queue = [];
  let nowMs = 0;
  const app = boot(canvas, { win: null, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save, audio: fakeAudio(), sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  app.startRun(2);
  const step1 = () => { nowMs += 1000 / 60; queue.shift()(nowMs); };
  //  13.3초 진행(첫 게이트 통과·z 2300 의 우측 무기 통은 좌 통로에서 놓침) 뒤 전 유닛 hp 0 → 규칙의 정상 경로(prune → lose)로 전멸
  //  (S2 첫 게이트 −8 은 병사 2명 소총으로도 도달 전에 양수가 되어 자연 전멸이 나지 않는다)
  for (let i = 0; i < 800; i++) { app.input.state.pointerX = 150; step1(); }
  const run = app.getRun();
  assert.equal(run.over, false);
  assert.ok(run.gateRows[0].passed);
  for (const u of run.units) u.hp = 0;
  let guard = 0;
  while (app.getState() === 'run' && guard++ < 300) step1();
  assert.equal(app.getState(), 'result', 'guard=' + guard);
  assert.equal(run.won, false);
  assert.equal(run.units.length, 0);
  //  r3: 좌 통로에서 얻을 수 있던 좌 통은 열리고, 반대편 통은 '놓침'이 아니라 skipped(구조적 획득 불가)로 잡힌다
  assert.ok(run.missedSupplies >= 1 || run.skippedSupplies >= 1 || run.badGatesPassed >= 1,
    JSON.stringify({ m: run.missedSupplies, s: run.skippedSupplies, b: run.badGatesPassed }));
  assert.equal(save.ok, false);
  assert.equal(save.getStage(2, stageVersion(2)).cleared, false);
  //  결과 화면 렌더가 예외 없이 돌고 버튼은 2개(다음 작전 없음)
  nowMs += 16;
  queue.shift()(nowMs);
  assert.ok(calls.includes('fillText'));
});

test('V3-INPUT-SWITCH: 브라우저 자동반복 keydown 은 마우스 목표를 다시 지우지 않는다(셸 결선)', async () => {
  const { app, canvas, win, frames } = await bootFake();
  frames(2);
  app.startRun(1);
  frames(1);
  //  마우스 호버 x240(CSS 120 = 논리 240)
  canvas.fire('pointermove', { clientX: 120, clientY: 200, pointerType: 'mouse', pointerId: 1 });
  assert.equal(app.input.state.pointerX, 240);
  //  최초 keydown 은 마우스 목표를 지운다(키가 이긴다)
  win.fire('keydown', { code: 'ArrowRight', preventDefault() {} });
  assert.equal(app.input.state.pointerX, null);
  assert.equal(app.input.state.keyDir, 1);
  //  키를 누른 채 마우스를 움직이면 마우스가 이긴다
  //  r3.20 원근: 마우스 절대 x(화면 160)는 부대 줄(배율 near)의 역투영으로 트랙 x 가 된다(중앙 240 은 그대로)
  const mx = projectorFor('standard').unproject(160);
  canvas.fire('pointermove', { clientX: 80, clientY: 200, pointerType: 'mouse', pointerId: 1 });
  assert.equal(app.input.state.pointerX, mx);
  assert.equal(app.input.state.keyDir, 0);
  //  ★ 그 뒤 브라우저 자동반복 keydown 이 계속 와도 마우스 목표를 지우지 않는다(가드가 없으면 여기서 null 이 된다)
  let prevented = 0;
  for (let i = 0; i < 30; i++) win.fire('keydown', { code: 'ArrowRight', repeat: true, preventDefault() { prevented++; } });
  assert.equal(app.input.state.pointerX, mx, '자동반복이 마우스 목표를 지우면 안 된다');
  assert.equal(app.input.state.keyDir, 0);
  assert.equal(prevented, 30, '조향 키의 브라우저 기본 동작은 자동반복에서도 계속 막는다');
  //  3초 뒤 부대는 마우스 위치를 따라가 있다(계약서 6장 (3))
  frames(180);
  assert.ok(Math.abs(app.getRun().x - mx) < 2, 'x=' + app.getRun().x + ' 기대(화면 160 의 역투영)=' + mx.toFixed(1));
  //  ESC 의 자동반복은 일시정지를 다시 뒤집지 않는다
  win.fire('keydown', { code: 'Escape' });
  assert.equal(app.getState(), 'paused');
  win.fire('keydown', { code: 'Escape', repeat: true });
  assert.equal(app.getState(), 'paused', '자동반복 ESC 로 재개되면 안 된다');
});

test('V3-SAVE-VERSION: 코스 버전이 1 이 아니면 셸이 그 버전 칸에 기록하고 옛 버전 기록은 화면에서만 빠진다', async () => {
  //  배치 개정 담당이 DEFS[1].version 을 올린 상황을 그대로 흉내낸다(끝나면 되돌린다)
  const orig = DEFS[1].version;
  try {
    DEFS[1].version = 2;
    assert.equal(stageVersion(1), 2);
    const { app, canvas, frames, save, texts } = await bootFake();
    //  개정 전(버전 1)의 기록. 화면에서 빠지는 이유가 '버전'뿐이도록 초기 선택 난이도(지옥) 칸에 둔다
    save.updateStage(1, { cleared: true, attempts: 9, bestSurvivors: 99, bestTime: 12.5 }, 1, 'brutal');
    frames(2);
    //  스테이지 선택 화면은 현재 코스 버전(2)의 기록만 보여 준다
    assert.ok(texts.includes('미도전'), '표시된 글: ' + JSON.stringify(texts));
    assert.ok(!texts.some((t) => t.includes('99명')), 'v1 기록이 화면에 나오면 안 된다: ' + JSON.stringify(texts));
    //  출격 — attempts 는 버전 2 칸에서 1, v1 은 그대로
    tapStage1(canvas);
    assert.equal(app.getState(), 'run');
    assert.equal(app.getRun().stageVersion, 2);
    assert.equal(save.getStage(1, 2, 'brutal').attempts, 1);
    assert.equal(save.getStage(1, 1, 'brutal').attempts, 9);
    //  승리 판을 셸의 정상 경로(run.over → 여운 → finishRun)로 끝낸다
    frames(30);
    const run = app.getRun();
    run.won = true;
    run.wonAt = 55.5;
    run.over = true;
    let guard = 0;
    while (app.getState() === 'run' && guard++ < 300) frames(1);
    assert.equal(app.getState(), 'result', 'guard=' + guard);
    assert.deepEqual(save.getStage(1, 2, 'brutal'), { cleared: true, attempts: 1, bestSurvivors: run.units.length, bestTime: 55.5 });
    assert.deepEqual(save.getStage(1, 1, 'brutal'), { cleared: true, attempts: 9, bestSurvivors: 99, bestTime: 12.5 }, 'v2 기록이 v1 최고 기록을 덮지 않는다');
    assert.deepEqual(Object.keys(save.getStageVersions(1)).sort(), ['1:brutal', '2:brutal'], '옛 버전 기록은 저장에 남는다');
  } finally {
    DEFS[1].version = orig;
  }
});

test('V3-SAVE-VERSION DIFF 셸 결선: 토글 클릭·키 1/2/3 → 난이도 저장, 출격·결과 기록이 `${ver}:hard` 칸에만 쌓이고 normal 칸은 그대로, HUD·결과에 표기', async () => {
  const ver = stageVersion(1);
  const { app, canvas, win, frames, save, texts, storage } = await bootFake();
  //  저장이 없으면 초기 선택은 지옥(계약서 3-8·6) — normal 화면을 보려면 토글로 '보통'을 고른다
  assert.equal(app.getDifficulty(), 'brutal', '저장 없는 첫 부팅의 초기 선택 = 지옥');
  assert.equal(normDifficulty('zzz'), 'brutal', '모르는 값의 폴백도 초기 선택과 같다');
  win.fire('keydown', { code: 'Digit1' });
  //  normal 칸의 기존 기록
  save.updateStage(1, { cleared: true, attempts: 9, bestSurvivors: 99, bestTime: 12.5 }, ver);
  frames(2);
  assert.equal(app.getDifficulty(), 'normal');
  assert.ok(texts.some((t) => t.includes('99명')), 'normal 에서는 normal 기록이 보인다');
  assert.ok(texts.includes('보통') && texts.includes('어려움') && texts.includes('지옥'), '토글 3칸이 그려진다: ' + JSON.stringify(texts.slice(-12)));
  //  '어려움' 칸 클릭(둘째 칸). 논리 좌표 → CSS 절반 배율
  const T = DIFF_TOGGLE;
  canvas.fire('pointerdown', { clientX: (T.x0 + (T.w + T.gap) + T.w / 2) / 2, clientY: (T.y + T.h / 2) / 2, pointerType: 'mouse' });
  assert.equal(app.getState(), 'title', '토글은 출격이 아니다');
  assert.equal(app.getDifficulty(), 'hard');
  assert.equal(save.get().difficulty, 'hard', '선택은 저장에 기억');
  texts.length = 0;
  frames(1);
  assert.ok(texts.includes('미도전'), 'hard 칸은 미도전: ' + JSON.stringify(texts));
  assert.ok(!texts.some((t) => t.includes('99명')), 'normal 기록은 hard 화면에 나오지 않는다');
  //  키 1/2/3 도 같은 경로(타이틀에서만)
  win.fire('keydown', { code: 'Digit3' });
  assert.equal(app.getDifficulty(), 'brutal');
  win.fire('keydown', { code: 'Digit1' });
  assert.equal(app.getDifficulty(), 'normal');
  win.fire('keydown', { code: 'Digit2' });
  assert.equal(app.getDifficulty(), 'hard');
  //  출격: run.difficulty = hard, 적 표가 hard, attempts 는 `${ver}:hard` 칸
  tapStage1(canvas);
  assert.equal(app.getState(), 'run');
  assert.equal(app.getRun().difficulty, 'hard');
  assert.equal(app.getRun().enemyDefs.shooter.shot.dmg, 2);
  assert.equal(app.dbg().difficulty, 'hard');
  assert.equal(save.getStage(1, ver, 'hard').attempts, 1);
  assert.equal(save.getStage(1, ver).attempts, 9, 'normal 칸 불변');
  //  진행 중 숫자 키는 난이도를 바꾸지 않는다
  win.fire('keydown', { code: 'Digit3' });
  assert.equal(app.getRun().difficulty, 'hard');
  assert.equal(app.getDifficulty(), 'hard');
  //  HUD 태그
  texts.length = 0;
  frames(1);
  assert.ok(texts.includes('어려움'), 'HUD 에 난이도 표기: ' + JSON.stringify(texts));
  //  승리 판을 셸의 정상 경로(run.over → 여운 → finishRun)로 끝낸다
  frames(30);
  const run = app.getRun();
  run.won = true; run.wonAt = 55.5; run.over = true;
  let guard = 0;
  while (app.getState() === 'run' && guard++ < 300) frames(1);
  assert.equal(app.getState(), 'result', 'guard=' + guard);
  assert.deepEqual(save.getStage(1, ver, 'hard'), { cleared: true, attempts: 1, bestSurvivors: run.units.length, bestTime: 55.5 });
  assert.deepEqual(save.getStage(1, ver), { cleared: true, attempts: 9, bestSurvivors: 99, bestTime: 12.5 }, 'hard 기록이 normal 최고 기록을 덮지 않는다');
  assert.deepEqual(Object.keys(save.getStageVersions(1)).sort(), [String(ver), ver + ':hard']);
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem('starforgeRush.v3')).stages['1'].versions).sort(), [String(ver), ver + ':hard'], '저장 원문 키');
  //  결과 화면 제목 옆 표기
  texts.length = 0;
  frames(1);
  assert.ok(texts.some((t) => t.includes('어려움')), '결과 화면에 난이도 표기: ' + JSON.stringify(texts));
  //  다시 도전도 같은 난이도
  canvas.fire('pointerdown', { clientX: 120, clientY: (480 + 28) / 2, pointerType: 'mouse' });
  assert.equal(app.getState(), 'run');
  assert.equal(app.getRun().difficulty, 'hard');
  assert.equal(save.getStage(1, ver, 'hard').attempts, 2);
  //  재로드(새 boot)해도 마지막 난이도가 살아 있다
  app.toTitle();
  const s2 = createSave3(storage);
  assert.equal(s2.get().difficulty, 'hard');
  //  normal 로 돌아가면 normal 기록이 다시 보이고 HUD 에는 표기가 없다
  win.fire('keydown', { code: 'Digit1' });
  texts.length = 0;
  frames(1);
  assert.ok(texts.some((t) => t.includes('99명')));
  app.startRun(1);
  texts.length = 0;
  frames(1);
  assert.ok(!texts.includes('어려움') && !texts.includes('지옥'), 'normal HUD 에는 난이도 표기가 없다');
});

test('V3-SAVE-VERSION DIFF 새 사용자: 저장이 없으면 타이틀 초기 선택은 지옥 — 토글로 보통을 고르면 접미 없는 칸에 기록된다', async () => {
  const ver = stageVersion(1);
  const { app, canvas, frames, save, storage, texts } = await bootFake();
  //  저장 원문 자체가 없는 상태(첫 방문). 초기 선택 = 지옥(2026-09-16 이사 결정, 계약서 3-8)
  assert.equal(storage.getItem('starforgeRush.v3'), null, '아직 저장 원문이 없다');
  assert.equal(app.getDifficulty(), 'brutal');
  frames(2);
  assert.equal(app.dbg().difficulty, 'brutal', '타이틀 dbg 도 고른 값을 알린다');
  //  '보통' 칸 클릭(첫 칸). 논리 좌표 → CSS 절반 배율
  const T = DIFF_TOGGLE;
  canvas.fire('pointerdown', { clientX: (T.x0 + T.w / 2) / 2, clientY: (T.y + T.h / 2) / 2, pointerType: 'mouse' });
  assert.equal(app.getState(), 'title', '토글은 출격이 아니다');
  assert.equal(app.getDifficulty(), 'normal');
  assert.equal(save.get().difficulty, 'normal', '선택은 저장에 기억');
  //  출격 — 기록은 접미 없는 칸(`${ver}`)에만 쌓이고 지옥 칸은 비어 있다
  tapStage1(canvas);
  assert.equal(app.getState(), 'run');
  assert.equal(app.getRun().difficulty, 'normal');
  assert.equal(save.getStage(1, ver).attempts, 1);
  assert.equal(save.getStage(1, ver, 'brutal').attempts, 0, '지옥 칸은 비어 있다');
  assert.deepEqual(Object.keys(JSON.parse(storage.getItem('starforgeRush.v3')).stages['1'].versions), [String(ver)], '저장 원문 키에 난이도 접미가 없다');
  //  보통은 HUD 에 난이도를 표기하지 않는다
  texts.length = 0;
  frames(1);
  assert.ok(!texts.includes('어려움') && !texts.includes('지옥'), 'normal HUD 에는 난이도 표기가 없다: ' + JSON.stringify(texts));
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-SHELL-LOTTERY — 랜덤 길 시드 결선(계약서 3-9). 규칙 계층 검사(V3-LOTTERY)는 시드를 직접 넣어 보지만,
//  '판마다 다르다'를 만드는 것은 셸의 시드 조립(stageId·attempts·dateNow)이라 여기서만 잠글 수 있다.
//  이 검사가 없으면 main.js 에서 lotterySeed 인자를 지워도 다른 검사가 전부 통과하고, 실게임은 기본 시드 하나에 고정된다.
// ─────────────────────────────────────────────────────────────────────────────
async function bootLot(dateNow, storage = fakeStorage()) {
  const queue = [];
  const save = createSave3(storage);
  const app = boot(fakeCanvas([]), { win: null, doc: null, raf: (f) => queue.push(f), now: () => 0,
    save, audio: fakeAudio(), dateNow, sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  return { app, save, storage };
}
//  한 판 출격하고 그 판의 랜덤 길 정보를 돌려준다(결과 화면 한 줄도 같은 run.lottery 를 읽는다)
async function lotOf(t, storage) {
  const { app } = await bootLot(() => t, storage);
  app.startRun(3);
  const run = app.getRun();
  return { seed: run.lottery.seed, pick: run.lottery.pick, line: lotteryLine(run, {}) };
}

test('V3-SHELL-LOTTERY: 셸이 시계·재도전 횟수로 시드를 만든다 — 같은 시각은 재현, 시각·재도전이 바뀌면 시드가 바뀐다', async () => {
  const T = 1_700_000_000_000;
  //  ① 같은 dateNow · 같은 attempts(각각 새 저장) → 같은 시드·같은 추첨·같은 결과 한 줄
  const a = await lotOf(T), b = await lotOf(T);
  assert.equal(a.seed, b.seed, '같은 시각·같은 재도전 횟수면 시드가 재현된다');
  assert.equal(a.pick, b.pick);
  assert.equal(a.line, b.line);
  //  ② 시각만 바꾸면 시드가 달라진다
  const c = await lotOf(T + 1);
  assert.notEqual(c.seed, a.seed, '시각이 다르면 시드가 달라져야 한다');
  //  ③ [다시 도전] — 같은 시각이라도 attempts 가 오르면 시드가 바뀐다(계약서 3-9 = 재도전 동일 배치의 명시적 예외)
  const { app } = await bootLot(() => T);
  app.startRun(3);
  const first = app.getRun().lottery.seed;
  app.startRun(3);
  const second = app.getRun().lottery.seed;
  assert.equal(first, a.seed, '첫 출격은 새 저장 기준선과 같다');
  assert.notEqual(second, first, '재도전은 새 시드를 받는다');
  //  ④ 기본 시드에 고정돼 있지 않고, 시각을 흩뿌리면 실제로 다른 추첨이 나온다(로또가 살아 있다)
  const picks = new Set(), seeds = new Set();
  for (let i = 0; i < 12; i++) {
    const r = await lotOf(T + i * 86_400_000);
    assert.notEqual(r.seed, LOTTERY_DEFAULT_SEED, '셸이 기본 시드로 고정하면 안 된다');
    picks.add(r.pick);
    seeds.add(r.seed);
  }
  assert.equal(seeds.size, 12, '시각 12개 → 시드 12개');
  assert.ok(picks.size >= 2, '시각이 달라도 같은 추첨만 나온다: ' + JSON.stringify([...picks]));
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-SHELL-SHUTTER(2026-09-17 2차 검수 N2) — 셔터 안내·소리의 셸 결선.
//  규칙 계층은 셔터가 열리고 막히는 것만 알린다(gateArm·gateBlock). '언제 무슨 글을 띄우고 무슨 소리를 내는가'는
//  전부 셸이 정하므로, 이 결선이 빠지면 렌더 검사(V3-RENDER-SHUTTER)가 전부 통과해도 화면에는 아무 안내가 안 뜬다.
// ─────────────────────────────────────────────────────────────────────────────
test('V3-SHELL-SHUTTER: 첫 셔터 조우에 짧은 글 + 초보 배너 1회, 저장 seenShutter 에 기억된다', async () => {
  const { app, frames, save, audio } = await bootFake();
  assert.equal(save.get().seenShutter, false, '새 사용자는 셔터를 본 적이 없다');
  app.startRun(2);                                   // S2 첫 게이트(z1140)에 셔터가 걸려 있다
  const fx = () => app.getFx();
  let guard = 0;
  while (!fx().gateTip.g1 && guard++ < 900) frames(1);
  assert.ok(guard < 900, '셔터 행이 화면에 들어오면 짧은 글이 뜬다');
  assert.equal(fx().gateTip.g1.text, GATE_TIP_CLOSED);
  assert.ok(fx().shutterT > 0, '첫 조우 배너가 떠 있다');
  assert.deepEqual(fx().shutterText, SHUTTER_GUIDE_TEXT);
  assert.equal(save.get().seenShutter, true, '배너는 사용자당 1회 — 저장에 남는다');
  //  탄이 닫힌 셔터에 막히면 금속 튕김(색만으로 구분하지 않는다)
  guard = 0;
  while (audio.played.every((p) => p[0] !== 'gateClang') && guard++ < 900) { app.input.state.pointerX = 320; frames(1); }
  assert.ok(guard < 900, '닫힌 셔터에 막힌 탄은 소리를 낸다');
  //  열리는 순간: gateOpen 효과음 + '지금 쏘면 +1'
  guard = 0;
  while (!app.getRun().gateRows[0].armed && guard++ < 900) { app.input.state.pointerX = 320; frames(1); }
  assert.ok(guard < 900, '셔터가 열렸다');
  frames(1);
  assert.equal(fx().gateTip.g1.text, GATE_TIP_OPEN);
  assert.ok(audio.played.some((p) => p[0] === 'gateOpen'));
  //  같은 사용자의 다음 판에는 배너가 다시 뜨지 않는다(짧은 글은 그대로 뜬다)
  app.startRun(2);
  guard = 0;
  while (!app.getFx().gateTip.g1 && guard++ < 900) frames(1);
  assert.ok(guard < 900);
  assert.equal(app.getFx().shutterT, 0, '두 번째 판에는 초보 배너가 없다');
});

//  ⚠️'지금 쏘면 +1' 은 **쏘면 값이 오르는 행에만** 맞는 말이다. 랜덤 길 ⑤ 확정 −10 게이트(상한 = 자기 값)는
//   몇 발을 맞아도 −10 그대로라, 같은 화면의 '확정' 꼬리표와 정면으로 어긋난다(2026-09-17 수정 라운드 1).
//  시드를 골라 **실제 그 행이 열리는 판**까지 몰고 가서, 그 순간의 글이 무엇인지 본다.
async function armLotteryGate(pick, guardMax = 6000) {
  const T = 1_700_000_000_000;
  let chosen = null;
  for (let i = 0; i < 40 && chosen === null; i++) {
    const t = T + i * 86_400_000;
    if (buildStage(3, { lotterySeed: hashSeed('lot:3:0:' + t) }).lottery.pick === pick) chosen = t;
  }
  assert.ok(chosen !== null, pick + ' 이 걸리는 시각을 찾았다');
  const { app, frames } = await bootFakeLot(() => chosen);
  app.startRun(3);
  const run = () => app.getRun();
  assert.equal(run().lottery.pick, pick);
  const rowId = run().lottery.rowId;
  const row = () => run().gateRows.find((r) => r.id === rowId);
  assert.ok(row(), pick + ': 랜덤 길 게이트 행이 있다');
  let guard = 0;
  while (!row().armed && guard++ < guardMax) { app.input.state.pointerX = run().z >= 4000 ? 330 : 240; frames(1); }
  assert.ok(guard < guardMax, pick + ': 랜덤 길 게이트의 셔터가 열렸다');
  return { rowId, tip: app.getFx().gateTip[rowId], row: row() };
}

test('V3-SHELL-SHUTTER: 쏴도 오르지 않는 확정 행이 열릴 때는 "지금 쏘면 +1" 이 뜨지 않는다', async () => {
  //  ① 확정 −10(trapGate): 상한이 자기 값이라 값이 오르지 않는다 → 전용 문구
  const trap = await armLotteryGate('trapGate');
  assert.equal(trap.row.cells.every((c) => c.value < 0 && c.maxValue <= c.value), true, '이 행은 쏴도 오르지 않는다');
  assert.ok(trap.tip, '열리는 순간 짧은 글이 뜬다');
  assert.notEqual(trap.tip.text, GATE_TIP_OPEN, '확정 행에 "+1" 을 약속하면 칸 아래 "확정" 꼬리표와 어긋난다');
  assert.equal(trap.tip.text, GATE_TIP_OPEN_FIXED);
  //  ② 막을 수 있는 −15(badGate, 상한 0): 쏘면 실제로 오른다 → 종전 문구 그대로
  const bad = await armLotteryGate('badGate');
  assert.equal(bad.row.cells.some((c) => c.maxValue > c.value), true, '이 행은 쏘면 오른다');
  assert.equal(bad.tip.text, GATE_TIP_OPEN);
});

test('V3-SHELL-SHUTTER: isFixedGateRow — 확정 손실 행만 참(빈 행·혼합 행·양수 행은 거짓)', () => {
  assert.equal(isFixedGateRow(makeGateRow({ id: 'x', z: 100, cells: [{ x0: 0, x1: 100, value: -10, maxValue: -10 }] })), true);
  assert.equal(isFixedGateRow(makeGateRow({ id: 'x', z: 100, cells: [{ x0: 0, x1: 100, value: -15, maxValue: 0 }] })), false, '상한 0 = 무력화할 수 있다');
  assert.equal(isFixedGateRow(makeGateRow({ id: 'x', z: 100, cells: [{ x0: 0, x1: 80, value: -10, maxValue: -10 }, { x0: 80, x1: 160, value: 3 }] })), false, '한 칸이라도 오르면 확정 행이 아니다');
  assert.equal(isFixedGateRow(makeGateRow({ id: 'x', z: 100, cells: [] })), false);
  assert.equal(isFixedGateRow(null), false);
});

test('V3-SHELL-SHUTTER: 항상 열려 있는 S1 첫 게이트는 셔터가 아니다 — 그때는 배너가 뜨지 않는다', async () => {
  const { app, frames, save } = await bootFake();
  app.startRun(1);
  //  S1 g1 은 armZ null(학습용). g2(z3040)가 화면에 들어오기 전(z 2280)까지는 셔터를 본 적이 없다
  let guard = 0;
  while (app.getRun().z < 1400 && guard++ < 900) frames(1);
  assert.equal(app.getRun().gateRows[0].passed, true, '첫 게이트를 지났다');
  assert.equal(app.getRun().gateRows[0].armZ, null, '이 행은 셔터가 없다');
  assert.equal(save.get().seenShutter, false, '셔터를 본 적이 없는데 배웠다고 치지 않는다');
  assert.equal(app.getFx().shutterT, 0);
  assert.deepEqual(app.getFx().gateTip, {});
  //  g2(셔터 있음)가 들어오면 그때 뜬다
  guard = 0;
  while (!app.getFx().gateTip.g2 && guard++ < 1400) frames(1);
  assert.ok(guard < 1400, 'S1 둘째 게이트는 셔터가 걸려 있다');
  assert.equal(save.get().seenShutter, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-SHELL-LOTTERY-OUT(2026-09-17 2차 검수 N4) — 결과 문구가 실제 결과를 읽는 결선.
//  셸이 집계를 걸지 않으면 lotteryLine 은 추첨 이름으로 조용히 되돌아간다(막아낸 판도 '꽝'이라고 적힌다).
// ─────────────────────────────────────────────────────────────────────────────
test('V3-SHELL-LOTTERY-OUT: 출격이 집계 칸을 만들고, 랜덤 길이 없는 판은 만들지 않는다', async () => {
  const { app } = await bootLot(() => 1_700_000_000_000);
  app.startRun(3);
  assert.deepEqual(app.getRun().lotteryOutcome, emptyLotteryOutcome(), 'S3 는 빈 집계로 시작한다');
  app.startRun(1);
  assert.equal(app.getRun().lotteryOutcome, null, 'S1 은 랜덤 길이 없다');
});

test('V3-SHELL-LOTTERY-OUT: 위험 항목 공개는 중립 경고음이고, 피격음은 실제 손실이 날 때만 난다', async () => {
  //  확정 −10 게이트가 걸리는 시드로 우측 통로를 고른다(= 반드시 손실이 나는 판)
  const T = 1_700_000_000_000;
  let chosen = null;
  for (let i = 0; i < 40 && !chosen; i++) {
    const t = T + i * 86_400_000;
    const seed = hashSeed('lot:3:0:' + t);
    if (buildStage(3, { lotterySeed: seed }).lottery.pick === 'trapGate') chosen = t;
  }
  assert.ok(chosen, '확정 손실 게이트가 걸리는 시각을 찾았다');
  const { app, audio, frames } = await bootFakeLot(() => chosen);
  app.startRun(3);
  const run = () => app.getRun();
  let guard = 0, revealSfx = null;
  //  공개선(revealZ)을 넘기는 **그 프레임에 난 소리**만 따로 본다(앞뒤 전투음에 휩쓸리지 않게)
  while (revealSfx === null && guard++ < 4000) {
    const before = audio.played.length;
    app.input.state.pointerX = run().z >= 4000 ? 330 : 240;
    frames(1);
    if (app.getFx().lotSeen) revealSfx = audio.played.slice(before).map((p) => p[0]);
  }
  assert.ok(guard < 4000, '랜덤 길 공개선까지 왔다');
  assert.equal(run().lottery.pick, 'trapGate');
  assert.ok(revealSfx.includes('lotWarn'), '위험 항목 공개 = 중립 경고음: ' + JSON.stringify(revealSfx));
  assert.ok(!revealSfx.includes('hurt'), '공개만으로 피격음을 내지 않는다: ' + JSON.stringify(revealSfx));
  //  실제로 게이트를 통과해 병력을 잃는 순간에 피격음이 난다
  guard = 0;
  let lossSfx = null;
  while (lossSfx === null && guard++ < 1200) {
    const before = audio.played.length;
    app.input.state.pointerX = 330;
    frames(1);
    if (run().lotteryOutcome.passed) lossSfx = audio.played.slice(before).map((p) => p[0]);
  }
  assert.ok(guard < 1200, '확정 손실 게이트를 통과했다');
  assert.equal(run().lotteryOutcome.applied, -10);
  assert.ok(lossSfx.includes('hurt'), '실제 손실이 나는 프레임에 피격음: ' + JSON.stringify(lossSfx));
  assert.equal(lotteryLine(run()), '랜덤 길: 함정 피해 −10명');
});

//  랜덤 길 추첨이 pick 으로 걸리는 시각(셸의 시드 조립 규칙 그대로) — 검사는 결정적이어야 한다
function lotteryTimeFor(pick, base = 1_700_000_000_000) {
  for (let i = 0; i < 40; i++) {
    const t = base + i * 86_400_000;
    if (buildStage(3, { lotterySeed: hashSeed('lot:3:0:' + t) }).lottery.pick === pick) return t;
  }
  return null;
}

/** S3 를 우측 통로 고정으로 굴리며 함정/꽝 게이트 행의 소리를 **'?' 가 걷히기 전 / 걷힌 뒤·개시선 전** 두 창으로 나눠 모은다.
 *  ⚠️창을 나누지 않으면 공개 전에 난 소리만으로도 '함정 소리가 난다'가 통과해 버린다(2026-09-17 수정 라운드 1 지적 1).
 *  ⚠️소리를 고르는 것은 handleEvents 이고 그 판단 기준이 **그 프레임의 run.z** 이므로, 프레임을 돌린 뒤의 z 로 나눠야 코드와 같은 창이 된다. */
async function trapWindows(pick) {
  const when = lotteryTimeFor(pick);
  assert.ok(when, pick + ': 그 추첨이 걸리는 시각을 찾았다');
  const boot = await bootFakeLot(() => when);
  const { app, audio, frames } = boot;
  app.startRun(3);
  const run = () => app.getRun();
  const rowId = run().lottery.rowId;
  const row = () => run().gateRows.find((r) => r.id === rowId);
  //  앞 게이트(z4000)의 소리가 섞이지 않게 z 4200 이후부터 듣는다
  let guard = 0;
  while (run().z < 4200 && guard++ < 4000) { app.input.state.pointerX = run().z >= 4000 ? 330 : 240; frames(1); }
  assert.ok(guard < 4000, pick + ': z4200 까지 왔다');
  const hidden = [], shownClosed = [];
  let tipWhileClosed = 'none';
  guard = 0;
  while (!row().armed && guard++ < 4000) {
    const from = audio.played.length;
    app.input.state.pointerX = 330;
    frames(1);
    const heard = audio.played.slice(from).map((p) => p[0]);
    (run().z < run().lottery.revealZ ? hidden : shownClosed).push(...heard);
    //  ⚠️행이 열리는 프레임에는 '쏴도 그대로예요'(열림 문구)가 들어온다 — 닫힌 동안만 본다
    if (run().z >= run().lottery.revealZ && !row().armed && app.getFx().gateTip[rowId]) tipWhileClosed = app.getFx().gateTip[rowId].text;
  }
  assert.ok(guard < 4000, pick + ': 개시선까지 왔다');
  return { ...boot, run, row, rowId, hidden, shownClosed, tipWhileClosed };
}
const kinds = (list) => [...new Set(list)].sort();

test('V3-SHELL-TRAP: 함정 게이트에 막힌 탄은 둔탁한 차단음(trapHit) — 셔터의 금속 튕김·숫자음을 쓰지 않는다', async () => {
  //  ⚠️소리는 규칙이 아니라 셸이 고른다. 화면을 봉쇄 장치로 바꿔 놓고 소리만 셔터(gateClang)로 두면
  //   '잠깐 막힌 것'과 '아예 안 먹히는 장치'가 다시 섞인다(2026-09-17 이사 결정 ③).
  const { app, audio, frames, run, rowId, shownClosed, tipWhileClosed } = await trapWindows('trapGate');
  assert.equal(run().lottery.pick, 'trapGate');
  //  ① 은 **공개 뒤·개시선 전** 창에서만 본다 — 공개 전 소리로 통과하면 안 된다
  assert.ok(shownClosed.includes('trapHit'), '공개 뒤 막힌 탄에 둔탁한 차단음: ' + JSON.stringify(kinds(shownClosed)));
  assert.ok(!shownClosed.includes('gateClang'), '공개 뒤에는 셔터의 금속 튕김을 쓰지 않는다: ' + JSON.stringify(kinds(shownClosed)));
  //  공개된 뒤에도 '가까워지면 열림' 은 뜨지 않는다 — 이 행에서는 지킬 수 없는 약속이다
  assert.equal(tipWhileClosed, 'none', '함정 행에 닫힘 안내를 띄우지 않는다: ' + tipWhileClosed);
  //  열린 뒤 맞는 탄도 같은 차단음(값이 그대로라 숫자음·흰 플래시를 쓰지 않는다)
  const from2 = audio.played.length;
  let guard = 0;
  while (!run().lotteryOutcome.passed && guard++ < 1200) { app.input.state.pointerX = 330; frames(1); }
  assert.ok(guard < 1200, '함정 게이트를 통과했다');
  const heard2 = audio.played.slice(from2).map((p) => p[0]);
  assert.ok(heard2.includes('trapHit'), '열린 뒤에도 차단음: ' + JSON.stringify(kinds(heard2)));
  assert.ok(!heard2.includes('gateTick'), '값이 안 오르는 칸에 숫자 증가음을 내지 않는다: ' + JSON.stringify(kinds(heard2)));
  assert.deepEqual(app.getFx().gateFlash, {}, '값이 안 오르므로 흰 플래시도 없다');
  assert.equal(rowId, run().lottery.rowId);
});

test('V3-SHELL-TRAP: 확정선 전에는 함정도 꽝 게이트와 똑같이 들린다 — 통로를 고르기 전에 내용이 새지 않는다', async () => {
  //  ⚠️'?' 상자는 눈만 가린다. 확정선 전에도 비행 중인 탄은 막히고(gateBlock), 그 막힘에 함정 전용 소리·색을 쓰면
  //   플레이어가 통로를 고르기 **약 300px 전에** '이번 판은 함정'임을 알아낸다(계약서 3-9, 2026-09-17 수정 라운드 1 지적 1).
  const trap = await trapWindows('trapGate');
  const bad = await trapWindows('badGate');
  assert.equal(trap.run().lottery.revealZ, bad.run().lottery.revealZ, '두 판의 확정선이 같다(같은 벽)');
  //  ① 확정선 전 창에 실제로 막힘이 있었다 — 창이 비어 있으면 아래 단언들이 공짜로 통과한다
  assert.ok(trap.hidden.length > 0 && bad.hidden.length > 0, '확정선 전에 들린 소리가 있다(창이 비지 않았다)');
  assert.ok(trap.hidden.includes('gateClang'), '확정선 전 막힌 탄은 종전 셔터 소리로 들린다: ' + JSON.stringify(kinds(trap.hidden)));
  //  ② 함정 전용 소리는 확정선 전에 한 번도 나지 않는다
  assert.equal(trap.hidden.filter((n) => n === 'trapHit').length, 0, '확정선 전 trapHit 0건: ' + JSON.stringify(kinds(trap.hidden)));
  //  ③ 함정 판과 꽝 판이 확정선 전에는 **같은 소리 집합**이다(귀로 두 갈래를 가를 수 없다)
  assert.deepEqual(kinds(trap.hidden), kinds(bad.hidden), '확정선 전 소리 집합이 두 판에서 같다');
  //  ④ 갈라지는 것은 공개 뒤부터다 — 함정만 trapHit, 꽝은 종전 gateClang
  assert.ok(trap.shownClosed.includes('trapHit'), '공개 뒤 함정은 차단음: ' + JSON.stringify(kinds(trap.shownClosed)));
  assert.ok(!bad.shownClosed.includes('trapHit'), '꽝 게이트는 공개 뒤에도 차단음을 쓰지 않는다: ' + JSON.stringify(kinds(bad.shownClosed)));
  assert.ok(bad.shownClosed.includes('gateClang'), '꽝 게이트는 공개 뒤에도 셔터 소리: ' + JSON.stringify(kinds(bad.shownClosed)));
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-SHELL-RESULT-LAYOUT(2026-09-17 2차 검수 후속) — 결과 화면 버튼 자리의 **셸 결선**.
//  [다시 도전] 아래 부연 한 줄(render.RETRY_LOTTERY_NOTE)은 render 가 그리지만, 그 글이 들어갈 자리를 비워 두는 것은
//  셸(main.js view() 의 noteGap)이다. ⚠️표현 검사(V3-RENDER-TRAP)는 buttons 를 **직접 만들어 넣어** 그리므로
//  셸의 자리 계산을 한 줄도 밟지 않는다 — noteGap 을 0 으로 지워도 그 검사는 통과하고, 실게임에서만 글이 아래 버튼에 깔린다.
//  그래서 여기서는 실제로 한 판을 굴려 결과 화면을 **그린 뒤**, 찍힌 글과 버튼 상자의 좌표를 화면에서 꺼내 본다.
// ─────────────────────────────────────────────────────────────────────────────

//  drawButtons 는 버튼마다 둥근 상자를 두 번(채우기·테두리) 그린 뒤 글자를 찍는다.
//  render 의 roundRect = moveTo + arcTo×4 이고, 첫 arcTo 인자가 (x+w, y, x+w, y+h, r) · 셋째가 (x, y+h, x, y, r) 이라
//  글자 바로 앞 arcTo 8개에서 두 겹의 상자를 되살릴 수 있다. 주 버튼은 안쪽 상자가 1px 작으므로 **바깥쪽**이 셸이 정한 자리다.
function buttonBoxOf(ops, label) {
  const i = ops.findIndex((o) => o.op === 'fillText' && o.args[0] === label);
  assert.ok(i >= 0, '화면에 [' + label + '] 글자가 있다');
  const arcs = [];
  for (let j = i - 1; j >= 0 && arcs.length < 8; j--) if (ops[j].op === 'arcTo') arcs.unshift(ops[j].args);
  assert.equal(arcs.length, 8, '[' + label + '] 앞에 버튼 상자 두 겹(arcTo 8개)이 있다');
  const box = (a, c) => ({ left: c[0], top: a[1], right: a[0], bottom: a[3] });
  const [b1, b2] = [box(arcs[0], arcs[2]), box(arcs[4], arcs[6])];
  return b1.top <= b2.top ? b1 : b2;
}

//  딱 한 프레임만 좌표까지 기록해 돌려준다(그 판의 결과 화면이 실제로 그려진 모습)
function recordFrame(b) {
  b.rec.ops.length = 0;
  b.rec.on = true;
  b.frames(1);
  b.rec.on = false;
  return b.rec.ops;
}

//  봇 정책(위 스모크와 같은 botX)으로 결과 화면까지 굴린다
async function botToResult(b, stageId, guardMax = 20000) {
  b.app.startRun(stageId);
  let guard = 0;
  while (b.app.getState() === 'run' && guard++ < guardMax) {
    b.app.input.state.pointerX = botX(b.app.getRun()) ?? 240;
    b.frames(1);
  }
  assert.equal(b.app.getState(), 'result', 'S' + stageId + ' 가 결과 화면까지 갔다 guard=' + guard);
}

test('V3-SHELL-RESULT-LAYOUT: 랜덤 길이 있는 판은 셸이 아래 버튼을 부연 한 줄만큼 내린다 — 글이 버튼에 깔리지 않는다', async () => {
  //  시드 고정(셸의 조립 규칙 그대로) — S3 는 어느 시드로도 랜덤 길이 있는 판이라 결과에 부연이 뜬다
  const b = await bootFakeLot(() => 1_700_000_000_000);
  await botToResult(b, 3);
  const ops = recordFrame(b);
  //  ① 부연이 실제로 찍혔다
  const note = ops.find((o) => o.op === 'fillText' && o.args[0] === RETRY_LOTTERY_NOTE);
  assert.ok(note, '랜덤 길 판의 결과 화면에 부연 한 줄이 찍힌다');
  const retry = buttonBoxOf(ops, '다시 도전');
  assert.equal(retry.top, 480, '[다시 도전] 은 제자리');
  assert.equal(note.args[1], (retry.left + retry.right) / 2, '부연은 [다시 도전] 가운데 정렬');
  assert.ok(note.args[2] > retry.bottom, '부연은 [다시 도전] 아래: 글 y=' + note.args[2] + ' 버튼 아래끝=' + retry.bottom);
  //  ② 그 아래 버튼(S3 는 4 로 이어지므로 [다음 작전], 마지막 판이면 [스테이지 선택])이 부연과 겹치지 않는다
  const hasNext = ops.some((o) => o.op === 'fillText' && o.args[0] === '다음 작전');
  const below = buttonBoxOf(ops, hasNext ? '다음 작전' : '스테이지 선택');
  assert.equal(below.bottom - below.top, hasNext ? 56 : 44, '아래 버튼 상자를 제대로 집었다');
  assert.ok(note.args[2] + 4 <= below.top,
    '부연 아래로 버튼이 내려와야 한다 — 글 y=' + note.args[2] + ' 아래 버튼 top=' + below.top + '(셸의 noteGap 이 0 이면 여기서 깔린다)');
  //  ③ 내려온 양 = 부연 한 줄 자리(22px). 기본 자리는 [다음 작전] 548 / [스테이지 선택] 552(아래 대조군과 같은 수)
  assert.equal(below.top, (hasNext ? 548 : 552) + 22, '아래 버튼이 기본 자리에서 22px 내려와 있다');
});

test('V3-SHELL-RESULT-LAYOUT: 랜덤 길이 없는 판(대조군)은 부연이 없고 버튼이 기본 자리 그대로다', async () => {
  const b = await bootFake();
  await botToResult(b, 1);
  const ops = recordFrame(b);
  assert.ok(!ops.some((o) => o.op === 'fillText' && o.args[0] === RETRY_LOTTERY_NOTE), '랜덤 길이 없으면 부연도 없다');
  //  봇은 S1 을 깬다 → [다음 작전] 이 있는 배치(548·620). 자리를 내리는 일이 없어야 한다
  assert.equal(buttonBoxOf(ops, '다시 도전').top, 480);
  assert.equal(buttonBoxOf(ops, '다음 작전').top, 548, '기본 자리');
  assert.equal(buttonBoxOf(ops, '스테이지 선택').top, 620, '기본 자리');
});

//  r3.20: 확대 보기 → '가까이' 토글(원근 강도). 저장 필드 zoom 은 그대로, 칩 글자만 '가까이 ○/●'
test('V3-ZOOM 셸: 가까이 토글은 출격 중 Z 키·HUD 칩으로 켜고 끄며 저장(zoom)에 기억되고, 타이틀에서는 Z 가 무시된다', async () => {
  const { app, canvas, win, frames, save, texts } = await bootFake();
  frames(2);
  assert.equal(app.getZoom(), false, '저장 없는 첫 부팅 = 꺼짐');
  win.fire('keydown', { code: 'KeyZ' });
  assert.equal(app.getZoom(), false, '타이틀에서는 Z 무시');
  tapStage1(canvas);
  assert.equal(app.getState(), 'run');
  win.fire('keydown', { code: 'KeyZ' });
  assert.equal(app.getZoom(), true, 'Z 로 켜짐');
  assert.equal(save.get().zoom, true, '저장에 기억');
  frames(1);
  assert.ok(texts.includes(ZOOM.label.on), 'HUD 칩이 켜짐 표시: ' + JSON.stringify(texts.filter((t) => t.startsWith('가까이'))));
  assert.equal(ZOOM.label.on, '가까이 ●'); assert.equal(ZOOM.label.off, '가까이 ○');
  assert.equal(app.dbg().perspective, 'close', '켜짐 = 가까이 투영');
  //  HUD 칩 클릭(논리 좌표 = 캔버스 CSS 240×400 이므로 절반 배율) → 꺼짐
  canvas.fire('pointerdown', { clientX: (ZOOM.chip.x + ZOOM.chip.w / 2) / 2, clientY: (ZOOM.chip.y + ZOOM.chip.h / 2) / 2, pointerType: 'mouse' });
  assert.equal(app.getZoom(), false, '칩 클릭으로 꺼짐');
  assert.equal(save.get().zoom, false);
  assert.equal(app.dbg().perspective, 'standard', '꺼짐 = 표준 원근');
  assert.equal(app.getState(), 'run', '칩 클릭은 조향·일시정지가 아니다');
  //  다시 켜고 일시정지해도 켜진 채 — 재부팅 시 저장값으로 시작
  win.fire('keydown', { code: 'KeyZ' });
  win.fire('keydown', { code: 'Escape' });
  assert.equal(app.getState(), 'paused');
  assert.equal(app.getZoom(), true);
});
