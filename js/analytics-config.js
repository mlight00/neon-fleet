// NEON FLEET Stage 1 — 분석 설정 + 이벤트/속성 계약(스키마) + 검증 헬퍼.
// 이 파일은 "무엇을 보내도 되는가"의 단일 출처다. 코어(analytics.js)는 여기 정의된
// 화이트리스트로만 이벤트를 통과시키고, 그 외 이벤트·속성·PII·고카디널리티 값을 제거한다.
//
// ⚠️ measurementId는 비워둔다. NEON FLEET 전용 GA4 속성이 생기면 소유자가 여기에 G-... 를 넣는다.
//    임의 값·회사 속성 재사용 금지(작업지시서 §4.3, §10.1).

export const SCHEMA_VERSION = '1';

/**
 * 분석 런타임 설정. measurementId가 유효(G-...)하고 enabled=true일 때만 GA4가 로드된다.
 * 값이 없으면: 동의 UI 미표시·외부 스크립트 미로드·네트워크 0. 로컬 디버그(analyticsDebug)는 사용 가능.
 */
export const ANALYTICS_CONFIG = Object.freeze({
  enabled: false,
  provider: 'ga4',
  measurementId: '',            // 소유자 입력 대기 — 임의 값 금지
  schemaVersion: SCHEMA_VERSION,
  debugQuery: 'analyticsDebug',
});

/** GA4 웹 스트림 측정 ID 형식 검사. G- 접두 + 영숫자. 형식이 틀리면 스크립트를 로드하지 않는다. */
export function validateMeasurementId(id) {
  return typeof id === 'string' && /^G-[A-Z0-9]{4,}$/.test(id);
}

/**
 * 동의 UI를 제안할지(작업지시서 §9.2, §10.1). 설정이 활성이고 측정 ID가 유효할 때만 true.
 * 측정 ID가 없으면 동의 UI를 띄우지 않고 로컬 디버그만 가능하다.
 */
export function shouldOfferConsent(config = ANALYTICS_CONFIG) {
  return !!(config && config.enabled && validateMeasurementId(config.measurementId));
}

// 개발/측정 진입 URL·런 플래그(작업지시서 §2.5, §16). 하나라도 걸리면 GA4 전송 0.
const DEV_URL_PARAMS = ['coreLoopTest', 'coreLoopMeasure', 'campaign25', 'bosslab'];

/** URL 쿼리가 개발/측정 진입인지. (문자열·URLSearchParams·location.search 모두 허용) */
export function isDevUrl(search) {
  let params;
  try {
    params = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
  } catch {
    return false;
  }
  return DEV_URL_PARAMS.some((k) => params.has(k));
}

/** 디버그 쿼리(analyticsDebug) 여부. GA4 debug_mode·로컬 디버그 전역 노출 게이트. */
export function isDebugUrl(search, key = ANALYTICS_CONFIG.debugQuery) {
  try {
    const params = search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
    return params.has(key);
  } catch {
    return false;
  }
}

/** 뷰포트 그룹(mobile/desktop). coarse 포인터거나 좁은 화면이면 mobile. */
export function viewportGroup(win = globalThis) {
  try {
    if (typeof win.matchMedia === 'function' && win.matchMedia('(pointer: coarse)').matches) return 'mobile';
    const w = win.innerWidth || 0;
    if (w > 0 && w <= 820) return 'mobile';
  } catch { /* 무시 */ }
  return 'desktop';
}

// ─── 직접 식별 가능 데이터(어떤 이벤트에도 들어가면 안 됨) ─── (작업지시서 §14)
export const PII_KEYS = Object.freeze(new Set([
  'name', 'email', 'phone', 'address', 'user_id', 'account_id',
  'callsign', 'ip', 'cookie', 'url', 'referrer', 'query',
  // 개발 내부·고카디널리티(원시 스냅샷 유출 방지)
  'run_id', 'runid', 'seed', 'damagebyweapon', 'damagebyresonance', 'choicetimes', '_fps',
  // Prolific 식별자·완료 정보(어떤 이벤트에도 들어가면 안 됨, 작업지시서 §2·§7)
  'prolific_pid', 'study_id', 'session_id', 'completion_url', 'completion_code', 'utm_content',
]));

