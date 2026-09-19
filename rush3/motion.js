// rush3/motion.js — 왕복 운동 공용 헬퍼(r3.15 검수 반영). 순수 함수만(난수·시계·화면·balance 없음).
//  차량 통(supply.vehicleX)과 보너스 표적(bonus.targetX)이 **같은 삼각파**를 쓴다 — 사양은 '차량 장치의 move 와 같은 삼각파'라
//  공식을 한 곳에 두어 한쪽만 고쳐 두 장치의 움직임이 갈라지는 일이 없게 한다.

/** 삼각파 왕복: u = (u0 + t / period) mod 1, tri = u < 0.5 ? 2u : 2 − 2u, x = x0 + (x1 − x0)·tri.
 *  x0 → x1 → x0 가 period 초, u0 = 0~1 출발 위상(0 = x0 에서 오른쪽으로, 0.5 = x1 에서 왼쪽으로).
 *  t 만의 함수 — 같은 STEP 수면 같은 x(결정성). period ≤ 0 이면 x0 에 선다. */
export function triWave(x0, x1, period, u0, t) {
  const span = x1 - x0;
  if (!(period > 0)) return x0;
  let u = (u0 + t / period) % 1;
  if (u < 0) u += 1;
  return x0 + span * (u < 0.5 ? 2 * u : 2 - 2 * u);
}
