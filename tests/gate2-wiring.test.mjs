import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Gate 2 §7 §6.4 — 순수 유닛으로 못 잡는 25분 캠페인 배선을 소스 정적 검증으로 고정.

const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const dirSrc = readFileSync(new URL('../js/run-director.js', import.meta.url), 'utf8');

test('G2-01: 25분 캠페인 모드가 startPlay·update·개발훅에 배선', () => {
  assert.ok(mainSrc.includes("_clParams.has('campaign25')"), '?campaign25=1 진입 플래그');
  assert.ok(mainSrc.includes('if (CAMPAIGN25)') && mainSrc.includes('startCampaign25('), 'startPlay가 25분 캠페인 진입');
  assert.ok(mainSrc.includes('if (r.campaign25) campaign25Update(dt)'), 'update 루프가 campaign25 진행');
  assert.ok(mainSrc.includes('window.__nfCampaign25'), '헤드리스 개발/측정 훅');
});

test('G2-02: 25분 디렉터가 campaign25 스케줄로 구동(8분 스케줄 아님)', () => {
  assert.ok(mainSrc.includes('createRunDirector(G2, buildCampaign25Schedule(G2))'), '25분 스케줄 디렉터');
  // 디렉터가 사건 부가 필드(region·boss·tier)를 이벤트로 전달해야 지역/보스 사건이 유효.
  assert.ok(dirSrc.includes('...ev, t: dir.t'), 'tickDirector가 부가 필드 전달');
});

test('G2-03: 지역 진입·지역 보스가 사건에서 배선(regionEnter/bossStart)', () => {
  assert.ok(mainSrc.includes("case 'regionEnter': enterCampaignRegion(ev.region"), '지역 진입 → 배경 전환');
  assert.ok(mainSrc.includes("case 'bossStart':") && mainSrc.includes('spawnCampaignBoss(ev.region, ev.boss'), '지역 보스 등장');
  assert.ok(mainSrc.includes('r.sector = region.backdrop'), '지역 진입이 배경 섹터 전환');
});

test('G2-07: 미완 런타임 경로 보강(Codex G2-A 리뷰 반영)', () => {
  // P1: 보스 교전 중 다음 보스 사건은 버리지 않고 FIFO 큐잉 → 처치 후 순서대로 등장(겹침 다수여도 누락 없음).
  assert.ok(mainSrc.includes('cl.bossQueue.push({ region: ev.region, boss: ev.boss })'), 'P1: 보스 사건 FIFO 큐잉');
  assert.ok(mainSrc.includes('cl.bossQueue.shift()') && mainSrc.includes('cl.bossQueue.length'), 'P1: 처치 후 큐의 다음 보스 등장');
  // P2: play 결과는 로컬 showCoreLoopResult로(ui 직접 3인자 호출 금지 → 크래시 방지).
  assert.ok(mainSrc.includes('showCoreLoopResult(snap, r.squad, cl)') && !mainSrc.includes('ui.showCoreLoopResult(snap, r.squad'), 'P2: 결과 UI 올바른 호출');
  // P2: 내구도 소진이 25분 결과로 종료(coreLoop처럼 특수처리).
  assert.ok(mainSrc.includes("if (r.campaign25) { finishCampaign25('hull'); return; }"), 'P2: hull 사망 → 캠페인 결과');
  assert.ok(mainSrc.includes("w.onHullDepleted = () => finishCampaign25('hull')"), 'P2: hull 콜백이 결과 종료');
  // P2: intro 첫 1분 무사격(refill을 introSec 이후로 게이트).
  assert.ok(mainSrc.includes('t >= cl.cfg.introSec && r.phase'), 'P2: intro 후에만 스트림 스폰');
  // P2: 측정도 H0 시작(H1~H5 승급 정합).
  assert.ok(/sq\.tier = 0;[\s\S]{0,120}measureHullMax/.test(mainSrc), 'P2: H0 시작(측정 포함)');
  // P2: 캠페인도 내구도 HUD 렌더(coreLoop || campaign25).
  assert.ok(mainSrc.includes('const cl = r.coreLoop || r.campaign25'), 'P2: 캠페인 내구도 HUD');
});

test('G2-08: play 경로·측정 정확도 보강(Codex G2-A 3차 반영)', () => {
  // P2: 스트림 재보충이 캠페인 상태를 읽어야 play가 측정밀도 대신 play 램프를 받는다.
  assert.ok(mainSrc.includes('cl = r.coreLoop || r.campaign25, base'), 'P2: refill이 캠페인 인식');
  // P2: 마일스톤 기록(secondWeapon·firstResonance·framePick) — 측정 스냅샷 정확도.
  assert.ok(mainSrc.includes('cl.metrics.secondWeapon(t)'), 'P2: 두 번째 무기 마일스톤');
  assert.ok(mainSrc.includes('cl.metrics.firstResonance(t)'), 'P2: 첫 공명 마일스톤');
  assert.ok(mainSrc.includes('cl.metrics.framePick(t)'), 'P2: 프레임 마일스톤');
  // P2: play 결과 재시작이 캠페인으로(Gate 1로 벗어나지 않음).
  assert.ok(mainSrc.includes('startCampaign25({ mode, buildId: cl.buildId })') && mainSrc.includes('showCoreLoopResult(snap, sq, cl, restartFn'), 'P2: 캠페인 재시작 콜백');
});

test('G2-04: 지역 보스도 Gate 1의 검증된 양측 클램프를 지역 TTK 목표로 재사용', () => {
  assert.ok(mainSrc.includes('installBossTtkClamp(boss, avgDps, region.bossTtk)'), '지역 TTK 목표로 클램프 설치');
  assert.ok(mainSrc.includes('function installBossTtkClamp') && mainSrc.includes('function updateBossClamp'), '공용 클램프 헬퍼');
  // 보스 등장 시 잔여 정리 + 표적 해제(Codex P2 재적용).
  assert.ok(/spawnCampaignBoss[\s\S]{0,400}resonEnemyRemoved\(w\.reson, e\)/.test(mainSrc), '보스 등장 정리 시 표적 해제');
});

test('G2-05: 지역 보스 처치 → TTK 확정 후 다음 지역으로 스트림 재개, B7 처치=완결', () => {
  assert.ok(mainSrc.includes('cl.bossActive = false') && mainSrc.includes('refillCoreLoopTrack()'), '보스 처치 후 전투 스트림 재개');
  assert.ok(mainSrc.includes("res.boss === 'B7'") && mainSrc.includes("finishCampaign25('clear')"), 'B7 처치 = 25분 완결점');
  assert.ok(mainSrc.includes('res.ttk = Math.round((t - cl.bossSpawnT)'), '지역 보스 TTK 확정 기록');
});

test('G2-06: 함체 승급·두번째 무기·공명·프레임이 25분 사건에 배선', () => {
  assert.ok(mainSrc.includes("case 'hullTier': campaignHullTier"), '함체 승급');
  assert.ok(mainSrc.includes("case 'equipWing': equipCampaignWing"), '두 번째 무기');
  assert.ok(mainSrc.includes("case 'resonanceReady': activateCampaignResonance"), '공명 회로 활성');
  assert.ok(mainSrc.includes("case 'framePick': pickCampaignFrame"), '지휘 프레임');
});