// 속성 값 정제 상수
export const STRING_MAX = 40;   // 문자열 속성 길이 상한(초과 시 제거) — enum·id는 모두 짧음

// ─── 공통 enum 값 ───
const WEAPON_IDS = ['vulcan', 'laser', 'homing'];
const NODE_TYPES = ['combat', 'elite', 'hazard', 'supply', 'repair', 'boss'];
const SELECTION_METHODS = ['auto_root', 'pointer_confirm', 'touch_confirm', 'keyboard_confirm'];
const CHOICE_TYPES = ['start_weapon', 'module', 'doctrine', 'keystone', 'weapon_evolution', 'weapon_super_evolution', 'repair'];
const MILESTONE_TYPES = ['second_weapon', 'first_resonance', 'flagship_tier'];
const OUTCOMES = ['death', 'quit', 'campaign_clear'];
const FREE_UPGRADE_KEYS = ['drones', 'hull', 'dmg'];
const FIRST_DEFEAT_STATES = ['available', 'claimed', 'already_owned', 'not_eligible'];
// Prolific 첫인상 테스트 enum(작업지시서 §5·§7). utm_content 원문은 전송 금지 — cohort로만 매핑.
const PLAYTEST_COHORTS = ['pilot', 'main', 'unknown'];
const PLAYTEST_END_REASONS = ['first_death', 'time_limit'];
const PEAK_MOMENTS = ['dodging', 'weapon_power', 'build_choice', 'progression', 'boss_or_elite', 'nothing_yet', 'other'];
const FRICTION_AREAS = ['controls', 'visual_clarity', 'choice_clarity', 'difficulty', 'performance', 'nothing', 'other'];
const COMPLETION_METHODS = ['redirect', 'manual'];

// 공통 속성 서술자(여러 이벤트에서 재사용)
const COMMON = {
  analytics_schema_version: { t: 'enum', enum: [SCHEMA_VERSION] },
  player_type: { t: 'enum', enum: ['new', 'returning'] },
  viewport_group: { t: 'enum', enum: ['mobile', 'desktop'] },
  game_mode: { t: 'enum', enum: ['campaign', 'endless'] },
  run_index_session: { t: 'int', min: 1, max: 999 },
  sector: { t: 'int', min: 1, max: 99 },
};
const c = (...keys) => Object.fromEntries(keys.map((k) => [k, COMMON[k]]));

/**
 * 이벤트 계약(작업지시서 §13). name → { props: { key: descriptor } }.
 * descriptor: { t:'enum'|'str'|'int'|'num', enum?, min?, max?, maxLen? }.
 * 여기 없는 이벤트는 거부되고, 여기 없는 속성 키는 제거된다.
 */
