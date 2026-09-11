// r3 수정안 2차 측정: 선택 C 의 통 내구·x 변형과 S1 z5300 xs 변형. 읽기 전용, 게임 코드 무수정.
// 에뮬레이션 규칙은 r3-fix-probe.mjs 와 같다(coverZ = locked 토글, armZ = passed 토글, track0 = x 되돌림).
import { createRun, stepRun, drainEvents } from '../../../rush3/combat.js';
import { buildStage } from '../../../rush3/stages.js';
import { formationHalfWidth } from '../../../rush3/squad.js';
import { writeFileSync } from 'node:fs';

const out = {};

function choiceC(n, route, dur, bx, bz, coverZ) {
  const st = { id: 99, version: 2, title: 't', startUnits: n, startWeapon: 'rifle', length: 4400, eliteZ: null,
    elite: null, spawns: [], walls: [],
    supplies: [{ id: 'c', z: bz, x: bx, kind: 'soldier', durability: dur, maxDurability: dur, payload: { n: 4 } }],
    gateRows: [{ id: 'g1', z: 4000, h: 24, passed: false, bypass: false,
      cells: [{ x0: 80, x1: 240, value: 3, maxValue: 12 }, { x0: 240, x1: 400, value: -25, maxValue: 40 }] }] };
  const r = createRun(st);
  let openZ = null, rightZ = null, right = 0;
  while (!r.over && r.z < 4000) {
    r.supplies[0].locked = r.z < coverZ;
    r.gateRows[0].passed = 4000 - r.z > 340;
    const px = route === 'right' ? 320 : (r.supplies[0].opened ? 320 : bx);
    stepRun(r, { pointerX: px });
    for (const e of drainEvents(r)) if ((e.type === 'gateHit' || e.type === 'gateFlip') && e.idx === 1) right++;
    if (openZ === null && r.supplies[0].opened) openZ = r.z;
    if (openZ !== null && rightZ === null && r.x >= 240) rightZ = r.z;
  }
  const c = r.gateRows[0].cells;
  return { 개봉: r.supplies[0].opened, openZ: openZ && +openZ.toFixed(0), rightZ: rightZ && +rightZ.toFixed(0),
    남은창px: rightZ ? +(4000 - rightZ).toFixed(0) : 0, 우칸유효탄: right, 우칸값: c[1].value, 좌칸값: c[0].value };
}
out.choiceC변형 = {};
for (const [tag, dur, bx, bz, cz] of [
  ['내구12 x150 z3900 cover3660', 12, 150, 3900, 3660],
  ['내구20 x150 z3900 cover3660', 20, 150, 3900, 3660],
  ['내구24 x150 z3900 cover3660', 24, 150, 3900, 3660],
  ['내구30 x150 z3900 cover3660', 30, 150, 3900, 3660],
  ['내구24 x120 z3900 cover3660', 24, 120, 3900, 3660],
  ['내구24 x120 z3950 cover3660', 24, 120, 3950, 3660],
]) {
  out.choiceC변형[tag] = {};
  for (const n of [8, 12, 15, 20, 25, 30, 40, 50]) {
    out.choiceC변형[tag]['좌' + n] = choiceC(n, 'left', dur, bx, bz, cz);
    out.choiceC변형[tag]['우' + n] = choiceC(n, 'right', dur, bx, bz, cz);
  }
}

// S1 z5300 xs 변형 (잡졸 track 0 에뮬)
function s1Run(policy, xs, dz) {
  const st = buildStage(1);
  if (xs) {
    const sp = st.spawns.find((s) => s.z === 5300 && s.kind === 'grunt');
    sp.n = xs.length; sp.xs = xs.slice(); sp.zs = xs.map((_, i) => 5300 + 760 + (dz ? dz[i] : 0));
  }
  const r = createRun(st);
  let minGap = Infinity, gx = new Map();
  for (let k = 0; k < 14400 && !r.over; k++) {
    gx = new Map(); for (const e of r.enemies) if (e.kind === 'grunt') gx.set(e.id, e.x);
    stepRun(r, { pointerX: policy === 'center' ? 240 : policy === 'left' ? 160 : 320 });
    for (const e of r.enemies) if (e.kind === 'grunt' && gx.has(e.id)) e.x = gx.get(e.id);
    drainEvents(r);
    const hw = formationHalfWidth(r.units.length);
    for (const e of r.enemies) if (e.kind === 'grunt' && !e.dead && Math.abs(e.z - r.z) < 60) minGap = Math.min(minGap, Math.abs(e.x - r.x) - e.r - hw);
  }
  return { won: r.won, peak: r.peak, survivors: r.units.length, time: +r.time.toFixed(1), 최소여유px: Number.isFinite(minGap) ? +minGap.toFixed(1) : null };
}
out.s1변형 = {
  'A 94/136/320/362 + 115/341': s1Run('center', [94, 136, 320, 362, 115, 341], [0, 0, 0, 0, 40, 40]),
  'B 94/136/330/372 + 115/351': s1Run('center', [94, 136, 330, 372, 115, 351], [0, 0, 0, 0, 40, 40]),
  'B left': s1Run('left', [94, 136, 330, 372, 115, 351], [0, 0, 0, 0, 40, 40]),
  'B right': s1Run('right', [94, 136, 330, 372, 115, 351], [0, 0, 0, 0, 40, 40]),
};
writeFileSync(new URL('./probe-results-r3fix2.json', import.meta.url), JSON.stringify(out, null, 2));
for (const [tag, rows] of Object.entries(out.choiceC변형)) {
  console.log('== ' + tag);
  for (const [k, v] of Object.entries(rows)) console.log('  ' + k.padEnd(5), JSON.stringify(v));
}
console.log('== S1'); for (const [k, v] of Object.entries(out.s1변형)) console.log('  ' + k.padEnd(28), JSON.stringify(v));
