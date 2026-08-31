// rush/combat.js — 표시와 무관한 순수 전투 스텝. 모든 난수는 주입된 rnd 만 쓴다.
import { BAL } from './balance.js';

export function createCombat() {
  return { enemies: [], bullets: [], eshots: [], boss: null, fireT: 0, coins: 0, kills: 0 };
}

export function spawnWave(st, kind, n, rnd) {
  const def = BAL.enemies[kind];
  for (let i = 0; i < n; i++) {
    st.enemies.push({
      kind, hp: def.hp, r: def.r,
      x: 60 + rnd() * 360, y: -40 - rnd() * 120,
      vx: (rnd() - 0.5) * 30, vy: def.speed,
      shootT: def.shootEvery ? def.shootEvery * (0.5 + rnd() * 0.8) : undefined,
    });
  }
}

export function spawnBoss(st, troopCount) {
  const B = BAL.boss;
  st.boss = { hp: Math.round(B.baseHp + B.hpPerTroop * troopCount), max: 0, x: 240, y: -80, r: B.r,
              dir: 1, shootT: B.shootEvery, touchT: 0 };
  st.boss.max = st.boss.hp;
}

export function stepCombat(st, squad, dt, rnd) {
  const S = BAL.squad, lineY = S.y - 8;
  let troopLoss = 0;

  //  아군 사격 — count 비례 발사(틱당 묶음). fireRateMult 0 이면 사격 없음(테스트용).
  if (squad.fireRateMult > 0) {
    st.fireT -= dt;
    const interval = S.fireInterval / (squad.fireRateMult * Math.max(1, Math.sqrt(squad.count)));
    while (st.fireT <= 0) {
      st.fireT += Math.max(0.02, interval);
      st.bullets.push({ x: squad.x + (rnd() - 0.5) * 60, y: S.y - 20, vy: -S.bulletSpeed });
    }
  }
  for (const b of st.bullets) b.y += b.vy * dt;

  //  적 이동·사격·접촉
  for (const e of st.enemies) {
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (e.x < 30 || e.x > 450) e.vx *= -1;
    if (e.shootT !== undefined) {
      e.shootT -= dt;
      if (e.shootT <= 0) {
        e.shootT = BAL.enemies[e.kind].shootEvery;
        const dx = squad.x - e.x, dy = lineY - e.y, len = Math.hypot(dx, dy) || 1;
        const sp = BAL.enemies[e.kind].shotSpeed;
        st.eshots.push({ x: e.x, y: e.y, vx: (dx / len) * sp, vy: (dy / len) * sp });
      }
    }
    if (e.y >= lineY - e.r && Math.abs(e.x - squad.x) < 90) {
      troopLoss += BAL.enemies[e.kind].touchLoss ?? S.touchLossPerHit;
      e.hp = 0; e.touched = true;                          // 접촉 = 자폭 소모(기획 4-1)
    }
  }

  //  적탄 이동·명중
  for (const s of st.eshots) {
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.y >= lineY && Math.abs(s.x - squad.x) < 80) { troopLoss += 1; s.dead = true; }
  }

  //  보스
  if (st.boss) {
    const B = BAL.boss, bo = st.boss;
    if (bo.y < 140) bo.y += 60 * dt;
    bo.x += bo.dir * B.speed * dt;
    if (bo.x < 90 || bo.x > 390) bo.dir *= -1;
    bo.shootT -= dt;
    if (bo.shootT <= 0) {
      bo.shootT = B.shootEvery;
      for (let k = 0; k < B.fan; k++) {
        const a = Math.PI / 2 + (k - (B.fan - 1) / 2) * 0.28;   // 아래 부채꼴
        st.eshots.push({ x: bo.x, y: bo.y + bo.r, vx: Math.cos(a) * B.shotSpeed, vy: Math.sin(a) * B.shotSpeed });
      }
    }
    bo.touchT -= dt;
    if (bo.y + bo.r >= lineY && Math.abs(bo.x - squad.x) < 110 && bo.touchT <= 0) {
      bo.touchT = 1 / B.touchLossPerSec * 4;                   // 초당 손실 상한을 4틱으로 분할
      troopLoss += Math.max(1, Math.round(B.touchLossPerSec / 4));
    }
  }

  //  탄 명중 판정
  for (const b of st.bullets) {
    if (b.dead) continue;
    if (st.boss && Math.hypot(b.x - st.boss.x, b.y - st.boss.y) < st.boss.r) {
      st.boss.hp -= S.bulletDmg; b.dead = true; continue;
    }
    for (const e of st.enemies) {
      if (e.hp > 0 && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) { e.hp -= S.bulletDmg; b.dead = true; break; }
    }
  }

  //  정리(격파 보상 포함 — 접촉 자폭은 보상 없음)
  st.enemies = st.enemies.filter((e) => {
    if (e.hp <= 0) {
      st.kills++;
      if (!e.touched) st.coins += BAL.enemies[e.kind].coin;
      return false;
    }
    return e.y < 830;
  });
  if (st.boss && st.boss.hp <= 0) { st.coins += BAL.boss.coin; st.kills++; st.boss = null; }
  st.bullets = st.bullets.filter((b) => !b.dead && b.y > -40);
  st.eshots = st.eshots.filter((s) => !s.dead && s.y < 830 && s.x > -40 && s.x < 520);

  return { troopLoss };
}
