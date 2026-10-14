// rush3-weapons2 — r4.35 무기 늘리기(이사님 결정 2026-10-14 '나' — 설계서 docs/superpowers/specs/2026-10-14-weapon-variety-design.md) +
//  r4.36 로켓런처(이사님 결정 2026-10-14 '가' — 실플레이 소감 "유도탄은 좀 무의미 … 중화기 보다 더 강력한 한방이 더 강한 대신 텀이 긴 로켓런처").
//  새 무기 2종: 로켓런처(missile — 2초에 한 발 · 한 발 8 · 맞은 자리 반경 40 폭발 · 게이트 한 발 +2, 유도 없음) · 화염방사기(flame — 사거리 400 · 넓은 탄 · 적 2마리까지).
//  규칙 계층만 검사한다(난수 0·결정성).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS, weaponRank, weaponStats, makeBullet, fanAngles } from '../rush3/weapons.js';
import { createRun, stepRun, drainEvents, STEP } from '../rush3/combat.js';
import { VZ_MIN, buildStage } from '../rush3/stages.js';
import { makeGateRow, hitGateCell } from '../rush3/gates.js';
import { bossDpsFor, bountyDamageFor } from '../rush3/firepower.js';

const NO = { pointerX: null, dragDx: 0, keyDir: 0 };
const synth = (o = {}) => ({ id: 9, version: 1, title: 't', startUnits: 1, startWeapon: 'rifle', length: 20000, eliteZ: 19000,
  gateRows: [], supplies: [], walls: [], spawns: [], elite: null, difficulty: 'normal', ...o });
const play = (run, n) => { const ev = []; for (let i = 0; i < n; i++) { stepRun(run, NO, STEP); ev.push(...drainEvents(run)); } return ev; };
const enemy = (run, id, x, z, hp = 1) => { const e = { id, kind: 'grunt', x, z, px: x, pz: z, vz: 0, hp, r: 14, dead: false, touched: false }; run.enemies.push(e); return e; };
//  유닛 자체 사격이 섞이지 않게 발사 타이머를 멀리 민다(유닛 0 이면 판이 끝나 버린다)
const quiet = (run) => { for (const u of run.units) u.fireT = 1e9; return run; };

test('WPN2-1: 무기 8종 — 로켓런처 수치(유도 없음 · 게이트 +2) · 화염방사기 · 기존 최저 탄속(VZ_MIN 650) 불변 · Mk 표 적용 · 나머지 무기 게이트 +1', () => {
  assert.deepEqual(Object.keys(WEAPONS), ['rifle', 'auto', 'heavy', 'scatter', 'sniper', 'arc', 'missile', 'flame']);
  const m = WEAPONS.missile, f = WEAPONS.flame;
  assert.deepEqual([m.name, m.rank, m.interval, m.dmg, m.vz, m.w, m.color, m.gateHit, m.blastR, m.blastDmg], ['로켓런처', 3, 2, 8, 650, 8, '#E86BFF', 2, 40, 2]);
  assert.equal(m.homing, undefined, '유도 기능 없음');
  assert.deepEqual([f.name, f.rank, f.interval, f.dmg, f.vz, f.w, f.color, f.range, f.pierce], ['화염방사기', 2, 0.25, 1, 520, 22, '#FF4A2E', 400, 2]);
  assert.deepEqual([weaponRank('missile'), weaponRank('flame')], [3, 2]);
  assert.equal(VZ_MIN, 650, '판 배치 계산의 최저 탄속은 그대로');
  assert.deepEqual(fanAngles('missile'), [0]);
  assert.deepEqual(fanAngles('flame'), [0]);
  const m3 = weaponStats('missile', 3);
  assert.deepEqual([m3.interval, m3.dmg, m3.w, m3.gateHit, m3.blastR, m3.blastDmg], [1.5, 9, 12, 2, 40, 2]);
  assert.ok(!('homing' in m3), '무기 수치에 유도 칸이 없다');
  const b = makeBullet('missile', 240, 100, 1);
  assert.deepEqual([b.vz, b.vx, b.dmg, b.w, b.gateHit, b.kind], [650, undefined, 8, 8, 2, 'missile']);
  assert.ok(!('homing' in b) && !('tid' in b), '탄에 유도 칸이 없다');
  for (const id of Object.keys(WEAPONS)) {
    if (id === 'missile') continue;
    assert.equal(weaponStats(id, 1).gateHit, 1, id + ' 게이트 +1');
    assert.equal(makeBullet(id, 240, 100, 1).gateHit, 1, id + ' 탄 게이트 +1');
  }
  const fb = makeBullet('flame', 240, 100, 1);
  assert.deepEqual([fb.range, fb.z0, fb.pierce, fb.hit], [400, 100, 2, []]);
});

