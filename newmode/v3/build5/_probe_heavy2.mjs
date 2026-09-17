import { buildStage } from '../../../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../../../rush3/combat.js';
import { emptyLotteryOutcome, collectLotteryOutcome, lotteryLine } from '../../../rush3/main.js';
import { pickX } from '../../../tests/lib/rush3-policies.mjs';
import { hashSeed } from '../../../rush/rng.js';
const SEED = hashSeed('lot:3:6');
function heavyRight(run) {
  if (run.z >= 2400 && run.z < 3600) return 330;
  if (run.z >= 4000 && run.z < 5940) return 320;
  if (run.z >= 5940 && run.z < 6600) return 330;
  return pickX('plan', run);
}
const run = createRun(buildStage(3, { lotterySeed: SEED }));
run.lotteryOutcome = emptyLotteryOutcome();
const opened = [], swaps = [];
let n = 0;
while (!run.over && n < 14400) {
  stepRun(run, { pointerX: heavyRight(run), dragDx: 0, keyDir: 0 }, STEP);
  const evs = drainEvents(run);
  for (const e of evs) { if (e.type === 'supplyOpen') opened.push(e.id + '@' + Math.round(run.z)); if (e.type === 'weaponSwap' || e.type === 'weaponSame') swaps.push(e.type + ':' + e.weapon + '@' + Math.round(run.z)); }
  collectLotteryOutcome(run.lotteryOutcome, evs, run);
  n++;
}
console.log('weapon', run.weapon, 'opened', opened.join(','), 'swaps', swaps.join(','), '|', lotteryLine(run), '| side', run.wallSideLog.w3, 'won', run.won, 'units', run.units.length);
