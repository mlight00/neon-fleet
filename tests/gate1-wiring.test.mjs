import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { coreLoopBuild, eventAction, CORE_LOOP_BUILDS, CORE_LOOP_BUILD_IDS, frameForBuild } from '../js/core-loop.js';
import { BAL } from '../js/balance.js';

// Gate 1 §6.4 — 순수 유닛으로 못 잡는 배선 규칙을 core-loop 순수 로직 + 소스 정적 검증으로 고정.

const entitiesSrc = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

// ── core-loop 순수 오케스트레이션 ──────────────────────────────
test('네 시뮬 빌드가 서로 다른 두 무기와 완성 공명을 정의한다(§6.3)', () => {
  assert.equal(CORE_LOOP_BUILD_IDS.length, 4);
  for (const id of CORE_LOOP_BUILD_IDS) {
    const b = coreLoopBuild(id);
    assert.ok(b.main && b.wing && b.main !== b.wing, `${id}: 두 무기가 다름`);
  }
  assert.equal(coreLoopBuild('railStorm').resonance, 'railStorm');
  assert.equal(coreLoopBuild('seekerBeam').wing, 'homing');
  assert.ok(CORE_LOOP_BUILDS.tankStress.stress, '스트레스 빌드 표식');
});

test('디렉터 사건 → 하네스 행동 매핑이 8분 계약을 커버한다', () => {
  assert.equal(eventAction('secondWeapon').kind, 'equipWing');
  assert.equal(eventAction('firstResonance').kind, 'resonanceReady');
  assert.equal(eventAction('framePick').kind, 'framePick');
  assert.equal(eventAction('bossStart').kind, 'bossStart');
  assert.equal(eventAction('result').kind, 'result');
  assert.equal(eventAction('nope'), null);
  assert.ok(['assault', 'carrier', 'phase'].includes(frameForBuild('railStorm')));
});

// ── 다중 무기 발사(R5) 배선 ────────────────────────────────────
test('Squad가 wing 슬롯과 슬롯별 발사 함수를 가진다(단일 weapon 토글 아님)', () => {
  assert.ok(entitiesSrc.includes('this.wing = {'), 'wing 슬롯 필드');
  assert.ok(entitiesSrc.includes('_spawnWeaponShots('), '슬롯 파라미터 발사 함수');
  // fire()가 main과 wing 두 슬롯을 각각 발사
  assert.ok(entitiesSrc.includes("accKey: 'fireAcc'") && entitiesSrc.includes("accKey: '_wingAcc'"), '두 슬롯 독립 발사 누적기');
  // 발사체에 sourceWeaponId 태그 → 피해 집계·공명이 무기를 구분
  assert.ok(entitiesSrc.includes('sourceWeaponId = weaponId'), '발사체 무기 태그');
});

// ── 기함 내구도(R8) 배선 ───────────────────────────────────────
test('takeShot이 내구도 모델 설치 시 resolveHit로 라우팅하고 내구도 0에서 패배시킨다', () => {
  assert.ok(entitiesSrc.includes('installGate1('), 'Gate 1 설치 훅');
  assert.ok(entitiesSrc.includes('takeShot(world'), '피격 라우팅');
  assert.ok(entitiesSrc.includes('resolveHit(this.surv'), '내구도 해석기 사용');
  assert.ok(entitiesSrc.includes('world.onHullDepleted'), '내구도 0 → 패배 콜백');
  // 드론 회수(applyDelta 양수)로 내구도를 올리는 경로가 takeShot에 없음(수리·승급만)
  assert.ok(!/takeShot[\s\S]{0,600}surv\.hull \+=/.test(entitiesSrc), 'takeShot이 내구도를 회복시키지 않음');
});

test('순양함 HP는 Gate 1 모드에서 노드 전환 뒤 유지된다(만피 초기화 조건화)', () => {
  // buildEncounter의 cruiserHp=[] 리셋이 !r.squad.surv 가드 뒤에 있어야 한다(§5.6/§12.7).
  assert.ok(mainSrc.includes('if (!r.squad.surv) { r.squad.cruiserHp = []'), '내구도 모드에선 순양함 HP 유지');
});

// ── 공명(R6) 재귀 방지 배선 ────────────────────────────────────
test('공명 발사체는 fromResonance로 태그되어 충전을 재귀 유발하지 않는다', () => {
  assert.ok(mainSrc.includes('fromResonance = true'), '공명 발사체 재귀 잠금 태그');
  assert.ok(mainSrc.includes('resonanceId ='), '공명 피해 별도 귀속 태그');
  // 충전은 쌍의 두 무기 명중을 모두 모듈에 전달하고(pair 검사가 필터), fromResonance면 재귀 제외.
  assert.ok(mainSrc.includes('sourceWeaponId: b.sourceWeaponId') && mainSrc.includes('fromResonance: b.fromResonance'), '충전 소스·재귀 가드 전달');
});

// ── 재작업(Codex 반려 반영) 배선 검증 ────────────────────────────
test('G1-01: play 모드는 자동 운전을 호출하지 않는다(사람 조작 보존)', () => {
  // coreLoopAutopilot 호출이 cl.auto(측정 모드) 뒤에만 있어야 한다.
  assert.ok(mainSrc.includes('if (cl.auto) coreLoopAutopilot'), '자동 회피는 측정 모드에서만');
  assert.ok(mainSrc.includes("mode === 'measure'"), 'play/measure 모드 분리');
});

