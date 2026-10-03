// rush3/reviewui.js — 친구 테스트 리뷰 설문 창(DOM · 이사님 결정 2026-10-03 — 설계서 docs/superpowers/specs/2026-10-03-friend-review-survey-design.md).
//  문항·필수·길이는 review.js 의 것만 쓴다(여기는 화면만). 셸(main.js)이 createReviewUi(doc, { onSubmit, onClose, viewUrl, now }) 로 만들고
//  open({ mode: 'form' | 'invite', line, sent }) · close() · isOpen() 을 부른다. onSubmit(답) → Promise<{ ok }> · onClose() = 사용자가 닫았다.
//  게임 화면과 같은 색(어두운 남색 · 금색 테 · 청록 기본 버튼) · 입력 글자 16px(아이폰 확대 방지) · 한국어는 어절 단위로만 줄을 바꾼다(word-break: keep-all).
//  열린 뒤 REVIEW_UI_LOCK(0.6초) 안의 누르기는 무시한다(판 끝에 누르던 손가락으로 바로 닫히지 않게)
import { REVIEW_QS, REVIEW_LIMITS, REVIEW_UI_LOCK, reviewMissing } from './review.js';

const CSS = [
  '.rv-back{position:fixed;inset:0;z-index:50;background:rgba(5,8,14,.72);display:flex;align-items:flex-start;justify-content:center;',
  'overflow-y:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y;padding:16px 0 32px;box-sizing:border-box;animation:rv-in .25s ease-out}',
  '.rv-panel{box-sizing:border-box;width:calc(100% - 32px);max-width:440px;margin:auto 0;background:#0B1220;color:#F3F1E8;',
  'border:1.5px solid rgba(246,200,74,.65);border-radius:16px;padding:18px 16px 16px;font:15px/1.5 system-ui,sans-serif;',
  '-webkit-user-select:text;user-select:text;word-break:keep-all;overflow-wrap:break-word}',
  '.rv-panel h2{margin:0 0 6px;font-size:20px;line-height:1.35;color:#F6C84A}',
  '.rv-sub{margin:0 0 4px;color:rgba(243,241,232,.78);font-size:15px}',
  '.rv-q{margin:16px 0 0}',
  '.rv-label{font-weight:700;margin-bottom:7px}',
  '.rv-opt{font-weight:400;color:rgba(243,241,232,.55);font-size:13px}',
  '.rv-stars{display:flex;gap:6px}',
  '.rv-star{flex:1;min-height:46px;font-size:26px;line-height:1;background:rgba(20,35,58,.82);color:rgba(243,241,232,.3);',
  'border:1.5px solid rgba(246,200,74,.4);border-radius:10px;cursor:pointer;touch-action:manipulation;padding:0}',
  '.rv-star.on{color:#F6C84A;border-color:#F6C84A}',
  '.rv-chips{display:flex;flex-wrap:wrap;gap:7px}',
  '.rv-chip{min-height:42px;padding:6px 13px;font:15px/1.3 system-ui,sans-serif;background:rgba(20,35,58,.82);color:#F3F1E8;',
  'border:1.5px solid rgba(246,200,74,.4);border-radius:21px;cursor:pointer;touch-action:manipulation;word-break:keep-all}',
  '.rv-chip.on{background:#F6C84A;color:#0B1220;border-color:#F6C84A;font-weight:700}',
  '.rv-panel textarea,.rv-panel input{box-sizing:border-box;width:100%;font:16px/1.4 system-ui,sans-serif;color:#F3F1E8;background:#101a2c;',
  'border:1.5px solid rgba(246,200,74,.4);border-radius:10px;padding:9px 10px;-webkit-user-select:text;user-select:text;outline:none}',
  '.rv-panel textarea:focus,.rv-panel input:focus{border-color:#35E5FF}',
  '.rv-panel textarea{min-height:78px;resize:vertical}',
  '.rv-panel ::placeholder{color:rgba(243,241,232,.4)}',
  '.rv-rec{margin:16px 0 0;font-size:13px;color:rgba(243,241,232,.7)}',
  '.rv-status{margin:8px 0 0;font-size:14px;color:#FF9B7A}',
  '.rv-status:empty{display:none}',
  '.rv-status a{color:#35E5FF;word-break:keep-all}',
  '.rv-row{display:flex;gap:8px;margin-top:16px}',
  '.rv-btn{flex:1;min-height:50px;font:700 17px system-ui,sans-serif;border-radius:16px;cursor:pointer;touch-action:manipulation;',
  'background:rgba(20,35,58,.82);color:#F3F1E8;border:1.5px solid rgba(246,200,74,.65)}',
  '.rv-btn.pri{background:#14233A;border:2px solid #35E5FF;color:#fff}',
  '.rv-btn:disabled{opacity:.45;cursor:default}',
  '@keyframes rv-in{from{opacity:0}to{opacity:1}}',
].join('');

