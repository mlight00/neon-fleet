import { createRun, stepRun, drainEvents, STEP } from '../../../rush3/combat.js';
import { buildStage } from '../../../rush3/stages.js';
import { pickX } from '../../../tests/lib/rush3-policies.mjs';
import { hashSeed } from '../../../rush/rng.js';
const SEEDS = [0, 1, 4, 6, 11].map((i) => ({ i, s: hashSeed('lot:3:' + i) }));
for (const policy of ['plan', 'aim', 'center']) {
  for (const { i, s } of SEEDS) {
    const stage = buildStage(3, { lotterySeed: s });
    const run = createRun(stage);
    let n = 0;
    while (!run.over && n < 14400) { stepRun(run, { pointerX: pickX(policy, run), dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); n++; }
    console.log(policy, 'seedI', i, stage.lottery.pick, 'won', run.won, 'units', run.units.length, 'peak', run.peak,
      'side w3', run.wallSideLog.w3, 'steps', n, 'skipped', run.skippedSupplies, 'missed', run.missedSupplies);
  }
}
