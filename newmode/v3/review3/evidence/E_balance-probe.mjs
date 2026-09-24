// E_balance-probe.mjs — v4 기획 검토 E 담당(검토 5번 T1·T2, 도로/광장 분리) 봇 재현.
//  읽기 전용: rush3·tests/lib 를 import 만 한다. 결과는 같은 폴더 E_balance-probe.json.
//  ⚠️봇 수치는 "정해진 입력으로 한 판씩 돌린 봇 결과"이지 사람의 성공률이 아니다.
//  루프는 tests/lib/rush3-policies.mjs playPolicy(L189-203)와 같은 순서(createRun(buildStage) → stepRun(pickInput) → drainEvents)로 돌리되,
//   보스 등장 시각('elite' 이벤트)·광장 진입 시각('arenaEnter')을 따로 잡는다. 같은 판을 playPolicy 로도 돌려 결과가 같은지 대조한다.
//  실행: node E_balance-probe.mjs  (cwd = 이 폴더)
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRun, stepRun, drainEvents, STEP } from '../../../../rush3/combat.js';
import { buildStage } from '../../../../rush3/stages.js';
import { pickInput, playPolicy } from '../../../../tests/lib/rush3-policies.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const MAX_STEPS = 14400; // playPolicy 기본값(4분)
const DIFF = 'brutal';

function one(id, policy) {
  const stage = buildStage(id, { difficulty: DIFF });
  const run = createRun(stage);
  let steps = 0, eliteAt = null, arenaAt = null;
  while (!run.over && steps < MAX_STEPS) {
    stepRun(run, pickInput(policy, run), STEP);
    for (const e of drainEvents(run)) {
      if (e.type === 'elite' && eliteAt === null) eliteAt = run.time;
      if (e.type === 'arenaEnter' && arenaAt === null) arenaAt = run.time;
    }
    steps++;
  }
  const status = run.won ? 'win' : (run.over ? 'lose' : 'timeout');
  const endT = run.won ? run.wonAt : run.time; // 승리는 본전투 확정 시각(보너스 20초 제외)
  const alive = run.bosses.filter((b) => !b.dead);
  const r1 = (v) => Math.round(v * 100) / 100;
  const rec = {
    stage: id, policy, difficulty: DIFF, arena: !!stage.arena, stageVersion: stage.version,
    status,
    survivors: run.won ? run.mainResult.survivors : run.units.length,
    unitsAtEnd: run.units.length,
    peak: run.peak,
    timeSec: r1(endT),
    runTimeSec: r1(run.time),
    hasBonus: !!stage.bonus,
    eliteAtSec: eliteAt === null ? null : r1(eliteAt),
    arenaEnterAtSec: arenaAt === null ? null : r1(arenaAt),
    bossFightSec: eliteAt === null ? null : r1(endT - eliteAt),
    bossesTotal: run.elites.length,
    bossHpLeft: status === 'win' ? 0 : (eliteAt === null ? null : alive.reduce((s, b) => s + Math.ceil(b.hp), 0)),
    bossHpLeftEach: status === 'win' ? [] : alive.map((b) => ({ id: b.id, hp: Math.ceil(b.hp), max: b.max })),
    steps,
    lossByTouch: run.lossByTouch, lossByShot: run.lossByShot, lossByGate: run.lossByGate, lossByShock: run.lossByShock,
    kills: run.kills,
  };
  //  대조: playPolicy 로 같은 판(결정적) — 승패·남은 병력·최고 병력·STEP 수가 같아야 한다
  const pp = playPolicy(id, policy, MAX_STEPS, DIFF);
  rec.playPolicyCheck = {
    won: pp.run.won, units: pp.run.units.length, peak: pp.run.peak, steps: pp.steps,
    same: pp.run.won === run.won && pp.run.units.length === run.units.length && pp.run.peak === run.peak && pp.steps === steps,
  };
  return rec;
}

const fmt = (r) => r.status === 'win' ? `승 ${r.survivors}/${r.peak}`
  : r.status === 'lose' ? `패 ${r.survivors}/${r.peak} · ${r.bossHpLeft === null ? '보스전 전' : r.bossHpLeft}`
  : `시간초과 ${r.survivors}/${r.peak}`;

