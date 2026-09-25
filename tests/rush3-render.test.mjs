// rush3-render — 화면 표현 검사(계약서 6장 · 2026-09-17 2차 검수 N2). 캔버스 호출을 순서·불투명도까지 기록해
//  "닫힌 셔터가 숫자를 가리지 않는다"·"잠김을 색이 아닌 형태로 알린다"·"판이 위로 걷힌다"를 실제 그리기 경로로 확인한다.
//  ⚠️정적 검사(소스에 무슨 문자열이 있나)로는 '무엇이 무엇 위에 그려지는가'를 못 잡는다 — 그리기 순서가 곧 가림이다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer3, ARM_LINE_TEXT, TRAP_BADGE_TEXT, RETRY_LOTTERY_NOTE, isTrapGateRow, HUD_ROW } from '../rush3/render.js';
import { buildStage } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { BAL3 } from '../rush3/balance.js';
import { gateLabel } from '../rush3/gates.js';
import { GATE_TIP_CLOSED, GATE_TIP_OPEN, GATE_TIP_OPEN_FIXED, SHUTTER_GUIDE_TEXT,
         isFixedGateRow, HUD_BTN } from '../rush3/main.js';
import { hashSeed } from '../rush/rng.js';
import { projectorFor, PERSPECTIVE } from '../rush3/project.js';
//  r3.20: 좌표 기대값은 기본 그리기와 같은 투영기로 계산한다. r4.1 재기준: 기본 = '가까이'(표준 칸 삭제)
const PJ = projectorFor('close');

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
        ops.push({ op: k, args, alpha: t.globalAlpha, fill: t.fillStyle, stroke: t.strokeStyle, font: t.font, baseline: t.textBaseline });
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
  //  r3.20 원근: 칸 높이 = 58·s(d)(하한 18), 칸 중심 y = 투영 y(d)
  const d = run.gateRows[0].z - run.z;
  const vis = Math.max(PERSPECTIVE.minGateH, 58 * PJ.s(d));
  const cellTop = PJ.y(d) - vis / 2;
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

// ─────────────────────────────────────────────────────────────────────────────
// V3-RENDER-HUD(2026-09-18 이사 소견) — "상단의 난이도 칩·무기 칩·⏸ 버튼 크기가 제각각이고 높이가 안 맞는다".
//  ⚠️정적 검사(상수 표를 읽어 비교)로는 못 잡는다 — 자리표를 그대로 두고 drawHud 안에서 y 를 하나만 손대도 통과한다.
//  그래서 실제 그리기 경로로 한 프레임을 그린 뒤, 캔버스에 찍힌 **둥근 상자 네 모서리**에서 세 칩을 되살려 잰다.
// ─────────────────────────────────────────────────────────────────────────────

//  칩 바탕색(hudChip 에서만 쓰는 값). 같은 색을 쓰는 칸 위 짧은 글은 drawHud 보다 먼저 그려지므로 제목 뒤부터 모은다
const CHIP_FILL = 'rgba(20,35,58,0.82)';

//  roundRect = moveTo + arcTo×4. 첫 arcTo(x+w, y, x+w, y+h, r) 와 셋째 arcTo(x, y+h, x, y, r) 로 상자를 되살린다
function chipBoxes(ops, fromIdx) {
  const arcs = [];
  for (let i = fromIdx; i < ops.length; i++) if (ops[i].op === 'arcTo' && ops[i].fill === CHIP_FILL) arcs.push(ops[i].args);
  const boxes = [];
  for (let i = 0; i + 3 < arcs.length; i += 4) {
    const a0 = arcs[i], a2 = arcs[i + 2];
    boxes.push({ left: a2[0], top: a0[1], right: a0[0], bottom: a0[3], r: a0[4] });
  }
  return boxes.sort((p, q) => p.left - q.left);
}

const fontPx = (o) => Number(String(o.font).match(/(\d+)px/)[1]);

