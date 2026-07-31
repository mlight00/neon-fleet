import { test } from 'node:test';
import assert from 'node:assert/strict';
import { drawProjected, kindOfEntity, collectEdgeWarnings, drawWorldProjected } from '../js/chase-render.js';
import { createChaseProjection } from '../js/chase-camera.js';

// §13 렌더 계약. 실제 ctx 대신 호출을 기록하는 mock으로 save/restore 균형·투영 호출·경고 규칙을 검증.
function mockCtx() {
  const log = [];
  const c = { _log: log };
  for (const m of ['save', 'restore', 'translate', 'scale', 'beginPath', 'arc', 'rect', 'moveTo', 'lineTo', 'closePath', 'fill', 'stroke', 'fillText', 'createRadialGradient']) {
    c[m] = (...a) => { log.push([m, ...a]); return m === 'createRadialGradient' ? { addColorStop() {} } : undefined; };
  }
  c.globalAlpha = 1; c.fillStyle = ''; c.strokeStyle = ''; c.lineWidth = 1; c.font = ''; c.textAlign = '';
  return c;
}
const W = 480, H = 800;
const proj = (zoom, blend) => createChaseProjection({ zoom, chaseBlend: blend, squadX: 240, squadY: 660, logicalW: W, logicalH: H });

// 21. save/restore 균형(개체마다 짝)
test('CR-21: drawProjected는 개체당 save/restore 균형', () => {
  const ctx = mockCtx();
  const obj = { x: 240, y: 300, r: 12 };
  drawProjected(ctx, obj, proj(2.0, 1), (c) => { c.beginPath(); }, 'enemy');
  const saves = ctx._log.filter((e) => e[0] === 'save').length;
  const restores = ctx._log.filter((e) => e[0] === 'restore').length;
  assert.equal(saves, 1); assert.equal(restores, 1);
});

// 17. chaseBlend>0에서 개체별 투영(translate+scale 적용)
test('CR-17: drawProjected가 translate+scale로 투영 적용', () => {
  const ctx = mockCtx();
  drawProjected(ctx, { x: 240, y: 300, r: 12 }, proj(2.0, 1), () => {}, 'enemy');
  assert.ok(ctx._log.some((e) => e[0] === 'scale'), 'scale 호출');
  assert.ok(ctx._log.some((e) => e[0] === 'translate'), 'translate 호출');
});

// 24. 적 탄환 최소 화면 크기 — 먼 곳에서도 표시 배율이 최소 픽셀 이상
test('CR-24: 적 탄환 최소 화면 크기 하한(먼 곳도 안 사라짐)', () => {
  // 아주 먼(작은) 적 탄환: 반경 2, depth≈0 → 원 투영이 최소 3px 이상 유지되도록 scale 보정
  const ctx = mockCtx();
  const bullet = { x: 240, y: 5, r: 2 };
  drawProjected(ctx, bullet, proj(2.0, 1), function (c) { c.arc(bullet.x, bullet.y, bullet.r, 0, 6.28); }, 'enemyBullet');
  const scaleCall = ctx._log.find((e) => e[0] === 'scale');
  // 화면 지름 = 2*r*scale ≥ 3px → scale ≥ 0.75
  assert.ok(scaleCall[1] >= 3 / (2 * bullet.r) - 1e-9, `scale ${scaleCall[1]} ≥ ${3 / (2 * bullet.r)}`);
});

// kindOfEntity 분류
test('CR-kind: 엔티티 종류 분류', () => {
  assert.equal(kindOfEntity({ constructor: { name: 'Boss' } }), 'boss');
  assert.equal(kindOfEntity({ constructor: { name: 'MidBoss' } }), 'boss');
  assert.equal(kindOfEntity({ constructor: { name: 'Crystal' } }), 'pickup');
  assert.equal(kindOfEntity({ constructor: { name: 'Coin' } }), 'pickup');
  assert.equal(kindOfEntity({ constructor: { name: 'GatePair' } }), 'gate');
  assert.equal(kindOfEntity({ constructor: { name: 'Creature' } }), 'enemy');
});

// 23. 화면 밖 위험 경고 최대 수(한쪽 3개) + 모양/방향
test('CR-23: 화면 밖 경고 한쪽 최대 3개', () => {
  const p = proj(2.0, 1);
  // 오른쪽 화면 밖(월드 x가 함대보다 훨씬 큼)에 충돌형 적 여러 개 → 방향당 3개로 캡
  const r = {
    bosses: [], phase: 'boss',
    squad: { x: 240, y: 660 },
    world: {
      enemyBullets: [], bullets: [],
      entities: Array.from({ length: 6 }, (_, i) => ({ x: 240 + 2000 + i * 12, y: 640, dead: false, constructor: { name: 'Creature' } })),
    },
  };
  const warns = collectEdgeWarnings(r, p, { w: W, h: H });
  const rightCount = warns.filter((w) => w.side === 'right').length;
  assert.ok(rightCount <= 3, `오른쪽 경고 ${rightCount} ≤ 3`);
  assert.ok(warns.length >= 1 && warns.every((w) => 'side' in w && 'edgeX' in w && 'danger' in w), '경고 형태');
});

// 18/19. drawWorldProjected가 개체 draw를 호출하고, effects는 투영 콜백을 받음(HUD·플래시는 여기서 안 그림)
test('CR-18: drawWorldProjected가 함선·적·탄환·이펙트를 투영', () => {
  const ctx = mockCtx();
  let squadDrawn = false, enemyDrawn = false, effectsProjected = false, bulletDrawn = false;
  const r = {
    phase: 'play', bosses: [],
    squad: { x: 240, y: 660, dead: false, draw: () => { squadDrawn = true; }, drawProjected: () => { squadDrawn = true; } },
    world: {
      entities: [{ x: 200, y: 300, r: 12, constructor: { name: 'Creature' }, draw: () => { enemyDrawn = true; } }],
      bullets: [{ x: 240, y: 500, r: 3, draw: () => { bulletDrawn = true; } }],
      enemyBullets: [],
    },
    effects: { drawWorldProjected: () => { effectsProjected = true; }, drawWorld: () => {} },
  };
  drawWorldProjected(ctx, r, proj(2.0, 1));
  assert.ok(squadDrawn && enemyDrawn && bulletDrawn && effectsProjected, `squad ${squadDrawn} enemy ${enemyDrawn} bullet ${bulletDrawn} fx ${effectsProjected}`);
  // HUD·전체화면 플래시는 drawWorldProjected가 그리지 않음(fillRect 전체화면 없음)
  assert.ok(!ctx._log.some((e) => e[0] === 'fillText'), 'HUD 텍스트 미포함');
});
