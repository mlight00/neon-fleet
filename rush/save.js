// rush/save.js — 단일 키 localStorage. storage 주입으로 Node 테스트 가능.
const KEY = 'starforgeRush.v1';
const DEFAULTS = { best: 0, coins: 0, up: { startTroops: 0, fireRate: 0, magnet: 0 }, daily: {}, lastPlayDay: '' };

export function createSave(storage) {
  let store = storage;
  if (!store) { try { store = globalThis.localStorage; store.getItem(KEY); } catch { store = null; } }
  const mem = new Map();
  const read = () => {
    try { const raw = store ? store.getItem(KEY) : mem.get(KEY); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  };
  let data = { ...DEFAULTS, ...(read() || {}) };
  data.up = { ...DEFAULTS.up, ...(data.up || {}) };
  const write = () => {
    const raw = JSON.stringify(data);
    try { if (store) store.setItem(KEY, raw); else mem.set(KEY, raw); } catch { mem.set(KEY, raw); }
  };
  return {
    get: () => data,
    patch: (obj) => { data = { ...data, ...obj }; write(); },
  };
}
