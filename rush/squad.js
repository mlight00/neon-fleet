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

export function clampX(x) { return Math.max(80, Math.min(400, x)); }   // 도로 폭 = 게이트 폭

/** 티어 갱신(히스테리시스): 오를 땐 즉시, 내릴 땐 임계의 demoteRatio 아래로 떨어져야 강등. */
export function tierStep(curTier, count) {
  const raw = tierFor(count);
  if (raw > curTier) return raw;
  let t = curTier;
  while (t > 0 && count < BAL.tiers[t] * BAL.demoteRatio) t--;
  return t;
}

/** 병력 → 화면에 그릴 유닛 수. 12까지는 1:1(한 명씩 느는 맛), 이후 7명당 1기, 최대 50기.
 *  실제 병력은 발밑 숫자가 전달한다(라스트워식 축약 표시). */
export function displayUnits(count) {
  if (count <= 12) return Math.max(0, count);
  return Math.min(50, 12 + Math.round((count - 12) / 7));
}

/** 대형의 실제 반경(px) — 피탄·접촉 판정이 이 크기를 쓴다(부대가 작으면 얻어맞는 폭도 작게). */
export function squadRadius(count) {
  const n = displayUnits(Math.min(count, BAL.squad.drawCap));
  if (n <= 1) return BAL.squad.heroSize / 2;
  let k = 1, placed = 1;
  while (placed < n) {
    const r = BAL.squad.ringStart + (k - 1) * BAL.squad.ringGap;
    placed += Math.max(3, Math.round(Math.PI * 1.5 * r / 22));
    k++;
  }
  return BAL.squad.ringStart + (k - 2) * BAL.squad.ringGap + BAL.squad.soldierSize / 2;
}
