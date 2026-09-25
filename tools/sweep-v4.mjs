// tools/sweep-v4.mjs — v4 ⑥단계 밸런스 측정 도구(r4.6). **게임 코드는 읽기만 한다**(rush3/ 는 import 만).
//  셸 실제 설정과 같은 경로로 판을 돌린다: buildStage(id, { difficulty: PLAY_DIFFICULTY('brutal') }) → createRun(stage, { heroGuard: true, up })
//   → stepRun(run, pickInput(봇, run), STEP) → drainEvents. 코인 = rush3/coins.js 의 같은 함수(createTally·addEvents·mainCoins·bonusCoins),
//   비용·구매 = rush3/meta.js 의 같은 함수(nextCost·buy). 랜덤 길(3·12번)은 기본 시드 하나(LOTTERY_DEFAULT_SEED — 셸은 판마다 시드가 바뀜).
//  ⚠️모든 값 = 정해진 입력으로 한 판씩 돌린 **결정적 봇 결과**다. 사람의 성공률·사람의 수입이 아니다. 판 사이 이동·재시작 5초는 가정이다.
//
//  명령(오래 걸리는 측정은 나눠 돌린다 — 한 번에 --budget 초(기본 420)를 넘기면 저장하고 멈춘다. 같은 명령을 다시 부르면 이어서 한다):
//   node tools/sweep-v4.mjs grid [--bundles 0-4] [--bots evLead,aimLead,planBoss]   강화 묶음 × 판 1~24 × 봇 → runs-<봇>.json(판 기록 캐시)
//   node tools/sweep-v4.mjs enum --stages 2,9 [--bots evLead]                        지정한 판의 강화 묶음 144개 전부(벽 판의 '이기는 최소 비용')
//   node tools/sweep-v4.mjs verify                                                   묶음 (0,0,0) 이 V4-REAL 기준값 파일과 같은가(도구 = 셸 경로 확인)
//   node tools/sweep-v4.mjs prog --bot evLead --strat rec|cheap [--cap 300] [--mode retry|farm] [--tag before]
//                                                                                    순차 해금 진행 시뮬레이션 → prog-<봇>-<전략>[-farm][.tag].json
//                                                                                    (retry = 명세 기본 '지면 같은 판 재도전' · farm = 참고 '같은 결과가 되풀이되면 이긴 판 반복')
//   node tools/sweep-v4.mjs econ --bot evLead --strat rec [--tag before]              경로별 수입/분(순차 해금·그때의 강화 단계) → econ-<봇>-<전략>[.tag].json
//   node tools/sweep-v4.mjs summary [--tag before]                                    표 → summary[.tag].json(요약 줄만 stdout)
//   node tools/sweep-v4.mjs tables [--tag before]                                     summary·prog·econ 파일 → 보고서용 markdown 표(stdout, 새 판 없음)
//  출력 폴더: newmode/v3/research/v4-balance-20260925/ (--out 으로 바꿀 수 있음)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { PLAY_DIFFICULTY } from '../rush3/balance.js';
import { createTally, addEvents, mainCoins, bonusCoins, stageValue, COIN } from '../rush3/coins.js';
import { UP_TRACKS, UP_COST, UP_MAX, UP_EFFECT, nextCost, buy, normUp } from '../rush3/meta.js';
import { pickInput } from '../tests/lib/rush3-policies.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 && i + 1 < args.length ? args[i + 1] : d; };
const OUT = resolve(ROOT, opt('out', 'newmode/v3/research/v4-balance-20260925'));
mkdirSync(OUT, { recursive: true });
const TAG = opt('tag', '');
const tagged = (base) => base + (TAG ? '.' + TAG : '') + '.json';

export const BOTS = ['evLead', 'aimLead', 'planBoss'];
export const MAX_STEPS = 28800;        // 한 판 상한(8분). V4-REAL 은 14,400 — 넉넉히 두고 시간 초과는 따로 센다(기획 v4.1 3-2 '측정 상한 주의')
export const RESTART_SEC = 5;          // 판 사이 이동·재시작 [가정]
export const T_LIST = [15, 30, 45, 60, 90];
const BUDGET_SEC = Number(opt('budget', '420'));
const t0 = Date.now();
const overBudget = () => (Date.now() - t0) / 1000 > BUDGET_SEC;
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const r2 = (v) => (v == null ? null : Math.round(v * 100) / 100);
const PLAZA = new Set(ALL_STAGE_IDS.filter((id) => !!buildStage(id, { difficulty: PLAY_DIFFICULTY }).arena));

// ───────────────────────── 강화 묶음 ─────────────────────────
const key = (u) => { const n = normUp(u); return `${n.power}${n.rate}${n.multi}`; };
const unkey = (k) => ({ power: +k[0], rate: +k[1], multi: +k[2] });
const cumCost = (u) => { const n = normUp(u); let c = 0; for (const t of UP_TRACKS) for (let i = 0; i < n[t]; i++) c += UP_COST[t][i]; return c; };
//  같은 비용 묶음 규칙(보고서에 그대로 적는다): 'X 우선'(예산 B) = X 트랙을 B 안에서 살 수 있는 최대 단계까지 → 남은 돈으로 **가장 싼 다음 단계**를
//   하나씩(동률이면 다연발 → 직격 화력 → 연사 순, 추천 순서와 같은 방향) 살 수 있는 동안. '혼합' = 처음부터 가장 싼 다음 단계를 하나씩(같은 동률 순서).
const TIE = ['multi', 'power', 'rate'];
function cheapestNext(u, budgetLeft, exclude = null) {
  let best = null, bc = Infinity;
  for (const t of TIE) {
    if (t === exclude) continue;
    const c = nextCost(u, t);
    if (c != null && c <= budgetLeft && c < bc) { best = t; bc = c; }
  }
  return best;
}
export function firstBundle(track, budget) {
  const u = { power: 0, rate: 0, multi: 0 };
  let left = budget;
  if (track !== 'mix') {
    for (;;) { const c = nextCost(u, track); if (c == null || c > left) break; u[track]++; left -= c; }
  }
  for (;;) { const t = cheapestNext(u, left, track === 'mix' ? null : track); if (!t) break; left -= nextCost(u, t); u[t]++; }
  return u;
}
export const SAME_COST_BUDGETS = [40, 80, 120, 250];
export const SAME_COST_PATHS = ['power', 'rate', 'multi', 'mix'];
function gridBundles() {
  const list = [{ k: '000', why: ['강화 0'] }];
  const add = (u, why) => { const k = key(u); const f = list.find((x) => x.k === k); if (f) f.why.push(why); else list.push({ k, why: [why] }); };
  for (const t of ['power', 'rate', 'multi']) add({ power: 0, rate: 0, multi: 0, [t]: 1 }, '첫 구매 ' + t);
  for (const B of SAME_COST_BUDGETS) for (const p of SAME_COST_PATHS) add(firstBundle(p, B), `같은 비용 ${B} ${p} 우선`);
  add({ power: 3, rate: 3, multi: 1 }, '중간 (3,3,1)');
  add({ power: UP_MAX.power, rate: UP_MAX.rate, multi: UP_MAX.multi }, '최대');
  return list.map((x) => ({ ...x, cost: cumCost(unkey(x.k)) }));
}
export const GRID = gridBundles();

