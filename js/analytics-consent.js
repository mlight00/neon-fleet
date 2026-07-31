// NEON FLEET Stage 1 — 개인정보 동의 저장(작업지시서 §9).
// 게임 저장(neonFleet.v1)과 완전히 분리된 키를 쓴다. save.reset()이 이 값을 지우지 않는다.
//  값: 'granted' | 'denied'. 키가 없거나 손상·저장 불능이면 'unknown'(= denied와 동일하게 전송 0).

export const CONSENT_KEY = 'neonFleet.analyticsConsent.v1';

function normalize(v) {
  return (v === 'granted' || v === 'denied') ? v : 'unknown';
}

/**
 * 동의 저장 래퍼. storage 주입식(테스트 가능), 실패 시 메모리 폴백.
 * @param {Storage} [storage] 기본 localStorage.
 */
export function createConsent(storage = (typeof globalThis !== 'undefined' ? globalThis.localStorage : undefined)) {
  let available = false;
  try {
    if (storage) { storage.getItem(CONSENT_KEY); available = true; }
  } catch {
    available = false;   // 시크릿 모드·차단 등
  }
  let memory = 'unknown';   // storage 불능 시 세션 내 폴백

  return {
    key: CONSENT_KEY,
    get available() { return available; },
    /** 'granted' | 'denied' | 'unknown'. 잘못된 저장값은 unknown으로 정규화. */
    get() {
      if (!available) return normalize(memory);
      // getItem이 도중에 실패하면 메모리 폴백으로 전환 — 같은 세션 이후 get()이 마지막 값을 유지한다.
      try { return normalize(storage.getItem(CONSENT_KEY)); } catch { available = false; return normalize(memory); }
    },
    /** 'granted'|'denied'만 저장. 그 외 값은 무시(현재 상태 유지). */
    set(value) {
      const next = (value === 'granted' || value === 'denied') ? value : null;
      if (!next) return this.get();
      memory = next;
      if (available) {
        // setItem 실패(쿼터·차단)면 메모리 폴백으로 전환해, 같은 세션 get()이 storage의 옛 값이 아니라 새 값을 읽게 한다.
        try { storage.setItem(CONSENT_KEY, next); } catch { available = false; }
      }
      return next;
    },
    isGranted() { return this.get() === 'granted'; },
    isDecided() { const v = this.get(); return v === 'granted' || v === 'denied'; },
  };
}
