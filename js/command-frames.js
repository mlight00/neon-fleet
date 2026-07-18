// 지휘 프레임 3종 (전면개편 §5.7). 기존 교리 3종을 흡수한다.
// 프레임 = 교리(패시브 수치) + 자동 스킬(능동 행동) + HUD 아이콘·발광색·사운드.
// 교리 효과 중복 적용 금지: 프레임 선택 시 squad.doctrine = frame.doctrine(패시브)로 한 번만,
// 여기서는 그 위에 얹히는 '자동 스킬' 레이어만 순수 로직으로 관리한다.
// 데이터·수치는 balance.js(BAL.gate1.frames).

/** 프레임 목록을 cfg(BAL.gate1.frames)에서 구성. */
export function framesFrom(cfg) {
  return ['assault', 'carrier', 'phase'].map((id) => ({ id, ...cfg[id] }));
}

export function frameById(cfg, id) {
  return cfg[id] ? { id, ...cfg[id] } : null;
}

/** 프레임 자동 스킬 상태 초기값. */
export function createFrameState() {
  return { id: null, kills: 0, timer: 0, focusT: 0, dashT: 0 };
}

/** 프레임 선택(원정당). id는 'assault'|'carrier'|'phase'. */
export function setFrame(state, id) {
  state.id = id;
  state.kills = 0;
  state.timer = 0;
  state.focusT = 0;
  state.dashT = 0;
  return state;
}

/** 어썰트: 처치 누적 → 전방 화력 집중(피해 창). 반환: 발동 시 { type:'focus', dmgMult, duration }. */
export function frameOnKill(state, cfg) {
  if (state.id !== 'assault') return null;
  const a = cfg.assault.auto;
  state.kills += 1;
  if (state.kills >= a.killsPerProc) {
    state.kills -= a.killsPerProc;
    state.focusT = a.focusDuration;
    return { type: 'focus', dmgMult: a.focusDmgMult, duration: a.focusDuration };
  }
  return null;
}

/**
 * 매 프레임 자동 스킬 진행. 반환: 이번 틱 발동한 스킬(없으면 null).
 *  캐리어: intervalSec마다 호위 동기화 일제사격 → { type:'volley', volleyMult }
 *  페이즈: FLOW 최대(threshold)에서 짧은 위상 돌파 → { type:'dash', invuln }
 * ctx = { flow } (현재 집중 게이지).
 */
export function tickFrame(state, cfg, dt, ctx = {}) {
  if (state.focusT > 0) state.focusT = Math.max(0, state.focusT - dt);
  if (state.dashT > 0) state.dashT = Math.max(0, state.dashT - dt);
  if (state.id === 'carrier') {
    const c = cfg.carrier.auto;
    state.timer += dt;
    if (state.timer >= c.intervalSec) {
      state.timer -= c.intervalSec;
      return { type: 'volley', volleyMult: c.volleyMult };
    }
  } else if (state.id === 'phase') {
    const p = cfg.phase.auto;
    if ((ctx.flow ?? 0) >= p.flowThreshold && state.dashT <= 0) {
      state.dashT = p.dashInvuln;
      return { type: 'dash', invuln: p.dashInvuln };
    }
  }
  return null;
}

/** 어썰트 집중 창의 무기 피해 배수(비활성·미설치 시 1). */
export function frameDamageMult(state, cfg) {
  if (state && state.id === 'assault' && state.focusT > 0) return cfg.assault.auto.focusDmgMult;
  return 1;
}

/** 페이즈 위상 돌파 무적 활성 여부(미설치 시 false). */
export function frameInvulnActive(state) {
  return !!state && state.id === 'phase' && state.dashT > 0;
}

/** HUD 표시용(아이콘·발광색). 미선택이면 중립. */
export function frameHud(cfg, id) {
  const f = cfg[id];
  return f ? { icon: f.icon, glow: f.glow, name: f.name } : { icon: '', glow: '#8fb4d8', name: '' };
}