// ───────────────────────── 한 판 기록 ─────────────────────────
const stageCache = new Map();
const stageOf = (id) => { if (!stageCache.has(id)) stageCache.set(id, buildStage(id, { difficulty: PLAY_DIFFICULTY })); return stageCache.get(id); };

/** 셸 실제 설정으로 한 판. 코인은 여기서 정하지 않고 '센 수'(일정 스폰 처치·보스 처치·보너스 단계)만 남긴다 — 코인은 분석 때 coins.js 로 계산 */
export function playRec(id, bot, up) {
  const stage = stageOf(id);
  const run = createRun(stage, { heroGuard: true, up: normUp(up) });
  const cpAt = new Map(T_LIST.map((T) => [Math.round(T / STEP), String(T)]));
  let steps = 0, kills = 0, bossKills = 0, summoned = 0, transfers = 0;
  let bossStep = null, bossT = null, bossCp = null, endStep = null, t100 = null, maxBul = 0, bonusDone = false;
  const cp = {}, gates = [];
  while (!run.over && steps < MAX_STEPS) {
    const wasWon = run.won;
    stepRun(run, pickInput(bot, run), STEP);
    steps++;
    let bossNow = false;
    for (const e of drainEvents(run)) {
      switch (e.type) {
        case 'kill': if (e.summoned) summoned++; else kills++; break;
        case 'bossKill': bossKills++; break;
        case 'elite': case 'arenaEnter': if (bossStep == null) { bossStep = steps; bossT = run.time; bossNow = true; } break;
        case 'gatePass': gates.push([e.id, e.value, e.applied]); break;
        case 'bonusEnd': bonusDone = true; break;
        case 'heroGuard': transfers++; break;
        default: break;
      }
    }
    if (bossNow) bossCp = [kills, bossKills];
    if (!wasWon && run.won) endStep = steps;
    const T = cpAt.get(steps);
    if (T && !run.won && !run.over) cp[T] = [kills, bossKills];
    if (t100 == null && run.units.length >= 100) t100 = r2(run.time);
    if (run.bullets.length > maxBul) maxBul = run.bullets.length;
  }
  const timeout = !run.over && steps >= MAX_STEPS;
  if (endStep == null) endStep = steps;
  const bossMax = (run.elites || []).reduce((a, e) => a + (e.hp || 0), 0);
  const bossLeft = run.won ? 0 : run.bosses.length ? run.bosses.reduce((a, b) => a + (b.dead ? 0 : Math.max(0, b.hp)), 0) : bossMax;
  const tMain = run.won ? run.mainResult.wonAt : run.time;
  return {
    st: id, b: key(up), won: !!run.won, timeout, over: !!run.over, steps, endStep,
    tMain: r2(tMain), tTotal: r2(run.time), time: run.time,
    surv: run.won ? run.mainResult.survivors : 0, unitsEnd: run.units.length, peak: run.peak, killsAll: run.kills,
    kills, bossKills, summoned, bonusTier: bonusDone && run.bonus ? run.bonus.tier : 0, bonusDone,
    bossStep, bossT: r2(bossT), bossCp, bossFight: bossT == null ? null : r2(tMain - bossT), bossLeft: r1(bossLeft), bossMax,
    cp, t100, maxBul, gates,
    loss: { gate: run.lossByGate, shot: run.lossByShot, touch: run.lossByTouch, shock: run.lossByShock },
    hero: run.units.some((u) => u.hero), transfers, weapon: run.weapon, mk: run.weaponMk,
  };
}

// ───────────────────────── 판 기록 캐시(봇마다 한 파일) ─────────────────────────
const EFFECT_SIG = JSON.stringify({ UP_EFFECT, MAX_STEPS, diff: PLAY_DIFFICULTY });
const runsPath = (bot) => join(OUT, `runs-${bot}.json`);
const caches = {};
function cacheOf(bot) {
  if (caches[bot]) return caches[bot];
  let c = { meta: { bot, effectSig: EFFECT_SIG, note: '결정적 1판 봇 결과(사람의 성공률 아님). 키 = 판/직격화력·연사·다연발 단계' }, runs: {} };
  if (existsSync(runsPath(bot))) {
    const f = JSON.parse(readFileSync(runsPath(bot), 'utf8'));
    if (f.meta.effectSig !== EFFECT_SIG) throw new Error(`runs-${bot}.json 의 효과·설정 서명이 지금 코드와 다릅니다(강화 효과 폭을 바꿨다면 --out 으로 다른 폴더에). 파일=${f.meta.effectSig} 지금=${EFFECT_SIG}`);
    c = f;
  }
  caches[bot] = c;
  return c;
}
let dirty = new Set(), newRuns = 0;
function saveCaches() {
  for (const bot of dirty) writeFileSync(runsPath(bot), JSON.stringify(caches[bot]));
  dirty = new Set();
}
function getRun(bot, id, up) {
  const c = cacheOf(bot);
  const k = `${id}/${key(up)}`;
  if (!c.runs[k]) {
    c.runs[k] = playRec(id, bot, up);
    dirty.add(bot); newRuns++;
    if (newRuns % 25 === 0) saveCaches();
  }
  return c.runs[k];
}
class Budget extends Error {}
function checkBudget() { if (overBudget()) { saveCaches(); throw new Budget(); } }

