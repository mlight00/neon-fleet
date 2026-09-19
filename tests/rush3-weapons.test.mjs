// rush3-weapons — r3.10(2026-09-19, 이사 결정 A) 신규 무기 3종(산탄포·저격총·전격포) + Mk I~III 강화.
//  규칙 계층만 검사한다(난수 0·결정성). 탄의 부채꼴·사거리·관통·연쇄와 같은 무기 통을 다시 먹었을 때의 강화를 잠근다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAL3 } from '../rush3/balance.js';
import { WEAPONS, WEAPON_MK, MK_MAX, weaponRank, weaponStats, makeBullet, fanAngles } from '../rush3/weapons.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { applySupplyReward } from '../rush3/supply.js';

const NO = { pointerX: null, dragDx: 0, keyDir: 0 };
const synth = (o = {}) => ({ id: 9, version: 1, title: 't', startUnits: 1, startWeapon: 'rifle', length: 20000, eliteZ: 19000,
  gateRows: [], supplies: [], walls: [], spawns: [], elite: null, difficulty: 'normal', ...o });
const play = (run, n) => { const ev = []; for (let i = 0; i < n; i++) { stepRun(run, NO, STEP); ev.push(...drainEvents(run)); } return ev; };
const enemy = (run, id, x, z, hp = 1) => { const e = { id, kind: 'grunt', x, z, px: x, pz: z, vz: 0, hp, r: 14, dead: false, touched: false }; run.enemies.push(e); return e; };

test('V3-WPN WPN-1: 무기 6종·순위·고유색이 표대로, Mk 표는 3단(I 기본, II·III 은 간격↓·폭↑, III 은 피해 +1)', () => {
  assert.deepEqual(Object.keys(WEAPONS), ['rifle', 'auto', 'heavy', 'scatter', 'sniper', 'arc']);
  assert.deepEqual(['rifle', 'auto', 'heavy', 'scatter', 'sniper', 'arc'].map(weaponRank), [1, 2, 3, 2, 3, 3]);
  assert.deepEqual([WEAPONS.scatter.color, WEAPONS.sniper.color, WEAPONS.arc.color], ['#B6FF4A', '#DDEBFF', '#7F9BFF']);
  assert.equal(MK_MAX, 3);
  assert.deepEqual(WEAPON_MK.map((k) => [k.dmgAdd, k.intervalMul, k.wMul]), [[0, 1, 1], [0, 0.85, 1.25], [1, 0.75, 1.5]]);
  const r1 = weaponStats('rifle', 1), r3 = weaponStats('rifle', 3);
  assert.deepEqual([r1.interval, r1.dmg, r1.w], [0.5, 1, 4]);
  assert.deepEqual([r3.interval, r3.dmg, r3.w], [0.375, 2, 6]);
  assert.deepEqual(weaponStats('rifle', 99).dmg, 2, 'mk 는 3 으로 클램프');
  assert.deepEqual(weaponStats('rifle', 0).dmg, 1, 'mk 는 1 로 클램프');
  //  기존 3종의 Mk I 탄은 종전과 완전히 같다
  assert.deepEqual(makeBullet('rifle', 240, 100, 1), { x: 240, z: 100, pz: 100, vz: 700, dmg: 1, w: 4, kind: 'rifle', gateHit: 1, ownerId: 1, dead: false });
  assert.ok(Object.isFrozen(BAL3.weaponMk));
});

