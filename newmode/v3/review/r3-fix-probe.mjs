// r3 초안 지적 8건 수정안 검증용 읽기 전용 진단. 게임 코드는 한 줄도 고치지 않는다.
// 아직 코드에 없는 규칙(armZ 셔터 · coverZ 차폐 · 잡졸 track 0)은 STEP 밖에서 다음처럼 에뮬레이션한다.
//  - coverZ: 차폐 중에는 s.locked = true → supplyActive false → 통이 충돌 후보에서 빠져 내구가 줄지 않는다.
//            (실제 규칙은 '흡수', 여기서는 '통과'. 통 뒤에 아무것도 없는 배치라 측정값은 같다.)
//  - armZ:   닫힌 동안 row.passed = true → 칸 값이 변하지 않는다. 열리는 즉시 false 로 되돌린다(통과 판정 전에 항상 열린다).
//  - track0: STEP 전 잡졸 x 를 스냅샷하고 STEP 뒤 되돌린다(오차 = 35px/s × 1/60 = 0.58px/STEP).
import { createRun, stepRun, drainEvents } from '../../../rush3/combat.js';
import { buildStage } from '../../../rush3/stages.js';
import { formationHalfWidth } from '../../../rush3/squad.js';
import { writeFileSync } from 'node:fs';

const WALLX = { x0: 228, x1: 252 };
const out = {};

function stage(o) {
  return { id: 99, version: 2, title: 't', startUnits: o.n, startWeapon: o.weapon ?? 'rifle',
    length: o.length ?? 12000, eliteZ: null, elite: null, spawns: o.spawns ?? [],
    gateRows: o.gateRows ?? [], supplies: o.supplies ?? [], walls: o.walls ?? [] };
}
function preStep(r, opts) {
  for (const s of r.supplies) if (s.coverZ != null) s.locked = r.z < s.coverZ;
  for (const row of r.gateRows) if (row.armZ != null && !row.passed0) row.passed = row.z - r.z > row.armZ;
  if (opts && opts.track0) { r._gx = new Map(); for (const e of r.enemies) if (e.kind === 'grunt') r._gx.set(e.id, e.x); }
}
function postStep(r, opts) {
  if (opts && opts.track0 && r._gx) for (const e of r.enemies) if (e.kind === 'grunt' && r._gx.has(e.id)) e.x = r._gx.get(e.id);
}

// ── A. 대형 반폭 실측 ────────────────────────────────────────────────
out.formationHalfWidth = {};
for (const n of [1, 2, 3, 5, 8, 10, 14, 20, 26, 30, 40, 50, 75]) out.formationHalfWidth[n] = formationHalfWidth(n);

// ── B. 통 유효탄 = 차폐 개방(coverZ)부터 통 z 까지 통에 들어간 탄 수 ──
// 내구를 아주 크게 잡아 창 안에서 들어가는 탄을 전부 센다. 벽이 있으면 대형 압축까지 반영된다.
function barrelShots(n, x, coverZ, z, walls) {
  const st = stage({ n, supplies: [{ id: 'b', z, x, kind: 'soldier', durability: 999999, maxDurability: 999999, payload: { n: 0 } }], walls, length: z + 400 });
  const r = createRun(st);
  r.supplies[0].coverZ = coverZ;
  let hits = 0;
  while (!r.over && r.z < z + 5) {
    preStep(r);
    stepRun(r, { pointerX: x });
    for (const e of drainEvents(r)) if (e.type === 'supplyHit') hits++;
  }
  return hits;
}
const wA = [{ id: 'wA', z0: 2400, z1: 2900, ...WALLX }];
const wB = [{ id: 'wB', z0: 3150, z1: 3550, ...WALLX }];
const wD = [{ id: 'wD', z0: 6000, z1: 7200, ...WALLX }];
out.barrelShots = {};
for (const [tag, x, cz, z, w] of [
  ['p1좌 x150 창2340~2800', 150, 2340, 2800, wA],
  ['p1우 x330 창2340~2800', 330, 2340, 2800, wA],
  ['p2좌 x150 창3090~3400', 150, 3090, 3400, wB],
  ['p2우 x330 창3090~3400', 330, 3090, 3400, wB],
  ['C좌 x150 창3660~3900', 150, 3660, 3900, []],
  ['D좌 x150 창5940~6300', 150, 5940, 6300, wD],
]) {
  out.barrelShots[tag] = {};
  for (const n of [3, 5, 8, 10, 12, 15, 20, 25, 30, 40]) out.barrelShots[tag][n] = barrelShots(n, x, cz, z, w);
}

