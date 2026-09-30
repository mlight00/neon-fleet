// rush3-r430-textcache — r4.30 테두리 글자 그림 기억(개선 루프 21바퀴 — BACKLOG 3-17) V3-R430 TEXTCACHE.
//  render.createTextCache: 같은 글·글꼴·색·테두리·정렬·선 이음·화면 배율이 두 번째로 나오면 작업 캔버스에 한 번 그려 기억하고,
//   그다음부터는 기기 화소 격자(정수)에 drawImage 로 찍는다. 반투명·합성 모드·그림자·필터·기울인 변환·너무 큰 글·끄개·DOM 없는 환경은 false(종전대로).
//  모양이 같은지는 실제 브라우저에서 같은 장면을 켬·끔으로 찍어 화소를 비교했다(E:\workspace\claude\neon-fleet\review\20260930_loop21).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTextCache, TEXT_CACHE, createRenderer3 } from '../rush3/render.js';
import { fakeCanvas, bootApp } from './lib/rush3-shell.mjs';

const FONT13 = 'bold 13px system-ui, sans-serif';
function fakeMain(T0 = { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }) {
  const ops = [];
  let T = { ...T0 };
  const ctx = {
    globalAlpha: 1, globalCompositeOperation: 'source-over', shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0, filter: 'none',
    textAlign: 'center', textBaseline: 'alphabetic', lineJoin: 'miter', font: '', lineWidth: 1, strokeStyle: '', fillStyle: '',
    getTransform() { return { ...T }; },
    setTransform(a, b, c, d, e, f) { T = { a, b, c, d, e, f }; ops.push(['setTransform', a, b, c, d, e, f]); },
    drawImage(img, x, y) { ops.push(['drawImage', img.id, x, y, { ...T }]); },
    measureText(t) { return { width: t.length * 8, actualBoundingBoxLeft: t.length * 4, actualBoundingBoxRight: t.length * 4, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 }; },
    strokeText() { ops.push(['strokeText']); }, fillText() { ops.push(['fillText']); },
  };
  return { ctx, ops, getT: () => T };
}
function fakeFactory() {
  const made = [];
  const makeCanvas = (w, h) => {
    const g = { calls: [], setTransform(...a) { this.calls.push(['setTransform', ...a]); },
                strokeText(t, x, y) { this.calls.push(['strokeText', t, x, y, this.font, this.lineWidth, this.strokeStyle, this.textAlign, this.textBaseline, this.lineJoin]); },
                fillText(t, x, y) { this.calls.push(['fillText', t, x, y, this.fillStyle]); } };
    const c = { id: made.length, width: w, height: h, getContext: () => g, g };
    made.push(c);
    return c;
  };
  return { made, makeCanvas };
}

test('TEXTCACHE-1: 첫 번째는 false(종전대로) · 두 번째에 작업 캔버스 한 장(기준점 = 정수 기기 화소, 테두리 여유 lw + 2)에 테두리 → 채움 · 본 캔버스는 단위 변환으로 정수 자리에 drawImage 뒤 변환을 되돌린다 · 세 번째는 새로 그리지 않는다', () => {
  const { ctx, ops, getT } = fakeMain();
  const { made, makeCanvas } = fakeFactory();
  const tc = createTextCache(ctx, { makeCanvas, outline: '#111' });
  assert.equal(tc.enabled, true);
  assert.equal(tc.draw('13', 100.3, 50.6, FONT13, '#FFD24A', 4), false, '처음 본 글은 종전대로');
  assert.equal(made.length, 0); assert.equal(ops.length, 0);
  assert.equal(tc.draw('13', 100.3, 50.6, FONT13, '#FFD24A', 4), true);
  assert.equal(made.length, 1);
  //  L = R = 8(글 2자 × 4) · A 10 · D 2 · 여유 6 · 배율 2 → 기준점 (28, 32) · 크기 56 × 48
  assert.deepEqual([made[0].width, made[0].height], [56, 48]);
  assert.deepEqual(made[0].g.calls, [['setTransform', 2, 0, 0, 2, 28, 32],
    ['strokeText', '13', 0, 0, FONT13, 4, '#111', 'center', 'alphabetic', 'miter'], ['fillText', '13', 0, 0, '#FFD24A']]);
  //  본 캔버스: 기기 좌표 (200.6, 101.2) → 반올림 (201, 101) − 기준점
  assert.deepEqual(ops, [['setTransform', 1, 0, 0, 1, 0, 0], ['drawImage', 0, 173, 69, { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }], ['setTransform', 2, 0, 0, 2, 0, 0]]);
  assert.deepEqual(getT(), { a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 }, '변환을 되돌린다');
  assert.equal(tc.draw('13', 10, 20, FONT13, '#FFD24A', 4), true);
  assert.equal(made.length, 1, '같은 글은 다시 그리지 않는다');
  assert.equal(tc.size(), 1);
});

