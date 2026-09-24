// F_budget-eval.mjs — 검토 4번 권고(스테이지 예산 방식 · 첫 클리어 보너스 · 포기 코인 유지)를 수치로 비교한다.
//  실행: "C:/Program Files/nodejs/node" F_budget-eval.mjs   (입력: F_budget-events.json · 출력: F_budget-eval.json)
//  판을 다시 돌리지 않는다. F_budget-probe.mjs 가 저장한 이벤트 시각표(누가 몇 번째 STEP 에 죽었나)에 공식 후보만 바꿔 대입한다.
//  모든 값 = 봇 측정(정해진 입력, 한 판씩) + 후보 공식. 사람의 수입이 아니다. 판 사이 이동·재시작 5초는 가정이다.
//  8번 보너스전 코인은 넣지 않았고(시간도 뺌), 랜덤 길(3·12번)은 기본 시드 하나만 봤다.
//
//  ── 길(경로) 정의 ──
//   정상 도전(첫 도전): 그 판을 끝까지(승리 또는 패배). 코인 = 처치분 + 보스분 + (승리면 첫 클리어 보너스 F).
//   이긴 판 재도전: 이미 이긴 판을 다시 끝까지. 코인 = 처치분 + 보스분 + 재클리어 보너스 R(F 없음).
//   T초 포기: T 초에 그만둠. **본전투가 끝나기 전(T×60 STEP < endStep)일 때만 성립.** 코인 = T 초까지의 처치분 + 보스분.
//     ⚠️D 와 다른 점: D 는 보너스전(8번) STEP 까지 '안 끝났다'로 봐서 8번 45·60초 칸이 '이긴 뒤 보너스전 중 포기'였다. 여기서는 뺀다.
//   보스 직전 포기: 보스가 처음 나타난 STEP 에 그만둠(보스가 나오기 전에 진 판은 이 길이 없다).
//   코인/분 = 코인 ÷ ((걸린 초 + 5초) / 60).
//   반올림: 한 판(또는 포기 순간)의 처치분 + 보스분 소수 합을 한 번 반올림. F·R 은 판마다 정수로 반올림해 둔 표값.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EV = JSON.parse(readFileSync(join(HERE, 'F_budget-events.json'), 'utf8'));
const STEP = EV.meta.step;
const POLICIES = EV.meta.policies;
const STAGES = [...new Set(EV.runs.map((r) => r.stage))].sort((a, b) => a - b);
const RESTART_SEC = 5;
const T_LIST = [15, 30, 45, 60, 90];
const LAP_ANCHOR = 1915;       // 기획 v4 초안 T4 의 '한 바퀴 수입 목표'(강화 전체 3,830 ÷ 2). 비교용 눈금일 뿐 목표로 고정하지 않는다(검토 4-4)
const RUN = (p, s) => EV.runs.find((r) => r.policy === p && r.stage === s);
const perMin = (coins, sec) => Math.round((coins / ((sec + RESTART_SEC) / 60)) * 10) / 10;
const round1 = (v) => Math.round(v * 10) / 10;

