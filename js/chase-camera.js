// js/chase-camera.js — 2.5D 함미 추적 시점의 순수 투영 수학(DOM·게임 전역·랜덤·시간 비의존).
//  ⚠️ 여기 값은 '화면 위치·표시 크기'만 만든다. 실제 월드 좌표·충돌·사거리·스폰·보상·난이도는 절대 참조/변경하지 않는다.
//  전술 시점(A) = 기존 함대 중심 확대. 추적 시점(B) = 2.5D 원근 투영. 최종 = lerp(A, B, chaseBlend).
//  100%(chaseBlend=0)에서는 A와 완전히 동일 → 기존 렌더와 픽셀 차이 0.

// 전환 구간(작업지시서 §3.1). 160%에서 추적 전환 시작, 200%에서 완전 전환. 사이는 연속 보간.
export const CHASE_START_ZOOM = 1.60;
export const CHASE_FULL_ZOOM = 2.00;

// 모든 투영 튜닝 상수를 한 객체에서 관리(§4.2 — 숫자 하드코딩 금지). 화면 비율 기반이라 해상도 독립.
// 원근 강화 2차(이사: "이미 어느 정도 커진 상태에서 출발한다 — 더 멀리서 더 작게" + "크리스탈·보급선은 크기 그대로"):
//  horizonYFrac 0.20→0.15 소실점을 더 위로(출발점이 화면 최상단 쪽), farObjScale 0.22→0.14 더 작게 출발,
//  depthPow 1.75→2.0 원거리(작음) 구간을 더 오래 유지, farLateral 0.26→0.22 수렴 강화.
export const PROJECTION = {
  horizonYFrac: 0.15,   // 소실점(먼 곳) 화면 Y 비율
  nearYFrac: 0.83,      // 근거리(기함) 화면 Y 비율 (80~86%)
  farLateral: 0.22,     // depth=0 좌우 배율(소실점 수렴)
  nearLateral: 1.25,    // depth=1 좌우 배율 (1.15~1.35)
  farObjScale: 0.14,    // depth=0 개체 표시 배율(상대) — 멀리서 "작은 점"으로 출발
  nearObjScale: 1.50,   // depth=1 개체 표시 배율(상대) (1.35~1.70)
  depthPow: 2.0,        // 깊이 곡선 pow — 클수록 원거리(작음)가 오래 유지되다 근거리에서 급히 커짐
  followFrac: 0.42,     // 추적 시점 부분 추종(이사): 기함 좌우 이동이 화면에 보이는 비율. 0=이전(기함 화면 중앙 고정·배경만 이동), 1=카메라 완전 고정
};