//  지옥(brutal) 판 한 프레임 — 난이도 칩은 보통에서는 아예 안 그려지므로 표기가 있는 난이도로 그린다.
//  버튼은 셸이 실제로 넘기는 것과 같은 객체(main.HUD_BTN)를 그대로 넘긴다
function hudFrame() {
  const run = createRun(buildStage(2, { difficulty: 'brutal' }));
  for (let i = 0; i < 120; i++) { stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); }
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: makeFxLike(), hud: { distM: 120 },
    buttons: [{ ...HUD_BTN }], saveOk: true });
  return { run, ops };
}

test('V3-RENDER-HUD: 난이도 칩·무기 칩·⏸ 가 같은 높이·같은 세로 중심선·같은 모서리 반경·같은 글자 크기로 한 줄에 선다', () => {
  const { run, ops } = hudFrame();
  assert.equal(run.difficulty, 'brutal', '난이도 표기가 있는 판을 그렸다');
  const title = ops.findIndex((o) => o.op === 'fillText' && String(o.args[0]).startsWith('STAGE '));
  assert.ok(title >= 0, 'HUD 제목을 그린다: ' + JSON.stringify(textsOf(ops).slice(0, 8)));
  const [diff, weapon, pause] = chipBoxes(ops, title);
  assert.equal(chipBoxes(ops, title).length, 3, 'HUD 칩은 정확히 세 개(난이도·무기·⏸)');

  //  ① 같은 높이 · 같은 세로 중심선 — 위·아래 경계가 픽셀까지 같다(이사 소견의 '높이가 안 맞는다')
  for (const [name, b] of [['난이도', diff], ['무기', weapon], ['⏸', pause]]) {
    assert.equal(b.top, HUD_ROW.top, name + ' 칩 위 경계 = ' + HUD_ROW.top);
    assert.equal(b.bottom - b.top, HUD_ROW.h, name + ' 칩 높이 = ' + HUD_ROW.h);
    assert.equal((b.top + b.bottom) / 2, HUD_ROW.cy, name + ' 칩 세로 중심 = ' + HUD_ROW.cy);
    assert.equal(b.r, HUD_ROW.r, name + ' 칩 모서리 반경 = ' + HUD_ROW.r);
  }
  assert.equal(diff.top, weapon.top, '난이도·무기 위 경계가 같다');
  assert.equal(weapon.top, pause.top, '무기·⏸ 위 경계가 같다');
  assert.equal(diff.bottom, pause.bottom, '난이도·⏸ 아래 경계가 같다');

  //  ② 오른쪽 정렬 간격이 일정하다
  assert.equal(weapon.left - diff.right, HUD_ROW.gap, '난이도 ↔ 무기 사이 = ' + HUD_ROW.gap + 'px');
  assert.equal(pause.left - weapon.right, HUD_ROW.gap, '무기 ↔ ⏸ 사이 = ' + HUD_ROW.gap + 'px');
  assert.equal(480 - pause.right, HUD_ROW.right, '⏸ 오른쪽 여백 = ' + HUD_ROW.right + 'px');

  //  ③ 세 칸의 글자 크기가 같다(제각각이던 14 / 16 / 19px → 하나로)
  const labelOf = (t) => ops.find((o) => o.op === 'fillText' && o.args[0] === t);
  const wname = run.weapon === 'auto' ? '기관총' : run.weapon === 'heavy' ? '중화기' : '소총';
  for (const [name, t] of [['난이도', '지옥'], ['무기', wname], ['⏸', HUD_BTN.label]]) {
    const op = labelOf(t);
    assert.ok(op, name + ' 칸 글자를 그린다: ' + JSON.stringify(textsOf(ops).slice(0, 12)));
    assert.equal(fontPx(op), HUD_ROW.fs, name + ' 칸 글자 크기 = ' + HUD_ROW.fs + 'px');
    assert.equal(op.baseline, 'middle', name + ' 칸 글자는 칩 중심에 맞춘다');
    assert.equal(op.args[2], HUD_ROW.cy, name + ' 칸 글자 중심 y = ' + HUD_ROW.cy);
  }

  //  ④ 왼쪽 STAGE 제목도 같은 중심선, 남은 거리는 그 아래 한 줄
  const titleOp = ops[title];
  assert.equal(titleOp.baseline, 'middle', 'STAGE 제목도 중심 기준으로 찍는다');
  assert.equal(titleOp.args[2], HUD_ROW.cy, 'STAGE 제목 중심 y 가 칩들과 같은 선(' + HUD_ROW.cy + ')');
  const dist = ops.find((o) => o.op === 'fillText' && String(o.args[0]).startsWith('남은 거리'));
  assert.ok(dist, '남은 거리를 그린다');
  assert.equal(dist.args[1], titleOp.args[1], '제목과 같은 왼쪽 선');
  assert.ok(dist.args[2] > HUD_ROW.cy, '남은 거리는 제목 아래 줄: y=' + dist.args[2]);
});

