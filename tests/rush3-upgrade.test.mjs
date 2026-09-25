// rush3-upgrade — r4.4(v4 ④단계 (b)) 판 밖 로봇 강화: 효과·구매 규칙·추가 탄 규칙. 이사 지시(원문) "강화는 메인 로봇에만 적용되도록".
//  이사님 결정: D1 = (다) 메인 로봇 전용 무기 3트랙(직격 화력·연사·다연발) · N3 = (나) "다연발로 늘어난 탄에는 gateHit: 0 과 추가 탄 표시를 실어,
//  게이트 숫자와 증원 설비 발판을 올리지 않게 합니다. 적과 일반 보급 통 내구에는 효과가 있습니다. 로봇의 원래 탄 1발은 +1 을 유지합니다"(기획 v4.1 0장).
//  묶음: UP-EQ(강화 0 = 옵션 없음과 같은 판) · UP-EFFECT(로봇 탄만 강해짐) · UP-INT(소수 피해 여유값 뒤 처치 탄 수 = 계산값) ·
//   UP-GATE-B(추가 탄: 게이트 0·증원 설비 발판 0·적/일반 통 피해·0 증가 명중 연출 없음) · UP-BUY(비용·잔액 부족·최대 단계·한 번 저장) ·
//   SAVE-MIGRATE(옛 v3 저장 + 지갑 없음 → 코인 0·강화 0, 해금 연속 인정) · V3-PURE-META.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRun, stepRun, drainEvents, STEP, extraOffset } from '../rush3/combat.js';
import { buildStage, ALL_STAGE_IDS, stageVersion } from '../rush3/stages.js';
import { makeBullet, weaponStats } from '../rush3/weapons.js';
import { makeSupply, hitSupply, applySupplyReward } from '../rush3/supply.js';
import { hitBonusTarget } from '../rush3/bonus.js';
import { makeUnit, layoutUnits } from '../rush3/squad.js';
import { UP_TRACKS, UP_COST, UP_MAX, UP_EFFECT, normUp, hasUp, nextCost, canBuy, buyBlock, buy, effects } from '../rush3/meta.js';
import { createSave3, KEY3, WALLET_KEY } from '../rush3/save.js';
import { boot, dmgText } from '../rush3/main.js';
import { EXTRA_BULLET_COLOR, createRenderer3 } from '../rush3/render.js';
import { playPolicy } from './lib/rush3-policies.mjs';
import { V4_BOTS, V4_FIXTURE, v4RealRun } from './lib/rush3-v4real.mjs';

const NONE = { pointerX: null, dragDx: 0, keyDir: 0 };
const at = (x) => ({ pointerX: x, dragDx: 0, keyDir: 0 });
const Z0 = { power: 0, rate: 0, multi: 0 };
const stepOnce = (run, input = NONE) => { stepRun(run, input, STEP); return drainEvents(run); };
//  최소 도로 스테이지(적·게이트·통 없음, 끝없는 길) — o 로 덮어쓴다
function road(startUnits, o = {}) {
  return { id: 'tu', version: 1, title: 'up', startUnits, startWeapon: o.weapon ?? 'rifle', length: 1e6, eliteZ: null,
           gateRows: o.gateRows ?? [], supplies: o.supplies ?? [], walls: [], spawns: o.spawns ?? [], elites: o.elites ?? [], elite: (o.elites ?? [])[0] ?? null, arena: null };
}
//  한 STEP 에 새로 생긴 탄(발사 직후, 이동 전 모습은 아니지만 필드 비교에는 충분 — pz 는 출발점)
function firedIn(run, fn) {
  const before = new Set(run.bullets);
  fn();
  return run.bullets.filter((b) => !before.has(b));
}

// ─────────────────────────────── UP-EQ ───────────────────────────────

test('UP-EQ: 강화 0·heroGuard false 면 옵션 없이 부른 판과 완전히 같다 — 24판 × 기본 줄·배수 1 줄 × 봇(유닛 id·hp·자리·탄 수·게이트·이벤트까지)', () => {
  const pick = (r) => ({ won: r.run.won, over: r.run.over, steps: r.steps, units: r.run.units.map((u) => [u.id, u.hp, u.dx, u.dy, u.fireT]), kills: r.run.kills,
                         time: r.run.time, z: r.run.z, x: r.run.x, weapon: r.run.weapon, mk: r.run.weaponMk, bullets: r.run.bullets.length, peak: r.run.peak,
                         loss: [r.run.lossByGate, r.run.lossByShot, r.run.lossByTouch, r.run.lossByShock], gates: r.gates, opened: r.opened, events: r.events,
                         up: r.run.up, heroUp: r.run.heroUp });
  for (const diff of ['brutal', 'normal']) {
    for (const id of ALL_STAGE_IDS) {
      const bot = V4_BOTS[id % V4_BOTS.length];
      const a = playPolicy(id, bot, 14400, diff);
      const b = playPolicy(id, bot, 14400, diff, undefined, { heroGuard: false, up: { ...Z0 } });
      assert.deepEqual(pick(b), pick(a), `${diff}/${id}/${bot}`);
      assert.deepEqual(a.run.up, Z0); assert.equal(a.run.heroUp, null, '강화 0 = 효과 없음(사격이 종전 한 경로)');
    }
  }
  //  셸 실제 설정(heroGuard) + 강화 0 을 **명시**해도 V4-REAL 기준값과 같다(셸은 지갑의 up 을 늘 넘긴다)
  const fx = JSON.parse(readFileSync(V4_FIXTURE, 'utf8'));
  for (const bot of V4_BOTS) for (const id of ALL_STAGE_IDS) assert.deepEqual(v4RealRun(id, bot, { heroGuard: true, up: { ...Z0 } }), fx.runs[bot + '/' + id], `V4-REAL ${bot}/${id}`);
  //  정규화: 이상한 값은 0·최대로
  assert.deepEqual(createRun(road(1), { up: { power: 9, rate: -1, multi: 2.7 } }).up, { power: 5, rate: 0, multi: 2 });
  assert.deepEqual(createRun(road(1), { up: 'x' }).up, Z0);
  assert.equal(createRun(road(1), { up: { power: 0.5 } }).heroUp, null, '버림 뒤 0 이면 효과 없음');
});

