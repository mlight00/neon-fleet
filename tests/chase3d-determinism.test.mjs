import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildSnapshot, computeSceneModel } from '../js/chase3d-mapping.js';

// 합성 read-only 불변 검증(정직 라벨: Opus5 §5.3 — 이것은 "실게임 600프레임 결정성"이 아니다).
//  실제 sync 경로(buildSnapshot+computeSceneModel)를 600프레임 굴려 (a) sync 전후 상태 지문 불변
//  (b) 3D-on(A)==3D-off(B) 를 확인한다. 실클래스 전후 deep 비교는 chase3d-real-snapshot.test.mjs,
//  실게임 시드 고정 600프레임 A/B 는 브라우저 QA(보고서 §7)에서 수행한다.
const OFFS = [{ x: 0.9, y: 0.1, phase: 0 }, { x: -0.8, y: -0.3, phase: 1.7 }, { x: 0.2, y: 0.95, phase: 3.4 }];
function makeWorld() {
  return {
    squad: { x: 240, y: 660, tier: 0, count: 3, cruisers: 2, vx: 0, bank: 0, t: 0, width: 60, _offsets: OFFS, dead: false },
    bosses: [{ spriteId: 'B8', x: 240, y: 120, hp: 800, maxHp: 1000, r: 60, dead: false }],
    world: {
      entities: [
        { constructor: { name: 'Creature' }, isEnemy: true, x: 160, y: 300, r: 14, dead: false },
        { constructor: { name: 'Sniper' }, isEnemy: true, x: 320, y: 220, r: 16, dead: false },
        { constructor: { name: 'TriGate' }, y: 400, dead: false, laneRect: (i) => ({ x: i * 160, y: 390, w: 160, h: 24 }) },
      ],
      bullets: [{ x: 240, y: 500, prevY: 560, r: 3, dead: false }],
      enemyBullets: [{ x: 300, y: 250, r: 4, dead: false }],
    },
  };
}
function advance(w, f) {   // 같은 f → 같은 전개(결정적). A/B 에 동일 적용.
  w.squad.x = 240 + Math.sin(f * 0.05) * 120; w.squad.vx = Math.cos(f * 0.05) * 120; w.squad.y = 640 + Math.sin(f * 0.1) * 10; w.squad.t = f * 0.016;
  for (const b of w.bosses) { b.y = 120 + Math.sin(f * 0.03) * 40; b.hp = Math.max(0, b.hp - 1); b.dead = b.hp <= 0; }
  for (const e of w.world.entities) if (e.x != null) e.y = (e.y + 3) % 800;
  for (const b of w.world.bullets) { b.prevY = b.y; b.y = b.y <= 0 ? 700 : b.y - 8; }
  for (const b of w.world.enemyBullets) b.y = b.y > 800 ? 0 : b.y + 6;
}
function fingerprint(w) {
  return JSON.stringify({
    sq: [round(w.squad.x), round(w.squad.y), w.squad.count, w.squad.dead, round(w.squad.vx)],
    boss: w.bosses.map((b) => [round(b.x), round(b.y), b.hp, b.dead]),
    ent: w.world.entities.filter((e) => e.x != null).map((e) => [round(e.x), round(e.y), !!e.dead]),
    bul: w.world.bullets.map((b) => [round(b.x), round(b.y), round(b.prevY)]),
    eb: w.world.enemyBullets.map((b) => [round(b.x), round(b.y)]),
  });
}
const round = (n) => Math.round(n * 1000) / 1000;

test('C3D-determinism: 600프레임 3D sync 는 2D 상태를 바꾸지 않음, on==off(§12.2)', () => {
  const A = makeWorld(), B = makeWorld();   // A=3D on(sync 호출), B=3D off(미호출)
  let syncFrames = 0;
  for (let f = 0; f < 600; f++) {
    advance(A, f); advance(B, f);
    const before = fingerprint(A);
    // 실제 3D sync 실행(3D on 경로)
    const snap = buildSnapshot(A);
    const model = computeSceneModel(snap);
    syncFrames++;
    // 유한값(§9.2)
    for (const o of [model.flagship, ...model.drones, ...model.enemies, ...model.bosses, ...model.bullets]) if (o) assert.ok(Number.isFinite(o.x) && Number.isFinite(o.y) && Number.isFinite(o.z), `f${f} finite`);
    // (a) sync 전후 A 의 2D 상태 지문 불변 → sync 는 상태를 안 바꾼다
    assert.equal(fingerprint(A), before, `f${f}: sync 전후 상태 불변`);
    // (b) 3D on(A) == 3D off(B) → 결정성 동일
    assert.equal(fingerprint(A), fingerprint(B), `f${f}: 3D on == off`);
  }
  assert.equal(syncFrames, 600, '600프레임 실제 실행');
});

test('C3D-determinism-frozen: deep-freeze 한 상태로도 sync 무예외(쓰기 물리 차단)', () => {
  const w = makeWorld();
  deepFreeze(w);
  let threw = null;
  try { computeSceneModel(buildSnapshot(w)); } catch (e) { threw = e; }
  assert.equal(threw, null, `frozen world 통과(쓰기 시도 0): ${threw && threw.message}`);
});

test('C3D-wiring: chase3d 렌더는 draw() 에서만, update() 에는 없음(§3.1 규칙불변)', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const s = main.indexOf('function update(dt) {');
  assert.ok(s > 0, 'update(dt) 존재');
  const rest = main.slice(s + 20);
  const e = rest.indexOf('\nfunction ');
  const body = e > 0 ? rest.slice(0, e) : rest;
  assert.ok(!/chase3d\s*\.\s*frame|buildSnapshot|computeSceneModel/.test(body), 'update() 는 3D sync 미호출');
  assert.match(main, /chase3d\.frame\(run, camera\.current/);   // draw() 렌더 단계에서만 호출
});

function deepFreeze(o) { if (o && typeof o === 'object') { for (const v of Object.values(o)) deepFreeze(v); Object.freeze(o); } }
