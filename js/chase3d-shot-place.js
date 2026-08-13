// ── 발사체 3D 배치 수학(순수) — §G-21 §6.3 실행 테스트를 위해 renderer 본문에서 분리 ──
//  여기 있는 함수들이 실제 placeShots/placeSwarm 이 쓰는 바로 그 수학이다.
//  테스트가 이 함수들을 직접 호출해 "화면 위치 오차·진행각 부호·크기 위계"를 수치로 검증한다.
//  (예전에는 이 수학이 renderer 안에 인라인이라 정규식 대조밖에 할 수 없었다 — Codex P1 지적.)
//  THREE 를 인자로 받지 않고, 호출부가 넘긴 THREE 객체(스크래치)만 조작한다 → 이 모듈은 Three.js 에 의존하지 않는다.

/** 발사체가 놓이는 최대 시선 깊이. 화면 밖으로 나가기 직전의 탄이 여기에 선다.
 *  차지 빔의 도달점도 같은 값을 쓴다 — 두 연출의 사거리가 갈라지지 않도록(§G-25). */
export const SHOT_DEPTH_MAX = 80;
export const SHOT_DEPTH_MIN = 3.5;

/** 시선 깊이. 탄이 기함보다 얼마나 앞서 나갔는지(월드) + 카메라가 기함 뒤에 있는 거리.
 *  클램프 [3.5, 80] = near/far·조명 안전권. 클램프돼도 아래 shotScale 이 화면 크기를 보정한다. */
export function shotDepth(squadY, worldY, scaleZ, camDist) {
  return Math.min(SHOT_DEPTH_MAX, Math.max(SHOT_DEPTH_MIN, (squadY - worldY) * scaleZ + camDist));
}

/** 진행각(yaw). 절차 발사체 지오의 노즈가 −z 라 π 로 뒤집고, 추적 카메라의 화면 오른쪽이 월드 −X 라 부호도 뒤집는다.
 *  아군탄 wob≈0 → +z(소실점으로), 적탄 wob≈π → −z(카메라로), 퍼짐탄은 실제 벌어진 방향 그대로. */
export function shotYaw(wob) { return Math.PI - (wob || 0); }

/** 논리 px 초점거리 — 세로 fov 와 논리 높이로부터. */
export function focalPx(logicalH, fovDeg) { return (logicalH * 0.5) / Math.tan((fovDeg * Math.PI) / 360); }

/**
 * 인스턴스 스케일(x=y=가로·두께, z=전장).
 *  minPx 하한에는 **mul 을 넣지 않는다** — 분모에 mul 이 있으면 k2 가 그것을 정확히 상쇄해
 *  먼 거리에서 모든 탄이 같은 minPx 로 수렴하고 위계(예광탄 < 발칸)가 사라진다(§6.3).
 *  결과적으로 종류별 실효 하한 = minPx × mul 이 된다.
 */
export function shotScale(len, wRel, mul, wmul, minPx, depth, fpx, out = { x: 0, y: 0, z: 0 }) {
  const k2 = minPx > 0 ? Math.max(1, (minPx * depth) / (fpx * len)) : 1;
  const m2 = mul * k2;
  out.x = len * wRel * wmul * m2;
  out.y = out.x;
  out.z = len * m2;
  return out;
}

/** 화면에 보이는 전장(논리 px) — 월드 전장(scale.z)과 깊이로부터. 테스트의 위계 판정 기준. */
export function screenLenPx(worldLenZ, depth, fpx) { return (worldLenZ * fpx) / depth; }

/**
 * 화면점 → 카메라 광선 위의 "그 시선 깊이" 지점.
 *  화면 위치는 2.5D 투영에 정합(sx/sy 역투영)하고 깊이만 월드에서 준다 — §G-13 최종 계약.
 *  camera/fwd/outPos/tmpV/tmpDir 는 호출부가 재사용하는 THREE 객체(프레임 중 할당 0).
 */
export function placeOnRay(camera, fwd, ndcX, ndcY, depth, outPos, tmpV, tmpDir) {
  tmpV.set(ndcX, ndcY, 0.5).unproject(camera);
  tmpDir.subVectors(tmpV, camera.position).normalize();
  outPos.copy(camera.position).addScaledVector(tmpDir, depth / Math.max(1e-4, tmpDir.dot(fwd)));
  return outPos;
}

/**
 * §G-40 — 화면 반폭(논리px) → 그 깊이에서 같은 화면 폭을 내는 **월드 반지름**.
 *
 *  이사님 제보(2026-08-13): "함미모드에서 차지샷 넓이가 완전 좁아. 2D 랑 차이가 크다."
 *
 *  원인 실측:
 *   · 3D 빔 반지름이 `(0.34 + 0.24·p) × (3단계면 1.5)` 라는 **고정 상수**였다.
 *     2D 는 `기함 시각폭 × 1.05 × (1 + 0.18·(단계−1))` 로 **기함이 커지면 빔도 넓어진다.**
 *     실측 격차: tier5·3단계에서 2D 158px vs 3D ~61px.
 *   · 게다가 실린더가 `radiusTop 0.06` 원뿔이라 **원근 축소 위에 기하 축소가 겹쳐** 이중으로 가늘어졌다.
 *     실측: 화면 y=560 에서 61.4px → y=160 에서 4.7px.
 *
 *  ⚠️화면 폭 = 월드반지름 × 초점거리 / 깊이. 이 함수는 그 역이다.
 *   깊이를 넘기면 "그 자리에서 원하는 화면 폭이 나오는 반지름"을 돌려준다.
 */
export function worldRadiusForScreenHalfW(screenHalfW, depth, fpx) {
  if (!(screenHalfW > 0) || !(depth > 0) || !(fpx > 0)) return 0;
  return (screenHalfW * depth) / fpx;
}

/** 논리 화면좌표 → NDC. */
export function toNdcX(sx, logicalW) { return (sx / logicalW) * 2 - 1; }
export function toNdcY(sy, logicalH) { return -((sy / logicalH) * 2 - 1); }

export default { shotDepth, shotYaw, focalPx, shotScale, screenLenPx, placeOnRay, worldRadiusForScreenHalfW, toNdcX, toNdcY, SHOT_DEPTH_MAX, SHOT_DEPTH_MIN };
