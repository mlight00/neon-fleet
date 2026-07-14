// 기함 교리 정의 + 순수 효과 계산 (원정 내부 상태 — localStorage에 저장하지 않음).
// 첫 기함 업그레이드(tier 0→1) 직후 1회 선택. 강등돼도 원정 내내 유지, 새 원정에 초기화.
// 수치는 balance.js(BAL.doctrine). 중립(미선택) 상태에서는 모든 배수 1 / 보너스 0.

export const DOCTRINES = [
  { id: 'swarm', name: '드론 지휘', icon: '🐝', desc: '드론·순양함 공격 강화' },
  { id: 'lance', name: '차지 강습', icon: '⚡', desc: '차지 샷·정면 공격 강화' },
  { id: 'phase', name: '기동 전술', icon: '◈', desc: '이동·회피 성능 강화' },
];

export const DOCTRINE_BY_ID = Object.fromEntries(DOCTRINES.map((d) => [d.id, d]));

/** 교리 아이콘 (HUD). 미선택이면 빈 문자열. */
export function doctrineIcon(id) {
  return DOCTRINE_BY_ID[id]?.icon || '';
}

/**
 * 교리 효과 누적기 (순수). 중립(null)이면 전부 중립값.
 * cfg = BAL.doctrine.
 * 반환:
 *  supportMult      순양함(supportPower) 사격 배수 (swarm)
 *  escortShareBonus 호위 드론 사격 비중 가산 (swarm)
 *  droneGainBonus   드론 획득량 가산 비율 (swarm, 순양함 존재 시 적용은 호출부)
 *  chargeSpeedMult  차지 충전 속도 배수 (lance)
 *  chargeDmgMult    차지 피해 배수 (lance)
 *  lancePierceDefense 3단+ 랜스가 프리즘 방어막·패러사이트 방어 무시 (lance)
 *  hitRadiusDelta   피격 반경 가산(px, 음수) (phase)
 *  hitRadiusMin     피격 반경 하한 (phase)
 *  bankDmgMax       이동 뱅크 최대치에서의 무기 피해 보너스 상한 (phase)
 */
export function doctrineEffects(doctrine, cfg) {
  const e = {
    supportMult: 1, escortShareBonus: 0, droneGainBonus: 0,
    chargeSpeedMult: 1, chargeDmgMult: 1, lancePierceDefense: false,
    hitRadiusDelta: 0, hitRadiusMin: 0, bankDmgMax: 0,
  };
  if (!doctrine || !cfg || !cfg[doctrine]) return e;
  const d = cfg[doctrine];
  if (doctrine === 'swarm') {
    e.supportMult = d.supportMult;
    e.escortShareBonus = d.escortShareBonus;
    e.droneGainBonus = d.droneGainBonus;
  } else if (doctrine === 'lance') {
    e.chargeSpeedMult = d.chargeSpeedMult;
    e.chargeDmgMult = d.chargeDmgMult;
    e.lancePierceDefense = true;
  } else if (doctrine === 'phase') {
    e.hitRadiusDelta = d.hitRadiusDelta;
    e.hitRadiusMin = d.hitRadiusMin;
    e.bankDmgMax = d.bankDmgMax;
  }
  return e;
}

/**
 * 위상 기동: 이동 뱅크 절댓값(0~1)에 비례한 무기 피해 배수 (순수).
 * 정지/저속에서는 1(보너스 없음), 최대 뱅크에서 1+bankDmgMax.
 */
export function phaseDamageMult(bankAbs, bankDmgMax) {
  const b = Math.min(1, Math.max(0, bankAbs));
  return 1 + b * (bankDmgMax || 0);
}
