// rush3-review — 친구 테스트 리뷰 설문(이사님 결정 2026-10-03 — 설계서 docs/superpowers/specs/2026-10-03-friend-review-survey-design.md) V3-REVIEW.
//  결과 화면 [리뷰 남기기] · 3판 뒤 초대 1회 · 답 + 자동 기록을 구글 설문지(formResponse, no-cors)로 보낸다 · 실패하면 다음 실행에 다시 보낸다.
//  ⚠️ 선택지 글자·칸 번호는 coo@ 계정 설문지(2026-10-03 게시)의 공개 페이지에서 읽은 값과 같아야 한다(다르면 구글이 응답을 조용히 버린다)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REVIEW_FORM, REVIEW_KEYS, REVIEW_QS, REVIEW_LIMITS, REVIEW_INVITE_RUNS, REVIEW_UI_LOCK, REVIEW_GAME_VER, REVIEW_BUTTON,
         reviewMissing, recordFields, buildReviewPairs, shouldInvite, deviceLabel, makeAnon, recordLine } from '../rush3/review.js';

const REC = { reach: 9, cleared: 8, runs: 12, mins: 34.4, story: 3, device: '휴대폰 · 아이폰 · 카카오톡', ver: 'r4.34', anon: 'a1b2c3d4' };

test('REVIEW-1: 문항 표 = 설문지(2026-10-03 게시본) — 순서 · 글자 · 선택지 · 필수 · 칸 번호 11개 · 주소', () => {
  assert.deepEqual(REVIEW_QS.map((q) => [q.key, q.label, q.kind, q.required]), [
    ['fun', '재미있었나요?', 'stars', true],
    ['diff', '난이도는 어땠나요?', 'choice', true],
    ['again', '또 하고 싶나요?', 'choice', false],
    ['best', '제일 좋았던 것 하나', 'choice', false],
    ['note', '한마디 (불편했던 점·버그·바라는 점)', 'text', false],
    ['name', '이름이나 별명', 'line', false],
  ]);
  assert.deepEqual(REVIEW_QS[0].options, ['1', '2', '3', '4', '5']);
  assert.deepEqual(REVIEW_QS[1].options, ['너무 쉬움', '조금 쉬움', '딱 좋음', '조금 어려움', '너무 어려움']);
  assert.deepEqual(REVIEW_QS[2].options, ['또 할래요', '가끔 할 것 같아요', '이번으로 충분해요']);
  assert.deepEqual(REVIEW_QS[3].options, ['부대가 커지는 맛', '게이트 고르기', '보스전', '무기 바꾸기', '스토리 그림', '잘 모르겠어요']);
  assert.deepEqual(REVIEW_KEYS, ['fun', 'diff', 'again', 'best', 'note', 'name', 'reach', 'runs', 'mins', 'device', 'etc']);
  assert.deepEqual(REVIEW_FORM.entry, {
    fun: 'entry.2115074859', diff: 'entry.1513591304', again: 'entry.1523716744', best: 'entry.1818482786', note: 'entry.1573431600', name: 'entry.2044580810',
    reach: 'entry.372798363', runs: 'entry.46892637', mins: 'entry.587201313', device: 'entry.524476485', etc: 'entry.723169039',
  });
  assert.match(REVIEW_FORM.action, /^https:\/\/docs\.google\.com\/forms\/d\/e\/[\w-]+\/formResponse$/);
  assert.equal(REVIEW_FORM.viewUrl, REVIEW_FORM.action.replace(/formResponse$/, 'viewform'));
  assert.deepEqual([REVIEW_LIMITS.note, REVIEW_LIMITS.name, REVIEW_INVITE_RUNS, REVIEW_UI_LOCK, REVIEW_BUTTON], [300, 20, 3, 0.6, '리뷰 남기기']);
  assert.match(REVIEW_GAME_VER, /^r\d+\.\d+$/);
  assert.ok(Object.isFrozen(REVIEW_QS) && Object.isFrozen(REVIEW_FORM) && Object.isFrozen(REVIEW_FORM.entry) && REVIEW_QS.every((q) => Object.isFrozen(q) && Object.isFrozen(q.options)));
});

