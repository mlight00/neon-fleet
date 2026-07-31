import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  smoothstep, chaseBlendForZoom, advanceChaseBlend, createChaseProjection,
  projectPoint, projectObject, screenToWorldXAtPlayer, edgeIndicatorForPoint,
  depthForWorldY, CHASE_START_ZOOM, CHASE_FULL_ZOOM, PROJECTION,
} from '../js/chase-camera.js';

// §13 투영·입력 계약. 실제 수치로 검증(소스 문자열 검사 아님). 논리 480×800, 함대 (240,660) 기준.
const W = 480, H = 800, SQX = 240, SQY = 660;
const proj = (zoom, chaseBlend, squadX = SQX) => createChaseProjection({ zoom, chaseBlend, squadX, squadY: SQY, logicalW: W, logicalH: H });

// 1. 100% chaseBlend=0 → 전술과 완전 동일(픽셀 차이 0)
test('CH-01: 100% chaseBlend=0은 전술 확대와 동일', () => {
  const p = proj(1.0, chaseBlendForZoom(1.0));
  assert.equal(p.chaseBlend, 0);
  for (const pt of [{ x: 100, y: 100 }, { x: 240, y: 660 }, { x: 400, y: 300 }]) {
    const r = projectObject(pt, 'enemy', p);
    assert.ok(Math.abs(r.x - pt.x) < 1e-9, `x ${r.x} vs ${pt.x}`);   // zoom 1.0 → 스크린=월드
    assert.ok(Math.abs(r.y - pt.y) < 1e-9, `y ${r.y} vs ${pt.y}`);
    assert.equal(r.scale, 1.0);
  }
});

// 2. 160% 전환 시작점: chaseBlend=0(경계에서 기울기 0)
test('CH-02: 160%에서 chaseBlend=0 (전환 시작, 아직 전술)', () => {
  assert.equal(chaseBlendForZoom(CHASE_START_ZOOM), 0);
  assert.equal(smoothstep(1.6, 2.0, 1.6), 0);
});

// 3. 200% chaseBlend=1
test('CH-03: 200%에서 chaseBlend=1 (완전 전환)', () => {
  assert.equal(chaseBlendForZoom(CHASE_FULL_ZOOM), 1);
  assert.equal(smoothstep(1.6, 2.0, 2.0), 1);
});

// 4. 220%: chaseBlend=1 유지 + 추가 근접(스케일이 200%보다 큼)
test('CH-04: 220% chaseBlend=1 clamp + 추가 근접 확대', () => {
  assert.equal(chaseBlendForZoom(2.2), 1);
  const near = { x: SQX, y: SQY };
  const s200 = projectObject(near, 'squad', proj(2.0, 1)).scale;
  const s220 = projectObject(near, 'squad', proj(2.2, 1)).scale;
  assert.ok(s220 > s200, `220% 스케일 ${s220} > 200% ${s200}`);
});

// 5. 먼 개체가 가까운 개체보다 작다
test('CH-05: 먼 개체 표시 배율 < 가까운 개체', () => {
  const p = proj(2.0, 1);
  const far = projectObject({ x: SQX, y: 40 }, 'enemy', p);
  const near = projectObject({ x: SQX, y: SQY - 20 }, 'enemy', p);
  assert.ok(far.scale < near.scale, `far ${far.scale} < near ${near.scale}`);
  assert.ok(far.y < near.y, '먼 개체가 화면 위쪽');
});

// 6. 먼 개체의 좌우 간격이 더 좁다(소실점 수렴)
test('CH-06: 먼 평면의 좌우 간격이 근거리보다 좁다', () => {
  const p = proj(2.0, 1);
  const farL = projectObject({ x: SQX - 100, y: 40 }, 'enemy', p);
  const farR = projectObject({ x: SQX + 100, y: 40 }, 'enemy', p);
  const nearL = projectObject({ x: SQX - 100, y: SQY - 20 }, 'enemy', p);
  const nearR = projectObject({ x: SQX + 100, y: SQY - 20 }, 'enemy', p);
  assert.ok((farR.x - farL.x) < (nearR.x - nearL.x), `far간격 ${farR.x - farL.x} < near간격 ${nearR.x - nearL.x}`);
});

