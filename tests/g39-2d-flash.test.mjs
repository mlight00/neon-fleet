import test from 'node:test';
import assert from 'node:assert/strict';
import { drawWithDamageFlash } from '../js/damage-flash-2d.js';

/** Canvas2D 스텁 — 호출 순서와 상태 변화를 기록한다. */
function stubCtx() {
  const log = [];
  const st = { globalAlpha: 1, globalCompositeOperation: 'source-over' };
  return { log, state: st,
    save() { log.push(['save', st.globalAlpha, st.globalCompositeOperation]); },
    restore() { log.push(['restore']); st.globalAlpha = 1; st.globalCompositeOperation = 'source-over'; },
    beginPath() { log.push(['beginPath']); },
    //  ⚠️코드리뷰 지적(2026-08-13): 예전엔 인자를 안 남겨 "arc가 불리기만 했는지"밖에 못 봤다
    //   (그건 G39-2D-FLASH-PASS 가 이미 검증). 반경 값 자체를 단언하려면 인자를 기록해야 한다.
    arc(x, y, r, a0, a1) { log.push(['arc', x, y, r]); },
    clip() { log.push(['clip']); },
    set globalAlpha(v) { st.globalAlpha = v; log.push(['alpha', v]); }, get globalAlpha() { return st.globalAlpha; },
    set globalCompositeOperation(v) { st.globalCompositeOperation = v; log.push(['gco', v]); },
    get globalCompositeOperation() { return st.globalCompositeOperation; },
  };
}

test('G39-2D-NO-FLASH: flash 0 이면 본체를 한 번만 그린다', () => {
  const ctx = stubCtx(); let draws = 0;
  drawWithDamageFlash(ctx, { x: 0, y: 0, r: 10 }, () => draws++, 0, 1);
  assert.equal(draws, 1, '추가 pass 없음');
  assert.equal(ctx.log.filter((l) => l[0] === 'gco').length, 0, '합성 모드를 건드리지 않는다');
});

test('G39-2D-FLASH-PASS: flash > 0 이면 clip 안에서 한 번 더 그린다', () => {
  const ctx = stubCtx(); let draws = 0;
  drawWithDamageFlash(ctx, { x: 5, y: 6, r: 10 }, () => draws++, 1, 1);
  assert.equal(draws, 2, '본체 + 플래시 pass');
  const kinds = ctx.log.map((l) => l[0]);
  assert.ok(kinds.includes('clip'), '⚠️clip 이 없으면 HP 바·보호막·예고선까지 번쩍인다');
  assert.ok(kinds.includes('gco'), 'additive 합성을 쓴다');
  assert.equal(ctx.log.filter((l) => l[0] === 'save').length,
    ctx.log.filter((l) => l[0] === 'restore').length, 'save/restore 짝이 맞아야 한다');
});

test('G39-2D-NO-LEAK: 끝난 뒤 합성 상태가 남지 않는다', () => {
  //  ⚠️globalCompositeOperation·globalAlpha·clip 이 다음 개체와 HUD 로 새면 안 된다.
  const ctx = stubCtx();
  drawWithDamageFlash(ctx, { x: 0, y: 0, r: 10 }, () => {}, 1, 1);
  assert.equal(ctx.state.globalCompositeOperation, 'source-over');
  assert.equal(ctx.state.globalAlpha, 1);
});

test('G39-2D-FADE-COMPOSE: 진입 페이드와 곱한다', () => {
  //  화면 위로 절반만 들어온 적이 전체 밝기로 번쩍이면 안 된다.
  const a = stubCtx(), b = stubCtx();
  drawWithDamageFlash(a, { x: 0, y: 0, r: 10 }, () => {}, 1, 1.0);
  drawWithDamageFlash(b, { x: 0, y: 0, r: 10 }, () => {}, 1, 0.4);
  const alphaOf = (c) => Math.max(...c.log.filter((l) => l[0] === 'alpha').map((l) => l[1]));
  assert.ok(alphaOf(b) < alphaOf(a), `페이드 0.4 가 더 어두워야 한다 — ${alphaOf(b)} vs ${alphaOf(a)}`);
});

test('G39-2D-CLIP-RADIUS: clip 반경은 damageFlashRadius → r → 기본값 순으로 정해진다', () => {
  //  ⚠️코드리뷰 지적(2026-08-13): "arc가 불리긴 했는가"만 보면 damageFlashRadius 를
  //   완전히 무시하는 결함 구현(`entity.r || 20`)도 통과한다. 실제 반경 값을 단언해야
  //   damageFlashRadius 가 **실제로 쓰이는지**(r 보다 우선하는지)를 증명한다.
  const radiusOf = (entity) => {
    const ctx = stubCtx();
    drawWithDamageFlash(ctx, entity, () => {}, 1, 1);
    const arcLog = ctx.log.find((l) => l[0] === 'arc');
    return arcLog && arcLog[3];
  };
  assert.equal(radiusOf({ x: 0, y: 0, r: 10, damageFlashRadius: 30 }), 30,
    'damageFlashRadius 가 있으면 r(10) 이 아니라 그것을(30) 쓴다');
  assert.equal(radiusOf({ x: 0, y: 0, r: 10 }), 10,
    'damageFlashRadius 가 없으면 r 로 폴백한다');
  assert.equal(radiusOf({ x: 0, y: 0 }), 20,
    '둘 다 없으면 기본값 20 으로 폴백한다');
});
