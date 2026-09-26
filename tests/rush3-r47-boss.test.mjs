// rush3-r47-boss — r4.7(2026-09-26 이사님 실플레이 뒤 지시) 보스 묶음: FIREPOWER(상한 화력 계산기) · BOSS-30S(보스와 최소 30초) · BOSS-SHOT(보스 탄 1/3).
//  이사님 원문: "적 보스 체력: 적어도 보스와 30초는 싸울 수 있도록 조정. 대신 보스가 발사하는 탄환의 데미지를 1/3 정도 줄여주자."
//  보스 체력은 봇 승패가 아니라 **상한 화력 계산**(rush3/firepower.js)으로 정한다(이사님 지시 "난이도는 너의 봇테스트로 하지 말도록").
//  ⚠️여기서 도는 판은 모두 동작 확인이다(계산이 실제 stepRun 과 맞는가 · 판이 끝나는가). 봇 승패는 잠그지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAL3 } from '../rush3/balance.js';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP, enemyDefsFor } from '../rush3/combat.js';
import { bossFloor, bossUpperBound, routeChoices, routeLoadout, weaponOptions, bossDpsFor } from '../rush3/firepower.js';
import { bossDps } from './lib/rush3-scatter.mjs';
import { bestLoadoutFight } from './lib/rush3-bossfight.mjs';
import { pickInput } from './lib/rush3-policies.mjs';

//  합성 판(계산기 단위 검사). 필드는 buildStage 결과와 같은 꼴
const fpStage = (o = {}) => ({ id: 'fp', startUnits: 5, startWeapon: 'rifle', eliteZ: 9000, length: 9400, gateRows: [], supplies: [], walls: [], lottery: null,
  elites: [{ z: 9000, hp: 100, summon: false }], arena: null, ...o });
const sup = (id, z, x, kind, payload, o = {}) => ({ id, z, x, r: 30, kind, payload, pairId: null, ...o });
const row = (id, z, cells) => ({ id, z, cells: cells.map(([x0, x1, value, maxValue]) => ({ x0, x1, value, maxValue })) });
const best = (st) => bossUpperBound(st);

test('FIREPOWER-1: 병력 상한 — 분리벽은 한쪽 통로만(더 좋은 쪽) · 배제 쌍은 하나만 · 병력 상한 100 · 게이트는 최선 칸의 상한(음수 칸도) · 칸이 다 덮지 못하면 0 · 연속 증원 = 발판 전부', () => {
  //  분리벽 z 1000~2000: 왼쪽 병사 40 · 오른쪽 병사 30 → 왼쪽만(두 통을 다 받지 않는다) + 벽 밖 병사 10
  const wall = { id: 'w1', z0: 1000, z1: 2000, x0: 228, x1: 252 };
  const st1 = fpStage({ walls: [wall], supplies: [sup('c1', 1500, 120, 'soldier', { n: 40 }), sup('c2', 1500, 360, 'soldier', { n: 30 }), sup('c3', 3000, 240, 'soldier', { n: 10 })] });
  assert.equal(best(st1).units, 5 + 40 + 10, '분리벽 한쪽(40)만');
  assert.equal(routeChoices(st1).length, 2, '좌/우 두 길');
  assert.deepEqual(routeChoices(st1).map((r) => routeLoadout(st1, r, 9000).units).sort((a, b) => a - b), [45, 55]);
  //  배제 쌍(벽 없음): 같은 pairId 는 하나만
  const st2 = fpStage({ supplies: [sup('c1', 1500, 120, 'soldier', { n: 20 }, { pairId: 'p' }), sup('c2', 1500, 360, 'soldier', { n: 25 }, { pairId: 'p' })] });
  assert.equal(best(st2).units, 5 + 25, '쌍 중 하나(25)만');
  //  병력 상한 100
  const st3 = fpStage({ supplies: [sup('c1', 1000, 240, 'soldier', { n: 70 }), sup('c2', 2000, 240, 'soldier', { n: 70 })] });
  assert.equal(best(st3).units, 100, '상한 100(squad.unitCap)');
  assert.equal(BAL3.squad.unitCap, 100);
  //  게이트: 최선 칸의 상한 — 음수 칸 상한 20 > 양수 칸 상한 5 → +20. 우회 행(음수만, 칸이 도로 반쪽) → 0
  const st4 = fpStage({ gateRows: [row('g1', 1000, [[80, 240, 3, 5], [240, 400, -10, 20]]), row('g2', 2000, [[80, 240, -9, -3]])] });
  assert.equal(best(st4).units, 5 + 20 + 0);
  //  모두 덮고 음수만 남으면 줄어든다(로봇 1명은 남는다)
  const st5 = fpStage({ gateRows: [row('g1', 1000, [[80, 240, -10, -10], [240, 400, -12, -12]])] });
  assert.equal(best(st5).units, 1);
  //  연속 증원: 발판 maxPads 전부(보스 z 앞 발판만)
  const st6 = fpStage({ supplies: [sup('c1', 1000, 150, 'chain', { pads0: 5, maxPads: 12 })] });
  assert.equal(best(st6).units, 5 + 12);
  assert.equal(routeLoadout(st6, routeChoices(st6)[0], 1000 + 60 + 40 * 3).units, 5 + 3, '보스 z 앞 발판만');
  //  실제 판(분리벽 판 2·9·20·24): 조합은 벽마다 좌/우 — 두 통로를 한꺼번에 받는 조합은 없다
  for (const id of [2, 9, 20, 24]) {
    const st = buildStage(id, { difficulty: 'brutal' });
    const walls = st.walls.filter((w) => w.kind !== 'cover');
    for (const r of routeChoices(st)) assert.deepEqual(Object.keys(r.sides).sort(), walls.map((w) => w.id).sort());
  }
});