// 7. 기함 부분 추종(이사): 추적 시점에서도 기함 좌우 이동이 화면에 보인다 — 중앙 완전 고정 금지, 화면 안 유지.
test('CH-07: 기함 부분 추종 — 이동이 보이되 화면 안 하단', () => {
  const f = PROJECTION.followFrac;
  assert.ok(f > 0.2 && f < 0.7, `followFrac ${f} (0=이전 중앙고정, 과하면 가장자리 잘림)`);
  const L = projectObject({ x: 100, y: SQY }, 'squad', proj(2.0, 1, 100));   // 함대가 월드 왼쪽(100)
  const Rr = projectObject({ x: 380, y: SQY }, 'squad', proj(2.0, 1, 380));  // 함대가 월드 오른쪽(380)
  assert.ok(Math.abs(L.x - (W / 2 + (100 - W / 2) * f)) < 1, `왼쪽 기함 화면 X ${L.x} = 중앙+이탈×${f}`);
  assert.ok(Math.abs(Rr.x - (W / 2 + (380 - W / 2) * f)) < 1, `오른쪽 기함 화면 X ${Rr.x}`);
  assert.ok(Rr.x - L.x > 80, `좌우 이동이 화면에서 보임(${(Rr.x - L.x).toFixed(1)}px)`);
  assert.ok(L.x > W * 0.15 && Rr.x < W * 0.85, '기함이 화면 가장자리로 잘리지 않음');
  assert.ok(L.y > H * 0.78 && L.y < H * 0.88, `기함 화면 Y ${L.y} 하단(80~86%)`);
});

// 8. projectPoint 결과 유한
test('CH-08: projectPoint 유한값', () => {
  for (const z of [1.0, 1.6, 1.8, 2.0, 2.2]) {
    const r = projectPoint({ x: 12, y: 3 }, proj(z, chaseBlendForZoom(z)));
    assert.ok(Number.isFinite(r.x) && Number.isFinite(r.y) && Number.isFinite(r.scale), `z=${z}`);
  }
});

// 9. 160% 경계에서 위치 점프 ≤1px (blend 연속성 — 줌 고정, blend만 경계값 변화)
test('CH-09: 160% 경계 blend 연속 — 위치 점프 ≤1px', () => {
  const zoom = CHASE_START_ZOOM;
  const b0 = chaseBlendForZoom(zoom);              // 0
  const b1 = chaseBlendForZoom(zoom + 0.01);        // 경계 바로 위(아주 작음)
  for (const pt of [{ x: 40, y: 30 }, { x: 440, y: 30 }, { x: 120, y: 400 }, { x: 240, y: 660 }]) {
    const a = projectPoint(pt, proj(zoom, b0));
    const c = projectPoint(pt, proj(zoom, b1));
    assert.ok(Math.abs(a.x - c.x) <= 1 && Math.abs(a.y - c.y) <= 1, `점프 (${a.x - c.x},${a.y - c.y}) @${JSON.stringify(pt)}`);
  }
});

// 10. reduced-motion 즉시 전환
test('CH-10: reduced-motion이면 chaseBlend 즉시 목표', () => {
  assert.equal(advanceChaseBlend(0, 1, 1 / 60, true), 1);
  assert.equal(advanceChaseBlend(1, 0, 1 / 60, true), 0);
  // 일반 보간은 한 프레임에 즉시 도달하지 않음
  const one = advanceChaseBlend(0, 1, 1 / 60, false);
  assert.ok(one > 0 && one < 1, `보간 중간값 ${one}`);
});

// 11. screen→world X 오차 ≤1px : 100/160/180/200/220% × 좌·중·우 왕복
test('CH-11: 근거리 역변환 왕복 오차 ≤1px (전 배율×좌중우)', () => {
  for (const zoom of [1.0, 1.6, 1.8, 2.0, 2.2]) {
    const p = proj(zoom, chaseBlendForZoom(zoom));
    for (const frac of [0.1, 0.5, 0.9]) {
      const screenX = frac * W;
      const worldX = screenToWorldXAtPlayer(screenX, p);
      // 근거리 평면 순방향으로 되돌림: C0 + (worldX-squadX)*slope
      const back = p.C0 + (worldX - p.squadX) * p.slope;
      assert.ok(Math.abs(back - screenX) <= 1, `zoom ${zoom} frac ${frac}: back ${back} vs ${screenX}`);
    }
  }
});

