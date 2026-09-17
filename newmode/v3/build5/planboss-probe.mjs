// newmode/v3/build5/planboss-probe.mjs — SD-7 성공 경로 봇(planBoss) 결과표 뽑기(보고서 수치의 출처).
//  실행: node newmode/v3/build5/planboss-probe.mjs   ⚠️규칙 코드는 읽기 전용, 검사와 같은 playPolicy 를 쓴다.
import { playPolicy } from '../../../tests/lib/rush3-policies.mjs';

const rows = [];
for (const d of ['normal', 'hard', 'brutal']) {
  for (const id of [1, 2, 3]) {
    for (const p of ['plan', 'planBoss']) {
      const r = playPolicy(id, p, 14400, d), run = r.run;
      rows.push({ difficulty: d, stage: id, policy: p, won: run.won, units: run.units.length, peak: run.peak,
                  weapon: run.weapon, elite: r.events.elite === 1, bossHpLeft: run.boss ? Math.ceil(run.boss.hp) : 0,
                  kills: run.kills, lossByShot: run.lossByShot, lossByTouch: run.lossByTouch,
                  time: +run.time.toFixed(1), steps: r.steps });
    }
  }
}
for (const r of rows) console.log(JSON.stringify(r));
