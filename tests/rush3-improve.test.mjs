// rush3-improve — 개선 루프(2026-09-27~, newmode/v3/loop/)가 고친 화면 결함을 지키는 검사. **그리기만 — 규칙 불변**.
//  IMP-1(r4.15): 떠오르는 글(fx.floaters)이 화면 가장자리에서 생겨도 글 전체가 화면(0~480) 안에 그려진다 — 24판 자동 점검(r4.13)이
//   7번 판 왼쪽 끝 캡슐의 '캡슐 놓침'(x −24~72)을 찾았다. 셸의 floater 좌표는 그대로 두고 그릴 때만 안쪽으로 당긴다
//  IMP-2(r4.18): 주소 뒤 ?fps=1 일 때만 게임 중 화면 오른쪽 아래에 초당 프레임 수·가장 느린 프레임·캔버스 화소를 보인다(없으면 아무것도 안 그린다)
//  IMP-3(r4.19): 누름 여유 — 정확히 누른 버튼이 없을 때만 작은 버튼의 누름 범위를 최소 TOUCH_MIN(54)까지 넓힌다(그림·hitButton 불변)
//  IMP-4(r4.20): 휴대폰 글자 크기 — 원근으로 줄지 않는 고정 크기 글은 14 논리 px 이상(휴대폰 390 폭 11.4px). 게이트 안내선 글은 달리면서 읽는 글이라 15px + 도로 오른쪽 끝 안(maxWidth).
//   예외(그대로): 스테이지 칸 '이전 기록' 줄 11px(D9′ 작고 흐리게) · ?fps=1 개발용 표시 · 원근으로 줄어드는 세계 글(적 체력 숫자 등 — 거리감)
//  IMP-5(r4.21): 타이틀 스테이지 칸 기록의 시간은 짧은 표기 'm:ss'(timeShort — 초 아래 버림). 긴 기록('1분 47.4초 · 구출✓')이 칸 폭을 넘쳐 78% 로 눌렸다. 결과 화면은 timeText 그대로
//  IMP-6(r4.22): 큰 화면 선명도 — 화소 수(canvas.width)를 바꾸면 캔버스 기본 크기가 바뀌어 보이는 크기도 커지는 화면(태블릿·노트북)에서, 불러온 직후부터 화소 = 보이는 크기 × min(배율, 2)
//  IMP-7(r4.24): 90Hz·144Hz 매끄럽게 — 고정 스텝(60Hz) 사이 프레임에는 그리는 카메라 z 만 남은 시간만큼 앞당긴다(외삽). 정확히 60Hz 면 카메라 = run.z(종전과 같다)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer3, ARM_LINE_TEXT } from '../rush3/render.js';
import { projectorFor, projectorMode } from '../rush3/project.js';
import { createRun } from '../rush3/combat.js';
import { buildStage } from '../rush3/stages.js';
import { makeFx, hitButton, hitButtonTouch, TOUCH_MIN, HUD_BTN, timeShort, timeText, prevRecordLine } from '../rush3/main.js';
import { stageVersion } from '../rush3/stages.js';
import { BAL3 } from '../rush3/balance.js';
import { bootApp, fakeCanvas, fakeAudio, memStorage } from './lib/rush3-shell.mjs';
import { boot } from '../rush3/main.js';
import { createSave3 } from '../rush3/save.js';

const W = BAL3.view.w;
//  글 폭 = 글자 수 × 12px 로 재는 기록용 ctx
function recCtx() {
  const ops = [], state = { canvas: null, font: '', fillStyle: '', strokeStyle: '', globalAlpha: 1, textAlign: '', textBaseline: '', lineWidth: 1 };
  const ctx = new Proxy(state, {
    get(t, k) { if (k in t) return t[k]; if (typeof k !== 'string') return undefined;
      return (...a) => { ops.push({ op: k, args: a, align: t.textAlign, lw: t.lineWidth }); if (k === 'measureText') return { width: String(a[0]).length * 12 }; return k.startsWith('create') ? { addColorStop() {} } : undefined; }; },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}

test('IMP-1: 떠오르는 글은 화면 밖으로 잘리지 않는다 — 왼쪽 끝(x −10)·오른쪽 끝(x 500)에서 생긴 글도 글 폭 절반 + 외곽선만큼 안쪽에 그린다 · 가운데 글은 그 자리 그대로 · 셸의 floater 좌표는 바꾸지 않는다', () => {
  const run = createRun(buildStage(1));
  const fx = makeFx();
  fx.floaters.push({ x: -10, y: 400, text: '캡슐 놓침', color: '#fff', t: 0, life: 1 });
  fx.floaters.push({ x: 500, y: 450, text: '+12명', color: '#fff', t: 0, life: 1, big: true });
  fx.floaters.push({ x: 240, y: 500, text: '같은 무기', color: '#fff', t: 0, life: 1 });
  const snap = JSON.stringify(fx.floaters);
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx, hud: { distM: 0 }, buttons: [], saveOk: true });
  assert.equal(JSON.stringify(fx.floaters), snap, '셸 좌표 그대로');
  const at = (text) => ops.find((o) => o.op === 'fillText' && o.args[0] === text);
  for (const f of fx.floaters) {
    const op = at(f.text);
    assert.ok(op, f.text + ' 그림');
    assert.equal(op.align, 'center');
    const half = f.text.length * 12 / 2 + op.lw;
    assert.ok(op.args[1] - half >= 0 && op.args[1] + half <= W, `${f.text}: ${op.args[1] - half} ~ ${op.args[1] + half} 가 0 ~ ${W} 안`);
  }
  assert.equal(at('같은 무기').args[1], 240, '가운데 글은 제자리');
});

