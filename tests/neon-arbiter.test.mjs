import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NeonArbiter, Boss, makeBoss } from '../js/bosses.js';
import { bossDefFor, BOSS_ROSTER } from '../js/sprites.js';
import { BAL } from '../js/balance.js';

const AR = BAL.neonArbiter;
const noop = () => {};
function makeWorld(arb) {
  let rngState = 12345;
  return {
    squad: { x: 240, y: 640 }, logicalW: 480, logicalH: 776,
    entities: [], enemyBullets: [], bosses: arb ? [arb] : [], mfx: {}, stageMods: { enemyHp: 1, shotCap: 999 },
    rng: () => { rngState = (rngState * 1103515245 + 12345) & 0x7fffffff; return rngState / 0x7fffffff; },
    spawnEntity(e) { this.entities.push(e); },
    spawnEnemyBullet(b) { if (this.enemyBullets.length < this.stageMods.shotCap) this.enemyBullets.push(b); },
    effects: { burst: noop, text: noop, ring: noop, halo: noop, muzzle: noop, flash: noop },
  };
}
// 아비터를 정착 상태로 만든다 (하강 완료)
function settled(stage = 30) {
  const a = new NeonArbiter(480, 1, stage, 1);
  a.y = a.targetY = 130; a.hp = a.maxHp = 10000;
  return a;
}

// ── 8.5 B22 ────────────────────────────────────────────────
test('bossDefFor 순환에 B22가 포함된다', () => {
  assert.ok(BOSS_ROSTER.some((b) => b.id === 'B22'));
  // 로스터 길이 주기 안에서 B22가 반드시 한 번 등장
  const ids = new Set();
  for (let s = 1; s <= BOSS_ROSTER.length; s++) ids.add(bossDefFor(s).id);
  assert.ok(ids.has('B22'));
});

test('makeBoss는 B22 스테이지에 NeonArbiter(단독)를 만든다', () => {
  const stage = 1 + BOSS_ROSTER.findIndex((b) => b.id === 'B22');   // B22가 나오는 스테이지
  const b = makeBoss(480, 1, stage, 1);
  assert.ok(b instanceof NeonArbiter);
  // 그 외 스테이지는 일반 Boss
  assert.ok(!(makeBoss(480, 1, 1, 1) instanceof NeonArbiter));
});

test('B22는 arbiter 상태(stagger/breakT)를 갖는다', () => {
  const a = settled();
  assert.equal(a.stagger, 0);
  assert.equal(a.breakT, 0);
  assert.equal(a.arbiterPhase, 1);
});

test('HP 비율에 따라 단계 1→2→3 전환', () => {
  const a = settled(); const w = makeWorld(a);
  a.hp = a.maxHp * 0.8; a._updatePhase(w); assert.equal(a.arbiterPhase, 1);
  a.hp = a.maxHp * 0.5; a._updatePhase(w); assert.equal(a.arbiterPhase, 2);
  a.hp = a.maxHp * 0.2; a._updatePhase(w); assert.equal(a.arbiterPhase, 3);
});

test('GAP WALL은 항상 연속 안전 슬롯 2개를 남기고, 통로 폭 ≥72px', () => {
  const a = settled(); const w = makeWorld(a);
  const start = a._pickSafeSlot(w);
  a._fireWall(w, start);
  // 발사된 탄의 슬롯 인덱스 집합
  const slotW = 480 / AR.wallCount;
  const firedSlots = new Set(w.enemyBullets.map((b) => Math.floor(b.x / slotW)));
  for (let s = start; s < start + AR.wallGapSlots; s++) assert.ok(!firedSlots.has(s), `슬롯 ${s} 안전(빈칸)`);
  assert.ok(AR.wallGapSlots * slotW >= AR.wallMinGapPx, `통로 ${AR.wallGapSlots * slotW}px ≥ ${AR.wallMinGapPx}`);
  assert.ok(start >= 0 && start + AR.wallGapSlots <= AR.wallCount, '통로가 화면 안');
});

test('안전 통로가 3회 연속 같은 위치로 나오지 않는다', () => {
  const a = settled(); const w = makeWorld(a);
  const seq = [];
  for (let i = 0; i < 40; i++) seq.push(a._pickSafeSlot(w));
  for (let i = 2; i < seq.length; i++) assert.ok(!(seq[i] === seq[i - 1] && seq[i] === seq[i - 2]), `3연속 동일 @${i}`);
});

