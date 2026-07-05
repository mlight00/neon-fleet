// 게임 개체 — 확장판 (부록 설계 반영)
// 편대(진화+무기) / 탄·미사일 / 크리스탈 / 게이트 / 보이드 스웜 / 사격형 적 / 하이브 퀸 / 이펙트
// world = { bal, input, squad, bullets, enemyBullets, entities, effects, addCoins,
//           spawnEntity, spawnEnemyBullet, scrollSpeed, logicalW, logicalH, rng, phase }
import { BAL } from './balance.js';
import { applyGate, hitCrystal, tierFor } from './logic.js';
import { circleHit } from './collision.js';
import { COLORS, WEAPON_COLORS, WEAPON_LABELS, glow, makeSprite, blit, drawGateBox } from './render.js';
import { shipSprite, drawFlames, drawDeckLights, SHIP_DEFS } from './ships.js';
import { getSprite } from './sprites.js';
import { sfx } from './audio.js';

// ───────────────────────── 이펙트 (파티클 + 텍스트 + 충격파 링 + 화면 플래시)
export function createEffects() {
  const parts = [];
  const texts = [];
  const rings = [];
  let flashV = 0;
  return {
    burst(x, y, color, n = 14, speed = 160) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.6);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, color, size: 2 + Math.random() * 3 });
      }
    },
    text(x, y, str, color) {
      texts.push({ x, y, str, color, life: 0.9, max: 0.9 });
    },
    ring(x, y, color, delay = 0) {
      rings.push({ x, y, r: 20, life: 0.45 + delay, max: 0.45, color, delay });
    },
    flash(v = 0.5) { flashV = Math.max(flashV, v); },
    update(dt) {
      for (const p of parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 300 * dt; p.life -= dt; }
      for (const t of texts) { t.y -= 40 * dt; t.life -= dt; }
      for (const r of rings) {
        if (r.delay > 0) { r.delay -= dt; continue; }
        r.life -= dt;
        r.r += (150 - r.r) * Math.min(1, 6 * dt) + 120 * dt;
      }
      flashV = Math.max(0, flashV - dt * 5);
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i].life <= 0) texts.splice(i, 1);
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].life <= 0) rings.splice(i, 1);
    },
    draw(ctx, logicalW, logicalH) {
      for (const p of parts) {
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      for (const r of rings) {
        if (r.delay > 0) continue;
        ctx.globalAlpha = Math.max(0, r.life / r.max);
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 1 + 5 * (r.life / r.max);
        ctx.beginPath();
        ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      for (const t of texts) {
        ctx.globalAlpha = Math.max(0, t.life / t.max);
        ctx.font = 'bold 20px sans-serif';
        glow(ctx, t.color, 8, (c) => { c.fillStyle = t.color; c.fillText(t.str, t.x, t.y); });
      }
      ctx.globalAlpha = 1;
      if (flashV > 0) {
        ctx.globalAlpha = flashV;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, logicalW, logicalH);
        ctx.globalAlpha = 1;
      }
    },
  };
}

// ───────────────────────── 편대 (플레이어): 진화 + 무기 + 뱅킹
export class Squad {
  constructor(logicalW, logicalH, startCount) {
    this.count = startCount;
    this.x = logicalW / 2;
    this.prevX = this.x;
    this.y = logicalH - 130;
    this.fireAcc = 0;
    this.powerT = 0;
    this.flash = 0;
    this.recoil = 0;
    this.bank = 0;
    this.t = 0;
    this.tier = 0;
    this.weapon = 'vulcan';
    this.weaponLv = 1;
    this.shield = false;
    this.evolvePunch = 0;
    this.dead = false;
    this._offsets = Squad.formationOffsets(BAL.squad.drawCap);
  }

