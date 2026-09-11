// 읽기 전용 진단: r3 초안 §4-3 의 '같은 z 좌우 쌍'이 실제로 양자택일인지 확인. 게임 코드 무수정.
import { createRun, stepRun } from '../../../rush3/combat.js';

function stage(n, defs) {
  return { id: 99, version: 2, title: 't', startUnits: n, startWeapon: 'rifle', length: 9000,
    eliteZ: null, gateRows: [], walls: [], spawns: [], elite: null, supplies: defs };
}
function run(n, weapon, defs, stopZ) {
  const st = stage(n, defs); st.startWeapon = weapon;
  const r = createRun(st);
  while (!r.over && r.z < stopZ) {
    const L = r.supplies[0];
    stepRun(r, { pointerX: L.opened ? r.supplies[1].x : L.x });
  }
  return r;
}
// p1(z2800): 좌 x150 내구10 병사5 / 우 x330 내구10 병사5
for (const n of [5, 10, 15, 25]) {
  const r = run(n, 'rifle', [
    { id: 'L', z: 2800, x: 150, kind: 'soldier', durability: 10, maxDurability: 10, payload: { n: 5 } },
    { id: 'R', z: 2800, x: 330, kind: 'soldier', durability: 10, maxDurability: 10, payload: { n: 5 } },
  ], 2860);
  console.log(`p1 rifle 시작${n}명 → 좌 opened=${r.supplies[0].opened} 우 opened=${r.supplies[1].opened} missed=${r.missedSupplies}`);
}
// p2(z3400): 좌 auto 내구12 / 우 heavy 내구30
for (const [n, w] of [[15, 'rifle'], [25, 'auto'], [25, 'rifle']]) {
  const r = run(n, w, [
    { id: 'L', z: 3400, x: 150, kind: 'weapon', durability: 12, maxDurability: 12, payload: { weapon: 'auto' } },
    { id: 'R', z: 3400, x: 330, kind: 'weapon', durability: 30, maxDurability: 30, payload: { weapon: 'heavy' } },
  ], 3460);
  console.log(`p2 ${w} 시작${n}명 → 좌 opened=${r.supplies[0].opened} 우 opened=${r.supplies[1].opened} 최종무기=${r.weapon}`);
}
