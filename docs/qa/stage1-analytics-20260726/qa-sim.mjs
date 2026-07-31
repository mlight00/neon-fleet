// Stage 1 분석 QA 시뮬레이션 (작업지시서 §21·§22).
// 실제 분석 모듈(코어·동의·GA4 어댑터·파사드)을 fake window/document/storage로 구동해
// 시나리오 A~G의 네트워크·이벤트 동작을 검증하고 정제된 증거(JSON)를 생성한다.
//   실행: node docs/qa/stage1-analytics-20260726/qa-sim.mjs
//   ⚠️ 실제 브라우저·실제 GA4 속성은 쓰지 않는다. measurementId는 QA용 목(mock) 값이며 네트워크는 캡처만 한다.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createAnalytics } from '../../../js/analytics.js';
import { createConsent } from '../../../js/analytics-consent.js';
import { createGa4Adapter, ga4Sink } from '../../../js/analytics-ga4.js';
import { createGameAnalytics } from '../../../js/analytics-events.js';
import { SCHEMA, shouldOfferConsent } from '../../../js/analytics-config.js';

const OUT = dirname(fileURLToPath(import.meta.url));
const QA_CONFIG = { enabled: true, measurementId: 'G-QASIM0001', schemaVersion: '1', debugQuery: 'analyticsDebug' };

function memStorage(seed) {
  const m = new Map(Object.entries(seed || {}));
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
}
function throwingStorage() { return { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }; }
function makeDom({ gtagThrows = false } = {}) {
  const scripts = [];
  const win = {
    dataLayer: [], _events: [],
    gtag(...a) { if (gtagThrows) throw new Error('gtag blocked'); if (a[0] === 'event') win._events.push({ name: a[1], props: a[2] }); win.dataLayer.push(a); },
  };
  const doc = { scripts, head: { appendChild(el) { scripts.push(el); } }, createElement() { return { setAttribute() {} }; } };
  return { win, doc, scripts };
}

// 공개 캠페인 원정 1회(첫 사망→무료 개조→재출격→2회차) 시퀀스. 실제 main.js 배선과 같은 순서.
function driveExpedition(g, { grantedFirst = false } = {}) {
  g.titleViewed();
  if (grantedFirst) g.consentUpdated();
  g.expeditionStartSelected('campaign');
  g.buildChoice({ choiceType: 'start_weapon', choiceId: 'vulcan', weaponId: 'vulcan', sector: 1 });
  g.expeditionStarted('campaign');
  g.sectorStarted(1, 'campaign');
  g.guideViewed('combo'); g.guideCompleted('combo');
  g.routeSelected({ sector: 1, nodeType: 'combat', nodeCol: 0, selectionMethod: 'auto_root', nodeKey: 'n0' });
  g.combatStarted(1);
  g.combatStarted(1);   // 중복 시도(무시돼야 함)
  g.milestone({ milestoneType: 'second_weapon', sector: 1 });
  g.milestone({ milestoneType: 'first_resonance', sector: 1 });
  g.routeSelected({ sector: 1, nodeType: 'elite', nodeCol: 1, selectionMethod: 'pointer_confirm', nodeKey: 'n1' });   // 마우스 확정(실제 UI 입력 수단)
  g.buildChoice({ choiceType: 'doctrine', choiceId: 'swarm', sector: 1 });
  g.nodeCompleted({ sector: 1, nodeType: 'combat', nodeKey: 'n0' });
  g.expeditionEnded({ outcome: 'death', sectorReached: 1, nodeProgress: 1, primaryWeapon: 'vulcan', doctrineId: 'swarm', keystoneId: 'lance_echo', maxTier: 0, maxCruisers: 0, firstDefeatUpgradeState: 'available' });
  g.expeditionEnded({ outcome: 'death', sectorReached: 1 });   // 결과 재렌더(무시돼야 함)
  g.freeUpgrade('hull');
  g.retrySelected('death');
  g.expeditionStartSelected('campaign');
  g.buildChoice({ choiceType: 'start_weapon', choiceId: 'laser', weaponId: 'laser', sector: 1 });
  g.expeditionStarted('campaign');   // run_index_session=2
}

function runScenario(name, { consent = 'unknown', devMode = false, gtagThrows = false, storageThrows = false, grantedFirst = false } = {}) {
  const { win, doc, scripts } = makeDom({ gtagThrows });
  const consentStore = storageThrows ? throwingStorage() : memStorage(consent !== 'unknown' ? { 'neonFleet.analyticsConsent.v1': consent } : {});
  const consentObj = createConsent(consentStore);
  const adapter = createGa4Adapter({ config: QA_CONFIG, consent: consentObj, win, doc, isDevMode: () => devMode, isDebug: () => false });
  const record = [];
  const sink = (e) => { record.push({ name: e.name, properties: e.properties }); return ga4Sink(adapter)(e); };
  const analytics = createAnalytics({ schema: SCHEMA, sink });
  const g = createGameAnalytics({ analytics, save: { get: () => ({ best: 0, stage: 1, up: {} }) }, sessionStorage: memStorage(), now: (() => { let t = 0; return () => (t += 2500); })() });
  let threw = false;
  try { driveExpedition(g, { grantedFirst }); } catch { threw = true; }
  return { name, consent: consentObj.get(), devMode, record, gtagEvents: win._events, scriptCount: scripts.length, threw };
}

