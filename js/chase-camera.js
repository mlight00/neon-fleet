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
  //  §G-35 B안(이사님 판단 2026-08-11): 원근 곡선을 **완화**한다. 0.22 → 0.40.
  //   근거: 3D 카메라(fov 52)의 등가 가로배율을 재보니 먼 곳에서 **0.957** 이었다.
  //   2D 는 0.22 로 4.3배나 더 조여 있었고, 그래서 먼 곳이 좁은 띠로 뭉쳐 보였다
  //   (월드 폭으로는 트랙의 455% 가 들어오는데도 "넓어진 느낌이 없다" — 이사님 실기).
  //   0.40 으로 한 번 올렸으나 이사님 실기 재확인: "아직도 좁다" → **0.62**(화면 상단에서 트랙 62% 폭).
  //   3D 등가 0.957 의 약 2/3 지점이다 — 여기서 더 가면 원근감이 눈에 띄게 사라진다.
  //  ⚠️완전히 3D 값(0.957)까지 올리면 원근감이 사라진다 — 절반쯤에서 멈춘다.
  farLateral: 0.62,     // depth=0 좌우 배율(소실점 수렴)
  //  §G-36 C안(이사님 결정 2026-08-12): 1.25 → **2.00**.
  //   가시 반폭 = W/(2·nearLateral) = **120**(트랙의 50%) → 카메라 이동 여유 **240px**.
  //   근거: "카메라가 움직여 가려진 곳이 드러나는 것"(이사님 최초 의도)을 트랙 **밖을 비추지 않고**
  //   달성하는 유일한 방법이다. 480 트랙에서 `이동 = 트랙폭 − 가시폭` 이므로
  //   이동 240px 을 얻으려면 가시 폭이 240px(50%) 이하여야 한다 — 수학적으로 강제된다.
  //  ⚠️G35 의 "가시 폭 80%(384px)" 계약을 **의도적으로 바꾼 것**이다. 80% + 트랙밖 0 + 이동 240 은
  //   동시에 성립할 수 없다(Codex 7차 §2). 셋 중 조준 정합과 트랙밖 0 을 지키고 80% 를 양보했다.
  nearLateral: 2.00,    // depth=1 좌우 배율
  farObjScale: 0.14,    // depth=0 개체 표시 배율(상대) — 멀리서 "작은 점"으로 출발
  nearObjScale: 1.50,   // depth=1 개체 표시 배율(상대) (1.35~1.70)
  depthPow: 2.0,        // 깊이 곡선 pow — 클수록 원거리(작음)가 오래 유지되다 근거리에서 급히 커짐
  //  ⚠️`followFrac` 은 §G-34 §5 에서 **폐기**했다(깊이마다 실효 카메라 위치가 달라져 데드존과 공존 불가).
  //   그 역할(기함 좌우 이동이 화면에 보인다)은 데드존 카메라가 더 정확히 한다 — 파일 하단 참조.
  deadZoneHys: 6,       // 데드존 경계 히스테리시스(px, 월드) — 경계에서 떠는 것을 막는다(4~8 권장)
  deadZoneTau: 0.12,    // 데드존 **밖** 추종 감쇠 시간상수(초) — 빠르게 따라붙는다
  //  §G-35 후속(이사님 판단 2026-08-11): 카메라가 트랙 **밖**을 이만큼까지 비출 수 있다.
  //   이사님 최초 의도 = "카메라가 움직여서 **가려진 곳이 드러나는** 것". 그런데 카메라 이동 거리는
  //   `트랙 폭 − 가시 폭` 이라, P0-1 로 가시 폭을 384(80%)로 넓히자 이동 여유가 96px 만 남았다
  //   (화면상 120px = 25%). 넓게 보일수록 "드러날 영역"이 사라지는 **구조적 상충**이다.
  //   → G35 에서는 트랙 밖 여백(120px)으로 이동 거리를 벌었으나, 그 순간 포인터 역변환이
  //     월드/lane clamp 에 걸려 **앵커 오차 112~150px** 이 났다(Codex 7차 §1 · production 실측).
  //   → §G-36 C안: 오버스캔을 **0 으로 되돌리고** 가시 폭을 줄여(nearLateral 2.0) 이동을 확보한다.
  //     0 이 아닌 값을 넣으려면 "직접 조작 정합을 포기하고 연출 카메라를 택한다"는 결정이 선행돼야 한다.
  //  ⚠️§G-34 §6 에서 정한 정책 B("트랙 밖을 절대 비추지 않는다")를 **의도적으로 완화**한 것이다.
  //   여백에는 별·성운 배경이 깔려 있어 완전한 빈 화면은 아니고, 트랙 끝까지 밀었을 때만 잠깐 보인다.
  edgeOverscanPx: 0,
  deadZoneScreenFrac: 0.10,  // 데드존 반폭을 **화면 비율**로 제한 — 기함이 화면 40~60% 안에 머문다.
  //   ⚠️넓게 잡으면(예전 24%) 기함이 화면 28%/72% 까지 밀려 구석에 붙은 것처럼 보인다.
  //    좁게 잡아야 "기함은 대체로 가운데, 끝으로 밀면 그쪽이 드러난다"가 된다.
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
  //  §G-34 §5(P0-2): 가로식을 **카메라 중심**으로 바꿨다. 카메라가 보는 월드 x 가 화면 중앙에 온다:
  //      chaseX = centerX + (worldX − cameraWorldX) · lateral(depth) · zoom
  //   예전 `followFrac` 방식(`centerX + (squadX−centerX)·f + (x−squadX)·L`)은 같은 식으로 정리하면
  //   실효 카메라 위치가 `squadX − (squadX−centerX)·f/L` 이라 **깊이(L)마다 달라진다** — 한 프레임에
  //   카메라가 여러 곳에 있는 셈이라 데드존(카메라를 실제로 붙잡아 두는 것)과 공존할 수 없다.
  //   → followFrac 폐기. "기함 이동이 화면에 보인다"는 데드존이 더 정확히 해준다(안에서는 1:1로 움직인다).
  //  ⚠️`cameraWorldX` 를 안 주면 기함을 그대로 따라간다(= 기함이 늘 화면 중앙). 데드존을 쓰는 쪽이
  //   `updateChaseCameraX` 로 관리한 값을 넘긴다.
  const cameraWorldX = Number.isFinite(o.cameraWorldX) ? o.cameraWorldX : squadX;
  const chaseAnchorX = centerX;                       // 추적 성분의 화면 기준점 = 항상 화면 중앙
  // 근거리 평면 affine: 전술(squadX 기준) ↔ 추적(카메라 기준, nearLateral)의 blend.
  //  역변환(screenToWorldXAtPlayer)과 렌더가 **이 하나의 affine** 을 공유한다(§4-1 단일 투영의 가로 버전).
  //  **현재 계약(C안)**: full chase 가로에는 zoom 을 곱하지 않는다 → `slope = nearLateral = 2.00`.
  //   근거리 가시 반폭 `W/(2·nearLateral)` = **120**(트랙의 50%), 카메라 `[120, 360]`.
  //  ⚠️전술 성분(`tacX = squadX + (x−squadX)·zoom`)은 그대로다. blend=0 에서 기존 화면과 픽셀 차이 0.
  //   (이력은 완료보고서 G35 §2 · G36 §1 참조 — 여기서는 현재 동작만 설명한다.)
  const nearL = t.nearLateral;
  const C0 = lerp(squadX, centerX + (squadX - cameraWorldX) * nearL, chaseBlend);
  const slope = lerp(zoom, nearL, chaseBlend);
  return { zoom, chaseBlend, squadX, squadY, logicalW, logicalH, farWorldY, centerX, cameraWorldX, chaseAnchorX, horizonY, nearY, C0, slope, t };
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
  const chaseX = proj.centerX + (x - proj.cameraWorldX) * lateral;   // §G-35 P0-1: 가로에 zoom 을 곱하지 않는다
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
  //  §G-35 P0-2(Codex 6차 §1): **정확한 역함수를 복구**한다. 렌더와 입력이 같은 affine 을 쓴다.
  //   `screenX = C0 + (worldX − squadX)·slope` 의 역이다.
  //
  //  ⚠️**이 함수를 근사식으로 바꾸지 마라.** 렌더와 입력이 다른 좌표계가 되는 순간
  //   포인터가 가리킨 곳과 기함이 어긋난다(과거 시도에서 마우스 화면 40% → 기함 화면 44%).
  //  ⚠️폐루프(카메라→조준→기함→카메라)는 좌표계를 갈라서 끊는 게 아니라, **카메라 목표를 포인터에서
  //   직접** 정해서 끊는다 — `pointerCameraTarget()` 참조. 목표가 기함과 독립이면 발산하지 않는다.
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

