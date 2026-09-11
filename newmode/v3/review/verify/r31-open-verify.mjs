// r3.1 지적1 보조검증 ①역방향 대시(우→좌) ②1px 간격 정밀 스윕 ③새 coverZ 에서 의도한 노선이 통을 여는가.
// 읽기 전용. 게임 코드 무수정.
import { createRun, stepRun, drainEvents } from '../../../../rush3/combat.js';
import { BAL3 } from '../../../../rush3/balance.js';
import { writeFileSync } from 'node:fs';
const SCROLL = BAL3.scroll, VZMIN = BAL3.weapons.heavy.vz;
const coverFor = (c, z) => Math.ceil(c + (z - c) * SCROLL / VZMIN);
function stage(o) { return { id: 99, version: 2, title: 't', startUnits: o.n, startWeapon: o.weapon ?? 'rifle',
  length: o.length ?? 12000, eliteZ: null, elite: null, spawns: [], gateRows: [], supplies: o.supplies ?? [], walls: o.walls ?? [] }; }
function pre(r) { for (const s of r.supplies) if (s.coverZ != null) s.locked = r.z < s.coverZ; }
function dash(defs, walls, coverZ, stopZ, n, weapon, T, ax, bx) {
  const st = stage({ n, weapon, supplies: defs.map(d => ({ ...d, payload: { ...d.payload } })), walls, length: stopZ + 400 });
  const r = createRun(st); for (const s of r.supplies) s.coverZ = coverZ;
  const openZ = {}; let hits = { L: 0, R: 0 };
  while (!r.over && r.z < stopZ) {
    pre(r); stepRun(r, { pointerX: r.z < T ? ax : bx });
    for (const e of drainEvents(r)) if (e.type === 'supplyHit' || e.type === 'supplyOpen') hits[e.id === defs[0].id ? 'L' : 'R']++;
    for (const s of r.supplies) if (s.opened && openZ[s.id] == null) openZ[s.id] = +r.z.toFixed(1);
  }
  return { L: r.supplies[0].opened, R: r.supplies[1].opened, both: r.supplies[0].opened && r.supplies[1].opened, openZ, hits };
}
const WALLX = { x0: 228, x1: 252 };
const C = {
  s2:  { commitZ: 1740, sz: 2300, stop: 2360, lx: 120, rx: 330, walls: [{ id: 'w1', z0: 1800, z1: 3000, ...WALLX }],
         defs: [{ id: 'c1', z: 2300, x: 120, kind: 'soldier', durability: 6, maxDurability: 6, payload: { n: 3 } },
                { id: 'c2', z: 2300, x: 326, kind: 'weapon', durability: 12, maxDurability: 12, payload: { weapon: 'auto' } }] },
  p1:  { commitZ: 2340, sz: 2800, stop: 2860, lx: 150, rx: 330, walls: [{ id: 'wA', z0: 2400, z1: 2900, ...WALLX }],
         defs: [{ id: 'L', z: 2800, x: 150, kind: 'chain', durability: 10, maxDurability: 10, payload: { pads0: 5, maxPads: 15 } },
                { id: 'R', z: 2800, x: 330, kind: 'soldier', durability: 10, maxDurability: 10, payload: { n: 5 } }] },
  p2:  { commitZ: 3090, sz: 3400, stop: 3460, lx: 150, rx: 330, walls: [{ id: 'wB', z0: 3150, z1: 3550, ...WALLX }],
         defs: [{ id: 'L', z: 3400, x: 150, kind: 'weapon', durability: 12, maxDurability: 12, payload: { weapon: 'auto' } },
                { id: 'R', z: 3400, x: 330, kind: 'weapon', durability: 24, maxDurability: 24, payload: { weapon: 'heavy' } }] },
  wD:  { commitZ: 5940, sz: 6300, stop: 6360, lx: 150, rx: 330, walls: [{ id: 'wD', z0: 6000, z1: 7200, ...WALLX }],
         defs: [{ id: 'L', z: 6300, x: 150, kind: 'soldier', durability: 20, maxDurability: 20, payload: { n: 10 } },
                { id: 'R', z: 6300, x: 330, kind: 'soldier', durability: 20, maxDurability: 20, payload: { n: 10 } }] },
};
const out = {};
console.log('=== ① 1px 정밀 스윕 + 역방향(우→좌) · 새 coverZ');
for (const [k, c] of Object.entries(C)) {
  const cover = coverFor(c.commitZ, c.sz);
  const rec = { coverNew: cover, fwd: {}, rev: {} };
  const ns = k === 's2' ? [4, 5, 6, 8, 12] : k === 'p1' ? [8, 10, 12, 15, 25] : k === 'p2' ? [20, 25, 30, 40] : [25, 30, 40];
  for (const n of ns) {
    const f = [], b = [];
    for (let T = c.commitZ - 400; T <= c.commitZ; T += 1) {
      if (dash(c.defs, c.walls, cover, c.stop, n, 'rifle', T, c.lx, c.rx).both) f.push(T);
      if (dash(c.defs, c.walls, cover, c.stop, n, 'rifle', T, c.rx, c.lx).both) b.push(T);
    }
    rec.fwd['n' + n] = f; rec.rev['n' + n] = b;
    console.log(`  ${k} coverZ=${cover} n=${n}  좌→우 둘다열림 ${f.length}건  우→좌 둘다열림 ${b.length}건`);
  }
  out[k] = rec;
}
console.log('=== ② 새 coverZ 에서 한쪽 고정 노선이 통을 여는가 (좌 고정 / 우 고정)');
const openTab = {};
for (const [k, c] of Object.entries(C)) {
  const cover = coverFor(c.commitZ, c.sz);
  const rows = {};
  const ns = k === 's2' ? [2, 3, 4, 5, 6, 8] : k === 'p1' ? [5, 8, 10, 12, 15] : k === 'p2' ? [5, 8, 10, 12, 15, 20, 25] : [10, 15, 20, 25, 30];
  for (const n of ns) {
    const L = dash(c.defs, c.walls, cover, c.stop, n, 'rifle', -1e9, c.lx, c.lx); // 계속 좌
    const R = dash(c.defs, c.walls, cover, c.stop, n, 'rifle', -1e9, c.rx, c.rx); // 계속 우
    const Lold = dash(c.defs, c.walls, c.commitZ, c.stop, n, 'rifle', -1e9, c.lx, c.lx);
    const Rold = dash(c.defs, c.walls, c.commitZ, c.stop, n, 'rifle', -1e9, c.rx, c.rx);
    rows['n' + n] = { 좌고정_좌통: L.L, 좌고정_유효탄: L.hits.L, 우고정_우통: R.R, 우고정_유효탄: R.hits.R,
                      옛_좌고정_유효탄: Lold.hits.L, 옛_우고정_유효탄: Rold.hits.R };
    console.log(`  ${k} n=${String(n).padStart(2)}  좌고정 좌통 ${L.L ? 'O' : 'X'}(유효탄 ${L.hits.L}, 옛 ${Lold.hits.L})   우고정 우통 ${R.R ? 'O' : 'X'}(유효탄 ${R.hits.R}, 옛 ${Rold.hits.R})`);
  }
  openTab[k] = { coverNew: cover, rows };
}
writeFileSync(new URL('./r31-open-verify.json', import.meta.url), JSON.stringify({ sweep: out, openable: openTab }, null, 2));
