// 밸런스 튜너 오버라이드 층 (이사 요청: 플레이하면서 미세 조정).
//
// 원본 balance.js / sprites.js는 손대지 않고, 브라우저 저장소에 담긴 '덮어쓰기 표'만 위에 얹는다.
// 초기화하면 언제든 원본으로 돌아온다.
//
// 왜 이게 되는가: 게임 코드가 BAL.a.b 를 '읽을 때마다' 참조하기 때문에(미리 복사해두지 않음)
// 객체 속성만 바꿔도 다음 스폰·다음 발사부터 새 값이 먹는다.
//
// 튜너 페이지와 게임은 같은 출처라 저장소를 공유한다 → storage 이벤트로 새로고침 없이 즉시 반영.

export const TUNING_KEY = 'neonFleet.tuning.v1';

/** 저장 형식: { v:1, bal:{ '경로': 값 }, sprite:{ 'A1': 34 } } — 평평한 경로 맵이라 병합·비교가 쉽다. */
export function emptyPatch() {
  return { v: 1, bal: {}, sprite: {} };
}

/** 중첩 객체를 '경로 → 값' 평면 맵으로. 숫자와 숫자배열만 대상(문자·색상은 조정 대상 아님). */
export function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj || {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (Array.isArray(v)) {
      if (v.every((n) => typeof n === 'number')) out[path] = v.slice();
    } else if (v && typeof v === 'object') {
      flatten(v, path, out);
    } else if (typeof v === 'number') {
      out[path] = v;
    }
  }
  return out;
}

/** 경로로 값 읽기. 없으면 undefined. */
export function getPath(obj, path) {
  let cur = obj;
  for (const key of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
}

/**
 * 경로에 값 쓰기 — **이미 존재하는 경로만**. 오타로 새 키를 만들어 조용히 무시되는 걸 막는다.
 * 반환: 실제로 바뀌었으면 true.
 */
export function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (cur == null || typeof cur !== 'object' || !(keys[i] in cur)) return false;
    cur = cur[keys[i]];
  }
  const last = keys[keys.length - 1];
  if (cur == null || typeof cur !== 'object' || !(last in cur)) return false;
  const before = cur[last];
  if (Array.isArray(before)) {
    if (!Array.isArray(value)) return false;
    cur[last] = value.slice();
  } else {
    if (typeof value !== 'number' || !Number.isFinite(value)) return false;
    cur[last] = value;
  }
  return true;
}

/** 평면 패치를 대상 객체에 적용. 반환: { applied, skipped } — skipped는 존재하지 않는 경로(구버전 패치 등). */
export function applyFlat(target, flat) {
  let applied = 0; const skipped = [];
  for (const [path, value] of Object.entries(flat || {})) {
    if (setPath(target, path, value)) applied++;
    else skipped.push(path);
  }
  return { applied, skipped };
}

/** 원본 대비 실제로 달라진 항목만 남긴다 — 저장 크기를 줄이고, 기본값 변경 시 자동으로 따라가게. */
export function pruneToChanged(flat, baseline) {
  const out = {};
  for (const [path, value] of Object.entries(flat || {})) {
    const base = getPath(baseline, path);
    if (base === undefined) continue;
    if (Array.isArray(base)) {
      if (!Array.isArray(value) || base.length !== value.length || base.some((n, i) => n !== value[i])) out[path] = value.slice();
    } else if (base !== value) {
      out[path] = value;
    }
  }
  return out;
}

// ───────────────────────── 저장소 (브라우저가 없는 환경에서도 안전)
function store() {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

export function loadPatch() {
  const s = store();
  if (!s) return emptyPatch();
  try {
    const raw = s.getItem(TUNING_KEY);
    if (!raw) return emptyPatch();
    const p = JSON.parse(raw);
    return { v: 1, bal: p.bal || {}, sprite: p.sprite || {} };
  } catch { return emptyPatch(); }
}

export function savePatch(patch) {
  const s = store();
  if (!s) return false;
  try { s.setItem(TUNING_KEY, JSON.stringify({ v: 1, bal: patch.bal || {}, sprite: patch.sprite || {} })); return true; }
  catch { return false; }
}

export function clearPatch() {
  const s = store();
  if (s) { try { s.removeItem(TUNING_KEY); } catch { /* 무시 */ } }
}

/** 다른 탭(튜너)에서 저장하면 호출된다 → 게임이 새로고침 없이 반영. 해제 함수를 돌려준다. */
export function subscribePatch(onChange) {
  if (typeof window === 'undefined') return () => {};
  const h = (e) => { if (e.key === TUNING_KEY) onChange(loadPatch()); };
  window.addEventListener('storage', h);
  return () => window.removeEventListener('storage', h);
}
