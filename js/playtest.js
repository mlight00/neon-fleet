// NEON FLEET — Prolific 첫인상 테스트 흐름 로직(작업지시서 §4·§5·§7).
// 순수·주입식: DOM·타이머·리디렉션을 주입받아 테스트 가능하다. gtag/GA4를 직접 부르지 않는다.
//   - 전투 시간 타이머(전투 시작 후에만 누적, 상한 1회 도달)
//   - 설문 검증(5문항 필수·enum·1~5)
//   - 완료 계획(완료 URL 있으면 redirect, 없으면 manual 안내)
//   - 제출 세션(중복 제출 차단·전송 실패가 완료를 막지 않음)

export const PLAYTEST_PROVIDER = 'prolific';
export const PEAK_MOMENTS = Object.freeze(['dodging', 'weapon_power', 'build_choice', 'progression', 'boss_or_elite', 'nothing_yet', 'other']);
export const FRICTION_AREAS = Object.freeze(['controls', 'visual_clarity', 'choice_clarity', 'difficulty', 'performance', 'nothing', 'other']);
export const END_REASONS = Object.freeze(['first_death', 'time_limit']);

const inRange1to5 = (v) => Number.isInteger(v) && v >= 1 && v <= 5;

/**
 * 설문 응답 검증(§5·§8.1). 5문항 모두 필수, 평점은 1~5 정수, 선택형은 enum 안.
 * @returns {{ok:boolean, missing:string[], values?:object}}
 */
export function validateSurvey(a = {}) {
  const missing = [];
  if (!inRange1to5(a.fun_rating)) missing.push('fun_rating');
  if (!inRange1to5(a.clarity_rating)) missing.push('clarity_rating');
  if (!inRange1to5(a.replay_intent)) missing.push('replay_intent');
  if (!PEAK_MOMENTS.includes(a.peak_moment)) missing.push('peak_moment');
  if (!FRICTION_AREAS.includes(a.friction_area)) missing.push('friction_area');
  if (missing.length) return { ok: false, missing };
  return {
    ok: true,
    missing: [],
    values: {
      fun_rating: a.fun_rating,
      clarity_rating: a.clarity_rating,
      replay_intent: a.replay_intent,
      peak_moment: a.peak_moment,
      friction_area: a.friction_area,
    },
  };
}

/** 완료 계획(§5·§6). 완료 URL이 있으면 redirect, 없으면 manual 안내. */
export function completionPlan({ completionUrl } = {}) {
  const url = completionUrl || '';
  return url ? { method: 'redirect', url } : { method: 'manual', url: null };
}

/**
 * 전투 시간 타이머. 전투 시작(startCombat) 후에만 누적하고, 상한(limitSec)에 1회만 도달 신호를 준다.
 * 첫 사망(markReached)도 같은 상한 규칙을 공유해 총 전투시간이 limitSec를 넘지 않는다(§4.2).
 */
export function createPlaytestTimer(limitSec) {
  let started = false;
  let sec = 0;
  let reached = false;
  return {
    startCombat() { started = true; },
    isStarted() { return started; },
    /** dt(초) 누적. 상한 최초 도달 시 true(그 외 false). 시작 전·도달 후에는 누적하지 않는다. */
    tick(dt) {
      if (!started || reached || !(dt > 0)) return false;
      sec += dt;
      if (sec >= limitSec) { sec = limitSec; reached = true; return true; }
      return false;
    },
    /** 첫 사망 등 외부 사유로 종료를 확정. 최초 1회 true, 이후 false. */
    markReached() {
      if (reached) return false;
      reached = true;
      sec = Math.min(sec, limitSec);
      return true;
    },
    reached() { return reached; },
    elapsed() { return Math.round(Math.min(sec, limitSec) * 10) / 10; },
  };
}

const safe = (fn) => { try { fn(); } catch { /* 분석 실패가 게임·완료를 막지 않게 삼킨다 */ } };

/**
 * 제출·완료 세션(§5). 중복 제출 차단 + 이벤트 순서(feedback → completed) + 500ms 전송 창.
 * 분석 sink 오류·완료 URL 누락에도 완료 안내가 반드시 실행된다.
 * @param {object} o
 * @param {object} o.track                게임 분석 파사드(playtestFeedbackSubmitted·playtestCompleted 보유).
 * @param {string} o.completionUrl        Prolific 성공 완료 URL(없으면 manual).
 * @param {number} [o.transmitWindowMs]   완료 이동 전 전송 대기(ms).
 * @param {function} o.redirect           (url)=>void 완료 URL 이동.
 * @param {function} o.showManualComplete ()=>void 완료 URL 없을 때 안내 표시.
 * @param {function} [o.schedule]         (fn,ms)=>void 지연 실행(기본 setTimeout).
 */
export function createPlaytestSubmission({ track, completionUrl, transmitWindowMs = 500, redirect, showManualComplete, schedule = (fn, ms) => setTimeout(fn, ms) }) {
  let submitted = false;
  return {
    isSubmitted() { return submitted; },
    /**
     * @returns {{ok:false, missing:string[]} | {ok:true, duplicate?:true, plan:object}}
     */
    submit(answers) {
      const v = validateSurvey(answers);
      if (!v.ok) return { ok: false, missing: v.missing };
      const plan = completionPlan({ completionUrl });
      if (submitted) return { ok: true, duplicate: true, plan };   // 중복 제출 차단
      submitted = true;
      safe(() => track.playtestFeedbackSubmitted(v.values));
      safe(() => track.playtestCompleted(plan.method));
      if (plan.method === 'redirect') {
        schedule(() => safe(() => redirect(plan.url)), transmitWindowMs);   // 500ms 전송 창 후 이동
      } else {
        safe(() => showManualComplete());   // 이동 없음: 즉시 완료 코드 안내
      }
      return { ok: true, plan };
    },
  };
}