test('WPN2-2: 로켓런처 — 곧게 날아가 맞은 적에 8 · 반경 40 안의 옆 적에 2(맞은 적은 폭발 제외) · 반경 밖은 무사 · 폭발 이벤트에 무기 이름 · 옆으로 휘지 않는다', () => {
  const run = quiet(createRun(synth({ startWeapon: 'missile' })));
  const hit = enemy(run, 1, 240, 640, 20);
  const near = enemy(run, 2, 290, 640, 20);          // 중심 거리 50 ≤ 40 + 14
  const far = enemy(run, 3, 310, 640, 20);           // 중심 거리 70 > 40 + 14
  run.bullets.push(makeBullet('missile', 240, 300, 1));
  const ev = play(run, 90);
  assert.deepEqual([hit.hp, near.hp, far.hp], [12, 18, 20]);
  const bl = ev.filter((e) => e.type === 'blast');
  assert.deepEqual(bl.map((e) => [e.r, e.weapon]), [[40, 'missile']]);
  assert.ok(ev.some((e) => e.type === 'enemyHit' && e.id === 2 && e.blast && e.weapon === 'missile'), '폭발 피해 이벤트의 무기 = 로켓런처');
  //  중화기 폭발은 종전처럼 'heavy'
  const hv = quiet(createRun(synth({ startWeapon: 'heavy' })));
  enemy(hv, 1, 240, 640, 20); enemy(hv, 2, 270, 640, 20);
  hv.bullets.push(makeBullet('heavy', 240, 300, 1));
  const hev = play(hv, 90);
  assert.deepEqual(hev.filter((e) => e.type === 'blast').map((e) => [e.r, e.weapon]), [[22, 'heavy']]);
  assert.ok(hev.some((e) => e.type === 'enemyHit' && e.id === 2 && e.blast && e.weapon === 'heavy'));
  //  옆의 적(유도 미사일이었다면 휘어서 맞혔을 자리)은 맞지 않는다
  const side = quiet(createRun(synth({ startWeapon: 'missile' })));
  const s1 = enemy(side, 1, 330, 640, 10);
  side.bullets.push(makeBullet('missile', 240, 300, 1));
  play(side, 30);
  assert.ok(!side.bullets[0].vx, '곧게 난다');
  play(side, 60);
  assert.equal(s1.hp, 10, '옆 적은 무사');
});

test('WPN2-3: 게이트 — 로켓 한 발 = +2 · 다른 무기 +1 · 로봇 다연발 추가 탄 0 · 18판 음수 칸(−14 → 20)을 병사 12명이 로켓으로 16 이상 올린다(관통탄과 같은 수준)', () => {
  const row = makeGateRow({ id: 'g', z: 600, maxValue: 20, armZ: null, cells: [{ x0: 80, x1: 400, value: -5 }] });
  const cell = row.cells[0], ev = [];
  hitGateCell(row, cell, makeBullet('missile', 240, 590, 1), ev);
  assert.equal(cell.value, -3, '로켓 +2');
  hitGateCell(row, cell, makeBullet('heavy', 240, 590, 1), ev);
  assert.equal(cell.value, -2, '중화기 +1');
  const ex = makeBullet('missile', 240, 590, 1); ex.gateHit = 0; ex.extra = true;
  hitGateCell(row, cell, ex, ev);
  assert.equal(cell.value, -2, '로봇 다연발 추가 탄은 게이트를 올리지 않는다');
  //  통제 실험(이사님 안 '게이트 음수 칸' 표 — 적·통·벽 없이 18판 두 번째 게이트 한 줄, 병사 12명이 왼쪽 칸 아래 x 160 에 선다)
  const passValue = (weapon, n) => {
    const stage = buildStage(18, { difficulty: 'brutal' });
    const g2 = stage.gateRows.find((r) => r.id === 'g2');
    assert.deepEqual(g2.cells.map((c) => [c.value, c.maxValue]), [[-14, 20], [5, 7]], '18판 두 번째 게이트 모양');
    stage.gateRows = [g2]; stage.spawns = []; stage.supplies = []; stage.walls = []; stage.elites = []; stage.lottery = null;
    stage.startUnits = n; stage.startWeapon = weapon;
    const run = createRun(stage);
    run.z = g2.z - 900;
    for (let k = 0; k < 4000 && !run.over; k++) {
      stepRun(run, { pointerX: 160, dragDx: 0, keyDir: 0 }, STEP);
      for (const e of drainEvents(run)) if (e.type === 'gatePass') return e.idx === 0 ? e.value : null;
    }
    return null;
  };
  const rocket = passValue('missile', 12), sniper = passValue('sniper', 12);
  assert.ok(rocket >= 16, '로켓 12명: ' + rocket);
  assert.ok(rocket >= sniper, '관통탄 ' + sniper + ' 이상');
  assert.ok(rocket > 7, '오른쪽 안전 칸(+7)보다 높다');
});

