// 기함 내구도와 함대 자원 분리 (전면개편 §5.6). 드론·순양함 회수로 무적이 되는 문제를 막는다.
// 순수 로직 — 네 자원의 피해 순서를 결정한다. 순양함 HP 배열은 Squad가 위치와 함께 소유하고,
// 여기서는 "이 피격이 보호막/순양함/기함 중 무엇을 지불하는가"와 기함 내구도·긴급재건만 관리한다.
//
// 자원(§5.6):
//  hullIntegrity  실제 생존 체력 — 드론 회수로 회복 금지, 제한 수리·승급 일부만
//  드론           공격 밀도(Squad.count) — 내구도를 대신 지불하지 않음
//  순양함 HP      개별 호위함(Squad.cruiserHp[]) — 장면 바뀌어도 유지
//  보호막         명시적 일회성 방어(shield)

/** 생존 자원 초기화. cfg = BAL.gate1.survivability. */
export function createSurvivability(cfg) {
  return {
    hullMax: cfg.hullMax,
    hull: cfg.hullMax,
    shield: 0,             // 명시적 보호막 충전 수(일회성 블록)
    tier: 0,               // 함체 티어(승급 시 최대치 증가)
    emergencyUsed: 0,      // 이번 출격 긴급 재건 사용 횟수
  };
}

export function hullFrac(s) {
  return s.hullMax > 0 ? Math.max(0, s.hull / s.hullMax) : 0;
}

export function isDefeated(s) {
  return s.hull <= 0;
}

/** 명시적 보호막 부여(카드·프레임 효과로만, §5.6). */
export function addShield(s, n = 1) {
  s.shield += n;
  return s.shield;
}

/**
 * 피격 해석(§5.6 필수 순서). 반환 outcome:
 *  { absorbedBy: 'shield' }                       보호막 소비(피해 무효)
 *  { absorbedBy: 'cruiser', index }               순양함 실히트박스 피격 → Squad가 cruiserHp 감소
 *  { absorbedBy: 'hull', hull, dead }             기함 핵 피격 → 내구도 감소
 * onCruiserIndex: 이 피격이 순양함 히트박스를 맞혔으면 그 인덱스(없으면 null).
 * 드론 수는 절대 내구도를 대신 지불하지 않는다.
 */
export function resolveHit(s, { amount, onCruiserIndex = null } = {}) {
  if (s.shield > 0) {
    s.shield -= 1;
    return { absorbedBy: 'shield' };
  }
  if (onCruiserIndex != null) {
    return { absorbedBy: 'cruiser', index: onCruiserIndex };
  }
  s.hull = Math.max(0, s.hull - Math.max(0, amount));
  return { absorbedBy: 'hull', hull: s.hull, dead: s.hull <= 0 };
}

/** 제한 수리(§5.6). 최대치의 repairFrac만 회복(자동 완전 회복 금지). 반환: 실제 회복량. */
export function repair(s, cfg) {
  const heal = Math.round(s.hullMax * cfg.repairFrac);
  const before = s.hull;
  s.hull = Math.min(s.hullMax, s.hull + heal);
  return s.hull - before;
}

/**
 * 함체 승급(H0~H5). 최대치는 올리되 현재 체력을 만피로 만들지 않는다(§5.6).
 * 회복 = 최대치 증가분 × tierHealFrac.
 */
export function onTierUp(s, cfg) {
  s.tier += 1;
  const inc = cfg.hullMaxPerTier;
  s.hullMax += inc;
  s.hull = Math.min(s.hullMax, s.hull + Math.round(inc * cfg.tierHealFrac));
  return { hullMax: s.hullMax, hull: s.hull };
}

/** 긴급 재건 가능 여부(출격당 최대 1회, §5.6). */
export function canEmergencyRebuild(s, cfg) {
  return s.emergencyUsed < cfg.emergencyRebuildMax && s.hull > cfg.emergencyRebuildHullCost;
}

/**
 * 긴급 재건 실행. 명확한 비용(내구도)·1회 제한. 반환: { ok, cruisers } — Squad가 순양함을 만피로 추가.
 * 회수 드론만으로 무한 재생성되지 않도록 여기서만 소환한다.
 */
export function doEmergencyRebuild(s, cfg) {
  if (!canEmergencyRebuild(s, cfg)) return { ok: false, cruisers: 0 };
  s.emergencyUsed += 1;
  s.hull = Math.max(1, s.hull - cfg.emergencyRebuildHullCost);
  return { ok: true, cruisers: cfg.emergencyRebuildCruisers };
}