test('REVIEW-2: 필수 확인 — 재미·난이도만 필수 · 표에 없는 선택 값은 틀린 값', () => {
  assert.deepEqual(reviewMissing({}), ['fun', 'diff']);
  assert.deepEqual(reviewMissing(null), ['fun', 'diff']);
  assert.deepEqual(reviewMissing({ fun: '5', diff: '딱 좋음' }), []);
  assert.deepEqual(reviewMissing({ fun: '6', diff: '딱 좋음' }), ['fun']);
  assert.deepEqual(reviewMissing({ fun: '3', diff: '보통', again: '글쎄', best: '보스전' }), ['diff', 'again']);
  assert.deepEqual(reviewMissing({ fun: ' ', diff: '딱 좋음', note: '아무 말', name: '' }), ['fun']);
});

test('REVIEW-3: 보낼 값 — 칸 번호 순서 · 빈 칸 · 표에 없는 선택 값은 빼고 · 긴 글은 자르고 · 자동 기록 5칸', () => {
  const full = buildReviewPairs({ fun: '4', diff: '딱 좋음', again: '또 할래요', best: '보스전', note: ' 재밌어요 ', name: '민수' }, REC);
  assert.deepEqual(full, [
    ['entry.2115074859', '4'], ['entry.1513591304', '딱 좋음'], ['entry.1523716744', '또 할래요'], ['entry.1818482786', '보스전'],
    ['entry.1573431600', '재밌어요'], ['entry.2044580810', '민수'],
    ['entry.372798363', '9'], ['entry.46892637', '12'], ['entry.587201313', '34'], ['entry.524476485', '휴대폰 · 아이폰 · 카카오톡'],
    ['entry.723169039', '깬 8 · 스토리 3 · r4.34 · #a1b2c3d4'],
  ]);
  const min = buildReviewPairs({ fun: '1', diff: '너무 어려움', again: '글쎄' }, REC).map(([k]) => k);
  assert.deepEqual(min, ['entry.2115074859', 'entry.1513591304', 'entry.372798363', 'entry.46892637', 'entry.587201313', 'entry.524476485', 'entry.723169039']);
  const long = buildReviewPairs({ fun: '2', diff: '딱 좋음', note: '가'.repeat(400), name: '나'.repeat(30) }, REC);
  assert.equal(long.find(([k]) => k === 'entry.1573431600')[1].length, 300);
  assert.equal(long.find(([k]) => k === 'entry.2044580810')[1].length, 20);
  assert.deepEqual(recordFields({}), { reach: '', runs: '', mins: '', device: '', etc: '깬 0 · 스토리 0 · ' + REVIEW_GAME_VER + ' · #-' });
  assert.equal(recordFields({ ...REC, mins: 0.4 }).mins, '0');
  assert.equal(recordLine(REC), '최고 STAGE 9 · 12판');
});

test('REVIEW-4: 기기 이름 — 기기 종류 · 운영체제 · 앱 안(카카오톡 등)만, 정확한 모델은 안 남긴다', () => {
  const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.5';
  const andChrome = 'Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
  const win = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
  const mac = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
  const andTab = 'Mozilla/5.0 (Linux; Android 13; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';
  assert.equal(deviceLabel(ios, 5), '휴대폰 · 아이폰 · 카카오톡');
  assert.equal(deviceLabel(andChrome, 5), '휴대폰 · 안드로이드 · 브라우저');
  assert.equal(deviceLabel(andChrome + ' KAKAOTALK 10.8.5', 5), '휴대폰 · 안드로이드 · 카카오톡');
  assert.equal(deviceLabel(andChrome + ' Instagram 300.0', 5), '휴대폰 · 안드로이드 · 인스타그램');
  assert.equal(deviceLabel(win, 0), 'PC · 윈도우 · 브라우저');
  assert.equal(deviceLabel(mac, 5), '태블릿 · 아이패드 · 브라우저');
  assert.equal(deviceLabel(mac, 0), 'PC · 맥 · 브라우저');
  assert.equal(deviceLabel(andTab, 10), '태블릿 · 안드로이드 · 브라우저');
  assert.equal(deviceLabel('', 0), 'PC · 기타 · 브라우저');
  assert.equal(deviceLabel(undefined), 'PC · 기타 · 브라우저');
});

