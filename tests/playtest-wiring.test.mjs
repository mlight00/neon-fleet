// NEON FLEET — Prolific 흐름의 브라우저 결합 배선 검증(작업지시서 §4·§5·§8.1).
//  DOM·rAF 결합이라 jsdom 없이 소스 배선을 확인한다(freeze-guard·bgm-sector와 같은 방식).
//  로직 자체는 playtest.test.mjs / playtest-analytics.test.mjs에서 실제 모듈로 검증한다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mainSrc = readFileSync(join(root, 'js/main.js'), 'utf8');
const uiSrc = readFileSync(join(root, 'js/ui.js'), 'utf8');

test('PW-1: PLAYTEST 게이트는 개발/측정 URL을 배제한다(§3·§8.1)', () => {
  assert.match(mainSrc, /const PLAYTEST = isPlaytestUrl\(location\.search\)[\s\S]*?!CORE_LOOP[\s\S]*?!CORE_MEASURE[\s\S]*?!CAMPAIGN25[\s\S]*?!BOSSLAB/);
});

test('PW-2: 부트스트랩이 PLAYTEST일 때만 전용 흐름으로 진입(§4.1)', () => {
  assert.match(mainSrc, /if \(PLAYTEST\) \{\s*startPlaytestFlow\(\);/);
  // 일반 게임의 첫 접속 인트로 분기는 else로 보존
  assert.match(mainSrc, /\} else if \(save\.get\(\)\.introSeen\) \{/);
});

test('PW-3: 동의 화면·설문·완료 안내 UI가 존재한다(§4.1·§5)', () => {
  assert.match(uiSrc, /showPlaytestIntro\(\{ onAgree, onDecline \}\)/);
  assert.match(uiSrc, /showPlaytestSurvey\(\{ onSubmit \}\)/);
  assert.match(uiSrc, /showPlaytestComplete\(/);
  // 영어 시작 화면 핵심 문구·동의 문구
  assert.match(uiSrc, /4-Minute Playtest/);
  assert.match(uiSrc, /I agree — Start/);
  assert.match(uiSrc, /I do not agree/);
  // 5문항 필수 + 제출 라벨
  assert.match(uiSrc, /How fun was the game during these few minutes\?/);
  assert.match(uiSrc, /How clear were the controls and choices\?/);
  assert.match(uiSrc, /how likely would you be to start another run\?/);
  assert.match(uiSrc, /What felt most exciting\?/);
  assert.match(uiSrc, /What got in the way the most\?/);
  assert.match(uiSrc, /Submit and return to Prolific/);
});

test('PW-4: 완료 URL이 비면 완료 코드 안내 문구를 보여준다(§5)', () => {
  assert.match(uiSrc, /Test complete — return to Prolific and enter the completion code shown in the study\./);
});

test('PW-5: 전투 진입 시점에만 타이머 시작(§4.2)', () => {
  // enterNode 안에서 startCombat — 전투 전에는 미동작
  assert.match(mainSrc, /if \(PLAYTEST && playtest\) playtest\.timer\.startCombat\(\);/);
});

test('PW-6: 240초 도달은 프레임 루프의 playtestTick이 time_limit로 설문 진입(§4.2)', () => {
  assert.match(mainSrc, /playtestTick\(dt\);/);
  assert.match(mainSrc, /function playtestTick\(dt\) \{[\s\S]*?state !== 'play'[\s\S]*?playtest\.timer\.tick\(dt\)[\s\S]*?triggerPlaytestSurvey\('time_limit'\)/);
});

test('PW-7: 첫 사망이 먼저면 endExpedition 대신 first_death 설문(§4.2)', () => {
  assert.match(mainSrc, /if \(PLAYTEST && playtest && !playtest\.done\) \{ triggerPlaytestSurvey\('first_death'\); return; \}[\s\S]*?endExpedition\('death'\);/);
});

test('PW-8: 설문 진입은 원정당 1회(playtest.done 가드) + 게임 안전 정지', () => {
  const i = mainSrc.indexOf('function triggerPlaytestSurvey');
  const block = mainSrc.slice(i, i + 700);
  assert.match(block, /if \(!playtest \|\| playtest\.done\) return;/);   // 중복 진입 방지
  assert.match(block, /playtest\.done = true;/);
  assert.match(block, /track\.playtestLimitReached\(endReason, playtest\.timer\.elapsed\(\)\)/);
  assert.match(block, /ui\.showPlaytestSurvey\(\{ onSubmit:/);
});

test('PW-9: 제출은 흐름 로직(createPlaytestSubmission.submit)에 위임(중복·완료 보장)', () => {
  assert.match(mainSrc, /const playtestSubmission = createPlaytestSubmission\(\{/);
  assert.match(mainSrc, /onSubmit: \(answers\) => playtestSubmission\.submit\(answers\)/);
  assert.match(mainSrc, /showManualComplete: \(\) => ui\.showPlaytestComplete\(\)/);
});

test('PW-10: 동의 거부 시 no-consent URL이 비면 이동하지 않고 안내만(§4.1)', () => {
  const i = mainSrc.indexOf('function playtestDecline');
  const block = mainSrc.slice(i, i + 600);
  assert.match(block, /ga4Adapter\.revoke\(\)/);                       // 전송 중단
  assert.match(block, /st\.hasNoConsentUrl/);                          // 설정 있을 때만 이동
  assert.match(block, /ui\.showPlaytestComplete\(/);                  // 없으면 안내
});

test('PW-11: 참가자 대면 문구가 영어 — 무기 픽·가이드·일시정지(§4.3)', () => {
  assert.match(mainSrc, /Choose your starting weapon/);
  assert.match(mainSrc, /WEAPON_LABELS_EN/);
  assert.match(uiSrc, /lang === 'en'/);                                // showFirstGuide·showPause·showSectorMap 영어 분기
  assert.match(uiSrc, /How to play/);
});

test('PW-12: 영어(EN=PLAYTEST||PORTAL)에서 버튼 접근 가능 이름이 영어(§4.3·§P0-2 공유 경로)', () => {
  // 영어 경로는 Prolific과 포털이 공유(EN). PLAYTEST면 EN도 참이라 Prolific 영어 요구는 그대로 유지된다.
  assert.match(mainSrc, /pauseBtn\.setAttribute\('aria-label', EN \? 'Pause'/);
  assert.match(mainSrc, /chargeBtn\.setAttribute\('aria-label', EN \? 'Charge shot \(hold\)'/);
  assert.match(mainSrc, /EN \? 'Unmute' : '음소거 해제'/);
  assert.match(mainSrc, /EN \? 'Mute' : '음소거'/);
});

test('PW-13: HUD 핵심 정보가 영어(EN)에서 영어로 그려진다(§4.3)', () => {
  assert.match(mainSrc, /en: EN,/);   // drawHUD·drawSectorLoadoutHud에 en 플래그(EN=PLAYTEST||PORTAL) 전달
});

test('PW-14: 영어 테스트의 중간 선택·설정·일시정지가 한국어 화면이나 설문 우회로를 만들지 않는다', () => {
  assert.match(mainSrc, /document\.documentElement\.lang = 'en'/);
  assert.match(mainSrc, /Choose a weapon upgrade/);
  assert.match(mainSrc, /PLAYTEST_SHIP_TRAITS_EN/);
  assert.match(mainSrc, /onQuit: PLAYTEST \? null : quitRun/);
  assert.match(uiSrc, /Choose a combat module/);
  assert.match(uiSrc, /Choose a fleet doctrine/);
  assert.match(uiSrc, /Choose a keystone/);
  assert.match(uiSrc, /Emergency repair/);
});
