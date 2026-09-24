// D_econ-probe.mjs — 검토 4·5번(코인 경제 실측) 측정 스크립트. 게임 코드는 읽기만 한다(rush3/·tests/lib 수정 없음).
//  실행: "C:/Program Files/nodejs/node" D_econ-probe.mjs   (출력: 같은 폴더 D_econ-results.json)
//  코인 공식 = 기획 v4 초안 3-3 그대로(a 0.25 · b 10 · c 1):
//   일반 적 kill(탄·폭발·연쇄, touched 제외) → max(1, Math.round(0.25 × hpMax)) · 보스 bossKill → 10 × 스테이지 번호 ·
//   승리 → mainResult.survivors × 1 · 보스가 소환한 적 → 0. 8번 보너스전 보상·개발용 판은 넣지 않는다.
//  봇 결과 = 정해진 입력으로 한 판씩 돌린 결정적 결과(사람의 성공률이 아니다).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRun, stepRun, drainEvents, STEP } from '../../../../rush3/combat.js';
import { buildStage, ALL_STAGE_IDS, LOTTERY_DEFAULT_SEED } from '../../../../rush3/stages.js';
import { pickInput } from '../../../../tests/lib/rush3-policies.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIFF = 'brutal';
const MAX_STEPS = 14400;
const POLICIES = ['evLead', 'aimLead', 'planBoss'];
const T_LIST = [15, 30, 45, 60, 90];
const RESTART_SEC = 5;          // 가정: 판 사이 이동·재시작 5초
const A = 0.25, B = 10, C = 1;  // 기획 초안 계수
const enemyCoin = (hpMax) => Math.max(1, Math.round(A * hpMax));
const perMin = (coins, sec) => (sec > 0 ? Math.round((coins / (sec / 60)) * 10) / 10 : 0);
const r1 = (v) => Math.round(v * 100) / 100;

/** 이론 상한(기획 3-3 표와 같은 정의): 스폰 목록의 적 전원 + 보스 전원. 소환·클리어·보너스전 제외 */
function theoretical(id) {
  const st = buildStage(id, { difficulty: DIFF });
  let enemyN = 0, enemyC = 0;
  const byHp = {};
  for (const sp of st.spawns) {
    enemyN += sp.n;
    enemyC += sp.n * enemyCoin(sp.hp);
    byHp[sp.hp] = (byHp[sp.hp] || 0) + sp.n;
  }
  const bosses = st.elites.length;
  return { stage: id, spawnEnemies: enemyN, bosses, arena: !!st.arena, summonBoss: st.elites.some((e) => e.summon) || !!(st.arena && st.arena.boss.summon),
           enemyCoinMax: enemyC, bossCoinMax: B * id * bosses, totalMax: enemyC + B * id * bosses, spawnHpHistogram: byHp };
}

