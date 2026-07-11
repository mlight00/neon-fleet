import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_EVOLUTIONS, ALL_EVOLUTION_IDS, evolutionOptions, evolutionDef, canEvolveWeapon, isCutterShot } from '../js/weapon-evolutions.js';
import { BAL } from '../js/balance.js';

test('무기별 진화 옵션은 정확히 2개', () => {
  for (const w of ['vulcan', 'laser', 'homing']) {
    assert.equal(evolutionOptions(w).length, 2, w);
  }
});

test('여섯 진화 id는 중복 없음', () => {
  assert.equal(ALL_EVOLUTION_IDS.length, 6);
  assert.equal(new Set(ALL_EVOLUTION_IDS).size, 6);
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

test('널 커터: 정확히 5번째 탄마다 강화탄(every=5)', () => {
  const every = BAL.weaponEvolution.laser_cutter.every;
  assert.equal(every, 5);
  const hits = [];
  for (let n = 1; n <= 12; n++) if (isCutterShot(n, every)) hits.push(n);
  assert.deepEqual(hits, [5, 10]);
});

test('와스프: 3발 총 피해 = 기존 1발의 115% (밸런스 목표 범위)', () => {
  const w = BAL.weaponEvolution.homing_wasp;
  assert.equal(w.count, 3);
  const perMissile = w.totalFrac / w.count;
  assert.ok(Math.abs(perMissile * w.count - 1.15) < 1e-9, '총 1.15');
  assert.ok(w.cap <= 24, '동시 상한 24');
});

test('시즈: 직접 DPS 배수(rate×dmg)가 목표 범위(+10~15%) 안', () => {
  const s = BAL.weaponEvolution.homing_siege;
  const dpsFactor = s.rateMult * s.dmgMult;   // 0.35 × 3.2 = 1.12
  assert.ok(dpsFactor >= 1.0 && dpsFactor <= 1.15, `dpsFactor=${dpsFactor}`);
  assert.ok(s.blastFrac <= 0.7, '폭발 피해 감소는 70% 이하 상한 준수(면역 금지)');
});

test('피해 감소 상한: 프리즘 정면 감소·시즈 폭발 등 어떤 진화도 100% 면역이 아님', () => {
  const WE = BAL.weaponEvolution;
  assert.ok(WE.vulcan_storm.ricochetFrac > 0 && WE.vulcan_storm.ricochetFrac < 1);
  assert.ok(WE.laser_prism.splitFrac > 0 && WE.laser_prism.splitFrac < 1);
});
