// 게임 개체 — 확장판 (부록 설계 반영)
// 편대(진화+무기) / 탄·미사일 / 크리스탈 / 게이트 / 보이드 스웜 / 사격형 적 / 하이브 퀸 / 이펙트
// world = { bal, input, squad, bullets, enemyBullets, entities, effects, addCoins,
//           spawnEntity, spawnEnemyBullet, scrollSpeed, logicalW, logicalH, rng, phase }
import { BAL } from './balance.js';
import { applyGate, hitCrystal, chargeStageFor, dronesToCruisers, canUpgradeFlagship, cruisersNeededForTier, bankUpgrade, bankDemote, invertGateOp } from './logic.js';
import { circleHit } from './collision.js';
import { COLORS, WEAPON_COLORS, WEAPON_LABELS, glow, makeSprite, blit, drawGateBox } from './render.js';
import { shipSprite, shipBaseSprite, drawFlames, drawDeckLights, drawCommandFrame, drawHullFrame, drawWeaponRig, drawUpgradeSequence, weaponProjectileSpriteId, SHIP_DEFS, cruiserBlitScale, droneBlitScale } from './ships.js';
import { getSprite, bossDefFor, bossDefById } from './sprites.js';
import { affixAbsorb, affixOnDeath, affixContactMult, affixShotHoming, affixDraw } from './affixes.js';
import { canEvolveWeapon, evolutionStage, superEvoEffects, evoLevelMult, weaponProjectileColor } from './weapon-evolutions.js';
import { doctrineEffects, phaseDamageMult } from './doctrines.js';
import { droneReward } from './adaptive-logic.js';
import { addFlow, updateFlow, onFlowHit } from './flow.js';
import { keystoneEffects, forgeOnKill } from './keystones.js';
import { frameDamageMult, frameInvulnActive } from './command-frames.js';
import { resolveHit, canEmergencyRebuild, doEmergencyRebuild, repair as survRepair, hullFrac } from './survivability.js';
import { sfx } from './audio.js';
import { UPGRADE_DURATIONS, upgradeGrade } from './creative-direction.js';

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
    ring(x, y, color, delay = 0, maxR = 150) {
      rings.push({ x, y, r: Math.min(20, maxR), life: 0.45 + delay, max: 0.45, color, delay, maxR });
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
        const cap = r.maxR ?? 150;
        r.r = Math.min(cap, r.r + (cap - r.r) * Math.min(1, 6 * dt) + 120 * dt);   // maxR까지만 확장
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
        ctx.font = `bold ${t.size || 20}px Pretendard, sans-serif`;
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
    this.previousFrameWeapon = null;
    this.frameBlend = 1;
    this.weaponLv = 1;
    this.shield = false;
    this.evolvePunch = 0;
    this.upgradeFx = { t: 0, max: 0, grade: 0, kind: '', color: COLORS.reward };
    this.dead = false;
    this.charge = 0;          // 차지 랜스 누적 충전(초)
    this.chargeStage = 0;     // 현재 충전 단계
    this.wasCharging = false;
    this.invulnT = 0;         // 진화 무적 잔여 시간(A3)
    this.escorts = 0;         // (구 호위기 — 미사용)
    this.cruisers = 0;        // 순양함 수 (드론 130기 합체)
    this.cruiserHp = [];      // 순양함별 체력 (피탄 → 감소, 0이면 격침). 길이는 cruisers에 동기화
    this.cruiserFlash = [];   // 순양함별 피격 플래시 타이머
    this.banked = 0;          // 기함에 은행된 화력 (업그레이드 때 흡수한 순양함 화력 누적)
    this.bankStack = [];      // 업그레이드별 은행 증가분 (강등 시 정확히 롤백 → 반복 적립 방지)
    // ── NEON ADAPTATION Phase 1: 원정 내부 상태 (중립 시작, 저장 안 함) ──
    this.weaponEvolutions = { vulcan: null, laser: null, homing: null }; // 무기별 1단계 진화 id
    this.weaponEvolutions2 = { vulcan: null, laser: null, homing: null }; // 무기별 2단계 초진화 id
    this.evoLevels = { vulcan: 0, laser: 0, homing: 0 };                  // 진화 강화 레벨 1→3 (0=미진화)
    this.superLevels = { vulcan: 0, laser: 0, homing: 0 };                // 초진화 강화 레벨 1→3
    this.pendingWeaponEvolution = null;   // 진화 선택 대기 무기 ('vulcan'|'laser'|'homing')
    this.pendingEvoStage = null;          // 대기 중 선택 단계 ('pick1' | 'pick2' | 're')
    this.doctrine = null;                 // 'swarm'|'lance'|'phase'
    this.pendingDoctrine = false;         // 교리 선택 대기
    this.supportAcc = 0;      // 호위함 사격 누적기
    // ── NEON ADAPTATION Phase 2: FLOW/RUSH 원정 내부 상태 (저장 안 함) ──
    this.flow = 0;            // 근접 회피 게이지 0~max
    this.rushT = 0;           // NEON RUSH 잔여 시간(초)
    this.grazeCombo = 0;      // 연속 근접 회피 콤보
    this.sinceGraze = Infinity; // 마지막 graze 후 경과(감소 지연 판정)
    this.grazeFxT = 0;        // GRAZE 문구·SFX 스팸 제한 타이머
    this.keystone = null;     // 선택한 키스톤 id (원정당 1개, C3)
    this.keystoneState = {};  // 키스톤 누적 상태 (킬 카운터 등, C3)
    // ── Gate 1: 무기 wing 슬롯(§5.3). main은 기존 weapon/weaponLv, wing은 병렬 발사. ──
    this.wing = { weaponId: null, level: 1 }; // 두 번째 무기 슬롯(빈 상태 시작). 진화 상태는 무기별 맵 공유.
    this._wingAcc = 0;        // wing 슬롯 독립 발사 누적기
    // ── Gate 1: 지휘 프레임·기함 내구도·공명은 원정 시작 시 install()에서 주입(외부 모듈 상태). ──
    this.frameId = null;      // 'assault'|'carrier'|'phase'
    this.frameState = null;   // command-frames 상태 (install 시 생성)
    this.surv = null;         // survivability 상태 (install 시 생성 — 없으면 구 드론=체력 모델)
    this.reson = null;        // resonances 상태 (install 시 생성)
    this._offsets = Squad.formationOffsets(BAL.squad.drawCap);
  }

  // ── FLOW 상태 헬퍼: 순수 로직(flow.js)과 Squad 필드를 잇는다 ──
  _flowState() { return { flow: this.flow, rushT: this.rushT, combo: this.grazeCombo, sinceGraze: this.sinceGraze }; }
  _applyFlowState(s) { this.flow = s.flow; this.rushT = s.rushT; this.grazeCombo = s.combo; this.sinceGraze = s.sinceGraze; }
  get inRush() { return this.rushT > 0; }
  // NEON RUSH 전투 배수 (중복 없이 각 경로에서 한 번씩만 적용)
  get rushDmgMult() { return this.rushT > 0 ? BAL.flow.rushDamageMult : 1; }
  get rushChargeMult() { return this.rushT > 0 ? BAL.flow.rushChargeSpeedMult : 1; }
  get rushMoveMult() { return this.rushT > 0 ? BAL.flow.rushMoveResponseMult : 1; }

  /** 실제 전투 피격 시 FLOW/RUSH 규칙 (적탄·접촉 등 실제 손실이 있을 때만 호출). */
  onCombatHit(world) {
    const wasRush = this.rushT > 0;
    if (this.keystone === 'phase_afterimage') {
      // 위상 잔상 대가: 피격 시 FLOW·RUSH를 전부 잃음
      this.flow = 0; this.rushT = 0; this.grazeCombo = 0;
      if (wasRush) world.effects.text(this.x, this.y - 40, '폭주 중단!', COLORS.danger, 13);
      return;
    }
    const s = onFlowHit(this._flowState(), BAL.flow);
    this._applyFlowState(s);
    if (wasRush && s.rushEnded) world.effects.text(this.x, this.y - 40, '폭주 중단!', COLORS.danger, 13);
  }

  // ── 키스톤 전투 훅 (원정당 1개, keystoneState에 누적) ──
  _ksState() { if (!this.keystoneState) this.keystoneState = { kills: 0, forgeT: 0, grazeCount: 0, pendingEchoes: [] }; return this.keystoneState; }

  /** 위상 파동: 반경 내 적탄을 거리순 최대 8발 제거. 없어도 연출은 표시. */
  _phaseWave(world) {
    const P = BAL.keystone.phaseAfterimage;
    const near = (world.enemyBullets || [])
      .filter((b) => !b.dead && Math.hypot(b.x - this.x, b.y - this.y) <= P.radius)
      .sort((a, b) => Math.hypot(a.x - this.x, a.y - this.y) - Math.hypot(b.x - this.x, b.y - this.y));
    for (let i = 0; i < Math.min(P.maxClear, near.length); i++) near[i].dead = true;
    world.effects.ring(this.x, this.y, '#b44cff');
    world.effects.burst(this.x, this.y, '#b44cff', 8, 120);
  }

  /** 실제 적 처치 시: 집중 게이지(처치 콤보) 충전 + 키스톤 효과. */
  onEnemyKill(world, e) {
    if (!e || !e.isEnemy) return;   // 크리스탈·수송선·장애물 제외
    // 집중 게이지: 처치할수록 차고 100에서 폭주 자동 발동 (구 '근접 회피' 대체)
    if (this.invulnT <= 0 && !this.dead) {
      const s = addFlow(this._flowState(), BAL.flow, BAL.flow.gainPerKill);
      this._applyFlowState(s);
      if (s.rushStarted) this._startRushFx(world);
    }
    // 키스톤별 처치 효과
    if (this.keystone === 'swarm_forge') {
      const ks = this._ksState();
      const r = forgeOnKill(ks, BAL.keystone.swarmForge);
      ks.kills = r.kills; ks.forgeT = r.forgeT;
      if (r.procced) {
        world.effects.text(this.x, this.y - 54, '유령 순양함 소환!', COLORS.ally, 13);
        world.effects.halo(this.x, this.y, '#57e0ff');
      }
    } else if (this.keystone === 'phase_afterimage') {
      const ks = this._ksState();
      ks.phaseKills = (ks.phaseKills || 0) + 1;   // 위상 잔상: 적 N기 처치마다 충격파
      if (ks.phaseKills % BAL.keystone.phaseAfterimage.killsPerProc === 0) this._phaseWave(world);
    }
  }

  /** 3단+ 원본 랜스 후 공명 랜스 예약 (원본 1회당 1회, 재귀 없음, 최대 maxPending). */
  scheduleLanceEcho(world, { x, halfW, dmg, pierceDefense, stage }) {
    if (this.keystone !== 'lance_echo') return;
    const K = BAL.keystone.lanceEcho;
    if (stage < K.minStage) return;
    const ks = this._ksState();
    if ((ks.pendingEchoes || (ks.pendingEchoes = [])).length >= K.maxPending) return;
    ks.pendingEchoes.push({ t: K.delay, x, halfW: halfW * K.widthFrac, dmg: dmg * K.dmgFrac, pierceDefense, stage });
  }

  /** 예약된 공명 랜스 타이머 진행 + 발사 (update에서 호출). */
  _updateEchoes(dt, world) {
    const ks = this.keystoneState;
    if (!ks || !ks.pendingEchoes || !ks.pendingEchoes.length) return;
    for (const echo of ks.pendingEchoes) echo.t -= dt;
    const ready = ks.pendingEchoes.filter((e) => e.t <= 0);
    ks.pendingEchoes = ks.pendingEchoes.filter((e) => e.t > 0);
    for (const echo of ready) this._fireEcho(world, echo);
  }

  /** 공명 랜스 실발사: 같은 세로 컬럼 관통(피해·폭 축소). 적탄은 제거하지 않음. echo:true(STAGGER 없음). */
  _fireEcho(world, echo) {
    const ctx = { lance: true, pierceDefense: echo.pierceDefense, echo: true };
    for (const e of world.entities) {
      if (e.dead || !e.hitByBullet) continue;
      if (e.y < this.y && Math.abs(e.x - echo.x) <= echo.halfW + (e.r || 0)) {
        e.hitByBullet(echo.dmg, world, ctx);
        if (e.dead) world.notifyEnemyKilled?.(e);   // 메아리 랜스 처치도 킬 이벤트 집계
      }
    }
    if (world.bosses) for (const bo of world.bosses) {
      if (!bo.dead && Math.abs(bo.x - echo.x) <= echo.halfW + bo.r) bo.hitByBullet(echo.dmg * (world.mfx?.bossDmgMult ?? 1), world, ctx);
    }
    world.spawnEntity(new ChargeLance(echo.x, this.y, echo.halfW, echo.stage));
    world.effects.ring(echo.x, this.y, '#ffd93d');
  }

  /** NEON RUSH 발동 연출 (배수 적용은 fire 경로에서, C2). */
  _startRushFx(world) {
    world.effects.text(this.x, this.y - 70, '폭주 발동!', COLORS.reward, 20);
    world.effects.ring(this.x, this.y, '#57e0ff');
    world.effects.ring(this.x, this.y, '#ff4cd2');
    world.effects.halo(this.x, this.y, COLORS.reward);
    world.effects.flash(0.22);   // 화면 플래시 0.25 이하 제한
    sfx('evolve');
  }

  // 순양함 호위 대형 (단위 u 배수, +x=우 +y=후). 안쪽 쌍부터 채워 전방 스크린 → 측방 → 후방 예비.
  static get FORMATION() {
    return [
      [-1.6, -1.4], [1.6, -1.4],   // 전방 좌/우 (선봉 스크린)
      [-3.0, -0.5], [3.0, -0.5],   // 전측방 좌/우
      [-2.4,  0.9], [2.4,  0.9],   // 측방 좌/우
      [-1.0, -2.4], [1.0, -2.4],   // 최전방 첨병
      [-4.0,  0.4], [4.0,  0.4],   // 원측방(넓게 감쌈)
      [-1.2,  2.1], [1.2,  2.1],   // 후방 예비 좌/우
    ];
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
    // 피격 핵은 함체 시각 폭과 독립이다(Phase B §6.1). 함체는 34→140px로 커지지만 핵은 11→16px만.
    // 큰 날개·포대 끝은 위엄을 만들되 판정에 포함하지 않는다. 위상 기동 교리는 더 줄인다(하한 존중).
    const base = SHIP_DEFS[this.tier].hitCoreRadius;
    const E = doctrineEffects(this.doctrine, BAL.doctrine);
    return Math.max(E.hitRadiusMin || 0, base + E.hitRadiusDelta);
  }

  /**
   * 피격 핵 표시 (Phase B §6.1). 함체는 34→140px로 커지지만 실제 판정은 11→16px뿐이라,
   * "어디가 맞는 곳인지"를 항상 보여줘야 큰 함체가 회피를 방해한다고 느끼지 않는다.
   * 흰 코어 + 금빛 링. 좌표계는 기함 로컬(호출부에서 translate 완료).
   */
  drawHitCore(ctx) {
    const r = this.hitRadius;
    const pulse = 0.72 + 0.28 * Math.sin(this.t * 4);
    ctx.save();
    // 금빛 판정 링 — 정확한 피격 반경
    ctx.strokeStyle = `rgba(255,214,92,${0.5 + 0.3 * pulse})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
    // 흰 중앙 코어 — 큰 함체 위에서도 눈이 즉시 잡는 기준점
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 0.62);
    g.addColorStop(0, `rgba(255,255,255,${0.92 * pulse})`);
    g.addColorStop(0.55, 'rgba(255,240,190,0.5)');
    g.addColorStop(1, 'rgba(255,214,92,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** 전투 수치와 무관한 조립 연출만 시작한다. */
  triggerUpgradeFx(world, kind = 'weapon', level = 1) {
    const grade = upgradeGrade(kind, level);
    const max = UPGRADE_DURATIONS[grade];
    this.upgradeFx = { t: max, max, grade, kind, color: WEAPON_COLORS[this.weapon] || COLORS.reward };
    this.evolvePunch = Math.max(this.evolvePunch, grade >= 4 ? 0.5 : 0.22);
    if (grade >= 3) world?.effects?.ring?.(this.x, this.y, this.upgradeFx.color, 0, 80 + grade * 14);
    if (grade >= 4) world?.effects?.halo?.(this.x, this.y, COLORS.reward);
    if (grade >= 5) world?.effects?.flash?.(0.34);
  }

  setWeapon(weapon, world) {
    if (this.weapon === weapon) {
      this.advanceWeapon(world);   // 같은 색 캡슐: 진행 사다리 한 칸 (베이스Lv→진화선택→진화Lv→초진화선택→초진화Lv→재선택)
    } else {
      this.previousFrameWeapon = this.weapon;
      this.frameBlend = 0;
      // 다른 색 캡슐 = 무기 교체. 강화 레벨은 유지(라이덴식). 단, 진화 단계였으면 새 무기는 진화 1단계부터.
      const wasEvolved = !!this.weaponEvolutions[this.weapon];
      this.weapon = weapon;
      if (wasEvolved) {
        this.weaponLv = BAL.weapons.maxLv;   // 진화 단계 → 새 무기는 베이스 MAX(=진화 직전)로
        world.effects.text(this.x, this.y - 64, `무기 교체: ${WEAPON_LABELS[weapon]} · 진화 가능!`, WEAPON_COLORS[weapon]);
        if (!this.weaponEvolutions[weapon] && !this.pendingWeaponEvolution) {
          this.pendingWeaponEvolution = weapon; this.pendingEvoStage = 'pick1';   // 새 무기 진화 1단계 선택창
        }
      } else {
        world.effects.text(this.x, this.y - 64, `무기 교체: ${WEAPON_LABELS[weapon]} · Lv${this.weaponLv} 유지`, WEAPON_COLORS[weapon]);
      }
      this.triggerUpgradeFx(world, 'switch');
    }
    world.effects.burst(this.x, this.y - 20, WEAPON_COLORS[this.weapon], 14, 140);
    sfx('pickup');
  }

  /** 진행 사다리 한 칸 (같은 색 캡슐·레벨업 게이트 공용). */
  advanceWeapon(world) {
    const w = this.weapon;
    if (this.weaponLv < BAL.weapons.maxLv) {
      this.weaponLv++;
      world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[w]} Lv${this.weaponLv} 강화!`, WEAPON_COLORS[w]);
      this.triggerUpgradeFx(world, 'weapon', this.weaponLv);
      return;
    }
    if (this.pendingWeaponEvolution) return;   // 이미 선택 대기 중
    // 진화 사다리(maxLv 도달 후)는 evolveAdvanceCost회 모아야 한 칸 → 진화 속도 완화(사용자 요청)
    const cost = BAL.weapons.evolveAdvanceCost || 1;
    this._evoProg = (this._evoProg || 0) + 1;
    if (this._evoProg < cost) {
      world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[w]} 진화 강화 축적 ${this._evoProg}/${cost}`, COLORS.reward, 14);
      return;
    }
    this._evoProg = 0;
    const st = evolutionStage(w, this.weaponLv, BAL.weapons.maxLv, this.weaponEvolutions, this.evoLevels, this.weaponEvolutions2, this.superLevels);
    if (st === 'evoUp') {
      this.evoLevels[w] = (this.evoLevels[w] || 1) + 1;
      world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[w]} 진화 Lv${this.evoLevels[w]} 강화!`, COLORS.reward);
      world.effects.burst(this.x, this.y - 20, COLORS.reward, 10, 160);
      this.triggerUpgradeFx(world, 'evolution');
    } else if (st === 'superUp') {
      this.superLevels[w] = (this.superLevels[w] || 1) + 1;
      world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[w]} 초진화 Lv${this.superLevels[w]} 강화!`, COLORS.reward);
      world.effects.burst(this.x, this.y - 20, COLORS.reward, 10, 160);
      this.triggerUpgradeFx(world, 'super');
    } else if (st === 'pick1' || st === 'pick2' || st === 're') {
      this.pendingWeaponEvolution = w;
      this.pendingEvoStage = st;
      const label = st === 'pick1' ? '진화 가능!' : st === 'pick2' ? '초진화 가능!' : '진화 재선택!';
      world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[w]} ${label}`, COLORS.reward);
    } else {
      world.effects.text(this.x, this.y - 64, `${WEAPON_LABELS[w]} MAX`, WEAPON_COLORS[w]);
    }
  }

  levelUp(world) {
    this.advanceWeapon(world);   // 레벨업 게이트도 진화 사다리 사용 (Lv MAX면 진화/초진화/강화로 이어짐)
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
  /** 보상 드론 획득 배수 (군체 교리 + 순양함 존재 시 +10%) */
  get rewardGainMult() {
    return (this.doctrine === 'swarm' && (this.cruisers || 0) > 0) ? 1 + BAL.doctrine.swarm.droneGainBonus : 1;
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
      world.effects.text(this.x, this.y - 44, `순양함 +${m.merged}척`, COLORS.ally, 14);
      sfx('pickup');
    }
    // 2) 순양함이 임계치 이상이면 기함 1단계 업그레이드 (여기서만 선택창=모듈 드래프트가 뜬다)
    const need = Math.max(1, Math.round(cruisersNeededForTier(this.tier, E) * (mfx.evolveCostMult ?? 1)));  // 등급별 비용 + 신속 진화 모듈
    // 캠페인(Gate 2)에선 함체 등급을 디렉터 스케줄(H1~H5)만 올린다 — 드론 진화가 예정보다 일찍 등급 기능을 해금하지 않게(Codex 홀리스틱).
    if (!world.noFlagshipEvolve && canUpgradeFlagship(this.cruisers || 0, this.tier, maxTier, { cruisersPerFlagship: need })) {
      // 흡수한 순양함 화력을 기함에 은행(+보너스) → 업그레이드가 항상 순 이득 (화력 손실 버그 해결)
      const gain = Math.round(need * E.cruiserPower * (E.upgradeBonus ?? 1.2));
      this.cruisers -= need;
      ({ banked: this.banked, stack: this.bankStack } = bankUpgrade(this.banked || 0, this.bankStack, gain));  // 은행 적립(+롤백 스택)
      this.tier += 1;
      world.onFlagshipTierUp?.(this);   // 내구도 모델(surv)이 설치된 모드는 함체 등급 상승 + 내구도 완충 (섹터, 이사)
      this.triggerUpgradeFx(world, 'flagship');
      if (this.tier === 1 && !this.doctrine && !this.pendingDoctrine) this.pendingDoctrine = true;  // 첫 업그레이드(0→1) → 교리 선택
      this.shield = true;                        // 업그레이드 직후 사고사 방지
      this.invulnT = BAL.squad.evolveInvuln;     // 업그레이드 무적 (A3)
      this.evolvePunch = 0.5;
      // (선택창 제거: 기함 업그레이드는 자동. 모듈 드래프트는 정비 노드에서만 뜬다)
      world.effects.halo(this.x, this.y, COLORS.reward);
      world.effects.burst(this.x, this.y, COLORS.ally, 24, 260);
      world.effects.text(this.x, this.y - 98, `기함 등급 상승: ${ev.names[this.tier]} · 화력 +${gain}`, COLORS.reward, 18);
      world.effects.text(this.x, this.y - 76, `기함 특성 획득: 『${BAL.shipTraits[Math.min(this.tier, BAL.shipTraits.length - 1)].tag}』`, COLORS.ally, 14);
      sfx('evolve');
    }
    // 3) 최종 상태(타이탄 + 순양함 만석)에서 넘치는 드론은 체력이 아니라 포인트(코인)로 전환
    if (this.tier >= maxTier && (this.cruisers || 0) >= E.maxCruisers && this.count > E.dronePointCap) {
      const excess = this.count - E.dronePointCap;
      this.count = E.dronePointCap;
      const coins = Math.floor(excess * E.coinPerExcessDrone);
      if (coins > 0 && world.addCoins) {
        world.addCoins(coins);
        world.effects.text(this.x, this.y - 44, `초과 드론 ${excess}기 → 점수 +${coins}`, COLORS.reward, 14);
      }
    }
  }

  applyDelta(n, world, label) {
    this.count = Math.max(0, this.count + n);
    // 전멸 판정 = '실제 손실(n<0)로 드론이 0이 됐는가'. 두 가지를 동시에 만족해야 한다:
    //  (A) 성장 소모는 전멸이 아니다 — checkEvolution이 드론 130기를 순양함 1척으로 합체시키면
    //      잔여가 0이 되는데, 이걸 전멸로 보면 승급 직후 등급이 거꾸로 강등된다(인터셉터 → 스카웃).
    //      → 판정을 checkEvolution '이전'에, 그리고 n<0일 때만 한다.
    //  (B) 합체로 이미 0인 상태에서 피해를 받으면 반드시 발동해야 한다 — 이전 구현의 `before > 0`
    //      가드는 count가 이미 0이면 영영 참이 될 수 없어 사실상 무적이 됐다(회귀).
    //      → 직전 값이 아니라 '이번 델타의 부호'로 판정한다.
    const depletedByLoss = n < 0 && this.count === 0;
    if (n > 0) world.effects.text(this.x, this.y - 40, `+${n}`, COLORS.ally);
    else if (n < 0) {
      world.effects.text(this.x, this.y - 40, `${n}`, COLORS.danger);
      this.flash = 0.25;
    }
    if (label) world.effects.text(this.x, this.y - 64, label, COLORS.reward);
    if (depletedByLoss) { this.onDronesDepleted(world); return; }   // 피해로 전멸 → 안전망 1회
    this.checkEvolution(world);
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
      world.effects.text(this.x, this.y - 40, '보호막 방어!', COLORS.gateGood);
      world.effects.ring(this.x, this.y, COLORS.gateGood);
      sfx('shield_pop');
      return;
    }
    // Gate 1: 기함 내구도 모델이 설치돼 있으면 충돌은 드론이 아니라 내구도를 지불(§5.6).
    if (this.surv) { this.takeShot(world, { hullAmount: BAL.gate1.survivability.dmgCollision, onCruiserIndex: null }); sfx('damage'); return; }
    const cap = Math.max(2, Math.ceil(this.count * BAL.squad.contactCapPct * (world.mfx?.contactCapMult ?? 1)));
    this.applyDelta(-Math.min(n, cap), world);
    this.onCombatHit(world);   // 실제 접촉 손실 → FLOW/RUSH 규칙 (Phase 2)
    sfx('damage');
  }

  /** Gate 1 원정 시스템 주입(§11 모듈 분리). main.js가 상태 객체를 만들어 넘긴다. */
  installGate1({ surv = null, reson = null, frameState = null, frameId = null, mainWeapon = 'vulcan' } = {}) {
    this.surv = surv;
    this.reson = reson;
    this.frameState = frameState;
    this.frameId = frameId;
    this.weapon = mainWeapon;
    this.wing = { weaponId: null, level: 1 };
    this._wingAcc = 0;
  }

  /**
   * 기함 피격 해석(§5.6). 내구도 모델이 설치된 Gate 1 모드에선 보호막→순양함→기함 내구도 순.
   * 구 모델(surv 없음)에선 기존 드론=체력 경로를 그대로 쓴다(캠페인 호환).
   *  legacyDmg   = 구 모델용 드론/순양함 피해량(count 비례)
   *  hullAmount  = Gate 1 모델용 내구도 피해량(적탄 종류별 고정, 없으면 dmgNormalShot)
   *  onCruiserIndex = 순양함 히트박스 인덱스(없으면 null)
   */
  takeShot(world, { legacyDmg = 0, hullAmount = null, onCruiserIndex = null, elite = false } = {}) {
    if (this.invulnT > 0 || frameInvulnActive(this.frameState)) return;   // 무적(진화·위상돌파)
    if (!this.surv) {
      // 구 모델: 핵 피격=드론 손실, 순양함 히트박스=순양함 HP.
      if (onCruiserIndex != null && onCruiserIndex >= 0) this.hitCruiser(onCruiserIndex, legacyDmg, world);
      else { this.applyDelta(-legacyDmg, world); this.onCombatHit(world); }
      return;
    }
    const S = BAL.gate1.survivability;
    const base = hullAmount != null ? hullAmount : (elite ? S.dmgEliteShot : S.dmgNormalShot);
    // 초반 유예(_hullDmgMult)는 '기함 내구도'에만 적용한다. 보호막·순양함 HP는 원피해(base) 그대로(Codex P2).
    const hullAmt = Math.round(base * (this._hullDmgMult ?? 1));
    const out = resolveHit(this.surv, { amount: hullAmt, onCruiserIndex: (onCruiserIndex != null && onCruiserIndex >= 0) ? onCruiserIndex : null });
    if (out.absorbedBy === 'shield') {
      world.effects.text(this.x, this.y - 40, '보호막 방어!', COLORS.gateGood);
      world.effects.ring(this.x, this.y, COLORS.gateGood); sfx('shield_pop');
      return;
    }
    if (out.absorbedBy === 'cruiser') { this.hitCruiser(out.index, base, world); return; }   // 순양함은 원피해
    // 기함 핵 피격 → 내구도 감소(드론은 그대로) + 짧은 무적(밀집 피격 순삭 방지).
    this.flash = 0.25;
    this.invulnT = Math.max(this.invulnT, BAL.gate1.survivability.hitInvuln ?? 0.5);
    world.effects.text(this.x, this.y - 40, `-${hullAmt}`, COLORS.danger);
    world.effects.ring(this.x, this.y, COLORS.danger);
    world.metrics?.hullDamage(hullAmt);
    this.onCombatHit(world);
    if (out.dead) {
      if (this.maybeEmergencyRebuild(world, true)) return;   // 격침 직전 긴급 재건(death-save) 성공 → 생존
      this.dead = true; world.onHullDepleted?.(this); return;
    }
    this.maybeEmergencyRebuild(world);   // 내구도 위급(30% 미만) 시 사전 긴급 재건(§5.6, G1-04)
  }

  /**
   * 긴급 재건(§5.6, G1-04): 출격당 1회. 두 계기 —
   *  사전(fromDeath=false): 내구도가 위급(최대치의 emergencyRebuildAtFrac 미만)해지는 순간. 비용=내구도 소량 지불.
   *  격침직전(fromDeath=true): 치명타로 내구도 0에 닿는 순간의 death-save. 임계·비용 없이 구조 수리로 되살린다.
   *  효과=순양함 복구(피탄 흡수) + 제한 수리(구조) + 짧은 무적·보호막. 실제 로그 기록. 반환: 발동했으면 true.
   */
  maybeEmergencyRebuild(world, fromDeath = false) {
    if (!this.surv) return false;
    const cfg = BAL.gate1.survivability;
    if (this.surv.emergencyUsed >= (cfg.emergencyRebuildMax ?? 1)) return false;   // 출격당 1회
    if (fromDeath) {
      this.surv.emergencyUsed += 1;                   // 격침 직전: 임계·비용 우회, 구조 수리로 0에서 복귀
    } else {
      if (hullFrac(this.surv) >= (cfg.emergencyRebuildAtFrac ?? 0.3) || !canEmergencyRebuild(this.surv, cfg)) return false;
      if (!doEmergencyRebuild(this.surv, cfg).ok) return false;   // emergencyUsed++, 내구도 비용 지불
    }
    const addC = cfg.emergencyRebuildCruisers ?? 1;
    this.cruisers = Math.min(BAL.escort.maxCruisers, (this.cruisers || 0) + addC);
    this._syncCruiserHp();
    survRepair(this.surv, cfg);                        // 구조 수리(제한)
    if (this.surv.hull <= 0) this.surv.hull = Math.max(1, Math.round(this.surv.hullMax * (cfg.repairFrac ?? 0.25)));  // death-save: 최소 생존 보장
    this.shield = true;
    this.invulnT = Math.max(this.invulnT, 1.0);
    world.metrics?.emergencyRebuild();
    world.metrics?.hullRepair();
    world.effects.halo(this.x, this.y, COLORS.reward);
    world.effects.burst(this.x, this.y, COLORS.reward, 22, 240);
    world.effects.text(this.x, this.y - 56, `긴급 재건! 순양함 +${addC} · 구조 수리`, COLORS.reward, 16);
    sfx('evolve');
    return true;
  }

  update(dt, world) {
    this.t += dt;
    const target = world.input.targetX;
    this.prevX = this.x;
    this.x += (target - this.x) * Math.min(1, BAL.squad.followSpeed * this.rushMoveMult * (this.moveResponseMult || 1) * dt);  // RUSH·함체 등급(§7.3): 이동 반응 ↑
    const m = BAL.squad.laneMargin + this.width * 0.4;
    this.x = Math.max(m, Math.min(world.logicalW - m, this.x));

    // 뱅킹: 이동 속도 → 기울임 (스무딩)
    const vx = dt > 0 ? (this.x - this.prevX) / dt : 0;
    const bankTarget = Math.max(-1, Math.min(1, vx / 600));
    this.bank += (bankTarget - this.bank) * Math.min(1, 10 * dt);

    if (this.powerT > 0) this.powerT -= dt;
    if (this.invulnT > 0) this.invulnT -= dt;   // 진화 무적 감쇠 (A3)
    if (this.flash > 0) this.flash -= dt;
    if (this.grazeFxT > 0) this.grazeFxT -= dt;
    for (let i = 0; i < this.cruiserFlash.length; i++) if (this.cruiserFlash[i] > 0) this.cruiserFlash[i] -= dt;  // 순양함 피격 플래시
    // FLOW 감소 + RUSH 타이머 (근접 회피 시스템, Phase 2)
    {
      const fs = updateFlow(this._flowState(), dt, BAL.flow);
      this._applyFlowState(fs);
      if (fs.rushEnded) world.effects.text(this.x, this.y - 50, '폭주 종료', COLORS.ally, 13);
    }
    // 키스톤 타이머: 유령 순양함(군체 용광로) 감소 + 예약 메아리(공명 랜스) 발사
    if (this.keystoneState) {
      if (this.keystoneState.forgeT > 0) this.keystoneState.forgeT = Math.max(0, this.keystoneState.forgeT - dt);
      this._updateEchoes(dt, world);
    }
    if (this.evolvePunch > 0) this.evolvePunch -= dt;
    if (this.upgradeFx.t > 0) this.upgradeFx.t = Math.max(0, this.upgradeFx.t - dt);
    if (this.frameBlend < 1) {
      this.frameBlend = Math.min(1, this.frameBlend + dt / 0.18);
      if (this.frameBlend >= 1) this.previousFrameWeapon = null;
    }
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
    const chargeSpeedMul = doctrineEffects(this.doctrine, BAL.doctrine).chargeSpeedMult;  // 랜스 강습: 충전 속도↑
    if (charging) {
      this.charge += dt * (world.mfx?.chargeSpeed || 1) * chargeSpeedMul * this.rushChargeMult;   // RUSH: 충전 속도 ↑
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
    const chgDmgMul = doctrineEffects(this.doctrine, BAL.doctrine).chargeDmgMult;  // 랜스 강습: 차지 피해↑
    const dmg = this.power * ch.blastCoef * stageMult * fireRate * damage * lvCoef * wCoef * (mfx.chargeMult ?? 1) * chgDmgMul;
    // 랜스 문맥: 랜스 강습 교리 + 3단 이상이면 방어막 관통(프리즘·패러사이트), 아니면 일반 정면 취급
    // stage·echo·attackId = B22 STAGGER 판정(3단+ 원본만 +2, 메아리·중복 제외)
    const lanceCtx = { lance: true, pierceDefense: doctrineEffects(this.doctrine, BAL.doctrine).lancePierceDefense && stage >= 3, stage, echo: false, attackId: (this._lanceId = (this._lanceId || 0) + 1) };
    for (const e of world.entities) {       // 앞쪽 컬럼의 적 전부 관통
      if (e.dead || !e.hitByBullet) continue;
      if (e.y < this.y && Math.abs(e.x - this.x) <= halfW + (e.r || 0)) {
        e.hitByBullet(dmg, world, lanceCtx);
        if (e.dead) world.notifyEnemyKilled?.(e);   // 차지 랜스 처치도 킬 이벤트 집계
      }
    }
    if (world.bosses) for (const bo of world.bosses) {   // 랜스 컬럼 안의 모든 보스 타격
      if (!bo.dead && Math.abs(bo.x - this.x) <= halfW + bo.r) bo.hitByBullet(dmg * (mfx.bossDmgMult ?? 1), world, lanceCtx);
    }
    // 경로 적탄 소멸은 3단계 이상에서만 (1·2단계는 적탄 못 지움)
    if (stage >= 3) for (const b of world.enemyBullets) if (Math.abs(b.x - this.x) <= halfW + 18) b.dead = true;
    world.spawnEntity(new ChargeLance(this.x, this.y, halfW, stage));
    world.effects.flash(0.3 + 0.12 * stage);
    world.effects.ring(this.x, this.y, COLORS.ally);
    world.effects.burst(this.x, this.y, COLORS.ally, 18 + stage * 8, 320);
    this.recoil = 3 + stage;
    sfx('lance_fire');
    // 공명 랜스 키스톤: 3단+ 원본 1회당 메아리 1회 예약 (원본 최종 피해·폭 기준, pierceDefense 계승)
    this.scheduleLanceEcho(world, { x: this.x, halfW, dmg, pierceDefense: lanceCtx.pierceDefense, stage });
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
    const WEB = BAL.weaponEvolution;
    const evoMult = evoLevelMult(this.weaponEvolutions[this.weapon], this.evoLevels[this.weapon], WEB.evoLevelStep);   // 진화 레벨(1→3) 피해 배수
    const se = superEvoEffects(this.weaponEvolutions2[this.weapon], BAL.weaponSuperEvolution);   // 2단계 초진화 배수 (미선택이면 중립)
    const projColor = weaponProjectileColor(evo, this.weaponEvolutions2[this.weapon], WEAPON_COLORS[this.weapon]);   // 진화별 발사체 색 (초진화>진화>기본)
    const projArt = weaponProjectileSpriteId(this.weapon, evo);
    const superLv = this.superLevels[this.weapon] || 0;
    const seDmg = se.dmgMult * (1 + Math.max(0, superLv - 1) * WEB.superLevelStep);   // 초진화 레벨(1→3) 추가 배수
    const pb = (mfx.pierceBonus || 0) + se.pierceBonus;
    const rush = this.rushDmgMult;   // NEON RUSH: 사격 피해 배수 (기함·호위·순양함에 한 번씩만 — 파생탄은 원본 비율이라 이중 없음)
    const ks = keystoneEffects(this.keystone, this.keystoneState);   // 키스톤 배수 (미선택이면 전부 1)
    const rushAuto = rush * ks.autoMult;   // 공명 랜스 대가: 자동사격 전체 배수를 baseDps·support에 함께 접음
    const baseDps = this.flagPower * fireRate * damage * lvCoef * powerMult * rushAuto * evoMult * seDmg;   // 진화·초진화 레벨 피해 배수
    const dEff = doctrineEffects(this.doctrine, BAL.doctrine);   // 기함 교리 효과 (중립이면 전부 1/0)
    // 니들 개틀링: 치명 확률 가산 / 위상 기동: 이동 뱅크에 비례한 피해 보너스(모든 탄에 적용)
    const needle = evo === 'vulcan_needle' ? WE.vulcan_needle : null;
    const critP = (mfx.crit || 0) + (needle ? needle.critBonus : 0);
    const phaseMul = phaseDamageMult(Math.abs(this.bank || 0), dEff.bankDmgMax);
    const crit = (d) => (critP && Math.random() < critP ? d * (mfx.critMult || 2) : d) * phaseMul;
    // 호위함(순양함) 사격 — 군체 교리 배수 + 군체 용광로 유령 순양함(활성 중 실제 사격까지)
    const ghost = (this.keystone === 'swarm_forge' && (this.keystoneState?.forgeT || 0) > 0) ? BAL.keystone.swarmForge.ghostCruisers : 0;
    const supportDps = (this.supportPower + ghost * BAL.escort.cruiserPower) * dEff.supportMult * fireRate * damage * lvCoef * powerMult * rushAuto * ks.supportMult;
    this.fireSupport(dt, world, supportDps, crit, ghost);
    const trait = BAL.shipTraits[Math.min(this.tier, BAL.shipTraits.length - 1)];
    const ascPierce = 0;
    const wCoef = this.weapon === 'homing' ? W.homing.coef : this.weapon === 'laser' ? W.laser.coef : W.vulcan.coef;
    const escortShare = this.count > 1 ? 0.3 + dEff.escortShareBonus : 0;   // 군체 교리: 드론 사격 비중↑
    this.fireEscort(dt, world, baseDps * wCoef * escortShare * phaseMul * ks.supportMult);   // 위상 피해 + 군체 용광로 유령 보너스

    // 슬롯별 독립 발사(§5.3): main은 기존 하드포인트, wing은 추가 하드포인트에서 병렬 발사.
    const shared = { mfx, fireRate, damage, powerMult, trait, escortShare, flagPower: this.flagPower, rush, ks };
    this._spawnWeaponShots(this.weapon, this.weaponLv, dt, world, { ...shared, hx: 0, accKey: 'fireAcc', dpsScale: 1 });
    if (this.wing.weaponId) {
      this._spawnWeaponShots(this.wing.weaponId, this.wing.level, dt, world, {
        ...shared, hx: BAL.gate1.loadout.hardpointX.wing, accKey: '_wingAcc', dpsScale: BAL.gate1.loadout.wingDpsScale ?? 0.5,
      });
    }
  }

  /**
   * 한 무기 슬롯의 기함 직접 사격(§5.3). fire()에서 슬롯마다 호출한다. 무기별 진화 상태는
   * this.weaponEvolutions[weaponId] 등 무기 키 맵을 그대로 읽으므로 슬롯이 달라도 독립적으로 동작한다.
   * 발사체엔 sourceWeaponId·slot을 달아 피해 집계·공명 판정이 무기를 구분하게 한다.
   */
  _spawnWeaponShots(weaponId, level, dt, world, s) {
    const W = BAL.weapons;
    const WE = BAL.weaponEvolution;
    const WEB = BAL.weaponEvolution;
    const { mfx, fireRate, damage, powerMult, trait, escortShare, flagPower, rush, ks, hx, accKey, dpsScale } = s;
    const evo = this.weaponEvolutions[weaponId];
    const lvCoef = W.lvCoef[Math.min(level, W.lvCoef.length) - 1];
    const evoMult = evoLevelMult(evo, this.evoLevels[weaponId], WEB.evoLevelStep);
    const se = superEvoEffects(this.weaponEvolutions2[weaponId], BAL.weaponSuperEvolution);
    const projColor = weaponProjectileColor(evo, this.weaponEvolutions2[weaponId], WEAPON_COLORS[weaponId]);
    const projArt = weaponProjectileSpriteId(weaponId, evo);
    const superLv = this.superLevels[weaponId] || 0;
    const seDmg = se.dmgMult * (1 + Math.max(0, superLv - 1) * WEB.superLevelStep);
    const pb = (mfx.pierceBonus || 0) + se.pierceBonus;
    const rushAuto = rush * ks.autoMult;
    const baseDps = flagPower * fireRate * damage * lvCoef * powerMult * rushAuto * evoMult * seDmg;
    const dEff = doctrineEffects(this.doctrine, BAL.doctrine);
    const needle = evo === 'vulcan_needle' ? WE.vulcan_needle : null;
    const critP = (mfx.crit || 0) + (needle ? needle.critBonus : 0);
    const phaseMul = phaseDamageMult(Math.abs(this.bank || 0), dEff.bankDmgMax) * frameDamageMult(this.frameState, BAL.gate1.frames);
    const crit = (d) => (critP && Math.random() < critP ? d * (mfx.critMult || 2) : d) * phaseMul;
    const ascPierce = 0;
    const midKey = accKey + '_mountIdx';
    const cutKey = accKey + '_cutterCount';

    if (weaponId === 'homing') {
      const siege = evo === 'homing_siege' ? WE.homing_siege : null;
      const wasp = evo === 'homing_wasp' ? WE.homing_wasp : null;
      const rateMul = siege ? siege.rateMult : 1;
      const cap = wasp ? wasp.cap : W.homing.cap;
      const dps = baseDps * W.homing.coef * (1 - escortShare) * ks.flagMult * dpsScale;
      this[accKey] = (this[accKey] || 0) + W.homing.rate * trait.rate * rateMul * dt * se.rateMult;
      while (this[accKey] >= 1) {
        this[accKey] -= 1;
        const alive = world.bullets.filter((b) => b.kind === 'homing' && !b.dead).length;
        if (alive >= cap) continue;
        const md = crit(dps / W.homing.rate * trait.dmg);
        if (wasp) {
          for (let k = 0; k < wasp.count && alive + k < cap; k++) {
            const mis = new HomingMissile(this.x + hx, this.y - 14, (Math.random() - 0.5) * 300, md * wasp.totalFrac / wasp.count, level, projColor, projArt);
            mis.wasp = true; mis.r *= 0.8; mis.sourceWeaponId = weaponId;
            world.bullets.push(mis);
          }
          world.effects.muzzle(this.x + hx, this.y - 14, '#ffd0a0', 6);
        } else if (siege) {
          const mis = new HomingMissile(this.x + hx, this.y - 14, (Math.random() - 0.5) * 120, md * siege.dmgMult, level, projColor, projArt);
          mis.r *= siege.sizeMult; mis.speedMult = siege.speedMult; mis.turnMult = siege.turnMult; mis.sourceWeaponId = weaponId;
          mis.blast = { radius: siege.blastRadius, frac: siege.blastFrac, bossBonus: siege.bossBonus };
          world.bullets.push(mis);
          world.effects.muzzle(this.x + hx, this.y - 14, '#ff9c41', 8);
        } else {
          const mis = new HomingMissile(this.x + hx, this.y - 14, (Math.random() - 0.5) * 240, md, level, projColor, projArt);
          mis.sourceWeaponId = weaponId;
          world.bullets.push(mis);
          world.effects.muzzle(this.x + hx, this.y - 14, '#ff9c41', 5);
        }
        this.recoil = 1.5;
        sfx('missile');
      }
      return;
    }

    const isLaser = weaponId === 'laser';
    const storm = evo === 'vulcan_storm';
    const prism = evo === 'laser_prism';
    const cutter = evo === 'laser_cutter' ? WE.laser_cutter : null;
    const coef = isLaser ? W.laser.coef : W.vulcan.coef;
    const dps = baseDps * coef * (1 - escortShare) * ks.flagMult * dpsScale;
    let shotsBase = isLaser ? 18 : Math.min(25, Math.max(4, this.count * fireRate));
    let shotsPerSec = shotsBase * trait.rate * se.rateMult;
    if (needle) { shotsBase *= needle.rate; shotsPerSec *= needle.rate; }
    this[accKey] = (this[accKey] || 0) + shotsPerSec * dt;
    const mounts = SHIP_DEFS[this.tier].mounts;
    while (this[accKey] >= 1) {
      this[accKey] -= 1;
      if (world.bullets.length >= BAL.bullet.cap) continue;
      const dmg = crit(dps / shotsBase * trait.dmg);
      this[midKey] = ((this[midKey] || 0) + 1) % mounts.length;
      const m = mounts[this[midKey]];
      if (isLaser) {
        let beamW = 3 + level * 1.5;
        let pierce = W.laser.pierce[Math.min(level, W.laser.pierce.length) - 1] + pb + trait.pierce + ascPierce;
        let ldmg = dmg, isCut = false;
        if (cutter) { this[cutKey] = (this[cutKey] || 0) + 1; if (this[cutKey] % cutter.every === 0) { beamW *= cutter.widthMult; pierce += cutter.pierceBonus; ldmg *= cutter.dmgMult; isCut = true; } }
        const b = new Bullet(this.x + hx + m.x, this.y + m.y, ldmg, { vy: -W.laser.speed, kind: 'laser', pierce, beamW, lv: level, color: projColor, artId: projArt });
        if (prism) b.split = true;
        if (isCut) b.cutter = cutter.clearRadius;
        b.sourceWeaponId = weaponId;
        world.bullets.push(b);
        world.effects.muzzle(this.x + hx + m.x, this.y + m.y - 2, isCut ? '#ffffff' : '#a8f0ff', isCut ? 9 : 6);
        sfx('laser');
      } else {
        let spread = (W.vulcan.spreadDeg[Math.min(level, W.vulcan.spreadDeg.length) - 1] * Math.PI) / 180 * trait.spread * se.spreadMult;
        if (needle) spread *= needle.spread;
        if (storm) spread *= WE.vulcan_storm.spread;
        const a = (Math.random() - 0.5) * 2 * spread;
        const vpb = pb + (needle ? (needle.pierceBonus || 0) : 0);
        const b = new Bullet(this.x + hx + m.x, this.y + m.y, dmg, {
          vx: Math.sin(a) * W.vulcan.speed, vy: -Math.cos(a) * W.vulcan.speed, kind: 'vulcan',
          pierce: (vpb + trait.pierce + ascPierce) > 0 ? 1 + vpb + trait.pierce + ascPierce : 0, lv: level, color: projColor, artId: projArt,
        });
        if (needle) b.scale = needle.sizeMult;
        if (storm) b.ricochet = true;
        b.sourceWeaponId = weaponId;
        world.bullets.push(b);
        world.effects.muzzle(this.x + hx + m.x, this.y + m.y - 2, COLORS.ally, 5);
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
  /** idx번째 호위함의 기함 기준 상대 위치 — 함대 호위 대형(전방·측방·후방 다이아몬드 스크린).
   * 위협은 위(전방)에서 오므로 전방 호위를 두텁게, 측방으로 감싸고 후방에 예비를 둔다. (+x=우, +y=후) */
  supportSlot(idx, type) {
    const def = SHIP_DEFS[this.tier];
    const u = (def.clearR || 24) * 0.5 + 12;   // 대형 스케일 단위(기함 크기 비례)
    // 좌우 대칭 쌍으로 전방→측방→후방 순서(안쪽부터 채워 항상 균형 잡힌 대형)
    const F = Squad.FORMATION;
    const p = F[Math.min(idx, F.length - 1)];
    return { x: p[0] * u, y: p[1] * u };
  }

  // ── 순양함 피탄·격침 (드론 130기 합체 유닛도 적탄에 맞으면 깎인다) ──
  /** cruiserHp 길이를 cruisers 수에 동기화 (증가분은 만피로 보충). */
  _syncCruiserHp() {
    const max = BAL.escort.cruiserHp;
    while (this.cruiserHp.length < this.cruisers) this.cruiserHp.push(max);
    if (this.cruiserHp.length > this.cruisers) this.cruiserHp.length = this.cruisers;
    while (this.cruiserFlash.length < this.cruisers) this.cruiserFlash.push(0);
    if (this.cruiserFlash.length > this.cruisers) this.cruiserFlash.length = this.cruisers;
  }
  /** 순양함들의 월드 좌표 목록. */
  cruiserPositions() {
    this._syncCruiserHp();
    const out = [];
    for (let i = 0; i < this.cruisers; i++) {
      const s = this.supportSlot(i, 'cruiser');
      out.push({ x: this.x + s.x, y: this.y + s.y, i });
    }
    return out;
  }
  /** (x,y,r) 탄이 어떤 순양함을 맞혔는가 → 인덱스, 없으면 -1. */
  cruiserHitIndex(x, y, r) {
    const cr = BAL.escort.cruiserR;
    for (const c of this.cruiserPositions()) {
      if (Math.hypot(x - c.x, y - c.y) <= r + cr) return c.i;
    }
    return -1;
  }
  /** 순양함 i 피격: HP 감소, 0이면 격침(화력 하락 + 연출). */
  hitCruiser(i, dmg, world) {
    this._syncCruiserHp();
    if (i < 0 || i >= this.cruisers) return;
    this.cruiserHp[i] -= dmg;
    this.cruiserFlash[i] = 0.2;
    const pos = this.supportSlot(i, 'cruiser');
    world.effects.burst(this.x + pos.x, this.y + pos.y, '#57e0ff', 5, 90);
    if (this.cruiserHp[i] <= 0) {
      this.cruiserHp.splice(i, 1);
      this.cruiserFlash.splice(i, 1);
      this.cruisers = Math.max(0, this.cruisers - 1);
      world.effects.burst(this.x + pos.x, this.y + pos.y, COLORS.danger, 18, 200);
      world.effects.ring(this.x + pos.x, this.y + pos.y, COLORS.danger);
      world.effects.text(this.x + pos.x, this.y + pos.y - 20, '순양함 격침!', COLORS.danger, 13);
      sfx('explode_s');
    }
  }

  /** 호위함 사격: 기함과 같은 무기를 supportPower 비례로, 호위함 위치에서 발사. ghost=군체 용광로 유령 순양함(실사격). */
  fireSupport(dt, world, dps, crit, ghost = 0) {
    const units = (this.escorts || 0) + (this.cruisers || 0) + ghost;
    if (units <= 0 || dps <= 0) return;
    const W = BAL.weapons;
    const projColor = weaponProjectileColor(this.weaponEvolutions[this.weapon], this.weaponEvolutions2[this.weapon], WEAPON_COLORS[this.weapon]);   // 진화별 색 (기함과 동일)
    const projArt = weaponProjectileSpriteId(this.weapon, this.weaponEvolutions[this.weapon]);
    const shotsPerSec = Math.min(20, 3 + units * 1.6);
    this.supportAcc = (this.supportAcc || 0) + shotsPerSec * dt;
    const tgt = this._nearestEnemy(world);   // 순양함은 능동 호위: 가장 가까운 적을 조준 사격
    while (this.supportAcc >= 1) {
      this.supportAcc -= 1;
      if (world.bullets.length >= BAL.bullet.cap) continue;
      const dmg = crit(dps / shotsPerSec);
      const idx = (this.supportIdx = ((this.supportIdx || 0) + 1) % units);
      const type = idx < this.cruisers ? 'cruiser' : 'escort';
      const slot = this.supportSlot(idx, type);
      const sx = this.x + slot.x, sy = this.y + slot.y - 6;
      const aim = tgt ? Math.atan2(tgt.x - sx, sy - tgt.y) : 0;   // 조준 각(정면=0), 표적 없으면 위로
      if (this.weapon === 'laser') {
        // 레이저는 세로 빔 — 순양함 조준사격도 옆으로 눕히지 않고 정면(위)으로만 발사 (평행 레이저 버그 방지)
        world.bullets.push(new Bullet(sx, sy, dmg, { vy: -W.laser.speed, kind: 'laser', pierce: W.laser.pierce[this.weaponLv - 1], beamW: 2 + this.weaponLv, lv: this.weaponLv, color: projColor, artId: projArt }));
      } else if (this.weapon === 'homing') {
        const alive = world.bullets.filter((b) => b.kind === 'homing' && !b.dead).length;
        if (alive < W.homing.cap) world.bullets.push(new HomingMissile(sx, sy, (Math.random() - 0.5) * 180, dmg, this.weaponLv, projColor, projArt));
      } else {
        const spread = (W.vulcan.spreadDeg[this.weaponLv - 1] * Math.PI) / 180;
        const a = aim + (Math.random() - 0.5) * 2 * spread;
        world.bullets.push(new Bullet(sx, sy, dmg, { vx: Math.sin(a) * W.vulcan.speed, vy: -Math.cos(a) * W.vulcan.speed, kind: 'vulcan', lv: this.weaponLv, color: projColor, artId: projArt }));
      }
    }
  }

  /** 순양함 조준용: 편대 위쪽에서 가장 가까운 적 (적/보스). 없으면 null. */
  _nearestEnemy(world) {
    let best = null, bestD = 320 * 320;   // 조준 사거리(px²)
    for (const e of world.entities) {
      if (e.dead || !e.isEnemy || e.y > this.y) continue;
      const dx = e.x - this.x, dy = e.y - this.y, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = e; }
    }
    if (world.bosses) for (const bo of world.bosses) {
      if (bo.dead) continue;
      const dx = bo.x - this.x, dy = bo.y - this.y, d = dx * dx + dy * dy;
      if (d < bestD) { bestD = d; best = bo; }
    }
    return best;
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
      blit(ctx, scout, 0, 0, droneBlitScale());   // 고정 표시 폭 — 기함이 커져도 드론은 그대로
      ctx.restore();
    }

    // 군체 용광로 유령 순양함 (시각 전용, 체력·충돌 없음): 활성 중 기함 좌우에 반투명 편대
    if (this.keystoneState && this.keystoneState.forgeT > 0) {
      const gc = BAL.keystone.swarmForge.ghostCruisers;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.t * 6);
      for (let i = 0; i < gc; i++) {
        const gx = this.x + (i % 2 === 0 ? -1 : 1) * (w * 0.5 + 22);
        const gy = this.y + 10 + Math.floor(i / 2) * 18;
        ctx.save(); ctx.translate(gx, gy);
        blit(ctx, scout, 0, 0, 0.7);
        ctx.restore();
      }
      ctx.restore();
    }

    // 호위함(호위기·순양함): 좌우 날개 대형 — "함대가 커지는" 체감 + 같이 사격 + 피탄 시 손상 표시
    if (this.escorts || this.cruisers) {
      const cSprite = shipSprite(1, this.weapon);   // 순양함 = 인터셉터형
      const total = this.cruisers + this.escorts;
      const cMax = BAL.escort.cruiserHp;
      for (let i = 0; i < total; i++) {
        const type = i < this.cruisers ? 'cruiser' : 'escort';
        const slot = this.supportSlot(i, type);
        ctx.save();
        ctx.translate(this.x + slot.x, this.y + slot.y + Math.sin(this.t * 3 + i) * 1.5);
        ctx.rotate(this.bank * 0.25);
        // 고정 표시 폭에서 역산 — 기함 티어가 커져도 호위는 커지지 않아야 위계가 유지된다
        blit(ctx, type === 'cruiser' ? cSprite : scout, 0, 0, type === 'cruiser' ? cruiserBlitScale() : droneBlitScale() * 1.4);
        // 순양함 손상: 피격 플래시(붉은 링) + HP 낮으면 손상 표시
        if (type === 'cruiser') {
          const hp = this.cruiserHp[i] ?? cMax;
          if ((this.cruiserFlash[i] || 0) > 0) {
            ctx.globalAlpha = Math.min(0.7, this.cruiserFlash[i] * 3);
            ctx.strokeStyle = COLORS.danger; ctx.lineWidth = 2.5;
            ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.stroke();
            ctx.globalAlpha = 1;
          }
          if (hp < cMax) {   // 체력바 (손상 시에만)
            const bw = 20, f = Math.max(0, hp / cMax);
            ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(-bw / 2, -18, bw, 3);
            ctx.fillStyle = f > 0.4 ? '#57e0ff' : COLORS.danger; ctx.fillRect(-bw / 2, -18, bw * f, 3);
          }
        }
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
    // 중립 함체 + 금빛 지휘 프레임 + 현재 무기 장착물을 분리해, 성장 변화가 실루엣에 남도록 한다.
    blit(ctx, shipBaseSprite(this.tier), 0, 0);
    drawHullFrame(ctx, this.tier, this.weapon, this.previousFrameWeapon, this.frameBlend);
    drawCommandFrame(ctx, this.tier, this.t);
    drawWeaponRig(
      ctx, this.tier, this.weapon, this.weaponLv, this.t,
      this.weaponEvolutions[this.weapon], this.weaponEvolutions2[this.weapon],
    );
    drawDeckLights(ctx, this.tier, this.t);
    // 주포 마운트에 현재 무기 색 표시 — 어떤 무기인지 기체만 봐도 알 수 있게
    ctx.fillStyle = WEAPON_COLORS[this.weapon];
    for (const m of SHIP_DEFS[this.tier].mounts) {
      ctx.beginPath();
      ctx.arc(m.x, m.y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawHitCore(ctx);
    drawUpgradeSequence(ctx, this.tier, this.upgradeFx);
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
      ctx.font = 'bold 16px Pretendard, sans-serif';
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
        ctx.globalAlpha = 1; ctx.fillStyle = col; ctx.font = 'bold 15px Pretendard, sans-serif'; ctx.textAlign = 'center';
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
    if (this.shield || (this.surv && this.surv.shield > 0)) {   // 레거시 shield + surv.shield(경로 보호막 등) 둘 다 시각 표시(Codex G2-D P2)
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
    if (e.dead || !e.hitByBullet || e.indestructible || e.bulletPhantom?.(world)) continue;   // 통과 대상(수집 전용 크리스탈)은 도탄·분열 표적에서 제외
    if (seen && seen.has(e)) continue;
    if (side < 0 && e.x >= x) continue;
    if (side > 0 && e.x <= x) continue;
    const d = Math.hypot(e.x - x, e.y - y);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

export class Bullet {
  constructor(x, y, damage, { vx = 0, vy = -BAL.bullet.speed, kind = 'vulcan', pierce = 0, beamW = 4, lv = 1, color = null, artId = null } = {}) {
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.damage = damage;
    this.kind = kind;
    this.color = color;        // 진화별 발사체 색 (없으면 draw에서 기본색)
    this.artId = artId;
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
    const c = this.color || '#a8f0ff';     // 진화별 발사체 색 (없으면 기본 레이저색)
    const w = this.beamW;
    const L = 34 + this.lv * 8;
    const top = Math.min(this.y, this.prevY) - L / 2;
    const bot = Math.max(this.y, this.prevY) + L / 2;
    const h = bot - top;
    // 색 본체를 진하게 — 진화색이 확실히 보이도록 (예전엔 흰 코어가 빔을 덮어 색이 거의 안 보였음)
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = c;
    ctx.fillRect(this.x - w, top, w * 2, h);
    // 가는 백열 중심선만 — 색을 덮지 않게 얇게
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#ffffff';
    const cw = Math.max(1.4, w * 0.32);
    ctx.fillRect(this.x - cw / 2, top, cw, h);
    ctx.globalAlpha = 1;
  }

  drawVulcan(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(Math.atan2(this.vx, -this.vy));
    if (this.scale) ctx.scale(this.scale, this.scale);   // 니들: 탄 크기 축소
    const c = this.color || COLORS.ally;   // 진화별 발사체 색 (없으면 기본 발칸색)
    if (this.lv === 1) {
      // Lv1: 가는 예광탄
      ctx.fillStyle = c;
      ctx.fillRect(-1.5, -6, 3, 12);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-1.5, -8, 3, 4);
    } else if (this.lv === 2) {
      // Lv2: 이중 탄두 (두 발이 나란히 나는 형태)
      ctx.fillStyle = c;
      ctx.fillRect(-4, -5, 2.6, 11);
      ctx.fillRect(1.4, -5, 2.6, 11);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-4, -7.5, 2.6, 3.5);
      ctx.fillRect(1.4, -7.5, 2.6, 3.5);
    } else {
      // Lv3: 굵은 에너지 볼트 — 진화색 단색 통일(적·로켓처럼 안 보이게) + 백열 코어
      ctx.fillStyle = c;
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
    const art = this.artId && getSprite(this.artId);
    if (art && this.kind !== 'tracer') {
      const a = Math.atan2(this.vx, -this.vy);
      const sc = this.kind === 'laser' ? 0.58 + this.lv * 0.08 : 0.38 + this.lv * 0.07;
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(a);
      const s = sc * (this.scale || 1);
      // 레이저는 굵기의 근거가 beamW인데 스프라이트 경로는 이를 무시했다. 그 결과 ①커터 초진화 아트가
      // 원본부터 얇아(39×320 → 화면 4.9px, 기본 131×320 = 16.4px) 진화하면 빔이 3배 얇아지고
      // ②5발마다 나오는 '굵은 절단탄'(widthMult 2.3)이 전혀 굵어지지 않았다(이사 지적).
      // → 렌더 폭이 beamW 기준보다 좁으면 가로만 늘려, 진화해도 안 얇아지고 절단탄은 확실히 굵어진다.
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.9;
      if (this.kind === 'laser') {
        const wantW = this.beamW * 2;
        const artW = art.logicalW * s;
        ctx.save();
        if (artW > 0 && artW < wantW) ctx.scale(wantW / artW, 1);   // 가로만 늘림(길이는 유지)
        blit(ctx, art, 0, 0, s);
        ctx.restore();
        if (this.cutter) {   // 절단탄: 폭이 넓어진 만큼 백열 심도 굵게 → '굵은 빔'이 한눈에 구분
          const h = art.logicalH * s, cw = Math.max(2.4, this.beamW * 0.5);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(-cw / 2, -h * 0.48, cw, h * 0.96);
        }
      } else {
        blit(ctx, art, 0, 0, s);
      }
      // 발칸 발사체 스프라이트는 세로로 길고 폭이 7~9px로 얇은 데다 가산합성이라, 밝은 폭발 위나
      // 오렌지 계열 진화(템페스트)에서는 배경·이펙트에 묻혀 잘 안 보인다. 밝은 백열 코어를 '덮어쓰기'로
      // 항상 덧그려, 어떤 배경·발사체 색에서도 탄의 형태가 또렷하게 남게 한다.
      if (this.kind === 'vulcan') {
        const h = art.logicalH * s;
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#fffefb';
        ctx.fillRect(-1.4, -h * 0.46, 2.8, h * 0.92);
      }
      ctx.restore();
      return;
    }
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
      // 폭풍: 남은 튕김이 있으면 자탄도 도탄 → 적 사이를 연쇄로 튕긴다(다수전)
      const bouncesLeft = (this.bounces ?? WE.vulcan_storm.bounces ?? 1) - 1;
      this.ricochet = false;
      const seen = new Set([hit]); if (this.hitSet) for (const e of this.hitSet) seen.add(e);
      const t = nearestTarget(world, this.x, this.y, WE.vulcan_storm.ricochetRadius, seen, 0);
      if (t) {
        const ang = Math.atan2(t.x - this.x, -(t.y - this.y));
        const child = new Bullet(this.x, this.y, this.damage * WE.vulcan_storm.ricochetFrac, {
            vx: Math.sin(ang) * BAL.weapons.vulcan.speed, vy: -Math.cos(ang) * BAL.weapons.vulcan.speed, kind: 'vulcan', lv: this.lv, color: this.color, artId: this.artId,
        });
        if (bouncesLeft > 0) { child.ricochet = true; child.bounces = bouncesLeft; }   // 남은 튕김 계승
        world.bullets.push(child);
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
            vx: Math.sin(ang) * BAL.weapons.laser.speed, vy: -Math.cos(ang) * BAL.weapons.laser.speed, kind: 'laser', beamW: 4, lv: this.lv, pierce: WE.laser_prism.splitPierce ?? 0, color: this.color, artId: this.artId,
          }));
        }
      }
    }
  }
}

// ───────────────────────── 호밍 미사일 (금색, 유도)
export class HomingMissile {
  constructor(x, y, vx0, damage, lv = 1, color = null, artId = null) {
    this.x = x; this.y = y;
    this.vx = vx0;
    this.vy = -BAL.weapons.homing.speedFrom;
    this.speed = BAL.weapons.homing.speedFrom;
    this.damage = damage;
    this.kind = 'homing';
    this.color = color;   // 진화별 발사체 색 (없으면 기본 금색)
    this.artId = artId;
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
    // 시커 빔 공명(G1-06): 레이저가 지정한 표식 대상이 살아 있으면 유도 미사일이 최우선 추적한다.
    //  표식 대상이 파괴·만료되면(reson.onEnemyRemoved/markT) 일반 점수로 다음 표적을 고른다.
    const reson = world.reson;
    if (reson && reson.activeId === 'seekerBeam' && reson.markId && !reson.markId.dead) { this.target = reson.markId; return; }
    // 우선순위: 크리처/사격형 적 > 크리스탈 > 운석 (최근접). 와스프는 근접 3표적 중 랜덤(분산).
    const cands = [];
    for (const e of world.entities) {
      // 파괴 불가 대상은 조준하지 않는다 — 잔해(indestructible)·수집 전용 크리스탈(bulletPhantom). 조준하면 미사일이 영원히 못 부수는 걸 쫓느라 적을 안 때린다(이사).
      if (e.dead || !e.hitByBullet || e.indestructible || e.bulletPhantom?.(world)) continue;
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
      // 시커 빔: 새 표식이 걸리면 즉시 그쪽으로 재조준(G1-06).
      const mark = world.reson?.activeId === 'seekerBeam' ? world.reson.markId : null;
      if (!this.target || this.target.dead || (mark && !mark.dead && this.target !== mark)) this.pickTarget(world);
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
    const c = this.color || COLORS.reward;   // 진화별 발사체 색 (없으면 기본 금색)
    // 꼬리 잔상 (레벨이 오를수록 굵고 길게)
    if (this.trail.length > 1) {
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = c;
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
    const art = this.artId && getSprite(this.artId);
    if (art) {
      ctx.globalCompositeOperation = 'lighter';
      blit(ctx, art, 0, 0, (this.wasp ? 0.4 : this.blast ? 0.75 : 0.52) + this.lv * 0.04);
      ctx.restore();
      return;
    }
    if (this.lv === 1) {
      // Lv1: 소형 로켓 (원형 탄두)
      ctx.fillStyle = c;
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
      ctx.fillStyle = c;
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
      if (o === hit || o.dead || !o.hitByBullet || o.indestructible || o.bulletPhantom?.(world)) continue;   // 통과 대상은 폭발 대상에서도 제외
      if (Math.hypot(o.x - this.x, o.y - this.y) <= radius + (o.r || 0)) {
        o.hitByBullet(this.damage * frac, world);
        if (o.dead) world.notifyEnemyKilled?.(o);   // 시즈 토피도 광역 처치도 킬 이벤트 집계
      }
    }
    if (world.boss && !world.boss.dead && world.phase === 'boss' && world.boss !== hit &&
        Math.hypot(world.boss.x - this.x, world.boss.y - this.y) <= radius + world.boss.r) {
      world.boss.hitByBullet(this.damage * frac, world);
    }
    world.effects.burst(this.x, this.y, '#ff9c41', 12, radius * 1.8);
    world.effects.ring(this.x, this.y, '#ff9c41', 0, radius);   // 시각 링을 실제 폭발 반경에 맞춤
  }
}

// ───────────────────────── 스크롤 개체 공통
export class Scrolling {
  constructor(x, y) { this.x = x; this.y = y; this.dead = false; }
  scroll(dt, world) { this.y += world.scrollSpeed * dt; }
  offscreen(world, margin = 60) { return this.y > world.logicalH + margin; }
}

// ───────────────────────── 에너지 크리스탈
/**
 * 생성 시점의 보상 배수(모듈·경제·군체 교리 + 보급 노드 배수)를 반영해 실지급 드론 수를 확정한다.
 * 표시=지급(§3.6). 각 배수는 정확히 한 번만(§5.4): 단일 round 안에서 곱한다.
 * extraMult = 보급 노드 payout 배수(1.4), 일반 노드는 1.
 */
function fixedPayout(raw, world, extraMult = 1) {
  return droneReward(raw, world?.mfx?.podRewardMult ?? 1, BAL.economy.droneGainMult, (world?.squad?.rewardGainMult ?? 1) * extraMult);
}

export class Crystal extends Scrolling {
  constructor(x, y, value, world, extraMult = 1) {
    super(x, y);
    this.hp = this.maxHp = value;             // 격파에 필요한 화력(=체력)
    this.reward = value;                      // 표적 우선순위·스캐빈저 대체값의 기준
    // 접촉 자동 수집(reson 설치 모드)은 무위험이라 '잔돈' 배수를 곱한다 — 부숴야 하는 수송선보다
    // 크면 리스크-보상이 뒤집힌다(이사). 구 모델(쏴서 파괴)에서는 배수 없이 원래 값 그대로.
    const contactPickup = !!world?.squad?.reson;
    this.payout = fixedPayout(value, world, extraMult * (contactPickup ? BAL.economy.crystalContactMult : 1));
    // 크기를 표시 숫자(payout=드론 지급)에 연속 비례 — 큰 숫자 크리스탈이 크게(이사: 계단식 3단계→비례). 체력(hp=value)은 droneReward가 선형이라 이미 payout에 정비례.
    this.r = Math.max(18, Math.min(52, 15 + this.payout * 0.55));
  }
  /** 실제 지급 드론 수 = 생성 시 확정된 payout. 스캐빈저도 이 값을 저장한다. (world 인자는 하위 호환용) */
  getDroneReward() {
    return this.payout;
  }
  /** 섹터 무기 조합 모드: 아군 탄이 그대로 통과한다(파괴 불가 = 표적도 장애물도 아님, 이사).
   *  이게 없으면 편대 쪽으로 흡인된 크리스탈이 사선 정면에서 발칸·레이저·미사일을 전부 잡아먹어 초반 적을 못 부순다.
   *  잔해(Debris)의 indestructible과는 다르다 — 잔해는 탄을 '막는' 게 설계 의도라 통과시키지 않는다. */
  bulletPhantom(world) {
    return !!(world && world.squad && world.squad.reson);
  }
  hitByBullet(dmg, world) {
    if (world.squad && world.squad.reson) return;   // 섹터 무기 조합: 크리스탈은 총알로 파괴 안 됨 — 지나가며 편대 접촉 시 자동 수집만(이사)
    const res = hitCrystal(this, dmg);
    this.hp = res.hp;
    if (res.broken) {
      this.dead = true;
      world.effects.burst(this.x, this.y, COLORS.reward, 20);
      world.squad.applyDelta(this.payout, world);
      sfx('crystal');
    }
  }
  update(dt, world) {
    this.scroll(dt, world);
    // 크리스탈 = 편대 접촉 시 자동 수집(안 쏴도 소량 획득). 수송선(DronePod)은 부숴야 대량 → 획득 방식 구분(이사).
    const sq = world.squad;
    if (sq.reson) {   // 섹터 무기 조합: 파괴 없이 접촉 수집이므로 편대로 유도 흡인(놓치지 않게)
      const dx = sq.x - this.x, dy = sq.y - this.y, d = Math.hypot(dx, dy) || 1;
      this.x += (dx / d) * 130 * dt; this.y += (dy / d) * 130 * dt;
    }
    if (!this.dead && circleHit(this.x, this.y, this.r, sq.x, sq.y, sq.hitRadius)) {
      this.dead = true;
      world.effects.burst(this.x, this.y, COLORS.reward, 16);
      sq.applyDelta(this.payout, world);
      sfx('crystal');
    }
    if (this.offscreen(world)) this.dead = true;
  }
  draw(ctx) {
    const r = this.r;
    const gem = getSprite('C1');
    if (gem) {
      // 새 크리스탈 스프라이트(발광·프리즘 굴절 포함, 이사 제작 → 크로마키). r 비례 표시.
      blit(ctx, gem, this.x, this.y, (r * 2.8) / gem.logicalH);
    } else {
      // 폴백: 코드 단일 젬
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
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(this.x - r * 0.72, this.y - r * 0.2);
      ctx.lineTo(this.x, this.y - r * 0.05);
      ctx.lineTo(this.x + r * 0.72, this.y - r * 0.2);
      ctx.moveTo(this.x, this.y - r);
      ctx.lineTo(this.x, this.y + r);
      ctx.stroke();
    }
    // 중앙 큰 숫자 = 실지급 드론(+payout). 표시와 지급이 같은 값(§3.6). 체력은 작은 상단 바로 이동.
    const num = `+${this.payout}`;
    ctx.font = `bold ${r >= 34 ? 18 : 15}px Pretendard, sans-serif`;
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(5,6,15,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeText(num, this.x, this.y + 5);
    ctx.fillStyle = COLORS.text;
    ctx.fillText(num, this.x, this.y + 5);
    // 격파 진행(체력)은 상단 작은 바로 — 큰 숫자 자리를 보상 표시에 내준다
    if (this.hp < this.maxHp) {
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.fillRect(this.x - r, this.y - r - 8, r * 2, 3);
      ctx.fillStyle = '#6fe3ff';
      ctx.fillRect(this.x - r, this.y - r - 8, r * 2 * Math.max(0, this.hp / this.maxHp), 3);
    }
  }
}

// ───────────────────────── 보급 수송선: 부수면 드론 지급 (파괴 = 드론 회수의 주력 공급원)
export class DronePod extends Scrolling {
  constructor(x, y, size, world, extraMult = 1) {
    super(x, y);
    const cfg = BAL.pod[size];
    this.size = size;
    this.hp = cfg.hp;
    this.maxHp = cfg.hp;
    this.reward = cfg.reward;                                 // 표적 우선순위·스캐빈저 대체값의 기준
    this.payout = fixedPayout(cfg.reward, world, extraMult);  // 생성 시 확정된 실지급 드론 수(표시와 동일)
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
  /** 실제 지급 드론 수 = 생성 시 확정된 payout. 스캐빈저도 이 값을 저장한다. (world 인자는 하위 호환용) */
  getDroneReward() {
    return this.payout;
  }
  hitByBullet(dmg, world) {
    this.hp -= dmg;
    if (this.hp <= 0 && !this.dead) {
      this.dead = true;
      world.effects.burst(this.x, this.y, COLORS.ally, 18, 200);
      world.effects.ring(this.x, this.y, COLORS.ally);
      world.squad.applyDelta(this.payout, world, '보급 획득!');
      sfx('crystal');
    }
  }
  draw(ctx) {
    const r = this.r;
    const pod = getSprite('C5');
    if (pod) {
      // 새 보급 수송선 스프라이트(이사 제작 → 크로마키). r 비례 표시. 크리스탈(보석)과 시각 구분.
      blit(ctx, pod, this.x, this.y, (r * 2.6) / pod.logicalH);
    } else {
      // 폴백: 청록 육각 컨테이너
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
    }
    // 내용 표기: ▲ + 드론 수
    ctx.font = `bold ${r >= 22 ? 15 : 12}px Pretendard, sans-serif`;
    ctx.textAlign = 'center';
    const label = `▲${this.payout}`;
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
    this.corruptSide = null;   // 게이트 패러사이트 감염 레인 (null|'left'|'right') — 살아있으면 통과 시 반전
  }
  static isGood(g) { return g.op === '+' || g.op === 'x'; }
  static label(g) { return `드론 ${g.op === 'x' ? '×' : g.op === '/' ? '÷' : g.op}${g.value}`; }

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
        let gate = this[side];
        if (this.corruptSide === side) { gate = invertGateOp(gate); world.effects.text(squad.x, this.y - 20, '감염! 게이트 효과 반전', COLORS.gateBad, 14); }
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
    if (opt.kind === 'drones') return { color: COLORS.ally, label: `드론 +${opt.value}` };
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
      world.effects.text(sq.x, sq.y - 64, '보호막 획득!', COLORS.gateGood);
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
        const laneW = this.logicalW / 3;
        const lane = Math.max(0, Math.min(2, Math.floor(squad.x / laneW)));
        const opt = this.options[lane];
        // 무기 게이트: 현재 무기를 다른 무기로 바꾸려면 그 레인 '중앙부'에 확실히 있어야 한다.
        // (탄 피하다 발칸 레인 가장자리를 스쳐 레이저가 발칸으로 뒤바뀌는 사고 방지 — 애매하면 현재 무기 유지)
        if (opt.kind === 'weapon' && opt.weapon !== squad.weapon) {
          const centerX = (lane + 0.5) * laneW;
          if (Math.abs(squad.x - centerX) > laneW * 0.34) {
            this.applied = true; this.appliedLane = -1; this.flashT = BAL.gate.passFlashTime;
            world.effects.text(squad.x, squad.y - 64, `${WEAPON_LABELS[squad.weapon]} 유지!`, WEAPON_COLORS[squad.weapon], 13);
            if (this.offscreen(world)) this.dead = true;
            return;
          }
        }
        this.apply(opt, world);
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
// 파워업 배지(POW): 정예몹 처치 시 드롭 → 편대로 유도 흡인 → 접촉 시 무기 강화(섹터 무기 조합, 이사 아이디어).
export class Pow extends Scrolling {
  constructor(x, y) { super(x, y); this.r = 16; this.t = 0; this.isEnemy = false; }
  update(dt, world) {
    this.t += dt;
    const sq = world.squad;
    const dx = sq.x - this.x, dy = sq.y - this.y, d = Math.hypot(dx, dy) || 1;
    this.x += (dx / d) * 165 * dt; this.y += (dy / d) * 165 * dt;   // 편대로 유도(놓치지 않게)
    if (circleHit(this.x, this.y, this.r + 8, sq.x, sq.y, sq.hitRadius)) {
      this.dead = true; sfx('buy');
      if (world.onPowCollect) world.onPowCollect();
    }
    if (this.offscreen(world)) this.dead = true;
  }
  draw(ctx) {
    const r = this.r, pulse = 0.72 + 0.28 * Math.sin(this.t * 6);
    glow(ctx, '#ffd93d', 12, (c) => {
      c.fillStyle = `rgba(255,217,61,${0.82 * pulse})`; c.strokeStyle = '#fff4c6'; c.lineWidth = 2;
      c.beginPath();
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 - Math.PI / 2; const px = this.x + Math.cos(a) * r, py = this.y + Math.sin(a) * r; i ? c.lineTo(px, py) : c.moveTo(px, py); }
      c.closePath(); c.fill(); c.stroke();
    });
    ctx.fillStyle = '#2a2000'; ctx.font = 'bold 15px Pretendard, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('POW', this.x, this.y + 5);
  }
}

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
    ctx.font = '900 14px Pretendard, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 3.5; ctx.lineJoin = 'round'; ctx.strokeStyle = '#2a1030'; ctx.strokeText('POW!', 0, 0);
    ctx.fillStyle = '#ffffff'; ctx.fillText('POW!', 0, 0);
    ctx.textBaseline = 'alphabetic';
    // 3) 무기 이름 (아래) — 어떤 무기인지
    ctx.font = 'bold 11px Pretendard, sans-serif';
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
      world.effects.text(world.squad.x, world.squad.y - 40, `⚡ 공격력 2배! · ${BAL.powerModule.duration}초`, '#4cc9ff');
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
    ctx.font = 'bold 11px Pretendard, sans-serif'; ctx.textAlign = 'center';
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
    this.age = 0;           // 생성 후 경과(초) — 겹침 farming 방지 (Phase 2)
    this.grazed = false;    // 근접 회피 적립 여부 (탄 1개당 1회)
  }
  static aimed(x, y, tx, ty, speed, opts) {
    const d = Math.hypot(tx - x, ty - y) || 1;
    return new EnemyShot(x, y, ((tx - x) / d) * speed, ((ty - y) / d) * speed, opts);
  }
  update(dt, world) {
    if (this.dead) return;   // 위상 잔상 등으로 이미 제거된 탄은 같은 프레임에 이동·피격·graze 안 함
    this.age += dt;
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
    const sq = world.squad;
    const dist = Math.hypot(this.x - sq.x, this.y - sq.y);
    if (dist <= this.r + sq.hitRadius) {
      // 실제 피격: 탄 제거 + (무적 아니면) 피해 + FLOW 규칙. 같은 프레임 graze 금지.
      this.dead = true;
      const legacyDmg = Math.max(this.dmgMin, Math.round(sq.count * this.dmgPct));
      sq.takeShot(world, { legacyDmg, onCruiserIndex: null, elite: !!this.elite });   // Gate 1: 기함 핵 → 내구도
      world.effects.burst(this.x, this.y, COLORS.danger, 10);
    } else if (sq.cruisers > 0) {
      // 순양함 피탄: 기함에 안 맞은 탄이 날개 순양함을 맞히면 HP가 깎인다(격침 가능). 탄 소모.
      const ci = sq.cruiserHitIndex(this.x, this.y, this.r);
      if (ci >= 0) {
        this.dead = true;
        sq.takeShot(world, { legacyDmg: Math.max(this.dmgMin, Math.round(sq.count * this.dmgPct)), onCruiserIndex: ci, elite: !!this.elite });
      }
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
  constructor(logicalW, stage, power, bossId = null) {
    super(logicalW / 2, -90);
    const M = BAL.midboss;
    // 직전 스테이지의 보스. bossId를 주면 그걸 우선한다 — bossDefFor(0→1)이 로스터 0번인 **B7 하이브 퀸**
    // (캠페인 최종 보스)을 돌려줘서, 섹터 1 중간보스로 최종 보스가 나오던 문제(이사 지적) 때문.
    this.def = bossId ? bossDefById(bossId) : bossDefFor(Math.max(1, stage - 1));
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
    ctx.font = 'bold 10px Pretendard, sans-serif';
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
export function drawEHp(ctx, e) {
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2, 3);
  ctx.fillStyle = COLORS.enemyCore;
  ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r * 2 * Math.max(0, e.hp / e.maxHp), 3);
}
export function enemyDie(e, world, color, coin) {
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
  constructor(x) { const c = NE().shielder; this.x = x; this.y = -30; this.hp = this.maxHp = c.hp; this.r = c.r; this.stayT = c.stay; this.fireT = c.fireInterval; this.shield = true; this.shieldT = c.shieldUp; this.state = 'enter'; this.isEnemy = true; this.dead = false; this.t = 0; this.hpScaleMul = c.hpScaleMul; }
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
  hitByBullet(dmg, world) { if (affixAbsorb(this, world)) return; const eff = this.shield ? dmg * (1 - NE().shielder.shieldReduce) : dmg; if (this.shield) world.effects.burst(this.x, this.y + this.r * 0.6, '#57e0ff', 2, 60); this.hp -= eff; if (this.hp <= 0) enemyDie(this, world, '#57e0ff', NE().shielder.coin); }
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


// 보스 클래스는 bosses.js로 분리 (신규 보스 추가 대비). main.js 등 기존 import 호환을 위해 재export.
export { Boss, NeonArbiter, makeBoss } from './bosses.js';
