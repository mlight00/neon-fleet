// ── §G-34 §7 (P0-4) — 발사 원점 보정을 **모든 렌더 경로**에 같은 규칙으로 ──
//  Codex 5차 G-1[중대]: §G-28 에서 만든 `SHOT_ORIGIN` sidecar 가 2D 직접 경로에만 적용돼 있었다.
//   ① 범용 2.5D(`drawProjected`) — 그리기 좌표계에서 translate 해 그 위의 `scale` 이 함께 곱해짐(과보정)
//   ② `drawLaserStreak` — 보정이 아예 없음(0)
//   ③ 3D 수집 — sidecar 를 읽지도 않음
//  → 보정은 **투영 입력의 월드 x** 에 넣는 것이 유일하게 옳다. 그러면 화면 환산은 투영이 한다.
//  ⚠️전부 **실행 기반**이다(§2-7). 기록 ctx 로 실제 렌더 함수를 돌려 좌표를 읽는다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { Bullet, noteShotOrigin, shotOriginDX, shotRenderX } from '../js/entities.js';
import { drawProjected, drawLaserStreak, makeProjector } from '../js/chase-render.js';
import { createChaseProjection, projectObject, projectPoint } from '../js/chase-camera.js';
//  ⚠️전용 기록기: `scale` 을 **실제로 추적**한다. 과보정(그리기 좌표계 translate 에 scale 이 곱해지는 것)은
//   scale 을 무시하는 기록기로는 잡히지 않는다 — 바로 그 결함을 재현해야 하므로 여기서는 정확한 행렬을 쓴다.
function xformCtx() {
  const st = { a: 1, d: 1, e: 0, f: 0 };            // 회전 없는 2D affine: x' = a·x + e
  const stack = [];
  const pts = [];
  const ctx = {
    save() { stack.push({ ...st }); },
    restore() { const p = stack.pop(); if (p) Object.assign(st, p); },
    translate(x, y) { st.e += st.a * x; st.f += st.d * y; },
    scale(sx, sy) { st.a *= sx; st.d *= sy; },
    rotate() {}, setTransform() {}, transform() {}, clip() {},
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {},
    quadraticCurveTo() {}, bezierCurveTo() {}, arcTo() {}, roundRect() {},
    strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    set font(_v) {}, set textAlign(_v) {}, set textBaseline(_v) {}, set filter(_v) {},
    set lineJoin(_v) {}, set miterLimit(_v) {}, set imageSmoothingEnabled(_v) {},
    canvas: { width: 480, height: 800 },
    arc(x, y) { pts.push({ x: st.a * x + st.e, y: st.d * y + st.f }); },
    ellipse() {}, rect() {}, fill() {}, stroke() {}, fillRect() {}, drawImage() {},
    setLineDash() {}, measureText() { return { width: 0 }; },
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    set globalCompositeOperation(_v) {}, set globalAlpha(_v) {}, set fillStyle(_v) {},
    set strokeStyle(_v) {}, set lineWidth(_v) {}, set lineCap(_v) {}, set shadowBlur(_v) {}, set shadowColor(_v) {},
    get globalAlpha() { return 1; },
  };
  return { ctx, pts };
}

const LW = 480, LH = 800, SQY = 670;
/** 날개 하드포인트에서 나온 탄 하나 — 게임 좌표는 건드리지 않고 시각 출발점만 기록한다(§G-23). */
function wingShot(sqX = 240, dy = 0) {
  const b = new Bullet(sqX + 22, SQY - 10 - dy, 0, -520, { kind: 'vulcan' });
  noteShotOrigin(b, sqX, SQY - 10);          // 시각 출발점 = 기함 중심(선체 위 마운트)
  return b;
}

test('G34-ORIGIN-PURE: 보정 조회는 순수하다 — 여러 경로가 같은 프레임에 같은 값을 본다', () => {
  //  예전 구현은 읽으면서 WeakMap 에서 지웠다. 그러면 2D·2.5D·3D 중 **첫 호출만** 보정을 받고
  //  나머지는 0 을 받아 경로마다 다른 자리에 그려진다. 같은 탄을 반복해서 읽어 값이 고정인지 본다.
  const b = wingShot();
  const first = shotOriginDX(b);
  assert.notEqual(first, 0, '보간 구간에서는 보정이 0 이 아니다');
  for (let i = 0; i < 5; i++) {
    assert.equal(shotOriginDX(b), first, `${i + 2}번째 호출도 같은 값이어야 한다 — 실측 ${shotOriginDX(b)} vs ${first}`);
  }
  //  탄이 나아가면 보정이 줄고, 블렌드 구간(26px)을 넘으면 0 이 된다.
  b.y -= 13;
  const mid = shotOriginDX(b);
  assert.ok(Math.abs(mid) < Math.abs(first), `절반 지점에서 보정이 줄어든다 — ${first} → ${mid}`);
  b.y -= 40;
  assert.equal(shotOriginDX(b), 0, '블렌드가 끝나면 0');
  assert.equal(shotRenderX(b), b.x, '보정이 끝나면 렌더 x = 실제 x');
});

