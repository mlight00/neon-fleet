// 8분 핵심 재미 하네스 (전면개편 §5.2 / §6.3). ?coreLoopTest=1 진입점의 순수 오케스트레이션.
// 실제 전투·스폰·렌더는 main.js가 소유하고, 여기서는 "어떤 빌드로, 디렉터 사건이 오면 무엇을 하는지"의
// 순수 결정 로직만 담아 테스트 가능하게 한다. 기존 공개 캠페인은 건드리지 않는다.

// 네 고정 시드 시뮬 빌드(§6.3). 각 빌드는 두 무기와 완성 공명, 스트레스 여부를 정의.
export const CORE_LOOP_BUILDS = {
  railStorm:    { id: 'railStorm',    main: 'vulcan', wing: 'laser',  resonance: 'railStorm',    label: '발칸+레이저 / 레일 스톰' },
  microMissile: { id: 'microMissile', main: 'vulcan', wing: 'homing', resonance: 'microMissile', label: '발칸+유도 미사일 / 마이크로 미사일 포화' },
  seekerBeam:   { id: 'seekerBeam',   main: 'laser',  wing: 'homing', resonance: 'seekerBeam',   label: '레이저+유도 미사일 / 시커 빔' },
  tankStress:   { id: 'tankStress',   main: 'vulcan', wing: 'laser',  resonance: 'railStorm',    label: '타이탄+순양함 최대+드론 회수 생존 스트레스', stress: true },
};

export const CORE_LOOP_BUILD_IDS = Object.keys(CORE_LOOP_BUILDS);

/** 빌드 정의 조회(순수). 알 수 없으면 첫 빌드. */
export function coreLoopBuild(id) {
  return CORE_LOOP_BUILDS[id] || CORE_LOOP_BUILDS.railStorm;
}

/**
 * 디렉터 사건 → 하네스 행동 매핑(순수). main.js가 반환된 행동을 실행한다.
 * 반환 action.kind:
 *  'equipWing'      wing 슬롯에 빌드의 두 번째 무기 장착(§5.1 1:15)
 *  'hullTier'       기함 승급(내구도 최대치↑)
 *  'behavior'       행동 변화 강화(측정용, 자동 선택)
 *  'resonanceReady' 첫 공명 완성 창(강제 완성 허용)
 *  'framePick'      지휘 프레임 선택
 *  'eliteWave'      정예 웨이브 시작
 *  'bossStart'      검증 보스 등장
 *  'result'         8분 결과
 * null이면 무시.
 */
export function eventAction(evtType) {
  switch (evtType) {
    case 'secondWeapon': return { kind: 'equipWing' };
    case 'hullTier': return { kind: 'hullTier' };
    case 'behaviorUpgrade': return { kind: 'behavior' };
    case 'firstResonance': return { kind: 'resonanceReady' };
    case 'framePick': return { kind: 'framePick' };
    case 'eliteWave': return { kind: 'eliteWave' };
    case 'bossStart': return { kind: 'bossStart' };
    case 'result': return { kind: 'result' };
    case 'resonanceTelegraph': return { kind: 'telegraph' };
    default: return null;
  }
}

/** 시뮬용 프레임 선택 순서(빌드별로 다른 프레임을 시험). */
export function frameForBuild(buildId) {
  return { railStorm: 'assault', microMissile: 'carrier', seekerBeam: 'phase', tankStress: 'carrier' }[buildId] || 'assault';
}
