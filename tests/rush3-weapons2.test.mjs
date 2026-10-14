// rush3-weapons2 — r4.35 무기 늘리기(이사님 결정 2026-10-14 '나' — 설계서 docs/superpowers/specs/2026-10-14-weapon-variety-design.md).
//  새 무기 2종: 유도 미사일(missile — 앞쪽 가장 가까운 적·보스를 따라 휘어 간다) · 화염방사기(flame — 사거리 400 · 넓은 탄 · 적 2마리까지).
//  규칙 계층만 검사한다(난수 0·결정성).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, weaponRank, weaponStats, makeBullet, fanAngles } from '../rush3/weapons.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { VZ_MIN } from '../rush3/stages.js';

const NO = { pointerX: null, dragDx: 0, keyDir: 0 };
const synth = (o = {}) => ({ id: 9, version: 1, title: 't', startUnits: 1, startWeapon: 'rifle', length: 20000, eliteZ: 19000,
  gateRows: [], supplies: [], walls: [], spawns: [], elite: null, difficulty: 'normal', ...o });
const play = (run, n) => { const ev = []; for (let i = 0; i < n; i++) { stepRun(run, NO, STEP); ev.push(...drainEvents(run)); } return ev; };
const enemy = (run, id, x, z, hp = 1) => { const e = { id, kind: 'grunt', x, z, px: x, pz: z, vz: 0, hp, r: 14, dead: false, touched: false }; run.enemies.push(e); return e; };
//  유닛 자체 사격이 섞이지 않게 발사 타이머를 멀리 민다(유닛 0 이면 판이 끝나 버린다)
const quiet = (run) => { for (const u of run.units) u.fireT = 1e9; return run; };

test('WPN2-1: 무기 8종 — 새 무기 2종 수치 · 유도 칸 · 기존 최저 탄속(VZ_MIN 650) 불변 · Mk 표 적용', () => {
  assert.deepEqual(Object.keys(WEAPONS), ['rifle', 'auto', 'heavy', 'scatter', 'sniper', 'arc', 'missile', 'flame']);
  const m = WEAPONS.missile, f = WEAPONS.flame;
  assert.deepEqual([m.name, m.rank, m.interval, m.dmg, m.vz, m.w, m.color, m.blastR, m.blastDmg], ['유도 미사일', 3, 0.9, 3, 650, 6, '#E86BFF', 20, 1]);
  assert.deepEqual({ ...m.homing }, { turn: 3.5, seekR: 520, minFwd: 0.35 });
  assert.deepEqual([f.name, f.rank, f.interval, f.dmg, f.vz, f.w, f.color, f.range, f.pierce], ['화염방사기', 2, 0.25, 1, 520, 22, '#FF4A2E', 400, 2]);
  assert.deepEqual([weaponRank('missile'), weaponRank('flame')], [3, 2]);
  assert.equal(VZ_MIN, 650, '판 배치 계산의 최저 탄속은 그대로');
  assert.deepEqual(fanAngles('missile'), [0]);
  assert.deepEqual(fanAngles('flame'), [0]);
  const m3 = weaponStats('missile', 3);
  assert.deepEqual([m3.interval, m3.dmg, m3.w], [0.675, 4, 9]);
  assert.deepEqual({ ...m3.homing }, { turn: 3.5, seekR: 520, minFwd: 0.35 });
  assert.equal(weaponStats('flame', 1).homing, null);
  const b = makeBullet('missile', 240, 100, 1);
  assert.deepEqual([b.vz, b.spd, b.tid, b.homing.turn], [650, 650, null, 3.5]);
  const fb = makeBullet('flame', 240, 100, 1);
  assert.deepEqual([fb.range, fb.z0, fb.pierce, fb.hit, fb.homing], [400, 100, 2, [], undefined]);
});

test('WPN2-2: 유도 미사일 — 옆의 적으로 휘어 맞히고(곧은 탄은 빗나감) · 직격 피해 3', () => {
  const run = quiet(createRun(synth({ startWeapon: 'missile' })));
  const e = enemy(run, 1, 330, 640, 10);
  run.bullets.push(makeBullet('missile', 240, 300, 1));
  play(run, 90);
  assert.equal(e.hp, 7, '휘어 가서 맞혔다(폭발은 직격 적 제외)');
  const ctl = quiet(createRun(synth()));
  const c = enemy(ctl, 1, 330, 640, 10);
  ctl.bullets.push(makeBullet('rifle', 240, 300, 1));
  play(ctl, 90);
  assert.equal(c.hp, 10, '곧은 탄은 빗나간다');
});

