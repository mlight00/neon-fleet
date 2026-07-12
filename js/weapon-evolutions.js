// 무기 진화 정의 + 순수 헬퍼 (원정 내부 상태 — localStorage에 저장하지 않음).
// 무기별 Lv3(최대) 달성 후 같은 색 캡슐을 다시 얻으면 2택 진화. 수치는 balance.js(BAL.weaponEvolution).
// 정의는 여기, 실제 발사 변화는 entities.js가 이 id로 분기한다.

export const WEAPON_EVOLUTIONS = {
  vulcan: [
    { id: 'vulcan_storm',  name: '폭풍 발칸',   short: '폭풍',   shape: '적중 후 도탄',        pro: '다수전 특화',      con: '단일 표적 DPS 소폭↓' },
    { id: 'vulcan_needle', name: '니들 개틀링', short: '니들',   shape: '초고속 집중 사격',    pro: '단일 표적 특화',   con: '확산 거의 없음' },
  ],
  laser: [
    { id: 'laser_prism',  name: '프리즘 어레이', short: '프리즘', shape: '관통 후 좌우 분열',   pro: '다수전 특화',      con: '보스 분열 무효' },
    { id: 'laser_cutter', name: '널 커터',       short: '커터',   shape: '5탄마다 강화 절단탄', pro: '집중전·적탄 제거', con: '평상시 변화 적음' },
  ],
  homing: [
    { id: 'homing_wasp',  name: '와스프 스웜',  short: '와스프', shape: '소형 미사일 3발',     pro: '분산 표적 특화',   con: '폭발 없음' },
    { id: 'homing_siege', name: '시즈 토피도',  short: '시즈',   shape: '대형 폭발 미사일',    pro: '고화력·보스 특화', con: '느린 발사·기동' },
  ],
};

// 2단계 진화(초진화): 1단계 진화 후 같은 색 캡슐을 다시 얻으면 2택. 1단계 갈래와 무관하게 무기 전체를 증폭한다.
// 실제 수치는 balance.js(BAL.weaponSuperEvolution). 각각 뚜렷한 정체성(광역/관통/속사/강타).
export const WEAPON_SUPER_EVOLUTIONS = {
  vulcan: [
    { id: 'vulcan_tempest', name: '템페스트',   short: '템페스트', shape: '초광역 폭풍탄',   pro: '확산·연사 극대',   con: '단일 표적 비효율' },
    { id: 'vulcan_lance',   name: '랜스 발칸',   short: '랜스',     shape: '관통 집중탄',     pro: '관통+치명·단일 극대', con: '확산 대폭↓' },
  ],
  laser: [
    { id: 'laser_nova',     name: '노바 빔',     short: '노바',     shape: '증폭 관통 빔',     pro: '피해·관통 대폭↑',  con: '' },
    { id: 'laser_reaper',   name: '리퍼 빔',     short: '리퍼',     shape: '초고속 절단 빔',   pro: '연사·관통↑',       con: '탄당 피해 소폭↓' },
  ],
  homing: [
    { id: 'homing_legion',  name: '레기온',      short: '레기온',   shape: '미사일 난사',      pro: '발사 수·연사 극대', con: '탄당 피해 소폭↓' },
    { id: 'homing_nova',    name: '노바 토피도',  short: '노바',     shape: '초대형 강타',      pro: '단발 피해 극대',   con: '발사 느림' },
  ],
};

/** 모든 진화 id (중복 검증·HUD용) — 1·2단계 전부 */
export const ALL_EVOLUTION_IDS = [...Object.values(WEAPON_EVOLUTIONS), ...Object.values(WEAPON_SUPER_EVOLUTIONS)].flat().map((e) => e.id);
const EVO_BY_ID = Object.fromEntries([...Object.values(WEAPON_EVOLUTIONS), ...Object.values(WEAPON_SUPER_EVOLUTIONS)].flat().map((e) => [e.id, e]));

/** 무기의 1단계 진화 옵션 2장 (순수). 알 수 없는 무기면 빈 배열. */
export function evolutionOptions(weapon) {
  return WEAPON_EVOLUTIONS[weapon] || [];
}

/** 무기의 2단계 초진화 옵션 2장 (순수). */
export function superEvolutionOptions(weapon) {
  return WEAPON_SUPER_EVOLUTIONS[weapon] || [];
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

/**
 * 무기 진행 사다리 판정 (순수). Lv MAX에서 같은 색 캡슐·레벨업을 다시 얻었을 때 무엇을 할지 결정한다.
 * 진행: 베이스Lv1-3 → [pick1 진화선택] → 진화Lv1→2→3(evoUp) → [pick2 초진화선택] → 초진화Lv1→2→3(superUp) → 재선택(re)
 *  반환: 'pick1' | 'evoUp' | 'pick2' | 'superUp' | 're' | null(베이스 레벨 중 or 불가 무기)
 */
export function evolutionStage(weapon, weaponLv, maxLv, evo, evoLv, evo2, superLv, maxEvoLv = 3) {
  if (weaponLv < maxLv || !WEAPON_EVOLUTIONS[weapon]) return null;
  if (!evo[weapon]) return 'pick1';
  if ((evoLv[weapon] || 0) < maxEvoLv) return 'evoUp';
  if (!evo2[weapon]) return 'pick2';
  if ((superLv[weapon] || 0) < maxEvoLv) return 'superUp';
  return 're';
}

/** 진화 레벨 피해 배수 (순수): 진화 안 했으면 1, 했으면 1 + (레벨-1)×step. */
export function evoLevelMult(evoId, evoLevel, step) {
  return evoId ? 1 + Math.max(0, (evoLevel || 1) - 1) * step : 1;
}

/** 2단계 초진화 전투 배수 (순수). 미선택이면 중립. */
export function superEvoEffects(id, cfg) {
  const d = (cfg && cfg[id]) || null;
  return {
    dmgMult: d?.dmgMult ?? 1,
    rateMult: d?.rateMult ?? 1,
    spreadMult: d?.spreadMult ?? 1,
    pierceBonus: d?.pierceBonus ?? 0,
  };
}

/** 널 커터: shotCount번째 레이저 탄이 강화 절단탄인가 (순수, every=5). */
export function isCutterShot(shotCount, every) {
  return every > 0 && shotCount % every === 0;
}
