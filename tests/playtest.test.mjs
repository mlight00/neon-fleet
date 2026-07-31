// NEON FLEET — Prolific 흐름 로직 검증(작업지시서 §4.2·§5·§8.1).
//  전투 시작 전 타이머 미동작 / 240초·첫 사망에 각 1회만 설문 / 5문항 검증 / 중복 제출 차단 /
//  분석 sink 오류·완료 URL 누락에도 완료 안내 보장.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createPlaytestTimer, validateSurvey, completionPlan, createPlaytestSubmission,
  PEAK_MOMENTS, FRICTION_AREAS, END_REASONS,
} from '../js/playtest.js';

// ── 타이머 ──────────────────────────────────────────────
test('PT-T1: 전투 시작 전에는 tick이 누적하지 않는다(§8.1)', () => {
  const t = createPlaytestTimer(240);
  assert.equal(t.isStarted(), false);
  assert.equal(t.tick(100), false);   // startCombat 전
  assert.equal(t.elapsed(), 0);
  assert.equal(t.reached(), false);
});

test('PT-T2: 전투 시작 후 240초 도달은 정확히 1회만 true(§8.1)', () => {
  const t = createPlaytestTimer(240);
  t.startCombat();
  assert.equal(t.tick(120), false);
  assert.equal(t.tick(119.9), false);
  assert.equal(t.tick(1), true);      // 240 도달 — 최초 1회
  assert.equal(t.tick(10), false);    // 이후 재도달 없음
  assert.equal(t.reached(), true);
  assert.equal(t.elapsed(), 240);     // 상한을 넘지 않음
});

test('PT-T3: 첫 사망(markReached)도 상한 1회 규칙을 공유한다', () => {
  const t = createPlaytestTimer(240);
  t.startCombat();
  t.tick(50);
  assert.equal(t.markReached(), true);
  assert.equal(t.markReached(), false);   // 중복 방지
  assert.equal(t.tick(100), false);       // 도달 후 누적 없음
  assert.equal(t.elapsed(), 50);
});

test('PT-T4: 사망이 먼저면 총 전투시간은 그 시점 값(≤240)으로 고정', () => {
  const t = createPlaytestTimer(240);
  t.startCombat();
  t.tick(37.25);
  t.markReached();
  assert.equal(t.elapsed(), 37.3);   // round1
});

test('PT-T5: dt<=0·비정상 입력은 무시', () => {
  const t = createPlaytestTimer(240);
  t.startCombat();
  assert.equal(t.tick(0), false);
  assert.equal(t.tick(-5), false);
  assert.equal(t.tick(NaN), false);
  assert.equal(t.elapsed(), 0);
});

// ── 설문 검증 ────────────────────────────────────────────
const goodAnswers = () => ({ fun_rating: 4, clarity_rating: 5, replay_intent: 3, peak_moment: 'dodging', friction_area: 'difficulty' });

test('PT-S1: 5문항 모두 채워지면 통과, 값이 그대로 반환', () => {
  const v = validateSurvey(goodAnswers());
  assert.equal(v.ok, true);
  assert.deepEqual(v.values, goodAnswers());
});

test('PT-S2: 누락 시 제출 거부 + missing 목록(§5·§8.1)', () => {
  const v = validateSurvey({ fun_rating: 4 });
  assert.equal(v.ok, false);
  assert.deepEqual(v.missing.sort(), ['clarity_rating', 'friction_area', 'peak_moment', 'replay_intent']);
});

test('PT-S3: 평점 범위(1~5 정수) 밖은 거부', () => {
  assert.equal(validateSurvey({ ...goodAnswers(), fun_rating: 0 }).ok, false);
  assert.equal(validateSurvey({ ...goodAnswers(), fun_rating: 6 }).ok, false);
  assert.equal(validateSurvey({ ...goodAnswers(), fun_rating: 3.5 }).ok, false);
  assert.equal(validateSurvey({ ...goodAnswers(), replay_intent: '4' }).ok, false);   // 문자열 거부
});

test('PT-S4: 선택형 enum 밖은 거부', () => {
  assert.equal(validateSurvey({ ...goodAnswers(), peak_moment: 'lasers' }).ok, false);
  assert.equal(validateSurvey({ ...goodAnswers(), friction_area: 'bugs' }).ok, false);
  // 계약된 enum 값은 모두 통과
  for (const p of PEAK_MOMENTS) assert.equal(validateSurvey({ ...goodAnswers(), peak_moment: p }).ok, true);
  for (const f of FRICTION_AREAS) assert.equal(validateSurvey({ ...goodAnswers(), friction_area: f }).ok, true);
});

test('PT-S5: end_reason enum은 first_death·time_limit만', () => {
  assert.deepEqual([...END_REASONS], ['first_death', 'time_limit']);
});