// ───────────────────────── 코인(coins.js 의 같은 함수) ─────────────────────────
const synth = (k, b) => { const ev = []; for (let i = 0; i < k; i++) ev.push({ type: 'kill' }); for (let i = 0; i < b; i++) ev.push({ type: 'bossKill' }); return ev; };
/** 본전투분(+클리어 보너스). counts = [일정 스폰 처치, 보스 처치] */
export function mainOf(id, counts, { cleared = false, firstClear = false } = {}) {
  const t = addEvents(createTally(stageOf(id)), synth(counts[0], counts[1]));
  return mainCoins(t, { cleared, firstClear });
}
/** 한 판 전체 코인: 본전투(첫 클리어/재클리어 구분) + 8번 보너스(보너스 종료 때만) */
export function runCoinsOf(rec, firstClear) {
  const m = mainOf(rec.st, [rec.kills, rec.bossKills], { cleared: rec.won, firstClear: rec.won && firstClear });
  const bonus = rec.won && rec.bonusDone ? bonusCoins(rec.st, rec.bonusTier) : 0;
  return { ...m, bonus, total: m.total + bonus };
}
const cpm = (coins, sec) => Math.round((coins / ((sec + RESTART_SEC) / 60)) * 10) / 10;

// ───────────────────────── 구매 규칙(진행 시뮬레이션) ─────────────────────────
//  rec   = 추천 순서: 다연발 1 → 직격 화력·연사 번갈아(같으면 직격 화력 먼저, 한쪽이 최대면 다른 쪽) → 둘 다 최대면 다연발 2·3. 다음 차례를 못 사면 기다린다(건너뛰지 않음)
//  cheap = 가장 싼 것 먼저: 세 트랙의 다음 단계 중 가장 싼 것(동률 다연발 → 직격 화력 → 연사)
export function nextTrack(strat, up) {
  const u = normUp(up);
  if (strat === 'rec') {
    if (u.multi < 1) return 'multi';
    const pOk = u.power < UP_MAX.power, rOk = u.rate < UP_MAX.rate;
    if (pOk && rOk) return u.power <= u.rate ? 'power' : 'rate';
    if (pOk) return 'power';
    if (rOk) return 'rate';
    return u.multi < UP_MAX.multi ? 'multi' : null;
  }
  let best = null, bc = Infinity;
  for (const t of TIE) { const c = nextCost(u, t); if (c != null && c < bc) { best = t; bc = c; } }
  return best;
}

/** 순차 해금 진행: 1번부터, 지면 같은 판 재도전, 판 끝마다 구매 규칙. 24번 완료 또는 cap 판까지.
 *  mode = 'retry'(명세 기본: 지면 같은 판 재도전) | 'farm'(참고: 진 판을 **같은 강화 단계로** 다시 하게 되면 — 봇은 결정적이라 결과가 같다 —
 *   대신 이긴 판 중 지금 강화 단계의 재도전 코인/분이 가장 높은 판을 한 번 하고, 구매가 일어나면 다시 앞 판에 도전) */
function progress(bot, strat, cap, mode = 'retry') {
  let wallet = { coins: 0, up: { power: 0, rate: 0, multi: 0 } };
  const cleared = new Set();
  let cur = ALL_STAGE_IDS[0], n = 0, sec = 0;
  const attempts = [], purchases = [], firsts = [];
  let triesHere = 0, farmRuns = 0;
  const lostAt = new Map();   // 판 → 마지막으로 진 강화 단계
  while (n < cap && cur != null) {
    checkBudget();
    const up = { ...wallet.up };
    let st = cur;
    if (mode === 'farm' && lostAt.get(cur) === key(up) && cleared.size) {
      let bs = null, bc = -1;
      for (const s of cleared) { const r = getRun(bot, s, up); const v = cpm(runCoinsOf(r, false).total, r.tTotal); if (v > bc) { bc = v; bs = s; } }
      st = bs;
    }
    const rec = getRun(bot, st, up);
    const first = !cleared.has(st);
    const c = runCoinsOf(rec, first);
    wallet = { ...wallet, coins: wallet.coins + c.total };
    n++;
    if (st === cur) triesHere++; else farmRuns++;
    sec += rec.tTotal + RESTART_SEC;
    attempts.push({ n, st, farm: st !== cur, b: key(up), won: rec.won, timeout: rec.timeout, coins: c.total, clear: c.clear, bonus: c.bonus, t: rec.tTotal, bossFight: rec.bossFight, bossLeft: rec.bossLeft, cumMin: r2(sec / 60), wallet: wallet.coins });
    if (st !== cur) { /* 이긴 판 반복 — 진행 판은 그대로 */ }
    else if (!rec.won) lostAt.set(cur, key(up));
    else {
      cleared.add(cur);
      firsts.push({ st: cur, tries: triesHere, farmRuns, n, cumMin: r2(sec / 60), b: key(up), bossFight: rec.bossFight, surv: rec.surv });
      triesHere = 0; farmRuns = 0;
      const i = ALL_STAGE_IDS.indexOf(cur);
      cur = i + 1 < ALL_STAGE_IDS.length ? ALL_STAGE_IDS[i + 1] : null;
    }
    for (;;) {
      const t = nextTrack(strat, wallet.up);
      if (!t) break;
      const res = buy(wallet, t);
      if (!res.ok) break;
      wallet = res.wallet;
      purchases.push({ afterRun: n, stageNext: cur, track: t, level: wallet.up[t], cost: res.cost, cumMin: r2(sec / 60), b: key(wallet.up) });
    }
  }
  const stuck = cur != null ? { st: cur, tries: triesHere, farmRuns, b: key(wallet.up) } : null;
  return { bot, strat, mode, cap, runs: n, minutes: r2(sec / 60), finished: cur == null, stuck, firsts, purchases, attempts, endWallet: wallet };
}

