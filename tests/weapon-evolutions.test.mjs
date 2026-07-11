import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPON_EVOLUTIONS, ALL_EVOLUTION_IDS, evolutionOptions, evolutionDef, canEvolveWeapon } from '../js/weapon-evolutions.js';

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

test('정의 형식: 각 진화는 id·name·shape·pro·con 문자열을 가진다', () => {
  for (const e of Object.values(WEAPON_EVOLUTIONS).flat()) {
    for (const k of ['id', 'name', 'shape', 'pro', 'con']) assert.equal(typeof e[k], 'string', `${e.id}.${k}`);
  }
});
