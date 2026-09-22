// rush3-bossphase — r3.27 보스 페이즈(이사 결정 A 2026-09-23 "보스 체력에 맞춘 페이즈 단계") V3-PHASE.
//  옛 러너(rush/combat.js phase2At·rage)에 있던 장치를 v3 에 처음 들여왔다. 규칙만 본다(연출은 셸 몫).
//  ⚠️1·2번은 페이즈를 켜지 않는다 — 정예 체력이 120·220 이라 닿기 전에 끝나고, 어려움 2번 성공 경로가 병력 4명(최대 17)으로
//   이미 아슬아슬해 보스를 조금만 세게 하면 SD-7 잠금이 깨진다(2026-09-23 실측).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAL3 } from '../rush3/balance.js';
import { buildStage } from '../rush3/stages.js';
import { createRun, stepRun, makeBoss, bossPhaseOf, STEP } from '../rush3/combat.js';

const P = BAL3.bossPhases;
const NO = { pointerX: null, dragDx: 0, keyDir: 0 };

//  정예 1체만 있는 판을 만들어 보스를 바로 세운다(스폰·게이트·통 없음 — 보스 타이머만 본다)
function bossRun({ hp = 1000, phases = true } = {}) {
  const stage = { id: 99, version: 1, title: 'T', length: 20000, eliteZ: 400, startUnits: 1, startWeapon: 'rifle',
                  gateRows: [], supplies: [], walls: [], spawns: [], elite: { z: 400, hp, summon: false }, bossPhases: phases };
  const run = createRun(stage);
  //  ⚠️유닛을 지우면 병력 0 = 패배(run.over)라 STEP 이 멈춘다 — 대신 사격만 막는다(fireT 를 아주 크게)
  for (const u of run.units) { u.fireT = 1e9; u.hp = 1e9; }   // 적탄에 죽으면 판이 끝나 STEP 이 멈춘다
  return run;
}

//  보스를 hold 상태로 세운 뒤 sec 초 동안 돌리며 적탄 발사 수를 센다(부대는 사격하지 않게 유닛을 비운다)
//  ⚠️stepRun 은 run 을 돌려주고 이벤트는 run.events 에 **쌓인다**(셸이 비운다) — 비우지 않으면 STEP 마다 같은 이벤트를 다시 센다
function drain(run, type) {
  const out = run.events.filter((e) => e.type === type);
  run.events.length = 0;
  return out;
}
function shotsIn(run, sec) {
  let n = 0;
  for (let i = 0; i < Math.round(sec / STEP); i++) { stepRun(run, NO, STEP); n += drain(run, 'eshot').length; }
  return n;
}
function phaseEvents(run, steps) {
  const out = [];
  for (let i = 0; i < steps; i++) { stepRun(run, NO, STEP); out.push(...drain(run, 'bossPhase')); }
  return out;
}

test('V3-PHASE 단계 계산: 남은 체력 비율이 at 아래로 내려갈 때마다 한 단계, 배열 길이는 at + 1', () => {
  assert.equal(P.at.length + 1, P.rate.length);
  assert.equal(P.at.length + 1, P.speed.length);
  assert.equal(P.at.length + 1, P.dashEvery.length);
  assert.equal(P.rate[0], 1, '0단계는 종전과 같다');
  assert.equal(P.speed[0], 1);
  assert.equal(bossPhaseOf(100, 100), 0);
  assert.equal(bossPhaseOf(51, 100), 0);
  assert.equal(bossPhaseOf(50, 100), 1, '정확히 절반이면 1단계');
  assert.equal(bossPhaseOf(21, 100), 1);
  assert.equal(bossPhaseOf(20, 100), 2);
  assert.equal(bossPhaseOf(0, 100), P.at.length, '죽는 순간은 마지막 단계');
  //  단계가 셀수록 빨라진다(주기는 줄고 속도는 는다)
  for (let i = 1; i < P.rate.length; i++) {
    assert.ok(P.rate[i] < P.rate[i - 1], '사격 주기는 단계마다 짧아진다');
    assert.ok(P.speed[i] > P.speed[i - 1], '이동 속도는 단계마다 빨라진다');
    assert.ok(P.dashEvery[i] < P.dashEvery[i - 1], '돌진 주기는 단계마다 짧아진다');
  }
});

