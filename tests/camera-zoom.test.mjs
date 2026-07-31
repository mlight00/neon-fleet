import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_ZOOM, MIN_ZOOM, MAX_ZOOM, ZOOM_STOPS,
  normalizeZoom, clampZoom, safeZoom, stepZoom, advanceZoom, createCamera,
  worldToScreenX, screenToWorldX, worldToScreenPoint, screenToWorldPoint, visibleWorldBounds,
} from '../js/camera-zoom.js';

// P0-1: 순수 카메라 로직. 렌더/입력 좌표에만 쓰는 시각 배율(게임 규칙 불변).

test('CZ-01: 상수 — 4단계(이사): 100 일반 / 150 전술 확대 / 200 함미 추적 / 220 함미 근접', () => {
  assert.equal(DEFAULT_ZOOM, 1.00);
  assert.equal(MIN_ZOOM, 1.00);
  assert.equal(MAX_ZOOM, 2.20);
  assert.deepEqual(ZOOM_STOPS, [1.00, 1.50, 2.00, 2.20]);
});

test('CZ-02: clamp — 100 미만·220 초과 제한', () => {
  assert.equal(clampZoom(0.5), 1.00);
  assert.equal(clampZoom(3), 2.20);
  assert.equal(clampZoom(1.0), 1.0);
  assert.equal(clampZoom(1.60), 1.60);
  assert.equal(clampZoom(2.20), 2.20);
});

test('CZ-03: 정규화 = 가장 가까운 정착 배율로 스냅 (구 10% 격자 저장도 수렴)', () => {
  assert.equal(normalizeZoom(0.99999), 1.0);
  assert.equal(normalizeZoom(1.2), 1.0);
  assert.equal(normalizeZoom(1.3), 1.5);
  assert.equal(normalizeZoom(1.7), 1.5);
  assert.equal(normalizeZoom(1.8), 2.0);
  assert.equal(normalizeZoom(1.9), 2.0);
  assert.equal(normalizeZoom(2.05), 2.0);
  assert.equal(normalizeZoom(2.15), 2.2);
  for (const z of ZOOM_STOPS) assert.equal(normalizeZoom(z), z, `${z} 자기 자신`);
});

test('CZ-04: 휠 위=한 단계 확대 / 아래=한 단계 축소, 경계 정지', () => {
  assert.equal(stepZoom(1.0, +1), 1.5);
  assert.equal(stepZoom(1.5, +1), 2.0);
  assert.equal(stepZoom(2.0, +1), 2.2);
  assert.equal(stepZoom(2.2, +1), 2.2, '최대에서 더 확대 안 됨');
  assert.equal(stepZoom(2.2, -1), 2.0);
  assert.equal(stepZoom(2.0, -1), 1.5);
  assert.equal(stepZoom(1.5, -1), 1.0);
  assert.equal(stepZoom(1.0, -1), 1.0, '최소(100%)에서 더 축소 안 됨');
  // 100 → 220 경계 왕복
  let z = 1.0;
  for (let i = 0; i < 10; i++) z = stepZoom(z, +1);
  assert.equal(z, 2.20);
  for (let i = 0; i < 10; i++) z = stepZoom(z, -1);
  assert.equal(z, 1.00);
});

test('CZ-14: 정착 배율은 4개뿐(이사) — 180% 스왑 경계(t=0.5)에 머물 수 없다', () => {
  // 어떤 값에서 출발해도 스텝 결과는 항상 ZOOM_STOPS 안
  for (const v of [1.0, 1.3, 1.5, 1.7, 1.8, 1.9, 2.0, 2.1, 2.2]) {
    for (const d of [+1, -1, 0]) {
      const r = stepZoom(v, d);
      assert.ok(ZOOM_STOPS.includes(r), `stepZoom(${v},${d})=${r} ∈ 4단계`);
    }
  }
  assert.ok(!ZOOM_STOPS.includes(1.8), '180% 는 정착 목록에 없음');
  // 스텝 경로에 1.8이 나타나지 않음
  let z = 1.0; const path = [z];
  for (let i = 0; i < 10 && z < 2.2; i++) { z = stepZoom(z, +1); path.push(z); }
  assert.ok(!path.some((v) => Math.abs(v - 1.8) < 1e-9), `확대 경로에 180% 없음: ${path.join(',')}`);
  // 저장에 남은 180%(구버전 정착값) 로드 → 200% 로 수렴
  assert.equal(createCamera(1.8).current, 2.0);
  assert.equal(createCamera(1.8).target, 2.0);
});

test('CZ-05: 손상값 안전 복구 + 구 저장값 스냅(0.85 축소·10% 격자 → 4단계)', () => {
  assert.equal(safeZoom(NaN), 1.0);
  assert.equal(safeZoom(Infinity), 1.0);
  assert.equal(safeZoom(-Infinity), 1.0);
  assert.equal(safeZoom('abc'), 1.0);
  assert.equal(safeZoom(undefined), 1.0);
  assert.equal(safeZoom(null), 1.0);
  assert.equal(safeZoom(0.1), 1.0);    // 범위 밖 → 100%로 clamp
  assert.equal(safeZoom(9), 2.20);
  assert.equal(safeZoom('1.6'), 1.5);  // 숫자 문자열 파싱 후 가까운 단계로
  assert.equal(safeZoom(1.04), 1.0);
  assert.equal(safeZoom(0.85), 1.0, '구 85% 저장 → 100% 복구');
  assert.equal(safeZoom(0.95), 1.0, '구 95% 저장 → 100% 복구');
});

