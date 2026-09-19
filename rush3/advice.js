// rush3/advice.js — 결과 화면의 '실행 가능한 제안 한 줄'(계약서 6장 · 개정 r3 §6-2).
//  순수 함수: 난수·화면·balance·시계 없음. run 상태와 스테이지 배치의 hint 문구만 읽는다.
//  ⚠️main.js 에 두면 검사가 셸을 import 해야 하고, stages.js 에 두면 배치 데이터가 run 상태를 읽게 된다 → 별도 모듈.

//  기본 문구(배치에 hint 가 없을 때·손실 원인만 아는 경우)
export const ADVICE_DEFAULT = Object.freeze({
  shot: '저격수는 예고선이 보일 때 옆으로 한 번만 비키면 됩니다',
  touch: '돌격체는 쏘는 것보다 비키는 게 빠릅니다',
  //  아레나 착지 충격(r3.17): 붉은 원이 뜨면 그 원 밖으로 — 광장에서는 위아래로도 갈 수 있다
  shock: '붉은 원이 뜨면 그 원 밖으로 드래그하세요. 위아래로도 움직일 수 있어요',
  won: '다음엔 반대쪽 보급을 골라 보세요',
  //  ⚠️기본 문구도 **지금 할 수 있는 행동**이어야 한다(2026-09-17 2차 검수 N1). '병력을 더 모은 뒤'는
  //   그 게이트 앞에 보급이 없는 배치에서는 실행할 수 없는 권유였다 — 같은 줄에서 고를 수 있는 길을 알려준다
  gate: '음수 게이트는 같은 줄의 + 칸이나 옆 우회로로 피할 수 있습니다. 한 칸 옆으로 붙어 통과해 보세요',
  supply: '보급 통은 통이 화면에 보이기 시작할 때부터 그 차선으로 붙어야 열립니다',
});

//  배치(stage)에서 같은 id 의 hint 를 찾는다. run 쪽 행·통이 이미 hint 를 갖고 있으면 그것을 먼저 쓴다
function hintOf(obj, list, fallback) {
  if (obj && obj.hint) return obj.hint;
  if (obj && list) {
    for (const d of list) if (d.id === obj.id && d.hint) return d.hint;
  }
  return fallback;
}

/** 결과 화면 제안 한 줄. 우선순위(결정적·무작위 없음)
 *   1 음수 게이트 손실  → 마지막으로 통과한 음수 게이트 행의 hint(배치 문구가 있으면 **언제나 그것을 먼저** 쓴다)
 *   2 놓친 통(missed)   → z 가 가장 작은 놓친 통의 hint      ※ skipped(의도된 선택)는 후보에서 제외
 *   3′ 충격 손실 우세   → 아레나 기본 문구(r3.17 — lossByShock ≥ max(shot, touch) 이고 > 0. 종전 판은 lossByShock 이 없어 0 → 판정 불변)
 *   3 피격 손실 우세    → 저격수 기본 문구
 *   4 접촉 손실         → 돌격체 기본 문구
 *   5 그 외             → 성공 판은 '반대쪽 보급' 문구, 실패 판은 null(셸이 missedLine 을 쓴다)
 *  @returns {string|null} */
export function adviceLine(run, stage) {
  if (!run) return null;
  const rows = run.gateRows || [], supplies = run.supplies || [];
  if ((run.lossByGate || 0) > 0) {
    let row = null;
    for (const r of rows) {
      if (!r.passed) continue;
      if (run.lastBadGateId != null ? r.id !== run.lastBadGateId : !r.cells.some((c) => c.value < 0)) continue;
      if (!row || r.z > row.z) row = r;
    }
    if (row) return hintOf(row, stage && stage.gateRows, ADVICE_DEFAULT.gate);
  }
  if ((run.missedSupplies || 0) > 0) {
    let s = null;
    for (const c of supplies) {
      if (!c.missed || c.skipped) continue;
      if (!s || c.z < s.z) s = c;
    }
    if (s) return hintOf(s, stage && stage.supplies, ADVICE_DEFAULT.supply);
  }
  const shot = run.lossByShot || 0, touch = run.lossByTouch || 0, shock = run.lossByShock || 0;
  if (shock >= Math.max(shot, touch) && shock > 0) return ADVICE_DEFAULT.shock;
  if (shot >= touch && shot > 0) return ADVICE_DEFAULT.shot;
  if (touch > 0) return ADVICE_DEFAULT.touch;
  return run.won ? ADVICE_DEFAULT.won : null;
}
