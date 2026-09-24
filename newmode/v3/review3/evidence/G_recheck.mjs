// G_recheck.mjs — F(코인 공식 비교) 결과를 믿지 않고 다시 계산하는 독립 재검산 스크립트.
//  실행: "C:/Program Files/nodejs/node" G_recheck.mjs   (입력: F_budget-events.json · D_econ-results.json · 대조용 F_budget-eval.json / 출력: G_recheck.json)
//  원칙
//   - F_budget-eval.mjs 의 코드는 가져다 쓰지 않는다. F 보고서 본문에 글로 적힌 정의만 보고 처음부터 다시 짰다.
//   - 게임 코드(rush3/*)는 불러오지 않는다. F_budget-events.json 의 시각표(누가 몇 번째 STEP 에 죽었나)만 쓴다.
//   - P2(추천안) 코인은 분수를 정확히(정수 분자·분모) 계산해 반올림한다. 부동소수 누적과 달라지는 칸(x.5 경계)이 있는지 따로 센다.
//   - 모든 값 = 봇 측정(정해진 입력, 한 판씩) + 후보 공식. 사람의 수입이 아니다. 판 사이 이동·재시작 5초는 가정이다.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EV = JSON.parse(readFileSync(join(HERE, 'F_budget-events.json'), 'utf8'));
const D = JSON.parse(readFileSync(join(HERE, 'D_econ-results.json'), 'utf8'));
const FE = JSON.parse(readFileSync(join(HERE, 'F_budget-eval.json'), 'utf8'));   // 대조(보고값 읽기)에만 쓴다

const GAP = 5;                        // 가정: 판 사이 이동·재시작 5초
const TS = [15, 30, 45, 60, 90];      // T초 포기 후보
const SPS = 60;                       // 1초 = 60 STEP (STEP = 1/60)
const BOTS = ['evLead', 'aimLead', 'planBoss'];
const STAGES = Array.from({ length: 24 }, (_, i) => i + 1);
if (Math.abs(EV.meta.step - 1 / 60) > 1e-12) throw new Error('STEP 이 1/60 이 아님');
const R = (p, s) => {
  const r = EV.runs.find((x) => x.policy === p && x.stage === s);
  if (!r) throw new Error(`판 없음 ${p}/${s}`);
  return r;
};
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const cpmRaw = (coins, sec) => (coins * 60) / (sec + GAP);
const cpmR = (coins, sec) => r1(cpmRaw(coins, sec));

// ───────────── 공식 (보고서 본문 정의 그대로) ─────────────
// H0 초안: 일반 적 max(1, round(0.25×최대 체력)), 보스 1체당 10×판 번호, 승리 시 남은 병력×1(첫·재클리어 같음), 소환·부딪힘 0, 포기 = 처치분 지급
const H0 = {
  id: 'H0',
  coinsAt(r, step) {
    let c = 0;
    for (const [st, hp] of r.schedKills) if (st <= step) c += Math.max(1, Math.round(hp / 4));
    for (const st of r.bossKills) if (st <= step) c += 10 * r.stage;
    return c;
  },
  F: (r) => r.survivorsAtWin,
  R: (r) => r.survivorsAtWin,
};
// P2 추천안: V(s) = 24 + 2s, 일반 적 1마리 = V ÷ 일정 스폰 총수, 보스 = 0.5V(여럿이면 나눔), 한 번만 반올림, F = V, R = 5
//  정확 계산: 처치 k, 보스 처치 b → (k·V/N + b·V/(2·bc)) = (2·bc·k·V + N·b·V) / (2·bc·N)
let p2FloatVsExact = 0;
const p2FloatVsExactList = [];
function budgetExact(id, Vf, kappaNum, kappaDen, phi, rho) {
  // kappa = kappaNum/kappaDen, V 는 정수여야 한다
  return {
    id,
    V: Vf,
    coinsAt(r, step) {
      const V = Vf(r.stage), N = r.scheduledTotal, bc = r.bossCount;
      let k = 0, b = 0;
      for (const [st] of r.schedKills) if (st <= step) k++;
      for (const st of r.bossKills) if (st <= step) b++;
      const num = k * V * kappaDen * bc + b * kappaNum * V * N;
      const den = kappaDen * bc * N;
      const exact = Math.floor((2 * num + den) / (2 * den));   // 반올림(0.5 는 올림 = JS Math.round 와 같은 규칙)
      const flt = Math.round(k * (V / N) + b * ((kappaNum / kappaDen) * V / bc));
      if (flt !== exact) { p2FloatVsExact++; p2FloatVsExactList.push(`${id} ${r.policy}/${r.stage} step ${step}: 정확 ${exact} · 부동소수 ${flt}`); }
      return exact;
    },
    F: (r) => Math.round(phi * Vf(r.stage)),
    R: () => rho,
  };
}
const P2 = budgetExact('P2', (s) => 24 + 2 * s, 1, 2, 1, 5);
const P1 = budgetExact('P1', () => 50, 1, 2, 1, 5);
const P3 = budgetExact('P3', (s) => 10 + s, 1, 2, 4, 5);
// 탐색 표(S) 점검용: 보고된 v1 을 그대로 넣은 실수 공식(정확 계산 불가 → 부동소수)
function budgetFloat(id, v1, g, kappa, phi, rho) {
  const V = (s) => v1 * (1 + g * (s - 1));
  return {
    id,
    coinsAt(r, step) {
      let k = 0, b = 0;
      for (const [st] of r.schedKills) if (st <= step) k++;
      for (const st of r.bossKills) if (st <= step) b++;
      return Math.round(k * (V(r.stage) / r.scheduledTotal) + (b ? b * (kappa * V(r.stage) / r.bossCount) : 0));
    },
    F: (r) => Math.round(phi * V(r.stage)),
    R: () => rho,
  };
}

// ───────────── 한 판의 길 ─────────────
//  정상 도전 = 끝까지(승리면 +F) · 재도전 = 이긴 판 끝까지(+R) · 패배 = 끝까지 진 판
//  T초 포기 = T×60 STEP 이 본전투 끝 STEP 보다 앞일 때만(같거나 뒤면 이미 판이 끝남) · 보스 직전 포기 = 보스 첫 등장 STEP(본전투 끝 전일 때만)
function paths(fm, r) {
  const won = r.result === 'win';
  const base = fm.coinsAt(r, Infinity);
  const mk = (label, coins, sec) => ({ label, stage: r.stage, coins, sec, cpm: cpmR(coins, sec), cpmRaw: cpmRaw(coins, sec) });
  const first = mk(`${r.stage}번 정상 도전(${won ? '승' : '패'})`, base + (won ? fm.F(r) : 0), r.endT);
  const replay = won ? mk(`${r.stage}번 재도전`, base + fm.R(r), r.endT) : null;
  const loss = won ? null : mk(`${r.stage}번 패배까지`, base, r.endT);
  const quits = [];
  for (const T of TS) if (T * SPS < r.endStep) quits.push(mk(`${r.stage}번 ${T}초 포기`, fm.coinsAt(r, T * SPS), T));
  if (r.bossAppearStep != null && r.bossAppearStep < r.endStep) quits.push(mk(`${r.stage}번 보스 직전 포기`, fm.coinsAt(r, r.bossAppearStep), r.bossAppearT));
  return { stage: r.stage, won, base, first, replay, loss, quits };
}
// 가장 높은 길: 코인/분(0.1 반올림값) 기준, 같으면 먼저 나온 것(정상 도전 → 재도전 → 포기 순) — 포기는 "확실히 더 높을 때만" 1등
const top = (arr) => arr.filter(Boolean).reduce((b, x) => (!b || x.cpm > b.cpm ? x : b), null);
const topRaw = (arr) => arr.filter(Boolean).reduce((b, x) => (!b || x.cpmRaw > b.cpmRaw ? x : b), null);
const brief = (x) => x && { path: x.label, coins: x.coins, sec: r2(x.sec), cpm: x.cpm };

