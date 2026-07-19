import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAL } from '../js/balance.js';

// Gate 2 §7 §6.4 — 순수 유닛으로 못 잡는 25분 캠페인 배선을 소스 정적 검증으로 고정.

const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const dirSrc = readFileSync(new URL('../js/run-director.js', import.meta.url), 'utf8');
const entSrc = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
const uiSrc = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const rd = readFileSync(new URL('../js/render.js', import.meta.url), 'utf8');
const rmSrc = readFileSync(new URL('../js/run-metrics.js', import.meta.url), 'utf8');

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
  assert.ok(mainSrc.includes('startCampaign25({ mode, buildId:') && mainSrc.includes('showCoreLoopResult(snap, sq, cl, restartFn'), 'P2: 캠페인 재시작 콜백');
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

test('G2-09: 함체 T0~T5 등급별 기능 변화(§7.3, G2-B)', () => {
  // balance.gate2.hullFn: 6등급 × {move·resonPower·sideGuns·apex}, T5만 apex.
  assert.equal(BAL.gate2.hullFn.length, 6);
  assert.equal(BAL.gate2.hullFn[5].apex, true);
  assert.equal(BAL.gate2.hullFn[0].apex, false);
  assert.ok(BAL.gate2.hullFn[1].move > BAL.gate2.hullFn[0].move, 'T1 이동 반응 강화');
  assert.ok(BAL.gate2.hullFn[2].resonPower > 1, 'T2 공명 증폭');
  assert.ok(BAL.gate2.hullFn[4].sideGuns >= 2, 'T4 측면 포대');
  // 승급마다 등급 기능 적용 + 시작 시 T0 적용.
  assert.ok(mainSrc.includes('applyCampaignHullFn(sq, cl)') && mainSrc.includes('applyCampaignHullFn(sq, r.campaign25)'), '승급·시작에 기능 적용');
  assert.ok(mainSrc.includes('sq.moveResponseMult = fn.move') && mainSrc.includes('sq.resonPowerMult = fn.resonPower') && mainSrc.includes('sq.sideGuns = fn.sideGuns'), '이동·공명·측면포대 플래그');
  // 실제 전투 반영: 이동(팔로우), 공명(spawnResonance), 측면포대·Apex(틱).
  assert.ok(entSrc.includes('(this.moveResponseMult || 1)'), '이동 반응이 팔로우 속도에 반영');
  assert.ok(mainSrc.includes('(sq.resonPowerMult || 1)'), '공명 증폭이 공명 피해에 반영');
  assert.ok(mainSrc.includes('campaignHullFnTick(dt)') && mainSrc.includes('function triggerApex'), '측면 포대 발사 + Apex 발동');
  // Apex는 T5 해금 시 + 사건에서 발동.
  assert.ok(mainSrc.includes("case 'apex': cl.apexUnlocked = true"), 'Apex 사건 배선');
});

