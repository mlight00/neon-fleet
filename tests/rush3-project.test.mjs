// rush3-project — 원근 투영(r3.20 · 계획서 §4-6 "원근 투영 — 규칙이 아니라 그리기다"). 순수 투영기와 렌더의 사용 규약을 잠근다.
//  이사 소감(2026-09-19): 확대 모드는 캐릭터는 잘 보이는데 앞이 안 보인다 → 라스트워식 원근(부대 크게·앞은 멀수록 작게 가운데로).
//  규칙(combat)은 투영을 모른다 — 같은 입력열이면 투영 모드와 무관하게 같은 run 이어야 한다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeProjector, projectorFor, projectorMode, PERSPECTIVE } from '../rush3/project.js';
import { createRenderer3, HUD_ROW } from '../rush3/render.js';
import { buildStage } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { BAL3 } from '../rush3/balance.js';
import { gateLabel } from '../rush3/gates.js';
const LINE_Y = BAL3.view.LINE_Y, CX = BAL3.road.center;

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
        ops.push({ op: k, args, alpha: t.globalAlpha, fill: t.fillStyle, font: t.font });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
const fxLike = () => ({ parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null, lotOpen: 0, lotSeen: false, lotSame: false, shocks: [] });
const fontPx = (o) => Number(String(o.font).match(/(\d+(\.\d+)?)px/)[1]);

function runS2(steps, x = 240) {
  const run = createRun(buildStage(2));
  for (let i = 0; i < steps; i++) { stepRun(run, { pointerX: x, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); }
  return run;
}
function drawWith(run, view = {}) {
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: fxLike(), hud: { distM: 10 }, buttons: [], saveOk: true, ...view });
  return ops;
}

test('V3-PROJECT 식: s(0)=near · y(0)=LINE_Y · d 가 커지면 s·y 단조 감소 · x 중앙 불변·좌우 대칭 · far 배율 · D 역산', () => {
  for (const mode of ['standard', 'close']) {
    const c = PERSPECTIVE[mode], P = makeProjector(c);
    assert.equal(P.s(0), c.near, mode + ': 부대 줄 배율 = near');
    assert.equal(P.y(0), LINE_Y, mode + ': 부대 줄 y = LINE_Y');
    assert.ok(Math.abs(P.s(c.depth) - c.far) < 1e-12, mode + ': 위 끝(d = depth)의 배율 = far');
    assert.ok(Math.abs(P.D - c.depth / (c.near / c.far - 1)) < 1e-9, 'D = depth / (near/far − 1)');
    let ps = Infinity, py = Infinity;
    for (let d = -150; d <= 900; d += 10) {
      const s = P.s(d), y = P.y(d);
      assert.ok(s <= ps + 1e-12 && y < py, mode + ': d ' + d + ' 에서 s·y 가 줄어든다');
      ps = s; py = y;
      //  중앙 불변·대칭
      assert.equal(P.project(CX, d).x, CX);
      assert.ok(Math.abs((P.project(CX + 100, d).x - CX) + (P.project(CX - 100, d).x - CX)) < 1e-9);
      //  x 는 배율만큼 모인다
      assert.ok(Math.abs(P.project(80, d).x - (CX + (80 - CX) * s)) < 1e-9);
      //  s 상한(뒤쪽) = max(PERSPECTIVE.sMax, near) — 검수 반영 2026-09-20: 1.9 → 1.5, 가까이(near 1.8)는 near 가 상한
      assert.ok(s <= P.sMax + 1e-12);
    }
    //  위 끝 d 700 이 화면 위 근처(−50~−70): 앞이 보이는 거리는 종전(평면 640 → y 0)과 비슷하다
    const yTop = P.y(700);
    assert.ok(yTop < -40 && yTop > -80, mode + ': y(700) = ' + yTop.toFixed(1));
    //  역함수
    for (const d of [-120, -20, 0, 100, 400, 700]) assert.ok(Math.abs(P.dOf(P.y(d)) - d) < 1e-6, mode + ': dOf(y(d)) = d @' + d);
    //  뒤쪽 확장: s 가 상한에 닿은 뒤로는 상한 그대로, y 는 계속 내려간다(직선)
    assert.equal(P.sMax, Math.max(PERSPECTIVE.sMax, c.near), mode + ': 뒤쪽 상한 = max(1.5, near)');
    assert.equal(P.s(-600), P.sMax);
    assert.ok(P.y(-600) > P.y(-300));
  }
  //  표준 vs 가까이: 부대는 더 크고(1.45 → 1.8) 위 끝 배율은 더 작다(0.72 → 0.6) — "앞은 그대로 보이고 부대만 더 크다"
  assert.equal(PERSPECTIVE.standard.near, 1.45); assert.equal(PERSPECTIVE.standard.far, 0.72); assert.equal(PERSPECTIVE.standard.depth, 700);
  assert.equal(PERSPECTIVE.close.near, 1.8); assert.equal(PERSPECTIVE.close.far, 0.6); assert.equal(PERSPECTIVE.close.depth, 700);
});

