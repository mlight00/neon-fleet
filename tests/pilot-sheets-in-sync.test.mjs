// 관찰 테스트 기록지 — **인쇄본과 온라인판의 항목이 같아야 한다**.
//
// 두 파일에 같은 내용을 손으로 유지하고 있어 한쪽만 고치기 쉽다.
// 실제로 §G-47 보스 페이즈 항목을 온라인판에만 넣어 8 vs 12 로 갈라졌다(2026-08-18).
// 두 판으로 받은 기록을 나중에 대조하지 못하게 되므로, 여기서 막는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRINT = readFileSync(join(ROOT, 'docs/pilot/기록지.html'), 'utf8');
const ONLINE = readFileSync(join(ROOT, 'eval/pilot.html'), 'utf8');

/** 인쇄본 관찰 항목 제목 (표의 <b>…</b><small>) */
const printItems = () =>
  [...PRINT.matchAll(/<b>([^<]+)<\/b><small>/g)].map((m) => m[1].trim());

/** 온라인판 OBS 배열의 t 값 (POST 는 t 만 있고 o 가 없어 구분된다) */
const onlineItems = () => {
  const i = ONLINE.indexOf('const OBS = [');
  const j = ONLINE.indexOf('];', i);
  assert.ok(i > 0 && j > i, 'OBS 배열을 찾지 못했다 — 구조가 바뀌었으면 이 테스트부터 고쳐라');
  return [...ONLINE.slice(i, j).matchAll(/\{\s*t:\s*'([^']+)'/g)].map((m) => m[1].trim());
};

//  ⚠️항목 **수**로 비교하면 안 된다. 종이는 조작 3가지를 한 행에 묶고 화면은 하나씩 나누는데,
//   둘 다 그 매체에 맞는 형태다. 억지로 행 수를 맞추면 인쇄본이 나빠진다.
//   지켜야 할 것은 "한쪽에만 있는 **주제**가 없다" 이다.
const TOPICS = [
  ['출격', /출격까지/],
  ['무기 선택', /무기 선택/],
  ['이동', /이동/],
  ['자동 발사', /자동\s*발사/],
  ['차지', /차지/],
  ['성장 게이트', /성장 게이트/],
  ['첫 성장 반응', /첫 성장 반응/],
  ['첫 피격 원인', /첫 피격 원인/],
  ['3D 발견', /3D 발견/],
  ['보스 페이즈', /보스 페이즈/],
  ['죽은 뒤 재도전', /죽은 뒤/],
  ['설명해 버린 항목', /설명해 버린/],
];

test('⚠️한쪽에만 있는 관찰 주제가 없다', () => {
  const gaps = [];
  for (const [name, re] of TOPICS) {
    const inP = re.test(PRINT), inO = re.test(ONLINE);
    if (inP !== inO) gaps.push(`${name}: ${inP ? '인쇄본에만' : '온라인에만'} 있다`);
  }
  assert.deepEqual(gaps, [],
    `두 기록지가 갈라졌다 — 나중에 기록을 대조할 수 없다\n  ${gaps.join('\n  ')}`);
});

test('양쪽 다 관찰 항목을 실제로 담고 있다 (빈 파일 방지)', () => {
  const p = printItems(), o = onlineItems();
  assert.ok(p.length >= 8, `인쇄본 항목이 ${p.length}개뿐이다`);
  assert.ok(o.length >= 8, `온라인 항목이 ${o.length}개뿐이다`);
});

test('⚠️보스 페이즈 항목이 양쪽에 다 있다 (§G-47 이후 게임이 바뀌었다)', () => {
  //  이 항목이 빠지면 §G-47 이 실제로 느껴지는지를 아무도 안 묻게 된다.
  assert.ok(/보스 페이즈/.test(PRINT), '인쇄본에 보스 페이즈 관찰 항목이 없다');
  assert.ok(/보스 페이즈/.test(ONLINE), '온라인판에 보스 페이즈 관찰 항목이 없다');
});

test('양쪽 다 "1명이면 고친다" 판정 규칙을 담고 있다', () => {
  //  평소의 "3명이 같은 말을 해야 고친다" 를 여기 적용하면 진행 차단을 놓친다.
  for (const [name, src] of [['인쇄본', PRINT], ['온라인판', ONLINE]]) {
    assert.ok(/한 명이면 고친다|1명만 겪어도|무효/.test(src),
      `${name}에 판정 규칙이 없다 — 관찰자가 기준을 모른 채 기록하게 된다`);
  }
});

test('양쪽 다 실험용 주소(?playtest=prolific)를 쓰지 말라고 경고한다', () => {
  //  4분 제한 실험 흐름이라 일반 플레이가 아니다. 그걸로 테스트하면 결과가 무의미하다.
  assert.ok(/playtest=prolific/.test(PRINT), '인쇄본에 실험용 주소 경고가 없다');
  //  온라인판은 게임 주소를 코드로 들고 있으므로 그 주소가 순정인지 본다
  const m = ONLINE.match(/URL_GAME\s*=\s*'([^']+)'/);
  assert.ok(m, '온라인판에 게임 주소 상수가 없다');
  assert.ok(!/playtest/.test(m[1]), `온라인판 게임 주소에 실험 파라미터가 붙어 있다: ${m[1]}`);
});