// ─── 시나리오 실행 ───
const results = [];
// A: 설정 비활성 → 동의 UI 없음, 네트워크 0
results.push({ ...runScenario('A_disabled', { consent: 'unknown' }), offersConsent: shouldOfferConsent({ enabled: false, measurementId: 'G-QASIM0001' }) });
// B: 미결정(unknown) → 네트워크 0, 소급 전송 0
results.push({ ...runScenario('B_undecided', { consent: 'unknown' }), offersConsent: shouldOfferConsent(QA_CONFIG) });
// C: 허용 → 스크립트 1, 이벤트 전송
results.push({ ...runScenario('C_granted', { consent: 'granted', grantedFirst: true }), offersConsent: shouldOfferConsent(QA_CONFIG) });
// D: 거부 → 네트워크 0
results.push(runScenario('D_denied', { consent: 'denied' }));
// F: 개발 모드 → 네트워크 0
results.push(runScenario('F_devmode', { consent: 'granted', devMode: true }));
// G: 실패 환경(gtag throw / storage throw) → 예외 없이 게임 정상
results.push(runScenario('G_gtag_throws', { consent: 'granted', gtagThrows: true }));
results.push(runScenario('G_storage_throws', { consent: 'granted', storageThrows: true }));

// E: 철회 — granted 상태에서 이벤트 후 revoke → 이후 전송 0, '재로드'(새 어댑터·denied) → 스크립트 0
function runRevoke() {
  const { win, doc, scripts } = makeDom();
  const store = memStorage({ 'neonFleet.analyticsConsent.v1': 'granted' });
  const consentObj = createConsent(store);
  const adapter = createGa4Adapter({ config: QA_CONFIG, consent: consentObj, win, doc });
  const analytics = createAnalytics({ schema: SCHEMA, sink: ga4Sink(adapter) });
  const g = createGameAnalytics({ analytics, save: { get: () => ({ best: 0, stage: 1, up: {} }) }, sessionStorage: memStorage(), now: () => 0 });
  g.titleViewed(); g.sectorStarted(1, 'campaign');
  const beforeRevoke = win._events.length;
  consentObj.set('denied'); adapter.revoke();
  g.sectorStarted(2, 'campaign'); g.combatStarted(2);
  const afterRevoke = win._events.length - beforeRevoke;
  // 재로드: 새 어댑터가 consent denied를 읽음 → 스크립트 0, 전송 0
  const reload = makeDom();
  const adapter2 = createGa4Adapter({ config: QA_CONFIG, consent: consentObj, win: reload.win, doc: reload.doc });
  const analytics2 = createAnalytics({ schema: SCHEMA, sink: ga4Sink(adapter2) });
  const g2 = createGameAnalytics({ analytics: analytics2, save: { get: () => ({ best: 0, stage: 1, up: {} }) }, sessionStorage: memStorage(), now: () => 0 });
  g2.titleViewed(); g2.sectorStarted(1, 'campaign');
  return { name: 'E_revoke', beforeRevoke, afterRevoke, reloadScriptCount: reload.scripts.length, reloadEvents: reload.win._events.length };
}
const revoke = runRevoke();

