// F_budget-probe.mjs — 검토 4번(스테이지 예산 방식 비교)용 이벤트 시각표 재측정. 게임 코드·기존 파일은 읽기만 한다.
//  실행: "C:/Program Files/nodejs/node" F_budget-probe.mjs   (출력: 같은 폴더 F_budget-events.json)
//  D_econ-probe.mjs 와 같은 72판(지옥 1~24번 × evLead·aimLead·planBoss, 최대 14400 STEP, 랜덤 길 기본 시드)을 돌리며
//  판마다 "무슨 일이 몇 번째 STEP 에 일어났는지"만 저장한다. 코인 공식은 여기서 정하지 않는다(F_budget-eval.mjs 가 시각표로 계산).
//  소환 적 판별은 D 방식 그대로: 한 STEP 안에서 spawnDue(일정 스폰)가 moveEnemies(소환)보다 먼저 번호를 받으므로
//   새 번호 중 앞쪽 Σspawn.n 개 = 일정 스폰, 뒤쪽 Σsummon.n 개 = 소환.
//  마지막에 초안 공식(H0)으로 다시 계산해 D_econ-results.json(읽기만)과 판마다·합계를 대조한다.
//  모든 값 = 봇 측정(정해진 입력, 한 판씩). 사람의 수입이 아니다.
import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRun, stepRun, drainEvents, STEP } from '../../../../rush3/combat.js';
import { buildStage, ALL_STAGE_IDS, LOTTERY_DEFAULT_SEED } from '../../../../rush3/stages.js';
import { pickInput } from '../../../../tests/lib/rush3-policies.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIFF = 'brutal';
const MAX_STEPS = 14400;
const POLICIES = ['evLead', 'aimLead', 'planBoss'];

function playOne(id, policy) {
  const stage = buildStage(id, { difficulty: DIFF });
  const scheduledTotal = stage.spawns.reduce((a, sp) => a + sp.n, 0);
  const bossCount = stage.elites.length;
  const run = createRun(stage);
  const summonKindRoad = run.enemyDefs.elite.summonKind;
  const summonKindArena = run.arena && run.arena.boss.summon ? run.arena.boss.summon.kind : null;
  const info = new Map();   // 적 번호 → { hpMax, summoned }
  const chk = { spawnCursorMismatch: 0, idRangeMismatch: 0, hpScanMismatch: 0, killUnknownId: 0, summonKindMismatch: 0 };
  const schedKills = [];    // [STEP 번호, 최대 체력]
  const summonKills = [];   // STEP 번호
  const bossKills = [];     // STEP 번호
  let bossAppearStep = null, bossAppearT = null;
  let spawnedSched = 0, spawnedSummon = 0;
  let winStep = null;
  let steps = 0;
  while (!run.over && steps < MAX_STEPS) {
    const id0 = run.nextEnemyId;
    const c0 = run.spawnCursor;
    const wasWon = run.won;
    stepRun(run, pickInput(policy, run), STEP);
    steps++;
    const evs = drainEvents(run);
    const id1 = run.nextEnemyId;
    let nSched = 0, nSumm = 0;
    const summKinds = [];
    for (const e of evs) {
      if (e.type === 'spawn') nSched += e.n;
      if (e.type === 'summon') { nSumm += e.n; for (let k = 0; k < e.n; k++) summKinds.push(e.kind); }
    }
    if (id1 - id0 !== nSched + nSumm) chk.idRangeMismatch++;
    const schedHp = [];
    {
      const defs = run.spawns.slice(c0, run.spawnCursor);
      let nDef = 0;
      for (const d of defs) { nDef += d.n; for (let k = 0; k < d.n; k++) schedHp.push(d.hp); }
      if (nDef !== nSched) chk.spawnCursorMismatch++;
    }
    for (let i = 0; i < nSched; i++) { info.set(id0 + i, { hpMax: schedHp[i], summoned: false }); spawnedSched++; }
    for (let i = 0; i < nSumm; i++) {
      const kind = summKinds[i];
      if (kind !== summonKindRoad && kind !== summonKindArena) chk.summonKindMismatch++;
      info.set(id0 + nSched + i, { hpMax: run.enemyDefs[kind].hp, summoned: true });
      spawnedSummon++;
    }
    for (const e of run.enemies) { const inf = info.get(e.id); if (inf && inf.hpMax !== e.hpMax) chk.hpScanMismatch++; }
    for (const e of evs) {
      if (e.type === 'kill') {
        const inf = info.get(e.id);
        if (!inf) { chk.killUnknownId++; continue; }
        if (inf.summoned) summonKills.push(steps);
        else schedKills.push([steps, inf.hpMax]);
      } else if (e.type === 'bossKill') {
        bossKills.push(steps);
      } else if ((e.type === 'elite' || e.type === 'arenaEnter') && bossAppearStep == null) {
        bossAppearStep = steps; bossAppearT = run.time;
      }
    }
    if (!wasWon && run.won) winStep = steps;
  }
  const won = !!run.won;
  const result = won ? 'win' : run.over ? 'lose' : 'timeout';
  return {
    stage: id, policy, result,
    totalSteps: steps,                       // 보너스전(8번) 포함 전체 STEP
    endStep: won ? winStep : steps,          // 본전투가 끝난 STEP(승리 순간 또는 패배 순간)
    endT: won ? run.mainResult.wonAt : run.time,   // 초(원값). 8번 보너스전 20초는 빠진다
    survivorsAtWin: won ? run.mainResult.survivors : 0,
    scheduledTotal, bossCount, arena: !!stage.arena,
    spawned: { scheduled: spawnedSched, summoned: spawnedSummon },
    bossAppearStep, bossAppearT,
    schedKills, summonKills, bossKills,
    checks: chk,
  };
}

