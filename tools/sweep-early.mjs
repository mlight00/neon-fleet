// 1~3 구간 체력 배율 후보 스윕(2026-09-23). 이사 관찰 "여러 대 맞아야 터지는 적의 손맛" + "지옥 1번 아직 쉽다" — 같은 레버.
//  1~3 행 mul 후보마다 rush3 사본을 만들어 3난이도 × 봇(planBoss·aimLead·evLead)로 S1·S2·S3 를 잰다.
//  보는 것: 잡졸이 몇 발에 죽는가(체력) · 무손실 승리(end===peak) · SD-7 성공 경로(hard S1~S3 planBoss, brutal S1 evLead) 유지
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..');
const TMP = 'E:/workspace/claude/neon-fleet/newmode/v3/research/early-20260923/tmp';
fs.mkdirSync(TMP, { recursive: true });
const MULS = (process.argv[2] || '1,2,3,4').split(',').map(Number);
function copyDir(s, d) { fs.mkdirSync(d, { recursive: true }); for (const f of fs.readdirSync(s)) { const a = path.join(s, f), b = path.join(d, f); if (fs.statSync(a).isDirectory()) copyDir(a, b); else fs.copyFileSync(a, b); } }
for (const mul of MULS) {
  const dir = path.join(TMP, 'm' + mul);
  fs.rmSync(dir, { recursive: true, force: true });
  copyDir(path.join(ROOT, 'rush3'), path.join(dir, 'rush3')); copyDir(path.join(ROOT, 'rush'), path.join(dir, 'rush'));
  fs.mkdirSync(path.join(dir, 'tests', 'lib'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, 'tests', 'lib', 'rush3-policies.mjs'), path.join(dir, 'tests', 'lib', 'rush3-policies.mjs'));
  const bp = path.join(dir, 'rush3', 'balance.js');
  let s = fs.readFileSync(bp, 'utf8');
  const re = /\{ to: 3, mul: [0-9.]+,/;
  if (!re.test(s)) throw new Error('1~3 행 없음');
  s = s.replace(re, '{ to: 3, mul: ' + mul + ',');
  fs.writeFileSync(bp, s);
  const { playPolicy } = await import(pathToFileURL(path.join(dir, 'tests', 'lib', 'rush3-policies.mjs')).href);
  const { buildStage } = await import(pathToFileURL(path.join(dir, 'rush3', 'stages.js')).href);
  const gHp = ['normal', 'hard', 'brutal'].map((d) => buildStage(1, { difficulty: d }).spawns.find((x) => x.kind === 'grunt').hp);
  console.log(`\n[1~3 체력 ×${mul}] S1 잡졸 체력 보통/어려움/지옥 = ${gHp.join('/')}`);
  for (const d of ['normal', 'hard', 'brutal']) {
    const line = [];
    for (const id of [1, 2, 3]) {
      const c = ['planBoss', 'aimLead', 'evLead'].map((p) => { const r = playPolicy(id, p, 14400, d).run; return (r.won ? (r.units.length === r.peak ? 'W=' : 'W') : 'L') + r.peak + '/' + r.units.length; });
      line.push(`S${id} ${c.join(' ')}`);
    }
    console.log(`  ${d.padEnd(6)} | ${line.join(' | ')}`);
  }
}
