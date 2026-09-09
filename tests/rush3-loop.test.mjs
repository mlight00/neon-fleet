// rush3-loop — 셸 묶음(계약서 8장 V3-DETERMINISM·V3-INPUT + boot 스모크). DOM 없이 main.js 를 import 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hitButton, makeLoop, boot, missedLine, timeText } from '../rush3/main.js';
import { createInput } from '../rush3/input.js';
import { createRun, stepRun, STEP } from '../rush3/combat.js';
import { buildStage } from '../rush3/stages.js';
import { createSave3 } from '../rush3/save.js';
import { BAL3 } from '../rush3/balance.js';

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
  assert.deepEqual(inp.snapshot(), { pointerX: 300, dragDx: 0, keyDir: 0 });
  // 터치 시작: 절대 위치 무시(pointerX null), 이동량만 누적
  inp.onPointerDown(400, 'touch');
  let s = inp.snapshot();
  assert.equal(s.pointerX, null, '손가락 댄 위치로 튀지 않는다');
  assert.equal(s.dragDx, 0);
  assert.equal(inp.state.dragging, true);
  inp.onPointerMove(420, 'touch');
  inp.onPointerMove(410, 'touch');
  s = inp.snapshot();
  assert.deepEqual(s, { pointerX: null, dragDx: 10, keyDir: 0 });
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
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0 });
  inp.onPointerMove(330, 'mouse');
  inp.reset();
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0 });
  // 드래그 중 마우스 이벤트가 섞여도 절대 x 로 튀지 않고 dragDx 에도 누적되지 않는다
  inp.onPointerDown(100, 'touch');
  inp.onPointerMove(150, 'mouse');
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0 });
  inp.onPointerMove(110, 'touch');
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 10, keyDir: 0 }, '마우스 혼입 뒤 손가락 이동은 손가락 이동량만');
  inp.onPointerDown(300, 'mouse');
  inp.onPointerMove(120, 'touch');
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 10, keyDir: 0 }, '드래그 중 마우스 down 도 lastX 를 덮어쓰지 않는다');
});

test('V3-INPUT: 두 손가락 — 둘째 손가락의 down/move/up 은 첫 손가락 드래그에 섞이지 않는다', () => {
  const inp = createInput();
  inp.onPointerDown(100, 'touch', 1);
  inp.onPointerMove(110, 'touch', 1);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 10, keyDir: 0 });
  // 둘째 손가락 down(멀리) → 첫 손가락 move: 첫 손가락 이동량만 누적(두 손가락 거리만큼 점프 없음)
  inp.onPointerDown(300, 'touch', 2);
  assert.equal(inp.state.pointerId, 1, '드래그 주인은 첫 손가락 그대로');
  inp.onPointerMove(120, 'touch', 1);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 10, keyDir: 0 });
  // 둘째 손가락 move 는 무시
  inp.onPointerMove(350, 'touch', 2);
  inp.onPointerMove(340, 'touch', 2);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 0, keyDir: 0 });
  // 둘째 손가락 up 은 드래그를 끝내지 않는다 → 첫 손가락 이동 계속 반영
  inp.onPointerUp(2);
  assert.equal(inp.state.dragging, true);
  inp.onPointerMove(125, 'touch', 1);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: 5, keyDir: 0 });
  // 첫 손가락 up → 드래그 종료. 이후 둘째 손가락이 새로 down 하면 그 손가락이 새 드래그(댄 위치로 튀지 않음)
  inp.onPointerUp(1);
  assert.equal(inp.state.dragging, false);
  assert.equal(inp.state.pointerId, null);
  inp.onPointerDown(300, 'touch', 2);
  inp.onPointerMove(290, 'touch', 2);
  assert.deepEqual(inp.snapshot(), { pointerX: null, dragDx: -10, keyDir: 0 });
  // 드래그 중 pointercancel 은 손가락과 무관하게 reset
  inp.onPointerCancel();
  assert.deepEqual(inp.state, { pointerX: null, dragDx: 0, keyDir: 0, dragging: false, pointerId: null, lastX: null, left: false, right: false });
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
function fakeCanvas(calls) {
  const grad = { addColorStop() {} };
  const ctx = new Proxy({ canvas: null }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => { calls.push(k); if (k.startsWith('create')) return grad; if (k === 'measureText') return { width: 10 }; return undefined; };
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

async function bootFake() {
  const calls = [];
  const canvas = fakeCanvas(calls);
  const win = fakeWin();
  const queue = [];
  let nowMs = 1000;
  const storage = fakeStorage();
  const save = createSave3(storage);
  const audio = fakeAudio();
  const app = boot(canvas, { win, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save, audio, sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  //  프레임 n 개를 dt(ms) 간격으로 돌린다
  const frames = (n, dtMs = 1000 / 60) => { for (let i = 0; i < n; i++) { nowMs += dtMs; const f = queue.shift(); f(nowMs); } };
  return { app, canvas, win, calls, frames, save, audio, storage, now: () => nowMs };
}

test('V3-SHELL: boot 스모크 — 타이틀 렌더 → 출격 → 진행 → 일시정지 중 z 정지 → 재개 → 봇 완주 → 결과·저장', async () => {
  const { app, canvas, win, calls, frames, save, audio } = await bootFake();
  frames(2);
  assert.equal(app.getState(), 'title');
  assert.ok(calls.includes('fillText') && calls.includes('drawImage') === false, '타이틀은 그림 없이 폴백으로 그려진다');
  //  타이틀 버튼 클릭(스테이지 1): 논리 좌표 = 캔버스 CSS 240×400 이므로 절반 배율
  canvas.fire('pointerdown', { clientX: 120, clientY: (436 + 31) / 2, pointerType: 'mouse' });
  assert.equal(app.getState(), 'run');
  assert.equal(save.getStage(1).attempts, 1, '출격 때 attempts +1');
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
  const st = save.getStage(1);
  assert.equal(st.cleared, true);
  assert.ok(st.bestSurvivors >= 2 && st.bestTime > 30);
  assert.ok(audio.played.some((p) => p[0] === 'elite') && audio.played.some((p) => p[0] === 'win'));
  //  결과 화면: 버튼 3개(다시 도전·다음 작전·스테이지 선택). '다음 작전' 클릭 → S2 출격
  frames(1);
  canvas.fire('pointerdown', { clientX: 120, clientY: (548 + 28) / 2, pointerType: 'mouse' });
  assert.equal(app.getState(), 'run');
  assert.equal(app.dbg().stageId, 2);
  assert.equal(save.getStage(2).attempts, 1);
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
  assert.ok(run.missedSupplies >= 1 || run.badGatesPassed >= 1, JSON.stringify({ m: run.missedSupplies, b: run.badGatesPassed }));
  assert.equal(save.ok, false);
  assert.equal(save.getStage(2).cleared, false);
  //  결과 화면 렌더가 예외 없이 돌고 버튼은 2개(다음 작전 없음)
  nowMs += 16;
  queue.shift()(nowMs);
  assert.ok(calls.includes('fillText'));
});
