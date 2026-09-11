// 지적2 검증: §4-5 plan 노선이 실제로 도달하는 병력대(기관총 25명 안팎)에서 선택 C 가 저울인가, 아니면 둘 다인가.
// r3-fix-probe4.mjs 와 같은 방식(통 locked 로 coverZ, 게이트 passed 로 armZ 에뮬레이션). 읽기 전용.
import { createRun, stepRun, drainEvents } from '../../../../rush3/combat.js';
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
console.log('=== 선택 C · 좌 통(내구 24, coverZ 3660) 을 열고 우 칸으로 이동');
for (const [w, ns] of [['auto', [12, 15, 20, 25, 29, 30]], ['rifle', [15, 20, 25, 29, 30]]]) {
  for (const n of ns) {
    const o = choiceC(n, w, 'left');
    out[`${w}_좌통${n}`] = o;
    console.log(`  ${w} n=${String(n).padStart(2)}  개봉 ${o.개봉 ? 'O' : 'X'} z${o.openZ}  우칸도착 z${o.rightZ}  남은창 ${o.남은창px}px  유효탄 ${o.우칸유효탄}  → 우칸값 ${o.우칸값}`);
  }
}
writeFileSync(new URL('./r31-choiceC-plan.json', import.meta.url), JSON.stringify(out, null, 2));
