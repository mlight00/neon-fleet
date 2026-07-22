// 밸런스 튜너 화면 로직 (tuner.html 전용).
// 게임과 같은 출처라 저장소를 공유한다 → 저장하면 게임 탭이 storage 이벤트로 즉시 반영.
import { BAL } from './balance.js';
import { SPRITE_SIZES } from './sprites.js';
import { GROUPS, coreKeySet, coreCount } from './tuner-spec.js';
import { flatten, getPath, loadPatch, savePatch, clearPatch, emptyPatch } from './tuning.js';

// 원본 기본값 스냅샷 — 페이지 로드 시 한 번. 이후 편집은 이 사본과 비교해 '변경분'만 저장한다.
const BASE = { bal: JSON.parse(JSON.stringify(BAL)), sprite: { ...SPRITE_SIZES } };
const SRC = { bal: BAL, sprite: SPRITE_SIZES };

let patch = loadPatch();                       // { bal:{path:값}, sprite:{path:값} }
const rowEls = new Map();                      // 'ns:path' → { input, slider, reset, row }

const $ = (s, r = document) => r.querySelector(s);
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const fmt = (v) => Array.isArray(v) ? v.join(', ') : String(v);

/** 현재 값 = 패치에 있으면 그 값, 없으면 원본 기본값 */
function currentVal(ns, path) {
  const p = patch[ns][path];
  return p !== undefined ? p : getPath(BASE[ns], path);
}
function baseVal(ns, path) { return getPath(BASE[ns], path); }
function isChanged(ns, path) {
  const c = currentVal(ns, path), b = baseVal(ns, path);
  return Array.isArray(b) ? (!Array.isArray(c) || b.length !== c.length || b.some((n, i) => n !== c[i])) : c !== b;
}

function setVal(ns, path, value) {
  const b = baseVal(ns, path);
  if (Array.isArray(b)) {
    if (!Array.isArray(value) || value.length !== b.length || value.some((n) => !Number.isFinite(n))) return false;
  } else if (!Number.isFinite(value)) return false;
  const same = Array.isArray(b) ? b.every((n, i) => n === value[i]) : b === value;
  if (same) delete patch[ns][path]; else patch[ns][path] = value;   // 기본값과 같으면 패치에서 뺀다
  refreshRow(ns, path);
  refreshStatus();
  return true;
}

function refreshRow(ns, path) {
  const r = rowEls.get(`${ns}:${path}`);
  if (!r) return;
  const v = currentVal(ns, path), changed = isChanged(ns, path);
  if (r.input && document.activeElement !== r.input) r.input.value = fmt(v);
  if (r.slider && document.activeElement !== r.slider) r.slider.value = v;
  r.row.classList.toggle('changed', changed);
  if (r.reset) r.reset.disabled = !changed;
}

function changedCount() {
  return Object.keys(patch.bal).length + Object.keys(patch.sprite).length;
}

function refreshStatus() {
  const n = changedCount();
  $('#count').textContent = n ? `${n}개 변경됨` : '변경 없음';
  $('#count').classList.toggle('on', n > 0);
  $('#btn-reset-all').disabled = n === 0;
}

/** 항목 한 줄 만들기 */
function makeRow(item) {
  const { ns, path } = item;
  const b = baseVal(ns, path);
  if (b === undefined) return null;
  const isArr = Array.isArray(b);
  const key = `${ns}:${path}`;

  const row = el('div', 'row');
  const left = el('div', 'label');
  left.appendChild(el('div', 'nm', item.name || path));
  const sub = el('div', 'sub');
  sub.textContent = item.desc ? `${item.desc} · ${path}` : path;
  left.appendChild(sub);

  const ctrl = el('div', 'ctrl');
  let slider = null;
  const input = el('input', 'num');
  input.type = 'text';
  input.value = fmt(currentVal(ns, path));
  input.inputMode = isArr ? 'text' : 'decimal';
  input.spellcheck = false;
  input.addEventListener('input', () => {
    const raw = input.value.trim();
    if (isArr) {
      const arr = raw.split(',').map((s) => parseFloat(s.trim()));
      if (arr.length === b.length && arr.every(Number.isFinite)) { setVal(ns, path, arr); input.classList.remove('bad'); }
      else input.classList.add('bad');
    } else {
      const n = parseFloat(raw);
      if (Number.isFinite(n)) { setVal(ns, path, n); input.classList.remove('bad'); }
      else input.classList.add('bad');
    }
  });

  if (!isArr && item.min !== undefined) {
    slider = el('input', 'sld');
    slider.type = 'range';
    slider.min = item.min; slider.max = item.max; slider.step = item.step ?? 0.01;
    slider.value = currentVal(ns, path);
    slider.addEventListener('input', () => setVal(ns, path, parseFloat(slider.value)));
    ctrl.appendChild(slider);
  }
  ctrl.appendChild(input);

  const base = el('div', 'base', `기본 ${fmt(b)}`);
  const reset = el('button', 'mini', '되돌리기');
  reset.addEventListener('click', () => setVal(ns, path, Array.isArray(b) ? b.slice() : b));

  row.append(left, ctrl, base, reset);
  rowEls.set(key, { input, slider, reset, row });
  row.dataset.search = `${item.name || ''} ${item.desc || ''} ${path}`.toLowerCase();
  refreshRow(ns, path);
  return row;
}