function evaluate(fm) {
  const out = {};
  for (const p of BOTS) {
    const P = Object.fromEntries(STAGES.map((s) => [s, paths(fm, R(p, s))]));
    // (a) 순차 진행 두 판: 1번부터, 이기면 다음 판, 지면 같은 판
    const seq = [];
    { let cur = 1, cum = 0, sec = 0; const cleared = new Set();
      for (let k = 0; k < 2; k++) {
        const x = P[cur];
        const got = x.won ? (cleared.has(cur) ? x.replay.coins : x.first.coins) : x.loss.coins;
        cum += got; sec += x.first.sec + GAP;
        seq.push({ sortie: k + 1, stage: cur, result: x.won ? '승' : '패', coins: got, cum, cumMin: r1(sec / 60) });
        if (x.won) { cleared.add(cur); cur++; }
      } }
    // (a 참고) 40·150 코인 도달: 순차 진행, 처음 진 뒤부터는 이긴 판 중 코인/분 최고 판만 반복(이긴 판이 없으면 진 판 반복)
    const reach = {};
    for (const price of [40, 150]) {
      let cur = 1, cum = 0, sec = 0, n = 0, stuck = false; const cleared = new Set();
      while (cum < price && n < 500) {
        let x = P[cur];
        if (stuck && cleared.size) x = [...cleared].map((s) => P[s]).reduce((b, y) => (!b || y.replay.cpm > b.replay.cpm ? y : b), null);
        const s = x.stage;
        const got = x.won ? (cleared.has(s) ? x.replay.coins : x.first.coins) : x.loss.coins;
        cum += got; sec += x.first.sec + GAP; n++;
        if (x.won && !cleared.has(s)) { cleared.add(s); cur = s + 1; } else if (!x.won) stuck = true;
      }
      reach[price] = { sorties: n, minutes: r1(sec / 60), cum };
    }
    // (b) 순차 해금: 1..N 열림, N 은 아직 못 깸
    const rows = STAGES.map((N) => {
      const normal = P[N].won ? P[N].first : P[N].loss;
      const replay = top(STAGES.filter((s) => s < N && P[s].won).map((s) => P[s].replay));
      const quit = top(STAGES.filter((s) => s <= N).flatMap((s) => P[s].quits));
      const play = top([normal, replay]);
      const best = top([normal, replay, quit]);
      const kind = best === quit ? 'quit' : best === replay ? 'replay' : 'normalN';
      const playRaw = topRaw([normal, replay]);
      const quitRaw = topRaw(STAGES.filter((s) => s <= N).flatMap((s) => P[s].quits));
      return { N, kind, normal: brief(normal), replay: brief(replay), quit: brief(quit),
               ratio: quit && play ? Math.round((quit.cpm / play.cpm) * 100) / 100 : null,
               ratioRaw: quitRaw && playRaw ? quitRaw.cpmRaw / playRaw.cpmRaw : null,
               quitTopRaw: !!(quitRaw && playRaw && quitRaw.cpmRaw > playRaw.cpmRaw),
               tie: !!(quit && play && quit.cpm === play.cpm) };
    });
    const quitTopN = rows.filter((x) => x.kind === 'quit').map((x) => x.N);
    const maxRow = rows.reduce((m, x) => (x.ratio != null && (!m || x.ratio > m.ratio) ? x : m), null);
    // (c) 모든 판 열림: 반복 가능한 길(이긴 판 재도전 · 진 판 패배까지 · 포기)
    const rep = STAGES.flatMap((s) => [P[s].won ? P[s].replay : P[s].loss, ...P[s].quits]);
    const cBest = top(rep);
    const cBestQuit = top(STAGES.flatMap((s) => P[s].quits));
    const easy = top(STAGES.filter((s) => s <= 5 && P[s].won).map((s) => P[s].replay));
    // (d) 2번 패배 1회 vs 1번 재승리 1회(1번을 못 이기면 3번 재승리로 대신)
    const d = { stage2: P[2].won ? null : brief(P[2].loss), stage1Rewin: P[1].won ? brief(P[1].replay) : null,
                substitute3: !P[1].won && P[3].won ? brief(P[3].replay) : null };
    const dRef = d.stage1Rewin ?? d.substitute3;
    d.cpmRatio = d.stage2 && dRef ? Math.round((dRef.cpm / d.stage2.cpm) * 10) / 10 : null;
    // (e) 한 바퀴
    const lap = STAGES.reduce((a, s) => a + P[s].first.coins, 0);
    const fSum = STAGES.reduce((a, s) => a + (P[s].won ? P[s].first.coins - P[s].base : 0), 0);
    const lapRepeat = STAGES.reduce((a, s) => a + (P[s].won ? P[s].replay.coins : P[s].loss.coins), 0);
    const lapSec = STAGES.reduce((a, s) => a + P[s].first.sec + GAP, 0);
    // 표 F 점검: 이긴 판의 '보스 직전 포기 ÷ 끝까지(재도전)'
    const bossQuitVsReplay = STAGES.filter((s) => P[s].won).map((s) => {
      const bq = P[s].quits.find((q) => q.label.endsWith('보스 직전 포기'));
      return { stage: s, bossQuit: brief(bq), replay: brief(P[s].replay), ratio: bq ? Math.round((bq.cpm / P[s].replay.cpm) * 100) / 100 : null };
    });
    out[p] = {
      a: { sorties: seq, cum2: seq[1].cum, reach },
      b: { quitTopCount: quitTopN.length, quitTopN, counts: { normalN: rows.filter((x) => x.kind === 'normalN').length, replay: rows.filter((x) => x.kind === 'replay').length, quit: quitTopN.length },
           quitTopCountRaw: rows.filter((x) => x.quitTopRaw).length, ties: rows.filter((x) => x.tie).map((x) => x.N),
           maxRatio: maxRow?.ratio ?? null, maxAtN: maxRow?.N ?? null, maxRow, rows },
      c: { best: brief(cBest), bestQuit: brief(cBestQuit), easy: brief(easy),
           ratio: easy ? Math.round((cBest.cpm / easy.cpm) * 100) / 100 : null,
           quitOverEasy: easy ? Math.round((cBestQuit.cpm / easy.cpm) * 100) / 100 : null },
      d,
      e: { lap, firstClearSum: fSum, lapRepeat, lapMin: r1(lapSec / 60), lapCpm: r1((lap * 60) / lapSec), wins: STAGES.filter((s) => P[s].won).length },
      bossQuitVsReplay,
    };
  }
  out.weakOverEv = { aimLead: Math.round((out.aimLead.e.lap / out.evLead.e.lap) * 100) / 100, planBoss: Math.round((out.planBoss.e.lap / out.evLead.e.lap) * 100) / 100 };
  return out;
}

const res = { H0: evaluate(H0), P2: evaluate(P2), P1: evaluate(P1), P3: evaluate(P3) };

