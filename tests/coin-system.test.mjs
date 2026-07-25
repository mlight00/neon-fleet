// 코인 드롭·수거 시스템: 적 처치 → 코인 드롭 → 기함이 수거 범위 안에서 수거. 격납고 확장(magnet/hull/cruiser).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BAL } from '../js/balance.js';
import { Coin } from '../js/entities.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mainSrc = readFileSync(join(root, 'js/main.js'), 'utf8');
const renderSrc = readFileSync(join(root, 'js/render.js'), 'utf8');

function mockWorld(sqx, sqy, range = 85) {
  return {
    squad: { x: sqx, y: sqy }, stats: { pickupRange: range },
    scrollSpeed: 200, logicalH: 800, coins: 0,
    addCoins(n) { this.coins += n; }, effects: { text() {} },
  };
}

test('COIN-1: balance.coin + 격납고 신규 항목이 있다', () => {
  const C = BAL.coin;
  for (const k of ['pickupBase', 'magnetSpeed', 'collectR', 'fallSpeed', 'miniboss', 'sectorBoss', 'unit']) {
    assert.equal(typeof C[k], 'number', `coin.${k}`);
  }
  for (const k of ['magnet', 'hull', 'cruiser']) {
    assert.ok(BAL.hangar.upgrades[k], `격납고 ${k} 항목`);
  }
  assert.equal(BAL.hangar.maxLv, 10, '10단계');
});

test('COIN-2: 수거 반경 안(기함 위)에 있으면 즉시 수거된다', () => {
  const w = mockWorld(240, 700);
  const c = new Coin(240, 700, 7);   // 기함과 같은 위치 → collectR 이내
  c.update(1 / 60, w);
  assert.equal(c.dead, true, '수거됨');
  assert.equal(w.coins, 7, '코인 적립');
});

test('COIN-3: 수거 반경 밖이면 수거 안 되고 아래로 흐른다', () => {
  const w = mockWorld(240, 700, 85);
  const c = new Coin(240, 300, 7);   // 400px 위 = 반경 밖
  const y0 = c.y;
  for (let i = 0; i < 20; i++) c.update(1 / 60, w);   // 여러 프레임
  assert.equal(w.coins, 0, '아직 미수거');
  assert.ok(c.y > y0, '아래로 하강');
});

test('COIN-4: 넓은 수거 반경이면 멀리서도 끌려와 수거된다', () => {
  const w = mockWorld(240, 700, 500);   // magnet 강화 = 큰 반경
  const c = new Coin(240, 360, 7);       // 340px 위 (반경 500 안)
  let steps = 0;
  while (!c.dead && steps < 300) { c.update(1 / 60, w); steps++; }
  assert.equal(c.dead, true, '자석으로 끌려와 수거');
  assert.equal(w.coins, 7);
});

test('COIN-5: 게임 배선 — spawnCoin·pickupRange·HUD 코인·enemyDie 드롭', () => {
  assert.ok(/spawnCoin\(x, y, value\)/.test(mainSrc), 'world.spawnCoin');
  assert.ok(/pickupRange: BAL\.coin\.pickupBase/.test(mainSrc), 'stats.pickupRange = magnet 강화');
  assert.ok(/coins: Math\.round\(r\.world\.coins\)/.test(mainSrc), 'HUD에 coins 전달');
  assert.ok(/🪙 \$\{coins/.test(renderSrc), 'HUD가 코인 표시');
  assert.ok(/sectorBoss/.test(mainSrc), '섹터 보스 대량 코인');
});
