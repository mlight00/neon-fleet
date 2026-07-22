// 섹터 클리어 컷신 — 게임 화면 대신 전체화면 일러스트 위에서 보스가 격침·침몰하는 연출(이사 요청).
// 배경만 별도 이미지고, 침몰하는 보스와 이탈하는 기함은 실제 게임 아트를 그대로 얹는다
// (보스 정체가 섹터마다 다르므로 이미지에 보스를 그려 넣으면 안 된다).
// 이미지가 없으면 draw가 false를 돌려주고, 호출부가 기존 인게임 연출로 폴백한다.
import { BAL } from './balance.js';
import { getSprite } from './sprites.js';
import { COLORS, blit } from './render.js';

/** 컷신 타임라인(초). 전체 길이 = outEnd. */
// 순서가 중요하다: 기함이 화면 가운데로 올라가므로 타이틀이 먼저 뜨면 글자를 뚫고 지나간다.
// → ①보스 침몰 ②기함 이탈 ③(기함이 빠져나간 뒤) 타이틀. 타이틀이 마지막 비트가 되어 마무리도 깔끔하다.
export const CUT = Object.freeze({
  fadeIn: 0.45,
  sinkFrom: 0.0, sinkTo: 4.1,   // 보스가 기울며 아래로 가라앉는 구간
  shipFrom: 0.9, shipTo: 3.4,   // 기함이 아래에서 올라와 화면 위로 빠져나가는 구간(3.1초쯤 화면 이탈)
  titleAt: 3.2,                 // 기함이 나간 뒤에 뜬다
  outStart: 4.6, outEnd: 5.2,
  burstEvery: 0.24,             // 보스 위 연쇄 폭발 간격
});

/** 컷신 상태 생성. bossId=격침된 보스 아트, tier/weapon=기함 아트 선택용. */
export function createCutscene({ sector, bossId, bossName, tier, weapon }) {
  return { t: 0, sector, bossId, bossName, tier, weapon, burstT: 0, done: false, skipped: false };
}

/** 배경 일러스트가 준비됐는지(없으면 호출부가 인게임 연출로 폴백). */
export function cutsceneReady() {
  return !!getSprite('CUT_SECTOR_CLEAR');
}

/** 시간 진행. 끝나면 done=true. 반환값=아직 진행 중인지. */
export function tickCutscene(c, dt, effects, sfx) {
  if (c.done) return false;
  c.t += dt;
  // 침몰 구간 동안 함체 위에서 연쇄 폭발
  if (c.t < CUT.sinkTo) {
    c.burstT -= dt;
    if (c.burstT <= 0) {
      c.burstT = CUT.burstEvery;
      const p = bossPose(c, BAL.logicalW, effects.logicalH || 776);
      effects.burst(p.x + (Math.random() - 0.5) * p.r * 1.6, p.y + (Math.random() - 0.5) * p.r, COLORS.danger, 14, 190);
      effects.flash(0.14);
      sfx(Math.random() < 0.5 ? 'explode_s' : 'explode_l');
    }
  }
  if (c.t >= CUT.outEnd) c.done = true;
  return !c.done;
}

/** 보스의 현재 위치·기울기·투명도 (순수 — 테스트 가능).
 *  배경 잔해가 좌우를 감싸므로 보스는 가운데 통로 안에 들어가야 한다 → scale 0.78.
 *  가라앉으며 옆으로도 조금 흘러가야 '표류하는 잔해'로 읽힌다. */
export function bossPose(c, logicalW, logicalH) {
  const p = Math.max(0, Math.min(1, (c.t - CUT.sinkFrom) / (CUT.sinkTo - CUT.sinkFrom)));
  const ease = p * p;                       // 가속하며 가라앉는다
  return {
    x: logicalW * 0.5 + logicalW * 0.1 * ease,   // 살짝 옆으로 표류
    y: logicalH * 0.34 + logicalH * 0.5 * ease,
    roll: 0.62 * p,                          // 기울어짐
    alpha: Math.max(0, 1 - Math.max(0, p - 0.55) / 0.45),
    scale: 0.78,
    burn: 0.1 + 0.3 * p,                     // 함체가 달아오르는 정도(약하게 — 강하면 아트가 붉은 실루엣으로 뭉갠다)
    r: logicalW * 0.3,
  };
}

/** 기함의 현재 위치 (순수). 아래에서 올라와 화면 위로 빠져나간다. */
export function shipPose(c, logicalW, logicalH) {
  const p = Math.max(0, Math.min(1, (c.t - CUT.shipFrom) / (CUT.shipTo - CUT.shipFrom)));
  const ease = p * p * (3 - 2 * p);          // smoothstep — 가속 후 이탈
  return { x: logicalW * 0.5, y: logicalH * 1.12 - logicalH * 1.34 * ease, visible: c.t >= CUT.shipFrom, p };
}

/** 전체화면 컷신 렌더. 배경 이미지가 없으면 false(호출부가 폴백). */
/** 컷신 배경만 그린다(보스·기함·타이틀 제외). 컷신이 끝난 뒤 키스톤·항로 선택 화면의
 *  배경으로 계속 쓰기 위한 것 — 선택창이 전투 화면 위에 뜨면 컷신의 여운이 끊긴다(이사).
 *  dim>0이면 더 어둡게 눌러 선택 카드의 글자가 잘 읽히게 한다. */