/** 경로별 수입/분(순차 해금): 진행 시뮬레이션에서 '앞 판 N 에 도전하던 때'의 강화 단계마다(같은 N 에서 단계가 바뀌면 줄을 새로) —
 *  N 정상 도전(첫 클리어 포함) · 이긴 판(s < N) 재도전(재클리어 5, 8번 보너스 포함) · s ≤ N 의 T초 포기(T×60 STEP < 본전투 끝) · 보스 직전 포기 */
function frontierRow(bot, N, up) {
  const normalRec = getRun(bot, N, up);
  const nc = runCoinsOf(normalRec, true);
  const normal = { path: `${N}번 정상 도전(${normalRec.won ? '승' : normalRec.timeout ? '시간 초과' : '패'})`, st: N, coins: nc.total, sec: normalRec.tTotal, cpm: cpm(nc.total, normalRec.tTotal) };
  let replay = null, quit = null;
  const better = (a, b) => (!a || b.cpm > a.cpm ? b : a);
  for (const s of ALL_STAGE_IDS) {
    if (s > N) break;
    const rec = getRun(bot, s, up);
    if (s < N && rec.won) {
      const c = runCoinsOf(rec, false);
      replay = better(replay, { path: `${s}번 재도전`, st: s, coins: c.total, sec: rec.tTotal, cpm: cpm(c.total, rec.tTotal) });
    }
    for (const T of T_LIST) {
      const cnt = rec.cp[String(T)];
      if (!cnt) continue;
      const coins = mainOf(s, cnt).total;
      quit = better(quit, { path: `${s}번 ${T}초 포기`, st: s, coins, sec: T, cpm: cpm(coins, T) });
    }
    if (rec.bossStep != null && rec.bossStep < rec.endStep && rec.bossCp) {
      const coins = mainOf(s, rec.bossCp).total;
      quit = better(quit, { path: `${s}번 보스 직전 포기`, st: s, coins, sec: rec.bossT, cpm: cpm(coins, rec.bossT) });
    }
  }
  const play = better(normal, replay || normal);
  const top = quit && quit.cpm > play.cpm ? 'quit' : play === normal ? 'normal' : 'replay';
  return { N, b: key(up), normal, replay, quit, best: top, quitOverPlay: quit ? r2(quit.cpm / play.cpm) : null };
}
function econ(bot, strat) {
  const P = JSON.parse(readFileSync(join(OUT, tagged(`prog-${bot}-${strat}`)), 'utf8'));
  const seen = new Set(), rows = [];
  for (const a of P.attempts) {
    const k = a.st + '/' + a.b;
    if (seen.has(k)) continue;
    seen.add(k);
    checkBudget();
    rows.push(frontierRow(bot, a.st, unkey(a.b)));
  }
  const quitRows = rows.filter((r) => r.best === 'quit');
  const maxR = rows.reduce((m, r) => (r.quitOverPlay != null && r.quitOverPlay > (m ? m.quitOverPlay : -1) ? r : m), null);
  //  참고: 강화 단계 고정(구매 없음)으로 N = 1~24 전부(F_ 의 (b) 와 같은 가정 — 1..N 열림, 봇이 실제로 N 까지 못 가도 계산).
  //   000 = 강화 0 · 331 = 중간 · 553 = 최대 — 봇이 9번에서 막혀 진행 시뮬레이션이 닿지 못하는 10~24번 구간을 보려는 것
  const fixedOf = (k) => { const rows = ALL_STAGE_IDS.map((N) => frontierRow(bot, N, unkey(k)));
    return { quitBestCount: rows.filter((r) => r.best === 'quit').length, quitBestAt: rows.filter((r) => r.best === 'quit').map((r) => r.N),
             maxQuitOverPlay: Math.max(...rows.map((r) => r.quitOverPlay ?? 0)), counts: { normal: rows.filter((r) => r.best === 'normal').length, replay: rows.filter((r) => r.best === 'replay').length }, rows }; };
  const fixed = { '000': fixedOf('000'), '331': fixedOf('331'), '553': fixedOf('553') };
  const rows0 = fixed['000'].rows;
  return {
    bot, strat, rows, quitBestCount: quitRows.length, quitBestAt: quitRows.map((r) => `${r.N}@${r.b}`), maxQuitOverPlay: maxR ? maxR.quitOverPlay : null, maxAt: maxR ? `${maxR.N}@${maxR.b}` : null,
    counts: { normal: rows.filter((r) => r.best === 'normal').length, replay: rows.filter((r) => r.best === 'replay').length, quit: quitRows.length },
    up0: { quitBestCount: rows0.filter((r) => r.best === 'quit').length, quitBestAt: rows0.filter((r) => r.best === 'quit').map((r) => r.N),
           maxQuitOverPlay: Math.max(...rows0.map((r) => r.quitOverPlay ?? 0)), rows: rows0 },
    fixed,
  };
}

