// tests/lib/rush3-policies.mjs — rush3 정책 봇 8종(계약서 8장 V3-SIM-POLICY · 개정 r3 §5-2).
//  검사 여러 개가 같은 정책 정의를 쓰므로 한 곳에 둔다. 규칙 코드는 건드리지 않는다(읽기 전용 · stepRun 그대로).
import { createRun, stepRun, drainEvents, STEP } from '../../rush3/combat.js';
import { buildStage } from '../../rush3/stages.js';
import { targetX } from '../../rush3/bonus.js';
import { BAL3 } from '../../rush3/balance.js';

/** 탐욕 봇(aim): 가장 가까운(z 최소) 미획득 통·발판·게이트의 **현재 값이 큰 칸** 차선으로 이동.
 *  ⚠️게이트 칸을 '지금 값'으로 고르므로 상한이 큰 음수 칸(예: −25 → +40)을 절대 고르지 않는다 — POL-8 의 구분 축. */
export function botAim(run) {
  let best = null, bz = Infinity;
  for (const s of run.supplies) {
    if (s.missed || s.skipped) continue;
    for (const p of s.pads) if (!p.taken && p.z > run.z && p.z < bz) { bz = p.z; best = p.x; }
    if ((s.opened && s.kind !== 'chain') || s.locked) continue;
    if (s.z > run.z && s.z < bz) { bz = s.z; best = s.x; }
  }
  for (const row of run.gateRows) {
    if (row.passed || row.z <= run.z || row.z >= bz) continue;
    let c = null;
    for (const k of row.cells) if (!c || k.value > c.value) c = k;
    bz = row.z;
    best = c.value < 0 && row.bypass ? (c.x0 === 80 ? 320 : 160) : (c.x0 + c.x1) / 2;
  }
  return best;
}

/** 계획 봇(plan): 설계가 의도한 경로를 그대로 따르는 결정적 스크립트(구간별 목표 x, 무작위 없음).
 *  탐욕 봇과 달리 "지금 손해를 감수하고 상한이 큰 칸을 연다"를 할 수 있다. */
export const PLAN = {
  //  S1 은 계획 여지가 없다(입문 안전 경로 = 무조작과 같은 x240)
  1: [[0, Infinity, 240]],
  //  S2: 좌 게이트 +3 → 분리벽 좌 통로(병사 3) → 두 번째 게이트 우 칸(−20) 도전 → z5800 좌 통
  2: [[0, 3000, 120], [3000, 5400, 320], [5400, 5900, 150], [5900, Infinity, 240]],
  //  S3: 초반 통 3개 → wA 좌(연속증원) → wB 좌(기관총) → z3900 통을 깨고 → z4000 우 칸(−25)을 상한까지 → wD 좌(병사 10)
  3: [[0, 1100, 160], [1100, 1500, 320], [1500, 1900, 160], [1900, 3550, 150],
      [3550, 3760, 150], [3760, 4000, 320], [4000, 5940, 150], [5940, 6400, 150], [6400, Infinity, 240]],
};
export function botPlan(run) {
  for (const [z0, z1, x] of PLAN[run.stageId] || PLAN[1]) if (run.z >= z0 && run.z < z1) return x;
  return 240;
}

/** 보스 조준 봇(planBoss): 정예(run.boss)가 나타나기 전은 계획 봇과 완전히 같고, 나타나면 보스의 현재 x 를 따라간다.
 *  ⚠️조작은 pointerX 하나뿐이라 이동은 실제 STEP 의 이동 속도 제한을 그대로 받는다 — 탄 회피를 최적화한 봇이 아니다.
 *  2차 검수(2026-09-17 §4 Q3)가 시험한 'bossFollow' 변형과 같은 조작이며, 정예전 성공 경로가 존재하는지만 본다. */
//  r3.15 보너스전: 승리 확정 뒤(run.phase === 'bonus')는 살아 있는 표적 중 부대에 가장 가까운(|t.x − run.x| 최소) 것을 고르고,
//   탄이 닿을 때(비행시간 dz ÷ (탄 속도 − 전진 속도))의 x 를 targetX 로 미리 계산해 그 자리로 간다(현재 x 를 쫓으면 왕복 표적을 늘 놓친다).
//   승리·peak·완주 판정은 이미 끝난 뒤라 SD-7~9 에 영향 없음 — 점수 실측(tiers 보정 근거)만 의미 있어진다. 분기 순서 = bonus → 보스 별칭 → plan
export function botPlanBoss(run) {
  if (run.phase === 'bonus') {
    const vz = (BAL3.weapons[run.weapon] ?? BAL3.weapons.rifle).vz;
    let best = null, bd = Infinity;
    for (const t of run.bonusTargets || []) {
      if (!t.alive) continue;
      const d = Math.abs(t.x - run.x);
      if (d < bd) { bd = d; best = targetX(t, run.bonus.t + t.dz / Math.max(1, vz - BAL3.scroll)); }
    }
    return best ?? run.x;
  }
  return run.boss ? run.boss.x : botPlan(run);
}

//  ⚠️planBoss 는 아래 POLICIES 목록에 넣지 않는다. 24판 표(V3-SIM-POLICY)·27판 표(V3-SIM-DIFF)는 기존 판 수와 의미를 그대로 두고,
//   성공 경로 검사(SD-7)만 이 정책을 따로 부른다.
export const POLICIES = ['center', 'center-1', 'center+1', 'left', 'right', 'sway', 'aim', 'plan'];
//  고정 정책 5종(POL-7 의 '조합 금지' 대상)
export const FIXED_POLICIES = ['center', 'center-1', 'center+1', 'left', 'right'];

export function pickX(policy, run) {
  switch (policy) {
    case 'center': return 240;
    case 'center-1': return 239;
    case 'center+1': return 241;
    case 'left': return 160;
    case 'right': return 320;
    case 'sway': return Math.floor(run.time / 3) % 2 ? 160 : 320;
    case 'aim': return botAim(run);
    case 'plan': return botPlan(run);
    case 'planBoss': return botPlanBoss(run);
    default: throw new Error('unknown policy ' + policy);
  }
}

//  무기 초당 dmg(화력 지수 계산용 — 생존 병력 × 이 값)
export const DPS = { rifle: 2, auto: 4, heavy: 5 };

/** 한 판. 상한 14,400 STEP(4분). 반환 = { run, opened, gates, events }. difficulty 생략 = normal(종전과 같은 판)
 *  lotterySeed 생략 = stages.LOTTERY_DEFAULT_SEED(랜덤 길 기준선) — 기존 24판·27판 검사는 그대로 이 경로를 쓴다. */
export function playPolicy(id, policy, maxSteps = 14400, difficulty = 'normal', lotterySeed) {
  const run = createRun(buildStage(id, { difficulty, lotterySeed }));
  const opened = [], gates = [], events = {};
  let steps = 0;
  while (!run.over && steps < maxSteps) {
    stepRun(run, { pointerX: pickX(policy, run), dragDx: 0, keyDir: 0 }, STEP);
    for (const e of drainEvents(run)) {
      events[e.type] = (events[e.type] || 0) + 1;
      if (e.type === 'supplyOpen') opened.push(e.id);
      if (e.type === 'gatePass') gates.push({ id: e.id, value: e.value, applied: e.applied, idx: e.idx });
    }
    steps++;
  }
  return { run, opened, gates, events, steps, power: run.units.length * (DPS[run.weapon] ?? 2) };
}
