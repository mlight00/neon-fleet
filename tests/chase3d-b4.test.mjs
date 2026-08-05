import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../js/vendor/three.module.js';
import { createB4Geometry, forgeB4Hull, b4Body, B4_ROWS, B4_LENGTH, B4_ASPECT } from '../js/chase3d-b4.js';

// B4 저격수(이사 "저격수부터 순서대로") — B1·B2 와 같은 파이프라인 계약. 실측 IoU 0.8611(검사실 top vs fixture mask).

test('B4-01: planform 단일 진실 — fixture 와 모듈 상수 일치', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/b4-planform.json', import.meta.url), 'utf8'));
  assert.equal(B4_ROWS.length, 64);
  assert.deepEqual(B4_ROWS, fx.rows);
  assert.ok(Math.abs(B4_ASPECT - 0.3447) < 1e-4);
});

test('B4-02: 몸통 반폭 — 헤드 캡·창날 단조 테이퍼·끝 뾰족', () => {
  assert.equal(b4Body(0.15), Math.min(0.56, b4Body(0.15)), '핀 합류 구간 캡 0.56');
  assert.ok(b4Body(0.148) <= 0.56, `합류 구간 ${b4Body(0.148)}`);
  const mid = b4Body(0.36), low = b4Body(0.7), tip = b4Body(0.985);
  assert.ok(mid > low && low > tip, `창날 단조 테이퍼 ${mid}>${low}>${tip}`);
  assert.ok(tip < 0.06, `창끝 뾰족 ${tip}`);
});

test('B4-03: 지오메트리 예산 — LOD0 ≤3,000, LOD 단조, 버킷 3, 유한·대칭', () => {
  const tris = [];
  for (const lod of [0, 1, 2]) {
    const g = createB4Geometry(THREE, { lod });
    tris.push(g.triangles);
    assert.deepEqual(Object.keys(g.buckets).sort(), ['core', 'glow', 'hull']);
  }
  assert.ok(tris[0] <= 3000, `LOD0 ${tris[0]}`);
  assert.ok(tris[0] > tris[1] && tris[1] > tris[2], `LOD 단조 ${tris.join('>')}`);
  const hull = createB4Geometry(THREE, { lod: 0 }).buckets.hull;
  const pos = hull.attributes.position;
  for (let i = 0; i < pos.count; i++) assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)));
  hull.computeBoundingBox();
  const bb = hull.boundingBox;
  assert.ok(Math.abs(bb.max.x + bb.min.x) < 0.02, `x 대칭 ${bb.min.x}~${bb.max.x}`);
  assert.ok(Math.abs((bb.max.z - bb.min.z) - B4_LENGTH) < 0.04, `전장 ${(bb.max.z - bb.min.z).toFixed(3)}`);
});

test('B4-04: 텍스처 결정성 + Math.random() 미사용', () => {
  const src = readFileSync(new URL('../js/chase3d-b4.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random\(\)/.test(src));
  const a = forgeB4Hull(13, 64), b = forgeB4Hull(13, 64);
  assert.deepEqual(a.albedo, b.albedo);
});

test('B4-05: 검사실 + 실전 배선 — chase3dLab=b4, renderer b4 스웜, main Sniper 수집', () => {
  const lab = readFileSync(new URL('../js/chase3d-lab.js', import.meta.url), 'utf8');
  assert.match(lab, /import \{ createB4Model \} from '\.\/chase3d-b4\.js'/);
  assert.match(lab, /target === 'b4'/);
  const renderer = readFileSync(new URL('../js/chase3d-renderer.js', import.meta.url), 'utf8');
  // §G-4 이미지 파이프라인: b4 는 12종 빌보드 루프(eswarm)로 생성·배치된다
  assert.match(renderer, /eswarm\[k\] = def\.glb \? makeGlbSwarm\(k, def\) : makeBillboardSwarm\(k, def\.cap\)/);
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /if \(e instanceof Sniper\) \{ put3D\('b4', e, e\.wob \|\| 0\); continue; \}/);
});
