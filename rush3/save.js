// rush3/save.js — rush/save.js 복제(계약서 7장). 단일 키 localStorage, storage 주입으로 Node 테스트 가능.
//  starforgeRush.v1 은 읽지도 쓰지도 않는다. 손상 원문은 .bak 에 보존 후 기본값.
//  최상위 필드: lastStage · difficulty(r4.2 부터 읽지 않는 칸 — 아래 PICK_DEFAULT) · volume · mute · seenShutter(첫 셔터 안내를 봤는가) · seenVehicle(첫 차량 안내를 봤는가, r3.13).
//  스테이지 기록은 stageId + stageVersion + 난이도로 묶는다: stages[id].versions[key] = { cleared, attempts, bestSurvivors, bestTime, rescued?: true, bestBonus?: 수, survUp?: 스냅샷, timeUp?: 스냅샷 }.
//   key = `${version}`(보통 normal — 접미 없음, 옛 기록 그대로) | `${version}:${difficulty}`(어려움·지옥). 계약서 7장·3-8.
//   r4.2(난이도 선택 삭제): 게임 화면은 늘 `${version}:brutal` 칸에 쓴다(종전 새 사용자 기본 선택 = 지옥이라 같은 칸). 옛 보통·어려움 칸('2', '2:hard')은 지우지 않고 보존만 한다.
//   r4.4(v4 기록 칸, 이사님 결정 D9′): 게임 화면은 이제 `${version}:v4` 칸에 쓴다(KEY_RE 가 이미 받는 접미 — 이 파일의 키 규칙은 그대로). 옛 `:brutal` 칸도 지우지 않는다.
//    기록 칸에 희소 필드 survUp·timeUp(최다 생존·최단 시간 기록 때의 강화 스냅샷 { power, rate, multi, rule })이 더해졌다.
//  코스 배치를 고치면(stages.js 의 version 상향) 새 버전 칸에 따로 쌓이므로 옛 기록과 섞이지 않는다. 난이도도 같은 원리로 칸이 갈린다.
//  구 저장(stages[id] 에 기록이 바로 있던 형식)은 지우지 않고 버전 1 로 귀속시킨다(마이그레이션).
//  r4.3(v4 ③단계): 코인 지갑은 **별도 키** WALLET_KEY(아래 '지갑'), 복수 탭 확인 표식은 TAB_KEY. v3 키의 형식(v: 3·defaults·normalize)은 그대로다.
//   읽기 전용(setReadOnly — 먼저 열린 탭이 살아 있을 때)이면 v3 키·지갑 키 모두 쓰지 않는다.
export const KEY3 = 'starforgeRush.v3';
export const BAK3 = 'starforgeRush.v3.bak';
//  접미를 붙이지 않는 기본 난이도(BAL3.difficulty 의 normal). save 는 balance 를 import 하지 않는다(순수 I/O 모듈 유지)
export const BASE_DIFFICULTY = 'normal';
const STAGE_DEFAULTS = Object.freeze({ cleared: false, attempts: 0, bestSurvivors: 0, bestTime: 0 });
//  rescued(r3.14 구출 캡슐) = 희소(sparse) 필드: **true 일 때만 존재·직렬화**하고 false 는 절대 쓰지 않는다. 기본값 4필드는 그대로라
//   구출 전 getStage() 에는 키 자체가 없다(읽는 쪽은 === true 로 판정 = 없던 필드는 false). 옛 저장·다른 칸과 완전 호환
//  bestBonus(r3.15 보너스전) = 희소 필드: **유한수일 때만** 존재·직렬화(보너스가 없는 스테이지·옛 기록엔 키가 없다). 병합은 max(신기록만 남는다)
//  survUp · timeUp(r4.4 v4 기록 칸, 이사님 결정 D9′, 기획 v4.1 3-6) = 희소 필드: 최다 생존 기록·최단 시간 기록을 **세웠을 때의** 강화 단계 스냅샷
//   { power, rate, multi, rule }(rule = 규칙 버전 'v4'). 각 스냅샷은 **자기 기록과 함께만** 바뀐다(mergeStage) — 하나의 '강화 합계'만 두면 다른 판에서 세운 기록에 잘못 붙는다
const REC_KEYS = ['cleared', 'attempts', 'bestSurvivors', 'bestTime', 'rescued', 'bestBonus', 'survUp', 'timeUp'];
//  스냅샷 강화 단계 상한(트랙별 최대 단계)
const UP_LIMIT = Object.freeze({ power: 5, rate: 5, multi: 3 });
const RULE_RE = /^[a-z0-9][a-z0-9_-]{0,15}$/;
/** 강화 스냅샷 정규화: 객체가 아니면 null(버림). 각 트랙 = 정수(버림) 0~상한, 숫자가 아니면 0. rule = 짧은 소문자 식별자, 아니면 'v4' */
function normSnap(s) {
  if (!isPlainObject(s)) return null;
  const lv = (v, max) => (Number.isFinite(v) ? Math.max(0, Math.min(max, Math.trunc(v))) : 0);
  return { power: lv(s.power, UP_LIMIT.power), rate: lv(s.rate, UP_LIMIT.rate), multi: lv(s.multi, UP_LIMIT.multi),
           rule: typeof s.rule === 'string' && RULE_RE.test(s.rule) ? s.rule : 'v4' };
}

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
  const out = {
    cleared: src.cleared === true,
    attempts: num(src.attempts, 0),
    bestSurvivors: num(src.bestSurvivors, 0),
    bestTime: num(src.bestTime, 0),
  };
  if (src.rescued === true) out.rescued = true;
  if (Number.isFinite(src.bestBonus)) out.bestBonus = src.bestBonus;
  //  r4.4 강화 스냅샷(희소): 객체일 때만 존재·직렬화(옛 기록·스냅샷 없는 칸엔 키가 없다)
  const su = normSnap(src.survUp), tu = normSnap(src.timeUp);
  if (su) out.survUp = su;
  if (tu) out.timeUp = tu;
  return out;
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
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const ra = a[k] ?? {}, rb = b[k] ?? {};
    const rec = normRec({ ...ra, ...rb });
    //  희소 단조 필드 rescued: OR 병합 — 한 번 true 면 어느 조각이 false·비불리언을 보내도 유지된다(구출 기록은 되돌리지 않는다)
    if (ra.rescued === true || rb.rescued === true) rec.rescued = true;
    //  희소 신기록 필드 bestBonus: max 병합 — 낮은 점수 조각이 높은 기록을 덮지 않는다(유한수만 본다)
    const bb = [ra.bestBonus, rb.bestBonus].filter(Number.isFinite);
    if (bb.length) rec.bestBonus = Math.max(...bb);
    //  r4.4 강화 스냅샷: **자기 기록과 함께만** 바뀐다. 조각의 스냅샷은 그 조각이 기록을 실제로 좋게 만들 때만 받는다 —
    //   survUp = 조각의 bestSurvivors 가 지금보다 클 때, timeUp = 조각의 bestTime(> 0)이 지금 기록이 없거나 더 짧을 때.
    //   그 밖의 조각(신기록 아님·기록 없이 스냅샷만·더 나쁜 기록)은 스냅샷을 바꾸지 못하고 지금 스냅샷이 남는다.
    //   기록이 좋아졌는데 스냅샷이 없는 조각(옛 형식)이면 옛 스냅샷은 그 기록의 것이 아니므로 지운다
    const survBetter = Number.isFinite(rb.bestSurvivors) && rb.bestSurvivors > num(ra.bestSurvivors, 0);
    const timeBetter = Number.isFinite(rb.bestTime) && rb.bestTime > 0 && !(num(ra.bestTime, 0) > 0 && rb.bestTime >= ra.bestTime);
    for (const [key, better] of [['survUp', survBetter], ['timeUp', timeBetter]]) {
      const snap = normSnap(better ? rb[key] : ra[key]);
      if (snap) rec[key] = snap; else delete rec[key];
    }
    versions[k] = rec;
  }
  return { versions };
}

