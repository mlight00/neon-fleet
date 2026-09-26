// rush3-r48-atk — r4.8 (나) 보스 공격 = 예고 + 안전 구역 보장 패턴(이사님 실플레이 3차, 2026-09-26).
//  이사님 원문: "적 보스의 공격 쏘는 패턴을 다양하게 만들자. 모든 보스가 같은 패턴의 같은 총알만 쏟아낸다." ·
//   "병사를 아무리 많이 모아도 보스에 가면 총알을 많이 쏟아부으니까 피할 수가 없이 모든 총알을 맞게 된다."
//  BOSS-DODGE = '피할 수 있음'의 기계적 증명(결정적 시뮬레이션) — 게임 줄 1~24 모든 판·모든 보스·모든 패턴 × 병력 1·30·60·100 × 시작 자리 3곳:
//   예고를 보고 표시된 안전 구역 가운데로 옮겨 간 부대는 그 공격에서 피해 0. 그리고 가만히 있는 부대는 맞을 수 있다(공격이 실제 위협).
//   ⚠️난이도 판단이 아니다(이사님 지시 "난이도는 너의 봇테스트로 하지 말도록") — 봇 승패를 잠그지 않는다.
//  BOSS-SAFE = 안전 구역 폭 ≥ 부대 폭 + 48 · 예고 시간 안에 닿는 거리 · 복수 보스 판은 동시에 공격 1개.
//  BOSS-VARIETY = 보스(스킨)마다 패턴 세트가 다르고 · 페이즈마다 새 패턴이 열리고 · 게임 줄에서 옛 조준 부채꼴은 쓰이지 않는다(배수 1 줄은 그대로).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BAL3 } from '../rush3/balance.js';
import { buildStage, ALL_STAGE_IDS } from '../rush3/stages.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { atkPlanFor, unlockedAtk, ATK_KINDS, ATK_DEFAULT_SKIN, overlaps, atkType } from '../rush3/bossatk.js';
import { createRenderer3, ATK_CHARGE, ATK_DANGER, ATK_LOOK } from '../rush3/render.js';
import { makeFx } from '../rush3/main.js';
import { pickInput } from './lib/rush3-policies.mjs';
import { bootApp } from './lib/rush3-shell.mjs';

const BA = BAL3.bossAtk;
const inp = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0 });
const halfW = (run) => run.units.reduce((m, u) => Math.max(m, Math.abs(u.dx)), 0) + BAL3.squad.unitR;
const NS = [1, 30, 60, 100];
//  r4.9 (가) 옛 초록 안전 구역 색(r4.8 ATK_SAFE) — 이제 어디에도 그려지지 않아야 한다
const OLD_GREEN = '#5CFF8A';
//  r4.9 (가) 봇이 안전 구역으로 가도 되는 때: 광역 = 경보가 보이는 순간부터 · 탄 = 탄이 보이는 순간(발사 뒤)부터 — 장전 중에는 모른다
const canSee = (cur) => !!(cur && cur.safe && (cur.type !== 'shot' || cur.state === 'act'));
const goX = (cur, x0) => (canSee(cur) ? (cur.safe[0] + cur.safe[1]) / 2 : x0);
//  공격 시작 이벤트: 광역 경보(bossTele) · 탄 장전(bossCharge)
const isStart = (e) => e.type === 'bossTele' || e.type === 'bossCharge';