// ───────────── 탐색 표(S) 일부 점검: 보고된 v1 을 넣고 같은 지표를 다시 계산 ─────────────
const SWEEP_SPOT = [
  { id: 'S-g1', v1: 50.5, g: 0, kappa: 0.5, phi: 1, rho: 5 },
  { id: 'S-g3', v1: 26, g: 2 / 23, kappa: 0.5, phi: 1, rho: 5 },
  { id: 'S-g24', v1: 4.3, g: 1, kappa: 0.5, phi: 1, rho: 5 },
  { id: 'S-k0', v1: 34.1, g: 2 / 23, kappa: 0, phi: 1, rho: 5 },
  { id: 'S-k0.25', v1: 29.5, g: 2 / 23, kappa: 0.25, phi: 1, rho: 5 },
  { id: 'S-k2', v1: 15.2, g: 2 / 23, kappa: 2, phi: 1, rho: 5 },
  { id: 'S-f0', v1: 49.4, g: 2 / 23, kappa: 0.5, phi: 0, rho: 5 },
  { id: 'S-f4', v1: 10.7, g: 2 / 23, kappa: 0.5, phi: 4, rho: 5 },
  { id: 'S-r20', v1: 26, g: 2 / 23, kappa: 0.5, phi: 1, rho: 20 },
];
const sweepSpot = SWEEP_SPOT.map((sp) => {
  const e = evaluate(budgetFloat(sp.id, sp.v1, sp.g, sp.kappa, sp.phi, sp.rho));
  const f = FE.sweep.find((x) => x.id === sp.id);
  const mine = {
    lapEv: e.evLead.e.lap, lapRepeatEv: e.evLead.e.lapRepeat,
    bQuitCount: BOTS.map((p) => e[p].b.quitTopCount).join('·'), bMax: BOTS.map((p) => e[p].b.maxRatio).join('·'),
    c: BOTS.map((p) => e[p].c.ratio).join('·'), a2: BOTS.map((p) => e[p].a.cum2).join('·'),
    weak: `${e.weakOverEv.aimLead}·${e.weakOverEv.planBoss}`,
    // R 의 상대 무게: 재클리어 R ÷ 1번 판 가치 V(1), R ÷ 24번 판 가치 V(24)
    rOverV1: r2(sp.rho / sp.v1), rOverV24: r2(sp.rho / (sp.v1 * (1 + sp.g * 23))),
  };
  const theirs = f && {
    lapEv: f.lap.evLead, lapRepeatEv: f.lapRepeatNoF.evLead,
    bQuitCount: BOTS.map((p) => f.b_quitBestCount[p]).join('·'), bMax: BOTS.map((p) => f.b_maxRatio[p]).join('·'),
    c: BOTS.map((p) => f.c_ratio[p]).join('·'), a2: BOTS.map((p) => f.a_cum2[p]).join('·'),
    weak: `${f.weakOverStrong.aimLead}·${f.weakOverStrong.planBoss}`,
  };
  const same = theirs && ['lapEv', 'lapRepeatEv', 'bQuitCount', 'bMax', 'c', 'a2', 'weak'].every((k) => String(mine[k]) === String(theirs[k]));
  return { id: sp.id, params: sp, mine, theirs, same };
});

// ───────────── D_econ-results.json 과 이벤트 시각표 대조(72판 전부 + 6판 상세) ─────────────
const hist = (arr) => { const h = {}; for (const [, hp] of arr) h[hp] = (h[hp] || 0) + 1; return h; };
const sameHist = (a, b) => { const ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); return ka.length === kb.length && ka.every((k, i) => k === kb[i] && a[k] === b[k]); };
const dRows = [];
let dCells = 0, dBad = 0;
const dBadList = [];
for (const r of EV.runs) {
  const d = D.runs.find((x) => x.stage === r.stage && x.policy === r.policy);
  const th = D.theoretical.find((t) => t.stage === r.stage);
  const enemyAll = (() => { let c = 0; for (const [, hp] of r.schedKills) c += Math.max(1, Math.round(hp / 4)); return c; })();
  const bossAll = r.bossKills.length * 10 * r.stage;
  const clear = r.result === 'win' ? r.survivorsAtWin : 0;
  const bossAppearKills = r.bossAppearStep == null ? null : r.schedKills.filter(([st]) => st <= r.bossAppearStep).length;
  const bossAppearCoins = r.bossAppearStep == null ? null : H0.coinsAt(r, r.bossAppearStep);
  const cells = [
    ['승패', r.result, d.result],
    ['시간(초)', r2(r.endT), d.timeSec],
    ['전체 STEP', r.totalSteps, d.steps],
    ['남은 병력(승리 판)', r.result === 'win' ? r.survivorsAtWin : null, d.result === 'win' ? d.survivors : null],
    ['H0 적 코인', enemyAll, d.coins.enemy],
    ['H0 보스 코인', bossAll, d.coins.boss],
    ['H0 클리어 코인', clear, d.coins.clear],
    ['H0 합계', enemyAll + bossAll + clear, d.coins.total],
    ['일정 스폰 처치 수', r.schedKills.length, d.kills.scheduled],
    ['소환 처치 수', r.summonKills.length, d.kills.summoned],
    ['보스 처치 수', r.bossKills.length, d.kills.boss],
    ['처치된 적 체력 분포', JSON.stringify(hist(r.schedKills)), sameHist(hist(r.schedKills), d.killHpHist) ? JSON.stringify(hist(r.schedKills)) : JSON.stringify(d.killHpHist)],
    ['일정 스폰 등장 수', r.spawned.scheduled, d.spawned.scheduled],
    ['소환 등장 수', r.spawned.summoned, d.spawned.summoned],
    ['일정 스폰 총수(판 설계)', r.scheduledTotal, th.spawnEnemies],
    ['보스 수(판 설계)', r.bossCount, th.bosses],
    ['보스 등장 시각', r.bossAppearT == null ? null : r2(r.bossAppearT), d.bossAppear ? d.bossAppear.t : null],
    ['보스 등장까지 처치 수', bossAppearKills, d.bossAppear ? d.bossAppear.kills : null],
    ['보스 등장까지 H0 코인', bossAppearCoins, d.bossAppear ? d.bossAppear.coins : null],
  ];
  for (let i = 0; i < TS.length; i++) {
    const s = TS[i] * SPS;
    const ended = !(s <= r.totalSteps);   // D 의 정의(보너스전 STEP 까지 '안 끝남')
    cells.push([`${TS[i]}초 H0 코인(D 정의)`, ended ? enemyAll + bossAll : H0.coinsAt(r, s), d.farm[i].coins]);
    cells.push([`${TS[i]}초 판 끝 여부(D 정의)`, ended, d.farm[i].endedBeforeT]);
  }
  let bad = 0;
  for (const [k, a, b] of cells) { dCells++; if (a !== b) { bad++; dBad++; dBadList.push(`${r.stage}/${r.policy} ${k}: F=${a} D=${b}`); } }
  dRows.push({ stage: r.stage, policy: r.policy, cells: cells.map(([k, a, b]) => ({ k, F: a, D: b, ok: a === b })), bad });
}
const HIGHLIGHT = [[1, 'evLead'], [2, 'aimLead'], [8, 'evLead'], [10, 'evLead'], [15, 'planBoss'], [23, 'evLead'], [24, 'planBoss']];
const dHighlight = HIGHLIGHT.map(([s, p]) => {
  const row = dRows.find((x) => x.stage === s && x.policy === p);
  const pick = (k) => row.cells.find((c) => c.k === k);
  return { run: `${s}번/${p}`, why: { 1: '첫 판', 2: '2번 벽(패배)', 8: '보너스전 있는 판', 10: '보스 2체·긴 보스전', 15: '광장 판(패배)', 23: '보스 3체', 24: '광장·마지막 판' }[s],
           result: pick('승패'), time: pick('시간(초)'), h0Total: pick('H0 합계'), h0Enemy: pick('H0 적 코인'), h0Boss: pick('H0 보스 코인'), h0Clear: pick('H0 클리어 코인'),
           kills: pick('일정 스폰 처치 수'), summon: pick('소환 처치 수'), bossKills: pick('보스 처치 수'), hpHist: pick('처치된 적 체력 분포'), badCells: row.bad };
});