//  difficulty = 종전 '타이틀에서 마지막으로 고른 난이도' 자리(초기 선택 = 지옥 brutal, 2026-09-16 이사 결정).
//   r4.2(2026-09-25)에서 난이도 선택이 사라져 **읽지 않는다** — normalize 가 옛 값('normal'·'hard' 등)을 옮기지 않아 늘 'brutal'(= 셸의 출격 줄과 같은 값).
//   칸은 형식 호환용으로만 남긴다(v: 3 유지) — zoom(r4.1)과 같은 처리. 기록 접미 규칙의 기준(BASE_DIFFICULTY=normal)과는 다른 값이다
const PICK_DEFAULT = 'brutal';
//  seenShutter = 첫 셔터 조우 배너를 이미 본 적이 있는가(계약서 6장 N2-⑥). 판이 아니라 **사용자당 1회**라 저장에 남는다
//  seenVehicle(r3.13) = 첫 차량 통 조우 배너를 본 적이 있는가 — seenShutter 와 같은 꼴(사용자당 1회). 스키마 v 는 3 그대로(빠진 키는 기본값)
//  zoom = 종전 '가까이' 토글 자리. r4.1(2026-09-25)에서 보기가 '가까이' 하나로 고정돼 **읽지 않는다**(normalize 가 옛 값을 옮기지 않아 늘 false).
//   칸은 형식 호환용으로만 남긴다 — 옛 저장에 true 가 있어도 해가 없다
function defaults() { return { v: 3, stages: {}, lastStage: null, difficulty: PICK_DEFAULT, volume: 1, mute: false, seenShutter: false, seenVehicle: false, zoom: false }; }
//  전체 정규화(형식이 맞는 원문에만 적용)
function normalize(d) {
  const out = defaults();
  for (const [id, st] of Object.entries(d.stages)) out.stages[id] = normStage(st);
  out.lastStage = typeof d.lastStage === 'string' || Number.isFinite(d.lastStage) ? d.lastStage : null;
  //  r4.2: difficulty 는 옮기지 않는다(defaults 의 PICK_DEFAULT 그대로) — 옛 저장의 마지막 선택이 무엇이든 읽지 않는다
  out.volume = Math.max(0, Math.min(1, num(d.volume, 1)));
  out.mute = d.mute === true;
  out.seenShutter = d.seenShutter === true;
  out.seenVehicle = d.seenVehicle === true;
  return out;
}

