// B_gate-removal.mjs — 검토 3번(메인 로봇 보호 규칙) 증거 스크립트. 읽기 전용: rush3 를 import 만 하고 고치지 않는다.
// 실행: node "E:\workspace\claude\neon-fleet\worktrees\v3-lastwar\newmode\v3\review3\evidence\B_gate-removal.mjs"
// 결과: 같은 폴더 B_gate-removal.json
//
// 무엇을 보는가
//  A. formation(5) 의 자리(dx, dy) — 누가 '뒤'(dy 큰 쪽)인지
//  B. 지금 코드의 게이트 감소(gates.passGateRow → squad.removeUnits(…, 'back'))를 실제 함수로 돌려
//     "누가 빠지는가"를 기록하고, 검토자 권고 규칙(일반 병사 먼저, 감소량 ≥ 전체 병력이면 로봇까지 제거)과 비교
//  C. 병력 N = 1..100 에서 '지금 코드가 로봇(처음 유닛 id 1)을 빼기 시작하는 최소 감소량'과 권고 규칙(N)의 차이
//  D. 실제 stepRun 경로: 1번 판 'left' 고정 정책(−9 칸 통과), 랜덤 길 확정 −10 함정(3번·12번 판)
//  ※ '로봇' = createRun 이 처음 만든 유닛(id 1). 지금 코드에는 규칙상 로봇 표시가 없고 화면은 배열 0번을 로봇 그림으로 그린다.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { formation, makeUnit, layoutUnits, removeUnits } from '../../../../rush3/squad.js';
import { makeGateRow, passGateRow } from '../../../../rush3/gates.js';
import { buildStage, lotteryPick } from '../../../../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../../../../rush3/combat.js';
import { BAL3 } from '../../../../rush3/balance.js';
import { pickInput } from '../../../../tests/lib/rush3-policies.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const out = { script: 'B_gate-removal.mjs', note: '로봇 = 처음 만든 유닛(id 1). 봇/고정 정책 결과는 정해진 입력으로 한 판씩 돌린 결과이며 사람의 성공률이 아니다.' };

// ---------- A. formation(5) ----------
out.formation5 = formation(5).map((p, i) => ({ index: i, dx: p.dx, dy: p.dy, role: i === 0 ? '로봇 자리(0,0)' : '병사' }));

// ---------- B. 지금 코드 vs 권고 규칙 ----------
function makeSquad(n) {
  const units = [];
  for (let i = 0; i < n; i++) units.push(makeUnit(i + 1, 0.5));
  layoutUnits(units);
  return { units, nextUnitId: n + 1, x: 160, tx: 160, z: 1000, prevZ: 999 };
}
function gateCase(n, k) {
  const run = makeSquad(n);
  const before = run.units.map((u, i) => ({ id: u.id, index: i, dy: u.dy }));
  const row = makeGateRow({ id: 'gTest', z: 1000, armZ: null, cells: [{ x0: 80, x1: 240, value: -k }] });
  const ev = [];
  passGateRow(row, run, ev);
  const afterIds = run.units.map((u) => u.id);
  const removed = before.filter((b) => !afterIds.includes(b.id));
  const heroAlive = afterIds.includes(1);
  // 권고 규칙(검토문 01 §3 L43): 일반 병사 먼저, 감소량 ≥ 전체 병력이면 로봇까지 제거되어 패배
  const recRemain = Math.max(0, n - k);
  const recHeroAlive = k < n;
  return {
    n, k,
    now: {
      removedCount: removed.length,
      removed: removed.map((r) => `id${r.id}(dy ${r.dy})`),
      remainIds: afterIds,
      remainCount: afterIds.length,
      heroAlive,
      drawnAsHeroAfter: afterIds.length ? `id${afterIds[0]}` + (afterIds[0] === 1 ? '(원래 로봇)' : '(병사가 로봇 그림을 이어받음)') : '없음',
      lose: afterIds.length === 0,
      gatePassEvent: ev.find((e) => e.type === 'gatePass'),
    },
    recommended: { remainCount: recRemain, heroAlive: recHeroAlive, lose: recRemain === 0 },
    same: (afterIds.length === recRemain) && (heroAlive === recHeroAlive),
  };
}
const CASES = [[5, 3], [5, 4], [5, 5], [5, 6], [1, 9], [2, 9], [3, 2], [6, 5], [10, 10], [11, 10], [12, 10], [15, 10], [20, 10], [68, 10], [69, 10]];
out.gateCases = CASES.map(([n, k]) => gateCase(n, k));

