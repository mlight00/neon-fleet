import { lotteryPick, LOTTERY_DEFAULT_SEED, buildStage } from '../../../rush3/stages.js';
import { hashSeed } from '../../../rush/rng.js';
console.log('default seed', LOTTERY_DEFAULT_SEED, 'pick', JSON.stringify(lotteryPick()));
const cnt = {};
for (let i = 0; i < 20; i++) cnt[lotteryPick(hashSeed('lot:3:' + i)).entry.id] = (cnt[lotteryPick(hashSeed('lot:3:' + i)).entry.id] || 0) + 1;
console.log('hashSeed(lot:3:i) i=0..19 =>', cnt);
const cnt2 = {};
for (let i = 0; i < 20; i++) cnt2[lotteryPick(i).entry.id] = (cnt2[lotteryPick(i).entry.id] || 0) + 1;
console.log('seeds 0..19 =>', cnt2);
const rep = {};
for (let i = 0; i < 400; i++) { const p = lotteryPick(hashSeed('lot:3:' + i)); if (rep[p.entry.id] == null) rep[p.entry.id] = i; }
console.log('rep i', JSON.stringify(rep));
for (const [k, i] of Object.entries(rep)) {
  const st = buildStage(3, { lotterySeed: hashSeed('lot:3:' + i) });
  console.log(k, 'lottery=', JSON.stringify(st.lottery));
  if (st.lottery.supplyId) console.log('   supply', JSON.stringify(st.supplies.at(-1)));
  if (st.lottery.rowId) console.log('   row', JSON.stringify(st.gateRows.at(-1)));
  if (st.lottery.kind === 'enemy') console.log('   spawn', JSON.stringify(st.spawns.find(s => s.kind === 'rusher' && s.z === st.lottery.revealZ)));
}