// ─────────────────────────── 공식 후보 ───────────────────────────
//  H0(초안): 적 max(1, round(0.25×최대체력)), 보스 10×판번호(1체당), 승리 시 남은 병력×1, 포기해도 처치분 지급. 첫/재클리어 구분 없음.
const H0 = {
  id: 'H0', label: '초안(체력 비례)',
  formula: '적 max(1, round(0.25×최대체력)) · 보스 10×판번호(1체당) · 승리 시 남은 병력×1 · 소환 0 · 포기 = 처치분 지급',
  killValue: (r, hp) => Math.max(1, Math.round(0.25 * hp)),
  bossValue: (r) => 10 * r.stage,
  firstClear: (r) => r.survivorsAtWin,
  replayClear: (r) => r.survivorsAtWin,
};
//  예산형 한 가족: 판 가치 V(s) = v1 × (1 + g × (s − 1)).
//   일반 적 예산 B(s) = V(s) → 일정 스폰 적 1마리 = B(s) ÷ 일정스폰총수(s) (소수 누적)
//   보스 K(s) = κ × V(s) (그 판 보스 전체 몫. 보스가 여럿이면 1체당 K(s) ÷ 보스 수)
//   첫 클리어 F(s) = round(φ × V(s)) (판마다 한 번) · 재클리어 R = ρ (일정) · 소환 적 0 · 포기 = 처치분 지급
function budget({ id, label, v1, g, kappa, phi, rho, vText }) {
  const V = (s) => v1 * (1 + g * (s - 1));
  return {
    id, label, params: { v1, g, kappa, phi, rho, V1: round1(V(1)), V24: round1(V(24)), ratio24to1: round1(V(24) / V(1)) },
    formula: `V(s)=${vText ?? `${v1}×(1+${round1(g * 1000) / 1000}×(s−1))`} · B(s)=V(s) · 적 1마리=B(s)÷일정스폰총수 · 보스 K(s)=${kappa}×V(s)(여럿이면 나눔) · 첫 클리어 F(s)=round(${phi}×V(s)) · 재클리어 R=${rho} · 소환 0 · 포기=처치분 지급`,
    V,
    killValue: (r) => V(r.stage) / r.scheduledTotal,
    bossValue: (r) => (kappa * V(r.stage)) / r.bossCount,
    firstClear: (r) => Math.round(phi * V(r.stage)),
    replayClear: () => rho,
  };
}

// ─────────────────────────── 한 판 계산 ───────────────────────────
function coinsUpTo(c, r, step) {
  let x = 0;
  for (const [st, hp] of r.schedKills) if (st <= step) x += c.killValue(r, hp);
  for (const st of r.bossKills) if (st <= step) x += c.bossValue(r);
  return Math.round(x);
}
const endSec = (r) => r.endT;
function pathsOf(c, r, { dQuitDef = false } = {}) {
  const won = r.result === 'win';
  const base = coinsUpTo(c, r, Infinity);
  const first = { coins: base + (won ? c.firstClear(r) : 0), sec: endSec(r) };
  first.cpm = perMin(first.coins, first.sec);
  const replay = won ? { coins: base + c.replayClear(r), sec: endSec(r) } : null;
  if (replay) replay.cpm = perMin(replay.coins, replay.sec);
  const loss = won ? null : { coins: base, sec: endSec(r), cpm: perMin(base, endSec(r)) };
  const quits = [];
  for (const T of T_LIST) {
    const s = Math.round(T / STEP);
    const ok = dQuitDef ? s <= r.totalSteps : s < r.endStep;   // dQuitDef = D 재현용(보너스전 중 포기 허용)
    if (!ok) continue;
    const coins = coinsUpTo(c, r, s);
    quits.push({ kind: `${T}초 포기`, T, coins, sec: T, cpm: perMin(coins, T) });
  }
  if (r.bossAppearStep != null && r.bossAppearStep < r.endStep) {
    const coins = coinsUpTo(c, r, r.bossAppearStep);
    quits.push({ kind: '보스 직전 포기', T: round1(r.bossAppearT), coins, sec: r.bossAppearT, cpm: perMin(coins, r.bossAppearT) });
  }
  return { stage: r.stage, won, first, replay, loss, quits };
}
const best = (arr) => arr.filter(Boolean).reduce((b, x) => (!b || x.cpm > b.cpm ? x : b), null);
const brief = (x) => x && { stage: x.stage, path: x.path, coins: x.coins, sec: round1(x.sec), cpm: x.cpm };

