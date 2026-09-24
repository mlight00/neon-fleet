// A_bot-runs.mjs — 검토 1·2번 봇 측정(지옥 brutal 1~3번 × evLead·aimLead·planBoss, 정책마다 한 판씩).
//  playPolicy(tests/lib/rush3-policies.mjs L189-203)와 같은 판을 직접 돌리며(같은 buildStage 인자·같은 pickInput·같은 STEP)
//  매 STEP 뒤의 상태를 기록한다. 판 결과가 playPolicy 와 같은지 마지막에 대조한다.
//  기록: ① 병력 수 run.units.length(매 STEP 뒤) — 최소·중앙값·최대, 보스 등장 STEP(첫 'elite' 이벤트)의 병력
//        ② 게이트 칸마다 셔터 열린 STEP·값이 상한(maxValue)에 닿은 첫 STEP·행 통과 STEP·통과 값 = 강화 0단계 기준선
//        ③ 실제로 나온 적의 체력(스폰 순간 hpMax)·보스 체력 — A_first-buy 덤프와 대조
//        ④ 적에게 들어간 피해를 직격/폭발/연쇄로 나눈 합(enemyHit 이벤트 dmg, combat.js L412·L449·L475)
//  ⚠️정해진 입력으로 한 판씩 돌린 봇 결과다. 사람의 성공률·체감이 아니다. 랜덤 길은 기본 시드(3번 = −15 게이트)다.
//  실행: node A_bot-runs.mjs  → A_bot-runs.json
import { writeFileSync } from 'node:fs';
import { createRun, stepRun, drainEvents, STEP } from '../../../../rush3/combat.js';
import { buildStage } from '../../../../rush3/stages.js';
import { pickInput, playPolicy } from '../../../../tests/lib/rush3-policies.mjs';

const DIFF = 'brutal', MAX_STEPS = 14400;
const POLICIES = ['evLead', 'aimLead', 'planBoss'];
// 첫 구매 후보별 E(메인 로봇 = 병사 몇 명분, 전탄 명중·연속 사격 가정). 화력은 적 체력별 계단이 있어 A_first-buy.json effectivePowerE 참고
const E = { power1: 1.3, rate1: 1 / 0.87, multi1: 2 };
const share = (e, n) => (n >= 1 ? e / (e + n - 1) : null);
const squadGain = (e, n) => (n >= 1 ? (e - 1) / n : null);   // 부대 전체 화력 증가율

