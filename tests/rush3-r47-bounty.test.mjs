// rush3-r47-bounty — r4.7 (c)(2026-09-26 이사님 실플레이 뒤 지시) 현상금 적 묶음: BOUNTY-1~8.
//  이사님 원문: "일반적: 체력이 특수한 높은 일반 적을 배치해서 내가 가진 최대의 무기로 끝까지 쏴야 깰 수 있는 긴장감을 주자. 대신 코인 같은 보상을 주자."
//  현상금 적 체력은 봇 승패가 아니라 **상한 화력 계산**(rush3/firepower.js bountyFloor)으로 정한다(이사님 지시 "난이도는 너의 봇테스트로 하지 말도록").
//  ⚠️여기서 도는 판은 모두 동작 확인이다(규칙이 명세대로 움직이는가 · 계산이 실제 stepRun 과 맞는가). 봇 승패는 잠그지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAL3 } from '../rush3/balance.js';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP, enemyDefsFor } from '../rush3/combat.js';
import { bountyFloor, bountyWindow, bountyDamageFor, routeChoices, routeLoadout, weaponOptions } from '../rush3/firepower.js';
import { createTally, addEvents, tallyTotal, mainCoins, runCoins, scheduledEnemyCount, bountyCoins, stageValue, COIN } from '../rush3/coins.js';
import { coinBreakdown } from '../rush3/main.js';
import { BOUNTY_LOOK, hitRole } from '../rush3/render.js';
import { bountyFight } from './lib/rush3-bountyfight.mjs';
import { bootApp } from './lib/rush3-shell.mjs';
import { weakenBosses, weakenBounties, pickInput } from './lib/rush3-policies.mjs';

const B = BAL3.bounty;
//  합성 판(규칙 단위 검사): 게임 줄(brutal) 표로 만든 run 에 현상금 적 1체
function synth({ units = 20, bx = 300, bz = 500, hp = 100000, weapon = 'rifle', heroGuard = false } = {}) {
  const stage = { id: 't', version: 1, title: 't', startUnits: units, startWeapon: weapon, length: 1e6, eliteZ: null, gateRows: [], supplies: [], walls: [],
                  spawns: [{ z: 0, kind: 'bounty', n: 1, xs: [bx], zs: [bz], corridorHw: null, hp }], elites: [], elite: null, difficulty: 'brutal' };
  return createRun(stage, { heroGuard });
}
const NO = { pointerX: null, dragDx: 0, keyDir: 0 };

test('BOUNTY-1: 배치 — 게임 줄 2~24번에만(2~12 1체 · 13~24 2체, 1번 없음) · 배수 1 줄 없음 · 스폰 1체(발동 z + 760) · 사선 창 안에 게이트·보급 통·벽 없음 · 보스 전에 끝남', () => {
  assert.equal(BAL3.difficulty.brutal.bounty, true); assert.equal(BAL3.difficulty.normal.bounty, false);
  assert.equal(enemyDefsFor('normal').bounty, undefined, '배수 1 줄 적 표에는 bounty 칸이 없다');
  assert.equal(enemyDefsFor('brutal').bounty.touchDmg, B.touchDmg * BAL3.difficulty.brutal.touchDmg, '피해 풀 = 6 × 3');
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    const sp = st.spawns.filter((s) => s.kind === 'bounty');
    assert.equal(buildStage(id).spawns.filter((s) => s.kind === 'bounty').length, 0, `S${id} 배수 1 줄엔 없다`);
    assert.equal(buildStage(id).bounties, undefined);
    const want = id === 1 ? 0 : id >= 13 ? 2 : 1;
    assert.equal(sp.length, want, `S${id} 현상금 적 ${want}체`);
    assert.equal((st.bounties || []).length, want);
    const blk = [];
    for (const r of st.gateRows) blk.push([r.z, r.z, 'gate ' + r.id]);
    for (const s of st.supplies) {
      blk.push([s.z - s.r, s.z + s.r, 'supply ' + s.id]);
      //  발판 자리 = 통 z + padStart(60) + i × padGap(40) — buildStage 정의에 없으면 규칙 기본값(supply.makeSupply 와 같다)
      const ps = s.padStart ?? BAL3.supply.padOffset, pg = s.padGap ?? BAL3.supply.padGap;
      if (s.kind === 'chain') blk.push([s.z + ps, s.z + ps + (s.payload.maxPads - 1) * pg, 'pads ' + s.id]);
    }
    //  랜덤 길은 시드마다 통·게이트가 달라진다 — 어느 결과든(연속 증원 발판 12개까지) 창 밖이어야 한다
    if (st.lottery) blk.push([st.lottery.z - BAL3.supply.r, st.lottery.z + BAL3.supply.padOffset + 11 * BAL3.supply.padGap, 'lottery']);
    for (const w of st.walls) blk.push([w.z0 - BAL3.squad.wallLead, w.z1, 'wall ' + w.id]);
    let prevEnd = -Infinity;
    (st.bounties || []).forEach((b, i) => {
      const s = sp.find((x) => x.z === b.z);
      assert.ok(s, `S${id} #${i} 스폰`);
      assert.deepEqual([s.n, s.xs, s.zs, s.corridorHw, s.hp], [1, [b.x], [b.z + BAL3.enterZ], null, b.hp]);
      const w = bountyWindow(b.z);
      for (const [p, q, name] of blk) assert.ok(q < b.z || p > w.b, `S${id} #${i} 사선 창 [${b.z}, ${w.b.toFixed(0)}] 안에 ${name}`);
      //  r4.10: 대물결 판(보스 없음)은 옛 보스 자리 = 대물결 시작(hordeZ) — 현상금 적은 대물결 전에 끝난다(배치 규칙 그대로)
      const endZ = st.eliteZ ?? st.hordeZ;
      assert.ok(w.b <= endZ - 150, `S${id} #${i} 보스·대물결(${endZ}) 전에 끝난다`);
      assert.ok(b.z >= prevEnd, `S${id} #${i} 앞 현상금 적의 창이 끝난 뒤에 나온다`);
      prevEnd = w.b;
    });
  }
});

