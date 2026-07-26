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

// Codex P3: 직접 진입형 개발 부트스트랩이 자동 루트 진입과 겹쳐 첫 노드를 두 번 초기화하던 문제.
//  → newExpedition의 devDirect 플래그로 enterSectorMap을 건너뛰고, 개발 함수가 enterNode를 단 한 번만 부른다.
test('FR-16: newExpedition이 opts.devDirect를 run에 기록하고, enterSectorMap이 devDirect면 조기 반환', () => {
  assert.match(mainSrc, /devDirect: !!opts\.devDirect/);
  assert.match(mainSrc, /function enterSectorMap\(\)\s*\{\s*\n\s*const r = run;\s*\n\s*if \(r\.devDirect\) return;/);
});

test('FR-17: 개발 3진입(bosslab·coreLoop·campaign25)이 devDirect:true로 호출한다', () => {
  const calls = mainSrc.match(/newExpedition\('campaign', \{ devDirect: true \}\)/g) || [];
  assert.equal(calls.length, 3, '개발 부트스트랩 3곳만 devDirect');
  // 정상 사용자 진입(startPlay)은 devDirect가 아니다 → 자동 루트 진입 유지
  assert.match(mainSrc, /newExpedition\('campaign', \{ pickWeapon: true \}\)/);
});

test('FR-18: enterNode가 r.bgmRestart를 전투곡 restart로 전달하고 즉시 소비한다(개발 재시작 시 곡 재생)', () => {
  assert.match(mainSrc, /playBgmForSector\(r\.sector, \{ restart: !!r\.bgmRestart \}\); r\.bgmRestart = false;/);
});
