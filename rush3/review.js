// rush3/review.js — 친구 테스트 리뷰 설문(이사님 결정 2026-10-03 — 설계서 docs/superpowers/specs/2026-10-03-friend-review-survey-design.md).
//  게임 안 설문 창(reviewui.js)이 모은 답 + 자동 기록을 coo@ 계정 구글 설문지(formResponse)로 보낸다(셸 main.js 가 fetch no-cors 로 보낸다).
//  ⚠️ 선택지 글자·칸 번호(entry.N)는 설문지와 한 글자도 달라서는 안 된다 — 다르면 구글이 응답을 조용히 버린다(no-cors 라 게임은 알 수 없다).
//   2026-10-03 게시본의 공개 페이지(FB_PUBLIC_LOAD_DATA_)에서 읽은 값이다. 설문지를 고치면 여기와 검사(REVIEW-1)를 함께 고친다.
//  순수: 시계·저장·화면 없음(익명 번호는 주입한 난수만 쓴다)

//  게임 버전(설문 '기타 기록' 칸에 붙는다) — 릴리스마다 올린다(LOOP.md)
export const REVIEW_GAME_VER = 'r4.34';
export const REVIEW_BUTTON = '리뷰 남기기';

const FORM_ID = '1FAIpQLSe8NL5_umooFEcX1pwT06DHApJsNBDkpgBBYsex02r69rZF_g';
export const REVIEW_FORM = Object.freeze({
  action: 'https://docs.google.com/forms/d/e/' + FORM_ID + '/formResponse',
  viewUrl: 'https://docs.google.com/forms/d/e/' + FORM_ID + '/viewform',
  entry: Object.freeze({
    fun: 'entry.2115074859', diff: 'entry.1513591304', again: 'entry.1523716744', best: 'entry.1818482786',
    note: 'entry.1573431600', name: 'entry.2044580810',
    reach: 'entry.372798363', runs: 'entry.46892637', mins: 'entry.587201313', device: 'entry.524476485', etc: 'entry.723169039',
  }),
});
//  설문지 칸 순서(보낼 값의 순서)
export const REVIEW_KEYS = Object.freeze(['fun', 'diff', 'again', 'best', 'note', 'name', 'reach', 'runs', 'mins', 'device', 'etc']);

//  설문 창에 보이는 문항(kind: stars = 별 1~5 · choice = 하나 고르기 · text = 긴 글 · line = 짧은 글). required 는 게임이 확인한다(설문지에는 필수 없음)
const Q = (key, label, kind, options, required) => Object.freeze({ key, label, kind, options: Object.freeze(options), required });
export const REVIEW_QS = Object.freeze([
  Q('fun', '재미있었나요?', 'stars', ['1', '2', '3', '4', '5'], true),
  Q('diff', '난이도는 어땠나요?', 'choice', ['너무 쉬움', '조금 쉬움', '딱 좋음', '조금 어려움', '너무 어려움'], true),
  Q('again', '또 하고 싶나요?', 'choice', ['또 할래요', '가끔 할 것 같아요', '이번으로 충분해요'], false),
  Q('best', '제일 좋았던 것 하나', 'choice', ['부대가 커지는 맛', '게이트 고르기', '보스전', '무기 바꾸기', '스토리 그림', '잘 모르겠어요'], false),
  Q('note', '한마디 (불편했던 점·버그·바라는 점)', 'text', [], false),
  Q('name', '이름이나 별명', 'line', [], false),
]);
export const REVIEW_LIMITS = Object.freeze({ note: 300, name: 20 });
//  초대 카드: 판 수(지갑 runNo)가 이만큼 된 결과 화면에서 한 번
export const REVIEW_INVITE_RUNS = 3;
//  창이 열린 뒤 누르기를 받지 않는 시간(초) — 판 끝에 누르던 손가락으로 바로 닫히지 않게(스토리 0.5초 잠금과 같은 이유)
export const REVIEW_UI_LOCK = 0.6;

const BY_KEY = new Map(REVIEW_QS.map((q) => [q.key, q]));
const str = (v) => (typeof v === 'string' ? v.trim() : '');

/** 필수인데 비었거나, 고르기 문항에 표에 없는 값이 들어온 문항 키 목록(REVIEW_QS 순서) */
export function reviewMissing(ans) {
  const a = ans && typeof ans === 'object' ? ans : {};
  const out = [];
  for (const q of REVIEW_QS) {
    const v = str(a[q.key]);
    if (v && q.options.length && !q.options.includes(v)) out.push(q.key);
    else if (!v && q.required) out.push(q.key);
  }
  return out;
}

