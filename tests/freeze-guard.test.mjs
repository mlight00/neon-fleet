// 프리즈 방지: 뷰포트 0(모바일 백그라운드) resize → logicalH NaN → createLinearGradient 예외 → rAF 중단 → 영구 프리즈.
// 근본 수정(resize 0-가드) + 방어(draw 치수 바일) + 회복(frame try/catch 후 rAF 계속) + drawResonanceRail 경계.
// (브라우저 결합 코드라 소스 배선을 검증 — 실동작은 브라우저에서 innerHeight=0 resize로 확인 완료)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mainSrc = readFileSync(join(root, 'js/main.js'), 'utf8');
const entSrc = readFileSync(join(root, 'js/entities.js'), 'utf8');

test('FZ-1: resize가 0 뷰포트를 무시한다(NaN 치수 방지 — 근본 원인)', () => {
  const block = mainSrc.slice(mainSrc.indexOf('function resize'), mainSrc.indexOf('function resize') + 400);
  assert.ok(/if \(!vw \|\| !vh\) return/.test(block), 'vw/vh 0이면 조기 반환');
});

test('FZ-2: draw가 치수 비정상 시 렌더를 건너뛴다(방어)', () => {
  const block = mainSrc.slice(mainSrc.indexOf('function draw()'), mainSrc.indexOf('function draw()') + 500);
  assert.ok(/Number\.isFinite\(logicalH\)/.test(block) && /logicalH <= 0/.test(block), 'logicalH 유한·양수 검사');
  assert.ok(/scale <= 0|Number\.isFinite\(scale\)/.test(block), 'scale 검사');
});

test('FZ-3: 프레임 루프가 예외 후에도 rAF를 계속한다(영구 프리즈 방지)', () => {
  const block = mainSrc.slice(mainSrc.indexOf('function frame(t)'), mainSrc.indexOf('function frame(t)') + 1100);
  assert.ok(/try \{/.test(block) && /catch/.test(block), 'update/draw try-catch');
  // catch 블록 뒤에도 requestAnimationFrame(frame)가 호출된다
  assert.ok(/catch[\s\S]*requestAnimationFrame\(frame\)/.test(block), '예외 시에도 rAF 재예약');
});

test('FZ-4: drawResonanceRail이 비유한 좌표·무한 마디루프에 안전하다', () => {
  const i = entSrc.indexOf('drawResonanceRail(ctx)');
  const block = entSrc.slice(i, i + 1400);
  assert.ok(/!Number\.isFinite\(this\.x\) \|\| !Number\.isFinite\(this\.y\)/.test(block), '비유한 좌표 가드');
  assert.ok(/n < 40/.test(block), '마디 루프 반복 상한(무한루프 불가)');
});
