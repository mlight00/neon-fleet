// rush3-bullets — 발사체 그림(2026-09-20). 그림이 있으면 무기별 그림을 진행 방향으로 돌려 그리고, 없으면 종전 막대 폴백.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer3, bulletAngle, BULLET_LEN } from '../rush3/render.js';
import { SPRITE_KEYS3 } from '../rush3/sprites.js';
import { WEAPONS } from '../rush3/weapons.js';
import { buildStage } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';

function recCtx() {
  const ops = []; const grad = { addColorStop() {} }; const stack = [];
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

test('V3-BULLETS 각도: vx 없는 탄은 0, 오른쪽 vx 는 양수·왼쪽은 음수(대칭), 무기 6종 전부 그림 키·길이가 있다', () => {
  assert.equal(bulletAngle({ vz: 700 }), 0);
  assert.equal(bulletAngle({ vz: 700, vx: 0 }), 0);
  const r = bulletAngle({ vz: 700, vx: 200 }), l = bulletAngle({ vz: 700, vx: -200 });
  assert.ok(r > 0 && l < 0 && Math.abs(r + l) < 1e-12);
  assert.ok(Math.abs(bulletAngle({ vz: 100, vx: 100 }) - Math.PI / 4) < 1e-12);
  for (const id of Object.keys(WEAPONS)) {
    assert.equal(SPRITE_KEYS3['bullet_' + id], 'BULLET_' + id, id + ' 그림 키');
    assert.ok(BULLET_LEN[id] > 0, id + ' 길이');
  }
  assert.ok(BULLET_LEN.sniper > BULLET_LEN.rifle, '저격 바늘이 소총 탄보다 길다');
});

test('V3-BULLETS 그리기: 그림이 있으면 탄마다 translate→(rotate)→꼬리 그라디언트→drawImage→restore, 없으면 종전 막대(fillRect 2)', () => {
  const run = createRun(buildStage(1));
  for (let i = 0; i < 90; i++) { stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); }
  const live = run.bullets.filter((b) => !b.dead).length;
  assert.ok(live > 0, '탄이 있다');
  //  그림 없음 → 폴백 막대
  const a = recCtx();
  createRenderer3(a.ctx, null).draw({ state: 'run', now: 1, run, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true });
  assert.equal(a.ops.filter((o) => o.op === 'rotate').length, 0);
  //  그림 있음(가짜 이미지) → drawImage 가 탄 수만큼, 회전은 vx 있는 탄만
  const fake = { width: 48, height: 256 };
  const sprites = { get: (k) => (k.startsWith('bullet_') ? fake : null), sheet: () => null, icon: () => null, ready: new Set() };
  const b = recCtx();
  createRenderer3(b.ctx, sprites).draw({ state: 'run', now: 1, run, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true });
  const draws = b.ops.filter((o) => o.op === 'drawImage' && o.args[0] === fake);
  assert.equal(draws.length, live, '탄마다 그림 한 장');
  assert.equal(b.ops.filter((o) => o.op === 'rotate').length, run.bullets.filter((x) => !x.dead && (x.vx || 0) !== 0).length, '회전은 vx 있는 탄만');
  //  꼬리(createLinearGradient)가 탄마다 한 번, 그림 앞에
  const iGrad = b.ops.findIndex((o) => o.op === 'createLinearGradient'), iDraw = b.ops.findIndex((o) => o.op === 'drawImage' && o.args[0] === fake);
  assert.ok(iGrad >= 0 && iGrad < iDraw, '꼬리는 그림보다 먼저');
});
