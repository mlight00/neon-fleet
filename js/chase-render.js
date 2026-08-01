// js/chase-render.js — 2.5D 추적 시점의 개체별 투영 렌더(chaseBlend>0일 때만). 게임 규칙 불변, 화면 표시만.
//  넓은/편대/긴 개체(Squad·ChargeLance·게이트·레이저 스트릭)는 자기 drawProjected(ctx, projector)로 끝점·개체별 투영.
//  그 외 점형 개체는 generic drawProjected(중심 투영). chaseBlend=0이면 main.js가 기존 전술 경로를 쓰므로 미호출.
import { projectObject, projectPoint, fitFlagshipScale, edgeIndicatorForPoint } from './chase-camera.js';

const MIN_SCREEN_PX = { enemyBullet: 3, playerBullet: 2, damageText: 10 };
const BOSS_MAX_SCREEN_FRAC = 0.9;

/** projector: 개체 drawProjected에 넘길 투영 도구 묶음(점 투영 + 기함 fit + 뷰포트). */
export function makeProjector(projection) {
  return {
    point: (wx, wy) => projectPoint({ x: wx, y: wy }, projection),
    fitFlagship: (p, halfH) => fitFlagshipScale(p, projection, halfH),
    projection,
  };
}

/** 점형 개체 중심 투영 렌더(넓지 않은 적·아이템·발칸탄 등). drawFn(ctx)은 (x,y) 기준 자기 렌더. */
export function drawProjected(ctx, obj, projection, drawFn, kind) {
  const p = projectObject({ x: obj.x, y: obj.y }, kind, projection);
  let scale = p.scale;
  const minPx = MIN_SCREEN_PX[kind];
  const baseR = obj.r || obj.radius || 0;
  if (minPx && baseR > 0) scale = Math.max(scale, minPx / (2 * baseR));
  if (kind === 'boss' && baseR > 0) scale = Math.min(scale, (BOSS_MAX_SCREEN_FRAC * projection.logicalH) / (2 * baseR));
  if (!Number.isFinite(scale) || scale <= 0) return;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.scale(scale, scale);
  ctx.translate(-obj.x, -obj.y);
  drawFn(ctx);
  ctx.restore();
}

/** 레이저 스트릭: 시작(x,prevY)·끝(x,y)을 각각 투영해 선분으로(§3.4·RC2-06). 끝점 정합이 목적. */
export function drawLaserStreak(ctx, b, projector) {
  const a = projector.point(b.x, b.prevY), e = projector.point(b.x, b.y);
  const wpx = Math.max(MIN_SCREEN_PX.playerBullet, (b.beamW || 2) * 2 * ((a.scale + e.scale) / 2));
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = b.color || '#8fe8ff';
  ctx.lineWidth = wpx;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(e.x, e.y); ctx.stroke();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.restore();
}

export function kindOfEntity(e) {
  const n = (e && e.constructor && e.constructor.name) || '';
  if (/Boss|MidBoss/.test(n)) return 'boss';
  if (/Crystal|Coin|Pow|Capsule|DronePod|PowerModule/.test(n)) return 'pickup';
  if (/Gate/.test(n)) return 'gate';
  return 'enemy';
}

