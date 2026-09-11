// p2(선택 B) 창 회복안 비교: 통 z 를 벽 확정선에서 더 띄우면 새 coverZ 에서도 창이 회복되는가. 읽기 전용.
import { createRun, stepRun, drainEvents } from '../../../../rush3/combat.js';
import { BAL3 } from '../../../../rush3/balance.js';
const SCROLL = BAL3.scroll, VZMIN = BAL3.weapons.heavy.vz;
const coverFor = (c, z) => Math.ceil(c + (z - c) * SCROLL / VZMIN);
function cap(n, sz, sx, cover) {
  const st = { id: 99, version: 2, title: 't', startUnits: n, startWeapon: 'rifle', length: sz + 440, eliteZ: null,
    elite: null, spawns: [], gateRows: [], walls: [],
    supplies: [{ id: 'c', z: sz, x: sx, kind: 'soldier', durability: 9999, maxDurability: 9999, payload: { n: 1 } }] };
  const r = createRun(st); let hit = 0;
  while (!r.over && r.z < sz + 40) { r.supplies[0].locked = r.z < cover; stepRun(r, { pointerX: sx });
    for (const e of drainEvents(r)) if (e.type === 'supplyHit') hit++; }
  return hit;
}
for (const sz of [3400, 3450, 3500, 3540]) {
  const cover = coverFor(3090, sz);
  const line = [5, 6, 7, 8, 10, 12, 15].map(n => `n${n}=${String(cap(n, sz, 150, cover)).padStart(3)}`).join('  ');
  console.log(`통 z${sz}  coverZ ${cover}  창 ${sz - cover}px   ${line}`);
}
