import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTutorialSafeChunk, CHUNKS } from '../js/chunks.js';
import { copyCount } from '../js/logic.js';
import { Crystal, DronePod } from '../js/entities.js';
import { BAL } from '../js/balance.js';

// Phase A §3.7 테스트 7~12 — 첫 원정 첫 노드 안전화 + 표시=지급.

// ─── 7. 첫 노드 청크에 −, ÷, 감염 게이트가 없다 ───────────────
test('튜토리얼 필터: −/÷ 게이트가 있으면 거부, +/× 게이트만 허용', () => {
  const bad = { items: [{ type: 'gatePair', left: { op: '+', value: 30 }, right: { op: '-', value: 25 } }] };
  const half = { items: [{ type: 'gatePair', left: { op: 'x', value: 2 }, right: { op: '/', value: 2 } }] };
  const good = { items: [{ type: 'gatePair', left: { op: '+', value: 20 }, right: { op: 'x', value: 2 } }] };
  assert.equal(isTutorialSafeChunk(bad), false);
  assert.equal(isTutorialSafeChunk(half), false);
  assert.equal(isTutorialSafeChunk(good), true);
});

test('튜토리얼-안전으로 통과한 실제 청크에는 −/÷ 게이트가 하나도 없다', () => {
  const safe = CHUNKS.filter(isTutorialSafeChunk);
  assert.ok(safe.length >= 3, `튜토리얼 안전 청크가 최소 3개는 있어야 함(현재 ${safe.length})`);
  for (const c of safe) for (const it of c.items) {
    if (it.type === 'gatePair') {
      assert.ok(it.left.op !== '-' && it.left.op !== '/', `${c.name} 왼쪽 게이트 감점`);
      assert.ok(it.right.op !== '-' && it.right.op !== '/', `${c.name} 오른쪽 게이트 감점`);
    }
    assert.notEqual(it.type, 'corruptedGate');   // 감염 게이트 배제
  }
});

// ─── 8. 첫 노드에 섹터 2+ 적이 없다 ──────────────────────────
test('튜토리얼 필터: 중/대형·사격형·대응형 적과 기뢰/잔해/돌진병·유성을 거부', () => {
  const okSmall = { items: [{ type: 'creature', size: 'small' }, { type: 'crystal', value: 20 }] };
  assert.equal(isTutorialSafeChunk(okSmall), true);
  for (const t of ['sniper', 'turret', 'weaver', 'charger', 'mine', 'debris', 'bomber', 'zapper', 'meteor', 'prismWarden', 'scavenger', 'splitter']) {
    assert.equal(isTutorialSafeChunk({ items: [{ type: t }] }), false, `${t}는 튜토리얼에서 배제되어야 함`);
  }
  for (const size of ['mid', 'large']) {
    assert.equal(isTutorialSafeChunk({ items: [{ type: 'creature', size }] }), false, `${size} 생물 배제`);
  }
});

test('튜토리얼-안전으로 통과한 실제 청크의 생물은 모두 소형이다', () => {
  for (const c of CHUNKS.filter(isTutorialSafeChunk))
    for (const it of c.items)
      if (it.type === 'creature') assert.equal(it.size, 'small', `${c.name}에 비-소형 생물`);
});

// ─── 9. 첫 노드 복제 수는 최대 2다 ───────────────────────────
test('copyCount: 튜토리얼은 어떤 스테이지에서도 최대 2', () => {
  for (const stage of [1, 2, 5, 10, 30, 99]) {
    assert.ok(copyCount(stage, BAL.spawn, true) <= 2, `stage ${stage} 튜토리얼 복제 ${copyCount(stage, BAL.spawn, true)}`);
  }
  assert.equal(copyCount(1, BAL.spawn, true), 2);        // 첫 노드(stage 1): base 3 → cap 2
});

test('copyCount: 비-튜토리얼은 스테이지에 따라 증가하고 상한을 넘지 않는다', () => {
  assert.equal(copyCount(1, BAL.spawn, false), BAL.spawn.enemyMult);
  assert.equal(copyCount(999, BAL.spawn, false), BAL.spawn.enemyMultMax);
  assert.ok(copyCount(10, BAL.spawn, false) >= copyCount(1, BAL.spawn, false));
});

// ─── 10·11. 크리스탈·수송선 표시 payout == 실제 지급 ─────────
function stubWorld(mfx = {}) {
  const squad = { count: 0, cruisers: 0, doctrine: null, rewardGainMult: 1, applyDelta(n) { this.count += n; } };
  const noop = () => {};
  return { squad, mfx, effects: { burst: noop, ring: noop, text: noop, halo: noop } };
}

test('크리스탈: 파괴 시 지급 드론 = 표시 payout', () => {
  const w = stubWorld();
  const cr = new Crystal(100, 300, 100, w);
  assert.ok(cr.payout > 0);
  const before = w.squad.count;
  cr.hitByBullet(100, w);                 // hp=value=100 → 정확히 파괴
  assert.equal(cr.dead, true);
  assert.equal(w.squad.count - before, cr.payout);   // 지급 = 표시
});

test('수송선: 파괴 시 지급 드론 = 표시 payout', () => {
  const w = stubWorld();
  const pod = new DronePod(240, 300, 'mid', w);
  assert.ok(pod.payout > 0);
  const before = w.squad.count;
  pod.hitByBullet(pod.maxHp, w);
  assert.equal(pod.dead, true);
  assert.equal(w.squad.count - before, pod.payout);
});

// ─── 12. 보상 모듈 배수가 생성 시 payout에 반영 (표시=지급) ────
test('보상 모듈 ×2가 생성 시 크리스탈·수송선 payout에 반영된다', () => {
  const G = BAL.economy.droneGainMult;
  const w = stubWorld({ podRewardMult: 2 });
  const cr = new Crystal(0, 0, 100, w), pod = new DronePod(0, 0, 'mid', w);
  assert.equal(cr.payout, Math.round(100 * 2 * G));
  assert.equal(pod.payout, Math.round(pod.reward * 2 * G));
});
