// 무기 진화 정의 + 순수 헬퍼 (원정 내부 상태 — localStorage에 저장하지 않음).
// 무기별 Lv3(최대) 달성 후 같은 색 캡슐을 다시 얻으면 2택 진화. 수치는 balance.js(BAL.weaponEvolution).
// 정의는 여기, 실제 발사 변화는 entities.js가 이 id로 분기한다.

export const WEAPON_EVOLUTIONS = {
  vulcan: [
    { id: 'vulcan_storm',  name: '폭풍 발칸',   short: '폭풍',   shape: '탄환을 넓게 퍼뜨리고, 적에게 맞으면 주변 적에게 튕깁니다.', pro: '다수의 적 처리에 강함',   con: '보스·단일 대상 피해가 낮음' },
    { id: 'vulcan_needle', name: '니들 개틀링', short: '니들',   shape: '관통탄을 한 줄로 빠르게 연사합니다.',        pro: '보스·단일 대상에 강함',   con: '좌우로 퍼진 적에 약함' },
  ],
  laser: [
    { id: 'laser_prism',  name: '프리즘 어레이', short: '프리즘', shape: '적을 관통한 빔이 좌우로 분열됩니다.',           pro: '다수의 적 처리에 강함',   con: '보스에게는 분열 효과 없음' },
    { id: 'laser_cutter', name: '널 커터',       short: '커터',   shape: '일정 확률로 굵은 빔을 발사해 적 탄환을 제거합니다.',       pro: '탄막 제거와 생존에 강함', con: '순수 공격력은 낮음' },
  ],
  homing: [
    { id: 'homing_wasp',  name: '와스프 스웜',  short: '와스프', shape: '소형 유도 미사일 5발을 동시에 발사합니다.',   pro: '흩어진 적을 자동 추적',   con: '미사일 1발의 피해가 낮음' },
    { id: 'homing_siege', name: '시즈 어뢰',  short: '시즈',   shape: '느리지만 거대한 폭발을 일으키는 어뢰를 발사합니다.',   pro: '보스·단일 대상에 매우 강함', con: '발사 속도가 느림' },
  ],
};

// 2단계 진화(초진화): 1단계 진화 후 같은 색 캡슐을 다시 얻으면 2택. 1단계 갈래와 무관하게 무기 전체를 증폭한다.
// 실제 수치는 balance.js(BAL.weaponSuperEvolution). 각각 뚜렷한 정체성(광역/관통/속사/강타).
export const WEAPON_SUPER_EVOLUTIONS = {
  vulcan: [
    { id: 'vulcan_tempest', name: '템페스트',   short: '템페스트', shape: '더 넓은 범위에 고속 탄막을 퍼붓습니다.',   pro: '광역 범위와 처리 속도 최대',   con: '단일 대상 피해 효율이 낮음' },
    { id: 'vulcan_lance',   name: '랜스 발칸',   short: '랜스',     shape: '한 지점에 관통탄을 집중 발사합니다.', pro: '단일 대상 피해 최대',     con: '공격 범위가 매우 좁음' },
  ],
  laser: [
    { id: 'laser_nova',     name: '노바 빔',     short: '노바',     shape: '더 굵고 강한 관통 빔을 발사합니다.', pro: '관통력과 피해 대폭 증가',      con: '' },
    { id: 'laser_reaper',   name: '리퍼 빔',     short: '리퍼',     shape: '절단 빔을 매우 빠르게 연속 발사합니다.', pro: '연사 속도 대폭 증가',    con: '빔 1발의 피해 감소' },
  ],
  homing: [
    { id: 'homing_legion',  name: '레기온',      short: '레기온',   shape: '유도 미사일을 대량으로 연속 발사합니다.',  pro: '발사 수와 추적 능력 최대',      con: '미사일 1발의 피해 감소' },
    { id: 'homing_nova',    name: '노바 어뢰',  short: '노바',     shape: '초대형 폭발을 일으키는 결전 어뢰를 발사합니다.',     pro: '한 발 피해와 폭발 범위 최대',   con: '발사 속도가 매우 느림' },
  ],
};

/** 모든 진화 id (중복 검증·HUD용) — 1·2단계 전부 */
export const ALL_EVOLUTION_IDS = [...Object.values(WEAPON_EVOLUTIONS), ...Object.values(WEAPON_SUPER_EVOLUTIONS)].flat().map((e) => e.id);
const EVO_BY_ID = Object.fromEntries([...Object.values(WEAPON_EVOLUTIONS), ...Object.values(WEAPON_SUPER_EVOLUTIONS)].flat().map((e) => [e.id, e]));

// 진화별 발사체 색 — 적 팩션(보라~적색)과 겹치지 않게 청록/파랑/초록/노랑/주황 계열로 구분.
export const EVO_PROJECTILE_COLOR = {
  vulcan_storm: '#ff9c41', vulcan_needle: '#8affff',            // 발칸: 폭풍=호박 / 니들=전기청록
  laser_prism: '#6cc8ff', laser_cutter: '#7cff6b',             // 레이저: 프리즘=밝은파랑 / 커터=초록
  homing_wasp: '#c8ff4c', homing_siege: '#ff8c1a',             // 호밍: 와스프=연두 / 시즈=진한주황
  vulcan_tempest: '#ffc23d', vulcan_lance: '#ff6a2a',          // 초진화(더 강렬)
  laser_nova: '#aef0ff', laser_reaper: '#4cffc8',
  homing_legion: '#ffe14c', homing_nova: '#ff7a2a',
};
/** 현재 무기의 발사체 색: 초진화 > 1단계 진화 > 기본색. */
export function weaponProjectileColor(evoId, superId, defaultColor) {
  return EVO_PROJECTILE_COLOR[superId] || EVO_PROJECTILE_COLOR[evoId] || defaultColor;
}

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
