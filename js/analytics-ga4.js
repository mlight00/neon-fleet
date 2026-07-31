// NEON FLEET Stage 1 — 선택형 GA4 어댑터(작업지시서 §10).
// 동의 후에만 gtag 스크립트를 1회 동적 로드하고, 동의 기본값을 denied로 깐 뒤 granted로 업데이트한다.
// index.html에 고정 삽입하지 않는다. 실패(광고 차단·오프라인·잘못된 ID)해도 게임에 영향 없음.
//
// 이 모듈은 gtag/GA4를 아는 유일한 곳이다. main.js·ui.js는 여기(어댑터)만 호출한다(작업지시서 §27).

import { validateMeasurementId } from './analytics-config.js';

/** 기본 스크립트 로더: googletagmanager gtag.js를 async로 head에 1회 삽입. 실패는 삼킨다. */
function defaultLoadScript(doc, id) {
  const s = doc.createElement('script');
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  s.setAttribute('data-nf-analytics', 'ga4');
  s.onerror = () => { /* 로드 실패해도 게임 정상 — 이후 send는 예외 없이 no-op */ };
  (doc.head || doc.documentElement || doc.body).appendChild(s);
  return s;
}

/**
 * GA4 어댑터.
 * @param {object} o
 * @param {object} o.config    ANALYTICS_CONFIG(enabled, measurementId, ...).
 * @param {object} o.consent   createConsent() 인스턴스.
 * @param {object} o.win       window(테스트 시 fake). dataLayer·gtag가 붙는다.
 * @param {object} o.doc       document(테스트 시 fake). 스크립트 삽입 대상.
 * @param {function} [o.isDevMode] ()=>bool. true면 어떤 경우에도 전송 0(개발/측정 진입 제외).
 * @param {function} [o.isDebug]   ()=>bool. true면 이벤트에 debug_mode:true 추가.
 * @param {function} [o.loadScript] (doc,id)=>scriptEl. 테스트 주입용.
 */
export function createGa4Adapter({ config, consent, win, doc, isDevMode = () => false, isDebug = () => false, loadScript = defaultLoadScript } = {}) {
  let inited = false;
  let scriptEl = null;
  let revoked = false;

  function gtagShim() { (win.dataLayer = win.dataLayer || []).push(arguments); }

  function ensureInit() {
    if (inited) return true;
    if (!validateMeasurementId(config.measurementId)) return false;
    try {
      if (!scriptEl) scriptEl = loadScript(doc, config.measurementId);   // 정확히 1회
      if (typeof win.gtag !== 'function') win.gtag = gtagShim;
      const g = win.gtag;
      // 동의 기본값 denied → js → config(자동 page_view·Signals·광고개인화 차단) → granted 업데이트
      g('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
      g('js', new Date());
      g('config', config.measurementId, { send_page_view: false, allow_google_signals: false, allow_ad_personalization_signals: false });
      g('consent', 'update', { analytics_storage: 'granted' });
      inited = true;
      return true;
    } catch {
      return false;   // 초기화 예외 → 전송 안 함, 게임은 정상
    }
  }

  return {
    /** 이벤트 전송 시도. 전송 조건을 모두 만족할 때만 gtag('event'). 결과 {sent, reason} 반환. */
    send(name, props) {
      if (revoked) return { sent: false, reason: 'revoked' };
      if (isDevMode()) return { sent: false, reason: 'dev_mode' };            // 개발/측정 진입 = 전송 0
      if (!config || !config.enabled) return { sent: false, reason: 'disabled' };
      if (!validateMeasurementId(config.measurementId)) return { sent: false, reason: 'no_measurement_id' };
      if (consent.get() !== 'granted') return { sent: false, reason: 'no_consent' };
      if (!ensureInit()) return { sent: false, reason: 'init_failed' };
      try {
        const payload = isDebug() ? { ...props, debug_mode: true } : { ...props };
        win.gtag('event', name, payload);
        return { sent: true };
      } catch {
        return { sent: false, reason: 'gtag_error' };   // gtag 예외 → 게임 정상
      }
    },
    /** 동의 철회: 즉시 미래 전송 중단 + 이미 로드된 GA4에 analytics_storage denied 업데이트. */
    revoke() {
      revoked = true;
      try { if (inited && typeof win.gtag === 'function') win.gtag('consent', 'update', { analytics_storage: 'denied' }); } catch { /* 무시 */ }
    },
    /**
     * 동의 재허용: revoke 상태를 해제해 같은 페이지에서 다시 전송할 수 있게 한다.
     * 이미 init된 경우(스크립트 로드 뒤) analytics_storage를 granted로 되돌린다.
     * 아직 init 전이면 다음 send에서 ensureInit이 granted로 초기화하므로 여기선 플래그만 푼다.
     */
    grant() {
      revoked = false;
      try { if (inited && typeof win.gtag === 'function') win.gtag('consent', 'update', { analytics_storage: 'granted' }); } catch { /* 무시 */ }
    },
    /** grant 별칭(재개). */
    resume() { return this.grant(); },
    isLoaded() { return inited; },
    _state() { return { inited, revoked, hasScript: !!scriptEl }; },
  };
}

/** 코어 sink로 쓸 함수 생성: (event)=>adapter.send(name, properties). */
export function ga4Sink(adapter) {
  return (event) => adapter.send(event.name, event.properties);
}
