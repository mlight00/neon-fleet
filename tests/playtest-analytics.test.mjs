// NEON FLEET — Prolific 이벤트가 실제 분석 스택(코어+스키마+파사드+GA4 어댑터+동의)을 통과하며
//  계약(§7)을 지키는지 검증한다. 파일 문자열 검사가 아니라 실제 모듈을 조립해 확인한다(§8.1).
//   - 이벤트 이름·속성이 화이트리스트·enum·1~5 범위 안
//   - Prolific PID·Study ID·Session ID·completion·utm_content 원문은 어떤 이벤트에도 없음
//   - 동의 전·거부 시 GA4 전송 0, 개발 URL 전송 0
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalytics } from '../js/analytics.js';
import { createGameAnalytics } from '../js/analytics-events.js';
import { createGa4Adapter, ga4Sink } from '../js/analytics-ga4.js';
import { createConsent } from '../js/analytics-consent.js';
import { SCHEMA, ANALYTICS_CONFIG } from '../js/analytics-config.js';
import { playtestCohort } from '../js/playtest-config.js';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
function fakeSave(data = {}) {
  const d = { best: 0, stage: 1, coins: 0, up: {}, ...data };
  return { get: () => ({ ...d }) };
}
// 캡처 sink: 코어가 정제한(clean) 속성을 그대로 담는다.
function setup({ viewport = () => 'desktop' } = {}) {
  const sent = [];
  const analytics = createAnalytics({ schema: SCHEMA, sink: (e) => { sent.push(e); return { sent: true }; } });
  const g = createGameAnalytics({ analytics, save: fakeSave(), sessionStorage: memStorage(), viewport });
  return { sent, g };
}
const byName = (sent, n) => sent.filter((e) => e.name === n);

test('PT-A1: playtest_started — provider=prolific, cohort enum', () => {
  const { sent, g } = setup();
  g.playtestStarted(playtestCohort('?utm_content=pilot'));
  const e = byName(sent, 'playtest_started')[0];
  assert.equal(e.properties.playtest_provider, 'prolific');
  assert.equal(e.properties.playtest_cohort, 'pilot');
  assert.equal(e.properties.analytics_schema_version, '1');
  assert.equal(e.properties.viewport_group, 'desktop');
});

test('PT-A2: cohort가 enum 밖(unknown 외 임의값)이면 코어가 제거', () => {
  const { sent, g } = setup();
  // 파사드는 매핑값만 넘기지만, 방어적으로 잘못된 값이 오면 스키마가 걸러야 한다.
  g.playtestStarted('stage1_first_impression');
  const e = byName(sent, 'playtest_started')[0];
  assert.equal('playtest_cohort' in e.properties, false);   // enum 밖 → 제거
});

test('PT-A3: playtest_limit_reached — end_reason enum + elapsed_sec 반올림', () => {
  const { sent, g } = setup();
  g.playtestLimitReached('time_limit', 240);
  g.playtestLimitReached('first_death', 37.28);
  const evs = byName(sent, 'playtest_limit_reached');
  assert.equal(evs[0].properties.end_reason, 'time_limit');
  assert.equal(evs[0].properties.elapsed_sec, 240);
  assert.equal(evs[1].properties.end_reason, 'first_death');
  assert.equal(evs[1].properties.elapsed_sec, 37.3);
});

test('PT-A4: playtest_feedback_submitted — 평점 1~5·선택형 enum만 통과', () => {
  const { sent, g } = setup();
  g.playtestFeedbackSubmitted({ fun_rating: 4, clarity_rating: 5, replay_intent: 3, peak_moment: 'weapon_power', friction_area: 'controls' });
  const p = byName(sent, 'playtest_feedback_submitted')[0].properties;
  assert.equal(p.fun_rating, 4);
  assert.equal(p.clarity_rating, 5);
  assert.equal(p.replay_intent, 3);
  assert.equal(p.peak_moment, 'weapon_power');
  assert.equal(p.friction_area, 'controls');
});

test('PT-A5: 범위 밖 평점·enum은 코어가 제거(방어)', () => {
  const { sent, g } = setup();
  g.playtestFeedbackSubmitted({ fun_rating: 9, clarity_rating: 5, replay_intent: 3, peak_moment: 'bad', friction_area: 'controls' });
  const p = byName(sent, 'playtest_feedback_submitted')[0].properties;
  assert.equal(p.fun_rating, 5);           // int min/max 클램프(9→5)
  assert.equal('peak_moment' in p, false); // enum 밖 → 제거
});

test('PT-A6: playtest_completed — completion_method enum(redirect|manual)', () => {
  const { sent, g } = setup();
  g.playtestCompleted('redirect');
  g.playtestCompleted('manual');
  const evs = byName(sent, 'playtest_completed');
  assert.equal(evs[0].properties.completion_method, 'redirect');
  assert.equal(evs[1].properties.completion_method, 'manual');
});