test('V3-PROJECT flat: near = far = 1 이면 종전 평면 변환과 항등(y = LINE_Y − d, x·s 그대로) · unproject(project(x, 0)) = x', () => {
  const F = projectorFor('flat');
  for (let d = -200; d <= 800; d += 37) {
    for (const x of [80, 100, 240, 333, 400]) {
      const p = F.project(x, d);
      assert.deepEqual(p, { x, y: LINE_Y - d, s: 1 });
    }
    assert.equal(F.dOf(LINE_Y - d), d);
  }
  for (const mode of ['standard', 'close', 'flat']) {
    const P = projectorFor(mode);
    for (const x of [80, 120, 240, 300, 400]) assert.ok(Math.abs(P.unproject(P.project(x, 0).x) - x) < 1e-9, mode + ' unproject @' + x);
    //  화면 중앙은 언제나 트랙 중앙
    assert.equal(P.unproject(CX), CX);
  }
  //  모드 선택: flat 이 가까이보다 우선, 기본은 표준. 인스턴스는 모드마다 하나
  assert.equal(projectorMode({}), 'standard');
  assert.equal(projectorMode({ zoom: true }), 'close');
  assert.equal(projectorMode({ zoom: true, flat: true }), 'flat');
  assert.equal(projectorFor('standard'), projectorFor('standard'));
  assert.equal(projectorFor('nope'), projectorFor('standard'), '모르는 모드는 표준');
});

test('V3-PROJECT 렌더: HUD 글 위치 불변 · 게이트 값 글자 크기 하한 15px · 캔버스 변환(scale) 없이 그린다 · flat 과 원근의 그리기 호출 수가 같다', () => {
  //  S2 첫 게이트(z 1140)가 화면 위쪽(d ≈ 640)에 막 들어온 프레임 — 멀리 있어 배율이 작다
  const run = runS2(1);
  while (run.gateRows[0].z - run.z > 620) { stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); }
  const d0 = run.gateRows[0].z - run.z;
  const P = projectorFor('standard');
  const persp = drawWith(run), flat = drawWith(run, { flat: true }), close = drawWith(run, { zoom: true });
  //  ① HUD 제목·남은 거리·칩은 투영 밖(화면 좌표 그대로)
  for (const ops of [persp, flat, close]) {
    const title = ops.find((o) => o.op === 'fillText' && String(o.args[0]).startsWith('STAGE '));
    assert.ok(title && title.args[1] === HUD_ROW.left && title.args[2] === HUD_ROW.cy, 'HUD 제목 자리 불변');
    const dist = ops.find((o) => o.op === 'fillText' && String(o.args[0]).startsWith('남은 거리'));
    assert.ok(dist && dist.args[2] === HUD_ROW.distCy, '남은 거리 자리 불변');
  }
  //  ② 게이트 값 글자: 38·s(d) — 표준 원근의 위 끝 배율 0.72 라 가장 멀어도 27px(하한 15 위)이고 평면 38px 보다 작다 = 실제로 줄었다
  for (const c of run.gateRows[0].cells) {
    const label = gateLabel(c.value);
    const op = persp.find((o) => o.op === 'fillText' && o.args[0] === label);
    assert.ok(op, '칸 숫자를 그린다: ' + label);
    assert.ok(Math.abs(fontPx(op) - Math.max(PERSPECTIVE.minFont, 38 * P.s(d0))) < 0.01, label + ' 글자 ' + fontPx(op) + 'px = 38·s');
    assert.ok(fontPx(op) >= PERSPECTIVE.minFont && fontPx(op) < 38, label + ' 글자는 15 이상·평면 38 미만');
    //  자리 = 투영식 그대로(칸 중심 x 는 행 z 에서 투영, y 는 y(d))
    const cx = (P.project(c.x0, d0).x + P.project(c.x1, d0).x) / 2;
    assert.ok(Math.abs(op.args[1] - cx) < 1e-9 && Math.abs(op.args[2] - P.y(d0)) < 1e-9, '숫자 자리 = 투영');
  }
  //  ②-b 하한이 실제로 걸리는 글: 통 내구 숫자(16·s)는 멀리서 15 미만이 되므로 15px 로 고정된다. S2 c1(z 2300, 내구 6)이 d ≈ 630 에 든 프레임
  //  ⚠️x 160(왼쪽 +1 칸)으로 간다 — 중앙(240)은 −20 칸에 걸려 전멸 → run.over 로 z 가 멈춰 루프가 끝나지 않는다
  const run2 = runS2(1, 160);
  const c1 = run2.supplies[0];
  let guard = 0;
  while (c1.z - run2.z > 630 && guard++ < 2000) { stepRun(run2, { pointerX: 160, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run2); }
  assert.ok(guard < 2000 && !run2.over, 'c1 이 화면에 들어올 때까지 살아서 갔다');
  const d1 = c1.z - run2.z;
  assert.ok(16 * P.s(d1) < PERSPECTIVE.minFont, '이 거리에서 16·s 는 15 미만: ' + (16 * P.s(d1)).toFixed(1));
  const dur = drawWith(run2).find((o) => o.op === 'fillText' && o.args[0] === String(Math.ceil(c1.durability)) && o.fill === BAL3.colors.bulletHeavy);
  assert.ok(dur, '내구 숫자를 그린다');
  assert.equal(fontPx(dur), PERSPECTIVE.minFont, '내구 숫자는 하한 15px 로 고정');
  const durFlat = drawWith(run2, { flat: true }).find((o) => o.op === 'fillText' && o.args[0] === String(Math.ceil(c1.durability)) && o.fill === BAL3.colors.bulletHeavy);
  assert.equal(fontPx(durFlat), 16, 'flat 에서는 종전 16px');
  //  ③ 균일 확대(r3.19 의 translate/scale/translate — 배경보다 먼저 장면 전체를 감쌌다)는 더 이상 쓰지 않는다: 첫 그리기(배경 fillRect) 앞에 scale 이 없다.
  //     남은 scale 은 자물쇠 배지 안(save 다음)뿐이다. (재기준 2026-09-20: 종전 'scale ≤ sMax' 는 sMax 1.5 · 가까이 배지 1.4·s 에서 뜻이 안 맞는다)
  for (const ops of [persp, close]) {
    const first = ops.findIndex((o) => o.op === 'fillRect');
    assert.ok(first >= 0 && !ops.slice(0, first).some((o) => o.op === 'scale'), '장면 전체를 감싸는 균일 확대 변환 없음');
    ops.forEach((o, i) => { if (o.op === 'scale') assert.ok(ops.slice(Math.max(0, i - 2), i).some((q) => q.op === 'save'), 'scale 은 save 안(자물쇠 배지)에서만'); });
  }
  //  ④ 같은 프레임을 flat/표준/가까이로 그리면 호출 수가 같다(화면 밖 판정이 평면 d 기준이라 같은 물체 집합)
  assert.equal(persp.length, flat.length, 'flat 과 원근의 ops 수');
  assert.equal(close.length, flat.length, 'flat 과 가까이의 ops 수');
  //  ⑤ 그리기 순서(가림) 유지: 배경 → 게이트 → 부대 → HUD
  const idx = (ops, pred) => ops.findIndex(pred);
  const iGate = idx(persp, (o) => o.op === 'fillText' && o.args[0] === gateLabel(run.gateRows[0].cells[0].value));
  const iCount = idx(persp, (o) => o.op === 'fillText' && o.args[0] === String(run.units.length));
  const iTitle = idx(persp, (o) => o.op === 'fillText' && String(o.args[0]).startsWith('STAGE '));
  assert.ok(iGate > 0 && iGate < iCount && iCount < iTitle, '게이트 → 부대 → HUD 순서: ' + [iGate, iCount, iTitle]);
});