//  보스전만 떼어 낸 판에서 보스 bi 가 패턴 kind 하나만 쓰게 세운다(다른 보스는 공격 차례에서 뺀다). 보스는 하강을 건너뛰어 자리(hold)에,
//   광장 보스는 부대 위쪽(240, +400)에서 추격. 보스 체력·소환·접촉·착지 충격은 끈다(그 공격의 피해만 센다). k = 이 패턴을 쓴 횟수(빈틈 위치 번갈이)
function atkRun(id, n, bi, kind, x0, k) {
  const st = buildStage(id, { difficulty: 'brutal' });
  const stage = { ...st, startUnits: n, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
  const run = createRun(stage, { heroGuard: true });
  run.z = run.prevZ = stage.eliteZ - 2;
  let steps = 0;
  while (!run.bosses.length && steps < 600) { stepRun(run, inp(x0), STEP); drainEvents(run); steps++; }
  for (const b of run.bosses) {
    b.hp = b.max = 1e9; b.summon = false;
    if (b.arena) { b.x = 240; b.z = run.z + 400; b.state = 'chase'; b.dashT = 1e9; }
    else { b.z = run.z + b.holdAhead; b.state = 'hold'; }
    if (b.index !== bi) b.atk = null;
  }
  if (run.arena) { run.arena.boss.touchDmg = 0; run.arena.boss.shock.dmg = 0; }
  const bo = run.bosses[bi];
  bo.atk = { ...bo.atk, seq: [kind], open: 1 };
  bo.atkK[kind] = k;
  run.hwCap = run.bossHw;
  run.bossAtk.wait = 1e9;
  for (let i = 0; i < 40; i++) { stepRun(run, inp(x0), STEP); drainEvents(run); }
  run.bossAtk.wait = 0; run.bossAtk.turn = bo.index;
  return { run, bo };
}
//  공격 한 번: mode 'move' = 안전 구역을 알게 되면(광역 = 경보 · 탄 = 발사 뒤 탄이 보일 때) 그 가운데로 · 'stay' = 제자리.
//   설계는 광역 = 경보 순간(bossTele), 탄 = 발사 순간(bossFire — 장전이 끝난 STEP 에 다시 설계한다)에 기록한다.
//   탄의 실제 비행 시간 flightT = 발사 순간 그 공격의 탄들이 부대 띠 앞끝(band[1])에 닿기까지 가장 이른 시간(아래로 내려오는 속도 vz 로).
//   장전만 하고 거둔 공격(다시 설계가 안 됨)은 '시작'으로 세지 않는다.
//   반환 { started, hurt(적탄·포격 피해 수), plan, x0(설계 때 중심), hw(설계 때 실제 반폭), flightT }
function playAttack(run, mode, x0) {
  let plan = null, hurt = 0, at = null, hw = null, flightT = null, opened = false;
  for (let i = 0; i < 60 * 12; i++) {
    const cur = run.bossAtk.cur;
    stepRun(run, inp(mode === 'move' ? goX(cur, x0) : x0), STEP);
    for (const e of drainEvents(run)) {
      if (isStart(e)) opened = true;
      const shotFire = e.type === 'bossFire' && run.bossAtk.cur && run.bossAtk.cur.type === 'shot';
      if ((e.type === 'bossTele' || shotFire) && run.bossAtk.cur) {
        plan = JSON.parse(JSON.stringify(run.bossAtk.cur)); at = run.x; hw = halfW(run);
        if (shotFire) {
          //  발사 STEP 에 탄은 이미 한 STEP 움직였다 — 그만큼 더한다
          const b1 = plan.band[1];
          const ts = run.eshots.filter((s) => s.atk === plan.serial && s.vz > 0).map((s) => (s.z - s.r - b1) / s.vz + STEP);
          flightT = ts.length ? Math.min(...ts) : null;
        }
      }
      if (e.type === 'hurt' && e.cause === 'shot') hurt++;
      if (e.type === 'bossAtkEnd') {
        if (e.cancelled && !plan) return { started: false, cancelled: true };
        return { started: !!plan, hurt, plan, x0: at, hw, flightT };
      }
    }
    if (!opened && i > 4) return { started: false };
  }
  return { started: !!plan, hurt, plan, x0: at, hw, flightT, unfinished: true };
}
//  판마다 보스·패턴 목록
function bossKinds(id) {
  const st = buildStage(id, { difficulty: 'brutal' });
  return st.elites.map((e, bi) => ({ bi, kinds: e.atk.seq, skin: e.skin ?? ATK_DEFAULT_SKIN, role: e.role ?? 'elite', arena: !!st.arena }));
}
//  BOSS-SAFE 규칙(설계 하나 + 설계 순간의 실제 부대). r4.9 (가): 닿는 시간 = 광역은 경보 초(0.7~0.9), 탄은 **실제 비행 시간**(발사 순간 탄들이 부대 띠에 닿기까지) —
//   설계의 reachT 가 실제 비행 시간을 넘지 않고, 안전 구역 가운데까지의 거리 ≤ moveMax × reachT × 0.8
function checkSafe(p, r, label) {
  const [s0, s1] = p.safe;
  const [e0, e1] = r.arena ? [40, 440] : [80, 400];
  assert.ok(r.hw <= p.hw + 1e-9, `${label}: 설계 반폭 ${p.hw} ≥ 실제 ${r.hw}`);
  assert.ok(s1 - s0 >= 2 * p.hw + BA.margin - 1e-9, `${label}: 안전 구역 폭 ${(s1 - s0).toFixed(1)} ≥ ${2 * p.hw + BA.margin}`);
  assert.ok(s0 >= e0 - 1e-9 && s1 <= e1 + 1e-9, `${label}: 안전 구역이 가장자리 안`);
  assert.equal(p.type, atkType(p.kind), `${label}: 종류`);
  if (p.type === 'shot') {
    assert.equal(p.tele, 0, `${label}: 탄 공격은 예고가 없다`);
    assert.ok(r.flightT != null && p.reachT <= r.flightT + 1e-6, `${label}: 설계 닿는 시간 ${p.reachT.toFixed(3)} ≤ 실제 비행 시간 ${r.flightT}`);
  } else {
    assert.ok(p.tele >= 0.7 && p.tele <= 0.9, `${label}: 경보 ${p.tele}초`);
    assert.equal(p.reachT, p.tele, `${label}: 광역 닿는 시간 = 경보`);
  }
  assert.ok(Math.abs(p.reachD - BAL3.squad.moveMax * p.reachT * BA.reachK) < 1e-9, `${label}: 닿는 거리 = moveMax × 시간 × 0.8`);
  assert.ok(Math.abs((s0 + s1) / 2 - r.x0) <= p.reachD + 1e-9, `${label}: 닿는 시간 안에 안전 구역 가운데까지`);
  for (const d of p.danger) assert.ok(!overlaps(d, p.safe), `${label}: 위험 ${d.map((v) => v.toFixed(1))} 과 안전 구역이 떨어져 있다`);
}

//  BOSS-DODGE — 판을 넷으로 나눠 돈다(한 검사가 너무 길지 않게)
const GROUPS = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18], [19, 20, 21, 22, 23, 24]];
const STAY_HIT = new Map();
for (const ids of GROUPS) {
  test(`BOSS-DODGE·BOSS-SAFE ${ids[0]}~${ids[ids.length - 1]}번: 모든 보스·모든 패턴 × 병력 1·30·60·100 × 시작 자리 3곳 — 안전 구역 가운데로 간 부대는 그 공격에서 피해 0 · 안전 구역 규칙`, (t) => {
    let sims = 0;
    for (const id of ids) {
      for (const b of bossKinds(id)) {
        const xs = b.arena ? [100, 240, 380] : [140, 240, 340];
        for (const kind of b.kinds) {
          for (const [ni, n] of NS.entries()) {
            let started = 0;
            for (const [xi, x0] of xs.entries()) {
              const k = (xi + ni) % 3;
              const label = `S${id} 보스${b.bi} ${kind} ${n}명 x${x0} k${k}`;
              const { run } = atkRun(id, n, b.bi, kind, x0, k);
              const r = playAttack(run, 'move', x0);
              sims++;
              if (!r.started) continue;
              started++;
              assert.ok(!r.unfinished, label + ': 공격이 끝난다');
              assert.equal(r.hurt, 0, label + ': 안전 구역 가운데로 간 부대는 피해 0');
              checkSafe(r.plan, { ...r, arena: b.arena }, label);
              if (n >= 30) {
                const s = atkRun(id, n, b.bi, kind, x0, k);
                const q = playAttack(s.run, 'stay', x0);
                const key = `S${id} 보스${b.bi} ${kind}`;
                STAY_HIT.set(key, (STAY_HIT.get(key) || 0) + (q.hurt > 0 ? 1 : 0));
              }
            }
            assert.ok(started > 0, `S${id} 보스${b.bi} ${kind} ${n}명: 시작 자리 3곳 중 한 곳 이상에서 공격이 시작된다(설계 가능)`);
          }
        }
      }
    }
    t.diagnostic(`시뮬레이션 ${sims}판`);
  });
}