function evaluate(c, opt = {}) {
  const out = { id: c.id, label: c.label, formula: c.formula, params: c.params ?? null, perPolicy: {} };
  for (const p of POLICIES) {
    const P = {};
    for (const s of STAGES) P[s] = pathsOf(c, RUN(p, s), opt);
    // (a) 순차 진행: 1번부터, 이기면 다음 판, 지면 같은 판 재도전(봇은 결정적이라 같은 결과 반복). 첫 판은 첫 도전(F), 같은 판 반복 패배는 패배 코인
    const seq = [];
    { let cur = 1; const cleared = new Set(); let cum = 0, t = 0;
      for (let k = 0; k < 2; k++) {
        const x = P[cur];
        const got = x.won ? (cleared.has(cur) ? x.replay.coins : x.first.coins) : x.loss.coins;
        cum += got; t += x.first.sec + RESTART_SEC;
        seq.push({ sortie: k + 1, stage: cur, result: x.won ? '승' : '패', coins: got, cumCoins: cum, cumSec: round1(t) });
        if (x.won) { cleared.add(cur); cur++; }
      } }
    // (a 참고) 지금 비용표의 첫 단계 가격 40(화력·연사 1)·150(다연발 1)에 닿기까지: 순차 진행하다 지면
    //   "이긴 판 중 코인/분이 가장 높은 판 재도전"(이긴 판이 없으면 진 판 재도전)을 되풀이한다고 가정. 최대 200판까지 본다
    const reach = {};
    for (const price of [40, 150]) {
      let cur = 1, cum = 0, t = 0, k = 0; const cleared = new Set(); let stuck = false;
      while (cum < price && k < 200) {
        let s = cur, x = P[cur];
        if (stuck) {
          const rb = [...cleared].map((c2) => P[c2]).reduce((b, y) => (!b || y.replay.cpm > b.replay.cpm ? y : b), null);
          if (rb) { s = rb.stage; x = rb; }
        }
        const got = x.won ? (cleared.has(s) ? x.replay.coins : x.first.coins) : x.loss.coins;
        cum += got; t += x.first.sec + RESTART_SEC; k++;
        if (x.won && !cleared.has(s)) { cleared.add(s); if (s === cur) cur++; }
        else if (!x.won) stuck = true;
      }
      reach[price] = cum >= price ? { sorties: k, minutes: round1(t / 60) } : { sorties: null, note: '200판 안에 못 닿음' };
    }
    // (b) 순차 해금 가정: 1..N 이 열려 있고 N 은 아직 못 깬 상태
    const frontier = STAGES.map((N) => {
      const normalN = { stage: N, path: `${N}번 정상 도전(${P[N].won ? '승' : '패'})`, ...(P[N].won ? P[N].first : P[N].loss) };
      const replay = best(STAGES.filter((s) => s < N && P[s].won).map((s) => ({ stage: s, path: `${s}번 재도전`, ...P[s].replay })));
      const quit = best(STAGES.filter((s) => s <= N).flatMap((s) => P[s].quits.map((q) => ({ stage: s, path: `${s}번 ${q.kind}`, ...q }))));
      const play = best([normalN, replay]);
      const top = best([normalN, replay, quit]);
      const kind = top === quit ? 'quit' : top === replay ? 'replay' : 'normalN';
      return { N, normalN: brief(normalN), replayBest: brief(replay), quitBest: brief(quit), best: kind,
               quitOverPlay: quit && play ? Math.round((quit.cpm / play.cpm) * 100) / 100 : null };
    });
    const quitWins = frontier.filter((f) => f.best === 'quit');
    const maxRatio = frontier.reduce((m, f) => (f.quitOverPlay != null && f.quitOverPlay > m.v ? { v: f.quitOverPlay, N: f.N, quit: f.quitBest, play: f.normalN.cpm >= (f.replayBest?.cpm ?? -1) ? f.normalN : f.replayBest } : m), { v: 0, N: null });
    // (c) 모든 판 열림(해금 없음): 반복 가능한 길만(F 는 한 번뿐이라 뺌)
    const repeatAll = STAGES.flatMap((s) => [
      P[s].won ? { stage: s, path: `${s}번 재도전`, ...P[s].replay } : { stage: s, path: `${s}번 패배까지`, ...P[s].loss },
      ...P[s].quits.map((q) => ({ stage: s, path: `${s}번 ${q.kind}`, ...q })),
    ]);
    const openBest = best(repeatAll);
    const openBestQuit = best(repeatAll.filter((x) => x.path.includes('포기')));
    const openBestPlay = best(repeatAll.filter((x) => !x.path.includes('포기')));
    const easy = best(STAGES.filter((s) => s <= 5 && P[s].won).map((s) => ({ stage: s, path: `${s}번 재도전`, ...P[s].replay })));
    // (d) 2번 패배 1회 vs 1번 재승리 1회
    const d = {
      stage2Loss: P[2].won ? null : { coins: P[2].loss.coins, sec: round1(P[2].loss.sec), cpm: P[2].loss.cpm },
      stage1Rewin: P[1].won ? { coins: P[1].replay.coins, sec: round1(P[1].replay.sec), cpm: P[1].replay.cpm } : null,
      stage1LossIfNotWon: P[1].won ? null : { coins: P[1].loss.coins, sec: round1(P[1].loss.sec), cpm: P[1].loss.cpm },
      substituteStage3Rewin: P[1].won ? null : (P[3].won ? { coins: P[3].replay.coins, sec: round1(P[3].replay.sec), cpm: P[3].replay.cpm } : null),
    };
    // (e) 한 바퀴(1~24 한 번씩, 첫 클리어 포함) · 첫 클리어를 뺀 반복 한 바퀴
    const lap = STAGES.reduce((a, s) => a + P[s].first.coins, 0);
    const lapRepeat = STAGES.reduce((a, s) => a + (P[s].won ? P[s].replay.coins : P[s].loss.coins), 0);
    const lapSec = STAGES.reduce((a, s) => a + P[s].first.sec + RESTART_SEC, 0);
    const Fsum = STAGES.reduce((a, s) => a + (P[s].won ? c.firstClear(RUN(p, s)) : 0), 0);
    // 참고: 판별 재도전(이긴 판) 코인/분 — 뒤 판일수록 더 버는지(진행 보상) 확인용
    const replayCurve = STAGES.filter((s) => P[s].won).map((s) => ({ stage: s, coins: P[s].replay.coins, cpm: P[s].replay.cpm }));
    // 참고: 이긴 판에서 '보스 직전 포기 ÷ 끝까지(재도전)' — 보스 몫이 끝까지 싸울 이유를 주는지
    const quitVsFinishWon = STAGES.filter((s) => P[s].won).map((s) => {
      const bq = P[s].quits.find((q) => q.kind === '보스 직전 포기');
      return { stage: s, bossQuitCpm: bq?.cpm ?? null, replayCpm: P[s].replay.cpm, ratio: bq ? Math.round((bq.cpm / P[s].replay.cpm) * 100) / 100 : null };
    });
    out.perPolicy[p] = {
      a_firstTwo: seq, a_reachCurrentPrices: reach,
      b_frontier: { quitBestCount: quitWins.length, quitBestAt: quitWins.map((f) => f.N), maxQuitOverPlay: maxRatio.v, maxAtN: maxRatio.N,
                    maxDetail: maxRatio.N ? { quit: maxRatio.quit, play: brief(maxRatio.play) } : null,
                    counts: { normalN: frontier.filter((f) => f.best === 'normalN').length, replay: frontier.filter((f) => f.best === 'replay').length, quit: quitWins.length },
                    rows: frontier },
      c_allOpen: { best: brief(openBest), bestQuit: brief(openBestQuit), bestFullPlay: brief(openBestPlay), easyReplayBest: brief(easy),
                   ratioBestOverEasy: easy ? Math.round((openBest.cpm / easy.cpm) * 100) / 100 : null,
                   ratioBestQuitOverEasy: easy && openBestQuit ? Math.round((openBestQuit.cpm / easy.cpm) * 100) / 100 : null },
      d_stage2LossVsStage1Rewin: d,
      e_lap: { lapWithFirstClear: lap, firstClearSum: Fsum, lapRepeatNoF: lapRepeat, lapSec: round1(lapSec), lapCpm: perMin(lap, lapSec - RESTART_SEC),
               wins: STAGES.filter((s) => P[s].won).length },
      replayCurve, quitVsFinishWon,
    };
  }
  const L = (p) => out.perPolicy[p].e_lap.lapWithFirstClear;
  out.weakOverStrong = { aimLead: Math.round((L('aimLead') / L('evLead')) * 100) / 100, planBoss: Math.round((L('planBoss') / L('evLead')) * 100) / 100 };
  return out;
}
// 한 줄 요약(탐색 기록용)
function digest(e) {
  const pp = (p) => e.perPolicy[p];
  return {
    id: e.id, params: e.params,
    lap: Object.fromEntries(POLICIES.map((p) => [p, pp(p).e_lap.lapWithFirstClear])),
    lapRepeatNoF: Object.fromEntries(POLICIES.map((p) => [p, pp(p).e_lap.lapRepeatNoF])),
    b_quitBestCount: Object.fromEntries(POLICIES.map((p) => [p, pp(p).b_frontier.quitBestCount])),
    b_maxRatio: Object.fromEntries(POLICIES.map((p) => [p, pp(p).b_frontier.maxQuitOverPlay])),
    c_ratio: Object.fromEntries(POLICIES.map((p) => [p, pp(p).c_allOpen.ratioBestOverEasy])),
    a_cum2: Object.fromEntries(POLICIES.map((p) => [p, pp(p).a_firstTwo[1].cumCoins])),
    weakOverStrong: e.weakOverStrong,
  };
}

