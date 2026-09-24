// B_hero-exposure.mjs — 검토 3번 증거(2): 피해원별 피해량 표 + 봇 판에서 '처음 유닛(로봇 자리)'이 얼마나 맞고 언제 빠지는가.
// 읽기 전용: rush3·tests/lib 를 import 만 한다. 실행:
//   node "E:\workspace\claude\neon-fleet\worktrees\v3-lastwar\newmode\v3\review3\evidence\B_hero-exposure.mjs"
// 결과: 같은 폴더 B_hero-exposure.json
// ⚠️ 봇 수치는 정해진 입력(evLead·aimLead·planBoss)으로 한 판씩 돌린 결과다. 사람의 성공률이 아니다.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildStage, ALL_STAGE_IDS } from '../../../../rush3/stages.js';
import { createRun, stepRun, drainEvents, enemyDefsFor, STEP } from '../../../../rush3/combat.js';
import { BAL3 } from '../../../../rush3/balance.js';
import { pickInput } from '../../../../tests/lib/rush3-policies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const UNIT_HP = BAL3.squad.unitHp;
const DIFFS = ['normal', 'hard', 'brutal'];
const out = { script: 'B_hero-exposure.mjs', unitHp: UNIT_HP,
  note: '로봇 = createRun 이 처음 만든 유닛(id 1). 봇 결과는 정해진 입력으로 한 판씩 돌린 결과이며 사람의 성공률이 아니다.' };

// ---------- 1. 피해원별 피해량(난이도 배수 적용 뒤) ----------
const dmgTable = [];
for (const d of DIFFS) {
  const E = enemyDefsFor(d);
  const row = (src, dmg, scope) => dmgTable.push({ difficulty: d, source: src, dmg, scope, hitsToKill: dmg > 0 ? Math.ceil(UNIT_HP / dmg) : null });
  row('잡졸 접촉(grunt touch)', E.grunt.touchDmg, '겹친 유닛 중 앞줄 1명, 적 소멸');
  row('돌격체 접촉(rusher touch)', E.rusher.touchDmg, '겹친 유닛 중 앞줄 1명, 적 소멸');
  row('저격수 탄(shooter shot)', E.shooter.shot.dmg, '스윕에서 먼저 닿는 1명');
  row('정예 부채꼴 탄(elite shot ×3)', E.elite.shot.dmg, '탄마다 먼저 닿는 1명(3발)');
  row('정예 겹침(elite touch, 0.5초마다)', E.elite.touchDmg, '겹친 유닛 중 앞줄 1명');
  for (const id of [15, 20, 24]) {
    const run = createRun(buildStage(id, { difficulty: d }));
    const B = run.arena.boss;
    row(`광장 보스 S${id} 착지 충격(r ${B.shock.r})`, B.shock.dmg, '충격 원과 겹치는 유닛 전부(여러 명 동시)');
    row(`광장 보스 S${id} 겹침(0.5초마다)`, B.touchDmg, '겹친 유닛 중 앞줄 1명');
    if (B.shoot) row(`광장 보스 S${id} 사격(부채꼴 ${B.shoot.fan})`, run.enemyDefs.elite.shot.dmg, '탄마다 먼저 닿는 1명');
  }
}
out.dmgTable = dmgTable;

// ---------- 2. 봇 판에서 로봇 자리 노출 ----------
function track(id, policy, difficulty, maxSteps = 14400) {
  const run = createRun(buildStage(id, { difficulty }));
  const heroId = run.units.length ? run.units[0].id : null;
  const r = { stage: id, policy, difficulty, startUnits: run.units.length,
    hurtAll: {}, hurtHero: {}, heroHurtWithEscort: 0, heroLost: null, drawnHeroChanges: 0,
    shockSteps: 0, shockStepsHeroPlusOthers: 0, shockMaxHits: 0, multiShotSteps: 0, heroShotPlusOtherShotSameStep: 0,
    lossBy: null, win: false, lose: false, time: 0, units: 0,
    hurtIdx0: {}, hurtTotalByCause: {}, expectedIdx0IfUniform: {} };
  let steps = 0, prevIdx0 = heroId;
  while (!run.over && steps < maxSteps) {
    const idsBefore = run.units.map((u) => u.id);
    const aliveOthersBefore = run.units.filter((u) => u.id !== heroId && u.hp > 0).length;
    stepRun(run, pickInput(policy, run), STEP);
    const evs = drainEvents(run);
    const shockIds = new Set(); let shotHero = false, shotOther = 0, shock = false;
    for (const e of evs) {
      if (e.type === 'hurt') {
        r.hurtAll[e.cause] = (r.hurtAll[e.cause] || 0) + 1;
        if (e.unitId === heroId) {
          r.hurtHero[e.cause] = (r.hurtHero[e.cause] || 0) + 1;
          if (aliveOthersBefore > 0) r.heroHurtWithEscort++;
          if (e.cause === 'shot') shotHero = true;
        } else if (e.cause === 'shot') shotOther++;
        if (e.cause === 'shock') shockIds.add(e.unitId);
        //  지금 배열 0번(화면의 로봇 그림)이 맞았는가 — 균등하게 맞는다면 기대 비율은 1/병력
        r.hurtTotalByCause[e.cause] = (r.hurtTotalByCause[e.cause] || 0) + 1;
        if (idsBefore.length && e.unitId === idsBefore[0]) r.hurtIdx0[e.cause] = (r.hurtIdx0[e.cause] || 0) + 1;
        if (idsBefore.length) r.expectedIdx0IfUniform[e.cause] = (r.expectedIdx0IfUniform[e.cause] || 0) + 1 / idsBefore.length;
      }
      if (e.type === 'bossShock') { shock = true; r.shockMaxHits = Math.max(r.shockMaxHits, e.hits); }
      if (e.type === 'win') r.win = true;
      if (e.type === 'lose') r.lose = true;
    }
    if (shock) { r.shockSteps++; if (shockIds.has(heroId) && shockIds.size >= 2) r.shockStepsHeroPlusOthers++; }
    if ((shotHero ? 1 : 0) + shotOther >= 2) r.multiShotSteps++;
    if (shotHero && shotOther > 0) r.heroShotPlusOtherShotSameStep++;
    if (!r.heroLost && idsBefore.includes(heroId) && !run.units.some((u) => u.id === heroId)) {
      const hurt = evs.filter((e) => e.type === 'hurt' && e.unitId === heroId).map((e) => e.cause);
      const gp = evs.find((e) => e.type === 'gatePass' && e.applied < 0);
      r.heroLost = { t: +run.time.toFixed(2), cause: hurt.length ? hurt.join('+') : (gp ? 'gate' : 'unknown'), unitsLeft: run.units.length, phase: run.phase };
    }
    const idx0 = run.units.length ? run.units[0].id : null;
    if (idx0 !== prevIdx0 && idx0 !== null) r.drawnHeroChanges++;
    prevIdx0 = idx0;
    steps++;
  }
  r.time = +run.time.toFixed(2); r.units = run.units.length;
  r.lossBy = { touch: run.lossByTouch, shot: run.lossByShot, shock: run.lossByShock, gate: run.lossByGate };
  return r;
}

