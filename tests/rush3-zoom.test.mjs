// rush3-zoom — '가까이' 토글(r3.20 — r3.19 확대 보기의 균일 k 배를 **원근 강도 토글**로 대체). 화면 전용: 세계 그리기만 투영이 달라지고 HUD·버튼은 그대로.
//  규칙(combat)은 zoom 을 모른다 — 같은 입력열이면 켜짐 여부와 무관하게 같은 run 이어야 한다. 저장 필드 zoom 은 그대로 재사용(뜻만 바뀜).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer3, ZOOM, HUD_ROW } from '../rush3/render.js';
import { projectorFor, PERSPECTIVE } from '../rush3/project.js';
import { buildStage } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { createSave3 } from '../rush3/save.js';
import { BAL3 } from '../rush3/balance.js';

function recCtx() {
  const ops = [];
  const grad = { addColorStop() {} };
  const stack = [];
  const state = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', canvas: null };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'save') stack.push({ ...t });
        if (k === 'restore') { const s = stack.pop(); if (s) Object.assign(t, s); }
        ops.push({ op: k, args, fill: t.fillStyle });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
const fxLike = () => ({ parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null, lotOpen: 0, lotSeen: false, lotSame: false });

function runAt(steps, x = 180) {
  const run = createRun(buildStage(1));
  for (let i = 0; i < steps; i++) { stepRun(run, { pointerX: x, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); }
  return run;
}
function drawWith(zoom, run) {
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true, zoom });
  return ops;
}
//  히어로 폴백 삼각형(moveTo(px, py − size/2) → lineTo(px − size/3, …))에서 그려진 크기와 x 를 되살린다
function hero(ops) {
  for (let i = 0; i + 1 < ops.length; i++) {
    if (ops[i].op === 'moveTo' && ops[i + 1].op === 'lineTo' && ops[i].fill === BAL3.colors.hero) {
      return { size: (ops[i].args[0] - ops[i + 1].args[0]) * 3, x: ops[i].args[0], y: ops[i].args[1] };
    }
  }
  return null;
}

test('V3-ZOOM 렌더: zoom=true 면 가까이 투영(near 1.8)으로 부대가 표준(1.45)보다 크게 그려지고, HUD 글은 두 모드에서 같은 자리다', () => {
  const run = runAt(120);
  const on = drawWith(true, run), off = drawWith(false, run);
  const hOn = hero(on), hOff = hero(off);
  assert.ok(hOn && hOff, '히어로 폴백을 그린다');
  const S = BAL3.squad.heroSize;
  assert.ok(Math.abs(hOff.size - S * PERSPECTIVE.standard.near) < 1e-9, '꺼짐 = 46 × 1.45: ' + hOff.size);
  assert.ok(Math.abs(hOn.size - S * PERSPECTIVE.close.near) < 1e-9, '켜짐 = 46 × 1.8: ' + hOn.size);
  //  부대 x 도 각 모드의 부대 줄 배율로 투영된다(sway 는 now 1 로 같다)
  const sway = Math.sin(1 * 4.5) * 0.8;
  assert.ok(Math.abs(hOff.x - projectorFor('standard').project(run.x + sway, 0).x) < 1e-9);
  assert.ok(Math.abs(hOn.x - projectorFor('close').project(run.x + sway, 0).x) < 1e-9);
  //  균일 확대(translate/scale/translate) 변환은 더 이상 없다
  assert.equal(on.some((o) => o.op === 'scale' && o.args[0] > PERSPECTIVE.sMax), false);
  //  HUD 제목 위치는 모드와 무관하게 HUD_ROW.left
  for (const ops of [on, off]) {
    const t = ops.find((o) => o.op === 'fillText' && String(o.args[0]).includes('첫 진격'));
    assert.ok(t && t.args[1] === HUD_ROW.left && t.args[2] === HUD_ROW.cy, 'HUD 제목 자리');
  }
  //  칩 글자
  assert.equal(ZOOM.label.on, '가까이 ●'); assert.equal(ZOOM.label.off, '가까이 ○');
  assert.deepEqual({ ...ZOOM.chip }, { x: 16, y: 84, w: 70, h: 26 });
});

test('V3-ZOOM 렌더: 가까이 여부는 규칙 결과(run)를 바꾸지 않는다', () => {
  const run = runAt(120);
  const snap = JSON.stringify({ x: run.x, z: run.z, units: run.units.length, bullets: run.bullets.length });
  drawWith(false, run);
  drawWith(true, run);
  assert.equal(JSON.stringify({ x: run.x, z: run.z, units: run.units.length, bullets: run.bullets.length }), snap, '그리기는 run 을 건드리지 않는다');
  //  같은 입력열 두 판 = 같은 결과(zoom 은 셸 값이라 규칙에 없다)
  const a = runAt(600, 150), b = runAt(600, 150);
  assert.deepEqual({ x: a.x, z: a.z, u: a.units.length }, { x: b.x, z: b.z, u: b.units.length });
});

test('V3-ZOOM 저장: zoom 필드 기본 false · patch 로 기억 · 옛 저장(필드 없음)은 false 로 읽힌다(r3.20 에서도 필드 이름·형식 그대로)', () => {
  const mem = new Map();
  const storage = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
  const s1 = createSave3(storage);
  assert.equal(s1.get().zoom, false);
  s1.patch({ zoom: true });
  assert.equal(s1.get().zoom, true);
  const s2 = createSave3(storage);
  assert.equal(s2.get().zoom, true, '다시 열어도 기억');
  //  옛 형식(zoom 없음) 원문
  const raw = JSON.parse(mem.get([...mem.keys()][0])); delete raw.zoom; mem.set([...mem.keys()][0], JSON.stringify(raw));
  const s3 = createSave3(storage);
  assert.equal(s3.get().zoom, false);
  //  이상한 값은 false
  s3.patch({ zoom: 'yes' });
  assert.equal(s3.get().zoom, false);
});