test('TEXTCACHE-2: 종전대로 그리는 경우 — 반투명 · 합성 모드 · 그림자 · 필터 · 회전/기울인 변환 · 끄개(globalThis.__rush3TextCacheOff) · 작업 캔버스를 만들 수 없는 환경(변환도 읽지 않는다)', () => {
  const cases = [
    ['반투명', (c) => { c.globalAlpha = 0.5; }],
    ['합성 모드', (c) => { c.globalCompositeOperation = 'lighter'; }],
    ['그림자', (c) => { c.shadowBlur = 3; }],
    ['그림자 어긋남', (c) => { c.shadowOffsetY = 2; }],
    ['필터', (c) => { c.filter = 'blur(1px)'; }],
  ];
  for (const [name, set] of cases) {
    const { ctx, ops } = fakeMain();
    const { made, makeCanvas } = fakeFactory();
    const tc = createTextCache(ctx, { makeCanvas, minSeen: 1 });
    set(ctx);
    assert.equal(tc.draw('7', 50, 50, FONT13, '#fff', 4), false, name);
    assert.equal(made.length, 0, name); assert.equal(ops.length, 0, name);
  }
  {
    const { ctx } = fakeMain({ a: 2, b: 0.1, c: -0.1, d: 2, e: 0, f: 0 });
    const { made, makeCanvas } = fakeFactory();
    const tc = createTextCache(ctx, { makeCanvas, minSeen: 1 });
    assert.equal(tc.draw('7', 50, 50, FONT13, '#fff', 4), false, '회전·기울인 변환');
    assert.equal(made.length, 0);
  }
  {
    const { ctx } = fakeMain();
    const { made, makeCanvas } = fakeFactory();
    const tc = createTextCache(ctx, { makeCanvas, minSeen: 1 });
    globalThis.__rush3TextCacheOff = true;
    try { assert.equal(tc.draw('7', 50, 50, FONT13, '#fff', 4), false, '끄개'); } finally { delete globalThis.__rush3TextCacheOff; }
    assert.equal(made.length, 0);
    assert.equal(tc.draw('7', 50, 50, FONT13, '#fff', 4), true, '끄개를 풀면 다시 쓴다');
  }
  {
    //  Node 검사 환경(document 없음 · makeCanvas 없음): 꺼져 있고 문맥의 변환도 읽지 않는다(가짜 캔버스의 그리기 기록이 늘지 않는다)
    assert.equal(typeof document, 'undefined');
    let reads = 0;
    const ctx = { ...fakeMain().ctx, getTransform() { reads++; return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }; } };
    const tc = createTextCache(ctx, { minSeen: 1 });
    assert.equal(tc.enabled, false);
    assert.equal(tc.draw('7', 50, 50, FONT13, '#fff', 4), false);
    assert.equal(reads, 0);
  }
});

