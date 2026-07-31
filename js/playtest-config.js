// NEON FLEET — Prolific 첫인상 테스트 설정(작업지시서 §6).
// 모드 쿼리·제한시간·완료/거부 URL·설정 누락 검사를 한곳에서 관리한다.
//
// ⚠️ Prolific이 전달하는 PROLIFIC_PID·STUDY_ID·SESSION_ID는 이 모듈에서 절대 읽지 않는다(§2, §7).
//    utm_content만 pilot|main|unknown으로 내부 매핑하고 원문은 어디에도 보내지 않는다.
// ⚠️ 완료 URL·거부 반환 URL은 소유자 입력 대기(placeholder). 임의 코드·가짜 URL 금지(§6, §10).

export const PLAYTEST_QUERY_KEY = 'playtest';
export const PLAYTEST_QUERY_VALUE = 'prolific';

/** 전투 진입 후 설문까지의 최대 총 전투시간(초). */
export const PLAYTEST_TIME_LIMIT_SEC = 240;

/** 제출 후 완료 URL로 이동하기 전, 분석 전송에 허용하는 최대 대기(ms). */
export const PLAYTEST_TRANSMIT_WINDOW_MS = 500;

// ── 소유자 입력 대기(Prolific 연구 생성 후 채운다) ──
export const PROLIFIC_COMPLETION_URL = '';    // 성공 완료 시 이동할 Prolific completion URL
export const PROLIFIC_NO_CONSENT_URL = '';    // 동의 거부 시 돌아갈 Prolific 반환 URL(선택)

export const PLAYTEST_CONFIG = Object.freeze({
  queryKey: PLAYTEST_QUERY_KEY,
  queryValue: PLAYTEST_QUERY_VALUE,
  timeLimitSec: PLAYTEST_TIME_LIMIT_SEC,
  transmitWindowMs: PLAYTEST_TRANSMIT_WINDOW_MS,
  completionUrl: PROLIFIC_COMPLETION_URL,
  noConsentUrl: PROLIFIC_NO_CONSENT_URL,
});

function toParams(search) {
  return search instanceof URLSearchParams ? search : new URLSearchParams(search || '');
}

/** ?playtest=prolific 여부. 정확히 이 값일 때만 전용 흐름을 활성화(§3.3). */
export function isPlaytestUrl(search, cfg = PLAYTEST_CONFIG) {
  try { return toParams(search).get(cfg.queryKey) === cfg.queryValue; } catch { return false; }
}

/**
 * utm_content → 코호트 내부 매핑(§7). 원문은 전송하지 않는다.
 * pilot|main만 인정하고 그 외/누락은 unknown.
 */
export function playtestCohort(search) {
  try {
    const c = toParams(search).get('utm_content');
    return (c === 'pilot' || c === 'main') ? c : 'unknown';
  } catch { return 'unknown'; }
}

/** 설정 누락 검사(§6). 완료/거부 URL이 비었는지. 게임·전송을 막지 않고 안내에만 쓴다. */
export function playtestConfigStatus(cfg = PLAYTEST_CONFIG) {
  const completionUrl = cfg.completionUrl || '';
  const noConsentUrl = cfg.noConsentUrl || '';
  const missing = [];
  if (!completionUrl) missing.push('completionUrl');
  if (!noConsentUrl) missing.push('noConsentUrl');
  return {
    hasCompletionUrl: !!completionUrl,
    hasNoConsentUrl: !!noConsentUrl,
    completionUrl,
    noConsentUrl,
    missing,
    ok: missing.length === 0,
  };
}