  static formationOffsets(n) {
    const arr = [];
    const golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < n; i++) {
      const r = Math.sqrt(i + 0.5) / Math.sqrt(n);
      const a = i * golden;
      arr.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * 0.7, r, phase: i * 1.7 });
    }
    return arr;
  }

  get width() {
    const base = SHIP_DEFS[this.tier].clearR;
    return Math.max(base, Math.min(BAL.squad.maxWidth, 12 * Math.sqrt(this.count)));
  }
  get hitRadius() {
    return Math.max(14, this.width * 0.8);
  }

  setWeapon(weapon, world) {
    if (this.weapon === weapon) {
      if (this.weaponLv < BAL.weapons.maxLv) {
        this.weaponLv++;
        world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[weapon]} Lv${this.weaponLv}!`, WEAPON_COLORS[weapon]);
      } else {
        world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[weapon]} MAX`, WEAPON_COLORS[weapon]);
      }
    } else {
      this.weapon = weapon; // 교체 벌점 없음: 레벨 유지 (라이덴 방식)
      world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[weapon]} 장착!`, WEAPON_COLORS[weapon]);
    }
    world.effects.burst(this.x, this.y - 20, WEAPON_COLORS[this.weapon], 14, 140);
    sfx('pickup');
  }

  levelUp(world) {
    if (this.weaponLv < BAL.weapons.maxLv) this.weaponLv++;
    world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[this.weapon]} Lv${this.weaponLv}!`, WEAPON_COLORS[this.weapon]);
  }

  checkEvolution(world) {
    const ev = BAL.evolution;
    const next = tierFor(this.count, this.tier, ev.thresholds, ev.demoteRatio);
    if (next > this.tier) {
      this.tier = next;
      world.effects.flash(0.5);
      world.effects.ring(this.x, this.y, COLORS.ally, 0);
      world.effects.ring(this.x, this.y, COLORS.ally, 0.1);
      world.effects.burst(this.x, this.y, COLORS.ally, 24, 260);
      // 뭐가 좋아졌는지 명시: 화력 배수 + 주포 수 (진화 체감의 핵심)
      world.effects.text(this.x, this.y - 100, `${ev.names[next]}로 진화!`, COLORS.reward);
      world.effects.text(this.x, this.y - 76, `화력 x${ev.dpsMult[next]} · 주포 ${SHIP_DEFS[next].mounts.length}문`, COLORS.ally);
      this.evolvePunch = 0.35; // 스케일 펀치 타이머
      sfx('evolve');
    } else if (next < this.tier) {
      this.tier = next;
      this.flash = 0.3;
      world.effects.text(this.x, this.y - 80, `강등... ${ev.names[next]}`, COLORS.danger);
      sfx('demote');
    }
  }

  applyDelta(n, world, label) {
    const before = this.count;
    this.count = Math.max(0, this.count + n);
    if (n > 0) world.effects.text(this.x, this.y - 40, `+${n}`, COLORS.ally);
    else if (n < 0) {
      world.effects.text(this.x, this.y - 40, `${n}`, COLORS.danger);
      this.flash = 0.25;
    }
    if (label) world.effects.text(this.x, this.y - 64, label, COLORS.reward);
    this.checkEvolution(world);
    if (before > 0 && this.count === 0) this.dead = true;
  }

  setCount(n, world, label) {
    const diff = n - this.count;
    if (diff !== 0) this.applyDelta(diff, world, label);
  }

  /** 접촉 피해 (크리처/운석): 실드 1회 무효 */
  contactDamage(n, world) {
    if (this.shield) {
      this.shield = false;
      world.effects.text(this.x, this.y - 40, 'SHIELD!', COLORS.gateGood);
      world.effects.ring(this.x, this.y, COLORS.gateGood);
      sfx('shield_pop');
      return;
    }
    this.applyDelta(-n, world);
    sfx('damage');
  }

  update(dt, world) {
    this.t += dt;
    const target = world.input.targetX;
    this.prevX = this.x;
    this.x += (target - this.x) * Math.min(1, BAL.squad.followSpeed * dt);
    const m = BAL.squad.laneMargin + this.width * 0.4;
    this.x = Math.max(m, Math.min(world.logicalW - m, this.x));

    // 뱅킹: 이동 속도 → 기울임 (스무딩)
    const vx = dt > 0 ? (this.x - this.prevX) / dt : 0;
    const bankTarget = Math.max(-1, Math.min(1, vx / 600));
    this.bank += (bankTarget - this.bank) * Math.min(1, 10 * dt);

    if (this.powerT > 0) this.powerT -= dt;
    if (this.flash > 0) this.flash -= dt;
    if (this.evolvePunch > 0) this.evolvePunch -= dt;
    this.recoil *= Math.pow(0.001, dt); // ≈ *0.7 per frame @60fps

    this.fire(dt, world);
  }

  /** 무기별 발사: 총 DPS는 동일 공식, 무기는 "모양"만 바꾼다 (부록 §2) */
  fire(dt, world) {
    const W = BAL.weapons;
    const powerMult = this.powerT > 0 ? BAL.powerModule.multiplier : 1;
    const tierMult = BAL.evolution.dpsMult[this.tier];
    const lvCoef = W.lvCoef[this.weaponLv - 1];
    // 격납고 영구 강화(발사 속도/공격력)는 world.stats로 주입된다
    const fireRate = world.stats?.fireRate ?? BAL.squad.fireRate;
    const damage = world.stats?.damage ?? BAL.squad.damage;
    const baseDps = this.count * fireRate * damage * tierMult * lvCoef * powerMult;

    // 호위 드론 개별 사격: 드론이 2기 이상이면 총 화력의 30%를 드론들이 분담 발사
    const wCoef = this.weapon === 'homing' ? W.homing.coef : this.weapon === 'laser' ? W.laser.coef : W.vulcan.coef;
    const escortShare = this.count > 1 ? 0.3 : 0;
    this.fireEscort(dt, world, baseDps * wCoef * escortShare);

    if (this.weapon === 'homing') {
      const dps = baseDps * W.homing.coef * (1 - escortShare);
      this.fireAcc += W.homing.rate * dt;
      while (this.fireAcc >= 1) {
        this.fireAcc -= 1;
        const alive = world.bullets.filter((b) => b.kind === 'homing' && !b.dead).length;
        if (alive < W.homing.cap) {
          const fan = (Math.random() - 0.5) * 240;
          world.bullets.push(new HomingMissile(this.x, this.y - 14, fan, dps / W.homing.rate, this.weaponLv));
          this.recoil = 1.5;
          sfx('missile'); // 쿨다운으로 스로틀됨
        }
      }
      return;
    }

    const isLaser = this.weapon === 'laser';
    const coef = isLaser ? W.laser.coef : W.vulcan.coef;
    const dps = baseDps * coef * (1 - escortShare);
    const shotsPerSec = isLaser ? 18 : Math.min(25, Math.max(4, this.count * fireRate));
    this.fireAcc += shotsPerSec * dt;
    const mounts = SHIP_DEFS[this.tier].mounts; // 기함 주포 마운트 순환 발사 — 티어가 오르면 포문이 늘어난다
    while (this.fireAcc >= 1) {
      this.fireAcc -= 1;
      if (world.bullets.length >= BAL.bullet.cap) continue;
      const dmg = dps / shotsPerSec;
      this.mountIdx = ((this.mountIdx || 0) + 1) % mounts.length;
      const m = mounts[this.mountIdx];
      if (isLaser) {
        // 고속 관통 볼트: 주포에서 곧게, 레벨이 오르면 굵고 화려하게
        world.bullets.push(new Bullet(this.x + m.x, this.y + m.y, dmg, {
          vy: -W.laser.speed, kind: 'laser', pierce: W.laser.pierce[this.weaponLv - 1],
          beamW: 3 + this.weaponLv * 1.5, lv: this.weaponLv,
        }));
        sfx('laser'); // 쿨다운으로 스로틀됨
      } else {
        // 발칸: 주포에서 확산 발사 + 머즐 플래시
        const spread = (W.vulcan.spreadDeg[this.weaponLv - 1] * Math.PI) / 180;
        const a = (Math.random() - 0.5) * 2 * spread;
        world.bullets.push(new Bullet(this.x + m.x, this.y + m.y, dmg, {
          vx: Math.sin(a) * W.vulcan.speed, vy: -Math.cos(a) * W.vulcan.speed, kind: 'vulcan',
          lv: this.weaponLv,
        }));
        world.effects.burst(this.x + m.x, this.y + m.y - 4, '#ffffff', 1, 40);
        sfx('vulcan'); // 쿨다운으로 스로틀됨
      }
      this.recoil = 1.2;
    }
  }

  /** 호위 드론들의 소형 사격 — 무리 전체가 싸우는 느낌 (피해는 escortDps로 정산) */
  fireEscort(dt, world, escortDps) {
    if (escortDps <= 0) return;
    const rate = Math.min(14, Math.max(4, this.count));
    this.escortAcc = (this.escortAcc || 0) + rate * dt;
    while (this.escortAcc >= 1) {
      this.escortAcc -= 1;
      if (world.bullets.length >= BAL.bullet.cap) continue;
      const n = Math.min(this.count, BAL.squad.drawCap);
      const o = this._offsets[Math.floor(Math.random() * n)];
      const w = this.width;
      world.bullets.push(new Bullet(this.x + o.x * w, this.y + o.y * w * 0.8 - 6, escortDps / rate, { kind: 'tracer' }));
    }
  }

  draw(ctx) {
    const w = this.width;
    const def = SHIP_DEFS[this.tier];
    const color = this.flash > 0 ? COLORS.danger : COLORS.ally;

    // 호위 드론 무리 (기함 반경 안쪽은 비움)
    const n = Math.min(this.count, BAL.squad.drawCap);
    const scout = shipSprite(0);
    for (let i = 0; i < n; i++) {
      const o = this._offsets[i];
      const ox = o.x * w;
      if (Math.hypot(ox, o.y * w * 0.8) < def.clearR) continue;
      const x = this.x + ox;
      const y = this.y + o.y * w * 0.8 + Math.sin(this.t * 3 + o.phase) * 2;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(this.bank * 0.3);
      blit(ctx, scout, 0, 0, 0.55);
      ctx.restore();
    }

    // 기함: 뱅킹(회전+가로 압축) + 반동 + 진화 스케일 펀치
    ctx.save();
    ctx.translate(this.x, this.y + this.recoil);
    ctx.rotate(this.bank * 0.22);
    const punch = this.evolvePunch > 0 ? 1 + 0.5 * (this.evolvePunch / 0.35) : 1;
    ctx.scale((1 - Math.abs(this.bank) * 0.25) * punch, punch);
    drawFlames(ctx, this.tier, this.t);
    blit(ctx, shipSprite(this.tier), 0, 0);
    drawDeckLights(ctx, this.tier, this.t);
    // 주포 마운트에 현재 무기 색 표시 — 어떤 무기인지 기체만 봐도 알 수 있게
    ctx.fillStyle = WEAPON_COLORS[this.weapon];
    for (const m of SHIP_DEFS[this.tier].mounts) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    if (this.flash > 0) {
      ctx.globalAlpha = Math.min(0.6, this.flash * 2.5);
      ctx.fillStyle = COLORS.danger;
      ctx.beginPath();
      ctx.arc(0, 0, def.clearR + 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();

    // T4 커리어부터: 궤도 호위 (티어가 오를수록 증가)
    if (this.tier >= 3) {
      const orbiters = 4 + (this.tier - 3) * 2;
      for (let k = 0; k < orbiters; k++) {
        const a = this.t * 1.2 + k * ((Math.PI * 2) / orbiters);
        const orbitR = SHIP_DEFS[this.tier].clearR + 12;
        const x = this.x + Math.cos(a) * orbitR;
        const y = this.y + Math.sin(a) * orbitR * 0.7;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(Math.cos(a) * 0.4);
        blit(ctx, scout, 0, 0, 0.55);
        ctx.restore();
      }
    }

    // 편대 수 라벨
    if (this.count > 1) {
      ctx.font = 'bold 16px sans-serif';
      ctx.textAlign = 'center';
      glow(ctx, color, 8, (c) => { c.fillStyle = COLORS.text; c.fillText(`x${this.count}`, this.x, this.y - w * 0.8 - 14); });
    }

    // 파워/실드 링
    if (this.powerT > 0) {
      ctx.strokeStyle = COLORS.reward;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, w + 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.shield) {
      ctx.strokeStyle = COLORS.gateGood;
      ctx.globalAlpha = 0.45 + 0.2 * Math.sin(this.t * 5);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, w + 20, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// ───────────────────────── 아군 탄 (발칸/레이저 겸용)
export class Bullet {
  constructor(x, y, damage, { vx = 0, vy = -BAL.bullet.speed, kind = 'vulcan', pierce = 0, beamW = 4, lv = 1 } = {}) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.kind = kind;
    this.lv = lv;              // 무기 레벨 — 레벨별로 탄 디자인이 달라진다
    this.pierce = pierce;      // 남은 관통 수 (레이저)
    this.beamW = beamW;        // 레이저 볼트 굵기 (레벨 비례)
    this.hitSet = pierce > 0 ? new Set() : null;
    this.prevY = y;
    this.r = BAL.bullet.radius;
    this.dead = false;
  }
  update(dt) {
    this.prevY = this.y;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.y < -50 || this.x < -30 || this.x > BAL.logicalW + 30) this.dead = true;
  }

  drawLaser(ctx) {
    const w = this.beamW;
    const L = 34 + this.lv * 8;
    // 잔상 고스트
    ctx.globalAlpha = 0.2;
    ctx.fillStyle = '#a8f0ff';
    ctx.fillRect(this.x - w, this.prevY - L / 2, w * 2, L);
    // 외피
    ctx.globalAlpha = 0.45;
    ctx.fillRect(this.x - w, this.y - L / 2, w * 2, L);
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    if (this.lv === 1) {
      // Lv1: 단일 코어 볼트
      ctx.fillRect(this.x - w * 0.3, this.y - L / 2, w * 0.6, L);
    } else if (this.lv === 2) {
      // Lv2: 트윈 코어 (두 가닥이 나란히)
      ctx.fillRect(this.x - w * 0.55, this.y - L / 2, w * 0.35, L);
      ctx.fillRect(this.x + w * 0.2, this.y - L / 2, w * 0.35, L);
    } else {
      // Lv3: 극태 빔 — 굵은 코어 + 양옆 에너지 스파크 티끌
      ctx.fillRect(this.x - w * 0.45, this.y - L / 2, w * 0.9, L);
      ctx.fillStyle = '#a8f0ff';
      const p = (this.y * 0.37) % L; // 결정적 스파크 위치 (프레임마다 흐르는 느낌)
      ctx.fillRect(this.x - w - 3, this.y - L / 2 + p, 3, 5);
      ctx.fillRect(this.x + w, this.y + L / 2 - p - 5, 3, 5);
    }
  }

  drawVulcan(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.vx, -this.vy));
    if (this.lv === 1) {
      // Lv1: 가는 예광탄
      ctx.fillStyle = COLORS.ally;
      ctx.fillRect(-1.5, -6, 3, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-1.5, -8, 3, 4);
    } else if (this.lv === 2) {
      // Lv2: 이중 탄두 (두 발이 나란히 나는 형태)
      ctx.fillStyle = COLORS.ally;
      ctx.fillRect(-4, -5, 2.6, 11);
      ctx.fillRect(1.4, -5, 2.6, 11);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-4, -7.5, 2.6, 3.5);
      ctx.fillRect(1.4, -7.5, 2.6, 3.5);
    } else {
      // Lv3: 대구경 작열탄 — 뾰족한 탄두 + 몸통 + 주황 꼬리 화염
      ctx.fillStyle = '#ff9c41';
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.moveTo(-2.2, 7);
      ctx.lineTo(0, 13 + (this.y % 3)); // 꼬리 흔들림
      ctx.lineTo(2.2, 7);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.ally;
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(-2.8, -5);
      ctx.lineTo(-2.8, 7);
      ctx.lineTo(2.8, 7);
      ctx.lineTo(2.8, -5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(-2, -4);
      ctx.lineTo(2, -4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  draw(ctx) {
    if (this.kind === 'laser') {
      this.drawLaser(ctx);
    } else if (this.kind === 'tracer') {
      // 호위 드론 소형탄
      ctx.fillStyle = COLORS.ally;
      ctx.globalAlpha = 0.85;
      ctx.fillRect(this.x - 1, this.y - 5, 2, 8);
      ctx.globalAlpha = 1;
    } else {
      this.drawVulcan(ctx);
    }
  }
}

// ───────────────────────── 호밍 미사일 (금색, 유도)
export class HomingMissile {
  constructor(x, y, vx0, damage, lv = 1) {
    this.x = x; this.y = y;
    this.vx = vx0;
    this.vy = -BAL.weapons.homing.speedFrom;
    this.speed = BAL.weapons.homing.speedFrom;
    this.damage = damage;
    this.kind = 'homing';
    this.lv = lv;
    this.r = 3.5 + lv * 1.2;    // 레벨이 오르면 미사일 자체가 커짐
    this.trailMax = 3 + lv * 2; // 꼬리 길이도 증가
    this.age = 0;
    this.exhaustT = 0;
    this.target = null;
    this.trail = [];
    this.dead = false;
  }
  pickTarget(world) {
    // 우선순위: 크리처/사격형 적 > 크리스탈 > 운석 (최근접)
    let best = null, bestScore = -1e9;
    for (const e of world.entities) {
      if (e.dead || !e.hitByBullet) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      const prio = e.isEnemy ? 2000 : e.reward ? 800 : 400;
      const score = prio - d;
      if (score > bestScore) { bestScore = score; best = e; }
    }
    if (world.boss && !world.boss.dead && world.phase === 'boss') {
      if (!best || best.isEnemy !== true) best = world.boss;
    }
    this.target = best;
  }
  update(dt, world) {
    this.age += dt;
    this.speed = Math.min(BAL.weapons.homing.speedTo, this.speed + 260 * dt);
    if (this.age > 0.25) {
      if (!this.target || this.target.dead) this.pickTarget(world);
      if (this.target && !this.target.dead) {
        const want = Math.atan2(this.target.x - this.x, -(this.target.y - this.y));
        const cur = Math.atan2(this.vx, -this.vy);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turn = Math.max(-BAL.weapons.homing.turnRate * dt, Math.min(BAL.weapons.homing.turnRate * dt, diff));
        const a = cur + turn;
        this.vx = Math.sin(a) * this.speed;
        this.vy = -Math.cos(a) * this.speed;
      }
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.trail.push([this.x, this.y]);
    if (this.trail.length > this.trailMax) this.trail.shift();
    // 배기 연기 (미사일 느낌)
    this.exhaustT -= dt;
    if (this.exhaustT <= 0) {
      this.exhaustT = 0.07;
      world.effects.burst(this.x, this.y, '#ff9c41', 1, 25);
    }
    if (this.y < -30 || this.y > world.logicalH + 30 || this.x < -30 || this.x > world.logicalW + 30) this.dead = true;
  }
  draw(ctx) {
    // 꼬리 잔상 (레벨이 오를수록 굵고 길게)
    if (this.trail.length > 1) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ff9c41';
      ctx.lineWidth = 1 + this.lv;
      ctx.beginPath();
      this.trail.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.vx, -this.vy)); // 진행 방향으로 회전
    const r = this.r;
    if (this.lv === 1) {
      // Lv1: 소형 로켓 (원형 탄두)
      ctx.fillStyle = COLORS.reward;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -1, 1.5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Lv2+: 캡슐 동체 + 꼬리 날개, Lv3는 추진 화염까지
      if (this.lv >= 3) {
        ctx.fillStyle = '#ff9c41';
        ctx.globalAlpha = 0.85;
        ctx.beginPath();
        ctx.moveTo(-2, r + 1);
        ctx.lineTo(0, r + 6 + (this.age * 60 % 3));
        ctx.lineTo(2, r + 1);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.fillStyle = COLORS.reward;
      ctx.beginPath();
      ctx.roundRect(-r * 0.55, -r - 1, r * 1.1, (r + 1) * 2, r * 0.55);
      ctx.fill();
      // 꼬리 날개 2장
      ctx.beginPath();
      ctx.moveTo(-r * 0.55, r - 1);
      ctx.lineTo(-r * 1.3, r + 2);
      ctx.lineTo(-r * 0.55, r + 1);
      ctx.moveTo(r * 0.55, r - 1);
      ctx.lineTo(r * 1.3, r + 2);
      ctx.lineTo(r * 0.55, r + 1);
      ctx.closePath();
      ctx.fill();
      // 탄두 하이라이트
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, -r * 0.5, r * 0.32, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// ───────────────────────── 스크롤 개체 공통
class Scrolling {
  constructor(x, y) { this.x = x; this.y = y; this.dead = false; }
  scroll(dt, world) { this.y += world.scrollSpeed * dt; }
  offscreen(world, margin = 60) { return this.y > world.logicalH + margin; }
}

// ───────────────────────── 에너지 크리스탈
export class Crystal extends Scrolling {
  constructor(x, y, value) {
    super(x, y);
    this.hp = value;
    this.reward = value;
    this.r = value >= 150 ? 34 : value >= 40 ? 28 : 22;
  }
  hitByBullet(dmg, world) {
    const res = hitCrystal(this, dmg);
    this.hp = res.hp;
    if (res.broken) {
      this.dead = true;
      world.effects.burst(this.x, this.y, COLORS.reward, 20);
      world.squad.applyDelta(res.reward, world);
      sfx('crystal');
    }
  }
  update(dt, world) {
    this.scroll(dt, world);
    if (this.offscreen(world)) this.dead = true;
  }
  draw(ctx) {
    const r = this.r;
    const gem = getSprite('C1');
    if (gem) {
      blit(ctx, gem, this.x, this.y, (r * 2.3) / gem.logicalW);
    } else {
      glow(ctx, COLORS.reward, 14, (c) => {
        c.fillStyle = 'rgba(255,217,61,0.18)';
        c.strokeStyle = COLORS.reward;
        c.lineWidth = 2;
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = Math.PI / 6 + (i * Math.PI) / 3;
          const px = this.x + Math.cos(a) * r;
          const py = this.y + Math.sin(a) * r;
          i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
        }
        c.closePath(); c.fill(); c.stroke();
      });
    }
    // 숫자: 정수만 표시 (레이저 감쇠 등으로 소수가 될 수 있음) + 어두운 외곽선
    const num = String(Math.ceil(this.hp));
    ctx.font = `bold ${r >= 34 ? 18 : 15}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(5,6,15,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(num, this.x, this.y + 5);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(num, this.x, this.y + 5);
  }
}

// ───────────────────────── 워프 게이트 쌍 (기존 2레인)
export class GatePair extends Scrolling {
  constructor(logicalW, y, left, right) {
    super(logicalW / 2, y);
    this.left = left; this.right = right;
    this.applied = false;
    this.flashT = 0;
    this.t = Math.random() * 10; // 시머 애니메이션 위상
    this.appliedSide = null;
    this.logicalW = logicalW;
    this.h = BAL.gate.height;
  }
  static isGood(g) { return g.op === '+' || g.op === 'x'; }
  static label(g) { return `${g.op === 'x' ? '×' : g.op === '/' ? '÷' : g.op}${g.value}`; }

  rects() {
    const w = this.logicalW / 2 - 24;
    return {
      left: { x: 16, y: this.y - this.h / 2, w, h: this.h },
      right: { x: this.logicalW / 2 + 8, y: this.y - this.h / 2, w, h: this.h },
    };
  }

  update(dt, world) {
    this.scroll(dt, world);
    this.t += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (!this.applied) {
      const { squad } = world;
      if (Math.abs(squad.y - this.y) < this.h / 2 + 8) {
        const side = squad.x < this.logicalW / 2 ? 'left' : 'right';
        const gate = this[side];
        const next = applyGate(squad.count, gate);
        squad.setCount(next, world, GatePair.label(gate));
        this.applied = true;
        this.appliedSide = side;
        this.flashT = BAL.gate.passFlashTime;
        world.effects.burst(squad.x, this.y, GatePair.isGood(gate) ? COLORS.gateGood : COLORS.gateBad, 12, 120);
        sfx(GatePair.isGood(gate) ? 'gate_good' : 'gate_bad');
      }
    }
    if (this.offscreen(world)) this.dead = true;
  }

  drawOne(ctx, rect, gate, highlight) {
    const good = GatePair.isGood(gate);
    const color = good ? COLORS.gateGood : COLORS.gateBad;
    drawGateBox(ctx, rect.x, rect.y, rect.w, rect.h, color, GatePair.label(gate), {
      t: this.t,
      highlight,
      dim: this.applied && !highlight,
      fontSize: 22,
    });
  }

  draw(ctx) {
    const r = this.rects();
    this.drawOne(ctx, r.left, this.left, this.flashT > 0 && this.appliedSide === 'left');
    this.drawOne(ctx, r.right, this.right, this.flashT > 0 && this.appliedSide === 'right');
  }
}

// ───────────────────────── 3레인 선택 게이트 (무기 선택 / 보너스)
// options: [{kind:'weapon', weapon}, ...] 또는 [{kind:'drones'|'weaponLv'|'shield', value?}]
export class TriGate extends Scrolling {
  constructor(logicalW, y, options) {
    super(logicalW / 2, y);
    this.options = options;
    this.applied = false;
    this.flashT = 0;
    this.t = Math.random() * 10;
    this.appliedLane = -1;
    this.logicalW = logicalW;
    this.h = BAL.gate.height + 8;
  }

  laneRect(i) {
    const w = (this.logicalW - 40) / 3 - 8;
    return { x: 20 + i * ((this.logicalW - 40) / 3) + 4, y: this.y - this.h / 2, w, h: this.h };
  }

  laneStyle(opt) {
    if (opt.kind === 'weapon') return { color: WEAPON_COLORS[opt.weapon], label: WEAPON_LABELS[opt.weapon] };
    if (opt.kind === 'drones') return { color: COLORS.ally, label: `+${opt.value}` };
    if (opt.kind === 'weaponLv') return { color: COLORS.reward, label: 'Lv UP' };
    return { color: COLORS.gateGood, label: '실드' };
  }

  apply(opt, world) {
    const sq = world.squad;
    if (opt.kind === 'weapon') sq.setWeapon(opt.weapon, world);
    else if (opt.kind === 'drones') sq.applyDelta(opt.value, world);
    else if (opt.kind === 'weaponLv') sq.levelUp(world);
    else if (opt.kind === 'shield') {
      sq.shield = true;
      world.effects.text(sq.x, sq.y - 64, '실드 획득!', COLORS.gateGood);
      sfx('shield_on');
    }
  }

  update(dt, world) {
    this.scroll(dt, world);
    this.t += dt;
    if (this.flashT > 0) this.flashT -= dt;
    if (!this.applied) {
      const { squad } = world;
      if (Math.abs(squad.y - this.y) < this.h / 2 + 8) {
        const lane = Math.max(0, Math.min(2, Math.floor((squad.x / this.logicalW) * 3)));
        this.apply(this.options[lane], world);
        this.applied = true;
        this.appliedLane = lane;
        this.flashT = BAL.gate.passFlashTime;
      }
    }
    if (this.offscreen(world)) this.dead = true;
  }

  draw(ctx) {
    for (let i = 0; i < 3; i++) {
      const rect = this.laneRect(i);
      const { color, label } = this.laneStyle(this.options[i]);
      const highlight = this.flashT > 0 && this.appliedLane === i;
      drawGateBox(ctx, rect.x, rect.y, rect.w, rect.h, color, label, {
        t: this.t + i * 0.4,
        highlight,
        dim: this.applied && !highlight,
        fontSize: 17,
      });
    }
  }
}

// ───────────────────────── 색깔 캡슐 (라이덴 오마주): 같은 색 = Lv+1, 다른 색 = 교체
export class Capsule extends Scrolling {
  constructor(x, y, weapon) {
    super(x, y);
    this.baseX = x;
    this.weapon = weapon;
    this.r = BAL.capsule.radius;
    this.t = Math.random() * 10;
  }
  update(dt, world) {
    this.scroll(dt, world);
    this.t += dt;
    this.x = this.baseX + Math.sin(this.t * Math.PI * 2 * BAL.capsule.driftHz) * BAL.capsule.driftAmp;
    if (circleHit(this.x, this.y, this.r + 8, world.squad.x, world.squad.y, world.squad.hitRadius)) {
      world.squad.setWeapon(this.weapon, world);
      this.dead = true;
    }
    if (this.offscreen(world)) this.dead = true;
  }
  draw(ctx) {
    const color = WEAPON_COLORS[this.weapon];
    const gem = getSprite('C2');
    if (gem) {
      blit(ctx, gem, this.x, this.y);
      // 무기 색 링 + 이니셜 (어떤 무기 캡슐인지 표시)
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = color;
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(WEAPON_LABELS[this.weapon][0], this.x, this.y - this.r - 9);
      return;
    }
    glow(ctx, color, 12, (c) => {
      c.strokeStyle = color;
      c.fillStyle = 'rgba(255,255,255,0.10)';
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const px = this.x + Math.cos(a) * this.r;
        const py = this.y + Math.sin(a) * this.r;
        i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.closePath(); c.fill(); c.stroke();
      c.fillStyle = color;
      c.font = 'bold 13px sans-serif';
      c.textAlign = 'center';
      c.fillText(WEAPON_LABELS[this.weapon][0], this.x, this.y + 4.5);
    });
  }
}

// ───────────────────────── 보이드 스웜: 프리렌더 스프라이트
// 보이드 스웜 함선 디자인 규칙: 어두운 장갑 필 + 밝은 외곽선 + 날개/가시 실루엣.
// 아군(직선·대칭·청록)과 반대로 곡선·가시·보라 계열. 아래(-y 반대)가 진행 방향.
function shardSprite() {
  // 등급1 "샤드": 침투정 — 삼각 어뢰 동체 + 뒤로 꺾인 가시 날개 2장
  return makeSprite(36, 36, (c) => {
    c.shadowColor = COLORS.enemy;
    c.shadowBlur = 9;
    // 가시 날개 (뒤로 꺾임)
    c.fillStyle = 'rgba(180,76,255,0.45)';
    c.strokeStyle = COLORS.enemy;
    c.lineWidth = 1.5;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 3, 2);
      c.lineTo(s * 13, -10);
      c.lineTo(s * 9, -12);
      c.lineTo(s * 2, -4);
      c.closePath(); c.fill(); c.stroke();
    }
    // 동체: 아래로 뾰족한 어뢰
    c.beginPath();
    c.moveTo(0, 14); c.lineTo(-5, 0); c.lineTo(-3, -11); c.lineTo(0, -8); c.lineTo(3, -11); c.lineTo(5, 0);
    c.closePath();
    c.fillStyle = '#3d1456';
    c.fill();
    c.strokeStyle = COLORS.enemy;
    c.lineWidth = 2;
    c.stroke();
  });
}
function reaperSprite() {
  // 등급2 "리퍼": 습격기 — 초승달 막날개 + 낫 팔 + 갈라진 머리 크레스트
  return makeSprite(60, 56, (c) => {
    c.shadowColor = COLORS.enemyMid;
    c.shadowBlur = 10;
    // 막날개 (반투명 막 + 골격선)
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 4, -6);
      c.quadraticCurveTo(s * 26, -8, s * 22, 12);
      c.quadraticCurveTo(s * 12, 6, s * 4, 6);
      c.closePath();
      c.fillStyle = 'rgba(216,76,240,0.22)';
      c.fill();
      c.strokeStyle = COLORS.enemyMid;
      c.lineWidth = 2;
      c.stroke();
      // 날개 골격
      c.lineWidth = 1;
      c.beginPath(); c.moveTo(s * 5, -3); c.lineTo(s * 20, 6); c.stroke();
      // 낫 팔 끝 발톱
      c.beginPath(); c.moveTo(s * 22, 12); c.lineTo(s * 25, 19); c.lineWidth = 2; c.stroke();
    }
    // 동체
    c.beginPath();
    c.moveTo(0, -14); c.lineTo(-6, -2); c.lineTo(-4, 10); c.lineTo(0, 18); c.lineTo(4, 10); c.lineTo(6, -2);
    c.closePath();
    c.fillStyle = '#4a1060';
    c.fill();
    c.strokeStyle = COLORS.enemyMid;
    c.lineWidth = 2;
    c.stroke();
    // 머리 크레스트 (갈라진 뿔)
    c.fillStyle = COLORS.enemyMid;
    for (const s of [-1, 1]) {
      c.beginPath();
      c.moveTo(s * 2, -12); c.lineTo(s * 6, -22); c.lineTo(s * 5, -11);
      c.closePath(); c.fill();
    }
  });
}
function broodSprite(crack) {
  // 등급3 "브루드 캐리어": 장갑 모함 — 육각 장갑 + 등 가시 4개 + 발광 사출구 2개
  return makeSprite(88, 88, (c) => {
    c.shadowColor = COLORS.enemyHigh;
    c.shadowBlur = 12;
    // 등 가시 (위쪽)
    c.fillStyle = COLORS.enemyHigh;
    for (const [x, len] of [[-14, 10], [-5, 14], [5, 14], [14, 10]]) {
      c.beginPath();
      c.moveTo(x - 3, -22); c.lineTo(x, -22 - len); c.lineTo(x + 3, -22);
      c.closePath(); c.fill();
    }
    // 육각 장갑 본체
    c.beginPath();
    c.moveTo(0, -30); c.lineTo(-24, -12); c.lineTo(-19, 19); c.lineTo(0, 30); c.lineTo(19, 19); c.lineTo(24, -12);
    c.closePath();
    c.fillStyle = '#3a0d4e';
    c.fill();
    c.strokeStyle = COLORS.enemyHigh;
    c.lineWidth = 3;
    c.stroke();
    // 장갑 판금선
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(0, -30); c.lineTo(0, 30); c.stroke();
    c.beginPath(); c.moveTo(-24, -12); c.lineTo(24, -12); c.stroke();
    // 사출구 2개 (하부, 독성 녹색 발광)
    c.fillStyle = 'rgba(124,255,76,0.7)';
    c.fillRect(-11, 20, 7, 6);
    c.fillRect(4, 20, 7, 6);
    // 균열 (피해 단계)
    c.strokeStyle = COLORS.enemyCore;
    c.lineWidth = 1.5;
    if (crack >= 1) {
      c.beginPath(); c.moveTo(-12, -16); c.lineTo(-5, -3); c.lineTo(-11, 9); c.stroke();
    }
    if (crack >= 2) {
      c.beginPath(); c.moveTo(12, -12); c.lineTo(6, 5); c.lineTo(13, 16); c.stroke();
    }
  });
}
const swarmSprites = {};
function getSwarmSprite(key) {
  if (!swarmSprites[key]) {
    if (key === 'small') swarmSprites[key] = shardSprite();
    else if (key === 'mid') swarmSprites[key] = reaperSprite();
    else if (key === 'large0') swarmSprites[key] = broodSprite(0);
    else if (key === 'large1') swarmSprites[key] = broodSprite(1);
    else if (key === 'large2') swarmSprites[key] = broodSprite(2);
  }
  return swarmSprites[key];
}

// ───────────────────────── 외계 크리처 (샤드/리퍼/브루드 캐리어)
export class Creature extends Scrolling {
  constructor(x, y, size, opts = {}) {
    super(x, y);
    this.size = size;
    this.hp = BAL.creature[size];
    this.maxHp = this.hp;
    this.r = BAL.creature.radius[size];
    this.wob = Math.random() * Math.PI * 2;
    this.isEnemy = true;
    this.spawnT = BAL.brood.spawnInterval; // 브루드 전용
    this.splits = opts.splits || 0;        // 파괴 시 분열할 소형 샤드 수 (0=없음)
  }
  update(dt, world) {
    this.scroll(dt, world);
    this.y += BAL.creature.speed * dt;
    if (this.y > world.logicalH * 0.45) {
      const dir = Math.sign(world.squad.x - this.x);
      this.x += dir * BAL.creature.homing * dt;
    }
    if (this.size === 'mid') this.x += Math.sin(this.wob) * 20 * dt; // 리퍼 지그재그
    this.wob += dt * 6;

    // 브루드 캐리어: 화면 안에 있는 동안 샤드 사출
    if (this.size === 'large' && this.y > 0 && this.y < world.logicalH * 0.6) {
      this.spawnT -= dt;
      if (this.spawnT <= 0) {
        this.spawnT = BAL.brood.spawnInterval;
        world.spawnEntity(new Creature(this.x - 8, this.y + 20, 'small'));
        world.spawnEntity(new Creature(this.x + 8, this.y + 20, 'small'));
      }
    }

    if (circleHit(this.x, this.y, this.r, world.squad.x, world.squad.y, world.squad.hitRadius)) {
      // 접촉 피해 = max(남은HP 기반, 편대 %비례) → 대군이어도 큰 피해
      const flat = Math.ceil(this.hp * BAL.creature.contactMult);
      const pct = Math.round(world.squad.count * BAL.creature.contactPct[this.size]);
      world.squad.contactDamage(Math.max(flat, pct), world);
      world.effects.burst(this.x, this.y, COLORS.danger, 16);
      this.dead = true;
    }
    if (this.offscreen(world)) this.dead = true;
  }
  hitByBullet(dmg, world) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      world.effects.burst(this.x, this.y, COLORS.enemy, 12);
      world.addCoins(1);
      sfx(this.size === 'large' ? 'explode_l' : 'explode_s');
      // 분열: 파괴 시 소형 샤드를 사방으로 흩뿌림
      if (this.splits > 0) {
        for (let i = 0; i < this.splits; i++) {
          const a = (i / this.splits) * Math.PI * 2 + Math.random();
          const c = new Creature(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, 'small');
          c.wob = a;
          world.spawnEntity(c);
        }
      }
    }
  }
  draw(ctx) {
    const gem = getSprite(this.size === 'small' ? 'B1' : this.size === 'mid' ? 'B2' : 'B3');
    let key = this.size;
    if (this.size === 'large') {
      const ratio = this.hp / this.maxHp;
      key = ratio > 0.66 ? 'large0' : ratio > 0.33 ? 'large1' : 'large2';
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.sin(this.wob) * 0.15);
    blit(ctx, gem || getSwarmSprite(key), 0, 0);
    ctx.restore();
    if (!gem) {
      // 폴백 아트 전용: 독성 녹색 코어 맥동 (Gemini 아트엔 자체 코어가 있음)
      const coreR = this.size === 'large' ? 6 + Math.sin(this.wob * 3) : this.size === 'mid' ? 3.5 + Math.sin(this.wob * 3) : 2;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.wob * 2);
      ctx.fillStyle = COLORS.enemyCore;
      ctx.beginPath();
      ctx.arc(this.x, this.y + (this.size === 'small' ? 2 : 1), Math.max(1.5, coreR), 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // HP 바
    { // 체력바 상시 표시 (위협 판독)
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(this.x - this.r, this.y - this.r - 8, this.r * 2, 3);
      ctx.fillStyle = COLORS.enemyCore;
      ctx.fillRect(this.x - this.r, this.y - this.r - 8, this.r * 2 * Math.max(0, this.hp / this.maxHp), 3);
    }
  }
}

// ───────────────────────── 운석
export class Meteor extends Scrolling {
  constructor(x, y, rng) {
    super(x, y);
    this.hp = Math.round(BAL.meteor.hpMin + rng() * (BAL.meteor.hpMax - BAL.meteor.hpMin));
    this.maxHp = this.hp;
    this.r = BAL.meteor.radius;
    this.rot = rng() * Math.PI * 2;
  }
  update(dt, world) {
    this.scroll(dt, world);
    this.rot += dt * 0.8;
    if (circleHit(this.x, this.y, this.r, world.squad.x, world.squad.y, world.squad.hitRadius)) {
      world.squad.contactDamage(Math.ceil(this.hp), world);
      world.effects.burst(this.x, this.y, '#ff9c41', 16);
      this.dead = true;
    }
    if (this.offscreen(world)) this.dead = true;
  }
  hitByBullet(dmg, world) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      world.effects.burst(this.x, this.y, '#ff9c41', 14);
      world.addCoins(BAL.meteor.coin);
      sfx('explode_s');
    }
  }
  drawHpBar(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(this.x - this.r, this.y - this.r - 8, this.r * 2, 3);
    ctx.fillStyle = '#ff9c41';
    ctx.fillRect(this.x - this.r, this.y - this.r - 8, this.r * 2 * Math.max(0, this.hp / this.maxHp), 3);
  }
  draw(ctx) {
    const gem = getSprite('C4');
    if (gem) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.rot);
      blit(ctx, gem, 0, 0);
      ctx.restore();
      this.drawHpBar(ctx);
      return;
    }
    glow(ctx, '#ff9c41', 8, (c) => {
      c.fillStyle = '#5a5f6e';
      c.strokeStyle = '#ff9c41';
      c.lineWidth = 1.5;
      c.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + this.rot;
        const rr = this.r * (0.8 + 0.2 * ((i * 7) % 3) / 2);
        const px = this.x + Math.cos(a) * rr;
        const py = this.y + Math.sin(a) * rr;
        i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.closePath(); c.fill(); c.stroke();
    });
    this.drawHpBar(ctx);
  }
}

// ───────────────────────── 화력 모듈
export class PowerModule extends Scrolling {
  constructor(x, y) { super(x, y); this.r = BAL.powerModule.radius; this.spin = 0; }
  update(dt, world) {
    this.scroll(dt, world);
    this.spin += dt * 4;
    if (circleHit(this.x, this.y, this.r + 6, world.squad.x, world.squad.y, world.squad.hitRadius)) {
      world.squad.powerT = BAL.powerModule.duration;
      world.effects.text(world.squad.x, world.squad.y - 40, 'POWER x2!', COLORS.reward);
      world.effects.burst(this.x, this.y, COLORS.reward, 18);
      sfx('pickup');
      this.dead = true;
    }
    if (this.offscreen(world)) this.dead = true;
  }
  draw(ctx) {
    const gem = getSprite('C3');
    if (gem) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.spin * 0.5);
      blit(ctx, gem, 0, 0);
      ctx.restore();
      return;
    }
    glow(ctx, COLORS.reward, 16, (c) => {
      c.fillStyle = COLORS.reward;
      c.save();
      c.translate(this.x, this.y);
      c.rotate(this.spin);
      c.beginPath();
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const rr = i % 2 === 0 ? this.r : this.r * 0.45;
        i === 0 ? c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr) : c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      c.closePath(); c.fill();
      c.restore();
    });
  }
}

// ───────────────────────── 적탄 (조준탄/부채꼴탄/직하탄 공용, % 피해)
export class EnemyShot {
  constructor(x, y, vx, vy, { r = 8, dmgPct, dmgMin }) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.r = r;
    this.dmgPct = dmgPct;
    this.dmgMin = dmgMin;
    this.dead = false;
  }
  static aimed(x, y, tx, ty, speed, opts) {
    const d = Math.hypot(tx - x, ty - y) || 1;
    return new EnemyShot(x, y, ((tx - x) / d) * speed, ((ty - y) / d) * speed, opts);
  }
  update(dt, world) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (circleHit(this.x, this.y, this.r, world.squad.x, world.squad.y, world.squad.hitRadius)) {
      const dmg = Math.max(this.dmgMin, Math.round(world.squad.count * this.dmgPct));
      world.squad.applyDelta(-dmg, world);
      world.effects.burst(this.x, this.y, COLORS.danger, 10);
      this.dead = true;
    }
    if (this.y > world.logicalH + 30 || this.y < -40 || this.x < -30 || this.x > world.logicalW + 30) this.dead = true;
  }
  draw(ctx) {
    // 흰 코어 + danger 외피 (글로우 없음)
    ctx.fillStyle = COLORS.danger;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}

// 텔레그래프(발사 예고) 그리기 헬퍼
function drawTelegraph(ctx, x, y, r, progress) {
  ctx.globalAlpha = 0.5 + 0.5 * progress;
  ctx.strokeStyle = COLORS.danger;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r + 4 + (1 - progress) * 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ───────────────────────── 저격 드론: 호버링 + 조준탄
export class Sniper {
  constructor(x) {
    this.x = x;
    this.y = -30;
    this.hp = BAL.sniper.hp;
    this.maxHp = this.hp;
    this.r = BAL.sniper.radius;
    this.state = 'enter';
    this.stayT = BAL.sniper.stayTime;
    this.fireInterval = BAL.sniper.fireInterval; // 스테이지 스케일이 덮어씀
    this.fireT = this.fireInterval;
    this.isEnemy = true;
    this.dead = false;
    this.t = 0;
  }
  update(dt, world) {
    this.t += dt;
    const B = BAL.sniper;
    if (this.state === 'enter') {
      this.y += B.enterSpeed * dt;
      if (this.y >= B.hoverY) { this.y = B.hoverY; this.state = 'hover'; }
    } else if (this.state === 'hover') {
      this.stayT -= dt;
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.fireInterval;
        world.spawnEnemyBullet(EnemyShot.aimed(this.x, this.y + this.r, world.squad.x, world.squad.y, B.shotSpeed, { dmgPct: B.dmgPct, dmgMin: B.dmgMin }));
      }
      if (this.stayT <= 0) this.state = 'leave';
    } else {
      this.y += B.enterSpeed * dt;
      if (this.y > world.logicalH + 40) this.dead = true;
    }
  }
  hitByBullet(dmg, world) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      world.effects.burst(this.x, this.y, COLORS.enemyMid, 14);
      world.addCoins(3);
      sfx('explode_s');
    }
  }
  draw(ctx) {
    const gem = getSprite('B4');
    if (gem) {
      blit(ctx, gem, this.x, this.y);
    } else {
      // 폴백: 다이아 몸체 + 하방 총신
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.fillStyle = COLORS.enemyMid;
      ctx.beginPath();
      ctx.moveTo(0, -12); ctx.lineTo(-11, 0); ctx.lineTo(0, 10); ctx.lineTo(11, 0);
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = COLORS.enemyMid;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(0, 18); ctx.stroke();
      ctx.restore();
      ctx.fillStyle = COLORS.enemyCore;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 4);
      ctx.beginPath();
      ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 발사 예고
    const tele = this.state === 'hover' && this.fireT < BAL.enemyShots.telegraphTime;
    if (tele) drawTelegraph(ctx, this.x, this.y, this.r, 1 - this.fireT / BAL.enemyShots.telegraphTime);
    { // 체력바 상시 표시 (위협 판독)
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(this.x - this.r, this.y - this.r - 8, this.r * 2, 3);
      ctx.fillStyle = COLORS.enemyCore;
      ctx.fillRect(this.x - this.r, this.y - this.r - 8, this.r * 2 * Math.max(0, this.hp / this.maxHp), 3);
    }
  }
}

// ───────────────────────── 고정 포탑: 5방향 부채꼴탄
export class Turret extends Scrolling {
  constructor(x, y) {
    super(x, y);
    this.hp = BAL.turret.hp;
    this.maxHp = this.hp;
    this.r = BAL.turret.radius;
    this.fireInterval = BAL.turret.fireInterval; // 스테이지 스케일이 덮어씀
    this.fireT = this.fireInterval * 0.6;        // 첫 발은 조금 빨리
    this.isEnemy = true;
    this.t = 0;
  }
  update(dt, world) {
    this.scroll(dt, world);
    this.t += dt;
    if (this.y > 80 && this.y < world.logicalH * 0.6) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.fireInterval;
        const B = BAL.turret;
        for (let i = 0; i < B.fanCount; i++) {
          if (world.enemyBullets.length >= BAL.enemyShots.cap) break;
          const deg = (i - (B.fanCount - 1) / 2) * B.fanDeg;
          const a = (deg * Math.PI) / 180;
          world.spawnEnemyBullet(new EnemyShot(this.x, this.y + this.r, Math.sin(a) * B.shotSpeed, Math.cos(a) * B.shotSpeed, { r: 7, dmgPct: B.dmgPct, dmgMin: B.dmgMin }));
        }
      }
    }
    if (this.offscreen(world)) this.dead = true;
  }
  hitByBullet(dmg, world) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      world.effects.burst(this.x, this.y, COLORS.enemyHigh, 16);
      world.addCoins(BAL.turret.coin);
      sfx('explode_l');
    }
  }
  draw(ctx) {
    const gem = getSprite('B5');
    if (gem) {
      blit(ctx, gem, this.x, this.y);
    } else {
      // 폴백: 팔각 기단 + 하방 3포신
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.strokeStyle = COLORS.enemyHigh;
      ctx.fillStyle = 'rgba(255,76,210,0.2)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        i === 0 ? ctx.moveTo(Math.cos(a) * this.r, Math.sin(a) * this.r) : ctx.lineTo(Math.cos(a) * this.r, Math.sin(a) * this.r);
      }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.lineWidth = 2.5;
      for (const dx of [-6, 0, 6]) {
        ctx.beginPath(); ctx.moveTo(dx, 8); ctx.lineTo(dx * 1.4, 20); ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = COLORS.enemyCore;
      ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 3);
      ctx.beginPath();
      ctx.arc(this.x, this.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    const tele = this.fireT < BAL.enemyShots.telegraphTime && this.y > 80;
    if (tele) drawTelegraph(ctx, this.x, this.y, this.r, 1 - this.fireT / BAL.enemyShots.telegraphTime);
    { // 체력바 상시 표시 (위협 판독)
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(this.x - this.r, this.y - this.r - 9, this.r * 2, 3);
      ctx.fillStyle = COLORS.enemyCore;
      ctx.fillRect(this.x - this.r, this.y - this.r - 9, this.r * 2 * Math.max(0, this.hp / this.maxHp), 3);
    }
  }
}

// ───────────────────────── 사이드 위버: 횡단 + 직하탄 커튼
export class Weaver {
  constructor(fromLeft, logicalW) {
    this.x = fromLeft ? -20 : logicalW + 20;
    this.dir = fromLeft ? 1 : -1;
    this.y = BAL.weaver.y;
    this.hp = BAL.weaver.hp;
    this.maxHp = this.hp;
    this.r = BAL.weaver.radius;
    this.fireInterval = BAL.weaver.fireInterval; // 스테이지 스케일이 덮어씀
    this.fireT = this.fireInterval;
    this.logicalW = logicalW;
    this.isEnemy = true;
    this.dead = false;
    this.t = 0;
  }
  update(dt, world) {
    this.t += dt;
    this.x += this.dir * BAL.weaver.speed * dt;
    this.y = BAL.weaver.y + Math.sin(this.t * 4) * 8;
    this.fireT -= dt;
    if (this.fireT <= 0 && this.x > 20 && this.x < this.logicalW - 20) {
      this.fireT = this.fireInterval;
      if (world.enemyBullets.length < BAL.enemyShots.cap) {
        world.spawnEnemyBullet(new EnemyShot(this.x, this.y + this.r, 0, BAL.weaver.shotSpeed, { r: 6, dmgPct: BAL.weaver.dmgPct, dmgMin: BAL.weaver.dmgMin }));
      }
    }
    if ((this.dir > 0 && this.x > this.logicalW + 30) || (this.dir < 0 && this.x < -30)) this.dead = true;
  }
  hitByBullet(dmg, world) {
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      world.effects.burst(this.x, this.y, COLORS.enemy, 10);
      world.addCoins(2);
      sfx('explode_s');
    }
  }
  drawHpBar(ctx) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(this.x - this.r, this.y - this.r - 8, this.r * 2, 3);
    ctx.fillStyle = COLORS.enemyCore;
    ctx.fillRect(this.x - this.r, this.y - this.r - 8, this.r * 2 * Math.max(0, this.hp / this.maxHp), 3);
  }
  draw(ctx) {
    const gem = getSprite('B6');
    if (gem) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.dir, 1);
      blit(ctx, gem, 0, 0);
      ctx.restore();
      this.drawHpBar(ctx);
      return;
    }
    // 폴백: 가오리형 초승달 날개
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.dir, 1);
    ctx.fillStyle = COLORS.enemy;
    ctx.beginPath();
    ctx.moveTo(10, 0);
    ctx.quadraticCurveTo(-4, -10, -12, -3);
    ctx.quadraticCurveTo(-5, 0, -12, 3);
    ctx.quadraticCurveTo(-4, 10, 10, 0);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    ctx.fillStyle = COLORS.enemyCore;
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 5);
    ctx.beginPath();
    ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    this.drawHpBar(ctx);
  }
}

// ───────────────────────── 보스: 하이브 퀸
export class Boss {
  constructor(logicalW, rateMult = 1) {
    this.x = logicalW / 2;
    this.y = -100;
    this.targetY = BAL.boss.y;
    this.hp = BAL.boss.hp;
    this.maxHp = BAL.boss.hp;
    this.r = BAL.boss.radius;
    this.rateMult = rateMult;                       // 스테이지 스케일 (작을수록 빠른 공격)
    this.minionT = BAL.boss.minionInterval * rateMult;
    this.shotT = BAL.boss.shotInterval * rateMult;
    this.fanT = BAL.boss.fanInterval * rateMult;
    this.t = 0;
    this.dead = false;
    this.dying = false;   // 파괴 연출 중 (main.js 시퀀스가 deathT를 채운다)
    this.deathT = 0;      // 파괴 경과 시간
    this.logicalW = logicalW;
    // 파괴 시 흩어질 파편 (미리 생성)
    this.frags = Array.from({ length: 10 }, () => ({
      a: Math.random() * Math.PI * 2, spd: 30 + Math.random() * 70,
      rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 6,
      size: 8 + Math.random() * 14,
    }));
  }
  get enraged() { return this.hp <= this.maxHp * BAL.boss.enrageRatio; }
  interval(base) { return base * this.rateMult * (this.enraged ? BAL.boss.enrageRate : 1); }
  phaseColor() {
    const ratio = this.hp / this.maxHp;
    return ratio > 0.66 ? COLORS.enemy : ratio > 0.33 ? COLORS.enemyHigh : COLORS.danger;
  }
  /** 화면 크기·스프라이트에 맞춘 안전 배치 (상하좌우 잘림 방지 + 과대 축소) */
  layout(logicalH) {
    const gem = getSprite('B7');
    if (!gem) return { scale: 1, halfH: this.r, halfW: this.r * 1.6, safeY: BAL.boss.y };
    const maxH = logicalH * 0.22;                 // 보스 세로는 화면의 22% 이내 (기기별 과대 방지)
    const scale = Math.min(1, maxH / gem.logicalH);
    const halfH = (gem.logicalH * scale) / 2;
    const halfW = (gem.logicalW * scale) / 2;
    const safeY = Math.max(BAL.boss.y, halfH + 96); // 상단 HUD 아래로 충분한 여백
    return { scale, halfH, halfW, safeY };
  }

  update(dt, world) {
    this.t += dt;
    // 스프라이트 로드 후 안전 정착 위치로 목표 조정 (기기별 잘림 방지)
    const L = this.layout(world.logicalH);
    this.drawScale = L.scale;
    this.targetY = L.safeY;
    if (this.y < this.targetY) { this.y += 120 * dt; return; }
    // 광폭화하면 더 크게, 빠르게 흔든다 — 단, 스프라이트가 화면 밖으로 나가지 않게 클램프
    const sway = this.enraged ? 0.22 : 0.16;
    const swayHz = this.enraged ? 1.1 : 0.7;
    const margin = L.halfW + 10;
    const rawX = this.logicalW / 2 + Math.sin(this.t * swayHz) * this.logicalW * sway;
    this.x = Math.max(margin, Math.min(this.logicalW - margin, rawX));

    this.minionT -= dt;
    if (this.minionT <= 0) {
      this.minionT = this.interval(BAL.boss.minionInterval);
      const hpMult = world.stageMods?.enemyHp ?? 1;
      for (let i = 0; i < BAL.boss.minionCount; i++) {
        const off = (i - (BAL.boss.minionCount - 1) / 2) * (this.r + 10);
        const c = new Creature(this.x + off, this.y + 30, 'small');
        c.hp = c.maxHp = Math.round(c.hp * hpMult);
        world.spawnEntity(c);
      }
    }
    this.shotT -= dt;
    if (this.shotT <= 0) {
      this.shotT = this.interval(BAL.boss.shotInterval);
      world.spawnEnemyBullet(EnemyShot.aimed(this.x, this.y + this.r, world.squad.x, world.squad.y, BAL.boss.shotSpeed, { r: BAL.boss.shotRadius, dmgPct: BAL.boss.shotDamagePct, dmgMin: BAL.boss.shotDamageMin }));
    }
    // 5방향 부채꼴 패턴
    this.fanT -= dt;
    if (this.fanT <= 0) {
      this.fanT = this.interval(BAL.boss.fanInterval);
      for (let i = 0; i < BAL.boss.fanCount; i++) {
        const deg = (i - (BAL.boss.fanCount - 1) / 2) * BAL.boss.fanDeg;
        const a = (deg * Math.PI) / 180;
        world.spawnEnemyBullet(new EnemyShot(this.x, this.y + this.r, Math.sin(a) * BAL.boss.fanSpeed, Math.cos(a) * BAL.boss.fanSpeed, { r: 7, dmgPct: BAL.boss.fanDamagePct, dmgMin: BAL.boss.fanDamageMin }));
      }
    }
  }
  hitByBullet(dmg, world) {
    this.hp -= dmg;
    // 피해량 플로팅 숫자 (0.15초 묶음 집계 — 탄막 스팸 방지, 긴장감 연출)
    this.dmgAcc = (this.dmgAcc || 0) + dmg;
    if (this.t - (this.lastDmgFx || 0) > 0.15 || this.hp <= 0) {
      this.lastDmgFx = this.t;
      world.effects.text(this.x + (Math.random() - 0.5) * 90, this.y + 55, `-${Math.round(this.dmgAcc)}`, '#ff4d4d');
      this.dmgAcc = 0;
    }
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      this.dying = true; // 파괴 연출 시작 (큰 폭발/격파음은 main.js 시퀀스에서)
      world.effects.burst(this.x, this.y, COLORS.danger, 40, 220);
      world.effects.flash(0.3);
    }
  }

  /** 파괴 연출: 흔들리며 붉게 과부하 + 파편 흩어짐 + 페이드 */
  drawDying(ctx, duration) {
    const p = Math.min(1, this.deathT / duration);
    const shake = (1 - p) * 6;
    const sx = this.x + (Math.random() - 0.5) * shake;
    const sy = this.y + (Math.random() - 0.5) * shake;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p);
    glow(ctx, COLORS.danger, 30, (c) => {
      c.fillStyle = '#3a0d14';
      c.strokeStyle = COLORS.danger;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(sx, sy, this.r * 1.6, this.r * 0.55, 0, 0, Math.PI * 2);
      c.fill(); c.stroke();
    });
    ctx.globalAlpha = Math.max(0, 1 - p) * (0.5 + 0.5 * Math.sin(this.deathT * 30));
    ctx.fillStyle = '#fff2b0';
    ctx.beginPath();
    ctx.arc(sx, sy, this.r * (0.3 + p * 0.9), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // 파편 흩어짐
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p * 0.8);
    ctx.fillStyle = '#5a2030';
    ctx.strokeStyle = COLORS.danger;
    ctx.lineWidth = 1.5;
    for (const f of this.frags) {
      const d = this.deathT * f.spd;
      const fx = this.x + Math.cos(f.a) * d;
      const fy = this.y + Math.sin(f.a) * d;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(f.rot + f.rotV * this.deathT);
      ctx.beginPath();
      ctx.moveTo(0, -f.size * 0.5);
      ctx.lineTo(f.size * 0.5, f.size * 0.4);
      ctx.lineTo(-f.size * 0.4, f.size * 0.5);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  draw(ctx) {
    if (this.dying) { this.drawDying(ctx, BAL.bossDeath.duration); return; }
    const pc = this.phaseColor();
    const gem = getSprite('B7');
    if (gem) {
      const sc = this.drawScale || 1;
      ctx.save();
      ctx.translate(this.x, this.y);
      // 광폭화: 붉은 맥동 외곽 링
      if (this.enraged) {
        ctx.strokeStyle = COLORS.danger;
        ctx.globalAlpha = 0.35 + 0.25 * Math.sin(this.t * 6);
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.r * 1.75 * sc, this.r * 0.85 * sc, 0, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      blit(ctx, gem, 0, 0, sc);
      // 산란낭 소환 예고 맥동 (스프라이트 알집 위치에 오버레이)
      const urgency = this.minionT < 1 ? 3 : 1;
      for (let i = 0; i < 3; i++) {
        const sx = (i - 1) * 40 * sc;
        const sy = (i === 1 ? 50 : 44) * sc;
        ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.t * 2 * urgency + i);
        ctx.fillStyle = COLORS.enemyCore;
        ctx.beginPath();
        ctx.arc(sx, sy, (10 + Math.sin(this.t * 2 * urgency + i) * 3) * sc, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      return;
    }
    glow(ctx, pc, 24, (c) => {
      // 본체 타원
      c.fillStyle = '#2a1038';
      c.strokeStyle = pc;
      c.lineWidth = 3;
      c.beginPath();
      c.ellipse(this.x, this.y, this.r * 1.6, this.r * 0.55, 0, 0, Math.PI * 2);
      c.fill(); c.stroke();
      // 가시 왕관
      c.fillStyle = pc;
      for (let i = -2; i <= 2; i++) {
        c.beginPath();
        c.moveTo(this.x + i * this.r * 0.5 - 6, this.y - this.r * 0.35);
        c.lineTo(this.x + i * this.r * 0.62, this.y - this.r * 0.9);
        c.lineTo(this.x + i * this.r * 0.5 + 6, this.y - this.r * 0.35);
        c.closePath(); c.fill();
      }
      // 상부 돔
      c.beginPath();
      c.ellipse(this.x, this.y - this.r * 0.3, this.r * 0.7, this.r * 0.5, 0, Math.PI, 0);
      c.fillStyle = 'rgba(255,61,113,0.30)';
      c.fill(); c.stroke();
    });
    // 산란낭 3개: 소환 1초 전 맥동 가속 (예고)
    const urgency = this.minionT < 1 ? 3 : 1;
    for (let i = 0; i < 3; i++) {
      const sx = this.x + (i - 1) * this.r * 0.7;
      const sy = this.y + this.r * (i === 1 ? 0.65 : 0.5);
      const sr = 10 + Math.sin(this.t * 2 * urgency + i) * 3;
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = COLORS.enemyCore;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    // 중앙 눈 코어 (페이즈 색)
    ctx.fillStyle = pc;
    ctx.beginPath();
    ctx.arc(this.x, this.y - this.r * 0.2, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(this.x, this.y - this.r * 0.2, 3.5, 0, Math.PI * 2);
    ctx.fill();
    // 하단 불빛 (페이즈 색 동기화)
    ctx.fillStyle = pc;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.arc(this.x + i * this.r * 0.55, this.y + this.r * 0.15, 4 + 2 * Math.sin(this.t * 4 + i), 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