// ── C. 쌍 배타성: 벽 + coverZ 로 한 판에 쌍 2개를 열 수 있는가 ────────
// 정책 = 탐욕 봇(가까운 미개봉 통을 노리고, 하나가 열리면 즉시 반대편을 노린다) + 고정 좌/우.
function pairRun(n, weapon, defs, walls, coverZ, stopZ, policy) {
  const st = stage({ n, weapon, supplies: defs.map((d) => ({ ...d })), walls, length: stopZ + 400 });
  const r = createRun(st);
  for (const s of r.supplies) s.coverZ = coverZ;
  while (!r.over && r.z < stopZ) {
    const L = r.supplies[0], R = r.supplies[1];
    let px = 240;
    if (policy === 'left') px = 150;
    else if (policy === 'right') px = 330;
    else px = L.opened ? R.x : L.x;                     // greedy: 좌 먼저, 열리면 우로
    preStep(r);
    stepRun(r, { pointerX: px });
    drainEvents(r);
  }
  return { L: r.supplies[0].opened, R: r.supplies[1].opened, missed: r.missedSupplies, weapon: r.weapon, x: Math.round(r.x) };
}
out.pairExclusivity = { withWall: {}, noWall: {} };
const p1defs = [
  { id: 'L', z: 2800, x: 150, kind: 'chain', durability: 10, maxDurability: 10, payload: { pads0: 5, maxPads: 15 } },
  { id: 'R', z: 2800, x: 330, kind: 'soldier', durability: 10, maxDurability: 10, payload: { n: 5 } },
];
const p2defs = [
  { id: 'L', z: 3400, x: 150, kind: 'weapon', durability: 12, maxDurability: 12, payload: { weapon: 'auto' } },
  { id: 'R', z: 3400, x: 330, kind: 'weapon', durability: 24, maxDurability: 24, payload: { weapon: 'heavy' } },
];
for (const policy of ['greedy', 'left', 'right']) {
  for (const n of [5, 8, 10, 15, 25, 40]) {
    out.pairExclusivity.withWall[`p1 ${policy} ${n}명`] = pairRun(n, 'rifle', p1defs, wA, 2340, 2860, policy);
    out.pairExclusivity.withWall[`p2 ${policy} ${n}명`] = pairRun(n, 'rifle', p2defs, wB, 3090, 3460, policy);
    out.pairExclusivity.noWall[`p1 ${policy} ${n}명`] = pairRun(n, 'rifle', p1defs, [], null, 2860, policy);
    out.pairExclusivity.noWall[`p2 ${policy} ${n}명`] = pairRun(n, 'rifle', p2defs, [], null, 3460, policy);
  }
}

