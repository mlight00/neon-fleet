// 대응형 신규 적 3종 (NEON ADAPTATION Phase 1). Canvas 네온 도형만으로 완전 플레이 가능.
// 기존 world 인터페이스 사용. hitByBullet(dmg, world, bullet=null) — bullet은 프리즘 코어 조준용(옵션).
import { BAL } from './balance.js';
import { COLORS } from './render.js';
import { circleHit } from './collision.js';
import { Scrolling, enemyDie, drawEHp } from './entities.js';
import { prismRoute, stageScale } from './adaptive-logic.js';

const AE = () => BAL.adaptiveEnemies;
const hpScale = (stage) => stageScale(stage, AE().hpPerStage, AE().hpScaleMax);

// ── 프리즘 워든: 정면 70% 감소 방어막 + 좌우 코어 2개. 측면 조준/차지로 뚫는다.
export class PrismWarden extends Scrolling {
  constructor(x, stage = 1) {
    const c = AE().prismWarden, s = hpScale(stage);
    super(x, -40);
    this.hp = this.maxHp = Math.round(c.hp * s); this.r = c.r; this.coin = c.coin;
    const ch = Math.round(c.coreHp * s);
    this.cores = [{ side: -1, hp: ch, max: ch }, { side: 1, hp: ch, max: ch }];
    this.isEnemy = true; this.dead = false; this.t = Math.random() * 10;
  }
  get shieldUp() { return this.cores.some((k) => k.hp > 0); }
  update(dt, world) {
    this.scroll(dt, world); this.t += dt;
    // 편대 방향으로 완만히 하강 유도(정면 유지 압박)
    const dx = world.squad.x - this.x;
    this.x += Math.sign(dx) * Math.min(Math.abs(dx), 40 * dt);
    if (this.offscreen(world)) this.dead = true;
  }
  hitByBullet(dmg, world, ctx = null) {
    const c = AE().prismWarden;
    if (!this.shieldUp) { this._body(dmg, world); return; }   // 방어막 해제 → 정상 피해
    const route = prismRoute(ctx, this.x, this.cores, c.coreOffset);  // ctx=탄환{x} | 랜스{lance,pierceDefense} | null
    if (route.hitCore >= 0) {
      const k = this.cores[route.hitCore]; k.hp -= dmg;
      world.effects.burst(this.x + k.side * c.coreOffset, this.y, '#b44cff', 4, 90);
      if (k.hp <= 0) world.effects.burst(this.x + k.side * c.coreOffset, this.y, '#ffffff', 10, 160);
      return;
    }
    // 본체: 랜스 강습3단+(full)은 전액, 그 외(정면·광역·일반 랜스)는 70% 감소
    this._body(route.full ? dmg : dmg * (1 - c.frontReduce), world);
  }
  _body(dmg, world) { this.hp -= dmg; if (this.hp <= 0) enemyDie(this, world, '#b44cff', this.coin); }
  draw(ctx) {
    const c = AE().prismWarden;
    // 본체
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.fillStyle = 'rgba(180,76,255,0.18)'; ctx.strokeStyle = '#b44cff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -this.r); ctx.lineTo(this.r * 0.9, this.r * 0.7); ctx.lineTo(-this.r * 0.9, this.r * 0.7); ctx.closePath(); ctx.fill(); ctx.stroke();
    // 정면 방어막 (코어 살아있을 때만)
    if (this.shieldUp) {
      ctx.globalAlpha = 0.35 + 0.15 * Math.sin(this.t * 4);
      ctx.strokeStyle = '#d9b3ff'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(0, this.r * 0.2, this.r * 1.15, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // 좌우 코어 (파괴 시 균열·회색)
    for (const k of this.cores) {
      const alive = k.hp > 0;
      ctx.fillStyle = alive ? '#ffd93d' : 'rgba(120,120,140,0.6)';
      ctx.beginPath(); ctx.arc(k.side * c.coreOffset, 0, alive ? 6 : 4, 0, Math.PI * 2); ctx.fill();
      if (!alive) { ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(k.side * c.coreOffset - 4, -3); ctx.lineTo(k.side * c.coreOffset + 4, 3); ctx.stroke(); }
    }
    ctx.restore();
    drawEHp(ctx, this);
  }
}

// ── 크리스탈 스캐빈저: 보상(크리스탈/수송선)을 훔쳐 도주. 처치=보상 ×1.5, 놓치면 손실.
export class Scavenger extends Scrolling {
  constructor(x, stage = 1) {
    const c = AE().scavenger;
    super(x, -30);
    this.hp = this.maxHp = Math.round(c.hp * hpScale(stage)); this.r = c.r; this.coin = c.coin;
    this.state = 'seek'; this.target = null; this.stored = 0; this.stayT = c.stayTime;
    this.isEnemy = true; this.dead = false; this.t = Math.random() * 10;
  }
  update(dt, world) {
    const c = AE().scavenger; this.t += dt;
    if (this.state === 'seek') {
      this.scroll(dt, world);   // 필드와 함께 하강 (스크롤하는 크리스탈과 보조를 맞춘 뒤 추격)
      if (!this.target || this.target.dead) this.pick(world);
      if (this.target) {
        const dx = this.target.x - this.x, dy = this.target.y - this.y, d = Math.hypot(dx, dy) || 1;
        this.x += (dx / d) * c.approach * dt; this.y += (dy / d) * c.approach * dt;
        if (d <= c.stealR) {           // 도달 → 보상 강탈 (실수령 드론 = 정상 파괴와 동일 기준)
          this.stored = this.target.getDroneReward ? this.target.getDroneReward(world) : (this.target.reward || 0);
          this.target.dead = true; this.target = null; this.state = 'flee';
          world.effects.text(this.x, this.y - 16, '강탈!', COLORS.danger, 13);
        }
      } else if ((this.stayT -= dt) <= 0) { this.state = 'flee'; }   // 대상 없으면 도주
    } else {                            // flee: 화면 위로 이탈
      this.y -= c.flee * dt; this.x += Math.sin(this.t * 3) * 40 * dt;
    }
    if (this.y < -40 || this.offscreen(world)) this.dead = true;   // 이탈 = 보상 놓침(지급 없음)
  }
  pick(world) {
    let best = null, bestD = 1e9;
    for (const e of world.entities) {
      if (e.dead || e.isEnemy || e.reward === undefined || (e.claimedBy && e.claimedBy !== this)) continue;
      const d = Math.hypot(e.x - this.x, e.y - this.y);
      if (d < bestD) { bestD = d; best = e; }
    }
    if (this.target && this.target.claimedBy === this) this.target.claimedBy = null;
    this.target = best; if (best) best.claimedBy = this;
  }
  hitByBullet(dmg, world) {
    this.hp -= dmg;
    if (this.hp > 0) return;
    this.dead = true;
    if (this.target && this.target.claimedBy === this) this.target.claimedBy = null;
    if (this.stored > 0) {  // 도주 전 처치 → 훔친 보상 ×1.5 회수
      world.squad.applyDelta(Math.round(this.stored * AE().scavenger.rewardMult), world, '보상 회수 ×1.5!');
    }
    enemyDie(this, world, '#57e0ff', this.coin);
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y);
    ctx.fillStyle = this.state === 'flee' ? '#ff7a7a' : '#57e0ff'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -this.r); ctx.lineTo(this.r, 0); ctx.lineTo(0, this.r); ctx.lineTo(-this.r, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (this.stored > 0) { ctx.fillStyle = '#ffd93d'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill(); }  // 훔친 보상 표시
    ctx.restore();
    drawEHp(ctx, this);
  }
}

// ── 게이트 패러사이트: 게이트 한 레인에 부착, 살아서 통과하면 연산 반전. 처치=정화 +드론.
export class GateParasite extends Scrolling {
  constructor(gate, infectedLane, stage = 1) {
    const c = AE().gateParasite;
    const side = infectedLane === 0 ? 'left' : 'right';
    const x = infectedLane === 0 ? gate.logicalW * 0.25 : gate.logicalW * 0.75;
    super(x, gate.y - c.offsetY);
    this.hp = this.maxHp = Math.round(c.hp * hpScale(stage)); this.r = c.r; this.coin = 4;
    this.gate = gate; this.side = side; this.isEnemy = true; this.dead = false; this.t = Math.random() * 10;
    gate.corruptSide = side;   // 게이트 감염
  }
  update(dt, world) {
    this.t += dt;
    if (!this.gate || this.gate.dead || this.gate.applied) { this.dead = true; return; }  // 게이트 소멸/통과 → 정리
    this.y = this.gate.y - AE().gateParasite.offsetY;   // 게이트에 위치 동기화
    this.x = this.side === 'left' ? this.gate.logicalW * 0.25 : this.gate.logicalW * 0.75;
  }
  hitByBullet(dmg, world) {
    this.hp -= dmg;
    if (this.hp > 0) return;
    this.dead = true;
    if (this.gate) this.gate.corruptSide = null;   // 정화 → 게이트 원상
    world.squad.applyDelta(AE().gateParasite.cleanseDrones, world, '정화!');
    enemyDie(this, world, '#7cff4c', this.coin);
  }
  draw(ctx) {
    ctx.save(); ctx.translate(this.x, this.y);
    const pulse = 0.6 + 0.4 * Math.sin(this.t * 6);
    ctx.globalAlpha = pulse; ctx.fillStyle = '#7cff4c'; ctx.strokeStyle = '#eaffea'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(0, 0, this.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.globalAlpha = 1;
    // 촉수(게이트로 연결) + 경고
    ctx.strokeStyle = '#7cff4c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, this.r); ctx.lineTo(0, AE().gateParasite.offsetY); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('⚠', 0, 4);
    ctx.restore();
    drawEHp(ctx, this);
  }
}
