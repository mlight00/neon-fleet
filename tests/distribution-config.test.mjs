import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectDistribution, isPortalMode, isCrazyGamesMode, isCrazyGamesHost,
  runtimeLanguage, analyticsAllowedForDistribution,
  DISTRIBUTION_QUERY_KEY, CRAZYGAMES_VALUE,
} from '../js/distribution-config.js';
import { isPlaytestUrl } from '../js/playtest-config.js';
import { isDevUrl } from '../js/analytics-config.js';

// P0-1: 포털(CrazyGames) 배포 판정이 순수 함수로 테스트 가능하고, Prolific·개발과 분리되며 충돌 시 포털이 우선한다.

test('DC-01: 상수', () => {
  assert.equal(DISTRIBUTION_QUERY_KEY, 'distribution');
  assert.equal(CRAZYGAMES_VALUE, 'crazygames');
});

test('DC-02: 일반 URL → web(포털 아님)', () => {
  const d = detectDistribution({ hostname: 'localhost', search: '' });
  assert.equal(d.id, 'web');
  assert.equal(isPortalMode(d), false);
  assert.equal(isCrazyGamesMode(d), false);
  assert.equal(runtimeLanguage(d), 'ko');
  assert.equal(analyticsAllowedForDistribution(d), true);
});

test('DC-03: ?distribution=crazygames → 포털(query)', () => {
  const d = detectDistribution({ hostname: 'localhost', search: '?distribution=crazygames' });
  assert.equal(d.id, 'crazygames');
  assert.equal(d.source, 'query');
  assert.equal(isPortalMode(d), true);
  assert.equal(isCrazyGamesMode(d), true);
  assert.equal(runtimeLanguage(d), 'en');
  assert.equal(analyticsAllowedForDistribution(d), false);
});

test('DC-04: hostname crazygames.com / *.crazygames.com → 포털(hostname)', () => {
  assert.equal(isCrazyGamesHost('crazygames.com'), true);
  assert.equal(isCrazyGamesHost('www.crazygames.com'), true);
  assert.equal(isCrazyGamesHost('games.crazygames.com'), true);
  assert.equal(isCrazyGamesHost('CrazyGames.com'), true, '대소문자 무시');
  assert.equal(isCrazyGamesHost('notcrazygames.com'), false);
  assert.equal(isCrazyGamesHost('crazygames.com.evil.com'), false, '접미사 위장 방지');
  const d = detectDistribution({ hostname: 'www.crazygames.com', search: '' });
  assert.equal(isPortalMode(d), true);
  assert.equal(d.source, 'hostname');
});

test('DC-05: 포털+Prolific 동시 → 포털 우선(호출부에서 PLAYTEST off)', () => {
  const search = '?distribution=crazygames&playtest=prolific';
  const d = detectDistribution({ hostname: 'localhost', search });
  assert.equal(isPortalMode(d), true);
  // main.js 규칙: PLAYTEST = isPlaytestUrl && !PORTAL. 포털이면 Prolific 흐름 비활성.
  const playtestActive = isPlaytestUrl(search) && !isPortalMode(d);
  assert.equal(playtestActive, false, '포털 모드에서 Prolific 비활성');
  assert.equal(isPlaytestUrl(search), true, '(참고) URL 자체엔 playtest가 있으나 포털이 이긴다');
});

test('DC-06: 포털은 개발 URL 판정과 독립', () => {
  // 개발 파라미터가 붙어도 distribution=crazygames면 포털로 본다(판정 독립).
  const d = detectDistribution({ hostname: 'localhost', search: '?distribution=crazygames&coreLoopTest=1' });
  assert.equal(isPortalMode(d), true);
  assert.equal(isDevUrl('?coreLoopTest=1'), true, '(참고) 개발 판정은 별도 축');
});

test('DC-07: 잘못된 입력에도 안전(throw 없음)', () => {
  assert.equal(detectDistribution().id, 'web');
  assert.equal(detectDistribution({}).id, 'web');
  assert.equal(detectDistribution({ hostname: null, search: null }).id, 'web');
  assert.equal(isCrazyGamesHost(), false);
  assert.equal(isCrazyGamesHost(null), false);
  assert.equal(isPortalMode(null), false);
  assert.equal(isPortalMode(undefined), false);
});
