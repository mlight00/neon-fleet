// 확정 STEP 실측: 큰 대형 + 중화기로 확정 직전까지 x239 에서 쏘면 반대편 통이 맞는가
import { buildStage, coverZFor } from '../../../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../../../rush3/combat.js';
import { addUnits, formation } from '../../../rush3/squad.js';
import { hashSeed } from '../../../rush/rng.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => hashSeed('lot:3:' + i));
const SEED_OF = { soldier8: SEEDS[1], chain6: SEEDS[4], heavy: SEEDS[6] };

function run1(seed, n, weapon, startZ = 5700) {
  const stage = buildStage(3, { lotterySeed: seed });
  const run = createRun(stage);
  run.weapon = weapon;
  addUnits(run, n - run.units.length);
  run.z = startZ; run.prevZ = startZ;
  run.x = 239; run.tx = 239;
  run.spawnCursor = stage.spawns.filter((s) => s.z <= startZ).length;
  //  적은 지운다(탄이 적에게 먹히지 않게 — 차폐만 본다)
  const lotId = stage.lottery.supplyId;
  const s = run.supplies.find((c) => c.id === lotId);
  const log = [];
  let steps = 0;
  while (run.z < 6400 && steps < 4000) {
    run.enemies.length = 0; run.eshots.length = 0;
    stepRun(run, { pointerX: run.z >= 5941 ? 150 : 239, dragDx: 0, keyDir: 0 }, STEP);
    for (const e of drainEvents(run)) {
      if (e.id === lotId && (e.type === 'supplyHit' || e.type === 'supplyOpen' || e.type === 'supplyBlock'))
        log.push(e.type + '@' + run.z.toFixed(2) + (e.durability != null ? ' dur' + e.durability : ''));
    }
    steps++;
  }
  const leaked = log.filter((l) => l.startsWith('supplyHit') || l.startsWith('supplyOpen'));
  console.log('n=' + n, weapon, 'side=' + run.wallSideLog.w3, 'coverZ=' + s.coverZ,
    'dur ' + s.maxDurability + '→' + s.durability, 'block=' + log.filter((l) => l.startsWith('supplyBlock')).length,
    '누출=' + leaked.length, leaked.slice(0, 5).join(' , '));
  return { run, s, leaked };
}
for (const n of [20, 40, 60, 80, 100]) {
  for (const w of ['rifle', 'auto', 'heavy']) run1(SEED_OF.soldier8, n, w);
}
console.log('--- 대형 깊이/폭 참고 ---');
for (const n of [20, 40, 60, 80, 100, 150]) {
  const f = formation(n);
  let dyMax = 0, dxMax = 0;
  for (const p of f) { if (p.dy > dyMax) dyMax = p.dy; if (Math.abs(p.dx) > dxMax) dxMax = Math.abs(p.dx); }
  console.log('n=' + n, 'dyMax=' + dyMax, 'dxMax=' + dxMax);
}
console.log('coverZFor(6000,6300) =', coverZFor(6000, 6300));