// ─────────────────────────── 1) H0 재현 확인 ───────────────────────────
const h0 = evaluate(H0);
const h0Dq = evaluate(H0, { dQuitDef: true });   // D 의 그만두기 정의로 D 표 5 재현 확인
const D = JSON.parse(readFileSync(join(HERE, 'D_econ-results.json'), 'utf8'));
const h0Check = {};
for (const p of POLICIES) {
  const dFront = D.derived.frontier[p];
  const dCounts = { normalN: dFront.filter((f) => f.best === 'normalN').length, replay: dFront.filter((f) => f.best === 'replayWon').length,
                    quit: dFront.filter((f) => f.best === 'quitT' || f.best === 'bossQuit').length };
  const dAll = D.derived.perPolicy[p].allStages;
  const dBestQuit = Math.max(dAll.quitBest?.cpm ?? 0, dAll.bossQuitBest?.cpm ?? 0);
  h0Check[p] = {
    lap_F: h0.perPolicy[p].e_lap.lapWithFirstClear, lap_D: D.byPolicy[p].total.all,
    frontierCounts_F_withDquitDef: h0Dq.perPolicy[p].b_frontier.counts, frontierCounts_D: dCounts,
    frontierCounts_F_corrected: h0.perPolicy[p].b_frontier.counts,
    allOpenBestQuitCpm_F: h0Dq.perPolicy[p].c_allOpen.bestQuit.cpm, allOpenBestQuitCpm_D: dBestQuit,
    easyBest_F: h0.perPolicy[p].c_allOpen.easyReplayBest.cpm, easyBest_D: D.derived.perPolicy[p].early_1to5.easyReplayBest.cpm,
  };
}

