// 근접 회피(FLOW)와 NEON RUSH 순수 로직 (NEON ADAPTATION Phase 2).
// 렌더·오디오·world 접근 없음. 상태 객체 {flow, rushT, combo, sinceGraze}만 다룬다.
import { BAL } from './balance.js';

export const flowCfg = () => BAL.flow;

/** 실제 피격 경계(hitRadius+bulletRadius) 바깥 grazeBand 구간을 통과했는가. 경계값은 테스트로 고정. */
export function isGrazeDistance(distance, hitRadius, bulletRadius, band) {
  const hitDist = hitRadius + bulletRadius;
  return distance > hitDist && distance <= hitDist + band;
}

/**
 * graze 1회 적립. RUSH 중에는 FLOW를 올리지 않는다(rushStarted=false).
 * FLOW가 max에 도달하면 즉시 RUSH 발동 + FLOW 0.
 * 반환: { flow, rushT, combo, sinceGraze, rushStarted }
 */
export function addFlow(state, cfg, gain = cfg.gain) {
  if (state.rushT > 0) {
    return { flow: state.flow, rushT: state.rushT, combo: state.combo + 1, sinceGraze: 0, rushStarted: false };
  }
  let flow = Math.min(cfg.max, state.flow + gain);
  const combo = state.combo + 1;
  let rushT = state.rushT, rushStarted = false;
  if (flow >= cfg.max) { rushT = cfg.rushDuration; flow = 0; rushStarted = true; }
  return { flow, rushT, combo, sinceGraze: 0, rushStarted };
}

/**
 * dt 경과: RUSH 타이머 감소(0에서 rushEnded), 지연(decayDelay) 후 초당 decayPerSec 감소(0 하한).
 * 반환: { flow, rushT, combo, sinceGraze, rushEnded }
 */
export function updateFlow(state, dt, cfg) {
  let { flow, rushT, combo, sinceGraze } = state;
  let rushEnded = false;
  if (rushT > 0) {
    rushT -= dt;
    if (rushT <= 0) { rushT = 0; rushEnded = true; }
  }
  sinceGraze += dt;
  if (rushT <= 0 && sinceGraze > cfg.decayDelay) {
    flow = Math.max(0, flow - cfg.decayPerSec * dt);
    if (flow === 0) combo = 0;
  }
  return { flow, rushT, combo, sinceGraze, rushEnded };
}

/**
 * 실제 전투 피격: RUSH 중이면 즉시 종료 + FLOW 0, 아니면 FLOW -= hitLoss. 콤보 0.
 * 반환: { flow, rushT, combo, sinceGraze, rushEnded }
 */
export function onFlowHit(state, cfg) {
  if (state.rushT > 0) {
    return { flow: 0, rushT: 0, combo: 0, sinceGraze: state.sinceGraze, rushEnded: true };
  }
  return { flow: Math.max(0, state.flow - cfg.hitLoss), rushT: 0, combo: 0, sinceGraze: state.sinceGraze, rushEnded: false };
}