test('V3-WPN WPN-2: 산탄포 — 유닛 1명이 발사마다 3발(부채꼴 ±spreadDeg), 사거리 range 를 넘으면 소멸', () => {
  assert.deepEqual(fanAngles('rifle'), [0]);
  const a = fanAngles('scatter');
  assert.equal(a.length, 3); assert.ok(a[0] < 0 && a[1] === 0 && a[2] > 0 && Math.abs(a[0]) === a[2]);
  const run = createRun(synth({ startWeapon: 'scatter' }));
  assert.equal(run.weapon, 'scatter');
  //  유닛의 첫 발사 시각은 makeUnit 의 위상(fireT)에 달려 있으므로 첫 탄이 나올 때까지 돌린다
  let n = 0; while (run.bullets.length === 0 && n < 120) { play(run, 1); n++; }
  assert.equal(run.bullets.length, 3, '첫 발사에 3발');
  const vx = run.bullets.map((b) => b.vx ?? 0);
  assert.ok(vx[0] < 0 && vx[1] === 0 && vx[2] > 0, '좌·중·우');
  assert.ok(run.bullets.every((b) => b.range === WEAPONS.scatter.range && b.z0 != null && b.z0 <= b.z), 'range·z0 기록');
  //  사거리: range/vz 초 뒤에는 첫 3발이 전부 사라진다(적·장애물 없음)
  const stepsToRange = Math.ceil(WEAPONS.scatter.range / WEAPONS.scatter.vz / STEP) + 2;
  const ids0 = new Set(run.bullets);
  play(run, stepsToRange);
  assert.ok([...ids0].every((b) => !run.bullets.includes(b)), '첫 3발 소멸');
  //  x 가 갈라진다
  play(run, 1);
  const spread = run.bullets.filter((b) => b.vx).map((b) => b.x);
  assert.ok(spread.length >= 2);
});

test('V3-WPN WPN-3: 저격총 — 한 발이 일렬의 적 2체까지 관통(같은 적은 다시 맞지 않음), 3번째는 무사', () => {
  const run = createRun(synth({ startWeapon: 'sniper' }));
  const e1 = enemy(run, 1, 240, 400, 1), e2 = enemy(run, 2, 240, 470, 1), e3 = enemy(run, 3, 240, 540, 1);
  run.bullets.push(makeBullet('sniper', 240, 300, 1));
  const b = run.bullets[0];
  assert.equal(b.pierce, WEAPONS.sniper.pierce);
  //  유닛 자체 사격이 섞이지 않게 발사 타이머를 멀리 민다(유닛 0 이면 판이 끝나 버린다)
  for (const u of run.units) u.fireT = 1e9;
  play(run, 40);
  assert.ok(e1.dead && e2.dead, '앞 2체 처치');
  assert.equal(e3.dead, false, '3번째는 관통 한도 밖');
  assert.equal(e3.hp, 1);
});

test('V3-WPN WPN-4: 전격포 — 직격한 적 근처(chainR 안) 적에게 연쇄 피해(chain 체까지, 벽 너머·범위 밖 제외), 이벤트 arc', () => {
  const run = createRun(synth({ startWeapon: 'arc' }));
  for (const u of run.units) u.fireT = 1e9;
  const hit = enemy(run, 1, 240, 400, 1);
  const near = enemy(run, 2, 300, 420, 2), near2 = enemy(run, 3, 190, 380, 2), far = enemy(run, 4, 240, 700, 2);
  run.bullets.push(makeBullet('arc', 240, 300, 1));
  const ev = play(run, 30);
  assert.ok(hit.dead, '직격');
  assert.equal(near.hp, 2 - WEAPONS.arc.chainDmg); assert.equal(near2.hp, 2 - WEAPONS.arc.chainDmg);
  assert.equal(far.hp, 2, '범위 밖');
  const arcs = ev.filter((e) => e.type === 'arc');
  assert.equal(arcs.length, WEAPONS.arc.chain);
  //  벽이 사이에 끼면 연쇄가 막힌다
  const r2 = createRun(synth({ startWeapon: 'arc', walls: [{ x0: 260, x1: 280, z0: 300, z1: 500 }] }));
  for (const u of r2.units) u.fireT = 1e9;
  const h2 = enemy(r2, 1, 240, 400, 1); const behind = enemy(r2, 2, 300, 400, 2);
  r2.bullets.push(makeBullet('arc', 240, 300, 1));
  play(r2, 30);
  assert.ok(h2.dead); assert.equal(behind.hp, 2, '벽 너머는 연쇄 없음');
});