test('IMP-2: ?fps=1 성능 표시 — 게임 중에만 오른쪽 아래에 "N fps · 느린 프레임 Nms"·"캔버스 W×H" · 60Hz 프레임이면 약 60 fps · 타이틀에는 없다 · 주소에 없으면 어디에도 없다', async () => {
  const h = await bootApp({ search: '?fps=1' });
  assert.ok(!h.textNow().some((t) => t.includes(' fps')), '타이틀에는 그리지 않는다');
  h.app.startRun(1);
  h.frames(90);
  const texts = h.textNow();
  const line = texts.find((t) => / fps · 느린 프레임 \d+ms$/.test(t));
  assert.ok(line, '성능 줄: ' + JSON.stringify(texts.slice(-6)));
  const fps = +line.split(' ')[0];
  assert.ok(fps >= 55 && fps <= 65, '60Hz 가짜 rAF → 약 60 fps: ' + fps);
  assert.ok(texts.some((t) => /^캔버스 \d+×\d+$/.test(t)), '캔버스 화소 줄');
  const box = h.texts.find((t) => / fps · /.test(t.text));
  assert.ok(box.x > BAL3.view.w / 2 && box.y > BAL3.view.h - 60, '오른쪽 아래: ' + box.x + ',' + box.y);
  const g = await bootApp({});
  g.app.startRun(1);
  g.frames(60);
  assert.ok(!g.textNow().some((t) => t.includes(' fps') || t.startsWith('캔버스 ')), '주소에 ?fps=1 이 없으면 없다');
});

test('IMP-3: 누름 여유 — 정확히 누른 버튼이 먼저 · 작은 버튼(⏸ 44×36)은 아래로 9px 벗어나도 눌린다 · 넓힌 범위가 겹치면 실제 상자에 가까운 쪽 · 큰 버튼은 넓히지 않는다 · 흐린 버튼은 여전히 안 눌린다 · hitButton(정확 판정)은 그대로', () => {
  assert.equal(TOUCH_MIN, 54);
  const small = { id: 'p', x: 400, y: 10, w: 44, h: 36 };
  const big = { id: 'big', x: 100, y: 300, w: 240, h: 56 };
  const dis = { id: 'd', x: 10, y: 200, w: 60, h: 30, disabled: true };
  const bs = [small, big, dis];
  assert.equal(hitButtonTouch(bs, 420, 20), 'p', '정확히 누름');
  assert.equal(hitButton(bs, 420, 52), null, '정확 판정은 그대로(상자 밖)');
  assert.equal(hitButtonTouch(bs, 420, 54), 'p', '상자 아래 8px — 누름 여유 안(세로 (54−36)/2 = 9)');
  assert.equal(hitButtonTouch(bs, 420, 56), null, '여유 밖(10px)');
  assert.equal(hitButtonTouch(bs, 397, 20), 'p', '가로 여유(54−44)/2 = 5 → 왼쪽 3px 도');
  assert.equal(hitButtonTouch(bs, 220, 297), null, '큰 버튼(56 높이)은 넓히지 않는다');
  assert.equal(hitButtonTouch(bs, 40, 190), null, '흐린 버튼은 여유 안이어도 안 눌린다');
  //  겹치는 여유: 위아래로 6px 떨어진 두 작은 버튼 — 사이를 누르면 가까운 쪽
  const a = { id: 'a', x: 0, y: 0, w: 100, h: 40 }, b = { id: 'b', x: 0, y: 46, w: 100, h: 40 };
  assert.equal(hitButtonTouch([a, b], 50, 41), 'a');
  assert.equal(hitButtonTouch([a, b], 50, 45), 'b');
});

