// js/wheel-input.js — 휠 입력 정규화·누적(순수). DOM·시간 전역 의존 없음(now는 인자로 주입)이라 테스트가 결정적이다.
//  목적: (1) 가로/수평 우세 휠이 카메라 축소로 오인되지 않게, (2) 정밀 터치패드의 작은 delta가 매 이벤트 5%로
//  튀지 않게 픽셀 임계까지 누적해 한 단계씩만 변경. deltaMode(0/1/2)를 공통 픽셀값으로 정규화한다.

// WheelEvent.deltaMode 상수(브라우저 상수가 없는 테스트 환경 대비 숫자값 직접 정의)
export const DOM_DELTA_PIXEL = 0;   // delta가 이미 픽셀
export const DOM_DELTA_LINE = 1;    // delta가 줄 수 → 줄당 픽셀로 환산
export const DOM_DELTA_PAGE = 2;    // delta가 페이지 수 → 뷰포트 높이로 환산

// 줄 → 픽셀 근사. 3줄(전통 휠 한 칸의 LINE 표현) × 33 ≈ 99px ≈ PIXEL 모드 한 칸(≈100px)과 손맛을 맞춘다.
export const LINE_HEIGHT_PX = 33;
export const DEFAULT_THRESHOLD_PX = 60;    // 50~70px 권장 중앙값: 한 단계(5%)를 트리거하는 누적 픽셀
export const DEFAULT_IDLE_RESET_MS = 200;  // 180~250ms 권장 중앙값: 이 시간 이상 입력이 없으면 잔여 누적 폐기

/** deltaMode(0/1/2)를 픽셀 단위 {deltaX, deltaY}로 정규화. PAGE 모드에만 viewportHeight를 쓴다.
 *  event는 실제 WheelEvent 또는 {deltaX, deltaY, deltaMode} 형태의 평범한 객체 모두 허용. */
export function normalizeWheelDelta(event, viewportHeight = 800) {
  const mode = event && Number.isFinite(event.deltaMode) ? event.deltaMode : DOM_DELTA_PIXEL;
  const dx = event && Number.isFinite(event.deltaX) ? event.deltaX : 0;
  const dy = event && Number.isFinite(event.deltaY) ? event.deltaY : 0;
  let scale = 1;
  if (mode === DOM_DELTA_LINE) scale = LINE_HEIGHT_PX;
  else if (mode === DOM_DELTA_PAGE) scale = Number.isFinite(viewportHeight) && viewportHeight > 0 ? viewportHeight : 800;
  return { deltaX: dx * scale, deltaY: dy * scale };
}

/** 수직 delta 픽셀 누적기. push()가 임계 도달 시 한 단계(-1 축소 / +1 확대)를 돌려주고 잔여를 0으로 비운다.
 *  방향이 바뀌거나 idle 시간을 넘기면 잔여를 폐기해 오래된 제스처가 새 제스처와 섞이지 않게 한다.
 *  부호 규약: 휠 위(deltaY<0)=확대(+1), 휠 아래(deltaY>0)=축소(-1). */
export function createWheelStepAccumulator(opts = {}) {
  const thresholdPx = Number.isFinite(opts.thresholdPx) ? opts.thresholdPx : DEFAULT_THRESHOLD_PX;
  const idleResetMs = Number.isFinite(opts.idleResetMs) ? opts.idleResetMs : DEFAULT_IDLE_RESET_MS;
  const resolveVh = () => {
    const v = typeof opts.viewportHeight === 'function' ? opts.viewportHeight() : opts.viewportHeight;
    return Number.isFinite(v) && v > 0 ? v : 800;
  };
  let acc = 0;          // 누적 픽셀(부호=방향)
  let lastNow = null;   // 직전 입력 시각(ms). idle 판정용

  return {
    /** @returns {-1|0|1} 이번 이벤트로 발생한 배율 단계 변화 */
    push(input = {}) {
      const now = Number.isFinite(input.now) ? input.now : 0;
      const vh = Number.isFinite(input.viewportHeight) && input.viewportHeight > 0 ? input.viewportHeight : resolveVh();
      const { deltaY } = normalizeWheelDelta(input, vh);
      if (deltaY === 0) { lastNow = now; return 0; }   // 수직 성분 없음 → 변화 없음(핸들러가 먼저 걸러도 안전망)

      // idle 초과 → 오래된 잔여 폐기
      if (lastNow != null && Number.isFinite(now) && now - lastNow > idleResetMs) acc = 0;
      lastNow = now;

      // 방향 전환 → 이전 방향 잔여 폐기(반대로 살짝 스크롤하다 방향 바꿔도 즉시 반응)
      if (acc !== 0 && Math.sign(deltaY) !== Math.sign(acc)) acc = 0;

      acc += deltaY;

      // 임계 도달: 한 이벤트에서 최대 한 단계만. 초과분은 버려 한 번의 강한 플링이 여러 단계로 튀지 않게 한다.
      if (acc <= -thresholdPx) { acc = 0; return +1; }   // 위로 누적 → 확대
      if (acc >= thresholdPx) { acc = 0; return -1; }    // 아래로 누적 → 축소
      return 0;
    },
    reset() { acc = 0; lastNow = null; },
    get residual() { return acc; },
  };
}

/** 휠 이벤트 → {step, preventDefault} 결정(순수). main.js 리스너는 이 결과를 그대로 적용하는 얇은 래퍼가 된다.
 *  순서(§2.3): Ctrl/Cmd 가드 → 전투/오버레이 가드 → 수평 우세 가드 → 수직 정규화·누적.
 *  - 수평 우세(deltaY===0 또는 |deltaX|>=|deltaY|): 변화 0, preventDefault 안 함(정상 가로 스크롤 허용).
 *  - 유효한 수직 입력: 캔버스 위 전투 중이므로 페이지 스크롤 차단(preventDefault=true), 배율은 임계 도달 시에만. */
export function resolveWheelZoom(event, ctx = {}) {
  const NONE = { step: 0, preventDefault: false };
  if (!event) return NONE;
  if (event.ctrlKey || event.metaKey) return NONE;   // 브라우저 접근성 확대 — 가로채지 않음
  if (!ctx.canZoom) return NONE;                      // 전투 아님·일시정지·드래프트·결과 오버레이
  const dx = Number.isFinite(event.deltaX) ? event.deltaX : 0;
  const dy = Number.isFinite(event.deltaY) ? event.deltaY : 0;
  if (dy === 0 || Math.abs(dx) >= Math.abs(dy)) return NONE;   // 수평 우세 → 무시 + preventDefault 안 함
  const step = ctx.accumulator
    ? ctx.accumulator.push({ deltaX: dx, deltaY: dy, deltaMode: event.deltaMode, now: ctx.now, viewportHeight: ctx.viewportHeight })
    : 0;
  return { step, preventDefault: true };   // 유효 수직 입력이면 임계 미도달이라도 페이지 스크롤은 막는다
}