// ─────────────────────────────── UP-EFFECT ───────────────────────────────

test('UP-EFFECT: 직격 화력은 로봇 탄의 dmg 만 × (1 + 0.3k)(무기 + Mk 로 만든 뒤 곱한다) — 병사 탄은 makeBullet 그대로', () => {
  for (const [weapon, mk] of [['rifle', 1], ['auto', 3], ['heavy', 2], ['sniper', 1]]) {
    for (let k = 0; k <= UP_MAX.power; k++) {
      const run = createRun(road(6, { weapon }), { startWeapon: weapon, startMk: mk, up: { power: k } });
      for (const u of run.units) u.fireT = 0;   // 이번 STEP 에 모두 한 번 쏜다
      const fired = firedIn(run, () => stepOnce(run));
      const hero = fired.filter((b) => b.ownerId === 1), soldiers = fired.filter((b) => b.ownerId !== 1);
      const base = weaponStats(weapon, mk).dmg;
      assert.equal(hero.length, 1); assert.equal(soldiers.length, 5);
      assert.equal(hero[0].dmg, base * (1 + 0.3 * k), `${weapon} Mk${mk} 화력 ${k}: 로봇 dmg`);
      for (const b of soldiers) {
        const ref = makeBullet(weapon, 0, 0, b.ownerId, mk);
        assert.equal(b.dmg, ref.dmg, '병사 dmg 그대로'); assert.equal(b.gateHit, 1); assert.ok(!('extra' in b));
      }
      assert.equal(hero[0].gateHit, 1, '로봇의 원래 탄은 게이트 +1 유지');
    }
  }
});

test('UP-EFFECT: 연사는 로봇 발사 간격만 × 0.87^k — 10초 동안 로봇 발사 수 ≈ 10 ÷ (0.5 × 0.87^k), 병사는 20발 그대로', () => {
  for (let k = 0; k <= UP_MAX.rate; k++) {
    const run = createRun(road(4), { up: { rate: k } });
    const counts = new Map();
    for (let i = 0; i < 600; i++) for (const b of firedIn(run, () => stepOnce(run))) counts.set(b.ownerId, (counts.get(b.ownerId) ?? 0) + 1);
    const want = 10 / (0.5 * Math.pow(0.87, k));
    assert.ok(Math.abs(counts.get(1) - want) <= 1, `연사 ${k}: 로봇 ${counts.get(1)}발 ≈ ${want.toFixed(2)}`);
    for (const id of [2, 3, 4]) assert.equal(counts.get(id), 20, `연사 ${k}: 병사 ${id} = 20발`);
  }
  assert.equal(effects({ rate: 5 }).intervalMul, Math.pow(0.87, 5));
});

