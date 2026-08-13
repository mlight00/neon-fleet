# G39 3D 적 피해 상태 표시 & 피탄 반응 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 3D 함미모드에서 적의 남은 체력을 모델 색으로 읽을 수 있게 하고, 발칸·레이저 명중 시 몸체 번쩍과 명중 불꽃으로 피탄을 알린다.

**Architecture:** 적의 피해 상태를 **인스턴스 색상 채널 하나**로 전달한다. 색 = f(남은체력, 최근피격). 피격 기록은 게임 객체를 오염시키지 않도록 WeakMap 사이드카에 넣고, 실제 HP가 줄었을 때만 기록한다. 정보 통로는 production hero 경로(`put3D → _sw → hero frame → placeSwarm`)만 쓴다 — `buildSnapshot()`은 legacy 전용이라 건드리지 않는다. 명중 불꽃은 2D effects에 한 번만 만들고, 그것이 3D로 투영되어 두 모드를 덮는다.

**Tech Stack:** 순수 ES 모듈 · three.js r160 `InstancedMesh.setColorAt` · Canvas2D · `node --test` (node:test)

**설계 문서:** `docs/superpowers/specs/2026-08-12-3d-damage-feedback-design.md`
(Codex 3차 검수 최종 승인. §12 안전조건 4건은 **구현 계약**이다.)

## Global Constraints

- **커밋·푸시 금지.** 이 워크트리는 전부 미커밋 상태를 유지한다. 각 태스크의 마지막 단계는 커밋이 아니라 **전체 테스트 통과 확인**이다.
- **게임 truth 불변.** 판정·피해·보상·RNG·스폰·트랙 폭·밸런스를 바꾸지 않는다. 3D는 읽기 전용 표현 계층이다.
- **전역 `Math.random()` 신규 소비 0.** 신규 hit-spark는 전용 visual RNG만 쓴다(§12-1).
- **정보 통로는 production hero 경로뿐.** `buildSnapshot()`을 근거나 대상으로 쓰지 않는다.
- **프레임 중 무할당.** 색 함수는 새 객체를 반환하지 않고 호출자 슬롯에 쓴다.
- 테스트 실행: `node --test "tests/*.test.mjs"` (패키지 8개는 프리뷰 서버를 끈 상태에서만 통과)
- 확정 수치: 플래시 유지 **0.10초** · 같은 대상 재발동 **0.34초** · 최대 밝기 **2.4×**(reduced-motion **1.4×**) · 발칸·레이저 한 적중당 입자 **각 2개** · 프레임당 신규 **24** · 활성 hit-spark **120** · 일반 pool **480** · 고우선 예약 **120** · 전체 **600**

---

### Task 1: 순수 색 함수와 상수

**Files:**
- Create: `js/damage-feedback.js`
- Test: `tests/g39-damage-color.test.mjs`

**Interfaces:**
- Consumes: 없음(의존성 0인 순수 모듈)
- Produces: `FEEDBACK = { flashDur: 0.10, flashCooldown: 0.34, boost: 2.4, boostReduced: 1.4 }` · `writeDamageColor(slot, hpFrac, flash, maxBoost) → slot`

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
// tests/g39-damage-color.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { FEEDBACK, writeDamageColor } from '../js/damage-feedback.js';

test('G39-COLOR-FULL: 체력 100% · 피격 없음이면 원본색(1,1,1)', () => {
  const s = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(s, 1, 0, FEEDBACK.boost);
  assert.deepEqual([s.cr, s.cg, s.cb], [1, 1, 1]);
});

test('G39-COLOR-NO-ALLOC: 호출자 슬롯에 직접 쓰고 그 객체를 돌려준다', () => {
  //  ⚠️새 객체를 반환하면 적 수만큼 매 프레임 임시 객체가 생긴다(무할당 계약 위반).
  const s = { cr: 0, cg: 0, cb: 0 };
  assert.equal(writeDamageColor(s, 0.5, 0, FEEDBACK.boost), s, '같은 객체여야 한다');
});

test('G39-COLOR-DAMAGE: 체력이 낮을수록 붉어진다(R 유지 · G/B 감쇠)', () => {
  const hi = { cr: 0, cg: 0, cb: 0 }, lo = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(hi, 0.66, 0, FEEDBACK.boost);
  writeDamageColor(lo, 0.10, 0, FEEDBACK.boost);
  assert.ok(lo.cg < hi.cg, `G 가 더 낮아야 한다 — 0.66:${hi.cg} vs 0.10:${lo.cg}`);
  assert.ok(lo.cb < hi.cb, 'B 도 더 낮아야 한다');
  assert.ok(lo.cr >= lo.cg && lo.cr >= lo.cb, '붉은 쪽이 남아야 한다');
});

test('G39-COLOR-LATE-ONSET: 0.66 위에서는 거의 변하지 않는다', () => {
  //  ⚠️초반부터 붉으면 적이 몰릴 때 화면 전체가 붉어진다(설계 §11 위험).
  const s = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(s, 0.8, 0, FEEDBACK.boost);
  assert.ok(s.cg > 0.9, `체력 80% 에서 G ${s.cg} — 0.9 초과여야 한다`);
});

test('G39-COLOR-FLASH: 피격이면 전 채널이 밝아지고 최대 배수를 넘지 않는다', () => {
  const n = { cr: 0, cg: 0, cb: 0 }, f = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(n, 1, 0, FEEDBACK.boost);
  writeDamageColor(f, 1, 1, FEEDBACK.boost);
  assert.ok(f.cr > n.cr && f.cg > n.cg && f.cb > n.cb, '전 채널이 밝아진다');
  assert.ok(f.cr <= FEEDBACK.boost + 1e-9, `최대 ${FEEDBACK.boost} 배 이하 — 실측 ${f.cr}`);
});

test('G39-COLOR-COMPOSE: 저체력 적이 맞으면 "붉은 채로" 밝아진다', () => {
  //  ⚠️곱 합성이라 색 비율이 유지돼야 한다. 흰색으로 뭉개지면 체력 정보가 사라진다.
  const lo = { cr: 0, cg: 0, cb: 0 }, loFlash = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(lo, 0.15, 0, FEEDBACK.boost);
  writeDamageColor(loFlash, 0.15, 1, FEEDBACK.boost);
  const ratio0 = lo.cg / lo.cr, ratio1 = loFlash.cg / loFlash.cr;
  assert.ok(Math.abs(ratio0 - ratio1) < 1e-9, `G/R 비율 유지 — ${ratio0} vs ${ratio1}`);
});

test('G39-COLOR-REDUCED: reduced-motion 배수가 더 약하다', () => {
  const a = { cr: 0, cg: 0, cb: 0 }, b = { cr: 0, cg: 0, cb: 0 };
  writeDamageColor(a, 1, 1, FEEDBACK.boost);
  writeDamageColor(b, 1, 1, FEEDBACK.boostReduced);
  assert.ok(b.cr < a.cr, `약해야 한다 — ${b.cr} < ${a.cr}`);
  assert.ok(b.cr > 1, '그래도 1 보다는 밝다(정보는 남긴다)');
});