test('BOSS-DODGE 위협: 가만히 있는 부대는 맞을 수 있다 — 모든 판·보스·패턴마다 병력 30·60·100 × 시작 자리 3곳 중 한 곳 이상에서 제자리 부대가 피해를 입는다', () => {
  for (const id of ALL_STAGE_IDS) for (const b of bossKinds(id)) for (const kind of b.kinds) {
    const key = `S${id} 보스${b.bi} ${kind}`;
    assert.ok((STAY_HIT.get(key) || 0) > 0, key + ': 제자리 부대가 한 번도 맞지 않았다');
  }
});

test('BOSS-SAFE 한 번에 한 공격: 복수 보스 판(10·23)과 광장(24) — 60초 동안 예고~끝 사이에 다른 예고가 없고, 보스가 번갈아 공격한다', () => {
  for (const id of [10, 23, 24]) {
    const st = buildStage(id, { difficulty: 'brutal' });
    const stage = { ...st, startUnits: 60, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
    const run = createRun(stage, { heroGuard: true });
    run.z = run.prevZ = stage.eliteZ - 2;
    let open = null, teles = 0, hurt = 0;
    const who = [];
    for (let i = 0; i < 60 * 60; i++) {
      const cur = run.bossAtk.cur;
      stepRun(run, inp(goX(cur, run.boss ? run.boss.x : 240)), STEP);
      for (const b of run.bosses) { if (b.hp < 1e8) b.hp = b.max = 1e9; b.summon = false; }
      if (run.arena) { run.arena.boss.touchDmg = 0; run.arena.boss.shock.dmg = 0; }
      for (const e of drainEvents(run)) {
        if (isStart(e)) { assert.equal(open, null, `S${id}: 앞 공격(${open})이 끝나기 전에 새 공격`); open = e.serial; teles++; who.push(e.id); }
        if (e.type === 'bossAtkEnd') { assert.equal(e.serial, open); open = null; }
        if (e.type === 'hurt' && e.cause === 'shot') hurt++;
      }
    }
    assert.ok(teles >= 6, `S${id}: 공격 ${teles}번`);
    assert.equal(hurt, 0, `S${id}: 예고마다 안전 구역으로 간 부대는 60초 내내 피해 0`);
    if (st.elites.length > 1) assert.equal(new Set(who).size, st.elites.length, `S${id}: 보스 ${st.elites.length}체가 모두 공격한다(차례)`);
    if (st.elites.length > 1) for (let i = 1; i < who.length; i++) assert.notEqual(who[i], who[i - 1], `S${id}: 같은 보스가 연달아 공격하지 않는다`);
  }
});

test('BOSS-VARIETY 배정표: 보스(스킨)마다 패턴 순서가 다르고 · 처음 열린 세트도 도로 스킨끼리 다르다 · 페이즈(50%·20%)마다 새 패턴이 하나씩 열린다 · 복수 보스 판은 보스끼리 다르다', () => {
  const road = ['B1_grader', 'B2_gantrywidow', 'B3_railleviathan', 'B4_smelter'].map((s) => atkPlanFor({ skin: s }, false));
  const arena = ['B3_railleviathan', 'B4_smelter', 'B5_crownbreaker'].map((s) => atkPlanFor({ skin: s }, true));
  const key = (p) => p.seq.join(',');
  assert.equal(new Set(road.map(key)).size, 4, '도로 스킨 4종 순서가 모두 다르다');
  assert.equal(new Set(road.map((p) => unlockedAtk(p, 0).slice().sort().join(','))).size, 4, '도로 스킨 4종의 처음 세트가 모두 다르다');
  assert.equal(new Set(arena.map(key)).size, 3, '광장 스킨 3종 순서가 모두 다르다');
  for (const p of arena) assert.deepEqual(unlockedAtk(p, 0).slice().sort(), ['burst', 'wall'], '광장 = ⑤ 산개탄 + ② 탄막 벽(+ 돌진·착지 충격)');
  assert.equal(new Set(road.concat(arena).map((p) => p.look)).size >= 4, true, '보스 스킨마다 탄 모양');
  assert.equal(new Set(Object.values(BA.skins).map((s) => s.look)).size, 5, '스킨 5종 탄 모양이 모두 다르다');
  //  페이즈마다 하나씩: 열린 수 = open, open+1, open+2 이고 늘 새 패턴(중복 없음)
  for (const id of ALL_STAGE_IDS) {
    const st = buildStage(id, { difficulty: 'brutal' });
    for (const e of st.elites) {
      const p = e.atk;
      assert.equal(new Set(p.seq).size, p.seq.length, `S${id}: 순서에 같은 패턴이 두 번 없다`);
      assert.equal(p.seq.length, p.open + BAL3.bossPhases.at.length, `S${id}: 페이즈 ${BAL3.bossPhases.at.length}단계마다 하나씩`);
      for (let ph = 1; ph <= BAL3.bossPhases.at.length; ph++) {
        const a = unlockedAtk(p, ph - 1), b = unlockedAtk(p, ph);
        assert.equal(b.length, a.length + 1);
        assert.ok(!a.includes(b[b.length - 1]), `S${id}: 페이즈 ${ph} 에서 새 패턴`);
      }
      for (const k of p.seq) assert.ok(ATK_KINDS.includes(k));
      if (!st.arena) assert.ok(!p.seq.includes('burst'), `S${id}: 산개탄은 광장 전용`);
    }
    if (st.elites.length > 1) assert.equal(new Set(st.elites.map((e) => e.atk.seq.join(','))).size, st.elites.length, `S${id}: 보스끼리 순서가 다르다`);
    assert.equal(buildStage(id).elites.some((e) => 'atk' in e), false, `S${id}: 배수 1 줄은 배정이 없다`);
  }
  //  모든 패턴이 어딘가에서 쓰인다 · 역할 표(포격 ②④ · 소환 ③ · 장갑 ①③)
  const used = new Set(ALL_STAGE_IDS.flatMap((id) => buildStage(id, { difficulty: 'brutal' }).elites.flatMap((e) => e.atk.seq)));
  assert.deepEqual([...used].sort(), [...ATK_KINDS].sort());
  assert.deepEqual(unlockedAtk(atkPlanFor({ role: 'gunner' }), 0), ['wall', 'sweep']);
  assert.deepEqual(unlockedAtk(atkPlanFor({ role: 'summoner', skin: 'B2_gantrywidow' }), 0), ['pillar']);
  assert.deepEqual(unlockedAtk(atkPlanFor({ role: 'tank', skin: 'B4_smelter' }), 0).slice().sort(), ['aim', 'pillar']);
});

test('BOSS-VARIETY 페이즈: 체력 50%·20% 아래로 내려가면 새 패턴이 실제로 나온다(4번 B1: ①② → +③ → +④) · 1·2번(페이즈 없는 학습 구간)은 처음 세트 그대로', () => {
  const run0 = (id) => {
    const st = buildStage(id, { difficulty: 'brutal' });
    const stage = { ...st, startUnits: 60, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
    const run = createRun(stage, { heroGuard: true });
    run.z = run.prevZ = stage.eliteZ - 2;
    return run;
  };
  const attacks = (run, count, hpFrac) => {
    const kinds = [];
    for (let i = 0; i < 60 * 90 && kinds.length < count; i++) {
      const cur = run.bossAtk.cur;
      stepRun(run, inp(goX(cur, run.boss ? run.boss.x : 240)), STEP);
      for (const b of run.bosses) { b.summon = false; b.hp = b.max * hpFrac; }
      for (const e of drainEvents(run)) if (isStart(e)) kinds.push(e.kind);
    }
    return kinds;
  };
  const r4 = run0(4);
  assert.deepEqual([...new Set(attacks(r4, 4, 0.9))].sort(), ['aim', 'wall']);
  const p1 = attacks(r4, 4, 0.45);
  assert.ok(p1.includes('pillar') && !p1.includes('sweep'), '50% 아래: ③ 기둥 포격이 열린다 ' + p1);
  const p2 = attacks(r4, 5, 0.15);
  assert.ok(p2.includes('sweep'), '20% 아래: ④ 쓸기가 열린다 ' + p2);
  const r1 = run0(1);
  assert.deepEqual([...new Set(attacks(r1, 6, 0.1))].sort(), ['aim', 'wall'], '1번은 페이즈가 없다(학습 구간 — BAL3.bossPhases.from 3)');
});

test('BOSS-VARIETY 부채꼴 없음: 게임 줄 1~24 보스는 조준 부채꼴(eshot n ≥ 3)을 쏘지 않고 패턴 탄(atk·look 칸)만 · 배수 1 줄 보스는 종전 부채꼴 그대로', () => {
  for (const id of ALL_STAGE_IDS) {
    for (const row of ['brutal', 'normal']) {
      const st = buildStage(id, { difficulty: row });
      const stage = { ...st, startUnits: 30, gateRows: [], supplies: [], spawns: [], walls: [], lottery: null, bonus: null };
      const run = createRun(stage, { heroGuard: true });
      run.z = run.prevZ = stage.eliteZ - 2;
      let fans = 0, pattern = 0;
      const looks = new Set();
      for (let i = 0; i < 60 * 14 && !run.over; i++) {
        stepRun(run, pickInput('planBoss', run), STEP);
        for (const b of run.bosses) { b.hp = b.max = 1e9; b.summon = false; }
        for (const u of run.units) u.hp = 1e9;
        for (const s of run.eshots) if (s.atk != null) { pattern++; looks.add(s.look); }
        for (const e of drainEvents(run)) if (e.type === 'eshot' && e.n >= 3) fans++;
      }
      if (row === 'brutal') {
        assert.equal(fans, 0, `S${id} 게임 줄: 부채꼴 없음`);
        assert.ok(run.bosses.every((b) => b.atk && !b.shoot), `S${id} 게임 줄: 모든 보스가 패턴`);
        const bossLooks = new Set(run.bosses.map((b) => b.atk.look));
        for (const l of looks) assert.ok(bossLooks.has(l), `S${id}: 탄 모양 ${l} = 보스 스킨의 모양`);
      } else {
        assert.ok(run.bosses.every((b) => !('atk' in b)) && !('bossAtk' in run), `S${id} 배수 1 줄: 패턴 칸 없음`);
        assert.equal(pattern, 0);
        if (run.bosses.some((b) => b.shoot)) assert.ok(fans > 0, `S${id} 배수 1 줄: 부채꼴 그대로`);
      }
    }
  }
});

//  호출 기록 ctx(rush3-render 와 같은 꼴): 호출마다 { op, args, fill, stroke, alpha }
function recCtx() {
  const ops = [], stack = [], grad = { addColorStop() {} };
  const state = { globalAlpha: 1, fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: '', textBaseline: '', canvas: null };
  const ctx = new Proxy(state, {
    get(t, k) {
      if (k in t) return t[k];
      if (typeof k !== 'string') return undefined;
      return (...args) => {
        if (k === 'save') stack.push({ ...t });
        if (k === 'restore') { const s = stack.pop(); if (s) Object.assign(t, s); }
        ops.push({ op: k, args, fill: t.fillStyle, stroke: t.strokeStyle, alpha: t.globalAlpha });
        if (k.startsWith('create')) return grad;
        if (k === 'measureText') return { width: 10 };
        return undefined;
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
  return { ctx, ops };
}
const drawRun = (run) => {
  const { ctx, ops } = recCtx();
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run, fx: makeFx(), hud: { distM: 0 }, buttons: [], saveOk: true });
  return ops;
};

const hasColor = (ops, c) => ops.some((o) => ((o.op === 'fill' || o.op === 'fillRect') && o.fill === c) || (o.op === 'stroke' && o.stroke === c));

test('BOSS-TELE 그림(r4.9 (가) 안내 규칙): 탄 공격(① 조준 대포 · ② 탄막 벽 · ④ 쓸기)은 장전 동안 보스 몸 번쩍임만 있고 도로에 붉은 표시·안전 구역이 없다(발사 뒤에도) · 광역(③ 기둥 · ⑤ 산개탄)만 붉은 경보 · 초록 안전 구역은 어디에도 없다 · 그리기는 run 을 읽기만 한다', () => {
  for (const [id, kind] of [[1, 'aim'], [1, 'wall'], [6, 'pillar'], [11, 'sweep'], [24, 'burst']]) {
    const { run, bo } = atkRun(id, 60, 0, kind, 240, 0);
    let n = 0;
    while (!run.bossAtk.cur && n++ < 30) { stepRun(run, inp(240), STEP); drainEvents(run); }
    const cur0 = run.bossAtk.cur;
    assert.equal(cur0 && cur0.kind, kind, `S${id} ${kind} 시작`);
    const snap = JSON.stringify(run);
    const ops = drawRun(run);
    assert.equal(JSON.stringify(run), snap, `S${id} ${kind}: 그리기 전후 run 이 같다`);
    assert.ok(!hasColor(ops, OLD_GREEN), `${kind}: 초록 안전 구역 없음`);
    if (atkType(kind) === 'shot') {
      assert.equal(cur0.state, 'charge', `${kind}: 탄 공격은 장전부터`);
      assert.ok(hasColor(ops, ATK_CHARGE), `${kind}: 장전 번쩍임(보스 몸)`);
      assert.ok(!hasColor(ops, ATK_DANGER), `${kind}: 장전 동안 도로에 붉은 표시 없음`);
      assert.ok(!('safe' in cur0) && !('danger' in cur0), `${kind}: 장전 중 공격 칸에 안전 구역·위험 자료가 없다(그릴 것이 없다)`);
      //  발사 뒤: 여전히 도로 표시 없음 · 탄은 보스 스킨 모양 색
      while (run.bossAtk.cur && run.bossAtk.cur.state === 'charge') { stepRun(run, inp(240), STEP); drainEvents(run); }
      const cur = run.bossAtk.cur;
      for (let i = 0; i < 6; i++) { stepRun(run, inp(goX(cur, 240)), STEP); drainEvents(run); }
      assert.ok(run.eshots.some((s) => s.atk === cur.serial), `${kind}: 발사`);
      const ops2 = drawRun(run);
      assert.ok(!hasColor(ops2, ATK_DANGER) && !hasColor(ops2, OLD_GREEN) && !hasColor(ops2, ATK_CHARGE), `${kind}: 발사 뒤에도 도로 안내 없음`);
      const look = ATK_LOOK[bo.atk.look];
      assert.ok(hasColor(ops2, look.color), `${kind}: 탄 모양 색 ${look.color}`);
    } else {
      assert.equal(cur0.state, 'tele', `${kind}: 광역은 경보부터`);
      assert.ok(hasColor(ops, ATK_DANGER), `${kind}: 붉은 경보 구역`);
      assert.ok(!hasColor(ops, ATK_CHARGE), `${kind}: 광역에는 장전 번쩍임이 없다`);
    }
  }
  //  소스에도 초록 안전 구역 색·상수가 남아 있지 않다
  const src = readFileSync(new URL('../rush3/render.js', import.meta.url), 'utf8');
  assert.ok(!src.includes('ATK_SAFE') && !src.includes(OLD_GREEN), 'render.js: 초록 안전 구역 상수·색 없음');
});

test('V3-SHELL-BOSSATK: 게임 화면(셸) — 1번 보스 탄 공격 = 장전음(bossCharge) + 보스 몸 번쩍임 · 도로에 붉은·초록 안내 없음 · 발사 뒤 주황 구슬 탄(B1) · 6번 광역(기둥) = 경보음(lotWarn) + 붉은 경보', async () => {
  const h = await bootApp({ withOps: true });
  h.app.startRun(1);
  h.frames(2);
  const run = h.app.getRun();
  //  보스 직전까지 건너뛰기(캡처 스크립트와 같은 도구 — 규칙은 그대로)
  run.z = run.prevZ = run.eliteZ - 4;
  run.spawnCursor = run.spawns.length; run.enemies.length = 0;
  let charge = false, flash = false, road = false, orb = false, chargeSfx = false, n = 0;
  while (h.app.getState() === 'run' && n++ < 60 * 40 && !(charge && orb)) {
    const r = h.app.getRun();
    for (const b of r.bosses) { b.hp = b.max = 1e9; }
    for (const u of r.units) u.hp = 1e9;
    h.app.input.state.pointerX = goX(r.bossAtk && r.bossAtk.cur, 240);
    h.ops.length = 0;
    const before = h.audio.played.length;
    h.frames(1);
    if (h.audio.played.slice(before).includes('bossCharge')) chargeSfx = true;
    if (r.bossAtk && r.bossAtk.cur && r.bossAtk.cur.state === 'charge') { charge = true; if (hasColor(h.ops, ATK_CHARGE)) flash = true; }
    if (hasColor(h.ops, ATK_DANGER) || hasColor(h.ops, OLD_GREEN)) road = true;
    if (h.ops.some((o) => o.op === 'fill' && o.fill === ATK_LOOK.orb.color)) orb = true;
  }
  assert.ok(charge && chargeSfx && flash, '장전 + 장전음 + 보스 몸 번쩍임');
  assert.ok(!road, '1번 보스(탄 공격만)의 공격 내내 도로에 붉은·초록 안내 없음');
  assert.ok(orb, 'B1 보스 탄 = 주황 구슬');
  //  광역(6번 B2 = ③ 기둥 포격이 처음): 경보음 + 붉은 경보
  const g = await bootApp({ withOps: true, unlockThrough: 5 });
  g.app.startRun(6);
  g.frames(2);
  const r6 = g.app.getRun();
  r6.z = r6.prevZ = r6.eliteZ - 4;
  r6.spawnCursor = r6.spawns.length; r6.enemies.length = 0;
  let tele = false, red = false, warn = false, m = 0;
  while (g.app.getState() === 'run' && m++ < 60 * 40 && !(tele && red && warn)) {
    const r = g.app.getRun();
    for (const b of r.bosses) { b.hp = b.max = 1e9; }
    for (const u of r.units) u.hp = 1e9;
    g.app.input.state.pointerX = goX(r.bossAtk && r.bossAtk.cur, 240);
    g.ops.length = 0;
    const before = g.audio.played.length;
    g.frames(1);
    if (g.audio.played.slice(before).includes('lotWarn')) warn = true;
    if (r.bossAtk && r.bossAtk.cur && r.bossAtk.cur.state === 'tele') { tele = true; if (hasColor(g.ops, ATK_DANGER)) red = true; }
    assert.ok(!hasColor(g.ops, OLD_GREEN), '초록 안전 구역 없음');
  }
  assert.ok(tele && red && warn, '광역 경보 + 경보음 + 붉은 경보 구역');
});

test('V3-PURE-BOSSATK: rush3/bossatk.js 는 난수·시계·저장·코인·화면이 없고, 난이도 이름·적 표(BAL3.enemies)를 읽지 않는다 · combat.js 의 stepRun 이후 규약(DIFF-6) 그대로', () => {
  const code = readFileSync(new URL('../rush3/bossatk.js', import.meta.url), 'utf8');
  for (const s of ['Math.random', 'Date.', 'performance.', 'localStorage', 'document', 'window', 'BAL3.enemies', 'difficult', 'save.js', 'coins.js', 'wallet']) assert.ok(!code.includes(s), 'bossatk.js: ' + s);
  assert.doesNotMatch(code, /import[^;]*from\s*['"][^'"]*rng\.js['"]/);
  const src = readFileSync(new URL('../rush3/combat.js', import.meta.url), 'utf8');
  const tail = src.slice(src.indexOf('export function stepRun'));
  for (const s of ['BAL3.enemies', 'EN[', 'EN.', 'difficult']) assert.ok(!tail.includes(s), 'DIFF-6: ' + s);
});
