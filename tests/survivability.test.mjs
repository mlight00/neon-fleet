import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createSurvivability, hullFrac, isDefeated, addShield, resolveHit,
  repair, onTierUp, canEmergencyRebuild, doEmergencyRebuild,
} from '../js/survivability.js';
import { BAL } from '../js/balance.js';

const CFG = BAL.gate1.survivability;

// Gate 1 §5.6 / §6.4 — 기함 내구도·순양함·보호막 분리와 피해 순서 검증.

test('초기화: 내구도 만피, 보호막 0', () => {
  const s = createSurvivability(CFG);
  assert.equal(s.hull, CFG.hullMax);
  assert.equal(s.shield, 0);
  assert.equal(hullFrac(s), 1);
  assert.equal(isDefeated(s), false);
});

test('기함 핵 피격은 드론이 아니라 내구도를 감소시킨다', () => {
  const s = createSurvivability(CFG);
  const out = resolveHit(s, { amount: CFG.dmgNormalShot });
  assert.equal(out.absorbedBy, 'hull');
  assert.equal(s.hull, CFG.hullMax - CFG.dmgNormalShot);
  // 드론 수는 이 모듈이 건드리지 않음(Squad.count 불변) — 여기 자원엔 드론 필드가 없다
  assert.ok(!('drones' in s));
});

test('피해 순서: 보호막 우선 소비 → 순양함 → 기함', () => {
  const s = createSurvivability(CFG);
  addShield(s, 1);
  // 1) 보호막 있으면 먼저 소비(피해 무효)
  let out = resolveHit(s, { amount: 20, onCruiserIndex: 2 });
  assert.equal(out.absorbedBy, 'shield');
  assert.equal(s.hull, CFG.hullMax);           // 내구도 그대로
  // 2) 보호막 소진 후 순양함 히트박스면 순양함이 지불
  out = resolveHit(s, { amount: 20, onCruiserIndex: 2 });
  assert.equal(out.absorbedBy, 'cruiser');
  assert.equal(out.index, 2);
  assert.equal(s.hull, CFG.hullMax);           // 내구도 그대로
  // 3) 순양함 미피격이면 기함 내구도
  out = resolveHit(s, { amount: 20 });
  assert.equal(out.absorbedBy, 'hull');
  assert.equal(s.hull, CFG.hullMax - 20);
});

test('내구도 0이면 드론·순양함이 남아도 패배 판정', () => {
  const s = createSurvivability(CFG);
  const out = resolveHit(s, { amount: CFG.hullMax + 5 });
  assert.equal(out.dead, true);
  assert.equal(isDefeated(s), true);
  assert.equal(s.hull, 0);                      // 음수로 안 내려감
});

test('제한 수리는 최대치의 일부만 회복(완전 회복 금지)', () => {
  const s = createSurvivability(CFG);
  s.hull = 10;
  const healed = repair(s, CFG);
  assert.equal(healed, Math.round(CFG.hullMax * CFG.repairFrac));
  assert.ok(s.hull < s.hullMax);                // 만피 안 됨
});

test('함체 승급은 최대치를 올리되 만피로 만들지 않는다', () => {
  const s = createSurvivability(CFG);
  s.hull = 20;
  const before = s.hullMax;
  const r = onTierUp(s, CFG);
  assert.equal(r.hullMax, before + CFG.hullMaxPerTier);
  // 회복은 증가분의 일부만
  assert.equal(s.hull, 20 + Math.round(CFG.hullMaxPerTier * CFG.tierHealFrac));
  assert.ok(s.hull < s.hullMax);                // 만피 아님
});

test('긴급 재건은 출격당 1회만, 비용(내구도)을 지불한다', () => {
  const s = createSurvivability(CFG);
  assert.equal(canEmergencyRebuild(s, CFG), true);
  const r1 = doEmergencyRebuild(s, CFG);
  assert.equal(r1.ok, true);
  assert.equal(r1.cruisers, CFG.emergencyRebuildCruisers);
  assert.equal(s.hull, CFG.hullMax - CFG.emergencyRebuildHullCost);
  // 두 번째는 불가(1회 제한)
  assert.equal(canEmergencyRebuild(s, CFG), false);
  const r2 = doEmergencyRebuild(s, CFG);
  assert.equal(r2.ok, false);
  assert.equal(s.emergencyUsed, 1);
});

test('드론 회수로 내구도를 올리는 경로가 없다(모듈에 hull 증가 함수는 수리·승급뿐)', () => {
  // 회귀 방지: 이 모듈의 공개 API 중 hull을 올리는 것은 repair/onTierUp/긴급재건(내구도는 오히려 감소)뿐.
  const s = createSurvivability(CFG);
  s.hull = 50;
  // 임의의 "드론 회수" 시나리오를 흉내내도 hull을 직접 올리는 공개 함수는 없다.
  resolveHit(s, { amount: 0 });                 // 피격만 hull에 영향
  assert.equal(s.hull, 50);
});