test('G39-COLOR-CLAMP: hpFrac 범위 밖·비정상 입력을 방어한다', () => {
  const s = { cr: 0, cg: 0, cb: 0 };
  for (const bad of [-1, 2, NaN, undefined, null]) {
    writeDamageColor(s, bad, 0, FEEDBACK.boost);
    for (const v of [s.cr, s.cg, s.cb]) {
      assert.ok(Number.isFinite(v) && v >= 0 && v <= FEEDBACK.boost, `${bad} → ${v}`);
    }
  }
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/g39-damage-color.test.mjs`
Expected: FAIL — `Cannot find module '../js/damage-feedback.js'`

- [ ] **Step 3: 최소 구현**

```js
// js/damage-feedback.js
// ── §G-39 — 적 피해 상태 피드백 (렌더 전용) ─────────────────────────────────────────────
//
//  이사님 제보(2026-08-12): "3D 에서는 적 상태를 알 수 없다" · "발칸·레이저 피탄 반응이 안 보인다".
//  적의 남은 체력과 최근 피격을 **인스턴스 색상 채널 하나**로 전달한다.
//
//  ⚠️이 모듈은 게임 truth 를 읽지도 바꾸지도 않는다 — 값을 받아 색만 계산한다.
//   밸런스·충돌 모듈이 여기를 import 하면 계약 위반이다.

/** 확정 수치(설계 §4). 근거는 설계 문서에 있다. */
export const FEEDBACK = {
  flashDur: 0.10,        // 플래시 유지(초) — 연사에서 개별 타격으로 읽히려면 짧아야 한다
  flashCooldown: 0.34,   // 같은 대상 재발동 최소 간격 — **초당 3회 이하**(광과민 안전 기준)
  boost: 2.4,            // 일반 최대 밝기 배수(실측 2.6× → 화면 +41%)
  boostReduced: 1.4,     // reduced-motion — 끄지 않고 약하게(정보는 남긴다)
};

const clamp01 = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1);

/**
 * 슬롯에 색을 **직접 쓴다**(무할당). 새 객체를 반환하지 않는다.
 *  @param slot     `{ cr, cg, cb }` 를 가진 기존 객체(적 버퍼 슬롯 또는 스크래치)
 *  @param hpFrac   남은 체력 비율 0..1
 *  @param flash    최근 피격 0..1 (1=방금)
 *  @param maxBoost 최대 밝기 배수(`FEEDBACK.boost` 또는 `boostReduced`)
 *  @returns 같은 slot
 */
export function writeDamageColor(slot, hpFrac, flash, maxBoost) {
  const hp = clamp01(hpFrac);
  const f = clamp01(flash);
  const boost = Number.isFinite(maxBoost) ? maxBoost : FEEDBACK.boost;

  //  체력 틴트: 0.66 **아래부터** 붙인다 — 초반부터 붉으면 적이 몰릴 때 화면이 붉어진다.
  //   dmg 0 = 멀쩡, 1 = 빈사.
  const dmg = hp >= 0.66 ? (1 - hp) * 0.15 : 0.051 + (0.66 - hp) / 0.66 * 0.949;
  const g = 1 - dmg * 0.72;      // green 을 가장 많이 뺀다
  const b = 1 - dmg * 0.80;      // blue 를 그 다음
  const r = 1;                   // red 는 유지 → 붉게 남는다

  //  번쩍: 전 채널에 같은 배수 → **색 비율이 유지된다**(붉은 채로 밝아진다).
  const k = 1 + (boost - 1) * f;
  slot.cr = r * k;
  slot.cg = g * k;
  slot.cb = b * k;
  return slot;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/g39-damage-color.test.mjs`
Expected: PASS — 8 tests

- [ ] **Step 5: 전체 테스트가 깨지지 않았는지 확인한다**

Run: `node --test "tests/*.test.mjs"`
Expected: 신규 8개만 늘고 기존 실패 0 (패키지 8개는 프리뷰 서버가 켜져 있으면 실패 — 그 경우 서버를 끄고 다시 실행)

---

### Task 2: 피격 사이드카 (실효 피해 기준)

**Files:**
- Modify: `js/damage-feedback.js` (Task 1에서 만든 파일에 추가)
- Test: `tests/g39-hit-sidecar.test.mjs`

**Interfaces:**
- Consumes: `FEEDBACK` (Task 1)
- Produces: `recordDamageFeedback(entity, x, y, now, effective) → boolean` · `readDamageFlash(entity, now) → 0..1` · `readLastHitPoint(entity) → {x,y}|null` · `isDamageFlashTarget(entity) → boolean`

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
// tests/g39-hit-sidecar.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  FEEDBACK, recordDamageFeedback, readDamageFlash, readLastHitPoint, isDamageFlashTarget,
} from '../js/damage-feedback.js';

const enemy = () => ({ hp: 10, maxHp: 10, indestructible: false });

test('G39-HIT-EFFECTIVE-ONLY: 실효 피해가 0 이면 기록하지 않는다', () => {
  //  ⚠️`hitByBullet` 이 불려도 보호막이 전부 막으면 HP 는 그대로다(affixes.js affixAbsorb).
  //   호출됐다는 이유로 번쩍이면 막힌 타격에 본체가 맞은 것처럼 보인다.
  const e = enemy();
  assert.equal(recordDamageFeedback(e, 5, 5, 1.0, 0), false, '0 피해는 기록 없음');
  assert.equal(readDamageFlash(e, 1.0), 0);
  assert.equal(recordDamageFeedback(e, 5, 5, 1.0, 3), true, '실피해는 기록');
  assert.ok(readDamageFlash(e, 1.0) > 0);
});

test('G39-HIT-DECAY: 플래시는 flashDur 동안 선형 감쇠한다', () => {
  const e = enemy();
  recordDamageFeedback(e, 0, 0, 10, 1);
  assert.equal(readDamageFlash(e, 10), 1, '기록 직후 1');
  const mid = readDamageFlash(e, 10 + FEEDBACK.flashDur / 2);
  assert.ok(Math.abs(mid - 0.5) < 1e-6, `절반 시점 0.5 — 실측 ${mid}`);
  assert.equal(readDamageFlash(e, 10 + FEEDBACK.flashDur), 0, '유지시간 끝나면 0');
  assert.equal(readDamageFlash(e, 10 + 5), 0, '한참 뒤도 0');
});

test('G39-HIT-COOLDOWN: 같은 대상은 flashCooldown 안에 재발동하지 않는다', () => {
  //  ⚠️발칸 연사로 매 타격 최대 밝기가 되면 스트로브가 되어 광과민 위험이 있다.
  const e = enemy();
  recordDamageFeedback(e, 0, 0, 100, 1);
  assert.equal(recordDamageFeedback(e, 0, 0, 100 + 0.1, 1), false, '쿨다운 안에서는 거부');
  assert.equal(recordDamageFeedback(e, 0, 0, 100 + FEEDBACK.flashCooldown, 1), true, '쿨다운 뒤 허용');
});

test('G39-HIT-RATE: 1초 동안 최대 3회까지만 발동한다(광과민 기준)', () => {
  const e = enemy();
  let fired = 0;
  for (let i = 0; i < 60; i++) if (recordDamageFeedback(e, 0, 0, 200 + i / 60, 1)) fired++;
  assert.ok(fired <= 3, `1초에 ${fired}회 — 3회 이하여야 한다`);
});

test('G39-HIT-POINT: 마지막 명중 지점을 남긴다', () => {
  const e = enemy();
  assert.equal(readLastHitPoint(e), null, '기록 전엔 없음');
  recordDamageFeedback(e, 12, 34, 1, 1);
  assert.deepEqual(readLastHitPoint(e), { x: 12, y: 34 });
});

test('G39-HIT-TARGET: 파괴 불가·maxHp 없음은 HP 플래시 대상이 아니다', () => {
  //  Debris(파괴 불가)는 HP 색·몸체 플래시 대상이 아니다 — 기존 금속 스파크만 유지한다.
  assert.equal(isDamageFlashTarget({ hp: 5, maxHp: 5 }), true);
  assert.equal(isDamageFlashTarget({ hp: 5, maxHp: 5, indestructible: true }), false);
  assert.equal(isDamageFlashTarget({ x: 0, y: 0 }), false, 'maxHp 없음');
  assert.equal(isDamageFlashTarget(null), false);
});

test('G39-HIT-NO-MUTATION: 엔티티에 필드를 추가하지 않는다', () => {
  //  ⚠️렌더 전용 상태가 게임 객체로 새면 저장·밸런스·결정성에 영향을 준다.
  const e = enemy();
  const before = Object.keys(e).sort().join(',');
  recordDamageFeedback(e, 1, 2, 1, 5);
  readDamageFlash(e, 1);
  assert.equal(Object.keys(e).sort().join(','), before, '키가 늘면 안 된다');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/g39-hit-sidecar.test.mjs`
Expected: FAIL — `recordDamageFeedback is not a function`

- [ ] **Step 3: 최소 구현 (`js/damage-feedback.js` 끝에 추가)**

```js
// ── 피격 장부(사이드카) ────────────────────────────────────────────────────────────────
//  ⚠️엔티티에 필드를 붙이지 않는다. WeakMap 이라 적이 죽으면 자동 회수돼 정리 코드가 필요 없다.
//   (이번 회차의 SHOT_ORIGIN·ART_LOCK 과 같은 방식이다.)
const HIT = new WeakMap();

/** HP 플래시 대상인가 — 파괴 가능하고 maxHp 가 유효한 것만. */
export function isDamageFlashTarget(entity) {
  return !!entity && !entity.indestructible && Number.isFinite(entity.maxHp) && entity.maxHp > 0;
}

/**
 * **실효 피해가 있을 때만** 피격을 기록한다.
 *  @param effective `hpBefore − hpAfter`. 0 이면 기록하지 않는다(보호막 완전 흡수·무적·0피해).
 *  @param now       게임 누적 시간(초). ⚠️벽시계가 아니다 — 일시정지 중 멈춰야 한다.
 *  @returns 실제로 기록했으면 true (= 불꽃을 만들어도 되는 순간)
 */
export function recordDamageFeedback(entity, x, y, now, effective) {
  if (!(effective > 0) || !isDamageFlashTarget(entity)) return false;
  const prev = HIT.get(entity);
  //  같은 대상 재발동 간격 — 연사가 스트로브가 되지 않게 막는다.
  if (prev && now - prev.t < FEEDBACK.flashCooldown) return false;
  if (prev) { prev.t = now; prev.x = x; prev.y = y; }
  else HIT.set(entity, { t: now, x, y });
  return true;
}

/** 0..1 감쇠값. flashDur 동안 선형으로 준다. */
export function readDamageFlash(entity, now) {
  const rec = HIT.get(entity);
  if (!rec) return 0;
  const age = now - rec.t;
  if (!(age >= 0) || age >= FEEDBACK.flashDur) return 0;
  return 1 - age / FEEDBACK.flashDur;
}

/** 마지막 명중 지점(불꽃 위치용). 없으면 null. */
export function readLastHitPoint(entity) {
  const rec = HIT.get(entity);
  return rec ? { x: rec.x, y: rec.y } : null;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/g39-hit-sidecar.test.mjs`
Expected: PASS — 7 tests

- [ ] **Step 5: 전체 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: 기존 실패 0

---

### Task 3: effects — visual RNG · hitSpark · 예산 분할

**Files:**
- Modify: `js/entities.js` (`createEffects()` — 약 36~95행)
- Test: `tests/g39-effects-budget.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `effects.hitSpark(x, y, color, count, speed, seed) → boolean` · `effects.burst(x, y, color, n, speed, opts)` 의 `opts.priority` · `effects.partsStats() → { total, hitSpark, high }`

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
// tests/g39-effects-budget.test.mjs
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/g39-effects-budget.test.mjs`
Expected: FAIL — `EFFECT_BUDGET` 를 찾을 수 없음

- [ ] **Step 3: 최소 구현 (`js/entities.js`)**

`createEffects()` 정의 **바로 위**에 예산 상수를 추가한다:

```js
/** §G-39 이펙트 입자 예산. ⚠️낮은 우선순위가 예약을 선점하지 못하게 한다. */
export const EFFECT_BUDGET = {
  total: 600,      // 전체 안전 상한
  normal: 480,     // 낮음·보통 사용선
  hitSpark: 120,   // 그중 hit-spark 몫
  high: 120,       // 보스·진화·보상 예약(= total − normal)
};
```

`createEffects()` 안에서 `const parts = [];` 아래에 카운터와 visual RNG 를 추가한다:

```js
  let nHitSpark = 0, nHigh = 0;   // 카테고리별 활성 수(예산 집행용)
  //  §G-39: **전용 visual RNG**(LCG). 전역 Math.random 을 쓰면 치명타·스폰 난수 순서가 밀려
  //   연출만 추가했는데 전투 결과가 달라진다(entities.js:910 이 같은 전역 RNG 를 쓴다).
  let _vrng = 1;
  const vseed = (s) => { _vrng = (s >>> 0) || 1; };
  const vrand = () => { _vrng = (_vrng * 1664525 + 1013904223) >>> 0; return _vrng / 4294967296; };
```

`burst()` 를 우선순위 인자를 받도록 바꾼다(기본 동작은 그대로):

```js
    burst(x, y, color, n = 14, speed = 160, opts) {
      const high = !!(opts && opts.priority === 'high');
      for (let i = 0; i < n; i++) {
        //  §G-39 예산: 고우선은 예약 슬롯까지, 일반은 normal 선까지.
        if (high ? parts.length >= EFFECT_BUDGET.total : parts.length >= EFFECT_BUDGET.normal) break;
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.6);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, color, size: 2 + Math.random() * 3, hi: high });
        if (high) nHigh++;
      }
    },
    /**
     * §G-39 피격 스파크 — **전역 RNG 를 쓰지 않는다.**
     *  @returns 실제로 만들었으면 true
     */
    hitSpark(x, y, color, count = 2, speed = 90, seed = 0) {
      if (nHitSpark >= EFFECT_BUDGET.hitSpark) return false;
      if (parts.length >= EFFECT_BUDGET.normal) return false;
      vseed((seed * 2654435761) ^ 0x9e3779b9);
      let made = 0;
      for (let i = 0; i < count; i++) {
        if (nHitSpark >= EFFECT_BUDGET.hitSpark || parts.length >= EFFECT_BUDGET.normal) break;
        const a = vrand() * Math.PI * 2;
        const v = speed * (0.4 + vrand() * 0.6);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, color, size: 1.5 + vrand() * 2, hs: true });
        nHitSpark++; made++;
      }
      return made > 0;
    },
    /** 예산 진단(테스트·성능 보고용). */
    partsStats() { return { total: parts.length, hitSpark: nHitSpark, high: nHigh }; },
    /** 결정성 테스트용 입자 스냅샷. */
    debugParts() { return parts.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4), +p.vx.toFixed(4), +p.vy.toFixed(4), +p.size.toFixed(4)]); },
```

입자 제거 루프에서 카운터를 줄인다(기존 `parts.splice` 자리):

```js
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) {
        if (parts[i].hs) nHitSpark--;
        if (parts[i].hi) nHigh--;
        parts.splice(i, 1);
      }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/g39-effects-budget.test.mjs`
Expected: PASS — 7 tests

- [ ] **Step 5: 전체 확인 — 기존 이펙트 동작이 안 깨졌는지**

Run: `node --test "tests/*.test.mjs"`
Expected: 기존 실패 0. ⚠️`burst` 시그니처에 인자가 붙었으므로 소스 문자열 대조 테스트가 깨질 수 있다 — 깨지면 **계약 부분만 보도록** 정규식을 완화한다(이번 세션에서 11번 겪은 유형).

---

### Task 4: 공유 피드백 시계 (`feedbackNow`)

**Files:**
- Modify: `js/main.js` (`frame()` 3603~3620 · `update()` 2407 · `draw()` 3180)
- Test: `tests/g39-feedback-clock.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `js/feedback-clock.js` → `createFeedbackClock() → { now(), advance(dt), reset() }`

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
// tests/g39-feedback-clock.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { createFeedbackClock } from '../js/feedback-clock.js';

test('G39-CLOCK-ADVANCE: 진행한 dt 만큼만 증가한다', () => {
  const c = createFeedbackClock();
  assert.equal(c.now(), 0);
  c.advance(0.05);
  assert.ok(Math.abs(c.now() - 0.05) < 1e-9, `실측 ${c.now()}`);
});

test('G39-CLOCK-PAUSE: advance 를 부르지 않으면 시간이 흐르지 않는다', () => {
  //  ⚠️main.js:3616 은 pause 중 update 만 건너뛰고 draw 는 계속 돈다.
  //   벽시계를 쓰면 정지 화면에서 플래시가 혼자 사라진다 — "멈췄다"는 약속을 깬다.
  const c = createFeedbackClock();
  c.advance(1.0);
  const t = c.now();
  for (let i = 0; i < 60; i++) { /* draw 만 도는 상황 */ }
  assert.equal(c.now(), t, 'draw 를 아무리 돌려도 불변');
  c.advance(0.016);
  assert.ok(c.now() > t, 'update 가 재개되면 다시 증가');
});

test('G39-CLOCK-GUARD: 비정상 dt 를 무시한다', () => {
  const c = createFeedbackClock();
  c.advance(0.1);
  const t = c.now();
  for (const bad of [NaN, undefined, null, -1, Infinity]) c.advance(bad);
  assert.equal(c.now(), t, `비정상 dt 로 시간이 변했다 — ${c.now()}`);
});

test('G39-CLOCK-RESET: 새 출격에서 0 으로 돌아간다', () => {
  const c = createFeedbackClock();
  c.advance(5);
  c.reset();
  assert.equal(c.now(), 0);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/g39-feedback-clock.test.mjs`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

```js
// js/feedback-clock.js
// ── §G-39 — 피드백 전용 **게임 누적 시계** ─────────────────────────────────────────────
//
//  왜 벽시계가 아닌가:
//   `main.js:3616` 은 일시정지 중 `update()` 만 건너뛰고 `draw()` 는 계속 돈다.
//   벽시계(`performance.now()`·`frame(t)`)를 쓰면 정지 화면에서 플래시가 혼자 사라진다 —
//   "멈췄다"는 약속을 깬다. dt 누적이면 update 가 멈출 때 시간도 함께 멈춘다.
//
//  ⚠️`advance()` 는 반드시 **실제 update guard 안**에서 부른다.
//   `frame()` 상단에서 부르면 pause 중에도 rAF·dt 가 계속 와서 시간이 흐른다.

export function createFeedbackClock() {
  let t = 0;
  return {
    now() { return t; },
    advance(dt) { if (Number.isFinite(dt) && dt > 0) t += dt; },
    reset() { t = 0; },
  };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/g39-feedback-clock.test.mjs`
Expected: PASS — 4 tests

- [ ] **Step 5: `main.js` 에 배선한다**

`main.js` 상단 import 에 추가:

```js
import { createFeedbackClock } from './feedback-clock.js';
```

모듈 스코프에 인스턴스를 만든다(`const chaseCamX = ...` 근처):

```js
//  §G-39: 충돌 기록(update)과 렌더 읽기(draw)가 **같은 시간**을 본다.
const feedbackClock = createFeedbackClock();
```

`frame()` 의 update guard 안에서만 전진시킨다 — **3616행을 다음으로 바꾼다**:

```js
    //  §G-39 §12-3: 시간 증가는 **실제 update 안**에서만. frame() 상단에 두면 pause 중에도 흐른다.
    if (!paused && !drafting && !betweenStages) { feedbackClock.advance(dt); update(dt); }
    draw();
```

`startPlay()` 에서 초기화한다(`camera.target = DEFAULT_ZOOM;` 옆):

```js
  feedbackClock.reset();   // §G-39: 새 출격은 피드백 시계도 0 부터
```

- [ ] **Step 6: 배선 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: 기존 실패 0

---

### Task 5: 공용 impact helper — 두 충돌 분기 배선

**Files:**
- Modify: `js/main.js` (보스 분기 2685~2703 · 일반 적 분기 2705~2731)
- Test: `tests/g39-impact-helper.test.mjs`

**Interfaces:**
- Consumes: `recordDamageFeedback` (Task 2) · `effects.hitSpark` (Task 3) · `feedbackClock` (Task 4)
- Produces: `js/impact-feedback.js` → `impactPolicy(projectile) → { kind, count, speed, color }` · `emitProjectileImpactFeedback(target, projectile, x, y, effective, world, now, deps)`

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
// tests/g39-impact-helper.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { impactPolicy, emitProjectileImpactFeedback, IMPACT } from '../js/impact-feedback.js';

const fakeFx = () => { const c = { spark: 0, burst: 0 }; return { c,
  hitSpark: () => { c.spark++; return true; }, burst: () => { c.burst++; } }; };

test('G39-IMPACT-POLICY: 무기별 정책이 kind 하나에 의존하지 않는다', () => {
  //  ⚠️진화형·공명은 kind 가 같아도 소스가 다르다. sourceWeaponId 를 함께 본다.
  assert.equal(impactPolicy({ kind: 'vulcan' }).kind, 'spark');
  assert.equal(impactPolicy({ kind: 'laser' }).kind, 'spark');
  assert.equal(impactPolicy({ kind: 'homing' }).kind, 'none', '미사일은 기존 폭발이 담당');
  assert.equal(impactPolicy({ sourceWeaponId: 'vulcan' }).kind, 'spark', 'kind 없어도 소스로 판단');
  assert.equal(impactPolicy({ lance: true }).kind, 'none', '랜스는 경로 연출이 담당');
});

test('G39-IMPACT-COUNTS: 발칸·레이저 한 적중당 입자 수가 확정값이다', () => {
  assert.equal(impactPolicy({ kind: 'vulcan' }).count, IMPACT.vulcanParticles);
  assert.equal(impactPolicy({ kind: 'laser' }).count, IMPACT.laserParticles);
  assert.equal(IMPACT.vulcanParticles, 2);
  assert.equal(IMPACT.laserParticles, 2);
});

test('G39-IMPACT-NO-DOUBLE-MISSILE: 미사일은 스파크를 추가하지 않는다', () => {
  //  ⚠️기존 폭발과 겹치면 중복이다.
  const fx = fakeFx();
  emitProjectileImpactFeedback({ hp: 5, maxHp: 10 }, { kind: 'homing' }, 0, 0, 3, { effects: fx }, 1);
  assert.equal(fx.c.spark, 0, '미사일에 스파크 없음');
  assert.equal(fx.c.burst, 0, '이 helper 가 폭발을 또 만들지 않음');
});

test('G39-IMPACT-EFFECTIVE-GATE: 실효 피해 0 이면 아무것도 안 만든다', () => {
  const fx = fakeFx();
  emitProjectileImpactFeedback({ hp: 5, maxHp: 10 }, { kind: 'vulcan' }, 0, 0, 0, { effects: fx }, 1);
  assert.equal(fx.c.spark, 0);
});

test('G39-IMPACT-FRAME-BUDGET: 프레임당 신규 생성 상한을 지킨다', () => {
  //  관통 레이저가 한 프레임에 여러 적을 맞혀도 폭주하지 않아야 한다.
  const fx = fakeFx();
  for (let i = 0; i < 200; i++) {
    emitProjectileImpactFeedback({ hp: 9, maxHp: 10 }, { kind: 'laser' }, 0, 0, 1, { effects: fx }, 1);
  }
  assert.ok(fx.c.spark <= IMPACT.perFrame, `프레임당 ${fx.c.spark} — ${IMPACT.perFrame} 이하`);
});

test('G39-IMPACT-FRAME-RESET: 다음 프레임이면 예산이 회복된다', () => {
  const fx = fakeFx();
  for (let i = 0; i < 200; i++) emitProjectileImpactFeedback({ hp: 9, maxHp: 10 }, { kind: 'laser' }, 0, 0, 1, { effects: fx }, 1);
  const first = fx.c.spark;
  for (let i = 0; i < 200; i++) emitProjectileImpactFeedback({ hp: 9, maxHp: 10 }, { kind: 'laser' }, 0, 0, 1, { effects: fx }, 2);
  assert.ok(fx.c.spark > first, '새 프레임에서 다시 생성된다');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/g39-impact-helper.test.mjs`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

```js
// js/impact-feedback.js
// ── §G-39 — 발사체 명중 피드백(공용) ──────────────────────────────────────────────────
//
//  ⚠️일반 적과 보스는 **서로 다른 충돌 분기**다(main.js:2685 보스 / 2705 일반).
//   한쪽만 고치면 보스를 맞힌 발칸·레이저의 불꽃이 빠진다. 두 분기가 이 helper 를 부른다.
//  ⚠️2D effects 는 3D 로 투영되므로 여기서 **한 번만** 만든다. 3D 전용 불꽃을 따로 만들지 않는다.
import { recordDamageFeedback } from './damage-feedback.js';

/** 확정 수치(설계 §6-2). */
export const IMPACT = {
  vulcanParticles: 2,
  laserParticles: 2,
  perFrame: 24,          // 프레임당 신규 hit-spark 상한
  sparkSpeed: 90,
  vulcanColor: '#ffe08a',
  laserColor: '#bff4ff',
};

/**
 * 무기 정책. ⚠️`kind` 하나에 의존하지 않는다 — 진화형·공명은 kind 가 같아도 소스가 다르다.
 *  @returns `{ kind: 'spark'|'none', count, speed, color }`
 */
export function impactPolicy(projectile) {
  const p = projectile || {};
  if (p.lance || p.echo || p.blast) return { kind: 'none', count: 0, speed: 0, color: '' };
  const id = p.sourceWeaponId || p.kind || '';
  if (id === 'homing') return { kind: 'none', count: 0, speed: 0, color: '' };   // 기존 폭발이 담당
  if (id === 'laser') return { kind: 'spark', count: IMPACT.laserParticles, speed: IMPACT.sparkSpeed, color: IMPACT.laserColor };
  if (id === 'vulcan') return { kind: 'spark', count: IMPACT.vulcanParticles, speed: IMPACT.sparkSpeed, color: IMPACT.vulcanColor };
  return { kind: 'none', count: 0, speed: 0, color: '' };
}

let _frameKey = -1, _frameUsed = 0;

/**
 * 실효 피해가 있을 때만 몸체 플래시를 기록하고 명중 스파크를 만든다.
 *  @param effective `hpBefore − hpAfter`
 *  @param now       게임 누적 시간(초) — 프레임 예산 키로도 쓴다
 */
export function emitProjectileImpactFeedback(target, projectile, x, y, effective, world, now) {
  if (!(effective > 0)) return;
  //  ① 몸체 플래시 — 쿨다운·대상 판정은 사이드카가 한다.
  const fired = recordDamageFeedback(target, x, y, now, effective);
  //  ② 명중 스파크 — 플래시가 실제로 발동한 순간에만(같은 쿨다운을 공유해 연사 폭주를 막는다).
  if (!fired) return;
  const pol = impactPolicy(projectile);
  if (pol.kind !== 'spark') return;
  if (_frameKey !== now) { _frameKey = now; _frameUsed = 0; }
  if (_frameUsed >= IMPACT.perFrame) return;
  const fx = world && world.effects;
  if (!fx || typeof fx.hitSpark !== 'function') return;
  //  seed 는 위치·시간에서 유도 — 전역 RNG 를 쓰지 않는다.
  const seed = ((x * 73856093) ^ (y * 19349663) ^ (_frameUsed * 83492791)) | 0;
  if (fx.hitSpark(x, y, pol.color, pol.count, pol.speed, seed)) _frameUsed += pol.count;
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/g39-impact-helper.test.mjs`
Expected: PASS — 6 tests

- [ ] **Step 5: `main.js` 두 분기에 배선한다**

import 추가:

```js
import { emitProjectileImpactFeedback } from './impact-feedback.js';
```

**보스 분기** — `tallyBulletDamage(...)` 줄 **바로 아래**에 추가:

```js
          //  §G-39: 보스도 같은 helper 를 쓴다(일반 적 분기만 고치면 보스 불꽃이 빠진다).
          emitProjectileImpactFeedback(bo, b, b.x, b.y, Math.max(0, hpBefore - bo.hp), w, feedbackClock.now());
```

**일반 적 분기** — `tallyBulletDamage(...)` 줄 **바로 아래**에 추가:

```js
        emitProjectileImpactFeedback(e, b, b.x, b.y, Math.max(0, hpBefore - (e.hp ?? 0)), w, feedbackClock.now());
```

⚠️기존 `if (b.kind === 'homing') w.effects.burst(...)` 줄은 **그대로 둔다**(미사일 폭발 유지).

- [ ] **Step 6: 전체 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: 기존 실패 0

---

### Task 6: 적 버퍼 색 채널 + `put3D` 기록

**Files:**
- Modify: `js/main.js` (`_sw` 생성 3055 · `put3D()` 3099~3110)
- Test: `tests/g39-put3d-color.test.mjs`

**Interfaces:**
- Consumes: `writeDamageColor`·`FEEDBACK` (Task 1) · `readDamageFlash` (Task 2) · `feedbackClock` (Task 4)
- Produces: 적 슬롯이 `{ sx, sy, px, wob, cr, cg, cb }` 를 갖는다

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
// tests/g39-put3d-color.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEEDBACK, writeDamageColor, recordDamageFeedback, readDamageFlash } from '../js/damage-feedback.js';

test('G39-SLOT-SHAPE: 적 버퍼 슬롯이 색 채널을 갖는다', () => {
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(src, /sx: 0, sy: 0, px: 0, wob: 0, cr: 1, cg: 1, cb: 1/,
    '적 슬롯에 cr/cg/cb 초기값 1 이 있어야 한다(초기값 0 이면 검게 나온다)');
});

test('G39-SLOT-PIPELINE: 체력·피격이 슬롯 색으로 이어진다(경로 재현)', () => {
  //  put3D 가 하는 계산을 그대로 재현해 값이 실제로 달라지는지 본다.
  const slot = { cr: 1, cg: 1, cb: 1 };
  const enemy = { hp: 10, maxHp: 10 };
  const paint = (now) => writeDamageColor(slot, enemy.hp / enemy.maxHp,
    readDamageFlash(enemy, now), FEEDBACK.boost);

  paint(1); const full = [slot.cr, slot.cg, slot.cb].join();
  enemy.hp = 2; paint(1); const low = [slot.cr, slot.cg, slot.cb].join();
  assert.notEqual(full, low, '체력이 줄면 색이 달라야 한다');

  recordDamageFeedback(enemy, 0, 0, 5, 3);
  paint(5); const hit = [slot.cr, slot.cg, slot.cb].join();
  assert.notEqual(low, hit, '피격 직후 색이 달라야 한다');
  paint(5 + FEEDBACK.flashDur); const after = [slot.cr, slot.cg, slot.cb].join();
  assert.equal(after, low, '플래시가 끝나면 체력 색으로 돌아온다');
});

test('G39-SLOT-NO-ALLOC: put3D 경로에 객체·배열 생성이 없다', () => {
  //  ⚠️적 수만큼 매 프레임 임시 객체가 생기면 GC 압력이 된다.
  const src = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const fn = src.slice(src.indexOf('function put3D'), src.indexOf('function put3D') + 1400);
  assert.ok(!/=\s*\{[^}]/.test(fn.replace(/\/\/[^\n]*/g, '')), 'put3D 안에서 객체 리터럴 생성 금지');
  assert.ok(!/new (Array|THREE\.Color)/.test(fn), 'put3D 안에서 new Array/Color 금지');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/g39-put3d-color.test.mjs`
Expected: FAIL — 슬롯에 `cr` 없음

- [ ] **Step 3: `main.js` 를 고친다**

import 추가:

```js
import { FEEDBACK, writeDamageColor, readDamageFlash } from './damage-feedback.js';
```

적 슬롯 생성(3055행)을 바꾼다:

```js
  ...Object.fromEntries(Object.keys(ENEMY3D).map((k) => [k, { buf: Array.from({ length: ENEMY3D[k].cap }, () => ({ sx: 0, sy: 0, px: 0, wob: 0, cr: 1, cg: 1, cb: 1 })), n: 0 }])),
```

⚠️초기값은 **1** 이다. 0 이면 아직 색을 안 쓴 인스턴스가 검게 나온다.

프레임당 한 번만 계산할 값을 draw 초입에 둔다(`const _now = performance.now();` 근처):

```js
  //  §G-39: reduced-motion 은 **프레임당 한 번**. 적마다 matchMedia 를 부르지 않는다.
  const _fbNow = feedbackClock.now();
  const _fbBoost = save.get().reducedMotion ? FEEDBACK.boostReduced : FEEDBACK.boost;
```

`put3D()` 의 `o.wob = wob;` 다음 줄에 추가:

```js
  //  §G-39: 체력·피격을 색으로. ⚠️새 객체를 만들지 않고 슬롯에 직접 쓴다.
  writeDamageColor(o, (e.maxHp > 0 ? e.hp / e.maxHp : 1), readDamageFlash(e, _fbNow), _fbBoost);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/g39-put3d-color.test.mjs`
Expected: PASS — 3 tests

- [ ] **Step 5: 전체 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: 기존 실패 0

---

### Task 7: hero `placeSwarm` 색 적용 + 국소 폴백

**Files:**
- Modify: `js/chase3d-renderer.js` (`makeGlbSwarm` 161~179 · `placeSwarm` 색 블록 ~605 · 적 스웜 생성 ~181)
- Test: `tests/g39-swarm-color-fallback.test.mjs`

**Interfaces:**
- Consumes: Task 6 의 슬롯 `cr/cg/cb`
- Produces: 적 스웜이 `colored` 를 갖고, 색 실패 시 **그 스웜만** `colored=false` 로 떨어진다

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
// tests/g39-swarm-color-fallback.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = () => readFileSync(new URL('../js/chase3d-renderer.js', import.meta.url), 'utf8');

test('G39-SWARM-SETRGB: 색은 setRGB 로 쓴다(setHex 는 1 초과를 못 담는다)', () => {
  //  ⚠️setHex 는 24비트 색이라 번쩍(>1)을 전달할 수 없다.
  const s = SRC();
  const fn = s.slice(s.indexOf('function placeSwarm'), s.indexOf('function placeSwarm') + 3000);
  assert.match(fn, /setRGB\(/, 'placeSwarm 이 setRGB 를 써야 한다');
});

test('G39-SWARM-LOCAL-FALLBACK: 색 실패가 3D 전체를 죽이지 않는다', () => {
  //  ⚠️frame() 안의 예외는 degraded=true·available=false 로 이어져 세션 3D 가 통째로 꺼진다
  //   (chase3d-renderer.js:901). 색 갱신은 반드시 국소 격리돼야 한다.
  const s = SRC();
  const fn = s.slice(s.indexOf('function placeSwarm'), s.indexOf('function placeSwarm') + 3000);
  assert.match(fn, /try\s*\{[\s\S]{0,400}setColorAt[\s\S]{0,400}\}\s*catch/,
    '색 쓰기가 try/catch 로 격리돼야 한다');
  assert.match(fn, /colored\s*=\s*false/, '실패하면 그 스웜의 색 기능만 끈다');
});

test('G39-SWARM-ALL-PARTS: 같은 인스턴스의 모든 파트에 색을 쓴다', () => {
  //  ⚠️한 파트만 칠하면 몸통만 붉어진다(적 GLB 는 여러 InstancedMesh 파트다).
  const s = SRC();
  const fn = s.slice(s.indexOf('function placeSwarm'), s.indexOf('function placeSwarm') + 3000);
  assert.match(fn, /for \(const im of sw\.meshes\)[\s\S]{0,600}setColorAt/,
    '메시 루프 안에서 setColorAt 을 해야 한다');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/g39-swarm-color-fallback.test.mjs`
Expected: FAIL — `setRGB` 없음

- [ ] **Step 3: `chase3d-renderer.js` 를 고친다**

`makeGlbSwarm` 의 `attach` 에서 색 기능을 **probe** 한다:

```js
    const attach = (parts) => {
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, def.cap);
        im.count = 0; im.frustumCulled = false;
        scene.add(im); sw.meshes.push(im);
      }
      //  §G-39: 색 기능을 미리 확인한다. 실패하면 이 스웜만 색 없이 간다(3D 는 유지).
      try {
        _sCol.setRGB(1, 1, 1);
        for (const im of sw.meshes) for (let i = 0; i < def.cap; i++) im.setColorAt(i, _sCol);
        sw.colored = true;
      } catch (e) { sw.colored = false; }
    };
```

`placeSwarm` 의 인스턴스 루프에서 색을 쓴다. 기존 `if (sw.colored && o.col >= 0)` 블록을 다음으로 바꾼다:

```js
        //  §G-39: 적·픽업의 피해 색. ⚠️setHex 는 1 초과를 못 담아 번쩍이 안 된다 → setRGB.
        if (sw.colored) {
          try {
            if (o.cr !== undefined) _sCol.setRGB(o.cr, o.cg, o.cb);
            else if (o.col >= 0) _sCol.setHex(o.col);
            else _sCol.setRGB(1, 1, 1);
            for (const im of sw.meshes) im.setColorAt(i, _sCol);
          } catch (e) {
            //  ⚠️여기서 예외가 밖으로 나가면 frame() catch 가 3D 전체를 끈다. 국소 격리.
            sw.colored = false;
          }
        }
```

메시 갱신 플래그도 전 파트에:

```js
      if (count) {
        for (const im of sw.meshes) {
          im.instanceMatrix.needsUpdate = true;
          if (sw.colored && im.instanceColor) im.instanceColor.needsUpdate = true;
        }
      }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/g39-swarm-color-fallback.test.mjs`
Expected: PASS — 3 tests

- [ ] **Step 5: 전체 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: 기존 실패 0

---

### Task 8: hero 적 `instanceColor` 실행 테스트 seam

**Files:**
- Modify: `js/chase3d-renderer.js` (`createHero3D` opts · 적 스웜 생성)
- Test: `tests/g39-hero-instance-color.test.mjs`

**Interfaces:**
- Consumes: Task 6·7
- Produces: `createChase3D(canvas, { hero, createRenderer, createEnemyParts })`

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
// tests/g39-hero-instance-color.test.mjs
//  ⚠️금지: THREE 전체 mock · meshes 가 빈 채 "예외 없음"만 확인 · 소스에서 setColorAt 문자열만 확인 ·
//   legacy buildSnapshot 테스트를 배선 근거로 사용.
//  실제 GLB 재질·emissiveMap·톤매핑 결과는 여기서 증명하지 않는다 — 브라우저 WebGL 게이트 담당.
import test from 'node:test';
import assert from 'node:assert/strict';

/** 실제 THREE 로 만든 얇은 적 파트 팩토리(파트 2개 = 다중 파트 검증용). */
async function twoPartFactory(THREE) {
  return () => [0, 1].map(() => ({
    geo: new THREE.BoxGeometry(1, 1, 1),
    mat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  }));
}

test('G39-HERO-INSTANCE-COLOR: 실제 적이 배치되고 체력·피격이 색으로 나온다', async () => {
  const THREE = await import('../js/vendor/three.module.js');
  const { createChase3D } = await import('../js/chase3d-renderer.js');
  const { makeCanvas, makeFakeRenderer } = await import('./lib/frame-smoke-harness.mjs');

  const ctl = createChase3D(makeCanvas(), {
    hero: true, profile: { mobile: false, lod: 0, pixelRatio: 1 },
    createRenderer: (T, c) => makeFakeRenderer(T, c),
    createEnemyParts: await twoPartFactory(THREE),
  });

  const mk = (cr, cg, cb) => ({ sx: 240, sy: 500, px: 60, wob: 0, cr, cg, cb });
  const run = { squad: { x: 240, y: 670, dead: false, tier: 0, weapon: 'vulcan', weaponLv: 1,
    count: 8, cruisers: 0, hp: 100, maxHp: 100, charge: 0, chargeStage: 0, escortsFor3D: () => 0 },
    phase: 'track', world: { squad: {}, entities: [], bullets: [], enemyBullets: [] }, bosses: [] };
  const swarms = { props: {}, drone: { buf: [], n: 0 }, cruiser: { buf: [], n: 0 } };

  const paint = (slot) => { swarms.b1 = { buf: [slot], n: 1 };
    ctl.frame(run, 2.2, 480, 800, 480, 800, 1, 0, swarms); };

  paint(mk(1, 1, 1));
  const meshes = ctl.debugEnemyMeshes ? ctl.debugEnemyMeshes('b1') : [];
  assert.ok(meshes.length >= 2, `다중 파트가 있어야 한다 — 실측 ${meshes.length}`);
  assert.ok(meshes[0].instanceColor, 'instanceColor 가 실제로 생성돼야 한다');

  const read = (im, i) => { const c = new THREE.Color(); im.getColorAt(i, c); return [c.r, c.g, c.b]; };
  const full = read(meshes[0], 0);

  //  ⚠️needsUpdate 는 boolean 필드가 아니라 version 을 올리는 setter 다 — version 으로 본다.
  const v0 = meshes[0].instanceColor.version;
  paint(mk(1, 0.35, 0.28));                       // 저체력
  const low = read(meshes[0], 0);
  assert.notDeepEqual(low, full, '체력이 낮으면 색이 달라야 한다');
  assert.ok(meshes[0].instanceColor.version > v0, 'instanceColor.version 이 올라야 한다');

  paint(mk(2.4, 2.4, 2.4));                       // 피격 번쩍
  const flash = read(meshes[0], 0);
  assert.notDeepEqual(flash, low, '피격 직후 색이 달라야 한다');

  //  ⭐다중 파트 전부 같은 색이어야 한다 — 한 파트만 칠하면 몸통만 붉어진다.
  for (const im of meshes) assert.deepEqual(read(im, 0), flash, '전 파트 동일 색');

  assert.equal(ctl.degraded, false, `degraded 면 안 된다 — ${ctl.reason}`);
});

test('G39-HERO-COLOR-FAULT: setColorAt 장애가 3D 전체를 죽이지 않는다', async () => {
  const THREE = await import('../js/vendor/three.module.js');
  const { createChase3D } = await import('../js/chase3d-renderer.js');
  const { makeCanvas, makeFakeRenderer } = await import('./lib/frame-smoke-harness.mjs');

  //  setColorAt 이 항상 던지는 파트를 주입한다.
  const badFactory = () => () => [{
    geo: new THREE.BoxGeometry(1, 1, 1),
    mat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    __breakColor: true,
  }];
  const ctl = createChase3D(makeCanvas(), {
    hero: true, profile: { mobile: false, lod: 0, pixelRatio: 1 },
    createRenderer: (T, c) => makeFakeRenderer(T, c),
    createEnemyParts: badFactory(),
  });
  const meshes = ctl.debugEnemyMeshes ? ctl.debugEnemyMeshes('b1') : [];
  for (const im of meshes) im.setColorAt = () => { throw new Error('color-fault'); };

  const run = { squad: { x: 240, y: 670, dead: false, tier: 0, weapon: 'vulcan', weaponLv: 1,
    count: 8, cruisers: 0, hp: 100, maxHp: 100, charge: 0, chargeStage: 0, escortsFor3D: () => 0 },
    phase: 'track', world: { squad: {}, entities: [], bullets: [], enemyBullets: [] }, bosses: [] };
  const swarms = { props: {}, drone: { buf: [], n: 0 }, cruiser: { buf: [], n: 0 },
    b1: { buf: [{ sx: 240, sy: 500, px: 60, wob: 0, cr: 1, cg: 0.4, cb: 0.3 }], n: 1 } };

  ctl.frame(run, 2.2, 480, 800, 480, 800, 1, 0, swarms);
  ctl.frame(run, 2.2, 480, 800, 480, 800, 1.016, 0, swarms);

  assert.equal(ctl.degraded, false, `색 실패로 3D 가 꺼지면 안 된다 — ${ctl.reason}`);
  assert.equal(ctl.available, true, 'hero 3D 는 유지된다');
  assert.equal(ctl.info().b1Count, 1, '적은 여전히 배치된다(색만 원본)');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/g39-hero-instance-color.test.mjs`
Expected: FAIL — `createEnemyParts` 미지원 / `debugEnemyMeshes` 없음

- [ ] **Step 3: seam 을 만든다**

먼저 기존 스모크의 스텁을 공용 모듈로 뺀다 — `tests/g35-frame-smoke.test.mjs` 의 `makeFakeRenderer`·`makeCanvas` 를 `tests/lib/frame-smoke-harness.mjs` 로 옮기고 export 한 뒤, 원본은 그것을 import 한다. ⚠️로직을 복사하지 않는다(사본이 갈리면 한쪽만 통과한다).

`chase3d-renderer.js` 의 적 스웜 생성에 팩토리 주입을 연다:

```js
  const eswarm = {};
  //  §G-39: 테스트가 실제 THREE 로 만든 얇은 파트를 주입할 수 있게 한다.
  //   ⚠️GLB 는 비동기 로드라 headless 에서 meshes 가 비고, 그러면 ready.enemy() 가 거짓이라
  //    적이 3D 버퍼에 들어가지 않는다 — 배선을 실행으로 검증할 수 없다.
  const enemyPartsFactory = opts.createEnemyParts || null;
  for (const k of ENEMY_KEYS) {
    const def = ENEMY3D[k];
    if (enemyPartsFactory) {
      const sw = { meshes: [], count: 0 };
      const parts = enemyPartsFactory(k, def);
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geo, part.mat, def.cap);
        im.count = 0; im.frustumCulled = false; scene.add(im); sw.meshes.push(im);
      }
      try { _sCol.setRGB(1, 1, 1); for (const im of sw.meshes) for (let i = 0; i < def.cap; i++) im.setColorAt(i, _sCol); sw.colored = true; }
      catch (e) { sw.colored = false; }
      eswarm[k] = sw;
      continue;
    }
    // …기존 경로 그대로…
  }
```

진단 훅을 노출한다(`ctl.info = info;` 근처):

```js
  //  §G-39 테스트 전용 — 배치된 적 메시를 들여다본다(다중 파트·instanceColor 검증).
  ctl.debugEnemyMeshes = (k) => (eswarm[k] ? eswarm[k].meshes : []);
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/g39-hero-instance-color.test.mjs`
Expected: PASS — 2 tests

- [ ] **Step 5: 전체 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: 기존 실패 0 (g35 스모크가 공용 harness 로 바뀐 뒤에도 통과)

---

### Task 9: 2D 몸체 플래시 (body clip)

**Files:**
- Modify: `js/main.js` (`drawEntityFaded` 2992~2996 · `drawBossFaded` 2997~3001)
- Test: `tests/g39-2d-flash.test.mjs`

**Interfaces:**
- Consumes: `readDamageFlash` (Task 2) · `feedbackClock` (Task 4)
- Produces: `js/damage-flash-2d.js` → `drawWithDamageFlash(ctx, entity, drawBody, flash, fadeAlpha)`

- [ ] **Step 1: 실패 테스트를 쓴다**

```js
// tests/g39-2d-flash.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { drawWithDamageFlash } from '../js/damage-flash-2d.js';

/** Canvas2D 스텁 — 호출 순서와 상태 변화를 기록한다. */
function stubCtx() {
  const log = [];
  const st = { globalAlpha: 1, globalCompositeOperation: 'source-over' };
  return { log, state: st,
    save() { log.push(['save', st.globalAlpha, st.globalCompositeOperation]); },
    restore() { log.push(['restore']); st.globalAlpha = 1; st.globalCompositeOperation = 'source-over'; },
    beginPath() { log.push(['beginPath']); }, arc() { log.push(['arc']); }, clip() { log.push(['clip']); },
    set globalAlpha(v) { st.globalAlpha = v; log.push(['alpha', v]); }, get globalAlpha() { return st.globalAlpha; },
    set globalCompositeOperation(v) { st.globalCompositeOperation = v; log.push(['gco', v]); },
    get globalCompositeOperation() { return st.globalCompositeOperation; },
  };
}

test('G39-2D-NO-FLASH: flash 0 이면 본체를 한 번만 그린다', () => {
  const ctx = stubCtx(); let draws = 0;
  drawWithDamageFlash(ctx, { x: 0, y: 0, r: 10 }, () => draws++, 0, 1);
  assert.equal(draws, 1, '추가 pass 없음');
  assert.equal(ctx.log.filter((l) => l[0] === 'gco').length, 0, '합성 모드를 건드리지 않는다');
});

test('G39-2D-FLASH-PASS: flash > 0 이면 clip 안에서 한 번 더 그린다', () => {
  const ctx = stubCtx(); let draws = 0;
  drawWithDamageFlash(ctx, { x: 5, y: 6, r: 10 }, () => draws++, 1, 1);
  assert.equal(draws, 2, '본체 + 플래시 pass');
  const kinds = ctx.log.map((l) => l[0]);
  assert.ok(kinds.includes('clip'), '⚠️clip 이 없으면 HP 바·보호막·예고선까지 번쩍인다');
  assert.ok(kinds.includes('gco'), 'additive 합성을 쓴다');
  assert.equal(ctx.log.filter((l) => l[0] === 'save').length,
    ctx.log.filter((l) => l[0] === 'restore').length, 'save/restore 짝이 맞아야 한다');
});

test('G39-2D-NO-LEAK: 끝난 뒤 합성 상태가 남지 않는다', () => {
  //  ⚠️globalCompositeOperation·globalAlpha·clip 이 다음 개체와 HUD 로 새면 안 된다.
  const ctx = stubCtx();
  drawWithDamageFlash(ctx, { x: 0, y: 0, r: 10 }, () => {}, 1, 1);
  assert.equal(ctx.state.globalCompositeOperation, 'source-over');
  assert.equal(ctx.state.globalAlpha, 1);
});

test('G39-2D-FADE-COMPOSE: 진입 페이드와 곱한다', () => {
  //  화면 위로 절반만 들어온 적이 전체 밝기로 번쩍이면 안 된다.
  const a = stubCtx(), b = stubCtx();
  drawWithDamageFlash(a, { x: 0, y: 0, r: 10 }, () => {}, 1, 1.0);
  drawWithDamageFlash(b, { x: 0, y: 0, r: 10 }, () => {}, 1, 0.4);
  const alphaOf = (c) => Math.max(...c.log.filter((l) => l[0] === 'alpha').map((l) => l[1]));
  assert.ok(alphaOf(b) < alphaOf(a), `페이드 0.4 가 더 어두워야 한다 — ${alphaOf(b)} vs ${alphaOf(a)}`);
});

test('G39-2D-CLIP-RADIUS: damageFlashRadius 가 있으면 그것을 쓴다', () => {
  const ctx = stubCtx();
  drawWithDamageFlash(ctx, { x: 0, y: 0, r: 10, damageFlashRadius: 30 }, () => {}, 1, 1);
  assert.ok(ctx.log.some((l) => l[0] === 'arc'), 'clip 원을 그린다');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `node --test tests/g39-2d-flash.test.mjs`
Expected: FAIL — 모듈 없음

- [ ] **Step 3: 최소 구현**

```js
// js/damage-flash-2d.js
// ── §G-39 — 2D 몸체 피격 플래시 ────────────────────────────────────────────────────────
//
//  ⚠️`e.draw()` 를 그대로 재호출하면 **몸체만 밝아지지 않는다.** 적 draw 는 한 함수에서
//   HP 바·보호막 호·충전 예고선·affix 표식까지 함께 그린다:
//       Creature(2663) 몸체+HP+affix / Bomber(3708) +사격예고 / Zapper(3732) +충전선 / Shielder(3777) +보호막 호
//   그대로 additive 하면 **체력바까지 번쩍여 판독이 왜곡**된다.
//  → 두 번째 pass 에 **body clip** 을 걸어 몸체 범위만 밝힌다.
//
//  ⚠️`source-atop` 이나 사각형 덮기는 이미 그려진 다른 개체·배경까지 물들인다.
//   본체를 자기 알파로 한 번 더 그리면 그 개체 픽셀에만 더해진다.

/**
 * @param drawBody   본체를 그리는 함수(보통 `() => e.draw(ctx)`)
 * @param flash      0..1
 * @param fadeAlpha  상단 진입 페이드 알파(없으면 1)
 */
export function drawWithDamageFlash(ctx, entity, drawBody, flash, fadeAlpha = 1) {
  drawBody();                                  // ① 평소대로 한 번 — 기존 동작 불변
  if (!(flash > 0)) return;
  const r = entity.damageFlashRadius || entity.r || 20;
  ctx.save();
  try {
    ctx.beginPath();
    ctx.arc(entity.x, entity.y, r, 0, Math.PI * 2);
    ctx.clip();                                // ② 몸체 범위로 제한 — HP 바·예고선 제외
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.max(0, Math.min(1, fadeAlpha)) * Math.min(1, flash) * 0.85;
    drawBody();                                // ③ 같은 본체를 자기 알파 안에서 한 번 더
  } finally {
    ctx.restore();                             // ④ ⚠️상태가 다음 개체·HUD 로 새지 않게
  }
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `node --test tests/g39-2d-flash.test.mjs`
Expected: PASS — 5 tests

- [ ] **Step 5: `main.js` 에 배선한다**

import 추가:

```js
import { drawWithDamageFlash } from './damage-flash-2d.js';
```

`drawEntityFaded` 를 바꾼다:

```js
function drawEntityFaded(ctx, e) {
  const fz = (e.r || 24) * 2;
  //  §G-39: 피격 플래시를 공통 경계에서 얹는다(엔티티 클래스마다 흩뿌리지 않는다).
  const fl = readDamageFlash(e, feedbackClock.now());
  if (e.y < fz) {
    const a = e.y / fz; if (a <= 0.02) return;
    ctx.save(); ctx.globalAlpha = a;
    drawWithDamageFlash(ctx, e, () => e.draw(ctx), fl, a);
    ctx.restore();
  } else drawWithDamageFlash(ctx, e, () => e.draw(ctx), fl, 1);
}
```

`drawBossFaded` 도 같은 방식으로 바꾼다(보스도 같은 wrapper 를 쓴다):

```js
function drawBossFaded(ctx, b) {
  const fz = (b.r || 40) * 2;
  const fl = readDamageFlash(b, feedbackClock.now());
  if (b.y > 0 && b.y < fz) {
    const a = Math.max(0.05, b.y / fz);
    ctx.save(); ctx.globalAlpha = a;
    drawWithDamageFlash(ctx, b, () => b.draw(ctx), fl, a);
    ctx.restore();
  } else drawWithDamageFlash(ctx, b, () => b.draw(ctx), fl, 1);
}
```

⚠️hero 3D 로 올라가 `skipEntity` 된 적은 이 경로를 타지 않으므로 이중 표시가 없다.

- [ ] **Step 6: 전체 확인**

Run: `node --test "tests/*.test.mjs"`
Expected: 기존 실패 0

---

### Task 10: 실기 검증 — WebGL 캡처 · 회귀 · 성능

**Files:**
- Create: `docs/qa/g39/` (캡처·JSON·README)
- Modify: 없음(측정만)

**Interfaces:**
- Consumes: Task 1~9 전부
- Produces: 완료보고서 산출물

- [ ] **Step 1: dist 를 새로 만든다**

프리뷰 서버가 dist 를 잡고 있으면 빌드가 실패한다. **서버 중지 → 빌드 → 전체 테스트 → 서버 재시작** 순서를 지킨다.

Run: `node scripts/build-crazygames-basic.mjs`
Expected: `[OK] 빌드 성공`

- [ ] **Step 2: 패키지 8개 포함 전체 테스트**

Run: `node --test "tests/*.test.mjs"`
Expected: 전부 통과 · 실패 0

- [ ] **Step 3: 실제 재질 캡처 (설계 §5 격자)**

브라우저에서 `window.__NF3D` 훅으로 프레임을 구동해 캡처한다.

```text
재질:  GLB(Standard+emissiveMap) / 빌보드(MeshBasicMaterial)
HP:    100% / 66% / 33% / 10%
flash: 0 / 최대
배경:  밝은 구간 / 어두운 구간
모델:  단일 파트 / 다중 파트
거리:  가까운 적 / 먼 적
```

육안 판정: 적 종류 구별 가능 · 저체력이 거리 변화 중에도 읽힘 · 저체력+플래시가 회색으로 뭉개지지 않음 · emissive 파트와 비발광 파트가 따로 놀지 않음 · 빌보드와 GLB 강도 차가 과하지 않음.

⚠️한 채널로 두 효과가 안 되면 **여기서 멈추고** HP 틴트(instanceColor)와 순간 명중(별도 오버레이)을 분리하는 분기로 간다(설계 §5 허용).

저장: `docs/qa/g39/glb-hp-flash-*.png` · `billboard-hp-flash-*.png`

- [ ] **Step 4: 2D 회귀 캡처**

`Creature` HP 바 · `Shielder` 보호막 호 · `Zapper` 충전선 · `Bomber` telegraph · affix 링이
피격과 함께 밝아지지 않는지 **플래시 전/후 픽셀 비교**로 확인한다.

저장: `docs/qa/g39/2d-flash-hpbar-before.png` · `-after.png` 등

- [ ] **Step 5: 성능 측정**

최대 적 밀집 + 발칸 연사 + 관통 레이저 다중 적중 상황에서 측정한다.
⚠️**색 버퍼 비용과 파티클 비용을 분리 보고**한다.

```text
before / after   frame time (평균·p95)
활성 parts 최고치 · hitSpark 최고치 · high 최고치
저사양 프로필(mobile·lod1) 별도 측정
```

저장: `docs/qa/g39/perf.json`

- [ ] **Step 6: 산출물 README 를 쓴다**

`docs/qa/g39/README.md` 에 각 파일의 URL·뷰포트·설정·판정을 적는다.
⚠️확인하지 못한 항목은 **정확한 blocker** 로 남긴다("브라우저 도구가 없다" 같은 뭉뚱그린 서술 금지).

- [ ] **Step 7: 서버를 다시 띄우고 실제 상태를 기록한다**

프리뷰 재시작 후 **PID·포트·serve root·시작 시각**을 실측해 보고서에 적는다.
⚠️서버가 살아 있는데 "없음"이라고 쓰지 않는다(G36 에서 저지른 실수).

---

## 자체 점검 결과

**1. 설계 커버리지**

| 설계 절 | 태스크 |
|---|---|
| §2 정보 통로(put3D→_sw→placeSwarm) | 6, 7 |
| §3 실효 피해·시간축 | 2, 4, 5 |
| §4 색 규칙·무할당 API·접근성 수치 | 1 |
| §5 실제 재질 실측 | 10 |
| §6 불꽃·성능 상한·보스 분기 | 3, 5 |
| §6-4 2D draw 경로 | 9 |
| §7 국소 폴백 | 7, 8 |
| §8 적용 범위(Debris·보스·변이) | 2(대상 판정), 5(정책), 9(공통 wrapper) |
| §9 검증 게이트 | 각 태스크 + 10 |
| §12-1 전역 RNG 비소비 | 3 |
| §12-2 body clip | 9 |
| §12-3 feedbackNow guard | 4 |
| §12-4 예약 분할 | 3 |
| §12-5 version 검증 | 8 |

**2. 플레이스홀더** — 없음. 모든 단계에 실제 코드·명령·기대값이 있다.

**3. 타입 일관성**
- 슬롯 필드 `cr/cg/cb` — Task 1(쓰기) · 6(생성·기록) · 7(읽기) 일치
- `readDamageFlash(entity, now)` — Task 2(정의) · 6 · 9 일치
- `feedbackClock.now()` — Task 4(정의) · 5 · 6 · 9 일치
- `effects.hitSpark(x, y, color, count, speed, seed)` — Task 3(정의) · 5(호출) 일치
- `EFFECT_BUDGET` / `IMPACT` / `FEEDBACK` — 각 정의 태스크에서만 선언, 중복 없음

**4. 알려진 위험**
- Task 3 에서 `burst` 시그니처가 바뀌므로 소스 문자열 대조 테스트가 깨질 수 있다. 계약 부분만 보도록 완화한다.
- Task 8 은 `tests/g35-frame-smoke.test.mjs` 의 스텁을 공용 모듈로 옮긴다. **복사하지 말 것** — 사본이 갈리면 한쪽만 통과한다.