const POLS = ['evLead', 'aimLead', 'planBoss'];
const runs = [];
for (const d of ['normal', 'brutal']) for (const p of POLS) for (const id of ALL_STAGE_IDS) runs.push(track(id, p, d));
out.runs = runs;

// 묶음 요약
function agg(list) {
  const s = { runs: list.length, wins: 0, heroLostRuns: 0, heroLostInWins: 0, heroLostCause: {}, hurtAll: 0, hurtHero: 0, heroHurtWithEscort: 0,
              shockSteps: 0, shockStepsHeroPlusOthers: 0, heroShotPlusOtherShotSameStep: 0, drawnHeroChangesTotal: 0, lossGate: 0,
              idx0Hits: {}, idx0Expected: {}, hitsByCause: {} };
  for (const r of list) {
    if (r.win) s.wins++;
    if (r.heroLost) { s.heroLostRuns++; s.heroLostCause[r.heroLost.cause] = (s.heroLostCause[r.heroLost.cause] || 0) + 1; if (r.win) s.heroLostInWins++; }
    s.hurtAll += Object.values(r.hurtAll).reduce((a, b) => a + b, 0);
    s.hurtHero += Object.values(r.hurtHero).reduce((a, b) => a + b, 0);
    s.heroHurtWithEscort += r.heroHurtWithEscort;
    s.shockSteps += r.shockSteps; s.shockStepsHeroPlusOthers += r.shockStepsHeroPlusOthers;
    s.heroShotPlusOtherShotSameStep += r.heroShotPlusOtherShotSameStep;
    s.drawnHeroChangesTotal += r.drawnHeroChanges;
    s.lossGate += r.lossBy.gate;
    for (const [c, v] of Object.entries(r.hurtIdx0)) s.idx0Hits[c] = (s.idx0Hits[c] || 0) + v;
    for (const [c, v] of Object.entries(r.expectedIdx0IfUniform)) s.idx0Expected[c] = +((s.idx0Expected[c] || 0) + v).toFixed(2);
    for (const [c, v] of Object.entries(r.hurtTotalByCause)) s.hitsByCause[c] = (s.hitsByCause[c] || 0) + v;
  }
  s.heroHitShare = s.hurtAll ? +(s.hurtHero / s.hurtAll).toFixed(3) : null;
  return s;
}
out.summary = {};
for (const d of ['normal', 'brutal']) for (const p of POLS) out.summary[`${d}/${p}`] = agg(runs.filter((r) => r.difficulty === d && r.policy === p));

writeFileSync(join(here, 'B_hero-exposure.json'), JSON.stringify(out, null, 2));

console.log('--- 피해량 표(unitHp', UNIT_HP, ') ---');
for (const d of DIFFS) console.log(d, dmgTable.filter((x) => x.difficulty === d).map((x) => `${x.source}=${x.dmg}(${x.hitsToKill}타)`).join(' | '));
console.log('--- 봇 요약 ---');
for (const [k, s] of Object.entries(out.summary)) console.log(k, JSON.stringify(s));
console.log('--- 판별 로봇 이탈(brutal) ---');
for (const r of runs.filter((r) => r.difficulty === 'brutal')) console.log(`S${r.stage} ${r.policy} win ${r.win} t ${r.time} units ${r.units} heroLost ${JSON.stringify(r.heroLost)} hurtHero ${JSON.stringify(r.hurtHero)} hurtAll ${JSON.stringify(r.hurtAll)} shock ${r.shockSteps}/${r.shockStepsHeroPlusOthers} max ${r.shockMaxHits} drawnChanges ${r.drawnHeroChanges}`);
