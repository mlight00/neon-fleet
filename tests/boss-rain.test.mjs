import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeBoss } from '../js/bosses.js';
import { BAL } from '../js/balance.js';

// 스톰브링어(B14) 융단 폭격 재설계 — 무작위 4발 → 텔레그래프된 기둥 폭격(테스터 피드백).
// 위험 컬럼 예고 → 안전 컬럼으로 이동 요구 → 위험 컬럼에만 밀집 낙하.

function mockWorld() {
  const bullets = [];
  return { bullets, logicalW: 800, spawnEnemyBullet: (b) => bullets.push(b), squad: { x: 400, y: 600 }, stageMods: {} };
}

test('B14 패턴이 rain이고 재설계 파라미터를 가진다', () => {
  const p = BAL.bossPatterns.B14;
  assert.equal(p.kind, 'rain');
  assert.ok(p.dangerCols >= 2 && p.warnSec > 0 && p.strikes >= 5 && p.perCol >= 1, '예고·기둥·낙하 파라미터');
});

test('융단 폭격: 첫 발동은 예고(낙하 없음, 위험 컬럼 선정)', () => {
  const boss = makeBoss(800, 1, 6, 1, 'B14');
  boss.y = 120; boss.r = 40; boss.logicalW = 800;
  const w = mockWorld();
  boss.fireSignature(w);
  assert.ok(boss.rainWarnT > 0, '예고 타이머');
  assert.ok(Array.isArray(boss.rainCols) && boss.rainCols.length >= (BAL.bossPatterns.B14.dangerCols), '위험 컬럼 선정');
  assert.ok(boss.rainCols.length <= boss.rainColN - 2, '안전 컬럼이 최소 2개 남는다(회피 가능)');
  assert.equal(w.bullets.length, 0, '예고 중엔 낙하 없음');
  assert.ok(boss.rainStrikes > 0, '낙하 횟수 예약');
});

test('융단 폭격: 예고 뒤 낙하는 위험 컬럼 안에만 떨어진다(안전 컬럼은 비움)', () => {
  const boss = makeBoss(800, 1, 6, 1, 'B14');
  boss.y = 120; boss.r = 40; boss.logicalW = 800;
  const w = mockWorld();
  boss.fireSignature(w);                 // 예고
  const cols = boss.rainCols.slice(), colN = boss.rainColN;
  boss.fireSignature(w);                 // 낙하
  assert.ok(w.bullets.length >= cols.length, '위험 컬럼마다 잉걸 낙하');
  const colW = 800 / colN;
  const dangerX = cols.map((c) => colW * (c + 0.5));
  for (const b of w.bullets) {
    assert.ok(dangerX.some((cx) => Math.abs(b.x - cx) <= colW * 0.5 + 1), '잉걸이 위험 컬럼 안');
    assert.ok(b.vy > 0, '아래로 낙하');
  }
  // 낙하가 여러 번 반복되고, 마지막엔 간격(gap)으로 쉬어간다.
  assert.ok(boss.rainStrikes < BAL.bossPatterns.B14.strikes, '낙하 카운트 감소');
});
