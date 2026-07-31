import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// P0-D: 모바일 항로 1탭 설명·2단 확정 (작업지시서 §7.4). DOM 상호작용이라 소스로 배선을 고정하고,
// 실제 탭·클릭·키보드 동작은 브라우저 QA에서 확인한다(결과 보고서 참조).
const uiSrc = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const map = uiSrc.slice(uiSrc.indexOf('showSectorMap({'), uiSrc.indexOf('showStageClear({'));

test('SM-19: 터치 첫 탭은 선택만, 같은 노드 두 번째 탭은 확정(touch_confirm)', () => {
  assert.match(map, /if \(touch\) \{ if \(selectedId === node\.id\) confirmPick\(node, 'touch_confirm'\); else selectNode\(node\); \}/);
});

test('SM-20: onPick은 로컬 가드로 정확히 한 번만, 입력 수단을 method로 전달', () => {
  assert.match(map, /confirmPick = \(node, method\) => \{ if \(confirmed \|\| !node\) return; confirmed = true; onPick\(node, method\); \}/);
  assert.match(map, /confirmBtn\.addEventListener\('click', \(\) => \{ if \(selectedId != null\) confirmPick\(idToNode\[selectedId\], 'touch_confirm'\)/);
});

test('SM-21: 다른 노드 첫 탭은 선택 상태만 바꾼다(selectNode)', () => {
  assert.match(map, /const selectNode = \(node\) => \{/);
  assert.match(map, /b\.setAttribute\('aria-pressed', on \? 'true' : 'false'\)/);
});

test('SM-22: 마우스 1클릭(pointer_confirm)·키보드 Enter(keyboard_confirm)는 즉시 확정, 키보드발 click은 무시', () => {
  assert.match(map, /else confirmPick\(node, 'pointer_confirm'\);/);    // 마우스 즉시 확정
  assert.match(map, /if \(e\.detail === 0\) return;/);                  // 키보드 유발 click 무시
  assert.match(map, /attachKeyNav\(overlay\.querySelectorAll\('\[data-node\]'\), \(b\) => confirmPick\(idToNode\[\+b\.dataset\.node\], 'keyboard_confirm'\)\)/); // 키보드 확정
  assert.match(map, /const touch = lastPT === 'touch' \|\| \(lastPT === '' && coarse\)/); // pointer 종류 판별
});

test('SM-23: 항로 접근 가능한 이름이 열·순번으로 고유하다', () => {
  assert.match(map, /const ariaFor = \(node\) => \{/);
  assert.match(map, /\$\{node\.col \+ 1\}열 \$\{ord\}번째 항로/);
  assert.match(map, /aria-label="\$\{ariaFor\(node\)\}"/);
});

test('SM-24: 확정 버튼은 coarse pointer에서만 표시, 선택 전 비활성 (터치 대상 44px 유지)', () => {
  assert.match(map, /const coarse = typeof matchMedia === 'function' && matchMedia\('\(pointer: coarse\)'\)\.matches/);
  assert.match(map, /id="map-confirm" disabled style="display:\$\{coarse \? 'block' : 'none'\}/);
  assert.match(map, /width:44px;height:44px/, '노드 터치 영역 44px 유지');
});