test('G2-10: G2-B 견고화(Codex 2·3차 반영) — 등급동기·Apex 정합·소스 분리', () => {
  // 2차 P2: 함체 기능을 매 프레임 현재 sq.tier에서 재적용 → 진화/강등 유기적 변화와 동기.
  assert.ok(/campaignHullFnTick\(dt\)\s*\{[\s\S]{0,160}applyCampaignHullFn\(sq, cl\)/.test(mainSrc), '2차: 매 프레임 등급 기능 재동기');
  // 2차 P2: Apex 처치 적은 즉시 제거(사망 후 접촉·발사 방지).
  assert.ok(/function triggerApex[\s\S]{0,800}w\.entities\.splice\(i, 1\)/.test(mainSrc), '2차: Apex 처치 즉시 제거');
  // 2차 P2: 측면 포대는 별도 소스(공명 충전·벌컨 통계 오염 방지).
  assert.ok(mainSrc.includes("b.sourceWeaponId = 'sideGun'"), '2차: 측면 포대 별도 소스');
  // 2차 P2 + 3차 P2: Apex 피해를 metrics에 기록(보스 펄스 + 잡몹 소거 둘 다).
  assert.ok(mainSrc.includes("weaponDamage('apex', Math.max(0, before))"), '3차: 잡몹 소거 실효 HP 기록');
  assert.ok(mainSrc.includes("weaponDamage('apex', Math.max(0, before - bo.hp))"), '2차: 보스 펄스 실효 피해 기록');
  // 3차 P2: Apex는 보호막 변이를 무시하고 확정 소거.
  assert.ok(/function triggerApex[\s\S]{0,500}e\.shieldCharges = 0/.test(mainSrc), '3차: Apex 보호막 변이 무시');
  // 3차 P2: 새 피해 소스(sideGun·apex)도 결과 화면에 행 렌더 → 비율 100% 정합.
  assert.ok(uiSrc.includes('dmgW.sideGun ? bar(') && uiSrc.includes('dmgW.apex ? bar('), '3차: 결과 화면 sideGun·apex 행');
  // 4차 P2: Apex 발동은 사건 해금 + 현재 T5 적격 이중 게이트(강등되면 멈춤 — hullFn이 Apex=T5 전용).
  assert.ok(mainSrc.includes('cl.apexUnlocked && apexEligible') && /apexEligible = G2\.hullFn\[[\s\S]{0,60}\]\?\.apex/.test(mainSrc), '4차: Apex 이중 게이트(해금+T5 적격)');
});

test('G2-11: 세 번째 슬롯 fleet 시스템(§7.2, G2-C)', () => {
  // balance.gate2.fleet: 함대 시스템 설정(전투기 편대).
  const F = BAL.gate2.fleet;
  assert.ok(F && F.systemId === 'fighters', 'fleet 시스템 설정 존재');
  assert.ok(F.count >= 1 && F.dmgFrac > 0 && F.fireInterval > 0 && F.range > 0, 'fleet 수치 유효');
  assert.equal(F.formation.length >= F.count, true, '편대 대형 오프셋 count 이상');
  // fleetSlot/fleetTelegraph 사건이 실배선(default 로그 아님).
  assert.ok(mainSrc.includes("case 'fleetSlot': equipCampaignFleet(t)"), 'fleetSlot → 슬롯 해금');
  assert.ok(mainSrc.includes("case 'fleetTelegraph':") && mainSrc.includes('cl.fleetTelegraph = true'), 'fleetTelegraph → 예고');
  // 전투기 편대 실동작: 장착·틱·자율조준·렌더.
  assert.ok(mainSrc.includes('function equipCampaignFleet') && mainSrc.includes('cl.metrics.fleetSlot(t)'), '슬롯 해금 + 마일스톤');
  assert.ok(mainSrc.includes('function fleetTick') && mainSrc.includes('fleetTick(dt)'), '전투기 틱 정의·호출');
  assert.ok(mainSrc.includes('function nearestEnemyForFleet'), '자율 조준 표적 탐색');
  assert.ok(mainSrc.includes("b.sourceWeaponId = 'fleet'"), "볼트 별도 소스 'fleet'(공명 미충전·통계 구분)");
  assert.ok(mainSrc.includes('function drawCampaignFleet') && mainSrc.includes('if (r.campaign25) drawCampaignFleet(ctx)'), '전투기 렌더 정의·호출');
  // 세 슬롯 화면 구분(HUD) + 결과 통계 구분.
  assert.ok(rd.includes('d.fleetActive') && rd.includes('함대'), 'HUD 세 번째 슬롯 렌더');
  assert.ok(uiSrc.includes('dmgW.fleet ? bar('), '결과 화면 함대 피해 행');
  // run-metrics 슬롯 마일스톤.
  assert.ok(rmSrc.includes('fleetSlot(t)') && rmSrc.includes('fleetSlotSec'), 'fleet 슬롯 마일스톤 필드');
  // Codex G2-C P2: 전투기 표적은 위쪽만(하향 볼트가 화면 하단으로 안 지워져 무한 잔류하는 것 방지).
  assert.ok(/function nearestEnemyForFleet[\s\S]{0,500}e\.y >= y/.test(mainSrc), 'P2: 전투기 표적 위쪽 한정');
  // Codex G2-C P3: 함대 HUD 행은 캠페인(Gate 2) 전용 게이트 — Gate 1 공유 HUD엔 미표시.
  assert.ok(mainSrc.includes('fleetSupported: !!r.campaign25') && rd.includes('if (d.fleetSupported)'), 'P3: 함대 HUD 캠페인 게이트');
});

test('G2-12: ~4분마다 경로 선택(§7.4, G2-D)', () => {
  // balance.gate2.pathChoices: 스케줄 횟수만큼 2택, 각 옵션 ≥2축(mods), a≠b(가짜 분기 금지).
  const pcs = BAL.gate2.pathChoices;
  assert.equal(pcs.length, BAL.gate2.pathChoiceSec.length, '경로 선택 데이터 = 스케줄 횟수');
  for (const p of pcs) {
    assert.ok(Object.keys(p.a.mods).length >= 2 && Object.keys(p.b.mods).length >= 2, '각 옵션 ≥2축 변경');
    assert.notEqual(p.a.id, p.b.id, '두 옵션 식별자 구분');
    assert.notDeepEqual(p.a.mods, p.b.mods, '두 옵션 실효과 상이(가짜 분기 아님)');
  }
  // pathChoice 사건 실배선(default 로그 아님) + play/measure 분기 + 효과 적용.
  assert.ok(mainSrc.includes("case 'pathChoice': presentPathChoice(ev.choice, t)"), 'pathChoice → 경로 선택 배선');
  assert.ok(mainSrc.includes('function presentPathChoice') && mainSrc.includes('function applyPathChoice'), '경로 선택 제시·적용 함수');
  assert.ok(/function presentPathChoice[\s\S]{0,400}cl\.auto/.test(mainSrc) && mainSrc.includes('ui.showCoreLoopPick'), 'measure=자동선택 / play=카드 정지');
  // 밀도 배수(위험/보상 축)가 실제 스폰 임계에 반영.
  assert.ok(mainSrc.includes('cl.pathMods') && mainSrc.includes('densityCap'), '경로 밀도 배수 → refill 임계 반영');
  // Codex G2-D 1차 P2: 보호막은 surv.shield(투사체 흡수) 경로로, 공명 가속은 빌드 트리거별, 수리는 metrics 기록.
  assert.ok(mainSrc.includes('if (m.shield) addShield(sq.surv, 1)'), '1차 P2: 경로 보호막 = 단일 surv.shield(투사체 흡수)');
  assert.ok(mainSrc.includes('function applyResonBoost') && mainSrc.includes("def.trigger === 'mark'") && mainSrc.includes('resonLaserMark(sq.reson'), '1차 P2: 공명 가속 빌드 트리거별(mark=시커 표식)');
  assert.ok(/m\.hullHeal[\s\S]{0,220}cl\.metrics\.hullRepair\(\)/.test(mainSrc), '1차 P2: 경로 수리 metrics 기록');
  // Codex G2-D 2차 P2: 보호막 이중부여 없음, 상한 무효 mod 폴백(2축 보존), mark 표적=기함 최근접(거리).
  assert.ok(!/if \(m\.shield\)[^\n]*sq\.shield = true/.test(mainSrc), '2차 P2: 보호막 이중 부여 없음(surv 단일)');
  assert.ok(mainSrc.includes("pool.push('shield')") && mainSrc.includes("pool.push('drone')") && typeof BAL.gate2.pathFallbackDrones === 'number', '2·4차 P2: 상한 무효 mod 폴백 = 옵션에 없는 축(중복 붕괴 방지)');
  assert.ok(/def\.trigger === 'mark'[\s\S]{0,240}e\.x - sq\.x/.test(mainSrc), '2차 P2: mark 표적 = 기함 최근접(거리)');
  // Codex G2-D 3차 P2: mark 표적 탐색에 살아있는 보스 포함(보스전 중 잡몹 없음).
  assert.ok(/function applyResonBoost[\s\S]{0,1100}w\.bosses/.test(mainSrc), '3차 P2: mark 표적에 보스 포함');
  // Codex G2-D 5차 P2: 경로 보호막(surv.shield)이 함선 링·HUD ⛨에 시각 표시(소비는 단일 소스 유지).
  assert.ok(entSrc.includes('this.surv && this.surv.shield > 0'), '5차 P2: 함선 보호막 링이 surv.shield 반영');
  assert.ok(mainSrc.includes('r.squad.surv && r.squad.surv.shield > 0'), '5차 P2: HUD ⛨가 surv.shield 반영');
});

test('G2-13: 지역별 적 구성(§7.5, G2-E)', () => {
  const rt = BAL.gate2.regionThreat;
  assert.equal(rt.length, BAL.gate2.regions.length, '지역 위협 = 지역 수(6)');
  // pending 스폰 디스패치가 처리하는 타입만 사용(존재하지 않는 적 스폰 금지).
  const SPAWNABLE = new Set(['creature', 'splitter', 'weaver', 'sniper', 'turret', 'charger', 'mine', 'bomber', 'zapper', 'orbiter', 'shielder', 'carrier', 'blinker']);
  for (const r of rt) {
    assert.ok(Array.isArray(r.pool) && r.pool.length >= 1, '지역 pool 비어있지 않음');
    assert.ok(r.pool.every((tp) => SPAWNABLE.has(tp)), `pool 전부 스폰 가능(${r.pool})`);
    assert.ok(SPAWNABLE.has(r.elite), `elite 스폰 가능(${r.elite})`);
    assert.ok(typeof r.label === 'string' && r.label.length > 0, '위협 테마 라벨');
  }
  // 지역마다 조합이 서로 다르다 — HP 벽 아닌 역할 시험(단조 금지).
  assert.ok(new Set(rt.map((r) => r.pool.join(','))).size >= 4, '지역 조합이 충분히 다양(가짜 단조 금지)');
  // 캠페인 refill이 지역 조합을 쓰되 Gate 1은 불변(측정=weaver 고정).
  assert.ok(mainSrc.includes('BAL.gate2.regionThreat[reg.i - 1]'), '캠페인 refill이 지역 조합 사용');
  assert.ok(mainSrc.includes("dense ? (isCampaign ? pool[idx % pool.length] : 'weaver')"), 'Gate1 측정 weaver 고정 보존');
  // 지역 진입이 위협 테마를 안내(무엇을 시험하는지 한 줄).
  assert.ok(mainSrc.includes('cl.regionThreatLabel = rt.label'), '지역 진입 위협 테마 표시');
  // Codex G2-E P2: 지역 정예 웨이브가 캠페인에서 실제로 호출되고(eliteType 도달), 정예 변이를 강제.
  assert.ok(typeof BAL.gate2.eliteWaveSec === 'number', '정예 웨이브 주기 설정');
  assert.ok(/cl\._eliteWaveT[\s\S]{0,220}refillCoreLoopTrack\(true\)/.test(mainSrc), 'P2: 캠페인 주기적 정예 웨이브(refill true 도달)');
  assert.ok(mainSrc.includes('elite: elite && isCampaign') && mainSrc.includes("applyAffixes(e, ['elite'])"), 'P2: 캠페인 정예는 정예 변이 강제');
  // Codex G2-E 2·3차 P2: 정예 타입은 스케일을 1회만 렌더하는 타입(creature/turret)만 — 히트박스/스프라이트 정합.
  //  charger는 이중 스케일(3차), sniper 등은 스케일 무시(2차)라 제외.
  const ELITE_OK = new Set(['creature', 'turret']);
  for (const r of rt) assert.ok(ELITE_OK.has(r.elite), `2·3차 P2: 정예 타입 스케일 정합(${r.elite})`);
  assert.ok(mainSrc.includes("new Set(['creature', 'turret'])") && mainSrc.includes('ELITE_KINDS.has(kind)'), '2·3차 P2: 정예 강제는 지원 타입만(방어 가드)');
});

test('G2-14: 25분 완주 통합 검증 + 전용 결과 패널(G2-F)', () => {
  // integrationCheck가 전체 Gate 2 파이프라인(B 함체T5·C 함대·D 경로·E 정예)을 25분 안에 확인.
  assert.ok(mainSrc.includes('§7.3 함체 T5 도달') && mainSrc.includes('§7.2 세 번째 슬롯 해금 + 함대 실피해'), '통합 검증: 함체 T5·함대 실동작');
  assert.ok(mainSrc.includes('§7.4 경로 선택 5회 적용') && mainSrc.includes('§7.5 정예 웨이브 발동'), '통합 검증: 경로·정예 실동작');
  // 스냅샷에 Gate 2 요약 필드 부착(결과·통합 검증용).
  assert.ok(mainSrc.includes('snap.pathChoicesMade') && mainSrc.includes('snap.eliteWavesFired') && mainSrc.includes('snap.fleetActive') && mainSrc.includes('snap.finalTier'), '스냅샷 Gate 2 요약 필드');
  assert.ok(mainSrc.includes('cl.eliteWavesFired += 1'), '정예 웨이브 카운터 증가');
  // 25분 전용 결과 패널(6지역 TTK + Gate 2 시스템 요약).
  assert.ok(mainSrc.includes('showCampaign25Result(snap, r.squad, cl') && mainSrc.includes('function showCampaign25Result'), '캠페인 전용 결과 패널 연결');
  assert.ok(uiSrc.includes('showCampaign25Result(') && uiSrc.includes('지역 보스 TTK'), 'ui 결과 패널: 6지역 보스 TTK 표');
});

test('G2-15: Codex 홀리스틱 4건 — 등급 스케줄 격리·play 행동·미배선 사건·HUD 타이머', () => {
  // #1 함체 등급은 디렉터 스케줄만(캠페인 유기 기함 진화 비활성 + 스케줄 tier '설정').
  assert.ok(entSrc.includes('!world.noFlagshipEvolve'), '#1: 캠페인 유기 기함 진화 비활성 가드');
  assert.ok(mainSrc.includes('w.noFlagshipEvolve = true'), '#1: 캠페인 시작 시 유기 진화 비활성');
  assert.ok(/function campaignHullTier[\s\S]{0,240}sq\.tier = Math\.min\(BAL\.evolution\.names\.length - 1, tier\)/.test(mainSrc), '#1: 스케줄 tier 설정(증가 아님)');
  // #2 play 모드도 행동 변화(무기 성장) 적용 — cl.auto 게이트 제거.
  assert.ok(/function campaignBehavior[\s\S]{0,420}if \(!cl\.pickWeapons\) \{ steps\[0\]\.apply\(\)/.test(mainSrc), '#2: 측정/자동은 무기 강화 자동 적용');
  assert.ok(mainSrc.includes('BAL.gate2.behaviorOverflowPower'), '#2: 스텝 소진 후 후반 성장(overflow)');
  // #3 두 번째 공명·최종 무기 진화 사건 실배선(deferred 아님) + 공명 증폭 실반영.
  assert.ok(mainSrc.includes("case 'secondResonance':") && mainSrc.includes('cl.resonBonus'), '#3: 두 번째 공명 배선');
  assert.ok(mainSrc.includes("case 'finalWeaponEvo': campaignFinalWeaponEvo") && mainSrc.includes('function campaignFinalWeaponEvo'), '#3: 최종 무기 진화 배선');
  assert.ok(mainSrc.includes('(run.campaign25?.resonBonus || 1)'), '#3: 공명 증폭이 실피해에 반영');
  // #4 HUD 타이머가 총 시간을 인자로(/8:00 하드코딩 제거).
  assert.ok(rd.includes('d.totalSec') && !rd.includes('/ 8:00'), '#4: HUD 타이머 총 시간 인자화');
  assert.ok(mainSrc.includes('totalSec: r.campaign25 ? BAL.gate2.totalSec : 480'), '#4: 캠페인=25:00 전달');
});

test('G2-16: Codex 홀리스틱 2차 — 지역별 난이도·후반 성장·새 조합 버튼', () => {
  // P1: 지역 진입 시 진행도·스테이지 모드 재계산 → 지역마다 난이도 상승(전 지역이 1지역 난이도로 고정되지 않게).
  assert.ok(/function enterCampaignRegion[\s\S]{0,500}progressionFor\(region\.i, 0, BAL\.sector\.depth\)/.test(mainSrc), 'P1: 지역 진입 시 진행도 재계산');
  assert.ok(/function enterCampaignRegion[\s\S]{0,560}r\.mods = mods; r\.world\.stageMods = mods/.test(mainSrc), 'P1: 지역 진입 시 스테이지 모드 갱신');
  // P2: 새 조합 버튼이 다른 빌드로 회전(같은 조합 재시작과 구분).
  assert.ok(mainSrc.includes("restartFn('play', 'new')") && mainSrc.includes("startCampaign25({ mode: 'play', pick: true })") && /startCampaign25\(\{ mode, buildId: cl\.buildId,[\s\S]{0,120}pick: false \}\)/.test(mainSrc), 'P2: 새 조합=무기 재선택 / 같은 조합=같은 빌드(선택 슬롯) 자동');
});

test('G2-17: showCoreLoopPick 키보드 확정이 카드 인덱스로(Codex 홀리스틱 3차)', () => {
  // attachKeyNav은 '버튼 요소'를 넘김 → data-idx로 인덱스 복원(과거엔 options[요소]=undefined 예외 → 캠페인 영구 정지).
  assert.ok(uiSrc.includes('const idx = +b.dataset.idx; onPick(options[idx].id, idx)') && uiSrc.includes('attachKeyNav(btns, pickBtn)'), '키보드 확정이 data-idx로 인덱스 복원');
});

test('G2-18: 캠페인 play 완전 무기 선택제(이사 요청, G2-G)', () => {
  // 무기 2개 조합 → 빌드(공명·프레임) 파생 헬퍼.
  assert.ok(mainSrc.includes('function buildForPair'), '조합→빌드 파생 헬퍼');
  // 선택창 헬퍼: 측정=자동(autoId), play=정지+카드.
  assert.ok(mainSrc.includes('function campaignPick') && /function campaignPick[\s\S]{0,260}cl\.auto[\s\S]{0,120}onPick\(autoId/.test(mainSrc), '선택창: 측정 자동 / play 카드');
  // 시작 무기·보조 무기·강화 선택 실배선.
  assert.ok(mainSrc.includes('function campaignStartWeaponPick') && mainSrc.includes('r.campaign25.pickWeapons) campaignStartWeaponPick()'), '출격 시 시작 무기 선택');
  assert.ok(mainSrc.includes("campaignPick({ title: '보조 무기 선택'") && mainSrc.includes('cl.pickedWing = id; deriveCampaignBuild()'), '보조 무기 선택(조합 파생)');
  assert.ok(mainSrc.includes("campaignPick({ title: '무기 강화 선택'"), '무기 강화 선택 카드');
  // pickWeapons 플래그: play+pick만(측정은 자동), fresh play·재시작 배선.
  assert.ok(mainSrc.includes('pickWeapons: !auto && !!opts.pick'), 'pickWeapons=play+pick');
  assert.ok(mainSrc.includes('pick: play }'), 'fresh play는 무기 선택');
  // Codex G2-G: 선택 조합 파생·보존. #2 시작무기 즉시 반영, #3 메트릭 재라벨, #1 재시작 슬롯 보존.
  assert.ok(mainSrc.includes('function deriveCampaignBuild'), '조합→빌드·라벨·메트릭 파생 헬퍼');
  assert.ok(mainSrc.includes('cl.pickedMain = id; deriveCampaignBuild()'), '#2: 시작 무기 즉시 빌드 반영');
  assert.ok(rmSrc.includes('relabel(id)') && mainSrc.includes('cl.metrics.relabel('), '#3: 메트릭 runId 재라벨');
  assert.ok(mainSrc.includes('startWeapon: cl.pickedMain, wing: cl.pickedWing, pick: false'), '#1: 재시작 선택 슬롯 순서 보존(완성 조합)');
  assert.ok(mainSrc.includes("build: { ...build, main: startMain, wing: startWing }"), '#1: cl.build이 실제 슬롯 반영');
  // Codex G2-G 2차: 보조 미선택(조기 사망) wing null 유지 / 미완성 조합 재시작=재선택 / 선택창 재개 무적.
  assert.ok(mainSrc.includes('cl.build = { ...base, main, wing, label:') && mainSrc.includes('const base = buildForPair(main, wing);'), '2차: 보조 선택 시 슬롯 순서 보존(조합 파생)');
  assert.ok(mainSrc.includes('else if (cl.pickedMain && cl.pickedWing)'), '2차: 완성 조합만 슬롯 복원(미완성은 재선택)');
  assert.ok(mainSrc.includes('run.squad.invulnT = Math.max(run.squad.invulnT || 0, BAL.squad.evolveInvuln)'), '2차: 선택창 재개 무적');
  // Codex G2-G 3차: 주무기만이면 미완성 정체성(레일스톰 오귀속 방지), 최종 진화도 play 선택 카드.
  assert.ok(mainSrc.includes('id: `main-${main}`') && mainSrc.includes('resonance: null'), '3차: 주무기만=미완성 정체성(공명 없음)');
  assert.ok(mainSrc.includes("campaignPick({ title: '최종 무기 진화 선택'") && mainSrc.includes('if (!cl.pickWeapons) { applyEvo(opts[0].id)'), '3차: 최종 진화도 play 선택 카드(측정은 자동)');
});
