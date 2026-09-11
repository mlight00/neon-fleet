// 읽기 전용 진단: r3 초안 §4-4 '선택 C' 배타성 검증(통 z3900 x150 내구12 → 게이트 z4000 armZ 340).
// 셔터는 아직 코드에 없으므로 '통 개봉 시점 run.z' 와 '우 칸(x>=240) 도착 run.z' 만 실측해
// 셔터가 열리는 run.z 3660 이전에 옮겨설 수 있는지 본다. 게임 코드 무수정.
import { createRun, stepRun } from '../../../rush3/combat.js';

for (const n of [8, 12, 20]) {
  const st = { id: 99, version: 2, title: 't', startUnits: n, startWeapon: 'rifle', length: 9000,
    eliteZ: null, gateRows: [], walls: [], spawns: [], elite: null,
    supplies: [{ id: 'c', z: 3900, x: 150, kind: 'soldier', durability: 12, maxDurability: 12, payload: { n: 4 } }] };
  const r = createRun(st);
  let openZ = null, rightZ = null;
  while (!r.over && r.z < 4000) {
    stepRun(r, { pointerX: r.supplies[0].opened ? 320 : 150 });
    if (openZ === null && r.supplies[0].opened) openZ = r.z;
    if (openZ !== null && rightZ === null && r.x >= 240) rightZ = r.z;
  }
  console.log(`시작 ${n}명 rifle: 통 개봉 run.z=${openZ.toFixed(0)} · 우 칸 도착 run.z=${rightZ.toFixed(0)} · 셔터 개방(3660) 이전 도착=${rightZ < 3660}`);
}
