// rush3-render — 화면 표현 검사(계약서 6장 · 2026-09-17 2차 검수 N2). 캔버스 호출을 순서·불투명도까지 기록해
//  "닫힌 셔터가 숫자를 가리지 않는다"·"잠김을 색이 아닌 형태로 알린다"·"판이 위로 걷힌다"를 실제 그리기 경로로 확인한다.
//  ⚠️정적 검사(소스에 무슨 문자열이 있나)로는 '무엇이 무엇 위에 그려지는가'를 못 잡는다 — 그리기 순서가 곧 가림이다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer3, ARM_LINE_TEXT } from '../rush3/render.js';
import { buildStage } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { BAL3 } from '../rush3/balance.js';
import { gateLabel } from '../rush3/gates.js';
import { GATE_TIP_CLOSED, GATE_TIP_OPEN, GATE_TIP_OPEN_FIXED, SHUTTER_GUIDE_TEXT,
         isFixedGateRow } from '../rush3/main.js';
import { hashSeed } from '../rush/rng.js';

//  호출 기록 ctx: 호출마다 { op, args, alpha, fill } 을 순서대로 남긴다(save/restore 로 상태도 되돌린다)
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
        ops.push({ op: k, args, alpha: t.globalAlpha, fill: t.fillStyle, stroke: t.strokeStyle });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}

function makeFxLike(o = {}) {
  return { parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {},
           shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null,
           lotOpen: 0, lotSeen: false, lotSame: false, ...o };
}

//  S2 를 무조작(x240)으로 굴려 첫 게이트(z1140, armZ 340)가 원하는 상태일 때 한 프레임을 그린다
function drawAt(stopWhen, fxOver = {}) {
  const run = createRun(buildStage(2));
  let n = 0;
  while (n < 14400 && !stopWhen(run)) { stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); n++; }
  const { ctx, ops } = recCtx();
  const fx = makeFxLike(fxOver);
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx, hud: { distM: 10 }, buttons: [], saveOk: true });
  return { run, ops, fx };
}

const idxOfText = (ops, text) => ops.findIndex((o) => o.op === 'fillText' && o.args[0] === text);
const textsOf = (ops) => ops.filter((o) => o.op === 'fillText').map((o) => o.args[0]);
//  셔터 판 = 빗금 판의 회색 채우기(drawGateRow 안에서만 쓰는 색)
const SHUTTER_FILL = 'rgba(120,128,140,0.82)';
const idxShutter = (ops) => ops.findIndex((o) => o.op === 'fillRect' && o.fill === SHUTTER_FILL);

test('V3-RENDER-SHUTTER: 닫힌 셔터에서도 칸 숫자·부호가 셔터 위에 같은 불투명도로 그려진다', () => {
  const row0 = (run) => run.gateRows[0];
  const { run, ops } = drawAt((r) => !row0(r).armed && row0(r).z - r.z <= 700);
  assert.equal(run.gateRows[0].armed, false, '아직 닫힌 셔터를 그린다');
  const texts = textsOf(ops);
  //  S2 첫 행 두 칸 = +1(좌) · −20(우)
  assert.ok(texts.includes('+1') && texts.includes('−20'), '닫혀 있어도 두 칸 숫자를 그린다: ' + JSON.stringify(texts));
  const shut = idxShutter(ops);
  assert.ok(shut >= 0, '셔터 판을 그린다');
  //  ① 숫자는 셔터 **뒤가 아니라 위**에 그려진다(그리기 순서)
  assert.ok(idxOfText(ops, '−20') > shut, '숫자가 셔터 판보다 먼저 그려지면 판에 덮인다');
  //  ② 흐림이 없다 — 통과 전 행의 기본 불투명도(0.92) 그대로
  for (const label of ['+1', '−20']) {
    const op = ops.find((o) => o.op === 'fillText' && o.args[0] === label);
    assert.equal(op.alpha, 0.92, label + ': 닫힌 셔터 뒤라고 숫자를 흐리게 만들지 않는다');
  }
});

