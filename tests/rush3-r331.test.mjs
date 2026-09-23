// rush3-r331 — 2026-09-23 이사 지시 묶음 V3-R331: 전격 기절 · 체력 비례 크기 · 돌격체 감속 · 중화기 조정 · 그림 배율.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BAL3 } from '../rush3/balance.js';
import { WEAPONS, makeBullet } from '../rush3/weapons.js';
import { createRun, stepRun, STEP, sizeByHp } from '../rush3/combat.js';

const NO = { pointerX: null, dragDx: 0, keyDir: 0 };
function stage(spawns, o = {}) {
  return { id: 96, version: 1, title: 'T', length: 100000, eliteZ: null, startUnits: 1, startWeapon: o.weapon ?? 'arc',
           gateRows: [], supplies: [], walls: [], elite: null, spawns };
}
const drain = (run) => { const ev = run.events.slice(); run.events.length = 0; return ev; };

test('V3-R331 전격 기절: 맞은 일반 적은 stunSec 동안 제자리에 멈추고, 그 뒤 다시 움직인다', () => {
  const S = WEAPONS.arc.stunSec;
  assert.ok(S > 0, '전격포에 기절 시간');
  const run = createRun(stage([{ z: 0, kind: 'rusher', n: 1, xs: [240], zs: [700], hp: 99, corridorHw: null }]));
  for (const u of run.units) u.fireT = 1e9;
  stepRun(run, NO, STEP); drain(run);
  const e = run.enemies[0];
  run.bullets.push(makeBullet('arc', 240, e.z - 30, 1));
  let stunned = false;
  for (let i = 0; i < 10 && !stunned; i++) { stepRun(run, NO, STEP); stunned = drain(run).some((v) => v.type === 'stun' && v.id === e.id); }
  assert.ok(stunned, '기절 이벤트');
  const z0 = e.z;
  for (let i = 0; i < Math.floor((S - 0.05) / STEP); i++) { stepRun(run, NO, STEP); drain(run); }
  assert.equal(e.z, z0, '기절 동안 z 그대로');
  for (let i = 0; i < 30; i++) { stepRun(run, NO, STEP); drain(run); }
  assert.ok(e.z < z0, '기절이 풀리면 다시 다가온다');
});

test('V3-R331 전격 기절: 보스(정예)는 묶지 않는다', () => {
  const run = createRun({ ...stage([], { weapon: 'arc' }), eliteZ: 400, elite: { z: 400, hp: 9999, summon: false } });
  for (const u of run.units) { u.fireT = 1e9; u.hp = 1e9; }
  for (let i = 0; i < 200; i++) { stepRun(run, NO, STEP); drain(run); }
  const bo = run.bosses[0];
  run.bullets.push(makeBullet('arc', bo.x, bo.z - 60, 1));
  let ev = [];
  for (let i = 0; i < 20; i++) { stepRun(run, NO, STEP); ev = ev.concat(drain(run)); }
  assert.ok(ev.some((v) => v.type === 'enemyHit' && v.id === bo.id), '보스는 맞는다');
  assert.ok(!ev.some((v) => v.type === 'stun'), '보스 기절 없음');
  assert.ok(!(bo.stunT > 0));
});

test('V3-R331 체력 비례 크기: 표 체력 대비 배수의 로그로 커지고 상한이 있다, 판정 r 도 같이 커진다', () => {
  const S = BAL3.sizeByHp;
  assert.equal(sizeByHp(2, 2), 1, '표 체력 그대로면 1');
  assert.equal(sizeByHp(2, 1), 1, '표보다 약하면 줄이지 않는다');
  assert.ok(Math.abs(sizeByHp(2, 4) - (1 + S.k)) < 1e-9, '2배 = 1 + k');
  assert.equal(sizeByHp(2, 2 * 1e6), S.cap, '상한');
  assert.equal(sizeByHp(null, 50), 1, '표 체력 없는 종류(정예)는 1');
  const run = createRun(stage([{ z: 0, kind: 'grunt', n: 2, xs: [180, 300], zs: [900, 900], corridorHw: null },
                              { z: 0, kind: 'grunt', n: 1, xs: [240], zs: [950], hp: 24, corridorHw: null }]));
  stepRun(run, NO, STEP);
  const [a, , big] = run.enemies;
  assert.equal(a.r, BAL3.enemies.grunt.r, '표 체력 잡졸은 표 r');
  assert.ok(Math.abs(big.r - BAL3.enemies.grunt.r * sizeByHp(2, 24)) < 1e-9, '체력 24 잡졸은 커진다');
  assert.ok(big.r > a.r);
});

test('V3-R331 수치: 돌격체(자동차) 가속·최대 속도 감속, 중화기 간격·폭발 조정, 그림 배율은 바리케이드·신호등', () => {
  assert.deepEqual([BAL3.enemies.rusher.accel, BAL3.enemies.rusher.maxVz], [180, 290]);
  assert.deepEqual([WEAPONS.heavy.interval, WEAPONS.heavy.blastR, WEAPONS.heavy.blastDmg], [0.8, 22, 1]);
  assert.ok(BAL3.fx.artScale.E3_wallguard > 1 && BAL3.fx.artScale.E6_signaler > 1);
  assert.equal(BAL3.elites.roles.summoner.holdAhead, BAL3.elites.roles.gunner.holdAhead, '소환형도 산탄포 사거리 안에 선다');
});
