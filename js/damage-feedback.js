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
  //  §G-39 실기 조정(이사님 2026-08-13): 2.4 → **3.12** (30% 상향).
  //   실측: 지정 2.4배가 화면상 약 1.5배였다(톤매핑이 1 초과를 누른다) — 실기에서 약했다.
  //  ⚠️이 값은 계산이 아니라 **이사님의 실기 판단**이다. 바꾸려면 확인을 받아라.
  //  §G-39 2차 조정(이사님 2026-08-13): 3.12 → **3.744** (추가 20% 상향).
  //   이력: 2.4(설계) → 3.12(1차 +30%) → 3.744(2차 +20%). 전부 이사님 실기 판단이다.
  boost: 3.744,
  boostReduced: 2.184,   // reduced-motion — 본값과 같은 비율로 따라 올린다. 끄지 않고 약하게(정보는 남긴다)
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

// ── 피격 장부(사이드카) ────────────────────────────────────────────────────────────────
//  ⚠️엔티티에 필드를 붙이지 않는다. WeakMap 이라 적이 죽으면 자동 회수돼 정리 코드가 필요 없다.
//   (이번 회차의 SHOT_ORIGIN·ART_LOCK 과 같은 방식이다.)
const HIT = new WeakMap();

/** HP 플래시 대상인가 — 파괴 가능하고 maxHp 가 유효하며 **아직 살아 있는** 것만.
 *
 *  ⚠️`dead`·`dying` 제외는 §G39-R1 (Codex 구현검수 §6). 두 가지 이유가 겹친다.
 *   ① 설계 적용표대로 **사망 타격의 피드백은 사망 폭발이 담당**한다 — 플래시가 겹칠 이유가 없다.
 *   ② `Boss.drawDying()`(bosses.js:312-313)은 함체 흔들림에 draw 마다 전역 `Math.random()` 을 2회 쓴다.
 *      플래시가 남아 있으면 2D 재그리기가 같은 draw 를 한 번 더 불러 **전역 RNG 소비가 2회 늘어난다.**
 *      전역 RNG 는 치명타·탄 분산·스폰과 공유되므로 그만큼 이후 전투 결과가 달라진다.
 */
export function isDamageFlashTarget(entity) {
  if (!entity || entity.indestructible) return false;
  if (entity.dead || entity.dying) return false;
  return Number.isFinite(entity.maxHp) && entity.maxHp > 0;
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

/** 0..1 감쇠값. flashDur 동안 선형으로 준다.
 *
 *  ⚠️**대상 판정을 여기서도 한다**(§G39-R2, Codex R1 재검수 §P0).
 *   `recordDamageFeedback` 이 새 기록만 막으면 부족하다 — 죽기 **직전**에 받은 기록이 WeakMap 에 남아
 *   사망 후에도 계속 읽힌다. 실측: 비치명타(t=0) → 0.05초 뒤 치명타 → `readDamageFlash = 0.5` 였다.
 *   그러면 2D 플래시 wrapper 가 `Boss.drawDying()` 을 한 번 더 불러 **전역 RNG 가 2→4회**로 늘어난다.
 *   기록 차단과 판독 차단이 같은 기준(`isDamageFlashTarget`)을 써야 경계가 새지 않는다.
 */
export function readDamageFlash(entity, now) {
  if (!isDamageFlashTarget(entity)) return 0;
  const rec = HIT.get(entity);
  if (!rec) return 0;
  const age = now - rec.t;
  if (age < 0) return 0;
  const frac = 1 - age / FEEDBACK.flashDur;
  //  부동소수점 오차: 10.1 - 10 = 0.09999999999999964 같은 극도의 작은 차이를 무시한다.
  return frac < 1e-10 ? 0 : Math.min(1, frac);
}

/**
 * §G-46 — 이 피격에 대한 **파편 1회분**을 청구한다. 같은 기록으로 두 번 나오지 않는다.
 *
 *  ⚠️`readDamageFlash` 로는 상승 에지를 못 잡는다. 감쇠값이라 여러 프레임 0 이 아니어서,
 *   "0 이 아니면 방출" 로 하면 한 번 맞을 때마다 파편이 프레임 수만큼 쏟아진다.
 *  ⚠️소비 주체를 하나로 강제하지 않는다 — 먼저 부른 쪽이 가져간다. 3D 렌더만 부르는 전제다.
 *   2D 도 쓰게 되면 그때 소비자별 표식으로 나눠야 한다.
 *  @returns 새 피격이 있었으면 true (그 기록에 대해 딱 한 번)
 */
export function consumeHitSpark(entity) {
  const rec = HIT.get(entity);
  if (!rec || rec.sparkT === rec.t) return false;
  rec.sparkT = rec.t;
  return true;
}

/** 마지막 명중 지점(불꽃 위치용). 없으면 null. */
export function readLastHitPoint(entity) {
  const rec = HIT.get(entity);
  return rec ? { x: rec.x, y: rec.y } : null;
}