// ───────────── 구조 점검 ─────────────
// 1) 본전투 끝 뒤(8번 보너스전 등)에 처치가 기록됐나 — 있으면 '보너스전 코인 제외'가 틀린다
const killsAfterEnd = EV.runs.flatMap((r) => [...r.schedKills.map(([st]) => st), ...r.bossKills, ...r.summonKills].filter((st) => st > r.endStep).map((st) => `${r.stage}/${r.policy} step ${st} > ${r.endStep}`));
// 2) D 의 8번 45·60초 칸이 '이긴 뒤 보너스전 중 포기'였나
const d8 = BOTS.map((p) => {
  const r = R(p, 8), d = D.runs.find((x) => x.stage === 8 && x.policy === p);
  return { policy: p, winT: r2(r.endT), endStep: r.endStep, totalSteps: r.totalSteps,
           dFarm: d.farm.map((f) => ({ T: f.T, endedBeforeT: f.endedBeforeT, coins: f.coins, cpm: f.coinPerMinWithGap, afterWin: f.T * SPS >= r.endStep && !f.endedBeforeT })) };
});
// 3) D 표 5(H0 순차 해금) N=8·9·10 의 '포기 경로 최고'를 바로잡은 정의로 다시 구하면
const h0ev = res.H0.evLead.b.rows.filter((x) => [8, 9, 10].includes(x.N)).map((x) => ({ N: x.N, quitBestCorrected: x.quit, dTable5: D.derived.frontier.evLead.find((f) => f.N === x.N).quitBest }));
// 4) evLead: 보스 등장 전 처치 비율(표 F 본문 45.2% · 46.8% · 97%)
const evRuns = STAGES.map((s) => R('evLead', s));
const schedSum = evRuns.reduce((a, r) => a + r.scheduledTotal, 0);
const killsAll = evRuns.reduce((a, r) => a + r.schedKills.length, 0);
const killsPreBoss = evRuns.reduce((a, r) => a + r.schedKills.filter(([st]) => r.bossAppearStep == null || st <= r.bossAppearStep).length, 0);
const killsPreBossWonOnly = evRuns.filter((r) => r.result === 'win').reduce((a, r) => a + r.schedKills.filter(([st]) => st <= r.bossAppearStep).length, 0);
const killsWonOnly = evRuns.filter((r) => r.result === 'win').reduce((a, r) => a + r.schedKills.length, 0);
const structure = {
  killsAfterEndStep: killsAfterEnd.length, killsAfterEndStepList: killsAfterEnd.slice(0, 10),
  stage8DQuitCells: d8,
  h0EvFrontierN8to10: h0ev,
  evPreBoss: { scheduledTotal: schedSum, killsAll, killsPreBoss, preBossShareOfSpawn: r2((killsPreBoss / schedSum) * 100), killShareOfSpawn: r2((killsAll / schedSum) * 100),
               preBossShareOfKills: r2((killsPreBoss / killsAll) * 100), wonStagesOnly: { killsPreBoss: killsPreBossWonOnly, kills: killsWonOnly, share: r2((killsPreBossWonOnly / killsWonOnly) * 100) } },
  theoreticalH0: { stage1: D.theoretical[0].totalMax, stage24: D.theoretical[23].totalMax, ratio: r2(D.theoretical[23].totalMax / D.theoretical[0].totalMax), stage23: D.theoretical[22].totalMax },
  p2V: { V1: 26, V24: 72, ratio: r2(72 / 26) },
  // 91분(약 3바퀴) 주장 점검: 첫 바퀴 뒤 남은 코인을 가장 빠른 재도전(19번)만으로 모으면
  cost3830: (() => {
    const e = res.P2.evLead; const bestRep = e.c.best;   // 모든 판 열림 최고 = 반복 가능한 길 최고
    const remain = 3830 - e.e.lap;
    return { lap1: e.e.lap, lap1Min: e.e.lapMin, repeatLap: e.e.lapRepeat, threeLaps: e.e.lap + 2 * e.e.lapRepeat, threeLapsMin: r1(e.e.lapMin * 3),
             bestRepeatPath: bestRep, minutesIfBestRepeatAfterLap1: r1(e.e.lapMin + remain / bestRep.cpm) };
  })(),
  p2ExactVsFloatRounding: { differingCells: p2FloatVsExact, list: p2FloatVsExactList.slice(0, 20) },
};

// ───────────── "배율 지표는 눈금과 상관없다" 점검: P2 모양 그대로 크기만 바꿔 본다 ─────────────
//  R(5)은 고정 상수이고 F·합계는 정수로 반올림되므로, 크기를 바꾸면 비율 지표도 조금은 움직일 수 있다.
const scaleTest = [
  { id: 'P2×0.5(R 5 고정)', fm: budgetExact('P2h', (s) => 12 + s, 1, 2, 1, 5) },
  { id: 'P2×1(R 5)', fm: P2 },
  { id: 'P2×2(R 5 고정)', fm: budgetExact('P2d', (s) => 48 + 4 * s, 1, 2, 1, 5) },
  { id: 'P2×2(R 10, 같이 2배)', fm: budgetExact('P2d10', (s) => 48 + 4 * s, 1, 2, 1, 10) },
].map(({ id, fm }) => {
  const e = evaluate(fm);
  return { id, lapEv: e.evLead.e.lap, bQuitCount: BOTS.map((p) => e[p].b.quitTopCount).join('·'), bMax: BOTS.map((p) => e[p].b.maxRatio).join('·'),
           c: BOTS.map((p) => e[p].c.ratio).join('·'), weak: `${e.weakOverEv.aimLead}·${e.weakOverEv.planBoss}` };
});
structure.scaleTest = scaleTest;
// 탐색 표에서 R 이 1번 판 첫 클리어보다 커지는 변형(재도전이 첫 클리어보다 더 받는 이상한 칸)
structure.sweepROverF1 = SWEEP_SPOT.map((sp) => ({ id: sp.id, F1: Math.round(sp.phi * sp.v1), R: sp.rho, V1: sp.v1, V24: r1(sp.v1 * (1 + sp.g * 23)), rBiggerThanF1: sp.rho > Math.round(sp.phi * sp.v1) }));

