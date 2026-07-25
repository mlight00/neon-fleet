// 정비 노드 UI/흐름: 버튼 라벨만 표기 + 긴급 수리 하위 선택(내구도 손상 시 수리 vs 드론).
// UI는 DOM이라 소스 배선을 검증한다(실렌더는 브라우저 확인).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const uiSrc = readFileSync(join(root, 'js/ui.js'), 'utf8');
const mainSrc = readFileSync(join(root, 'js/main.js'), 'utf8');
const cssSrc = readFileSync(join(root, 'css/style.css'), 'utf8');

test('RN-1: 정비 노드 첫 화면 버튼은 라벨만(상세 텍스트 제거)', () => {
  const block = uiSrc.slice(uiSrc.indexOf('showRepair('), uiSrc.indexOf('showEmergencyRepair('));
  assert.ok(/>🩹 긴급 수리<\/button>/.test(block), '긴급 수리 라벨만');
  assert.ok(/>🧩 모듈 정비<\/button>/.test(block), '모듈 정비 라벨만');
  assert.ok(!/드론 \+\$\{/.test(block), '버튼에 드론 수치 없음');
  assert.ok(!/모듈 3택/.test(block), '버튼에 모듈 3택 문구 없음');
});

test('RN-2: 오버플로 방지 — 정비 버튼은 넓게+줄바꿈 허용', () => {
  assert.ok(/\.repair-btn\s*\{[^}]*white-space:\s*normal/.test(cssSrc), 'repair-btn 줄바꿈 허용');
  assert.ok(/\.repair-btn\s*\{[^}]*max-width:\s*none/.test(cssSrc), 'repair-btn max-width 해제');
  assert.ok(/class="repair-btn"/.test(uiSrc), '버튼에 repair-btn 적용');
});

test('RN-3: 긴급 수리 하위 선택 UI(showEmergencyRepair) 존재', () => {
  assert.ok(/showEmergencyRepair\(\{/.test(uiSrc), 'showEmergencyRepair 메서드');
  const block = uiSrc.slice(uiSrc.indexOf('showEmergencyRepair('));
  assert.ok(/기함 내구도 수리/.test(block), '내구도 수리 옵션');
  assert.ok(/드론 보충/.test(block), '드론 보충 옵션');
});

test('RN-4: enterRepair가 내구도 손상 시 재선택, 정상 시 드론 보충', () => {
  const block = mainSrc.slice(mainSrc.indexOf('function enterRepair'));
  assert.ok(/surv\.hull < surv\.hullMax/.test(block), '내구도 손상 판정');
  assert.ok(/surv\.hull = surv\.hullMax/.test(block), '내구도 완전 수리');
  assert.ok(/showEmergencyRepair\(/.test(block), '손상 시 하위 선택 호출');
  assert.ok(/hullDamaged\(\)\s*\)\s*ui\.showEmergencyRepair|if \(hullDamaged\(\)\)/.test(block), '분기: 손상이면 재선택');
});
