// 지적2 후속: plan 정책의 선택 C 구간을 '통 개봉 감지' 가 아니라 고정 z 스크립트로 썼을 때도
// 좌 통 개봉 + 우 칸 +40 이 되는가(= §4-5 plan 표에 적을 값). 읽기 전용.
import { createRun, stepRun, drainEvents } from '../../../../rush3/combat.js';
function run1(n, weapon, switchZ, dur = 24) {
  const st = { id: 99, version: 2, title: 't', startUnits: n, startWeapon: weapon, length: 4400, eliteZ: null,
    elite: null, spawns: [], walls: [],
    supplies: [{ id: 'c', z: 3900, x: 150, kind: 'soldier', durability: dur, maxDurability: dur, payload: { n: 4 } }],
    gateRows: [{ id: 'g1', z: 4000, h: 24, passed: false, bypass: false,
      cells: [{ x0: 80, x1: 240, value: 3, maxValue: 12 }, { x0: 240, x1: 400, value: -25, maxValue: 40 }] }] };
  const r = createRun(st); let openZ = null, right = 0;
  while (!r.over && r.z < 4000) {
    r.supplies[0].locked = r.z < 3660;
    r.gateRows[0].passed = 4000 - r.z > 340;
    stepRun(r, { pointerX: r.z < switchZ ? 150 : 320 });
    for (const e of drainEvents(r)) if ((e.type === 'gateHit' || e.type === 'gateFlip') && e.idx === 1) right++;
    if (openZ === null && r.supplies[0].opened) openZ = +r.z.toFixed(0);
  }
  return { 개봉: r.supplies[0].opened, openZ, 우칸유효탄: right, 우칸값: r.gateRows[0].cells[1].value };
}
for (const sw of [3730, 3760, 3800, 3850]) {
  for (const [w, n] of [['auto', 25], ['auto', 29], ['auto', 15], ['rifle', 25]]) {
    const o = run1(n, w, sw);
    console.log(`switchZ ${sw}  ${w} n=${String(n).padStart(2)}  개봉 ${o.개봉 ? 'O z' + o.openZ : 'X'}  우칸유효탄 ${String(o.우칸유효탄).padStart(3)}  우칸값 ${o.우칸값}`);
  }
}
