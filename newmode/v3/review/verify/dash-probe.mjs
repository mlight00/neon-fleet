// 검토용 읽기전용 진단: coverZ = 벽 확정선 이 '비행 중 탄' 때문에 배타를 못 닫는지.
// 정책 = 확정선 직전까지 좌에 붙어 쏘다가 T 에서 우로 대시.
import { createRun, stepRun, drainEvents } from 'file:///E:/workspace/claude/neon-fleet/worktrees/v3-lastwar/rush3/combat.js';

function stage(o) {
  return { id: 99, version: 2, title: 't', startUnits: o.n, startWeapon: o.weapon ?? 'rifle',
    length: o.length ?? 12000, eliteZ: null, elite: null, spawns: [],
    gateRows: [], supplies: o.supplies ?? [], walls: o.walls ?? [] };
}
function pre(r) { for (const s of r.supplies) if (s.coverZ != null) s.locked = r.z < s.coverZ; }

function dash(defs, walls, coverZ, stopZ, n, weapon, T, lx, rx) {
  const st = stage({ n, weapon, supplies: defs.map(d => ({ ...d, payload: { ...d.payload } })), walls, length: stopZ + 400 });
  const r = createRun(st);
  for (const s of r.supplies) s.coverZ = coverZ;
  let openZ = {};
  while (!r.over && r.z < stopZ) {
    const px = r.z < T ? lx : rx;
    pre(r);
    stepRun(r, { pointerX: px });
    drainEvents(r);
    for (const s of r.supplies) if (s.opened && openZ[s.id] == null) openZ[s.id] = Math.round(r.z);
  }
  const L = r.supplies[0], R = r.supplies[1];
  return { L: L.opened, R: R.opened, both: L.opened && R.opened, missed: r.missedSupplies, side: JSON.stringify(r.wallSide), openZ };
}

const WALLX = { x0: 228, x1: 252 };
console.log('=== S2 c1/c2 (wall 1800~3000, commit 1740, crates z2300 dur 6/12) ===');
const s2defs = [
  { id: 'c1', z: 2300, x: 120, kind: 'soldier', durability: 6, maxDurability: 6, payload: { n: 3 } },
  { id: 'c2', z: 2300, x: 326, kind: 'weapon', durability: 12, maxDurability: 12, payload: { weapon: 'auto' } },
];
const s2wall = [{ id: 'w1', z0: 1800, z1: 3000, ...WALLX }];
for (const n of [2, 3, 5, 8]) {
  for (const T of [1500, 1560, 1600, 1650, 1700, 1739]) {
    const o = dash(s2defs, s2wall, 1740, 2360, n, 'rifle', T, 120, 330);
    console.log(`n=${n} T=${T} -> L=${o.L} R=${o.R} BOTH=${o.both} missed=${o.missed} side=${o.side} openZ=${JSON.stringify(o.openZ)}`);
  }
}
console.log('=== S3 p1 (wall 2400~2900, commit 2340, crates z2800 dur 10/10) ===');
const p1defs = [
  { id: 'L', z: 2800, x: 150, kind: 'chain', durability: 10, maxDurability: 10, payload: { pads0: 5, maxPads: 15 } },
  { id: 'R', z: 2800, x: 330, kind: 'soldier', durability: 10, maxDurability: 10, payload: { n: 5 } },
];
const wA = [{ id: 'wA', z0: 2400, z1: 2900, ...WALLX }];
for (const n of [5, 8, 10, 15, 25]) {
  for (const T of [2170, 2200, 2250, 2300, 2339]) {
    const o = dash(p1defs, wA, 2340, 2860, n, 'rifle', T, 150, 330);
    console.log(`n=${n} T=${T} -> L=${o.L} R=${o.R} BOTH=${o.both} missed=${o.missed} side=${o.side} openZ=${JSON.stringify(o.openZ)}`);
  }
}
console.log('=== S3 p2 (wall 3150~3550, commit 3090, crates z3400 dur 12/24) ===');
const p2defs = [
  { id: 'L', z: 3400, x: 150, kind: 'weapon', durability: 12, maxDurability: 12, payload: { weapon: 'auto' } },
  { id: 'R', z: 3400, x: 330, kind: 'weapon', durability: 24, maxDurability: 24, payload: { weapon: 'heavy' } },
];
const wB = [{ id: 'wB', z0: 3150, z1: 3550, ...WALLX }];
for (const n of [10, 15, 25, 40]) {
  for (const T of [2980, 3000, 3030, 3060, 3089]) {
    const o = dash(p2defs, wB, 3090, 3460, n, 'rifle', T, 150, 330);
    console.log(`n=${n} T=${T} -> L=${o.L} R=${o.R} BOTH=${o.both} missed=${o.missed} side=${o.side} openZ=${JSON.stringify(o.openZ)}`);
  }
}