function playOne(id, policy) {
  const stage = buildStage(id, { difficulty: DIFF });
  const run = createRun(stage);
  // 소환 잡졸 체력 = run.enemyDefs[소환 종류].hp (combat.js L301-307: hp 인자 없으면 d.hp)
  const summonKindRoad = run.enemyDefs.elite.summonKind;
  const summonKindArena = run.arena && run.arena.boss.summon ? run.arena.boss.summon.kind : null;
  const info = new Map();   // id → { hpMax, summoned, fate }
  const chk = { spawnCursorMismatch: 0, idRangeMismatch: 0, hpScanMismatch: 0, hpHitMismatch: 0, killUnknownId: 0, summonKindMismatch: 0 };
  let enemyCoins = 0, bossCoins = 0, winCoins = 0;
  let killsSched = 0, killsSummon = 0, touchedSched = 0, touchedSummon = 0, spawnedSched = 0, spawnedSummon = 0;
  const killHp = {}, summKillHp = {};   // 처치된 적의 hpMax 분포(계수 민감도 계산용)
  let bossKills = 0, bossAppearT = null, bossAppearCoins = null, bossAppearKills = null;
  const checkpoints = {};
  let steps = 0;
  let prevAlive = new Set();
  let wipeCleared = 0, culledOrVanished = 0;
  while (!run.over && steps < MAX_STEPS) {
    const id0 = run.nextEnemyId;
    const c0 = run.spawnCursor;
    const wasDefeated = run.bossDefeated;
    stepRun(run, pickInput(policy, run), STEP);
    steps++;
    const evs = drainEvents(run);
    const id1 = run.nextEnemyId;
    // 새 id 배정: spawnDue(combat.js L152)가 moveEnemies(L157, 소환 L564·L654)보다 먼저 → 앞쪽 Σspawn.n 개 = 스폰 일정, 뒤쪽 Σsummon.n 개 = 소환
    let nSched = 0, nSumm = 0;
    const schedHp = [];
    const summKinds = [];
    for (const e of evs) {
      if (e.type === 'spawn') nSched += e.n;
      if (e.type === 'summon') { nSumm += e.n; for (let k = 0; k < e.n; k++) summKinds.push(e.kind); }
    }
    if (id1 - id0 !== nSched + nSumm) chk.idRangeMismatch++;
    // 스폰 일정의 hp 는 spawn 이벤트엔 없으므로 run.spawns 커서에서 복원: 이번 STEP 에 소비된 스폰 정의(커서 앞 nSched 개 분량)
    {
      const defs = run.spawns.slice(c0, run.spawnCursor);
      let nDef = 0;
      for (const d of defs) { nDef += d.n; for (let k = 0; k < d.n; k++) schedHp.push(d.hp); }
      if (nDef !== nSched) chk.spawnCursorMismatch++;
    }
    for (let i = 0; i < nSched; i++) { info.set(id0 + i, { hpMax: schedHp[i], summoned: false, fate: null }); spawnedSched++; }
    for (let i = 0; i < nSumm; i++) {
      const kind = summKinds[i];
      if (kind !== summonKindRoad && kind !== summonKindArena) chk.summonKindMismatch++;
      info.set(id0 + nSched + i, { hpMax: run.enemyDefs[kind].hp, summoned: true, fate: null });
      spawnedSummon++;
    }
    // 교차 확인 1: 살아 있는 적 객체의 hpMax(L306)와 복원값
    const aliveNow = new Set();
    for (const e of run.enemies) {
      aliveNow.add(e.id);
      const inf = info.get(e.id);
      if (inf && inf.hpMax !== e.hpMax) chk.hpScanMismatch++;
    }
    // 교차 확인 2: enemyHit 이벤트의 hpMax(hitLook L422-424)와 복원값(보스 제외)
    for (const e of evs) {
      if (e.type === 'enemyHit' && e.kind !== 'elite') {
        const inf = info.get(e.id);
        if (inf && e.hpMax != null && inf.hpMax !== e.hpMax) chk.hpHitMismatch++;
      }
    }
    const goneByEvent = new Set();
    for (const e of evs) {
      if (e.type === 'kill') {
        const inf = info.get(e.id);
        if (!inf) { chk.killUnknownId++; continue; }
        inf.fate = 'killed'; goneByEvent.add(e.id);
        if (inf.summoned) { killsSummon++; summKillHp[inf.hpMax] = (summKillHp[inf.hpMax] || 0) + 1; }
        else { killsSched++; enemyCoins += enemyCoin(inf.hpMax); killHp[inf.hpMax] = (killHp[inf.hpMax] || 0) + 1; }
      } else if (e.type === 'touch' && e.kind !== 'elite' && e.id != null) {
        const inf = info.get(e.id);
        if (inf) { inf.fate = 'touched'; goneByEvent.add(e.id); if (inf.summoned) touchedSummon++; else touchedSched++; }
      } else if (e.type === 'bossKill') {
        bossKills++; bossCoins += B * id;
      } else if ((e.type === 'elite' || e.type === 'arenaEnter') && bossAppearT == null) {
        bossAppearT = run.time; bossAppearCoins = enemyCoins; bossAppearKills = killsSched;
      }
    }
    // 이벤트 없이 사라진 적: 마지막 보스 격파 소거(combat.js L785) 또는 뒤쪽 정리(L767)
    const wipedThisStep = !wasDefeated && run.bossDefeated;
    for (const pid of prevAlive) {
      if (aliveNow.has(pid) || goneByEvent.has(pid)) continue;
      const inf = info.get(pid);
      if (!inf || inf.fate) continue;
      if (wipedThisStep) { inf.fate = 'wiped'; if (!inf.summoned) wipeCleared++; }
      else { inf.fate = 'culled'; if (!inf.summoned) culledOrVanished++; }
    }
    prevAlive = aliveNow;
    // 시점별 누적(적 + 보스 코인, 클리어 보너스 없음)
    for (const T of T_LIST) if (checkpoints[T] == null && steps === Math.round(T / STEP)) checkpoints[T] = { t: T, ended: false, enemyCoins, bossCoins, kills: killsSched };
  }
  const won = !!run.won;
  const endT = won ? run.mainResult.wonAt : run.time;
  const result = won ? 'win' : run.over ? 'lose' : 'timeout';
  if (won) winCoins = C * run.mainResult.survivors;
  for (const T of T_LIST) {
    if (checkpoints[T] == null) {
      // 판이 T 전에 끝남: 끝난 시각의 누적(승리 시 클리어 보너스는 넣지 않는다 — '그만두기' 경로 정의)
      checkpoints[T] = { t: r1(endT), ended: true, enemyCoins, bossCoins, kills: killsSched };
    }
  }
  const aliveEnd = [...info.values()].filter((v) => !v.fate && !v.summoned).length;
  const total = enemyCoins + bossCoins + winCoins;
  const farm = T_LIST.map((T) => {
    const c = checkpoints[T];
    const coins = c.enemyCoins + c.bossCoins;
    return { T, quitAt: c.t, endedBeforeT: c.ended, coins, enemyCoins: c.enemyCoins, bossCoins: c.bossCoins,
             coinPerMinNoGap: perMin(coins, c.t), coinPerMinWithGap: perMin(coins, c.t + RESTART_SEC) };
  });
  return {
    stage: id, policy, result, steps, timeSec: r1(endT), runTimeSec: r1(run.time), bonusPhaseSec: r1(run.time - endT),
    survivors: won ? run.mainResult.survivors : run.units.length,
    coins: { enemy: enemyCoins, boss: bossCoins, clear: winCoins, total },
    coinPerMinNoGap: perMin(total, endT), coinPerMinWithGap: perMin(total, endT + RESTART_SEC),
    kills: { scheduled: killsSched, summoned: killsSummon, summonedCoin: 0, boss: bossKills,
             summonedCoinIfPaid: Object.entries(summKillHp).reduce((a, [hp, n]) => a + n * enemyCoin(Number(hp)), 0) },
    killHpHist: killHp, summonedKillHpHist: summKillHp,
    spawned: { scheduled: spawnedSched, summoned: spawnedSummon },
    fateScheduled: { killed: killsSched, touched: touchedSched, wipedByBossKill: wipeCleared, culledBehind: culledOrVanished, aliveAtEnd: aliveEnd },
    touchedSummoned: touchedSummon,
    bossAppear: bossAppearT == null ? null : { t: r1(bossAppearT), coins: bossAppearCoins, kills: bossAppearKills,
                                               coinPerMinNoGap: perMin(bossAppearCoins, bossAppearT), coinPerMinWithGap: perMin(bossAppearCoins, bossAppearT + RESTART_SEC) },
    farm,
    checks: chk,
  };
}

