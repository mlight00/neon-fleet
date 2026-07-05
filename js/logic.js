// 게임 규칙 순수 함수 — DOM/Canvas 의존 없음 (node --test로 검증)

/** 게이트 통과: 편대 수에 연산 적용. 결과는 0 미만이 될 수 없다. */
export function applyGate(count, gate) {
  let n = count;
  if (gate.op === '+') n = count + gate.value;
  else if (gate.op === '-') n = count - gate.value;
  else if (gate.op === 'x') n = count * gate.value;
  else if (gate.op === '/') n = Math.floor(count / gate.value);
  return Math.max(0, Math.round(n));
}

/** 크리스탈 피격: hp 감소, 0이 되면 broken과 함께 원래 보상 지급. */
export function hitCrystal(crystal, damage) {
  const hp = Math.max(0, crystal.hp - damage);
  const broken = hp === 0;
  return { hp, broken, reward: broken ? crystal.reward : 0 };
}

/** 전자기 폭풍: dt초 동안 초당 ratePerSec 비율로 드론 소실 (내림, 최소 0). */
export function stormDecay(count, dt, ratePerSec) {
  return Math.max(0, Math.floor(count * (1 - ratePerSec * dt)));
}

/** 격납고 강화 비용: 기본가 x 성장배수^레벨 (반올림 정수) */
export function hangarCost(base, lv, growth) {
  return Math.round(base * Math.pow(growth, lv));
}

/**
 * 진화 티어 판정 (히스테리시스).
 * 승급: count가 임계값 도달 즉시. 강등: 현재 티어 임계값의 demoteRatio 미만일 때만.
 * → 승급 경계 바로 아래로 떨어져도 강등되지 않아 깜빡임이 없다.
 */
/**
 * 스테이지별 난이도 배수 (스테이지 1 = 기본).
 * 적은 단단하고 빨라지고, 보상(크리스탈)도 소폭 올라 성장이 완전히 뒤처지진 않는다.
 */
export function stageMods(stage) {
  const g = Math.max(1, stage) - 1;
  return {
    enemyHp: 1 + 0.35 * g,                     // 적 HP (접촉 피해도 함께 상승)
    enemyRate: Math.max(0.6, 1 - 0.08 * g),    // 적 발사 주기 배수 (작을수록 빠름)
    crystal: 1 + 0.5 * g,                      // 크리스탈 값 (스테이지↑ → 드론 획득↑, 상위 티어 도달)
    boss: 1 + 0.5 * g,                         // 보스 HP
    tierShift: Math.min(0.2, 0.05 * g),        // hard 청크가 더 일찍 나옴
    shotCap: Math.min(20, 12 + 2 * g),         // 동시 적탄 상한
  };
}

export function tierFor(count, currentTier, thresholds, demoteRatio) {
  let promoted = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (count >= thresholds[i]) promoted = i;
  }
  if (promoted > currentTier) return promoted;
  let tier = currentTier;
  while (tier > 0 && count < thresholds[tier] * demoteRatio) tier--;
  return tier;
}
