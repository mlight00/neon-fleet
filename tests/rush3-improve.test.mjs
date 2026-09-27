// rush3-improve — 개선 루프(2026-09-27~, newmode/v3/loop/)가 고친 화면 결함을 지키는 검사. **그리기만 — 규칙 불변**.
//  IMP-1(r4.15): 떠오르는 글(fx.floaters)이 화면 가장자리에서 생겨도 글 전체가 화면(0~480) 안에 그려진다 — 24판 자동 점검(r4.13)이
//   7번 판 왼쪽 끝 캡슐의 '캡슐 놓침'(x −24~72)을 찾았다. 셸의 floater 좌표는 그대로 두고 그릴 때만 안쪽으로 당긴다
//  IMP-2(r4.18): 주소 뒤 ?fps=1 일 때만 게임 중 화면 오른쪽 아래에 초당 프레임 수·가장 느린 프레임·캔버스 화소를 보인다(없으면 아무것도 안 그린다)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer3 } from '../rush3/render.js';
import { createRun } from '../rush3/combat.js';
import { buildStage } from '../rush3/stages.js';
import { makeFx } from '../rush3/main.js';
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