// ---------- C. N = 1..100: 지금 코드가 로봇을 빼기 시작하는 최소 감소량 ----------
const sweep = [];
for (let n = 1; n <= 100; n++) {
  let kHero = null;
  for (let k = 1; k <= n; k++) {
    const run = makeSquad(n);
    removeUnits(run.units, k, 'back');
    if (!run.units.some((u) => u.id === 1)) { kHero = k; break; }
  }
  const f = formation(n);
  const front = f.filter((p) => p.dy < 0).length;           // 로봇(dy 0)보다 앞(dy 음수)에 선 병사 수
  const tie0 = f.filter((p, i) => i > 0 && p.dy === 0).length; // dy 0 동률 병사(동률이면 index 큰 쪽이 먼저 빠짐 → 로봇이 동률 중 마지막)
  sweep.push({ n, frontSoldiers: front, dy0Soldiers: tie0, nowHeroRemovedAtK: kHero, recommendedHeroRemovedAtK: n, gap: n - kHero });
}
out.heroRemovalThreshold = {
  explain: 'nowHeroRemovedAtK = 지금 코드(removeUnits back)에서 로봇(id 1)이 처음 빠지는 감소량. 권고 규칙은 n(전원 제거일 때만). gap = 두 규칙이 갈리는 감소량 폭 = 로봇 앞에 선 병사 수',
  rows: sweep,
  gapAlwaysEqualsFrontSoldiers: sweep.every((r) => r.gap === r.frontSoldiers),
};

// ---------- D. 실제 stepRun 경로 ----------
function trackRun(id, policy, difficulty, lotterySeed, maxSteps = 14400) {
  const stage = buildStage(id, { difficulty, lotterySeed });
  const run = createRun(stage);
  const heroId = run.units.length ? run.units[0].id : null;
  const gates = [];
  let heroLost = null, steps = 0, lose = false, win = false;
  while (!run.over && steps < maxSteps) {
    const nBefore = run.units.length;
    const idsBefore = run.units.map((u) => u.id);
    stepRun(run, pickInput(policy, run), STEP);
    const evs = drainEvents(run);
    for (const e of evs) {
      if (e.type === 'gatePass') {
        gates.push({ row: e.id, value: e.value, applied: e.applied, unitsBeforeStep: nBefore, unitsAfter: run.units.length,
                     heroAliveAfter: run.units.some((u) => u.id === heroId), isLotteryRow: !!(run.lottery && run.lottery.rowId === e.id) });
      }
      if (e.type === 'lose') lose = true;
      if (e.type === 'win') win = true;
    }
    if (!heroLost && idsBefore.includes(heroId) && !run.units.some((u) => u.id === heroId)) {
      const hurt = evs.filter((e) => e.type === 'hurt' && e.unitId === heroId).map((e) => e.cause);
      const gp = evs.find((e) => e.type === 'gatePass' && e.applied < 0);
      heroLost = { t: +run.time.toFixed(2), cause: hurt.length ? hurt.join('+') : (gp ? 'gate' : 'unknown'), unitsLeft: run.units.length };
    }
    steps++;
  }
  return { stage: id, policy, difficulty, lotterySeed: lotterySeed ?? 'default', lottery: run.lottery ? { pick: run.lottery.pick, rowId: run.lottery.rowId } : null,
           startUnits: stage.startUnits, win, lose, time: +run.time.toFixed(2), units: run.units.length, heroLost, gates };
}