test('V3-PHASE 사격 빈도: 체력 절반 아래에서 같은 시간에 더 많이 쏜다(0단계 대비 1/rate 배)', () => {
  const sec = 12;
  const full = bossRun({ hp: 1000 });
  //  보스가 하강을 마칠 때까지 돌린 뒤(2.5초) 센다
  shotsIn(full, 3);
  const a = shotsIn(full, sec);

  const hurt = bossRun({ hp: 1000 });
  shotsIn(hurt, 3);
  hurt.bosses[0].hp = 400;                    // 40% → 1단계
  const b = shotsIn(hurt, sec);
  assert.ok(b > a, `1단계가 더 자주 쏜다(0단계 ${a}발 · 1단계 ${b}발)`);
  //  기대값 = sec / (shootEvery × rate) ± 1
  const every = full.enemyDefs.elite.shootEvery;
  //  eshot 은 부채꼴 한 번에 하나(n = fan) — 기대 발사 횟수 = sec ÷ (주기 × rate)
  assert.ok(Math.abs(b - sec / (every * P.rate[1])) <= 2, `1단계 발사 횟수 ${b}(기대 ${(sec / (every * P.rate[1])).toFixed(1)})`);
  assert.ok(Math.abs(a - sec / every) <= 2, `0단계 발사 횟수 ${a}(기대 ${(sec / every).toFixed(1)})`);
});

test('V3-PHASE 이벤트: 단계가 오른 STEP 에 bossPhase 가 한 번만 나온다(같은 단계에서 다시 나오지 않는다)', () => {
  const run = bossRun({ hp: 1000 });
  shotsIn(run, 3);
  run.bosses[0].hp = 490;                     // 49% → 1단계
  const evs = phaseEvents(run, 120);
  assert.equal(evs.length, 1, '한 번만');
  assert.equal(evs[0].phase, 1);
  assert.equal(evs[0].id, run.bosses[0].id);
  assert.equal(run.bosses[0].phase, 1);
  //  더 깎으면 2단계가 한 번 더
  run.bosses[0].hp = 190;                     // 19% → 2단계
  const evs2 = phaseEvents(run, 120);
  assert.equal(evs2.length, 1);
  assert.equal(evs2[0].phase, 2);
});

test('V3-PHASE 끄기: bossPhases false 인 판(1·2번)은 단계가 오르지 않고 발사 빈도도 그대로', () => {
  const sec = 12;
  const off = bossRun({ hp: 1000, phases: false });
  shotsIn(off, 3);
  off.bosses[0].hp = 100;                     // 10% — 켜져 있었다면 2단계
  const b = shotsIn(off, sec);

  const base = bossRun({ hp: 1000, phases: false });
  shotsIn(base, 3);
  const a = shotsIn(base, sec);
  assert.equal(b, a, '체력이 줄어도 발사 수가 같다');
  assert.equal(off.bosses[0].phase, 0);
  //  스테이지 1·2 는 정의에서 꺼져 있고 3 번부터 켜진다
  assert.equal(buildStage(1).bossPhases, false);
  assert.equal(buildStage(2).bossPhases, false);
  assert.equal(buildStage(3).bossPhases, true);
  assert.equal(BAL3.bossPhases.from, 3);
});

test('V3-PHASE 규칙 무관: makeBoss 는 phase 0 으로 시작하고, 페이즈는 체력·피해·판정을 바꾸지 않는다', () => {
  const run = bossRun({ hp: 500 });
  const bo = makeBoss(run, { hp: 500 }, 0);
  assert.equal(bo.phase, 0);
  assert.equal(bo.hp, 500);
  assert.equal(bo.max, 500);
});