// ── 초안 공식(H0)으로 D 와 같은 값을 다시 만든다(D_econ-probe.mjs 의 정의를 그대로 따름) ──
const RESTART_SEC = 5;
const T_LIST = [15, 30, 45, 60, 90];
const enemyCoinH0 = (hp) => Math.max(1, Math.round(0.25 * hp));
const perMin = (coins, sec) => (sec > 0 ? Math.round((coins / (sec / 60)) * 10) / 10 : 0);
const r1 = (v) => Math.round(v * 100) / 100;
function h0View(r) {
  const upTo = (s) => {
    let enemy = 0, kills = 0;
    for (const [st, hp] of r.schedKills) if (st <= s) { enemy += enemyCoinH0(hp); kills++; }
    const boss = r.bossKills.filter((st) => st <= s).length * 10 * r.stage;
    return { enemy, boss, kills };
  };
  const all = upTo(Infinity);
  const clear = r.result === 'win' ? r.survivorsAtWin : 0;
  const total = all.enemy + all.boss + clear;
  // D 의 그만두기 정의를 그대로(보너스전 STEP 까지 '판이 안 끝났다'로 본다 — D 의 8번 45·60초 칸이 이 방식)
  const farm = T_LIST.map((T) => {
    const s = Math.round(T / STEP);
    if (s <= r.totalSteps) { const u = upTo(s); return { T, endedBeforeT: false, coins: u.enemy + u.boss, cpm: perMin(u.enemy + u.boss, T + RESTART_SEC) }; }
    return { T, endedBeforeT: true, coins: all.enemy + all.boss, cpm: perMin(all.enemy + all.boss, r1(r.endT) + RESTART_SEC) };
  });
  const ba = r.bossAppearStep == null ? null : (() => { const u = upTo(r.bossAppearStep); return { t: r1(r.bossAppearT), coins: u.enemy, kills: u.kills, cpm: perMin(u.enemy, r.bossAppearT + RESTART_SEC) }; })();
  return { enemy: all.enemy, boss: all.boss, clear, total, kills: all.kills, summoned: r.summonKills.length, bossKills: r.bossKills.length,
           timeSec: r1(r.endT), cpm: perMin(total, r.endT + RESTART_SEC), farm, bossAppear: ba };
}

const t0 = Date.now();
const stages = ALL_STAGE_IDS.filter((id) => typeof id === 'number' && id >= 1 && id <= 24);
const runs = [];
for (const id of stages) for (const p of POLICIES) runs.push(playOne(id, p));
const checksTotal = {};
for (const r of runs) for (const [k, v] of Object.entries(r.checks)) checksTotal[k] = (checksTotal[k] || 0) + v;