test('REVIEW-5: 초대 판정 · 익명 번호', () => {
  assert.equal(shouldInvite({ runs: 2, asked: false, sent: 0 }), false);
  assert.equal(shouldInvite({ runs: 3, asked: false, sent: 0 }), true);
  assert.equal(shouldInvite({ runs: 30, asked: true, sent: 0 }), false);
  assert.equal(shouldInvite({ runs: 30, asked: false, sent: 1 }), false);
  assert.equal(makeAnon(() => 0), '00000000');
  assert.equal(makeAnon(() => 0.9999), 'zzzzzzzz');
  assert.match(makeAnon(), /^[0-9a-z]{8}$/);
});

// ─────────────────────────────── 저장 새 칸 ───────────────────────────────
import { createSave3 } from '../rush3/save.js';
import { memStorage } from './lib/rush3-shell.mjs';

test('REVIEW-6: 저장 새 칸 — 기본값 · 정규화 · patch 유지 · 다시 열어도 그대로 · v 3', () => {
  const st = memStorage();
  const sv = createSave3(st);
  const g = sv.get();
  assert.deepEqual([g.playSec, g.reviewAnon, g.reviewAsked, g.reviewSent, g.reviewPending], [0, '', false, 0, null]);
  sv.patch({ playSec: 95.5, reviewAnon: 'abcd1234', reviewAsked: true, reviewSent: 2, reviewPending: [['entry.1', '가'], ['entry.22', '나']] });
  const again = createSave3(st).get();
  assert.deepEqual([again.playSec, again.reviewAnon, again.reviewAsked, again.reviewSent, again.reviewPending], [95.5, 'abcd1234', true, 2, [['entry.1', '가'], ['entry.22', '나']]]);
  assert.equal(again.v, 3);
  const bad = memStorage();
  bad.setItem('starforgeRush.v3', JSON.stringify({ v: 3, stages: {}, playSec: -5, reviewAnon: 'ABC!', reviewAsked: 'yes', reviewSent: 2.7, reviewPending: [['entry.1', 3]] }));
  const b = createSave3(bad).get();
  assert.deepEqual([b.playSec, b.reviewAnon, b.reviewAsked, b.reviewSent, b.reviewPending], [0, '', false, 2, null]);
  const tooMany = Array.from({ length: 21 }, (_, i) => ['entry.' + i, 'x']);
  for (const p of [[], 'x', [['bad', 'x']], tooMany, [['entry.1', 'x'.repeat(401)]], [['entry.1']]]) {
    const s = createSave3(memStorage());
    s.patch({ reviewPending: p });
    assert.equal(s.get().reviewPending, null, JSON.stringify(p).slice(0, 40));
  }
});

// ─────────────────────────────── 셸 흐름(상태 'review') ───────────────────────────────
import { bootApp } from './lib/rush3-shell.mjs';
import { pickInput, weakenBosses, weakenCrowd, weakenBounties } from './lib/rush3-policies.mjs';

//  가짜 창 공장: 셸이 넘긴 콜백(cb)을 기억하고, open/close 를 기록한다
function fakeUi() {
  const f = { opens: [], closes: 0, cb: null, open: false };
  const factory = (cb) => {
    f.cb = cb;
    return { open: (o) => { f.opens.push(o); f.open = true; }, close: () => { f.closes++; f.open = false; }, isOpen: () => f.open };
  };
  return { f, factory };
}
//  가짜 전송: 부른 기록 · ok=false 면 reject(인터넷 끊김과 같은 꼴)
function fakeFetch(ok = true) {
  const calls = [];
  const fn = (url, opts) => { calls.push({ url, opts }); return ok ? Promise.resolve({ type: 'opaque' }) : Promise.reject(new TypeError('Failed to fetch')); };
  return { calls, fn };
}
const flush = () => new Promise((r) => setTimeout(r, 0));
async function reviewApp({ ok = true, ...opts } = {}) {
  const ui = fakeUi(), fx = fakeFetch(ok);
  const h = await bootApp({ review: true, reviewUi: ui.factory, fetch: fx.fn, makeAnon: () => 'abcd1234', ...opts });
  return { h, ui: ui.f, fx };
}
//  출격 → 몇 프레임 → 작전 중단(결과 화면) → 한 프레임(결과 화면 버튼이 잡힌다). 판 수(runNo) +1
function quickRun(h, id = 1) { h.app.startRun(id); h.frames(5); h.app.giveUp(); h.frames(1); }
//  판을 끝까지(검사 도구 — 보스·일반 적·현상금 적 체력 1, 병사 무적). 상태가 'run' 인 동안만
function driveToEnd(h) {
  let n = 0;
  while (h.app.getState() === 'run' && n++ < 30000) {
    const run = h.app.getRun();
    weakenBosses(run); weakenCrowd(run); weakenBounties(run);
    for (const u of run.units) u.hp = 1e9;
    h.app.input.state.pointerX = pickInput('evLead', run).pointerX;
    h.frames(1);
  }
}
const key = (h, code) => h.win.fire('keydown', { code });

