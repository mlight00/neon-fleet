// 킬 이벤트 멱등 판정 (NEON ADAPTATION Phase 2 후속). 순수 함수 — DOM·world 미접근.
// "플레이어 공격으로 살아있던 적이 죽은 순간"을 개체당 정확히 한 번만 인정한다.
// 폭발 연쇄가 재귀적으로 같은 적을 다시 만나도, _killHandled로 두 번째는 false를 반환한다.

/**
 * 이 개체를 '실제 적 처치'로 처음 청구하면 true(그리고 _killHandled 표시), 아니면 false.
 *  - 비적대(크리스탈·수송선·캡슐·보스), 아직 살아있음, 이미 처리됨 → false
 */
export function claimKill(e) {
  if (!e || !e.isEnemy || !e.dead || e._killHandled) return false;
  e._killHandled = true;
  return true;
}
