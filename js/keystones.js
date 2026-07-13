// 키스톤 3종 (NEON ADAPTATION Phase 2). 원정당 1개, 첫 섹터 보스 후 선택.
// 단순 수치 상승이 아니라 행동/공격 형태를 바꾼다. 장점과 대가를 카드에 함께 명시.
// 효과 수치는 balance.js(BAL.keystone). 여기엔 정의 + 순수 헬퍼.
import { BAL } from './balance.js';

export const KEYSTONES = [
  {
    id: 'swarm_forge', icon: '🐝', name: '군체 용광로',
    change: '적 10마리 잡을 때마다 8초간 유령 순양함 2척',
    pro: '유령이 뜨면 순양함 공격 +25%',
    con: '기함 본체 공격 −10%',
  },
  {
    id: 'lance_echo', icon: '⚡', name: '공명 랜스',
    change: '강한 일격 뒤 메아리 일격이 한 번 더',
    pro: '메아리가 같은 줄을 45% 피해로 다시 때림',
    con: '자동 발사 공격 −12%',
  },
  {
    id: 'phase_afterimage', icon: '◈', name: '위상 잔상',
    change: '아슬아슬하게 3번 피하면 주변에 충격파',
    pro: '충격파가 적 총알 최대 8발 지움',
    con: '맞으면 집중·폭주가 사라짐',
  },
];

export const KEYSTONE_BY_ID = Object.fromEntries(KEYSTONES.map((k) => [k.id, k]));

export function keystoneIcon(id) {
  return KEYSTONE_BY_ID[id]?.icon || '';
}

/**
 * 키스톤 전투 배수/파생 효과 (순수). 미선택(null)이면 모든 값이 중립.
 *  - flagMult: 기함 직접 사격 배수
 *  - supportMult: 호위·순양함 사격 배수 (군체 용광로 유령 활성 시)
 *  - autoMult: 자동사격 전체 배수 (공명 랜스 대가)
 */
export function keystoneEffects(id, state = {}) {
  const K = BAL.keystone;
  const eff = { flagMult: 1, supportMult: 1, autoMult: 1 };
  if (id === 'swarm_forge') {
    eff.flagMult = 1 - K.swarmForge.flagPenalty;
    if ((state.forgeT || 0) > 0) eff.supportMult = 1 + K.swarmForge.supportBonus;
  } else if (id === 'lance_echo') {
    eff.autoMult = 1 - K.lanceEcho.autoPenalty;
  }
  // phase_afterimage: 전투 배수 없음 (근접 회피 파동만)
  return eff;
}

/** 키스톤 원정 상태 초기값 (노드 시작마다 카운터·타이머·예약 리셋). id는 별도 보존. */
export function freshKeystoneState() {
  return { kills: 0, forgeT: 0, grazeCount: 0, pendingEchoes: [] };
}

/**
 * 군체 용광로 킬 적립 (순수). 실제 적 처치 1회. 10킬마다 유령 8초(활성 중이면 +8, 최대 16).
 * 반환: { kills, forgeT, procced }
 */
export function forgeOnKill(state, cfg) {
  let kills = state.kills + 1;
  let forgeT = state.forgeT, procced = false;
  if (kills >= cfg.killsPerProc) {
    kills -= cfg.killsPerProc;
    forgeT = Math.min(forgeT + cfg.ghostDuration, cfg.ghostDurationMax);
    procced = true;
  }
  return { kills, forgeT, procced };
}
