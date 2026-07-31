import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnalytics } from '../js/analytics.js';
import { createGameAnalytics, resolvePlayerType } from '../js/analytics-events.js';
import { createGa4Adapter, ga4Sink } from '../js/analytics-ga4.js';
import { createConsent } from '../js/analytics-consent.js';
import { SCHEMA } from '../js/analytics-config.js';
import { createRunMetrics } from '../js/run-metrics.js';

// Stage 1 게임 연결 계약(작업지시서 §20.4). 실제 코어 + 스키마 + 파사드를 조립해
//  이벤트 이름·속성·원정 단위 중복 방지·run_index_session을 검증한다(파일 문자열 검사 아님).

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
function fakeSave(data = {}) {
  const d = { best: 0, stage: 1, coins: 0, up: {}, ...data };
  return { get: () => ({ ...d }) };
}
function setup({ save = fakeSave(), ss = memStorage(), viewport = () => 'desktop' } = {}) {
  const sent = [];
  const analytics = createAnalytics({ schema: SCHEMA, sink: (e) => { sent.push(e); return { sent: true }; } });
  const clock = { ms: 0 };
  const g = createGameAnalytics({ analytics, save, sessionStorage: ss, now: () => clock.ms, viewport });
  return { sent, g, clock, ss };
}
const names = (sent) => sent.map((e) => e.name);
const byName = (sent, n) => sent.filter((e) => e.name === n);

test('37) 타이틀 전환당 title_viewed 1회', () => {
  const { sent, g } = setup();
  g.titleViewed();
  assert.equal(byName(sent, 'title_viewed').length, 1);
  const p = sent[0].properties;
  assert.equal(p.analytics_schema_version, '1');
  assert.equal(p.player_type, 'new');
  assert.equal(p.viewport_group, 'desktop');
});

test('38) 프롤로그 자연 완료: intro_started + intro_completed(completion_method)', () => {
  const { sent, g, clock } = setup();
  g.introStarted();
  clock.ms = 8000;
  g.introEnded('complete_auto');
  assert.deepEqual(names(sent), ['intro_started', 'intro_completed']);
  assert.equal(byName(sent, 'intro_completed')[0].properties.completion_method, 'complete_auto');
  assert.equal(byName(sent, 'intro_completed')[0].properties.duration_sec, 8);
});

test('39) 프롤로그 건너뛰기: intro_started + intro_skipped, intro_completed 없음', () => {
  const { sent, g } = setup();
  g.introStarted();
  g.introEnded('skip', { panelReached: 2 });
  g.introEnded('complete_auto');   // 중복 종료 시도 — 무시돼야 함
  assert.deepEqual(names(sent), ['intro_started', 'intro_skipped']);
  assert.equal(byName(sent, 'intro_skipped')[0].properties.panel_reached, 2);
  assert.equal(byName(sent, 'intro_completed').length, 0);
});

test('40) 첫 안내: guide_viewed + guide_completed', () => {
  const { sent, g } = setup();
  g.guideViewed('combo');
  g.guideCompleted('combo');
  assert.deepEqual(names(sent), ['guide_viewed', 'guide_completed']);
  assert.equal(sent[0].properties.guide_type, 'combo');
});

test('41) 타이틀 시작 선택과 실제 원정 시작은 구분된다', () => {
  const { sent, g } = setup();
  g.expeditionStartSelected('campaign');
  g.expeditionStarted('campaign');
  assert.deepEqual(names(sent), ['expedition_start_selected', 'expedition_started']);
  assert.equal(byName(sent, 'expedition_started')[0].properties.run_index_session, 1);
});

test('42) 원정당 combat_started 1회', () => {
  const { sent, g, clock } = setup();
  g.expeditionStarted('campaign');
  clock.ms = 5000;
  g.combatStarted(1);
  g.combatStarted(1);   // 중복 — 무시
  assert.equal(byName(sent, 'combat_started').length, 1);
  assert.equal(byName(sent, 'combat_started')[0].properties.time_to_combat_sec, 5);
});

