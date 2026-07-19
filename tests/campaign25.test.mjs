import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  regionAt, regionByIndex, regionBossId, regionEndSec,
  buildCampaign25Schedule, eventAction25, expectedPowerMult, pathChoicePair,
} from '../js/campaign25.js';
import { BAL } from '../js/balance.js';

// Gate 2 §7 — 25분 6지역 시간 캠페인 순수 로직 계약.

const G2 = BAL.gate2;

test('balance.gate2가 25분 6지역 시간 구조를 정의한다(§7.1)', () => {
  assert.equal(G2.totalSec, 1500);            // 25분
  assert.equal(G2.regions.length, 6);         // 6개 지역
  // 보스 순서 = 기존 캠페인과 동일(B8·B9·B10·B11·B22·B7).
  assert.deepEqual(G2.regions.map((r) => r.boss), ['B8', 'B9', 'B10', 'B11', 'B22', 'B7']);
  // 지역 진입 시각이 단조 증가하고 intro(60s) 이후.
  const starts = G2.regions.map((r) => r.startSec);
  assert.ok(starts[0] >= G2.introSec);
  for (let i = 1; i < starts.length; i++) assert.ok(starts[i] > starts[i - 1], '지역 시각 단조증가');
  // 지역 보스 등장은 그 지역 안(startSec..다음 지역 start).
  for (const r of G2.regions) {
    assert.ok(r.bossSec > r.startSec && r.bossSec < regionEndSec(G2, r.i), `${r.id} 보스 등장이 지역 안`);
  }
});

test('지역 보스 TTK 목표가 §7.5와 일치(지역30~45·B22 45~60·B7 60~90)', () => {
  const byId = Object.fromEntries(G2.regions.map((r) => [r.boss, r.bossTtk]));
  assert.deepEqual(byId.B22, [45, 60]);
  assert.deepEqual(byId.B7, [60, 90]);
  for (const b of ['B8', 'B9', 'B10', 'B11']) assert.deepEqual(byId[b], [30, 45]);
});

test('regionAt: intro는 null, 각 지역 시각엔 해당 지역, 끝나면 마지막 지역', () => {
  assert.equal(regionAt(G2, 0), null);          // 출격(intro)
  assert.equal(regionAt(G2, 30), null);
  assert.equal(regionAt(G2, 60).i, 1);          // 섹터1 진입
  assert.equal(regionAt(G2, 239).i, 1);
  assert.equal(regionAt(G2, 240).i, 2);         // 섹터2 진입
  assert.equal(regionAt(G2, 1140).i, 5);        // B22 지역
  assert.equal(regionAt(G2, 1499).i, 6);        // 마지막 지역 유지
  assert.equal(regionAt(G2, 9999).i, 6);
});

test('regionBossId / regionByIndex / regionEndSec', () => {
  assert.equal(regionBossId(G2, 1), 'B8');
  assert.equal(regionBossId(G2, 5), 'B22');
  assert.equal(regionBossId(G2, 6), 'B7');
  assert.equal(regionBossId(G2, 99), null);
  assert.equal(regionByIndex(G2, 3).id, 'furnaceLine');
  assert.equal(regionEndSec(G2, 1), 240);       // 섹터1 끝 = 섹터2 시작
  assert.equal(regionEndSec(G2, 6), 1500);      // 마지막 = totalSec
});

test('buildCampaign25Schedule: 6 지역 진입 + 6 보스 + 5 함체승급 + 결과, 시각 정렬', () => {
  const sch = buildCampaign25Schedule(G2);
  assert.equal(sch.filter((e) => e.type === 'regionEnter').length, 6);
  assert.equal(sch.filter((e) => e.type === 'bossStart').length, 6);
  assert.equal(sch.filter((e) => e.type === 'hullTier').length, 5);       // H1~H5
  assert.equal(sch.filter((e) => e.type === 'result').length, 1);
  // 정렬: 시각 비내림차순.
  for (let i = 1; i < sch.length; i++) assert.ok(sch[i].t >= sch[i - 1].t, '스케줄 시각 정렬');
  // result가 마지막이고 25분.
  assert.equal(sch[sch.length - 1].type, 'result');
  assert.equal(sch[sch.length - 1].t, 1500);
  // 지역 보스가 올바른 보스를 태그.
  const b5 = sch.find((e) => e.type === 'bossStart' && e.region === 5);
  assert.equal(b5.boss, 'B22');
});

