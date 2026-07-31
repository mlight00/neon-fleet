import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// 포털·Prolific(영어)에서 캔버스에 그려지는 텍스트에 한글이 남으면 안 된다.
//  ⚠️ 캔버스 텍스트는 DOM에 없어 DOM 스캔으로 못 잡는다(이사 지적: 첫 QA가 이걸 놓쳤다).
//     → 공용 렌더 파일(entities.js·render.js)의 텍스트 그리기 호출을 소스로 정적 검사해 회귀를 막는다.
//  main.js 는 제외: campaign25/coreLoop(개발·25분) 전용 토스트는 의도적으로 한국어이고 포털에서 도달하지 않는다.
const HANGUL = /[가-힣]/;
const DRAW = /(effects\.text\(|\.fillText\(|\.strokeText\(|applyDelta\([^;]*world,|rescue\()/;
const GATE = /(ek\(|en \? |d\.en|tx\(|EN \? |LANG_EN)/;   // 언어 분기 토큰

function offenders(file) {
  const src = readFileSync(new URL(`../js/${file}`, import.meta.url), 'utf8');
  const out = [];
  src.split('\n').forEach((line, i) => {
    const code = line.split(' //')[0];          // 줄 끝 주석 제거(단순)
    if (DRAW.test(code) && HANGUL.test(code) && !GATE.test(code)) out.push(`${file}:${i + 1}: ${line.trim()}`);
  });
  return out;
}

test('PK-KO-1: entities.js 캔버스 텍스트에 미분기 한글 없음(포털=영어)', () => {
  assert.deepEqual(offenders('entities.js'), [], '아래 라벨을 ek()로 영어화하세요');
});

test('PK-KO-2: render.js 캔버스 HUD 텍스트에 미분기 한글 없음(포털=영어)', () => {
  assert.deepEqual(offenders('render.js'), [], '아래 HUD 문자열을 en?/d.en 으로 영어화하세요');
});

test('PK-KO-2b: cutscene.js 컷신 텍스트에 미분기 한글 없음(포털=영어)', () => {
  // 섹터 클리어 컷신의 보스명·"격침 확인"·건너뛰기 안내(이사 지적: 섹터1 보스 격파 후 남았던 한글).
  assert.deepEqual(offenders('cutscene.js'), [], '아래 컷신 문자열을 c.en 으로 영어화하세요');
});

test('PK-KO-3: 언어 배선 존재 — setEntityLang(EN) 호출 + world.en', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /setEntityLang\(EN\)/);
  assert.match(main, /en: EN,/);   // world.en
  const ent = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
  assert.match(ent, /export function setEntityLang/);
  assert.match(ent, /const EV_NAMES_EN = \[/);
});