// ── 지갑(r4.3, 기획 v4.1 3-6·3-7) ─────────────────────────────────────────────────────────────────────────────
//  **별도 키**(WALLET_KEY)에 둔다 — 옛 코드가 도는 탭(또는 옛 캐시)이 v3 키를 통째로 다시 써도 지갑이 지워지지 않게(옛 코드는 이 키를 모른다).
//  wallet = { coins, runNo, paid, firstClears }
//   coins       = 보유 코인(0 이상 정수, 상한 COIN_MAX)
//   runNo       = 출격 번호(출격 때 1 오른다 — 지급 식별자의 앞부분)
//   paid        = 이미 지급한 식별자 `${runNo}:main` · `${runNo}:bonus`(최근 PAID_KEEP 개만). 같은 식별자는 다시 지급하지 않는다
//   firstClears = v4 첫 클리어 보너스를 받은 판 번호(정수, 오름차순 중복 없음). 옛 지옥 칸에서 이미 깬 판도 v4 첫 클리어는 한 번 받는다(D9′)
//  v3 키 형식(v: 3)은 그대로다 — 지갑 칸은 v3 키에 넣지 않는다(defaults·normalize 무변경)
export const WALLET_KEY = 'starforgeRush.v3.wallet';
export const COIN_MAX = 999999;
export const PAID_KEEP = 20;
const PAID_RE = /^[0-9]+:(main|bonus)$/;
export function walletDefaults() { return { coins: 0, runNo: 0, paid: [], firstClears: [] }; }
/** 지갑 정규화(타입 강제): coins 0~COIN_MAX 정수 · runNo 0 이상 정수 · paid 식별자 문자열(최근 PAID_KEEP 개) · firstClears 1 이상 정수(오름차순, 중복 제거) */
export function normWallet(w) {
  const src = isPlainObject(w) ? w : {};
  const int = (v) => (Number.isFinite(v) ? Math.trunc(v) : 0);
  const paid = [];
  for (const p of Array.isArray(src.paid) ? src.paid : []) if (typeof p === 'string' && PAID_RE.test(p) && !paid.includes(p)) paid.push(p);
  const fc = new Set();
  for (const s of Array.isArray(src.firstClears) ? src.firstClears : []) if (Number.isInteger(s) && s >= 1) fc.add(s);
  return {
    coins: Math.max(0, Math.min(COIN_MAX, int(src.coins))),
    runNo: Math.max(0, int(src.runNo)),
    paid: paid.slice(-PAID_KEEP),
    firstClears: [...fc].sort((a, b) => a - b),
  };
}
//  합집합(순서 유지: a 먼저, 그다음 b 에만 있는 것)
const unionList = (a, b) => { const out = [...a]; for (const x of b) if (!out.includes(x)) out.push(x); return out; };