test('BOUNTY-2: 체력 = 그 z 까지의 상한 부대(분리벽 한쪽·병력 100·강화 0)가 사거리 진입부터 닿기까지 줄 수 있는 피해 합 × hpFactor(0.45, 상수 한 곳 — r4.7 보정: 이사님 실플레이 소감(현상금 적이 너무 셈)으로 0.9 → 0.45) · 랜덤 길 시드 무관 · 스폰 체력 3 이상(숫자 표시)', (t) => {
  assert.equal(B.hpFactor, 0.45);
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    for (const b of st.bounties || []) {
      //  독립 재계산: 모든 길 조합 × 무기 후보 중 bountyDamageFor 가 가장 큰 부대
      let best = null;
      for (const route of routeChoices(st)) {
        const lo = routeLoadout(st, route, b.z);
        for (const w of weaponOptions(st.startWeapon, lo.crates)) {
          const d = bountyDamageFor(lo.units, w.weapon, w.mk).dmg;
          if (!best || d > best.d + 1e-9) best = { d, units: lo.units, weapon: w.weapon, mk: w.mk };
        }
      }
      assert.ok(best.units <= BAL3.squad.unitCap);
      assert.equal(b.hp, Math.max(1, Math.round(best.d * B.hpFactor)), `S${id} z${b.z} 체력`);
      assert.deepEqual([b.units, b.weapon, b.mk], [best.units, best.weapon, best.mk]);
      assert.ok(b.hp >= 3, '체력 숫자가 보인다(스폰 체력 3 이상)');
      t.diagnostic(`BOUNTY S${id} z${b.z} x${b.x} 상한 ${b.units}명 ${b.weapon} Mk${b.mk} · 피해 합 ${b.dmg.toFixed(0)} / ${b.sec.toFixed(2)}초 → 체력 ${b.hp}`);
    }
  }
  //  상수 한 곳: 계수를 바꾸면 체력이 따라간다(계산만)
  const st = buildStage(9, { difficulty: 'brutal' });
  assert.equal(bountyFloor(st, st.bounties[0].z, { ...B, hpFactor: 0.5 }).hp, Math.max(1, Math.round(st.bounties[0].dmg * 0.5)));
  //  랜덤 길 판(3·12)은 추첨 시드와 무관
  for (const id of [3, 12]) {
    const hps = [1, 7, 99, 2 ** 31 - 1].map((seed) => buildStage(id, { difficulty: 'brutal', lotterySeed: seed }).bounties.map((b) => b.hp).join('+'));
    assert.equal(new Set(hps).size, 1, `S${id}: ${hps.join(' / ')}`);
  }
  //  발동 z 로 자르기(routeLoadout 의 zLimit — 위 독립 재계산도 같은 함수를 쓰므로 따로 잠근다): 발동 z 바로 앞의 병사 통은 상한 병력에 들고,
  //   발동 z 자리의 통은 들지 않는다(보스 z 로 자르는 FIREPOWER-2 와 같은 규칙). 합성 통 1개만 더한 판으로 본다
  const s2 = buildStage(2, { difficulty: 'brutal' }), bz = s2.bounties[0].z;
  const withCrate = (dz) => ({ ...s2, supplies: [...s2.supplies, { id: 'syn', kind: 'soldier', z: bz + dz, x: 240, r: BAL3.supply.r, payload: { n: 5 } }] });
  for (const route of routeChoices(s2)) {
    const u0 = routeLoadout(s2, route, bz).units;
    assert.equal(routeLoadout(withCrate(-1), route, bz).units, Math.min(BAL3.squad.unitCap, u0 + 5), '발동 z 바로 앞 통은 든다');
    assert.equal(routeLoadout(withCrate(0), route, bz).units, u0, '발동 z 자리의 통은 들지 않는다');
  }
});

