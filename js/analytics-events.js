// NEON FLEET Stage 1 — 게임 분석 파사드(작업지시서 §12, §13).
// main.js의 권위 있는 상태 전이 지점이 이 파사드의 의미 메서드를 호출한다.
// 파사드는 공통 속성(schema_version·player_type·viewport_group·game_mode·run_index_session·sector)을
// 붙이고, 세션 상태(run_index_session·player_type)와 원정 단위 중복 방지(combat/expedition_ended/route/node/milestone)를 관리한다.
//
// 순수·주입식: analytics 코어·save·sessionStorage·now·viewport를 주입받아 테스트 가능하다.
// gtag를 직접 부르지 않는다(코어를 통해서만).

import { SCHEMA_VERSION } from './analytics-config.js';

const RUN_INDEX_KEY = 'neonFleet.analytics.runIndex.v1';
const RUN_INDEX_MAX = 999;

const round1 = (x) => Math.round(x * 10) / 10;
const defaultNow = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());

/** 페이지 로드 시점 저장 상태로 신규/복귀를 1회 판정(이후 세션 내 변경 안 함, §12). */
export function resolvePlayerType(save) {
  let d = {};
  try { d = save && save.get ? save.get() : {}; } catch { d = {}; }
  const upSome = d.up && typeof d.up === 'object' && Object.values(d.up).some((v) => v > 0);
  const returning = (d.best > 0) || (d.stage > 1) || !!d.campaignCleared || (d.endlessBest > 0)
    || (d.firstDefeatUpgrade != null) || upSome;
  return returning ? 'returning' : 'new';
}

/**
 * @param {object} o
 * @param {object} o.analytics createAnalytics() 인스턴스.
 * @param {object} o.save      createSave() 인스턴스(player_type 판정용).
 * @param {Storage} [o.sessionStorage] run_index_session 저장(없으면 메모리 폴백).
 * @param {function} [o.now]      ()=>ms 클록.
 * @param {function} [o.viewport] ()=>'mobile'|'desktop'.
 * @param {string} [o.schemaVersion]
 */