test('UP-EFFECT: 다연발 k 는 로봇이 한 번 쏠 때 추가 탄 k 발(옆 12px, 원래 탄 기준 +12·−12·+24), 추가 탄 = gateHit 0 + extra · 산탄포는 부채꼴 통째 복제 · 광장 조준탄은 조준 방향에 수직으로', () => {
  assert.deepEqual([1, 2, 3, 4].map((k) => extraOffset(k, 12)), [12, -12, 24, -24]);
  for (let k = 0; k <= UP_MAX.multi; k++) {
    const run = createRun(road(3), { up: { multi: k, power: 1 } });
    for (const u of run.units) u.fireT = 0;
    const fired = firedIn(run, () => stepOnce(run));
    const hero = fired.filter((b) => b.ownerId === 1);
    assert.equal(hero.length, 1 + k, `다연발 ${k}`);
    const [orig, ...extra] = hero;
    assert.equal(orig.gateHit, 1); assert.ok(!orig.extra);
    assert.deepEqual(extra.map((b) => Math.round((b.x - orig.x) * 1e6) / 1e6), [12, -12, 24].slice(0, k), '옆 자리');
    for (const b of extra) {
      assert.equal(b.gateHit, 0); assert.equal(b.extra, true);
      assert.equal(b.z, orig.z); assert.equal(b.vz, orig.vz); assert.equal(b.dmg, orig.dmg, '추가 탄도 직격 화력이 붙은 같은 피해');
    }
    assert.equal(fired.filter((b) => b.ownerId !== 1).length, 2, '병사는 한 발씩');
    assert.ok(fired.filter((b) => b.ownerId !== 1).every((b) => !b.extra && b.gateHit === 1));
  }
  //  산탄포: 부채꼴 3발 × (1 + k) — 각도(vx)마다 원래 탄 + 추가 탄 k 발이 같은 vx 로
  const sc = createRun(road(1, { weapon: 'scatter' }), { startWeapon: 'scatter', up: { multi: 2 } });
  sc.units[0].fireT = 0;
  const sf = firedIn(sc, () => stepOnce(sc));
  assert.equal(sf.length, 9);
  const byVx = new Map();
  for (const b of sf) { const key = Math.round((b.vx ?? 0) * 1e6); (byVx.get(key) ?? byVx.set(key, []).get(key)).push(b); }
  assert.equal(byVx.size, 3, '세 각도');
  for (const g of byVx.values()) { assert.equal(g.length, 3); assert.equal(g.filter((b) => b.extra).length, 2); assert.equal(g.filter((b) => b.gateHit === 1).length, 1); }
  //  광장 조준탄: 추가 탄은 조준 방향(원래 탄 속도 벡터)에 수직으로 12px
  const ar = createRun(buildStage(15, { difficulty: 'brutal' }), { up: { multi: 1 } });
  ar.spawnCursor = ar.spawns.length; ar.gateRows = []; ar.supplies = []; ar.z = ar.elites[0].z; ar.prevZ = ar.z;
  stepOnce(ar);
  assert.equal(ar.phase, 'arena');
  ar.boss.x = ar.x + 150; ar.units.length = 1; ar.units[0].fireT = 0;
  const af = firedIn(ar, () => stepOnce(ar)).filter((b) => b.ownerId === 1);
  assert.equal(af.length, 2);
  const [o, e] = af;
  assert.equal(o.aimed, true); assert.equal(e.aimed, true); assert.equal(e.extra, true);
  //  같은 STEP 에 함께 움직였으므로 두 탄의 차이 = 출발점 차이(조준 방향 성분 0 = 수직, 크기 12)
  const along = (e.x - o.x) * o.vx + (e.z - o.z) * o.vz;
  assert.ok(Math.abs(along) < 1e-6, '조준 방향 성분 0(수직)');
  assert.ok(Math.abs(Math.hypot(e.x - o.x, e.z - o.z) - 12) < 1e-6, '간격 12');
  assert.equal(e.vx, o.vx); assert.equal(e.vz, o.vz);
});

test('UP-EFFECT: 직격 화력은 폭발·연쇄에는 붙지 않는다(무기 정의 값) · 로봇이 쓰러진 끈 판에서는 강화가 병사에게 넘어가지 않는다', () => {
  //  중화기 로봇(화력 2 = 직격 4.8)이 붙어 선 잡졸 둘 중 하나를 맞히면 직격 4.8, 옆 적 폭발 1(blastDmg 그대로)
  const run = createRun(road(1, { weapon: 'heavy', spawns: [{ z: 5, kind: 'grunt', n: 2, xs: [240, 262], zs: [260, 260], hp: 20 }] }), { startWeapon: 'heavy', up: { power: 2 } });
  let hit = null;
  for (let i = 0; i < 200 && !hit; i++) { const ev = stepOnce(run, at(240)); if (ev.some((e) => e.type === 'blast')) hit = ev; }
  assert.ok(hit, '폭발');
  const direct = hit.find((e) => e.type === 'enemyHit' && !e.blast), blastHit = hit.find((e) => e.type === 'enemyHit' && e.blast);
  assert.equal(direct.dmg, 3 * 1.6);
  assert.equal(blastHit.dmg, 1, '폭발 피해는 강화와 무관');
  //  끈 판: 로봇이 쓰러지면 중심에 선 병사는 강화 없이 쏜다
  const off = createRun(road(3), { up: { power: 5, multi: 3 }, difficulty: 'brutal' });
  for (const u of off.units) u.fireT = 1e9;
  const z = off.z + 12;
  off.eshots.push({ x: off.x, z, px: off.x, pz: z, vx: 0, vz: 1200, dmg: 3, r: 5, dead: false });
  stepOnce(off);
  assert.equal(off.units.some((u) => u.hero), false, '로봇이 쓰러졌다');
  for (const u of off.units) u.fireT = 0;
  const after = firedIn(off, () => stepOnce(off));
  assert.equal(after.length, 2);
  assert.ok(after.every((b) => b.dmg === 1 && !b.extra), '병사 탄 그대로');
});

// ─────────────────────────────── UP-INT ───────────────────────────────