// ─────────────────────────────────────────────────────────────────────────────
// §G-34 §5(P0-2) 데드존 카메라 — 이사님 아이디어: 기함이 좌/우 경계를 넘으면 그쪽 가려진 영역이 드러난다
// ─────────────────────────────────────────────────────────────────────────────
//  전제: 추적 모드는 가로로 확대(nearLateral·zoom)되므로 **월드 전체가 화면에 안 들어온다**.
//  그래서 "무엇을 보여줄지"를 골라야 하는데, 기함을 늘 화면 중앙에 붙이면 세계가 통째로 미끄러져
//  조종감이 사라진다(그걸 완화하려던 것이 followFrac 이었다).
//  데드존은 그 사이를 정확히 가른다:
//   · 데드존 **안** — 카메라 고정. 기함이 화면에서 실제로 좌우로 움직인다(1:1).
//   · 데드존 **밖** — 카메라가 넘어간 만큼만 따라간다. 그 방향의 가려졌던 영역이 점진적으로 드러난다.

/** 데드존 카메라 상태. `x`=카메라가 보는 월드 x, `active`=지금 따라가는 중인지(히스테리시스용). */
export function createChaseCameraState(x = 0) { return { x, active: false }; }

/** 화면 가로 절반이 **월드 몇 px** 인지(근거리 평면 기준). 데드존 폭과 카메라 한계를 여기서 끌어낸다. */
export function visibleHalfWorld(logicalW, zoom, tuning = PROJECTION) {
  //  full chase 가로 시야는 **zoom 과 무관**하다 → `logicalW / (2·nearLateral)`.
  //   현행 C안: 480 폭 · nearLateral 2.00 → 반폭 **120**(전체 240 = 트랙의 50%). clamp 는 [120, 360].
  //  ⚠️zoom 을 곱하지 마라 — 곱하면 확대할수록 시야가 좁아진다(2.2 에서 반폭 87.27 = 36.4%).
  //  ⚠️인자 `zoom` 은 호출부 호환을 위해 남긴다(전술 구간 계산에 쓰는 곳이 생길 수 있다).
  const lat = Math.max(1e-6, tuning.nearLateral);
  return (logicalW / 2) / lat;
}