// 12. 전환 중 정지 마우스 목표 재계산이 튀지 않음(blend 미세 변화 → worldX 미세 변화)
test('CH-12: 전환 중 정지 마우스 목표 연속', () => {
  const screenX = 0.75 * W;
  let prev = null, maxJump = 0;
  for (let b = 0; b <= 1.0001; b += 0.05) {
    const worldX = screenToWorldXAtPlayer(screenX, proj(1.8, Math.min(1, b)));
    if (prev != null) maxJump = Math.max(maxJump, Math.abs(worldX - prev));
    prev = worldX;
  }
  assert.ok(maxJump < 20, `blend 0.05 스텝당 목표 이동 ${maxJump} (급점프 없음)`);
});

// 13. 100%에서 역변환이 기존 전술과 동일(anchor=squad, worldX=squadX+(screenX-squadX)/zoom)
test('CH-13: 100% 역변환 = 기존 전술 공식', () => {
  const p = proj(1.0, 0);
  for (const screenX of [50, 240, 430]) {
    const worldX = screenToWorldXAtPlayer(screenX, p);
    assert.ok(Math.abs(worldX - (SQX + (screenX - SQX) / 1.0)) < 1e-9, `${worldX}`);
  }
});

// 14. edgeIndicatorForPoint: 화면 안이면 null, 밖이면 방향·가장자리 좌표
test('CH-14: 화면 밖 위험 표시 계산', () => {
  const vp = { w: W, h: H };
  assert.equal(edgeIndicatorForPoint({ x: 240, y: 400 }, vp, 'boss'), null);
  const left = edgeIndicatorForPoint({ x: -50, y: 400 }, vp, 'enemyBullet');
  assert.equal(left.side, 'left');
  assert.ok(left.edgeX >= 0 && left.edgeX <= W && left.edgeY >= 0 && left.edgeY <= H);
  const right = edgeIndicatorForPoint({ x: W + 80, y: 200 }, vp, 'boss');
  assert.equal(right.side, 'right');
  const top = edgeIndicatorForPoint({ x: 200, y: -30 }, vp, 'enemy');
  assert.equal(top.side, 'top');
});

// 16. 기함 통과 개체는 화면 하단 밖으로 계속 진행(이사: 크리스탈·적이 nearY 에 얼어붙던 문제)
test('CH-16: 기함 통과 시 depth>1 외삽 — 얼어붙음 없이 화면 아래로 퇴장', () => {
  const p = proj(2.2, 1);
  assert.ok(depthForWorldY(SQY + 100, p) > 1, '기함 라인 아래 = depth > 1');
  assert.equal(depthForWorldY(SQY + 99999, p), 1.6, '외삽 상한 1.6(폭주 방지)');
  const atLine = projectPoint({ x: SQX, y: SQY }, p);
  const past1 = projectPoint({ x: SQX, y: SQY + 60 }, p);
  const past2 = projectPoint({ x: SQX, y: SQY + 140 }, p);
  assert.ok(past1.y > atLine.y, `통과 직후 화면 y 가 기함 라인보다 아래(${past1.y.toFixed(0)} > ${atLine.y.toFixed(0)})`);
  assert.ok(past2.y > past1.y, '더 지나면 더 아래(단조) — 멈춤 없음');
  assert.ok(past2.y > H, `충분히 지나면 화면 밖(${past2.y.toFixed(0)} > ${H})`);
});

// 15. depth 단조성 + 상수 범위 방어
test('CH-15: depth 단조·투영 상수 범위', () => {
  const p = proj(2.0, 1);
  assert.ok(depthForWorldY(0, p) === 0 && depthForWorldY(SQY, p) === 1);
  assert.ok(depthForWorldY(200, p) < depthForWorldY(400, p));
  assert.ok(PROJECTION.horizonYFrac >= 0.12 && PROJECTION.horizonYFrac <= 0.24);   // 원근 2차: 소실점 상향(0.15)
  assert.ok(PROJECTION.nearYFrac >= 0.80 && PROJECTION.nearYFrac <= 0.86);
  assert.ok(PROJECTION.nearObjScale >= 1.35 && PROJECTION.nearObjScale <= 1.70);
});
