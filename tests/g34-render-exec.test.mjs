// ── §G-34 §10-2 — 소스 문자열 대조를 **실행 기반**으로 교체 ──
//  Codex 지시서 §2-7 / §10-2: 렌더 계약을 `readFileSync` + 정규식으로 지키면
//  계약이 멀쩡한데도 리팩터링·주석 추가에 테스트가 깨진다(§G-27·§G-30·§G-34 HW-16·AS-04 — 네 번).
//  → 여기서는 **실제 draw 를 기록 ctx 로 실행**하고, 남은 그리기 호출을 값으로 검증한다.
//  주석을 바꾸든 줄 순서를 정리하든, 화면에 그려지는 결과가 같으면 통과한다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { EnemyShot } from '../js/entities.js';

/**
 * 캔버스 2D 컨텍스트 기록기.
 *  - 그리기 호출(fill/stroke) 시점의 **상태 스냅샷**(합성모드·알파·색·shadowBlur)을 함께 남긴다.
 *    "언제 lighter 였나"는 호출 순서가 아니라 **그 도형이 찍힐 때의 상태**로 판정해야 정확하다.
 *  - translate/rotate 를 누적해 로컬 좌표를 화면 좌표로 환산한다(3겹이 같은 자리에 겹치는지 확인용).
 */
export function recordCtx() {
  const calls = [];                      // 확정된 그리기 결과
  let path = [];                         // 현재 경로에 쌓인 도형
  const st = { tx: 0, ty: 0, rot: 0, gco: 'source-over', alpha: 1, fill: '#000', stroke: '#000', blur: 0 };
  const stack = [];
  const snap = () => ({ gco: st.gco, alpha: st.alpha, fill: st.fill, stroke: st.stroke, blur: st.blur, rot: st.rot });
  const ctx = {
    canvas: { width: 480, height: 800 },
    save() { stack.push({ ...st }); },
    restore() { const p = stack.pop(); if (p) Object.assign(st, p); },
    translate(x, y) { st.tx += Math.cos(st.rot) * x - Math.sin(st.rot) * y; st.ty += Math.sin(st.rot) * x + Math.cos(st.rot) * y; },
    rotate(a) { st.rot += a; },
    scale() {}, setTransform() {}, transform() {},
    beginPath() { path = []; },
    closePath() {},
    moveTo() {}, lineTo() {}, quadraticCurveTo() {}, bezierCurveTo() {}, rect() {},
    arc(x, y, r) { path.push({ kind: 'arc', x, y, r }); },
    ellipse(x, y, rx, ry) { path.push({ kind: 'ellipse', x, y, rx, ry }); },
    fill() { for (const p of path) calls.push({ op: 'fill', ...p, ...snap() }); path = []; },
    stroke() { for (const p of path) calls.push({ op: 'stroke', ...p, ...snap() }); path = []; },
    fillRect() {}, strokeRect() {}, clearRect() {}, fillText() {}, strokeText() {},
    createRadialGradient() { return { addColorStop() {} }; },
    createLinearGradient() { return { addColorStop() {} }; },
    drawImage() { calls.push({ op: 'image', ...snap() }); },
    measureText() { return { width: 0 }; },
    setLineDash() {}, clip() {},
    get globalCompositeOperation() { return st.gco; }, set globalCompositeOperation(v) { st.gco = v; },
    get globalAlpha() { return st.alpha; }, set globalAlpha(v) { st.alpha = v; },
    get fillStyle() { return st.fill; }, set fillStyle(v) { st.fill = v; },
    get strokeStyle() { return st.stroke; }, set strokeStyle(v) { st.stroke = v; },
    get shadowBlur() { return st.blur; }, set shadowBlur(v) { st.blur = v; },
    set shadowColor(_v) {}, get shadowColor() { return '#000'; },
    set lineWidth(_v) {}, get lineWidth() { return 1; },
    set lineCap(_v) {}, get lineCap() { return 'butt'; },
    set font(_v) {}, get font() { return ''; },
    set textAlign(_v) {}, get textAlign() { return 'left'; },
    set textBaseline(_v) {}, get textBaseline() { return 'alphabetic'; },
    set filter(_v) {}, get filter() { return 'none'; },
  };
  return { ctx, calls, state: st };
}

/** 적탄 하나를 그려 기록을 돌려준다. */
function drawShot(opts = {}, x = 200, y = 300, vx = 0, vy = 260) {
  const s = new EnemyShot(x, y, vx, vy, { r: 8, dmgPct: 1, ...opts });
  const rec = recordCtx();
  s.draw(rec.ctx);
  return { shot: s, ...rec };
}