// ── 복수 탭(r4.3, 기획 v4.1 3-7 ⑥) ──────────────────────────────────────────────────────────────────────────────
//  불러올 때 TAB_KEY 에 탭 표식 { id, t } 를 남기고 BroadcastChannel(TAB_CHANNEL)로 서로 확인한다.
//  id = Date.now() 와 performance.now() 로 만든다(난수 아님). **먼저 열린 탭**(t 가 작은 쪽, 같으면 id 사전순)이 살아 있으면 나중 탭은 읽기 전용.
//   나중 탭: 'hello' 를 보낸다 → 쓰기 가능한 탭은 'alive' 로 답한다 → 답한 탭이 더 먼저 열렸으면 나중 탭은 읽기 전용이 된다.
//   읽기 전용 탭은 답하지 않는다(더 먼저 열린 쓰기 탭이 이미 있어서 읽기 전용이 된 것이므로). 채널이 없는 환경은 확인 없이 쓰기 가능.
export const TAB_KEY = 'starforgeRush.v3.tab';
export const TAB_CHANNEL = 'starforgeRush';

export function createSave3(storage) {
  let store = storage ?? null;
  //  storage 미주입이면 localStorage 시도(접근 자체가 throw 할 수 있다)
  if (!store) { try { store = globalThis.localStorage ?? null; if (store) store.getItem(KEY3); } catch { store = null; } }
  //  persistent(r4.3) = 실제 저장소가 있는가. localStorage 가 막힌 환경(store null)은 메모리에만 쓰므로 새로고침하면 사라진다 —
  //   종전 ok 는 이 환경에서 true 로 남았다(쓰기 예외가 없으므로). 코인 경고는 이 값과 ok 를 함께 본다
  const persistent = !!store;
  const mem = new Map();
  let ok = true;
  //  읽기 전용(r4.3 복수 탭): 켜지면 v3 키·지갑 키 모두 쓰지 않는다(메모리 사본만 갱신). 탭 확인(claimTab)이 켠다
  let readOnly = false;
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
    if (readOnly) return false;
    let raw;
    try { raw = JSON.stringify(data); } catch { ok = false; return false; }
    return safeSet(KEY3, raw);
  };

  //  지갑 원문 읽기: 없으면 기본값, 읽기 예외·해석 실패면 null(부르는 쪽이 정한다)
  const readWallet = () => {
    let raw;
    try { raw = store ? store.getItem(WALLET_KEY) : (mem.get(WALLET_KEY) ?? null); } catch { return null; }
    if (raw === null || raw === undefined) return walletDefaults();
    try { return normWallet(JSON.parse(raw)); } catch { return null; }
  };
  //  불러오기 실패·손상 → 기본값(원문은 두지 않는다 — v3 키의 .bak 과 달리 복구할 기록이 아니라 잔액이다)
  let wallet = readWallet() ?? walletDefaults();
  //  walletOk = 마지막 지갑 쓰기가 저장소에 닿았는가. false 인 동안은 메모리가 저장소보다 앞서 있다(다음 지급의 기준을 메모리로 잡는다)
  let walletOk = true;
  //  쓰기 직전 다시 읽어 합친다(3-7 ⑥): paid·firstClears 는 합집합, runNo 는 큰 쪽, coins 는 **다시 읽은 값**(재계산하지 않음).
  //   단 앞선 쓰기가 실패해 메모리가 앞서 있으면 메모리 값을 기준으로 둔다(실패한 지급이 다음 지급에서 되돌아가 잔액이 줄어 보이지 않게)
  const fresh = () => {
    //  다시 읽기에 실패하면(예외·손상) 메모리 사본이 기준
    const w = readOnly ? wallet : (readWallet() ?? wallet);
    return {
      coins: walletOk ? w.coins : wallet.coins,
      runNo: Math.max(w.runNo, wallet.runNo),
      paid: unionList(w.paid, wallet.paid).slice(-PAID_KEEP),
      firstClears: [...new Set([...w.firstClears, ...wallet.firstClears])].sort((a, b) => a - b),
    };
  };
  const writeWallet = (w) => {
    wallet = normWallet(w);
    if (readOnly) return false;
    let raw;
    try { raw = JSON.stringify(wallet); } catch { walletOk = false; return false; }
    walletOk = safeSet(WALLET_KEY, raw);
    return walletOk;
  };
  const walletApi = {
    /** 메모리 사본(읽기만) */
    get: () => ({ ...wallet, paid: [...wallet.paid], firstClears: [...wallet.firstClears] }),
    /** 저장소를 다시 읽어 합친 값(쓰지 않는다) — 첫 클리어 판정처럼 지급 직전 최신 값이 필요할 때 */
    peek: () => fresh(),
    /** 출격: runNo 를 1 올려 한 번 쓰고 새 번호를 돌려준다(지급 식별자의 앞부분) */
    startRun: () => {
      const w = fresh();
      w.runNo += 1;
      writeWallet(w);
      return wallet.runNo;
    },
    /** 지급: 식별자 id 가 이미 paid 에 있으면 아무것도 하지 않는다. 아니면 coins = 다시 읽은 값 + amount(상한), paid 에 id, firstClear(판 번호)가
     *  있으면 첫 클리어 표식에 더해 **한 번에** 쓴다(잔액·식별자·표식이 갈라지지 않게 setItem 1회). → { paid, coins, saved } */
    pay: ({ id, amount = 0, firstClear = null } = {}) => {
      const w = fresh();
      if (typeof id !== 'string' || !PAID_RE.test(id)) return { paid: false, coins: w.coins, saved: false };
      if (w.paid.includes(id)) { wallet = normWallet(w); return { paid: false, coins: wallet.coins, saved: false }; }
      w.coins = Math.max(0, Math.min(COIN_MAX, w.coins + Math.max(0, Math.trunc(amount) || 0)));
      w.paid = [...w.paid, id].slice(-PAID_KEEP);
      if (Number.isInteger(firstClear) && firstClear >= 1 && !w.firstClears.includes(firstClear)) w.firstClears = [...w.firstClears, firstClear];
      const saved = writeWallet(w);
      return { paid: true, coins: wallet.coins, saved };
    },
    /** 코인이 저장소에 남는가(쓰기 실패·차단 환경·읽기 전용이면 false) — 결과·타이틀 경고 */
    get ok() { return persistent && walletOk && !readOnly; },
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
    //  r4.3: 실제 저장소가 있는가(localStorage 차단 환경 = false) · 지갑 · 읽기 전용
    get persistent() { return persistent; },
    wallet: walletApi,
    get readOnly() { return readOnly; },
    setReadOnly: (v) => { readOnly = !!v; },
    /** 탭 확인 시작(r4.3 복수 탭). BC = BroadcastChannel 생성자(없으면 확인 없이 쓰기 가능). now/perf = 시계 주입(검사).
     *  onReadOnly(msg) = 먼저 열린 탭을 발견해 읽기 전용이 된 순간 1회. → { id, t, close() } */
    claimTab: (BC, { now = () => Date.now(), perf = () => (typeof performance !== 'undefined' ? performance.now() : 0), onReadOnly } = {}) => {
      const t = now();
      const id = t.toString(36) + '-' + Math.floor(perf() * 1000).toString(36);
      if (!readOnly && store) { try { store.setItem(TAB_KEY, JSON.stringify({ id, t })); } catch { /* 표식은 진단용 — 실패해도 진행 */ } }
      const older = (m) => m.t < t || (m.t === t && String(m.id) < id);
      let ch = null;
      if (typeof BC === 'function') {
        try {
          ch = new BC(TAB_CHANNEL);
          ch.onmessage = (e) => {
            const m = e && e.data;
            if (!m || m.id === id || !Number.isFinite(m.t)) return;
            if (m.type === 'hello' && !readOnly) ch.postMessage({ type: 'alive', id, t });
            if ((m.type === 'alive' || m.type === 'hello') && older(m) && !readOnly) {
              readOnly = true;
              if (onReadOnly) onReadOnly(m);
            }
          };
          ch.postMessage({ type: 'hello', id, t });
        } catch { ch = null; }
      }
      return { id, t, close: () => { try { if (ch) ch.close(); } catch { /* 이미 닫힘 */ } } };
    },
  };
}
