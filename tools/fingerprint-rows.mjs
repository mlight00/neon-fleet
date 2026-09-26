// tools/fingerprint-rows.mjs — 봇 지문(r4.7): 줄(normal·brutal) × 판 1~24 × 봇 여러 종을 한 판씩 돌려 결과를 JSON 한 파일로 남긴다.
//  용도 = **바뀌지 않아야 할 결과가 그대로인지** 전후 비교(예: r4.7 에서 검사용 배수 1 줄 normal 은 무기 변경 몫 말고는 불변).
//  ⚠️난이도 판단용이 아니다(이사님 지시 2026-09-26 "난이도는 너의 봇테스트로 하지 말도록") — 결정적 1판 봇 결과이고 사람의 성공률이 아니다.
//  사용:  node tools/fingerprint-rows.mjs --row normal --out <파일.json> [--bots center,aim,...] [--ids 1,2,...] [--max 14400] [--guard]
//         node tools/fingerprint-rows.mjs --diff <앞.json> <뒤.json>      → 바뀐 칸만 출력
//  게임 모듈은 import 만 한다(규칙·배치 불변).
import { readFileSync, writeFileSync } from 'node:fs';
import { playPolicy } from '../tests/lib/rush3-policies.mjs';
import { ALL_STAGE_IDS } from '../rush3/stages.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i >= 0 ? process.argv[i + 1] : d; };
const DEFAULT_BOTS = ['center', 'left', 'right', 'sway', 'aim', 'plan', 'planBoss', 'lead', 'aimLead', 'evLead'];

function pick(r) {
  const run = r.run;
  return {
    won: run.won, over: run.over, steps: r.steps, survivors: run.units.length, peak: run.peak, kills: run.kills,
    time: Math.round(run.time * 1000) / 1000, z: Math.round(run.z * 100) / 100, weapon: run.weapon, mk: run.weaponMk,
    loss: [run.lossByGate, run.lossByShot, run.lossByTouch, run.lossByShock],
    bossHp: (run.bosses || []).map((b) => Math.round(b.hp * 100) / 100),
    opened: r.opened, gates: r.gates.map((g) => [g.id, g.value, g.applied]),
    events: Object.fromEntries(Object.entries(r.events).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
  };
}

if (process.argv.includes('--diff')) {
  const i = process.argv.indexOf('--diff');
  const A = JSON.parse(readFileSync(process.argv[i + 1], 'utf8')), B = JSON.parse(readFileSync(process.argv[i + 2], 'utf8'));
  const keys = [...new Set([...Object.keys(A.runs), ...Object.keys(B.runs)])];
  let same = 0;
  const changed = [];
  for (const k of keys) {
    const a = JSON.stringify(A.runs[k]), b = JSON.stringify(B.runs[k]);
    if (a === b) { same++; continue; }
    const ra = A.runs[k], rb = B.runs[k];
    const fields = ra && rb ? Object.keys(rb).filter((f) => JSON.stringify(ra[f]) !== JSON.stringify(rb[f])) : ['(없음)'];
    changed.push({ key: k, fields, weaponA: ra?.weapon, weaponB: rb?.weapon, wonA: ra?.won, wonB: rb?.won });
  }
  console.log(JSON.stringify({ total: keys.length, same, changed: changed.length }, null, 0));
  for (const c of changed) console.log(JSON.stringify(c));
  process.exit(0);
}

const row = arg('--row', 'normal');
const out = arg('--out', null);
const bots = (arg('--bots', null) || DEFAULT_BOTS.join(',')).split(',');
const ids = arg('--ids', null) ? arg('--ids').split(',').map(Number) : [...ALL_STAGE_IDS];
const max = Number(arg('--max', 14400));
const runOpts = process.argv.includes('--guard') ? { heroGuard: true } : undefined;
const runs = {};
const t0 = Date.now();
for (const bot of bots) for (const id of ids) runs[row + '/' + bot + '/' + id] = pick(playPolicy(id, bot, max, row, undefined, runOpts));
const fx = { meta: { row, bots, ids, max, guard: !!runOpts, ms: Date.now() - t0 }, runs };
if (out) writeFileSync(out, JSON.stringify(fx, null, 0) + '\n');
console.log(JSON.stringify(fx.meta));