test('43) 섹터당 sector_started 1회(호출당 1회)', () => {
  const { sent, g } = setup();
  g.expeditionStarted('campaign');
  g.sectorStarted(1, 'campaign');
  assert.equal(byName(sent, 'sector_started').length, 1);
  assert.equal(sent.at(-1).properties.sector, 1);
});

test('44) 자동 루트는 selection_method=auto_root', () => {
  const { sent, g } = setup();
  g.expeditionStarted('campaign');
  g.routeSelected({ sector: 1, nodeType: 'combat', nodeCol: 0, selectionMethod: 'auto_root', nodeKey: 'n0' });
  const e = byName(sent, 'route_selected')[0];
  assert.equal(e.properties.selection_method, 'auto_root');
  assert.equal(e.properties.node_type, 'combat');
});

test('45) 수동 항로 확정은 노드당 중복 1회 방지', () => {
  const { sent, g } = setup();
  g.expeditionStarted('campaign');
  g.routeSelected({ sector: 2, nodeType: 'elite', nodeCol: 1, selectionMethod: 'pointer_confirm', nodeKey: 'n7' });
  g.routeSelected({ sector: 2, nodeType: 'elite', nodeCol: 1, selectionMethod: 'pointer_confirm', nodeKey: 'n7' });
  assert.equal(byName(sent, 'route_selected').length, 1);
});

test('45b) pointer/touch/keyboard confirm이 selection_method로 그대로 전달된다', () => {
  for (const m of ['pointer_confirm', 'touch_confirm', 'keyboard_confirm']) {
    const { sent, g } = setup();
    g.expeditionStarted('campaign');
    g.routeSelected({ sector: 1, nodeType: 'combat', nodeCol: 0, selectionMethod: m, nodeKey: 'n0' });
    assert.equal(byName(sent, 'route_selected')[0].properties.selection_method, m);
  }
});

test('45c) manual_confirm은 스키마에서 제거되어 selection_method가 붙지 않는다(이벤트는 전송)', () => {
  const { sent, g } = setup();
  g.expeditionStarted('campaign');
  g.routeSelected({ sector: 1, nodeType: 'combat', nodeCol: 0, selectionMethod: 'manual_confirm', nodeKey: 'n0' });
  const e = byName(sent, 'route_selected')[0];
  assert.equal(e.name, 'route_selected');
  assert.ok(!('selection_method' in e.properties), 'manual_confirm은 더 이상 유효 enum이 아님');
});

test('46-47) 교리·키스톤 선택은 적용 뒤 1회(choice_type 구분)', () => {
  const { sent, g } = setup();
  g.buildChoice({ choiceType: 'doctrine', choiceId: 'swarm', sector: 1 });
  g.buildChoice({ choiceType: 'keystone', choiceId: 'lance_echo', sector: 1 });
  const bc = byName(sent, 'build_choice_selected');
  assert.equal(bc.length, 2);
  assert.deepEqual(bc.map((e) => e.properties.choice_type), ['doctrine', 'keystone']);
  assert.equal(bc[0].properties.choice_id, 'swarm');
});

test('48) 진화·초진화 choice_type 구분', () => {
  const { sent, g } = setup();
  g.buildChoice({ choiceType: 'weapon_evolution', choiceId: 'vulcan_needle', weaponId: 'vulcan' });
  g.buildChoice({ choiceType: 'weapon_super_evolution', choiceId: 'vulcan_storm', weaponId: 'vulcan' });
  const bc = byName(sent, 'build_choice_selected');
  assert.deepEqual(bc.map((e) => e.properties.choice_type), ['weapon_evolution', 'weapon_super_evolution']);
  assert.equal(bc[0].properties.weapon_id, 'vulcan');
});