test('V3-PROJECT 렌더: 부대(히어로)는 부대 줄 배율(near)로 그려지고, 가까이 모드에서 더 크다 · 그리기는 run 을 건드리지 않는다', () => {
  const run = runS2(120, 180);
  const snap = JSON.stringify({ x: run.x, z: run.z, units: run.units.length, bullets: run.bullets.length });
  const S = BAL3.squad;
  //  히어로 폴백 삼각형: moveTo(px, py − size/2) → lineTo(px − size/3, ...) 로 size 를 되살린다
  const heroSize = (ops) => {
    for (let i = 0; i + 1 < ops.length; i++) {
      if (ops[i].op === 'moveTo' && ops[i + 1].op === 'lineTo' && ops[i].fill === BAL3.colors.hero) {
        const w = ops[i].args[0] - ops[i + 1].args[0];
        return w * 3;
      }
    }
    return null;
  };
  const hs = heroSize(drawWith(run)), hf = heroSize(drawWith(run, { flat: true })), hc = heroSize(drawWith(run, { zoom: true }));
  assert.ok(Math.abs(hf - S.heroSize) < 1e-9, 'flat: 히어로 46');
  assert.ok(Math.abs(hs - S.heroSize * PERSPECTIVE.standard.near) < 1e-9, '표준: 히어로 46 × 1.45 = ' + hs);
  assert.ok(Math.abs(hc - S.heroSize * PERSPECTIVE.close.near) < 1e-9, '가까이: 히어로 46 × 1.8 = ' + hc);
  assert.equal(JSON.stringify({ x: run.x, z: run.z, units: run.units.length, bullets: run.bullets.length }), snap, '그리기는 run 을 건드리지 않는다');
  //  같은 입력열 두 판 = 같은 결과(투영은 셸·렌더 값이라 규칙에 없다)
  const a = runS2(600, 150), b = runS2(600, 150);
  assert.deepEqual({ x: a.x, z: a.z, u: a.units.length }, { x: b.x, z: b.z, u: b.units.length });
});