export function createReviewUi(doc, { onSubmit, onClose, viewUrl = '', now = () => Date.now() / 1000 } = {}) {
  let root = null, openedAt = -Infinity;
  const el = (tag, cls, text) => {
    const e = doc.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const fill = (node, kids) => { while (node.firstChild) node.removeChild(node.firstChild); for (const k of kids) node.appendChild(k); };
  const locked = () => now() - openedAt < REVIEW_UI_LOCK;
  const tap = (node, fn) => node.addEventListener('click', (e) => { e.preventDefault(); if (!locked()) fn(e); });
  const btn = (label, cls, fn) => { const b = el('button', 'rv-btn' + (cls ? ' ' + cls : ''), label); b.type = 'button'; tap(b, fn); return b; };
  const row = (...kids) => { const r = el('div', 'rv-row'); for (const k of kids) r.appendChild(k); return r; };
  function style() {
    if (doc.getElementById('rv-style')) return;
    const st = el('style');
    st.id = 'rv-style';
    st.textContent = CSS;
    (doc.head || doc.documentElement).appendChild(st);
  }
  function close() { if (root) { root.remove(); root = null; } }
  function userClose() { close(); if (onClose) onClose(); }

  //  초대 카드(판 수 3 이 된 결과 화면에서 한 번)
  function invite(panel, info) {
    fill(panel, [
      el('h2', null, '리뷰 1분만 부탁해요!'),
      el('p', 'rv-sub', '친구들 의견으로 게임을 고쳐요.'),
      el('p', 'rv-sub', '별점과 난이도만 고르면 끝나요.'),
      row(btn('나중에', '', userClose), btn('쓰기', 'pri', () => form(panel, info))),
    ]);
  }

  //  설문: 별 · 고르기 칩 · 긴 글 · 짧은 글 → [보내기](필수 2개가 차야 켜진다)
  function form(panel, info) {
    const ans = {};
    let busy = false;
    const kids = [el('h2', null, '리뷰 남기기')];
    if (info.sent > 0) kids.push(el('p', 'rv-sub', '이미 ' + info.sent + '번 보내 주셨어요. 고마워요!'));
    const send = btn('보내기', 'pri', () => submit());
    const refresh = () => { send.disabled = busy || reviewMissing(ans).length > 0; };
    for (const q of REVIEW_QS) {
      const box = el('div', 'rv-q');
      const lab = el('div', 'rv-label', q.label);
      if (!q.required) lab.appendChild(el('span', 'rv-opt', ' (선택)'));
      box.appendChild(lab);
      if (q.kind === 'stars' || q.kind === 'choice') {
        const stars = q.kind === 'stars';
        const wrap = el('div', stars ? 'rv-stars' : 'rv-chips');
        wrap.setAttribute('role', 'radiogroup');
        wrap.setAttribute('aria-label', q.label);
        const items = q.options.map((o, i) => {
          const b = el('button', stars ? 'rv-star' : 'rv-chip', stars ? '★' : o);
          b.type = 'button';
          b.setAttribute('role', 'radio');
          b.setAttribute('aria-checked', 'false');
          if (stars) b.setAttribute('aria-label', o + '점');
          tap(b, () => {
            ans[q.key] = o;
            items.forEach((x, j) => { x.classList.toggle('on', stars ? j <= i : j === i); x.setAttribute('aria-checked', String(j === i)); });
            refresh();
          });
          wrap.appendChild(b);
          return b;
        });
        box.appendChild(wrap);
      } else {
        const long = q.kind === 'text';
        const inp = el(long ? 'textarea' : 'input');
        if (!long) inp.type = 'text';
        inp.maxLength = REVIEW_LIMITS[q.key] || 100;
        inp.placeholder = long ? '자유롭게 적어 주세요' : '단톡방 이름이면 누구 의견인지 알 수 있어요';
        inp.setAttribute('aria-label', q.label);
        inp.setAttribute('autocomplete', 'off');
        inp.addEventListener('input', () => { ans[q.key] = inp.value; });
        box.appendChild(inp);
      }
      kids.push(box);
    }
    kids.push(el('p', 'rv-rec', '게임 기록(' + info.line + ')도 함께 보내요.'));
    const status = el('p', 'rv-status');
    status.setAttribute('aria-live', 'polite');
    kids.push(status, row(btn('닫기', '', userClose), send));
    fill(panel, kids);
    refresh();

    async function submit() {
      if (busy || reviewMissing(ans).length) return;
      busy = true;
      refresh();
      send.textContent = '보내는 중…';
      status.textContent = '';
      let r = { ok: false };
      try { r = (await onSubmit({ ...ans })) || { ok: false }; } catch { r = { ok: false }; }
      if (!root) return;                       // 보내는 사이에 창이 닫혔다
      if (r.ok) {
        fill(panel, [el('h2', null, '고마워요! 잘 받았어요.'), el('p', 'rv-sub', '보내 준 의견으로 게임을 고칠게요.'), row(btn('닫기', 'pri', userClose))]);
        return;
      }
      busy = false;
      send.textContent = '보내기';
      refresh();
      status.textContent = '인터넷이 끊겨 못 보냈어요. 다음에 게임을 열면 자동으로 다시 보내요. ';
      if (viewUrl) {
        const a = el('a', null, '구글 설문지에서 직접 쓰기');
        a.href = viewUrl;
        a.target = '_blank';
        a.rel = 'noopener';
        status.appendChild(a);
      }
    }
  }

  function open({ mode = 'form', line = '', sent = 0 } = {}) {
    style();
    close();
    openedAt = now();
    root = el('div', 'rv-back');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', '리뷰 설문');
    //  창 안의 키는 게임으로 올려 보내지 않는다(글자 입력의 Enter·Space 가 출격·재도전이 되지 않게). ESC = 닫기
    root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') { e.preventDefault(); userClose(); }
    });
    const panel = el('div', 'rv-panel');
    root.appendChild(panel);
    const info = { line, sent };
    if (mode === 'invite') invite(panel, info);
    else form(panel, info);
    doc.body.appendChild(root);
  }
  return { open, close, isOpen: () => !!root };
}
