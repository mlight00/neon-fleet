import { playPolicy } from '../../../tests/lib/rush3-policies.mjs';
import { adviceLine } from '../../../rush3/advice.js';
for (const p of ['right', 'center+1']) {
  const r = playPolicy(2, p, 14400);
  console.log(p, 'over', r.run.over, 'won', r.run.won, 'z', Math.round(r.run.z), 'units', r.run.units.length,
    'lossByGate', r.run.lossByGate, 'lastBad', r.run.lastBadGateId, 'time', r.run.time.toFixed(2));
  console.log('   advice:', adviceLine(r.run, r.run));
}