export function drawCutsceneBackdrop(ctx, logicalW, logicalH, dim = 0) {
  const bg = getSprite('CUT_SECTOR_CLEAR');
  if (!bg) return false;
  ctx.save();
  const scale = Math.max(logicalW / bg.logicalW, logicalH / bg.logicalH);
  ctx.fillStyle = '#02040a';
  ctx.fillRect(0, 0, logicalW, logicalH);
  blit(ctx, bg, logicalW / 2, logicalH / 2, scale);
  const grad = ctx.createLinearGradient(0, 0, 0, logicalH);
  grad.addColorStop(0, 'rgba(2,4,10,0.55)');
  grad.addColorStop(0.45, 'rgba(2,4,10,0.05)');
  grad.addColorStop(1, 'rgba(2,4,10,0.62)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, logicalW, logicalH);
  if (dim > 0) { ctx.fillStyle = `rgba(2,4,10,${dim})`; ctx.fillRect(0, 0, logicalW, logicalH); }
  ctx.restore();
  return true;
}

export function drawCutscene(ctx, c, logicalW, logicalH, effects) {
  if (!drawCutsceneBackdrop(ctx, logicalW, logicalH)) return false;
  ctx.save();

  // ── 침몰하는 보스 (실제 보스 아트) ──
  const bp = bossPose(c, logicalW, logicalH);
  const bossArt = c.bossId && getSprite(c.bossId);
  if (bossArt && bp.alpha > 0) {
    ctx.save();
    ctx.translate(bp.x, bp.y);
    ctx.rotate(bp.roll);
    ctx.globalAlpha = bp.alpha;
    blit(ctx, bossArt, 0, 0, bp.scale);
    ctx.globalCompositeOperation = 'source-atop';   // 함체 안쪽만 달군다(약하게 — 강하면 아트가 뭉갠다)
    ctx.fillStyle = `rgba(190,60,30,${bp.burn.toFixed(2)})`;
    ctx.fillRect(-bp.r * 2, -bp.r * 2, bp.r * 4, bp.r * 4);
    ctx.restore();
  }

  // ── 이탈하는 기함 ──
  const sp = shipPose(c, logicalW, logicalH);
  const shipArt = getSprite('A' + ((c.tier ?? 0) + 1)) || getSprite('A1');
  if (sp.visible && shipArt) {
    ctx.save();
    ctx.translate(sp.x, sp.y);
    // 엔진 화염 — 속도가 붙을수록 길게
    // 컷신의 주인공이라 인게임보다 크게 — 인게임 크기(A3=68px)로는 화면에서 점처럼 보인다.
    const SHIP_SCALE = 2.1;
    const half = (shipArt.logicalH * SHIP_SCALE) / 2;
    const flame = 34 + 74 * sp.p;
    const g = ctx.createLinearGradient(0, half - 6, 0, half - 6 + flame);
    g.addColorStop(0, 'rgba(150,240,255,0.95)');
    g.addColorStop(0.35, 'rgba(90,200,255,0.5)');
    g.addColorStop(1, 'rgba(120,232,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-7, half - 6, 14, flame);
    blit(ctx, shipArt, 0, 0, SHIP_SCALE);
    ctx.restore();
  }

  effects?.draw?.(ctx, logicalW, logicalH);   // 폭발·링은 컷신 위에 그대로

  // ── 타이틀 ──
  if (c.t >= CUT.titleAt) {
    const tp = Math.min(1, (c.t - CUT.titleAt) / 0.5);
    ctx.globalAlpha = tp;
    ctx.textAlign = 'center';
    ctx.font = 'bold 30px Pretendard, sans-serif';
    ctx.strokeStyle = 'rgba(2,4,10,0.9)'; ctx.lineWidth = 5;
    const ty = logicalH * 0.2;
    ctx.strokeText(`SECTOR ${c.sector} CLEAR`, logicalW / 2, ty);
    ctx.fillStyle = COLORS.reward;
    ctx.fillText(`SECTOR ${c.sector} CLEAR`, logicalW / 2, ty);
    ctx.font = 'bold 13px Pretendard, sans-serif';
    ctx.strokeText(`${c.bossName || '적 기함'} 격침 확인`, logicalW / 2, ty + 24);
    ctx.fillStyle = '#dbe8ff';
    ctx.fillText(`${c.bossName || '적 기함'} 격침 확인`, logicalW / 2, ty + 24);
    ctx.globalAlpha = 1;
  }

  // ── 시작/종료 페이드 ──
  let fade = 0;
  if (c.t < CUT.fadeIn) fade = 1 - c.t / CUT.fadeIn;
  else if (c.t > CUT.outStart) fade = Math.min(1, (c.t - CUT.outStart) / (CUT.outEnd - CUT.outStart));
  if (fade > 0) { ctx.fillStyle = `rgba(2,4,10,${fade.toFixed(3)})`; ctx.fillRect(0, 0, logicalW, logicalH); }

  // 건너뛰기 안내
  if (c.t > 1.2 && c.t < CUT.outStart) {
    ctx.textAlign = 'center'; ctx.font = '11px Pretendard, sans-serif';
    ctx.fillStyle = 'rgba(220,235,255,0.5)';
    // 이동키·스페이스는 건너뛰기로 안 잡는다(전투 중 눌린 채 넘어와 즉시 스킵되므로) → 안내도 정확히.
    ctx.fillText('Enter 키로 건너뛰기', logicalW / 2, logicalH - 22);
  }
  ctx.restore();
  return true;
}
