// r3.1 지적1 검증: 차폐 개방선을 '확정선' 대신 '비행시간 보정선'으로 올리면
// 대시 정책(확정 직전까지 좌에 붙어 사격 → T 에서 우로)이 양쪽을 다 열 수 있는지.
// 읽기 전용. 게임 코드 무수정. coverZ 는 dash2.mjs 와 같은 방식(locked)으로 에뮬레이션.
import { createRun, stepRun, drainEvents } from '../../../../rush3/combat.js';
import { BAL3 } from '../../../../rush3/balance.js';
import { writeFileSync } from 'node:fs';

const SCROLL = BAL3.scroll;                 // 190
const VZMIN = BAL3.weapons.heavy.vz;        // 650 (가장 느린 탄)
const coverFor = (commitZ, sz) => Math.ceil(commitZ + (sz - commitZ) * SCROLL / VZMIN);

function stage(o) {
  return { id: 99, version: 2, title: 't', startUnits: o.n, startWeapon: o.weapon ?? 'rifle',
    length: o.length ?? 12000, eliteZ: null, elite: null, spawns: [], gateRows: [],
    supplies: o.supplies ?? [], walls: o.walls ?? [] };
}
function pre(r) { for (const s of r.supplies) if (s.coverZ != null) s.locked = r.z < s.coverZ; }

// 정책: run.z < T 이면 lx, 아니면 rx (확정 직전 대시)
function dash(defs, walls, coverZ, stopZ, n, weapon, T, lx, rx) {
  const st = stage({ n, weapon, supplies: defs.map(d => ({ ...d, payload: { ...d.payload } })), walls, length: stopZ + 400 });
  const r = createRun(st);
  for (const s of r.supplies) s.coverZ = coverZ;
  const openZ = {};
  while (!r.over && r.z < stopZ) {
    const px = r.z < T ? lx : rx;
    pre(r); stepRun(r, { pointerX: px }); drainEvents(r);
    for (const s of r.supplies) if (s.opened && openZ[s.id] == null) openZ[s.id] = +r.z.toFixed(1);
  }
  return { L: r.supplies[0].opened, R: r.supplies[1].opened, both: r.supplies[0].opened && r.supplies[1].opened,
    missed: r.missedSupplies, side: JSON.stringify(r.wallSide), openZ };
}

const WALLX = { x0: 228, x1: 252 };
const CASES = [
  { name: 'S2 c1/c2 (벽 1800~3000, 통 z2300 내구 6/12)', commitZ: 1740, sz: 2300, stop: 2360, lx: 120, rx: 330,
    walls: [{ id: 'w1', z0: 1800, z1: 3000, ...WALLX }],
    defs: [{ id: 'c1', z: 2300, x: 120, kind: 'soldier', durability: 6, maxDurability: 6, payload: { n: 3 } },
           { id: 'c2', z: 2300, x: 326, kind: 'weapon', durability: 12, maxDurability: 12, payload: { weapon: 'auto' } }],
    ns: [2, 3, 4, 5, 6, 7, 8, 12], weapon: 'rifle' },
  { name: 'S3 p1 (벽 2400~2900, 통 z2800 내구 10/10)', commitZ: 2340, sz: 2800, stop: 2860, lx: 150, rx: 330,
    walls: [{ id: 'wA', z0: 2400, z1: 2900, ...WALLX }],
    defs: [{ id: 'L', z: 2800, x: 150, kind: 'chain', durability: 10, maxDurability: 10, payload: { pads0: 5, maxPads: 15 } },
           { id: 'R', z: 2800, x: 330, kind: 'soldier', durability: 10, maxDurability: 10, payload: { n: 5 } }],
    ns: [8, 9, 10, 11, 12, 15, 25], weapon: 'rifle' },
  { name: 'S3 p2 (벽 3150~3550, 통 z3400 내구 12/24)', commitZ: 3090, sz: 3400, stop: 3460, lx: 150, rx: 330,
    walls: [{ id: 'wB', z0: 3150, z1: 3550, ...WALLX }],
    defs: [{ id: 'L', z: 3400, x: 150, kind: 'weapon', durability: 12, maxDurability: 12, payload: { weapon: 'auto' } },
           { id: 'R', z: 3400, x: 330, kind: 'weapon', durability: 24, maxDurability: 24, payload: { weapon: 'heavy' } }],
    ns: [15, 20, 25, 30, 40], weapon: 'rifle' },
  { name: 'S3 wD (벽 6000~7200, 좌 통 z6300 내구 20 / 우 빈 통로)', commitZ: 5940, sz: 6300, stop: 6360, lx: 150, rx: 330,
    walls: [{ id: 'wD', z0: 6000, z1: 7200, ...WALLX }],
    defs: [{ id: 'L', z: 6300, x: 150, kind: 'soldier', durability: 20, maxDurability: 20, payload: { n: 10 } },
           { id: 'Rdummy', z: 6300, x: 330, kind: 'soldier', durability: 20, maxDurability: 20, payload: { n: 10 } }],
    ns: [20, 25, 30, 40], weapon: 'rifle' },
];

const out = { scroll: SCROLL, vzMin: VZMIN, cases: {} };
for (const c of CASES) {
  const oldCover = c.commitZ, newCover = coverFor(c.commitZ, c.sz);
  const rec = { commitZ: c.commitZ, supplyZ: c.sz, coverOld: oldCover, coverNew: newCover, old: {}, new: {} };
  for (const [tag, cover] of [['old', oldCover], ['new', newCover]]) {
    for (const n of c.ns) {
      const hits = [];
      for (let T = c.commitZ - 400; T <= c.commitZ; T += 5) {
        const o = dash(c.defs, c.walls, cover, c.stop, n, c.weapon, T, c.lx, c.rx);
        if (o.both) hits.push(T);
      }
      rec[tag]['n' + n] = hits;
    }
  }
  out.cases[c.name] = rec;
  console.log('=== ' + c.name);
  console.log('  확정선 ' + c.commitZ + ' · 통 z ' + c.sz + ' · coverZ 옛 ' + oldCover + ' → 새 ' + newCover);
  for (const n of c.ns) {
    const o = rec.old['n' + n], nw = rec.new['n' + n];
    console.log('  n=' + String(n).padStart(2) + '  옛: 둘다열림 T ' + (o.length ? o.length + '개 ' + o[0] + '~' + o[o.length - 1] : '없음')
      + '   새: 둘다열림 T ' + (nw.length ? nw.length + '개 ' + nw[0] + '~' + nw[nw.length - 1] : '없음'));
  }
}
writeFileSync(new URL('./r31-cover-verify.json', import.meta.url), JSON.stringify(out, null, 2));
