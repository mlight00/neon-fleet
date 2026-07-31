import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  makeChaseCamera, projectPoint3D, worldXToScreenX, screenXToWorldX,
  worldToX3, worldToZ3, buildSnapshot, computeSceneModel, SCALE_X, SCALE_Z,
} from '../js/chase3d-mapping.js';

// §8·§12.3 좌표 계약. mapping 은 순수(Three.js·DOM 미의존)라 실제 A/B·좌표·역변환을 Node 에서 그대로 검증.
const VPS = [[390, 844], [800, 450], [821, 462], [907, 510], [1280, 720], [1920, 1080]];
const SQX = 240, SQY = 660;

test('C3D-coord: 좌표 방향·크기(§8) — 플레이어 상대 X, 앞쪽 +Z', () => {
  assert.equal(worldToX3(SQX, SQX), 0, '기함은 X=0');
  assert.ok(worldToX3(SQX + 100, SQX) > 0 && worldToX3(SQX - 100, SQX) < 0, '오른쪽 +X, 왼쪽 −X');
  assert.equal(worldToX3(SQX + 100, SQX), 100 * SCALE_X, '크기 = Δ*SCALE_X');
  // worldY 작음(앞) = +Z 큼(멀다), worldY=squadY = Z 0
  assert.ok(worldToZ3(80, SQY) > worldToZ3(600, SQY), '앞쪽이 더 먼 +Z');
  assert.equal(worldToZ3(SQY, SQY), 0, '기함 깊이 0');
  assert.equal(worldToZ3(SQY - 100, SQY), 100 * SCALE_Z, '앞 100 = +Z 100*SCALE_Z');
});

test('C3D-perspective: 가까운 대상이 더 크고 화면 아래(원근)', () => {
  const cam = makeChaseCamera(480, 800, 1);
  const near = projectPoint3D(cam, 0, 0, worldToZ3(600, SQY));  // 플레이어 근처
  const far = projectPoint3D(cam, 0, 0, worldToZ3(80, SQY));    // 멀리 앞
  assert.ok(far.sy < near.sy, '먼 것이 화면 위(작은 sy)');
});

test('C3D-inverse: 입력 역변환 왕복 ≤2px, 6뷰포트 × 좌/중/우(§8·§12.3·§16)', () => {
  let maxErr = 0, worst = '';
  for (const [W, H] of VPS) {
    for (const t of [0, 0.5, 1]) {   // 전환 중 t 도 정확해야(§8 빠른 전환에도 안 튐)
      const cam = makeChaseCamera(W, H, t);
      for (const wx of [SQX - 220, SQX - 100, SQX, SQX + 100, SQX + 220]) {
        const sx = worldXToScreenX(cam, wx, SQX);
        const back = screenXToWorldX(cam, sx, SQX);
        const err = Math.abs(back - wx);
        if (err > maxErr) { maxErr = err; worst = `${W}x${H} t=${t} wx=${wx} err=${err.toFixed(4)}`; }
      }
    }
  }
  assert.ok(maxErr <= 2, `입력 역변환 최대 오차 ${maxErr.toFixed(4)}px ≤ 2 (worst ${worst})`);
});

test('C3D-center: 화면 중앙 → 기함 worldX(모든 뷰포트)', () => {
  for (const [W, H] of VPS) {
    const cam = makeChaseCamera(W, H, 1);
    const wc = screenXToWorldX(cam, W / 2, SQX);
    assert.ok(Math.abs(wc - SQX) <= 2, `${W}x${H}: 중앙→${wc.toFixed(2)} (기함 ${SQX})`);
  }
});

test('C3D-finite: 전환 t=0..1 내 투영이 항상 유한(§12.3)', () => {
  for (const [W, H] of VPS) {
    for (let t = 0; t <= 1.0001; t += 0.1) {
      const cam = makeChaseCamera(W, H, t);
      for (const [x, y, z] of [[0, 0, 0], [5, 0.5, 20], [-8, 0.2, 3], [0, 0.6, 30]]) {
        const p = projectPoint3D(cam, x, y, z);
        assert.ok(Number.isFinite(p.sx) && Number.isFinite(p.sy), `유한 ${W}x${H} t=${t}`);
      }
    }
  }
});

// §12.2 결정성의 기반: buildSnapshot + computeSceneModel 은 살아있는 상태를 "읽기만" 한다.
//  deep-freeze 한 world 를 통과시켜도 예외가 없어야(= 쓰기 시도 없음). 실클래스 검증은 chase3d-real-snapshot.test.mjs.
test('C3D-readonly-base: frozen world 로 buildSnapshot+computeSceneModel 무예외·유한', () => {
  const offs = [{ x: 0.9, y: 0.1, phase: 0 }, { x: -0.8, y: -0.3, phase: 1.7 }, { x: 0.2, y: 0.95, phase: 3.4 }];
  const run = {  // Opus5 §5 수정 후 실게임 필드 형태(isEnemy·_offsets·width·spriteId)
    squad: { x: SQX, y: SQY, tier: 0, count: 3, cruisers: 2, vx: -60, bank: -0.2, t: 0.5, width: 60, _offsets: offs, dead: false },
    bosses: [{ spriteId: 'B8', x: SQX, y: 120, hp: 500, maxHp: 1000, r: 60 }],
    world: { entities: [{ constructor: { name: 'Creature' }, isEnemy: true, x: 180, y: 300, r: 14 }, { constructor: { name: 'Sniper' }, isEnemy: true, x: 320, y: 200, r: 16 }], bullets: [{ x: 240, y: 500, prevY: 560, r: 3 }], enemyBullets: [{ x: 300, y: 250, r: 4 }] },
  };
  deepFreeze(run);
  const snap = buildSnapshot(run);
  deepFreeze(snap);
  const model = computeSceneModel(snap);
  const all = [model.flagship, ...model.drones, ...model.enemies, ...model.bosses, ...model.bullets, ...model.enemyBullets, ...model.cruisers, ...model.pickups];
  for (const o of all) if (o) for (const k of ['x', 'y', 'z']) assert.ok(Number.isFinite(o[k]), `유한 ${k}`);
  assert.equal(model.enemies.filter((e) => e.kind === 'b4').length, 1, 'B4 분류');
  assert.equal(model.enemies.filter((e) => e.kind === 'b1').length, 1, 'B1 분류');
  assert.ok(model.drones.length > 0, '실드론 공식(§5.1)이 frozen squad 에서도 동작');
});

function deepFreeze(o) { if (o && typeof o === 'object') { for (const v of Object.values(o)) deepFreeze(v); Object.freeze(o); } }