test('WPN2-4: 상한 계산 — 로켓런처는 유도 몫 없이 다른 무기와 같은 방식(탄 폭 · 탄속이 같은 중화기와 명중 수가 같고, 초당 피해는 4 ÷ 3.75 배)', () => {
  for (const id of [5, 18, 24]) {
    const st = buildStage(id, { difficulty: 'brutal' });
    for (const n of [12, 40]) {
      const r = bossDpsFor(st, n, 'missile', 1), h = bossDpsFor(st, n, 'heavy', 1);
      assert.equal(r.hits, h.hits, 'S' + id + ' n' + n + ' 보스 명중 수');
      assert.ok(Math.abs(r.dps / h.dps - 4 / 3.75) < 1e-9, 'S' + id + ' n' + n + ' 보스 초당 피해 비');
    }
  }
  for (const n of [12, 40]) {
    const r = bountyDamageFor(n, 'missile', 1), h = bountyDamageFor(n, 'heavy', 1);
    assert.ok(Math.abs(r.dmg / h.dmg - 4 / 3.75) < 1e-9, 'n' + n + ' 현상금 적 피해 합 비');
  }
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

// ─────────────────────────────── 셸 그리기(그림 파일 없이 게임이 그린다) ───────────────────────────────
import { bootApp } from './lib/rush3-shell.mjs';

test('WPN2-6: 새 무기를 들고 판을 돌려도 그리기 오류가 없다 — 상단 칩 이름 · 로켓·불꽃 탄 그리기(원·경로) · 로켓이 터지면 폭발음', async () => {
  for (const [id, name] of [['missile', '로켓런처'], ['flame', '화염방사기']]) {
    const h = await bootApp({ search: '?dev=1&weapon=' + id, withOps: true });
    h.app.startRun(1);
    h.frames(150);
    assert.equal(h.app.getRun().weapon, id);
    assert.ok(h.app.getRun().bullets.some((b) => b.kind === id && !b.dead), id + ' 탄이 날고 있다');
    const t = h.textNow();
    assert.ok(t.some((x) => x.includes(name)), id + ' 상단 칩 이름: ' + JSON.stringify(t.slice(0, 12)));
    const ops = h.ops.map((o) => o.op);
    assert.ok(ops.includes(id === 'flame' ? 'arc' : 'closePath'), id + ' 탄 그리기');
    if (id === 'missile') {
      //  부대 바로 앞에 단단한 적 하나를 세워 로켓을 맞힌다 → 셸이 로켓 폭발 연출 + 폭발음
      const run = h.app.getRun();
      run.enemies.push({ id: 9001, kind: 'grunt', x: run.x, z: run.z + 260, px: run.x, pz: run.z + 260, vz: 0, hp: 500, hpMax: 500, r: 14, dead: false, touched: false });
      h.frames(240);
      assert.ok(h.audio.played.includes('rocketBoom'), '로켓 폭발음: ' + JSON.stringify([...new Set(h.audio.played)]));
    }
  }
});