// ───────────────────────── 요약 표 ─────────────────────────
function loadRuns(bot) { return cacheOf(bot).runs; }
function summary() {
  const R = Object.fromEntries(BOTS.map((b) => [b, loadRuns(b)]));
  const g = (bot, st, k) => R[bot][`${st}/${k}`];
  const S = { meta: { generatedAt: new Date().toISOString(), maxSteps: MAX_STEPS, restartSec: RESTART_SEC, difficulty: PLAY_DIFFICULTY, heroGuard: true,
                      coin: { ...COIN }, cost: UP_COST, effect: UP_EFFECT, plaza: [...PLAZA],
                      note: '결정적 1판 봇 결과(정해진 입력으로 한 판씩) — 사람의 성공률·수입이 아님. 판 사이 5초 가정. 랜덤 길은 기본 시드 하나' },
              grid: GRID };
  const missing = [];
  for (const bot of BOTS) for (const st of ALL_STAGE_IDS) for (const x of GRID) if (!g(bot, st, x.k)) missing.push(`${bot}/${st}/${x.k}`);
  S.missing = missing.length;
  //  시간 초과(모든 캐시 판)
  S.timeouts = BOTS.flatMap((b) => Object.values(R[b]).filter((r) => r.timeout).map((r) => `${b}/${r.st}/${r.b}`));
  //  판 × 묶음 표(봇마다): 승패·남은 병력·보스전 시간·보스 남은 체력·코인(첫/재)·첫 게이트·100명 시각·최대 탄
  S.table = {};
  for (const bot of BOTS) {
    S.table[bot] = {};
    for (const st of ALL_STAGE_IDS) {
      S.table[bot][st] = {};
      for (const x of GRID) {
        const r = g(bot, st, x.k);
        if (!r) continue;
        const cf = runCoinsOf(r, true), cr = runCoinsOf(r, false);
        S.table[bot][st][x.k] = { won: r.won, timeout: r.timeout, surv: r.surv, t: r.tMain, bossFight: r.bossFight, bossLeft: r.bossLeft, bossMax: r.bossMax,
                                  coinsFirst: cf.total, coinsReplay: cr.total, gate1: r.gates[0] ? r.gates[0][1] : null, gates: r.gates.map((q) => q[1]), t100: r.t100, maxBul: r.maxBul, peak: r.peak, loss: r.loss };
      }
    }
  }
  //  T1 · 2번
  S.T1 = Object.fromEntries(BOTS.map((b) => [b, [1, 3, 4, 5].map((st) => ({ st, won: g(b, st, '000')?.won }))]));
  S.stage2 = Object.fromEntries(BOTS.map((b) => [b, GRID.map((x) => ({ k: x.k, cost: x.cost, won: g(b, 2, x.k)?.won, bossLeft: g(b, 2, x.k)?.bossLeft }))]));
  //  T3: 이기는 최소 강화(측정한 묶음 중 누적 비용 최소)
  S.T3 = {};
  for (const bot of BOTS) {
    S.T3[bot] = ALL_STAGE_IDS.map((st) => {
      const w = GRID.filter((x) => g(bot, st, x.k)?.won).sort((a, b) => a.cost - b.cost || a.k.localeCompare(b.k))[0];
      return { st, plaza: PLAZA.has(st), minK: w ? w.k : null, minCost: w ? w.cost : null };
    });
  }
  //  T3 전수(enum 으로 144 묶음을 다 돌린 판만): 이기는 최소 비용 묶음 · 이기는 묶음 수
  S.T3full = {};
  const ALLB = []; for (let p = 0; p <= UP_MAX.power; p++) for (let r = 0; r <= UP_MAX.rate; r++) for (let m = 0; m <= UP_MAX.multi; m++) ALLB.push(`${p}${r}${m}`);
  for (const bot of BOTS) for (const st of ALL_STAGE_IDS) {
    if (!ALLB.every((k) => g(bot, st, k))) continue;
    const wins = ALLB.filter((k) => g(bot, st, k).won).map((k) => ({ k, cost: cumCost(unkey(k)) })).sort((a, b) => a.cost - b.cost || a.k.localeCompare(b.k));
    const best = ALLB.map((k) => g(bot, st, k)).reduce((m, r) => (!m || r.bossLeft < m.bossLeft ? r : m), null);
    (S.T3full[bot] ||= {})[st] = { wins: wins.length, of: ALLB.length, min: wins[0] || null, cheapest5: wins.slice(0, 5), closestLoss: wins.length ? null : { k: best.b, bossLeft: best.bossLeft, bossMax: best.bossMax } };
  }
  //  T2(보스전 시간): 같은 판·같은 봇, 강화 0 에서 이긴 판의 보스전 시간 → 묶음별
  S.T2boss = {};
  for (const bot of BOTS) {
    S.T2boss[bot] = {};
    for (const x of GRID) {
      const pairs = ALL_STAGE_IDS.map((st) => [g(bot, st, '000'), g(bot, st, x.k)]).filter(([a, b]) => a && b && a.won && b.won && a.bossFight != null && b.bossFight != null);
      const d = pairs.map(([a, b]) => b.bossFight - a.bossFight).sort((p, q) => p - q);
      const wins = ALL_STAGE_IDS.filter((st) => g(bot, st, x.k)?.won).length;
      S.T2boss[bot][x.k] = { wins, n: pairs.length, medianDelta: d.length ? r2(d[Math.floor((d.length - 1) / 2)]) : null, sumBase: r1(pairs.reduce((a, [p]) => a + p.bossFight, 0)), sumUp: r1(pairs.reduce((a, [, q]) => a + q.bossFight, 0)) };
    }
  }
  //  진행·수입
  S.prog = {}; S.econ = {};
  for (const bot of BOTS) for (const strat of ['rec', 'cheap']) {
    for (const mode of ['', '-farm']) {
      const pf = join(OUT, tagged(`prog-${bot}-${strat}${mode}`));
      if (existsSync(pf)) { const P = JSON.parse(readFileSync(pf, 'utf8')); S.prog[`${bot}/${strat}${mode}`] = { runs: P.runs, minutes: P.minutes, finished: P.finished, stuck: P.stuck, firsts: P.firsts, purchases: P.purchases }; }
    }
    const ef = join(OUT, tagged(`econ-${bot}-${strat}`));
    if (existsSync(ef)) { const E = JSON.parse(readFileSync(ef, 'utf8')); S.econ[`${bot}/${strat}`] = { quitBestCount: E.quitBestCount, quitBestAt: E.quitBestAt, maxQuitOverPlay: E.maxQuitOverPlay, maxAt: E.maxAt, counts: E.counts, rows: E.rows.map((r) => ({ N: r.N, b: r.b, best: r.best, normal: r.normal && [r.normal.path, r.normal.cpm], replay: r.replay && [r.replay.path, r.replay.cpm], quit: r.quit && [r.quit.path, r.quit.cpm], ratio: r.quitOverPlay })),
      fixed: Object.fromEntries(Object.entries(E.fixed || {}).map(([k, v]) => [k, { quitBestCount: v.quitBestCount, quitBestAt: v.quitBestAt, maxQuitOverPlay: v.maxQuitOverPlay, counts: v.counts }])) }; }
  }
  writeFileSync(join(OUT, tagged('summary')), JSON.stringify(S, null, 1));
  return S;
}

