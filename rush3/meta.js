// rush3/meta.js — 판 밖 '로봇 강화'(r4.4, v4 ④단계 (b)). 순수 함수: 난수·시계·화면·저장·import 없음.
//  이사 지시(원문) "강화는 메인 로봇에만 적용되도록". 이사님 결정 D1 = (다) → 메인 로봇 전용 무기 3트랙(직격 화력·연사·다연발) 확정,
//  N3 = (나) 추가 탄은 게이트·증원 설비에 무효(기획 v4.1 0장 인용 블록·3-4). 비용표 = 3-3 (마) 출발값(1단계 세 트랙 모두 40).
//  이 모듈은 **값과 규칙만** 가진다: 비용표·최대 단계·효과 수치·구매 판정. 저장(save.js 지갑 — 잔액·단계를 한 번에 쓴다)과
//  전투(combat.js — createRun 이 한 번 effects 를 받아 메인 로봇 탄에만 건다)는 이 함수들을 부르기만 한다.
//  판 안 Mk I~III(무기 통, 부대 전원)와는 다른 성장이다 — 판 안 표기는 'Mk', '강화'라는 말은 판 밖 로봇 강화에만(3-4 (라)).
//
//  트랙(단계 k):
//   power(직격 화력) : 메인 로봇 탄의 직격 피해 × (1 + 0.3k). 무기 + Mk 로 계산한 피해(weaponStats)에 곱한다. 폭발·연쇄·기절(무기 정의에서 읽는 값)과
//                      게이트 수치에는 무관, 보급 통 내구·보너스 표적에는 적용(탄의 dmg 를 쓰므로). 최대 5
//   rate(연사)       : 메인 로봇 발사 간격 × 0.87^k. 최대 5
//   multi(다연발)    : 한 번 쏠 때 탄 +k발, 옆으로 12px 간격(가운데 원래 탄 기준 좌우로 번갈아 +12, −12, +24). 산탄포는 3발 부채꼴을 통째로 복제.
//                      추가 탄 = gateHit 0 + extra(게이트 수치·증원 설비 발판을 올리지 않는다, 적·일반 보급 통에는 효과). 최대 3

export const UP_TRACKS = Object.freeze(['power', 'rate', 'multi']);
//  단계별 '다음 단계' 비용(인덱스 = 지금 단계). 길이 = 최대 단계
export const UP_COST = Object.freeze({
  multi: Object.freeze([40, 120, 250]),
  power: Object.freeze([40, 80, 140, 220, 330]),
  rate: Object.freeze([40, 80, 140, 220, 330]),
});
export const UP_MAX = Object.freeze({ power: UP_COST.power.length, rate: UP_COST.rate.length, multi: UP_COST.multi.length });
//  효과 수치: 직격 화력 한 단계 +30% · 연사 한 단계 간격 × 0.87 · 다연발 추가 탄 옆 간격 12px
export const UP_EFFECT = Object.freeze({ powerStep: 0.3, rateMul: 0.87, multiGap: 12 });

const isTrack = (t) => UP_TRACKS.includes(t);
const lvl = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.trunc(v))) : 0);

/** 강화 단계 정규화: 트랙별 정수(버림) 0~최대, 숫자가 아니면 0. 객체가 아니면 전부 0 */
export function normUp(up) {
  const u = up !== null && typeof up === 'object' ? up : {};
  return { power: lvl(u.power, UP_MAX.power), rate: lvl(u.rate, UP_MAX.rate), multi: lvl(u.multi, UP_MAX.multi) };
}

/** 한 단계라도 있는가 */
export function hasUp(up) {
  const u = normUp(up);
  return u.power > 0 || u.rate > 0 || u.multi > 0;
}

/** 그 트랙의 다음 단계 비용. 최대 단계이거나 모르는 트랙이면 null */
export function nextCost(up, track) {
  if (!isTrack(track)) return null;
  const k = normUp(up)[track];
  return k < UP_MAX[track] ? UP_COST[track][k] : null;
}

/** 살 수 없는 이유: null(살 수 있음) | 'track'(모르는 트랙) | 'max'(최대 단계) | 'coins'(잔액 부족). wallet = { coins, up } */
export function buyBlock(wallet, track) {
  if (!isTrack(track)) return 'track';
  const cost = nextCost(wallet && wallet.up, track);
  if (cost === null) return 'max';
  const coins = wallet && Number.isFinite(wallet.coins) ? wallet.coins : 0;
  return coins >= cost ? null : 'coins';
}

/** 살 수 있는가 */
export function canBuy(wallet, track) {
  return buyBlock(wallet, track) === null;
}

/** 구매: 새 지갑(잔액 − 비용, 그 트랙 +1)을 돌려준다. 살 수 없으면 **같은 지갑 그대로** + 이유.
 *  → { wallet, ok, reason: null | 'track' | 'max' | 'coins', cost(이번 비용 | null), track }. 지갑의 다른 칸은 그대로 옮긴다 */
export function buy(wallet, track) {
  const reason = buyBlock(wallet, track);
  const cost = isTrack(track) ? nextCost(wallet && wallet.up, track) : null;
  if (reason) return { wallet, ok: false, reason, cost, track };
  const up = normUp(wallet.up);
  up[track] += 1;
  return { wallet: { ...wallet, coins: wallet.coins - cost, up }, ok: true, reason: null, cost, track };
}

/** 효과(판을 만들 때 한 번 — combat.createRun). dmgMul = 직격 피해 배수 · intervalMul = 발사 간격 배수 · extra = 추가 탄 수 · gap = 추가 탄 옆 간격 */
export function effects(up) {
  const u = normUp(up);
  return { dmgMul: 1 + UP_EFFECT.powerStep * u.power, intervalMul: Math.pow(UP_EFFECT.rateMul, u.rate), extra: u.multi, gap: UP_EFFECT.multiGap };
}
