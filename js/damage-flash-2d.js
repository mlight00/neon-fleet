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
//
//  ⚠️코드리뷰 발견(2026-08-13) — 이 wrapper 로 못 고치는 예외 2건(entities.js·bosses.js 는 이번 범위 밖):
//   `Blinker.draw()`(js/entities.js:3864)는 몸체 blit 직전에
//     `ctx.globalAlpha = 0.35 + 0.65 * this.appearT;` 로 **절대값**을 씌운다.
//   광폭화(enraged) `Boss.draw()`(js/bosses.js:397, 광폭화 링 391~396 바로 뒤·몸체 blit 400행 직전)는
//     `ctx.globalAlpha = 1;` 로 **절대값**을 씌운다.
//   두 경우 다 이 wrapper 가 계산한 `fadeAlpha * flash * 0.85` 를 몸체를 실제로 그리는 순간 덮어써 버린다.
//  증상: Blinker 는 항상 appearT 기반 고정 밝기로, enraged Boss 는 **항상 alpha=1(최대 밝기)** 로
//   번쩍이고, 피격 후 0.10초에 걸쳐 서서히 죽어야 할 감쇠가 안 보인다(몇 초 전에 맞았어도 방금
//   맞은 것처럼 항상 최대 밝기).
//  wrapper 레벨 대안(ctx.globalAlpha 접근자 가로채기, 오프스크린 버퍼로 우회 합성, ctx.filter 로
//   opacity 대체)을 검토했으나 전부 기각했다 — 근거는 task-9-report.md "발견 2" 절 참고
//   (요약: 세 방법 다 이 코드베이스에 전례 없는 위험한 패턴이거나, `loopHue`(399행 `ctx.filter` 절대
//   설정)처럼 이미 있는 다른 동작과 충돌해 "무리한 해법"으로 판단).
//  근본 수정은 두 draw() 가 몸체 blit 앞뒤로 alpha 를 **절대값**이 아니라 **상대(곱)값**으로
//   다루도록 고치는 것(예: `ctx.globalAlpha *= 0.35 + 0.65 * this.appearT`) — 별도 후속 작업 필요.

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
