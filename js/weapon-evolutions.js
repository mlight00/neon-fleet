// 무기 진화 정의 + 순수 헬퍼 (원정 내부 상태 — localStorage에 저장하지 않음).
// 무기별 Lv3(최대) 달성 후 같은 색 캡슐을 다시 얻으면 2택 진화. 수치는 balance.js(BAL.weaponEvolution).
// 정의는 여기, 실제 발사 변화는 entities.js가 이 id로 분기한다.

export const WEAPON_EVOLUTIONS = {
  vulcan: [
    { id: 'vulcan_storm',  name: '폭풍 발칸',   shape: '적중 후 도탄',        pro: '다수전 특화',      con: '단일 표적 DPS 소폭↓' },
    { id: 'vulcan_needle', name: '니들 개틀링', shape: '초고속 집중 사격',    pro: '단일 표적 특화',   con: '확산 거의 없음' },
  ],
  laser: [
    { id: 'laser_prism',  name: '프리즘 어레이', shape: '관통 후 좌우 분열',   pro: '다수전 특화',      con: '보스 분열 무효' },
    { id: 'laser_cutter', name: '널 커터',       shape: '5탄마다 강화 절단탄', pro: '집중전·적탄 제거', con: '평상시 변화 적음' },
  ],
  homing: [
    { id: 'homing_wasp',  name: '와스프 스웜',  shape: '소형 미사일 3발',     pro: '분산 표적 특화',   con: '폭발 없음' },
    { id: 'homing_siege', name: '시즈 토피도',  shape: '대형 폭발 미사일',    pro: '고화력·보스 특화', con: '느린 발사·기동' },
  ],
};

/** 모든 진화 id (중복 검증·HUD용) */
export const ALL_EVOLUTION_IDS = Object.values(WEAPON_EVOLUTIONS).flat().map((e) => e.id);
const EVO_BY_ID = Object.fromEntries(Object.values(WEAPON_EVOLUTIONS).flat().map((e) => [e.id, e]));

/** 무기의 진화 옵션 2장 (순수). 알 수 없는 무기면 빈 배열. */
export function evolutionOptions(weapon) {
  return WEAPON_EVOLUTIONS[weapon] || [];
}

/** 진화 정의 조회 (순수). HUD 짧은 이름 등에 사용. */
export function evolutionDef(id) {
  return EVO_BY_ID[id] || null;
}

/**
 * 무기 진화 발생 가능 여부 (순수).
 * 조건: 무기 Lv가 최대 + 진화 가능한 무기 + 해당 무기가 아직 미진화.
 * evolutions = { vulcan, laser, homing } (각 null | 진화id)
 */
export function canEvolveWeapon(weapon, weaponLv, maxLv, evolutions) {
  return weaponLv >= maxLv && !!WEAPON_EVOLUTIONS[weapon] && !evolutions[weapon];
}
