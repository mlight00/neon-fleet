// usage: node probe_one.mjs <difficulty> <stagesForAim e.g. 1,2,3>
import { playPolicy } from 'file:///E:/workspace/claude/neon-fleet/worktrees/v3-lastwar/tests/lib/rush3-policies.mjs';
import { BAL3 } from 'file:///E:/workspace/claude/neon-fleet/worktrees/v3-lastwar/rush3/balance.js';
const d = process.argv[2];
const ids = (process.argv[3] || '1,2,3').split(',').map(Number);
const out = { d, mult: BAL3.difficulty[d], aim: {}, center: {} };
for (const id of ids) {
  const r = playPolicy(id, 'aim', 14400, d);
  out.aim[id] = { won: r.run.won, units: r.run.units.length, peak: r.run.peak, boss: r.run.boss ? Math.ceil(r.run.boss.hp) : null, t: +r.run.time.toFixed(1) };
}
for (const id of [2, 3]) {
  const r = playPolicy(id, 'center', 14400, d);
  out.center[id] = { won: r.run.won, units: r.run.units.length, over: r.run.over };
}
console.log(JSON.stringify(out));