test('경로 선택이 약 4분(±)마다 최소 5회, 세 번째 슬롯 해금은 12~16분 구간', () => {
  const sch = buildCampaign25Schedule(G2);
  const paths = sch.filter((e) => e.type === 'pathChoice').map((e) => e.t);
  assert.ok(paths.length >= 5, '경로 선택 5회 이상');
  // 인접 경로 선택 간격이 대략 4분(240s) 근처.
  for (let i = 1; i < paths.length; i++) assert.ok(Math.abs(paths[i] - paths[i - 1] - 240) <= 60, '경로 간격 ~4분');
  // fleetSlot(세 번째 슬롯)은 섹터4(720~960) 안.
  assert.ok(G2.fleetSlotSec >= 720 && G2.fleetSlotSec < 960, '함대 슬롯 12~16분');
});

test('행동 변화가 75초 이상 공백 없이 지속(§7.1 지속 성장 체감)', () => {
  const sch = buildCampaign25Schedule(G2);
  const beh = sch.filter((e) => e.type === 'behaviorUpgrade').map((e) => e.t);
  assert.ok(beh.length >= 20, '행동 변화 다수');
  for (let i = 1; i < beh.length; i++) assert.ok(beh[i] - beh[i - 1] <= 75, '행동 변화 공백 75초 이하');
});

test('eventAction25: Gate 2 신규 사건을 실행 행동으로 매핑', () => {
  assert.equal(eventAction25('regionEnter').kind, 'regionEnter');
  assert.equal(eventAction25('bossStart').kind, 'bossStart');
  assert.equal(eventAction25('fleetSlot').kind, 'fleetSlot');
  assert.equal(eventAction25('secondResonance').kind, 'secondResonance');
  assert.equal(eventAction25('apex').kind, 'apex');
  assert.equal(eventAction25('pathChoice').kind, 'pathChoice');
  assert.equal(eventAction25('secondWeapon').kind, 'equipWing');   // 호환
  assert.equal(eventAction25('result').kind, 'result');
  assert.equal(eventAction25('nope'), null);
});

test('expectedPowerMult: 25분 힘 성장이 단조 증가(1분 1배 → 25분 200배, §1.3)', () => {
  assert.equal(expectedPowerMult(G2, 60), 1);
  assert.equal(expectedPowerMult(G2, 1500), 200);
  let prev = 0;
  for (let t = 60; t <= 1500; t += 120) {
    const m = expectedPowerMult(G2, t);
    assert.ok(m >= prev, '힘 성장 단조 비감소');
    prev = m;
  }
});

test('pathChoicePair: index → 2택 반환, 범위 밖 클램프, 각 옵션 ≥2축·상이(§7.4)', () => {
  const n = G2.pathChoiceSec.length;
  for (let i = 0; i < n; i++) {
    const p = pathChoicePair(G2, i);
    assert.ok(p && p.a && p.b, `index ${i} 2택 존재`);
    assert.ok(Object.keys(p.a.mods).length >= 2 && Object.keys(p.b.mods).length >= 2, '각 옵션 ≥2축');
    assert.notDeepEqual(p.a.mods, p.b.mods, '두 옵션 효과 상이(가짜 분기 아님)');
  }
  assert.deepEqual(pathChoicePair(G2, 99), pathChoicePair(G2, n - 1), '범위 밖은 마지막으로 클램프');
  assert.deepEqual(pathChoicePair(G2, -5), pathChoicePair(G2, 0), '음수는 0으로 클램프');
  assert.equal(pathChoicePair({ pathChoices: [] }, 0), null, '빈 목록은 null');
});
