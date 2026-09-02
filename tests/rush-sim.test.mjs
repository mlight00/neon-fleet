// rush-sim — 부대·전투·완주 시뮬레이션. 게임 규칙 계층이 화면 없이 완주 가능한지 잠근다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tierFor, formation, clampX, squadRadius } from '../rush/squad.js';
import { BAL } from '../rush/balance.js';
import { createCombat, spawnWave, spawnBoss, stepCombat } from '../rush/combat.js';
import { mulberry32 } from '../rush/rng.js';
import { buildTrack } from '../rush/track.js';
import { applyGate } from '../rush/gates.js';

test('SQUAD-TIER: 임계 1/25/75/150/300', () => {
  const cases = [[1, 0], [39, 0], [40, 1], [119, 1], [120, 2], [249, 2], [250, 3], [499, 3], [500, 4], [999, 4]];
  for (const [n, t] of cases) assert.equal(tierFor(n), t, n + '기');
});

test('SQUAD-FORM: 링 군집 — 상한·히어로 중심·전방 개방·중복 없음', () => {
  assert.equal(formation(1).length, 1);
  assert.deepEqual(formation(1)[0], { x: 0, y: 0 }, '선두=히어로 자리');
  assert.equal(formation(10).length, 10);
  assert.equal(formation(500).length, BAL.squad.drawCap);
  const f = formation(60);
  for (const p of f.slice(1)) {
    const r = Math.hypot(p.x, p.y);
    assert.ok(r >= BAL.squad.ringStart - 1, '병사는 히어로에서 링 간격 이상 떨어짐: ' + r);
    const ang = Math.atan2(p.x, -p.y);                 // 0=정전방
    assert.ok(Math.abs(ang) >= Math.PI * 0.2, '전방 부채꼴은 빈다: ' + ang.toFixed(2));
  }
  const set = new Set(f.map((p) => Math.round(p.x) + ',' + Math.round(p.y)));
  assert.equal(set.size, f.length, '겹치는 자리 없음');
});

test('SQUAD-CLAMP: 중심 x 는 도로 안(게이트 폭과 일치)', () => {
  assert.equal(clampX(-999), 80);
  assert.equal(clampX(999), 400);
  assert.equal(clampX(240), 240);
  const g = BAL.gates;
  assert.equal(g.width * 2 + g.gap, 400 - 80, '게이트 총폭 = 이동 가능 폭');
});

test('COMBAT-KILL: 사격이 적을 잡고 코인·격파가 쌓인다', () => {
  const rnd = mulberry32(1);
  const st = createCombat();
  spawnWave(st, 'scrapbit', 3, rnd);
  for (const e of st.enemies) { e.x = 240; e.y = 400; e.vy = 0; e.vx = 0; }   // 사선에 고정
  const squad = { x: 240, count: 30, fireRateMult: 1 };
  for (let i = 0; i < 600; i++) stepCombat(st, squad, 1 / 60, rnd);
  assert.equal(st.enemies.length, 0, '전멸해야 한다');
  assert.equal(st.kills, 3);
  assert.ok(st.coins >= 3);
});

test('COMBAT-TOUCH: 적이 부대 줄에 닿으면 병력이 깎이고 적도 소모된다', () => {
  const rnd = mulberry32(2);
  const st = createCombat();
  spawnWave(st, 'scrapbit', 1, rnd);
  st.enemies[0].x = 240; st.enemies[0].y = 630; st.enemies[0].vy = 200;
  const r = stepCombat(st, { x: 240, count: 10, fireRateMult: 0 }, 1 / 30, rnd);
  assert.ok(r.troopLoss >= 1, '접촉 손실');
  assert.equal(st.enemies.length, 0, '자폭 소모');
});

test('COMBAT-BOSS: 구간별 보스 HP 배율·격파 코인', () => {
  const rnd = mulberry32(3);
  const st = createCombat();
  spawnBoss(st, 100, 4);                              // 최종 보스(크라운 브레이커)
  assert.equal(st.boss.hp, Math.round((BAL.boss.baseHp + BAL.boss.hpPerTroop * 100) * BAL.bosses[4].hpMult));
  assert.equal(st.boss.zone, 4);
  const st0 = createCombat();
  spawnBoss(st0, 100, 0);                             // 구간1 보스는 훨씬 약하다
  assert.ok(st0.boss.hp < st.boss.hp);
  st.boss.hp = 1;
  st.boss.x = 240; st.boss.y = 200;
  for (let i = 0; i < 240 && st.boss; i++) stepCombat(st, { x: 240, count: 50, fireRateMult: 1 }, 1 / 60, rnd);
  assert.equal(st.boss, null, '보스 격파');
  assert.ok(st.coins >= BAL.bosses[4].coin);
});

test('COMBAT-NEW: 스폰 포드는 죽으며 잡졸을 낳고, 마그넷헤드는 도주 시 코인을 훔친다', () => {
  const rnd = mulberry32(9);
  const st = createCombat();
  st.coins = 10;
  spawnWave(st, 'spawnpod', 1, rnd);
  st.enemies[0].x = 240; st.enemies[0].y = 300; st.enemies[0].hp = 0;   // 사살 처리
  stepCombat(st, { x: 240, count: 10, fireRateMult: 0 }, 1 / 60, rnd);
  const hatched = st.enemies.filter((e) => e.kind === 'scrapbit');
  assert.equal(hatched.length, 3, '고치에서 스크랩비트 3');
  const st2 = createCombat();
  st2.coins = 10;
  spawnWave(st2, 'magnethead', 1, rnd);
  st2.enemies[0].x = 100; st2.enemies[0].y = 829; st2.enemies[0].vy = 500;  // 부대를 비켜 도주
  stepCombat(st2, { x: 400, count: 10, fireRateMult: 0 }, 1 / 30, rnd);
  assert.equal(st2.coins, 5, '코인 5 도난');
  assert.equal(st2.enemies.length, 0);
});

