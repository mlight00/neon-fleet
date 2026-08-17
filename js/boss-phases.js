// ── §G-47 — 보스 체력별 페이즈 (순수 판정) ─────────────────────────────────────────────
//
//  이사님 제보(2026-08-14): "보스가 너무 같은 패턴이라 지루하다".
//
//  ## 조사에서 나온 것
//  페이즈는 **이미 있었다** — `bosses.js:99` 의 `enraged`(체력 50% 이하).
//  그런데 광폭화가 바꾸는 건 전수 4곳뿐이고 사실상 **속도**다(발사간격 ×0.6 · 흔들림 폭·빈도 ·
//  위험컬럼 +1). 공격의 **종류**는 그대로라, 크레센트 보스는 광폭화해도 크레센트만 빨리 쏜다.
//
//  ## 그래서 이 모듈이 하는 일
//  체력 비율 → "지금 몇 페이즈이고 어떤 패턴을 쓰는가" 를 돌려준다. **판정만 한다** —
//  탄을 만들지도, 보스를 건드리지도 않는다. `bosses.js` 가 결과를 받아 쓴다.
//
//  ⚠️**표에 없는 보스는 null 을 돌려준다 = 현행 유지.** 10종을 한 번에 바꾸지 않고
//   하나씩 검증하려고 이렇게 만들었다. 현재 표에는 **B8 하나뿐**이고 나머지 9종은
//   기존 광폭화(체력 50%) 경로를 그대로 쓴다(이사 결정 4).

/**
 * 보스별 페이즈 표. `at` = 이 페이즈가 시작되는 **남은 체력 비율**(내림차순 필수).
 *
 *  · `kind`  그 페이즈의 주 패턴 (`BAL.bossPatterns` 의 kind 와 같은 어휘)
 *  · `add`   함께 섞을 보조 패턴 — **다른 보스의 패턴을 빌려 쓴다**(새로 만들지 않는다)
 *  · `rate`  발사 간격 배수(작을수록 빠르다). 생략 = 1
 *
 *  ⚠️여기 값은 **게임 난이도**다. 이사님 승인 없이 늘리지 마라.
 *   ✅이사님 승인 2026-08-18 로 배선됨. 현재 B8 하나만 적용 — 실기 확인 후 확대한다.
 */
export const BOSS_PHASES = {
  //  B8 크레센트: 부채꼴만 피하던 대응이 2페이즈부터 안 통하게 한다.
  B8: [
    { at: 1.00, kind: 'crescent' },
    { at: 0.66, kind: 'crescent', add: 'ring' },
    { at: 0.33, kind: 'ring', add: 'spiral', rate: 0.6 },
  ],
};

/**
 * 지금 몇 페이즈인가.
 *  @param hp      남은 체력
 *  @param maxHp   최대 체력
 *  @param phases  `BOSS_PHASES[id]` (없으면 null/undefined)
 *  @returns `{ index, at, kind, add, rate }` 또는 **null(= 페이즈 미적용, 현행 유지)**
 */
export function bossPhaseAt(hp, maxHp, phases) {
  if (!Array.isArray(phases) || phases.length === 0) return null;
  if (!(maxHp > 0)) return null;
  //  체력이 0 이하여도 마지막 페이즈를 돌려준다 — 사망 프레임에 null 로 떨어지면
  //  연출이 한 프레임 깜빡인다.
  const frac = Math.max(0, Math.min(1, hp / maxHp));
  let idx = 0;
  for (let i = 0; i < phases.length; i++) {
    //  `at` 은 내림차순이라, frac 이 그 값 이하로 내려간 마지막 항목이 현재 페이즈다.
    if (frac <= phases[i].at) idx = i;
  }
  const p = phases[idx];
  return { index: idx, at: p.at, kind: p.kind, add: p.add ?? null, rate: p.rate ?? 1 };
}

/**
 * 페이즈가 **방금 바뀌었는가**(전환 연출용 상승 에지).
 *  ⚠️`bossPhaseAt` 을 매 프레임 비교하는 것만으로는 부족하다 — 호출자가 직전 값을 들고 있어야 한다.
 *   그 상태를 여기서 관리해 호출부가 실수로 매 프레임 연출을 터뜨리지 않게 한다.
 *  @returns 새 페이즈로 넘어간 그 프레임에만 true
 */
export function consumePhaseChange(holder, phaseIndex) {
  if (!holder) return false;
  if (holder._phaseSeen === phaseIndex) return false;
  const first = holder._phaseSeen === undefined;
  holder._phaseSeen = phaseIndex;
  //  첫 관측(전투 시작)은 전환이 아니다 — 시작하자마자 연출이 터지면 안 된다.
  return !first;
}

/**
 * kind 로 **다른 보스의 패턴 파라미터**를 빌려 온다.
 *  보조 패턴은 새로 만들지 않고 기존 것을 재사용한다 — `ring` 을 쓰면 B11 의 수치를 그대로 가져온다.
 *  ⚠️`BAL` 을 여기서 import 하지 않는다(순환 위험). 호출자가 표를 넘긴다.
 *  @returns 해당 kind 의 첫 패턴 객체, 없으면 null
 */
export function findPatternByKind(patterns, kind) {
  if (!patterns || !kind) return null;
  for (const p of Object.values(patterns)) if (p && p.kind === kind) return p;
  return null;
}

/** 표에 등록된 보스인가(= 페이즈 적용 대상). 진단·테스트용. */
export function hasPhases(id) {
  return Array.isArray(BOSS_PHASES[id]) && BOSS_PHASES[id].length > 0;
}