// ── D. 선택 C: 통 z3900 coverZ 3660(= 게이트 4000 − armZ 340) ────────
// 좌 통을 연 노선과 우 고정 노선이 각각 게이트 우 칸에 넣는 유효탄 수를 잰다.
function choiceC(n, route, dur = 12) {
  const st = stage({
    n,
    supplies: [{ id: 'c', z: 3900, x: 150, kind: 'soldier', durability: dur, maxDurability: dur, payload: { n: 4 } }],
    gateRows: [{ id: 'g1', z: 4000, h: 24, passed: false, bypass: false,
      cells: [{ x0: 80, x1: 240, value: 3, maxValue: 12 }, { x0: 240, x1: 400, value: -25, maxValue: 40 }] }],
    length: 4400,
  });
  const r = createRun(st);
  r.supplies[0].coverZ = 3660;
  r.gateRows[0].armZ = 340;
  let openZ = null, rightZ = null, rightHits = 0, leftHits = 0;
  while (!r.over && r.z < 4000) {
    const px = route === 'right' ? 320 : (r.supplies[0].opened ? 320 : 150);
    preStep(r);
    stepRun(r, { pointerX: px });
    for (const e of drainEvents(r)) {
      if (e.type === 'gateHit' || e.type === 'gateFlip') { if (e.idx === 1) rightHits++; else leftHits++; }
    }
    if (openZ === null && r.supplies[0].opened) openZ = r.z;
    if (openZ !== null && rightZ === null && r.x >= 240) rightZ = r.z;
  }
  const c = r.gateRows[0].cells;
  return { openZ: openZ === null ? null : +openZ.toFixed(0), rightZ: rightZ === null ? null : +rightZ.toFixed(0),
    남은사격창px: rightZ === null ? 0 : Math.max(0, +(4000 - rightZ).toFixed(0)),
    우칸유효탄: rightHits, 좌칸유효탄: leftHits, 좌칸값: c[0].value, 우칸값: c[1].value, 개봉: r.supplies[0].opened };
}
out.choiceC = {};
for (const n of [5, 8, 12, 15, 20, 25, 30, 40]) {
  out.choiceC[`${n}명 좌통노선`] = choiceC(n, 'left');
  out.choiceC[`${n}명 우고정`] = choiceC(n, 'right');
}

// ── E. S1 z5300 회피 통로: 잡졸 track 0 에뮬로 center(x240 무조작) 완주 확인 ──
function s1Run(policy, xs, dz, track0) {
  const st = buildStage(1);
  if (xs) {
    const sp = st.spawns.find((s) => s.z === 5300 && s.kind === 'grunt');
    sp.n = xs.length; sp.xs = xs.slice(); sp.zs = xs.map((_, i) => 5300 + 760 + (dz ? dz[i] : 0));
  }
  const r = createRun(st);
  let minGap = Infinity;
  for (let k = 0; k < 14400 && !r.over; k++) {
    preStep(r, { track0 });
    stepRun(r, { pointerX: policy === 'center' ? 240 : policy === 'left' ? 160 : 320 });
    postStep(r, { track0 });
    drainEvents(r);
    const hw = formationHalfWidth(r.units.length);
    for (const e of r.enemies) if (e.kind === 'grunt' && !e.dead && Math.abs(e.z - r.z) < 60) {
      minGap = Math.min(minGap, Math.abs(e.x - r.x) - e.r - hw);
    }
  }
  return { won: r.won, peak: r.peak, survivors: r.units.length, time: +r.time.toFixed(1),
    lossByTouch: r.lossByTouch, lossByShot: r.lossByShot, 최소여유px: Number.isFinite(minGap) ? +minGap.toFixed(1) : null };
}
const OLD = null;                                   // 현행(xs 미지정 = 자동 분산)
const NEW_XS = [94, 136, 320, 362, 115, 341];
const NEW_DZ = [0, 0, 0, 0, 40, 40];
out.s1Corridor = {
  '현행xs track35(기준선)': s1Run('center', OLD, null, false),
  '현행xs track0': s1Run('center', OLD, null, true),
  '새xs track0 center': s1Run('center', NEW_XS, NEW_DZ, true),
  '새xs track0 left': s1Run('left', NEW_XS, NEW_DZ, true),
  '새xs track0 right': s1Run('right', NEW_XS, NEW_DZ, true),
};
// 현행 z5300 자동 분산 xs 도 기록(문서 표에 실측으로 적기 위해)
out.s1Corridor.현행xs값 = buildStage(1).spawns.find((s) => s.z === 5300).xs;

writeFileSync(new URL('./probe-results-r3fix.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
