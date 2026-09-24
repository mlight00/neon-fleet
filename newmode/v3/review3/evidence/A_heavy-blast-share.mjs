// A_heavy-blast-share.mjs — 검토 7번 일부(화력 강화가 '직격'에만 걸리는 범위) 보조 측정.
//  1~3번 지옥 봇 9판(A_bot-runs)은 모두 기관총으로 끝나 중화기 폭발 피해가 0 이었다. 그래서 중화기를 들었을 때
//  적에게 들어간 피해 중 폭발 몫이 얼마인지만 따로 본다.
//  ⚠️createRun 의 개발용 시작 무기 덮어쓰기(startWeapon, combat.js L58-60)를 쓴 **합성 판**이다 — 실제 판 경로가 아니다.
//   입력은 evLead 봇(정해진 입력, 한 판씩). 사람의 성공률이 아니다.
//  피해 합 = enemyHit 이벤트 dmg(직격 L412 · 연쇄 L449 arc:true · 폭발 L475 blast:true)
//  실행: node A_heavy-blast-share.mjs → A_heavy-blast-share.json
import { writeFileSync } from 'node:fs';
import { createRun, stepRun, drainEvents, STEP } from '../../../../rush3/combat.js';
import { buildStage } from '../../../../rush3/stages.js';
import { pickInput } from '../../../../tests/lib/rush3-policies.mjs';

const rows = [];
for (const id of [1, 2, 3]) {
  const run = createRun(buildStage(id, { difficulty: 'brutal' }), { startWeapon: 'heavy' });
  const dmg = { direct: 0, blast: 0, arc: 0 };
  let steps = 0;
  while (!run.over && steps < 14400) {
    stepRun(run, pickInput('evLead', run), STEP);
    steps++;
    for (const e of drainEvents(run)) if (e.type === 'enemyHit') {
      if (e.blast) dmg.blast += e.dmg; else if (e.arc) dmg.arc += e.dmg; else dmg.direct += e.dmg;
    }
  }
  const total = dmg.direct + dmg.blast + dmg.arc;
  rows.push({ stage: id, policy: 'evLead', startWeapon: 'heavy', won: run.won, timeSec: run.time, endUnits: run.units.length, finalWeapon: run.weapon, dmg, blastShare: total ? dmg.blast / total : null });
}
const out = { kind: '합성 판(개발용 시작 무기 = 중화기) · evLead 봇 결정적 1판씩. 사람 성공률 아님', generatedBy: 'A_heavy-blast-share.mjs', rows };
writeFileSync(new URL('./A_heavy-blast-share.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
for (const r of rows) console.log(`S${r.stage} heavy evLead won ${r.won} t ${r.timeSec.toFixed(1)} end ${r.endUnits} dmg ${JSON.stringify(r.dmg)} blastShare ${(r.blastShare * 100).toFixed(1)}%`);