// ─────────────────────────── 2) 탐색: 기울기·보스 몫·첫 클리어 몫 ───────────────────────────
//  한 변수씩 바꾼다. 각 변형은 v1 을 evLead 한 바퀴 ≈ 1,915(비교용 눈금)가 되게 자동으로 맞춘 뒤 평가한다(비율 지표는 눈금과 무관).
function scaled(spec) {
  const unit = evaluate(budget({ ...spec, v1: 100 }));
  const v1 = Math.round((100 * LAP_ANCHOR / unit.perPolicy.evLead.e_lap.lapWithFirstClear) * 10) / 10;
  return budget({ ...spec, v1 });
}
const sweepSpecs = [];
// (가) 기울기 g: V(24)/V(1) = 1, 2, 3, 6, 12, 24 (κ 0.5, φ 1, ρ 5 고정)
for (const ratio of [1, 2, 3, 6, 12, 24]) sweepSpecs.push({ id: `S-g${ratio}`, label: `기울기 V24/V1=${ratio}`, g: (ratio - 1) / 23, kappa: 0.5, phi: 1, rho: 5 });
// (나) 보스 몫 κ: 0, 0.25, 1, 2 (V24/V1=3)
for (const kappa of [0, 0.25, 1, 2]) sweepSpecs.push({ id: `S-k${kappa}`, label: `보스 몫 κ=${kappa}`, g: 2 / 23, kappa, phi: 1, rho: 5 });
// (다) 첫 클리어 몫 φ: 0, 0.5, 2, 4 (V24/V1=3)
for (const phi of [0, 0.5, 2, 4]) sweepSpecs.push({ id: `S-f${phi}`, label: `첫 클리어 몫 φ=${phi}`, g: 2 / 23, kappa: 0.5, phi, rho: 5 });
// (라) 재클리어 R: 0, 20 (V24/V1=3)
for (const rho of [0, 20]) sweepSpecs.push({ id: `S-r${rho}`, label: `재클리어 R=${rho}`, g: 2 / 23, kappa: 0.5, phi: 1, rho });
const sweep = sweepSpecs.map((sp) => digest(evaluate(scaled(sp))));

