import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalytics, sanitizeEvent, cleanValue, installDebugGlobal } from '../js/analytics.js';
import { SCHEMA } from '../js/analytics-config.js';

// Stage 1 분석 코어 계약(작업지시서 §20.1). fake sink 주입으로 실제 호출·정제·중복 방지를 검증.

function recorder() {
  const sent = [];
  return { sent, sink: (e) => { sent.push(e); return { sent: true }; } };
}

test('1) 허용 이벤트가 sink에 정확히 한 번 전달된다', () => {
  const { sent, sink } = recorder();
  const a = createAnalytics({ schema: SCHEMA, sink });
  a.emit('title_viewed', { analytics_schema_version: '1', player_type: 'new', viewport_group: 'desktop' });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].name, 'title_viewed');
});

test('2) 알 수 없는 이벤트는 sink에 전달되지 않는다', () => {
  const { sent, sink } = recorder();
  const a = createAnalytics({ schema: SCHEMA, sink });
  a.emit('not_a_real_event', { foo: 1 });
  assert.equal(sent.length, 0);
});

test('3-4) 허용 속성만 남고 알 수 없는 속성은 제거된다', () => {
  const { sent, sink } = recorder();
  const a = createAnalytics({ schema: SCHEMA, sink });
  a.emit('route_selected', {
    sector: 2, node_type: 'combat', node_col: 1, selection_method: 'auto_root',
    game_mode: 'campaign', analytics_schema_version: '1',
    totally_unknown: 'x', node_id: 999,   // node_id는 화이트리스트 밖 → 제거
  });
  const p = sent[0].properties;
  assert.deepEqual(Object.keys(p).sort(), ['analytics_schema_version', 'game_mode', 'node_col', 'node_type', 'sector', 'selection_method'].sort());
  assert.ok(!('totally_unknown' in p) && !('node_id' in p));
});

test('5) PII 키는 화이트리스트여도 제거된다', () => {
  const { sent, sink } = recorder();
  const a = createAnalytics({ schema: SCHEMA, sink });
  a.emit('title_viewed', { player_type: 'new', email: 'a@b.com', user_id: '42', name: '홍길동', url: 'https://x' });
  const p = sent[0].properties;
  assert.ok(!('email' in p) && !('user_id' in p) && !('name' in p) && !('url' in p));
  assert.equal(p.player_type, 'new');
});

test('6) 객체·배열 값은 제거된다', () => {
  const { sent, sink } = recorder();
  const a = createAnalytics({ schema: SCHEMA, sink });
  a.emit('expedition_ended', { outcome: 'death', doctrine_id: { a: 1 }, keystone_id: ['x'] });
  const p = sent[0].properties;
  assert.equal(p.outcome, 'death');
  assert.ok(!('doctrine_id' in p) && !('keystone_id' in p));
});

test('7) 비유한 숫자는 제거된다', () => {
  const { sent, sink } = recorder();
  const a = createAnalytics({ schema: SCHEMA, sink });
  a.emit('combat_started', { sector: 1, time_to_combat_sec: Infinity });
  a.emit('combat_started', { sector: 1, time_to_combat_sec: NaN });
  assert.ok(!('time_to_combat_sec' in sent[0].properties));
  assert.ok(!('time_to_combat_sec' in sent[1].properties));
});

test('8) enum 화이트리스트 밖 값은 제거된다', () => {
  const { sent, sink } = recorder();
  const a = createAnalytics({ schema: SCHEMA, sink });
  a.emit('expedition_ended', { outcome: 'exploded', primary_weapon: 'plasma' });   // 둘 다 enum 밖
  const p = sent[0].properties;
  assert.ok(!('outcome' in p) && !('primary_weapon' in p));
});

test('9) 문자열 길이 상한 초과 값은 제거된다', () => {
  const { sent, sink } = recorder();
  const a = createAnalytics({ schema: SCHEMA, sink });
  a.emit('expedition_ended', { outcome: 'death', doctrine_id: 'x'.repeat(200) });
  assert.ok(!('doctrine_id' in sent[0].properties));
  assert.equal(sent[0].properties.outcome, 'death');
});

test('10) sink가 throw해도 게임 호출부로 전파되지 않는다', () => {
  const a = createAnalytics({ schema: SCHEMA, sink: () => { throw new Error('boom'); } });
  assert.doesNotThrow(() => a.emit('title_viewed', { player_type: 'new' }));
});

test('11) disabled 모드는 완전 no-op(디버그 로그도 없음)', () => {
  const { sent, sink } = recorder();
  const a = createAnalytics({ schema: SCHEMA, sink, enabled: false, debug: true });
  a.emit('title_viewed', { player_type: 'new' });
  assert.equal(sent.length, 0);
  assert.equal(a.debugCount(), 0);
});

test('12) once는 동일 키 중복을 막는다', () => {
  const { sent, sink } = recorder();
  const a = createAnalytics({ schema: SCHEMA, sink });
  a.once('combat_started', 'exp1', { sector: 1, time_to_combat_sec: 3 });
  a.once('combat_started', 'exp1', { sector: 1, time_to_combat_sec: 9 });
  a.once('combat_started', 'exp2', { sector: 1, time_to_combat_sec: 3 });
  assert.equal(sent.filter((e) => e.name === 'combat_started').length, 2);
});

test('13) 디버그 로그는 500개 상한을 유지한다', () => {
  const a = createAnalytics({ schema: SCHEMA, sink: () => ({ sent: false, reason: 'x' }), debug: true });
  for (let i = 0; i < 640; i++) a.emit('title_viewed', { player_type: 'new' });
  assert.equal(a.debugCount(), 500);
});

test('14) installDebugGlobal은 enabled=true일 때만 전역을 만든다', () => {
  const a = createAnalytics({ schema: SCHEMA, sink: recorder().sink, debug: true });
  const g1 = {};
  assert.equal(installDebugGlobal(a, { enabled: false, globalObj: g1 }), false);
  assert.ok(!('__NFAnalytics' in g1));
  const g2 = {};
  assert.equal(installDebugGlobal(a, { enabled: true, globalObj: g2 }), true);
  assert.ok('__NFAnalytics' in g2);
  assert.ok(Array.isArray(g2.__NFAnalytics.log));
});

test('디버그 로그는 전송 여부·차단 이유를 담는다(정제된 속성만)', () => {
  const a = createAnalytics({ schema: SCHEMA, sink: () => ({ sent: false, reason: 'dev_mode' }), debug: true });
  a.emit('sector_started', { sector: 3, game_mode: 'campaign', secret: 'nope' });
  const log = a.getDebugLog();
  assert.equal(log[0].sent, false);
  assert.equal(log[0].blocked_reason, 'dev_mode');
  assert.ok(!('secret' in log[0].properties));   // 제거된 키는 값 자체가 로그에 안 남는다
});

test('sanitizeEvent는 미등록 이벤트에 null을 반환한다', () => {
  assert.equal(sanitizeEvent('nope', {}, SCHEMA), null);
});

test('cleanValue: 정수 범위 클램프, enum 검사', () => {
  assert.equal(cleanValue(5000, { t: 'int', min: 1, max: 999 }), 999);
  assert.equal(cleanValue(0, { t: 'int', min: 1, max: 999 }), 1);
  assert.equal(cleanValue('mobile', { t: 'enum', enum: ['mobile', 'desktop'] }), 'mobile');
  assert.equal(cleanValue('tablet', { t: 'enum', enum: ['mobile', 'desktop'] }), undefined);
});
