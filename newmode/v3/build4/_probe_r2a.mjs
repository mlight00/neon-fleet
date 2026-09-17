// 지적1 재현: rusher4 판에서 우측 통로를 고르면 실제로 손실이 나는가
import { buildStage, lotteryPick, LOTTERY_DEFAULT_SEED } from '../../../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../../../rush3/combat.js';
import { pickX } from '../../../tests/lib/rush3-policies.mjs';
import { hashSeed } from '../../../rush/rng.js';
import { BAL3 } from '../../../rush3/balance.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => hashSeed('lot:3:' + i));
const SEED_OF = { rusher4: SEEDS[0], soldier8: SEEDS[1], chain6: SEEDS[4], heavy: SEEDS[6], badGate: SEEDS[11] };

function rightAtW3(run) {
  if (run.z >= 4000 && run.z < 5940) return 320;
  if (run.z >= 5940 && run.z < 6600) return 330;
  return pickX('plan', run);
}
function play(seed, diff, side) {
  const stage = buildStage(3, { difficulty: diff, lotterySeed: seed });
  const run = createRun(stage);
  const snap = [];
  let n = 0, marked = false;
  while (!run.over && n < 14400) {
    stepRun(run, { pointerX: side === 'R' ? rightAtW3(run) : pickX('plan', run), dragDx: 0, keyDir: 0 }, STEP);
    drainEvents(run);
    if (!marked && run.z >= 5940) { marked = true; snap.push(['@확정 5940', run.units.length, run.lossByTouch, run.kills]); }
    if (snap.length === 1 && run.z >= 7200) { snap.push(['@벽끝 7200', run.units.length, run.lossByTouch, run.kills]); }
    n++;
  }
  return { run, snap, stage };
}
for (const diff of ['normal', 'hard', 'brutal']) {
  for (const side of ['L', 'R']) {
    const { run, snap } = play(SEED_OF.rusher4, diff, side);
    console.log(diff, side, 'pick=' + run.lottery.pick, JSON.stringify(snap),
      'won=' + run.won, 'lossByTouch=' + run.lossByTouch, 'kills=' + run.kills, 'units=' + run.units.length, 'peak=' + run.peak);
  }
}
console.log('--- 좌측 pick 비교(normal, R 선택) ---');
for (const id of Object.keys(SEED_OF)) {
  const { run, snap } = play(SEED_OF[id], 'normal', 'R');
  console.log(id, JSON.stringify(snap), 'won=' + run.won, 'units=' + run.units.length);
}