test('FIREPOWER-2: 무기 — 얻을 수 있는 무기 통 중 보스에 닿는 초당 피해가 가장 큰 무기·Mk(같은 무기 통 수 = Mk, 판 시작 무기 포함) · 보스 z 뒤의 통은 없다', () => {
  assert.deepEqual(weaponOptions('rifle', { auto: 2, heavy: 1 }), [{ weapon: 'rifle', mk: 1 }, { weapon: 'auto', mk: 2 }, { weapon: 'heavy', mk: 1 }]);
  assert.deepEqual(weaponOptions('rifle', { rifle: 1, auto: 5 }), [{ weapon: 'rifle', mk: 2 }, { weapon: 'auto', mk: 3 }], 'Mk 최대 III');
  //  교체 규칙: 시작 무기보다 순위가 높지 않은 무기 통은 교체가 안 돼 얻을 수 없다(기관총 2 → 산탄포 2 ✗ · 소총 1 ✗ · 중화기 3 ○)
  assert.deepEqual(weaponOptions('auto', { scatter: 2, rifle: 1, heavy: 1 }), [{ weapon: 'auto', mk: 1 }, { weapon: 'heavy', mk: 1 }]);
  const st = fpStage({ startUnits: 40, supplies: [sup('c1', 1000, 240, 'weapon', { weapon: 'auto' }), sup('c2', 2000, 240, 'weapon', { weapon: 'auto' }), sup('c3', 3000, 240, 'weapon', { weapon: 'heavy' }), sup('c4', 9500, 240, 'weapon', { weapon: 'sniper' })] });
  const b = best(st);
  const cands = [['rifle', 1], ['auto', 2], ['heavy', 1]].map(([w, mk]) => ({ w, mk, dps: bossDpsFor(st, 40, w, mk).dps }));
  const top = cands.reduce((a, c) => (c.dps > a.dps ? c : a));
  assert.deepEqual([b.weapon, b.mk], [top.w, top.mk], '가장 센 무기: ' + JSON.stringify(cands));
  assert.ok(Math.abs(b.dps - top.dps) < 1e-9);
  const lo = routeLoadout(st, routeChoices(st)[0], st.eliteZ);
  assert.deepEqual(lo.crates, { auto: 2, heavy: 1 }, '보스 z(9000) 뒤의 관통탄 통은 후보가 아니다');
});

