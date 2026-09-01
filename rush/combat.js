// rush/combat.js — 표시와 무관한 순수 전투 스텝. 모든 난수는 주입된 rnd 만 쓴다.
import { BAL } from './balance.js';

export function createCombat() {
  return { enemies: [], bullets: [], eshots: [], boss: null, fireT: 0, coins: 0, kills: 0 };
}

export function spawnWave(st, kind, n, rnd, hpMult = 1) {
  const def = BAL.enemies[kind];
  for (let i = 0; i < n; i++) {
    st.enemies.push({
      kind, hp: Math.round(def.hp * hpMult), r: def.r,
      x: 85 + rnd() * 310, y: -40 - rnd() * 120,
      vx: def.zigzag ? (rnd() < 0.5 ? -def.zigzag : def.zigzag) : (rnd() - 0.5) * 30,
      vy: def.speed,
      shootT: def.shootEvery ? def.shootEvery * (0.5 + rnd() * 0.8) : undefined,
      hopT: def.hopEvery ? def.hopEvery * (0.4 + rnd() * 0.8) : undefined,
      hopDur: 0,
    });
  }
}

export function spawnBoss(st, troopCount, zone) {
  const B = BAL.boss, def = BAL.bosses[zone];
  const hp = Math.round((B.baseHp + B.hpPerTroop * troopCount) * def.hpMult);
  st.boss = { zone, hp, max: hp, x: 240, y: -80, r: def.r,
              dir: 1, shootT: def.shootEvery, touchT: 0, spawnT: def.spawnEvery ?? 0 };
}

function shootFan(st, x, y, tx, ty, fan, speed) {
  const base = Math.atan2(ty - y, tx - x);
  for (let k = 0; k < fan; k++) {
    const a = base + (k - (fan - 1) / 2) * 0.26;
    st.eshots.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
  }
}

