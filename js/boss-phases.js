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
  //
  //  §G-47 2차(이사 실기 2026-08-18). 1차 평가 결과와 그에 따른 판단:
  //   · "2·3단계 대응이 **비슷**" — 각도·속도만 바꿔서다. 세 페이즈가 **같은 탄**을 쐈다.
  //     → `shot` 신설. 유도탄·창(needle)으로 **피하는 방법 자체**를 바꾼다.
  //   · "탄이 과밀한 순간이 **가끔**" + "보스전이 **길어짐**" — 둘은 같은 원인이다.
  //     탄이 많으면 피하느라 못 쏜다. → `countMult` 로 후반 탄 수를 **줄인다**.
  //     ⚠️종류를 늘리면서 수까지 늘리면 화면이 막힌다. **같은 양을 다른 종류로**가 이번 원칙이다.
  //   · 임계 66/33 → **70/30**, 3단계 발사 1.7배 → **1.8배** (이사 지정값)
  B8: [
    { at: 1.00, kind: 'crescent' },
    //  2단계: 부채꼴 + 유도탄. 옆으로 흘리는 회피가 안 통한다 — 끊어 줘야 한다.
    { at: 0.70, kind: 'crescent', add: 'ring',
      //  ⚠️shape 은 그 보스의 **기본 모양과 달라야** 한다. B8 기본이 needle 이라
      //   needle 을 또 쓰면 유도가 붙어도 눈으로는 같은 탄이다(1차 실측에서 확인).
      shot: { homing: 1.5, shape: 'orb', r: 7 }, countMult: 0.85 },
    //  3단계: 큰 창 + 약한 유도. 굵고 느슨해 "뚫고 지나가는" 압박을 준다.
    { at: 0.30, kind: 'ring', add: 'spiral', rate: 0.555,
      shot: { homing: 0.7, shape: 'ring', r: 11 }, countMult: 0.7 },
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
  return {
    index: idx, at: p.at, kind: p.kind, add: p.add ?? null, rate: p.rate ?? 1,
    //  §G-47 2차: 탄의 **종류**와 **수 배수**. 없으면 각각 기본탄·등배(현행 유지).
    shot: p.shot ?? null, countMult: p.countMult ?? 1,
  };
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
