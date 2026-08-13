// ── §G39-R1 — 입자 상한에서도 전역 RNG 소비가 변하지 않는가 ────────────────────────────
//
//  Codex 구현검수 §2(P0): §G-39 가 `burst()` 앞에 예산 검사를 넣으면서 상한 도달 시 loop 를
//  `break` 하게 만들었다. 상한 전에는 입자당 전역 `Math.random()` 3회를 쓰지만, 상한 뒤에는
//  **0회**가 된다.
//
//  ⚠️왜 치명적인가: 전역 `Math.random()` 은 **치명타 판정·탄 분산·스폰과 같은 스트림**이다.
//   연출이 난수를 덜 먹으면 그 다음 치명타가 다른 값을 뽑는다 → 전투 결과가 달라진다.
//   "게임 truth 불변"이 깨진다. 화면만 바꾸는 작업이 판정을 바꾼 것이다.
//
//  ⚠️수정 방향(가장 작은 안전 수정): 난수는 **그대로 소비**하고 예산 밖이면 `push` 만 생략한다.
//   모든 visual RNG 를 별도 RNG 로 옮기는 대규모 변경은 기준 전투 RNG 자체를 바꾸므로 하지 않는다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createEffects, EFFECT_BUDGET } from '../js/entities.js';

/** 전역 Math.random 호출 횟수를 세면서 fn 을 실행한다. */
function countGlobalRandom(fn) {
  const orig = Math.random;
  let n = 0;
  Math.random = () => { n++; return orig(); };
  try { fn(); } finally { Math.random = orig; }
  return n;
}
/** 결정적 난수(0,1,2,… 순서 추적용) — 소비 **순서**까지 비교할 때 쓴다. */
function withSequence(values, fn) {
  const orig = Math.random;
  let i = 0;
  Math.random = () => values[i++ % values.length];
  try { return fn(); } finally { Math.random = orig; }
}
const fillNormal = (fx) => { while (fx.partsStats().total < EFFECT_BUDGET.normal) fx.burst(0, 0, '#fff', 40, 100); };

test('G39R1-RNG-EMPTY: 빈 pool 에서 burst(8) 은 전역 난수를 24회 쓴다(기준선)', () => {
  const fx = createEffects();
  assert.equal(countGlobalRandom(() => fx.burst(10, 10, '#fff', 8, 200)), 24, '입자당 3회 × 8');
});

test('G39R1-RNG-AT-NORMAL-CAP: normal(480)이 찬 뒤에도 burst(8) 은 24회를 쓴다', () => {
  //  ⭐이것이 반려 사유의 핵심 재현이다. 수정 전에는 **0회**였다.
  const fx = createEffects();
  fillNormal(fx);
  assert.ok(fx.partsStats().total >= EFFECT_BUDGET.normal, '전제: normal pool 이 차 있어야 한다');
  const before = fx.partsStats().total;
  assert.equal(countGlobalRandom(() => fx.burst(10, 10, '#fff', 8, 200)), 24, '예산 밖에서도 난수는 소비한다');
  assert.equal(fx.partsStats().total, before, '입자는 늘지 않는다(push 만 생략)');
});

test('G39R1-RNG-AT-TOTAL-CAP: total(600)이 찬 뒤 고우선 burst(8) 도 24회를 쓴다', () => {
  const fx = createEffects();
  while (fx.partsStats().total < EFFECT_BUDGET.total) fx.burst(0, 0, '#fff', 40, 100, { priority: 'high' });
  assert.ok(fx.partsStats().total >= EFFECT_BUDGET.total, '전제: total 이 차 있어야 한다');
  const before = fx.partsStats().total;
  assert.equal(countGlobalRandom(() => fx.burst(10, 10, '#fff', 8, 200, { priority: 'high' })), 24, '고우선도 같다');
  assert.equal(fx.partsStats().total, before, '입자는 늘지 않는다');
});

test('G39R1-RNG-STREAM-POSITION: cap ON/OFF 뒤 다음 소비자가 같은 값을 받는다', () => {
  //  호출 횟수만 같아도 스트림 위치가 어긋나면 의미가 없다 — 실제로 다음 값이 같은지 본다.
  //  치명타·탄 분산·스폰이 바로 이 "다음 값"을 쓴다.
  const seq = Array.from({ length: 64 }, (_, i) => (i % 17) / 17);   // 결정적 순열
  const readNext = (prime) => withSequence(seq, () => {
    const fx = createEffects();
    if (prime) fillNormal(fx);          // cap ON
    fx.burst(10, 10, '#fff', 8, 200);
    return Math.random();               // ← 다음 소비자(치명타 등)가 받을 값
  });
  //  cap 없이 480 을 채우지 않은 쪽과 비교하려면 소비량이 같아야 하므로,
  //  같은 시나리오를 두 번 돌려 "burst 직전까지의 소비"를 맞춘 뒤 비교한다.
  const fx0 = createEffects();
  const primeCalls = countGlobalRandom(() => fillNormal(fx0));
  const noCap = withSequence(seq, () => {
    for (let i = 0; i < primeCalls; i++) Math.random();   // cap 쪽과 같은 만큼 스트림을 진행시킨다
    const fx = createEffects();
    fx.burst(10, 10, '#fff', 8, 200);                     // 빈 pool(= cap 없음)
    return Math.random();
  });
  assert.equal(readNext(true), noCap, 'cap 이 있든 없든 다음 난수는 같아야 한다');
});

test('G39R1-RNG-ORDER: 예산 안 입자의 각도·속도·크기가 기존 소비 순서(a→v→size)를 그대로 쓴다', () => {
  //  순서가 바뀌면 호출 횟수가 같아도 **입자 모양이 달라진다**(같은 스트림에서 다른 값을 집는다).
  const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  const parts = withSequence(seq, () => {
    const fx = createEffects();
    fx.burst(0, 0, '#fff', 2, 100);
    return fx.debugParts();
  });
  assert.equal(parts.length, 2);
  //  1번 입자: a=0.1·2π, v=100*(0.4+0.2*0.6), size=2+0.3*3
  const a0 = 0.1 * Math.PI * 2, v0 = 100 * (0.4 + 0.2 * 0.6);
  assert.ok(Math.abs(parts[0][2] - Math.cos(a0) * v0) < 1e-3, `vx 가 a→v 순서와 맞아야 한다 (${parts[0][2]})`);
  assert.ok(Math.abs(parts[0][4] - (2 + 0.3 * 3)) < 1e-6, `size 는 세 번째 난수여야 한다 (${parts[0][4]})`);
});

test('G39R1-RNG-HITSPARK-STILL-ZERO: 신규 hit-spark 는 여전히 전역 난수를 0회 쓴다', () => {
  const fx = createEffects();
  assert.equal(countGlobalRandom(() => { for (let i = 0; i < 50; i++) fx.hitSpark(i, i, '#fff', 2, 90, i); }), 0);
});
