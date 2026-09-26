// tests/lib/rush3-policies.mjs — rush3 정책 봇 8종(계약서 8장 V3-SIM-POLICY · 개정 r3 §5-2).
//  검사 여러 개가 같은 정책 정의를 쓰므로 한 곳에 둔다. 규칙 코드는 건드리지 않는다(읽기 전용 · stepRun 그대로).
import { createRun, stepRun, drainEvents, STEP } from '../../rush3/combat.js';
import { buildStage } from '../../rush3/stages.js';
import { targetX } from '../../rush3/bonus.js';
import { BAL3 } from '../../rush3/balance.js';
import { vehicleX } from '../../rush3/supply.js';
import { weaponStats } from '../../rush3/weapons.js';

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
//  r3.17 아레나: 광장(run.phase === 'arena')에서는 후보 9점(x {100, 240, 380} × ay {d0, (d0+d1)/2, d1}) 중 **위협에서 가장 먼** 점으로 간다.
//   위협점 = 보스가 warn/dash 중이면 돌진 목표(dashTx, dashTz), 아니면 보스 위치. 동률은 index 순(결정적). 반환 { x, ay }.
//   ⚠️pointerX 만 쓰는 pickX 호출부(캡처 스크립트·셸 검사)는 x 만 받고, 세로는 pickInput 이 dragDy 로 넘긴다
export function botArena(run) {
  const bo = run.boss;
  const [d0, d1] = run.arena.depth;
  const tx = bo && (bo.state === 'warn' || bo.state === 'dash') && bo.dashTx != null ? bo.dashTx : (bo ? bo.x : run.x);
  const tz = bo && (bo.state === 'warn' || bo.state === 'dash') && bo.dashTz != null ? bo.dashTz : (bo ? bo.z : run.z);
  let best = null, bd = -1;
  for (const ay of [d0, (d0 + d1) / 2, d1]) {
    for (const x of [100, 240, 380]) {
      const d = Math.hypot(x - tx, (run.z - ay) - tz);
      if (d > bd) { bd = d; best = { x, ay }; }
    }
  }
  return best;
}

/** 차량 선행 조준 봇(lead, r3.18 대항 검수 반영): 화면에 든(moveT !== null) 가장 가까운 미개봉 차량 통에 대해, 탄이 닿을 때(비행시간 dz ÷ (탄 속도 − 전진 속도))의
 *  통 x 를 vehicleX 로 미리 계산해 그 자리로 간다. 차량이 없으면 240. '갈 자리에 미리 서라'를 기계적으로 따르는 봇 — 내구 재산정의 기준(무입력·현재 위치 추종은 못 열고 이 봇만 연다) */
export function botVehicleLead(run) {
  let s = null;
  for (const c of run.supplies) if (c.move && !c.opened && !c.missed && !c.skipped && c.z > run.z && c.z - run.z <= 760 && (!s || c.z < s.z)) s = c;
  if (!s || s.moveT === null) return 240;
  const w = weaponStats(run.weapon, run.weaponMk || 1);
  return vehicleX(s.move, s.homeX, s.moveT + (s.z - run.z) / Math.max(1, w.vz - BAL3.scroll));
}

//  ⚠️PLAN 은 1~3 뿐이다 — 4~24 의 planBoss 는 **정예 전 무입력(x240 고정) + 정예 뒤 보스 추종**이다(botPlan 이 PLAN[1] 로 폴백). 4~24 의 '이길 수 있는 조작이 있는가'는
//   아래 botAimLead·botEvLead(V3-DIFFB DB-7b)로 따로 본다. 보고서 difficulty-b-20260920 §2 범례와 같은 뜻.
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
  //  분기 순서(다섯 장치 통일 규칙 13): bonus → arena → 보스 별칭 → plan
  if (run.phase === 'arena' && run.boss) return botArena(run).x;
  return run.boss ? run.boss.x : botPlan(run);
}

