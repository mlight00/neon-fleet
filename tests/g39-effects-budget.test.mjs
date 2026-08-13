import test from 'node:test';
import assert from 'node:assert/strict';
import { createEffects, EFFECT_BUDGET } from '../js/entities.js';

test('G39-RNG-ISOLATION: hitSpark 는 전역 Math.random 을 한 번도 쓰지 않는다', () => {
  //  ⚠️burst() 는 입자당 Math.random() 을 3회 쓴다. 치명타 판정도 **같은 전역 RNG** 다
  //   (entities.js:910). 연출을 추가했는데 난수 순서가 밀려 전투 결과가 달라지면 안 된다.
  const fx = createEffects();
  const orig = Math.random;
  let calls = 0;
  Math.random = () => { calls++; return orig(); };
  try {
    for (let i = 0; i < 20; i++) fx.hitSpark(10, 10, '#fff', 2, 90, i);
  } finally { Math.random = orig; }
  assert.equal(calls, 0, `전역 RNG 를 ${calls}회 소비했다 — 0 이어야 한다`);
});

test('G39-RNG-DETERMINISTIC: 같은 seed 는 같은 입자 배치를 만든다', () => {
  const a = createEffects(), b = createEffects();
  a.hitSpark(5, 7, '#fff', 3, 100, 42);
  b.hitSpark(5, 7, '#fff', 3, 100, 42);
  assert.deepEqual(a.debugParts(), b.debugParts(), '같은 seed → 같은 배치');
  const c = createEffects();
  c.hitSpark(5, 7, '#fff', 3, 100, 43);
  assert.notDeepEqual(c.debugParts(), a.debugParts(), '다른 seed → 다른 배치');
});

test('G39-BUDGET-HITSPARK: hit-spark 활성 상한에서 신규를 생략한다', () => {
  const fx = createEffects();
  let made = 0;
  for (let i = 0; i < 400; i++) if (fx.hitSpark(0, 0, '#fff', 2, 90, i)) made++;
  const st = fx.partsStats();
  assert.ok(st.hitSpark <= EFFECT_BUDGET.hitSpark,
    `hit-spark ${st.hitSpark} — 상한 ${EFFECT_BUDGET.hitSpark} 이하`);
  assert.ok(made * 2 <= EFFECT_BUDGET.hitSpark + 2, '상한 도달 뒤로는 생성되지 않는다');
});

test('G39-BUDGET-HIGH-RESERVED: 일반 pool 이 가득 차도 고우선 연출은 생성된다', () => {
  //  ⚠️보스 폭발이 발칸 스파크에 밀려 사라지면 안 된다.
  const fx = createEffects();
  for (let i = 0; i < 600; i++) fx.hitSpark(0, 0, '#fff', 2, 90, i);
  for (let i = 0; i < 40; i++) fx.burst(0, 0, '#f00', 12, 200);
  const before = fx.partsStats();
  fx.burst(0, 0, '#ff0', 12, 200, { priority: 'high' });
  const after = fx.partsStats();
  assert.ok(after.high > before.high, '고우선은 예약 슬롯에서 생성된다');
  assert.ok(after.total <= EFFECT_BUDGET.total, `전체 ${after.total} — ${EFFECT_BUDGET.total} 이하`);
});

test('G39-BUDGET-NO-EVICT: hit-spark 때문에 기존 입자를 제거하지 않는다', () => {
  const fx = createEffects();
  fx.burst(0, 0, '#f00', 12, 200, { priority: 'high' });
  const highBefore = fx.partsStats().high;
  for (let i = 0; i < 500; i++) fx.hitSpark(0, 0, '#fff', 2, 90, i);
  assert.equal(fx.partsStats().high, highBefore, '고우선 입자가 줄면 안 된다');
});

test('G39-BUDGET-TOTAL: 어떤 조합에서도 전체 상한을 넘지 않는다', () => {
  const fx = createEffects();
  for (let i = 0; i < 300; i++) {
    fx.hitSpark(0, 0, '#fff', 2, 90, i);
    fx.burst(0, 0, '#f00', 14, 160);
    fx.burst(0, 0, '#ff0', 14, 160, { priority: 'high' });
  }
  assert.ok(fx.partsStats().total <= EFFECT_BUDGET.total,
    `전체 ${fx.partsStats().total} — ${EFFECT_BUDGET.total} 이하`);
});

test('G39-BUDGET-BURST-UNCHANGED: 기존 burst 의 RNG 소비량이 변하지 않는다', () => {
  //  ⚠️미사일 폭발은 현행 그대로여야 한다 — helper 통합 때문에 호출 수가 늘면 게임이 달라진다.
  const fx = createEffects();
  const orig = Math.random; let calls = 0;
  Math.random = () => { calls++; return orig(); };
  try { fx.burst(0, 0, '#fff', 8, 120); } finally { Math.random = orig; }
  assert.equal(calls, 8 * 3, `입자 8개 × 3회 = 24 — 실측 ${calls}`);
});