// ───────────── 보고값 ↔ 재계산 대조 ─────────────
const M = [];
const add = (metric, reported, recomputed, note = '') => M.push({ metric, reported: String(reported), recomputed: String(recomputed), ok: String(reported) === String(recomputed), note });
const tri = (f) => BOTS.map(f).join('·');
const fmt2 = (v) => (v == null ? 'null' : (Math.round(v * 100) / 100).toString());
for (const id of ['H0', 'P2']) {
  const e = res[id];
  const rep = {
    H0: { a: '114·67·40', a1: '1번 승 +100, 2번 패 +14 / 1번 승 +53, 2번 패 +14 / 1번 패 +20, 1번 패 +20', bN: '2·2·7', bAt: '23,24 / 23,24 / 1,2,12,13,14,15,24', bMax: '1.1·1.18·3.32', bCounts: '10·12·2 / 6·16·2 / 4·13·7', c: '5.19·6.73·3.91', e: '8997·4615·4328' },
    P2: { a: '61·54·8', a1: '1번 승 +54, 2번 패 +7 / 1번 승 +47, 2번 패 +7 / 1번 패 +4, 1번 패 +4', bN: '0·0·2', bAt: ' /  / 1,2', bMax: '0.65·0.6·1.86', bCounts: '17·7·0 / 6·18·0 / 5·17·2', c: '1.47·1.72·1.49', e: '1806·771·719' },
  }[id];
  add(`${id} (a) 둘째 판 뒤 누적 ev·aim·plan`, rep.a, tri((p) => e[p].a.cum2));
  add(`${id} (a) 첫 판·둘째 판 내역`, rep.a1, BOTS.map((p) => e[p].a.sorties.map((x) => `${x.stage}번 ${x.result} +${x.coins}`).join(', ')).join(' / '));
  add(`${id} (b) 포기 1등 N 수 ev·aim·plan`, rep.bN, tri((p) => e[p].b.quitTopCount));
  add(`${id} (b) 포기 1등 N 목록`, rep.bAt, BOTS.map((p) => e[p].b.quitTopN.join(',')).join(' / '));
  add(`${id} (b) 최대 배율 ev·aim·plan`, rep.bMax, tri((p) => fmt2(e[p].b.maxRatio)));
  add(`${id} (b) 1등 길 횟수(정상·재도전·포기)`, rep.bCounts, BOTS.map((p) => `${e[p].b.counts.normalN}·${e[p].b.counts.replay}·${e[p].b.counts.quit}`).join(' / '));
  add(`${id} (c) 모든 판 열림 최고 ÷ 쉬운 판 재도전 ev·aim·plan`, rep.c, tri((p) => fmt2(e[p].c.ratio)));
  add(`${id} (e) 한 바퀴(첫 클리어 포함) ev·aim·plan`, rep.e, tri((p) => e[p].e.lap));
}
// P2 세부
const p2 = res.P2;
add('P2 (e) evLead 첫 클리어 합 · 반복 한 바퀴', '856 · 1040', `${p2.evLead.e.firstClearSum} · ${p2.evLead.e.lapRepeat}`);
add('P2 (e) evLead 한 바퀴 시간·코인/분', '30.3분 · 59.6', `${p2.evLead.e.lapMin}분 · ${p2.evLead.e.lapCpm}`);
add('P2 (b) 최대 배율이 나온 N ev·aim·plan', '9·23·2', tri((p) => p2[p].b.maxAtN));
add('P2 (c) 최고 길 ev·aim·plan', '19번 재도전 65.2 · 21번 재도전 57.1 · 21번 재도전 56.5', BOTS.map((p) => `${p2[p].c.best.path} ${p2[p].c.best.cpm}`).join(' · '));
add('P2 (c) 쉬운 판 최고 ev·aim·plan', '5번 44.3 · 3번 33.2 · 3번 37.9', BOTS.map((p) => `${p2[p].c.easy.path.replace(' 재도전', '')} ${p2[p].c.easy.cpm}`).join(' · '));
add('P2 (c) 포기 길 최고 ÷ 쉬운 판 ev·aim·plan', '0.84·1.03·0.77', tri((p) => fmt2(p2[p].c.quitOverEasy)));
add('P2 (a) 40·150 코인 도달(판·분) evLead', '1판·0.7분 / 5판·4.2분', `${p2.evLead.a.reach[40].sorties}판·${p2.evLead.a.reach[40].minutes}분 / ${p2.evLead.a.reach[150].sorties}판·${p2.evLead.a.reach[150].minutes}분`);
add('P2 (a) 40·150 코인 도달(판·분) aimLead', '1판·0.8분 / 6판·5.4분', `${p2.aimLead.a.reach[40].sorties}판·${p2.aimLead.a.reach[40].minutes}분 / ${p2.aimLead.a.reach[150].sorties}판·${p2.aimLead.a.reach[150].minutes}분`);
add('P2 (a) 40·150 코인 도달(판·분) planBoss', '10판·9.9분 / 38판·37.6분', `${p2.planBoss.a.reach[40].sorties}판·${p2.planBoss.a.reach[40].minutes}분 / ${p2.planBoss.a.reach[150].sorties}판·${p2.planBoss.a.reach[150].minutes}분`);
add('P2 (d) evLead 2번 패배 vs 1번 재승리', '7코인 5.8/분 vs 33코인 44/분 → 7.6', `${p2.evLead.d.stage2.coins}코인 ${p2.evLead.d.stage2.cpm}/분 vs ${p2.evLead.d.stage1Rewin.coins}코인 ${p2.evLead.d.stage1Rewin.cpm}/분 → ${p2.evLead.d.cpmRatio}`);
add('P2 약한 봇 ÷ evLead 한 바퀴 aim·plan', '0.43·0.4', `${p2.weakOverEv.aimLead}·${p2.weakOverEv.planBoss}`);
add('H0 약한 봇 ÷ evLead 한 바퀴 aim·plan', '0.51·0.48', `${res.H0.weakOverEv.aimLead}·${res.H0.weakOverEv.planBoss}`);
const tf = (s) => p2.evLead.bossQuitVsReplay.find((x) => x.stage === s);
add('P2 표 F 1번: 보스 직전 포기 · 재도전 · 비율', '15코인 21/분 · 33코인 44/분 · 0.48', `${tf(1).bossQuit.coins}코인 ${tf(1).bossQuit.cpm}/분 · ${tf(1).replay.coins}코인 ${tf(1).replay.cpm}/분 · ${tf(1).ratio}`);
add('P2 표 F 10번 비율(보스 직전 포기 ÷ 끝까지)', '2.33', tf(10).ratio);
add('P2 표 F 23번 비율', '0.99', tf(23).ratio);
add('H0 표 F 10번 비율', '1.94', res.H0.evLead.bossQuitVsReplay.find((x) => x.stage === 10).ratio);
// P1·P3 (보고서 요약 표)
for (const id of ['P1', 'P3']) {
  const e = res[id];
  const rep = { P1: { a: '118·104·16', bN: '0·0·2', bMax: '0.59·0.57·1.62', c: '1·1·1', e: '1899·797·716', rep: '1089·527·491' },
                P3: { a: '59·56·4', bN: '0·0·2', bMax: '0.59·0.56·1.79', c: '1.42·1.76·1.51', e: '2003·747·691', rep: '525·253·236' } }[id];
  add(`${id} (a) 둘째 판 뒤 누적`, rep.a, tri((p) => e[p].a.cum2));
  add(`${id} (b) 포기 1등 N 수`, rep.bN, tri((p) => e[p].b.quitTopCount));
  add(`${id} (b) 최대 배율`, rep.bMax, tri((p) => fmt2(e[p].b.maxRatio)));
  add(`${id} (c) 배율`, rep.c, tri((p) => fmt2(e[p].c.ratio)));
  add(`${id} (e) 한 바퀴`, rep.e, tri((p) => e[p].e.lap));
  add(`${id} (e) 반복 한 바퀴`, rep.rep, tri((p) => e[p].e.lapRepeat));
}
// 구조 주장
add('표 F 본문: evLead 보스 등장 전 처치 ÷ 일정 스폰(소수 첫째 자리)', '45.2%', `${r1(structure.evPreBoss.preBossShareOfSpawn)}%`, `${killsPreBoss} ÷ ${schedSum} = ${structure.evPreBoss.preBossShareOfSpawn}%(보스가 안 나온 진 판은 전부 보스 전으로 셈)`);
add('표 F 본문: evLead 전체 처치 ÷ 일정 스폰(소수 첫째 자리)', '46.8%', `${r1(structure.evPreBoss.killShareOfSpawn)}%`, `${killsAll} ÷ ${schedSum}`);
add('표 F 본문: 처치 중 보스 전 비율(정수)', '97%', `${Math.round(structure.evPreBoss.preBossShareOfKills)}%`, `${killsPreBoss} ÷ ${killsAll} = ${structure.evPreBoss.preBossShareOfKills}% · 이긴 판만 ${structure.evPreBoss.wonStagesOnly.share}%`);
add('후보 표: H0 이론 상한 1번→24번 배수', '112→2916 약 26배', `${structure.theoreticalH0.stage1}→${structure.theoreticalH0.stage24} 약 ${Math.round(structure.theoreticalH0.ratio)}배`, `정확히 ${structure.theoreticalH0.ratio}배(D 이론 상한 표에서)`);
add('P2 계산 예: 1번 evLead 첫 승리 · 재승리', '54 · 33', `${p2.evLead.a.sorties[0].coins} · ${p2.evLead.d.stage1Rewin.coins}`);
add('본전투 끝 뒤(보너스전) 처치 기록 수', '0', structure.killsAfterEndStep, '72판 모두 처치 STEP ≤ 본전투 끝 STEP → 보너스전 코인이 섞이지 않음');
add('D 대조: 72판 칸 불일치 수', '0', dBad, `F 는 30칸×72판=2,160칸, G 는 코인/분 칸을 빼고 체력 분포·STEP 수·남은 병력·판 설계값·보스 등장까지 처치 수를 넣은 ${dCells / 72}칸×72판=${dCells}칸`);
// D 대조 6판 이상(개별 행)
for (const h of dHighlight) {
  add(`D 대조 ${h.run}(${h.why}): 승패·시간·H0 합계(적/보스/클리어)·처치(일정/소환/보스)`,
      `${h.result.D}·${h.time.D}초·${h.h0Total.D}(${h.h0Enemy.D}/${h.h0Boss.D}/${h.h0Clear.D})·${h.kills.D}/${h.summon.D}/${h.bossKills.D}`,
      `${h.result.F}·${h.time.F}초·${h.h0Total.F}(${h.h0Enemy.F}/${h.h0Boss.F}/${h.h0Clear.F})·${h.kills.F}/${h.summon.F}/${h.bossKills.F}`,
      `체력 분포 일치 ${h.hpHist.ok} · 이 판 불일치 칸 ${h.badCells}`);
}
// (d) 배율 · (e) 세부 · H0 도달
add('H0 (d) 1번 재승리 ÷ 2번 패배 코인/분 ev·aim·plan(plan 은 3번 대체)', '11.4·5.4·17.7', tri((p) => res.H0[p].d.cpmRatio));
add('P2 (d) 1번 재승리 ÷ 2번 패배 코인/분 ev·aim·plan(plan 은 3번 대체)', '7.6·5.4·10.2', tri((p) => p2[p].d.cpmRatio));
add('P2 (e) 첫 클리어 합 ev·aim·plan', '856·286·260', tri((p) => p2[p].e.firstClearSum));
add('P2 (e) 반복 한 바퀴 ev·aim·plan', '1040·515·484', tri((p) => p2[p].e.lapRepeat));
add('H0 (a) 40·150 도달 판 수 ev·aim·plan', '1/3 · 1/4 · 2/8', BOTS.map((p) => `${res.H0[p].a.reach[40].sorties}/${res.H0[p].a.reach[150].sorties}`).join(' · '));
// 2판 누적 ÷ evLead 한 바퀴(planBoss) — "0.44% 로 같다 = 눈금 문제" 주장 점검
structure.planBossEarlyShare = Object.fromEntries(['H0', 'P1', 'P2', 'P3'].map((id) => [id, { cum2: res[id].planBoss.a.cum2, evLap: res[id].evLead.e.lap, pct: r2((res[id].planBoss.a.cum2 / res[id].evLead.e.lap) * 100) }]));
add('Table A 본문: planBoss 2판 누적 ÷ evLead 한 바퀴 H0·P2(소수 둘째 자리)', '0.44%·0.44%', `${r2(structure.planBossEarlyShare.H0.pct)}%·${r2(structure.planBossEarlyShare.P2.pct)}%`, `같은 눈금의 P1 ${structure.planBossEarlyShare.P1.pct}% · P3 ${structure.planBossEarlyShare.P3.pct}%`);
// H0 뒤 판 ÷ 앞 판("수십 배") 점검
structure.h0Gradient = {
  theoreticalCap24over1: structure.theoreticalH0.ratio,
  evRealizedCoins23over1: r2(res.H0.evLead.bossQuitVsReplay.find((x) => x.stage === 23).replay.coins / res.H0.evLead.bossQuitVsReplay.find((x) => x.stage === 1).replay.coins),
  evCpm23over1: r2(res.H0.evLead.bossQuitVsReplay.find((x) => x.stage === 23).replay.cpm / res.H0.evLead.bossQuitVsReplay.find((x) => x.stage === 1).replay.cpm),
  allOpenBestOverEasy: tri((p) => res.H0[p].c.ratio),
  inStageQuitOverFinishAtTop: r2(847.4 / 770.7),
};

