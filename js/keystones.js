// 키스톤 3종 (NEON ADAPTATION Phase 2). 원정당 1개, 첫 섹터 보스 후 선택.
// 단순 수치 상승이 아니라 행동/공격 형태를 바꾼다. 장점과 대가를 카드에 함께 명시.
// 효과 수치는 balance.js(BAL.keystone). 여기엔 정의 + 순수 헬퍼.
import { BAL } from './balance.js';

export const KEYSTONES = [
  {
    id: 'swarm_forge', icon: '🐝', name: '군체 용광로',
    change: '10킬마다 8초간 유령 순양함 2척 전개',
    pro: '유령 활성 중 호위·순양함 사격 +25%',
    con: '기함 직접 사격 −10%',
  },
  {
    id: 'lance_echo', icon: '⚡', name: '공명 랜스',
    change: '3단+ 차지 랜스가 0.35초 후 메아리 랜스 재발사',
    pro: '메아리 피해 45%, 폭 65% (같은 컬럼 관통)',
    con: '자동사격 피해 −12%',
  },
  {
    id: 'phase_afterimage', icon: '◈', name: '위상 잔상',
    change: '근접 회피 3회마다 함대 주변 70px 위상 파동',
    pro: '파동이 적탄 최대 8발 제거',
    con: '피격 시 FLOW와 RUSH를 전부 잃음',
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
