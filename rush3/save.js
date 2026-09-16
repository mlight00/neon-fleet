// rush3/save.js — rush/save.js 복제(계약서 7장). 단일 키 localStorage, storage 주입으로 Node 테스트 가능.
//  starforgeRush.v1 은 읽지도 쓰지도 않는다. 손상 원문은 .bak 에 보존 후 기본값.
//  스테이지 기록은 stageId + stageVersion + 난이도로 묶는다: stages[id].versions[key] = { cleared, attempts, bestSurvivors, bestTime }.
//   key = `${version}`(보통 normal — 접미 없음, 옛 기록 그대로) | `${version}:${difficulty}`(어려움·극한). 계약서 7장·3-8.
//  코스 배치를 고치면(stages.js 의 version 상향) 새 버전 칸에 따로 쌓이므로 옛 기록과 섞이지 않는다. 난이도도 같은 원리로 칸이 갈린다.
//  구 저장(stages[id] 에 기록이 바로 있던 형식)은 지우지 않고 버전 1 로 귀속시킨다(마이그레이션).
export const KEY3 = 'starforgeRush.v3';
export const BAK3 = 'starforgeRush.v3.bak';
//  접미를 붙이지 않는 기본 난이도(BAL3.difficulty 의 normal). save 는 balance 를 import 하지 않는다(순수 I/O 모듈 유지)
export const BASE_DIFFICULTY = 'normal';
const STAGE_DEFAULTS = Object.freeze({ cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 });
const REC_KEYS = ['cleared', 'attempts', 'bestSurvivors', 'bestTime'];

const isPlainObject = (o) => o !== null && typeof o === 'object' && !Array.isArray(o);
const num = (v, d) => (Number.isFinite(v) ? v : d);
//  버전 번호: 1 이상의 정수만. 그 밖(문자열·0·소수·NaN)은 1 로 본다.
const verNum = (v) => { const n = Math.trunc(Number(v)); return Number.isFinite(n) && n >= 1 ? n : 1; };
//  정규 칸 키 = 버전(1 이상 정수) + 선택적 ':난이도'(소문자 식별자). ':normal' 은 정규지만 접미 없는 칸과 같다
const KEY_RE = /^([1-9][0-9]*)(?::([a-z][a-z0-9_-]*))?$/;
//  기록 칸 키 조립. difficulty 생략·null·'normal' = 접미 없음(옛 기록 칸 그대로)
export function recordKey(version, difficulty) {
  const v = String(verNum(version ?? 1));
  return !difficulty || difficulty === BASE_DIFFICULTY ? v : v + ':' + String(difficulty);
}
//  원문 키가 정규 칸 키('1','2','2:hard',…)이면 그 정규형, 아니면 null — 정규 키를 먼저 채우기 위한 판정
const canonKey = (v) => { const m = typeof v === 'string' ? KEY_RE.exec(v) : null; return m ? recordKey(m[1], m[2]) : null; };
//  잡키(정규가 아닌 것)는 1 로 본다. 단, 이렇게 1 로 본 잡키가 실재하는 버전 1 기록을 덮으면 안 된다(rawVersions 참조)
const verKey = (v) => canonKey(String(v)) ?? String(verNum(v));
const hasRecFields = (o) => REC_KEYS.some((k) => k in o);

//  기록 한 칸 정규화: 숫자 필드는 Number.isFinite 강제, cleared 는 boolean
function normRec(s) {
  const src = isPlainObject(s) ? s : {};
  return {
    cleared: src.cleared === true,
    attempts: num(src.attempts, 0),
    bestSurvivors: num(src.bestSurvivors, 0),
    bestTime: num(src.bestTime, 0),
  };
}

