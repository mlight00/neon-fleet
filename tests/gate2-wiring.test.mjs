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
  assert.ok(mainSrc.includes("case 'bossStart': spawnCampaignBoss(ev.region, ev.boss"), '지역 보스 등장');
  assert.ok(mainSrc.includes('r.sector = region.backdrop'), '지역 진입이 배경 섹터 전환');
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
