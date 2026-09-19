// rush3-zoom — 확대 보기(2026-09-19 이사 지시). 화면 전용 카메라: 세계 그리기만 부대 중심 기준 k 배, HUD·버튼은 그대로.
//  규칙(combat)은 zoom 을 모른다 — 같은 입력열이면 확대 여부와 무관하게 같은 run 이어야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer3, ZOOM, HUD_ROW } from '../rush3/render.js';
import { buildStage } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { createSave3 } from '../rush3/save.js';
import { BAL3 } from '../rush3/balance.js';
const LINE_Y = BAL3.view.LINE_Y;

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
        ops.push({ op: k, args });
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

test('V3-ZOOM 렌더: zoom=true 면 세계 그리기 앞에 부대 중심(run.x, LINE_Y) 기준 k 배 변환이 서고, HUD 글은 변환을 되돌린 뒤에 그린다', () => {
  const run = runAt(120);
  const ops = drawWith(true, run);
  const iScale = ops.findIndex((o) => o.op === 'scale' && o.args[0] === ZOOM.k && o.args[1] === ZOOM.k);
  assert.ok(iScale > 0, 'scale(k,k) 호출이 있다');
  //  translate(run.x, LINE_Y) → scale → translate(-run.x, -LINE_Y) 순서
  assert.deepEqual(ops[iScale - 1].args, [run.x, LINE_Y]);
  assert.equal(ops[iScale - 1].op, 'translate');
  assert.deepEqual(ops[iScale + 1].args, [-run.x, -LINE_Y]);
  //  세계 그리기(배경 fillRect)는 변환 뒤, HUD 제목은 restore 뒤
  const iFirstRect = ops.findIndex((o, i) => i > iScale && o.op === 'fillRect');
  assert.ok(iFirstRect > iScale, '배경이 변환 안에서 그려진다');
  const iTitle = ops.findIndex((o) => o.op === 'fillText' && String(o.args[0]).includes('첫 진격'));
  const iRestore = ops.findIndex((o, i) => i > iScale && o.op === 'restore');
  assert.ok(iRestore > iScale && iTitle > iRestore, 'HUD 제목은 변환을 되돌린 뒤: restore@' + iRestore + ' title@' + iTitle);
  //  HUD 제목 위치는 확대와 무관하게 HUD_ROW.left
  assert.equal(ops[iTitle].args[1], HUD_ROW.left);
});

test('V3-ZOOM 렌더: zoom=false 면 k 배 scale 이 없고, 확대 여부는 규칙 결과(run)를 바꾸지 않는다', () => {
  const run = runAt(120);
  const snap = JSON.stringify({ x: run.x, z: run.z, units: run.units.length, bullets: run.bullets.length });
  const opsOff = drawWith(false, run);
  assert.equal(opsOff.some((o) => o.op === 'scale' && o.args[0] === ZOOM.k), false);
  drawWith(true, run);
  assert.equal(JSON.stringify({ x: run.x, z: run.z, units: run.units.length, bullets: run.bullets.length }), snap, '그리기는 run 을 건드리지 않는다');
  //  같은 입력열 두 판 = 같은 결과(zoom 은 셸 값이라 규칙에 없다)
  const a = runAt(600, 150), b = runAt(600, 150);
  assert.deepEqual({ x: a.x, z: a.z, u: a.units.length }, { x: b.x, z: b.z, u: b.units.length });
});

test('V3-ZOOM 저장: zoom 필드 기본 false · patch 로 기억 · 옛 저장(필드 없음)은 false 로 읽힌다', () => {
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
