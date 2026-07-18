// 무기 조합 공명 3종 (전면개편 §5.4). 두 무기의 조합이 만드는 제3의 행동.
// keystones.js의 lance_echo는 공명이 아니다(R6 근거로 쓰지 않는다).
// 순수 로직 — 발동 조건·표적·모양이 바뀌고, 피해는 원래 두 무기와 구분 집계한다.
// 공명이 공명을 재귀 발동하지 않도록 발동 소스에 표식(fromResonance)을 두고 충전에서 제외한다.

// 세 공명. 각 쌍은 서로 다른 두 무기. 순서 무관 매칭.
export const RESONANCES = {
  railStorm:    { id: 'railStorm',    name: '레일 스톰',       pair: ['vulcan', 'laser'],  trigger: 'charge' },
  microMissile: { id: 'microMissile', name: '마이크로 미사일 포화', pair: ['vulcan', 'homing'], trigger: 'charge' },
  seekerBeam:   { id: 'seekerBeam',   name: '시커 빔',         pair: ['laser', 'homing'],  trigger: 'mark' },
};

const PAIR_KEY = (a, b) => [a, b].sort().join('+');
const BY_PAIR = Object.fromEntries(Object.values(RESONANCES).map((r) => [PAIR_KEY(...r.pair), r.id]));

/** 두 무기 조합에 해당하는 공명 id (없으면 null). 순서 무관. */
export function resonanceForPair(weapons) {
  const ws = (weapons || []).filter(Boolean);
  if (ws.length < 2) return null;
  return BY_PAIR[PAIR_KEY(ws[0], ws[1])] || null;
}

/** 공명 원정 상태 초기값. */
export function createResonanceState() {
  return {
    activeId: null,        // 현재 로드아웃의 공명(없으면 null)
    charge: 0,             // 충전형(railStorm/microMissile) 누적
    cooldown: 0,           // 발동 후 재충전 잠금(초)
    procs: 0,              // 총 발동 횟수
    firstCompletedAt: null,// 첫 공명 완성 시각(초) — 예고·측정용
    markId: null,          // 시커 빔: 현재 표식 대상 id
    markT: 0,              // 표식 잔여 시간(초)
    lockT: 0,              // 발동 직후 재귀 방지 잠금(짧게)
  };
}

/** 로드아웃 무기 배열로 활성 공명을 갱신. 조합이 깨지면 충전 리셋. */
export function setLoadout(state, weapons) {
  const id = resonanceForPair(weapons);
  if (id !== state.activeId) {
    state.activeId = id;
    state.charge = 0;
    state.cooldown = 0;
    state.markId = null;
    state.markT = 0;
  }
  return state;
}

/**
 * 명중/처치 이벤트로 충전(§5.4). 재귀 방지: 공명이 만든 타격(fromResonance)은 충전에서 제외.
 * cfg = BAL.gate1.resonance. sourceWeaponId = 이 타격을 만든 무기.
 * 반환: 충전이 반영됐으면 true.
 */
export function onHit(state, cfg, { sourceWeaponId, fromResonance = false } = {}) {
  if (!state.activeId || fromResonance) return false;      // 재귀 잠금
  const res = RESONANCES[state.activeId];
  if (res.trigger !== 'charge') return false;
  // 충전은 쌍의 두 무기 명중 모두에서 쌓인다 → 단일 보스처럼 한 무기가 잘 안 맞는 상황에서도
  //  기여도가 안정화된다(예: railStorm에서 발칸이 확산으로 보스를 빗나가도 레이저 명중이 충전).
  if (!res.pair.includes(sourceWeaponId)) return false;
  const c = cfg[state.activeId];
  state.charge += c.chargePerHit;
  return true;
}

/** 매 프레임 타이머 감쇠. */
export function tick(state, dt) {
  if (state.cooldown > 0) state.cooldown = Math.max(0, state.cooldown - dt);
  if (state.lockT > 0) state.lockT = Math.max(0, state.lockT - dt);
  if (state.markT > 0) { state.markT = Math.max(0, state.markT - dt); if (state.markT === 0) state.markId = null; }
  return state;
}

/** 충전형 공명 발동 진행률 0~1 (HUD 예고). 표식형이면 표식 활성 여부를 1/0으로. */
export function chargeFrac(state, cfg) {
  if (!state.activeId) return 0;
  const res = RESONANCES[state.activeId];
  if (res.trigger === 'mark') return state.markId ? 1 : 0;
  const c = cfg[state.activeId];
  return Math.min(1, state.charge / c.threshold);
}

/**
 * 충전형 공명 발동 시도(§5.4). 충전이 임계 이상이고 쿨다운이 끝났으면 발동.
 *  발동 시 충전 소진·쿨다운·재귀잠금 설정, 첫 완성 시각 기록.
 * 반환: 발동 안 하면 null, 하면 발사 스펙 { id, kind, ... }.
 */
export function tryProc(state, cfg, nowSec) {
  if (!state.activeId) return null;
  const res = RESONANCES[state.activeId];
  if (res.trigger !== 'charge') return null;
  const c = cfg[state.activeId];
  if (state.cooldown > 0 || state.charge < c.threshold) return null;
  state.charge -= c.threshold;
  state.cooldown = c.cooldown;
  state.lockT = 0.12;                 // 발동 프레임의 재귀 방지
  state.procs += 1;
  if (state.firstCompletedAt == null && nowSec != null) state.firstCompletedAt = nowSec;
  if (state.activeId === 'railStorm') {
    return { id: 'railStorm', kind: 'rail', slot: 'wing', width: c.width, pierce: c.pierce, dmgFrac: c.dmgFrac };
  }
  // microMissile
  return { id: 'microMissile', kind: 'missiles', count: c.count, dmgFrac: c.dmgFrac };
}

/**
 * 시커 빔: 레이저가 표적을 지정(§5.4). 표식 세팅 + 첫 완성 기록.
 * 반환: 표식이 새로 걸렸으면 true.
 */
export function onLaserMark(state, cfg, targetId, nowSec) {
  if (state.activeId !== 'seekerBeam' || targetId == null) return false;
  const c = cfg.seekerBeam;
  const wasMarked = state.markId != null;
  state.markId = targetId;
  state.markT = c.markDuration;
  if (state.firstCompletedAt == null && nowSec != null) state.firstCompletedAt = nowSec;
  if (!wasMarked) state.procs += 1;
  return true;
}

/** 표식 대상이 파괴되면 표식 해제 → 다음 적으로 이동하도록. */
export function onEnemyRemoved(state, enemyId) {
  if (state.activeId === 'seekerBeam' && state.markId === enemyId) {
    state.markId = null;
    state.markT = 0;
  }
}

/** 시커 빔: 이 미사일 타격이 표식 대상을 맞혔는가(공명 피해 귀속·우선추적 보너스). */
export function isSeekerHit(state, targetId) {
  return state.activeId === 'seekerBeam' && targetId != null && state.markId === targetId;
}

/** 공명 예고를 띄워야 하는가(§5.4: 완성 20~40초 전). 충전형만. */
export function shouldTelegraph(state, cfg) {
  if (!state.activeId) return false;
  const res = RESONANCES[state.activeId];
  if (res.trigger === 'mark') return state.markId == null; // 표식 없으면 "레이저로 표적 지정" 안내
  return chargeFrac(state, cfg) >= 0.5 && state.cooldown <= 0;
}