function section(title, desc, open) {
  const d = el('details', 'sec');
  d.open = !!open;
  const s = el('summary');
  s.appendChild(el('span', 'stitle', title));
  if (desc) s.appendChild(el('span', 'sdesc', desc));
  d.appendChild(s);
  const body = el('div', 'body');
  d.appendChild(body);
  return { d, body };
}

// ── 핵심 항목 ──
function buildCore() {
  const host = $('#core');
  for (const g of GROUPS) {
    const { d, body } = section(g.title, g.desc, true);
    let n = 0;
    for (const item of g.items) { const r = makeRow(item); if (r) { body.appendChild(r); n++; } }
    if (n) host.appendChild(d);
  }
}

// ── 전체 항목(자동 생성) ──
function buildAll() {
  const host = $('#all');
  const core = coreKeySet();
  const groups = new Map();
  const add = (ns, path) => {
    if (core.has(`${ns}:${path}`)) return;                  // 핵심에 이미 있으면 생략
    const top = ns === 'sprite' ? '크기(스프라이트)' : path.split('.')[0];
    if (!groups.has(top)) groups.set(top, []);
    groups.get(top).push({ ns, path, name: path.split('.').slice(1).join('.') || path });
  };
  for (const p of Object.keys(flatten(BASE.bal))) add('bal', p);
  for (const p of Object.keys(BASE.sprite)) add('sprite', p);

  let total = 0;
  for (const [top, items] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const { d, body } = section(top, `${items.length}개`, false);
    for (const it of items) { const r = makeRow(it); if (r) { body.appendChild(r); total++; } }
    host.appendChild(d);
  }
  $('#all-count').textContent = `${total}개`;
}

// ── 저장·내보내기 ──
function doSave() {
  savePatch(patch);
  // 같은 탭에서는 storage 이벤트가 안 오므로, 게임이 다른 탭이면 그쪽이 즉시 받는다.
  flash(`저장 완료 · ${changedCount()}개 적용`);
}
function doResetAll() {
  if (!confirm('모든 조정값을 원래대로 되돌립니다. 계속할까요?')) return;
  patch = emptyPatch();
  clearPatch();
  for (const key of rowEls.keys()) { const [ns, ...rest] = key.split(':'); refreshRow(ns, rest.join(':')); }
  refreshStatus();
  flash('원본으로 초기화했습니다');
}
function doExport() {
  const json = JSON.stringify({ v: 1, bal: patch.bal, sprite: patch.sprite }, null, 2);
  $('#io').value = json;
  $('#io-wrap').open = true;
  navigator.clipboard?.writeText(json).then(() => flash('클립보드에 복사했습니다'), () => flash('아래 칸에서 복사하세요'));
}
function doImport() {
  try {
    const p = JSON.parse($('#io').value);
    patch = { v: 1, bal: p.bal || {}, sprite: p.sprite || {} };
    for (const key of rowEls.keys()) { const [ns, ...rest] = key.split(':'); refreshRow(ns, rest.join(':')); }
    refreshStatus();
    flash('불러왔습니다 — 저장을 눌러야 게임에 적용됩니다');
  } catch { flash('JSON 형식이 아닙니다'); }
}

let flashT = null;
function flash(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('on');
  clearTimeout(flashT);
  flashT = setTimeout(() => t.classList.remove('on'), 2400);
}

// ── 검색 ──
function applyFilter(q) {
  const s = q.trim().toLowerCase();
  for (const sec of document.querySelectorAll('.sec')) {
    let hit = 0;
    for (const row of sec.querySelectorAll('.row')) {
      const show = !s || row.dataset.search.includes(s);
      row.hidden = !show;
      if (show) hit++;
    }
    sec.hidden = s ? hit === 0 : false;
    if (s && hit) sec.open = true;
  }
}

// ── 시작 ──
buildCore();
buildAll();
refreshStatus();
$('#core-count').textContent = `${coreCount()}개`;
$('#btn-save').addEventListener('click', doSave);
$('#btn-reset-all').addEventListener('click', doResetAll);
$('#btn-export').addEventListener('click', doExport);
$('#btn-import').addEventListener('click', doImport);
$('#search').addEventListener('input', (e) => applyFilter(e.target.value));
$('#btn-open-game').addEventListener('click', () => window.open('index.html', 'neonfleet-game'));