test('BOUNTY-3: 움직임 — 화면 기준 vz 로 다가오고(부대 전진과 무관, 보스전 정지 중에도 같다) · 부대 x 를 track 속도 이하로 느리게 따라온다(도로 안) · 전격 기절에 걸리지 않는다', () => {
  //  부대(10명)는 x 120 으로 빠르게(최고 250px/s) 비키고, 현상금 적은 x 330 · 부대 앞 760 에서 나온다
  const run = synth({ units: 10, bx: 330, bz: 760 });
  const dt = STEP;
  let e = null, prev = null, at1s = null;
  for (let i = 0; i < 240; i++) {
    stepRun(run, { pointerX: 120, dragDx: 0, keyDir: 0 }, dt); drainEvents(run);
    e = run.enemies.find((x) => x.kind === 'bounty');
    assert.ok(e, '4초 안에는 아직 닿지 않았다');
    if (prev) {
      const dz = (prev.z - prev.rz) - (e.z - run.z);
      assert.ok(Math.abs(dz - B.vz * dt) < 1e-6, `화면 기준 접근 = vz·dt (${dz})`);
      assert.ok(Math.abs(e.x - prev.x) <= B.track * dt + 1e-9, 'x 추종은 track 속도 이하');
      assert.ok(e.x <= prev.x + 1e-9, '부대(왼쪽) 쪽으로만 간다');
      assert.ok(e.x >= BAL3.road.x0 + e.r - 1e-9 && e.x <= BAL3.road.x1 - e.r + 1e-9);
    }
    prev = { z: e.z, x: e.x, rz: run.z };
    if (i === 59) at1s = { ex: e.x, sx: run.x };
  }
  assert.ok(at1s.sx < 140 && at1s.ex - at1s.sx > 60, `1초 뒤: 부대는 이미 비켰고(x ${at1s.sx.toFixed(0)}) 현상금 적은 느리게 따라오는 중(x ${at1s.ex.toFixed(0)})`);
  assert.ok(Math.abs(e.x - Math.max(run.x, BAL3.road.x0 + e.r)) < 1, `4초 뒤: 결국 부대 앞으로 왔다 — 피하기만으로는 못 벗어난다(x ${e.x.toFixed(0)})`);
  //  스크롤이 멈춰도(보스전) 같은 빠르기로 다가온다
  const r2 = synth({ units: 5, bx: 240 });
  stepRun(r2, NO, STEP); drainEvents(r2);
  const b2 = r2.enemies.find((x) => x.kind === 'bounty');
  r2.boss = { dead: false };   // 2단계 전진을 멈추는 조건(보스전) — 이 한 STEP 만 흉내
  const d0 = b2.z - r2.z; const z0 = r2.z;
  r2.bosses = [];
  stepRun(r2, NO, STEP);
  assert.equal(r2.z, z0, '보스전 흉내 = 부대 정지');
  assert.ok(Math.abs((d0 - (b2.z - r2.z)) - B.vz * STEP) < 1e-6, '정지 중에도 vz·dt');
  //  전격 기절 제외: 전격포 부대가 맞혀도 stun 이벤트가 없다
  const r3 = synth({ units: 20, bx: 240, weapon: 'arc' });
  const ev = [];
  for (let i = 0; i < 300; i++) { stepRun(r3, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); ev.push(...drainEvents(r3)); }
  const bid = ev.find((x) => x.type === 'spawn' && x.kind === 'bounty') && r3.enemies.find((x) => x.kind === 'bounty');
  assert.ok(ev.some((x) => x.type === 'enemyHit' && x.kind === 'bounty' && x.weapon === 'arc'), '전격포에 맞았다');
  assert.ok(!ev.some((x) => x.type === 'stun' && bid && x.id === bid.id), '현상금 적은 기절하지 않는다');
});