test('UP-INT: 소수 피해 여유값 뒤 처치 탄 수 = 계산값 — 체력 8·피해 1.6 → 5발, 보스 330·피해 2.2 → 150발(여유값 없이 빼면 6·151발)', () => {
  //  여유값 없는 단순 뺄셈은 한 발 더 든다(기획 v4.1 3-4 (가) — 이 검사가 무엇을 막는지 먼저 확인)
  const naive = (hp, d) => { let n = 0; while (hp > 0) { hp -= d; n++; } return n; };
  const d16 = 1 * effects({ power: 2 }).dmgMul, d22 = 1 * effects({ power: 4 }).dmgMul;
  assert.equal(naive(8, d16), 6); assert.equal(naive(330, d22), 151);
  //  ① 잡졸 hp 8 ← 로봇(소총, 화력 2)이 직접 쏜다
  const run = createRun(road(1, { spawns: [{ z: 5, kind: 'grunt', n: 1, xs: [240], zs: [700], hp: 8 }] }), { up: { power: 2 } });
  const hits = [];
  let killed = false;
  for (let i = 0; i < 2000 && !killed; i++) for (const e of stepOnce(run, at(240))) { if (e.type === 'enemyHit') hits.push(e); if (e.type === 'kill') killed = true; }
  assert.ok(killed);
  assert.equal(hits.length, 5, '5발'); assert.ok(hits.every((e) => e.dmg === d16));
  assert.equal(hits.at(-1).hp, 0, '마지막 잔량은 0 으로 본다');
  //  ② 보스 hp 330 ← 피해 2.2 탄(로봇 화력 4 탄과 같은 값)을 한 STEP 에 한 발씩
  const br = createRun(road(1, { elites: [{ z: 5, hp: 330 }] }));
  br.units[0].fireT = 1e9;
  while (!br.boss) stepOnce(br);
  br.boss.shoot = false; br.boss.summon = false;
  let bossHits = 0, dead = false;
  for (let i = 0; i < 400 && !dead; i++) {
    const bo = br.boss;
    const b = makeBullet('rifle', bo.x, bo.z - bo.r - 8, 1); b.dmg *= effects({ power: 4 }).dmgMul;
    br.bullets.push(b);
    for (const e of stepOnce(br)) { if (e.type === 'enemyHit' && e.id === 'b1') bossHits++; if (e.type === 'bossKill') dead = true; }
  }
  assert.ok(dead); assert.equal(bossHits, 150, '150발');
  //  ③ 보급 통 내구 8·보너스 표적 hp 8 도 같은 비교(피해 1.6 → 5발)
  const s = makeSupply({ id: 'c', z: 300, x: 240, kind: 'soldier', durability: 8, payload: { n: 1 } });
  const srun = { z: 400, prevZ: 399, x: 240, units: [makeUnit(1)], nextUnitId: 2, weapon: 'rifle', pendingRewards: [] };
  let sh = 0;
  while (!s.opened && sh < 20) { hitSupply(s, { x: 240, z: 300, pz: 300, dmg: d16, gateHit: 1, dead: false }, [], srun); sh++; }
  assert.equal(sh, 5, '통 5발');
  const brun = { bonus: { hits: 0, score: 0, tier: 0 }, bonusDef: { tiers: [5, 10, 20] } };
  const t = { id: 't1', hp: 8, max: 8, value: 1, alive: true, respawn: 1, x: 0, z: 0 };
  let th = 0;
  while (t.alive && th < 20) { hitBonusTarget(brun, t, { dmg: d16, dead: false }, []); th++; }
  assert.equal(th, 5, '보너스 표적 5발');
  //  정수 피해는 종전 그대로(체력 8 ← 1 = 8발)
  assert.equal(naive(8, 1), 8);
});

// ─────────────────────────────── UP-GATE-B ───────────────────────────────

test('UP-GATE-B: 추가 탄은 게이트 수치를 올리지 않고(gateHit 이벤트 gain 0) 닿으면 사라진다 — 원래 탄만 +1', () => {
  const gate = { id: 'g', z: 400, h: 24, maxValue: 15, armZ: null, cells: [{ x0: 80, x1: 400, value: -12 }] };
  const run = createRun(road(1, { gateRows: [gate] }), { up: { multi: 3 } });
  const gh = [];
  //  통과(run.z ≥ 400) 전까지 — 로봇 혼자 0.5초마다 한 번(원래 1 + 추가 3)
  for (let i = 0; i < 110; i++) for (const e of stepOnce(run, at(240))) if (e.type === 'gateHit' || e.type === 'gateFlip') gh.push(e);
  assert.equal(run.gateRows[0].passed, false);
  const up = gh.filter((e) => e.gain === 1), zero = gh.filter((e) => e.gain === 0);
  assert.ok(up.length >= 2, '원래 탄 명중 ' + up.length);
  assert.equal(zero.length, 3 * up.length, '추가 탄 3발 = gain 0 세 번');
  assert.equal(run.gateRows[0].cells[0].value, -12 + up.length, '값 = 원래 탄 수만큼만');
  assert.ok(zero.every((e) => e.type === 'gateHit'), '0 증가 명중은 뒤집힘(gateFlip)이 아니다');
  assert.ok(!run.bullets.some((b) => b.extra && b.z > 400 + 12 && b.x >= 80 && b.x < 400), '게이트 뒤로 넘어간 추가 탄이 없다(닿으면 사라짐)');
});