test('CZ-06: advanceZoom — dt 보간이 target으로 수렴, 오버슈트 없음', () => {
  let z = 1.0;
  const target = 1.30;
  for (let i = 0; i < 200; i++) z = advanceZoom(z, target, 1 / 60, false);
  assert.ok(Math.abs(z - target) < 1e-3, `수렴 ${z}`);
  assert.ok(z <= target + 1e-9, '오버슈트 없음');
  // 한 스텝은 target을 지나치지 않는다
  const one = advanceZoom(1.0, 1.30, 1 / 60, false);
  assert.ok(one > 1.0 && one < 1.30, `한 스텝 진행 ${one}`);
});

test('CZ-07: reduced-motion → 즉시 target', () => {
  assert.equal(advanceZoom(1.0, 1.30, 1 / 60, true), 1.30);
  assert.equal(advanceZoom(1.30, 0.85, 1 / 60, true), 0.85);
});

test('CZ-08: advanceZoom 근접 스냅 + dt≤0 안전', () => {
  assert.equal(advanceZoom(1.2999, 1.30, 1 / 60, false), 1.30, '근접 스냅');
  assert.equal(advanceZoom(1.1, 1.30, 0, false), 1.1, 'dt=0이면 정지');
  assert.equal(advanceZoom(1.1, 1.30, -1, false), 1.1, 'dt<0 방어');
  assert.equal(advanceZoom(NaN, 1.30, 1 / 60, false) === 1.30 || advanceZoom(NaN, 1.30, 1 / 60, false) > 1.0, true);
});

test('CZ-09: 주사율 독립 — 60Hz와 144Hz가 같은 실시간에 근사 수렴', () => {
  // 0.18초를 60Hz(11프레임)와 144Hz(26프레임)으로 각각 진행 → 최종값 근사 일치
  let a = 1.0, b = 1.0; const tgt = 1.30;
  for (let t = 0; t < 0.18; t += 1 / 60) a = advanceZoom(a, tgt, 1 / 60, false);
  for (let t = 0; t < 0.18; t += 1 / 144) b = advanceZoom(b, tgt, 1 / 144, false);
  assert.ok(Math.abs(a - b) < 0.02, `60Hz ${a.toFixed(4)} ≈ 144Hz ${b.toFixed(4)}`);
});

test('CZ-10: world↔screen 왕복 오차 ≤ 0.01 (다양한 배율·anchor)', () => {
  for (const zoom of [0.85, 1.0, 1.15, 1.30]) {
    for (const anchor of [{ x: 240, y: 640 }, { x: 100, y: 200 }, { x: 380, y: 700 }]) {
      const cam = createCamera(zoom);
      cam.anchorX = anchor.x; cam.anchorY = anchor.y;
      for (const wx of [0, 120, 240, 360, 480]) {
        const round = screenToWorldX(worldToScreenX(wx, cam), cam);
        assert.ok(Math.abs(round - wx) <= 0.01, `zoom ${zoom} x ${wx} 왕복오차 ${Math.abs(round - wx)}`);
      }
      const p = { x: 300, y: 500 };
      const rp = screenToWorldPoint(worldToScreenPoint(p, cam), cam);
      assert.ok(Math.abs(rp.x - p.x) <= 0.01 && Math.abs(rp.y - p.y) <= 0.01, `point 왕복`);
    }
  }
});

test('CZ-11: 동적 함대 anchor 왕복 — anchor가 바뀌어도 정확', () => {
  const cam = createCamera(1.30);
  for (const ax of [200, 240, 300, 150]) {
    cam.anchorX = ax; cam.anchorY = 640;
    const screenX = worldToScreenX(240, cam);
    assert.ok(Math.abs(screenToWorldX(screenX, cam) - 240) <= 0.01);
  }
});

test('CZ-12: visibleWorldBounds — 100%는 뷰포트 일치, 확대 시 더 좁게(축소 없음)', () => {
  const vp = { w: 480, h: 776 };
  const anchor = { x: 240, y: 640 };
  // 100%는 정확히 뷰포트와 일치(하한이 100% → 검은 공백 원천 제거)
  const id = createCamera(1.0); id.anchorX = anchor.x; id.anchorY = anchor.y;
  const ib = visibleWorldBounds(id, vp);
  assert.ok(Math.abs((ib.maxX - ib.minX) - vp.w) < 1e-9, '100%=뷰포트 폭');
  // 220%는 더 좁은 월드
  const tight = createCamera(2.20); tight.anchorX = anchor.x; tight.anchorY = anchor.y;
  const tb = visibleWorldBounds(tight, vp);
  assert.ok((tb.maxX - tb.minX) < vp.w, '220%는 좁은 월드');
});

test('CZ-13: createCamera — 손상 초기값도 안전 + 4단계 스냅', () => {
  assert.equal(createCamera(NaN).current, 1.0);
  assert.equal(createCamera(9).current, 2.20);
  assert.equal(createCamera(1.6).current, 1.5, '구 10% 격자 저장(160%)은 가까운 150% 로');
  assert.equal(createCamera().target, 1.0);
});
