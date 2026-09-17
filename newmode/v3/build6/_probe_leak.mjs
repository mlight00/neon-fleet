//  누출 실측: 함정 게이트의 gateBlock 이 통로 확정선(revealZ) 전에 나는가
//  실행: node newmode/v3/build6/_probe_leak.mjs
import { buildStage } from '../../../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../../../rush3/combat.js';
import { hashSeed } from '../../../rush/rng.js';

const SEEDS = Array.from({ length: 20 }, (_, i) => hashSeed('lot:3:' + i));
const pickSeed = (id) => SEEDS.find((s) => buildStage(3, { lotterySeed: s }).lottery.pick === id);

for (const id of ['trapGate', 'badGate']) {
  const seed = pickSeed(id);
  const stage = buildStage(3, { lotterySeed: seed });
  const run = createRun(stage, { difficulty: 'normal' });
  const lot = run.lottery;
  const rows = [];
  let guard = 0, first = null, firstAfter = null;
  const seen = { before: new Set(), after: new Set() };
  while (!run.over && guard++ < 20000) {
    stepRun(run, { pointerX: run.z >= 4000 ? 330 : 240 }, STEP);
    const z = run.z;
    for (const ev of drainEvents(run)) {
      if (ev.id !== lot.rowId && ev.id !== lot.supplyId) continue;
      const bucket = z < lot.revealZ ? 'before' : 'after';
      seen[bucket].add(ev.type);
      if (ev.type === 'gateBlock' && first === null && bucket === 'before') first = z;
      if (ev.type === 'gateBlock' && firstAfter === null && bucket === 'after') firstAfter = z;
    }
    if (z > lot.z + 400) break;
  }
  console.log(id, JSON.stringify({
    rowZ: lot.z, revealZ: lot.revealZ, openZ: lot.openZ,
    firstBlockBeforeReveal: first, gapPx: first === null ? null : Math.round(lot.revealZ - first),
    firstBlockAfterReveal: firstAfter,
    eventsBefore: [...seen.before], eventsAfter: [...seen.after],
  }));
}