// F_budget-eval.json 자체와도(보고서 표가 JSON 에서 옮겨졌는지)
const fP2 = FE.finals.find((x) => x.id === 'P2');
add('F_budget-eval.json P2 (b) 포기 1등 수 = 재계산', tri((p) => fP2.perPolicy[p].b_frontier.quitBestCount), tri((p) => p2[p].b.quitTopCount));
add('F_budget-eval.json P2 (e) 한 바퀴 = 재계산', tri((p) => fP2.perPolicy[p].e_lap.lapWithFirstClear), tri((p) => p2[p].e.lap));
add('탐색 표 S 9행 재계산 일치 행 수', '9', sweepSpot.filter((x) => x.same).length);

// ───────────── 문장 점검(수치로 뒷받침되지 않거나 과장된 곳) ─────────────
const st = structure;
const claimsReview = [
  { where: '대상 파일 목록', claim: 'F_summary.md', verdict: '파일 없음',
    why: 'evidence 폴더에 F_summary.md 가 없다(F_ 파일은 budget-events·budget-eval(.mjs/.json)·budget-probe 네 개뿐). 보고 본문은 작업 지시문에 인용된 글과 F_budget-eval.json 으로 대조했다.' },
  { where: '표 F 아래 · 셋째 점', claim: '초안의 농사 문제는 한 판 안의 포기에서 온 것이 아니고, 뒤 판의 코인이 앞 판보다 수십 배 많은 데서 나왔다', verdict: '방향은 맞지만 너무 단정적',
    why: `판당 코인 총액으로는 "수십 배"가 맞다(evLead 실측 23번 ÷ 1번 = ${st.h0Gradient.evRealizedCoins23over1}배, 24번 936 ÷ 2번 14 = 약 67배, 이론 상한 24번 ÷ 1번 = ${st.h0Gradient.theoreticalCap24over1}배). 그러나 농사 길을 정하는 것은 코인/분이고, 그 격차는 약 5~7배다(evLead 23번 ÷ 1번 ${st.h0Gradient.evCpm23over1}배, 모든 판 열림 최고 ÷ 쉬운 판 ${st.h0Gradient.allOpenBestOverEasy}배). 또 초안의 순차 해금 표에서 포기가 1등인 곳(evLead·aimLead 23·24, planBoss 1·2·12~15·24)은 모두 "한 판 안에서 그만두기"다. 그 덤은 evLead 맨 위 판에서 ${st.h0Gradient.inStageQuitOverFinishAtTop}배(약 10%)지만 planBoss 2번 도달 때는 3.32배다. "포기와 무관"이 아니라 "주된 원인은 판 사이 격차이고, 포기는 거기에 더해진다"가 정확하다.` },
  { where: '표 A 아래 · 둘째 점', claim: 'planBoss 는 아무 조작을 하지 않는 봇이므로 사람의 아래 한계로 보는 것이 맞다', verdict: '근거 없음(봇을 사람처럼 씀)',
    why: 'rush3-policies.mjs 주석상 planBoss 는 2·3번에서 짜인 경로를 따르고, 보스가 나오면 보스를 따라가며, 광장에서는 돌진을 피한다. "아무 조작도 안 한다"는 1번과 4~24번의 보스 전 구간에만 맞다. 또 사람의 아래 한계는 잰 적이 없다. 사람은 음수 게이트를 고르거나 적에 부딪혀 더 못할 수 있다. planBoss 는 3번에서 evLead 보다 더 벌고(초안 182 대 181) 3·8·16·21·22번 다섯 판을 이긴다.' },
  { where: '표 A 아래 · 둘째 점', claim: 'planBoss 2판 누적 ÷ evLead 한 바퀴가 초안·P2 모두 0.44% 이므로 이 격차는 공식이 아니라 눈금 문제다', verdict: '숫자는 맞으나 결론은 뒷받침 안 됨',
    why: `같은 눈금(evLead 한 바퀴 ≈ 1,915)으로 맞춘 P1·P2·P3 에서 이 비율은 ${st.planBossEarlyShare.P1.pct}% · ${st.planBossEarlyShare.P2.pct}% · ${st.planBossEarlyShare.P3.pct}% 로 4배 넘게 다르다. 곧 공식(기울기·첫 클리어 몫)이 약한 봇의 초반 수입을 바꾼다. 초안과 P2 가 같은 0.44% 인 것은 우연의 일치다.` },
  { where: '표 A 아래 · 첫째 점 / 추천 "함께 정해야 할 것"', claim: '첫 1~2판 수입 54~61(evLead)·47~54(aimLead) → 첫 구매 약 50코인', verdict: '봇 수입을 사람 첫 출격 수입처럼 씀',
    why: `검토문 1번은 가격을 "실제 첫 1~2회 출격 수입"에 맞추라고 했다. 여기 숫자는 잘하는 두 봇의 값이다. 같은 두 판에서 planBoss 는 ${res.P2.planBoss.a.cum2}코인이다. 50코인은 시작점 후보로만 쓰고, 사람 관찰로 확인해야 한다고 적는 편이 맞다.` },
  { where: '추천 이유 5', claim: '적 체력이나 적 수를 조정해도 코인은 바뀌지 않는다', verdict: '과장',
    why: '바뀌지 않는 것은 판 예산 V(s)(= 그 판에서 벌 수 있는 최대)뿐이다. 실제 수입은 V × 잡은 비율이다. D 표 6 에서 evLead 의 잡은 비율은 판마다 13%~79% 로 흔들리고, 적 체력·수를 바꾸면 이 비율이 바뀐다.' },
  { where: '추천 이유 5', claim: '보스 몫 0.25~2, 첫 클리어 몫 0~4 에서 포기 1등 수가 0 이라 이 값에 크게 민감하지 않다', verdict: '범위를 좁혀야 함',
    why: '포기 1등 수(evLead·aimLead 0)만 둔감하다(재계산으로 확인). 다른 지표는 크게 움직인다: 반복 한 바퀴 978~1,474(보스 몫), 507~2,004(첫 클리어 몫), (b) evLead 최대 배율 0.34~0.80. 또 탐색은 V24/V1 = 3(기울기 2/23)에서 했고 P2 는 2.77 이다.' },
  { where: '추천 이유 4', claim: '반복 수입 1,040 이 남아 막힌 사람이 재도전으로 벌 수 있다(P3 는 525)', verdict: '지표가 주장과 맞지 않음',
    why: `1,040 은 evLead 가 24판을 한 번씩 다 도는 값이다. 순차 해금에서 막힌 사람은 뒤 판을 못 간다. 막힌 곳에서 쓸 수 있는 값은 그때까지 이긴 판 중 가장 빠른 재도전의 코인/분(evLead P2 에서 막힌 지점에 따라 44~65/분)이다. 또 "사람"이 아니라 봇 값이다.` },
  { where: '표 E 아래 · 참고 / 추천 "함께 정해야 할 것"', claim: '비용 3,830 은 evLead 도 약 3바퀴(약 91분)가 걸린다', verdict: '가정에 따라 달라짐',
    why: `24판을 통째로 세 번 도는 경우의 값이다(${st.cost3830.threeLaps}코인 · ${st.cost3830.threeLapsMin}분). 첫 바퀴 뒤에 가장 빠른 재도전(${st.cost3830.bestRepeatPath.path} ${st.cost3830.bestRepeatPath.cpm}/분)만 하면 약 ${st.cost3830.minutesIfBestRepeatAfterLap1}분이다. "걸린다"보다 "세 바퀴를 돌면 91분, 가장 빠른 판만 반복하면 약 61분"이 정확하다.` },
  { where: '요약 표 머리글 · 눈금 설명', claim: '배율 지표는 눈금과 상관없다', verdict: '대체로 맞지만 정확히는 아님',
    why: `R(5)은 고정 상수이고 코인은 정수로 반올림되므로 크기만 바꿔도 비율이 움직인다. P2 모양을 0.5배·1배·2배로 바꾸면(R 5 고정) evLead (c) 배율 ${st.scaleTest.map((x) => x.c.split('·')[0]).slice(0, 3).join(' → ')}, planBoss (b) 최대 배율 ${st.scaleTest.map((x) => x.bMax.split('·')[2]).slice(0, 3).join(' → ')} 이다. 포기 1등 수(0·0·2)는 그대로다.` },
  { where: '표 S 머리글', claim: '한 번에 손잡이 하나만 바꿨다', verdict: '엄밀하지 않음',
    why: 'v1 을 매번 다시 맞추고 R 은 5 로 고정했으므로 R 의 상대 무게가 함께 변한다(R ÷ V(1): S-g1 0.10 → S-g24 1.16). S-g24 는 R(5)이 1번 첫 클리어(4)보다 크고, S-f0 은 R(5)이 모든 첫 클리어(0)보다 커서 반복 한 바퀴(2,004)가 첫 바퀴(1,914)보다 많다. 탐색 결론(포기 1등 0)에는 영향이 없다.' },
  { where: '추천 이유 4', claim: 'evLead 의 "새 판 정상 도전" 1등이 24곳 중 17곳', verdict: '맞음(단 한 곳은 사실상 동률)',
    why: 'N = 23 은 23번 정상 도전 65.8/분 대 19번 재도전 65.2/분으로 차이가 1% 뿐이고, 23번의 우위는 첫 클리어 70코인 덕분이다.' },
  { where: '추천 이유 1·2', claim: '포기 길이 1등이 되지 않는다 · 해금 없이도 농사 배율이 작다', verdict: '맞음(범위 주의)',
    why: '"포기 1등 0곳"은 순차 해금 표의 결과다. 모든 판이 열린 경우 aimLead 는 23번 60초 포기(34.2/분)가 쉬운 판 재도전(33.2/분)보다 1.03배 높다. 1등 길은 아니지만 이유 2 에 같이 적어 두는 편이 정확하다.' },
  { where: 'D 대조 · 일부러 다르게 정의한 것', claim: '바로잡으면 D 표 5 의 N = 8 포기 최고가 6번 보스 직전 114.6/분이 된다', verdict: '맞음(단 N = 9·10 도 같이 바뀜)',
    why: 'D 표 5 는 N = 8·9·10 세 줄 모두 "8번 45초 177.6/분"이다. 바로잡으면 N = 9 는 9번 보스 직전 119.1/분, N = 10 은 10번 보스 직전 170.7/분이 된다. 1등 길 횟수(10·12·2)는 바로잡기 전후가 같다(재계산 확인).' },
];
const issues = claimsReview.filter((c) => !c.verdict.startsWith('맞음')).map((c) => `[${c.verdict}] ${c.where}: "${c.claim}" — ${c.why}`);

