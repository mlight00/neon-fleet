import { test } from 'node:test';
import assert from 'node:assert/strict';
import { baseNodeCoins, nodeCoinReward, nodeModuleGrant } from '../js/logic.js';
import { draftOptions, MODULE_DEFS } from '../js/modules.js';
import { Crystal, DronePod } from '../js/entities.js';
import { BAL } from '../js/balance.js';

const CM = BAL.nodeReward.coinMult;
const rarityOf = Object.fromEntries(MODULE_DEFS.map((m) => [m.id, m.rarity]));

// Phase C §5.7 — 항로 보상 계약.

// ─── 1. 기본 노드 코인은 섹터·열에 단조 증가 ─────────────────
test('baseNodeCoins = 40 + 10*sector + 5*col, 섹터·열에 단조 증가', () => {
  assert.equal(baseNodeCoins(1, 0), 50);       // 40 + 10 + 0
  assert.equal(baseNodeCoins(2, 0), 60);       // 섹터 +1 → +10
  assert.equal(baseNodeCoins(1, 1), 55);       // 열 +1 → +5
  assert.ok(baseNodeCoins(3, 2) > baseNodeCoins(2, 2));
  assert.ok(baseNodeCoins(2, 3) > baseNodeCoins(2, 1));
});

test('nodeCoinReward = round(base × 타입 배수), 코인도 단조 증가', () => {
  let prev = -1;
  for (let s = 1; s <= 6; s++) {
    const c = nodeCoinReward(s, 2, 'combat', CM);
    assert.ok(c > prev, `섹터 ${s} 코인 ${c} > ${prev}`); prev = c;
  }
});

// ─── 2. 각 노드 배수가 정확히 한 번 적용 ────────────────────
test('노드 타입 배수(combat1.0/supply0.5/hazard1.2/elite1.8/repair0)가 정확히 한 번', () => {
  const s = 3, col = 2, base = baseNodeCoins(s, col);
  assert.equal(nodeCoinReward(s, col, 'combat', CM), Math.round(base * 1.0));
  assert.equal(nodeCoinReward(s, col, 'supply', CM), Math.round(base * 0.5));
  assert.equal(nodeCoinReward(s, col, 'hazard', CM), Math.round(base * 1.2));
  assert.equal(nodeCoinReward(s, col, 'elite', CM), Math.round(base * 1.8));
  assert.equal(nodeCoinReward(s, col, 'repair', CM), 0);
});

// ─── 3. 보급은 모듈을 지급하지 않는다 ───────────────────────
test('nodeModuleGrant: 보급·수리·보스는 모듈 없음(null), 전투·위험은 3택', () => {
  assert.equal(nodeModuleGrant('supply'), null);
  assert.equal(nodeModuleGrant('repair'), null);
  assert.equal(nodeModuleGrant('boss'), null);
  assert.deepEqual(nodeModuleGrant('combat'), { count: 3, rare: false });
  assert.deepEqual(nodeModuleGrant('hazard'), { count: 3, rare: false });
});

// ─── 4. 정예 = 4택, 희귀 최소 1장 ───────────────────────────
test('nodeModuleGrant(elite) = 4택 + 희귀 보장', () => {
  const g = nodeModuleGrant('elite', BAL.nodeReward.eliteDraftCount);
  assert.equal(g.count, 4);
  assert.equal(g.rare, true);
});

test('draftOptions(4, rareGuaranteed): 4장 + 희귀 최소 1장', () => {
  let rng = (() => { let i = 0; return () => ((i = (i * 9301 + 49297) % 233280), i / 233280); })();
  for (let t = 0; t < 20; t++) {   // 여러 시드로 반복 확인
    const opts = draftOptions([], rng, 4, true);
    assert.equal(opts.length, 4, '4장');
    assert.ok(opts.some((id) => rarityOf[id] === 'rare'), `희귀 최소 1장: ${opts}`);
    assert.equal(new Set(opts).size, 4, '중복 없음');
  }
});

test('draftOptions(3) 기본 호출은 기존과 동일(희귀 강제 없음, 3장)', () => {
  let i = 0; const rng = () => ((i = (i * 9301 + 49297) % 233280), i / 233280);
  const opts = draftOptions([], rng, 3);
  assert.equal(opts.length, 3);
  assert.equal(new Set(opts).size, 3);
});

// ─── 6. 수리량 = max(12, round(count×0.35)) ─────────────────
test('긴급 수리량 = max(12, round(count×0.35))', () => {
  const heal = (count) => Math.max(BAL.nodeReward.repairHealMin, Math.round(count * BAL.nodeReward.repairHealPct));
  assert.equal(heal(10), 12);      // 3.5 < 12 → 12
  assert.equal(heal(100), 35);     // round(35) = 35
  assert.equal(heal(200), 70);
  assert.equal(BAL.nodeReward.repairHealMin, 12);
  assert.equal(BAL.nodeReward.repairHealPct, 0.35);
});

// ─── 7. 모듈 정비 비용 = 25 × sector ────────────────────────
test('모듈 정비 비용 = 25 × sector', () => {
  assert.equal(BAL.nodeReward.repairModuleCostPerSector, 25);
  for (const s of [1, 3, 6]) assert.equal(BAL.nodeReward.repairModuleCostPerSector * s, 25 * s);
});

// ─── 9. 보급 payout ×1.4가 정확히 한 번 ─────────────────────
function stubWorld(mfx = {}) {
  return { squad: { rewardGainMult: 1 }, mfx };
}
test('보급 크리스탈·수송선 payout = 일반 × 1.4 (배수 한 번, 단일 반올림)', () => {
  const G = BAL.economy.droneGainMult, MULT = BAL.nodeReward.supplyPayoutMult;
  const w = stubWorld({ podRewardMult: 1.3 });   // 보상 모듈까지 함께
  const crNorm = new Crystal(0, 0, 100, w, 1);
  const crSupply = new Crystal(0, 0, 100, w, MULT);
  // 각 배수(경제·모듈·교리·보급) 정확히 한 번 = 단일 round
  assert.equal(crSupply.payout, Math.round(100 * 1.3 * G * 1 * MULT));
  assert.equal(crNorm.payout, Math.round(100 * 1.3 * G * 1));
  const podSupply = new DronePod(0, 0, 'mid', w, MULT);
  assert.equal(podSupply.payout, Math.round(podSupply.reward * 1.3 * G * MULT));
});
