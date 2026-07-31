import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// P0-2/P0-3/§5: 렌더 단계 분리·이펙트 world/screen·휠/키보드·입력 주입을 소스로 고정(캔버스는 브라우저 QA로 별도).
const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const ent = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
const inp = readFileSync(new URL('../js/input.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');

test('CW-01: main이 카메라 모듈을 쓰고 저장 view.zoom으로 카메라를 만든다', () => {
  assert.match(main, /from '\.\/camera-zoom\.js'/);
  assert.match(main, /const camera = createCamera\(save\.get\(\)\.view\?\.zoom\)/);
});

test('CW-02: draw() — 함대 anchor 중심 카메라 변환(state==="play"일 때만)', () => {
  assert.match(main, /const camActive = state === 'play' && camera\.current !== 1;/);
  // RC1 §3: 인라인 anchor 세팅 대신 draw에서도 공용 syncCameraAnchor()로 최신 함대 좌표 재동기화
  assert.match(main, /const camActive = state === 'play' && camera\.current !== 1;\s*\n\s*syncCameraAnchor\(\);/);
  assert.match(main, /ctx\.translate\(camera\.anchorX, camera\.anchorY\);\s*\n\s*ctx\.scale\(camera\.current, camera\.current\);\s*\n\s*ctx\.translate\(-camera\.anchorX, -camera\.anchorY\);/);
});

test('CW-03: 월드 이펙트는 카메라 안, 전체 화면 플래시는 밖(restore 뒤)', () => {
  const dw = main.indexOf('r.effects.drawWorld(ctx)');
  const rest = main.indexOf('if (camActive) ctx.restore()');
  const ds = main.indexOf('r.effects.drawScreen(hctx, LOGICAL_W, logicalH)');   // 실제 3D: 스크린 플래시는 HUD 계층(hctx=base에선 ctx)
  assert.ok(dw > 0 && rest > dw && ds > rest, `순서 drawWorld < restore < drawScreen (${dw},${rest},${ds})`);
});

test('CW-04: save/restore 짝이 균형(둘 다 camActive 게이트 — transform 누적 없음)', () => {
  assert.match(main, /if \(camActive\) \{\s*\n\s*ctx\.save\(\);/);
  assert.match(main, /if \(camActive\) ctx\.restore\(\);/);
});

test('CW-05: 배경은 카메라 앞(고정), HUD는 카메라 종료 뒤(고정)', () => {
  const draw = main.slice(main.indexOf('function draw()'));
  const bg = draw.indexOf('zoneBackdrop.draw');
  const star = draw.indexOf('starfield.draw');
  const camScale = draw.indexOf('ctx.scale(camera.current');
  const restore = draw.indexOf('if (camActive) ctx.restore()');
  const hud = draw.indexOf('drawHUD(');
  assert.ok(bg > 0 && bg < camScale, 'zoneBackdrop는 카메라 변환 앞');
  assert.ok(star > 0 && star < camScale, 'starfield는 카메라 변환 앞');
  assert.ok(hud > restore && restore > 0, 'HUD는 카메라 종료 뒤');
});

test('CW-06: 매 프레임 dt 기반 카메라 보간(reduced-motion 반영)', () => {
  assert.match(main, /camera\.current = advanceZoom\(camera\.current, camera\.target, dt, prefersReducedMotion\(\)\)/);
});

test('CW-07: 휠 — 얇은 래퍼가 resolveWheelZoom 결정을 적용(passive:false)', () => {
  const i = main.indexOf("canvas.addEventListener('wheel'");
  const w = main.slice(i, i + 600);
  assert.match(w, /\{ passive: false \}/);
  assert.match(w, /resolveWheelZoom\(e, \{/);              // RC1: 결정은 순수 모듈에 위임
  assert.match(w, /canZoom: canWheelZoom\(\)/);            // 전투/오버레이 가드 입력
  assert.match(w, /accumulator: wheelAccumulator/);        // 정밀 터치패드 픽셀 누적기 주입
  assert.match(w, /if \(preventDefault\) e\.preventDefault\(\)/);
  assert.match(w, /if \(step !== 0\) applyZoom\(step\)/);   // -1 축소 / +1 확대
  // Ctrl/Cmd·수평 우세·누적 임계 등 실제 로직은 tests/wheel-input.test.mjs가 실이벤트로 검증(정규식 의존 아님)
});

test('CW-08: 키보드 -/+/0 + 입력창·Ctrl/Cmd·repeat 가드', () => {
  assert.match(main, /if \(e\.ctrlKey \|\| e\.metaKey \|\| e\.altKey \|\| e\.repeat\) return;/);
  assert.match(main, /tag === 'INPUT' \|\| tag === 'TEXTAREA'/);
  assert.match(main, /if \(e\.key === '-' \|\| e\.key === '_'\) \{ applyZoom\(-1\)/);
  assert.match(main, /e\.key === '\+' \|\| e\.key === '='\) \{ applyZoom\(\+1\)/);
  assert.match(main, /e\.key === '0'\) \{ applyZoom\(0\)/);
});

test('CW-09: canWheelZoom = 전투 + 非오버레이(§3.2)', () => {
  assert.match(main, /function canWheelZoom\(\) \{ return state === 'play' && !paused && !drafting && !betweenStages; \}/);
});

test('CW-10: applyZoom + debounce 저장 + 배율 표시', () => {
  assert.match(main, /function applyZoom\(dir\) \{/);
  assert.match(main, /camera\.target = dir === 0 \? DEFAULT_ZOOM : stepZoom\(camera\.target, dir\)/);
  assert.match(main, /_zoomSaveTimer = setTimeout\(/);          // 연속 입력마다 저장 안 함
  assert.match(main, /zoom: safeZoom\(camera\.target\)/);        // 목표값을 검증해 저장
  assert.match(main, /\}, 300\)/);                              // 300ms debounce
  assert.match(main, /function showZoomIndicator\(\)/);
  assert.match(main, /_zoomIndEl\.id = 'zoom-indicator'/);       // 배율 표시 요소(스타일 pointer-events:none은 CSS)
  const css = readFileSync(new URL('../css/style.css', import.meta.url), 'utf8');
  assert.match(css, /#zoom-indicator[\s\S]{0,500}pointer-events: none/);   // 비차단 보장은 CSS로
});

test('CW-11: 입력에 카메라 역변환 콜백 주입(input은 카메라 직접 import 안 함)', () => {
  assert.match(main, /createInput\(canvas, LOGICAL_W, \{ screenToWorldX: \(sx\) => currentScreenToWorldX\(sx\) \}\)/);   // 2.5D: 추적 투영 역변환(blend0=전술 동일)
  assert.ok(!/from '\.\/camera-zoom/.test(inp), 'input.js가 카메라 모듈을 import하지 않음');
  assert.match(inp, /opts\.screenToWorldX/);
  assert.match(inp, /input\.targetX = clampWorld\(s2w\(lastScreenX\)\)/);
});

test('CW-12: entities effects — drawWorld/drawScreen 분리 + draw 래퍼, 플래시는 drawScreen만', () => {
  assert.match(ent, /drawWorld\(ctx\) \{/);
  assert.match(ent, /drawScreen\(ctx, logicalW, logicalH\) \{/);
  assert.match(ent, /draw\(ctx, logicalW, logicalH\) \{ this\.drawWorld\(ctx\); this\.drawScreen\(ctx, logicalW, logicalH\); \}/);
  const screen = ent.slice(ent.indexOf('drawScreen(ctx, logicalW, logicalH)'), ent.indexOf('draw(ctx, logicalW, logicalH) {'));
  assert.match(screen, /fillRect\(0, 0, logicalW, logicalH\)/);   // 전체 화면 플래시는 drawScreen에
});

test('CW-13: 일시정지 카메라 행 + __NF 노출', () => {
  assert.match(ui, /showPause\(\{ onResume, onQuit, lang = 'ko', cameraZoom = 1, onZoomOut, onZoomReset, onZoomIn, chaseView = false, onToggleChase \}\)/);
  assert.match(ui, /id="btn-zoom-out"[\s\S]{0,120}id="btn-zoom-reset"[\s\S]{0,120}id="btn-zoom-in"/);
  assert.match(main, /cameraZoom: camera\.target,/);
  assert.match(main, /onZoomOut: \(\) => applyZoom\(-1\), onZoomReset: \(\) => applyZoom\(0\), onZoomIn: \(\) => applyZoom\(\+1\)/);
  assert.match(main, /camera, {2,}\/\/ 카메라 상태/);
});
