// 보스: 스테이지별 로스터 + 고유 공격 패턴 + 격파 연출.
// (entities.js에서 분리 — 신규 보스 추가 대비. EnemyShot 등 공용 개체는 entities.js에서 import)
import { BAL } from './balance.js';
import { COLORS, glow, blit } from './render.js';
import { bossDefFor, bossDefById, getSprite } from './sprites.js';
import { EnemyShot, Creature } from './entities.js';

const AR = () => BAL.neonArbiter;
function blitIf(ctx, sprite, x, y, scale = 1) { if (sprite) blit(ctx, sprite, x, y, scale); }

// Gate 0 R4 — 보스 부위 손상 국소 VFX. 신규 단일 베이스 위에 균열·발광·암전을 얹어
// "부품 통째로 사라짐" 대신 "손상된 하나의 함선"으로 읽히게 한다. 좌표는 보스 로컬(중심 0,0).
function bossGlow(ctx, x, y, r, color, alpha = 1) {
  if (r <= 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = alpha;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color); g.addColorStop(0.5, color.replace(/[\d.]+\)$/, '0.35)')); g.addColorStop(1, color.replace(/[\d.]+\)$/, '0)'));
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}
/** 부위 손상: 국소 암전 + 균열 발광(파괴됐음을 베이스 삭제 없이 표현) */
function bossPartDamage(ctx, x, y, r, t, tint = '#ff9c41', destroyed = true) {
  ctx.save();
  if (destroyed) {   // 암전: 해당 부위를 어둡게
    ctx.globalAlpha = 0.42;
    const d = ctx.createRadialGradient(x, y, 0, x, y, r);
    d.addColorStop(0, 'rgba(2,3,8,0.9)'); d.addColorStop(1, 'rgba(2,3,8,0)');
    ctx.fillStyle = d; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
  // 균열 발광 (맥동)
  const flick = 0.4 + 0.4 * Math.abs(Math.sin(t * 6 + x * 0.05));
  bossGlow(ctx, x, y, r * 0.7, tint.startsWith('#') ? hexGlow(tint, 0.85) : tint, destroyed ? flick * 0.7 : flick);
}
function hexGlow(hex, a) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export class Boss {
  constructor(logicalW, rateMult = 1, stage = 1, sizeMul = 1, bossIdOverride = null) {
    // 보스 정체성: 캠페인 ID override가 있으면 그걸, 없으면 로스터 순환. PNG 없으면 하이브 퀸 폴백.
    const def = bossIdOverride ? bossDefById(bossIdOverride) : bossDefFor(stage);
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
    if (this.rainWarnT > 0) this.rainWarnT = Math.max(0, this.rainWarnT - dt);   // 융단 폭격 예고 타이머
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
      case 'rain': { // 스톰브링어 융단 폭격: 위험 컬럼 예고 → 안전 컬럼으로 이동 요구 → 밀집 낙하(패턴 학습 시험)
        const cols = P.cols || 7;
        if ((this.rainStrikes || 0) <= 0) {
          // 예고: 위험 컬럼을 고른다(광폭화면 +1). 남은 안전 컬럼으로 이동해야 한다.
          const pool = [...Array(cols).keys()];
          const nDanger = Math.min(cols - 2, (P.dangerCols || 3) + (this.enraged ? 1 : 0));
          this.rainCols = [];
          for (let k = 0; k < nDanger; k++) this.rainCols.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
          this.rainCols.sort((a, b) => a - b);
          this.rainColN = cols;
          this.rainWarnT = P.warnSec;
          this.rainStrikes = P.strikes;
          this.fanT = P.warnSec;   // 예고가 끝난 뒤 첫 낙하
        } else {
          // 낙하: 위험 컬럼에만 밀집 잉걸(안전 컬럼은 비운다). 살짝 안쪽으로 유도해 컬럼 경계에서도 압박.
          const colW = world.logicalW / this.rainColN;
          for (const c of this.rainCols) {
            const cx = colW * (c + 0.5);
            for (let j = 0; j < (P.perCol || 2); j++) {
              const px = cx + (Math.random() - 0.5) * colW * 0.66;
              world.spawnEnemyBullet(new EnemyShot(px, this.y - this.r * 0.5 - Math.random() * 46, (Math.random() - 0.5) * 22, P.speed, { ...fanOpts, r: 7 }));
            }
          }
          this.rainStrikes -= 1;
          this.fanT = this.rainStrikes > 0 ? (P.strikeInterval || 0.13) : (P.gapSec || 1.3);
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
    // 융단 폭격 예고: 위험 컬럼을 붉은 맥동 기둥으로 표시(안전 컬럼으로 이동 안내). rainWarnT 동안만.
    if (this.rainWarnT > 0 && this.rainCols && this.rainCols.length) {
      const colW = this.logicalW / this.rainColN;
      const pulse = 0.5 + 0.5 * Math.abs(Math.sin(this.t * 9));
      ctx.save();
      for (const c of this.rainCols) {
        const cx = colW * (c + 0.5), halfW = colW * 0.42;
        const g = ctx.createLinearGradient(0, this.y, 0, this.y + 1100);
        g.addColorStop(0, `rgba(255,64,44,${0.06 + pulse * 0.20})`); g.addColorStop(1, 'rgba(255,64,44,0)');
        ctx.fillStyle = g; ctx.fillRect(cx - halfW, this.y, halfW * 2, 1100);
        ctx.fillStyle = `rgba(255,96,64,${0.45 + pulse * 0.45})`; ctx.fillRect(cx - halfW, this.y - 5, halfW * 2, 6);   // 상단 경고 바
      }
      ctx.restore();
    }
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

// ── B7 하이브 퀸: 여러 마리 복제가 아니라 부위가 차례로 파괴되는 단일 최종 보스 ──
export class HiveQueen extends Boss {
  constructor(logicalW, rateMult = 1, stage = 1, sizeMul = 1) {
    super(logicalW, rateMult, stage, sizeMul, 'B7');
    this.hivePhase = 1; // 1 산란낭 → 2 왕관 → 3 심장 → 4 탈출 코어
    this.phaseFlashT = 0;
  }

  sprite() { return getSprite('B7') || super.sprite(); }

  _updateHivePhase(world) {
    const ratio = this.hp / this.maxHp;
    const next = ratio > 0.68 ? 1 : ratio > 0.38 ? 2 : ratio > 0.12 ? 3 : 4;
    if (next === this.hivePhase) return;
    this.hivePhase = next;
    this.phaseFlashT = 0.75;
    if (next >= 2) this.minionT = Infinity; // 산란낭 파괴 뒤에는 소환 대신 직접 패턴으로 전환
    const labels = ['', '', '산란낭 파괴 · 왕관 방어', '왕관 파괴 · 심장 노출', '탈출 코어 분리'];
    world.effects.text(this.x, this.y - 72, labels[next], next >= 3 ? '#ff9c41' : '#ff79c8', 17);
    world.effects.burst(this.x, this.y, '#ff4cd2', 28, 220);
    world.effects.ring(this.x, this.y, '#ff9c41');
    world.effects.flash(next === 4 ? 0.32 : 0.2);
  }

  update(dt, world) {
    this._updateHivePhase(world);
    if (this.phaseFlashT > 0) this.phaseFlashT = Math.max(0, this.phaseFlashT - dt);
    super.update(dt, world);
    if (this.hivePhase === 4 && this.y >= this.targetY) {
      // 마지막은 큰 탄막 대신 빠른 추격 코어가 좌우 안전지대를 흔든다.
      this.x = Math.max(42, Math.min(this.logicalW - 42, this.homeX + Math.sin(this.t * 2.4) * this.logicalW * 0.32));
    }
  }

  fireSignature(world) {
    if (this.hivePhase === 1) { super.fireSignature(world); return; }
    const B = BAL.boss;
    const base = { r: 6, dmgPct: B.fanDamagePct, dmgMin: B.fanDamageMin, color: '#ff79c8', shape: 'orb' };
    if (this.hivePhase === 2) {
      // 왕관 방어: 회전 고리에서 플레이어 방향 약 60도는 비워 읽을 수 있는 탈출구를 만든다.
      this.fanT = this.interval(B.fanInterval * 0.82);
      const gap = Math.atan2(world.squad.x - this.x, world.squad.y - this.y);
      for (let i = 0; i < 18; i++) {
        const a = (i / 18) * Math.PI * 2 + this.t * 0.35;
        const d = Math.abs(((a - gap + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (d < Math.PI / 6) continue;
        world.spawnEnemyBullet(new EnemyShot(this.x, this.y, Math.sin(a) * 145, Math.cos(a) * 145, base));
      }
      return;
    }
    if (this.hivePhase === 3) {
      // 심장 노출: 현재 위치를 읽고 피하는 추적 3연사. 단순 탄 수 증가는 하지 않는다.
      this.fanT = this.interval(B.fanInterval * 0.68);
      for (const deg of [-14, 0, 14]) {
        const aim = Math.atan2(world.squad.x - this.x, world.squad.y - this.y) + deg * Math.PI / 180;
        world.spawnEnemyBullet(new EnemyShot(this.x, this.y + 22, Math.sin(aim) * 220, Math.cos(aim) * 220, { ...base, r: 7, color: '#ff9c41', shape: 'needle' }));
      }
      return;
    }
    this.fanT = this.interval(0.72);
    const aim = Math.atan2(world.squad.x - this.x, world.squad.y - this.y);
    for (const deg of [-7, 0, 7]) {
      const a = aim + deg * Math.PI / 180;
      world.spawnEnemyBullet(new EnemyShot(this.x, this.y + 12, Math.sin(a) * 270, Math.cos(a) * 270, { ...base, r: 5, color: '#fff0a8', shape: 'needle' }));
    }
  }

  draw(ctx) {
    if (this.dying) { this.drawDying(ctx, BAL.bossDeath.duration); return; }
    // Gate 0 R4/§8: 신규 B7 단일 여왕 베이스를 모든 페이즈에서 유지. 구형 부위 이미지를
    // (좌표가 다른) 위에 겹치지 않는다. 산란낭·왕관·심장 상태는 국소 VFX로만 표현.
    const base = getSprite('B7');
    if (!base) { super.draw(ctx); return; }
    const sc = this.drawScale || 1;
    const w = base.logicalW * sc, h = base.logicalH * sc;
    ctx.save(); ctx.translate(this.x, this.y);
    if (this.hivePhase < 4) {
      blit(ctx, base, 0, 0, sc);                                  // 항상 100% 여왕 베이스
      const lx = -w * 0.30, rx = w * 0.30, ey = h * 0.08, er = w * 0.16;
      if (this.hivePhase === 1) {
        // 산란낭 활성: 좌우에 주황 맥동(소환 근원임을 학습)
        const pu = 0.5 + 0.3 * Math.sin(this.t * 3.5);
        bossGlow(ctx, lx, ey, er, 'rgba(255,150,60,1)', pu);
        bossGlow(ctx, rx, ey, er, 'rgba(255,150,60,1)', 0.5 + 0.3 * Math.sin(this.t * 3.5 + 1));
      } else {
        // 산란낭 파괴: 좌우 국소 암전+균열
        bossPartDamage(ctx, lx, ey, er, this.t, '#ff9c41');
        bossPartDamage(ctx, rx, ey, er, this.t + 1.1, '#ff9c41');
      }
      // 왕관: 페이즈 ≤2 금빛 발광, 페이즈 3 파괴(금빛 팁 암전+균열)
      const cy = -h * 0.34, cr = w * 0.24;
      if (this.hivePhase <= 2) bossGlow(ctx, 0, cy, cr, 'rgba(255,225,122,1)', 0.35 + 0.12 * Math.sin(this.t * 3));
      else bossPartDamage(ctx, 0, cy, cr, this.t + 0.6, '#ffe17a');
      // 심장: 페이즈 3+ 중앙 주황 맥동(노출 약점)
      if (this.hivePhase >= 3) bossGlow(ctx, 0, h * 0.02, w * 0.2, 'rgba(255,120,50,1)', 0.6 + 0.28 * Math.sin(this.t * 6));
    } else {
      // 4단계 탈출 코어만 별도 개체로 (§8 허용)
      const core = getSprite('B7_ESCAPE');
      if (core) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; blit(ctx, core, 0, 0, 0.82 + Math.sin(this.t * 8) * 0.05); ctx.restore(); }
      else bossGlow(ctx, 0, 0, w * 0.2, 'rgba(255,150,60,1)', 0.7 + 0.25 * Math.sin(this.t * 8));
    }
    if (this.phaseFlashT > 0) {
      const fx = getSprite('VFX_BOSS_BREAK');
      if (fx) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = this.phaseFlashT / 0.75; blit(ctx, fx, 0, 0, sc * 1.15); ctx.restore(); }
    }
    ctx.restore();
  }
}

// ── B22 네온 아비터: 탄막 안전 틈 graze / 3단 랜스로 STAGGER → BREAK 상호작용형 보스 ──
// 일반 자동사격도 항상 100% 기본 피해. STAGGER는 처치 시간을 단축하는 보너스(완전 면역 아님).
export class NeonArbiter extends Boss {
  constructor(logicalW, rateMult = 1, stage = 1, sizeMul = 1) {
    super(logicalW, rateMult, stage, sizeMul, 'B22');   // 정체성 고정(korName '네온 아비터'·B22 패턴·스프라이트)
    this.arbiterPhase = 1;
    this.stagger = 0;
    this.breakT = 0;
    this.staggerCooldownT = 0;
    this.warning = null;          // GAP WALL 경고 { slots:[], t }
    this.signatureToggle = 0;     // 단계3 패턴 교대
    this.attackT = AR().wallInterval;
    this._lastSafe = [];          // 직전 안전 통로(3회 연속 동일 방지)
    this._lastStaggerAttack = null;
  }
  sprite() { return getSprite('B22') || null; }
  get intervalMult() { return this.arbiterPhase >= 3 ? AR().enrageIntervalMult : 1; }

  _staggerable() { return !this.dead && this.breakT <= 0 && this.staggerCooldownT <= 0; }

  /** STAGGER 적립 (attackId로 한 공격 중복 방지). 최대 도달 시 BREAK. */
  addStagger(n, world, attackId = null) {
    if (!this._staggerable()) return;
    if (attackId != null && attackId === this._lastStaggerAttack) return;
    if (attackId != null) this._lastStaggerAttack = attackId;
    this.stagger = Math.min(AR().staggerMax, this.stagger + n);
    world.effects.text(this.x + (Math.random() - 0.5) * 40, this.y - 30, `무력화 +${n}`, '#8affff', 12);
    if (this.stagger >= AR().staggerMax) this._enterBreak(world);
  }
  /** 보스에 누적 피해 → STAGGER 적립 (구 근접 회피 대체). HP의 dmgStaggerFrac마다 +1. */
  staggerFromDamage(dmg, world) {
    if (!this._staggerable()) return;
    const per = this.maxHp * AR().dmgStaggerFrac;
    this._staggerDmg = (this._staggerDmg || 0) + dmg;
    if (this._staggerDmg >= per) {
      const add = Math.floor(this._staggerDmg / per);
      this._staggerDmg -= add * per;
      this.addStagger(add, world, null);
    }
  }

  _enterBreak(world) {
    this.breakT = AR().breakDuration;
    this.stagger = 0;
    this.warning = null;                    // 진행 중 경고 취소
    world.effects.text(this.x, this.y - 40, '보스 무방비! 지금 집중 공격!', '#ffffff', 20);
    world.effects.ring(this.x, this.y, '#ffffff');
    world.effects.burst(this.x, this.y, '#ffffff', 24, 200);
    world.effects.flash(0.24);
  }

  _updatePhase(world) {
    const ratio = this.hp / this.maxHp;
    const p = ratio > 0.66 ? 1 : ratio > 0.33 ? 2 : 3;
    if (p !== this.arbiterPhase) {
      this.arbiterPhase = p;
      world.effects.text(this.x, this.y - 50, p === 3 ? '최종 패턴!' : `보스 패턴 ${p}단계`, '#b44cff', 16);
      world.effects.ring(this.x, this.y, '#b44cff');
    }
  }

  update(dt, world) {
    this.t += dt;
    const L = this.layout(world.logicalH);
    this.drawScale = L.scale; this.targetY = L.safeY;
    if (this.y < this.targetY) { this.y += 120 * dt; return; }
    this._updatePhase(world);
    // BREAK 중: 모든 공격·이동 정지, 받는 피해 ×1.25 (hitByBullet에서 처리), 종료 후 쿨다운
    if (this.breakT > 0) {
      this.breakT -= dt;
      if (this.breakT <= 0) { this.breakT = 0; this.staggerCooldownT = AR().staggerCooldown; }
      return;
    }
    if (this.staggerCooldownT > 0) this.staggerCooldownT = Math.max(0, this.staggerCooldownT - dt);
    // 완만한 좌우 이동 (BREAK 중엔 위 return으로 정지)
    const margin = L.halfW + 10;
    const rawX = this.homeX + Math.sin(this.t * 0.5) * this.logicalW * 0.14;
    this.x = Math.max(margin, Math.min(this.logicalW - margin, rawX));
    // 예약된 GAP WALL 경고 → 발사
    if (this.warning) {
      this.warning.t -= dt;
      if (this.warning.t <= 0) { this._fireWall(world, this.warning.slots); this.warning = null; }
    }
    // 공격 타이머 (단계별 패턴, 단계3은 간격 ×0.82)
    this.attackT -= dt;
    if (this.attackT <= 0 && !this.warning) this._startAttack(world);
  }

  _startAttack(world) {
    const C = AR();
    let useWall;
    if (this.arbiterPhase === 1) useWall = true;
    else if (this.arbiterPhase === 2) useWall = false;
    else useWall = (this.signatureToggle++ % 2 === 0);   // 단계3: 교대
    if (useWall) {
      // GAP WALL: 안전 통로 결정 + 경고선(0.65s) 예약. 경고 중 실탄 미발사.
      const safe = this._pickSafeSlot(world);
      this.warning = { slots: safe, t: C.wallTelegraph };
      this.attackT = C.wallInterval * this.intervalMult;
    } else {
      this._fireRing(world);
      this.attackT = C.ringInterval * this.intervalMult;
    }
  }

  /** 안전 통로 시작 슬롯(연속 2칸). 화면 밖 잘림 방지 + 3회 연속 동일 금지 + rng 재현성. */
  _pickSafeSlot(world) {
    const C = AR();
    const maxStart = C.wallCount - C.wallGapSlots;   // 0..6 (통로가 화면 안)
    const rng = world.rng || Math.random;
    let start;
    for (let tries = 0; tries < 8; tries++) {
      start = Math.floor(rng() * (maxStart + 1));
      const last = this._lastSafe;
      const threePeat = last.length >= 2 && last[last.length - 1] === start && last[last.length - 2] === start;
      if (!threePeat) break;
    }
    this._lastSafe.push(start);
    if (this._lastSafe.length > 3) this._lastSafe.shift();
    return start;
  }

  _fireWall(world, safeStart) {
    const C = AR();
    const slotW = this.logicalW / C.wallCount;
    const st = { r: 7, dmgPct: BAL.boss.fanDamagePct, dmgMin: BAL.boss.fanDamageMin, color: '#8affff', shape: 'orb' };
    for (let s = 0; s < C.wallCount; s++) {
      if (s >= safeStart && s < safeStart + C.wallGapSlots) continue;   // 안전 통로 비움
      const px = (s + 0.5) * slotW;
      world.spawnEnemyBullet(new EnemyShot(px, this.y + this.r * 0.4, 0, C.wallSpeed, st));
    }
  }

  _fireRing(world) {
    const C = AR();
    const st = { r: 6, dmgPct: BAL.boss.fanDamagePct, dmgMin: BAL.boss.fanDamageMin, color: '#b44cff', shape: 'ring' };
    // 편대 방향 ±35° 안에 빈 각도(≥55°)를 남긴다 (읽고 통과 가능하도록 느린 속도)
    const toSquad = Math.atan2(world.squad.x - this.x, world.squad.y - this.y);
    const rng = world.rng || Math.random;
    const gapCenter = toSquad + (rng() - 0.5) * (70 * Math.PI / 180);   // ±35°
    const gapHalf = (C.ringGapDeg * Math.PI / 180) / 2;
    for (let i = 0; i < C.ringCount; i++) {
      const a = (i / C.ringCount) * Math.PI * 2;
      let d = Math.abs(((a - gapCenter + Math.PI * 3) % (Math.PI * 2)) - Math.PI);  // 최소 각차
      if (d < gapHalf) continue;   // 빈 각도 유지 (샷캡 부족해도 gap 보존)
      world.spawnEnemyBullet(new EnemyShot(this.x, this.y, Math.sin(a) * C.ringSpeed, Math.cos(a) * C.ringSpeed, st));
    }
  }

  /** 받는 피해 배수(BREAK 중 ×1.25). 외부(코어루프 클램프)가 입력 산정에 미리 조회할 수 있게 노출. */
  damageTakenMult() { return this.breakT > 0 ? AR().breakDamageMult : 1; }

  hitByBullet(dmg, world, ctx = null) {
    // 받는피해 배수는 STAGGER 갱신 '전'에 확정한다 → 이 타격이 BREAK를 유발해도 여기엔 옛 배수를 적용하고
    //  1.25×는 '다음' 타격부터. 코어루프 클램프 래퍼도 같은 시점의 배수를 미리 읽으므로 예산과 실손실이 일치한다(Codex 5차).
    const mult = this.damageTakenMult();
    // 3단+ 원본 차지 랜스 직격 → STAGGER +2 (메아리·일반탄 제외, attackId 중복 방지)
    if (ctx && ctx.lance && ctx.stage >= 3 && !ctx.echo) this.addStagger(AR().lanceStagger, world, ctx.attackId);
    this.staggerFromDamage(dmg, world);                        // 누적 피해로 STAGGER (구 근접 회피 대체)
    super.hitByBullet(dmg * mult, world);                       // BREAK 중 받는 피해 ×1.25
  }

  draw(ctx) {
    if (this.dying) { this.drawDying(ctx, BAL.bossDeath.duration); return; }
    const sc = this.drawScale || 1;
    const R = this.r * sc;
    const broken = this.breakT > 0;
    const p3 = this.arbiterPhase >= 3;
    ctx.save();
    ctx.translate(this.x, this.y);
    // Gate 0 R4: 신규 B22 단일 베이스를 모든 페이즈에서 100% 유지. 고리·양팔을 통째로 숨겨
    // 실루엣을 바꾸지 않는다. 손상은 국소 균열·발광·암전 VFX로만 표현한다.
    const base = getSprite('B22');
    if (base) {
      const w = base.logicalW * sc, h = base.logicalH * sc;
      blit(ctx, base, 0, 0, sc);                                   // 항상 100% 베이스
      // 중앙 판결 코어 맥동
      const corePulse = broken ? 0.95 : 0.5 + 0.28 * Math.sin(this.t * 5);
      bossGlow(ctx, 0, 0, w * 0.17, 'rgba(255,248,210,1)', corePulse);
      // STAGGER 누적 → 중앙 균열 발광 강화 (베이스 삭제 없이)
      const st = this.stagger / AR().staggerMax;
      if (st > 0 || broken) bossGlow(ctx, 0, 0, w * 0.27, 'rgba(255,120,90,1)', broken ? 0.9 : Math.min(0.62, st * 0.62));
      // 페이즈 2·3: 좌·우 무장 무력화 = 국소 균열/암전 (부위 통째 소거 금지)
      if (this.arbiterPhase >= 2) bossPartDamage(ctx, -w * 0.33, h * 0.03, w * 0.17, this.t, '#57e0ff');       // 왼팔 손상
      if (this.arbiterPhase >= 3) bossPartDamage(ctx, w * 0.33, h * 0.03, w * 0.17, this.t + 1.4, '#ff4cd2');   // 우팔 손상
      if (broken) {
        const fx = getSprite('VFX_BOSS_BREAK');
        if (fx) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.45 + 0.35 * Math.sin(this.t * 12); blit(ctx, fx, 0, 0, sc); ctx.restore(); }
        else bossGlow(ctx, 0, 0, w * 0.42, 'rgba(255,255,255,1)', 0.3 + 0.35 * Math.abs(Math.sin(this.t * 20)));
      }
    } else {
    // 외곽 링 (단계3 붉은색, 그 외 청록) — 색+텍스트(HUD) 병행
    ctx.globalAlpha = broken ? 0.4 + 0.4 * Math.sin(this.t * 40) : 0.5;
    ctx.strokeStyle = p3 ? COLORS.danger : '#57e0ff';
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.arc(0, 0, R * 1.5, 0, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    // 회전 저울 팔 (청록 좌 / 자홍 우) — BREAK 중 정지 + 흰색 점멸
    const arm = broken ? this._breakArm : (this._breakArm = this.t * 1.2);
    for (const [dir, col] of [[-1, '#57e0ff'], [1, '#ff4cd2']]) {
      ctx.save();
      ctx.rotate(arm + (dir < 0 ? 0 : Math.PI));
      ctx.strokeStyle = broken ? '#ffffff' : col;
      ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(R * 1.3, 0); ctx.stroke();
      ctx.fillStyle = broken ? '#ffffff' : col;
      ctx.beginPath(); ctx.arc(R * 1.3, 0, 8, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
    // 중앙 판결 코어 (흰색) + STAGGER 비례 균열
    ctx.fillStyle = broken ? '#ffffff' : '#f5f7ff';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.6, 0, Math.PI * 2); ctx.fill();
    const cracks = Math.round((this.stagger / AR().staggerMax) * 6);
    ctx.strokeStyle = '#1a2030'; ctx.lineWidth = 2;
    for (let i = 0; i < cracks; i++) {
      const a = (i / 6) * Math.PI * 2 + this.t * 0.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(Math.sin(a) * R * 0.6, Math.cos(a) * R * 0.6); ctx.stroke();
    }
    ctx.fillStyle = p3 ? COLORS.danger : '#b44cff';
    ctx.beginPath(); ctx.arc(0, 0, R * 0.22, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    // GAP WALL 경고선 (위험 슬롯에 세로 맥동선) — 실탄 발사 전 시각 구분
    if (this.warning) {
      const C = AR();
      const slotW = this.logicalW / C.wallCount;
      ctx.save();
      ctx.globalAlpha = 0.3 + 0.4 * Math.sin(this.t * 12);
      ctx.strokeStyle = COLORS.danger; ctx.lineWidth = 3;
      for (let s = 0; s < C.wallCount; s++) {
        if (s >= this.warning.slots && s < this.warning.slots + C.wallGapSlots) continue;
        const px = (s + 0.5) * slotW;
        ctx.beginPath(); ctx.moveTo(px, this.y + this.r); ctx.lineTo(px, this.y + this.r + 220); ctx.stroke();
      }
      ctx.restore();
    }
  }
}

/** 보스 생성: bossIdOverride(캠페인/엔드리스 순서)가 있으면 그 ID로, 없으면 로스터 순환. B22=네온 아비터(단독). */
export function makeBoss(logicalW, rateMult, stage, sizeMul = 1, bossIdOverride = null) {
  const def = bossIdOverride ? bossDefById(bossIdOverride) : bossDefFor(stage);
  if (def.id === 'B22') return new NeonArbiter(logicalW, rateMult, stage, sizeMul);
  if (def.id === 'B7') return new HiveQueen(logicalW, rateMult, stage, sizeMul);
  return new Boss(logicalW, rateMult, stage, sizeMul, bossIdOverride);
}