test('V3-WPN WPN-5: 강화 — 같은 무기 통을 먹으면 Mk 가 오르고(최대 III), 상위 무기 통은 교체 + Mk I 로, 하위·만렙은 weaponSame', () => {
  const run = createRun(synth({ startWeapon: 'rifle' }));
  assert.equal(run.weaponMk, 1);
  const ev = [];
  const crate = (w) => ({ kind: 'weapon', payload: { weapon: w }, x: 240, z: 100, id: 77 });
  assert.equal(applySupplyReward(crate('rifle'), run, ev, { weaponRank, mkMax: MK_MAX }), true);
  assert.equal(run.weaponMk, 2); assert.equal(ev.at(-1).type, 'weaponMk'); assert.equal(ev.at(-1).mk, 2);
  applySupplyReward(crate('rifle'), run, ev, { weaponRank, mkMax: MK_MAX });
  assert.equal(run.weaponMk, 3);
  assert.equal(applySupplyReward(crate('rifle'), run, ev, { weaponRank, mkMax: MK_MAX }), false);
  assert.equal(run.weaponMk, 3); assert.equal(ev.at(-1).type, 'weaponSame');
  //  상위 무기로 교체되면 Mk I 부터
  assert.equal(applySupplyReward(crate('auto'), run, ev, { weaponRank, mkMax: MK_MAX }), true);
  assert.equal(run.weapon, 'auto'); assert.equal(run.weaponMk, 1); assert.equal(ev.at(-1).type, 'weaponSwap');
  //  같은 순위의 다른 무기(산탄포 rank 2)는 교체되지 않는다
  assert.equal(applySupplyReward(crate('scatter'), run, ev, { weaponRank, mkMax: MK_MAX }), false);
  assert.equal(run.weapon, 'auto');
  //  Mk 가 오르면 실제 발사 간격이 줄고 탄 피해·폭이 표대로 — stepRun 경로
  const r3 = createRun(synth({ startWeapon: 'rifle' }), { startMk: 3 });
  assert.equal(r3.weaponMk, 3);
  let k = 0; while (r3.bullets.length === 0 && k < 120) { play(r3, 1); k++; }
  assert.deepEqual([r3.bullets[0].dmg, r3.bullets[0].w], [2, 6]);
  //  2초 동안: Mk I 간격 0.5 → 4발, Mk III 간격 0.375 → 5발(탄은 사라지지 않는다 — 적·장애물 없음)
  const r1 = createRun(synth({ startWeapon: 'rifle' })), r3b = createRun(synth({ startWeapon: 'rifle' }), { startMk: 3 });
  const n2s = Math.round(2 / STEP);
  const shots = (ev) => ev.filter((e) => e.type === 'fire').reduce((a, e) => a + e.count, 0);
  const f1 = shots(play(r1, n2s)), f3 = shots(play(r3b, n2s));
  assert.ok(f3 > f1, 'Mk III 가 같은 시간에 더 많이 쏜다(fire 이벤트 합): ' + f3 + ' > ' + f1);
});

test('V3-WPN WPN-6: 결정성 — 같은 무기·같은 입력이면 두 판이 deepEqual(산탄포·전격포 포함)', () => {
  for (const w of ['scatter', 'sniper', 'arc']) {
    const a = createRun(synth({ startWeapon: w }), { startMk: 2 }), b = createRun(synth({ startWeapon: w }), { startMk: 2 });
    for (const r of [a, b]) { enemy(r, 1, 240, 500, 3); enemy(r, 2, 300, 520, 3); enemy(r, 3, 180, 600, 3); }
    play(a, 120); play(b, 120);
    assert.deepEqual(a.bullets, b.bullets); assert.deepEqual(a.enemies, b.enemies); assert.deepEqual([a.kills, a.weaponMk], [b.kills, b.weaponMk]);
  }
});
