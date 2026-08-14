// 첫 출격 안내에 성장/손실 게이트 설명이 남아 있는지 지킨다.
//
// 배경: 무기 선택 게이트(weaponGate)를 없애면서 안내문이 combo 판으로 고정됐고,
// 그 판에 청록/자홍 한 줄이 없어 "설명은 못 듣고 물건은 만나는" 상태가 됐다.
// 성장/손실 게이트(gatePair)는 그대로 남아 두 번째 노드부터 86% 나온다.
// 이 테스트는 그 줄이 다시 사라지는 것을 막는다. (첫90초 설계서 §2-3, 이사 결정 '가')
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ui = readFileSync(join(ROOT, 'js/ui.js'), 'utf8');

/** showFirstGuide 본문만 잘라낸다 — 파일 전체를 훑으면 다른 곳의 '청록'에 속는다. */
function guideBody() {
  const i = ui.indexOf('showFirstGuide(');
  assert.notEqual(i, -1, 'showFirstGuide 를 찾지 못했다');
  const j = ui.indexOf('showResetConfirm', i);
  assert.notEqual(j, -1, 'showFirstGuide 의 끝을 찾지 못했다');
  return ui.slice(i, j);
}

/** combo 분기(지금 공개 플레이에서 실제로 뜨는 판)만 잘라낸다. */
function comboBranch() {
  const b = guideBody();
  const i = b.indexOf('const body = combo ?');
  assert.notEqual(i, -1, 'combo 분기를 찾지 못했다 — 구조가 바뀌었으면 이 테스트도 고쳐야 한다');
  const j = b.indexOf('` : `', i);
  assert.notEqual(j, -1, 'combo 분기의 끝(` : `)을 찾지 못했다');
  return b.slice(i, j);
}

test('공개 플레이(combo) 안내에 청록/자홍 게이트 설명이 있다', () => {
  const combo = comboBranch();
  assert.ok(combo.includes('청록'), 'combo 안내에 "청록" 이 없다 — 성장 게이트 설명이 사라졌다');
  assert.ok(combo.includes('자홍'), 'combo 안내에 "자홍" 이 없다 — 손실 게이트 설명이 사라졌다');
  assert.ok(/성장/.test(combo) && /손실/.test(combo), '청록=성장 / 자홍=손실 의미가 빠졌다');
});

test('청록·자홍이 실제 게이트 색과 같은 값으로 표기된다', () => {
  const combo = comboBranch();
  //  색을 글자로만 쓰면 화면의 게이트와 연결이 안 된다. 안내문도 같은 색을 칠해야 한다.
  assert.ok(/#3ff5e0/i.test(combo), '청록 강조색(#3ff5e0)이 안내문에 없다');
  assert.ok(/#ff3d71/i.test(combo), '자홍 강조색(#ff3d71)이 안내문에 없다');
});

test('영문 안내도 같은 설명을 유지한다', () => {
  const b = guideBody();
  const en = b.slice(b.indexOf("lang === 'en'"), b.indexOf('const body = combo ?'));
  assert.ok(/cyan/i.test(en), '영문 안내에 cyan 설명이 없다');
  assert.ok(/magenta/i.test(en), '영문 안내에 magenta 설명이 없다');
});

test('설명을 지켜야 하는 이유가 실제로 성립한다 — 게이트가 아직 데이터에 있다', async () => {
  //  이 테스트의 존재 이유 자체를 검증한다. gatePair 가 전부 사라지면
  //  위 테스트들은 불필요해지므로, 그때는 이 테스트가 먼저 실패해 알려 준다.
  const { CHUNKS } = await import('../js/chunks.js');
  const gates = CHUNKS.filter((c) => c.items.some((it) => it.type === 'gatePair'));
  assert.ok(
    gates.length > 0,
    'gatePair 청크가 하나도 없다 — 게이트를 정말 제거했다면 안내문 줄과 이 테스트를 함께 정리해야 한다',
  );
});

test('이 계약을 검사하는 테스트가 여기 하나뿐이다(중복 방지)', () => {
  //  같은 계약을 여러 테스트가 중복 검사하면 하나만 고치고 통과했다고 착각한다.
  //  ⚠️'청록' 이라는 낱말만으로 세면 안 된다 — 3D 예광탄 색 테스트 같은 무관한 파일이 걸린다.
  //   "안내문(showFirstGuide)" 을 함께 다루는 파일만 중복으로 본다.
  const dupes = readdirSync(join(ROOT, 'tests'))
    .filter((f) => f.endsWith('.mjs') && f !== 'first-guide-gate-line.test.mjs')
    .filter((f) => {
      const src = readFileSync(join(ROOT, 'tests', f), 'utf8');
      return src.includes('showFirstGuide') && /청록|자홍/.test(src);
    });
  assert.deepEqual(dupes, [], `안내문의 청록/자홍을 검사하는 다른 테스트가 있다: ${dupes.join(', ')}`);
});