// D-1. 1번 판: 'left'(x 160) 고정 → 첫 +1 칸(x 240~400)을 피하고 −9 칸(x 80~240)을 지난다
out.stage1Left = ['normal', 'brutal'].map((d) => trackRun(1, 'left', d));

// D-2. 랜덤 길 확정 −10 함정: lotteryPick 이 trapGate 를 고르는 시드를 찾는다(결정적 탐색)
let trapSeed = null;
for (let s = 1; s < 100000; s++) { if (lotteryPick(s).entry.id === 'trapGate') { trapSeed = s; break; } }
out.trapSeed = trapSeed;
out.lotteryPool = BAL3.lottery.pool.map((p) => ({ id: p.id, kind: p.kind, value: p.value ?? null, maxValue: p.maxValue ?? null }));
// 오른쪽 통로(랜덤 길)를 지나는 고정 정책 'right'(x 320) — 3번·12번 판
out.trapRuns = [];
for (const id of [3, 12]) for (const d of ['normal', 'brutal']) out.trapRuns.push(trackRun(id, 'right', d, trapSeed));

// D-3. 함정 −10 을 실제 passGateRow 로 여러 병력에서(3번 판 buildStage 가 만든 행 그대로 사용)
{
  const st = buildStage(3, { difficulty: 'brutal', lotterySeed: trapSeed });
  const rowDef = st.gateRows.find((r) => r.id === st.lottery.rowId);
  out.trapRowDef = rowDef;
  out.trapDirect = [1, 5, 9, 10, 11, 15, 30, 68].map((n) => {
    const run = makeSquad(n);
    const row = makeGateRow(rowDef);
    row.armed = true;
    run.prevZ = row.z - 1; run.z = row.z; run.x = 330;
    const ev = [];
    passGateRow(row, run, ev);
    const ids = run.units.map((u) => u.id);
    return { n, remain: ids.length, heroAlive: ids.includes(1), lose: ids.length === 0,
             recommendedRemain: Math.max(0, n - 10), recommendedHeroAlive: 10 < n };
  });
}

writeFileSync(join(here, 'B_gate-removal.json'), JSON.stringify(out, null, 2));

// 콘솔 요약
console.log('formation(5):', out.formation5.map((p) => `#${p.index}(${p.dx},${p.dy})`).join(' '));
for (const c of out.gateCases) {
  console.log(`N${c.n} −${c.k}: 지금 → 남은 ${c.now.remainCount}명 [${c.now.remainIds.join(',')}] 로봇생존 ${c.now.heroAlive} 빠짐 ${c.now.removed.join(' ')} | 권고 → 남은 ${c.recommended.remainCount} 로봇생존 ${c.recommended.heroAlive} | 같음 ${c.same}`);
}
console.log('gap == 앞줄 병사 수(1..100):', out.heroRemovalThreshold.gapAlwaysEqualsFrontSoldiers);
console.log('N별 지금 코드 로봇 제거 시작 감소량(일부):', sweep.filter((r) => [1, 2, 3, 4, 5, 6, 8, 10, 15, 20, 30, 50, 68, 100].includes(r.n)).map((r) => `N${r.n}:k${r.nowHeroRemovedAtK}(앞${r.frontSoldiers})`).join(' '));
for (const r of out.stage1Left) console.log('S1 left', r.difficulty, 'win', r.win, 'lose', r.lose, 'gates', JSON.stringify(r.gates), 'heroLost', JSON.stringify(r.heroLost));
console.log('trapSeed', trapSeed);
for (const r of out.trapRuns) console.log(`S${r.stage} right ${r.difficulty} lottery ${JSON.stringify(r.lottery)} win ${r.win} lose ${r.lose} t ${r.time} units ${r.units} heroLost ${JSON.stringify(r.heroLost)} lotteryGate ${JSON.stringify(r.gates.filter((g) => g.isLotteryRow))}`);
for (const r of out.trapDirect) console.log(`trap −10 N${r.n}: 지금 남은 ${r.remain} 로봇 ${r.heroAlive} 패배 ${r.lose} | 권고 남은 ${r.recommendedRemain} 로봇 ${r.recommendedHeroAlive}`);
