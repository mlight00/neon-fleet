import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createPlatform, platform } from '../js/platform.js';

// P0-1~P0-4: CrazyGames 포털 모드 배선을 소스로 고정한다(런타임 DOM/캔버스는 브라우저 QA로 별도 검증).
const mainSrc = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const uiSrc = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');
const htmlSrc = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('CW-01: 포털 판정·플랫폼 모듈을 import한다', () => {
  assert.match(mainSrc, /from '\.\/distribution-config\.js'/);
  assert.match(mainSrc, /import \{ platform \} from '\.\/platform\.js'/);
  assert.match(mainSrc, /const DIST = detectDistribution\(\{ hostname: location\.hostname, search: location\.search \}\)/);
  assert.match(mainSrc, /const PORTAL_MODE = isPortalMode\(DIST\)/);
});

test('CW-02: 포털이 Prolific·개발보다 우선 (PLAYTEST에서 PORTAL 제외)', () => {
  assert.match(mainSrc, /const PLAYTEST = isPlaytestUrl\(location\.search\)[^\n]*&& !PORTAL_MODE;/);
});

test('CW-03: 영어 경로를 Prolific·포털이 공유 (EN=PLAYTEST||PORTAL_MODE, 중복 사전 없음 §P0-2)', () => {
  assert.match(mainSrc, /const EN = PLAYTEST \|\| PORTAL_MODE;/);
  assert.match(mainSrc, /const LANG = EN \? 'en' : 'ko';/);
  // 부팅: 포털 분기가 Prolific/일반보다 먼저
  assert.match(mainSrc, /if \(PORTAL_MODE\) \{\s*\n\s*startPortalPlay\(\);\s*\n\s*\} else if \(PLAYTEST\)/);
});

test('CW-04: 포털 시작 흐름 — 타이틀/인트로 없이 무기 선택 → 곧바로 전투(§P0-3)', () => {
  assert.match(mainSrc, /function startPortalPlay\(\)/);
  assert.match(mainSrc, /document\.documentElement\.lang = 'en'/);
  // showTitleScreen은 포털에서 startPortalPlay로 라우팅(한국어 타이틀 미노출)
  assert.match(mainSrc, /function showTitleScreen\(\) \{\s*\n\s*if \(PORTAL_MODE\) \{ startPortalPlay\(\); return; \}/);
  // enterSectorMap 포털 분기: 차단 가이드 없이 enterNode + 비차단 힌트
  assert.match(mainSrc, /if \(PORTAL_MODE\) \{[\s\S]{0,240}?enterNode\(root\);\s*\n\s*showPortalHint\(\);\s*\n\s*return;/);
});

test('CW-05: 비차단 조작 힌트는 pointer-events:none이고 입력/8초에 사라진다(§P0-3)', () => {
  assert.match(mainSrc, /function showPortalHint\(\)/);
  assert.match(mainSrc, /pointer-events:none/);
  assert.match(mainSrc, /setTimeout\(remove, 8000\)/);
  assert.match(mainSrc, /addEventListener\('keydown', remove, true\)/);
});

test('CW-06: 포털에서 GA4·동의 UI 억제(§P0-1 분석/개인정보)', () => {
  // GA4 어댑터가 포털을 dev처럼 억제(미래 측정 ID도 전송 0)
  assert.match(mainSrc, /isDevMode: \(\) => ANALYTICS_DEV \|\| !analyticsAllowedForDistribution\(DIST\)/);
  // 동의 배너도 포털에서 미표시
  assert.match(mainSrc, /function maybeShowConsentBanner\(\) \{\s*\n\s*if \(!analyticsAllowedForDistribution\(DIST\)\) return;/);
});

test('CW-07: 빠른 재도전 — 포털 PLAY AGAIN=같은 무기, CHANGE WEAPON 보조(§P0-4)', () => {
  // startPlay가 같은 무기 인자를 받고, newExpedition이 무기 프리셋을 처리
  assert.match(mainSrc, /function startPlay\(sameWeapon\)/);
  assert.match(mainSrc, /newExpedition\('campaign', \{ pickWeapon: true, weapon: sameWeapon \}\)/);
  assert.match(mainSrc, /if \(opts\.weapon\) \{/);
  // 결과 화면: 포털은 같은 무기 재도전 + 무기 변경 보조 버튼
  assert.match(mainSrc, /startPlay\(PORTAL_MODE \? lastWeapon : undefined\)/);
  assert.match(mainSrc, /onChangeWeapon: PORTAL_MODE \?/);
  assert.match(uiSrc, /onChangeWeapon = null/);
  assert.match(uiSrc, /PLAY AGAIN/);
});

test('CW-08: 광고 SDK 미구현 — 광고 요청 함수는 UI에서 호출하지 않는다(§1.3)', () => {
  // 플랫폼 수명주기(gameplayStart/Stop)는 배선하되 광고 요청은 절대 호출 안 함
  assert.match(mainSrc, /platform\.gameplayStart\(\)/);
  assert.match(mainSrc, /platform\.gameplayStop\(\)/);
  assert.ok(!/requestMidgameAd\(|requestRewardedAd\(/.test(mainSrc), 'main.js에서 광고 요청 호출 없음');
  // 원격 SDK/광고 네트워크 문자열이 소스에 없음
  assert.ok(!/sdk\.crazygames\.com|crazygames\.com\/.*sdk|googlesyndication|adsbygoogle/i.test(mainSrc), '광고 SDK 스크립트 없음');
});

test('CW-09: index.html에 gtag/광고 태그가 없다(정적)', () => {
  assert.ok(!/googletagmanager|gtag|adsbygoogle|googlesyndication/i.test(htmlSrc), 'index.html 분석/광고 태그 없음');
});

test('CW-11: 결과 화면 무료 개조 카드가 영어(포털) — 브라우저 QA에서 잡은 한국어 누출 회귀', () => {
  // BAL.hangar.upgrades[k].name/unit 은 한국어라, EN에서 영어명(FREE_EN)+단위 생략으로 대체해야 한다.
  assert.match(mainSrc, /const FREE_EN = \{ drones: 'Drones', hull: 'Hull', dmg: 'Damage' \}/);
  assert.match(mainSrc, /name: EN \? \(FREE_EN\[k\] \|\| def\.name\) : def\.name/);
  assert.match(mainSrc, /delta: `\+\$\{def\.step\}\$\{EN \? '' : \(def\.unit \|\| ''\)\}`/);
});

test('CW-12: 비차단 힌트는 표시 직후 잠깐 뒤부터 입력 감지(띄운 클릭이 곧바로 소거하지 않음)', () => {
  assert.match(mainSrc, /setTimeout\(\(\) => \{\s*\n\s*if \(done\) return;\s*\n\s*window\.addEventListener\('keydown', remove, true\);/);
});

test('CW-10: 플랫폼 인터페이스는 로컬 no-op (네트워크 없음)', async () => {
  const calls = [];
  const p = createPlatform({ onLog: (m) => calls.push(m) });
  p.gameplayStart(); p.gameplayStop();
  const mid = await p.requestMidgameAd();
  const rew = await p.requestRewardedAd();
  assert.deepEqual(calls, ['gameplayStart', 'gameplayStop', 'requestMidgameAd', 'requestRewardedAd']);
  assert.equal(mid.shown, false);
  assert.equal(rew.rewarded, false);
  // 기본 싱글턴도 안전하게 호출됨
  assert.doesNotThrow(() => { platform.gameplayStart(); platform.gameplayStop(); });
});