test('REVIEW-7: 결과 화면 [리뷰 남기기] — 켜질 때만 · 누르면 창(설문) · 열린 동안 Enter·캔버스 누르기 무시 · ESC 로 닫기', async () => {
  const { h, ui } = await reviewApp();
  quickRun(h);
  assert.equal(h.app.getState(), 'result');
  const b = h.app.getButtons().find((x) => x.id === 'review');
  assert.deepEqual(b && [b.label, b.x, b.y, b.w, b.h, b.small], ['리뷰 남기기', 344, 14, 122, 40, true]);
  h.tap(b.x + b.w / 2, b.y + b.h / 2);
  assert.equal(h.app.getState(), 'review');
  assert.equal(ui.opens.length, 1);
  assert.equal(ui.opens[0].mode, 'form');
  assert.equal(ui.opens[0].line, '최고 STAGE 1 · 1판');
  assert.equal(ui.opens[0].sent, 0);
  assert.equal(typeof ui.cb.onSubmit, 'function');
  const run = h.app.getRun();
  key(h, 'Enter'); key(h, 'Space');
  h.tap(240, 508);
  assert.equal(h.app.getState(), 'review');
  assert.equal(h.app.getRun(), run, 'Enter·Space·누르기로 새 판이 시작되지 않는다');
  assert.equal(h.textNow().some((t) => t.includes('리뷰 남기기')), false, '창이 열린 동안은 버튼을 그리지 않는다');
  key(h, 'Escape');
  assert.equal(h.app.getState(), 'result');
  assert.equal(ui.closes, 1);
  for (const opts of [{}, { search: '?dev=1' }]) {
    const d = await bootApp({ ...opts, review: opts.search ? true : false });
    quickRun(d);
    assert.equal(d.app.getButtons().some((x) => x.id === 'review'), false, JSON.stringify(opts));
  }
  const dev = await reviewApp({ search: '?dev=1&review=1' });
  quickRun(dev.h);
  assert.ok(dev.h.app.getButtons().some((x) => x.id === 'review'), '?dev=1&review=1 이면 켠다');
});

test('REVIEW-8: 초대 — 판 수 3 이 된 결과 화면에서 한 번 · 다시 안 뜸 · 보낸 적 있으면 안 뜸 · 보스 승리 컷 뒤에 뜸', async () => {
  const { h, ui } = await reviewApp();
  quickRun(h); h.app.toTitle();
  quickRun(h); h.app.toTitle();
  assert.equal(ui.opens.length, 0);
  quickRun(h);
  assert.equal(h.app.getState(), 'review');
  assert.equal(ui.opens.length, 1);
  assert.equal(ui.opens[0].mode, 'invite');
  assert.equal(h.save.get().reviewAsked, true);
  ui.cb.onClose();
  assert.equal(h.app.getState(), 'result');
  h.app.toTitle(); quickRun(h);
  assert.equal(h.app.getState(), 'result');
  assert.equal(ui.opens.length, 1, '초대는 한 번만');

  const sent = await reviewApp();
  sent.h.save.patch({ reviewSent: 1 });
  for (let i = 0; i < 3; i++) { quickRun(sent.h); if (i < 2) sent.h.app.toTitle(); }
  assert.equal(sent.ui.opens.length, 0, '보낸 적 있으면 초대하지 않는다');

  const boss = await reviewApp({ story: true, unlockThrough: 2 });
  boss.h.save.patch({ seenStory: ['S0'] });
  quickRun(boss.h); boss.h.app.toTitle();
  quickRun(boss.h); boss.h.app.toTitle();
  boss.h.app.startRun(3);
  driveToEnd(boss.h);
  assert.equal(boss.h.app.getState(), 'story', '보스 승리 컷이 먼저');
  assert.equal(boss.ui.opens.length, 0);
  boss.h.frames(31); key(boss.h, 'Enter');
  assert.equal(boss.h.app.getState(), 'review');
  assert.equal(boss.ui.opens[0].mode, 'invite');
});