/**
 * 데드존 카메라를 한 프레임 갱신한다(상태를 제자리에서 바꾸고 새 x 를 돌려준다).
 *
 *  @param st      `createChaseCameraState` 로 만든 상태
 *  @param squadX  기함 월드 x
 *  @param dt      프레임 시간(초) — **dt 기반 감쇠**를 쓴다. 프레임률이 달라도 같은 속도로 따라간다.
 *  @param o       { deadHalf, hysteresis, cameraMin, cameraMax, tau, snap }
 *
 *  ⚠️히스테리시스가 없으면 경계에서 "따라감 ↔ 멈춤"이 매 프레임 뒤집혀 화면이 떤다.
 *   한 번 따라가기 시작하면 안쪽으로 `hysteresis` 만큼 더 들어와야 멈춘다.
 */
export function updateChaseCameraX(st, squadX, dt, o = {}) {
  if (!st) return squadX;
  const deadHalf = Math.max(0, Number.isFinite(o.deadHalf) ? o.deadHalf : 0);
  const hys = Math.min(deadHalf, Math.max(0, Number.isFinite(o.hysteresis) ? o.hysteresis : 6));
  const lo = Number.isFinite(o.cameraMin) ? o.cameraMin : -Infinity;
  const hi = Number.isFinite(o.cameraMax) ? o.cameraMax : Infinity;
  const tau = Number.isFinite(o.tau) && o.tau > 0 ? o.tau : 0.12;
  if (!Number.isFinite(st.x)) st.x = squadX;

  const off = squadX - st.x;                       // 기함이 카메라에서 얼마나 벗어났나
  const mag = Math.abs(off);
  //  경계 판정 — 나갈 땐 deadHalf, 들어올 땐 deadHalf−hys(같은 값이면 떤다).
  if (mag > deadHalf) st.active = true;
  else if (mag < deadHalf - hys) st.active = false;

  //  목표와 속도는 데드존 안/밖에서 다르다.
  //   · 밖(active) — "기함이 경계에 딱 걸치는 위치"로 **빠르게**(tau) 따라간다.
  //   · 안 — 기함 쪽으로 **아주 느리게**(tauRecenter) 복귀한다.
  //
  //  ⚠️예전에는 데드존 안에서 카메라를 **완전히 정지**시켰는데, 그러면 카메라가 한 번 뒤처진 뒤
  //   영영 돌아오지 않는다. 실측(2026-08-11 이사님 실기 제보): 기함이 트랙 정중앙(240)에 10초를
  //   있어도 카메라가 278.5 에 남아 기함이 **화면 28%** 에 붙어 있었다. 화면이 늘 한쪽으로 치우치고
  //   3D 카메라 트럭 이동(followX)도 ±105.8px 로 커져 기함이 구석에 몰렸다.
  //   → 데드존의 뜻은 "안에서는 안 움직인다"가 아니라 **"안에서는 급히 따라붙지 않는다"** 이다.
  //     느린 복귀가 있어야 ① 급한 좌우 이동에는 카메라가 뒤처져 조종감이 살고(데드존 효과)
  //     ② 정착하면 기함이 화면 중앙으로 돌아온다.
  //  ⚠️목표는 **언제나 기함**이다. 데드존이 가르는 것은 목표가 아니라 **따라가는 속도**다.
  //   처음엔 active 일 때 목표를 "데드존 경계에 걸치는 위치"로 뒀는데, 거기 도달하면 `off` 가 정확히
  //   `deadHalf` 로 수렴해 **히스테리시스 해제 조건(|off| < deadHalf − hys)을 영원히 만족하지 못했다.**
  //   카메라가 밴드에 갇혀 기함이 화면 28%/72% 에 붙박였다(2026-08-11 이사님 실기 제보로 발견).
  //  목표는 **언제나 기함**이다(경계 위치로 두면 `off` 가 `deadHalf` 로 수렴해 히스테리시스가 영영 안 풀린다).
  //  데드존이 가르는 것은 **움직이느냐 마느냐**다:
  //   · 밖(active) — 기함까지 빠르게 따라간다. off 가 0 으로 줄어 곧 안으로 들어온다.
  //   · 안 — **완전히 멈춘다.**
  //
  //  ⚠️안에서 멈추는 것이 **조준 안정성의 필수 조건**이다(2026-08-11 이사님 "좌우 끝에서 튕긴다" 제보).
  //   추적 구간의 입력 역변환을 정리하면 `worldTarget = cameraWorldX + (sx − centerX)/nearL` 이다 —
  //   목표가 기함이 아니라 **카메라에만** 의존한다. 카메라가 계속 기함을 따라가면(느린 복귀 포함)
  //   목표도 따라 움직여 기함이 한쪽으로 계속 흘러가고, 트랙 끝 clamp 에 부딪혀 **튕긴다.**
  //   카메라가 멈춰 있어야 목표가 고정점이 되어 마우스 위치에 기함이 정착한다.
  //   → 그 대신 "기함이 화면 중앙 근처에 있게" 하는 일은 **데드존을 좁게 잡아서** 푼다(main 참조).
  //  §G-35 P0-3(Codex 6차 §2): 상태를 셋으로 나눈다 — 영구 정지는 한 번 어긋난 구도를 계속 남긴다.
  //   · `TRACK`     데드존 밖 → 빠르게(tau) 따라간다
  //   · `HOLD`      데드존 안 + 기함이 움직이는 중 → 카메라 유지(조준 안정)
  //   · `RECENTER`  입력 idle + 기함 저속이 일정 시간 지속 → 느리게(tauRecenter) 중앙 복귀
  //  ⚠️`RECENTER` 는 **키보드 전용**이다. 마우스·터치는 포인터가 카메라 목표를 정하므로
  //   여기 오지 않는다(두 목표가 싸우면 안 된다 — main 의 `pointerDriven` 분기 참조).
  st.idleT = Number.isFinite(st.idleT) ? st.idleT : 0;
  const speed = Math.abs(squadX - (Number.isFinite(st._prevSquadX) ? st._prevSquadX : squadX)) / Math.max(1e-6, dt);
  st._prevSquadX = squadX;
  const IDLE_SPEED = 8;                              // 월드 px/s — 이보다 느리면 "멈춘 것"으로 본다
  const IDLE_HOLD = Number.isFinite(o.idleHold) ? o.idleHold : 0.5;   // 이만큼 지속되면 복귀 시작
  if (st.active || speed > IDLE_SPEED) st.idleT = 0; else st.idleT += Math.max(0, dt);
  const recentering = !!o.idleRecenter && !st.active && st.idleT >= IDLE_HOLD;

  if (o.snap) { st.x = squadX; st.idleT = 0; }       // 전환·부활 등 즉시 맞춰야 하는 순간
  else if (st.active) {
    const k = 1 - Math.exp(-Math.max(0, dt) / tau); // dt 기반 — 고정 계수로 하면 60fps 가정이 박힌다
    st.x += (squadX - st.x) * Math.min(1, Math.max(0, k));
  } else if (recentering) {
    const tr = Number.isFinite(o.tauRecenter) && o.tauRecenter > 0 ? o.tauRecenter : 0.9;
    const k = 1 - Math.exp(-Math.max(0, dt) / tr);
    st.x += (squadX - st.x) * Math.min(1, Math.max(0, k));
  }
  st.phase = st.active ? 'TRACK' : recentering ? 'RECENTER' : 'HOLD';
  //  월드 밖을 보지 않게. 볼 수 있는 폭이 월드보다 넓으면 가운데 고정(양끝이 다 보이므로 움직일 이유가 없다).
  st.x = lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, st.x));
  return st.x;
}