test('BOUNTY-4: 부딪히면 큰 피해 — 피해 풀(6 × 3 = 18)을 앞줄부터 병사 체력(2)만큼 나눠 9명 · 적은 사라지고 kill 없음(0 코인) · 손실 = 접촉 · 로봇 보호(heroGuard)는 그대로', () => {
  for (const heroGuard of [false, true]) {
    const run = synth({ units: 30, bx: 240, bz: 200, heroGuard });
    const ev = [];
    let n = 0;
    while (!ev.some((e) => e.type === 'touch' && e.kind === 'bounty') && n++ < 600) { stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); ev.push(...drainEvents(run)); }
    const pool = enemyDefsFor('brutal').bounty.touchDmg;
    assert.equal(pool, 18);
    const touch = ev.filter((e) => e.type === 'touch' && e.kind === 'bounty');
    assert.equal(touch.length, 1, '한 번 부딪히고 사라진다');
    assert.equal(run.enemies.filter((e) => e.kind === 'bounty').length, 0);
    assert.equal(ev.filter((e) => e.type === 'kill' && e.kind === 'bounty').length, 0, '부딪혀 사라진 적 = kill 없음');
    assert.equal(run.lossByTouch, pool / BAL3.squad.unitHp, `heroGuard ${heroGuard}: 9명 손실`);
    assert.equal(run.units.length, 30 - 9);
    if (heroGuard) assert.ok(run.units.some((u) => u.hero), '로봇은 보호 규칙대로 남는다');
    assert.equal(runCoins(buildStage(2, { difficulty: 'brutal' }), ev, {}).bounty, 0, '현상금 몫 0');
  }
});