test('49) 무료 개조는 저장 성공 뒤 1회', () => {
  const { sent, g } = setup();
  g.freeUpgrade('hull');
  const e = byName(sent, 'free_upgrade_selected');
  assert.equal(e.length, 1);
  assert.equal(e[0].properties.upgrade_key, 'hull');
});

test('50) 결과 화면 재렌더에도 expedition_ended 1회', () => {
  const { sent, g } = setup();
  g.expeditionStarted('campaign');
  const props = { outcome: 'death', durationSec: 123.45, sectorReached: 2, nodeProgress: 3, primaryWeapon: 'vulcan', doctrineId: 'swarm', maxTier: 2, maxCruisers: 1, firstDefeatUpgradeState: 'claimed' };
  g.expeditionEnded(props);
  g.expeditionEnded(props);   // 재렌더 — 무시
  const e = byName(sent, 'expedition_ended');
  assert.equal(e.length, 1);
  assert.equal(e[0].properties.outcome, 'death');
  assert.equal(e[0].properties.duration_sec, 123.5);
  assert.equal(e[0].properties.sector_reached, 2);
  assert.equal(e[0].properties.first_defeat_upgrade_state, 'claimed');
});

test('51) death·quit·campaign_clear outcome 구분', () => {
  const { sent, g } = setup();
  g.expeditionStarted('campaign'); g.expeditionEnded({ outcome: 'death', sectorReached: 1 });
  g.expeditionStarted('campaign'); g.expeditionEnded({ outcome: 'quit', sectorReached: 2 });
  g.expeditionStarted('campaign'); g.expeditionEnded({ outcome: 'campaign_clear', sectorReached: 6 });
  assert.deepEqual(byName(sent, 'expedition_ended').map((e) => e.properties.outcome), ['death', 'quit', 'campaign_clear']);
});

test('52) 결과 재출격은 retry_selected', () => {
  const { sent, g } = setup();
  g.retrySelected('death');
  assert.equal(byName(sent, 'retry_selected')[0].properties.result_type, 'death');
});

test('53) 격납고 entry_point(title·result) 구분', () => {
  const { sent, g } = setup();
  g.hangarViewed('title');
  g.hangarViewed('result');
  assert.deepEqual(byName(sent, 'hangar_viewed').map((e) => e.properties.entry_point), ['title', 'result']);
});

test('54) 두 번째 원정은 run_index_session=2(같은 세션 저장 유지)', () => {
  const ss = memStorage();
  const { sent, g } = setup({ ss });
  g.expeditionStarted('campaign');
  g.expeditionStarted('campaign');
  const started = byName(sent, 'expedition_started');
  assert.equal(started[0].properties.run_index_session, 1);
  assert.equal(started[1].properties.run_index_session, 2);
  // 새 세션(새 sessionStorage)에서는 다시 1
  const fresh = setup({ ss: memStorage() });
  fresh.g.expeditionStarted('campaign');
  assert.equal(byName(fresh.sent, 'expedition_started')[0].properties.run_index_session, 1);
});

test('55) 개발 모드 전체 파이프라인: GA4 전송 0', () => {
  // 코어 + GA4 sink(dev 모드) + 파사드로 한 원정을 재생해도 gtag event가 하나도 안 나간다.
  const consent = createConsent(memStorage()); consent.set('granted');
  const win = { dataLayer: [], gtag: (...a) => (win._calls = win._calls || []).push(a) };
  const adapter = createGa4Adapter({ config: { enabled: true, measurementId: 'G-ABCD1234' }, consent, win, doc: { head: { appendChild() {} }, createElement: () => ({ setAttribute() {} }) }, isDevMode: () => true });
  const analytics = createAnalytics({ schema: SCHEMA, sink: ga4Sink(adapter) });
  const g = createGameAnalytics({ analytics, save: fakeSave(), sessionStorage: memStorage(), now: () => 0 });
  g.titleViewed(); g.expeditionStartSelected('campaign'); g.expeditionStarted('campaign');
  g.sectorStarted(1, 'campaign'); g.combatStarted(1); g.expeditionEnded({ outcome: 'death', sectorReached: 1 });
  const calls = win._calls || [];
  assert.equal(calls.filter((a) => a[0] === 'event').length, 0);
  assert.equal(adapter.isLoaded(), false);   // 스크립트 초기화도 안 됨
});

