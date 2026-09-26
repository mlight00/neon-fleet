// tests/lib/rush3-scatter.mjs — 산탄포 실측 도구(r4.7). 규칙 모듈은 import 만(읽기 전용) — 합성 스테이지를 실제 stepRun 으로 돌려 잰다.
//  ① gateRate  = 게이트 한 행을 셔터가 열린 동안(armZ 340 ÷ 전진 190 ≈ 1.79초) 쏴서 **자기 칸**이 오른 값 ÷ 그 시간(초당 게이트 +1)
//  ② bossDps   = 도로 정예(사격·소환 끔)가 정지 거리 holdAhead 에 선 뒤 10초 동안 깎인 체력 ÷ 10(보스에 **실제로 닿는** 초당 피해)
//  r4.7 산탄포 모양 변경(3발/0.55초 → 6발/1.1초)의 '초당 피해·초당 게이트 +1 이 비슷' 검사(SCATTER)가 변경 전 실측값(04689c8)과 비교한다.
import { createRun, stepRun, drainEvents, STEP } from '../../rush3/combat.js';

const T3 = [80, 80 + 320 / 3, 80 + 640 / 3, 400];
const synth = (o = {}) => ({ id: 'scatter-probe', version: 1, title: 't', startUnits: 1, startWeapon: 'rifle', length: 40000, eliteZ: 39000,
  gateRows: [], supplies: [], walls: [], spawns: [], elite: null, difficulty: 'normal', ...o });

/** 게이트 칸 오름 속도. layout 2 = 2칸 행(자기 칸 = 왼쪽, 부대 x 160) · 3 = 3칸 행(자기 칸 = 가운데, 부대 x 240).
 *  반환 { own = 자기 칸이 오른 값, all = 행 전체가 오른 값, sec = 셔터 열린 시간, ownPerSec, allPerSec } */
export function gateRate(weapon, units, layout = 2, mk = 1) {
  const cells = layout === 3
    ? [[T3[0], T3[1]], [T3[1], T3[2]], [T3[2], T3[3]]]
    : [[80, 240], [240, 400]];
  const row = { id: 'g1', z: 3000, h: 24, maxValue: 100000, bypass: false, armZ: 340, armed: false, passed: false, hint: null,
                cells: cells.map(([x0, x1]) => ({ x0, x1, value: -10000, maxValue: 100000, flashT: 0 })) };
  const own = layout === 3 ? 1 : 0;
  const x = (cells[own][0] + cells[own][1]) / 2;
  const run = createRun(synth({ startUnits: units, gateRows: [row] }), { startWeapon: weapon, startMk: mk });
  const inp = { pointerX: x, dragDx: 0, keyDir: 0 };
  //  대형이 자리를 잡을 시간(부대 x 이동)을 주고, 행을 지나기 직전까지(값은 통과 STEP 에 확정)
  let steps = 0;
  while (!run.gateRows[0].passed && steps < 40000) {
    const before = run.gateRows[0].cells.map((c) => c.value);
    stepRun(run, inp, STEP); drainEvents(run); steps++;
    if (run.gateRows[0].passed) { run.gateRows[0].cells.forEach((c, i) => { c.value = before[i]; }); break; }
  }
  const vals = run.gateRows[0].cells.map((c) => c.value + 10000);
  const sec = 340 / 190;
  return { own: vals[own], all: vals.reduce((a, b) => a + b, 0), sec, ownPerSec: vals[own] / sec, allPerSec: vals.reduce((a, b) => a + b, 0) / sec };
}

/** 도로 정예 초당 피해(보스에 실제로 닿는 몫). role 'tank' 정의로 등장시킨 뒤 사격·소환을 끄고 holdAhead 를 바꾼다. 부대는 보스 x 를 따라간다 */
export function bossDps(weapon, units, holdAhead = 420, mk = 1, sec = 10) {
  const run = createRun(synth({ startUnits: units, eliteZ: 400, length: 40000, elites: [{ z: 400, hp: 1e9, summon: false, role: 'tank' }] }), { startWeapon: weapon, startMk: mk });
  let steps = 0;
  while (!run.boss && steps < 2000) { stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); steps++; }
  const bo = run.boss;
  bo.holdAhead = holdAhead; bo.shoot = false; bo.summon = false;
  while (bo.state !== 'hold' && steps < 4000) { stepRun(run, { pointerX: bo.x, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); steps++; }
  const hp0 = bo.hp;
  const n = Math.round(sec / STEP);
  for (let i = 0; i < n; i++) { stepRun(run, { pointerX: bo.x, dragDx: 0, keyDir: 0 }, STEP); drainEvents(run); }
  return (hp0 - bo.hp) / sec;
}
