// 밸런스 튜너 화면 로직 (tuner.html 전용).
// 게임과 같은 출처라 저장소를 공유한다 → 저장하면 게임 탭이 storage 이벤트로 즉시 반영.
import { BAL } from './balance.js';
import { SPRITE_SIZES, preloadSprites, getSprite } from './sprites.js';
import { GROUPS, coreKeySet, coreCount, artFor } from './tuner-spec.js';
import { flatten, getPath, loadPatch, savePatch, clearPatch, emptyPatch } from './tuning.js';
import { Charger, Mine, Debris } from './entities.js';

// 원본 기본값 스냅샷 — 페이지 로드 시 한 번. 이후 편집은 이 사본과 비교해 '변경분'만 저장한다.
const BASE = { bal: JSON.parse(JSON.stringify(BAL)), sprite: { ...SPRITE_SIZES } };
const SRC = { bal: BAL, sprite: SPRITE_SIZES };

let patch = loadPatch();                       // { bal:{path:값}, sprite:{path:값} }
const rowEls = new Map();                      // 'ns:path' → { input, slider, reset, row }
const thumbs = [];                             // 그려야 할 썸네일 캔버스들

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
  // 썸네일: 이름만으론 어느 적인지 알기 어렵다는 피드백(이사) → 실제 게임 그림을 옆에 붙인다.
  const artId = item.art || artFor(ns, path);
  if (artId) {
    const c = el('canvas', 'thumb');
    c.width = 40; c.height = 40; c.dataset.art = artId; c.title = artId;
    left.appendChild(c);
    thumbs.push(c);
  } else {
    left.appendChild(el('div', 'thumb none'));   // 자리를 비워두면 이름 줄이 어긋난다
  }
  const txt = el('div', 'ltext');
  txt.appendChild(el('div', 'nm', item.name || path));
  const sub = el('div', 'sub');
  sub.textContent = item.desc ? `${item.desc} · ${path}` : path;
  txt.appendChild(sub);
  left.appendChild(txt);

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

/** 스프라이트를 실제로 로드해 각 썸네일 캔버스에 비율 유지로 그린다. */
/** 그림 파일이 없고 코드로 그리는 적 — 게임의 실제 draw()를 그대로 호출해 정확한 모습을 얻는다. */
const VECTOR_THUMB = {
  charger: () => new Charger(0),
  mine: () => new Mine(0),
  debris: () => new Debris(0, 0, 'big'),
};
function drawVector(c, kind) {
  const make = VECTOR_THUMB[kind];
  if (!make) return false;
  const e = make();
  const g = c.getContext('2d');
  const s = (c.width * 0.86) / Math.max(2, (e.r || 20) * 2);
  g.save();
  g.translate(c.width / 2, c.height / 2);
  g.scale(s, s);
  g.translate(-e.x, -e.y);          // draw()가 절대좌표를 쓰므로 개체 위치를 원점으로
  try { e.draw(g); } catch { g.restore(); return false; }
  g.restore();
  return true;
}

async function drawThumbs() {
  const ids = [...new Set(thumbs.map((c) => c.dataset.art))].filter((id) => !id.startsWith('VEC:'));
  await preloadSprites(ids).catch(() => {});
  let drawn = 0;
  for (const c of thumbs) {
    if (c.dataset.art.startsWith('VEC:')) {
      if (drawVector(c, c.dataset.art.slice(4))) drawn++; else c.classList.add('none');
      continue;
    }
    const sp = getSprite(c.dataset.art);
    if (!sp) { c.classList.add('none'); continue; }
    const g = c.getContext('2d');
    const s = Math.min(c.width / sp.logicalW, c.height / sp.logicalH) * 0.92;
    const w = sp.logicalW * s, h = sp.logicalH * s;
    g.imageSmoothingQuality = 'high';
    g.drawImage(sp, (c.width - w) / 2, (c.height - h) / 2, w, h);
    drawn++;
  }
  return drawn;
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
drawThumbs().then((n) => console.info(`[튜너] 썸네일 ${n}개 렌더`));
