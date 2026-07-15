import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollAffixes, applyAffixes, AFFIX_KINDS } from '../js/affixes.js';

const CFG = {
  baseChance: 0.1, chancePerStage: 0.1, chanceCap: 0.6, twoAffixStage: 6,
  defs: {
    swift:  { name: '가속', icon: '»', color: '#f00', spd: 1.6, fire: 0.7 },
    shield: { name: '보호막', icon: '◈', color: '#0ff', charges: 1 },
    split:  { name: '분열', icon: '✶', color: '#f0f', count: 2 },
    toxic:  { name: '독성', icon: '☣', color: '#0f0', contact: 1.7 },
    elite:  { name: '엘리트', icon: '★', color: '#ff0', hp: 2.4, radius: 1.35, bounty: 10, coin: 8 },
    magnet: { name: '자성탄', icon: '◎', color: '#f0f', homing: 3.2 },
  },
};

test('AFFIX_KINDS: 자성탄은 사격형만, 분열은 크리처 전용', () => {
  assert.ok(AFFIX_KINDS.magnet.includes('sniper'));
  assert.ok(!AFFIX_KINDS.magnet.includes('creature'));
  assert.deepEqual(AFFIX_KINDS.split, ['creature']);
  assert.ok(!AFFIX_KINDS.elite.includes('weaver')); // 위버는 엘리트 대상 아님
});

test('rollAffixes: 섹터 2+ 낮은 롤이면 종류에 맞는 변이 1개 (creature는 magnet 불가)', () => {
  const keys = rollAffixes('creature', 2, () => 0, CFG);   // 섹터 2 = 확률 0.08, 롤 0 → 변이
  assert.equal(keys.length, 1);
  assert.ok(AFFIX_KINDS[keys[0]].includes('creature'));
  assert.notEqual(keys[0], 'magnet');
});

test('rollAffixes: 섹터 1이면 변이 없음(첫 원정) + 높은 롤이면 변이 없음', () => {
  assert.deepEqual(rollAffixes('creature', 1, () => 0, CFG), []);      // 섹터1 = 확률 0 → 항상 없음
  assert.deepEqual(rollAffixes('creature', 2, () => 0.99, CFG), []);   // 높은 롤 → 없음
});

test('rollAffixes: 섹터 4 이상이면 최대 2개, 서로 다름', () => {
  const keys = rollAffixes('creature', 4, () => 0, CFG);   // 2중 변이는 섹터 4부터
  assert.equal(keys.length, 2);
  assert.notEqual(keys[0], keys[1]);
});

test('rollAffixes: 자격 없는 종류(mine)는 magnet/elite를 못 받는다', () => {
  // mine 자격: swift, toxic 만 → 낮은 롤이어도 그 중 하나
  const keys = rollAffixes('mine', 3, () => 0, CFG);
  assert.equal(keys.length, 1);
  assert.ok(['swift', 'toxic'].includes(keys[0]));
});

test('applyAffixes: 엘리트는 HP·반경·보상을 키운다', () => {
  const e = { hp: 100, maxHp: 100, r: 10 };
  applyAffixes(e, ['elite'], CFG);
  assert.equal(e.hp, 240);
  assert.equal(e.maxHp, 240);
  assert.ok(Math.abs(e.r - 13.5) < 1e-9);
  assert.equal(e.eliteBounty, 10);
  assert.equal(e.eliteCoin, 8);
  assert.deepEqual(e.affixes, ['elite']);
});

test('applyAffixes: 가속은 이동 배수 + 발사 주기 단축', () => {
  const e = { hp: 30, maxHp: 30, r: 14, fireInterval: 2 };
  applyAffixes(e, ['swift'], CFG);
  assert.ok(Math.abs(e.spdMult - 1.6) < 1e-9);
  assert.ok(Math.abs(e.fireInterval - 1.4) < 1e-9);
});

test('applyAffixes: 보호막/분열/독성/자성 플래그', () => {
  const shield = applyAffixes({ hp: 10, maxHp: 10, r: 10 }, ['shield'], CFG);
  assert.equal(shield.shieldCharges, 1);
  const split = applyAffixes({ hp: 10, maxHp: 10, r: 10 }, ['split'], CFG);
  assert.equal(split.splits, 2);
  const toxic = applyAffixes({ hp: 10, maxHp: 10, r: 10 }, ['toxic'], CFG);
  assert.ok(Math.abs(toxic.contactMult - 1.7) < 1e-9);
  const magnet = applyAffixes({ hp: 10, maxHp: 10, r: 10 }, ['magnet'], CFG);
  assert.ok(Math.abs(magnet.shotHoming - 3.2) < 1e-9);
});

test('applyAffixes: 변이 없으면 개체 그대로', () => {
  const e = { hp: 10, maxHp: 10, r: 10 };
  applyAffixes(e, [], CFG);
  assert.equal(e.hp, 10);
  assert.equal(e.affixes, undefined);
});
