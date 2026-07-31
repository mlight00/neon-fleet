import { test } from 'node:test';
import assert from 'node:assert/strict';

// Stage 1 동의 UI 리스너 계약: 배너·모달을 반복 표시해도 확정 클릭 콜백이 정확히 1회여야 한다.
// 실제 ui.js의 showConsentBanner/showConsentDetails를 최소 fake DOM으로 구동한다(브라우저 불필요).
// innerHTML 재설정으로 이전 자식(리스너 포함)이 폐기되므로 재표시가 리스너를 누적하지 않는다.

function makeChild(id) {
  const handlers = [];
  return {
    id,
    addEventListener(type, fn) { handlers.push({ type, fn }); },
    _handlerCount(type) { return handlers.filter((h) => h.type === type).length; },
    click() { handlers.filter((h) => h.type === 'click').forEach((h) => h.fn({ stopPropagation() {} })); },
  };
}

function makeEl() {
  const el = {
    id: '', className: '', _q: new Map(),
    classList: { add() {}, remove() {} },
    setAttribute() {},
    appendChild() {},
    addEventListener() {},
    querySelector(sel) { return el._q.get(sel.replace('#', '')) || null; },
  };
  Object.defineProperty(el, 'innerHTML', {
    set(html) {
      el._q = new Map();   // 실제 DOM처럼 이전 자식·리스너를 전부 버리고 새 노드로 교체
      const re = /id="([^"]+)"/g; let m;
      while ((m = re.exec(html))) el._q.set(m[1], makeChild(m[1]));
    },
    get() { return ''; },
  });
  return el;
}

// 생성된 요소를 id로 재조회할 수 있는 fake document (stage.appendChild가 등록).
const registry = new Map();
globalThis.document = {
  getElementById(id) {
    if (registry.has(id)) return registry.get(id);
    if (id === 'stage') {
      const s = makeEl(); s.id = 'stage';
      s.appendChild = (child) => registry.set(child.id, child);
      registry.set('stage', s); return s;
    }
    return null;   // overlay·최초 nf-consent 등은 없음
  },
  createElement() { return makeEl(); },
};
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.matchMedia = () => ({ matches: false });

const { ui } = await import('../js/ui.js');

test('동의 배너를 3번 표시해도 allow 클릭 콜백은 정확히 1회(리스너 중복 없음)', () => {
  let allow = 0;
  const args = { onAllow: () => { allow += 1; }, onDeny() {}, onDetails() {} };
  ui.showConsentBanner(args);
  ui.showConsentBanner(args);
  ui.showConsentBanner(args);
  const el = document.getElementById('nf-consent');
  const allowBtn = el.querySelector('#nf-consent-allow');
  assert.equal(allowBtn._handlerCount('click'), 1, '현재 버튼의 click 리스너는 1개');
  allowBtn.click();
  assert.equal(allow, 1, '세 번 표시해도 클릭은 1회만 콜백');
});

test('수집 항목 모달을 반복 표시해도 allow 클릭 콜백은 정확히 1회', () => {
  let allow = 0;
  const args = { onAllow: () => { allow += 1; }, onDeny() {}, onClose() {} };
  ui.showConsentDetails(args);
  ui.showConsentDetails(args);
  const el = document.getElementById('nf-consent-modal');
  const allowBtn = el.querySelector('#nf-consent-modal-allow');
  assert.equal(allowBtn._handlerCount('click'), 1);
  allowBtn.click();
  assert.equal(allow, 1);
});