test('COMBAT-ESHOT: 적탄이 부대에 닿으면 병력 1 손실', () => {
  const rnd = mulberry32(4);
  const st = createCombat();
  st.eshots.push({ x: 240, y: 632, vx: 0, vy: 200 });
  const r = stepCombat(st, { x: 240, count: 10, fireRateMult: 0 }, 1 / 30, rnd);
  assert.equal(r.troopLoss, 1);
  assert.equal(st.eshots.length, 0);
});

test('SIM-FULLRUN: 요격 봇이 10시드 중 7판 이상 5보스를 깬다(빡빡하되 깰 수 있는 난이도)', () => {
  let cleared = 0;
  for (const seed of [1, 2, 3, 4, 5, 11, 22, 33, 44, 55]) {
    const track = buildTrack(seed);
    let count = 10;                                   // 업그레이드 몇 개 한 상태 가정(시작 병력 10·연사 +10%)
    const rnd = mulberry32(seed * 7 + 1);
    const st = createCombat();
    let z = 0, ei = 0, dead = false, bossKills = 0;
    const dt = 1 / 30;
    let guard = 0;
    while (!dead && guard++ < 40000 && !(z >= track.length && !st.boss && ei >= track.events.length)) {
      if (!st.boss) z += 190 * dt;                    // 보스전 동안 제자리(main.advance 와 동일 규칙)
      while (ei < track.events.length && track.events[ei].z <= z) {
        const ev = track.events[ei++];
        if (ev.type === 'gatepair') {
          const { left, right } = ev.data;
          const better = applyGate(count, left) >= applyGate(count, right) ? left : right;
          count = applyGate(count, better);
        } else if (ev.type === 'wave') {
          const zone = Math.min(BAL.track.zones - 1, Math.floor(ev.z / BAL.track.zoneLen));
          spawnWave(st, ev.data.kind, ev.data.n, rnd, BAL.track.enemyHpMult[zone], zone);   // main.advance 와 동일 규칙
        } else {
          st.enemies.length = 0; st.eshots.length = 0;   // 보스전은 1:1(main.advance 와 동일 규칙)
          spawnBoss(st, count, ev.data.zone);
        }
      }
      const hadBoss = !!st.boss;
      //  플레이어는 보스나 가장 가까운 적을 조준하러 이동한다 — 봇도 동일하게
      let tx = 240;
      if (st.boss) tx = st.boss.x;
      else if (st.enemies.length) tx = st.enemies.reduce((a, b) => (a.y > b.y ? a : b)).x;
      const x = Math.max(80, Math.min(400, tx));
      const r = stepCombat(st, { x, count, fireRateMult: 1.1, tier: tierFor(count), radius: squadRadius(count) }, dt, rnd);
      if (hadBoss && !st.boss) bossKills++;
      count -= r.troopLoss;
      for (const ev of r.events) if (ev.type === 'supply') count = Math.min(BAL.squad.maxCount, count + ev.n);   // main 과 동일 규칙
      if (count <= 0) dead = true;
    }
    if (!dead && bossKills === 5) { cleared++; assert.ok(count > 10, 'seed ' + seed + ' 성장 실패: ' + count); }
  }
  assert.ok(cleared >= 7, '완주 ' + cleared + '/10 — 난이도가 무너졌다(너무 어렵거나 회귀)');
  assert.ok(cleared <= 10, 'sanity');
});

test('MAIN-HELPERS: 버튼 히트·게이트 좌우 판정 (DOM 없이 import 가능해야 한다)', async () => {
  const { hitButton, gateHitSide } = await import('../rush/main.js');
  const btns = [{ id: 'retry', x: 140, y: 600, w: 200, h: 56 }];
  assert.equal(hitButton(btns, 240, 628), 'retry');
  assert.equal(hitButton(btns, 60, 628), null);
  assert.equal(gateHitSide(120), 'left');
  assert.equal(gateHitSide(360), 'right');
});

test('SQUAD-RADIUS: 대형 반경이 병력에 비례하고 피탄 폭이 그만큼 좁아진다', async () => {
  const { squadRadius } = await import('../rush/squad.js');
  assert.equal(squadRadius(1), BAL.squad.heroSize / 2, '혼자면 히어로 몸집만');
  assert.ok(squadRadius(10) > squadRadius(1));
  assert.ok(squadRadius(120) > squadRadius(10));
  //  혼자일 때는 60px 옆 적탄에 안 맞는다(예전 ±80 고정 판정이면 맞았다)
  const st = createCombat();
  st.eshots.push({ x: 300, y: 632, vx: 0, vy: 200 });
  const r = stepCombat(st, { x: 240, count: 1, fireRateMult: 0, radius: squadRadius(1) }, 1 / 30, mulberry32(1));
  assert.equal(r.troopLoss, 0, '빗나감');
});

test('SQUAD-DISPLAY: 표시 유닛 축약 — 12까지 1:1, 이후 7:1, 최대 50', async () => {
  const { displayUnits } = await import('../rush/squad.js');
  assert.equal(displayUnits(1), 1);
  assert.equal(displayUnits(12), 12);
  assert.equal(displayUnits(13), 12);
  assert.equal(displayUnits(82), 22);
  assert.equal(displayUnits(999), 50);
});
