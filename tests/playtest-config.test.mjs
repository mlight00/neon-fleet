// NEON FLEET — Prolific 첫인상 테스트 설정·URL 게이팅 검증(작업지시서 §3·§6·§8.1).
//  전용 URL(?playtest=prolific)에서만 전용 흐름이 켜지고, 일반·개발 URL에서는 0이어야 한다.
//  utm_content는 pilot|main|unknown으로만 매핑하고 원문은 어디에도 나가지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAYTEST_CONFIG, PLAYTEST_TIME_LIMIT_SEC, PLAYTEST_TRANSMIT_WINDOW_MS,
  PROLIFIC_COMPLETION_URL, PROLIFIC_NO_CONSENT_URL,
  isPlaytestUrl, playtestCohort, playtestConfigStatus,
} from '../js/playtest-config.js';
import { isDevUrl } from '../js/analytics-config.js';

// main.js의 게이팅과 동일한 규칙: 전용 URL이면서 개발/측정 URL이 아닐 때만 전용 흐름.
function playtestActive(search) {
  return isPlaytestUrl(search) && !isDevUrl(search);
}

test('PT-C1: ?playtest=prolific 정확히 일치할 때만 전용 흐름', () => {
  assert.equal(isPlaytestUrl('?playtest=prolific'), true);
  assert.equal(isPlaytestUrl('?playtest=prolific&utm_source=prolific'), true);
  assert.equal(isPlaytestUrl(''), false);
  assert.equal(isPlaytestUrl('?playtest=1'), false);          // 다른 값 거부
  assert.equal(isPlaytestUrl('?playtest=Prolific'), false);   // 대소문자 구분(정확 일치)
  assert.equal(isPlaytestUrl('?foo=bar'), false);
});

test('PT-C2: 일반 URL에서는 전용 흐름 0(Prolific UI·타이머·설문 미활성, §8.1)', () => {
  assert.equal(playtestActive(''), false);
  assert.equal(playtestActive('?utm_source=newsletter'), false);
  assert.equal(playtestActive('?playtest=1'), false);
});

test('PT-C3: 개발/측정 URL은 playtest 값이 있어도 전용 흐름 0(개발 전송 0 유지, §8.1)', () => {
  // isDevUrl에 걸리는 진입은 main.js에서 PLAYTEST=false로 배제된다.
  assert.equal(playtestActive('?playtest=prolific&coreLoopTest=1'), false);
  assert.equal(playtestActive('?playtest=prolific&campaign25=1'), false);
  assert.equal(playtestActive('?playtest=prolific&bosslab=1'), false);
  assert.equal(playtestActive('?playtest=prolific&coreLoopMeasure=1'), false);
});

test('PT-C4: utm_content는 pilot|main만 인정, 그 외/누락은 unknown(원문 전송 금지, §7)', () => {
  assert.equal(playtestCohort('?utm_content=pilot'), 'pilot');
  assert.equal(playtestCohort('?utm_content=main'), 'main');
  assert.equal(playtestCohort('?utm_content=stage1_first_impression'), 'unknown');
  assert.equal(playtestCohort('?utm_content='), 'unknown');
  assert.equal(playtestCohort(''), 'unknown');
});

test('PT-C5: 제한시간·전송창 기본값(240초·500ms)', () => {
  assert.equal(PLAYTEST_TIME_LIMIT_SEC, 240);
  assert.equal(PLAYTEST_TRANSMIT_WINDOW_MS, 500);
  assert.equal(PLAYTEST_CONFIG.timeLimitSec, 240);
  assert.equal(PLAYTEST_CONFIG.transmitWindowMs, 500);
});

test('PT-C6: 완료/거부 URL은 소유자 입력 대기(임의 코드·가짜 URL 금지, §6·§10)', () => {
  // 임의 값이 채워지면 실운영 전 안내가 리디렉션으로 바뀌므로, 빈 값(placeholder)임을 고정한다.
  assert.equal(PROLIFIC_COMPLETION_URL, '');
  assert.equal(PROLIFIC_NO_CONSENT_URL, '');
  assert.equal(PLAYTEST_CONFIG.completionUrl, '');
  assert.equal(PLAYTEST_CONFIG.noConsentUrl, '');
});

test('PT-C7: 설정 누락 검사 — 둘 다 비면 missing 2개, ok=false', () => {
  const st = playtestConfigStatus();
  assert.equal(st.ok, false);
  assert.equal(st.hasCompletionUrl, false);
  assert.equal(st.hasNoConsentUrl, false);
  assert.deepEqual(st.missing.sort(), ['completionUrl', 'noConsentUrl']);
});

test('PT-C8: 완료 URL이 채워지면 hasCompletionUrl=true, missing에서 빠진다', () => {
  const st = playtestConfigStatus({ completionUrl: 'https://app.prolific.com/submissions/complete?cc=ABC123', noConsentUrl: '' });
  assert.equal(st.hasCompletionUrl, true);
  assert.equal(st.hasNoConsentUrl, false);
  assert.deepEqual(st.missing, ['noConsentUrl']);
});