export const EVENT_SCHEMA = Object.freeze({
  // ── 화면·온보딩 ──
  title_viewed: { props: c('analytics_schema_version', 'player_type', 'viewport_group') },
  intro_started: { props: c('analytics_schema_version', 'player_type', 'viewport_group') },
  intro_skipped: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group'),
      panel_reached: { t: 'int', min: 1, max: 20 }, duration_sec: { t: 'num', min: 0, max: 600 } },
  },
  intro_completed: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group'),
      completion_method: { t: 'enum', enum: ['complete_auto', 'complete_next'] }, duration_sec: { t: 'num', min: 0, max: 600 } },
  },
  guide_viewed: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group'),
      guide_type: { t: 'enum', enum: ['combo', 'standard'] } },
  },
  guide_completed: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group'),
      guide_type: { t: 'enum', enum: ['combo', 'standard'] }, duration_sec: { t: 'num', min: 0, max: 600 } },
  },
  // ── 원정 진입 ──
  expedition_start_selected: { props: c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode') },
  expedition_started: { props: c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode', 'run_index_session') },
  combat_started: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode', 'sector'),
      time_to_combat_sec: { t: 'num', min: 0, max: 3600 } },
  },
  sector_started: { props: c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode', 'sector') },
  // ── 항로·노드 ──
  route_selected: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode', 'sector'),
      node_type: { t: 'enum', enum: NODE_TYPES }, node_col: { t: 'int', min: 0, max: 20 },
      selection_method: { t: 'enum', enum: SELECTION_METHODS } },
  },
  node_completed: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode', 'sector'),
      node_type: { t: 'enum', enum: NODE_TYPES }, elapsed_sec: { t: 'num', min: 0, max: 3600 } },
  },
  // ── 빌드 선택 ──
  build_choice_selected: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode', 'sector'),
      choice_type: { t: 'enum', enum: CHOICE_TYPES }, choice_id: { t: 'str', maxLen: STRING_MAX },
      weapon_id: { t: 'enum', enum: WEAPON_IDS }, elapsed_sec: { t: 'num', min: 0, max: 3600 } },
  },
  progression_milestone_reached: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode', 'sector'),
      milestone_type: { t: 'enum', enum: MILESTONE_TYPES }, milestone_value: { t: 'int', min: 0, max: 99 },
      elapsed_sec: { t: 'num', min: 0, max: 3600 } },
  },
  free_upgrade_selected: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode'),
      upgrade_key: { t: 'enum', enum: FREE_UPGRADE_KEYS } },
  },
  // ── 결과·반복 ──
  expedition_ended: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode'),
      outcome: { t: 'enum', enum: OUTCOMES },
      duration_sec: { t: 'num', min: 0, max: 36000 },
      sector_reached: { t: 'int', min: 1, max: 99 },
      node_progress: { t: 'int', min: 0, max: 99 },
      primary_weapon: { t: 'enum', enum: WEAPON_IDS },
      doctrine_id: { t: 'str', maxLen: STRING_MAX },
      keystone_id: { t: 'str', maxLen: STRING_MAX },
      max_tier: { t: 'int', min: 0, max: 20 },
      max_cruisers: { t: 'int', min: 0, max: 99 },
      first_defeat_upgrade_state: { t: 'enum', enum: FIRST_DEFEAT_STATES } },
  },
  retry_selected: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode'),
      result_type: { t: 'enum', enum: OUTCOMES } },
  },
  hangar_viewed: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group'),
      entry_point: { t: 'enum', enum: ['title', 'result'] } },
  },
  analytics_consent_updated: {
    props: { ...c('analytics_schema_version', 'viewport_group'),
      consent_state: { t: 'enum', enum: ['granted'] } },
  },
  // ── Prolific 첫인상 테스트(작업지시서 §7) — 기존 화이트리스트·동의 모델 유지, 아래 4종만 추가 ──
  playtest_started: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group'),
      playtest_provider: { t: 'enum', enum: ['prolific'] },
      playtest_cohort: { t: 'enum', enum: PLAYTEST_COHORTS } },
  },
  playtest_limit_reached: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group', 'game_mode', 'sector'),
      end_reason: { t: 'enum', enum: PLAYTEST_END_REASONS },
      elapsed_sec: { t: 'num', min: 0, max: 3600 } },
  },
  playtest_feedback_submitted: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group'),
      fun_rating: { t: 'int', min: 1, max: 5 },
      clarity_rating: { t: 'int', min: 1, max: 5 },
      replay_intent: { t: 'int', min: 1, max: 5 },
      peak_moment: { t: 'enum', enum: PEAK_MOMENTS },
      friction_area: { t: 'enum', enum: FRICTION_AREAS } },
  },
  playtest_completed: {
    props: { ...c('analytics_schema_version', 'player_type', 'viewport_group'),
      completion_method: { t: 'enum', enum: COMPLETION_METHODS } },
  },
});

export const SCHEMA = Object.freeze({ version: SCHEMA_VERSION, events: EVENT_SCHEMA });
