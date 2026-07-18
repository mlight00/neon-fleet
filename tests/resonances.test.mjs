import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RESONANCES, resonanceForPair, createResonanceState, setLoadout, onHit, tick,
  chargeFrac, tryProc, onLaserMark, onEnemyRemoved, isSeekerHit, shouldTelegraph,
} from '../js/resonances.js';
import { BAL } from '../js/balance.js';

const CFG = BAL.gate1.resonance;

// Gate 1 §5.4 / §6.4 — 세 공명 매칭·발동·재귀잠금·표식 검증.

test('세 무기 쌍이 각기 다른 공명을 만든다(순서 무관)', () => {
  assert.equal(resonanceForPair(['vulcan', 'laser']), 'railStorm');
  assert.equal(resonanceForPair(['laser', 'vulcan']), 'railStorm');   // 순서 무관
  assert.equal(resonanceForPair(['vulcan', 'homing']), 'microMissile');
  assert.equal(resonanceForPair(['laser', 'homing']), 'seekerBeam');
  assert.equal(resonanceForPair(['vulcan']), null);                    // 무기 1개면 공명 없음
  assert.equal(resonanceForPair([]), null);
});

test('로드아웃 설정이 활성 공명을 정하고, 조합이 깨지면 충전을 리셋한다', () => {
  const s = createResonanceState();
  setLoadout(s, ['vulcan', 'laser']);
  assert.equal(s.activeId, 'railStorm');
  s.charge = 20;
  setLoadout(s, ['vulcan', 'homing']);   // 조합 변경
  assert.equal(s.activeId, 'microMissile');
  assert.equal(s.charge, 0);             // 리셋
});

test('레일 스톰: 발칸 명중 누적이 임계 도달 시 발동, 관통 레일 스펙 반환', () => {
  const s = createResonanceState();
  setLoadout(s, ['vulcan', 'laser']);
  const th = CFG.railStorm.threshold;
  for (let i = 0; i < th - 1; i++) onHit(s, CFG, { sourceWeaponId: 'vulcan' });
  assert.equal(tryProc(s, CFG, 100), null);   // 아직 부족
  onHit(s, CFG, { sourceWeaponId: 'vulcan' }); // 임계 도달
  const spec = tryProc(s, CFG, 270);
  assert.ok(spec && spec.id === 'railStorm' && spec.kind === 'rail');
  assert.ok(spec.pierce >= 3 && spec.dmgFrac > 1);   // 피해배수만이 아닌 '관통 레일' 형태
  assert.equal(s.firstCompletedAt, 270);             // 첫 완성 기록
});

test('공명은 피해 배수만 올리지 않는다 — 발사 스펙이 새 형태를 정의한다', () => {
  const s = createResonanceState();
  setLoadout(s, ['vulcan', 'homing']);
  s.charge = CFG.microMissile.threshold;
  const spec = tryProc(s, CFG, 260);
  assert.equal(spec.kind, 'missiles');        // 소형 미사일 묶음 = 표적/모양 변화
  assert.ok(spec.count >= 3);
});

test('재귀 방지: 공명이 만든 타격은 충전을 쌓지 않는다', () => {
  const s = createResonanceState();
  setLoadout(s, ['vulcan', 'laser']);
  for (let i = 0; i < 100; i++) onHit(s, CFG, { sourceWeaponId: 'vulcan', fromResonance: true });
  assert.equal(s.charge, 0);                   // 공명 소스는 무시
  assert.equal(tryProc(s, CFG, 100), null);
});

test('발동 후 쿨다운 동안 재발동 불가', () => {
  const s = createResonanceState();
  setLoadout(s, ['vulcan', 'laser']);
  s.charge = CFG.railStorm.threshold * 2;      // 충분히 충전
  assert.ok(tryProc(s, CFG, 100));             // 1회 발동
  assert.equal(tryProc(s, CFG, 100), null);    // 쿨다운 중
  tick(s, CFG.railStorm.cooldown + 0.01);      // 쿨다운 경과
  assert.ok(tryProc(s, CFG, 101));             // 재발동 가능
});

test('충전은 쌍의 두 무기 명중 모두에서 쌓이고, 쌍 밖 무기는 충전하지 않는다', () => {
  const s = createResonanceState();
  setLoadout(s, ['vulcan', 'laser']);   // railStorm
  onHit(s, CFG, { sourceWeaponId: 'vulcan' });
  onHit(s, CFG, { sourceWeaponId: 'laser' });   // 쌍의 두 무기 모두 충전(기여도 안정화)
  assert.equal(s.charge, CFG.railStorm.chargePerHit * 2);
  onHit(s, CFG, { sourceWeaponId: 'homing' });   // 쌍 밖 무기는 충전 안 함
  assert.equal(s.charge, CFG.railStorm.chargePerHit * 2);
});

test('시커 빔: 레이저 표식 → 대상 파괴 시 표식 이동(해제)', () => {
  const s = createResonanceState();
  setLoadout(s, ['laser', 'homing']);
  onLaserMark(s, CFG, 'enemyA', 268);
  assert.equal(s.markId, 'enemyA');
  assert.equal(s.firstCompletedAt, 268);
  assert.equal(isSeekerHit(s, 'enemyA'), true);       // 표식 대상 = 공명 귀속
  assert.equal(isSeekerHit(s, 'enemyB'), false);
  onEnemyRemoved(s, 'enemyA');                          // 대상 파괴
  assert.equal(s.markId, null);                        // 표식 이동 준비
});

test('시커 빔 표식은 시간이 지나면 만료된다', () => {
  const s = createResonanceState();
  setLoadout(s, ['laser', 'homing']);
  onLaserMark(s, CFG, 'e1', 100);
  tick(s, CFG.seekerBeam.markDuration + 0.1);
  assert.equal(s.markId, null);
});

test('공명 예고: 충전형은 절반 이상, 표식형은 표식 없을 때 안내', () => {
  const s = createResonanceState();
  setLoadout(s, ['vulcan', 'laser']);
  s.charge = CFG.railStorm.threshold * 0.6;
  assert.equal(shouldTelegraph(s, CFG), true);
  assert.ok(chargeFrac(s, CFG) >= 0.5);
  const s2 = createResonanceState();
  setLoadout(s2, ['laser', 'homing']);
  assert.equal(shouldTelegraph(s2, CFG), true);   // 표식 없음 → "레이저로 지정" 안내
  onLaserMark(s2, CFG, 'x', 1);
  assert.equal(shouldTelegraph(s2, CFG), false);
});