test('WPN2-3: 유도 미사일 — 뒤로 돌지 않는다 · 뒤의 적은 고르지 않는다 · 적이 없으면 곧게 · 목표가 죽으면 다음 적', () => {
  const side = quiet(createRun(synth({ startWeapon: 'missile' })));
  enemy(side, 1, 740, 320, 50);                       // 거의 옆(각도 약 1.53 라디안) — 앞 속도 하한에 걸린다
  side.bullets.push(makeBullet('missile', 240, 300, 1));
  const b = side.bullets[0];
  for (let i = 0; i < 40; i++) {
    play(side, 1);
    if (b.dead) break;
    assert.ok(b.vz >= 650 * 0.35 - 1e-9, 'vz ' + b.vz);
    assert.ok(Math.abs(Math.hypot(b.vx || 0, b.vz) - 650) < 1e-6, '속력 그대로');
  }
  const back = quiet(createRun(synth({ startWeapon: 'missile' })));
  enemy(back, 1, 260, 200, 50);                       // 탄보다 뒤
  back.bullets.push(makeBullet('missile', 240, 300, 1));
  play(back, 10);
  assert.ok(!back.bullets[0].vx && back.bullets[0].vz === 650, '뒤의 적은 따라가지 않는다');
  const none = quiet(createRun(synth({ startWeapon: 'missile' })));
  none.bullets.push(makeBullet('missile', 240, 300, 1));
  play(none, 10);
  assert.ok(!none.bullets[0].vx && none.bullets[0].vz === 650, '적이 없으면 곧게');
  const two = quiet(createRun(synth({ startWeapon: 'missile' })));
  const a = enemy(two, 1, 300, 520, 50), c = enemy(two, 2, 180, 600, 50);
  two.bullets.push(makeBullet('missile', 240, 300, 1));
  play(two, 2);
  assert.equal(two.bullets[0].tid, 1, '가까운 적을 고른다');
  a.dead = true;
  play(two, 1);
  assert.equal(two.bullets[0].tid, 2, '목표가 죽으면 다음 적');
  assert.ok(!c.dead);
});

test('WPN2-4: 유도 미사일 — 결정성(같은 입력이면 두 판이 같다) · 광장 조준탄에도 붙는다', () => {
  const mk = () => {
    const r = quiet(createRun(synth({ startWeapon: 'missile' })));
    enemy(r, 1, 330, 640, 10); enemy(r, 2, 150, 700, 10);
    r.bullets.push(makeBullet('missile', 240, 300, 1), makeBullet('missile', 200, 280, 1));
    play(r, 60);
    return r.bullets.map((x) => ({ x: x.x, z: x.z, vx: x.vx, vz: x.vz, dead: x.dead, tid: x.tid }));
  };
  assert.deepEqual(mk(), mk());
  const aimed = makeBullet('missile', 240, 300, 1, 1, 0, 0.3);
  assert.ok(aimed.aimed && aimed.homing && Math.abs(Math.hypot(aimed.vx, aimed.vz) - 650) < 1e-9);
});

test('WPN2-5: 화염방사기 — 한 발이 적 2마리까지(3번째는 무사) · 사거리 400 을 넘으면 사라진다', () => {
  const run = quiet(createRun(synth({ startWeapon: 'flame' })));
  const e1 = enemy(run, 1, 240, 400, 1), e2 = enemy(run, 2, 240, 450, 1), e3 = enemy(run, 3, 240, 500, 1);
  run.bullets.push(makeBullet('flame', 240, 300, 1));
  play(run, 40);
  assert.ok(e1.dead && e2.dead, '앞 2마리');
  assert.equal(e3.hp, 1, '3번째는 무사');
  const far = quiet(createRun(synth({ startWeapon: 'flame' })));
  const f = enemy(far, 1, 240, 300 + 400 + 60, 1);
  far.bullets.push(makeBullet('flame', 240, 300, 1));
  play(far, 90);
  assert.equal(f.hp, 1, '사거리 밖');
  assert.ok(far.bullets.every((x) => x.dead) || far.bullets.length === 0);
});