test('UP-GATE-B: 증원 설비(chain) — 열린 뒤 추가 탄은 발판을 늘리지 않고(대기 발판 포함) 원래 탄만 +1 · 열리기 전 내구와 일반 통·적에는 추가 탄도 피해', () => {
  const chain = () => makeSupply({ id: 'ch', z: 2800, x: 240, kind: 'chain', durability: 10, payload: { pads0: 5, maxPads: 15 } });
  const runOf = () => { const r = { z: 0, prevZ: 0, x: 240, units: [makeUnit(1)], nextUnitId: 2, weapon: 'rifle', pendingRewards: [], missedSupplies: 0, badGatesPassed: 0, lossByGate: 0 }; layoutUnits(r.units); return r; };
  const b = (extra, dmg = 1) => ({ x: 240, z: 2800, pz: 2800, dmg, dead: false, gateHit: extra ? 0 : 1, ...(extra ? { extra: true } : {}) });
  //  열리기 전: 추가 탄도 내구를 깎는다(일반 보급 통 효과)
  const s = chain(), run = runOf(), ev = [];
  for (let i = 0; i < 10; i++) hitSupply(s, b(true), ev, run);
  assert.equal(s.opened, true, '추가 탄 10발로 열림(내구 효과)');
  //  열린 뒤·활성화 전(같은 STEP): 추가 탄은 대기 발판(queuedPads)을 늘리지 않는다
  const q0 = s.queuedPads;
  hitSupply(s, b(true), ev, run); hitSupply(s, b(false), ev, run);
  assert.equal(s.queuedPads, q0 + 1, '대기 발판은 원래 탄 1발만');
  applySupplyReward(run.pendingRewards[0], run, ev, { supplies: [s] });
  const pads = s.pads.length;
  const x1 = b(true), x2 = b(false);
  assert.equal(hitSupply(s, x1, ev, run), true); assert.equal(x1.dead, true, '추가 탄은 흡수(사라짐)');
  assert.equal(s.pads.length, pads, '추가 탄 = 발판 0');
  hitSupply(s, x2, ev, run);
  assert.equal(s.pads.length, pads + 1, '원래 탄 = 발판 +1');
  //  일반 보급 통: 추가 탄의 피해(직격 화력 포함)가 내구를 깎는다
  const crate = makeSupply({ id: 'c1', z: 2100, x: 240, kind: 'soldier', durability: 10, payload: { n: 2 } });
  hitSupply(crate, { ...b(true, 1.3), z: 2100, pz: 2100 }, [], runOf());
  assert.ok(Math.abs(crate.durability - 8.7) < 1e-12);
  //  적: 로봇(다연발 1)의 원래 탄(x 240)과 추가 탄(x 252)이 같은 잡졸에 맞는다(간격 12 < 잡졸 반지름 + 탄 반폭) — 명중 이벤트의 탄 x(bx)로 가른다
  const er = createRun(road(1, { spawns: [{ z: 5, kind: 'grunt', n: 1, xs: [240], zs: [600], hp: 50 }] }), { up: { multi: 1 } });
  const bx = [];
  for (let i = 0; i < 300; i++) for (const e of stepOnce(er, at(240))) if (e.type === 'enemyHit') bx.push(Math.round(e.bx));
  const o240 = bx.filter((x) => x === 240).length, x252 = bx.filter((x) => x === 252).length;
  assert.ok(o240 >= 2, '원래 탄 명중 ' + o240);
  assert.ok(Math.abs(x252 - o240) <= 1, `추가 탄도 적에 맞는다(원래 ${o240} · 추가 ${x252})`);
});

