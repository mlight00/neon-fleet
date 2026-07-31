// 전투 카메라 줌 — 순수 로직(DOM·게임 전역 비의존). 렌더와 입력 좌표에만 쓰는 '시각 배율'이다.
//  ⚠️ 게임 규칙(실제 좌표·충돌·속도·스폰·보상·난이도)은 이 값을 절대 참조하지 않는다.
//  뷰포트 픽셀 배율(main.js의 scale: 브라우저px↔논리캔버스)과는 다른 축이다 — 이건 논리 세계의 시각 확대.

// 배율 4단계(이사): 100% 일반 / 150% 전술 확대 / 200% 함미 추적 / 220% 함미 근접.
//  10% 잔스텝은 어중간한 구도(특히 180% 스왑 경계 t=0.5)만 늘려서 제거 — 정착 가능한 값은 이 4개뿐.
//  전환 계약과의 관계: 150%<160%(3D 휴면·전술 확대만), 200%=blend·t 완전 전환. 150→200 보간이 스왑(t=0.5)+워프 플래시를 통과한다.
export const ZOOM_STOPS = [1.00, 1.50, 2.00, 2.20];
export const DEFAULT_ZOOM = 1.00;
export const MIN_ZOOM = ZOOM_STOPS[0];
export const MAX_ZOOM = ZOOM_STOPS[ZOOM_STOPS.length - 1];

/** 가장 가까운 정착 배율로 스냅 — 구 저장(10% 격자 값·0.85 축소값 등)도 여기로 수렴한다. */
export function normalizeZoom(v) {
  if (!Number.isFinite(v)) return DEFAULT_ZOOM;
  let best = ZOOM_STOPS[0], bd = Infinity;
  for (const s of ZOOM_STOPS) { const d = Math.abs(v - s); if (d < bd) { bd = d; best = s; } }
  return best;
}

/** [MIN,MAX] 범위로 제한. */
export function clampZoom(v) {
  if (!Number.isFinite(v)) return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v));
}

/** 손상값(NaN·Infinity·문자열·범위 밖)을 안전한 배율로 복구. 저장 로드/역직렬화 방어용. */
export function safeZoom(v, fallback = DEFAULT_ZOOM) {
  // 누락값(null·undefined·빈문자열)은 '손상'이 아니라 '미설정' → 기본값으로 백필(Number(null)=0으로 새서 min으로 빠지지 않게).
  const n = (v == null || v === '') ? NaN : (typeof v === 'number' ? v : Number(v));
  if (!Number.isFinite(n)) return clampZoom(normalizeZoom(fallback));
  return clampZoom(normalizeZoom(n));
}

/** 한 단계 확대(direction>0)/축소(<0) — 4단계 목록에서 이웃 스텝으로. 휠 1노치·키보드 1회·일시정지 ± 버튼 공용. */
export function stepZoom(v, direction) {
  const cur = normalizeZoom(clampZoom(Number.isFinite(v) ? v : DEFAULT_ZOOM));
  const i = ZOOM_STOPS.indexOf(cur);
  const j = Math.min(ZOOM_STOPS.length - 1, Math.max(0, i + (direction > 0 ? 1 : direction < 0 ? -1 : 0)));
  return ZOOM_STOPS[j];
}

/**
 * current를 target으로 dt 기반 ease-out 지수 접근으로 보간.
 *  - reducedMotion이면 즉시 target(보간 없음).
 *  - 주사율 독립: 프레임당 고정 비율이 아니라 dt로 시간 상수 τ를 만든다(60Hz·144Hz 속도 동일).
 *  - 충분히 근접하면 스냅해 미세 누적을 막는다.
 */
export function advanceZoom(current, target, dt, reducedMotion = false) {
  const tgt = Number.isFinite(target) ? target : DEFAULT_ZOOM;
  if (reducedMotion) return tgt;
  let cur = Number.isFinite(current) ? current : tgt;
  if (!Number.isFinite(dt) || dt <= 0) return cur;
  const diff = tgt - cur;
  if (Math.abs(diff) < 1e-4) return tgt;                // 근접 → 스냅
  const k = 1 - Math.exp(-dt / 0.06);                   // τ≈60ms → ~180ms에 대부분 도달(ease-out, 150~250ms 느낌)
  const next = cur + diff * Math.min(1, Math.max(0, k));
  return Math.abs(tgt - next) < 1e-4 ? tgt : next;
}

/** 카메라 상태 생성. current=target=검증된 zoom(4단계 스냅 — 구 저장의 10% 격자·180% 값도 자동 수렴), anchor는 매 프레임 함대 위치로 갱신. */
export function createCamera(zoom = DEFAULT_ZOOM) {
  const z = safeZoom(zoom);
  return { current: z, target: z, anchorX: 0, anchorY: 0 };
}

// ── 좌표 변환 ─────────────────────────────────────────────────
//  화면 = anchor + (월드 - anchor) × zoom
//  월드 = anchor + (화면 - anchor) ÷ zoom
export function worldToScreenX(x, cam) { return cam.anchorX + (x - cam.anchorX) * cam.current; }
export function screenToWorldX(x, cam) { const z = cam.current || 1; return cam.anchorX + (x - cam.anchorX) / z; }
export function worldToScreenPoint(p, cam) {
  return { x: cam.anchorX + (p.x - cam.anchorX) * cam.current, y: cam.anchorY + (p.y - cam.anchorY) * cam.current };
}
export function screenToWorldPoint(p, cam) {
  const z = cam.current || 1;
  return { x: cam.anchorX + (p.x - cam.anchorX) / z, y: cam.anchorY + (p.y - cam.anchorY) / z };
}

/** 현재 배율에서 화면 (0,0)~(w,h)에 대응하는 월드 경계(축소 시 더 넓게 보임). */
export function visibleWorldBounds(cam, viewport) {
  const tl = screenToWorldPoint({ x: 0, y: 0 }, cam);
  const br = screenToWorldPoint({ x: viewport.w, y: viewport.h }, cam);
  return { minX: tl.x, minY: tl.y, maxX: br.x, maxY: br.y };
}
