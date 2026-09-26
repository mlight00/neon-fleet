// tests/lib/rush3-bossfight.mjs — 보스전 시간 실측(r4.7, 동작 확인 — 난이도 판단 아님).
//  게임 줄(brutal) 판의 보스를 **상한 부대**(stage.bossFloor 의 병력·무기·Mk — 그 판을 가장 잘 했을 때 보스 앞에 도착하는 부대)로 붙어
//  실제 stepRun 으로 쓰러뜨리기까지의 시간을 잰다. 보스의 공격(사격·패턴(r4.8)·소환·접촉·착지 충격)은 끈다 — 부대가 줄지 않는 상한 조건에서
//  '보스 체력 ÷ 실제로 닿는 피해'가 계산(30초)대로인지를 보는 것이다. 조작 = planBoss(보스 추종·광장 회피).
import { createRun, stepRun, drainEvents, STEP } from '../../rush3/combat.js';
import { buildStage } from '../../rush3/stages.js';
import { pickInput } from './rush3-policies.mjs';

/** 반환 { fightSec(보스가 맞기 시작한 뒤 전원 격파까지 — 광장은 보호막이 풀린 뒤부터), steps, won, units, weapon, mk, hp } */
export function bestLoadoutFight(id, maxSteps = 28800) {
  const st = buildStage(id, { difficulty: 'brutal' });
  const f = st.bossFloor;
  const stage = { ...st, startUnits: f.units, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
  const run = createRun(stage, { startWeapon: f.weapon, startMk: f.mk });
  run.z = run.prevZ = stage.eliteZ - 2;
  let steps = 0, t0 = null;
  while (!run.bossDefeated && steps < maxSteps) {
    stepRun(run, pickInput('planBoss', run), STEP);
    drainEvents(run);
    steps++;
    //  r4.8: 게임 줄 보스의 공격은 패턴(atk)이다 — 부채꼴(shoot)과 함께 끈다(차례에서 빠진다)
    for (const bo of run.bosses) { bo.shoot = false; bo.summon = false; bo.atk = null; }
    if (run.arena) { run.arena.boss.touchDmg = 0; run.arena.boss.shock.dmg = 0; }
    if (t0 === null && run.bosses.length && run.bosses.every((b) => !b.guard)) t0 = run.time;
  }
  return { fightSec: run.time - (t0 ?? run.time), steps, won: run.bossDefeated, units: f.units, weapon: f.weapon, mk: f.mk, hp: f.hp, dps: f.dps };
}