test('UP-GATE-B: 셸 — gain 0 게이트 명중에는 흰 번쩍임·숫자음(gateTick)이 없고, gain 1 은 종전대로 · 추가 탄은 다른 색으로 그린다', async () => {
  const played = [];
  const audio = { unlock() {}, sfx(n) { played.push(n); return true; }, bgmPlay() {}, bgmPause() {}, bgmResume() {}, setVolume() {}, getVolume() { return 1; }, setMuted() {}, isMuted() { return false; }, duck() {} };
  const canvas = { width: 480, height: 800, getContext: () => new Proxy({ canvas: null }, { get(t, k) { if (k in t) return t[k]; if (typeof k !== 'string') return undefined; return () => (k.startsWith('create') ? { addColorStop() {} } : k === 'measureText' ? { width: 8 } : undefined); }, set(t, k, v) { t[k] = v; return true; } }),
                   getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }), addEventListener() {} };
  const queue = [];
  let nowMs = 1000;
  const app = boot(canvas, { win: { devicePixelRatio: 1, location: { search: '' }, addEventListener() {} }, doc: null, raf: (f) => queue.push(f), now: () => nowMs,
                             save: createSave3({ getItem: () => null, setItem() {} }), audio, dateNow: () => 1_700_000_000_000, sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  const frames = (n) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  app.startRun(1);
  frames(2);
  const run = app.getRun();
  assert.equal(run.gateRows[0].id, 'g1');
  played.length = 0;
  run.events.push({ type: 'gateHit', id: 'g1', idx: 0, value: 3, x: 320, gain: 0 });
  frames(1);
  assert.equal(app.getFx().gateFlash['g1:0'], undefined, 'gain 0: 번쩍임 없음');
  assert.ok(!played.includes('gateTick'), 'gain 0: 숫자음 없음');
  run.events.push({ type: 'gateHit', id: 'g1', idx: 0, value: 4, x: 320, gain: 1 });
  frames(1);
  assert.ok(app.getFx().gateFlash['g1:0'] > 0, 'gain 1: 번쩍임');
  assert.ok(played.includes('gateTick'), 'gain 1: 숫자음');
  //  그림: 추가 탄(extra)만 EXTRA_BULLET_COLOR 로 칠한다(그림이 없는 Node = 폴백 막대의 fillStyle)
  const ops = [];
  const st = { canvas: null, fillStyle: '' };
  const ctx = new Proxy(st, { get(t, k) { if (k in t) return t[k]; if (typeof k !== 'string') return undefined; return (...a) => { ops.push({ op: k, fill: t.fillStyle }); return k.startsWith('create') ? { addColorStop() {} } : k === 'measureText' ? { width: 8 } : undefined; }; }, set(t, k, v) { t[k] = v; return true; } });
  const r2 = createRun(road(1), { up: { multi: 1 } });
  r2.units[0].fireT = 0;
  stepOnce(r2);
  assert.equal(r2.bullets.filter((b) => b.extra).length, 1);
  createRenderer3(ctx, null).draw({ state: 'run', now: 1, run: r2, fx: { parts: [], floaters: [], pops: [], gateFlash: {}, gateOpen: {}, gateTip: {}, shakeT: 0, hurtT: 0, guideT: 0, eliteT: 0, shutterT: 0, shutterText: null, lotOpen: 0 }, hud: { distM: 1 }, buttons: [], saveOk: true });
  const rects = ops.filter((o) => o.op === 'fillRect');
  assert.equal(rects.filter((o) => o.fill === EXTRA_BULLET_COLOR).length, 1, '추가 탄 1발 = 연보라 막대 1');
  assert.ok(rects.some((o) => o.fill === '#F6C84A'), '원래 탄 = 소총색');
});

// ─────────────────────────────── UP-BUY ───────────────────────────────

test('UP-BUY: 비용표(출발값) 다연발 40·120·250 / 직격 화력·연사 40·80·140·220·330 · 잔액 부족·최대 단계·모르는 트랙은 그대로 + 이유 · 효과 수치', () => {
  assert.deepEqual(UP_TRACKS, ['power', 'rate', 'multi']);
  assert.deepEqual(UP_COST, { multi: [40, 120, 250], power: [40, 80, 140, 220, 330], rate: [40, 80, 140, 220, 330] });
  assert.deepEqual(UP_MAX, { power: 5, rate: 5, multi: 3 });
  assert.deepEqual(UP_EFFECT, { powerStep: 0.3, rateMul: 0.87, multiGap: 12 });
  //  단계별 다음 비용
  for (const t of UP_TRACKS) {
    for (let k = 0; k <= UP_MAX[t]; k++) assert.equal(nextCost({ [t]: k }, t), k < UP_MAX[t] ? UP_COST[t][k] : null, `${t} ${k}`);
  }
  assert.equal(nextCost(Z0, 'speed'), null);
  //  잔액 경계
  const w = { coins: 39, up: { ...Z0 }, runNo: 3, paid: ['3:main'], firstClears: [1] };
  assert.equal(buyBlock(w, 'multi'), 'coins'); assert.equal(canBuy(w, 'multi'), false);
  const r0 = buy(w, 'multi');
  assert.equal(r0.ok, false); assert.equal(r0.reason, 'coins'); assert.equal(r0.wallet, w, '살 수 없으면 같은 지갑 그대로'); assert.equal(r0.cost, 40);
  const w40 = { ...w, coins: 40 };
  assert.equal(canBuy(w40, 'multi'), true);
  const r1 = buy(w40, 'multi');
  assert.deepEqual(r1, { wallet: { coins: 0, up: { power: 0, rate: 0, multi: 1 }, runNo: 3, paid: ['3:main'], firstClears: [1] }, ok: true, reason: null, cost: 40, track: 'multi' });
  assert.deepEqual(w40.up, Z0, '원래 지갑은 고치지 않는다(새 지갑)');
  //  최대 단계
  const wm = { coins: 9999, up: { power: 5, rate: 5, multi: 3 } };
  for (const t of UP_TRACKS) { const r = buy(wm, t); assert.equal(r.ok, false); assert.equal(r.reason, 'max'); assert.equal(r.wallet, wm); }
  assert.equal(buy(wm, 'speed').reason, 'track');
  //  한 트랙을 끝까지: 합계 = 비용표 합
  for (const t of UP_TRACKS) {
    let x = { coins: 5000, up: { ...Z0 } }, spent = 0;
    for (;;) { const r = buy(x, t); if (!r.ok) { assert.equal(r.reason, 'max'); break; } spent += r.cost; x = r.wallet; }
    assert.equal(x.up[t], UP_MAX[t]); assert.equal(spent, UP_COST[t].reduce((a, c) => a + c, 0)); assert.equal(x.coins, 5000 - spent);
  }
  //  효과·정규화
  assert.deepEqual(effects(Z0), { dmgMul: 1, intervalMul: 1, extra: 0, gap: 12 });
  const fmax = effects({ power: 5, rate: 5, multi: 3 });
  assert.equal(fmax.dmgMul, 2.5); assert.equal(fmax.intervalMul, Math.pow(0.87, 5)); assert.equal(fmax.extra, 3);
  assert.deepEqual(normUp({ power: '3', rate: 7.9, multi: -4 }), { power: 0, rate: 5, multi: 0 });
  assert.equal(hasUp(Z0), false); assert.equal(hasUp({ rate: 1 }), true);
});