test('G34-ORIGIN-25D: 2.5D 경로는 과보정하지 않는다 — 화면 위치가 투영 규칙과 일치', () => {
  //  Codex G-1 실측 11.44px 과보정의 재현·회귀. `drawProjected` 를 실제로 돌려
  //  최종 화면 원점을 읽고, "보정된 월드 x 를 투영한 값"과 같은지 본다.
  for (const zoom of [1.8, 2.2]) {
    for (const sqX of [80, 240, 400]) {
      const proj = createChaseProjection({ logicalW: LW, logicalH: LH, zoom, chaseBlend: 1, squadX: sqX, squadY: SQY });
      const b = wingShot(sqX);
      const odx = shotOriginDX(b);
      const rec = xformCtx();
      //  drawFn 은 `Bullet.draw` 와 같은 계약(자기도 translate(odx,0) 을 한다)을 흉내낸다.
      //  실제 Bullet.draw 는 스프라이트를 요구하므로, 여기서는 **좌표 계약만** 실행으로 확인한다.
      drawProjected(rec.ctx, b, proj, (c) => { c.translate(odx, 0); c.beginPath(); c.arc(b.x, b.y, 2, 0, 6.28); c.fill(); }, 'playerBullet', odx);
      assert.equal(rec.pts.length, 1, '탄이 실제로 그려졌다');
      //  기대값: 보정된 월드 x 를 투영한 화면 x.
      const want = projectObject({ x: b.x + odx, y: b.y, r: b.r }, 'playerBullet', proj);
      const err = Math.abs(rec.pts[0].x - want.x);
      assert.ok(err <= 0.5,
        `zoom=${zoom} sqX=${sqX}: 화면 x ${rec.pts[0].x.toFixed(2)} 가 투영값 ${want.x.toFixed(2)} 와 달라졌다(오차 ${err.toFixed(2)}px)`);
      //  그리고 보정 없는 위치와는 **실제로 달라야** 한다(보정이 먹었다는 증거).
      const noFix = projectObject({ x: b.x, y: b.y, r: b.r }, 'playerBullet', proj);
      assert.ok(Math.abs(want.x - noFix.x) > 0.5, '보정이 화면에서 의미 있는 차이를 만든다');
    }
  }
});

test('G34-ORIGIN-LASER: 레이저 스트릭도 같은 보정을 받는다(예전엔 0)', () => {
  const proj = createChaseProjection({ logicalW: LW, logicalH: LH, zoom: 2.2, chaseBlend: 1, squadX: 240, squadY: SQY });
  const projector = makeProjector(proj);
  const b = wingShot(240);
  b.kind = 'laser'; b.beamW = 6; b.prevY = b.y + 24;
  const odx = shotOriginDX(b);
  assert.notEqual(odx, 0, '보간 구간이다');

  //  기록기의 moveTo/lineTo 는 좌표를 남기지 않으므로, 같은 계산을 하는 제품 함수의 입력으로 검증한다:
  //  보정을 넘겼을 때와 넘기지 않았을 때 **선분 위치가 달라져야** 하고, 넘긴 쪽이 투영 규칙과 맞아야 한다.
  const withFix = projectPoint({ x: b.x + odx, y: b.y }, proj);
  const without = projectPoint({ x: b.x, y: b.y }, proj);
  assert.ok(Math.abs(withFix.x - without.x) > 0.5,
    `보정 유무가 화면에서 달라야 한다 — with ${withFix.x.toFixed(2)} / without ${without.x.toFixed(2)}`);

  //  실행이 예외 없이 끝나고 선이 그려지는지(계약 배선 확인).
  const rec = xformCtx();
  let strokes = 0;
  rec.ctx.stroke = () => { strokes++; };
  drawLaserStreak(rec.ctx, b, projector, odx);
  assert.equal(strokes, 1, '스트릭이 한 번 그려진다');

  //  ⚠️보정 인자를 안 주면(기본 0) 예전 동작으로 되돌아간다 — 호출부가 반드시 넘겨야 한다는 뜻이다.
  //   그 배선은 `drawWorldProjected` 가 책임진다(아래 테스트).
});

test('G34-ORIGIN-INJECTED: 렌더 계층은 entities 를 몰라도 보정을 받는다(경계 유지)', async () => {
  //  CW2-27: chase-render 는 chase-camera 외 어떤 전투 모듈도 import 하지 않는다.
  //  그래서 보정은 **주입**된다. 주입이 실제로 전달되는지 호출 횟수로 확인한다(문자열 대조 아님).
  const proj = createChaseProjection({ logicalW: LW, logicalH: LH, zoom: 2.2, chaseBlend: 1, squadX: 240, squadY: SQY });
  const { drawWorldProjected } = await import('../js/chase-render.js');
  const b = wingShot(240);
  const seen = [];
  const rec = xformCtx();
  const r = {
    world: { entities: [], bullets: [b], enemyBullets: [] },
    bosses: [], phase: 'track', squad: { dead: true, x: 240, y: SQY },
    effects: { drawWorld() {}, },
  };
  drawWorldProjected(rec.ctx, r, proj, {
    drawEntity: () => {},
    shotOriginDX: (o) => { seen.push(o); return shotOriginDX(o); },
  });
  assert.ok(seen.includes(b), `주입된 보정 조회가 이 탄에 대해 호출돼야 한다 — 실측 ${seen.length}회`);
});
