// probe-local8 — probe-local.mjs 의 21판(7정책)에 `plan`(계획 봇)을 더한 24판 진단.
//  게임 코드는 고치지 않는다(읽기 전용 · stepRun 그대로). 결과 = probe-results-local8-<tag>.json
import { createRun, stepRun, drainEvents } from '../../../rush3/combat.js';
import { buildStage } from '../../../rush3/stages.js';
import { WEAPONS } from '../../../rush3/weapons.js';
import { writeFileSync } from 'node:fs';

// 탐욕 봇(aim): 가장 가까운 미획득 통·발판·게이트의 최대값 칸
export function aim(r) {
  let z = Infinity, x = null;
  for (const s of r.supplies) {
    if (s.missed || s.skipped) continue;
    for (const p of s.pads) if (!p.taken && p.z > r.z && p.z < z) { z = p.z; x = p.x; }
    if ((s.opened && s.kind !== 'chain') || s.locked) continue;
    if (s.z > r.z && s.z < z) { z = s.z; x = s.x; }
  }
  for (const g of r.gateRows) {
    if (g.passed || g.z <= r.z || g.z >= z) continue;
    const c = g.cells.reduce((a, b) => (a.value >= b.value ? a : b));
    z = g.z;
    x = c.value < 0 && g.bypass ? (c.x0 === 80 ? 320 : 160) : (c.x0 + c.x1) / 2;
  }
  return x;
}

// 계획 봇(plan): 설계가 의도한 경로를 그대로 따르는 결정적 스크립트(구간별 목표 x, 무작위 없음)
export const PLAN = {
  //  S1 은 계획 여지가 없다(입문 안전 경로 = 무조작과 같은 x240)
  1: [[0, Infinity, 240]],
  //  S2: 좌 게이트 +3 → 분리벽 좌 통로(병사 3) → 두 번째 게이트 우 칸(−20) 도전 → z5800 좌 통
  2: [[0, 3000, 120], [3000, 5400, 320], [5400, 5900, 150], [5900, Infinity, 240]],
  //  S3: 초반 통 3개 전부 → wA 좌(연속증원) → wB 좌(기관총) → z3900 통을 깨고 → z4000 우 칸(−25) 상한까지 → wD 좌(병사 10)
  3: [[0, 1100, 160], [1100, 1500, 320], [1500, 1900, 160], [1900, 3550, 150],
      [3550, 3760, 150], [3760, 4000, 320], [4000, 5940, 150], [5940, 6400, 150], [6400, Infinity, 240]],
};
export function planX(r) {
  for (const [z0, z1, x] of PLAN[r.stageId]) if (r.z >= z0 && r.z < z1) return x;
  return 240;
}

export const POLICIES = ['center', 'center-1', 'center+1', 'left', 'right', 'sway', 'aim', 'plan'];
export function pickX(policy, r) {
  switch (policy) {
    case 'center': return 240;
    case 'center-1': return 239;
    case 'center+1': return 241;
    case 'left': return 160;
    case 'right': return 320;
    case 'sway': return Math.floor(r.time / 3) % 2 ? 160 : 320;
    case 'aim': return aim(r);
    case 'plan': return planX(r);
    default: return 240;
  }
}

export function play(id, policy, maxSteps = 14400) {
  const r = createRun(buildStage(id));
  const gates = [], supply = [], skipped = [];
  let bossStart = null;
  for (let k = 0; k < maxSteps && !r.over; k++) {
    stepRun(r, { pointerX: pickX(policy, r) });
    for (const e of drainEvents(r)) {
      if (e.type === 'elite') bossStart = r.time;
      if (e.type === 'gatePass') gates.push({ id: e.id, value: e.value, applied: e.applied, idx: e.idx, x: Math.round(e.x) });
      if (e.type === 'supplyOpen') supply.push(e.id);
      if (e.type === 'supplySkipped') skipped.push(e.id);
    }
  }
  const dmg = { rifle: 2, auto: 4, heavy: 5 }[r.weapon] ?? 2;
  return {
    stage: id, policy, won: r.won, over: r.over, time: Math.round(r.time * 10) / 10, peak: r.peak,
    survivors: r.units.length, weapon: r.weapon, power: r.units.length * dmg,
    lossByShot: r.lossByShot, lossByTouch: r.lossByTouch, lossByGate: r.lossByGate,
    missed: r.missedSupplies, skippedN: r.skippedSupplies, skipped,
    bossSeconds: bossStart === null ? null : Math.round((r.time - bossStart) * 10) / 10,
    gates, supply, run: r,
  };
}

if (import.meta.url === 'file:///' + process.argv[1].replace(/\\/g, '/')) {
  const rows = [];
  for (const id of [1, 2, 3]) for (const p of POLICIES) {
    const o = play(id, p);
    delete o.run;
    rows.push(o);
  }
  const tag = process.argv[2] ?? 'after';
  writeFileSync(new URL('./probe-results-local8-' + tag + '.json', import.meta.url), JSON.stringify({ rows }, null, 2));
  const w = (s, n) => String(s).padEnd(n);
  console.log(w('st', 3) + w('policy', 10) + w('won', 5) + w('time', 7) + w('peak', 6) + w('surv', 6) + w('weapon', 8) + w('power', 7) + w('gates', 26) + w('supply', 22) + 'miss/skip');
  for (const r of rows) {
    console.log(w(r.stage, 3) + w(r.policy, 10) + w(r.won ? 'O' : 'X', 5) + w(r.time, 7) + w(r.peak, 6) + w(r.survivors, 6) + w(r.weapon, 8) + w(r.power, 7)
      + w(r.gates.map((g) => g.id + ':' + (g.applied >= 0 ? '+' : '') + g.applied).join(' '), 26)
      + w(r.supply.join(','), 22) + r.missed + '/' + r.skippedN);
  }
  console.log('WEAPONS', Object.keys(WEAPONS).join(','));
}
