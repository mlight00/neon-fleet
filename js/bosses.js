// 보스: 스테이지별 로스터 + 고유 공격 패턴 + 격파 연출.
// (entities.js에서 분리 — 신규 보스 추가 대비. EnemyShot 등 공용 개체는 entities.js에서 import)
import { BAL } from './balance.js';
import { COLORS, glow, blit } from './render.js';
import { bossDefFor, getSprite } from './sprites.js';
import { EnemyShot, Creature } from './entities.js';

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