test('V3-RENDER-SHUTTER: 잠김은 숫자가 아니라 칸 모서리의 작은 자물쇠로 따로 알린다(색만으로 구분하지 않는다)', () => {
  const closed = drawAt((r) => !r.gateRows[0].armed && r.gateRows[0].z - r.z <= 700);
  const opened = drawAt((r) => r.gateRows[0].armed && !r.gateRows[0].passed);
  //  자물쇠 고리 = arc 호출. 닫힌 프레임에만 있고(칸 2개 = 2회) 열린 프레임에는 없다
  const arcs = (ops) => ops.filter((o) => o.op === 'arc').length;
  assert.ok(arcs(closed.ops) >= 2, '닫힌 칸마다 자물쇠 아이콘을 그린다: ' + arcs(closed.ops));
  assert.equal(arcs(opened.ops), 0, '열린 뒤에는 잠김 아이콘이 사라진다');
  //  열린 뒤에는 셔터 판도 없다
  assert.equal(idxShutter(opened.ops), -1);
  assert.equal(opened.run.gateRows[0].armed, true);
  //  열린 프레임에서도 두 칸 숫자는 그대로 읽힌다(열린 뒤에는 쏜 만큼 값이 올라 있을 수 있어 현재 값으로 본다)
  const labels = opened.run.gateRows[0].cells.map((c) => gateLabel(c.value));
  for (const l of labels) assert.ok(textsOf(opened.ops).includes(l), '열린 칸 숫자 ' + l);
});

test('V3-RENDER-SHUTTER: 열리는 동안 회색 판이 위로 걷힌다(남는 판이 칸 위쪽)', () => {
  //  fx.gateOpen 을 절반(0.125s)으로 두면 shut = 0.5 — 판 높이가 절반이어야 하고 그 절반은 **칸 위쪽**이다
  const half = BAL3.gate.openT / 2;
  const { run, ops } = drawAt((r) => r.gateRows[0].armed && !r.gateRows[0].passed, { gateOpen: { g1: half } });
  const clip = ops.find((o) => o.op === 'rect');
  assert.ok(clip, '걷히는 동안 판을 잘라 그린다');
  const [, ry, , rh] = clip.args;
  const vis = 58;
  const cellTop = 640 - (run.gateRows[0].z - run.z) - vis / 2;
  assert.ok(Math.abs(ry - cellTop) < 0.01, '남은 판의 위쪽 모서리 = 칸 위쪽 모서리(아래로 걷히면 이 값이 내려간다)');
  assert.ok(Math.abs(rh - vis * 0.5) < 0.01, '절반만큼 남는다: ' + rh);
});

test('V3-RENDER-SHUTTER: 개시선 옆 글은 게이트가 선 안으로 온다고 말한다(플레이어가 넘는다고 하지 않는다)', () => {
  const { ops } = drawAt((r) => !r.gateRows[0].armed && r.gateRows[0].z - r.z <= 700);
  assert.ok(textsOf(ops).includes(ARM_LINE_TEXT), '개시선 옆 안내를 그린다');
  assert.equal(ARM_LINE_TEXT, '이 선 안으로 온 게이트를 쏠 수 있어요');
  //  ⚠️'선을 넘으세요' 계열(플레이어가 주체)이면 벽의 통로 확정선과 헷갈린다
  assert.ok(!/넘으|넘어가|넘으세요/.test(ARM_LINE_TEXT), ARM_LINE_TEXT);
});

test('V3-RENDER-SHUTTER: 짧은 안내 글과 첫 조우 배너를 fx 가 시키는 대로 칸 위·화면에 그린다', () => {
  const closed = drawAt((r) => !r.gateRows[0].armed && r.gateRows[0].z - r.z <= 700,
    { gateTip: { g1: { text: GATE_TIP_CLOSED, t: BAL3.fx.gateTipSec } }, shutterT: 2, shutterText: SHUTTER_GUIDE_TEXT });
  const texts = textsOf(closed.ops);
  assert.ok(texts.includes(GATE_TIP_CLOSED), '닫힌 동안 "가까워지면 열림"');
  for (const l of SHUTTER_GUIDE_TEXT) assert.ok(texts.includes(l), '첫 조우 배너 줄: ' + l);
  //  ⚠️한 줄로 쓰면 480px 화면에서 양끝이 잘린다 — 줄마다 화면 안에 들어가는 길이여야 한다(2026-09-17 렌더 실측)
  for (const l of SHUTTER_GUIDE_TEXT) assert.ok(l.length <= 24, '배너 한 줄이 너무 길다: ' + l);
  //  타이머가 0 이면 아무것도 안 그린다
  const none = drawAt((r) => !r.gateRows[0].armed && r.gateRows[0].z - r.z <= 700);
  const t2 = textsOf(none.ops);
  assert.ok(!t2.includes(GATE_TIP_CLOSED) && SHUTTER_GUIDE_TEXT.every((l) => !t2.includes(l)));
  //  열림 문구도 같은 자리에 나온다
  const open = drawAt((r) => r.gateRows[0].armed && !r.gateRows[0].passed,
    { gateTip: { g1: { text: GATE_TIP_OPEN, t: BAL3.fx.gateTipSec } } });
  assert.ok(textsOf(open.ops).includes(GATE_TIP_OPEN), '처음 열릴 때 "지금 쏘면 +1"');
});