const out = {
  meta: {
    script: 'G_recheck.mjs', generatedAt: new Date().toISOString(), node: process.version,
    inputs: ['F_budget-events.json(시각표)', 'D_econ-results.json(대조)', 'F_budget-eval.json(보고값 읽기만)'],
    note: '봇 측정(정해진 입력, 한 판씩) + 후보 공식. 사람의 수입이 아니다. 판 사이 이동·재시작 5초는 가정이다. 8번 보너스전 코인 제외, 랜덤 길(3·12번)은 기본 시드 하나.',
    independence: 'F_budget-eval.mjs 는 작성 전에 한 번 읽었다(코드는 가져오지 않고 보고서 본문 정의로 다시 짬). 정의를 본 만큼, 정의 자체에 공통으로 있는 잘못은 이 재검산으로 잡히지 않는다. 확실히 독립인 부분: (1) P1·P2·P3 코인을 정수 분자·분모로 정확히 계산(부동소수 누적과 차이 0칸), (2) D 대조를 F 와 다른 29칸(처치 적 체력 분포·STEP 수·남은 병력·판 설계값·보스 등장까지 처치 수 포함)으로 72판 2,088칸, (3) 반올림 전 코인/분으로도 1등 수를 다시 셈(동률 0곳, 결과 같음). 게임 코드는 불러오지 않았다(시각표만 사용).',
  },
  assumptions: [
    'T초 포기는 T×60 STEP 이 본전투 끝 STEP 보다 앞일 때만 성립(보고서의 바로잡은 정의). 그 STEP 까지(포함)의 처치만 센다.',
    '보스 직전 포기 = 보스 첫 등장 STEP 까지(포함)의 처치분. 그 STEP 이 본전투 끝보다 앞일 때만.',
    '코인/분 = 코인 × 60 ÷ (걸린 초 + 5), 0.1 단위 반올림. 1등 비교와 배율은 반올림된 코인/분으로 한다(보고서와 같은 눈금). 반올림 전 값으로도 따로 셌다(quitTopCountRaw).',
    '동률이면 정상 도전 → 재도전 → 포기 순으로 앞의 것을 1등으로 본다. 곧 포기는 확실히 높을 때만 1등.',
    'P1·P2·P3 코인은 정수 분자·분모로 정확히 계산한 뒤 한 번 반올림(0.5 는 올림). 부동소수 누적과 달라지는 칸 수를 따로 셌다.',
    '(a) 순차 진행: 1번부터, 이기면 다음 판, 지면 같은 판(봇은 결정적이라 같은 결과). 40·150 도달은 처음 진 뒤 이긴 판 중 코인/분 최고 판만 반복.',
    '(c) 반복 가능한 길 = 이긴 판 재도전(+R) · 진 판 끝까지 · 모든 판의 포기 길. 쉬운 판 = 1~5번 중 이긴 판 재도전 최고.',
    '탐색 표 S 는 보고된 v1(소수 한 자리)을 그대로 넣고 다시 계산했다(v1 자동 맞춤 과정은 재현하지 않음).',
  ],
  results: res,
  sweepSpot,
  dCrossCheck: { runs: dRows.length, cells: dCells, mismatches: dBad, mismatchList: dBadList.slice(0, 30), highlight: dHighlight },
  structure,
  matches: M,
  claimsReview,
  issues,
};
writeFileSync(join(HERE, 'G_recheck.json'), JSON.stringify(out, null, 1));

