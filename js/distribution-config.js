// 배포 대상(distribution) 판정 — 순수 함수. CrazyGames 포털 배포를 일반/Prolific/개발 모드와 분리한다.
//  부작용 없음: 네트워크·DOM·스토리지에 접근하지 않고 오직 { hostname, search } 만 본다 → 테스트 가능.
//  포털 판정은 Prolific·개발 판정보다 우선한다(호출부에서 이 결과로 PLAYTEST를 끈다 — 지시서 §3.2).

export const DISTRIBUTION_QUERY_KEY = 'distribution';
export const CRAZYGAMES_VALUE = 'crazygames';

/** hostname 이 crazygames.com 또는 *.crazygames.com 인가(대소문자 무시). */
export function isCrazyGamesHost(hostname = '') {
  const h = String(hostname || '').trim().toLowerCase();
  return h === 'crazygames.com' || h.endsWith('.crazygames.com');
}

/**
 * 배포 대상을 판정한다.
 * @param {{hostname?: string, search?: string}} loc  일반적으로 { hostname: location.hostname, search: location.search }
 * @returns {{id: string, portal: boolean, crazygames: boolean, source: string}}
 *   - ?distribution=crazygames  또는  crazygames.com 계열 호스트 → { id:'crazygames', portal:true, crazygames:true }
 *   - 그 외 → { id:'web', portal:false, crazygames:false }
 */
export function detectDistribution(loc = {}) {
  const { hostname = '', search = '' } = loc || {};
  let value = '';
  try { value = (new URLSearchParams(search || '').get(DISTRIBUTION_QUERY_KEY) || '').trim().toLowerCase(); }
  catch { value = ''; }
  const host = isCrazyGamesHost(hostname);
  if (value === CRAZYGAMES_VALUE || host) {
    return { id: 'crazygames', portal: true, crazygames: true, source: host ? 'hostname' : 'query' };
  }
  return { id: 'web', portal: false, crazygames: false, source: 'default' };
}

/** 포털(설치 없는 웹게임 배포) 모드인가. */
export function isPortalMode(dist) {
  return !!(dist && dist.portal);
}

/** CrazyGames 포털인가(현재 유일한 포털이라 isPortalMode와 동치지만, 향후 포털 추가를 대비해 분리). */
export function isCrazyGamesMode(dist) {
  return !!(dist && dist.crazygames);
}

/** 런타임 표시 언어. 포털 = 영어, 그 외 = 한국어(기존 기본값). */
export function runtimeLanguage(dist) {
  return isPortalMode(dist) ? 'en' : 'ko';
}

/** 이 배포에서 분석(GA4)·개인정보 동의 UI를 허용하는가.
 *  포털은 포털 자체 대시보드 지표를 쓰므로 게임 내 GA4·동의 UI를 켜지 않는다(지시서 §P0-1 분석·개인정보). */
export function analyticsAllowedForDistribution(dist) {
  return !isPortalMode(dist);
}
