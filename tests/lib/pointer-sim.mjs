// ── §G-37 §2 — 포인터 루프 시뮬레이터 (g35-pointer / g37-pointer-matrix 공용) ──────────
//
//  Codex 8차 §3: 매트릭스를 새로 쓰면서 시뮬레이터를 **복사**하면 G35 회귀가 그대로 재현된다
//  (그때 fixture 가 자기만의 clamp 를 갖고 있어서, 제품이 바뀌어도 테스트는 옛 범위를 적분했다).
//  → 시뮬레이터는 **여기 하나**뿐이고, 그 안의 모든 수는 **제품 함수에서** 나온다.
//
//  ⚠️이 파일에 상수를 새로 박지 마라. `PROJECTION`·`BAL`·`SHIP_DEFS`·`chaseCameraBounds` 가 진실이다.
import {
  createChaseProjection, screenToWorldXAtPlayer, projectObject,
  visibleHalfWorld, pointerCameraTarget, chaseCameraBounds, PROJECTION,
} from '../../js/chase-camera.js';
import { BAL } from '../../js/balance.js';
import { SHIP_DEFS } from '../../js/ships.js';

export const LW = 480, LH = 800, SQY = 670;
/** 가시 반폭은 **zoom 과 무관**(C안) — 그래서 인자를 받아도 값이 같다. 그 사실 자체를 매트릭스가 검증한다. */
export const VIS = visibleHalfWorld(LW, 2.2, PROJECTION);
export const BOUNDS = chaseCameraBounds(LW, VIS, PROJECTION);
/** production 이 실제로 쓰는 lane margin. ⚠️상수 박기 금지 — 상위 tier 는 기함이 넓어 경계가 다르다. */
export const laneFor = (tier) =>
  BAL.squad.laneMargin + (SHIP_DEFS[Math.min(tier, SHIP_DEFS.length - 1)].visualWidth || 0) * 0.4;

/**
 * 포인터를 한 곳에 **고정**한 채 지정 시간 동안 실제 루프를 돌린다.
 *  매 프레임: 카메라 목표(포인터에서) → 카메라 수렴 → 그 카메라로 역변환 → 기함이 목표로 이동 → clamp.
 *  폐루프가 있으면 여기서 발산한다.
 */
export function runPointerHold(screenX, seconds, opts = {}) {
  const { squadX0 = 240, camX0 = 240, dt = 1 / 60, tier = 0, zoom = 2.2, marks = [2, 6, 10] } = opts;
  const lane = laneFor(tier);
  let camX = camX0, sqX = squadX0, worldClamps = 0, laneClamps = 0;
  const trace = [];
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) {
    //  ① 카메라 목표는 포인터에서(기함과 독립) → dt 기반 수렴 → 제품 bounds 로 clamp
    const desired = pointerCameraTarget(screenX, LW, VIS, PROJECTION);
    camX += (desired - camX) * (1 - Math.exp(-dt / PROJECTION.deadZoneTau));
    camX = Math.min(BOUNDS.max, Math.max(BOUNDS.min, camX));
    //  ② 그 프레임 카메라로 **정확한 역함수** 적용
    const proj = createChaseProjection({
      logicalW: LW, logicalH: LH, zoom, chaseBlend: 1, squadX: sqX, squadY: SQY, cameraWorldX: camX,
    });
    let target = screenToWorldXAtPlayer(screenX, proj);
    //  ③ 월드 clamp → 기함 추종 → lane clamp. **production 과 같은 순서·같은 값**이다.
    const tRaw = target;
    target = Math.min(LW, Math.max(0, target));
    if (target !== tRaw) worldClamps++;
    sqX += (target - sqX) * 0.25;
    const sRaw = sqX;
    sqX = Math.min(LW - lane, Math.max(lane, sqX));
    if (sqX !== sRaw) laneClamps++;
    const t = (i + 1) * dt;
    if (marks.some((m) => Math.abs(t - m) < dt / 2)) {
      trace.push({ t: +t.toFixed(2), camX: +camX.toFixed(2), target: +target.toFixed(2), sqX: +sqX.toFixed(2) });
    }
  }
  const proj = createChaseProjection({
    logicalW: LW, logicalH: LH, zoom, chaseBlend: 1, squadX: sqX, squadY: SQY, cameraWorldX: camX,
  });
  return { camX, sqX, trace, lane, tier, zoom, worldClamps, laneClamps,
    shipScreenX: projectObject({ x: sqX, y: SQY, r: 1 }, 'squad', proj).x };
}

/**
 * 포인터 `sx` 가 **정착했을 때 기함이 가려는 월드 x**. 시간 적분 없이 제품 함수만으로 구한다.
 *  ⚠️수식을 여기 옮겨 적지 않는다 — `pointerCameraTarget` + `screenToWorldXAtPlayer` 를 그대로 호출한다.
 *   (근거리 역함수는 squadX 에 의존하지 않는 affine 이라 고정점이 유일하다 — 그 사실도 테스트가 확인한다.)
 */
export function settledWorldTarget(screenX, zoom = 2.2, squadProbe = 240) {
  const camX = Math.min(BOUNDS.max, Math.max(BOUNDS.min, pointerCameraTarget(screenX, LW, VIS, PROJECTION)));
  const proj = createChaseProjection({
    logicalW: LW, logicalH: LH, zoom, chaseBlend: 1, squadX: squadProbe, squadY: SQY, cameraWorldX: camX,
  });
  return { camX, worldX: screenToWorldXAtPlayer(screenX, proj) };
}

/**
 * tier 의 **안전 앵커 구간**(포인터를 정확히 따라갈 수 있는 화면 x 범위)을 이분법으로 **연속 계산**한다.
 *  ⚠️표에 손으로 적은 숫자를 쓰지 않는다 — lane margin 이 바뀌면 경계도 따라 움직여야 한다.
 */
export function safeAnchorRange(tier, zoom = 2.2) {
  const lane = laneFor(tier);
  const ok = (sx) => {
    const w = settledWorldTarget(sx, zoom).worldX;
    return w >= lane && w <= LW - lane;
  };
  const bisect = (bad, good) => {          // bad→good 사이의 전환점을 80회 이분
    for (let i = 0; i < 80; i++) { const m = (bad + good) / 2; if (ok(m)) good = m; else bad = m; }
    return good;
  };
  return { lane, lo: bisect(0, LW / 2), hi: bisect(LW, LW / 2) };
}
