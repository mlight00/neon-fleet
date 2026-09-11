// 선택 C 를 기관총(auto)·중화기(heavy)로도 측정 — 배제가 성립하는 병력 상한을 찾는다. 읽기 전용.
import { createRun, stepRun, drainEvents } from '../../../rush3/combat.js';
import { writeFileSync } from 'node:fs';
function choiceC(n, weapon, route, dur = 24, bx = 150, bz = 3900, cz = 3660) {
  const st = { id: 99, version: 2, title: 't', startUnits: n, startWeapon: weapon, length: 4400, eliteZ: null,
    elite: null, spawns: [], walls: [],
    supplies: [{ id: 'c', z: bz, x: bx, kind: 'soldier', durability: dur, maxDurability: dur, payload: { n: 4 } }],
    gateRows: [{ id: 'g1', z: 4000, h: 24, passed: false, bypass: false,
      cells: [{ x0: 80, x1: 240, value: 3, maxValue: 12 }, { x0: 240, x1: 400, value: -25, maxValue: 40 }] }] };
  const r = createRun(st);
  let openZ = null, rightZ = null, right = 0;
  while (!r.over && r.z < 4000) {
    r.supplies[0].locked = r.z < cz;
    r.gateRows[0].passed = 4000 - r.z > 340;
    stepRun(r, { pointerX: route === 'right' ? 320 : (r.supplies[0].opened ? 320 : bx) });
    for (const e of drainEvents(r)) if ((e.type === 'gateHit' || e.type === 'gateFlip') && e.idx === 1) right++;
    if (openZ === null && r.supplies[0].opened) openZ = r.z;
    if (openZ !== null && rightZ === null && r.x >= 240) rightZ = r.z;
  }
  return { 개봉: r.supplies[0].opened, openZ: openZ && +openZ.toFixed(0), rightZ: rightZ && +rightZ.toFixed(0),
    남은창px: rightZ ? +(4000 - rightZ).toFixed(0) : 0, 우칸유효탄: right, 우칸값: r.gateRows[0].cells[1].value };
}
const out = {};
for (const weapon of ['rifle', 'auto', 'heavy']) {
  out[weapon] = {};
  for (const n of [8, 10, 12, 15, 20, 25, 30, 40]) {
    out[weapon]['좌통' + n] = choiceC(n, weapon, 'left');
    out[weapon]['우고정' + n] = choiceC(n, weapon, 'right');
  }
}
writeFileSync(new URL('./probe-results-r3fix4.json', import.meta.url), JSON.stringify(out, null, 2));
for (const [w, rows] of Object.entries(out)) { console.log('== ' + w); for (const [k, v] of Object.entries(rows)) console.log('  ' + k.padEnd(8), JSON.stringify(v)); }