// ── D 와 대조 ──
const dPath = join(HERE, 'D_econ-results.json');
const recon = { dFile: 'D_econ-results.json', compared: 0, fieldMismatches: 0, mismatchList: [], totals: {} };
if (existsSync(dPath)) {
  const D = JSON.parse(readFileSync(dPath, 'utf8'));
  for (const r of runs) {
    const d = D.runs.find((x) => x.stage === r.stage && x.policy === r.policy);
    if (!d) { recon.mismatchList.push(`${r.stage}/${r.policy}: D 에 없음`); recon.fieldMismatches++; continue; }
    recon.compared++;
    const h = h0View(r);
    const pairs = [
      ['result', r.result, d.result], ['timeSec', h.timeSec, d.timeSec], ['enemy', h.enemy, d.coins.enemy], ['boss', h.boss, d.coins.boss],
      ['clear', h.clear, d.coins.clear], ['total', h.total, d.coins.total], ['cpmWithGap', h.cpm, d.coinPerMinWithGap],
      ['killsScheduled', h.kills, d.kills.scheduled], ['killsSummoned', h.summoned, d.kills.summoned], ['bossKills', h.bossKills, d.kills.boss],
      ['spawnedScheduled', r.spawned.scheduled, d.spawned.scheduled], ['spawnedSummoned', r.spawned.summoned, d.spawned.summoned],
      ['bossAppear.t', h.bossAppear?.t ?? null, d.bossAppear?.t ?? null], ['bossAppear.coins', h.bossAppear?.coins ?? null, d.bossAppear?.coins ?? null],
      ['bossAppear.cpm', h.bossAppear?.cpm ?? null, d.bossAppear?.coinPerMinWithGap ?? null],
    ];
    for (let i = 0; i < T_LIST.length; i++) {
      pairs.push([`farm${T_LIST[i]}.coins`, h.farm[i].coins, d.farm[i].coins]);
      pairs.push([`farm${T_LIST[i]}.ended`, h.farm[i].endedBeforeT, d.farm[i].endedBeforeT]);
      pairs.push([`farm${T_LIST[i]}.cpm`, h.farm[i].cpm, d.farm[i].coinPerMinWithGap]);
    }
    for (const [k, a, b] of pairs) if (a !== b) { recon.fieldMismatches++; recon.mismatchList.push(`${r.stage}/${r.policy} ${k}: F=${a} D=${b}`); }
  }
  for (const p of POLICIES) {
    const rs = runs.filter((r) => r.policy === p).map(h0View);
    const s = (f) => rs.reduce((a, x) => a + f(x), 0);
    const F = { enemy: s((x) => x.enemy), boss: s((x) => x.boss), clear: s((x) => x.clear), all: s((x) => x.total), killsScheduled: s((x) => x.kills), killsSummoned: s((x) => x.summoned) };
    const Db = D.byPolicy[p];
    const Dk = D.runs.filter((x) => x.policy === p).reduce((a, x) => a + x.kills.scheduled, 0);
    recon.totals[p] = { F, D: { ...Db.total, killsScheduled: Dk, killsSummoned: Db.summonedKills },
      same: F.enemy === Db.total.enemy && F.boss === Db.total.boss && F.clear === Db.total.clear && F.all === Db.total.all && F.killsScheduled === Dk && F.killsSummoned === Db.summonedKills };
  }
} else {
  recon.mismatchList.push('D_econ-results.json 없음 — 대조 생략');
}

const out = {
  meta: {
    script: 'F_budget-probe.mjs', generatedAt: new Date().toISOString(), node: process.version, elapsedMs: null,
    difficulty: DIFF, maxSteps: MAX_STEPS, step: STEP, lotterySeed: 'LOTTERY_DEFAULT_SEED(' + LOTTERY_DEFAULT_SEED + ')',
    policies: POLICIES,
    note: '봇 측정(정해진 입력, 한 판씩)의 이벤트 시각표. 코인 공식은 담지 않는다. 사람의 수입이 아니다. 판 사이 5초는 가정(평가 스크립트에서 사용).',
    fields: {
      endStep: '본전투가 끝난 STEP(승리 순간 또는 패배 순간). 시각(초) = STEP × 1/60',
      endT: '본전투 끝 시각(초, 원값). 8번 보너스전 20초는 빠짐',
      totalSteps: '보너스전 포함 전체 STEP(D 의 그만두기 칸 재현용)',
      schedKills: '일정 스폰 적 처치 [STEP, 최대 체력] — 탄·폭발·연쇄로 죽은 적(kill 이벤트). 부딪혀 사라진 적은 없음',
      summonKills: '보스가 소환한 적 처치 STEP',
      bossKills: '보스 처치 STEP',
      bossAppearStep: '보스 첫 등장 STEP(elite 또는 arenaEnter 이벤트)',
      scheduledTotal: '일정 스폰 적 총수(buildStage 스폰 목록 n 합, 소환 제외)',
      survivorsAtWin: '승리 순간 남은 병력(패배면 0)',
    },
  },
  checksTotal,
  reconciliationWithD: recon,
  runs,
};
out.meta.elapsedMs = Date.now() - t0;
writeFileSync(join(HERE, 'F_budget-events.json'), JSON.stringify(out));
console.log('elapsed ms', out.meta.elapsedMs, 'runs', runs.length);
console.log('checks', checksTotal);
console.log('D 대조: 판', recon.compared, '· 칸 불일치', recon.fieldMismatches);
for (const m of recon.mismatchList.slice(0, 20)) console.log('  ', m);
for (const p of POLICIES) console.log(p, JSON.stringify(recon.totals[p]));