test('V3-RENDER-HUD: ⏸ 는 셸이 넘긴 버튼 상자 그대로 그려진다 — 그린 자리와 누르는 자리가 같다', () => {
  const { ops } = hudFrame();
  const title = ops.findIndex((o) => o.op === 'fillText' && String(o.args[0]).startsWith('STAGE '));
  const pause = chipBoxes(ops, title)[2];
  //  ① 히트 영역(main.HUD_BTN = hitButton 이 쓰는 상자)과 그려진 상자가 네 변 모두 같다
  assert.equal(pause.left, HUD_BTN.x, '왼쪽');
  assert.equal(pause.top, HUD_BTN.y, '위');
  assert.equal(pause.right, HUD_BTN.x + HUD_BTN.w, '오른쪽');
  assert.equal(pause.bottom, HUD_BTN.y + HUD_BTN.h, '아래');
  //  ② 좌표의 출처가 한 곳이다 — 셸의 버튼은 render 의 자리표를 그대로 받는다
  assert.deepEqual({ x: HUD_BTN.x, y: HUD_BTN.y, w: HUD_BTN.w, h: HUD_BTN.h }, { ...HUD_ROW.box.pause });
  //  ③ 두 겹으로 그려지지 않는다 — drawButtons 가 같은 버튼을 한 번 더 그리면 상자가 네 개가 된다
  assert.equal(chipBoxes(ops, title).length, 3, 'HUD 칩 상자는 셋뿐(⏸ 이 drawButtons 에서 또 그려지지 않는다)');
  //  ④ 셸이 ⏸ 를 안 넘기는 상태(일시정지·결과)에서는 칩도 없다
  const run = createRun(buildStage(2, { difficulty: 'brutal' }));
  const { ctx, ops: noBtn } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: makeFxLike(), hud: { distM: 120 }, buttons: [], saveOk: true });
  const t2 = noBtn.findIndex((o) => o.op === 'fillText' && String(o.args[0]).startsWith('STAGE '));
  assert.equal(chipBoxes(noBtn, t2).length, 2, '⏸ 버튼이 없으면 칩은 난이도·무기 둘뿐');
  assert.ok(!textsOf(noBtn).includes(HUD_BTN.label), '⏸ 글자도 없다');
});