test('IMP-3b: 셸 — 게임 중 ⏸ 그린 상자 바로 아래(여유 안)를 누르면 일시정지 · 여유 밖을 누르면 일시정지하지 않는다', async () => {
  const h = await bootApp({});
  h.app.startRun(1);
  h.frames(10);
  const padY = (TOUCH_MIN - HUD_BTN.h) / 2;
  h.tap(HUD_BTN.x + HUD_BTN.w / 2, HUD_BTN.y + HUD_BTN.h + padY + 12);
  h.frames(2);
  assert.equal(h.app.getState(), 'run', '여유 밖 = 조향(일시정지 아님)');
  h.tap(HUD_BTN.x + HUD_BTN.w / 2, HUD_BTN.y + HUD_BTN.h + padY - 2);
  h.frames(2);
  assert.equal(h.app.getState(), 'paused', '그린 상자 아래 여유 안 = ⏸');
});

//  글꼴 문자열의 px(없으면 0) · 14px 미만 글 목록
const fontPx = (f) => { const m = /(\d+(?:\.\d+)?)px/.exec(f || ''); return m ? +m[1] : 0; };
const smallOf = (list) => list.filter((t) => fontPx(t.font) < 14).map((t) => t.text + ' @ ' + t.font);
//  덮개(화면 전체 fillRect) 뒤에 그린 글만 — 덮개 아래 게임 장면에는 원근으로 줄어드는 글(적 체력 숫자 등)이 있다
function textsAfterCover(ops) {
  let k = -1;
  ops.forEach((o, i) => { if (o.op === 'fillRect' && o.args[0] === 0 && o.args[1] === 0 && o.args[2] === W && o.args[3] === BAL3.view.h) k = i; });
  assert.ok(k >= 0, '덮개');
  return ops.slice(k + 1).filter((o) => o.op === 'fillText').map((o) => ({ text: String(o.args[0]), font: o.font }));
}

test('IMP-4: 휴대폰 글자 크기 — 타이틀·강화 화면의 모든 글, 일시정지·결과 덮개 위 글은 14px 이상 · 게이트 안내선 글은 15px 이고 도로 오른쪽 끝을 넘지 않는다', async () => {
  //  2번 판이 열린 사용자(옛 코스 칸에 1번 클리어 — 타이틀 칸 기록·'이전 기록' 줄에는 안 보인다)
  const h = await bootApp({ withOps: true, unlockThrough: 1 });
  h.textNow();
  assert.ok(h.texts.some((t) => t.text === '미도전'), '타이틀 칸 기록 줄');
  assert.deepEqual(smallOf(h.texts), [], '타이틀');
  h.app.openUpgrade('title');
  h.textNow();
  assert.ok(h.texts.some((t) => /단계$/.test(t.text)), '강화 카드');
  assert.deepEqual(smallOf(h.texts), [], '강화');
  h.app.closeUpgrade();
  //  게임: 2번 판 첫 셔터 게이트(armZ 340)를 개시선 밖(부대 앞 520)에 두면 선과 안내 글이 보인다
  h.app.startRun(2);
  h.frames(2);
  const run = h.app.getRun();
  const row = run.gateRows.find((r) => r.armZ != null && !r.armed && !r.passed);
  run.z = run.prevZ = row.z - 520;
  run.enemies.length = 0;
  h.textNow();
  const arm = h.texts.find((t) => t.text === ARM_LINE_TEXT);
  assert.ok(arm, '안내선 글');
  assert.equal(fontPx(arm.font), 15, arm.font);
  const P = projectorFor(projectorMode({}));
  const right = P.project(BAL3.road.x1, row.armZ).x;
  assert.ok(arm.maxW > 0 && arm.x + arm.maxW <= right, `글 끝 ${arm.x} + ${arm.maxW} ≤ 도로 오른쪽 끝 ${right}`);
  //  일시정지·결과: 덮개 위 글(버튼 포함)
  h.app.pause();
  h.textNow();
  const paused = textsAfterCover(h.ops);
  assert.ok(paused.some((t) => t.text === '일시 정지'), '일시정지 글');
  assert.deepEqual(smallOf(paused), [], '일시정지');
  h.app.giveUp();
  h.frames(2);
  assert.equal(h.app.getState(), 'result');
  h.textNow();
  const res = textsAfterCover(h.ops);
  assert.ok(res.some((t) => t.text.startsWith('보유 코인 ')), '결과 보유 코인 줄: ' + JSON.stringify(res.map((t) => t.text)));
  assert.deepEqual(smallOf(res), [], '결과');
});