// ─── PII 스캔(정제 이벤트 속성에 금지 패턴 없음) ───
const piiPatterns = [/@[a-z0-9.-]+\.[a-z]{2,}/i, /\bcookie\b/i, /client_id/i, /\+?\d[\d\s().-]{8,}\d/, /https?:\/\//i, /user_id/i];
const allProps = results.flatMap((r) => r.record.map((e) => JSON.stringify(e.properties)));
const piiHits = allProps.filter((s) => piiPatterns.some((re) => re.test(s)));

// ─── 정제 이벤트 순서(시나리오 C) ───
const cRecord = results.find((r) => r.name === 'C_granted').record;
writeFileSync(join(OUT, 'event-sequence-sanitized.json'), JSON.stringify({
  note: 'Scenario C(granted) 공개 캠페인 원정 1회 — 파사드가 코어를 통해 정제한 이벤트 순서. 값은 enum·정수·짧은 id뿐(PII 없음).',
  count: cRecord.length,
  events: cRecord,
}, null, 2) + '\n');

// ─── 네트워크 요약(정제) ───
const networkSummary = results.map((r) => {
  const domains = [];
  if (r.scriptCount > 0) domains.push('www.googletagmanager.com');
  if (r.gtagEvents.length > 0) domains.push('www.google-analytics.com');   // gtag('event')의 실제 collect 대상
  const names = r.record.map((e) => e.name);
  const propertyKeys = [...new Set(r.record.flatMap((e) => Object.keys(e.properties)))].sort();
  const dupCheck = ['combat_started', 'expedition_ended'].map((n) => ({ event: n, count: names.filter((x) => x === n).length }));
  return {
    scenario: r.name, consent: r.consent, devMode: r.devMode,
    requestDomains: domains, scriptInsertions: r.scriptCount, gtagEventsSent: r.gtagEvents.length,
    facadeEvents: r.record.length, eventNames: names, propertyKeys,
    responseStatus: r.scriptCount > 0 ? 'ok (mock)' : 'none', threwException: r.threw,
    dedupCheck: dupCheck, duplicates: dupCheck.some((d) => d.count > 1),
  };
});
networkSummary.push({ scenario: revoke.name, ...revoke });
writeFileSync(join(OUT, 'network-summary-sanitized.json'), JSON.stringify({
  note: 'HAR 원본 미저장(GA client id·쿠키 유출 방지). 시나리오·요청 도메인·이벤트명·속성 키·응답 상태·중복 여부만.',
  piiScan: { patternsChecked: piiPatterns.length, hits: piiHits.length },
  scenarios: networkSummary,
}, null, 2) + '\n');

// ─── 콘솔 자기검증 요약 ───
const A = results.find((r) => r.name === 'A_disabled');
const B = results.find((r) => r.name === 'B_undecided');
const C = results.find((r) => r.name === 'C_granted');
const D = results.find((r) => r.name === 'D_denied');
const F = results.find((r) => r.name === 'F_devmode');
const Gg = results.find((r) => r.name === 'G_gtag_throws');
const Gs = results.find((r) => r.name === 'G_storage_throws');
const cName = C.record.map((e) => e.name);
const checks = [
  ['A: 설정 비활성 → 동의 UI 제안 안 함', A.offersConsent === false],
  ['B: 미결정 → 스크립트 0·gtag 이벤트 0', B.scriptCount === 0 && B.gtagEvents.length === 0],
  ['B: 동의 UI 제안함(유효 ID)', B.offersConsent === true],
  ['C: 스크립트 정확히 1', C.scriptCount === 1],
  ['C: 파사드 이벤트 = 실제 전송(모두 sent)', C.record.length === C.gtagEvents.length],
  ['C: combat_started 1회', cName.filter((n) => n === 'combat_started').length === 1],
  ['C: expedition_ended 1회(재렌더 무시)', cName.filter((n) => n === 'expedition_ended').length === 1],
  ['C: 2회차 run_index_session=2', C.record.filter((e) => e.name === 'expedition_started').at(-1).properties.run_index_session === 2],
  ['C: route auto_root + pointer_confirm 둘 다', C.record.some((e) => e.name === 'route_selected' && e.properties.selection_method === 'auto_root') && C.record.some((e) => e.name === 'route_selected' && e.properties.selection_method === 'pointer_confirm')],
  ['C: milestone에 elapsed_sec 포함', C.record.some((e) => e.name === 'progression_milestone_reached' && typeof e.properties.elapsed_sec === 'number')],
  ['C: expedition_ended에 duration_sec 포함', C.record.some((e) => e.name === 'expedition_ended' && typeof e.properties.duration_sec === 'number')],
  ['C: analytics_consent_updated 먼저', cName.indexOf('analytics_consent_updated') >= 0 && cName.indexOf('analytics_consent_updated') < cName.indexOf('expedition_start_selected')],
  ['D: 거부 → 네트워크 0', D.scriptCount === 0 && D.gtagEvents.length === 0],
  ['E: 철회 후 이벤트 전송 0', revoke.afterRevoke === 0],
  ['E: 재로드 후 스크립트 0·전송 0', revoke.reloadScriptCount === 0 && revoke.reloadEvents === 0],
  ['F: 개발 모드 → 스크립트 0·전송 0', F.scriptCount === 0 && F.gtagEvents.length === 0],
  ['G: gtag throw → 예외 전파 없음', Gg.threw === false],
  ['G: storage throw → 예외 전파 없음', Gs.threw === false],
  ['PII 스캔 히트 0', piiHits.length === 0],
];
let pass = true;
for (const [label, ok] of checks) { if (!ok) pass = false; console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`); }
console.log(`\n=== QA SIM ${pass ? 'ALL PASS' : 'FAILURES PRESENT'} — ${checks.filter((c) => c[1]).length}/${checks.length} ===`);
console.log(`artifacts: event-sequence-sanitized.json, network-summary-sanitized.json`);
process.exitCode = pass ? 0 : 1;