test('TEXTCACHE-3: 기억 칸 열쇠 — 글 · 글꼴 · 색 · 테두리 굵기 · 가로 정렬 · 세로 기준 · 선 이음 · 화면 배율이 하나라도 다르면 다른 그림, 모두 같으면 한 그림', () => {
  const { ctx } = fakeMain();
  const { made, makeCanvas } = fakeFactory();
  const tc = createTextCache(ctx, { makeCanvas, minSeen: 1 });
  const base = () => { ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic'; ctx.lineJoin = 'miter'; ctx.setTransform(2, 0, 0, 2, 0, 0); };
  const variants = [
    () => tc.draw('7', 1, 1, FONT13, '#fff', 4),
    () => tc.draw('8', 1, 1, FONT13, '#fff', 4),
    () => tc.draw('7', 1, 1, 'bold 13.5px system-ui, sans-serif', '#fff', 4),
    () => tc.draw('7', 1, 1, FONT13, '#f00', 4),
    () => tc.draw('7', 1, 1, FONT13, '#fff', 5),
    () => { ctx.textAlign = 'left'; return tc.draw('7', 1, 1, FONT13, '#fff', 4); },
    () => { ctx.textBaseline = 'middle'; return tc.draw('7', 1, 1, FONT13, '#fff', 4); },
    () => { ctx.lineJoin = 'round'; return tc.draw('7', 1, 1, FONT13, '#fff', 4); },
    () => { ctx.setTransform(3, 0, 0, 3, 0, 0); return tc.draw('7', 1, 1, FONT13, '#fff', 4); },
  ];
  for (const v of variants) { base(); assert.equal(v(), true); }
  assert.equal(made.length, variants.length, '모두 다른 그림');
  for (const v of variants) { base(); v(); }
  assert.equal(made.length, variants.length, '두 번째 돌 때는 새로 그리지 않는다');
  //  자리(x, y)는 열쇠가 아니다 — 같은 글을 다른 자리에 찍는다
  base(); tc.draw('7', 300, 400, FONT13, '#fff', 4);
  assert.equal(made.length, variants.length);
});

test('TEXTCACHE-4: 한도 — 기억 칸이 max 에 닿으면 오래된 것부터 evict 개를 버린다 · 너무 큰 글(maxArea 초과)은 기억하지 않고 매번 종전대로(다시 만들지도 않는다) · 기본값 표', () => {
  assert.deepEqual({ ...TEXT_CACHE }, { max: 500, evict: 100, maxArea: 512 * 256, minSeen: 2 });
  const { ctx } = fakeMain();
  const { made, makeCanvas } = fakeFactory();
  const tc = createTextCache(ctx, { makeCanvas, max: 50, evict: 10, minSeen: 1 });
  for (let i = 0; i < 120; i++) tc.draw(String(i), 1, 1, FONT13, '#fff', 4);
  assert.ok(tc.size() <= 50, '기억 칸 ' + tc.size());
  assert.equal(made.length, 120);
  const big = createTextCache(ctx, { makeCanvas, maxArea: 100, minSeen: 1 });
  const before = made.length;
  assert.equal(big.draw('긴 배너 글', 1, 1, FONT13, '#fff', 4), false);
  assert.equal(big.draw('긴 배너 글', 1, 1, FONT13, '#fff', 4), false);
  assert.equal(made.length, before, '너무 큰 글은 작업 캔버스를 만들지 않는다');
});

test('TEXTCACHE-5: 셸 — Node(가짜 캔버스·DOM 없음)에서는 기억을 쓰지 않는다: 1번 판을 돌려도 변환을 읽는 호출이 없고 글은 종전대로 fillText 로 그려진다(가짜 캔버스 그리기 기록이 종전과 같다)', async () => {
  const texts = [], ops = [];
  const r = createRenderer3(fakeCanvas(texts, ops).getContext('2d'), null);
  assert.equal(typeof r.draw, 'function');
  const h = await bootApp({ withOps: true, unlockThrough: 1 });
  h.app.startRun(1);
  h.frames(90);
  assert.equal(h.app.getState(), 'run');
  assert.equal(h.ops.filter((o) => o.op === 'getTransform' || o.op === 'drawImage' && o.args[0] && o.args[0].g).length, 0, '변환 읽기·기억 그림 찍기 없음');
  assert.ok(h.ops.some((o) => o.op === 'strokeText') && h.texts.length > 0, '글은 종전대로 테두리·채움으로 그린다');
});
