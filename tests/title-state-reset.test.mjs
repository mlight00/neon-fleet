import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// P0-C: 타이틀 진입 시 전투 상태 완전 종료 (작업지시서 §7.3). DOM 렌더라 소스로 배선을 고정한다.
const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const resetFn = mainSrc.slice(mainSrc.indexOf('function resetToTitleState'), mainSrc.indexOf('function showTitleScreen'));

test('TS-16: resetToTitleState가 run·플레이·일시정지·입력 상태를 모두 정리한다', () => {
  assert.match(resetFn, /state = 'title'/);
  assert.match(resetFn, /run = null/);
  assert.match(resetFn, /drafting = false/);
  assert.match(resetFn, /betweenStages = false/);
  assert.match(resetFn, /paused = false/);
  assert.match(resetFn, /input\.active = false/);
  assert.match(resetFn, /input\.charging = false/);
  assert.match(resetFn, /input\.clearSkip/);
});

test('TS-17: 전투 개체·보스·HUD 렌더가 run 가드 안에 있다(run=null이면 잔상 없음)', () => {
  // draw()에서 개체 순회·보스·drawHUD가 전부 `if (run)` 블록 안이어야 한다.
  const draw = mainSrc.slice(mainSrc.indexOf('function draw()'));
  const guard = draw.indexOf('\n  if (run) {');
  const entLoop = draw.indexOf('for (const e of r.world.entities)');
  const hud = draw.indexOf('drawHUD(');
  assert.ok(guard > 0 && entLoop > guard, '개체 렌더가 if(run) 뒤');
  assert.ok(hud > guard, 'HUD 렌더가 if(run) 뒤');
});

test('TS-18: showTitleScreen이 (일반 모드) resetToTitleState로 전투 상태를 정리한다', () => {
  const start = mainSrc.indexOf('function showTitleScreen');
  const fn = mainSrc.slice(start, start + 1400);   // 함수 본문 전체(포털 가드 + resetToTitleState 포함)
  assert.match(fn, /resetToTitleState\(\);/);
  // 포털은 한국어 타이틀 대신 startPortalPlay로 라우팅(그 안에서 resetToTitleState 호출) — 이른 반환 허용.
  assert.match(fn, /if \(PORTAL_MODE\) \{ startPortalPlay\(\); return; \}/);
  // quit→타이틀 경로가 정산을 다시 하지 않는다(이미 r.settled): resetToTitleState엔 save.set/coins 없음
  assert.ok(!/save\.set|coins/.test(resetFn), '타이틀 정리에 코인 재정산 없음');
});
