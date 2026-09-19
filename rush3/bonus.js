// rush3/bonus.js — 보너스전(r3.15, 실게임 구현계획 B-1 장치 4 · 01 §5-9 "승리 후 시간제 보너스"). 순수 규칙만(난수·화면·시계·balance 없음).
//  본전투 승리가 확정된 뒤 남은 군단으로 sec 초 동안 움직이는 표적을 맞혀 점수·보상 단계를 올린다.
//  ⚠️본전투 완료는 진입 시점에 이미 확정(run.won·wonAt·mainResult)돼 있다 — 여기서는 승패를 건드리지 않고 점수만 쌓는다.
//  표적 t = { id: 't1'.., dz, x0, x1, period, phase, hp, max, value, respawn, r, x, z, px, pz, alive, respawnT }
//   dz     = 부대 앞 고정 거리(px). z 는 항상 run.z + dz(부대와 함께 전진 = 화면 y 고정)
//   x0~x1  = 옆으로 왕복하는 범위(px), period = 왕복 1회 초, phase = 0~1 위상(빌드 데이터)
//   hp/max = 내구(직격만 유효), value = 파괴 시 점수, respawn = 파괴 뒤 재등장까지 초
//  run.bonus = { t, sec, score, tier, hits } · run.bonusDef = { sec, tiers, targets }(buildStage 사본)
//  이벤트: bonusStart · bonusTargetHit · bonusHit · bonusRespawn · bonusTier · bonusEnd(모두 셸 연출용, 규칙은 읽지 않는다)
import { triWave } from './motion.js';

// 표적 런타임 생성(빌드 정의 → 판 상태). 호출마다 새 객체
export function makeTarget(def, runZ = 0) {
  const t = {
    id: def.id, dz: def.dz, x0: def.x0, x1: def.x1, period: def.period, phase: def.phase ?? 0,
    hp: def.hp, max: def.max ?? def.hp, value: def.value, respawn: def.respawn ?? 0.5, r: def.r,
    x: 0, z: runZ + def.dz, px: 0, pz: runZ + def.dz, alive: true, respawnT: 0,
  };
  t.x = targetX(t, 0);
  t.px = t.x;
  return t;
}

/** 표적의 x(삼각파 왕복) = motion.triWave(x0, x1, period, phase, time) — 차량 통(supply.vehicleX)과 같은 공식 한 곳.
 *  time 만의 함수 — 같은 STEP 수면 같은 x(결정성). period ≤ 0 이면 x0 에 선다. phase = 출발 위상 u0(0.5 = x1 에서 출발) */
export function targetX(t, time) {
  return triWave(t.x0, t.x1, t.period, t.phase || 0, time);
}

// 점수가 넘은 단계 수 = score ≥ tiers[k] 인 k 의 개수(tiers 는 오름차순)
export function tierOf(score, tiers) {
  let n = 0;
  for (const th of tiers || []) if (score >= th) n++;
  return n;
}

/** 보너스 진입(combat.verdict 승리 분기에서 1회). 적·적탄을 비우고 표적을 만든다. 날아가던 아군 탄은 지우지 않는다(표적을 맞힐 수 있다).
 *  run.won/wonAt/mainResult 는 호출 전에 이미 확정돼 있어야 한다 */
export function startBonus(run, ev) {
  const def = run.bonusDef;
  run.phase = 'bonus';
  run.bonus = { t: 0, sec: def.sec, score: 0, tier: 0, hits: 0 };
  run.enemies.length = 0;
  run.eshots.length = 0;
  run.spawnCursor = run.spawns.length;
  run.bonusTargets = def.targets.map((d) => makeTarget(d, run.z));
  ev.push({ type: 'bonusStart', sec: def.sec, n: run.bonusTargets.length, x: run.x, z: run.z });
}

/** 표적 한 STEP: 매 STEP px/pz 갱신 → x = targetX(bonus.t), z = run.z + dz. 죽은 표적은 respawnT 를 줄여 0 이하면 같은 궤적에 재등장 */
export function moveTargets(run, dt, ev) {
  const time = run.bonus.t;
  for (const t of run.bonusTargets) {
    t.px = t.x; t.pz = t.z;
    t.x = targetX(t, time);
    t.z = run.z + t.dz;
    if (t.alive) continue;
    t.respawnT -= dt;
    if (t.respawnT <= 0) {
      t.respawnT = 0; t.alive = true; t.hp = t.max;
      ev.push({ type: 'bonusRespawn', id: t.id, x: t.x, z: t.z });
    }
  }
}

/** 표적 직격(combat.moveBullets 후보 kind 4). 관통 처리는 hitEnemy 와 같다(pierce 면 b.hit 에 id, 수가 pierce 이상이면 dead).
 *  hp > 0 → bonusTargetHit · hp ≤ 0 → alive false·respawn 예약·hits/score 반영·bonusHit, 단계가 오르면 bonusTier(단계는 내려가지 않는다).
 *  중화기 폭발·전격포 연쇄는 표적에 적용하지 않는다(적·보스 풀만 본다) */
export function hitBonusTarget(run, t, b, ev) {
  if (b.pierce) { b.hit.push(t.id); if (b.hit.length >= b.pierce) b.dead = true; }
  else b.dead = true;
  t.hp -= b.dmg;
  if (t.hp > 0) { ev.push({ type: 'bonusTargetHit', id: t.id, hp: t.hp, x: t.x, z: t.z }); return; }
  t.hp = 0; t.alive = false; t.respawnT = t.respawn;
  const bo = run.bonus;
  bo.hits++;
  bo.score += t.value;
  ev.push({ type: 'bonusHit', id: t.id, value: t.value, score: bo.score, hits: bo.hits, x: t.x, z: t.z });
  const tier = tierOf(bo.score, run.bonusDef.tiers);
  if (tier > bo.tier) { bo.tier = tier; ev.push({ type: 'bonusTier', tier, score: bo.score, x: t.x, z: t.z }); }
}

/** 시간 소진 판정(STEP 끝). sec 에 닿은 STEP 에 t 를 sec 로 고정하고 over 를 세운다(bonusEnd 1회). 반환 = 끝났는가 */
export function endBonusIfDue(run, ev) {
  const bo = run.bonus;
  if (bo.t + 1e-9 < bo.sec) return false;
  bo.t = bo.sec;
  run.over = true;
  ev.push({ type: 'bonusEnd', score: bo.score, tier: bo.tier, hits: bo.hits, time: run.time, x: run.x, z: run.z });
  return true;
}
