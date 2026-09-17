// 확정 −10 게이트 한 화면 실측(2026-09-17 수정 라운드 1). 옛 동작(무조건 '지금 쏘면 +1')과 고친 동작을 나란히 찍는다.
import { buildStage } from '../../../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../../../rush3/combat.js';
import { createRenderer3 } from '../../../rush3/render.js';
import { BAL3 } from '../../../rush3/balance.js';
import { GATE_TIP_OPEN, GATE_TIP_OPEN_FIXED, isFixedGateRow } from '../../../rush3/main.js';
import { hashSeed } from '../../../rush/rng.js';

function recCtx() {
  const ops = [], stack = [], grad = { addColorStop() {} };
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
const fxLike = (o) => ({ parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {},
  shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null, lotOpen: 0, lotSeen: true, lotSame: false, ...o });

function seedFor(pick) {
  for (let i = 0; i < 40; i++) {
    const s = hashSeed('lot:3:0:' + (1_700_000_000_000 + i * 86_400_000));
    if (buildStage(3, { lotterySeed: s }).lottery.pick === pick) return s;
  }
  throw new Error('seed not found: ' + pick);
}

for (const pick of ['trapGate', 'badGate']) {
  const stage = buildStage(3, { lotterySeed: seedFor(pick) });
  const run = createRun(stage);
  const rowId = stage.lottery.rowId;
  const rowOf = () => run.gateRows.find((r) => r.id === rowId);
  let n = 0;
  while (n < 14400 && !rowOf().armed) { stepRun(run, { pointerX: run.z >= 4000 ? 330 : 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); n++; }
  const row = rowOf();
  const fixed = isFixedGateRow(row);
  const cells = row.cells.map((c) => c.value + '(상한 ' + c.maxValue + ')').join(' · ');
  for (const [mode, text] of [['옛 동작', GATE_TIP_OPEN], ['고친 뒤', fixed ? GATE_TIP_OPEN_FIXED : GATE_TIP_OPEN]]) {
    const { ctx, ops } = recCtx();
    createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: fxLike({ gateTip: { [rowId]: { text, t: BAL3.fx.gateTipSec } } }),
      hud: { distM: 10 }, buttons: [], saveOk: true });
    const texts = ops.filter((o) => o.op === 'fillText').map((o) => o.args[0])
      .filter((t) => t === '확정' || t === GATE_TIP_OPEN || t === GATE_TIP_OPEN_FIXED || /^[−+]?\d+$/.test(t));
    console.log([pick, 'armZ에서 행=' + rowId, 'z=' + Math.round(run.z), '칸=' + cells, 'isFixedGateRow=' + fixed, mode, JSON.stringify(texts)].join(' | '));
  }
}
