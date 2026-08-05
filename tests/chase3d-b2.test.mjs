import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../js/vendor/three.module.js';
import { createB2Geometry, forgeB2Hull, b2Body, B2_ROWS, B2_LODS, B2_LENGTH, B2_ASPECT } from '../js/chase3d-b2.js';

// B2 중형 크리처(이사 승인) — B1 과 같은 파이프라인 계약. 실측 IoU 0.8677(브라우저, 검사실 top vs fixture mask).

test('B2-01: planform 단일 진실 — fixture 와 모듈 상수 일치', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/b2-planform.json', import.meta.url), 'utf8'));
  assert.equal(B2_ROWS.length, 64);
  assert.deepEqual(B2_ROWS, fx.rows, '모듈 내장 rows = fixture rows');
  assert.ok(Math.abs(B2_ASPECT - 0.7617) < 1e-4);
});

test('B2-02: 몸통 반폭 — 노즈 뾰족·중단 최대·합류 구간 캡·꼬리(팔 런) 0', () => {
  assert.ok(b2Body(0.01) < 0.06, `노즈 ${b2Body(0.01)}`);
  const mid = b2Body(0.58);
  assert.ok(mid > 0.38 && mid <= 0.47, `중단 ${mid}`);
  assert.equal(b2Body(0.44), 0.47, '몸통·팔 합류 구간(0.9+)은 0.47 캡');
  assert.equal(b2Body(0.93), 0, '몸통 종료 후(팔 런만) = 0');
});

test('B2-03: 지오메트리 예산 — LOD0 ≤3,000(enemy §4.3), LOD 단조 감소, 버킷 3', () => {
  const tris = [];
  for (const lod of [0, 1, 2]) {
    const g = createB2Geometry(THREE, { lod });
    tris.push(g.triangles);
    assert.deepEqual(Object.keys(g.buckets).sort(), ['core', 'glow', 'hull']);
  }
  assert.ok(tris[0] <= 3000, `LOD0 ${tris[0]} ≤ 3000`);
  assert.ok(tris[0] > tris[1] && tris[1] > tris[2], `LOD 단조 ${tris.join('>')}`);
});

test('B2-04: 유한값 + 좌우 대칭 + bbox(전장 1.0·반폭 ≈ aspect/2)', () => {
  const g = createB2Geometry(THREE, { lod: 0 });
  const hull = g.buckets.hull;
  const pos = hull.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)), `vtx ${i} 유한`);
  }
  hull.computeBoundingBox();
  const bb = hull.boundingBox;
  assert.ok(Math.abs(bb.max.x + bb.min.x) < 0.02, `x 대칭 ${bb.min.x}~${bb.max.x}`);
  assert.ok(Math.abs((bb.max.z - bb.min.z) - B2_LENGTH) < 0.03, `전장 ${bb.max.z - bb.min.z} ≈ 1.0`);
  assert.ok(Math.abs(bb.max.x - 0.5 * B2_ASPECT) < 0.04, `반폭 ${bb.max.x} ≈ ${0.5 * B2_ASPECT}`);
});

test('B2-05: 텍스처 결정성(같은 시드=같은 픽셀) + Math.random() 미사용 + 뼈색 클로 밴드', () => {
  const src = readFileSync(new URL('../js/chase3d-b2.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random\(\)/.test(src));
  const a = forgeB2Hull(11, 64), b = forgeB2Hull(11, 64);
  assert.deepEqual(a.albedo, b.albedo);
  // v>0.90(클로 밴드) 픽셀은 뼈색(밝고 저채도) — 하단 행 평균이 상단 행 평균보다 밝다
  const S = 64; const rowMean = (r) => { let s = 0; for (let c = 0; c < S; c++) { const i = (r * S + c) * 4; s += a.albedo[i] + a.albedo[i + 1] + a.albedo[i + 2]; } return s / S / 3; };
  assert.ok(rowMean(62) > rowMean(30) + 30, `클로 밴드 밝음(${rowMean(62).toFixed(0)} vs ${rowMean(30).toFixed(0)})`);
});

test('B2-06: 검사실 배선 — chase3dLab=b2 타깃 + 5타깃 가드', () => {
  const lab = readFileSync(new URL('../js/chase3d-lab.js', import.meta.url), 'utf8');
  assert.match(lab, /import \{ createB2Model \} from '\.\/chase3d-b2\.js'/);
  assert.match(lab, /target === 'b2'/);
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /\['aurora', 'b1', 'b2', 'b4', 'b5', 'b6', 'models', 'allies', 'pickups', 'swarm']\.includes\(CHASE3D_LAB\)/);
});