test('FIREPOWER-3: 보스에 **실제로 닿는** 탄 — 계산 초당 피해가 실제 stepRun 실측(도로 정예, 보스 추종)과 맞다(계산 = 상한이라 실측의 0.95~1.25배)', () => {
  const st = (role) => fpStage({ elites: [{ z: 400, hp: 1, role }] });
  for (const [w, n] of [['rifle', 40], ['rifle', 100], ['auto', 40], ['heavy', 100], ['sniper', 40], ['scatter', 10], ['scatter', 40], ['scatter', 100]]) {
    for (const [role, hold] of [['gunner', 420], ['tank', 360]]) {
      const calc = bossDpsFor(st(role), n, w, 1).dps, eng = bossDps(w, n, hold, 1);
      const k = calc / eng;
      assert.ok(k >= 0.95 && k <= 1.25, `${w} ${n}명 정지 ${hold}: 계산 ${calc.toFixed(1)} / 실측 ${eng.toFixed(1)} = ${k.toFixed(3)}`);
    }
  }
  //  사거리 무기(산탄포 420)는 정지 거리 420 보스에 앞줄만 닿는다 — 같은 병력의 소총보다 닿는 발 비율이 낮다
  const sc = bossDpsFor(st('gunner'), 100, 'scatter', 1), rf = bossDpsFor(st('gunner'), 100, 'rifle', 1);
  assert.ok(sc.hits / (100 * 6) < rf.hits / 100, '산탄포 뒷줄은 사거리 밖');
  //  도로 보스는 옆으로 빗나가는 병사가 있다(대형 폭 > 보스 폭) — 100명 소총이 100발 다 닿지 않는다
  assert.ok(rf.hits < 100);
  //  광장 = 자동 조준이라 모든 발이 닿는다(상한)
  const ar = fpStage({ arena: { z: 9000 }, elites: [{ z: 9000, hp: 1, summon: false }] });
  assert.equal(bossDpsFor(ar, 50, 'auto', 1).hits, 50);
  assert.equal(bossDpsFor(ar, 50, 'scatter', 1).hits, 300);
});

test('BOSS-30S-1: 게임 줄 1~24 — 보스 체력 합 ÷ 상한 화력 ≥ 30초(BAL3.bossMinFightSec) · 새 체력 ≥ 옛 체력 · 보스 여럿은 비율 유지 · 배수 1 줄은 그대로', (t) => {
  assert.equal(BAL3.bossMinFightSec, 30);
  assert.equal(BAL3.difficulty.brutal.bossFloor, true); assert.equal(BAL3.difficulty.normal.bossFloor, false);
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    const f = st.bossFloor;
    assert.ok(f, `S${id} 보스 체력 바닥 계산`);
    const ub = bossUpperBound(st);
    const sum = st.elites.reduce((a, e) => a + e.hp, 0);
    assert.ok(sum / ub.dps >= 30 - 1e-9, `S${id}: ${sum} ÷ ${ub.dps.toFixed(1)} = ${(sum / ub.dps).toFixed(2)}초`);
    st.elites.forEach((e, i) => assert.ok(e.hp >= f.base[i] && Number.isInteger(e.hp), `S${id} 보스 ${i}: ${f.base[i]} → ${e.hp}`));
    for (let i = 1; i < st.elites.length; i++) assert.ok(Math.abs(st.elites[i].hp / st.elites[0].hp - f.base[i] / f.base[0]) < 0.01, `S${id} 비율 유지`);
    assert.equal(st.elite, st.elites[0], '별칭 그대로');
    t.diagnostic(`BOSS-30S S${id} ${st.arena ? '광장' : st.elites.length > 1 ? '보스' + st.elites.length : '도로'} 상한 ${f.units}명 ${f.weapon} Mk${f.mk} ${f.dps.toFixed(1)}/s · ${f.base.join('+')} → ${f.hp.join('+')} · ${f.minSec.toFixed(1)}초`);
    //  배수 1 줄: 바닥 없음(종전 체력 — V3-DIFF2ROW 가 바이트 단위로 잠근다)
    assert.equal(buildStage(id).bossFloor, undefined);
  }
  //  상수 한 곳: 60초로 바꾸면 체력이 따라 오른다(계산만)
  const st2 = buildStage(2, { difficulty: 'brutal' });
  assert.ok(bossFloor({ ...st2, elites: st2.elites.map((e, i) => ({ ...e, hp: st2.bossFloor.base[i] })) }, 60).minSec >= 60 - 1e-9);
});

