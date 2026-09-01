// rush/gates.js — 게이트 수학. 표시는 render 가, 여기는 순수 계산만.
import { BAL } from './balance.js';

export const GATE_OPS = ['add', 'mul', 'sub', 'div'];
export const isGood = (op) => op === 'add' || op === 'mul';
export const gateColor = (op) => BAL.gates.colors[op];

export function applyGate(count, gate) {
  const n = gate.value;
  let r;
  if (gate.op === 'add') r = count + n;
  else if (gate.op === 'mul') r = count * n;
  else if (gate.op === 'sub') r = count - n;
  else r = Math.ceil(count / n);
  return Math.max(0, Math.min(BAL.squad.maxCount, Math.round(r)));   // 상한 999(라스트워식) — 후반은 '덜 나쁜 쪽' 게임
}

const lerp = (a, b, t) => a + (b - a) * t;

function makeGate(rnd, t, good) {
  const g = BAL.gates;
  if (good) {
    //  곱하기 게이트 폐지(2026-09-02 이사 결정 — 병력이 너무 금방 는다). 좋은 게이트 = 더하기만.
    return { op: 'add', value: Math.round(lerp(g.addMin, g.addMax, t) * (0.7 + rnd() * 0.6)) || 1 };
  }
  const divP = 0.2 + 0.3 * t;
  return rnd() >= divP
    ? { op: 'sub', value: Math.round(lerp(g.subMin, g.subMax, t) * (0.7 + rnd() * 0.6)) || 1 }
    : { op: 'div', value: g.divVals[(rnd() * g.divVals.length) | 0] };
}

/** 쌍 패턴: 좋+나쁨 55% / 좋+좋 25% / 나쁨+나쁨 20% — 라스트워식 "덜 나쁜 쪽 고르기" 포함.
 *  guaranteeGood: 나쁨+나쁨 금지(보스 직전 게이트 — 함정으로 억울하게 죽지 않게). */
export function makeGatePair(rnd, t, guaranteeGood = false) {
  const roll = rnd();
  let kinds = roll < 0.55 ? [true, false] : roll < 0.7 ? [true, true] : [false, false];
  if ((guaranteeGood || t < 0.08) && !kinds[0] && !kinds[1]) kinds = [true, false];   // 판 초반·보스 직전엔 회복 불능 함정 금지
  if (rnd() < 0.5) kinds.reverse();
  let left = makeGate(rnd, t, kinds[0]);
  let right = makeGate(rnd, t, kinds[1]);
  if (left.op === right.op && left.value === right.value) right = makeGate(rnd, t, !kinds[1]);
  return { left, right };
}