/** 데드존 반폭 — 편대가 화면 밖으로 밀려나지 않는 선까지만 카메라를 붙잡는다.
 *  `visibleHalf` 에서 편대가 차지하는 여유(`squadMargin`)를 뺀 값. 음수면 0(=항상 따라감). */
export function deadZoneHalf(visibleHalf, squadMargin) {
  return Math.max(0, visibleHalf - Math.max(0, squadMargin || 0));
}

/**
 * §G-35 P0-2 — **포인터 화면 위치**에서 카메라 목표를 정한다(기함과 독립).
 *
 *  왜 이래야 하나: 카메라가 기함을 따라가면
 *    카메라 이동 → (정지한 포인터를 새 카메라로 역변환) → 월드 목표 이동 → 기함 이동 → 카메라 이동…
 *  이 폐루프가 생겨 기함이 한쪽으로 흘러가고 트랙 끝에서 튕긴다(이사님 실기).
 *  카메라 목표를 **포인터에서 직접** 정하면 그 고리가 끊어진다 — 포인터가 멈추면 목표도 멈춘다.
 *  그러면서도 렌더·입력은 같은 affine(`screenToWorldXAtPlayer`)을 계속 쓴다.
 *
 *  형태: 화면 중앙 ±deadHalf 는 카메라 고정, 그 밖은 가장자리로 갈수록 선형으로 카메라를 민다.
 *  @param screenX  포인터의 논리 화면 x
 *  @param logicalW 논리 화면 폭
 *  @param visHalf  `visibleHalfWorld()` 값(= 카메라가 움직일 수 있는 여유를 정한다)
 *  @returns 카메라가 보아야 할 월드 x (clamp 적용)
 */
