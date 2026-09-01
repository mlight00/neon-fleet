// rush/squad.js — 병력 수가 곧 화력이고 곧 그림이다. 대형은 위가 뾰족한 쐐기.
import { BAL } from './balance.js';

export function tierFor(count) {
  const t = BAL.tiers;
  for (let i = t.length - 1; i >= 0; i--) if (count >= t[i]) return i;
  return 0;
}

/** 라스트워식 둥근 군집: 히어로(0,0)를 중심으로 동심 링에 병사를 채운다.
 *  전방 ±45도는 비워 히어로가 보이게. drawCap 초과분은 그리지 않는다(숫자 라벨이 담당). */
export function formation(count) {
  const n = Math.min(count, BAL.squad.drawCap);
  const out = [{ x: 0, y: 0 }];                       // index 0 = 히어로 자리
  let k = 1;
  while (out.length < n) {
    const r = BAL.squad.ringStart + (k - 1) * BAL.squad.ringGap;
    const usable = Math.PI * 1.5;                     // 전방 90도 부채꼴 제외
    const slots = Math.max(3, Math.round(usable * r / 22));
    for (let i = 0; i < slots && out.length < n; i++) {
      const a = Math.PI * 0.25 + (i + (k % 2) * 0.5) * (usable / slots);   // 0=전방(위), π=정후방
      out.push({ x: Math.round(Math.sin(a) * r), y: Math.round(-Math.cos(a) * r) });
    }
    k++;
  }
  return out.slice(0, n);
}

export function clampX(x) { return Math.max(40, Math.min(440, x)); }