test('BOUNTY-5: 처치 — kill 이벤트에 bounty: true(다른 적 kill 에는 키가 없다) · 코인 현상금 몫 = round(V × 0.4) 1체마다, 일정 스폰 적 V÷n·보스·첫 클리어와 섞이지 않는다', () => {
  const run = synth({ units: 40, bx: 240, bz: 600, hp: 5, weapon: 'auto' });
  run.spawns = run.spawns.concat([{ z: 0, kind: 'grunt', n: 1, xs: [120], zs: [400], corridorHw: null, hp: 1 }]);
  const ev = [];
  for (let i = 0; i < 300; i++) { stepRun(run, { pointerX: 240, dragDx: 0, keyDir: 0 }, STEP); ev.push(...drainEvents(run)); }
  const kills = ev.filter((e) => e.type === 'kill');
  const bk = kills.filter((e) => e.kind === 'bounty');
  assert.equal(bk.length, 1);
  assert.equal(bk[0].bounty, true); assert.equal(bk[0].summoned, false); assert.equal(bk[0].hpMax, 5);
  assert.ok(kills.filter((e) => e.kind !== 'bounty').every((e) => !('bounty' in e)), '다른 적 kill 에는 bounty 키가 없다(희소)');
  //  코인: 2번(V 28) → 11 · 12번(V 48) → 19 · 24번(V 72) → 29
  assert.equal(COIN.bountyShare, 0.4);
  assert.deepEqual([2, 12, 24].map((s) => bountyCoins(s)), [11, 19, 29]);
  assert.equal(bountyCoins(2, { dev: true }), 0);
  for (const id of [2, 13]) {
    const st = buildStage(id, { difficulty: 'brutal' });
    const plain = st.spawns.filter((s) => s.kind !== 'bounty').reduce((a, s) => a + s.n, 0);
    assert.equal(scheduledEnemyCount(st), plain, `S${id} 일정 스폰 총수에 현상금 적은 없다`);
    const t = createTally(st);
    assert.ok(Math.abs(t.perEnemy - stageValue(id) / plain) < 1e-12, '적 1마리 몫은 그대로');
    assert.equal(t.perBounty, Math.round(stageValue(id) * 0.4));
    const evs = [{ type: 'kill', kind: 'grunt', summoned: false }, { type: 'kill', kind: 'bounty', summoned: false, bounty: true }, { type: 'bossKill' }];
    addEvents(t, evs);
    assert.equal(t.kills, 1, '현상금 처치는 적 처치 수에 들어가지 않는다');
    assert.equal(t.bountyKills, 1); assert.equal(t.bounty, t.perBounty);
    const m = mainCoins(t, { cleared: true, firstClear: true });
    assert.equal(m.bounty, t.perBounty);
    assert.equal(m.enemy + m.boss, Math.round(t.enemyRaw + t.bossRaw), '적·보스 반올림 단위는 그대로');
    assert.equal(m.total, m.enemy + m.boss + m.bounty + m.clear);
    assert.equal(tallyTotal(t), m.enemy + m.boss + m.bounty, 'HUD 판 안 누계에 현상금 몫이 들어간다');
    assert.equal(mainCoins(createTally(st, { dev: true }), {}).bounty, 0, '개발용 판 0');
  }
  //  결과 내역 한 줄: '적 · 보스 · 현상금 · 첫 클리어'(0 이면 뺀다 — 종전 판의 글은 그대로)
  //  이름과 숫자 사이는 줄바꿈 없는 공백(U+00A0) — 결과 화면이 어절 경계에서 줄을 나눌 때 '현상금' 과 '+11' 이 갈라지지 않게(종전 항목과 같은 규칙)
  const NB = ' ';
  assert.equal(coinBreakdown({ enemy: 7, boss: 14, bounty: 11, clear: 28, clearKind: 'first', bonus: 0 }), `적${NB}7 · 보스${NB}14 · 현상금${NB}+11 · 첫${NB}클리어${NB}28`);
  assert.equal(coinBreakdown({ enemy: 15, boss: 13, bounty: 0, clear: 26, clearKind: 'first', bonus: 0 }), `적${NB}15 · 보스${NB}13 · 첫${NB}클리어${NB}26`);
});

test('BOUNTY-6: 셸 — 현상금 적 그림(금색 테·이름표·체력 숫자) · 처치 순간 \'+11 코인\' · HUD 누계 · 결과 화면 내역 \'현상금 +11\'', async () => {
  const h = await bootApp({ unlockThrough: 1, withOps: true });
  h.app.startRun(2);
  let seenLook = false, seenHp = false, seenFloat = false, hudJump = null, n = 0;
  while (h.app.getState() === 'run' && n++ < 20000) {
    const run = h.app.getRun();
    const b = run.enemies.find((e) => e.kind === 'bounty' && !e.dead);
    //  잡는 장면을 보려면 부대가 그 자리에 가야 한다 — 평소엔 evLead 조작, 현상금 적이 있으면 그 x 에 선다. 가까이 오면 체력을 조금만 남긴다(검사 도구 — 규칙 불변)
    h.app.input.state.pointerX = b ? b.x : pickInput('evLead', run).pointerX;
    if (b && b.z - run.z < 250) weakenBounties(run, 3);
    weakenBosses(run);
    h.texts.length = 0; h.ops.length = 0;
    const c0 = h.app.dbg().coins;
    h.frames(1);
    if (b && !b.dead) {
      if (h.ops.some((o) => o.op === 'stroke' && o.stroke === BOUNTY_LOOK.ring) && h.texts.some((t) => t.text === BOUNTY_LOOK.label && t.fill === BOUNTY_LOOK.ring)) seenLook = true;
      if (h.texts.some((t) => t.text === String(Math.ceil(b.hp)))) seenHp = true;
    }
    if (!seenFloat && h.texts.some((t) => t.text === '+11 코인')) { seenFloat = true; hudJump = h.app.dbg().coins - c0; }
  }
  assert.ok(seenLook, '금색 테 + 금색 이름표 현상금');
  assert.ok(seenHp, '체력 숫자');
  assert.ok(seenFloat, '처치 순간 +11 코인');
  assert.ok(hudJump >= 11, 'HUD 판 안 누계가 처치 프레임에 현상금 몫만큼 오른다: +' + hudJump);
  const r = h.app.getResult();
  assert.equal(r.won, true);
  assert.equal(r.coins.bounty, 11, '결과 코인 내역에 현상금 몫');
  //  '현상금' 과 숫자 사이는 줄바꿈 없는 공백(U+00A0)
  assert.ok(r.coinLine.includes('현상금 +11'), r.coinLine);
  h.texts.length = 0; h.frames(1);
  assert.ok(h.texts.some((t) => t.text.includes('현상금 +11')), '결과 화면에 그려진다');
  assert.equal(r.coins.gained, 11 + r.coins.enemy + r.coins.boss + r.coins.clear, '획득 코인에 들어간다');
});

