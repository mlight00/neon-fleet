// 대응형 신규 적의 순수 로직 (DOM 무관 → node 테스트 가능). adaptive-enemies.js가 사용.

/**
 * 프리즘 워든 피해 라우팅 (방어막이 켜져 있을 때). 순수.
 * ctx: null | { lance, pierceDefense } | 탄환 { x }
 * cores: [{ side:-1|1, hp }]. coreOffset: 코어 중심 오프셋(px).
 * 반환: { hitCore } — hitCore>=0 이면 그 코어에 피해, -1 이면 본체(full 이면 전액, 아니면 정면 감소).
 */
export function prismRoute(ctx, x, cores, coreOffset) {
  if (ctx && ctx.lance) return { hitCore: -1, full: !!ctx.pierceDefense };   // 랜스: 강습3단+만 관통
  if (!ctx || ctx.x === undefined) return { hitCore: -1, full: false };      // 문맥 없는 광역(도탄·폭발) → 정면 감소
  for (let i = 0; i < cores.length; i++) {
    if (cores[i].hp > 0 && Math.abs(ctx.x - (x + cores[i].side * coreOffset)) <= 9) return { hitCore: i, full: false };
  }
  return { hitCore: -1, full: false };                                        // 중앙 정면 → 감소
}

/** 신규 적 HP 스테이지 스케일 (완만 + 상한). 순수. */
export function stageScale(stage, perStage, max) {
  return Math.min(max, 1 + perStage * (Math.max(1, stage) - 1));
}

/** 실제 지급 드론 수 (원 보상 × 보상배수 × 경제 × 교리). 순수. Crystal/DronePod/스캐빈저 공통. */
export function droneReward(raw, podMult = 1, econMult = 1, doctrineMult = 1) {
  return Math.round(raw * podMult * econMult * doctrineMult);
}

/** 스캐빈저 처치 보상: 보관 중이면 ×mult, 아니면 0 (도주 전 처치만 지급). 순수. */
export function scavengerPayout(stored, mult) {
  return stored > 0 ? Math.round(stored * mult) : 0;
}

/**
 * 게이트 패러사이트 피해 배수 (순수). ctx=탄환{x}|랜스{lance,pierceDefense}|null.
 * 랜스 강습 3단+(pierceDefense)만 방어 무시(1.0), 그 외 일반공격·도탄·폭발·일반랜스는 armor 감소.
 * armorReduce는 0.70 상한(완전 면역 금지).
 */
export function parasiteDamageMult(ctx, armorReduce) {
  const pierces = !!(ctx && ctx.lance && ctx.pierceDefense);
  return pierces ? 1 : 1 - Math.min(0.70, armorReduce || 0);
}
