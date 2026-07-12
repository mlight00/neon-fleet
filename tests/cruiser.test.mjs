import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Squad, EnemyShot } from '../js/entities.js';
import { BAL } from '../js/balance.js';

const noop = () => {};
function makeWorld(sq) {
  return {
    squad: sq, logicalW: 480, logicalH: 776, enemyBullets: [], bullets: [], entities: [], bosses: [],
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop }, mfx: {},
  };
}
function squadWithCruisers(n) {
  const s = new Squad(480, 776, 100); s.x = 240; s.y = 640; s.cruisers = n;
  return s;
}

test('순양함 배치는 좌우 대칭 날개 (짝수=왼쪽, 홀수=오른쪽)', () => {
  const s = squadWithCruisers(4);
  const s0 = s.supportSlot(0, 'cruiser'), s1 = s.supportSlot(1, 'cruiser');
  const s2 = s.supportSlot(2, 'cruiser'), s3 = s.supportSlot(3, 'cruiser');
  assert.ok(s0.x < 0 && s1.x > 0, '0=좌 1=우');
  assert.ok(Math.abs(s0.x) === Math.abs(s1.x), '좌우 대칭');
  assert.ok(Math.abs(s2.x) > Math.abs(s0.x), '바깥 랭크는 더 벌어짐');
});

test('cruiserPositions: cruisers 수만큼, cruiserHp 만피로 동기화', () => {
  const s = squadWithCruisers(3);
  const pos = s.cruiserPositions();
  assert.equal(pos.length, 3);
  assert.deepEqual(s.cruiserHp, [BAL.escort.cruiserHp, BAL.escort.cruiserHp, BAL.escort.cruiserHp]);
});

test('cruiserHitIndex: 순양함 위치의 탄은 그 인덱스, 먼 탄은 -1', () => {
  const s = squadWithCruisers(2); const p = s.cruiserPositions();
  assert.equal(s.cruiserHitIndex(p[0].x, p[0].y, 6), 0);
  assert.equal(s.cruiserHitIndex(9999, 9999, 6), -1);
});

test('hitCruiser: HP 감소, 0이면 격침(cruisers 감소)', () => {
  const s = squadWithCruisers(2); const w = makeWorld(s);
  s.hitCruiser(0, 10, w);
  assert.equal(s.cruiserHp[0], BAL.escort.cruiserHp - 10);
  assert.equal(s.cruisers, 2);
  s.hitCruiser(0, BAL.escort.cruiserHp, w);   // 치명타 → 격침
  assert.equal(s.cruisers, 1);
  assert.equal(s.cruiserHp.length, 1);
});

test('EnemyShot이 순양함을 맞히면: 탄 소멸 + 순양함 HP 감소, 드론 손실·graze 없음', () => {
  const s = squadWithCruisers(2); const w = makeWorld(s);
  const p = s.cruiserPositions()[0];
  const shot = new EnemyShot(p.x, p.y, 0, 0, { r: 8, dmgPct: 0.05, dmgMin: 6 });
  shot.age = 1;
  const drones0 = s.count;
  shot.update(0.016, w);
  assert.equal(shot.dead, true);
  assert.equal(s.count, drones0);                 // 드론 안 깎임 (순양함이 막음)
  assert.equal(shot.grazed, false);               // graze 없음
  assert.ok(s.cruiserHp[0] < BAL.escort.cruiserHp, '순양함 HP 감소');
});

test('EnemyShot이 기함을 맞히면 여전히 드론 피해 (순양함 추가에도 회귀)', () => {
  const s = squadWithCruisers(2); const w = makeWorld(s);
  const shot = new EnemyShot(s.x, s.y, 0, 0, { r: 8, dmgPct: 0.05, dmgMin: 6 });
  shot.age = 1;
  shot.update(0.016, w);
  assert.equal(shot.dead, true);
  assert.ok(s.count < 100, '기함 명중 → 드론 손실');
});

test('순양함 0척이면 피탄 판정 없음 (기존 동작 유지)', () => {
  const s = new Squad(480, 776, 100); s.x = 240; s.y = 640; s.cruisers = 0;
  const w = makeWorld(s);
  const shot = new EnemyShot(300, 640, 0, 0, { r: 8, dmgPct: 0.05, dmgMin: 6 });
  shot.age = 1;
  shot.update(0.016, w);   // 크래시 없이 통과
  assert.equal(s.count, 100);
});
