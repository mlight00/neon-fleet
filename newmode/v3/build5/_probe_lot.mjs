// 임시 진단(검사 아님): 우측 랜덤 길 노선의 실제 결과 집계를 눈으로 확인한다
import { buildStage } from '../../../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../../../rush3/combat.js';
import { emptyLotteryOutcome, collectLotteryOutcome, lotteryLine } from '../../../rush3/main.js';
import { pickX } from '../../../tests/lib/rush3-policies.mjs';
import { hashSeed } from '../../../rush/rng.js';
const SEEDS = Array.from({ length: 20 }, (_, i) => hashSeed('lot:3:' + i));
const SEED_OF = { trapGate: SEEDS[0], soldier8: SEEDS[1], chain6: SEEDS[4], heavy: SEEDS[6], badGate: SEEDS[11] };
function rightAtW3(run) {
  if (run.z >= 4000 && run.z < 5940) return 320;
  if (run.z >= 5940 && run.z < 6600) return 330;
  return pickX('plan', run);
}
for (const id of Object.keys(SEED_OF)) {
  const run = createRun(buildStage(3, { lotterySeed: SEED_OF[id] }));
  run.lotteryOutcome = emptyLotteryOutcome();
  let n = 0;
  while (!run.over && n < 14400) {
    stepRun(run, { pointerX: rightAtW3(run), dragDx: 0, keyDir: 0 }, STEP);
    collectLotteryOutcome(run.lotteryOutcome, drainEvents(run), run);
    n++;
  }
  console.log(id, JSON.stringify(run.lotteryOutcome), '|', lotteryLine(run), '| side', run.wallSideLog.w3, '| won', run.won, '| lossByGate', run.lossByGate);
}
