import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_SUPER_EVOLUTIONS, superEvolutionOptions, evolutionStage, superEvoEffects, evoLevelMult } from '../js/weapon-evolutions.js';
import { BAL as BAL2 } from '../js/balance.js';

// ── 2단계 초진화 + 재선택 (플레이 피드백 반영) ──
test('초진화 정의: 무기당 2종, 전체 id 유일', () => {
  for (const w of ['vulcan', 'laser', 'homing']) assert.equal(superEvolutionOptions(w).length, 2);
  assert.equal(new Set(ALL_EVOLUTION_IDS).size, ALL_EVOLUTION_IDS.length);   // 1·2단계 통합 id 중복 없음
});

test('evolutionStage 사다리: pick1→evoUp→pick2→superUp→re, Lv미만→null', () => {
  const e0 = { vulcan: null }, e1 = { vulcan: 'vulcan_storm' };
  const s0 = { vulcan: null }, s1 = { vulcan: 'vulcan_tempest' };
  // 베이스 Lv 미만
  assert.equal(evolutionStage('vulcan', 2, 3, e0, { vulcan: 0 }, s0, { vulcan: 0 }), null);
  // Lv MAX, 미진화 → 진화 선택
  assert.equal(evolutionStage('vulcan', 3, 3, e0, { vulcan: 0 }, s0, { vulcan: 0 }), 'pick1');
  // 진화 후 Lv1~2 → 강화(evoUp)
  assert.equal(evolutionStage('vulcan', 3, 3, e1, { vulcan: 1 }, s0, { vulcan: 0 }), 'evoUp');
  assert.equal(evolutionStage('vulcan', 3, 3, e1, { vulcan: 2 }, s0, { vulcan: 0 }), 'evoUp');
  // 진화 Lv3 도달 → 초진화 선택
  assert.equal(evolutionStage('vulcan', 3, 3, e1, { vulcan: 3 }, s0, { vulcan: 0 }), 'pick2');
  // 초진화 후 Lv1~2 → 강화(superUp)
  assert.equal(evolutionStage('vulcan', 3, 3, e1, { vulcan: 3 }, s1, { vulcan: 1 }), 'superUp');
  // 초진화 Lv3 → 재선택
  assert.equal(evolutionStage('vulcan', 3, 3, e1, { vulcan: 3 }, s1, { vulcan: 3 }), 're');
});

test('evoLevelMult: 미진화 1, 진화 Lv1 1, Lv2/3은 step만큼 증가', () => {
  assert.equal(evoLevelMult(null, 0, 0.14), 1);
  assert.equal(evoLevelMult('vulcan_storm', 1, 0.14), 1);
  assert.ok(Math.abs(evoLevelMult('vulcan_storm', 2, 0.14) - 1.14) < 1e-9);
  assert.ok(Math.abs(evoLevelMult('vulcan_storm', 3, 0.14) - 1.28) < 1e-9);
});

test('superEvoEffects: 미선택 중립, 선택 시 balance 수치 반영', () => {
  assert.deepEqual(superEvoEffects(null, BAL2.weaponSuperEvolution), { dmgMult: 1, rateMult: 1, spreadMult: 1, pierceBonus: 0 });
  const lance = superEvoEffects('vulcan_lance', BAL2.weaponSuperEvolution);
  assert.equal(lance.dmgMult, 1.30); assert.equal(lance.pierceBonus, 2);
});
import { WEAPON_EVOLUTIONS, ALL_EVOLUTION_IDS, evolutionOptions, evolutionDef, canEvolveWeapon, isCutterShot } from '../js/weapon-evolutions.js';
import { BAL } from '../js/balance.js';

test('무기별 진화 옵션은 정확히 2개', () => {
  for (const w of ['vulcan', 'laser', 'homing']) {
    assert.equal(evolutionOptions(w).length, 2, w);
  }
});