const t0 = Date.now();
const stages = ALL_STAGE_IDS.filter((id) => typeof id === 'number' && id >= 1 && id <= 24);
const theo = stages.map(theoretical);
const runs = [];
for (const id of stages) for (const p of POLICIES) runs.push(playOne(id, p));
const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);
const byPol = {};
for (const p of POLICIES) {
  const rs = runs.filter((r) => r.policy === p);
  byPol[p] = {
    wins: rs.filter((r) => r.result === 'win').map((r) => r.stage),
    losses: rs.filter((r) => r.result === 'lose').map((r) => r.stage),
    timeouts: rs.filter((r) => r.result === 'timeout').map((r) => r.stage),
    total: { enemy: sum(rs, (r) => r.coins.enemy), boss: sum(rs, (r) => r.coins.boss), clear: sum(rs, (r) => r.coins.clear), all: sum(rs, (r) => r.coins.total) },
    timeSec: r1(sum(rs, (r) => r.timeSec)),
    summonedKills: sum(rs, (r) => r.kills.summoned),
  };
}
const theoTotal = { enemy: sum(theo, (t) => t.enemyCoinMax), boss: sum(theo, (t) => t.bossCoinMax), all: sum(theo, (t) => t.totalMax) };
const checksTotal = {};
for (const r of runs) for (const [k, v] of Object.entries(r.checks)) checksTotal[k] = (checksTotal[k] || 0) + v;
// ─── 파생 표(검토 4·5번 비교용). 모두 봇 측정·초안 공식
const RUN = (p, id) => runs.find((r) => r.policy === p && r.stage === id);
function farmOptions(r) {
  // 그만두기 경로: T 가 판이 끝나기 전일 때만(판이 먼저 끝나면 그건 정상 도전 경로다) + 보스 등장 직전 포기
  const opts = [];
  for (const f of r.farm) if (!f.endedBeforeT) opts.push({ kind: 'quitT', T: f.T, coins: f.coins, sec: f.quitAt, cpm: f.coinPerMinWithGap });
  if (r.bossAppear) opts.push({ kind: 'bossQuit', T: r.bossAppear.t, coins: r.bossAppear.coins, sec: r.bossAppear.t, cpm: r.bossAppear.coinPerMinWithGap });
  return opts;
}
function pathTable(p, ids) {
  const rs = ids.map((id) => RUN(p, id));
  const best = (arr) => arr.reduce((b, x) => (!b || x.cpm > b.cpm ? x : b), null);
  const normal = best(rs.map((r) => ({ stage: r.stage, result: r.result, coins: r.coins.total, sec: r.timeSec, cpm: r.coinPerMinWithGap })));
  const easyReplay = best(rs.filter((r) => r.result === 'win').map((r) => ({ stage: r.stage, coins: r.coins.total, sec: r.timeSec, cpm: r.coinPerMinWithGap })));
  const quits = [];
  for (const r of rs) for (const o of farmOptions(r)) if (o.kind === 'quitT') quits.push({ stage: r.stage, ...o });
  const bossQuits = rs.filter((r) => r.bossAppear).map((r) => ({ stage: r.stage, coins: r.bossAppear.coins, sec: r.bossAppear.t, cpm: r.bossAppear.coinPerMinWithGap }));
  return { normalBest: normal, easyReplayBest: easyReplay, quitBest: best(quits), bossQuitBest: best(bossQuits),
           summonOnly: { coins: 0, summonedKills: rs.reduce((a, r) => a + r.kills.summoned, 0), summonedCoinIfPaid: rs.reduce((a, r) => a + r.kills.summonedCoinIfPaid, 0) } };
}
const derived = { restartSecAssumed: RESTART_SEC, perPolicy: {}, frontier: {}, coefSensitivity: {} };
for (const p of POLICIES) {
  derived.perPolicy[p] = {
    allStages: pathTable(p, stages),
    early_1to5: pathTable(p, stages.filter((id) => id <= 5)),
    late_19to24: pathTable(p, stages.filter((id) => id >= 19)),
  };
  // 순차 해금 가정: 1~N 만 열려 있을 때 N 정상 도전 vs 1~N-1 승리 판 재도전 vs 1~N 그만두기 경로
  derived.frontier[p] = stages.map((N) => {
    const r = RUN(p, N);
    const replay = stages.filter((id) => id < N).map((id) => RUN(p, id)).filter((x) => x.result === 'win')
      .reduce((b, x) => (!b || x.coinPerMinWithGap > b.cpm ? { stage: x.stage, cpm: x.coinPerMinWithGap, coins: x.coins.total } : b), null);
    let q = null;
    for (const id of stages.filter((i) => i <= N)) for (const o of farmOptions(RUN(p, id))) if (!q || o.cpm > q.cpm) q = { stage: id, ...o };
    const cands = [{ path: 'normalN', cpm: r.coinPerMinWithGap }, replay && { path: 'replayWon', cpm: replay.cpm }, q && { path: q.kind, cpm: q.cpm }].filter(Boolean);
    const top = cands.reduce((b, x) => (!b || x.cpm > b.cpm ? x : b), null);
    return { N, normalN: { result: r.result, coins: r.coins.total, sec: r.timeSec, cpm: r.coinPerMinWithGap }, replayWonBest: replay, quitBest: q, best: top.path };
  });
  // 계수 a 민감도: 같은 처치 기록(봇 1회전)에 a 만 바꿨을 때 한 바퀴 합(보스·클리어는 그대로)
  const rs = runs.filter((r) => r.policy === p);
  derived.coefSensitivity[p] = [0.25, 0.1, 0.05, 0.02, 0].map((a) => {
    let enemy = 0;
    for (const r of rs) for (const [hp, n] of Object.entries(r.killHpHist)) enemy += n * (a === 0 ? 0 : Math.max(1, Math.round(a * Number(hp))));
    const boss = rs.reduce((s2, r) => s2 + r.coins.boss, 0), clear = rs.reduce((s2, r) => s2 + r.coins.clear, 0);
    return { a, floor1: a > 0, enemy, boss, clear, total: enemy + boss + clear };
  });
}