test('56) run-metrics 기존 계약 불변(분석이 건드리지 않음)', () => {
  const rm = createRunMetrics({ runId: 'r', seed: 1 });
  rm.secondWeapon(10);
  const s = rm.snapshot(100);
  for (const k of ['runId', 'seed', 'durationSec', 'damageByWeapon', 'damageByResonance', 'secondWeaponSec', 'gameOverReason']) {
    assert.ok(k in s, `run-metrics 필드 ${k} 유지`);
  }
  assert.equal(s.secondWeaponSec, 10);
});

test('player_type: 진행 이력이 있으면 returning', () => {
  assert.equal(resolvePlayerType(fakeSave()), 'new');
  assert.equal(resolvePlayerType(fakeSave({ best: 500 })), 'returning');
  assert.equal(resolvePlayerType(fakeSave({ up: { hull: 1 } })), 'returning');
  assert.equal(resolvePlayerType(fakeSave({ firstDefeatUpgrade: 'hull' })), 'returning');
});

test('viewport_group은 emit 시점에 계산된다(모바일)', () => {
  const { sent, g } = setup({ viewport: () => 'mobile' });
  g.titleViewed();
  assert.equal(sent[0].properties.viewport_group, 'mobile');
});

test('progression_milestone_reached는 milestone_type당 원정 내 1회', () => {
  const { sent, g } = setup();
  g.expeditionStarted('campaign');
  g.milestone({ milestoneType: 'second_weapon', sector: 1 });
  g.milestone({ milestoneType: 'second_weapon', sector: 2 });   // 중복 — 무시
  g.milestone({ milestoneType: 'first_resonance', sector: 2 });
  const ms = sent.filter((e) => e.name === 'progression_milestone_reached');
  assert.equal(ms.length, 2);
  assert.deepEqual(ms.map((e) => e.properties.milestone_type), ['second_weapon', 'first_resonance']);
});

test('progression_milestone_reached.elapsed_sec는 원정 시작 기준 기본값을 항상 포함(명시값 우선)', () => {
  const { sent, g, clock } = setup();
  g.expeditionStarted('campaign');   // expStartMs = clock.ms (0)
  clock.ms = 12000;
  g.milestone({ milestoneType: 'second_weapon', sector: 1 });                 // 기본값 = (12000-0)/1000 = 12
  g.milestone({ milestoneType: 'first_resonance', sector: 1, elapsedSec: 3.14 }); // 명시값 우선 → 3.1
  const ms = byName(sent, 'progression_milestone_reached');
  assert.equal(ms[0].properties.elapsed_sec, 12);
  assert.equal(ms[1].properties.elapsed_sec, 3.1);
});

test('expedition_ended.duration_sec는 원정 시작 기준 기본값을 항상 포함(명시값 우선)', () => {
  const a = setup();
  a.g.expeditionStarted('campaign');   // expStartMs = 0
  a.clock.ms = 90000;
  a.g.expeditionEnded({ outcome: 'death', sectorReached: 1 });                // 기본값 = 90
  assert.equal(byName(a.sent, 'expedition_ended')[0].properties.duration_sec, 90);

  const b = setup();
  b.g.expeditionStarted('campaign');
  b.clock.ms = 90000;
  b.g.expeditionEnded({ outcome: 'death', sectorReached: 1, durationSec: 123.45 }); // 명시값 우선 → 123.5
  assert.equal(byName(b.sent, 'expedition_ended')[0].properties.duration_sec, 123.5);
});