export function pointerCameraTarget(screenX, logicalW, visHalf, tuning = PROJECTION) {
  const centerX = logicalW / 2;
  if (!Number.isFinite(screenX)) return centerX;
  const frac = Number.isFinite(tuning.deadZoneScreenFrac) ? tuning.deadZoneScreenFrac : 0.10;
  const deadHalf = logicalW * frac;
  const span = Math.max(1e-6, centerX - deadHalf);
  //  중앙 데드존 밖으로 나간 정도(0~1). 안이면 0 → 카메라는 트랙 중앙을 본다.
  const edge = Math.min(1, Math.max(0, (Math.abs(screenX - centerX) - deadHalf) / span));
  //  카메라가 갈 수 있는 최대 이탈 = centerX − visHalf (트랙 밖을 비추지 않는 한계와 같다).
  //  §G-35 후속: 여백만큼 더 멀리 민다 — 그만큼 가려졌던 영역이 드러난다.
  const over = Number.isFinite(tuning.edgeOverscanPx) ? tuning.edgeOverscanPx : 0;
  const reach = Math.max(0, centerX - visHalf + over);
  const desired = centerX + Math.sign(screenX - centerX) * edge * reach;
  const lo = visHalf - over, hi = logicalW - visHalf + over;
  return lo > hi ? centerX : Math.min(hi, Math.max(lo, desired));
}