// ── 콘솔 요약 ──
for (const m of M) console.log(m.ok ? 'OK  ' : 'DIFF', m.metric, '| 보고', m.reported, '| 재계산', m.recomputed, m.note ? '| ' + m.note : '');
console.log('\nD 대조', dRows.length, '판', dCells, '칸, 불일치', dBad);
for (const x of dBadList.slice(0, 10)) console.log('  ', x);
console.log('P2/P1/P3 정확 vs 부동소수 반올림 차이 칸', p2FloatVsExact, p2FloatVsExactList.slice(0, 5));
console.log('구조', JSON.stringify({ afterEnd: structure.killsAfterEndStep, pre: structure.evPreBoss, cost: structure.cost3830 }));
console.log('D 8번 칸', JSON.stringify(d8.map((x) => ({ p: x.policy, winT: x.winT, after: x.dFarm.filter((f) => f.afterWin).map((f) => `${f.T}s ${f.coins}c ${f.cpm}`) }))));
console.log('H0 N8~10', JSON.stringify(h0ev.map((x) => ({ N: x.N, corr: x.quitBestCorrected && `${x.quitBestCorrected.path} ${x.quitBestCorrected.cpm}`, d: x.dTable5 && `${x.dTable5.stage} ${x.dTable5.kind} ${x.dTable5.T} ${x.dTable5.cpm}` }))));
console.log('ties/raw', JSON.stringify(Object.fromEntries(['H0', 'P2'].map((id) => [id, BOTS.map((p) => ({ p, ties: res[id][p].b.ties, raw: res[id][p].b.quitTopCountRaw }))]))));
console.log('scale', JSON.stringify(scaleTest)); console.log('R>F1', JSON.stringify(structure.sweepROverF1.filter((x) => x.rBiggerThanF1)));
for (const s of sweepSpot) console.log('sweep', s.id, s.same ? 'SAME' : 'DIFF', JSON.stringify(s.mine), s.same ? '' : JSON.stringify(s.theirs));
