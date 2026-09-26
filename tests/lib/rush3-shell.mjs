// tests/lib/rush3-shell.mjs — 셸(boot) 결선 검사용 가짜 캔버스·저장소·오디오(r4.7). rush3-coins·rush3-shop 의 하네스와 같은 꼴을 한 곳에 둔다.
//  실제 boot() 를 가짜 rAF 로 한 프레임씩 두드리고, 그 프레임에 그려진 글(fillText)을 모은다.
import { boot } from '../../rush3/main.js';
import { createSave3 } from '../../rush3/save.js';
import { seedOldClears } from './rush3-unlock.mjs';

export function memStorage(init = {}) {
  const m = new Map(Object.entries(init));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => m.delete(k) };
}
export function fakeCanvas(texts, ops = null) {
  const grad = { addColorStop() {} };
  const listeners = {};
  const ctx = new Proxy({ canvas: null }, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'fillText') texts.push({ text: String(args[0]), x: args[1], y: args[2], fill: t.fillStyle });
        if (ops) ops.push({ op: k, args, fill: t.fillStyle, stroke: t.strokeStyle, alpha: t.globalAlpha });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: String(args[0]).length * 8 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return {
    width: 480, height: 800, getContext: () => ctx, getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }),
    addEventListener: (n, f) => { (listeners[n] ??= []).push(f); },
    fire: (n, e) => { for (const f of listeners[n] ?? []) f(e); },
  };
}
export function fakeAudio() {
  const played = [];
  return { played, unlock() {}, sfx(n) { played.push(n); return true; }, bgmPlay() {}, bgmPause() {}, bgmResume() {}, setVolume() {}, getVolume() { return 1; }, setMuted() {}, isMuted() { return false; }, duck() {} };
}
/** 실제 boot() 한 벌. search = URL 뒤 '?…'. unlockThrough = 옛 기록으로 1~n 번을 이긴 사용자(순차 해금 — n+1 번까지 열린다).
 *  반환 { app, save, texts, ops, frames(n), textNow() } */
export async function bootApp({ storage = memStorage(), search = '', dateNow = () => 1_700_000_000_000, save, withOps = false, unlockThrough = 0 } = {}) {
  const texts = [];
  const ops = withOps ? [] : null;
  const canvas = fakeCanvas(texts, ops);
  const L = {};
  const win = { devicePixelRatio: 1, location: { search }, addEventListener: (n, f) => { (L[n] ??= []).push(f); }, fire: (n, e = {}) => { for (const f of L[n] ?? []) f(e); } };
  const queue = [];
  let nowMs = 1000;
  const sv = save ?? createSave3(storage);
  if (unlockThrough > 0) seedOldClears(sv, unlockThrough);
  const audio = fakeAudio();
  const deps = { win, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save: sv, audio, dateNow, sprites: { get: () => null, ready: new Set() } };
  const app = boot(canvas, deps);
  await app.ready;
  const frames = (n = 1) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  const textNow = () => { texts.length = 0; if (ops) ops.length = 0; frames(1); return texts.map((t) => t.text); };
  //  r4.10: 논리 좌표(480×800) 클릭 — 캔버스 CSS 240×400 이라 절반(타이틀 페이지 넘김 등 버튼 경로 그대로)
  const tap = (x, y) => canvas.fire('pointerdown', { clientX: x / 2, clientY: y / 2, pointerType: 'mouse' });
  return { app, save: sv, storage, texts, ops, frames, textNow, audio, win, tap };
}