//  자리: 체력은 부대 중심 자리마다의 피해 합을 **고르게 평균**한 값 × hpFactor(0.45) 다(firepower.bountyDamageFor — 보스 1체 계산과 같은 방식).
//   도로 가운데 쪽은 대형이 넓게 퍼져 평균보다 덜 맞고(계산 0.92~1.11 × 체력), 도로 끝은 대형이 눌려 더 맞는다(최대 평균의 1.54배).
//   그래서 상한 부대가 **어느 자리에 서도** 잡히는지를 나온 x · 가운데 240 · 양 끝 140/340 에서 실제 stepRun 으로 잠근다
//   (가운데에서 계산이 체력보다 조금 모자란 판도 실제로는 잡힌다 — 탄이 다가오는 적을 마주 날아가 조금 더 자주 맞는 몫(약 +15%)을 계산이 넣지 않기 때문)
test('BOUNTY-7: 계산 ↔ 실제(동작 확인) — 계산의 상한 부대(병력·무기·Mk)가 현상금 적 앞에 서서 쏘면 어느 자리(나온 x · 가운데 240 · 양 끝 140/340)에서도 닿기 전에 잡는다 · 나온 x 에서는 사거리에 든 시간의 35% 이상을 쓴다(r4.7 보정: 체력 계수 0.9 → 0.45 라 상한 부대는 창의 절반쯤에 잡는다 — 끝까지 쏴야 깨는 것은 상한의 절반쯤 되는 부대)', (t) => {
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    (st.bounties || []).forEach((b, i) => {
      const r = bountyFight(id, i);
      assert.equal(r.killed, true, `S${id} #${i}: ${(r.dealtPct * 100).toFixed(0)}%`);
      assert.ok(r.inSec >= 0.35 * b.sec, `S${id} #${i}: 사거리 안 ${r.inSec.toFixed(2)}초 / 계산 창 ${b.sec.toFixed(2)}초`);
      const at = [240, 140, 340].map((x) => [x, bountyFight(id, i, { holdX: x })]);
      for (const [x, q] of at) assert.equal(q.killed, true, `S${id} #${i} 자리 x ${x}: ${(q.dealtPct * 100).toFixed(0)}%`);
      t.diagnostic(`BOUNTY-FIGHT S${id} #${i} ${r.units}명 ${r.weapon} Mk${r.mk} 체력 ${r.hp} → 사거리 안 ${r.inSec.toFixed(2)}초에 처치(창 ${b.sec.toFixed(2)}초) · 자리별 ` +
                   at.map(([x, q]) => `x${x} ${q.inSec.toFixed(2)}초`).join(' · '));
    });
  }
});

test('BOUNTY-8: 그림·반응 규칙 — 피격 반응 역할은 장갑(표에 있는 역할) · 겉모습 상수(금색 테 = C.gold, 이름표 = BAL3.bounty.label) · 판정 반지름은 잡졸·돌격체·저격수보다 크다', () => {
  assert.equal(hitRole('bounty'), 'armor');
  assert.ok(BAL3.fx.hitRoles[hitRole('bounty')]);
  assert.equal(BOUNTY_LOOK.ring, BAL3.colors.gold);
  assert.equal(BOUNTY_LOOK.label, '현상금');
  for (const k of ['grunt', 'rusher', 'shooter']) assert.ok(B.r > BAL3.enemies[k].r, k);
  assert.ok(B.track < BAL3.squad.moveMax, '부대보다 느리게 따라온다');
  assert.ok(B.vz < BAL3.scroll + BAL3.enemies.grunt.vz, '잡졸(화면 214px/s)보다 천천히 내려온다');
});