// ───────────────────────── 보고서 표(markdown) ─────────────────────────
//  summary.json · prog-*.json · econ-*.json 을 읽어 보고서(report.md)에 넣을 표를 stdout 으로 낸다. 새 판은 돌리지 않는다
const BOT_NOTE = '결정적 1판 봇 결과, 사람의 성공률 아님';
const TR_KO = { power: '직격 화력', rate: '연사', multi: '다연발', mix: '혼합' };
const bl = (k) => `(${k[0]},${k[1]},${k[2]})`;
function cellOf(r) {
  if (!r) return '—';
  if (r.timeout) return '시간 초과';
  return r.won ? `승 ${r.surv}` : `패 ${Math.round(r.bossLeft)}/${r.bossMax}`;
}
function tables() {
  const S = JSON.parse(readFileSync(join(OUT, tagged('summary')), 'utf8'));
  const out = [];
  const p = (s = '') => out.push(s);
  const bundles = ['000', '100', '010', '001', '331', '553'];
  p(`<!-- tools/sweep-v4.mjs tables 로 만든 표(${S.meta.generatedAt} summary 기준) -->`);
  // 판별 표
  for (const bot of BOTS) {
    p(`### 판별 표 — ${bot} (${BOT_NOTE})`);
    p('칸: `승 N` = 이김·남은 병력 N / `패 a/b` = 짐·보스 체력 a 남음(최대 b). 묶음 = (직격 화력, 연사, 다연발) 단계.');
    p();
    p(`| 판 | 종류 | 강화 0 | ${bl('100')} | ${bl('010')} | ${bl('001')} | ${bl('331')} | ${bl('553')} | 이기는 최소(측정 14묶음, 누적 코인) | 전수 144묶음 |`);
    p('|---:|---|---|---|---|---|---|---|---|---|');
    for (const st of ALL_STAGE_IDS) {
      const row = S.table[bot][st];
      const t3 = S.T3[bot].find((x) => x.st === st);
      const full = S.T3full[bot] && S.T3full[bot][st];
      const fullTxt = !full ? '' : full.min ? `${full.wins}/144 승 · 최소 ${bl(full.min.k)} ${full.min.cost}` : `0/144 승 · 가장 가까운 ${bl(full.closestLoss.k)} 보스 ${Math.round(full.closestLoss.bossLeft)}/${full.closestLoss.bossMax}`;
      p(`| ${st} | ${PLAZA.has(st) ? '광장' : '도로'} | ${bundles.map((k) => cellOf(row[k])).join(' | ')} | ${t3.minK ? `${bl(t3.minK)} ${t3.minCost}` : '없음'} | ${fullTxt} |`);
    }
    p();
  }
  // 2번 상세
  p(`### 2번: 측정 묶음 전부 (${BOT_NOTE})`);
  p();
  p('| 묶음 | 누적 코인 | 뜻 | evLead | aimLead | planBoss |');
  p('|---|---:|---|---|---|---|');
  for (const x of S.grid) p(`| ${bl(x.k)} | ${x.cost} | ${x.why.join(' · ').replace(/power/g, TR_KO.power).replace(/rate/g, TR_KO.rate).replace(/multi/g, TR_KO.multi).replace(/mix/g, TR_KO.mix)} | ${BOTS.map((b) => cellOf(S.table[b][2][x.k])).join(' | ')} |`);
  p();
  // 같은 비용 경로
  p(`### 같은 비용 경로: 누적 40·80·120·250코인 (${BOT_NOTE})`);
  p('규칙: \'X 우선\' = X 트랙을 예산 안에서 살 수 있는 만큼 → 남은 돈으로 가장 싼 다음 단계(동률 다연발 → 직격 화력 → 연사). \'혼합\' = 처음부터 가장 싼 다음 단계. 같은 묶음이 되면 한 번만 돌렸다.');
  p();
  p('| 예산 | 경로 | 묶음 | 쓴 코인 | evLead 24판 승 | aimLead | planBoss | 2번 evLead |');
  p('|---:|---|---|---:|---:|---:|---:|---|');
  for (const B of SAME_COST_BUDGETS) for (const path of SAME_COST_PATHS) {
    const k = key(firstBundle(path, B));
    p(`| ${B} | ${TR_KO[path]} 우선 | ${bl(k)} | ${cumCost(unkey(k))} | ${S.T2boss.evLead[k].wins} | ${S.T2boss.aimLead[k].wins} | ${S.T2boss.planBoss[k].wins} | ${cellOf(S.table.evLead[2][k])} |`);
  }
  p();
  // T2 보스전 시간
  p(`### T2: 강화하면 보스전이 짧아지는가 (${BOT_NOTE})`);
  p('\'보스전 합\' = 강화 0 에서 이긴 판들만 모아 보스전 시간(보스 등장 → 판 끝)을 더한 값(초). 같은 판을 이 묶음으로 돌린 값과 비교. \'중앙값 변화\' = 판마다 (이 묶음 − 강화 0) 의 중앙값.');
  p();
  p('| 묶음 | 누적 코인 | evLead 승/24 · 보스전 합 · 중앙값 변화 | aimLead | planBoss |');
  p('|---|---:|---|---|---|');
  for (const x of [...S.grid].sort((a, b) => a.cost - b.cost)) {
    p(`| ${bl(x.k)} | ${x.cost} | ${BOTS.map((b) => { const v = S.T2boss[b][x.k]; return `${v.wins} · ${v.sumBase}→${v.sumUp}초(${v.n}판) · ${v.medianDelta}초`; }).join(' | ')} |`);
  }
  p();
  // evLead 판 상세
  for (const bot of BOTS) {
    p(`### 판 상세 — ${bot} (${BOT_NOTE})`);
    p('칸 = 결과 · 보스전 초 · 판 시간 초(이긴 판은 본전투 끝까지). 코인 = 이번 판 코인(coins.js), 첫 클리어/재클리어. 게이트1 = 첫 게이트 통과 값. 100명 = 첫 100명 도달 초(— = 못 닿음). 최대 탄 = 한 순간 화면의 탄 수 최대');
    p();
    p('| 판 | 강화 0 | (0,0,1) | (3,3,1) | (5,5,3) | 코인 강화 0 첫/재 | 코인 최대 첫/재 | 게이트1 0 · (0,0,1) · 최대 | 100명 0 · 최대 | 최대 탄 0 · 최대 |');
    p('|---:|---|---|---|---|---|---|---|---|---|');
    for (const st of ALL_STAGE_IDS) {
      const r = S.table[bot][st];
      const c = (k) => { const x = r[k]; return `${cellOf(x)} · ${x.bossFight ?? '—'} · ${x.t}`; };
      p(`| ${st}${PLAZA.has(st) ? ' 광장' : ''} | ${c('000')} | ${c('001')} | ${c('331')} | ${c('553')} | ${r['000'].coinsFirst}/${r['000'].coinsReplay} | ${r['553'].coinsFirst}/${r['553'].coinsReplay} | ${r['000'].gate1} · ${r['001'].gate1} · ${r['553'].gate1} | ${r['000'].t100 ?? '—'} · ${r['553'].t100 ?? '—'} | ${r['000'].maxBul} · ${r['553'].maxBul} |`);
    }
    p();
  }
  // 진행 시뮬레이션
  p(`### 진행 시뮬레이션(순차 해금, 판 상한 300) (${BOT_NOTE}, 판 사이 5초 가정)`);
  p('전략: 추천 = 다연발 1 → 직격 화력·연사 번갈아 / 가장 싼 것 = 세 트랙 다음 단계 중 가장 싼 것. 방식: 재도전 = 지면 같은 판 다시(명세 기본 — 봇은 결정적이라 강화가 바뀔 때까지 같은 결과가 되풀이된다) / 이긴 판 반복 = 같은 강화로 같은 판을 다시 하게 되면 대신 이긴 판 중 코인/분이 가장 높은 판을 한 번(참고).');
  p('칸 \'판:시도(+반복)\' = 그 판 첫 통과까지 그 판 시도 수(+그사이 이긴 판 반복 수) · 누적 분 · 그때 묶음.');
  p();
  p('| 봇 · 전략 · 방식 | 1~8번 첫 통과 | 막힌 판(시도·묶음) | 총 판 · 분 | 구매(출격 뒤 몇 판째:트랙 단계) |');
  p('|---|---|---|---|---|');
  const trs = { m: '다', p: '화', r: '연' };
  for (const bot of BOTS) for (const strat of ['rec', 'cheap']) for (const mode of ['', '-farm']) {
    const P = S.prog[`${bot}/${strat}${mode}`];
    if (!P) continue;
    const f = P.firsts.map((x) => `${x.st}:${x.tries}${x.farmRuns ? '(+' + x.farmRuns + ')' : ''} ${x.cumMin}분 ${bl(x.b)}`).join('<br>');
    const buys = P.purchases.map((x) => `${x.afterRun}:${trs[x.track[0]]}${x.level}`).join(' ');
    p(`| ${bot} · ${strat === 'rec' ? '추천' : '가장 싼 것'} · ${mode ? '이긴 판 반복' : '재도전'} | ${f} | ${P.stuck ? `${P.stuck.st}번 ${P.stuck.tries}회${P.stuck.farmRuns ? '(+' + P.stuck.farmRuns + ')' : ''} ${bl(P.stuck.b)}` : '없음(24번 완료)'} | ${P.runs} · ${P.minutes} | ${buys} |`);
  }
  p('(구매 표기: 다 = 다연발, 화 = 직격 화력, 연 = 연사)');
  p();
  // 수입/분
  p(`### 경로별 수입/분 요약 (${BOT_NOTE}, 판 사이 5초 가정)`);
  p('\'진행 중\' = 진행 시뮬레이션(재도전 방식)에서 실제로 선 자리(앞 판 N · 그때 묶음)마다 네 길을 비교. \'고정 묶음\' = 강화를 고정하고 1..N 이 열렸다고 가정한 N = 1~24(봇이 9번을 못 넘어 10~24번은 진행 중 자리가 없으므로 이 가정으로 본다). 배율 = 가장 나은 포기 ÷ 가장 나은 정상 도전·재도전.');
  p();
  p('| 봇 · 전략 | 진행 중 자리 수 · 1등(정상/재도전/포기) | 포기 1등 자리 | 최대 배율(자리) | 고정 (0,0,0) 포기 1등 · 최대 배율 | 고정 (3,3,1) | 고정 (5,5,3) |');
  p('|---|---|---|---|---|---|---|');
  for (const bot of BOTS) for (const strat of ['rec', 'cheap']) {
    const E = S.econ[`${bot}/${strat}`];
    if (!E) continue;
    const fx = (k) => { const v = E.fixed[k]; return `${v.quitBestCount}곳${v.quitBestAt.length ? '(' + v.quitBestAt.join('·') + '번)' : ''} · ${v.maxQuitOverPlay}`; };
    p(`| ${bot} · ${strat === 'rec' ? '추천' : '가장 싼 것'} | ${E.counts.normal + E.counts.replay + E.counts.quit} · ${E.counts.normal}/${E.counts.replay}/${E.counts.quit} | ${E.quitBestAt.length ? E.quitBestAt.join(', ') : '없음'} | ${E.maxQuitOverPlay} (${E.maxAt}) | ${fx('000')} | ${fx('331')} | ${fx('553')} |`);
  }
  p();
  //  evLead 추천 진행 중 자리 상세
  const E = S.econ['evLead/rec'];
  if (E) {
    p(`### 경로별 수입/분 상세 — evLead · 추천 · 진행 중 자리 (${BOT_NOTE})`);
    p();
    p('| 앞 판 · 묶음 | 정상 도전(코인/분) | 가장 나은 재도전 | 가장 나은 포기 | 1등 | 포기 배율 |');
    p('|---|---|---|---|---|---:|');
    const nm = { normal: '정상 도전', replay: '재도전', quit: '포기' };
    for (const r of E.rows) p(`| ${r.N}번 · ${bl(r.b)} | ${r.normal[0]} ${r.normal[1]} | ${r.replay ? r.replay[0] + ' ' + r.replay[1] : '—'} | ${r.quit ? r.quit[0] + ' ' + r.quit[1] : '—'} | ${nm[r.best]} | ${r.ratio ?? '—'} |`);
    p();
  }
  //  evLead 강화 0 고정 N = 1~24(econ 파일의 fixed rows)
  const EF = JSON.parse(readFileSync(join(OUT, tagged('econ-evLead-rec')), 'utf8'));
  for (const k of ['000', '553']) {
    p(`### 경로별 수입/분 상세 — evLead · 고정 ${bl(k)} · 1..N 열림 가정 (${BOT_NOTE})`);
    p();
    p('| N | 정상 도전 | 가장 나은 재도전 | 가장 나은 포기 | 1등 | 포기 배율 |');
    p('|---:|---|---|---|---|---:|');
    const nm = { normal: '정상 도전', replay: '재도전', quit: '포기' };
    for (const r of EF.fixed[k].rows) p(`| ${r.N} | ${r.normal.path} ${r.normal.cpm} | ${r.replay ? r.replay.path + ' ' + r.replay.cpm : '—'} | ${r.quit ? r.quit.path + ' ' + r.quit.cpm : '—'} | ${nm[r.best]} | ${r.quitOverPlay ?? '—'} |`);
    p();
  }
  return out.join('\n');
}

