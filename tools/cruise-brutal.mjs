// 지옥 '무손실 승리' 판 찾기(2026-09-22). 잘하는 봇(aimLead·evLead)이 병력을 하나도 잃지 않고(end === peak) 이기는 판 = 잘하는 사람이 여유 있게 흘러가는 판.
//  사용: node tools/cruise-brutal.mjs [difficulty=brutal]
import { playPolicy } from '../tests/lib/rush3-policies.mjs';
import { ALL_STAGE_IDS } from '../rush3/stages.js';
const diff = process.argv[2] || 'brutal';
const cruise = [], lossy = [], fail = [];
for (const id of ALL_STAGE_IDS) {
  const cells = ['aimLead', 'evLead'].map((p) => { const r = playPolicy(id, p, 14400, diff); return { p, won: r.run.won, peak: r.run.peak, end: r.run.units.length }; });
  const tag = cells.map((c) => `${c.p} ${c.won ? 'W' : 'L'}${c.peak}/${c.end}`).join(' · ');
  if (cells.some((c) => c.won && c.end === c.peak)) cruise.push(`S${id} ${tag}`);
  else if (cells.some((c) => c.won)) lossy.push(`S${id} ${tag}`);
  else fail.push(`S${id} ${tag}`);
}
console.log(`[${diff}] 무손실 승리(여유) ${cruise.length}판`); for (const l of cruise) console.log('  ' + l);
console.log(`손실 있는 승리 ${lossy.length}판`); for (const l of lossy) console.log('  ' + l);
console.log(`두 봇 모두 실패 ${fail.length}판`); for (const l of fail) console.log('  ' + l);
