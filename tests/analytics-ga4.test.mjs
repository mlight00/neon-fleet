import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createGa4Adapter } from '../js/analytics-ga4.js';
import { createConsent } from '../js/analytics-consent.js';
import { shouldOfferConsent } from '../js/analytics-config.js';

// Stage 1 GA4 어댑터 계약(작업지시서 §20.3). fake window/document 주입으로 스크립트 로드·동의·설정을 검증.

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
function fakeDoc() {
  const scripts = [];
  return {
    scripts,
    head: { appendChild(el) { scripts.push(el); } },
    createElement() { return { setAttribute() {} }; },
  };
}
function grantedConsent() { const c = createConsent(memStorage()); c.set('granted'); return c; }
function cfg(over = {}) { return { enabled: true, measurementId: 'G-ABCD1234', ...over }; }
/** gtag 호출을 기록하는 fake window. */
function fakeWin(gtagImpl) {
  const calls = [];
  const win = { dataLayer: [], gtag: gtagImpl || ((...a) => calls.push(a)) };
  win._calls = calls;
  return win;
}
const configCall = (win) => win._calls.find((a) => a[0] === 'config');
const eventCalls = (win) => win._calls.filter((a) => a[0] === 'event');

test('25) 빈 측정 ID면 스크립트 삽입 0 · send no_measurement_id', () => {
  const doc = fakeDoc();
  const adapter = createGa4Adapter({ config: cfg({ measurementId: '' }), consent: grantedConsent(), win: fakeWin(), doc });
  assert.equal(adapter.send('title_viewed', {}).reason, 'no_measurement_id');
  assert.equal(doc.scripts.length, 0);
});

test('26) 잘못된 측정 ID면 스크립트 삽입 0', () => {
  const doc = fakeDoc();
  const adapter = createGa4Adapter({ config: cfg({ measurementId: 'GA-nope' }), consent: grantedConsent(), win: fakeWin(), doc });
  assert.equal(adapter.send('title_viewed', {}).reason, 'no_measurement_id');
  assert.equal(doc.scripts.length, 0);
});

test('27) 유효 ID·granted면 스크립트 정확히 1개 + 이벤트 전송', () => {
  const doc = fakeDoc();
  const win = fakeWin();
  const adapter = createGa4Adapter({ config: cfg(), consent: grantedConsent(), win, doc });
  const r = adapter.send('sector_started', { sector: 1 });
  assert.equal(r.sent, true);
  assert.equal(doc.scripts.length, 1);
  assert.equal(eventCalls(win).length, 1);
  assert.equal(eventCalls(win)[0][1], 'sector_started');
});

test('28) 연속 초기화(여러 send)에도 스크립트는 1개', () => {
  const doc = fakeDoc();
  const win = fakeWin();
  const adapter = createGa4Adapter({ config: cfg(), consent: grantedConsent(), win, doc });
  adapter.send('title_viewed', {});
  adapter.send('sector_started', { sector: 1 });
  adapter.send('sector_started', { sector: 2 });
  assert.equal(doc.scripts.length, 1);
  assert.equal(eventCalls(win).length, 3);
});

test('29-31) config는 send_page_view·Signals·광고개인화를 끈다', () => {
  const win = fakeWin();
  createGa4Adapter({ config: cfg(), consent: grantedConsent(), win, doc: fakeDoc() }).send('title_viewed', {});
  const cc = configCall(win);
  assert.ok(cc, 'config 호출 존재');
  assert.equal(cc[2].send_page_view, false);
  assert.equal(cc[2].allow_google_signals, false);
  assert.equal(cc[2].allow_ad_personalization_signals, false);
});

test('32-33) consent 기본 denied 뒤 granted 업데이트(이벤트보다 먼저)', () => {
  const win = fakeWin();
  createGa4Adapter({ config: cfg(), consent: grantedConsent(), win, doc: fakeDoc() }).send('title_viewed', {});
  const calls = win._calls;
  const defIdx = calls.findIndex((a) => a[0] === 'consent' && a[1] === 'default');
  const updIdx = calls.findIndex((a) => a[0] === 'consent' && a[1] === 'update' && a[2].analytics_storage === 'granted');
  const evIdx = calls.findIndex((a) => a[0] === 'event');
  assert.ok(defIdx >= 0, 'consent default 존재');
  assert.equal(calls[defIdx][2].analytics_storage, 'denied');
  assert.ok(updIdx >= 0 && updIdx < evIdx, 'granted 업데이트가 이벤트보다 먼저');
});

test('34) debug_mode는 디버그일 때만 붙는다', () => {
  const winA = fakeWin();
  createGa4Adapter({ config: cfg(), consent: grantedConsent(), win: winA, doc: fakeDoc(), isDebug: () => false }).send('title_viewed', { player_type: 'new' });
  assert.ok(!('debug_mode' in eventCalls(winA)[0][2]));
  const winB = fakeWin();
  createGa4Adapter({ config: cfg(), consent: grantedConsent(), win: winB, doc: fakeDoc(), isDebug: () => true }).send('title_viewed', { player_type: 'new' });
  assert.equal(eventCalls(winB)[0][2].debug_mode, true);
});

