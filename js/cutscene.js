// 섹터 클리어 컷신 — 게임 화면 대신 전체화면 일러스트 위에서 보스가 격침·침몰하는 연출(이사 요청).
// 배경만 별도 이미지고, 침몰하는 보스와 이탈하는 기함은 실제 게임 아트를 그대로 얹는다
// (보스 정체가 섹터마다 다르므로 이미지에 보스를 그려 넣으면 안 된다).
// 이미지가 없으면 draw가 false를 돌려주고, 호출부가 기존 인게임 연출로 폴백한다.
import { BAL } from './balance.js';
import { getSprite } from './sprites.js';
import { COLORS, blit } from './render.js';

/** 컷신 타임라인(초). 전체 길이 = outEnd. */
export const CUT = Object.freeze({
  fadeIn: 0.45,
  sinkFrom: 0.0, sinkTo: 4.1,   // 보스가 기울며 아래로 가라앉는 구간
  shipFrom: 1.1, shipTo: 4.3,   // 기함이 아래에서 올라와 화면 위로 빠져나가는 구간
  titleAt: 1.7,
  outStart: 4.3, outEnd: 4.9,
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

/** 보스의 현재 위치·기울기·투명도 (순수 — 테스트 가능). */
export function bossPose(c, logicalW, logicalH) {
  const p = Math.max(0, Math.min(1, (c.t - CUT.sinkFrom) / (CUT.sinkTo - CUT.sinkFrom)));
  const ease = p * p;                       // 가속하며 가라앉는다
  return {
    x: logicalW * 0.5,
    y: logicalH * 0.34 + logicalH * 0.5 * ease,
    roll: 0.62 * p,                          // 기울어짐
    alpha: Math.max(0, 1 - Math.max(0, p - 0.55) / 0.45),
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
export function drawCutscene(ctx, c, logicalW, logicalH, effects) {
  const bg = getSprite('CUT_SECTOR_CLEAR');
  if (!bg) return false;

  ctx.save();
  // ── 배경: 화면을 덮도록 cover-fit (비율 유지, 넘치는 쪽은 잘라냄) ──
  const scale = Math.max(logicalW / bg.logicalW, logicalH / bg.logicalH);
  const bw = bg.logicalW * scale, bh = bg.logicalH * scale;
  ctx.fillStyle = '#02040a';
  ctx.fillRect(0, 0, logicalW, logicalH);
  blit(ctx, bg, logicalW / 2, logicalH / 2, scale);
  // 위아래를 살짝 눌러 글자·함선이 잘 읽히게
  const grad = ctx.createLinearGradient(0, 0, 0, logicalH);
  grad.addColorStop(0, 'rgba(2,4,10,0.55)');
  grad.addColorStop(0.45, 'rgba(2,4,10,0.05)');
  grad.addColorStop(1, 'rgba(2,4,10,0.62)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, logicalW, logicalH);

  // ── 침몰하는 보스 (실제 보스 아트) ──
  const bp = bossPose(c, logicalW, logicalH);
  const bossArt = c.bossId && getSprite(c.bossId);
  if (bossArt && bp.alpha > 0) {
    ctx.save();
    ctx.translate(bp.x, bp.y);
    ctx.rotate(bp.roll);
    ctx.globalAlpha = bp.alpha;
    blit(ctx, bossArt, 0, 0, 1);
    ctx.globalCompositeOperation = 'source-atop';   // 함체 안쪽만 붉게 달군다
    ctx.fillStyle = `rgba(150,20,24,${(0.2 + 0.55 * Math.min(1, c.t / CUT.sinkTo)).toFixed(2)})`;
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
    const flame = 26 + 54 * sp.p;
    const g = ctx.createLinearGradient(0, 10, 0, 10 + flame);
    g.addColorStop(0, 'rgba(120,232,255,0.9)');
    g.addColorStop(1, 'rgba(120,232,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-5, 10, 10, flame);
    blit(ctx, shipArt, 0, 0, 1.25);
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
    ctx.fillText('아무 키나 눌러 건너뛰기', logicalW / 2, logicalH - 22);
  }
  ctx.restore();
  return true;
}
