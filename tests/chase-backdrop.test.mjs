import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { warpStar, WARP_STAR_COUNT } from '../js/chase-backdrop.js';

// 함미 추적 "전진 워프" 배경(이사: 위→아래 평면 스크롤 대신 소실점 방사 전진감) — 순수부 계약.

test('WB-01: 결정성 — 같은 (i, travel) 은 항상 같은 별 상태 (시드 고정, Math.random 없음)', () => {
  const src = readFileSync(new URL('../js/chase-backdrop.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random\(\)/.test(src), 'Math.random() 호출 없음(주석 언급 제외)');
  for (const [i, tr] of [[0, 0], [5, 1.23], [42, 7.7], [WARP_STAR_COUNT - 1, 0.001]]) {
    const a = warpStar(i, tr), b = warpStar(i, tr);
    assert.deepEqual(a, b, `star ${i} @${tr}`);
  }
});

test('WB-02: travel 진행 → 별이 소실점(0)에서 바깥(1)으로 순환, 전 구간 유한', () => {
  for (let i = 0; i < WARP_STAR_COUNT; i++) {
    const a = warpStar(i, 0.10), b = warpStar(i, 0.10 + 0.01 / a.speed);
    // fract 순환: 진행분만큼 증가(랩 지점 제외)
    if (a.r01 < 0.98) assert.ok(b.r01 > a.r01, `star ${i} 전진(${a.r01}→${b.r01})`);
    for (const v of [a.r01, a.rr, a.dirX, a.dirY]) assert.ok(Number.isFinite(v));
    assert.ok(a.r01 >= 0 && a.r01 < 1, `r01 범위 ${a.r01}`);
    assert.ok(a.rr <= a.r01 + 1e-9, 'rr=pow(r01,2.2) — 소실점 근처 감속(원근 가속감)');
  }
});

test('WB-03: 방향 단위벡터 + 방위 분포(4사분면 모두 존재 — 방사형)', () => {
  const quad = [0, 0, 0, 0];
  for (let i = 0; i < WARP_STAR_COUNT; i++) {
    const s = warpStar(i, 0);
    assert.ok(Math.abs(Math.hypot(s.dirX, s.dirY) - 1) < 1e-9, `star ${i} 단위벡터`);
    quad[(s.dirX >= 0 ? 1 : 0) + (s.dirY >= 0 ? 2 : 0)]++;
  }
  assert.ok(quad.every((c) => c >= 8), `4사분면 고른 분포: ${quad.join(',')}`);
});

test('WB-04: main 배선 — 추적 blend 비례로 세로 별 소등 + 워프 별 점등', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /const warpB = state === 'play' && run \? chase\.current : 0/);
  assert.match(main, /ctx\.globalAlpha = 1 - warpB \* 0\.9/);          // 세로 스타필드 감쇠(완전 소등은 blend=1 부근)
  assert.match(main, /drawWarpField\(ctx, \{ W: LOGICAL_W, H: logicalH, cx: chaseProj\.centerX, cy: chaseProj\.horizonY, blend: chase\.current/);
  const iWarp = main.indexOf('drawWarpField(ctx,');
  const iBack = main.indexOf('drawChaseBackdrop(ctx, chaseProj', iWarp);
  assert.ok(iWarp > 0 && iBack > iWarp, '워프 별은 항로선(drawChaseBackdrop)보다 아래 층');
});
