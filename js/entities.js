// 게임 개체 — 확장판 (부록 설계 반영)
// 편대(진화+무기) / 탄·미사일 / 크리스탈 / 게이트 / 보이드 스웜 / 사격형 적 / 하이브 퀸 / 이펙트
// world = { bal, input, squad, bullets, enemyBullets, entities, effects, addCoins,
//           spawnEntity, spawnEnemyBullet, scrollSpeed, logicalW, logicalH, rng, phase }
import { BAL } from './balance.js';
import { applyGate, hitCrystal, chargeStageFor, dronesToCruisers, canUpgradeFlagship, bankUpgrade, bankDemote } from './logic.js';
import { circleHit } from './collision.js';
import { COLORS, WEAPON_COLORS, WEAPON_LABELS, glow, makeSprite, blit, drawGateBox } from './render.js';
import { shipSprite, drawFlames, drawDeckLights, SHIP_DEFS } from './ships.js';
import { getSprite, bossDefFor } from './sprites.js';
import { affixAbsorb, affixOnDeath, affixContactMult, affixShotHoming, affixDraw } from './affixes.js';
import { canEvolveWeapon } from './weapon-evolutions.js';
import { sfx } from './audio.js';

// ───────────────────────── 이펙트 (파티클 + 텍스트 + 충격파 링 + 화면 플래시)
export function createEffects() {
  const parts = [];
  const texts = [];
  const rings = [];
  const flashes = [];   // 총구 섬광 + 진화 후광 (짧은 발광 스프라이트)
  let flashV = 0;
  const TAU = Math.PI * 2;
  return {
    burst(x, y, color, n = 14, speed = 160) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2;
        const v = speed * (0.4 + Math.random() * 0.6);
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.5, max: 0.5, color, size: 2 + Math.random() * 3 });
      }
    },
    text(x, y, str, color, size = 20) {
      // 최근 문구와 겹치면 위로 밀어 자동 스택 (업그레이드 등 여러 문구 동시 표시 시 중첩 방지)
      let ny = y, moved = true, guard = 0;
      while (moved && guard++ < 12) {
        moved = false;
        for (const t of texts) {
          if (t.life > 0.35 && Math.abs(t.x - x) < 130 && Math.abs(t.y - ny) < 27) { ny = t.y - 28; moved = true; }
        }
      }
      texts.push({ x, y: ny, str, color, size, life: 0.9, max: 0.9 });
    },
    ring(x, y, color, delay = 0) {
      rings.push({ x, y, r: 20, life: 0.45 + delay, max: 0.45, color, delay });
    },
    // 총구 섬광: 발사 순간 짧게 번쩍 (백열 코어 + 4갈래 별, 무기색)
    muzzle(x, y, color, size = 5) {
      flashes.push({ kind: 'muzzle', x, y, color, size, life: 0.08, max: 0.08, delay: 0 });
    },
    // 진화 후광: 층진 발광 링 + 중심 글로우 (진화 스펙터클)
    halo(x, y, color) {
      flashes.push({ kind: 'halo', x, y, color, size: 30, life: 0.5, max: 0.5, delay: 0 });
      rings.push({ x, y, r: 24, life: 0.5, max: 0.5, color, delay: 0 });
      rings.push({ x, y, r: 22, life: 0.55, max: 0.45, color: '#ffffff', delay: 0.08 });
      rings.push({ x, y, r: 20, life: 0.62, max: 0.42, color, delay: 0.16 });
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
      for (const f of flashes) { if (f.delay > 0) { f.delay -= dt; continue; } f.life -= dt; }
      flashV = Math.max(0, flashV - dt * 5);
      for (let i = parts.length - 1; i >= 0; i--) if (parts[i].life <= 0) parts.splice(i, 1);
      for (let i = texts.length - 1; i >= 0; i--) if (texts[i].life <= 0) texts.splice(i, 1);
      for (let i = rings.length - 1; i >= 0; i--) if (rings[i].life <= 0) rings.splice(i, 1);
      for (let i = flashes.length - 1; i >= 0; i--) if (flashes[i].life <= 0) flashes.splice(i, 1);
    },
    draw(ctx, logicalW, logicalH) {
      // 파티클: 가산 합성 — 겹칠수록 밝아져 타격 스파크·폭발이 실제로 '빛나' 보인다
      ctx.globalCompositeOperation = 'lighter';
      for (const p of parts) {
        const k = Math.max(0, p.life / p.max);
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.45 + k * 0.75), 0, TAU);
        ctx.fill();
      }
      // 총구 섬광 · 진화 후광 (가산)
      for (const f of flashes) {
        if (f.delay > 0) continue;
        const k = Math.max(0, f.life / f.max);
        if (f.kind === 'muzzle') {
          const s = f.size * (0.7 + (1 - k) * 0.9);   // 짧게 커졌다 스러짐
          ctx.globalAlpha = k;
          ctx.fillStyle = '#ffffff';
          ctx.beginPath(); ctx.arc(f.x, f.y, s * 0.55, 0, TAU); ctx.fill();
          ctx.strokeStyle = f.color; ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(f.x - s * 1.7, f.y); ctx.lineTo(f.x + s * 1.7, f.y);
          ctx.moveTo(f.x, f.y - s * 2.0); ctx.lineTo(f.x, f.y + s * 1.2);
          ctx.stroke();
        } else { // halo — 중심 발광 원반
          const R = f.size * (1 + (1 - k) * 1.5);
          ctx.globalAlpha = k * 0.4;
          ctx.fillStyle = f.color;
          ctx.beginPath(); ctx.arc(f.x, f.y, R, 0, TAU); ctx.fill();
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
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
        ctx.font = `bold ${t.size || 20}px sans-serif`;
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
    this.charge = 0;          // 차지 랜스 누적 충전(초)
    this.chargeStage = 0;     // 현재 충전 단계
    this.wasCharging = false;
    this.invulnT = 0;         // 진화 무적 잔여 시간(A3)
    this.escorts = 0;         // (구 호위기 — 미사용)
    this.cruisers = 0;        // 순양함 수 (드론 130기 합체)
    this.banked = 0;          // 기함에 은행된 화력 (업그레이드 때 흡수한 순양함 화력 누적)
    this.bankStack = [];      // 업그레이드별 은행 증가분 (강등 시 정확히 롤백 → 반복 적립 방지)
    // ── NEON ADAPTATION Phase 1: 원정 내부 상태 (중립 시작, 저장 안 함) ──
    this.weaponEvolutions = { vulcan: null, laser: null, homing: null }; // 무기별 진화 id
    this.pendingWeaponEvolution = null;   // 진화 선택 대기 무기 ('vulcan'|'laser'|'homing')
    this.doctrine = null;                 // 'swarm'|'lance'|'phase'
    this.pendingDoctrine = false;         // 교리 선택 대기
    this.supportAcc = 0;      // 호위함 사격 누적기
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
    // 치명 판정은 작고 일정하게 (탄막게임식): 진화해도 표적이 커지지 않아 회피가 가능하다.
    // 편대 수·폭에 비례하던 옛 방식(최대 96px)은 '피할 수 없는 거대 표적'을 만들었다.
    return 15 + this.tier * 2.2;   // T0 15 … T5 26
  }

  setWeapon(weapon, world) {
    if (this.weapon === weapon) {
      if (this.weaponLv < BAL.weapons.maxLv) {
        this.weaponLv++;
        world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[weapon]} Lv${this.weaponLv}! · 영구`, WEAPON_COLORS[weapon]);
      } else if (canEvolveWeapon(weapon, this.weaponLv, BAL.weapons.maxLv, this.weaponEvolutions) && !this.pendingWeaponEvolution) {
        // Lv MAX + 미진화: 무기 진화 선택 요청 (main이 감지해 2택 선택창)
        this.pendingWeaponEvolution = weapon;
        world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[weapon]} 진화 가능!`, COLORS.reward);
      } else if (this.weaponEvolutions[weapon]) {
        // 이미 진화한 무기의 같은 색 캡슐 → 대체 보상(드론·코인)
        const rw = BAL.weaponEvolution.duplicateReward;
        this.applyDelta(rw.drones, world);
        if (world.addCoins) world.addCoins(rw.coin);
        world.effects.text(this.x, this.y - 64, `+${rw.drones} 드론 · +${rw.coin} 코인`, COLORS.reward);
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
    world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[this.weapon]} Lv${this.weaponLv}! · 영구`, WEAPON_COLORS[this.weapon]);
  }

  /** 기함 화력 (드론 환산): 드론 수 + 은행된 화력(흡수한 순양함) + 군체 의지(드론당). 기함 본체 사격 기준. */
  get flagPower() {
    return this.count + (this.banked || 0) + (this.swarmPerDrone || 0) * this.count;
  }
  /** 순양함 화력 (드론 환산): 순양함이 별도로 쏘는 화력. */
  get supportPower() {
    return (this.cruisers || 0) * BAL.escort.cruiserPower;
  }
  /** 총 화력 = 기함 + 순양함 (적 스케일·보스 HP·기록에 쓰는 함대 전체 화력) */
  get power() {
    return this.flagPower + this.supportPower;
  }

  checkEvolution(world) {
    const ev = BAL.evolution;
    const E = BAL.escort;
    const mfx = world.mfx || {};
    const maxTier = ev.names.length - 1;
    // 1) 드론 → 순양함 자동 합체 (선택 없음)
    const m = dronesToCruisers(this.count, this.cruisers || 0, E);
    if (m.merged > 0) {
      this.count = m.count; this.cruisers = m.cruisers;
      world.effects.text(this.x, this.y - 44, `순양함 +${m.merged}`, COLORS.ally, 14);
      sfx('pickup');
    }
    // 2) 순양함이 임계치 이상이면 기함 1단계 업그레이드 (여기서만 선택창=모듈 드래프트가 뜬다)
    const need = Math.max(1, Math.round(E.cruisersPerFlagship * (mfx.evolveCostMult ?? 1)));  // 신속 진화 모듈
    if (canUpgradeFlagship(this.cruisers || 0, this.tier, maxTier, { cruisersPerFlagship: need })) {
      // 흡수한 순양함 화력을 기함에 은행(+보너스) → 업그레이드가 항상 순 이득 (화력 손실 버그 해결)
      const gain = Math.round(need * E.cruiserPower * (E.upgradeBonus ?? 1.2));
      this.cruisers -= need;
      ({ banked: this.banked, stack: this.bankStack } = bankUpgrade(this.banked || 0, this.bankStack, gain));  // 은행 적립(+롤백 스택)
      this.tier += 1;
      this.shield = true;                        // 업그레이드 직후 사고사 방지
      this.invulnT = BAL.squad.evolveInvuln;     // 업그레이드 무적 (A3)
      this.evolvePunch = 0.5;
      // (선택창 제거: 기함 업그레이드는 자동. 모듈 드래프트는 정비 노드에서만 뜬다)
      world.effects.halo(this.x, this.y, COLORS.reward);
      world.effects.burst(this.x, this.y, COLORS.ally, 24, 260);
      world.effects.text(this.x, this.y - 98, `${ev.names[this.tier]} 업그레이드! · 화력 +${gain}`, COLORS.reward, 18);
      world.effects.text(this.x, this.y - 76, `『${BAL.shipTraits[Math.min(this.tier, BAL.shipTraits.length - 1)].tag}』`, COLORS.ally, 14);
      sfx('evolve');
    }
    // 3) 최종 상태(타이탄 + 순양함 만석)에서 넘치는 드론은 체력이 아니라 포인트(코인)로 전환
    if (this.tier >= maxTier && (this.cruisers || 0) >= E.maxCruisers && this.count > E.dronePointCap) {
      const excess = this.count - E.dronePointCap;
      this.count = E.dronePointCap;
      const coins = Math.floor(excess * E.coinPerExcessDrone);
      if (coins > 0 && world.addCoins) {
        world.addCoins(coins);
        world.effects.text(this.x, this.y - 44, `드론 ${excess}기 → +${coins} 포인트`, COLORS.reward, 14);
      }
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
    if (before > 0 && this.count === 0) this.onDronesDepleted(world);
  }

  /**
   * 드론 전멸 순간의 '강등 안전망' (A안):
   * 상위 파워 한 겹(승천 → 등급)을 잃고 편대를 재건해 생존한다.
   * 최하 등급(스카웃)에서 전멸할 때만 진짜 사망 → 화력 등급이 곧 여분의 목숨.
   */
  onDronesDepleted(world) {
    const ev = BAL.evolution;
    const refill = world.stats?.startCount ?? BAL.squad.start;
    const rescue = (tag, sub) => {
      this.count = refill;
      this.shield = true;
      this.invulnT = BAL.squad.evolveInvuln;   // 재건 직후 잠깐 무적 (연쇄 전멸 방지)
      this.flash = 0;
      this.evolvePunch = 0.5;
      world.effects.halo(this.x, this.y, COLORS.danger);
      world.effects.burst(this.x, this.y, COLORS.danger, 20, 220);
      world.effects.text(this.x, this.y - 40, tag, COLORS.danger, 17);
      world.effects.text(this.x, this.y - 64, sub, COLORS.reward, 15);
      sfx('evolve');
    };
    // 1) 순양함이 있으면 1척을 희생해 편대 재건 (순양함 = 여분의 목숨)
    if ((this.cruisers || 0) > 0) {
      this.cruisers -= 1;
      rescue('⚠ 순양함 1척 소멸 · 편대 재건', `드론 ${refill}기 긴급 사출`);
      return;
    }
    // 2) 등급이 남아 있으면 한 단계 강등 후 재건 (그 티어에서 은행된 화력도 롤백 → 강등→재업글 farming 차단)
    if (this.tier > 0) {
      this.tier -= 1;
      ({ banked: this.banked, stack: this.bankStack } = bankDemote(this.banked, this.bankStack));  // 그 티어 적립분 정확 롤백
      rescue(`⚠ ${ev.names[this.tier]}로 강등`, `드론 ${refill}기 긴급 사출`);
      return;
    }
    // 3) 최하 등급에서 전멸 = 진짜 사망
    this.dead = true;
  }

  setCount(n, world, label) {
    const diff = n - this.count;
    if (diff !== 0) this.applyDelta(diff, world, label);
  }

  /** 접촉 피해 (크리처/운석): 실드 1회 무효. 1회 손실은 편대의 일정 비율까지만 (한 방 전멸 방지) */
  contactDamage(n, world) {
    if (this.invulnT > 0) return;   // 진화 무적 (A3)
    if (this.shield) {
      this.shield = false;
      world.effects.text(this.x, this.y - 40, 'SHIELD!', COLORS.gateGood);
      world.effects.ring(this.x, this.y, COLORS.gateGood);
      sfx('shield_pop');
      return;
    }
    const cap = Math.max(2, Math.ceil(this.count * BAL.squad.contactCapPct * (world.mfx?.contactCapMult ?? 1)));
    this.applyDelta(-Math.min(n, cap), world);
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
    if (this.invulnT > 0) this.invulnT -= dt;   // 진화 무적 감쇠 (A3)
    if (this.flash > 0) this.flash -= dt;
    if (this.evolvePunch > 0) this.evolvePunch -= dt;
    this.recoil *= Math.pow(0.001, dt); // ≈ *0.7 per frame @60fps

    // 반응 실드 모듈: 보호막이 없을 때 주기적으로 재생성
    const sr = world.mfx?.shieldRegen || 0;
    if (sr > 0) {
      if (this.shield) { this.shieldRegenT = 0; }
      else if ((this.shieldRegenT = (this.shieldRegenT || 0) + dt) >= sr) {
        this.shieldRegenT = 0; this.shield = true;
        world.effects.ring(this.x, this.y, COLORS.gateGood);
      }
    }

    this.updateCharge(dt, world);   // 차지 랜스 (홀드 시 자동사격 대신 충전)
  }

  /** 차지 랜스: 홀드 시 자동사격 정지·에너지 충전, 놓으면 그 단계의 랜스 발사 */
  updateCharge(dt, world) {
    const ch = BAL.charge;
    const charging = !!(world.input && world.input.charging) && !this.dead;
    const maxStage = ch.maxStage + (world.mfx?.chargeMaxBonus || 0);
    if (charging) {
      this.charge += dt * (world.mfx?.chargeSpeed || 1);
      const st = chargeStageFor(this.charge, ch.stageTime, maxStage);
      if (st > this.chargeStage) {          // 단계 상승 연출 + 사운드
        this.chargeStage = st;
        world.effects.ring(this.x, this.y, st >= 3 ? COLORS.reward : COLORS.ally, 0);
        sfx(st >= maxStage ? 'charge_full' : 'charge_up');
      }
    } else {
      if (this.wasCharging && this.chargeStage >= ch.minStageToFire) this.fireLance(world, this.chargeStage);
      this.charge = 0;
      this.chargeStage = 0;
    }
    this.wasCharging = charging;
    if (!charging) this.fire(dt, world);    // 충전 안 할 때만 자동사격
  }

  /** 차지 랜스 발사: 정면 세로 컬럼을 관통하는 대미지 + 스펙터클 */
  fireLance(world, stage) {
    const ch = BAL.charge;
    const mfx = world.mfx || {};
    const trait = BAL.shipTraits[Math.min(this.tier, BAL.shipTraits.length - 1)];  // 기함 개성: 광역 기함일수록 랜스도 넓게
    const halfW = ch.width[Math.min(stage, ch.width.length - 1)] * (0.7 + 0.3 * trait.spread);
    // 차지 피해도 자동사격과 같은 계수(발사속도·공격력·무기레벨·무기계수)로 스케일 → 강화할수록 같이 강해진다.
    const W = BAL.weapons;
    const fireRate = (world.stats?.fireRate ?? BAL.squad.fireRate) * (mfx.fireRateMult ?? 1);
    const damage = (world.stats?.damage ?? BAL.squad.damage) * (mfx.dmgMult ?? 1);
    const lvCoef = W.lvCoef[this.weaponLv - 1];
    const wCoef = this.weapon === 'homing' ? W.homing.coef : this.weapon === 'laser' ? W.laser.coef : W.vulcan.coef;
    const stageMult = ch.stageMult[Math.min(stage, ch.stageMult.length - 1)] || 1;
    const dmg = this.power * ch.blastCoef * stageMult * fireRate * damage * lvCoef * wCoef * (mfx.chargeMult ?? 1);
    for (const e of world.entities) {       // 앞쪽 컬럼의 적 전부 관통
      if (e.dead || !e.hitByBullet) continue;
      if (e.y < this.y && Math.abs(e.x - this.x) <= halfW + (e.r || 0)) e.hitByBullet(dmg, world);
    }
    if (world.bosses) for (const bo of world.bosses) {   // 랜스 컬럼 안의 모든 보스 타격
      if (!bo.dead && Math.abs(bo.x - this.x) <= halfW + bo.r) bo.hitByBullet(dmg * (mfx.bossDmgMult ?? 1), world);
    }
    // 경로 적탄 소멸은 3단계 이상에서만 (1·2단계는 적탄 못 지움)
    if (stage >= 3) for (const b of world.enemyBullets) if (Math.abs(b.x - this.x) <= halfW + 18) b.dead = true;
    world.spawnEntity(new ChargeLance(this.x, this.y, halfW, stage));
    world.effects.flash(0.3 + 0.12 * stage);
    world.effects.ring(this.x, this.y, COLORS.ally);
    world.effects.burst(this.x, this.y, COLORS.ally, 18 + stage * 8, 320);
    this.recoil = 3 + stage;
    sfx('lance_fire');
  }

  /** 무기별 발사: 총 DPS 공식은 동일, 무기는 "모양"을 바꾼다. 진화(weaponEvolutions)는 거동을 바꾼다. */
  fire(dt, world) {
    const W = BAL.weapons;
    const WE = BAL.weaponEvolution;
    const mfx = world.mfx || {};
    const evo = this.weaponEvolutions[this.weapon];   // null | 진화 id
    const powerMult = this.powerT > 0 ? BAL.powerModule.multiplier : 1;
    const lvCoef = W.lvCoef[this.weaponLv - 1];
    const fireRate = (world.stats?.fireRate ?? BAL.squad.fireRate) * (mfx.fireRateMult ?? 1);
    const damage = (world.stats?.damage ?? BAL.squad.damage) * (mfx.dmgMult ?? 1);
    const pb = mfx.pierceBonus || 0;
    const baseDps = this.flagPower * fireRate * damage * lvCoef * powerMult;
    // 니들 개틀링: 치명 확률 가산
    const needle = evo === 'vulcan_needle' ? WE.vulcan_needle : null;
    const critP = (mfx.crit || 0) + (needle ? needle.critBonus : 0);
    const crit = (d) => (critP && Math.random() < critP ? d * (mfx.critMult || 2) : d);
    // 호위함(순양함) 사격
    this.fireSupport(dt, world, this.supportPower * fireRate * damage * lvCoef * powerMult, crit);
    const trait = BAL.shipTraits[Math.min(this.tier, BAL.shipTraits.length - 1)];
    const ascPierce = 0;
    const wCoef = this.weapon === 'homing' ? W.homing.coef : this.weapon === 'laser' ? W.laser.coef : W.vulcan.coef;
    const escortShare = this.count > 1 ? 0.3 : 0;
    this.fireEscort(dt, world, baseDps * wCoef * escortShare);

    if (this.weapon === 'homing') {
      const siege = evo === 'homing_siege' ? WE.homing_siege : null;
      const wasp = evo === 'homing_wasp' ? WE.homing_wasp : null;
      const rateMul = siege ? siege.rateMult : 1;
      const cap = wasp ? wasp.cap : W.homing.cap;
      const dps = baseDps * W.homing.coef * (1 - escortShare);
      this.fireAcc += W.homing.rate * trait.rate * rateMul * dt;
      while (this.fireAcc >= 1) {
        this.fireAcc -= 1;
        const alive = world.bullets.filter((b) => b.kind === 'homing' && !b.dead).length;
        if (alive >= cap) continue;
        const md = crit(dps / W.homing.rate * trait.dmg);   // 기본 1발 피해
        if (wasp) {
          // 소형 3발: 총 피해 = md × 1.15, 서로 다른 표적 우선
          for (let k = 0; k < wasp.count && alive + k < cap; k++) {
            const mis = new HomingMissile(this.x, this.y - 14, (Math.random() - 0.5) * 300, md * wasp.totalFrac / wasp.count, this.weaponLv);
            mis.wasp = true; mis.r *= 0.8;
            world.bullets.push(mis);
          }
          world.effects.muzzle(this.x, this.y - 14, '#ffd0a0', 6);
        } else if (siege) {
          // 대형 폭발 미사일: 느리지만 강함
          const mis = new HomingMissile(this.x, this.y - 14, (Math.random() - 0.5) * 120, md * siege.dmgMult, this.weaponLv);
          mis.r *= siege.sizeMult; mis.speedMult = siege.speedMult; mis.turnMult = siege.turnMult;
          mis.blast = { radius: siege.blastRadius, frac: siege.blastFrac, bossBonus: siege.bossBonus };
          world.bullets.push(mis);
          world.effects.muzzle(this.x, this.y - 14, '#ff9c41', 8);
        } else {
          world.bullets.push(new HomingMissile(this.x, this.y - 14, (Math.random() - 0.5) * 240, md, this.weaponLv));
          world.effects.muzzle(this.x, this.y - 14, '#ff9c41', 5);
        }
        this.recoil = 1.5;
        sfx('missile');
      }
      return;
    }

    const isLaser = this.weapon === 'laser';
    const storm = evo === 'vulcan_storm';
    const prism = evo === 'laser_prism';
    const cutter = evo === 'laser_cutter' ? WE.laser_cutter : null;
    const coef = isLaser ? W.laser.coef : W.vulcan.coef;
    const dps = baseDps * coef * (1 - escortShare);
    let shotsBase = isLaser ? 18 : Math.min(25, Math.max(4, this.count * fireRate));
    let shotsPerSec = shotsBase * trait.rate;
    if (needle) { shotsBase *= needle.rate; shotsPerSec *= needle.rate; }  // 발사↑ + 탄당 피해↓ = DPS 중립·집중
    this.fireAcc += shotsPerSec * dt;
    const mounts = SHIP_DEFS[this.tier].mounts;
    while (this.fireAcc >= 1) {
      this.fireAcc -= 1;
      if (world.bullets.length >= BAL.bullet.cap) continue;
      const dmg = crit(dps / shotsBase * trait.dmg);
      this.mountIdx = ((this.mountIdx || 0) + 1) % mounts.length;
      const m = mounts[this.mountIdx];
      if (isLaser) {
        let beamW = 3 + this.weaponLv * 1.5;
        let pierce = W.laser.pierce[this.weaponLv - 1] + pb + trait.pierce + ascPierce;
        let ldmg = dmg, isCut = false;
        if (cutter) { this.cutterCount = (this.cutterCount || 0) + 1; if (this.cutterCount % cutter.every === 0) { beamW *= cutter.widthMult; pierce += cutter.pierceBonus; ldmg *= cutter.dmgMult; isCut = true; } }
        const b = new Bullet(this.x + m.x, this.y + m.y, ldmg, { vy: -W.laser.speed, kind: 'laser', pierce, beamW, lv: this.weaponLv });
        if (prism) b.split = true;
        if (isCut) b.cutter = cutter.clearRadius;
        world.bullets.push(b);
        world.effects.muzzle(this.x + m.x, this.y + m.y - 2, isCut ? '#ffffff' : '#a8f0ff', isCut ? 9 : 6);
        sfx('laser');
      } else {
        let spread = (W.vulcan.spreadDeg[this.weaponLv - 1] * Math.PI) / 180 * trait.spread;
        if (needle) spread *= needle.spread;
        if (storm) spread *= WE.vulcan_storm.spread;
        const a = (Math.random() - 0.5) * 2 * spread;
        const b = new Bullet(this.x + m.x, this.y + m.y, dmg, {
          vx: Math.sin(a) * W.vulcan.speed, vy: -Math.cos(a) * W.vulcan.speed, kind: 'vulcan',
          pierce: (pb + trait.pierce + ascPierce) > 0 ? 1 + pb + trait.pierce + ascPierce : 0, lv: this.weaponLv,
        });
        if (needle) b.scale = needle.sizeMult;
        if (storm) b.ricochet = true;
        world.bullets.push(b);
        world.effects.muzzle(this.x + m.x, this.y + m.y - 2, COLORS.ally, 5);
        sfx('vulcan');
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

  /** 합체 유닛 목록(순양함 먼저, 안쪽 배치) */
  supportUnits() {
    const u = [];
    for (let i = 0; i < this.cruisers; i++) u.push('cruiser');
    for (let i = 0; i < this.escorts; i++) u.push('escort');
    return u;
  }
  /** idx번째 호위함의 기함 기준 상대 위치 (좌우 교대 + 뒤로 계단식) */
  supportSlot(idx, type) {
    const gap = BAL.escort.slotGap;
    const def = SHIP_DEFS[this.tier];
    const side = idx % 2 === 0 ? -1 : 1;
    const row = Math.floor(idx / 2);
    const baseX = type === 'cruiser' ? gap * 1.05 : gap * 1.95;
    const baseY = def.h * 0.3 + 16 + row * (gap * 0.85);
    return { x: side * (baseX + row * 5), y: baseY };
  }

  /** 호위함 사격: 기함과 같은 무기를 supportPower 비례로, 호위함 위치에서 발사 */
  fireSupport(dt, world, dps, crit) {
    const units = (this.escorts || 0) + (this.cruisers || 0);
    if (units <= 0 || dps <= 0) return;
    const W = BAL.weapons;
    const shotsPerSec = Math.min(20, 3 + units * 1.6);
    this.supportAcc = (this.supportAcc || 0) + shotsPerSec * dt;
    while (this.supportAcc >= 1) {
      this.supportAcc -= 1;
      if (world.bullets.length >= BAL.bullet.cap) continue;
      const dmg = crit(dps / shotsPerSec);
      const idx = (this.supportIdx = ((this.supportIdx || 0) + 1) % units);
      const type = idx < this.cruisers ? 'cruiser' : 'escort';
      const slot = this.supportSlot(idx, type);
      const sx = this.x + slot.x, sy = this.y + slot.y - 6;
      if (this.weapon === 'laser') {
        world.bullets.push(new Bullet(sx, sy, dmg, { vy: -W.laser.speed, kind: 'laser', pierce: W.laser.pierce[this.weaponLv - 1], beamW: 2 + this.weaponLv, lv: this.weaponLv }));
      } else if (this.weapon === 'homing') {
        const alive = world.bullets.filter((b) => b.kind === 'homing' && !b.dead).length;
        if (alive < W.homing.cap) world.bullets.push(new HomingMissile(sx, sy, (Math.random() - 0.5) * 180, dmg, this.weaponLv));
      } else {
        const spread = (W.vulcan.spreadDeg[this.weaponLv - 1] * Math.PI) / 180;
        const a = (Math.random() - 0.5) * 2 * spread;
        world.bullets.push(new Bullet(sx, sy, dmg, { vx: Math.sin(a) * W.vulcan.speed, vy: -Math.cos(a) * W.vulcan.speed, kind: 'vulcan', lv: this.weaponLv }));
      }
    }
  }


  draw(ctx) {
    const w = this.width;
    const def = SHIP_DEFS[this.tier];
    const color = this.flash > 0 ? COLORS.danger : COLORS.ally;

    // 호위 드론 무리 (기함 반경 안쪽은 비움)
    const n = Math.min(this.count, BAL.squad.drawCap);
    const scout = shipSprite(0, this.weapon);
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

    // 호위함(호위기·순양함): 기함 뒤·옆에 나란히 — "함대가 커지는" 체감 + 같이 사격
    if (this.escorts || this.cruisers) {
      const cSprite = shipSprite(1, this.weapon);   // 순양함 = 인터셉터형
      const total = this.cruisers + this.escorts;
      for (let i = 0; i < total; i++) {
        const type = i < this.cruisers ? 'cruiser' : 'escort';
        const slot = this.supportSlot(i, type);
        ctx.save();
        ctx.translate(this.x + slot.x, this.y + slot.y + Math.sin(this.t * 3 + i) * 1.5);
        ctx.rotate(this.bank * 0.25);
        blit(ctx, type === 'cruiser' ? cSprite : scout, 0, 0, type === 'cruiser' ? 0.85 : 0.78);
        ctx.restore();
      }
    }

    // 기함: 뱅킹(회전+가로 압축) + 반동 + 진화 스케일 펀치
    ctx.save();
    ctx.translate(this.x, this.y + this.recoil);
    ctx.rotate(this.bank * 0.22);
    const punch = this.evolvePunch > 0 ? 1 + 0.5 * (this.evolvePunch / 0.35) : 1;
    ctx.scale((1 - Math.abs(this.bank) * 0.25) * punch, punch);
    drawFlames(ctx, this.tier, this.t);
    blit(ctx, shipSprite(this.tier, this.weapon), 0, 0);
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

    // 차지 랜스 충전 표시 (홀드 중 에너지가 모이는 게 보이게 — 단계·진행 아크)
    if (this.charge > 0) {
      const ch = BAL.charge;
      const stg = this.chargeStage;
      const col = stg >= 3 ? COLORS.reward : COLORS.ally;
      const frac = Math.min(1, (this.charge % ch.stageTime) / ch.stageTime);
      const rr = w + 14 + stg * 7;
      ctx.save();
      ctx.globalAlpha = 0.15 + 0.1 * stg + 0.08 * Math.sin(this.t * 22);
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(this.x, this.y, rr * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.9;
      ctx.strokeStyle = col; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(this.x, this.y, rr, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); ctx.stroke();
      if (stg > 0) {
        ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('⚡' + stg, this.x, this.y - rr - 6);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
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
    if (this.invulnT > 0) {   // 진화 무적 표시 (A3)
      ctx.strokeStyle = '#ffffff';
      ctx.globalAlpha = 0.25 + 0.3 * Math.abs(Math.sin(this.t * 26));
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, w + 26, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
}

// ───────────────────────── 차지 랜스 비주얼 (피해는 발사 시점에 이미 적용됨 — 이건 연출)
export class ChargeLance {
  constructor(x, y, halfW, stage) {
    this.x = x; this.baseY = y; this.halfW = halfW; this.stage = stage;
    this.t = 0; this.life = 0.34; this.dead = false;
  }
  update(dt) { this.t += dt; if (this.t >= this.life) this.dead = true; }
  draw(ctx) {
    const p = Math.max(0, 1 - this.t / this.life);
    const w = this.halfW * (0.7 + 0.5 * p);
    const col = this.stage >= 3 ? COLORS.reward : COLORS.ally;
    ctx.save();
    glow(ctx, col, 26, (c) => {                 // 외곽 발광 빔
      c.globalAlpha = 0.5 * p;
      c.fillStyle = col;
      c.fillRect(this.x - w, 0, w * 2, this.baseY);
    });
    ctx.globalAlpha = 0.85 * p;                  // 코어 백색
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(this.x - w * 0.4, 0, w * 0.8, this.baseY);
    ctx.globalAlpha = p;                          // 발사구 충격 링
    ctx.strokeStyle = col; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(this.x, this.baseY, w * 1.4 * (1.3 - p), 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

// ───────────────────────── 아군 탄 (발칸/레이저 겸용)
// 무기 진화 도탄/분열 대상 탐색 (순간 1회, 비재귀). side<0=왼쪽, >0=오른쪽, 0=전체. seen=제외 Set.
function nearestTarget(world, x, y, radius, seen, side = 0) {
  let best = null, bestD = radius;
  for (const e of world.entities) {
    if (e.dead || !e.hitByBullet || e.indestructible) continue;
    if (seen && seen.has(e)) continue;
    if (side < 0 && e.x >= x) continue;
    if (side > 0 && e.x <= x) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

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
    // 이동 잔상까지 '하나로 이어진' 스트릭 — 느린 프레임에서 두 조각으로 갈라져 보이던 문제 해결
    const w = this.beamW;
    const L = 34 + this.lv * 8;
    const top = Math.min(this.y, this.prevY) - L / 2;
    const bot = Math.max(this.y, this.prevY) + L / 2;
    const h = bot - top;
    ctx.globalAlpha = 0.22;                // 청록 외피 (중앙 가림 완화 — 적탄 가독성 위해 반투명 하향)
    ctx.fillStyle = '#a8f0ff';
    ctx.fillRect(this.x - w, top, w * 2, h);
    ctx.globalAlpha = 0.75;                // 백열 코어 (살짝 반투명)
    ctx.fillStyle = '#ffffff';
    const cw = this.lv >= 3 ? w * 0.8 : this.lv === 2 ? w * 0.6 : w * 0.45;
    ctx.fillRect(this.x - cw / 2, top, cw, h);
    if (this.lv >= 2) {                    // 진행 끝단 색 포인트
      ctx.fillStyle = COLORS.ally;
      ctx.fillRect(this.x - w, this.y - 2, w * 2, 4);
    }
    ctx.globalAlpha = 1;
  }

  drawVulcan(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.vx, -this.vy));
    if (this.scale) ctx.scale(this.scale, this.scale);   // 니들: 탄 크기 축소
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
      // Lv3: 굵은 청록 에너지 볼트 — 단색 통일(적·로켓처럼 안 보이게) + 백열 코어
      ctx.fillStyle = COLORS.ally;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.moveTo(0, -11);       // 위로 뾰족
      ctx.lineTo(-3, -3);
      ctx.lineTo(-3, 8);
      ctx.lineTo(0, 11);
      ctx.lineTo(3, 8);
      ctx.lineTo(3, -3);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';  // 백열 코어(세로 심)
      ctx.fillRect(-1.2, -9, 2.4, 16);
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

  /** 진화 온-히트: 폭풍 발칸 도탄 / 프리즘 좌우 분열 (각 1회, 비재귀). main이 적중 직후 호출. */
  onHit(hit, world) {
    const WE = BAL.weaponEvolution;
    if (this.ricochet) {
      this.ricochet = false;
      const seen = new Set([hit]); if (this.hitSet) for (const e of this.hitSet) seen.add(e);
      const t = nearestTarget(world, this.x, this.y, WE.vulcan_storm.ricochetRadius, seen, 0);
      if (t) {
        const ang = Math.atan2(t.x - this.x, -(t.y - this.y));
        world.bullets.push(new Bullet(this.x, this.y, this.damage * WE.vulcan_storm.ricochetFrac, {
          vx: Math.sin(ang) * BAL.weapons.vulcan.speed, vy: -Math.cos(ang) * BAL.weapons.vulcan.speed, kind: 'vulcan', lv: this.lv,
        }));   // ricochet 플래그 없음 → 재도탄 금지
        world.effects.burst((this.x + t.x) / 2, (this.y + t.y) / 2, COLORS.ally, 4, 90);
      }
    }
    if (this.split) {
      this.split = false;
      for (const side of [-1, 1]) {
        const t = nearestTarget(world, this.x, this.y, WE.laser_prism.splitRadius, new Set([hit]), side);
        if (t && t !== world.boss) {   // 보스 분열 제외
          const ang = Math.atan2(t.x - this.x, -(t.y - this.y));
          world.bullets.push(new Bullet(this.x, this.y, this.damage * WE.laser_prism.splitFrac, {
            vx: Math.sin(ang) * BAL.weapons.laser.speed, vy: -Math.cos(ang) * BAL.weapons.laser.speed, kind: 'laser', beamW: 3, lv: this.lv, pierce: 0,
          }));
        }
      }
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
    // 우선순위: 크리처/사격형 적 > 크리스탈 > 운석 (최근접). 와스프는 근접 3표적 중 랜덤(분산).
    const cands = [];
    for (const e of world.entities) {
      if (e.dead || !e.hitByBullet || e.indestructible) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      cands.push({ e, score: (e.isEnemy ? 2000 : e.reward ? 800 : 400) - d });
    }
    if (world.boss && !world.boss.dead && world.phase === 'boss') cands.push({ e: world.boss, score: 1500 });
    if (!cands.length) { this.target = null; return; }
    cands.sort((a, b) => b.score - a.score);
    if (this.wasp && cands.length > 1) this.target = cands[Math.floor(Math.random() * Math.min(3, cands.length))].e;
    else this.target = cands[0].e;
  }
  update(dt, world) {
    this.age += dt;
    const sp = BAL.weapons.homing, spdMul = this.speedMult || 1, trnMul = this.turnMult || 1;
    this.speed = Math.min(sp.speedTo * spdMul, this.speed + 260 * dt);
    if (this.age > 0.25) {
      if (!this.target || this.target.dead) this.pickTarget(world);
      if (this.target && !this.target.dead) {
        const want = Math.atan2(this.target.x - this.x, -(this.target.y - this.y));
        const cur = Math.atan2(this.vx, -this.vy);
        let diff = want - cur;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const tr = sp.turnRate * trnMul * dt;
        const turn = Math.max(-tr, Math.min(tr, diff));
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

  /** 진화 온-히트: 시즈 토피도 폭발(AoE). main이 적중 직후 호출. */
  onHit(hit, world) {
    if (!this.blast) return;
    const { radius, frac } = this.blast;
    for (const o of world.entities) {
      if (o === hit || o.dead || !o.hitByBullet || o.indestructible) continue;
      if (Math.hypot(o.x - this.x, o.y - this.y) <= radius + (o.r || 0)) o.hitByBullet(this.damage * frac, world);
    }
    if (world.boss && !world.boss.dead && world.phase === 'boss' && world.boss !== hit &&
        Math.hypot(world.boss.x - this.x, world.boss.y - this.y) <= radius + world.boss.r) {
      world.boss.hitByBullet(this.damage * frac, world);
    }
    world.effects.burst(this.x, this.y, '#ff9c41', 16, 240);
    world.effects.ring(this.x, this.y, '#ff9c41');
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
      world.squad.applyDelta(Math.round(res.reward * (world.mfx?.podRewardMult ?? 1) * BAL.economy.droneGainMult), world);
      sfx('crystal');
    }
  }
  update(dt, world) {
    this.scroll(dt, world);
    if (this.offscreen(world)) this.dead = true;
  }
  draw(ctx) {
    const r = this.r;
    // 단일 결정 젬 (기존 C1.png는 큰 결정+떨어진 작은 결정 2조각이라 '깨진/쪼개진' 것처럼 보였음 → 코드 단일 젬으로 교체)
    glow(ctx, '#6fe3ff', 10, (c) => {
      c.fillStyle = 'rgba(110,210,255,0.9)';
      c.strokeStyle = '#dff6ff';
      c.lineWidth = 2;
      c.beginPath();
      c.moveTo(this.x, this.y - r);
      c.lineTo(this.x + r * 0.72, this.y - r * 0.2);
      c.lineTo(this.x + r * 0.44, this.y + r);
      c.lineTo(this.x - r * 0.44, this.y + r);
      c.lineTo(this.x - r * 0.72, this.y - r * 0.2);
      c.closePath(); c.fill(); c.stroke();
    });
    // 패싯 하이라이트 (단일 젬 컷)
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(this.x - r * 0.72, this.y - r * 0.2);
    ctx.lineTo(this.x, this.y - r * 0.05);
    ctx.lineTo(this.x + r * 0.72, this.y - r * 0.2);
    ctx.moveTo(this.x, this.y - r);
    ctx.lineTo(this.x, this.y + r);
    ctx.stroke();
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

// ───────────────────────── 보급 수송선: 부수면 드론 지급 (파괴 = 드론 회수의 주력 공급원)
export class DronePod extends Scrolling {
  constructor(x, y, size) {
    super(x, y);
    const cfg = BAL.pod[size];
    this.size = size;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.reward = cfg.reward;
    this.r = cfg.r;
    this.baseX = x;
    this.t = Math.random() * 10;
  }
  update(dt, world) {
    this.scroll(dt, world);
    this.t += dt;
    this.x = this.baseX + Math.sin(this.t * BAL.pod.swayHz * Math.PI * 2) * BAL.pod.swayAmp;
    if (this.offscreen(world)) this.dead = true;
  }
  hitByBullet(dmg, world) {
    this.hp -= dmg;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      world.effects.burst(this.x, this.y, COLORS.ally, 18, 200);
      world.effects.ring(this.x, this.y, COLORS.ally);
      world.squad.applyDelta(Math.round(this.reward * (world.mfx?.podRewardMult ?? 1) * BAL.economy.droneGainMult), world, '보급 확보!');
      sfx('crystal');
    }
  }
  draw(ctx) {
    // 청록 육각 컨테이너 (크리스탈=노랑 육각과 색으로 구분) + 드론 아이콘 + 보상 숫자
    const r = this.r;
    glow(ctx, COLORS.ally, 12, (c) => {
      c.fillStyle = 'rgba(63,245,224,0.14)';
      c.strokeStyle = COLORS.ally;
      c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        const px = this.x + Math.cos(a) * r;
        const py = this.y + Math.sin(a) * r * 0.82;
        i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
      }
      c.closePath(); c.fill(); c.stroke();
    });
    // 내용 표기: ▲ + 드론 수
    ctx.font = `bold ${r >= 22 ? 15 : 12}px sans-serif`;
    ctx.textAlign = 'center';
    const label = `▲${this.reward}`;
    ctx.strokeStyle = 'rgba(5,6,15,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(label, this.x, this.y + 4);
    ctx.fillStyle = COLORS.ally;
    ctx.fillText(label, this.x, this.y + 4);
    // HP 바
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(this.x - r, this.y - r - 8, r * 2, 3);
    ctx.fillStyle = COLORS.ally;
    ctx.fillRect(this.x - r, this.y - r - 8, r * 2 * Math.max(0, this.hp / this.maxHp), 3);
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
    // 코믹 'POW!' 폭발 배지 = 누가 봐도 파워업 (탄창 이미지 회피 문제 해결)
    const color = WEAPON_COLORS[this.weapon];
    const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
    const bob = Math.sin(this.t * 3) * 2;
    const R = this.r * (1.7 + pulse * 0.2);   // 폭발 바깥 반경 (크게 맥동)
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    // 1) 스타버스트 배지 (뾰족 폭발) — 살짝 흔들리는 회전 + 무기색 발광
    ctx.save();
    ctx.rotate(Math.sin(this.t * 2) * 0.14);
    ctx.shadowColor = color; ctx.shadowBlur = 16;
    ctx.beginPath();
    const spikes = 11;
    for (let i = 0; i < spikes * 2; i++) {
      const rr = i % 2 === 0 ? R : R * 0.6;
      const a = (i / (spikes * 2)) * Math.PI * 2 - Math.PI / 2;
      const px = Math.cos(a) * rr, py = Math.sin(a) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd93d';                 // 금색 폭발 = 특별/보상
    ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = color; ctx.stroke();   // 무기색 테두리
    ctx.restore();
    // 2) "POW!" 중앙 (굵게, 검정 외곽 → 어디서나 읽힘)
    ctx.font = '900 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2a1030'; ctx.strokeText('POW!', 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillText('POW!', 0, 0);
    ctx.textBaseline = 'alphabetic';
    // 3) 무기 이름 (아래) — 어떤 무기인지
    ctx.font = 'bold 11px sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,14,28,0.85)'; ctx.strokeText(WEAPON_LABELS[this.weapon], 0, R + 13);
    ctx.fillStyle = color; ctx.fillText(WEAPON_LABELS[this.weapon], 0, R + 13);
    ctx.restore();
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
    const spd = this.spdMult || 1;                    // 가속 변이
    this.y += BAL.creature.speed * dt * spd;
    if (this.y > world.logicalH * 0.45) {
      const dir = Math.sign(world.squad.x - this.x);
      this.x += dir * BAL.creature.homing * dt * spd;
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
      // 접촉 피해 = max(남은HP 기반, 편대 %비례) x 독성 변이 → 대군이어도 큰 피해
      const flat = Math.ceil(this.hp * BAL.creature.contactMult);
      const pct = Math.round(world.squad.count * BAL.creature.contactPct[this.size]);
      world.squad.contactDamage(Math.round(Math.max(flat, pct) * affixContactMult(this)), world);
      world.effects.burst(this.x, this.y, COLORS.danger, 16);
      this.dead = true;
    }
    if (this.offscreen(world)) this.dead = true;
  }
  hitByBullet(dmg, world) {
    if (affixAbsorb(this, world)) return;    // 보호막 변이: 첫 피격 무효
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      affixOnDeath(this, world);             // 엘리트 변이 보상
      world.effects.burst(this.x, this.y, COLORS.enemy, 12);
      world.addCoins(1);
      // 격파 현상금: 중/대형은 드론 회수 (파괴 보상 확대)
      const bounty = BAL.creature.bounty[this.size];
      if (bounty > 0) world.squad.applyDelta(bounty, world);
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
    blit(ctx, gem || getSwarmSprite(key), 0, 0, this.spriteScale || 1);
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
    affixDraw(ctx, this);
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

// ───────────────────────── 파괴 불가 장애물 (잔해/소행성) — 쏴도 안 부서짐, 오직 회피
export class Debris extends Scrolling {
  constructor(x, y, size = 'big') {
    super(x, y);
    const D = BAL.debris;
    this.r = size === 'huge' ? D.rHuge : D.rBig;
    this.indestructible = true;        // 호밍 미사일 표적 제외용
    this.rot = Math.random() * Math.PI * 2;
    this.rotSpeed = (Math.random() - 0.5) * 2 * D.rotSpeed;
    this.drift = (Math.random() - 0.5) * 2 * D.drift;
    this.hitCd = 0;
    this.pulse = Math.random() * 6;
    // 불규칙 바위 실루엣 + 크레이터 (생성 시 고정)
    this.shape = [];
    const n = 11;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rr = 0.72 + 0.28 * Math.random();
      this.shape.push([Math.cos(a) * rr, Math.sin(a) * rr]);
    }
    this.craters = [];
    for (let i = 0; i < 4; i++) this.craters.push([(Math.random() - 0.5) * 1.0, (Math.random() - 0.5) * 1.0, 0.1 + Math.random() * 0.15]);
  }
  hitByBullet(dmg, world) {
    // 파괴 불가: 탄이 튕겨나감(클링 스파크), 피해 없음. (관통 탄은 통과 — 관통 기함의 이점)
    world.effects.burst(this.x + (Math.random() - 0.5) * this.r, this.y - this.r * 0.35, '#aab4c4', 2, 70);
  }
  update(dt, world) {
    this.scroll(dt, world);
    this.pulse += dt;
    this.rot += this.rotSpeed * dt;
    this.x += this.drift * dt;
    if (this.x < this.r || this.x > world.logicalW - this.r) this.drift *= -1;   // 벽에서 반사 → 화면 안에 머묾
    this.x = Math.max(this.r, Math.min(world.logicalW - this.r, this.x));
    this.hitCd -= dt;
    if (this.hitCd <= 0 && circleHit(this.x, this.y, this.r * 0.82, world.squad.x, world.squad.y, world.squad.hitRadius)) {
      const n = Math.ceil(world.squad.count * BAL.debris.contactPct) + BAL.debris.contactMin;
      world.squad.contactDamage(n, world);       // contactDamage 상한이 한 방 즉사 방지
      world.effects.burst(world.squad.x, world.squad.y, COLORS.danger, 16, 220);
      world.effects.flash(0.18);
      this.hitCd = BAL.debris.hitCooldown;
      sfx('damage');
    }
    if (this.offscreen(world, this.r + 30)) this.dead = true;
  }
  draw(ctx) {
    const r = this.r;
    const pl = 0.5 + 0.5 * Math.sin(this.pulse * 3);   // 붉은 경고 테두리 맥동 (파괴 불가 = 피하라)
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.beginPath();
    this.shape.forEach(([x, y], i) => (i ? ctx.lineTo(x * r, y * r) : ctx.moveTo(x * r, y * r)));
    ctx.closePath();
    ctx.fillStyle = '#3b404b';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = `rgba(255,90,70,${(0.45 + 0.4 * pl).toFixed(2)})`;
    ctx.shadowColor = '#ff5a46';
    ctx.shadowBlur = 8 + 8 * pl;
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2a2e37';                          // 크레이터
    for (const [cx, cy, cr] of this.craters) { ctx.beginPath(); ctx.arc(cx * r, cy * r, cr * r, 0, Math.PI * 2); ctx.fill(); }
    ctx.strokeStyle = 'rgba(180,190,205,0.25)';         // 금속 하이라이트
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-r * 0.4, -r * 0.3); ctx.lineTo(r * 0.1, -r * 0.5); ctx.stroke();
    ctx.restore();
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
      world.effects.text(world.squad.x, world.squad.y - 40, `⚡ 화력 ×2 · ${BAL.powerModule.duration}초!`, '#4cc9ff');
      world.effects.burst(this.x, this.y, '#4cc9ff', 18);
      sfx('pickup');
      this.dead = true;
    }
    if (this.offscreen(world)) this.dead = true;
  }
  draw(ctx) {
    // '일시 강화' 파워업: 전기 파란 발광 구슬 + 흰 번개 ⚡ + "×2 10초" (무기 캡슐=금색 POW! 와 색으로 구분)
    const C = '#4cc9ff';   // 전기 파란색 (무기 캡슐의 금색과 대비)
    const pulse = 0.5 + 0.5 * Math.sin(this.spin * 1.6);
    const R = this.r * (1.5 + pulse * 0.25);
    ctx.save();
    ctx.translate(this.x, this.y);
    // 후광
    ctx.globalAlpha = 0.25 + 0.25 * pulse;
    ctx.fillStyle = C;
    ctx.beginPath(); ctx.arc(0, 0, R + 8 + pulse * 5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    // 전기 구슬 (파랑 + 백열 코어)
    glow(ctx, C, 16, (c) => {
      c.fillStyle = C;
      c.beginPath(); c.arc(0, 0, R, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 2; c.stroke();
      c.globalAlpha = 0.85; c.fillStyle = '#dff4ff';
      c.beginPath(); c.arc(0, -R * 0.25, R * 0.45, 0, Math.PI * 2); c.fill(); c.globalAlpha = 1;
    });
    // 번개 ⚡ (흰색 + 검정 외곽 → 어디서나 또렷)
    const s = R * 0.95;
    ctx.beginPath();
    ctx.moveTo(s * 0.18, -s * 0.85);
    ctx.lineTo(-s * 0.38, s * 0.12);
    ctx.lineTo(-s * 0.05, s * 0.12);
    ctx.lineTo(-s * 0.18, s * 0.85);
    ctx.lineTo(s * 0.42, -s * 0.18);
    ctx.lineTo(s * 0.08, -s * 0.18);
    ctx.closePath();
    ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.strokeStyle = '#0a2030'; ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.fill();
    // "×2 10초" 라벨 (아래) — 일시적임을 명시
    ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,14,28,0.85)'; ctx.strokeText('×2 · 10초', 0, R + 13);
    ctx.fillStyle = C; ctx.fillText('×2 · 10초', 0, R + 13);
    ctx.restore();
  }
}

// ───────────────────────── 적탄 (조준탄/부채꼴탄/직하탄 공용, % 피해)
export class EnemyShot {
  constructor(x, y, vx, vy, { r = 8, dmgPct, dmgMin, homing = 0, color = COLORS.danger, shape = 'orb' } = {}) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.r = r;
    this.dmgPct = dmgPct;
    this.dmgMin = dmgMin;
    this.homing = homing;   // >0이면 매 프레임 편대 쪽으로 속도 방향을 서서히 튼다 (자성탄)
    this.color = color;     // 발사체 색 (보스별 다양화)
    this.shape = shape;     // orb | needle | ring | ember
    this.dead = false;
  }
  static aimed(x, y, tx, ty, speed, opts) {
    const d = Math.hypot(tx - x, ty - y) || 1;
    return new EnemyShot(x, y, ((tx - x) / d) * speed, ((ty - y) / d) * speed, opts);
  }
  update(dt, world) {
    if (this.homing) {
      const dx = world.squad.x - this.x, dy = world.squad.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const sp = Math.hypot(this.vx, this.vy) || 1;
      const kf = Math.min(1, this.homing * dt);
      this.vx += ((dx / d) * sp - this.vx) * kf;
      this.vy += ((dy / d) * sp - this.vy) * kf;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (circleHit(this.x, this.y, this.r, world.squad.x, world.squad.y, world.squad.hitRadius)) {
      this.dead = true;
      if (world.squad.invulnT > 0) return;   // 진화 무적 (A3)
      const dmg = Math.max(this.dmgMin, Math.round(world.squad.count * this.dmgPct));
      world.squad.applyDelta(-dmg, world);
      world.effects.burst(this.x, this.y, COLORS.danger, 10);
    }
    if (this.y > world.logicalH + 30 || this.y < -40 || this.x < -30 || this.x > world.logicalW + 30) this.dead = true;
  }
  draw(ctx) {
    const c = this.color;
    if (this.shape === 'needle') {
      // 바늘/파편: 진행 방향으로 길쭉한 마름모 (참격형)
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.atan2(this.vx, -this.vy));
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.moveTo(0, -this.r * 1.9); ctx.lineTo(this.r * 0.7, 0); ctx.lineTo(0, this.r * 1.9); ctx.lineTo(-this.r * 0.7, 0);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.fillRect(-0.8, -this.r * 1.2, 1.6, this.r * 2.4);
      ctx.restore();
    } else if (this.shape === 'ring') {
      // 고리: 속 빈 원 (깃털 원형탄)
      ctx.strokeStyle = c; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = c; ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    } else if (this.shape === 'ember') {
      // 잉걸: 발광 코어 + 외곽 글로우 (용암탄)
      glow(ctx, c, 10, (g) => {
        g.fillStyle = c;
        g.beginPath(); g.arc(this.x, this.y, this.r, 0, Math.PI * 2); g.fill();
      });
      ctx.fillStyle = '#fff3d0';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.4, 0, Math.PI * 2); ctx.fill();
    } else {
      // orb: 외피 + 흰 코어 (기본/조준탄)
      ctx.fillStyle = c;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(this.x, this.y, this.r * 0.35, 0, Math.PI * 2); ctx.fill();
    }
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
        // 패턴 변주: 두 번에 한 번은 3점사 (연속 조준탄)
        this.volley = (this.volley || 0) + 1;
        this.queue = this.volley % 2 === 0 ? B.burstCount : 1;
        this.queueT = 0;
      }
      if (this.queue > 0) {
        this.queueT -= dt;
        if (this.queueT <= 0) {
          this.queueT = B.burstGap;
          this.queue--;
          world.spawnEnemyBullet(EnemyShot.aimed(this.x, this.y + this.r, world.squad.x, world.squad.y, B.shotSpeed, { dmgPct: B.dmgPct, dmgMin: B.dmgMin, homing: affixShotHoming(this) }));
        }
      }
      if (this.stayT <= 0) this.state = 'leave';
    } else {
      this.y += B.enterSpeed * dt;
      if (this.y > world.logicalH + 40) this.dead = true;
    }
  }
  hitByBullet(dmg, world) {
    if (affixAbsorb(this, world)) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      affixOnDeath(this, world);
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
    affixDraw(ctx, this);
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
        // 패턴 변주: 하방 부채꼴 ↔ 8방향 원형탄 번갈아
        this.mode = ((this.mode || 0) + 1) % 2;
        const hom = affixShotHoming(this);   // 자성탄 변이
        if (this.mode === 1) {
          for (let i = 0; i < B.ringCount; i++) {
            const a = (i / B.ringCount) * Math.PI * 2;
            world.spawnEnemyBullet(new EnemyShot(this.x, this.y, Math.sin(a) * B.ringSpeed, Math.cos(a) * B.ringSpeed, { r: 6, dmgPct: B.dmgPct, dmgMin: B.dmgMin, homing: hom }));
          }
        } else {
          for (let i = 0; i < B.fanCount; i++) {
            const deg = (i - (B.fanCount - 1) / 2) * B.fanDeg;
            const a = (deg * Math.PI) / 180;
            world.spawnEnemyBullet(new EnemyShot(this.x, this.y + this.r, Math.sin(a) * B.shotSpeed, Math.cos(a) * B.shotSpeed, { r: 7, dmgPct: B.dmgPct, dmgMin: B.dmgMin, homing: hom }));
          }
        }
      }
    }
    if (this.offscreen(world)) this.dead = true;
  }
  hitByBullet(dmg, world) {
    if (affixAbsorb(this, world)) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      affixOnDeath(this, world);
      world.effects.burst(this.x, this.y, COLORS.enemyHigh, 16);
      world.addCoins(BAL.turret.coin);
      sfx('explode_l');
    }
  }
  draw(ctx) {
    const gem = getSprite('B5');
    if (gem) {
      blit(ctx, gem, this.x, this.y, this.spriteScale || 1);
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
    affixDraw(ctx, this);
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
    this.x += this.dir * BAL.weaver.speed * dt * (this.spdMult || 1);   // 가속 변이
    this.y = BAL.weaver.y + Math.sin(this.t * 4) * 8;
    this.fireT -= dt;
    if (this.fireT <= 0 && this.x > 20 && this.x < this.logicalW - 20) {
      this.fireT = this.fireInterval;
      const B = BAL.weaver;
      const o = { r: 6, dmgPct: B.dmgPct, dmgMin: B.dmgMin, homing: affixShotHoming(this) };
      // 패턴 변주: N발마다 1발은 편대를 겨눈 조준탄 (커튼 사이의 변칙구)
      this.shotN = (this.shotN || 0) + 1;
      if (this.shotN % B.aimedEvery === 0) {
        world.spawnEnemyBullet(EnemyShot.aimed(this.x, this.y + this.r, world.squad.x, world.squad.y, B.shotSpeed, o));
      } else {
        world.spawnEnemyBullet(new EnemyShot(this.x, this.y + this.r, 0, B.shotSpeed, o));
      }
    }
    if ((this.dir > 0 && this.x > this.logicalW + 30) || (this.dir < 0 && this.x < -30)) this.dead = true;
  }
  hitByBullet(dmg, world) {
    if (affixAbsorb(this, world)) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      affixOnDeath(this, world);
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
    affixDraw(ctx, this);
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

// ───────────────────────── 돌진병: 예고 후 편대를 향해 급강하
export class Charger extends Scrolling {
  constructor(x) {
    super(x, -40);
    const C = BAL.charger;
    this.hp = this.maxHp = C.hp;
    this.r = C.radius;
    this.state = 'enter';   // enter → telegraph → dash
    this.teleT = C.telegraph;
    this.aimX = x;
    this.dashVX = 0; this.dashVY = 0;
    this.isEnemy = true;
    this.t = 0;
  }
  update(dt, world) {
    this.t += dt;
    const C = BAL.charger;
    const spd = this.spdMult || 1;
    if (this.state === 'enter') {
      this.y += C.enterSpeed * dt * spd;
      if (this.y >= C.hoverY) { this.y = C.hoverY; this.state = 'telegraph'; this.teleT = C.telegraph; }
    } else if (this.state === 'telegraph') {
      this.teleT -= dt;
      this.aimX = world.squad.x;                 // 예고 중 편대 추적, 종료 순간 잠금
      if (this.teleT <= 0) {
        const dx = this.aimX - this.x, dy = (world.logicalH + 60) - this.y;
        const d = Math.hypot(dx, dy) || 1;
        this.dashVX = (dx / d) * C.dashSpeed;
        this.dashVY = (dy / d) * C.dashSpeed;
        this.state = 'dash';
      }
    } else {
      this.x += this.dashVX * dt * spd;
      this.y += this.dashVY * dt * spd;
    }
    if (circleHit(this.x, this.y, this.r, world.squad.x, world.squad.y, world.squad.hitRadius)) {
      const dmg = Math.max(C.contactMin, Math.round(world.squad.count * C.contactPct));
      world.squad.contactDamage(Math.round(dmg * affixContactMult(this)), world);
      world.effects.burst(this.x, this.y, COLORS.danger, 16);
      this.dead = true;
    }
    if (this.offscreen(world)) this.dead = true;
  }
  hitByBullet(dmg, world) {
    if (affixAbsorb(this, world)) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.dead = true;
      affixOnDeath(this, world);
      world.effects.burst(this.x, this.y, COLORS.enemyHigh, 14);
      world.addCoins(BAL.charger.coin);
      world.squad.applyDelta(BAL.charger.bounty, world);
      if (this.splits > 0) {
        for (let i = 0; i < this.splits; i++) {
          const a = (i / this.splits) * Math.PI * 2;
          world.spawnEntity(new Creature(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r, 'small'));
        }
      }
      sfx('explode_s');
    }
  }
  draw(ctx) {
    const s = this.spriteScale || 1;
    // 예고선: 편대까지 붉은 조준선 — 깜빡임 + 임박할수록 굵어짐 + 경고 링 (A1)
    if (this.state === 'telegraph') {
      const p = 1 - this.teleT / BAL.charger.telegraph;
      const blink = 0.35 + 0.45 * Math.abs(Math.sin(this.t * 16));
      ctx.save();
      ctx.globalAlpha = blink * (0.55 + 0.45 * p);
      ctx.strokeStyle = COLORS.danger;
      ctx.lineWidth = 2 + 2.5 * p;
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.aimX, this.y + 600);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = blink;   // 돌진 임박 경고 링
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 6 + (1 - p) * 10, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    ctx.save();
    ctx.translate(this.x, this.y);
    const ang = this.state === 'dash' ? Math.atan2(this.dashVX, this.dashVY) : 0;
    ctx.rotate(ang * 0.5);
    ctx.scale(s, s);
    glow(ctx, COLORS.danger, 12, (c) => {
      c.fillStyle = '#3a1020';
      c.strokeStyle = COLORS.danger;
      c.lineWidth = 2.5;
      c.beginPath();
      c.moveTo(0, this.r);                        // 앞(아래) 뾰족한 쐐기
      c.lineTo(-this.r * 0.9, -this.r * 0.7);
      c.lineTo(0, -this.r * 0.3);
      c.lineTo(this.r * 0.9, -this.r * 0.7);
      c.closePath(); c.fill(); c.stroke();
    });
    ctx.fillStyle = '#ffdf7a';
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.t * 8);
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(this.x - this.r, this.y - this.r - 8, this.r * 2, 3);
    ctx.fillStyle = COLORS.danger;
    ctx.fillRect(this.x - this.r, this.y - this.r - 8, this.r * 2 * Math.max(0, this.hp / this.maxHp), 3);
    affixDraw(ctx, this);
  }
}

// ───────────────────────── 기뢰: 천천히 떠다니다 가까우면 폭발
export class Mine extends Scrolling {
  constructor(x) {
    super(x, -30);
    const M = BAL.mine;
    this.hp = this.maxHp = M.hp;
    this.r = M.radius;
    this.baseX = x;
    this.state = 'idle';   // idle → armed → explode
    this.fuseT = M.fuse;
    this.isEnemy = true;
    this.t = 0;
  }
  explode(world) {
    if (this.dead) return;
    this.dead = true;
    const M = BAL.mine;
    world.effects.burst(this.x, this.y, COLORS.danger, 30, 260);
    world.effects.ring(this.x, this.y, COLORS.danger);
    world.effects.flash(0.15);
    const d = Math.hypot(world.squad.x - this.x, world.squad.y - this.y);
    if (d <= M.blastRadius + world.squad.hitRadius) {
      const dmg = Math.max(M.dmgMin, Math.round(world.squad.count * M.dmgPct));
      world.squad.contactDamage(Math.round(dmg * affixContactMult(this)), world);
    }
    sfx('explode_l');
  }
  update(dt, world) {
    this.t += dt;
    const M = BAL.mine;
    this.scroll(dt, world);
    this.y += M.descent * dt * (this.spdMult || 1);
    this.x = this.baseX + Math.sin(this.t * M.swayHz * Math.PI * 2) * M.sway;
    const near = Math.hypot(world.squad.x - this.x, world.squad.y - this.y) <= M.armRadius;
    if (this.state === 'idle' && near) { this.state = 'armed'; this.fuseT = M.fuse; }
    if (this.state === 'armed') {
      this.fuseT -= dt;
      if (this.fuseT <= 0) { this.explode(world); return; }
    }
    if (this.offscreen(world)) this.dead = true;
  }
  hitByBullet(dmg, world) {
    if (affixAbsorb(this, world)) return;
    this.hp -= dmg;
    if (this.hp <= 0) {
      world.addCoins(BAL.mine.coin);             // 쏘아서 미리 터뜨리면 코인 (멀면 안전)
      this.explode(world);
    }
  }
  draw(ctx) {
    const armed = this.state === 'armed';
    const pulse = armed ? 0.5 + 0.5 * Math.sin(this.t * 20) : 0.4 + 0.3 * Math.sin(this.t * 3);
    if (armed) {                                   // 폭발 반경 예고 링
      ctx.save();
      ctx.globalAlpha = 0.22 + 0.2 * Math.sin(this.t * 20);
      ctx.strokeStyle = COLORS.danger;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(this.x, this.y, BAL.mine.blastRadius, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
    glow(ctx, armed ? COLORS.danger : COLORS.enemyHigh, 12, (c) => {
      c.strokeStyle = armed ? COLORS.danger : COLORS.enemyHigh;
      c.fillStyle = 'rgba(40,16,40,0.85)';
      c.lineWidth = 2;
      c.beginPath(); c.arc(this.x, this.y, this.r, 0, Math.PI * 2); c.fill(); c.stroke();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.beginPath();
        c.moveTo(this.x + Math.cos(a) * this.r, this.y + Math.sin(a) * this.r);
        c.lineTo(this.x + Math.cos(a) * (this.r + 5), this.y + Math.sin(a) * (this.r + 5));
        c.stroke();
      }
    });
    ctx.fillStyle = armed ? COLORS.danger : '#ffdf7a';
    ctx.globalAlpha = pulse;
    ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    affixDraw(ctx, this);
  }
}

// ───────────────────────── 중간보스: 직전 스테이지 보스가 일반 적처럼 트랙을 지나간다 (스테이지 2+)
// 화면 상단 고정이 아니라 천천히 하강·통과. 격파 = 드론 대량 회수, 놓치면 그냥 지나감.
export class MidBoss extends Scrolling {
  constructor(logicalW, stage, power) {
    super(logicalW / 2, -90);
    const M = BAL.midboss;
    this.def = bossDefFor(Math.max(1, stage - 1)); // 직전 스테이지의 보스
    this.pattern = BAL.bossPatterns[this.def.id] ?? { kind: 'brood' };
    this.stage = stage;
    this.hp = this.maxHp = Math.round(Math.max(M.hpMin, power * M.hpPerPower));
    this.r = M.radius;
    this.logicalW = logicalW;
    this.baseX = logicalW / 2;
    this.shotT = M.shotInterval * 0.7;
    this.contactCd = 0;
    this.isEnemy = true;
    this.t = 0;
  }
  sprite() { return getSprite(this.def.id) || getSprite('B7'); }

  update(dt, world) {
    const M = BAL.midboss;
    this.t += dt;
    // 스크롤보다 느리게 하강 → 화면에 ~7초 머물다 지나간다
    this.y += (world.scrollSpeed * M.speedRatio + M.ownSpeed) * dt;
    this.x = this.baseX + Math.sin(this.t * M.swayHz * Math.PI * 2) * M.swayAmp;
    if (this.contactCd > 0) this.contactCd -= dt;

    // 화면 크기에 맞춘 렌더 스케일 (보스의 60% 안팎)
    const gem = this.sprite();
    if (gem) this.drawScale = Math.min(0.8, (world.logicalH * 0.13) / gem.logicalH);

    // 서명 공격 (본 보스의 약화판)
    this.shotT -= dt;
    if (this.shotT <= 0 && this.y > 40 && this.y < world.logicalH * 0.75) {
      this.shotT = M.shotInterval;
      this.fireLite(world);
    }

    // 접촉: 서로 아프고 통과 (중간보스는 부딪혀도 죽지 않는다)
    if (this.contactCd <= 0 && circleHit(this.x, this.y, this.r, world.squad.x, world.squad.y, world.squad.hitRadius)) {
      this.contactCd = M.contactCooldown;
      world.squad.contactDamage(Math.round(world.squad.count * M.contactPct), world);
      world.effects.burst(this.x, this.y + this.r, COLORS.danger, 18);
      this.hp -= M.contactSelfDmg;
      if (this.hp <= 0) this.die(world);
    }

    if (this.offscreen(world, 110)) this.dead = true; // 보상 없이 통과
  }

  /** 본 보스 서명 공격의 약화판 */
  fireLite(world) {
    const M = BAL.midboss;
    const o = { r: 6, dmgPct: M.dmgPct, dmgMin: M.dmgMin };
    const spawn = (a, speed, sx = this.x, sy = this.y + this.r * 0.6) =>
      world.spawnEnemyBullet(new EnemyShot(sx, sy, Math.sin(a) * speed, Math.cos(a) * speed, o));
    switch (this.pattern.kind) {
      case 'crescent': // 5방향 넓은 참격
        for (let i = 0; i < 5; i++) spawn(((i - 2) * 16 * Math.PI) / 180, 215);
        break;
      case 'spiral': { // 좁은 3연발 쓸기
        const base = Math.sin(this.t * 1.4) * 0.9;
        for (const d of [-0.24, 0, 0.24]) spawn(base + d, 170);
        break;
      }
      case 'pincer': { // 좌우에서 교차 2쌍
        for (const side of [-1, 1]) {
          spawn((side * -20 * Math.PI) / 180, 220, this.x + side * this.r, this.y + this.r * 0.4);
          spawn((side * -36 * Math.PI) / 180, 220, this.x + side * this.r, this.y + this.r * 0.4);
        }
        break;
      }
      case 'ring': // 8방향 원형탄
        for (let i = 0; i < 8; i++) spawn((i / 8) * Math.PI * 2 + this.t, 150, this.x, this.y);
        break;
      default: { // brood: 소형 크리처 2기 사출
        const hpMult = world.stageMods?.enemyHp ?? 1;
        for (const dx of [-14, 14]) {
          const c = new Creature(this.x + dx, this.y + this.r * 0.7, 'small');
          c.hp = c.maxHp = Math.round(c.hp * hpMult);
          world.spawnEntity(c);
        }
      }
    }
  }

  hitByBullet(dmg, world) {
    this.hp -= dmg;
    if (this.hp <= 0) this.die(world);
  }

  die(world) {
    if (this.dead) return;
    this.dead = true;
    const M = BAL.midboss;
    world.effects.burst(this.x, this.y, COLORS.danger, 40, 260);
    world.effects.burst(this.x, this.y, COLORS.reward, 24, 200);
    world.effects.ring(this.x, this.y, COLORS.reward);
    world.effects.flash(0.25);
    const drones = M.rewardDrones + M.rewardDronesPerStage * (this.stage - 1);
    world.squad.applyDelta(drones, world, `${this.def.korName} 격파!`);
    world.addCoins(M.coin);
    sfx('explode_l');
  }

  draw(ctx) {
    const gem = this.sprite();
    const sc = this.drawScale || 0.55;
    let halfH = this.r;
    if (gem) {
      halfH = (gem.logicalH * sc) / 2;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(Math.sin(this.t * 1.1) * 0.06); // 유영감
      blit(ctx, gem, 0, 0, sc);
      ctx.restore();
    } else {
      glow(ctx, COLORS.enemyHigh, 18, (c) => {
        c.fillStyle = '#2a1038';
        c.strokeStyle = COLORS.enemyHigh;
        c.lineWidth = 3;
        c.beginPath();
        c.ellipse(this.x, this.y, this.r * 1.3, this.r * 0.6, 0, 0, Math.PI * 2);
        c.fill(); c.stroke();
      });
    }
    // 이름 + HP 바 (머리 위)
    const w = 84;
    const by = this.y - halfH - 12;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(5,6,15,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(this.def.korName, this.x, by - 4);
    ctx.fillStyle = COLORS.enemyHigh;
    ctx.fillText(this.def.korName, this.x, by - 4);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(this.x - w / 2, by, w, 4);
    ctx.fillStyle = COLORS.danger;
    ctx.fillRect(this.x - w / 2, by, w * Math.max(0, this.hp / this.maxHp), 4);
  }
}

// ───────────────────────── 보스: 하이브 퀸
// ═════════════ 신규 일반 적 6종 (거동 다양화) — 스프라이트 B16~B21, 없으면 코드 도형 폴백 ═════════════
const NE = () => BAL.newEnemies;
function drawEHp(ctx, e) {
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2, 3);
  ctx.fillStyle = COLORS.enemyCore;
  ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2 * Math.max(0, e.hp / e.maxHp), 3);
}
function enemyDie(e, world, color, coin) {
  e.dead = true; affixOnDeath(e, world);
  world.effects.burst(e.x, e.y, color, 14); world.addCoins(coin); sfx('explode_s');
}

// B16 봄버: 넓은 하강 산탄(융단) — 아래 방치 시 맞음
export class Bomber {
  constructor(x) { const c = NE().bomber; this.x = x; this.y = -30; this.hp = this.maxHp = c.hp; this.r = c.r; this.fireInterval = c.fireInterval; this.fireT = c.fireInterval; this.stayT = c.stay; this.state = 'enter'; this.isEnemy = true; this.dead = false; this.t = 0; }
  update(dt, world) {
    this.t += dt; const c = NE().bomber;
    if (this.state === 'enter') { this.y += c.enterSpeed * dt; if (this.y >= c.hoverY) this.state = 'hover'; }
    else if (this.state === 'hover') {
      this.stayT -= dt; this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = this.fireInterval; const half = (c.spreadDeg * Math.PI / 180) / 2;
        for (let i = 0; i < c.count; i++) { const a = -half + (i / (c.count - 1)) * 2 * half;
          world.spawnEnemyBullet(new EnemyShot(this.x, this.y + this.r, Math.sin(a) * c.speed, Math.cos(a) * c.speed, { r: 7, dmgPct: c.dmgPct, dmgMin: c.dmgMin, homing: affixShotHoming(this), color: '#ff9c41', shape: 'ember' })); }
      }
      if (this.stayT <= 0) this.state = 'leave';
    } else { this.y += c.enterSpeed * dt; if (this.y > world.logicalH + 40) this.dead = true; }
  }
  hitByBullet(dmg, world) { if (affixAbsorb(this, world)) return; this.hp -= dmg; if (this.hp <= 0) enemyDie(this, world, '#ff9c41', NE().bomber.coin); }
  draw(ctx) {
    const gem = getSprite('B16');
    if (gem) blit(ctx, gem, this.x, this.y);
    else { ctx.save(); ctx.translate(this.x, this.y); ctx.fillStyle = COLORS.enemyHigh; ctx.beginPath(); ctx.ellipse(0, 0, this.r, this.r * 0.7, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#ff9c41'; for (const dx of [-8, 0, 8]) { ctx.beginPath(); ctx.arc(dx, 6, 3, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
    if (this.state === 'hover' && this.fireT < BAL.enemyShots.telegraphTime) drawTelegraph(ctx, this.x, this.y, this.r, 1 - this.fireT / BAL.enemyShots.telegraphTime);
    drawEHp(ctx, this); affixDraw(ctx, this);
  }
}

// B17 전격병: 충전 → 세로 번개 기둥 (그 열은 피해야)
export class Zapper {
  constructor(x) { const c = NE().zapper; this.x = x; this.y = -30; this.hp = this.maxHp = c.hp; this.r = c.r; this.stayT = c.stay; this.cycleT = c.cycle; this.charging = 0; this.beamQ = 0; this.beamT = 0; this.state = 'enter'; this.isEnemy = true; this.dead = false; this.t = 0; }
  update(dt, world) {
    this.t += dt; const c = NE().zapper;
    if (this.state === 'enter') { this.y += c.enterSpeed * dt; if (this.y >= c.hoverY) this.state = 'hover'; }
    else if (this.state === 'hover') {
      this.stayT -= dt;
      if (this.charging > 0) { this.charging -= dt; if (this.charging <= 0) { this.beamQ = c.beamShots; this.beamT = 0; } }
      else if (this.beamQ > 0) { this.beamT -= dt; if (this.beamT <= 0) { this.beamT = c.beamGap; this.beamQ--; world.spawnEnemyBullet(new EnemyShot(this.x, this.y + this.r, 0, c.speed, { r: 6, dmgPct: c.dmgPct, dmgMin: c.dmgMin, color: '#8fd4ff', shape: 'needle' })); } }
      else { this.cycleT -= dt; if (this.cycleT <= 0) { this.cycleT = c.cycle; this.charging = c.charge; } }
      if (this.stayT <= 0) this.state = 'leave';
    } else { this.y += c.enterSpeed * dt; if (this.y > world.logicalH + 40) this.dead = true; }
  }
  hitByBullet(dmg, world) { if (affixAbsorb(this, world)) return; this.hp -= dmg; if (this.hp <= 0) enemyDie(this, world, '#8fd4ff', NE().zapper.coin); }
  draw(ctx) {
    const gem = getSprite('B17');
    if (gem) blit(ctx, gem, this.x, this.y);
    else { ctx.save(); ctx.translate(this.x, this.y); ctx.fillStyle = COLORS.enemyMid; ctx.beginPath(); ctx.moveTo(0, -this.r); ctx.lineTo(this.r * 0.7, 0); ctx.lineTo(0, this.r); ctx.lineTo(-this.r * 0.7, 0); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#8fd4ff'; ctx.lineWidth = 2; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * this.r * 0.5, -this.r * 0.6); ctx.lineTo(s * this.r * 0.95, -this.r * 1.15); ctx.stroke(); } ctx.restore(); }
    if (this.charging > 0) { ctx.save(); ctx.globalAlpha = 0.2 + 0.5 * (1 - this.charging / NE().zapper.charge); ctx.strokeStyle = '#8fd4ff'; ctx.lineWidth = this.r * 1.1; ctx.beginPath(); ctx.moveTo(this.x, this.y + this.r); ctx.lineTo(this.x, this.y + 500); ctx.stroke(); ctx.restore(); }
    drawEHp(ctx, this); affixDraw(ctx, this);
  }
}

// B18 궤도병: 원을 그리며 하강 + 조준탄 (맞추기 어려움)
export class Orbiter {
  constructor(x) { const c = NE().orbiter; this.cx = x; this.cy = -30; this.hp = this.maxHp = c.hp; this.r = c.r; this.a = Math.random() * Math.PI * 2; this.fireT = c.fireInterval; this.isEnemy = true; this.dead = false; this.t = 0; this.x = x; this.y = -30; }
  update(dt, world) {
    this.t += dt; const c = NE().orbiter;
    this.cy += c.descend * dt; this.a += c.hz * Math.PI * 2 * dt;
    const cxC = Math.max(c.orbitR, Math.min(world.logicalW - c.orbitR, this.cx));
    this.x = cxC + Math.cos(this.a) * c.orbitR;
    this.y = this.cy + Math.sin(this.a) * c.orbitR * 0.6;
    this.fireT -= dt;
    if (this.fireT <= 0 && this.y > 0) { this.fireT = c.fireInterval; world.spawnEnemyBullet(EnemyShot.aimed(this.x, this.y, world.squad.x, world.squad.y, c.speed, { dmgPct: c.dmgPct, dmgMin: c.dmgMin, homing: affixShotHoming(this), color: '#c86bff', shape: 'orb' })); }
    if (this.cy > world.logicalH + 60) this.dead = true;
  }
  hitByBullet(dmg, world) { if (affixAbsorb(this, world)) return; this.hp -= dmg; if (this.hp <= 0) enemyDie(this, world, '#c86bff', NE().orbiter.coin); }
  draw(ctx) {
    const gem = getSprite('B18');
    if (gem) blit(ctx, gem, this.x, this.y);
    else { ctx.save(); ctx.translate(this.x, this.y); ctx.strokeStyle = COLORS.enemyMid; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = '#c86bff'; ctx.beginPath(); ctx.arc(0, 0, this.r * 0.4, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    drawEHp(ctx, this); affixDraw(ctx, this);
  }
}

// B19 방패병: 앞 방패 주기 개폐 — 방패 올라간 동안 무적, 내려갔을 때만 타격
export class Shielder {
  constructor(x) { const c = NE().shielder; this.x = x; this.y = -30; this.hp = this.maxHp = c.hp; this.r = c.r; this.stayT = c.stay; this.fireT = c.fireInterval; this.shield = true; this.shieldT = c.shieldUp; this.state = 'enter'; this.isEnemy = true; this.dead = false; this.t = 0; }
  update(dt, world) {
    this.t += dt; const c = NE().shielder;
    if (this.state === 'enter') { this.y += c.enterSpeed * dt; if (this.y >= c.hoverY) this.state = 'hover'; }
    else if (this.state === 'hover') {
      this.stayT -= dt; this.shieldT -= dt;
      if (this.shieldT <= 0) { this.shield = !this.shield; this.shieldT = this.shield ? c.shieldUp : c.shieldDown; }
      this.fireT -= dt; if (this.fireT <= 0) { this.fireT = c.fireInterval; world.spawnEnemyBullet(EnemyShot.aimed(this.x, this.y + this.r, world.squad.x, world.squad.y, c.speed, { dmgPct: c.dmgPct, dmgMin: c.dmgMin, homing: affixShotHoming(this), color: '#57e0ff', shape: 'orb' })); }
      if (this.stayT <= 0) this.state = 'leave';
    } else { this.y += c.enterSpeed * dt; if (this.y > world.logicalH + 40) this.dead = true; }
  }
  hitByBullet(dmg, world) { if (this.shield) { world.effects.burst(this.x, this.y + this.r * 0.6, '#57e0ff', 2, 60); return; } if (affixAbsorb(this, world)) return; this.hp -= dmg; if (this.hp <= 0) enemyDie(this, world, '#57e0ff', NE().shielder.coin); }
  draw(ctx) {
    const gem = getSprite('B19');
    if (gem) blit(ctx, gem, this.x, this.y);
    else { ctx.save(); ctx.translate(this.x, this.y); ctx.fillStyle = COLORS.enemyHigh; ctx.beginPath(); ctx.arc(0, 0, this.r * 0.8, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
    if (this.shield) { ctx.save(); ctx.globalAlpha = 0.55; ctx.strokeStyle = '#57e0ff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(this.x, this.y + this.r * 0.3, this.r * 1.45, Math.PI * 0.12, Math.PI * 0.88); ctx.stroke(); ctx.restore(); }
    drawEHp(ctx, this); affixDraw(ctx, this);
  }
}

// B20 모선: 소형 드론 주기 사출 (수 압박)
export class BroodCarrier {
  constructor(x) { const c = NE().carrier; this.x = x; this.y = -30; this.hp = this.maxHp = c.hp; this.r = c.r; this.stayT = c.stay; this.spawnT = c.spawnInterval; this.state = 'enter'; this.isEnemy = true; this.dead = false; this.t = 0; }
  update(dt, world) {
    this.t += dt; const c = NE().carrier;
    if (this.state === 'enter') { this.y += c.enterSpeed * dt; if (this.y >= c.hoverY) this.state = 'hover'; }
    else if (this.state === 'hover') {
      this.stayT -= dt; this.spawnT -= dt;
      if (this.spawnT <= 0) { this.spawnT = c.spawnInterval; for (let i = 0; i < c.spawnCount; i++) { const off = (i - (c.spawnCount - 1) / 2) * (this.r + 8); world.spawnEntity(new Creature(this.x + off, this.y + this.r, 'small')); } }
      if (this.stayT <= 0) this.state = 'leave';
    } else { this.y += c.enterSpeed * dt; if (this.y > world.logicalH + 40) this.dead = true; }
  }
  hitByBullet(dmg, world) { if (affixAbsorb(this, world)) return; this.hp -= dmg; if (this.hp <= 0) enemyDie(this, world, COLORS.enemyHigh, NE().carrier.coin); }
  draw(ctx) {
    const gem = getSprite('B20');
    if (gem) blit(ctx, gem, this.x, this.y);
    else { ctx.save(); ctx.translate(this.x, this.y); ctx.fillStyle = COLORS.enemyHigh; ctx.beginPath(); ctx.ellipse(0, 0, this.r, this.r * 0.75, 0, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = COLORS.enemyCore; for (const dx of [-9, 0, 9]) { ctx.beginPath(); ctx.arc(dx, 5, 3, 0, Math.PI * 2); ctx.fill(); } ctx.restore(); }
    drawEHp(ctx, this); affixDraw(ctx, this);
  }
}

// B21 점멸병: 순간이동하며 조준탄 (예측 불가)
export class Blinker {
  constructor(x, logicalW) { const c = NE().blinker; this.x = x; this.y = -30; this.hp = this.maxHp = c.hp; this.r = c.r; this.blinkT = c.blink; this.fireT = c.fireInterval; this.logicalW = logicalW; this.isEnemy = true; this.dead = false; this.t = 0; this.appearT = 0; }
  update(dt, world) {
    this.t += dt; const c = NE().blinker;
    this.y += 28 * dt; this.appearT = Math.min(1, this.appearT + dt * 4);
    this.blinkT -= dt;
    if (this.blinkT <= 0) { this.blinkT = c.blink; this.x = 40 + Math.random() * (this.logicalW - 80); this.y = Math.max(60, Math.min(world.logicalH * 0.5, this.y + (Math.random() - 0.5) * 130)); this.appearT = 0; world.effects.burst(this.x, this.y, '#c86bff', 8, 120); }
    this.fireT -= dt;
    if (this.fireT <= 0 && this.appearT > 0.5) { this.fireT = c.fireInterval; world.spawnEnemyBullet(EnemyShot.aimed(this.x, this.y, world.squad.x, world.squad.y, c.speed, { dmgPct: c.dmgPct, dmgMin: c.dmgMin, homing: affixShotHoming(this), color: '#d08bff', shape: 'needle' })); }
    if (this.y > world.logicalH + 60) this.dead = true;
  }
  hitByBullet(dmg, world) { if (affixAbsorb(this, world)) return; this.hp -= dmg; if (this.hp <= 0) enemyDie(this, world, '#c86bff', NE().blinker.coin); }
  draw(ctx) {
    ctx.save(); ctx.globalAlpha = 0.35 + 0.65 * this.appearT;
    const gem = getSprite('B21');
    if (gem) blit(ctx, gem, this.x, this.y);
    else { ctx.translate(this.x, this.y); ctx.fillStyle = '#c86bff'; ctx.beginPath(); ctx.moveTo(0, -this.r); ctx.lineTo(this.r * 0.8, 0); ctx.lineTo(0, this.r); ctx.lineTo(-this.r * 0.8, 0); ctx.closePath(); ctx.fill(); }
    ctx.restore();
    drawEHp(ctx, this); affixDraw(ctx, this);
  }
}

export class Boss {
  constructor(logicalW, rateMult = 1, stage = 1, sizeMul = 1) {
    // 스테이지별 보스: 로스터 순환. PNG가 아직 없으면 하이브 퀸 이미지로 폴백 (sprite() 참고)
    const def = bossDefFor(stage);
    this.spriteId = def.id;
    this.name = def.name;
    this.korName = def.korName;
    // 보스별 고유 공격 패턴 (부채꼴 슬롯이 kind별 서명기로 대체된다)
    this.pattern = BAL.bossPatterns[def.id] ?? { kind: 'brood' };
    // 보스 변주: 로스터 2회차부터(loop>0) 시작부터 광폭 + 탄 추가 + 빠른 발사
    const V = BAL.bossVariant;
    const loop = Math.floor((Math.max(1, stage) - 1) / 5);
    this.variantLevel = stage >= V.fromStage ? loop : 0;
    this.loopHue = V.loopHues[loop % V.loopHues.length] || 0;   // 바퀴 색상 회전 (시각 변주)
    if (this.variantLevel > 0) {
      const suffix = V.suffixes[Math.min(this.variantLevel, V.suffixes.length - 1)];
      this.name += suffix;
      this.korName += suffix;
      this.variantFaster = Math.max(V.minFaster, 1 - V.fasterPerLoop * this.variantLevel);
      this.variantFanBonus = V.fanBonusPerLoop * this.variantLevel;
      this.variantAlwaysEnrage = true;
    } else {
      this.variantFaster = 1;
      this.variantFanBonus = 0;
      this.variantAlwaysEnrage = false;
    }
    // 무한 상승: 크기 스테이지 비례 성장 (다중 보스일 땐 sizeMul로 축소해 나란히 배치)
    this.sizeScale = Math.min(BAL.boss.sizeScaleMax, 1 + BAL.boss.sizePerStage * (Math.max(1, stage) - 1)) * sizeMul;
    this.homeX = logicalW / 2;   // 좌우 이동 기준 (다중 보스는 슬롯별로 재설정)
    this.swayScale = 1;          // 좌우 이동 폭 배수 (다중 보스는 ÷보스수)
    this.x = this.homeX;
    this.y = -100;
    this.targetY = BAL.boss.y;
    this.hp = BAL.boss.hp;
    this.maxHp = BAL.boss.hp;
    this.r = BAL.boss.radius * this.sizeScale;
    this.rateMult = rateMult;                       // 스테이지 스케일 (작을수록 빠른 공격)
    this.minionT = BAL.boss.minionInterval * rateMult * (this.pattern.minionMult ?? 1);
    this.shotT = BAL.boss.shotInterval * rateMult * (this.pattern.shotMult ?? 1);
    this.fanT = BAL.boss.fanInterval * rateMult;
    this.spiralA = 0;
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
  get enraged() { return this.variantAlwaysEnrage || this.hp <= this.maxHp * BAL.boss.enrageRatio; }
  interval(base) { return base * this.rateMult * this.variantFaster * (this.enraged ? BAL.boss.enrageRate : 1); }
  phaseColor() {
    const ratio = this.hp / this.maxHp;
    return ratio > 0.66 ? COLORS.enemy : ratio > 0.33 ? COLORS.enemyHigh : COLORS.danger;
  }
  /** 이 보스의 스프라이트: 전용 PNG 우선, 없으면 하이브 퀸(B7)으로 폴백 */
  sprite() {
    return getSprite(this.spriteId) || getSprite('B7');
  }

  /** 화면 크기·스프라이트에 맞춘 안전 배치 (상하좌우 잘림 방지 + 과대 축소) */
  layout(logicalH) {
    const gem = this.sprite();
    if (!gem) return { scale: 1, halfH: this.r, halfW: this.r * 1.6, safeY: BAL.boss.y };
    const maxH = logicalH * 0.22 * (this.sizeScale || 1);  // 보스 세로 상한 (무한 상승: 크기 성장 반영)
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
    // (참격형 보스는 swayMult로 더 사납게 움직인다)
    const sway = this.enraged ? 0.22 : 0.16;
    const swayHz = (this.enraged ? 1.1 : 0.7) * (this.pattern.swayMult ?? 1);
    const margin = L.halfW + 10;
    const rawX = this.homeX + Math.sin(this.t * swayHz) * this.logicalW * sway * this.swayScale;  // 다중 보스: 각자 슬롯(homeX) 기준, 폭 축소
    this.x = Math.max(margin, Math.min(this.logicalW - margin, rawX));

    this.minionT -= dt;
    if (this.minionT <= 0) {
      this.minionT = this.interval(BAL.boss.minionInterval) * (this.pattern.minionMult ?? 1);
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
      this.shotT = this.interval(BAL.boss.shotInterval) * (this.pattern.shotMult ?? 1);
      world.spawnEnemyBullet(EnemyShot.aimed(this.x, this.y + this.r, world.squad.x, world.squad.y, BAL.boss.shotSpeed, { r: BAL.boss.shotRadius, dmgPct: BAL.boss.shotDamagePct, dmgMin: BAL.boss.shotDamageMin, color: this.shotStyle().color }));
    }
    // 서명 공격: 보스 종류별 고유 패턴 (기존 부채꼴 슬롯)
    this.fanT -= dt;
    if (this.fanT <= 0) this.fireSignature(world);
  }

  /** 보스별 서명 공격. fanT를 스스로 재장전한다. */
  /** 보스별 발사체 색·모양 (발사체 다양화) */
  shotStyle() {
    return ({
      crescent: { color: '#ff6b9d', shape: 'needle' },  // 리퍼 로드: 분홍 참격 바늘
      spiral:   { color: '#7cff4c', shape: 'ember' },    // 볼텍스 마우: 독성 녹색 플라스마
      pincer:   { color: '#ff9c41', shape: 'ember' },    // 옵시디언 클로: 용암 잉걸
      ring:     { color: '#a8f0ff', shape: 'ring' },     // 보이드 세라프: 창백한 고리
      brood:    { color: '#c86bff', shape: 'orb' },      // 하이브 퀸: 보라 구체
      cross:      { color: '#8affff', shape: 'ring' },   // 프리즘 타이런트: 굴절 청록 고리
      wave:       { color: '#57e0ff', shape: 'orb' },    // 타이달 리바이어던: 심해 파랑
      rain:       { color: '#ffb347', shape: 'ember' },  // 스톰브링어: 폭격 잉걸
      laserSweep: { color: '#57e0ff', shape: 'needle' }, // 옵틱 워든: 광학 바늘
    })[this.pattern.kind] || { color: COLORS.danger, shape: 'orb' };
  }

  fireSignature(world) {
    const P = this.pattern;
    const B = BAL.boss;
    const fb = this.variantFanBonus || 0;   // 변주판 추가 탄 수
    const st = this.shotStyle();
    const fanOpts = { r: 7, dmgPct: B.fanDamagePct, dmgMin: B.fanDamageMin, color: st.color, shape: st.shape };
    switch (P.kind) {
      case 'crescent': { // 리퍼 로드: 아래로 넓게 베어내리는 참격 볼리
        this.fanT = this.interval(B.fanInterval);
        const n = P.volley + fb;
        for (let i = 0; i < n; i++) {
          const a = ((i - (n - 1) / 2) * P.volleyDeg * Math.PI) / 180;
          world.spawnEnemyBullet(new EnemyShot(this.x, this.y + this.r, Math.sin(a) * P.speed, Math.cos(a) * P.speed, fanOpts));
        }
        break;
      }
      case 'spiral': { // 볼텍스 마우: 좌우로 쓸어내는 연속 탄류 (소용돌이 분사)
        this.fanT = this.interval(P.interval);
        const arms = 1 + Math.floor(fb / 3);   // 변주판은 나선 팔 수 증가
        for (let k = 0; k < arms; k++) {
          const a = (Math.sin(this.t * P.sweepHz * Math.PI * 2) * P.sweepDeg * Math.PI) / 180 + (k / arms) * Math.PI * 2;
          world.spawnEnemyBullet(new EnemyShot(this.x, this.y + this.r * 0.5, Math.sin(a) * P.speed, Math.cos(a) * P.speed, { ...fanOpts, r: 6 }));
        }
        break;
      }
      case 'pincer': { // 옵시디언 클로: 좌우 집게에서 안쪽으로 교차하는 협공탄
        this.fanT = this.interval(B.fanInterval);
        const off = this.r * 1.25 * (this.drawScale || 1);
        const pairs = P.pairs + Math.floor(fb / 2);
        for (const side of [-1, 1]) {
          for (let i = 0; i < pairs; i++) {
            const a = (side * -(18 + i * 14) * Math.PI) / 180; // 안쪽으로 기울어진 각
            world.spawnEnemyBullet(new EnemyShot(this.x + side * off, this.y + this.r * 0.6, Math.sin(a) * P.speed, Math.cos(a) * P.speed, fanOpts));
          }
        }
        break;
      }
      case 'ring': { // 보이드 세라프: 회전 위상이 도는 깃털 원형탄
        this.fanT = this.interval(B.fanInterval);
        const n = P.count + fb;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2 + this.t;
          world.spawnEnemyBullet(new EnemyShot(this.x, this.y, Math.sin(a) * P.speed, Math.cos(a) * P.speed, { ...fanOpts, r: 6 }));
        }
        break;
      }
      case 'cross': { // 프리즘 타이런트: 회전하는 십자(방사) 빔
        this.fanT = this.interval(P.interval);
        const arms = P.arms + Math.floor(fb / 2);
        const base = this.t * (P.spinHz || 0.5) * Math.PI * 2;
        for (let k = 0; k < arms; k++) {
          const a = base + (k / arms) * Math.PI * 2;
          world.spawnEnemyBullet(new EnemyShot(this.x, this.y, Math.sin(a) * P.speed, Math.cos(a) * P.speed, { ...fanOpts, r: 6 }));
        }
        break;
      }
      case 'wave': { // 타이달 리바이어던: 가로로 퍼진 발사점에서 각도가 파동치는 커튼
        this.fanT = this.interval(P.interval);
        const n = P.count + fb;
        for (let i = 0; i < n; i++) {
          const px = this.x + ((i - (n - 1) / 2) / Math.max(1, n - 1)) * P.spanW;
          const a = Math.sin(this.t * P.waveHz * Math.PI * 2 + i * P.phase) * P.amp;
          world.spawnEnemyBullet(new EnemyShot(px, this.y + this.r * 0.4, Math.sin(a) * P.speed, Math.cos(a) * P.speed, { ...fanOpts, r: 6 }));
        }
        break;
      }
      case 'rain': { // 스톰브링어: 상단 무작위 위치에서 쏟아지는 융단 폭격
        this.fanT = this.interval(P.interval);
        const n = P.count + fb;
        for (let i = 0; i < n; i++) {
          const px = 30 + Math.random() * (world.logicalW - 60);
          world.spawnEnemyBullet(new EnemyShot(px, this.y - this.r * 0.5, (Math.random() - 0.5) * 40, P.speed, { ...fanOpts, r: 7 }));
        }
        break;
      }
      case 'laserSweep': { // 옵틱 워든: 좌우로 쓸어가는 빠른 세로 탄기둥(소탕 레이저)
        this.fanT = this.interval(P.interval);
        const px = world.logicalW / 2 + Math.sin(this.t * P.sweepHz * Math.PI * 2) * P.sweepW;
        for (let i = 0; i < P.stack + fb; i++) {
          world.spawnEnemyBullet(new EnemyShot(px, this.y + this.r * 0.5 + i * 10, 0, P.speed, { ...fanOpts, r: 6 }));
        }
        break;
      }
      default: { // 하이브 퀸(brood) 등: 기존 5방향 부채꼴 (산란은 minionMult가 담당)
        this.fanT = this.interval(B.fanInterval);
        const n = B.fanCount + fb;
        for (let i = 0; i < n; i++) {
          const a = ((i - (n - 1) / 2) * B.fanDeg * Math.PI) / 180;
          world.spawnEnemyBullet(new EnemyShot(this.x, this.y + this.r, Math.sin(a) * B.fanSpeed, Math.cos(a) * B.fanSpeed, fanOpts));
        }
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
    const gem = this.sprite();
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
      if (this.loopHue) ctx.filter = `hue-rotate(${this.loopHue}deg)`;   // 바퀴 색상 변주
      blit(ctx, gem, 0, 0, sc);
      if (this.loopHue) ctx.filter = 'none';
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