// ── 완료 계획 ────────────────────────────────────────────
test('PT-P1: 완료 URL이 있으면 redirect, 없으면 manual(§5·§6)', () => {
  assert.deepEqual(completionPlan({ completionUrl: 'https://x/complete' }), { method: 'redirect', url: 'https://x/complete' });
  assert.deepEqual(completionPlan({ completionUrl: '' }), { method: 'manual', url: null });
  assert.deepEqual(completionPlan({}), { method: 'manual', url: null });
});

// ── 제출 세션(중복 차단 + 순서 + 완료 보장) ──────────────
function fakeTrack() {
  const calls = [];
  return {
    calls,
    playtestFeedbackSubmitted(v) { calls.push(['feedback', v]); },
    playtestCompleted(m) { calls.push(['completed', m]); },
  };
}

test('PT-U1: 정상 제출 — feedback→completed 순서, redirect 예약(§5)', () => {
  const track = fakeTrack();
  const scheduled = [];
  let redirected = null;
  const sub = createPlaytestSubmission({
    track, completionUrl: 'https://x/complete', transmitWindowMs: 500,
    redirect: (u) => { redirected = u; }, showManualComplete: () => {},
    schedule: (fn, ms) => scheduled.push([fn, ms]),
  });
  const res = sub.submit(goodAnswers());
  assert.equal(res.ok, true);
  assert.equal(res.plan.method, 'redirect');
  assert.deepEqual(track.calls.map((c) => c[0]), ['feedback', 'completed']);
  assert.equal(track.calls[1][1], 'redirect');
  assert.equal(scheduled[0][1], 500);          // 500ms 전송 창
  assert.equal(redirected, null);              // 아직 이동 전
  scheduled[0][0]();                           // 창 만료 → 이동
  assert.equal(redirected, 'https://x/complete');
});

test('PT-U2: 누락 응답은 제출 거부 — 이벤트·이동 없음', () => {
  const track = fakeTrack();
  let manual = 0;
  const sub = createPlaytestSubmission({ track, completionUrl: '', redirect: () => {}, showManualComplete: () => { manual++; } });
  const res = sub.submit({ fun_rating: 4 });
  assert.equal(res.ok, false);
  assert.deepEqual(res.missing.length > 0, true);
  assert.equal(track.calls.length, 0);
  assert.equal(manual, 0);
  assert.equal(sub.isSubmitted(), false);
});

test('PT-U3: 중복 제출 차단 — 이벤트는 최초 1회만(§5·§8.1)', () => {
  const track = fakeTrack();
  const sub = createPlaytestSubmission({ track, completionUrl: 'https://x/c', redirect: () => {}, showManualComplete: () => {}, schedule: () => {} });
  sub.submit(goodAnswers());
  const again = sub.submit(goodAnswers());
  assert.equal(again.ok, true);
  assert.equal(again.duplicate, true);
  assert.equal(track.calls.filter((c) => c[0] === 'feedback').length, 1);
  assert.equal(track.calls.filter((c) => c[0] === 'completed').length, 1);
});

test('PT-U4: 완료 URL 없으면 manual 안내가 실행된다(§5)', () => {
  const track = fakeTrack();
  let manual = 0;
  const sub = createPlaytestSubmission({ track, completionUrl: '', redirect: () => { throw new Error('should not redirect'); }, showManualComplete: () => { manual++; } });
  const res = sub.submit(goodAnswers());
  assert.equal(res.plan.method, 'manual');
  assert.equal(manual, 1);
  assert.equal(track.calls[1][1], 'manual');
});

test('PT-U5: 분석 sink 오류가 완료 흐름을 막지 않는다(§5·§8.1)', () => {
  // feedback·completed가 던져도 redirect 예약은 진행되어야 한다.
  const throwingTrack = { playtestFeedbackSubmitted() { throw new Error('sink down'); }, playtestCompleted() { throw new Error('sink down'); } };
  const scheduled = [];
  let redirected = null;
  const sub = createPlaytestSubmission({
    track: throwingTrack, completionUrl: 'https://x/complete',
    redirect: (u) => { redirected = u; }, showManualComplete: () => {},
    schedule: (fn, ms) => scheduled.push([fn, ms]),
  });
  const res = sub.submit(goodAnswers());
  assert.equal(res.ok, true);
  assert.equal(scheduled.length, 1);
  scheduled[0][0]();
  assert.equal(redirected, 'https://x/complete');
});

test('PT-U6: 완료 URL 없음 + sink 오류에도 manual 안내는 반드시 실행', () => {
  const throwingTrack = { playtestFeedbackSubmitted() { throw new Error('x'); }, playtestCompleted() { throw new Error('x'); } };
  let manual = 0;
  const sub = createPlaytestSubmission({ track: throwingTrack, completionUrl: '', redirect: () => {}, showManualComplete: () => { manual++; } });
  sub.submit(goodAnswers());
  assert.equal(manual, 1);
});
