// LOT-3b 대조군 상세: 옛 공식(1 STEP 지연·대형 깊이 미반영)으로 되돌린 판의 누출 목록
import { buildStage, VZ_MIN } from '../../../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../../../rush3/combat.js';
import { addUnits } from '../../../rush3/squad.js';
import { BAL3 } from '../../../rush3/balance.js';
import { WEAPONS } from '../../../rush3/weapons.js';
import { hashSeed } from '../../../rush/rng.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => hashSeed('lot:3:' + i));
const SEED_OF = { trapGate: SEEDS[0], soldier8: SEEDS[1], chain6: SEEDS[4], heavy: SEEDS[6], badGate: SEEDS[11] };
const COMMIT_Z = 6000 - BAL3.squad.wallLead;

function run1(id, oldCover) {
  const stage = buildStage(3, { lotterySeed: SEED_OF[id] });
  const run = createRun(stage);
  const lot = run.lottery;
  run.weapon = 'heavy';
  addUnits(run, 80 - run.units.length, WEAPONS.heavy.interval);
  run.z = 5700; run.prevZ = 5700; run.x = 239; run.tx = 239;
  run.spawnCursor = stage.spawns.filter((s) => s.z <= 5700).length;
  const sup = run.supplies.find((c) => c.id === lot.supplyId) || null;
  const row = run.gateRows.find((r) => r.id === lot.rowId) || null;
  if (oldCover) {
    if (sup) sup.coverZ = Math.ceil(COMMIT_Z + (lot.z - COMMIT_Z) * BAL3.scroll / VZ_MIN);
    if (row) row.armZ = BAL3.gate.armZ;
  }
  const seen = [];
  while (run.z < 6400 && !run.over) {
    run.enemies.length = 0; run.eshots.length = 0;
    stepRun(run, { pointerX: run.z >= lot.revealZ ? 150 : 239, dragDx: 0, keyDir: 0 }, STEP);
    for (const e of drainEvents(run)) {
      if (lot.supplyId && e.id === lot.supplyId && (e.type === 'supplyHit' || e.type === 'supplyOpen')) seen.push(e.type + '@' + run.z.toFixed(2));
      if (lot.rowId && e.id === lot.rowId && (e.type === 'gateHit' || e.type === 'gateFlip')) seen.push(e.type + '@' + run.z.toFixed(2));
    }
  }
  const state = sup ? '내구 ' + sup.maxDurability + '→' + sup.durability
                    : '값 ' + BAL3.lottery.pool[lot.idx].value + '→' + row.cells[0].value;
  return { cover: sup ? sup.coverZ : lot.z - row.armZ, n: seen.length, first: seen[0] || '-', state };
}
for (const id of Object.keys(SEED_OF)) {
  const a = run1(id, true), b = run1(id, false);
  console.log(id.padEnd(9),
    '옛: 개방선 ' + a.cover + ' 도달 ' + a.n + ' (' + a.first + ') ' + a.state,
    '| 새: 개방선 ' + b.cover + ' 도달 ' + b.n + ' ' + b.state);
}