test('UP-BUY: 지갑 구매(save.wallet.buy) — 잔액과 단계를 **setItem 한 번**으로 저장, 잔액 부족·최대 단계는 쓰지 않음, 재로드·다른 탭 재읽기에도 한 벌로', () => {
  const m = new Map([[WALLET_KEY, JSON.stringify({ coins: 100, runNo: 2, paid: ['2:main'], firstClears: [1, 2] })]]);
  const writes = [];
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push(k); m.set(k, String(v)); } };
  const s = createSave3(storage);
  assert.deepEqual(s.wallet.get().up, Z0, '옛 지갑(up 없음) = 강화 0');
  const n0 = writes.filter((k) => k === WALLET_KEY).length;
  const r = s.wallet.buy('multi');
  assert.deepEqual(r, { ok: true, reason: null, cost: 40, coins: 60, up: { power: 0, rate: 0, multi: 1 }, saved: true });
  assert.equal(writes.filter((k) => k === WALLET_KEY).length, n0 + 1, '쓰기 1회');
  assert.deepEqual(JSON.parse(m.get(WALLET_KEY)), { coins: 60, runNo: 2, paid: ['2:main'], firstClears: [1, 2], up: { power: 0, rate: 0, multi: 1 } }, '잔액·단계가 한 원문에');
  //  잔액 부족(다연발 2단계 120 > 60) → 쓰지 않는다
  const r2 = s.wallet.buy('multi');
  assert.equal(r2.ok, false); assert.equal(r2.reason, 'coins'); assert.equal(r2.saved, false);
  assert.equal(writes.filter((k) => k === WALLET_KEY).length, n0 + 1);
  //  다른 트랙은 산다(40 ≤ 60)
  assert.equal(s.wallet.buy('power').coins, 20);
  //  재로드: 새 저장 객체도 같은 지갑
  assert.deepEqual(createSave3(storage).wallet.get(), { coins: 20, runNo: 2, paid: ['2:main'], firstClears: [1, 2], up: { power: 1, rate: 0, multi: 1 } });
  //  다른 탭이 저장소를 바꿔 두었으면 구매 직전 다시 읽은 값 기준(잔액·단계가 한 벌로)
  m.set(WALLET_KEY, JSON.stringify({ coins: 300, runNo: 5, paid: [], firstClears: [], up: { power: 1, rate: 2, multi: 1 } }));
  const r3 = s.wallet.buy('rate');
  assert.equal(r3.cost, 140, '연사 2 → 3 비용(다시 읽은 단계 기준)');
  assert.equal(r3.coins, 160);
  assert.deepEqual(r3.up, { power: 1, rate: 3, multi: 1 });
  //  최대 단계 → 쓰지 않는다
  m.set(WALLET_KEY, JSON.stringify({ coins: 9999, runNo: 5, paid: [], firstClears: [], up: { power: 5, rate: 5, multi: 3 } }));
  const n1 = writes.filter((k) => k === WALLET_KEY).length;
  for (const t of UP_TRACKS) assert.equal(s.wallet.buy(t).reason, 'max');
  assert.equal(writes.filter((k) => k === WALLET_KEY).length, n1);
  //  지급(pay)·출격(startRun)은 강화 단계를 그대로 옮긴다
  s.wallet.startRun();
  s.wallet.pay({ id: '6:main', amount: 10 });
  assert.deepEqual(JSON.parse(m.get(WALLET_KEY)).up, { power: 5, rate: 5, multi: 3 });
});

// ─────────────────────────────── SAVE-MIGRATE ───────────────────────────────

