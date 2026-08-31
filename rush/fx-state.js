// rush/fx-state.js — 연출의 "판정"만 순수하게. 그리기·소리는 render/main 이 담당.
import { BAL } from './balance.js';

export function recordWatcher(best) {
  let broken = false;
  return { update(count) {
    if (!broken && best > 0 && count > best) { broken = true; return 'break'; }
    if (!broken && best === 0 && count > 1) { broken = true; return 'break'; }   // 첫 판도 축하
    return null;
  } };
}

export function slowmoCtl() {
  let uses = 0, t = 0, above = true;
  return { update(count, dt) {
    if (t > 0) { t -= dt; return t > 0 ? BAL.fx.slowmoScale : 1; }
    if (count > BAL.fx.slowmoAt) { above = true; return 1; }
    if (above && uses < BAL.fx.slowmoMax) { above = false; uses++; t = BAL.fx.slowmoDur; return BAL.fx.slowmoScale; }
    return 1;
  } };
}

export function continueToken(isDaily) {
  let used = false;
  return {
    canUse: () => !isDaily && !used,
    use() { if (isDaily || used) return false; used = true; return true; },
  };
}
