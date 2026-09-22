// 지옥 강화 후보 스윕(2026-09-22). BAL3 가 동결돼 있어 후보마다 rush3/ 사본을 만들고 balance.js 의 brutal 줄·1~3 행만 바꿔 import 한다.
//  사용: node tools/sweep-brutal.mjs   → 결과 표를 stdout 과 E:\workspace\claude\neon-fleet\newmode\v3\research\brutal-20260922\sweep.json 에
//  ⚠️봇은 사람보다 약하다. 여기서 보는 것은 '잘하는 봇이 초중반을 손실 없이 여유 있게 깨는가' — 그게 이사 소감("지옥도 쉽다")의 봇 쪽 대응물이다.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const TMP = 'E:/workspace/claude/neon-fleet/newmode/v3/research/brutal-20260922/tmp';
const OUT = 'E:/workspace/claude/neon-fleet/newmode/v3/research/brutal-20260922';
fs.mkdirSync(TMP, { recursive: true });

const STAGES = [1, 2, 3, 5, 7, 9, 13, 15, 17, 20, 24];
const POLS = ['aimLead', 'evLead'];

//  후보: brutal 줄 필드 덮어쓰기 + 1~3 행의 difficultyHp
const CANDS = [
  { name: '현재', brutal: {}, low: 'false' },
  { name: 'S 상한0.6+저격1.6+체력2.5', brutal: { gateCapMul: 0.6, shooterFireRate: 1.6, enemyHp: 2.5 }, low: "['brutal']" },
  { name: 'S+물결3', brutal: { gateCapMul: 0.6, shooterFireRate: 1.6, enemyHp: 2.5, waves: 3 }, low: "['brutal']" },
  { name: 'S+물결3+체력3', brutal: { gateCapMul: 0.6, shooterFireRate: 1.6, enemyHp: 3, waves: 3 }, low: "['brutal']" },
  { name: 'S+물결4', brutal: { gateCapMul: 0.6, shooterFireRate: 1.6, enemyHp: 2.5, waves: 4 }, low: "['brutal']" },
  { name: '상한0.7+저격1.6+체력2.5+물결3', brutal: { gateCapMul: 0.7, shooterFireRate: 1.6, enemyHp: 2.5, waves: 3 }, low: "['brutal']" },
];

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dst, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

function makeVariant(i, cand) {
  const dir = path.join(TMP, 'v' + i);
  fs.rmSync(dir, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'rush3'), path.join(dir, 'rush3'));
  copyDir(path.join(ROOT, 'rush'), path.join(dir, 'rush'));   // rush3 가 rush/rng.js 등을 import 할 수 있다
  fs.mkdirSync(path.join(dir, 'tests', 'lib'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tests', 'lib', 'rush3-policies.mjs'), path.join(dir, 'tests', 'lib', 'rush3-policies.mjs'));
  const bp = path.join(dir, 'rush3', 'balance.js');
  let s = fs.readFileSync(bp, 'utf8');
  //  brutal 줄 필드 치환
  const lines = s.split('\n');
  const bi = lines.findIndex((l) => /^\s+brutal:\s+\{ id: 'brutal'/.test(l));
  if (bi < 0) throw new Error('brutal 줄 없음');
  for (const [k, v] of Object.entries(cand.brutal)) {
    const re = new RegExp('(\\b' + k + ': )[0-9.]+');
    if (!re.test(lines[bi])) throw new Error('brutal 필드 없음: ' + k);
    lines[bi] = lines[bi].replace(re, '$1' + v);
  }
  s = lines.join('\n');
  //  1~3 행 difficultyHp
  const low = /\{ to: 3, mul: 1, difficultyHp: [^}]+\}/;
  if (!low.test(s)) throw new Error('1~3 행 없음');
  s = s.replace(low, '{ to: 3, mul: 1, difficultyHp: ' + cand.low + ' }');
  fs.writeFileSync(bp, s);
  return dir;
}

const results = [];
for (let i = 0; i < CANDS.length; i++) {
  const cand = CANDS[i];
  const dir = makeVariant(i, cand);
  const { playPolicy } = await import(pathToFileURL(path.join(dir, 'tests', 'lib', 'rush3-policies.mjs')).href);
  const rows = {};
  for (const id of STAGES) {
    rows[id] = {};
    for (const p of POLS) {
      const r = playPolicy(id, p, 14400, 'brutal');
      rows[id][p] = { won: r.run.won, peak: r.run.peak, end: r.run.units.length };
    }
  }
  results.push({ name: cand.name, cand, rows });
  //  요약: 완주 수, 초중반(1~13) 평균 생존율(end/peak), 최대 peak
  const early = STAGES.filter((s) => s <= 13);
  let wins = 0, tot = 0, survSum = 0, survN = 0, maxPeak = 0;
  for (const id of STAGES) for (const p of POLS) {
    const c = rows[id][p]; tot++; if (c.won) wins++;
    maxPeak = Math.max(maxPeak, c.peak);
    if (early.includes(id) && c.peak > 0) { survSum += c.end / c.peak; survN++; }
  }
  const line = STAGES.map((id) => `S${id} ${POLS.map((p) => (rows[id][p].won ? 'W' : 'L') + rows[id][p].peak + '/' + rows[id][p].end).join(' ')}`).join(' | ');
  console.log(`\n[${cand.name}] 완주 ${wins}/${tot} · 초중반 평균 생존율 ${(survSum / survN * 100).toFixed(0)}% · 최대 병력 ${maxPeak}`);
  console.log('  ' + line);
}
fs.writeFileSync(path.join(OUT, 'sweep.json'), JSON.stringify(results, null, 1));
console.log('\nsaved', path.join(OUT, 'sweep.json'));