function median(arr) {
  const a = [...arr].sort((x, y) => x - y);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

function oneRun(id, policy) {
  const run = createRun(buildStage(id, { difficulty: DIFF }));
  const n0 = run.units.length;
  const units = [];
  let bossStep = null, bossUnitsBefore = null, bossUnitsAfter = null, arenaStep = null;
  // 게이트 칸 추적
  const cells = {};
  for (const row of run.gateRows) {
    for (const c of row.cells) {
      cells[row.id + ':' + c.idx] = {
        row: row.id, idx: c.idx, z: row.z, x0: c.x0, x1: c.x1, armZ: row.armZ, bypass: row.bypass, value0: c.value, maxValue: c.maxValue,
        armStep: row.armed ? 0 : null, maxStep: c.value >= c.maxValue && row.armed ? 0 : null, passStep: null,
        valueAtPass: null, chosen: false, applied: null, hits: 0, blocks: 0,
      };
    }
  }
  const rowPass = {};
  const weaponLog = [{ step: 0, weapon: run.weapon, mk: run.weaponMk }];
  const seenEnemy = new Set(), enemyHpSeen = {};
  const dmgBy = { direct: 0, blast: 0, arc: 0 };
  let steps = 0;
  while (!run.over && steps < MAX_STEPS) {
    const before = run.units.length;
    stepRun(run, pickInput(policy, run), STEP);
    steps++;
    const evs = drainEvents(run);
    for (const e of evs) {
      if (e.type === 'elite' && bossStep === null) { bossStep = steps; bossUnitsBefore = before; }
      if (e.type === 'arenaEnter' && arenaStep === null) arenaStep = steps;
      if (e.type === 'gateArm') for (const c of Object.values(cells)) if (c.row === e.id && c.armStep === null) c.armStep = steps;
      if (e.type === 'gateHit' || e.type === 'gateFlip') { const c = cells[e.id + ':' + e.idx]; if (c) c.hits++; }
      if (e.type === 'gateBlock') { const c = cells[e.id + ':' + e.idx]; if (c) c.blocks++; }
      if (e.type === 'gatePass') {
        rowPass[e.id] = { step: steps, value: e.value, applied: e.applied, idx: e.idx, unitsBefore: before };
        for (const c of Object.values(cells)) if (c.row === e.id) c.passStep = steps;
        const c = cells[e.id + ':' + e.idx];
        if (c) { c.chosen = true; c.valueAtPass = e.value; c.applied = e.applied; }
      }
      if (e.type === 'weaponSwap' || e.type === 'weaponMk') weaponLog.push({ step: steps, weapon: run.weapon, mk: run.weaponMk, ev: e.type });
      if (e.type === 'enemyHit') {
        if (e.blast) dmgBy.blast += e.dmg; else if (e.arc) dmgBy.arc += e.dmg; else dmgBy.direct += e.dmg;
      }
    }
    if (bossStep === steps) bossUnitsAfter = run.units.length;
    // 칸 값이 상한에 처음 닿은 STEP(행이 아직 안 지나갔을 때만)
    for (const row of run.gateRows) {
      for (const c of row.cells) {
        const t = cells[row.id + ':' + c.idx];
        if (t.maxStep === null && t.passStep === null && c.value >= c.maxValue) t.maxStep = steps;
        if (t.passStep === null) t.valueNow = c.value;
      }
    }
    // 실제 적 체력(스폰 순간)
    for (const en of run.enemies) {
      if (seenEnemy.has(en.id)) continue;
      seenEnemy.add(en.id);
      const key = en.kind + (en.chase ? '(광장소환)' : '') + ':' + en.hpMax;
      enemyHpSeen[key] = (enemyHpSeen[key] || 0) + 1;
    }
    units.push(run.units.length);
  }
  const bosses = run.bosses.map((b) => ({ id: b.id, max: b.max, hpLeft: Math.max(0, b.hp), dead: b.dead }));
  // 병력 통계(매 STEP 뒤 표본). 패배 판의 마지막 0 은 최소에서 빼고 따로 표시
  const alive = units.filter((n) => n >= 1);
  const stats = { start: n0, min: Math.min(...alive), median: median(alive), max: Math.max(...alive), endUnits: run.units.length, samples: units.length,
                  fracStepsAtMost5: alive.filter((n) => n <= 5).length / alive.length, fracStepsAtMost10: alive.filter((n) => n <= 10).length / alive.length,
                  fracStepsAtLeast30: alive.filter((n) => n >= 30).length / alive.length };
  const bossN = bossUnitsAfter;
  const pick = (n) => (n == null ? null : Object.fromEntries(Object.entries(E).map(([k, e]) => [k, { heroShare: share(e, n), heroShareBase: share(1, n), squadGain: squadGain(e, n) }])));
  const heroShare = { atMin: pick(stats.min), atMedian: pick(stats.median), atMax: pick(stats.max), atBoss: pick(bossN) };
  // 보스전 구간(보스 등장 ~ 판 끝)의 병력 중앙값
  const bossPhaseMedian = bossStep != null ? median(units.slice(bossStep - 1).filter((n) => n >= 1)) : null;
  // 칸 기록 정리(초 단위·통과 전 여유)
  const cellRows = Object.values(cells).map((c) => ({
    ...c,
    armSec: c.armStep != null ? c.armStep * STEP : null, maxSec: c.maxStep != null ? c.maxStep * STEP : null, passSec: c.passStep != null ? c.passStep * STEP : null,
    reachedMax: c.maxStep != null,
    //  셔터 열림 → 통과 사이 시간 중 상한 도달까지 쓴 비율(1 미만이면 통과 전에 이미 포화 = 더 쏜 탄은 뒤로 통과)
    fracWindowToMax: c.maxStep != null && c.passStep != null && c.armStep != null && c.passStep > c.armStep ? (c.maxStep - c.armStep) / (c.passStep - c.armStep) : null,
    secBeforePassAtMax: c.maxStep != null && c.passStep != null ? (c.passStep - c.maxStep) * STEP : null,
    unitsAtArm: c.armStep > 0 ? units[c.armStep - 1] : n0, unitsAtPass: c.passStep != null ? units[c.passStep - 2] ?? null : null,
    secArmToMax: c.maxStep != null && c.armStep != null ? (c.maxStep - c.armStep) * STEP : null,
    //  추정(규칙 계산 아님): 메인 로봇 다연발 1 의 추가 탄이 게이트에도 +1 이면 이 칸 명중 수가 대략 (1 ÷ 셔터 열릴 때 병력) 비율만큼 늘어난다
    estExtraHitsIfMulti1CountsOnGate: c.hits && (c.armStep > 0 ? units[c.armStep - 1] : n0) ? c.hits / (c.armStep > 0 ? units[c.armStep - 1] : n0) : 0,
    note: c.maxStep != null ? '상한 도달' : (c.chosen ? '통과 칸이지만 상한 미도달' : '상한 미도달(봇이 다른 칸을 골랐거나 우회)'),
  }));
  return {
    stage: id, policy, won: run.won, over: run.over, steps, timeSec: run.time, wonAt: run.wonAt, endUnits: run.units.length, peak: run.peak, kills: run.kills,
    finalWeapon: run.weapon, finalMk: run.weaponMk, weaponLog, lottery: run.lottery ? run.lottery.pick : null,
    bossStep, bossSec: bossStep != null ? bossStep * STEP : null, bossUnitsBefore, bossUnitsAfter, arenaStep, bossPhaseMedian, bosses,
    units: stats, heroShare, gates: cellRows, rowPass, enemyHpSeen, dmgBy,
    losses: { byGate: run.lossByGate, byTouch: run.lossByTouch, byShot: run.lossByShot, byShock: run.lossByShock },
    unitsSeries: units,
  };
}

const results = [];
const crossCheck = [];
for (const id of [1, 2, 3]) {
  for (const policy of POLICIES) {
    const r = oneRun(id, policy);
    const ref = playPolicy(id, policy, MAX_STEPS, DIFF);
    const same = ref.run.won === r.won && ref.run.units.length === r.endUnits && ref.steps === r.steps && ref.run.peak === r.peak;
    crossCheck.push({ stage: id, policy, same, ref: { won: ref.run.won, units: ref.run.units.length, steps: ref.steps, peak: ref.run.peak } });
    results.push(r);
  }
}

const out = {
  kind: '봇 결과(지옥 brutal, 정책마다 결정적 1판). 사람의 성공률·체감이 아니다',
  generatedBy: 'A_bot-runs.mjs',
  E, formula: 'heroShare = E / (E + n − 1) (전탄 명중·같은 무기 가정), squadGain = (E − 1) / n',
  crossCheck,
  results: results.map((r) => ({ ...r, unitsSeries: undefined })),
  unitsSeries: Object.fromEntries(results.map((r) => [r.stage + ':' + r.policy, r.unitsSeries])),
};
writeFileSync(new URL('./A_bot-runs.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');

for (const r of results) {
  console.log(`S${r.stage} ${r.policy}: won ${r.won} t ${r.timeSec.toFixed(1)}s end ${r.endUnits} peak ${r.peak} weapon ${r.finalWeapon}/Mk${r.finalMk} ` +
    `units min ${r.units.min} med ${r.units.median} max ${r.units.max} boss@${r.bossSec?.toFixed(1)}s n=${r.bossUnitsAfter} bossPhaseMed ${r.bossPhaseMedian} ` +
    `dmg ${JSON.stringify(r.dmgBy)} hpSeen ${JSON.stringify(r.enemyHpSeen)}`);
  for (const c of r.gates) console.log(`   ${c.row}:${c.idx} v${c.value0}/max${c.maxValue} arm ${c.armSec?.toFixed(2)} max ${c.maxSec?.toFixed(2) ?? '-'} pass ${c.passSec?.toFixed(2)} chosen ${c.chosen} valPass ${c.valueAtPass} hits ${c.hits} blocks ${c.blocks} frac ${c.fracWindowToMax?.toFixed(2) ?? '-'} spare ${c.secBeforePassAtMax?.toFixed(2) ?? '-'} now ${c.valueNow}`);
}
console.log('crossCheck', JSON.stringify(crossCheck.map((c) => c.same)));
