import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateSectorMap } from '../js/logic.js';

// P0-B: 섹터 1 첫 루트 자동 진입 (작업지시서 §7.2). enterSectorMap 배선을 소스로,
// '루트는 항상 1개'라는 전제는 맵 생성 행동으로 검증한다.
const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const soloBlock = mainSrc.slice(mainSrc.indexOf('const soloRoot'), mainSrc.indexOf('ui.showSectorMap({'));

test('FR-11: 첫 안내 미시청 → 안내 1회 후 같은 루트로 진입', () => {
  assert.match(soloBlock, /if \(!d\.firstGuideSeen\)/);
  assert.match(soloBlock, /ui\.showFirstGuide\(\{[^}]*onStart:.*save\.set\(\{ firstGuideSeen: true \}\); enterNode\(root\)/s);
});

test('FR-12: 안내 시청자 → 항로 화면·클릭 없이 루트 즉시 진입', () => {
  assert.match(soloBlock, /\} else \{\s*\n?\s*enterNode\(root\);/);
});

test('FR-13/14/15: 자동 진입 가드 — 섹터1·첫노드·노드없음·루트 정확히 1개일 때만', () => {
  assert.match(soloBlock, /r\.sector === 1/);        // 섹터 2+ 제외(§4.2)
  assert.match(soloBlock, /r\.done\.length === 0/);  // 첫 노드 이후 갈림길 제외
  assert.match(soloBlock, /!r\.node/);               // 진행 중 노드 없을 때만
  assert.match(soloBlock, /r\.map\.cols\[0\]\.length === 1/); // 루트가 여럿인 비정상 입력 제외
});

test('FR-15b: 생성되는 섹터 맵의 첫 열은 항상 루트 1개 (자동 진입 전제)', () => {
  let s = 12345; const rng = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (const sec of [1, 2, 3]) {
    const map = generateSectorMap(sec, rng, 5);
    assert.equal(map.cols[0].length, 1, `섹터 ${sec} 루트 열 1개`);
  }
});