test('35) 어떤 gtag 호출에도 user_id가 없다', () => {
  const win = fakeWin();
  createGa4Adapter({ config: cfg(), consent: grantedConsent(), win, doc: fakeDoc() }).send('expedition_started', { game_mode: 'campaign' });
  for (const call of win._calls) {
    for (const arg of call) {
      if (arg && typeof arg === 'object') assert.ok(!('user_id' in arg), `user_id 없음: ${JSON.stringify(arg)}`);
    }
  }
});

test('36) gtag 예외 시 게임 정상(send는 gtag_error 반환, throw 안 함)', () => {
  const win = fakeWin(() => { throw new Error('gtag boom'); });
  const adapter = createGa4Adapter({ config: cfg(), consent: grantedConsent(), win, doc: fakeDoc() });
  let r;
  assert.doesNotThrow(() => { r = adapter.send('title_viewed', {}); });
  assert.equal(r.sent, false);
});

test('55) 개발 모드(dev URL)면 스크립트·전송 0', () => {
  const doc = fakeDoc();
  const win = fakeWin();
  const adapter = createGa4Adapter({ config: cfg(), consent: grantedConsent(), win, doc, isDevMode: () => true });
  const r = adapter.send('sector_started', { sector: 1 });
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'dev_mode');
  assert.equal(doc.scripts.length, 0);
  assert.equal(eventCalls(win).length, 0);
});

test('23) 설정 비활성 또는 ID 없음이면 동의 UI를 제안하지 않는다', () => {
  assert.equal(shouldOfferConsent({ enabled: false, measurementId: 'G-ABCD1234' }), false);
  assert.equal(shouldOfferConsent({ enabled: true, measurementId: '' }), false);
  assert.equal(shouldOfferConsent({ enabled: true, measurementId: 'nope' }), false);
  assert.equal(shouldOfferConsent({ enabled: true, measurementId: 'G-ABCD1234' }), true);
});

test('config.enabled=false면 send disabled', () => {
  const adapter = createGa4Adapter({ config: cfg({ enabled: false }), consent: grantedConsent(), win: fakeWin(), doc: fakeDoc() });
  assert.equal(adapter.send('title_viewed', {}).reason, 'disabled');
});

test('57) 실제 window에 gtag가 없어도 shim 설치로 init·config·첫 event가 성공한다', () => {
  const doc = fakeDoc();
  const win = { dataLayer: [] };   // gtag 미제공(실제 스크립트 로드 실패·차단 상황 모사)
  const adapter = createGa4Adapter({ config: cfg(), consent: grantedConsent(), win, doc });
  const r = adapter.send('sector_started', { sector: 1 });
  assert.equal(r.sent, true);
  assert.equal(typeof win.gtag, 'function', 'shim이 설치됨');
  assert.equal(doc.scripts.length, 1, '스크립트 정확히 1회');
  const dl = win.dataLayer.map((a) => Array.from(a));   // shim은 arguments를 push
  assert.ok(dl.some((a) => a[0] === 'consent' && a[1] === 'default' && a[2].analytics_storage === 'denied'), 'consent default denied');
  assert.ok(dl.some((a) => a[0] === 'config' && a[2].send_page_view === false), 'config 기록');
  assert.ok(dl.some((a) => a[0] === 'consent' && a[1] === 'update' && a[2].analytics_storage === 'granted'), 'granted 업데이트');
  assert.ok(dl.some((a) => a[0] === 'event' && a[1] === 'sector_started'), '첫 event 기록');
});

test('58) 거부(denied) 뒤 같은 페이지에서 재허용(grant)하면 이후 이벤트가 전송된다', () => {
  const doc = fakeDoc();
  const win = fakeWin();
  const consent = createConsent(memStorage());
  consent.set('denied');
  const adapter = createGa4Adapter({ config: cfg(), consent, win, doc });
  assert.equal(adapter.send('title_viewed', {}).reason, 'no_consent');   // denied → 전송 0·스크립트 0
  assert.equal(doc.scripts.length, 0);
  consent.set('granted');
  adapter.grant();
  const r = adapter.send('sector_started', { sector: 1 });
  assert.equal(r.sent, true);
  assert.equal(doc.scripts.length, 1);
  assert.equal(eventCalls(win).length, 1);
});

test('59) 철회(revoke) 뒤 재허용(grant)하면 같은 어댑터로 전송 재개 + consent granted 업데이트', () => {
  const win = fakeWin();
  const adapter = createGa4Adapter({ config: cfg(), consent: grantedConsent(), win, doc: fakeDoc() });
  assert.equal(adapter.send('title_viewed', {}).sent, true);            // init(granted 업데이트 1회)
  adapter.revoke();
  assert.equal(adapter.send('sector_started', { sector: 1 }).reason, 'revoked');
  adapter.grant();                                                      // 재개 + init됐으므로 granted 재업데이트
  const before = eventCalls(win).length;
  assert.equal(adapter.send('sector_started', { sector: 2 }).sent, true);
  assert.equal(eventCalls(win).length, before + 1);
  const grantedUpdates = win._calls.filter((a) => a[0] === 'consent' && a[1] === 'update' && a[2].analytics_storage === 'granted');
  assert.ok(grantedUpdates.length >= 2, 'init 시 1회 + grant 시 1회');
  // revoke 시 denied 업데이트도 있었다
  assert.ok(win._calls.some((a) => a[0] === 'consent' && a[1] === 'update' && a[2].analytics_storage === 'denied'));
});