export function stepCombat(st, squad, dt, rnd) {
  const S = BAL.squad, lineY = S.y - 8;
  const rad = squad.radius ?? 60;                     // 대형 실제 반경 — 피탄·접촉 폭의 기준
  const tier = squad.tier ?? 0;
  const muzzles = S.muzzles[tier] ?? 1;
  const bulletDmg = (S.bulletDmg + squad.count * S.dmgPerTroop) / muzzles;   // 병력 = 화력(열 수로 배분)
  const events = [];
  let troopLoss = 0;

  //  아군 사격 — count 비례 발사(틱당 묶음). 티어가 오르면 발사 열이 늘고 탄이 굵어진다(성장 체감).
  if (squad.fireRateMult > 0) {
    st.fireT -= dt;
    const interval = S.fireInterval / (squad.fireRateMult * Math.min(S.fireRateCap, Math.max(1, Math.sqrt(squad.count))));
    const spread = Math.min(150, 24 + (squad.radius ?? 40) * 1.4);    // 사선 = 부대 폭 — 조준하려면 움직여야 한다
    let shots = 0;
    while (st.fireT <= 0) {
      st.fireT += Math.max(0.02, interval);
      const cx = squad.x + (rnd() - 0.5) * spread;
      for (let m = 0; m < muzzles; m++) {
        st.bullets.push({ x: cx + (m - (muzzles - 1) / 2) * 14, y: S.y - 20, vy: -S.bulletSpeed, w: S.bulletW[tier] ?? 4 });
      }
      shots++;
    }
    if (shots > 0) events.push({ type: 'fire' });
  }
  for (const b of st.bullets) b.y += b.vy * dt;

  //  적 이동·사격·접촉
  for (const e of st.enemies) {
    const def = BAL.enemies[e.kind];
    if (e.hopT !== undefined) {                       // 맨홀 점퍼: 주기적으로 옆 차선 도약
      e.hopT -= dt;
      if (e.hopT <= 0) {
        e.hopT = def.hopEvery;
        e.hopDur = 0.25;
        e.hopVx = (rnd() < 0.5 ? -1 : 1) * def.hopSpeed;
      }
      if (e.hopDur > 0) { e.hopDur -= dt; e.x += e.hopVx * dt; }
    }
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (e.x < 80 || e.x > 400) { e.vx *= -1; e.x = Math.max(80, Math.min(400, e.x)); }
    if (e.shootT !== undefined) {
      e.shootT -= dt;
      if (e.shootT <= 0) {
        e.shootT = def.shootEvery;
        shootFan(st, e.x, e.y, squad.x, lineY, def.fan ?? 1, def.shotSpeed);
      }
    }
    if (e.y >= lineY - e.r && Math.abs(e.x - squad.x) < rad + e.r) {
      troopLoss += def.touchLoss ?? S.touchLossPerHit;
      e.hp = 0; e.touched = true;                     // 접촉 = 자폭 소모(기획 4-1)
    }
  }

  //  적탄 이동·명중
  for (const s of st.eshots) {
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.y >= lineY && Math.abs(s.x - squad.x) < rad + 5) { troopLoss += 1; s.dead = true; }
  }

  //  보스 — 공통 골격: 좌우 이동 + 부채꼴 사격 + 접촉. 스멜터(spawnEvery)는 잡졸 소환.
  if (st.boss) {
    const bo = st.boss, def = BAL.bosses[bo.zone];
    if (bo.y < 140) bo.y += 60 * dt;
    bo.x += bo.dir * def.speed * dt;
    if (bo.x < 90 || bo.x > 390) bo.dir *= -1;
    bo.shootT -= dt;
    if (bo.shootT <= 0) {
      bo.shootT = def.shootEvery;
      shootFan(st, bo.x, bo.y + bo.r, squad.x, lineY, def.fan, def.shotSpeed);
    }
    if (def.spawnEvery) {
      bo.spawnT -= dt;
      if (bo.spawnT <= 0) { bo.spawnT = def.spawnEvery; spawnWave(st, 'scrapbit', 2, rnd); }
    }
    bo.touchT -= dt;
    if (bo.y + bo.r >= lineY && Math.abs(bo.x - squad.x) < rad + bo.r * 0.8 && bo.touchT <= 0) {
      bo.touchT = 1 / BAL.boss.touchLossPerSec * 4;   // 초당 손실 상한을 4틱으로 분할
      troopLoss += Math.max(1, Math.round(BAL.boss.touchLossPerSec / 4));
    }
  }

  //  탄 명중 판정
  for (const b of st.bullets) {
    if (b.dead) continue;
    if (st.boss && Math.hypot(b.x - st.boss.x, b.y - st.boss.y) < st.boss.r) {
      st.boss.hp -= bulletDmg; b.dead = true; continue;
    }
    for (const e of st.enemies) {
      if (e.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) { e.hp -= bulletDmg; b.dead = true; break; }
    }
  }

  //  정리 — 격파 보상(접촉 자폭은 보상 없음)·스폰 포드 부화·마그넷헤드 도주 페널티
  const born = [];
  st.enemies = st.enemies.filter((e) => {
    const def = BAL.enemies[e.kind];
    if (e.hp <= 0) {
      st.kills++;
      events.push({ type: 'kill', x: e.x, y: e.y, r: e.r, touched: !!e.touched });
      if (!e.touched) st.coins += def.coin;
      if (def.spawns) born.push({ kind: def.spawns, n: def.spawnN, x: e.x, y: e.y });
      return false;
    }
    if (e.y >= 830) {
      if (def.stealCoins) st.coins = Math.max(0, st.coins - def.stealCoins);   // 도둑이 달아났다
      return false;
    }
    return true;
  });
  for (const b of born) {
    for (let i = 0; i < b.n; i++) {
      st.enemies.push({
        kind: b.kind, hp: BAL.enemies[b.kind].hp, r: BAL.enemies[b.kind].r,
        x: Math.max(40, Math.min(440, b.x + (rnd() - 0.5) * 70)), y: b.y + (rnd() - 0.5) * 30,
        vx: (rnd() - 0.5) * 40, vy: BAL.enemies[b.kind].speed,
      });
    }
  }
  if (st.boss && st.boss.hp <= 0) {
    st.coins += BAL.bosses[st.boss.zone].coin;
    st.kills++;
    events.push({ type: 'bossKill', x: st.boss.x, y: st.boss.y, r: st.boss.r });
    st.boss = null;
  }
  st.bullets = st.bullets.filter((b) => !b.dead && b.y > -40);
  st.eshots = st.eshots.filter((s) => !s.dead && s.y < 830 && s.x > -40 && s.x < 520);

  if (troopLoss > 0) events.push({ type: 'hurt', n: troopLoss });
  return { troopLoss, events };
}
