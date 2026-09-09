// rush3/save.js — rush/save.js 복제(계약서 7장). 단일 키 localStorage, storage 주입으로 Node 테스트 가능.
//  starforgeRush.v1 은 읽지도 쓰지도 않는다. 손상 원문은 .bak 에 보존 후 기본값.
export const KEY3 = 'starforgeRush.v3';
export const BAK3 = 'starforgeRush.v3.bak';
const STAGE_DEFAULTS = Object.freeze({ cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 });

const isPlainObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const num = (v, d) => (Number.isFinite(v) ? v : d);

//  스테이지 한 칸 정규화: 숫자 필드는 Number.isFinite 강제, cleared 는 boolean
function normStage(s) {
  const src = isPlainObject(s) ? s : {};
  return {
    cleared: src.cleared === true,
    attempts: num(src.attempts, 0),
    bestSurvivors: num(src.bestSurvivors, 0),
    bestTime: num(src.bestTime, 0),
  };
}
function defaults() { return { v: 3, stages: {}, lastStage: null, volume: 1, mute: false }; }
//  전체 정규화(형식이 맞는 원문에만 적용)
function normalize(d) {
  const out = defaults();
  for (const [id, st] of Object.entries(d.stages)) out.stages[id] = normStage(st);
  out.lastStage = typeof d.lastStage === 'string' || Number.isFinite(d.lastStage) ? d.lastStage : null;
  out.volume = Math.max(0, Math.min(1, num(d.volume, 1)));
  out.mute = d.mute === true;
  return out;
}

export function createSave3(storage) {
  let store = storage ?? null;
  //  storage 미주입이면 localStorage 시도(접근 자체가 throw 할 수 있다)
  if (!store) { try { store = globalThis.localStorage ?? null; if (store) store.getItem(KEY3); } catch { store = null; } }
  const mem = new Map();
  let ok = true;
  const safeGet = (k) => { try { return store ? store.getItem(k) : (mem.get(k) ?? null); } catch { ok = false; return null; } };
  const safeSet = (k, v) => {
    try { if (store) { store.setItem(k, v); return true; } mem.set(k, v); return true; }
    catch { mem.set(k, v); ok = false; return false; }
  };

  //  load: 파싱 실패·버전 불일치·stages 비객체 → 원문 .bak 보존 후 기본값
  let data;
  {
    const raw = safeGet(KEY3);
    let parsed = null, bad = false;
    if (raw !== null && raw !== undefined) {
      try { parsed = JSON.parse(raw); } catch { bad = true; }
      if (!bad && !(isPlainObject(parsed) && parsed.v === 3 && isPlainObject(parsed.stages))) bad = true;
      if (bad) safeSet(BAK3, String(raw));
    }
    data = bad || parsed === null ? defaults() : normalize(parsed);
  }

  const write = () => {
    let raw;
    try { raw = JSON.stringify(data); } catch { ok = false; return false; }
    return safeSet(KEY3, raw);
  };

  return {
    get: () => data,
    getStage: (id) => ({ ...STAGE_DEFAULTS, ...(data.stages[String(id)] ?? {}) }),
    //  깊은 병합: 해당 스테이지만 갱신, 다른 스테이지 기록은 그대로
    updateStage: (id, patch) => {
      const k = String(id);
      const cur = data.stages[k] ?? { ...STAGE_DEFAULTS };
      data = { ...data, stages: { ...data.stages, [k]: normStage({ ...cur, ...(isPlainObject(patch) ? patch : {}) }) } };
      write();
      return data.stages[k];
    },
    //  최상위 병합(stages 는 깊게 병합). v 는 항상 3 유지
    patch: (obj) => {
      const p = isPlainObject(obj) ? obj : {};
      const stages = isPlainObject(p.stages)
        ? Object.fromEntries(Object.entries({ ...data.stages, ...p.stages }).map(([k, s]) => [k, normStage({ ...(data.stages[k] ?? {}), ...(isPlainObject(s) ? s : {}) })]))
        : data.stages;
      data = normalize({ ...data, ...p, stages });
      write();
      return data;
    },
    get ok() { return ok; },
  };
}