/** 자동 기록 rec = { reach, cleared, runs, mins, story, device, ver, anon } → 설문지 7~11번 칸 값(문자열, 모르면 '') */
export function recordFields(rec) {
  const r = rec && typeof rec === 'object' ? rec : {};
  const n = (v) => (Number.isFinite(v) ? String(Math.max(0, Math.round(v))) : '');
  const n0 = (v) => n(v) || '0';
  return {
    reach: n(r.reach), runs: n(r.runs), mins: n(r.mins),
    device: typeof r.device === 'string' ? r.device.slice(0, 60) : '',
    etc: '깬 ' + n0(r.cleared) + ' · 스토리 ' + n0(r.story) + ' · ' + (typeof r.ver === 'string' && r.ver ? r.ver : REVIEW_GAME_VER) + ' · #' + (typeof r.anon === 'string' && r.anon ? r.anon : '-'),
  };
}

/** 보낼 값 쌍 [[entry.N, 값], …] — REVIEW_KEYS 순서 · 빈 값과 표에 없는 선택 값은 뺀다 · 긴 글은 자른다 */
export function buildReviewPairs(ans, rec, form = REVIEW_FORM) {
  const a = ans && typeof ans === 'object' ? ans : {};
  const vals = { ...recordFields(rec) };
  for (const q of REVIEW_QS) {
    let v = str(a[q.key]);
    if (q.options.length && !q.options.includes(v)) v = '';
    if (REVIEW_LIMITS[q.key]) v = v.slice(0, REVIEW_LIMITS[q.key]);
    vals[q.key] = v;
  }
  const out = [];
  for (const k of REVIEW_KEYS) if (vals[k]) out.push([form.entry[k], vals[k]]);
  return out;
}

/** 초대 카드를 띄우는가: 판 수가 REVIEW_INVITE_RUNS 이상 · 아직 초대 안 함 · 보낸 적 없음 */
export function shouldInvite({ runs = 0, asked = false, sent = 0 } = {}) {
  return runs >= REVIEW_INVITE_RUNS && !asked && !(sent > 0);
}

/** 기기 이름 '휴대폰 · 아이폰 · 카카오톡' — 기기 종류 · 운영체제 · 앱 안 여부만(정확한 모델은 남기지 않는다).
 *  touchPoints = navigator.maxTouchPoints(데스크톱 모드 아이패드는 맥 UA 에 터치가 있다) */
export function deviceLabel(ua = '', touchPoints = 0) {
  const s = String(ua || '');
  const ipad = /iPad/.test(s) || (/Macintosh/.test(s) && touchPoints > 1);
  const iphone = /iPhone|iPod/.test(s);
  const android = /Android/.test(s);
  const kind = ipad || (android && !/Mobile/.test(s)) ? '태블릿' : iphone || android || /Mobi/.test(s) ? '휴대폰' : 'PC';
  const os = ipad ? '아이패드' : iphone ? '아이폰' : android ? '안드로이드' : /Windows/.test(s) ? '윈도우' : /Mac OS X|Macintosh/.test(s) ? '맥' : '기타';
  const app = /KAKAOTALK/i.test(s) ? '카카오톡' : /Instagram/.test(s) ? '인스타그램' : /FBAN|FBAV/.test(s) ? '페이스북'
    : /NAVER\(inapp|\bNAVER\b/.test(s) ? '네이버앱' : /\bLine\//.test(s) ? '라인' : '브라우저';
  return kind + ' · ' + os + ' · ' + app;
}

/** 익명 번호 8자(0-9a-z) — 같은 기기의 여러 응답을 묶어 보는 용도 */
export function makeAnon(rand = Math.random) {
  const A = '0123456789abcdefghijklmnopqrstuvwxyz';
  let s = '';
  for (let i = 0; i < 8; i++) s += A[Math.min(35, Math.floor(rand() * 36))];
  return s;
}

/** 설문 창 아래 '게임 기록(…)도 함께 보내요'에 넣는 한 줄 */
export function recordLine(rec) {
  const f = recordFields(rec);
  return '최고 STAGE ' + (f.reach || '1') + ' · ' + (f.runs || '0') + '판';
}