// ─────────────────────────── 3) 최종 후보(정수로 다듬은 단순한 식) ───────────────────────────
//  V(s) = a + b × s 꼴로 다듬었다(탐색에서 고른 기울기를 정수로). 각 후보의 수치는 탐색 결과를 보고 정했다(F_summary.md 참고).
const FINALS = [
  budget({ id: 'P1', label: '평탄 예산', v1: 50, g: 0, kappa: 0.5, phi: 1, rho: 5, vText: '50(모든 판 같음)' }),
  budget({ id: 'P2', label: '완만 증가 예산(V24≈V1×2.8)', v1: 26, g: 2 / 26, kappa: 0.5, phi: 1, rho: 5, vText: '24+2s' }),
  budget({ id: 'P3', label: '첫 클리어 중심', v1: 11, g: 1 / 11, kappa: 0.5, phi: 4, rho: 5, vText: '10+s' }),
];
const finals = FINALS.map((c) => evaluate(c));

const out = {
  meta: {
    script: 'F_budget-eval.mjs', input: 'F_budget-events.json', generatedAt: new Date().toISOString(),
    note: '봇 측정(정해진 입력, 한 판씩) + 후보 공식. 사람의 수입이 아니다. 판 사이 이동·재시작 5초는 가정. 8번 보너스전 코인 제외(시간도 뺌), 랜덤 길(3·12번)은 기본 시드 하나만.',
    restartSecAssumed: RESTART_SEC, quitT: T_LIST, lapAnchorForScaleOnly: LAP_ANCHOR,
    quitDefinition: 'T초 포기는 T×60 STEP < 본전투 끝 STEP 일 때만(D 는 보너스전 중 포기도 포함 — 8번 45·60초 칸). 보스 직전 포기 = 보스 첫 등장 STEP.',
    paths: '정상 도전 = 끝까지(승리 시 F). 재도전 = 이긴 판을 끝까지(R, F 없음). 순차 해금 (b) 는 D 와 같이 "1..N 이 열려 있고 N 을 아직 못 깬 상태"를 N 마다 가정(봇이 실제로 N 까지 못 가는 경우도 포함).',
  },
  h0Check,
  H0: h0,
  sweep,
  finals,
};
writeFileSync(join(HERE, 'F_budget-eval.json'), JSON.stringify(out, null, 1));

// ── 콘솔 요약 ──
console.log('H0 check', JSON.stringify(h0Check, null, 0));
console.log('\nSWEEP');
for (const s of sweep) console.log(s.id, JSON.stringify(s.params), 'lap', JSON.stringify(s.lap), 'rep', JSON.stringify(s.lapRepeatNoF), 'bQ', JSON.stringify(s.b_quitBestCount), 'bMax', JSON.stringify(s.b_maxRatio), 'c', JSON.stringify(s.c_ratio), 'a2', JSON.stringify(s.a_cum2), 'w/s', JSON.stringify(s.weakOverStrong));
console.log('\nFINALS');
for (const e of [h0, ...finals]) { const s = digest(e); console.log(s.id, 'lap', JSON.stringify(s.lap), 'rep', JSON.stringify(s.lapRepeatNoF), 'bQ', JSON.stringify(s.b_quitBestCount), 'bMax', JSON.stringify(s.b_maxRatio), 'c', JSON.stringify(s.c_ratio), 'a2', JSON.stringify(s.a_cum2), 'w/s', JSON.stringify(s.weakOverStrong)); }