test('REVIEW-9: 보내기 — 필수 빠지면 안 보냄 · 성공 = 설문지 주소로 POST(no-cors) 한 번 · 실패 = 보관 → 다음 실행에 다시 보냄', async () => {
  const { h, ui, fx } = await reviewApp();
  quickRun(h);
  h.app.openReview('form');
  const miss = await ui.cb.onSubmit({ fun: '5' });
  assert.deepEqual(miss, { ok: false, missing: ['diff'] });
  assert.equal(fx.calls.length, 0);
  const r = await ui.cb.onSubmit({ fun: '5', diff: '딱 좋음', name: '[테스트]' });
  assert.deepEqual(r, { ok: true });
  assert.equal(fx.calls.length, 1);
  const { url, opts } = fx.calls[0];
  assert.equal(url, REVIEW_FORM.action);
  assert.deepEqual([opts.method, opts.mode], ['POST', 'no-cors']);
  assert.ok(opts.body instanceof URLSearchParams);
  assert.equal(opts.body.get(REVIEW_FORM.entry.fun), '5');
  assert.equal(opts.body.get(REVIEW_FORM.entry.diff), '딱 좋음');
  assert.equal(opts.body.get(REVIEW_FORM.entry.name), '[테스트]');
  assert.equal(opts.body.get(REVIEW_FORM.entry.reach), '1');
  assert.equal(opts.body.get(REVIEW_FORM.entry.runs), '1');
  assert.match(opts.body.get(REVIEW_FORM.entry.etc), /^깬 0 · 스토리 0 · r\d+\.\d+ · #abcd1234$/);
  assert.equal(opts.body.get(REVIEW_FORM.entry.again), null, '빈 칸은 보내지 않는다');
  assert.deepEqual([h.save.get().reviewSent, h.save.get().reviewPending, h.save.get().reviewAnon], [1, null, 'abcd1234']);

  const bad = await reviewApp({ ok: false });
  quickRun(bad.h);
  bad.h.app.openReview('form');
  const f = await bad.ui.cb.onSubmit({ fun: '2', diff: '너무 쉬움' });
  assert.deepEqual(f, { ok: false });
  const pend = bad.h.save.get().reviewPending;
  assert.ok(Array.isArray(pend) && pend.some(([k, v]) => k === REVIEW_FORM.entry.diff && v === '너무 쉬움'));
  assert.equal(bad.h.save.get().reviewSent, 0);
  //  같은 저장소로 다시 실행 → 보관한 값을 한 번 다시 보낸다
  const retry = fakeFetch(true);
  const h2 = await bootApp({ storage: bad.h.storage, review: true, reviewUi: fakeUi().factory, fetch: retry.fn });
  await flush();
  assert.equal(retry.calls.length, 1);
  assert.equal(retry.calls[0].opts.body.get(REVIEW_FORM.entry.diff), '너무 쉬움');
  assert.deepEqual([h2.save.get().reviewPending, h2.save.get().reviewSent], [null, 1]);
  //  설문이 꺼진 실행은 다시 보내지 않는다
  const off = fakeFetch(true);
  const st3 = memStorage();
  createSave3(st3).patch({ reviewPending: [['entry.1', 'x']] });
  await bootApp({ storage: st3, fetch: off.fn });
  await flush();
  assert.equal(off.calls.length, 0);
});

test('REVIEW-10: 플레이 시간 — 판이 끝나면 판 시간(run.time)을 playSec 에 더한다', async () => {
  const { h } = await reviewApp();
  h.app.startRun(1);
  h.frames(120);
  const t = h.app.getRun().time;
  h.app.giveUp();
  assert.ok(t > 1.5 && Math.abs(h.save.get().playSec - t) < 1e-9, h.save.get().playSec + ' vs ' + t);
  quickRun(h);
  assert.ok(h.save.get().playSec > t);
});
