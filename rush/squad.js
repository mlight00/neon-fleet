// rush/squad.js — 병력 수가 곧 화력이고 곧 그림이다. 대형은 위가 뾰족한 쐐기.
import { BAL } from './balance.js';

export function tierFor(count) {
  const t = BAL.tiers;
  for (let i = t.length - 1; i >= 0; i--) if (count >= t[i]) return i;
  return 0;
}

/** 행 r(0=선두)에 r+1 자리, 행마다 뒤로. drawCap 초과분은 그리지 않는다(숫자 라벨이 담당). */
export function formation(count) {
  const n = Math.min(count, BAL.squad.drawCap);
  const sx = BAL.squad.unitSpacingX, sy = BAL.squad.unitSpacingY;
  const out = [];
  let r = 0, placed = 0;
  while (placed < n) {
    const cols = Math.min(r + 1, 13);                    // 한 행 최대 13 — 화면 폭 보호
    const take = Math.min(cols, n - placed);
    for (let k = 0; k < take; k++) {
      out.push({ x: (k - (take - 1) / 2) * sx, y: r * sy });
    }
    placed += take; r++;
  }
  return out;
}

export function clampX(x) { return Math.max(40, Math.min(440, x)); }
