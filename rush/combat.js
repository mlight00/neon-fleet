// rush/combat.js — 표시와 무관한 순수 전투 스텝. 모든 난수는 주입된 rnd 만 쓴다.
import { BAL } from './balance.js';

export function createCombat() {
  return { enemies: [], bullets: [], eshots: [], pools: [], boss: null, fireT: 0, coins: 0, kills: 0 };
}

export function spawnWave(st, kind, n, rnd, hpMult = 1, zone = 0) {
  const def = BAL.enemies[kind];
  const scroll = BAL.track.scrollSpeed;
  //  화면 속도 = 스크롤(도로) + 세계 전진 x 구간 배율. 도로 고정형(speed=190)은 배율 무관.
  const vy = scroll + Math.max(0, def.speed - scroll) * (BAL.track.enemyAdvMult?.[zone] ?? 1);
  for (let i = 0; i < n; i++) {
    st.enemies.push({
      kind, zone, hp: Math.round(def.hp * hpMult), r: Math.round(def.r * (BAL.track.enemySizeMult?.[zone] ?? 1)),
      //  웨이브 내 균등 분산(뭉침 방지): 도로를 n등분한 자리 + 지터
      x: Math.max(85, Math.min(395, 85 + ((i + 0.5) / n) * 310 + (rnd() - 0.5) * 60)),
      y: -40 - rnd() * 170,
      vx: def.zigzag ? (rnd() < 0.5 ? -def.zigzag : def.zigzag) : (def.straight ? 0 : (rnd() - 0.5) * 30),
      vy,
      shootT: def.shootEvery ? def.shootEvery * (0.5 + rnd() * 0.8) : undefined,
      hopT: def.hopEvery ? def.hopEvery * (0.4 + rnd() * 0.8) : undefined,
      hopDur: 0,
    });
  }
}

export function spawnBoss(st, troopCount, zone) {
  const B = BAL.boss, def = BAL.bosses[zone];
  //  구간 고정 체력: 병력이 많을수록 확실히 빨리 잡는다(비례 체력의 역인센티브 제거)
  const hp = Math.round(B.hpByZone?.[zone] ?? 900);
  st.boss = { zone, hp, max: hp, x: 240, y: -80, r: def.r,
              dir: 1, shootT: def.shootEvery, touchT: 0, spawnT: def.spawnEvery ?? 0 };
}

function shootFan(st, x, y, tx, ty, fan, speed, dmg = 1, shape = 'lamp') {
  const base = Math.atan2(ty - y, tx - x);
  for (let k = 0; k < fan; k++) {
    const a = base + (k - (fan - 1) / 2) * 0.26;
    st.eshots.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, shape });
  }
}