//  동작 시트(2026-09-18 파일럿): 시트가 있으면 히어로(걷기/사격)·피격 잡졸·쓰러진 잡졸이 시트 칸(drawImage 9인자)으로 그려지고,
//  시트가 없으면(sprites null) 그리기 경로가 이전과 같이 drawImage 없이 폴백으로만 돈다. 규칙(run)은 건드리지 않는다
test('V3-RENDER-SHEET: 동작 시트 유무에 따라 시트 칸 / 폴백이 갈리고, 사격·피격·사망 칸은 시간에 따라 진행된다', () => {
  const run = createRun(buildStage(1));
  run.enemies.push({ id: 900, kind: 'grunt', x: 240, z: run.z + 200, px: 240, pz: run.z + 200, vz: 60, hp: 1, r: 14, dead: false, touched: false });
  const meta = { cols: 6, frames: 12, fw: 10, fh: 20, fps: 12, loop: false, refH: 20 };
  const sheets = { m1_walk: { ...meta, loop: true }, m1_fire: { ...meta, cols: 8, frames: 8, loop: true }, e_grunt_hit: { ...meta, fps: 24 }, e_grunt_death: { ...meta } };
  const sprites = { get: () => null, ready: new Set(), sheet: (k) => (sheets[k] ? { img: { key: k }, ...sheets[k] } : null) };
  const view = (fx, now = 1) => ({ state: 'run', now, run, fx, hud: { distM: 10 }, buttons: [], saveOk: true });
  const sheetDraws = (ops) => ops.filter((o) => o.op === 'drawImage' && o.args.length === 9);
  //  1) 걷기만: 히어로 1칸(now 에 따라 순환)
  let r = recCtx();
  createRenderer3(r.ctx, sprites).draw(view(makeFxLike({ heroFire: 0, enemyHit: {}, corpses: [] }), 1));
  let d = sheetDraws(r.ops);
  assert.equal(d.length, 1, '시트는 히어로 한 칸만(병사 시트는 이 모의에 없다)');
  //  heroFireAlways 면 사격 시트가 now 기준으로 계속 돈다(이사 결정 9/18), 아니면 걷기
  const always = !!BAL3.fx.heroFireAlways;
  assert.equal(d[0].args[0].key, always ? 'm1_fire' : 'm1_walk');
  //  2) 사격 남은 0.3초 → 사격 시트, 칸 = floor((8/12 − 0.3)·12) = 4
  r = recCtx();
  createRenderer3(r.ctx, sprites).draw(view(makeFxLike({ heroFire: 0.3, enemyHit: { 900: 0.25 }, corpses: [{ x: 200, z: run.z + 150, t: 0.5, h: 33 }] }), 1));
  d = sheetDraws(r.ops);
  const byKey = Object.fromEntries(d.map((o) => [o.args[0].key, o]));
  assert.ok(byKey.m1_fire && byKey.e_grunt_hit && byKey.e_grunt_death, '사격·피격·사망 세 시트가 모두 그려진다: ' + Object.keys(byKey));
  assert.equal(byKey.m1_fire.args[1] / 10, always ? Math.floor(1 * 12) % 8 : 4, '사격 칸 번호 = (항상 모드) now × fps 순환 / (교대 모드) 경과 시간 × fps');
  assert.equal(byKey.e_grunt_hit.args[1] / 10, ((0.5 - 0.25) * 24) % 6, '피격 칸 번호(24fps, 열 6)');
  assert.equal(byKey.e_grunt_death.args[1] / 10, 0, '사망 0.5초 = 6번째 칸 → 2행 첫 열');
  assert.equal(byKey.e_grunt_death.args[2] / 20, 1, '사망 6번째 칸은 2행');
  //  사망 칸의 그리기 높이 = h × 그 자리 배율 s(d 150) × (fh/refH)(r3.20 원근)
  assert.equal(byKey.e_grunt_death.args[8], 33 * PJ.s(150) * (20 / 20));
  //  3) 시트 없음: drawImage 자체가 없다(폴백 도형)
  r = recCtx();
  createRenderer3(r.ctx, null).draw(view(makeFxLike({ heroFire: 0.3, enemyHit: { 900: 0.25 }, corpses: [{ x: 200, z: run.z + 150, t: 0.5, h: 33 }] }), 1));
  assert.equal(r.ops.filter((o) => o.op === 'drawImage').length, 0, '시트·그림이 없으면 폴백만');
});
