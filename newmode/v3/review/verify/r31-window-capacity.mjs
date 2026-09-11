// 새 coverZ 창 안에서 '내구 상한 없이' 통에 들어가는 유효탄 수(= 개봉 가능 내구의 상한).
// 통 내구를 9999 로 두고 끝까지 세고, 옛 coverZ(확정선)와 나란히 비교한다. 읽기 전용.
import { createRun, stepRun, drainEvents } from '../../../../rush3/combat.js';
import { BAL3 } from '../../../../rush3/balance.js';
import { writeFileSync } from 'node:fs';
const SCROLL = BAL3.scroll, VZMIN = BAL3.weapons.heavy.vz;
const coverFor = (c, z) => Math.ceil(c + (z - c) * SCROLL / VZMIN);
function cap(n, weapon, sz, sx, cover, stop) {
  const st = { id: 99, version: 2, title: 't', startUnits: n, startWeapon: weapon, length: stop + 400, eliteZ: null,
    elite: null, spawns: [], gateRows: [], walls: [],
    supplies: [{ id: 'c', z: sz, x: sx, kind: 'soldier', durability: 9999, maxDurability: 9999, payload: { n: 1 } }] };
  const r = createRun(st); let hit = 0;
  while (!r.over && r.z < stop) {
    r.supplies[0].locked = r.z < cover;
    stepRun(r, { pointerX: sx });
    for (const e of drainEvents(r)) if (e.type === 'supplyHit') hit++;
  }
  return hit;
}
const CASES = [
  { k: 'S2 c1 좌(z2300 x120)', commitZ: 1740, sz: 2300, sx: 120, ns: [2, 3, 5, 8] },
  { k: 'S2 c2 우(z2300 x326)', commitZ: 1740, sz: 2300, sx: 326, ns: [2, 3, 5, 8] },
  { k: 'S3 p1(z2800)',        commitZ: 2340, sz: 2800, sx: 150, ns: [5, 8, 10, 12, 15] },
  { k: 'S3 p2(z3400)',        commitZ: 3090, sz: 3400, sx: 150, ns: [5, 6, 7, 8, 10, 12, 15, 20, 25] },
  { k: 'S3 wD(z6300)',        commitZ: 5940, sz: 6300, sx: 150, ns: [10, 15, 20, 25, 30] },
];
const out = {};
for (const c of CASES) {
  const nc = coverFor(c.commitZ, c.sz), rows = {};
  console.log(`=== ${c.k}  확정선 ${c.commitZ} · coverZ 옛 ${c.commitZ} → 새 ${nc} (창 ${c.sz - c.commitZ} → ${c.sz - nc}px)`);
  for (const n of c.ns) {
    const o = cap(n, 'rifle', c.sz, c.sx, c.commitZ, c.sz + 40);
    const w = cap(n, 'rifle', c.sz, c.sx, nc, c.sz + 40);
    rows['n' + n] = { 옛창_유효탄: o, 새창_유효탄: w };
    console.log(`   소총 n=${String(n).padStart(2)}  옛 ${String(o).padStart(3)}발 → 새 ${String(w).padStart(3)}발`);
  }
  out[c.k] = { commitZ: c.commitZ, coverOld: c.commitZ, coverNew: nc, rows };
}
writeFileSync(new URL('./r31-window-capacity.json', import.meta.url), JSON.stringify(out, null, 2));
