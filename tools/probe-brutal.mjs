// 지옥 난이도 판별 측정(2026-09-22): 잘하는 봇(aimLead·evLead)의 최대 병력(peak)과 완주를 스테이지·난이도별로.
//  사용: node tools/probe-brutal.mjs [stage...]   (인자 없으면 1 2 3 7 13 17 20 24)
//  ⚠️봇 결과는 사람 성공률이 아니다. 여기서 보는 것은 '잘 조작하면 병력이 상한까지 불어나는가'라는 판별값이다.
import { playPolicy } from '../tests/lib/rush3-policies.mjs';
import { BAL3 } from '../rush3/balance.js';

const ids = process.argv.slice(2).map(Number).filter(Boolean);
const STAGES = ids.length ? ids : [1, 2, 3, 7, 13, 17, 20, 24];
const DIFFS = ['normal', 'hard', 'brutal'];
const POLS = ['center', 'aimLead', 'evLead'];

const rows = [];
for (const id of STAGES) {
  for (const d of DIFFS) {
    const cells = [];
    for (const p of POLS) {
      const r = playPolicy(id, p, 14400, d);
      cells.push(`${p}:${r.run.won ? 'W' : 'L'} peak ${r.run.peak} end ${r.run.units.length}`);
    }
    rows.push(`S${String(id).padStart(2)} ${d.padEnd(6)} | ${cells.join(' | ')}`);
  }
}
console.log('unitCap', BAL3.squad.unitCap);
for (const r of rows) console.log(r);