/** 월드 전투 개체 전체를 투영 렌더. 넓은/긴 개체는 자기 drawProjected에 위임(끝점 투영 → 판정 정합). */
export function drawWorldProjected(ctx, r, projection, opts = {}) {
  const projector = makeProjector(projection);
  const drawEntity = opts.drawEntity || ((c, e) => e.draw(c));
  const drawBoss = opts.drawBoss || ((c, b) => b.draw(c));
  const drawCampaignFleet = opts.drawCampaignFleet;
  const skipEntity = opts.skipEntity || null;   // hero 3D 로 올라간 개체(B1 실전)의 2D 를 하드 컷 — 이중 표시 방지
  const one = (obj, genericDraw, kind) => {
    if (typeof obj.drawProjected === 'function') obj.drawProjected(ctx, projector);   // 끝점/개체별 투영(게이트·랜스·레이저 스트릭)
    else drawProjected(ctx, obj, projection, genericDraw, kind);
  };
  for (const e of r.world.entities) { if (skipEntity && skipEntity(e)) continue; one(e, (c) => drawEntity(c, e), kindOfEntity(e)); }
  if (r.bosses && r.bosses.length && r.phase !== 'track') {
    for (const b of r.bosses) one(b, (c) => drawBoss(c, b), 'boss');
  }
  // 플레이어 탄: 레이저는 prevY~y 스트릭 끝점 투영(§3.4), 그 외는 중심 투영. 3D 로 올라간 점형탄은 스킵(hero 하드 컷).
  for (const b of r.world.bullets) {
    if (skipEntity && skipEntity(b)) continue;
    if (b.kind === 'laser' && !b.resonanceId && Number.isFinite(b.prevY) && Math.abs(b.prevY - b.y) > 1) drawLaserStreak(ctx, b, projector);
    else one(b, (c) => b.draw(c), 'playerBullet');
  }
  for (const b of r.world.enemyBullets) {
    if (skipEntity && skipEntity(b)) continue;
    if (b.kind === 'laser' && !b.resonanceId && Number.isFinite(b.prevY) && Math.abs(b.prevY - b.y) > 1) drawLaserStreak(ctx, b, projector);
    else one(b, (c) => b.draw(c), 'enemyBullet');
  }
  // 편대: 기함·드론·순양함·궤도기를 개별 투영(Squad.drawProjected). hero 3D 교차 시 기함 본체 alpha=1-t(Opus5 §9.2).
  if (!r.squad.dead) r.squad.drawProjected(ctx, projector, { flagshipAlpha: opts.flagshipAlpha ?? 1, hideEscorts: !!opts.hideEscorts });
  if (r.campaign25 && drawCampaignFleet) drawProjected(ctx, r.squad, projection, (c) => drawCampaignFleet(c), 'squad');
  if (r.effects.drawWorldProjected) {
    r.effects.drawWorldProjected(ctx, (x, y) => projectPoint({ x, y }, projection), MIN_SCREEN_PX.damageText);
  } else {
    r.effects.drawWorld(ctx);
  }
}

/** 화면 밖 위험 경고(§4·§9). 죽음·멀어지는 탄 제외, 접근 위험도(보스>충돌임박탄>충돌적) 순으로 방향당 최대 3개.
 *  danger: 'boss'|'enemyBullet'|'collision'. 위치·속도·충돌은 바꾸지 않는 시각 기능. */
export function collectEdgeWarnings(r, projection, viewport, maxPerSide = 3) {
  const sq = r.squad;
  const cand = [];
  // 보스: 접근 위험 최상위(가까울수록 우선)
  if (r.bosses) for (const b of r.bosses) {
    if (b.dead) continue;
    cand.push({ obj: b, danger: 'boss', score: 100000 - Math.hypot(b.x - sq.x, b.y - sq.y) });
  }
  // 적 탄환: 기함으로 접근 중(아래로, 아직 위쪽)이고 도달 궤적이 기함 근처인 것만. 충돌 임박(TTC 작음)일수록 우선.
  for (const b of r.world.enemyBullets) {
    if (b.dead) continue;
    const vy = b.vy || 0;
    if (b.y >= sq.y) continue;          // 이미 기함 아래(지나감) → 제외
    if (vy <= 0) continue;              // 위로(멀어짐) → 제외(§4.1)
    const ttc = (sq.y - b.y) / vy;      // 도달 시간
    if (!(ttc > 0) || ttc > 3) continue;
    const xAt = b.x + (b.vx || 0) * ttc;
    if (Math.abs(xAt - sq.x) > 130) continue;   // 기함에서 먼 곳을 지날 탄 → 제외(§4.4)
    cand.push({ obj: b, danger: 'enemyBullet', score: 50000 - ttc * 1000 });
  }
  // 충돌형 적: 가까울수록 우선
  for (const e of r.world.entities) {
    if (e.dead) continue;
    const n = (e.constructor && e.constructor.name) || '';
    if (!/Creature|Charger|Bomber|Meteor|Mine|Blinker/.test(n)) continue;
    cand.push({ obj: e, danger: 'collision', score: 20000 - Math.hypot(e.x - sq.x, e.y - sq.y) });
  }
  cand.sort((a, b) => b.score - a.score);   // 위험도 순(배열 순서 아님, §4.5)
  const out = [];
  const counts = { left: 0, right: 0, top: 0, bottom: 0 };
  for (const c of cand) {
    const p = projectObject({ x: c.obj.x, y: c.obj.y }, c.danger === 'boss' ? 'boss' : 'enemy', projection);
    const ind = edgeIndicatorForPoint(p, viewport, c.danger);
    if (!ind) continue;
    if (counts[ind.side] >= maxPerSide) continue;
    counts[ind.side]++;
    out.push({ ...ind, danger: c.danger });
  }
  return out;
}
