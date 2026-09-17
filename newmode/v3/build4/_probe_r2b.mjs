// 돌격체 배치 탐색: 발동 z·전방거리·수·hp 를 바꿔 우측 선택 시 실제 손실을 잰다
import { buildStage } from '../../../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../../../rush3/combat.js';
import { pickX } from '../../../tests/lib/rush3-policies.mjs';
import { hashSeed } from '../../../rush/rng.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => hashSeed('lot:3:' + i));
const SEED = SEEDS[0]; // rusher4

function rightAtW3(run) {
  if (run.z >= 4000 && run.z < 5940) return 320;
  if (run.z >= 5940 && run.z < 6600) return 330;
  return pickX('plan', run);
}

function play(diff, side, mut) {
  const stage = buildStage(3, { difficulty: diff, lotterySeed: SEED });
  if (mut) mut(stage);
  const run = createRun(stage);
  let n = 0, at5940 = null;
  while (!run.over && n < 14400) {
    stepRun(run, { pointerX: side === 'R' ? rightAtW3(run) : pickX('plan', run), dragDx: 0, keyDir: 0 }, STEP);
    drainEvents(run);
    if (at5940 === null && run.z >= 5940) at5940 = { u: run.units.length, t: run.lossByTouch };
    n++;
  }
  return { at5940, end: { u: run.units.length, t: run.lossByTouch, won: run.won, peak: run.peak } };
}

const base = buildStage(3, { lotterySeed: SEED });
const spIdx = base.spawns.findIndex((s) => s.kind === 'rusher' && s.z === 5940);
console.log('기존 돌격 무리:', JSON.stringify(base.spawns[spIdx]));

function mutate({ evZ, ahead, n, hp, xs }) {
  return (stage) => {
    const i = stage.spawns.findIndex((s) => s.kind === 'rusher' && s.z === 5940);
    const X = xs || [282, 312, 342, 372];
    const use = [];
    for (let k = 0; k < n; k++) use.push(X[k % X.length]);
    const zs = use.map((_, k) => evZ + ahead + Math.floor(k / X.length) * 40);
    const ev = { z: evZ, kind: 'rusher', n, xs: use, zs, corridorHw: null };
    if (hp != null) ev.hp = hp;
    stage.spawns[i] = ev;
    stage.spawns.sort((a, b) => a.z - b.z);
  };
}

const cases = [
  { label: 'ahead760 n4 (현행)', cfg: { evZ: 5940, ahead: 760, n: 4 } },
  { label: 'ahead300 n4', cfg: { evZ: 5940, ahead: 300, n: 4 } },
  { label: 'ahead260 n4', cfg: { evZ: 5940, ahead: 260, n: 4 } },
  { label: 'ahead200 n4', cfg: { evZ: 5940, ahead: 200, n: 4 } },
  { label: 'ahead200 n8', cfg: { evZ: 5940, ahead: 200, n: 8 } },
  { label: 'ahead200 n12', cfg: { evZ: 5940, ahead: 200, n: 12 } },
  { label: 'ahead200 n8 hp12', cfg: { evZ: 5940, ahead: 200, n: 8, hp: 12 } },
  { label: 'ahead160 n8 hp12', cfg: { evZ: 5940, ahead: 160, n: 8, hp: 12 } },
];
for (const c of cases) {
  const out = [];
  for (const diff of ['normal', 'hard', 'brutal']) {
    const r = play(diff, 'R', mutate(c.cfg));
    out.push(diff + ': 확정' + r.at5940.u + '/' + r.at5940.t + ' → 끝 ' + r.end.u + ' touch' + r.end.t + (r.end.won ? '' : ' 패배'));
  }
  console.log(c.label.padEnd(22), out.join(' | '));
}
console.log('좌측 기준선:');
for (const diff of ['normal', 'hard', 'brutal']) {
  const r = play(diff, 'L', null);
  console.log('  ', diff, '끝 ' + r.end.u + ' touch' + r.end.t);
}