/**
 * §G-36 P0-1 — 카메라가 볼 수 있는 월드 x 범위. **production 과 테스트가 이 함수 하나를 공유한다.**
 *
 *  ⚠️G35 에서 테스트 fixture 가 수동으로 `[visHalf, LW−visHalf]` 를 잘라 넣는 바람에,
 *   production 이 오버스캔 `[72, 408]` 로 바뀐 뒤에도 테스트는 옛 범위로 적분했다.
 *   그 결과 "앵커 오차 0.00px" 이라는 **가짜 통과**가 나왔다(실제로는 가장자리에서 112~150px).
 *   범위 계산이 두 곳에 있으면 반드시 갈라진다 — 그래서 순수 함수로 못 박는다.
 *
 *  ⚠️`edgeOverscanPx > 0` 이면 카메라가 트랙 밖을 비춘다. 그 순간 포인터 역변환 결과가
 *   월드/lane clamp 에 걸려 **직접 조작 정합이 깨진다**. 오버스캔은 연출 카메라를 택할 때만 쓴다.
 */
export function chaseCameraBounds(logicalW, visibleHalf, tuning = PROJECTION) {
  const over = Number.isFinite(tuning.edgeOverscanPx) ? tuning.edgeOverscanPx : 0;
  const min = visibleHalf - over;
  const max = logicalW - visibleHalf + over;
  //  볼 수 있는 폭이 트랙보다 넓으면 양 끝이 다 보이므로 가운데 고정(움직일 이유가 없다).
  return min > max ? { min: logicalW / 2, max: logicalW / 2 } : { min, max };
}
