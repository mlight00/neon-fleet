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
  // 충전은 발칸 명중에서만, 그리고 fromResonance면 제외(resonances.onHit 계약)
  assert.ok(mainSrc.includes("sourceWeaponId === 'vulcan'") && mainSrc.includes('fromResonance: b.fromResonance'), '충전 소스·재귀 가드 전달');
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
