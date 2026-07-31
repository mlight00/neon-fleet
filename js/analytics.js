// NEON FLEET Stage 1 — 벤더 독립 분석 코어.
// 역할: 이벤트 화이트리스트 + 속성 정제(PII·고카디널리티·잘못된 값 제거) + sink 전달 + 디버그 로그.
// 게임 코드는 이 코어의 emit/once만 호출한다. gtag·GA4를 직접 부르지 않는다(작업지시서 §15, §27).
//
// 성질(작업지시서 §8.1):
//  - 알 수 없는 이벤트 거부, 알 수 없는 속성 제거
//  - sink 오류가 게임으로 전파되지 않음(try/catch)
//  - 비활성 상태 완전 no-op
//  - `once` 중복 방지, 디버그 로그 상한
//  - 의존성 주입(schema·sink·context)으로 테스트 가능

import { PII_KEYS } from './analytics-config.js';

/** 속성 값 하나를 서술자 규칙으로 정제. 반환 undefined = 제거(전송 안 함). */
export function cleanValue(v, d) {
  if (v === null || v === undefined) return undefined;
  if (typeof v === 'object') return undefined;                 // 객체·배열 거부(고카디널리티 원시 스냅샷 차단)
  if (typeof v === 'function') return undefined;
  if (d.t === 'enum') return (typeof v === 'string' && d.enum.includes(v)) ? v : undefined;
  if (d.t === 'str') {
    if (typeof v !== 'string' || v === '') return undefined;
    if (v.length > (d.maxLen || 40)) return undefined;         // 길이 상한 초과 = 제거(자유 입력·PII 방어)
    return v;
  }
  if (d.t === 'int') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    let n = Math.round(v);
    if (d.min != null) n = Math.max(d.min, n);
    if (d.max != null) n = Math.min(d.max, n);
    return n;
  }
  if (d.t === 'num') {
    if (typeof v !== 'number' || !Number.isFinite(v)) return undefined;
    let n = v;
    if (d.min != null) n = Math.max(d.min, n);
    if (d.max != null) n = Math.min(d.max, n);
    return n;
  }
  return undefined;
}

/** 이벤트 속성 정제: 화이트리스트 밖 키·PII 키·잘못된 값 제거. 이벤트가 스키마에 없으면 null. */
export function sanitizeEvent(name, props, schema) {
  const def = schema.events[name];
  if (!def) return null;
  const spec = def.props;
  const out = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (PII_KEYS.has(k) || PII_KEYS.has(String(k).toLowerCase())) continue;   // PII 키는 화이트리스트여도 거부
    const d = spec[k];
    if (!d) continue;                                                          // 화이트리스트 밖 속성 제거
    const cleaned = cleanValue(v, d);
    if (cleaned === undefined) continue;                                       // 정제 실패값 제거(빈 문자열 미전송 포함)
    out[k] = cleaned;
  }
  return out;
}

/**
 * 분석 코어 생성.
 * @param {object} o
 * @param {object} o.schema  이벤트 계약({ events }). analytics-config.SCHEMA.
 * @param {function} [o.sink] (event)=>{ sent, reason? }. 전송 결과를 반환한다. 없으면 로컬 전용.
 * @param {function|boolean} [o.enabled] false면 완전 no-op.
 * @param {boolean} [o.debug] true면 디버그 로그 기록(최대 maxDebug).
 * @param {number} [o.maxDebug] 디버그 로그 상한(기본 500).
 * @param {function} [o.context] ()=>props. 이벤트마다 병합할 공통 속성(선택).
 */
export function createAnalytics({ schema, sink = null, enabled = true, debug = false, maxDebug = 500, context = null } = {}) {
  if (!schema || !schema.events) throw new Error('createAnalytics: schema required');
  let seq = 0;
  const debugLog = [];
  const onceKeys = new Set();
  const isOn = () => (typeof enabled === 'function' ? !!enabled() : !!enabled);

  function record(name, properties, outcome) {
    if (!debug) return;
    debugLog.push({ seq, name, properties, sent: !!outcome.sent, blocked_reason: outcome.reason || null });
    while (debugLog.length > maxDebug) debugLog.shift();   // 상한 유지(가장 오래된 것 제거)
  }

  function emit(name, props = {}) {
    if (!isOn()) return { sent: false, reason: 'disabled' };   // 완전 no-op(로그도 남기지 않음)
    if (!schema.events[name]) {
      record(name, {}, { sent: false, reason: 'unknown_event' });
      return { sent: false, reason: 'unknown_event' };
    }
    seq += 1;
    let merged = props;
    if (context) {
      try { merged = { ...(context() || {}), ...props }; } catch { merged = props; }
    }
    const clean = sanitizeEvent(name, merged, schema);
    let outcome = { sent: false, reason: 'no_sink' };
    if (sink) {
      try {
        const r = sink({ name, properties: clean, seq });
        outcome = (r && typeof r === 'object') ? r : { sent: false, reason: 'no_result' };
      } catch {
        outcome = { sent: false, reason: 'sink_error' };   // sink 예외는 게임으로 전파하지 않음
      }
    }
    record(name, clean, outcome);
    return outcome;
  }

  function once(name, key, props = {}) {
    const k = `${name}::${key}`;
    if (onceKeys.has(k)) return { sent: false, reason: 'duplicate' };
    onceKeys.add(k);
    return emit(name, props);
  }

  return {
    emit,
    once,
    isEnabled: isOn,
    getDebugLog() { return debugLog.map((e) => ({ ...e, properties: { ...e.properties } })); },
    debugCount() { return debugLog.length; },
    clearDebug() { debugLog.length = 0; },
  };
}

/**
 * 디버그 전역(window.__NFAnalytics) 설치 — 디버그 쿼리일 때만(작업지시서 §8.3).
 * 읽기 전용 스냅샷만 노출한다. GA client ID·쿠키·전체 URL은 담지 않는다.
 * @returns {boolean} 설치했으면 true.
 */
export function installDebugGlobal(analytics, { enabled, globalObj = globalThis } = {}) {
  if (!enabled || !globalObj) return false;
  try {
    Object.defineProperty(globalObj, '__NFAnalytics', {
      configurable: true,
      enumerable: false,
      get() { return { log: analytics.getDebugLog(), count: analytics.debugCount() }; },
    });
    return true;
  } catch {
    return false;
  }
}