test('PT-A7: PID·Study·Session·completion·utm_content는 어떤 이벤트에도 실리지 않는다(§7·§14)', () => {
  const { sent } = setup();
  // 파사드를 우회해 코어에 직접 오염 속성을 밀어넣어도 정제되는지 확인한다.
  const analytics = createAnalytics({ schema: SCHEMA, sink: (e) => { sent.push(e); return { sent: true }; } });
  analytics.emit('playtest_started', {
    analytics_schema_version: '1', viewport_group: 'desktop',
    playtest_provider: 'prolific', playtest_cohort: 'main',
    prolific_pid: 'PID123', study_id: 'STU456', session_id: 'SES789',
    completion_url: 'https://app.prolific.com/complete?cc=SECRET', completion_code: 'SECRET',
    utm_content: 'stage1_first_impression',
  });
  const p = sent[sent.length - 1].properties;
  for (const k of ['prolific_pid', 'study_id', 'session_id', 'completion_url', 'completion_code', 'utm_content']) {
    assert.equal(k in p, false, `${k} 는 전송되면 안 된다`);
  }
  assert.equal(p.playtest_provider, 'prolific');   // 정상 속성은 유지
  assert.equal(p.playtest_cohort, 'main');
});

test('PT-A8: 알 수 없는 playtest 유사 이벤트는 코어가 거부', () => {
  const sent = [];
  const analytics = createAnalytics({ schema: SCHEMA, sink: (e) => { sent.push(e); return { sent: true }; } });
  const r = analytics.emit('playtest_pid_captured', { prolific_pid: 'x' });
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'unknown_event');
  assert.equal(sent.length, 0);
});

// ── GA4 어댑터: 동의·개발 게이팅(전송 0) ──────────────────
function ga4Setup({ consentState = 'unknown', measurementId = 'G-TEST1234', enabled = true, isDevMode = () => false } = {}) {
  const ss = memStorage();
  if (consentState !== 'unknown') ss.setItem('neonFleet.analyticsConsent.v1', consentState);
  const consent = createConsent(ss);
  const win = { dataLayer: [], document: {} };
  const events = [];
  win.gtag = function () { const a = [...arguments]; if (a[0] === 'event') events.push(a); win.dataLayer.push(a); };
  const doc = { createElement: () => ({ setAttribute() {} }), head: { appendChild() {} } };
  const config = { ...ANALYTICS_CONFIG, enabled, measurementId };
  const adapter = createGa4Adapter({ config, consent, win, doc, isDevMode, loadScript: () => ({ setAttribute() {} }) });
  const sink = ga4Sink(adapter);
  return { adapter, sink, events, consent };
}

test('PT-A9: 동의 전에는 playtest 이벤트 GA4 전송 0(§8.1)', () => {
  const { sink, events } = ga4Setup({ consentState: 'unknown' });
  const r = sink({ name: 'playtest_started', properties: { playtest_provider: 'prolific', playtest_cohort: 'pilot' } });
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'no_consent');
  assert.equal(events.length, 0);
});

test('PT-A10: 거부(denied) 상태도 전송 0', () => {
  const { sink, events } = ga4Setup({ consentState: 'denied' });
  const r = sink({ name: 'playtest_feedback_submitted', properties: { fun_rating: 4 } });
  assert.equal(r.sent, false);
  assert.equal(events.length, 0);
});

test('PT-A11: 개발/측정 URL(isDevMode)면 동의해도 전송 0(§8.1)', () => {
  const { sink, events } = ga4Setup({ consentState: 'granted', isDevMode: () => true });
  const r = sink({ name: 'playtest_started', properties: { playtest_provider: 'prolific' } });
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'dev_mode');
  assert.equal(events.length, 0);
});

test('PT-A12: 측정 ID가 없으면(소유자 미입력) 전송 0', () => {
  const { sink, events } = ga4Setup({ consentState: 'granted', measurementId: '' });
  const r = sink({ name: 'playtest_completed', properties: { completion_method: 'manual' } });
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'no_measurement_id');
  assert.equal(events.length, 0);
});

test('PT-A13: 동의 + 유효 ID면 playtest 이벤트가 gtag로 전송된다', () => {
  const { sink, events } = ga4Setup({ consentState: 'granted' });
  const r = sink({ name: 'playtest_started', properties: { playtest_provider: 'prolific', playtest_cohort: 'main' } });
  assert.equal(r.sent, true);
  assert.equal(events.length, 1);
  assert.equal(events[0][1], 'playtest_started');
  assert.equal(events[0][2].playtest_provider, 'prolific');
});