export function createGameAnalytics({ analytics, save, sessionStorage: ss = null, now = defaultNow, viewport = () => 'desktop', schemaVersion = SCHEMA_VERSION } = {}) {
  const playerType = resolvePlayerType(save);

  let mode = null;            // 현재 원정 game_mode
  let runIndex = 0;           // 현재 원정 run_index_session
  let sector = null;          // 현재 섹터
  let expeditionSeq = 0;      // 원정 네임스페이스(once 키 격리)
  let memRunIndex = 0;

  // 원정 단위 상태
  let expStartMs = 0, combatStarted = false, ended = false;
  // 온보딩/노드 타이머
  let introStartMs = 0, introEnded = false, guideStartMs = 0, nodeStartMs = 0;

  function readRunIndex() {
    if (ss) { try { const v = parseInt(ss.getItem(RUN_INDEX_KEY), 10); if (Number.isFinite(v)) return v; } catch { /* 폴백 */ } }
    return memRunIndex;
  }
  function writeRunIndex(v) {
    memRunIndex = v;
    if (ss) { try { ss.setItem(RUN_INDEX_KEY, String(v)); } catch { /* 폴백 */ } }
  }

  // 공통 속성. 스키마가 이벤트별로 허용 키만 남기므로, 아는 값은 모두 붙여도 안전하다.
  function base() {
    const p = { analytics_schema_version: schemaVersion, player_type: playerType, viewport_group: viewport() };
    if (mode) p.game_mode = mode;
    if (runIndex) p.run_index_session = runIndex;
    if (sector) p.sector = sector;
    return p;
  }
  function emit(name, extra) { analytics.emit(name, { ...base(), ...extra }); }
  function once(name, key, extra) { analytics.once(name, `${expeditionSeq}:${key}`, { ...base(), ...extra }); }

  return {
    get playerType() { return playerType; },
    get runIndex() { return runIndex; },

    // ── 화면·온보딩 ──
    titleViewed() { emit('title_viewed', {}); },

    introStarted() { introStartMs = now(); introEnded = false; emit('intro_started', {}); },
    /** reason: 'skip' | 'complete_auto' | 'complete_next'. skip이면 intro_skipped, 그 외 intro_completed. 원정당 1회. */
    introEnded(reason, { panelReached = 1 } = {}) {
      if (introEnded) return;
      introEnded = true;
      const duration_sec = round1(Math.max(0, (now() - introStartMs) / 1000));
      if (reason === 'skip') emit('intro_skipped', { panel_reached: panelReached, duration_sec });
      else emit('intro_completed', { completion_method: reason === 'complete_next' ? 'complete_next' : 'complete_auto', duration_sec });
    },

    guideViewed(guideType) { guideStartMs = now(); emit('guide_viewed', { guide_type: guideType }); },
    guideCompleted(guideType) {
      emit('guide_completed', { guide_type: guideType, duration_sec: round1(Math.max(0, (now() - guideStartMs) / 1000)) });
    },

    // ── 원정 진입 ──
    expeditionStartSelected(gameMode) { emit('expedition_start_selected', { game_mode: gameMode }); },

    /** 필수 시작 선택을 마치고 첫 섹터로 넘어가기 직전 1회. run_index_session 증가·원정 상태 리셋. */
    expeditionStarted(gameMode) {
      mode = gameMode;
      runIndex = Math.min(RUN_INDEX_MAX, readRunIndex() + 1);
      writeRunIndex(runIndex);
      expeditionSeq += 1;
      expStartMs = now();
      combatStarted = false;
      ended = false;
      sector = 1;
      emit('expedition_started', { game_mode: gameMode });
      return runIndex;
    },

    /** 해당 원정의 첫 실제 전투 노드 진입 1회. */
    combatStarted(sec) {
      if (combatStarted) return;
      combatStarted = true;
      emit('combat_started', { sector: sec, time_to_combat_sec: round1(Math.max(0, (now() - expStartMs) / 1000)) });
    },

    sectorStarted(sec, gameMode) {
      sector = sec;
      if (gameMode) mode = gameMode;
      emit('sector_started', { sector: sec });
    },

    // ── 항로·노드 ──
    /** 자동 루트(auto_root)·수동 확정 공통. nodeKey로 원정 내 노드당 1회 보장. nodeStart 타이머 시작. */
    routeSelected({ sector: sec, nodeType, nodeCol, selectionMethod, nodeKey }) {
      nodeStartMs = now();
      once('route_selected', `route:${nodeKey}`, { sector: sec, node_type: nodeType, node_col: nodeCol, selection_method: selectionMethod });
    },
    nodeCompleted({ sector: sec, nodeType, nodeKey }) {
      once('node_completed', `node:${nodeKey}`, { sector: sec, node_type: nodeType, elapsed_sec: round1(Math.max(0, (now() - nodeStartMs) / 1000)) });
    },

    // ── 빌드 선택 ──
    buildChoice({ choiceType, choiceId, weaponId, sector: sec, elapsedSec }) {
      const extra = { choice_type: choiceType };
      if (choiceId != null) extra.choice_id = String(choiceId);
      if (weaponId != null) extra.weapon_id = weaponId;
      if (sec != null) extra.sector = sec;
      if (elapsedSec != null) extra.elapsed_sec = round1(elapsedSec);
      emit('build_choice_selected', extra);
    },
    /** 원정 내 milestone_type당 1회. elapsed_sec는 명시값 우선, 없으면 원정 시작(expStartMs) 기준 기본값을 항상 포함. */
    milestone({ milestoneType, milestoneValue, sector: sec, elapsedSec }) {
      const extra = { milestone_type: milestoneType };
      if (milestoneValue != null) extra.milestone_value = milestoneValue;
      if (sec != null) extra.sector = sec;
      extra.elapsed_sec = round1(elapsedSec != null ? elapsedSec : Math.max(0, (now() - expStartMs) / 1000));
      once('progression_milestone_reached', `ms:${milestoneType}`, extra);
    },
    freeUpgrade(upgradeKey) { emit('free_upgrade_selected', { upgrade_key: upgradeKey }); },

    // ── 결과·반복 ──
    /** 정산 1회 확정 뒤. 결과 화면 재렌더에도 원정당 1회만. */
    expeditionEnded(props) {
      if (ended) return;
      ended = true;
      const extra = {};
      if (props.outcome != null) extra.outcome = props.outcome;
      // duration_sec는 명시값 우선, 없으면 원정 시작(expStartMs) 기준 기본값을 항상 포함.
      extra.duration_sec = round1(props.durationSec != null ? props.durationSec : Math.max(0, (now() - expStartMs) / 1000));
      if (props.sectorReached != null) extra.sector_reached = props.sectorReached;
      if (props.nodeProgress != null) extra.node_progress = props.nodeProgress;
      if (props.primaryWeapon != null) extra.primary_weapon = props.primaryWeapon;
      if (props.doctrineId != null) extra.doctrine_id = props.doctrineId;
      if (props.keystoneId != null) extra.keystone_id = props.keystoneId;
      if (props.maxTier != null) extra.max_tier = props.maxTier;
      if (props.maxCruisers != null) extra.max_cruisers = props.maxCruisers;
      if (props.firstDefeatUpgradeState != null) extra.first_defeat_upgrade_state = props.firstDefeatUpgradeState;
      emit('expedition_ended', extra);
    },
    retrySelected(resultType) { emit('retry_selected', { result_type: resultType }); },
    hangarViewed(entryPoint) { emit('hangar_viewed', { entry_point: entryPoint }); },
    consentUpdated() { emit('analytics_consent_updated', { consent_state: 'granted' }); },

    // ── Prolific 첫인상 테스트(작업지시서 §7). PID·Study·Session·자유서술·완료 URL은 절대 넣지 않는다. ──
    /** 동의 후 전용 흐름 시작. cohort는 pilot|main|unknown(내부 매핑값). */
    playtestStarted(cohort) { emit('playtest_started', { playtest_provider: 'prolific', playtest_cohort: cohort }); },
    /** 4분 종료. endReason=first_death|time_limit, elapsedSec=전투 경과초(상한 240). */
    playtestLimitReached(endReason, elapsedSec) {
      const extra = { end_reason: endReason };
      if (elapsedSec != null) extra.elapsed_sec = round1(Math.max(0, elapsedSec));
      emit('playtest_limit_reached', extra);
    },
    /** 설문 제출(검증 통과값만 전달). 평점 1~5·선택형 enum. */
    playtestFeedbackSubmitted({ fun_rating, clarity_rating, replay_intent, peak_moment, friction_area } = {}) {
      emit('playtest_feedback_submitted', { fun_rating, clarity_rating, replay_intent, peak_moment, friction_area });
    },
    /** 완료. method=redirect|manual. */
    playtestCompleted(method) { emit('playtest_completed', { completion_method: method }); },
  };
}