test('G34-EBULLET-EXEC: orb 적탄은 꼬리·셸·백열 코어 3겹을 실제로 그린다', () => {
  const { calls, shot } = drawShot();
  const shapes = calls.filter((c) => c.op === 'fill' && (c.kind === 'ellipse' || c.kind === 'arc'));
  assert.ok(shapes.length >= 3, `3겹이 실제로 찍혀야 한다 — 실측 ${shapes.length}개 ${JSON.stringify(shapes)}`);

  //  ① 꼬리 = 가산합성 타원(뒤로 늘어난 잔광).
  const tail = shapes.find((c) => c.kind === 'ellipse' && c.gco === 'lighter');
  assert.ok(tail, `꼬리는 가산합성 타원이어야 한다 — 실측 ${JSON.stringify(shapes)}`);
  assert.ok(tail.y > 0, `꼬리는 진행 반대쪽(로컬 +y)으로 치우친다 — 실측 y=${tail.y}`);

  //  ② 셸 = **불투명**. 검은 배경 위 가산합성은 색을 알파만큼 어둡게 만든다(§G-27 실측 62%).
  const shell = shapes.find((c) => c.kind === 'ellipse' && c.gco === 'source-over');
  assert.ok(shell, '셸은 source-over 여야 색이 죽지 않는다');
  assert.equal(shell.alpha, 1, `셸 알파는 1 — 실측 ${shell.alpha}`);
  assert.equal(shell.x, 0, '셸은 탄 중심에 놓인다');
  assert.equal(shell.y, 0, '셸은 탄 중심에 놓인다');

  //  ③ 백열 코어 = 흰색 덮어쓰기(원).
  const core = shapes.find((c) => c.kind === 'arc' && String(c.fill).toLowerCase() === '#ffffff');
  assert.ok(core, `백열 코어는 흰색이어야 한다 — 실측 ${JSON.stringify(shapes.filter((s) => s.kind === 'arc'))}`);
  assert.equal(core.gco, 'source-over', '코어는 덮어쓴다');
  assert.ok(core.r < shot.r * 0.6, `코어는 셸보다 확실히 작다 — 실측 ${core.r} / r=${shot.r}`);
});

test('G34-EBULLET-EXEC-ROT: 적탄 3겹은 진행 방향으로 회전한다', () => {
  //  수식을 복사하지 않는다 — **여러 속도에서 실제 회전값을 읽어** 방향과 일치하는지 본다.
  for (const [vx, vy] of [[0, 260], [180, 180], [-240, 40], [0, -300]]) {
    const { calls } = drawShot({}, 200, 300, vx, vy);
    const tail = calls.find((c) => c.gco === 'lighter' && c.kind === 'ellipse');
    assert.ok(tail, '꼬리를 찾는다');
    //  화면에서 탄이 향하는 방향(아래로 +y)과 로컬 -y 축이 같은 쪽을 봐야 한다.
    const ax = Math.sin(tail.rot), ay = -Math.cos(tail.rot);       // 로컬 -y 를 화면으로
    const len = Math.hypot(vx, vy);
    const dot = (ax * vx + ay * vy) / len;
    assert.ok(dot > 0.999, `속도(${vx},${vy})와 탄 축이 나란해야 한다 — 정렬도 ${dot.toFixed(4)}, rot=${tail.rot.toFixed(3)}`);
  }
});

test('G34-EBULLET-EXEC-PERF: 탄막 경로에는 shadowBlur 가 켜지지 않는다', () => {
  //  적탄은 화면에 수십 개가 동시에 뜬다. blur 는 프레임을 직접 갉아먹는다.
  for (const shape of ['orb', 'needle', 'ring', 'ember']) {
    const { calls } = drawShot({ shape });
    const blurred = calls.filter((c) => c.blur > 0);
    assert.equal(blurred.length, 0,
      `shape=${shape} 에서 shadowBlur 사용 ${blurred.length}건 — ${JSON.stringify(blurred.slice(0, 2))}`);
  }
});

test('G34-EBULLET-EXEC-SIZE: 보이는 크기가 판정 반경(r)에서 벗어나지 않는다', () => {
  //  "맞을 것 같은데 안 맞는다"의 원인. 크기 상수를 복사하지 않고 **그려진 값**을 r 로 나눠 본다.
  for (const r of [5, 8, 14]) {
    const { calls } = drawShot({ r });
    for (const c of calls.filter((x) => x.kind === 'ellipse')) {
      assert.ok(c.rx / r <= 1.0, `가로 반경 ${c.rx} 가 r=${r} 를 넘으면 안 된다`);
      assert.ok(c.ry / r <= 1.25, `세로 반경 ${c.ry} 는 r=${r} 의 1.25배 이내(꼬리 여유)`);
    }
    for (const c of calls.filter((x) => x.kind === 'arc')) {
      assert.ok(c.r / r <= 1.0, `원 반경 ${c.r} 가 r=${r} 이내`);
    }
  }
});