//  스테이지 한 칸의 원문을 { 버전키: 원문기록 } 으로 편다(정규화 전 — 부분 갱신 조각도 그대로 둔다).
//   - versions 가 있으면 그것. 그 안에 1 이 없는데 옛 필드가 남아 있으면 그 옛 필드를 버전 1 로 귀속.
//   - versions 가 없으면 통째로 버전 1(구 저장 마이그레이션).
//   - 의미 있는 필드가 하나도 없으면 빈 객체(없는 스테이지에 빈 기록을 만들지 않는다).
//  귀속 우선순위(먼저 채운 칸은 덮지 않는다 — 실재 기록의 무음 손실 방지):
//   정규 버전 키 > 구 저장의 옛 필드 > 정규가 아닌 잡키(1 로 봄)
function rawVersions(s) {
  if (!isPlainObject(s)) return {};
  if (isPlainObject(s.versions)) {
    const out = {};
    const junk = [];
    //  1차: 정규 칸 키('1'·'2:hard'…)만 자기 자리에 채운다. 비객체·빈 객체는 '빈 칸'으로 본다(찬 칸으로 오인해 옛 기록 귀속을 막지 않게).
    //   ':normal' 접미 키는 접미 없는 칸으로 정규화되며 먼저 찬 칸을 덮지 않는다
    for (const [v, rec] of Object.entries(s.versions)) {
      const val = isPlainObject(rec) && hasRecFields(rec) ? rec : null;
      if (!val) continue;
      const ck = canonKey(v);
      if (ck) { if (!(ck in out)) out[ck] = val; } else junk.push([verKey(v), val]);
    }
    //  2차: 구 저장의 옛 필드는 1 칸이 비어 있을 때만 버전 1 로 귀속
    if (!('1' in out) && hasRecFields(s)) out['1'] = s;
    //  3차: 잡키는 1 로 보되 이미 찬 칸은 절대 덮지 않는다(빈 칸에만 들어간다)
    for (const [k, val] of junk) if (!(k in out)) out[k] = val;
    return out;
  }
  return hasRecFields(s) ? { '1': s } : {};
}

//  스테이지 한 칸 정규화(버전별)
function normStage(s) {
  const versions = {};
  for (const [k, rec] of Object.entries(rawVersions(s))) versions[k] = normRec(rec);
  return { versions };
}

//  현재 칸 + 갱신 조각을 버전별로 병합(조각은 원문 상태로 얹은 뒤 정규화 — 빠진 필드가 0 으로 지워지지 않게)
function mergeStage(cur, inc) {
  const a = rawVersions(cur), b = rawVersions(inc);
  const versions = {};
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) versions[k] = normRec({ ...(a[k] ?? {}), ...(b[k] ?? {}) });
  return { versions };
}

function defaults() { return { v: 3, stages: {}, lastStage: null, difficulty: BASE_DIFFICULTY, volume: 1, mute: false }; }
//  전체 정규화(형식이 맞는 원문에만 적용)
function normalize(d) {
  const out = defaults();
  for (const [id, st] of Object.entries(d.stages)) out.stages[id] = normStage(st);
  out.lastStage = typeof d.lastStage === 'string' || Number.isFinite(d.lastStage) ? d.lastStage : null;
  //  마지막으로 고른 난이도(형식만 검사 — 실제 id 판정은 셸이 DIFFICULTY_IDS 로 한다)
  out.difficulty = typeof d.difficulty === 'string' && d.difficulty ? d.difficulty : BASE_DIFFICULTY;
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
    //  한 코스 버전·난이도의 기록(기본 버전 1·normal). 없는 스테이지·버전·난이도는 기본값
    getStage: (id, version, difficulty) => ({ ...STAGE_DEFAULTS, ...(data.stages[String(id)]?.versions?.[recordKey(version, difficulty)] ?? {}) }),
    //  그 스테이지의 모든 칸 기록 사본 { '1': {...}, '2': {...}, '2:hard': {...} } — 옛 기록 보관 확인용·첫 플레이 판정용
    getStageVersions: (id) => {
      const v = data.stages[String(id)]?.versions ?? {};
      return Object.fromEntries(Object.entries(v).map(([k, r]) => [k, { ...STAGE_DEFAULTS, ...r }]));
    },
    //  깊은 병합: 해당 스테이지의 해당 버전·난이도 칸만 갱신, 다른 칸·다른 스테이지 기록은 그대로
    updateStage: (id, patch, version, difficulty) => {
      const k = String(id), vk = recordKey(version, difficulty);
      const merged = mergeStage(data.stages[k], { versions: { [vk]: isPlainObject(patch) ? patch : {} } });
      data = { ...data, stages: { ...data.stages, [k]: merged } };
      write();
      return merged.versions[vk];
    },
    //  최상위 병합(stages 는 버전별로 깊게 병합). v 는 항상 3 유지
    //  stages 조각이 버전 없이 오면(구 형식) 버전 1 갱신으로 본다
    patch: (obj) => {
      const p = isPlainObject(obj) ? obj : {};
      const stages = isPlainObject(p.stages)
        ? Object.fromEntries(Object.entries({ ...data.stages, ...p.stages }).map(([k, s]) => [k, mergeStage(data.stages[k], s)]))
        : data.stages;
      data = normalize({ ...data, ...p, stages });
      write();
      return data;
    },
    get ok() { return ok; },
  };
}