// 종류별 표시 배율 상·하한(시각 가독성용 — 충돌 반경 불변, §5.3). 추적(chase) 성분에만 적용.
//  원근 강화에 맞춰 하한도 하향 — 픽업(크리스탈·보급선)은 "크기 그대로 온다"(이사) 지적으로 0.52→0.30.
//  위험 요소(적탄)와 텍스트만 시인성 하한을 남긴다.
const KIND_SCALE = {
  enemyBullet: { minRel: 0.45 },
  playerBullet: { minRel: 0.38 },
  pickup: { minRel: 0.30 },
  damageText: { minRel: 0.55 },
  boss: { maxRel: 1.40 },
  squad: { maxRel: 1.60 },
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const lerp = (a, b, t) => a + (b - a) * t;

/** Hermite smoothstep. min≥max면 계단(방어). value가 [min,max] 밖이면 0/1로 포화. */
export function smoothstep(min, max, value) {
  if (!(max > min)) return value >= max ? 1 : 0;
  const t = clamp01((value - min) / (max - min));
  return t * t * (3 - 2 * t);
}

/** 목표 배율 → chaseBlend(0~1). 160% 이하 0, 200% 이상 1, 사이 smoothstep(경계에서 기울기 0 → 점프 최소). */
export function chaseBlendForZoom(zoom) {
  if (!Number.isFinite(zoom)) return 0;
  return smoothstep(CHASE_START_ZOOM, CHASE_FULL_ZOOM, zoom);
}

/** chaseBlend를 target으로 dt 기반 ease-out 보간(줌과 별도, §3.3). τ≈120ms → ~360~420ms에 도달. reducedMotion이면 즉시. */
export function advanceChaseBlend(current, target, dt, reducedMotion = false) {
  const tgt = clamp01(Number.isFinite(target) ? target : 0);
  if (reducedMotion) return tgt;
  let cur = clamp01(Number.isFinite(current) ? current : tgt);
  if (!Number.isFinite(dt) || dt <= 0) return cur;
  const diff = tgt - cur;
  if (Math.abs(diff) < 1e-4) return tgt;
  const k = 1 - Math.exp(-dt / 0.12);
  const next = cur + diff * Math.min(1, Math.max(0, k));
  return Math.abs(tgt - next) < 1e-4 ? tgt : next;
}

/** 투영 상태를 한 번 만들어 프레임 내 모든 개체가 공유(hot loop에서 객체 재생성 최소화, §12).
 *  근거리 평면(depth=1) screenX = C0 + (worldX - squadX)*slope 를 미리 구해 입력 역변환을 닫힌형으로 정확히 만든다. */
export function createChaseProjection(o = {}) {
  const t = o.tuning || PROJECTION;
  const logicalW = Number.isFinite(o.logicalW) ? o.logicalW : 480;
  const logicalH = Number.isFinite(o.logicalH) ? o.logicalH : 800;
  const zoom = Number.isFinite(o.zoom) ? o.zoom : 1;
  const chaseBlend = clamp01(Number.isFinite(o.chaseBlend) ? o.chaseBlend : 0);
  const squadX = Number.isFinite(o.squadX) ? o.squadX : logicalW / 2;
  const squadY = Number.isFinite(o.squadY) ? o.squadY : logicalH * 0.8;
  const farWorldY = Number.isFinite(o.farWorldY) ? o.farWorldY : 0;
  const centerX = logicalW / 2;
  const horizonY = logicalH * t.horizonYFrac;
  const nearY = logicalH * t.nearYFrac;
  // 부분 추종(이사): 추적 성분 기준점을 화면 중앙이 아니라 "중앙 + 기함 이탈×followFrac"에 둔다.
  //  → 기함이 화면 안에서 실제로 좌우 이동해 보이고(조종감), 세계 전체가 통째로 미끄러지는 느낌이 줄어든다. followFrac=0이면 이전과 동일.
  const chaseAnchorX = centerX + (squadX - centerX) * (Number.isFinite(t.followFrac) ? t.followFrac : 0);
  // 근거리 평면 affine: 전술(squadX 기준) ↔ 추적(chaseAnchorX 기준, nearLateral)의 blend
  const C0 = lerp(squadX, chaseAnchorX, chaseBlend);
  const slope = zoom * lerp(1, t.nearLateral, chaseBlend);
  return { zoom, chaseBlend, squadX, squadY, logicalW, logicalH, farWorldY, centerX, chaseAnchorX, horizonY, nearY, C0, slope, t };
}

/** 월드 Y → 깊이(0 소실점 먼곳 .. 1 기함 라인). squadY==farWorldY 방어.
 *  상한은 1 이 아니라 1.6 까지 외삽(이사: "지나쳤을 때 사라지지 않고 멈춘다") — 기함을 지나친 개체(크리스탈·보급선·적 전부)가
 *  nearY 에 얼어붙지 않고 화면 아래로 계속 진행해 "옆을 스쳐 나간다". 월드에선 offscreen 판정이 곧 정리하므로 폭주 없음. */
export function depthForWorldY(worldY, proj) {
  const span = proj.squadY - proj.farWorldY;
  if (Math.abs(span) < 1e-6) return 1;
  return Math.min(1.6, Math.max(0, (worldY - proj.farWorldY) / span));
}

// 내부 공용: 전술/추적 성분 계산 후 chaseBlend로 lerp. kindScale는 추적 성분 배율에만 적용(전술=blend0 불변 보장).
function _project(x, y, proj, kindScale) {
  const tacScale = proj.zoom;
  const tacX = proj.squadX + (x - proj.squadX) * proj.zoom;   // 전술: 기존 함대 중심 확대와 동일
  const tacY = proj.squadY + (y - proj.squadY) * proj.zoom;
  const depth = depthForWorldY(y, proj);
  const b = proj.chaseBlend;
  if (b <= 0) return { x: tacX, y: tacY, scale: tacScale, depth };   // 100%~160%: 전술과 완전 동일
  const t = proj.t;
  const dc = Math.pow(depth, t.depthPow);
  const lateral = lerp(t.farLateral, t.nearLateral, dc);
  let rel = lerp(t.farObjScale, t.nearObjScale, dc);
  if (kindScale) {
    if (kindScale.minRel != null) rel = Math.max(rel, kindScale.minRel);
    if (kindScale.maxRel != null) rel = Math.min(rel, kindScale.maxRel);
  }
  const chaseX = proj.chaseAnchorX + (x - proj.squadX) * lateral * proj.zoom;
  const chaseY = lerp(proj.horizonY, proj.nearY, dc);
  const chaseScale = rel * proj.zoom;
  return { x: lerp(tacX, chaseX, b), y: lerp(tacY, chaseY, b), scale: lerp(tacScale, chaseScale, b), depth };
}

/** 한 월드 점 투영 → { x, y, scale, depth }. 종류 무관(긴 빔·게이트 끝점 등에 사용). */
export function projectPoint(point, proj) {
  return _project(point.x, point.y, proj, null);
}

/** 종류별 가독성 배율을 반영한 개체 투영. kind: squad|boss|enemyBullet|playerBullet|pickup|damageText 등. */
export function projectObject(point, kind, proj) {
  const r = _project(point.x, point.y, proj, KIND_SCALE[kind] || null);
  r.kind = kind;
  return r;
}

/** 마우스 화면 X → 플레이어 근거리 평면의 월드 X. 근거리 affine의 정확한 역함수(모든 zoom·blend에서 왕복 오차 0). */
export function screenToWorldXAtPlayer(screenX, proj) {
  const slope = proj.slope || 1;
  return proj.squadX + (screenX - proj.C0) / slope;
}

/** 기함 표시 배율을 화면에 들어오도록 제한(§3.3). 투영점 y에서 halfH*scale이 상·하 여백을 침범하지 않게.
 *  단순 축소가 아니라 '들어오는 최대 배율'을 구하는 것 — 여유가 있으면 원래 투영 배율(≥100%보다 크게)을 그대로 쓴다. */
export function fitFlagshipScale(projPoint, proj, halfH, topMargin = 8, botMargin = 12) {
  if (!(halfH > 0)) return projPoint.scale;
  const maxBelow = (proj.logicalH - botMargin - projPoint.y) / halfH;   // 하단 잘림 방지
  const maxAbove = (projPoint.y - topMargin) / halfH;                    // 상단 침범 방지
  return Math.max(0.6, Math.min(projPoint.scale, maxBelow, maxAbove));
}

/** 이미 투영된 점이 화면 밖이면 가장자리 표시 정보 반환, 안이면 null(§9). 위치·속도·충돌은 바꾸지 않는 시각 기능. */
export function edgeIndicatorForPoint(projected, viewport, kind) {
  const m = 8;   // 가장자리 여백
  const w = viewport.w, h = viewport.h;
  const onScreen = projected.x >= 0 && projected.x <= w && projected.y >= 0 && projected.y <= h;
  if (onScreen) return null;
  let side = 'top';
  if (projected.x < 0) side = 'left';
  else if (projected.x > w) side = 'right';
  else if (projected.y < 0) side = 'top';
  else side = 'bottom';
  const edgeX = Math.min(w - m, Math.max(m, projected.x));
  const edgeY = Math.min(h - m, Math.max(m, projected.y));
  return { side, edgeX, edgeY, kind, offX: projected.x, offY: projected.y };
}