test('SAVE-MIGRATE: 옛 v3 저장 + 지갑 없음 → 코인 0·강화 0 으로 시작(셸이 강화 0 판을 만든다), 해금 = 옛 모든 칸의 연속 클리어 + 1, v4 칸 클리어도 이어서 센다', async () => {
  const v = (id) => stageVersion(id);
  const raw = { v: 3, lastStage: 5, difficulty: 'hard', volume: 1, mute: false, seenShutter: true, seenVehicle: true, zoom: true,
                stages: { 1: { versions: { [v(1) + ':brutal']: { cleared: true, attempts: 3, bestSurvivors: 20, bestTime: 50 } } },
                          2: { versions: { [String(v(2))]: { cleared: true, attempts: 1, bestSurvivors: 4, bestTime: 80 } } },
                          3: { versions: { [v(3) + ':hard']: { cleared: true, attempts: 2, bestSurvivors: 40, bestTime: 90 } } },
                          5: { versions: { [v(5) + ':brutal']: { cleared: true, attempts: 1, bestSurvivors: 10, bestTime: 60 } } } } };
  const m = new Map([[KEY3, JSON.stringify(raw)]]);
  const storage = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, val) => { m.set(k, String(val)); } };
  const save = createSave3(storage);
  assert.equal(m.has(WALLET_KEY), false, '지갑 키 없음(옛 저장)');
  assert.deepEqual(save.wallet.get(), { coins: 0, runNo: 0, paid: [], firstClears: [], up: { ...Z0 } }, '코인 0·강화 0');
  const queue = [];
  let nowMs = 1000;
  const canvas = { width: 480, height: 800, getContext: () => new Proxy({ canvas: null }, { get(t, k) { if (k in t) return t[k]; if (typeof k !== 'string') return undefined; return () => (k.startsWith('create') ? { addColorStop() {} } : k === 'measureText' ? { width: 8 } : undefined); }, set(t, k, val) { t[k] = val; return true; } }),
                   getBoundingClientRect: () => ({ left: 0, top: 0, width: 240, height: 400 }), addEventListener() {} };
  const app = boot(canvas, { win: { devicePixelRatio: 1, location: { search: '' }, addEventListener() {} }, doc: null, raf: (f) => queue.push(f), now: () => nowMs, save,
                             audio: { unlock() {}, sfx() { return true; }, bgmPlay() {}, bgmPause() {}, bgmResume() {}, setVolume() {}, getVolume() { return 1; }, setMuted() {}, isMuted() { return false; }, duck() {} },
                             dateNow: () => 1_700_000_000_000, sprites: { get: () => null, ready: new Set() } });
  await app.ready;
  const frames = (n) => { for (let i = 0; i < n; i++) { nowMs += 1000 / 60; queue.shift()(nowMs); } };
  frames(1);
  assert.equal(app.dbg().unlocked, 4, '1·2·3 연속(칸 무관) → 4 까지, 5 는 4 가 비어 인정 안 됨');
  assert.equal(app.startRun(5), false, '5번은 잠김');
  assert.equal(app.startRun(4), true);
  const run = app.getRun();
  assert.deepEqual(run.up, Z0); assert.equal(run.heroUp, null, '강화 0 판'); assert.equal(run.heroGuard, true, '셸 판은 보호 규칙 켬');
  //  4번을 v4 칸에서 이기면(셸 정상 경로) 1~5 가 연속 → 6 까지
  frames(2);
  run.won = true; run.wonAt = 70; run.over = true;
  let n = 0;
  while (app.getState() === 'run' && n++ < 300) frames(1);
  assert.equal(save.getStage(4, v(4), 'v4').cleared, true);
  assert.equal(app.dbg().unlocked, 6, 'v4 칸 클리어도 해금에 센다');
  //  옛 칸은 그대로(v 3)
  const s = JSON.parse(m.get(KEY3));
  assert.equal(s.v, 3);
  assert.deepEqual(s.stages['1'].versions[v(1) + ':brutal'], raw.stages[1].versions[v(1) + ':brutal']);
  //  r4.3 형식 지갑(up 없음)도 코인은 그대로, 강화 0
  const m2 = new Map([[WALLET_KEY, JSON.stringify({ coins: 77, runNo: 4, paid: ['4:main'], firstClears: [1, 2] })]]);
  assert.deepEqual(createSave3({ getItem: (k) => m2.get(k) ?? null, setItem: (k, val) => m2.set(k, val) }).wallet.get(), { coins: 77, runNo: 4, paid: ['4:main'], firstClears: [1, 2], up: { ...Z0 } });
});

// ─────────────────────────────── 순수성·표기 ───────────────────────────────

test('V3-PURE-META: meta.js 는 순수(import·난수·시계·저장·화면 없음) · 규칙 모듈은 지갑·저장을 모른다(combat 은 meta 의 효과만 읽는다) · 피해 숫자 글자는 소수 한 자리', () => {
  const read = (f) => readFileSync(new URL('../rush3/' + f, import.meta.url), 'utf8');
  const meta = read('meta.js');
  assert.ok(!/^import /m.test(meta), 'meta.js 는 아무것도 import 하지 않는다');
  assert.ok(!/Math\.random|Date\.|performance\.|localStorage|document\.|\brng\b/.test(meta.replace(/\/\/.*$/gm, '')));
  const combat = read('combat.js').replace(/\/\/.*$/gm, '');
  assert.match(combat, /import \{ normUp, hasUp, effects \} from '\.\/meta\.js'/);
  assert.ok(!/\bbuy\b|canBuy|nextCost|wallet|localStorage/.test(combat), 'combat 은 구매·지갑을 모른다');
  //  '-n' 글자: 정수는 종전 그대로, 소수는 한 자리(부동소수 꼬리 없음)
  assert.deepEqual([1, 3, 1.3, 2.6000000000000005, 3.9000000000000004, 4.8].map(dmgText), ['1', '3', '1.3', '2.6', '3.9', '4.8']);
});