test('G1-02: play 모드 정직한 시작(H0·내구도100·소편대) + 결과는 실제 시작 스냅샷', () => {
  assert.ok(/sq\.tier = 0;[\s\S]{0,80}startCount/.test(mainSrc), 'play: 티어0·소편대 시작');
  assert.ok(mainSrc.includes('startTier: cl.startTier'), '결과 화면이 하드코딩 아닌 실제 시작 티어 사용');
  assert.ok(mainSrc.includes('openCoreLoopStartPick'), '0:00 시작 무기 선택');
});

test('G1-03: 행동 변화는 실제 변화가 있을 때만 열고 기록', () => {
  assert.ok(mainSrc.includes('coreLoopWeaponSteps'), '실제 변화 옵션 생성기');
  assert.ok(mainSrc.includes('if (!steps.length) return false'), '변화 없으면 열지 않음(기록 안 함)');
  assert.ok(mainSrc.includes('openCoreLoopBehaviorPick') && mainSrc.includes('openCoreLoopSecondWeaponPick') && mainSrc.includes('openCoreLoopFramePick'), '행동·2nd무기·프레임 선택창');
});

test('G1-04: 긴급 재건·수리가 실제 런타임(takeShot)에 연결', () => {
  assert.ok(entitiesSrc.includes('maybeEmergencyRebuild(world)'), 'takeShot이 긴급 재건 호출');
  assert.ok(entitiesSrc.includes('doEmergencyRebuild(this.surv') && entitiesSrc.includes('survRepair(this.surv'), '재건+수리 실행');
  assert.ok(entitiesSrc.includes("world.metrics?.emergencyRebuild()"), '재건 로그 기록');
});

test('G1-05: 프레임 자동 스킬이 실제 전투 행동(캐리어 실탄·페이즈 RUSH연결)', () => {
  assert.ok(mainSrc.includes('applyFrameAuto') && mainSrc.includes('b.frameVolley = true'), '캐리어 일제사격 실탄');
  const cf = readFileSync(new URL('../js/command-frames.js', import.meta.url), 'utf8');
  assert.ok(cf.includes('ctx.rushStarted'), '페이즈는 RUSH 시작 신호로 발동(flow>=100 즉시0 회피)');
});

test('G1-06: 시커 빔이 유도 미사일 표적 선택에 실제 개입', () => {
  assert.ok(entitiesSrc.includes("reson.activeId === 'seekerBeam' && reson.markId"), 'pickTarget이 표식 대상 우선');
  assert.ok(mainSrc.includes('isSeekerHit(w.reson') && mainSrc.includes('missileBonus'), '표식 대상 명중 증폭·귀속');
});

test('G1-07: 무기/공명 피해를 실제 적용 피해(HP 감소)로 집계', () => {
  assert.ok(mainSrc.includes('hpBefore - bo.hp') && mainSrc.includes('hpBefore - (e.hp'), '충돌 전후 HP 차이로 집계');
});

test('G1-08: 보스 HP는 등장 후 실측 재보정(중심) + 양측 클램프(dpsCap 하한·enrage 상한)로 TTK 수렴', () => {
  // 표본 구간 보스 단일표적 피해율로 HP 중심추정(관통빌드 TTK 과대 방지, Codex P1).
  assert.ok(mainSrc.includes('bo0._sampleDmg') && mainSrc.includes('bt.sampleWinSec'), '보스 단일표적 실측 DPS(표본창)');
  assert.ok(mainSrc.includes('bossDps * bt.targetTTKSec'), '목표 TTK로 HP 중심추정');
  assert.ok(mainSrc.includes('bo0._calibrated = true') && mainSrc.includes('bo.dpsCap'), '하한 클램프: 재보정 후 초당 상한');
  // 노이즈 무관 수렴: enrageStart 이후 보스 피격 피해 증폭(상한). 잔여 잡몹 정리로 순수 단일표적 표본.
  assert.ok(mainSrc.includes('_enrageMult') && mainSrc.includes('bossDmg *= bo._enrageMult'), '상한 클램프: enrage 증폭');
  assert.ok(mainSrc.includes("if (w.entities[i].isEnemy) w.entities.splice"), '보스 등장 시 잔여 잡몹 정리(순수 단일표적)');
});

// ── 밸런스 계약 ────────────────────────────────────────────────
test('Gate 1 밸런스 섹션이 타임라인·슬롯·공명·내구도·프레임을 모두 정의한다', () => {
  const g = BAL.gate1;
  assert.ok(g.timeline.secondWeapon > 0 && g.timeline.firstResonance > g.timeline.secondWeapon);
  assert.ok(g.loadout.slots.length === 2);
  for (const r of ['railStorm', 'microMissile', 'seekerBeam']) assert.ok(g.resonance[r], `공명 ${r} 정의`);
  assert.ok(g.survivability.hullMax > 0 && g.survivability.emergencyRebuildMax === 1);
  for (const f of ['assault', 'carrier', 'phase']) assert.ok(g.frames[f].auto, `프레임 ${f} 자동 스킬`);
});
