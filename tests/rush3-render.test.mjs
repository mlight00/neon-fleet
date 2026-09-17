// rush3-render — 화면 표현 검사(계약서 6장 · 2026-09-17 2차 검수 N2). 캔버스 호출을 순서·불투명도까지 기록해
//  "닫힌 셔터가 숫자를 가리지 않는다"·"잠김을 색이 아닌 형태로 알린다"·"판이 위로 걷힌다"를 실제 그리기 경로로 확인한다.
//  ⚠️정적 검사(소스에 무슨 문자열이 있나)로는 '무엇이 무엇 위에 그려지는가'를 못 잡는다 — 그리기 순서가 곧 가림이다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer3, ARM_LINE_TEXT, TRAP_BADGE_TEXT, RETRY_LOTTERY_NOTE, isTrapGateRow } from '../rush3/render.js';
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
function lotterySeedFor(pick) {
  for (let i = 0; i < 40; i++) {
    const cand = hashSeed('lot:3:0:' + (1_700_000_000_000 + i * 86_400_000));
    if (buildStage(3, { lotterySeed: cand }).lottery.pick === pick) return cand;
  }
  assert.fail(pick + ' 이 걸리는 시드를 찾지 못했다');
}

//  그 판을 우측 통로로 몰고 가 stopWhen(행, run) 시점의 한 프레임을 그린다.
//  fxOver 는 객체이거나 (행, 행id) => 객체 — 셸이 그 시점에 넣어 둘 값을 그대로 흉내 낸다
function drawLotteryFrame(pick, stopWhen, fxOver = {}) {
  const stage = buildStage(3, { lotterySeed: lotterySeedFor(pick) });
  const run = createRun(stage);
  const rowId = stage.lottery.rowId;
  const rowOf = () => run.gateRows.find((r) => r.id === rowId);
  let n = 0;
  while (n < 14400 && !stopWhen(rowOf(), run)) {
    stepRun(run, { pointerX: run.z >= 4000 ? 330 : 240, dragDx: 0, keyDir: 0 }, STEP);
    drainEvents(run);
    n++;
  }
  assert.ok(n < 14400, pick + ': 원하는 시점까지 갔다');
  const { ctx, ops } = recCtx();
  const over = typeof fxOver === 'function' ? fxOver(rowOf(), rowId) : fxOver;
  const fx = makeFxLike({ lotSeen: true, ...over });
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx, hud: { distM: 10 }, buttons: [], saveOk: true });
  return { run, row: rowOf(), ops, rowId, stage };
}