//  ─── 4~24 성공 경로 봇(r3.21 대항 검수 반영). 정예 뒤·광장·보너스는 planBoss 와 완전히 같고, **정예 전**만 다르다.
//   aimLead = 화면에 든(moveT !== null) 미개봉 차량 통이 있으면 lead(갈 자리에 미리 서기), 없으면 aim(가장 가까운 통·발판·게이트의 **지금 값** 큰 칸). 대항 검수가 돌린 봇과 같은 조작.
//   evLead  = aimLead 와 같되 게이트 칸을 **예상 최종값** = min(칸 상한, 지금 값 + 활성 구간(armZ ÷ 전진 속도 초) 동안의 예상 명중 수)로 고른다 —
//             설계 의도('음수 칸을 끝까지 올리면 옆 양수 칸보다 크다')를 기계적으로 따르는 봇. 명중 수 = 병력 × 발/발사 × (구간 초 ÷ 발사 간격) × 칸 안 비율(GATE_HIT_FRAC).
//             예상 최종값이 전부 음수이고 우회로(bypass)가 있으면 우회. 동률은 현재 x 에 가까운 칸.
//   ⚠️둘 다 회피를 최적화한 봇이 아니다(pointerX 하나·실제 STEP 이동 제한). 결정적 1판 = 사람의 성공률이 아니다.
const GATE_HIT_FRAC = 0.8;
function nearestVehicle(run) {
  let s = null;
  for (const c of run.supplies) if (c.move && !c.opened && !c.missed && !c.skipped && c.z > run.z && c.z - run.z <= 760 && (!s || c.z < s.z)) s = c;
  return s && s.moveT !== null ? s : null;
}
//  r4.4 (b) 로봇 강화(run.heroUp): 다연발의 추가 탄은 게이트를 올리지 않으므로(gateHit 0, 이사님 결정 N3) 세지 않고 **원래 탄만** 센다.
//   연사 강화는 로봇의 원래 탄 수를 늘리므로 그 몫(fan × 구간 초 ÷ 간격 × (1/간격 배수 − 1))만 더한다. 강화 0 판(heroUp null)은 종전 식 그대로
//   — 식을 (n−1)·x + x 처럼 나눠 쓰면 마지막 자리가 달라져 동률 칸 선택이 뒤집힐 수 있어, 종전 값에 0 을 더하는 꼴로 둔다
export function expectedGateHits(run, row) {
  const w = weaponStats(run.weapon, run.weaponMk || 1);
  const fan = w.fan ?? 1;
  const armSec = (row.armZ == null ? BAL3.enterZ : Math.min(row.armZ, Math.max(0, row.z - run.z))) / BAL3.scroll;
  const base = run.units.length * fan * (armSec / w.interval) * GATE_HIT_FRAC;
  const hu = run.heroUp;
  if (!hu || hu.intervalMul === 1 || !run.units.some((u) => u.hero)) return base;
  return base + fan * (armSec / w.interval) * (1 / hu.intervalMul - 1) * GATE_HIT_FRAC;
}
export function botEvLead(run) {
  if (run.boss || run.phase === 'bonus' || run.phase === 'arena') return botPlanBoss(run);
  if (nearestVehicle(run)) return botVehicleLead(run);
  let best = null, bz = Infinity;
  for (const s of run.supplies) {
    if (s.missed || s.skipped) continue;
    for (const p of s.pads) if (!p.taken && p.z > run.z && p.z < bz) { bz = p.z; best = p.x; }
    if ((s.opened && s.kind !== 'chain') || s.locked) continue;
    if (s.z > run.z && s.z < bz) { bz = s.z; best = s.x; }
  }
  for (const row of run.gateRows) {
    if (row.passed || row.z <= run.z || row.z >= bz) continue;
    const hits = expectedGateHits(run, row);
    let c = null, cv = -Infinity, cd = Infinity;
    for (const k of row.cells) {
      const v = Math.min(k.maxValue, k.value + hits), d = Math.abs((k.x0 + k.x1) / 2 - run.x);
      if (v > cv || (v === cv && d < cd)) { c = k; cv = v; cd = d; }
    }
    bz = row.z;
    best = cv < 0 && row.bypass ? (c.x0 === 80 ? 320 : 160) : (c.x0 + c.x1) / 2;
  }
  return best ?? 240;
}
export function botAimLead(run) {
  if (run.boss || run.phase === 'bonus' || run.phase === 'arena') return botPlanBoss(run);
  if (nearestVehicle(run)) return botVehicleLead(run);
  return botAim(run) ?? 240;
}
//  정예 뒤가 planBoss 와 같은 정책(광장에서 dragDy 도 넘긴다)
const BOSS_LIKE = new Set(['planBoss', 'lead', 'aimLead', 'evLead']);

/** 정책 → STEP 입력(r3.17). planBoss 가 광장에 있으면 botArena 의 x 를 pointerX 로, ay 를 dragDy(= 목표 − 현재 tay)로 넘긴다.
 *  그 밖의 정책·구간은 종전 `{ pointerX, dragDx: 0, keyDir: 0 }` 그대로(24판·27판 표·SD-7~9 불변 — combat 은 빠진 칸을 0 으로 읽는다)
 *  r3.21: aimLead·evLead·lead 도 광장에서는 planBoss 와 같은 입력(정예 뒤는 planBoss 별칭이라 x 만 같고 dragDy 가 빠지면 광장 회피가 안 된다) */