const out = {
  meta: {
    script: 'D_econ-probe.mjs', generatedAt: new Date().toISOString(), node: process.version, elapsedMs: null,
    difficulty: DIFF, maxSteps: MAX_STEPS, step: STEP, lotterySeed: 'LOTTERY_DEFAULT_SEED(' + LOTTERY_DEFAULT_SEED + ')',
    formula: { enemy: 'max(1, Math.round(0.25*hpMax)), touched 제외, 소환 0', boss: '10 × 스테이지 번호 / 체', clear: '승리 시 mainResult.survivors × 1', bonusStage8: '제외' },
    restartSecAssumed: RESTART_SEC,
    note: '봇 측정·초안 공식. 정해진 입력으로 한 판씩 돌린 결정적 결과이며 사람의 성공률이 아니다.',
  },
  theoretical: theo, theoreticalTotal: theoTotal,
  runs, byPolicy: byPol, checksTotal, derived,
};
out.meta.elapsedMs = Date.now() - t0;
writeFileSync(join(HERE, 'D_econ-results.json'), JSON.stringify(out, null, 1));
console.log('elapsed ms', out.meta.elapsedMs, 'runs', runs.length);
console.log('theoretical total', theoTotal);
console.log('checks', checksTotal);
for (const p of POLICIES) console.log(p, JSON.stringify(byPol[p]));