test('BROKEN RING은 최소 55도 빈 각도를 남긴다', () => {
  const a = settled(); const w = makeWorld(a);
  a._fireRing(w);
  const angles = w.enemyBullets.map((b) => Math.atan2(b.vx, b.vy)).sort((x, y) => x - y);
  // 인접 각 간 최대 간격이 gap 이상
  let maxGap = 0;
  for (let i = 0; i < angles.length; i++) {
    const next = i + 1 < angles.length ? angles[i + 1] : angles[0] + Math.PI * 2;
    maxGap = Math.max(maxGap, next - angles[i]);
  }
  assert.ok(maxGap >= (AR.ringGapDeg * Math.PI / 180) - 1e-6, `빈 각도 ${maxGap * 180 / Math.PI}° ≥ ${AR.ringGapDeg}°`);
});

test('동일 RNG 시 GAP WALL 패턴이 재현된다', () => {
  const a1 = settled(), a2 = settled();
  const w1 = makeWorld(a1), w2 = makeWorld(a2);
  const s1 = [], s2 = [];
  for (let i = 0; i < 10; i++) { s1.push(a1._pickSafeSlot(w1)); s2.push(a2._pickSafeSlot(w2)); }
  assert.deepEqual(s1, s2);
});

test('graze 1회는 STAGGER +1', () => {
  const a = settled(); const w = makeWorld(a);
  a.onPlayerGraze(w);
  assert.equal(a.stagger, AR.grazeStagger);
});

test('일반 자동사격(탄환 ctx)은 STAGGER를 올리지 않는다', () => {
  const a = settled(); const w = makeWorld(a);
  a.hitByBullet(50, w, { x: 240 });   // 일반 탄환 문맥
  assert.equal(a.stagger, 0);
});

test('3단+ 원본 랜스는 STAGGER +2, 메아리(echo)는 안 올림', () => {
  const a = settled(); const w = makeWorld(a);
  a.hitByBullet(50, w, { lance: true, stage: 3, echo: false, attackId: 1 });
  assert.equal(a.stagger, AR.lanceStagger);
  a.hitByBullet(50, w, { lance: true, stage: 3, echo: true, attackId: 2 });   // 메아리
  assert.equal(a.stagger, AR.lanceStagger);   // 그대로
});

test('동일 attackId는 중복 STAGGER를 주지 않는다', () => {
  const a = settled(); const w = makeWorld(a);
  a.hitByBullet(50, w, { lance: true, stage: 3, echo: false, attackId: 7 });
  a.hitByBullet(50, w, { lance: true, stage: 3, echo: false, attackId: 7 });   // 같은 공격
  assert.equal(a.stagger, AR.lanceStagger);   // 한 번만
});

test('STAGGER 최대에서 BREAK 시작(1.6s) + STAGGER 0', () => {
  const a = settled(); const w = makeWorld(a);
  for (let i = 0; i < AR.staggerMax; i++) a.onPlayerGraze(w);
  assert.ok(Math.abs(a.breakT - AR.breakDuration) < 1e-9);
  assert.equal(a.stagger, 0);
});

test('BREAK 중 받는 피해 ×1.25', () => {
  const a = settled(); const w = makeWorld(a);
  a.breakT = AR.breakDuration;
  const hp0 = a.hp;
  a.hitByBullet(100, w, { x: 240 });
  assert.ok(Math.abs((hp0 - a.hp) - 100 * AR.breakDamageMult) < 1e-9);
});

test('BREAK 중 공격 타이머가 진행되지 않는다(패턴 미발사)', () => {
  const a = settled(); const w = makeWorld(a);
  a.breakT = AR.breakDuration;
  const at0 = a.attackT;
  a.update(0.5, w);
  assert.equal(a.attackT, at0);          // 타이머 정지
  assert.equal(w.enemyBullets.length, 0); // 탄 미발사
});

test('BREAK 종료 후 2초 쿨다운 동안 STAGGER가 쌓이지 않는다', () => {
  const a = settled(); const w = makeWorld(a);
  a.breakT = 0.1;
  a.update(0.2, w);                       // BREAK 종료 → 쿨다운 진입
  assert.ok(a.staggerCooldownT > 0);
  a.onPlayerGraze(w);
  assert.equal(a.stagger, 0);             // 쿨다운 중 적립 차단
});

test('일반 사격만으로도 B22를 처치할 수 있다(완전 면역 없음)', () => {
  const a = settled(); const w = makeWorld(a);
  a.hp = a.maxHp = 500;
  let guard = 0;
  while (!a.dead && guard++ < 200) a.hitByBullet(50, w, { x: 240 });   // 일반 탄환만
  assert.equal(a.dead, true);
});