test('IMP-5: 칸 기록 짧은 시간 — timeShort 는 m:ss(초 아래 버림) · 타이틀 칸 기록과 이전 기록 줄이 이 표기를 쓰고, 결과 화면 시간(timeText)은 그대로', async () => {
  assert.equal(timeShort(65.04), '1:05');
  assert.equal(timeShort(40.86), '0:40');
  assert.equal(timeShort(107.4), '1:47');
  assert.equal(timeShort(599.99), '9:59');
  assert.equal(timeShort(0), '0:00');
  assert.equal(timeShort(-3), '0:00');
  assert.equal(timeShort(undefined), '0:00');
  assert.equal(timeText(107.4), '1분 47.4초', '결과 화면 표기는 그대로');
  assert.equal(prevRecordLine({ cleared: true, bestSurvivors: 5, bestTime: 61 }), '이전 기록 5명 · 1:01');
  //  셸: 부대 상한(100명)·1분 47.4초·구출 기록 → 칸 기록 '완료 · 100명 · 1:47 · 구출✓'
  const h = await bootApp({});
  h.save.updateStage(1, { cleared: true, attempts: 3, bestSurvivors: 100, bestTime: 107.4, rescued: true }, stageVersion(1), 'v4');
  h.textNow();
  assert.ok(h.texts.some((t) => t.text === '완료 · 100명 · 1:47 · 구출✓'), '칸 기록: ' + JSON.stringify(h.texts.filter((t) => t.text.includes('명')).map((t) => t.text)));
});

test('IMP-6: 큰 화면 선명도 — 보이는 크기가 화소 수를 따라 커지는 태블릿(820×1180, 배율 2)에서 불러온 직후 화소 = 보이는 708×1180 × 2 · 창을 줄이면 다시 맞춘다', async () => {
  const canvas = fakeCanvas([]);
  let vw = 820, vh = 1180;
  //  브라우저 배치 흉내: 보이는 크기 = 캔버스 기본 크기(화소 수)를 화면 안(max-width 100vw · max-height 100vh · 비율 480:800)으로 줄인 값
  canvas.getBoundingClientRect = () => { const w = Math.min(canvas.width, vw, vh * 0.6); return { left: 0, top: 0, width: w, height: w / 0.6 }; };
  const L = {};
  const win = { devicePixelRatio: 2, location: { search: '' }, addEventListener: (n, f) => { (L[n] ??= []).push(f); } };
  const app = boot(canvas, { win, doc: null, raf: () => {}, now: () => 1000, save: createSave3(memStorage()), audio: fakeAudio(), dateNow: () => 1_700_000_000_000,
    sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  assert.equal(canvas.width, 1416, '보이는 폭 708 × 2 (종전: 한 번만 재서 960 — 필요한 화소의 68%)');
  assert.equal(canvas.height, 2360);
  vw = 600;
  for (const f of L.resize ?? []) f({});
  assert.equal(canvas.width, 1200, '창을 600 으로 줄이면 600 × 2');
  assert.equal(canvas.height, 2000);
});

//  화면 주사율 hz 로 셸을 돌려 [그린 카메라 z, 규칙 run.z] 를 프레임마다 모은다(출발 뒤 warm 프레임을 버린다)
async function camTrace(hz, warm = 120, n = 90) {
  const queue = [];
  let nowMs = 1000;
  const app = boot(fakeCanvas([]), { win: { devicePixelRatio: 1, location: { search: '' }, addEventListener() {} }, doc: null, raf: (f) => queue.push(f), now: () => nowMs,
    save: createSave3(memStorage()), audio: fakeAudio(), dateNow: () => 1_700_000_000_000, sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  const tick = () => { nowMs += 1000 / hz; queue.shift()(nowMs); };
  app.startRun(1);
  for (let i = 0; i < warm; i++) tick();
  const cams = [], zs = [];
  for (let i = 0; i < n; i++) { tick(); cams.push(app.getCamZ()); zs.push(app.getRun().z); }
  return { cams, zs };
}
const deltas = (a) => a.slice(1).map((v, i) => v - a[i]);

test('IMP-7: 90Hz·144Hz 매끄럽게 — 규칙 run.z 는 멈추는 프레임이 있어도(고정 스텝) 그리는 카메라 z 는 매 프레임 고르게 나아간다 · 정확히 60Hz 면 카메라 = run.z', async () => {
  for (const hz of [90, 144]) {
    const { cams, zs } = await camTrace(hz);
    const dz = deltas(zs), dc = deltas(cams);
    const still = dz.filter((x) => x === 0).length;
    assert.ok(still > 0, `${hz}Hz: 규칙 run.z 는 멈추는 프레임이 있다(${still}/${dz.length})`);
    assert.ok(dc.every((x) => x > 0), `${hz}Hz: 카메라는 매 프레임 나아간다 — 멈춘 프레임 ${dc.filter((x) => x <= 0).length}`);
    const mean = dc.reduce((a, x) => a + x, 0) / dc.length;
    const worst = Math.max(...dc.map((x) => Math.abs(x - mean) / mean));
    assert.ok(worst < 0.05, `${hz}Hz: 프레임마다 나아가는 양이 고르다(평균에서 최대 ${(worst * 100).toFixed(1)}% 차이)`);
  }
  const { cams, zs } = await camTrace(60);
  assert.deepEqual(cams, zs, '60Hz: 카메라 = run.z(종전과 같다)');
});