test('BOSS-30S-2: 랜덤 길 판(3·12)의 보스 체력은 추첨 시드와 무관(풀의 좋은 결과 중 최선으로 계산)', () => {
  for (const id of [3, 12]) {
    const hps = [1, 7, 99, 12345, 2 ** 31 - 1].map((seed) => buildStage(id, { difficulty: 'brutal', lotterySeed: seed }).elites.map((e) => e.hp).join('+'));
    assert.equal(new Set(hps).size, 1, `S${id}: ${hps.join(' / ')}`);
  }
});

test('BOSS-30S-3: 보스전 시간 실측(동작 확인) — 상한 부대(병력·무기·Mk)로 보스 공격을 끈 채 붙으면 쓰러뜨리기까지 30초 안팎(≥ 27초)이 걸린다(1~24)', (t) => {
  for (const id of ALL_STAGE_IDS) {
    const r = bestLoadoutFight(id);
    assert.equal(r.won, true, `S${id} 끝난다`);
    assert.ok(r.fightSec >= 27, `S${id}: ${r.fightSec.toFixed(1)}초`);
    t.diagnostic(`BOSS-FIGHT S${id} ${r.units}명 ${r.weapon} Mk${r.mk} → ${r.fightSec.toFixed(1)}초`);
  }
});

test('BOSS-SHOT: 게임 줄 보스 탄 1(= 1 × 3 × 1/3 — 두 발에 병사 1명) · 저격수 탄 3 그대로 · 배수 1 줄 불변 · 실제 판에서도 정예·광장 보스 탄 1', () => {
  assert.equal(BAL3.difficulty.brutal.bossShotDmg, 1 / 3); assert.equal(BAL3.difficulty.normal.bossShotDmg, 1);
  const b = enemyDefsFor('brutal'), n = enemyDefsFor('normal');
  assert.deepEqual([b.elite.shot.dmg, b.shooter.shot.dmg], [1, 3]);
  assert.deepEqual([n.elite.shot.dmg, n.shooter.shot.dmg], [1, 1]);
  assert.equal(BAL3.squad.unitHp, 2, '병사 체력 2 — 보스 탄 1 이면 두 발');
  //  접촉·착지 충격은 그대로(보스 탄만)
  assert.equal(b.elite.touchDmg, 9);
  assert.equal(createRun(buildStage(24, { difficulty: 'brutal' })).arena.boss.shock.dmg, 6, '광장 착지 충격 = 2 × 3 그대로');
  //  실제 판: 1번(저격수 extraSpawns + 정예) · 10번(포격형) · 24번(광장 보스 부채꼴) — 새로 생긴 적탄을 **쏜 자리**로 가른다:
  //   적탄은 생긴 STEP 에 한 번 움직이며 px/pz 에 출발점을 남긴다 → 출발점이 살아 있는 보스 자리면 보스 탄, 아니면 저격수 탄
  const seen = { boss: new Set(), shooter: new Set() };
  for (const id of [1, 10, 24]) {
    const run = createRun(buildStage(id, { difficulty: 'brutal' }), { heroGuard: true });
    let steps = 0;
    while (!run.over && steps++ < 12000) {
      const before = new Set(run.eshots);
      stepRun(run, pickInput('evLead', run), STEP); drainEvents(run);
      for (const s of run.eshots) {
        if (before.has(s)) continue;
        const fromBoss = run.bosses.some((b) => Math.abs(b.x - s.px) < 1e-6 && Math.abs(b.z - s.pz) < 1e-6);
        (fromBoss ? seen.boss : seen.shooter).add(s.dmg);
      }
    }
  }
  assert.deepEqual([...seen.boss], [1], '보스 탄 = 1');
  assert.deepEqual([...seen.shooter], [3], '저격수 탄 = 3');
});
