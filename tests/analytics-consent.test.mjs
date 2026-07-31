import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConsent, CONSENT_KEY } from '../js/analytics-consent.js';
import { createSave } from '../js/save.js';
import { createAnalytics } from '../js/analytics.js';
import { createGa4Adapter, ga4Sink } from '../js/analytics-ga4.js';
import { SCHEMA } from '../js/analytics-config.js';

// Stage 1 동의 계약(작업지시서 §20.2). fake storage 주입으로 저장·철회·초기화 분리를 검증.

function memStorage() {
  const m = new Map();
  return {
    _m: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
    clear: () => m.clear(),
  };
}
function throwingStorage() {
  return { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } };
}

test('15) 최초 상태는 unknown', () => {
  assert.equal(createConsent(memStorage()).get(), 'unknown');
});

test('16) unknown에서는 외부 전송이 없다(GA4 sink no_consent)', () => {
  const consent = createConsent(memStorage());
  const config = { enabled: true, measurementId: 'G-TEST1234' };
  const win = { dataLayer: [] };
  const scripts = [];
  const adapter = createGa4Adapter({ config, consent, win, doc: {}, loadScript: (d, id) => { scripts.push(id); return {}; } });
  const r = adapter.send('title_viewed', {});
  assert.equal(r.sent, false);
  assert.equal(r.reason, 'no_consent');
  assert.equal(scripts.length, 0);
});

test('17-18) granted·denied 저장은 재로드에도 유지된다', () => {
  const store = memStorage();
  createConsent(store).set('granted');
  assert.equal(createConsent(store).get(), 'granted');
  createConsent(store).set('denied');
  assert.equal(createConsent(store).get(), 'denied');
  assert.equal(store.getItem(CONSENT_KEY), 'denied');
});

test('19) 철회 뒤 미래 이벤트 전송 0 (adapter.revoke + consent denied)', () => {
  const store = memStorage();
  const consent = createConsent(store);
  consent.set('granted');
  const config = { enabled: true, measurementId: 'G-TEST1234' };
  const events = [];
  const win = { dataLayer: [], gtag: (...a) => events.push(a) };
  const adapter = createGa4Adapter({ config, consent, win, doc: {}, loadScript: () => ({}) });
  assert.equal(adapter.send('title_viewed', {}).sent, true);
  const before = events.length;
  consent.set('denied');
  adapter.revoke();
  const r = adapter.send('sector_started', { sector: 1 });
  assert.equal(r.sent, false);
  // revoke가 analytics_storage denied 업데이트를 보내지만, 그 뒤 이벤트는 없다
  assert.ok(!events.slice(before).some((a) => a[0] === 'event'));
});

test('20) 게임 진행 초기화(save.reset)가 동의를 지우지 않는다', () => {
  const store = memStorage();
  const save = createSave(store);
  const consent = createConsent(store);
  consent.set('granted');
  save.set({ coins: 500, best: 999 });
  save.reset();                       // 진행 초기화
  assert.equal(consent.get(), 'granted');   // 동의는 별도 키라 그대로
  assert.equal(save.get().coins, 0);        // 진행은 초기화됨
});

test('21) localStorage throw 시 게임 정상·unknown 기본', () => {
  const consent = createConsent(throwingStorage());
  assert.equal(consent.available, false);
  assert.equal(consent.get(), 'unknown');
  assert.doesNotThrow(() => consent.set('granted'));   // 메모리 폴백
  assert.equal(consent.get(), 'granted');
});

test('21b) setItem throw(생성 시 getItem은 성공) → 메모리 폴백 전환, 같은 세션 get()이 새 값을 유지', () => {
  const m = new Map();
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem() { throw new Error('quota'); } };
  const consent = createConsent(storage);
  assert.equal(consent.available, true);        // 생성 시 getItem은 성공
  assert.equal(consent.get(), 'unknown');
  assert.equal(consent.set('granted'), 'granted');
  assert.equal(consent.available, false);       // 쓰기 실패 직후 외부 상태도 폴백 전환을 반영
  assert.equal(consent.get(), 'granted');       // storage엔 못 썼지만 메모리 폴백으로 유지
  assert.equal(consent.set('denied'), 'denied');
  assert.equal(consent.get(), 'denied');
});

test('21c) get() 중 getItem이 실패하면 메모리 폴백으로 전환해 마지막 값을 반환', () => {
  let failGet = false;
  const m = new Map();
  const storage = {
    getItem: (k) => { if (failGet) throw new Error('blocked'); return m.has(k) ? m.get(k) : null; },
    setItem: (k, v) => m.set(k, String(v)),
  };
  const consent = createConsent(storage);   // 생성 시 getItem 성공
  consent.set('granted');                    // storage에 기록됨
  failGet = true;                            // 이후 getItem은 실패
  assert.equal(consent.get(), 'granted');    // storage 대신 메모리 폴백으로 마지막 값
  assert.equal(consent.available, false);     // 읽기 실패 뒤 외부 상태도 폴백 전환을 반영
});

test('22) 잘못된 동의 값은 unknown으로 정규화', () => {
  const store = memStorage();
  store.setItem(CONSENT_KEY, 'maybe');
  assert.equal(createConsent(store).get(), 'unknown');
  const c = createConsent(store);
  assert.equal(c.set('sometimes'), 'unknown');   // 저장 무시
});

test('24) 동의 전 이벤트는 소급 전송되지 않는다', () => {
  // 코어에 이벤트를 쌓아도 sink(GA4)가 no_consent면 전송 0. 이후 granted여도 과거 이벤트는 재전송 없음(버퍼 없음).
  const store = memStorage();
  const consent = createConsent(store);
  const config = { enabled: true, measurementId: 'G-TEST1234' };
  const events = [];
  const win = { dataLayer: [], gtag: (...a) => events.push(a) };
  const adapter = createGa4Adapter({ config, consent, win, doc: {}, loadScript: () => ({}) });
  const analytics = createAnalytics({ schema: SCHEMA, sink: ga4Sink(adapter) });
  analytics.emit('title_viewed', { player_type: 'new' });   // 동의 전
  assert.equal(events.filter((a) => a[0] === 'event').length, 0);
  consent.set('granted');
  analytics.emit('sector_started', { sector: 1, game_mode: 'campaign' });   // 동의 후 새 이벤트만
  const sentEvents = events.filter((a) => a[0] === 'event');
  assert.equal(sentEvents.length, 1);
  assert.equal(sentEvents[0][1], 'sector_started');   // 과거 title_viewed는 소급 전송 안 됨
});