test('진화 id는 중복 없음 (1단계 6 + 2단계 초진화 6 = 12)', () => {
  assert.equal(ALL_EVOLUTION_IDS.length, 12);
  assert.equal(new Set(ALL_EVOLUTION_IDS).size, 12);
});

test('canEvolveWeapon: Lv 최대 미만이면 불가', () => {
  const evo = { vulcan: null, laser: null, homing: null };
  assert.equal(canEvolveWeapon('vulcan', 2, 3, evo), false);
});

test('canEvolveWeapon: Lv 최대 + 미진화면 가능', () => {
  const evo = { vulcan: null, laser: null, homing: null };
  assert.equal(canEvolveWeapon('vulcan', 3, 3, evo), true);
});

test('canEvolveWeapon: 이미 진화한 무기는 중복 진화 불가', () => {
  const evo = { vulcan: 'vulcan_storm', laser: null, homing: null };
  assert.equal(canEvolveWeapon('vulcan', 3, 3, evo), false);
});

test('canEvolveWeapon: 알 수 없는 무기는 불가', () => {
  assert.equal(canEvolveWeapon('plasma', 3, 3, { plasma: null }), false);
});

test('evolutionDef: id로 정의 조회, 없으면 null', () => {
  assert.equal(evolutionDef('laser_prism').name, '프리즘 어레이');
  assert.equal(evolutionDef('nope'), null);
});

test('정의 형식: 각 진화는 id·name·short·shape·pro·con 문자열을 가진다', () => {
  for (const e of Object.values(WEAPON_EVOLUTIONS).flat()) {
    for (const k of ['id', 'name', 'short', 'shape', 'pro', 'con']) assert.equal(typeof e[k], 'string', `${e.id}.${k}`);
  }
});

test('널 커터: every 탄마다 강화 절단탄 (balance 반영)', () => {
  const every = BAL.weaponEvolution.laser_cutter.every;
  const hits = [];
  for (let n = 1; n <= 12; n++) if (isCutterShot(n, every)) hits.push(n);
  for (const h of hits) assert.equal(h % every, 0);
  assert.ok(hits.length >= 12 / every - 1, '주기적으로 발동');
});

test('와스프: 소형 다발 군집, 총 피해 = totalFrac (분산 표적)', () => {
  const w = BAL.weaponEvolution.homing_wasp;
  assert.ok(w.count >= 5, '5발 이상 군집');
  const perMissile = w.totalFrac / w.count;
  assert.ok(Math.abs(perMissile * w.count - w.totalFrac) < 1e-9);
});

test('시즈: 느린 초대형 강타 — 단발 고화력, 폭발 감소 상한 준수', () => {
  const s = BAL.weaponEvolution.homing_siege;
  assert.ok(s.rateMult < 0.5, '발사 느림');
  assert.ok(s.dmgMult >= 3.5, '단발 초고화력');
  assert.ok(s.blastFrac <= 0.7, '폭발 피해 감소는 70% 이하(면역 금지)');
});

test('양갈래 정체성 대비: 폭풍(광역/연쇄) vs 니들(단일/관통)', () => {
  const st = BAL.weaponEvolution.vulcan_storm, nd = BAL.weaponEvolution.vulcan_needle;
  assert.ok(st.spread > nd.spread * 3, '폭풍이 훨씬 넓다');
  assert.ok((st.bounces || 1) >= 2, '폭풍은 다단 도탄');
  assert.ok((nd.pierceBonus || 0) >= 1 && nd.rate > 1.5, '니들은 관통 + 초고속');
});

test('피해 감소 상한: 프리즘 정면 감소·시즈 폭발 등 어떤 진화도 100% 면역이 아님', () => {
  const WE = BAL.weaponEvolution;
  assert.ok(WE.vulcan_storm.ricochetFrac > 0 && WE.vulcan_storm.ricochetFrac < 1);
  assert.ok(WE.laser_prism.splitFrac > 0 && WE.laser_prism.splitFrac < 1);
});