// ───────────────────────── 실행 ─────────────────────────
function range(s, n) {
  if (!s) return [...Array(n).keys()];
  const [a, b] = s.split('-').map(Number);
  return [...Array((b ?? a) - a + 1).keys()].map((i) => a + i);
}
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    if (cmd === 'grid') {
      const bots = opt('bots', BOTS.join(',')).split(',');
      const idx = range(opt('bundles'), GRID.length);
      for (const i of idx) for (const bot of bots) for (const st of ALL_STAGE_IDS) { checkBudget(); getRun(bot, st, unkey(GRID[i].k)); }
      saveCaches();
      console.log(`grid 완료 묶음 ${idx.join(',')} · 새 판 ${newRuns} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    } else if (cmd === 'enum') {
      //  전수 탐색: 지정한 판마다 가능한 강화 묶음 전부(직격 화력 0~5 × 연사 0~5 × 다연발 0~3 = 144) — 벽이 되는 판의 '이기는 최소 비용'을 정확히
      const bots = opt('bots', 'evLead').split(','), stages = opt('stages', '2').split(',').map(Number);
      for (const bot of bots) for (const st of stages) for (let p = 0; p <= UP_MAX.power; p++) for (let r = 0; r <= UP_MAX.rate; r++) for (let m = 0; m <= UP_MAX.multi; m++) { checkBudget(); getRun(bot, st, { power: p, rate: r, multi: m }); }
      saveCaches();
      console.log(`enum 완료 ${bots.join(',')} × 판 ${stages.join(',')} · 새 판 ${newRuns} · ${((Date.now() - t0) / 1000).toFixed(0)}초`);
    } else if (cmd === 'verify') {
      const fx = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/rush3-v4-real.json'), 'utf8'));
      let bad = 0, n = 0;
      for (const bot of BOTS) for (const st of ALL_STAGE_IDS) {
        const f = fx.runs[`${bot}/${st}`], r = getRun(bot, st, { power: 0, rate: 0, multi: 0 });
        n++;
        const pairs = [['won', r.won, f.won], ['over', r.over, f.over], ['steps', r.steps, f.steps], ['survivors', r.unitsEnd, f.survivors], ['peak', r.peak, f.peak],
          ['kills', r.killsAll, f.kills], ['time', r.time, f.time], ['gates', JSON.stringify(r.gates), JSON.stringify(f.gates)], ['loss', JSON.stringify(r.loss), JSON.stringify(f.loss)],
          ['hero', r.hero, f.hero], ['transfers', r.transfers, f.transfers], ['weapon', r.weapon, f.weapon], ['mk', r.mk, f.mk]];
        for (const [k, a, b] of pairs) if (a !== b) { bad++; console.log('불일치', bot, st, k, a, b); }
      }
      saveCaches();
      console.log(`verify: ${n}판 비교 · 불일치 ${bad}칸`);
    } else if (cmd === 'prog') {
      const bot = opt('bot'), strat = opt('strat', 'rec'), cap = Number(opt('cap', '300')), mode = opt('mode', 'retry');
      const P = progress(bot, strat, cap, mode);
      saveCaches();
      writeFileSync(join(OUT, tagged(`prog-${bot}-${strat}${mode === 'farm' ? '-farm' : ''}`)), JSON.stringify(P));
      console.log(`prog ${bot}/${strat}/${mode}: ${P.runs}판 ${P.minutes}분 · 완료 ${P.finished} · 막힘 ${JSON.stringify(P.stuck)} · 새 판 ${newRuns}`);
      console.log('  첫 클리어(판:시도수@묶음):', P.firsts.map((f) => `${f.st}:${f.tries}@${f.b}`).join(' '));
      console.log('  구매(출격 뒤:트랙레벨):', P.purchases.map((p) => `${p.afterRun}:${p.track[0]}${p.level}`).join(' '));
    } else if (cmd === 'econ') {
      const bot = opt('bot'), strat = opt('strat', 'rec');
      const E = econ(bot, strat);
      saveCaches();
      writeFileSync(join(OUT, tagged(`econ-${bot}-${strat}`)), JSON.stringify(E));
      console.log(`econ ${bot}/${strat}: 줄 ${E.rows.length} · 포기 1등 ${E.quitBestCount} ${JSON.stringify(E.quitBestAt)} · 최대 배율 ${E.maxQuitOverPlay}@${E.maxAt} · ${JSON.stringify(E.counts)} · 새 판 ${newRuns}`);
      console.log(`  (강화 0 고정 1..N) 포기 1등 ${E.up0.quitBestCount} ${JSON.stringify(E.up0.quitBestAt)} 최대 ${E.up0.maxQuitOverPlay}`);
    } else if (cmd === 'summary') {
      const S = summary();
      console.log(`summary: 빠진 칸 ${S.missing} · 시간 초과 ${S.timeouts.length}`);
    } else if (cmd === 'tables') {
      console.log(tables());
    } else if (cmd === 'bundles') {
      for (const [i, x] of GRID.entries()) console.log(i, x.k, x.cost, x.why.join(' / '));
    } else {
      console.log('명령: grid | enum | verify | prog | econ | summary | tables | bundles  (머리 주석 참고)');
    }
  } catch (e) {
    if (e instanceof Budget) { console.log(`⏸ 시간 예산 ${BUDGET_SEC}초 도달 — 저장했습니다. 같은 명령을 다시 실행하면 이어서 합니다(새 판 ${newRuns})`); process.exitCode = 3; }
    else throw e;
  }
}