export function pickInput(policy, run) {
  if (BOSS_LIKE.has(policy) && run.phase === 'arena' && run.boss) {
    const c = botArena(run);
    return { pointerX: c.x, dragDx: 0, keyDir: 0, dragDy: c.ay - run.tay, keyDirY: 0 };
  }
  return { pointerX: pickX(policy, run), dragDx: 0, keyDir: 0 };
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
    //  r3.18: 차량 선행 조준(POLICIES 목록엔 넣지 않는다 — 24판·27판 표 불변). 정예 뒤는 planBoss 와 같다
    case 'lead': return run.boss ? botPlanBoss(run) : botVehicleLead(run);
    //  r3.21 대항 검수 반영: 4~24 성공 경로 봇 2종(POLICIES 목록엔 넣지 않는다)
    case 'aimLead': return botAimLead(run);
    case 'evLead': return botEvLead(run);
    default: throw new Error('unknown policy ' + policy);
  }
}

//  r4.7 셸 흐름 검사 도구: 보스가 나오면 체력을 hp 로 깎는다(살아 있는 보스 전부). 보스 체력 바닥(BAL3.bossMinFightSec × 상한 화력, r4.7)으로
//   봇이 게임 줄 1번을 더는 이기지 못해, '이긴 판'이 필요한 셸 검사(정산·결과 화면·해금·기록)가 이 도구로 승리를 만든다.
//   난이도 판단과 무관하다 — 규칙은 그대로 두고 run 의 보스 체력 값만 바꾼다(캡처 스크립트의 강제 승리와 같은 계열, 승리 이벤트는 규칙이 낸다)
export function weakenBosses(run, hp = 1) {
  for (const b of (run && run.bosses) || []) if (!b.dead && b.hp > hp) b.hp = hp;
}

//  r4.7 (c) 셸 흐름 검사 도구: 현상금 적이 나오면 체력을 hp 로 깎는다. 현상금 적(게임 줄 전용, 상한 부대 기준 체력)이 부대를 덮쳐
//   병력이 크게 줄면 그 뒤를 보는 검사(랜덤 길 소리 등)가 그 자리까지 가지 못한다 — 규칙은 그대로 두고 run 의 값만 바꾼다(난이도와 무관)
export function weakenBounties(run, hp = 1) {
  for (const e of (run && run.enemies) || []) if (e.kind === 'bounty' && !e.dead && e.hp > hp) e.hp = hp;
}

//  r4.10 셸 흐름 검사 도구: 부대를 전멸시켜 '진 판'을 만든다(다음 STEP 에 규칙이 병력 0 → 패배를 낸다). 게임 줄 대물결 판(1·4·7·…)은
//   봇이 결승선을 넘어 이기는 일이 잦아, 패배 흐름(정산·결과 화면·Enter)을 보는 검사가 이 도구로 패배를 만든다 — 규칙은 그대로 두고 run 의 값만 바꾼다(난이도와 무관)
export function wipeSquad(run) {
  for (const u of (run && run.units) || []) u.hp = 0;
}

//  무기 초당 dmg(화력 지수 계산용 — 생존 병력 × 이 값)
export const DPS = { rifle: 2, auto: 4, heavy: 5 };

/** 한 판. 상한 14,400 STEP(4분). 반환 = { run, opened, gates, events }. difficulty 생략 = normal(종전과 같은 판)
 *  lotterySeed 생략 = stages.LOTTERY_DEFAULT_SEED(랜덤 길 기준선) — 기존 24판·27판 검사는 그대로 이 경로를 쓴다.
 *  runOpts(r4.4) = createRun 옵션(heroGuard·up 등). 생략 = 옵션 없이 만든 판(종전과 같은 판 — 기존 검사는 전부 이 경로) */
export function playPolicy(id, policy, maxSteps = 14400, difficulty = 'normal', lotterySeed, runOpts) {
  const run = createRun(buildStage(id, { difficulty, lotterySeed }), runOpts);
  const opened = [], gates = [], events = {};
  let steps = 0;
  while (!run.over && steps < maxSteps) {
    stepRun(run, pickInput(policy, run), STEP);
    for (const e of drainEvents(run)) {
      events[e.type] = (events[e.type] || 0) + 1;
      if (e.type === 'supplyOpen') opened.push(e.id);
      if (e.type === 'gatePass') gates.push({ id: e.id, value: e.value, applied: e.applied, idx: e.idx });
    }
    steps++;
  }
  return { run, opened, gates, events, steps, power: run.units.length * (DPS[run.weapon] ?? 2) };
}