//  1) 원본 기획 3-2 표(9/24 실측) — 문자열 그대로 옮김
const PLAN_TABLE = {
  evLead:   ['승 26/29', '패 0/16 · 126', '승 61/78', '승 24/33', '승 20/27'],
  aimLead:  ['승 5/14',  '패 0/16 · 126', '승 24/51', '패 0/18 · 24', '패 0/12 · 64'],
  planBoss: ['패 0/14 · 95', '패 0/10 · 214', '승 62/78', '패 0/27 · 57', '패 0/12 · 97'],
};

const t0 = Date.now();
const part1 = [];
for (const policy of ['evLead', 'aimLead', 'planBoss']) {
  for (let id = 1; id <= 5; id++) {
    const r = one(id, policy);
    r.cell = fmt(r);
    r.planCell = PLAN_TABLE[policy][id - 1];
    r.matchesPlan = r.cell === r.planCell;
    part1.push(r);
    console.log('P1', policy, id, r.cell, '| plan', r.planCell, r.matchesPlan ? 'OK' : 'DIFF', '| pp', r.playPolicyCheck.same);
  }
}

//  2) brutal 4~24 evLead — 도로/광장 분리
const part2 = [];
for (let id = 4; id <= 24; id++) {
  const r = one(id, 'evLead');
  r.cell = fmt(r);
  part2.push(r);
  console.log('P2', id, r.arena ? 'ARENA' : 'road ', r.cell, 't', r.timeSec, 'boss', r.eliteAtSec, '→', r.bossFightSec, '| pp', r.playPolicyCheck.same);
}
const split = (rows) => ({
  n: rows.length,
  wins: rows.filter((r) => r.status === 'win').length,
  losses: rows.filter((r) => r.status === 'lose').map((r) => r.stage),
  timeouts: rows.filter((r) => r.status === 'timeout').map((r) => r.stage),
  meanTimeSecWins: (() => { const w = rows.filter((r) => r.status === 'win'); return w.length ? Math.round(w.reduce((s, r) => s + r.timeSec, 0) / w.length * 10) / 10 : null; })(),
  meanBossFightSecWins: (() => { const w = rows.filter((r) => r.status === 'win' && r.bossFightSec != null); return w.length ? Math.round(w.reduce((s, r) => s + r.bossFightSec, 0) / w.length * 10) / 10 : null; })(),
  medianTimeSecWins: median(rows.filter((r) => r.status === 'win').map((r) => r.timeSec)),
  medianBossFightSecWins: median(rows.filter((r) => r.status === 'win' && r.bossFightSec != null).map((r) => r.bossFightSec)),
  bossFightSecLosses: rows.filter((r) => r.status === 'lose').map((r) => ({ stage: r.stage, bossFightSec: r.bossFightSec, bossHpLeft: r.bossHpLeft, bossHpMax: r.bossHpLeftEach.reduce((s, b) => s + b.max, 0) })),
});
function median(a) {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return Math.round((s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) * 100) / 100;
}
const road = part2.filter((r) => !r.arena), arena = part2.filter((r) => r.arena);
const late = part2.filter((r) => r.stage >= 15);
const out = {
  meta: {
    script: 'E_balance-probe.mjs', date: new Date().toISOString(), node: process.version,
    difficulty: DIFF, maxSteps: MAX_STEPS, step: STEP,
    note: '정해진 입력으로 한 판씩 돌린 봇 결과(결정적). 사람의 성공률이 아니다. 승리 시각 = mainResult.wonAt(보너스전 제외). 보스전 시간 = 첫 elite 이벤트 시각 → 판 끝(승리는 wonAt, 패배는 lose 시각).',
    arenaStages: part2.filter((r) => r.arena).map((r) => r.stage),
    elapsedMs: null,
  },
  part1_brutal_1to5_3bots: part1,
  part1_allMatchPlan: part1.every((r) => r.matchesPlan),
  part1_allPlayPolicySame: part1.every((r) => r.playPolicyCheck.same),
  part2_brutal_4to24_evLead: part2,
  part2_summary: { all: split(part2), road: split(road), arena: split(arena), late15to24: split(late), late15to24_road: split(late.filter((r) => !r.arena)) },
  part2_allPlayPolicySame: part2.every((r) => r.playPolicyCheck.same),
};
out.meta.elapsedMs = Date.now() - t0;
writeFileSync(join(HERE, 'E_balance-probe.json'), JSON.stringify(out, null, 1));
console.log('summary', JSON.stringify(out.part2_summary));
console.log('allMatchPlan', out.part1_allMatchPlan, 'ppSame', out.part1_allPlayPolicySame, out.part2_allPlayPolicySame, 'ms', out.meta.elapsedMs);