function drawArmedLotteryGate(pick) {
  const r = drawLotteryFrame(pick, (row) => row.armed,
    (row, rowId) => ({ gateTip: { [rowId]: { text: isFixedGateRow(row) ? GATE_TIP_OPEN_FIXED : GATE_TIP_OPEN, t: BAL3.fx.gateTipSec } } }));
  assert.equal(r.row.armed, true, pick + ': 랜덤 길 게이트의 셔터가 열렸다');
  return { ...r, text: isFixedGateRow(r.row) ? GATE_TIP_OPEN_FIXED : GATE_TIP_OPEN };
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

// ─────────────────────────────────────────────────────────────────────────────
// V3-RENDER-TRAP(2026-09-17 이사 결정 ③ 함정 외형 A) — 확정 −10 게이트는 **셔터가 아니라 봉쇄 장치**로 보인다.
//  ⚠️같은 모양(셔터)으로 그려 두면 '가까워지면 열린다'를 배운 사람이 열려도 안 오르는 칸에서 다시 속는다.
//   그래서 이 행에서는 회색 빗금 판·개시선·닫힘 안내를 **한 개도** 그리지 않고, 붉은 봉쇄 바·큰 자물쇠·배지로 바꾼다.
//   규칙(armZ·armed·값 갱신)은 그대로다 — 바뀌는 것은 그리기뿐이라 검사도 그리기 호출로 본다.
// ─────────────────────────────────────────────────────────────────────────────
const WARN = BAL3.colors.warn;
//  봉쇄 바 = 붉은 테두리 사각형(drawTrapBar 안에서만 쓰는 조합)
const trapBars = (ops) => ops.filter((o) => o.op === 'strokeRect' && o.stroke === WARN).length;
//  '?' 상자가 걷힌 뒤 · 아직 셔터가 안 열린 시점(공개선 ~ 개시선 사이)
const revealedClosed = (row, run) => !row.armed && run.z >= run.lottery.revealZ + 20;

test('V3-RENDER-TRAP: 함정 행은 닫혀 있어도 셔터 표현을 하나도 쓰지 않고 봉쇄 장치로 그려진다', () => {
  const trap = drawLotteryFrame('trapGate', revealedClosed,
    (row, rowId) => ({ gateTip: { [rowId]: { text: GATE_TIP_CLOSED, t: BAL3.fx.gateTipSec } } }));
  assert.equal(isTrapGateRow(trap.row), true, '이 행은 쏴도 오르지 않는다');
  assert.equal(trap.row.armed, false, '아직 개시선 전이다(규칙은 그대로)');
  const texts = textsOf(trap.ops);
  //  ① 셔터 계열 표현이 하나도 없다
  assert.equal(idxShutter(trap.ops), -1, '회색 빗금 셔터 판을 그리지 않는다');
  assert.ok(!texts.includes(ARM_LINE_TEXT), '개시선 옆 안내를 그리지 않는다: ' + JSON.stringify(texts));
  assert.ok(!texts.includes(GATE_TIP_CLOSED), "셸이 넣어 둬도 '가까워지면 열림'은 이 행에 그리지 않는다: " + JSON.stringify(texts));
  //  ② 봉쇄 장치로 보인다 — 붉은 바 + 큰 자물쇠 + 배지, 숫자와 '확정' 꼬리표는 그대로 선명하다
  assert.ok(trapBars(trap.ops) >= 1, '붉은 봉쇄 바를 그린다');
  assert.ok(trap.ops.some((o) => o.op === 'scale' && o.args[0] > 1), '자물쇠를 크게 그린다(배율)');
  assert.ok(trap.ops.some((o) => o.op === 'arc'), '자물쇠 고리');
  assert.ok(texts.includes(TRAP_BADGE_TEXT), '배지: ' + JSON.stringify(texts));
  assert.ok(texts.includes('−10') && texts.includes('확정'), '숫자와 확정 꼬리표: ' + JSON.stringify(texts));
  const num = trap.ops.find((o) => o.op === 'fillText' && o.args[0] === '−10');
  assert.equal(num.alpha, 0.92, '봉쇄 바 때문에 숫자를 흐리게 만들지 않는다');
  assert.ok(trap.ops.indexOf(num) > trap.ops.findIndex((o) => o.op === 'strokeRect' && o.stroke === WARN), '숫자는 봉쇄 바 위에 그린다');
});

test('V3-RENDER-TRAP: 대조군 — 막을 수 있는 −15 행은 종전 셔터 표현 그대로(봉쇄 바·배지 없음)', () => {
  const bad = drawLotteryFrame('badGate', revealedClosed,
    (row, rowId) => ({ gateTip: { [rowId]: { text: GATE_TIP_CLOSED, t: BAL3.fx.gateTipSec } } }));
  assert.equal(isTrapGateRow(bad.row), false);
  const texts = textsOf(bad.ops);
  assert.ok(idxShutter(bad.ops) >= 0, '닫힌 셔터 판을 그린다');
  assert.ok(texts.includes(ARM_LINE_TEXT), '개시선 안내를 그린다');
  assert.ok(texts.includes(GATE_TIP_CLOSED), "'가까워지면 열림' 을 그린다");
  assert.equal(trapBars(bad.ops), 0, '봉쇄 바가 없다');
  assert.ok(!texts.includes(TRAP_BADGE_TEXT), '배지가 없다');
});

test('V3-RENDER-TRAP: 통과한 뒤에도 봉쇄 바는 흐리게 남고 배지는 사라진다', () => {
  const passed = drawLotteryFrame('trapGate', (row) => row.passed);
  assert.equal(passed.row.passed, true, '함정 행을 지났다');
  const bar = passed.ops.find((o) => o.op === 'strokeRect' && o.stroke === WARN);
  assert.ok(bar, '통과 뒤에도 봉쇄 바를 그린다');
  assert.equal(bar.alpha, 0.32, '지난 행의 흐린 불투명도로 남는다');
  assert.ok(!textsOf(passed.ops).includes(TRAP_BADGE_TEXT), '지난 뒤에는 배지를 떼어 낸다');
});

test('V3-RENDER-TRAP: 결과 화면 [다시 도전] 아래에 "랜덤 길은 새로 추첨" — 랜덤 길이 있는 판만', () => {
  const run = createRun(buildStage(3));
  const retry = { id: 'retry', x: 120, y: 480, w: 240, h: 56, label: '다시 도전', primary: true };
  const base = { stageId: 3, title: '군단', difficulty: 'brutal', won: false, survivors: 0, peak: 12,
                 timeText: '1분 2.0초', kills: 30, missedLine: '놓친 것 없음', advice: null, isBest: false, saveOk: true, nextId: null };
  const drawWith = (lottery) => {
    const { ctx, ops } = recCtx();
    createRenderer3(ctx, null).draw({ state: 'result', now: 1, run, fx: makeFxLike(), hud: { distM: 0 },
      result: { ...base, lottery }, buttons: [retry], saveOk: true });
    return ops;
  };
  const withLot = drawWith('랜덤 길: 함정 피해 −10명');
  const note = withLot.find((o) => o.op === 'fillText' && o.args[0] === RETRY_LOTTERY_NOTE);
  assert.ok(note, '부연을 그린다: ' + JSON.stringify(textsOf(withLot)));
  assert.equal(RETRY_LOTTERY_NOTE, '랜덤 길은 새로 추첨');
  //  버튼 **아래**여야 한다 — 버튼 상자 안에 그리면 버튼 글자와 겹친다
  assert.ok(note.args[2] > retry.y + retry.h, '버튼 아래 y: ' + note.args[2]);
  assert.equal(note.args[1], retry.x + retry.w / 2, '버튼 가운데 정렬');
  //  랜덤 길이 없는 스테이지(결과 한 줄 없음)에는 뜨지 않는다
  assert.ok(!textsOf(drawWith(null)).includes(RETRY_LOTTERY_NOTE), '랜덤 길이 없으면 부연도 없다');
});