// ─────────────────────────────────────────────────────────────────────────────
// V3-RENDER-SHUTTER(2026-09-17 수정 라운드 1) — 확정 손실 행 한 화면.
//  검수 실측: 이 행 위에 '확정' 꼬리표와 '지금 쏘면 +1' 이 함께 떠 서로를 부정했다.
//  여기서는 **실제 랜덤 길 판을 굴려** 그 행이 열린 프레임을 그리고, 한 화면의 글자들이 서로 맞는지 본다.
// ─────────────────────────────────────────────────────────────────────────────
//  랜덤 길 ⑤(확정 −10)가 걸리는 시드를 찾아 우측 통로로 몰고 가, 셔터가 열린 프레임을 그린다.
//  짧은 글은 셸이 고르는 값(isFixedGateRow)을 그대로 써서 '셸의 선택 → 화면' 전체를 한 검사로 잠근다.
function drawArmedLotteryGate(pick) {
  let seed = null;
  for (let i = 0; i < 40 && seed === null; i++) {
    const cand = hashSeed('lot:3:0:' + (1_700_000_000_000 + i * 86_400_000));
    if (buildStage(3, { lotterySeed: cand }).lottery.pick === pick) seed = cand;
  }
  assert.ok(seed !== null, pick + ' 이 걸리는 시드를 찾았다');
  const stage = buildStage(3, { lotterySeed: seed });
  const run = createRun(stage);
  const rowId = stage.lottery.rowId;
  const rowOf = () => run.gateRows.find((r) => r.id === rowId);
  let n = 0;
  while (n < 14400 && !rowOf().armed) {
    stepRun(run, { pointerX: run.z >= 4000 ? 330 : 240, dragDx: 0, keyDir: 0 }, STEP);
    drainEvents(run);
    n++;
  }
  const row = rowOf();
  assert.equal(row.armed, true, pick + ': 랜덤 길 게이트의 셔터가 열렸다');
  const text = isFixedGateRow(row) ? GATE_TIP_OPEN_FIXED : GATE_TIP_OPEN;
  const { ctx, ops } = recCtx();
  const fx = makeFxLike({ gateTip: { [rowId]: { text, t: BAL3.fx.gateTipSec } }, lotSeen: true });
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx, hud: { distM: 10 }, buttons: [], saveOk: true });
  return { run, row, ops, text };
}

test('V3-RENDER-SHUTTER: 확정 −10 행이 열린 화면에 "확정" 과 "지금 쏘면 +1" 이 함께 뜨지 않는다', () => {
  const trap = drawArmedLotteryGate('trapGate');
  assert.equal(isFixedGateRow(trap.row), true, '이 행은 쏴도 오르지 않는다');
  const texts = textsOf(trap.ops);
  assert.ok(texts.includes('−10'), '칸 숫자: ' + JSON.stringify(texts));
  assert.ok(texts.includes('확정'), '칸 아래 확정 꼬리표');
  assert.ok(!texts.includes(GATE_TIP_OPEN), '같은 화면에 "확정" 과 "지금 쏘면 +1" 이 함께 있으면 서로를 부정한다: ' + JSON.stringify(texts));
  assert.ok(texts.includes(GATE_TIP_OPEN_FIXED), '확정 행 전용 문구: ' + JSON.stringify(texts));
  //  대조군 — 막을 수 있는 −15 행은 '확정' 꼬리표가 없고 종전 문구가 그대로 나온다
  const bad = drawArmedLotteryGate('badGate');
  assert.equal(isFixedGateRow(bad.row), false);
  const bt = textsOf(bad.ops);
  assert.ok(!bt.includes('확정'), '상한 0 행에는 확정 꼬리표가 없다');
  assert.ok(bt.includes(GATE_TIP_OPEN), '쏘면 오르는 행에는 "지금 쏘면 +1" 이 그대로: ' + JSON.stringify(bt));
});
