// rush3-improve — 개선 루프(2026-09-27~, newmode/v3/loop/)가 고친 화면 결함을 지키는 검사. **그리기만 — 규칙 불변**.
//  IMP-1(r4.15): 떠오르는 글(fx.floaters)이 화면 가장자리에서 생겨도 글 전체가 화면(0~480) 안에 그려진다 — 24판 자동 점검(r4.13)이
//   7번 판 왼쪽 끝 캡슐의 '캡슐 놓침'(x −24~72)을 찾았다. 셸의 floater 좌표는 그대로 두고 그릴 때만 안쪽으로 당긴다
//  IMP-2(r4.18): 주소 뒤 ?fps=1 일 때만 게임 중 화면 오른쪽 아래에 초당 프레임 수·가장 느린 프레임·캔버스 화소를 보인다(없으면 아무것도 안 그린다)
//  IMP-3(r4.19): 누름 여유 — 정확히 누른 버튼이 없을 때만 작은 버튼의 누름 범위를 최소 TOUCH_MIN(54)까지 넓힌다(그림·hitButton 불변)
//  IMP-4(r4.20): 휴대폰 글자 크기 — 원근으로 줄지 않는 고정 크기 글은 14 논리 px 이상(휴대폰 390 폭 11.4px). 게이트 안내선 글은 달리면서 읽는 글이라 15px + 도로 오른쪽 끝 안(maxWidth).
//   예외(그대로): 스테이지 칸 '이전 기록' 줄 11px(D9′ 작고 흐리게) · ?fps=1 개발용 표시 · 원근으로 줄어드는 세계 글(적 체력 숫자 등 — 거리감)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer3, ARM_LINE_TEXT } from '../rush3/render.js';
import { projectorFor, projectorMode } from '../rush3/project.js';
import { createRun } from '../rush3/combat.js';
import { buildStage } from '../rush3/stages.js';
import { makeFx, hitButton, hitButtonTouch, TOUCH_MIN, HUD_BTN } from '../rush3/main.js';
import { BAL3 } from '../rush3/balance.js';
import { bootApp } from './lib/rush3-shell.mjs';

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