export function stepCombat(st, squad, dt, rnd) {
  const S = BAL.squad, lineY = S.y - 8;
  const rad = squad.radius ?? 60;                     // 대형 실제 반경 — 피탄·접촉 폭의 기준
  const tier = squad.tier ?? 0;
  const muzzles = S.muzzles[tier] ?? 1;
  const bulletDmg = (S.bulletDmg + squad.count * S.dmgPerTroop) * (S.tierDmgMult[tier] ?? 1) / muzzles;   // 병력+티어 = 화력(열 수로 배분)
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
      st.fireSeq = (st.fireSeq ?? 0) + 1;
      //  절반은 히어로 정중앙 직사(조준의 축), 절반은 대형 폭 산개
      const cx = st.fireSeq % 2 === 0 ? squad.x : squad.x + (rnd() - 0.5) * spread;
      for (let m = 0; m < muzzles; m++) {
        st.bullets.push({ x: cx + (m - (muzzles - 1) / 2) * 14, y: S.y - 20, vy: -(S.bulletSpeeds?.[tier] ?? S.bulletSpeed), w: S.bulletW[tier] ?? 4, tier });
      }
      shots++;
    }
    for (let si = 0; si < shots; si++) events.push({ type: 'fire' });   // 발사 1회 = 소리 1회(연출 매칭)
  }
  for (const b of st.bullets) {
    b.y += b.vy * dt;
    if (b.vx) b.x += b.vx * dt;
  }
  for (const e of st.enemies) {                       // 마그넷헤드 자기장: 근처 아군 탄이 빨려 휜다
    const def = BAL.enemies[e.kind];
    if (!def.magnetR) continue;
    for (const b of st.bullets) {
      const dx = e.x - b.x, dy = e.y - b.y;
      const d2 = dx * dx + dy * dy;
      if (d2 < def.magnetR * def.magnetR) {
        const d = Math.sqrt(d2) || 1;
        b.vx = (b.vx ?? 0) + (dx / d) * def.magnetPull * dt;
      }
    }
  }

  //  적 이동·사격·접촉
  for (const e of st.enemies) {
    const def = BAL.enemies[e.kind];
    if (e.hopT !== undefined) {                       // 맨홀 점퍼: 부대 쪽으로 도약해 착지 충격파
      e.hopT -= dt;
      if (e.hopT <= 0) {
        e.hopT = def.hopEvery;
        e.hopDur = 0.25;
        e.hopVx = Math.sign(squad.x - e.x || 1) * def.hopSpeed;
      }
      if (e.hopDur > 0) {
        e.hopDur -= dt;
        e.x += e.hopVx * dt;
        if (e.hopDur <= 0 && def.hopShock) {          // 착지 — 파편 충격파
          shootFan(st, e.x, e.y, squad.x, lineY, def.hopShock, 210, BAL.track.eshotDmg?.[e.zone ?? 0] ?? 1, 'shard');
        }
      }
    }
    if (def.emitEvery) {                              // 스폰 포드: 살아서도 잡졸을 낳는다
      e.emitT = (e.emitT ?? def.emitEvery * (0.5 + rnd() * 0.5)) - dt;
      if (e.emitT <= 0) {
        e.emitT = def.emitEvery;
        spawnWave(st, def.spawns, 1, rnd, 1, e.zone ?? 0);
        st.enemies[st.enemies.length - 1].y = e.y + e.r;
        st.enemies[st.enemies.length - 1].x = e.x;
      }
    }
    if (def.accel) e.vy = Math.min(def.maxSpeed ?? 999, e.vy + def.accel * dt);   // 램하운드: 자동차처럼 내리막 가속
    e.x += e.vx * dt; e.y += e.vy * dt;
    if (e.x < 80 || e.x > 400) { e.vx *= -1; e.x = Math.max(80, Math.min(400, e.x)); }
    if (e.aimT !== undefined && e.aimT > 0) {         // 저격 조준 중(조준점 고정)
      e.aimT -= dt;
      if (e.aimT <= 0) {
        shootFan(st, e.x, e.y, e.aimX, e.aimY, 1, def.shotSpeed, (BAL.track.eshotDmg?.[e.zone ?? 0] ?? 1) + 1, 'needle');
        e.shootT = def.shootEvery;
      }
    } else if (e.shootT !== undefined) {
      e.shootT -= dt;
      if (e.shootT <= 0) {
        if (def.aimTime) {                            // 니들아이: 조준선을 보여주고 쏜다
          e.aimT = def.aimTime;
          e.aimX = squad.x; e.aimY = lineY;
        } else {
          e.shootT = def.shootEvery;
          shootFan(st, e.x, e.y, squad.x, lineY, def.fan ?? 1, def.shotSpeed, BAL.track.eshotDmg?.[e.zone ?? 0] ?? 1, def.shot ?? 'lamp');
        }
      }
    }
    if (e.y >= lineY - e.r && e.y <= lineY + e.r + 30 && Math.abs(e.x - squad.x) < rad + e.r) {   // 지나간 적은 접촉 없음
      if (def.pickup) {                               // POW 뱃지: 줍는 순간 버스터
        e.hp = 0; e.touched = true; e.picked = true;
        events.push({ type: 'pow', x: e.x, y: e.y });
      } else {
        troopLoss += def.touchLoss ?? S.touchLossPerHit;
        e.hp = 0; e.touched = true;                   // 접촉 = 자폭 소모(기획 4-1)
      }
    }
  }

  //  버스터 빔(POW): 히어로 전방 폭 2xhalfW 관통 — 적·보스 지속 피해, 적탄 소각
  if (squad.beam) {
    const hw = BAL.fx.busterHalfW;
    const beamDmg = BAL.fx.busterDps * dt;
    for (const e of st.enemies) {
      if (e.hp > 0 && !BAL.enemies[e.kind].pickup && Math.abs(e.x - squad.x) < hw + e.r && e.y < lineY) e.hp -= beamDmg;
    }
    if (st.boss && Math.abs(st.boss.x - squad.x) < hw + st.boss.r) st.boss.hp -= beamDmg;
    for (const s2 of st.eshots) if (Math.abs(s2.x - squad.x) < hw) s2.dead = true;
  }

  //  적탄 이동·명중 — 갈고리는 좌우로 크게 흔들리며 낙하한다
  for (const s of st.eshots) {
    if (s.dead) continue;                             // 버스터로 소각된 탄은 같은 프레임에도 무효(GPT 검토 재현 버그)
    if (s.hook) {
      s.t = (s.t ?? 0) + dt;
      s.x = s.baseX + Math.sin(s.t * 4.2) * (s.swing ?? 0);
    } else {
      s.x += s.vx * dt;
    }
    s.y += s.vy * dt;
    //  부대 줄을 지나는 순간에만 명중(이미 지나간 탄이 옆걸음에 맞지 않게)
    if (s.y >= lineY && s.y <= lineY + 46 && Math.abs(s.x - squad.x) < rad + (s.hook ? 16 : 5)) { troopLoss += s.hook ? 3 : (s.dmg ?? 1); s.dead = true; }
  }

  //  보스 — 공통 골격: 좌우 이동 + 부채꼴 사격 + 접촉. 스멜터(spawnEvery)는 잡졸 소환.
  if (st.boss) {
    const bo = st.boss, def = BAL.bosses[bo.zone];
    const ratio = bo.hp / bo.max;
    const B = BAL.boss;
    bo.rage = ratio < B.rageAt;
    bo.phase2 = ratio < B.phase2At;
    const rate = bo.rage ? B.rageRate : bo.phase2 ? B.phase2Rate : 1;   // 패턴 주기 배율
    const spdMult = bo.rage ? B.rageSpeed : bo.phase2 ? 1.15 : 1;
    const fanN = def.fan + (bo.phase2 ? 1 : 0);   // 광분은 부채꼴 추가 없이 빈도·기동만(공격량 +30% 수준)
    if (def.ramEvery) {                               // 그레이더: 불도저 돌진 — 밀고 내려왔다 후진
      bo.ramT = (bo.ramT ?? def.ramEvery) - dt;
      if (bo.ramPhase === 1) {
        bo.y += def.ramSpeed * dt;
        if (bo.y >= lineY - bo.r * 0.6) bo.ramPhase = 2;
      } else if (bo.ramPhase === 2) {
        bo.y -= 150 * dt;
        if (bo.y <= 140) { bo.y = 140; bo.ramPhase = 0; }
      } else if (bo.ramT <= 0 && bo.y >= 130) {
        bo.ramPhase = 1; bo.ramT = def.ramEvery;
      }
    }
    if (def.sweepEvery) {                             // 레일 리바이어던: 경고 후 차선을 위->아래로 관통
      if (bo.sweepPhase === 1) {                      // 경고(텔레그래프)
        bo.sweepWarnT -= dt;
        if (bo.sweepWarnT <= 0) { bo.sweepPhase = 2; bo.x = bo.warnX; bo.y = -110; bo.diveHit = false; }
      } else if (bo.sweepPhase === 2) {               // 관통 낙하
        bo.y += def.sweepSpeed * dt;
        if (!bo.diveHit && bo.y + bo.r >= lineY && Math.abs(bo.x - squad.x) < rad * 0.5 + bo.r * 0.8) {
          troopLoss += def.sweepHit; bo.diveHit = true;
        }
        if (bo.y > 900) { bo.sweepPhase = 0; bo.y = -90; bo.sweepT = def.sweepEvery * rate; }
      } else {
        bo.sweepT = (bo.sweepT ?? def.sweepEvery) - dt;
        if (bo.sweepT <= 0) { bo.sweepPhase = 1; bo.sweepWarnT = bo.rage ? 0.7 : 1; bo.warnX = squad.x; }
      }
    }
    if (def.poolEvery) {                              // 스멜터: 부대 자리에 쇳물 장판(경고 -> 4초 지속)
      bo.poolT = (bo.poolT ?? def.poolEvery * 0.7) - dt;
      if (bo.poolT <= 0) {
        bo.poolT = def.poolEvery * rate;
        st.pools.push({ x: squad.x, y: lineY - 46, warn: 0.9, life: 4, tick: 0 });
      }
    }
    if (def.hookEvery) {                              // 갠트리 위도우: 갈고리를 아래로 쭉 뻗는다
      bo.hookT = (bo.hookT ?? def.hookEvery * 0.6) - dt;
      if (bo.hookT <= 0) {
        bo.hookT = def.hookEvery * rate;
        st.eshots.push({ x: bo.x, y: bo.y + bo.r, baseX: bo.x, vx: 0, vy: def.hookSpeed, hook: true, swing: def.hookSwing ?? 0 });
      }
    }
    if (bo.y < 140 && !bo.ramPhase && !bo.sweepPhase) bo.y += 60 * dt;
    if (bo.sweepPhase !== 2) {
      bo.x += bo.dir * def.speed * spdMult * dt;
      if (bo.x < 90 || bo.x > 390) bo.dir *= -1;
    }
    bo.shootT -= dt;
    //  돌진(램) 중에는 사격하지 않는다 — 광분 모드만 돌진 중에도 쏜다
    if (bo.shootT <= 0 && bo.sweepPhase !== 2 && (!bo.ramPhase || bo.rage)) {
      bo.shootT = def.shootEvery * rate;
      shootFan(st, bo.x, bo.y + bo.r, squad.x, lineY, fanN, def.shotSpeed * (bo.rage ? 1.15 : 1), (BAL.track.eshotDmg?.[bo.zone] ?? 1) + (B.shotBonus ?? 0), 'shell');
    }
    if (def.spawnEvery) {
      bo.spawnT -= dt;
      if (bo.spawnT <= 0) { bo.spawnT = def.spawnEvery * rate; spawnWave(st, 'scrapbit', 2, rnd, 1, bo.zone); }
    }
    bo.touchT -= dt;
    if (bo.y + bo.r >= lineY && Math.abs(bo.x - squad.x) < rad * 0.5 + bo.r * 0.7 && bo.touchT <= 0) {
      bo.touchT = 1 / BAL.boss.touchLossPerSec * 4;   // 초당 손실 상한을 4틱으로 분할
      troopLoss += Math.max(1, Math.round(BAL.boss.touchLossPerSec / 4));
    }
  }

  //  쇳물 장판: 경고 후 점화, 위에 서 있으면 주기 손실
  for (const pl of st.pools) {
    if (pl.warn > 0) { pl.warn -= dt; continue; }
    pl.life -= dt;
    pl.tick -= dt;
    if (pl.tick <= 0 && Math.abs(squad.x - pl.x) < rad + 34) {
      pl.tick = 0.5;
      troopLoss += BAL.bosses[3].poolDmg;
    }
  }
  st.pools = st.pools.filter((pl) => pl.life > 0);

  //  탄 명중 판정
  for (const b of st.bullets) {
    if (b.dead) continue;
    if (st.boss && Math.hypot(b.x - st.boss.x, b.y - st.boss.y) < st.boss.r) {
      st.boss.hp -= bulletDmg; b.dead = true; continue;
    }
    for (const e of st.enemies) {
      if (e.hp > 0 && !BAL.enemies[e.kind].pickup && Math.hypot(b.x - e.x, b.y - e.y) < e.r + 4) { e.hp -= bulletDmg * (BAL.enemies[e.kind].shieldReduce ?? 1); b.dead = true; break; }
    }
  }

  //  정리 — 격파 보상(접촉 자폭은 보상 없음)·스폰 포드 부화·마그넷헤드 도주 페널티
  const born = [];
  st.enemies = st.enemies.filter((e) => {
    const def = BAL.enemies[e.kind];
    if (e.hp <= 0) {
      if (!e.picked) st.kills++;                       // POW 픽업은 격파 수에 안 센다
      events.push({ type: 'kill', x: e.x, y: e.y, r: e.r, kind: e.kind, touched: !!e.touched });
      if (!e.touched) st.coins += def.coin;
      if (e.kind === 'supply' && !e.touched) {
        events.push({ type: 'supply', x: e.x, y: e.y, n: def.rewardByZone[e.zone ?? 0] ?? 6 });
      }
      if (def.spawns) born.push({ kind: def.spawns, n: def.spawnN, x: e.x, y: e.y });
      if (def.deathBurst && !e.touched) {              // 고철 수레: 터지며 파편 산탄
        shootFan(st, e.x, e.y, e.x, e.y + 300, def.deathBurst, 240, 1, 'shard');
      }
      return false;
    }
    if (e.y >= 830) {
      if (def.stealCoins) {                            // 도둑이 달아났다
        st.coins = Math.max(0, st.coins - def.stealCoins);
        events.push({ type: 'steal', n: def.stealCoins });
      }
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
