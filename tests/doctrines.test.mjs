import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DOCTRINES, DOCTRINE_BY_ID, doctrineIcon, doctrineEffects, phaseDamageMult } from '../js/doctrines.js';
import { BAL } from '../js/balance.js';

const CFG = BAL.doctrine;

test('교리는 3종, id 중복 없음', () => {
  assert.equal(DOCTRINES.length, 3);
  assert.equal(new Set(DOCTRINES.map((d) => d.id)).size, 3);
});

test('doctrineEffects: 미선택(null)이면 모든 배수 1 / 보너스 0 (중립)', () => {
  const e = doctrineEffects(null, CFG);
  assert.equal(e.supportMult, 1);
  assert.equal(e.chargeSpeedMult, 1);
  assert.equal(e.chargeDmgMult, 1);
  assert.equal(e.escortShareBonus, 0);
  assert.equal(e.hitRadiusDelta, 0);
  assert.equal(e.lancePierceDefense, false);
});

test('doctrineEffects: 군체는 supportMult에만, 차지·피격엔 영향 없음', () => {
  const e = doctrineEffects('swarm', CFG);
  assert.equal(e.supportMult, CFG.swarm.supportMult);
  assert.equal(e.escortShareBonus, CFG.swarm.escortShareBonus);
  assert.equal(e.chargeDmgMult, 1);          // 자동사격·차지 불변
  assert.equal(e.hitRadiusDelta, 0);
});

test('doctrineEffects: 랜스는 차지 배수 + 관통방어무시, 자동사격 미상승', () => {
  const e = doctrineEffects('lance', CFG);
  assert.equal(e.chargeSpeedMult, CFG.lance.chargeSpeedMult);
  assert.equal(e.chargeDmgMult, CFG.lance.chargeDmgMult);
  assert.equal(e.lancePierceDefense, true);
  assert.equal(e.supportMult, 1);            // 순양함 화력 불변
});

test('doctrineEffects: 위상은 피격 반경 감소 + 하한 제공', () => {
  const e = doctrineEffects('phase', CFG);
  assert.equal(e.hitRadiusDelta, CFG.phase.hitRadiusDelta);
  assert.equal(e.hitRadiusMin, CFG.phase.hitRadiusMin);
  assert.ok(e.bankDmgMax > 0);
});

test('phaseDamageMult: 정지=1, 최대 뱅크=1+max, 범위 클램프', () => {
  const m = CFG.phase.bankDmgMax;
  assert.equal(phaseDamageMult(0, m), 1);
  assert.ok(Math.abs(phaseDamageMult(1, m) - (1 + m)) < 1e-9);
  assert.equal(phaseDamageMult(-5, m), 1);          // 음수 클램프
  assert.ok(Math.abs(phaseDamageMult(2, m) - (1 + m)) < 1e-9); // 상한 클램프
});

test('doctrineIcon: id별 아이콘, 미선택이면 빈 문자열', () => {
  assert.equal(doctrineIcon('lance'), '⚡');
  assert.equal(doctrineIcon(null), '');
  assert.equal(DOCTRINE_BY_ID.swarm.icon, '🐝');
});

test('위상 교리: 피격 반경이 하한(hitRadiusMin) 아래로 내려가지 않는다 (entities.hitRadius 공식 반영)', () => {
  const p = CFG.phase;
  const clamp = (base) => Math.max(p.hitRadiusMin, base + p.hitRadiusDelta);
  assert.equal(clamp(15), 12);   // 스카웃 15-3=12=하한
  assert.equal(clamp(13), 12);   // 13-3=10 → 하한 12로 클램프
  assert.equal(clamp(30), 27);   // 큰 값은 -3만
});

test('교리는 서로 독립: 군체=순양함만, 랜스=차지만, 위상=피격만 (교차 보너스 없음)', () => {
  const s = doctrineEffects('swarm', CFG), l = doctrineEffects('lance', CFG), p = doctrineEffects('phase', CFG);
  assert.equal(s.chargeDmgMult, 1); assert.equal(s.hitRadiusDelta, 0);        // 군체는 차지·피격 불변
  assert.equal(l.supportMult, 1); assert.equal(l.hitRadiusDelta, 0);          // 랜스는 순양함·피격 불변
  assert.equal(p.supportMult, 1); assert.equal(p.chargeDmgMult, 1);           // 위상은 순양함·차지 불변
});
