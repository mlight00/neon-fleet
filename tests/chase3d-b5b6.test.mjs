// ── §G-4 B5 터렛·B6 위버 3D — 예산·결정성·배선 검증 ──
//  자유 디자인(이사 8/2 "2D 제약 해제")이므로 IoU 원본 대조는 없다. 계약(버킷·전장·결정성)과 배선만 잠근다.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as THREE from '../js/vendor/three.module.js';
import { createTurretGeometry, createTurretModel } from '../js/chase3d-b5.js';
import { createWeaverGeometry, createWeaverModel } from '../js/chase3d-b6.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

const CASES = [
  ['B5', createTurretGeometry, createTurretModel],
  ['B6', createWeaverGeometry, createWeaverModel],
];

test('B56-01 버킷 계약: hull/glow/core 3버킷 + 전장 1.0 정규화', () => {
  for (const [name, makeGeo] of CASES) {
    const g = makeGeo(THREE, { lod: 0 });
    assert.deepEqual(Object.keys(g.buckets).sort(), ['core', 'glow', 'hull'], name);
    g.buckets.hull.computeBoundingBox();
    const bb = g.buckets.hull.boundingBox;
    const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    assert.ok(Math.abs(span - 1) < 1e-3, `${name} 전장 ${span}`);
  }
});

test('B56-02 삼각형 예산: LOD0 ≤ 3,000(적 계약) + LOD 단조 감소 아님 허용하되 초과 금지', () => {
  for (const [name, makeGeo] of CASES) {
    for (const lod of [0, 1, 2]) {
      const g = makeGeo(THREE, { lod });
      assert.ok(g.triangles > 50 && g.triangles <= 3000, `${name} LOD${lod}=${g.triangles}`);
    }
  }
});

test('B56-03 결정성: 같은 인자 → 같은 정점(반복 2회 일치) + NaN 없음', () => {
  for (const [name, makeGeo] of CASES) {
    const a = makeGeo(THREE, { lod: 0 }), b = makeGeo(THREE, { lod: 0 });
    for (const k of ['hull', 'glow', 'core']) {
      const pa = a.buckets[k].attributes.position.array, pb = b.buckets[k].attributes.position.array;
      assert.equal(pa.length, pb.length, `${name}.${k} 길이`);
      for (let i = 0; i < pa.length; i++) {
        assert.ok(Number.isFinite(pa[i]), `${name}.${k}[${i}] NaN`);
        assert.equal(pa[i], pb[i], `${name}.${k}[${i}] 결정성`);
      }
    }
  }
});

test('B56-04 검사실 모델: LOD 전환·update·stats·dispose 인터페이스', () => {
  for (const [name, , makeModel] of CASES) {
    const m = makeModel(THREE, { lods: [0, 1, 2] });
    assert.equal(m.group.name, name);
    assert.equal(m.lod, 0);
    m.setLOD(2); assert.equal(m.lod, 2);
    m.update(1.25);   // emissive 맥동 — 예외 없이 동작만 확인
    const st = m.stats();
    assert.equal(st.lod, 2);
    assert.ok(st.triByLod[0] >= st.triByLod[2], `${name} LOD 감소`);
    m.dispose();
  }
});

test('B56-05 renderer 배선: 빌보드 스웜(이사 제작 렌더) + placeSwarm + 진단 카운트', () => {
  const r = read('js/chase3d-renderer.js');
  assert.match(r, /import { createBillboardParts } from '\.\/chase3d-billboards\.js'/);
  assert.match(r, /let b5 = makeBillboardSwarm\('b5', B5_INSTANCE_MAX\)/);
  assert.match(r, /let b6 = makeBillboardSwarm\('b6', B6_INSTANCE_MAX\)/);
  assert.match(r, /if \(swarms\.b5\) placeSwarm\(b5, swarms\.b5\.buf, swarms\.b5\.n, B5_INSTANCE_MAX, 'wob', 0\)/);
  assert.match(r, /if \(swarms\.b6\) placeSwarm\(b6, swarms\.b6\.buf, swarms\.b6\.n, B6_INSTANCE_MAX, 'wob', 0\)/);
  assert.match(r, /b5Count: b5 \? b5\.count : -1, b6Count: b6 \? b6\.count : -1/);
});

test('B56-07 빌보드 모듈: 텍스처 경로 존재 + 파트 계약 + 좌우 상쇄 회전', () => {
  const src = read('js/chase3d-billboards.js');
  assert.match(src, /b5: 'assets\/3d\/b5_gen\.webp'/);
  assert.match(src, /b6: 'assets\/3d\/b6_gen\.webp'/);
  assert.match(src, /geo\.rotateY\(Math\.PI\)/);   // yawBase π 와 상쇄 — 이미지 좌우 원본 유지
  assert.match(src, /transparent: true, depthWrite: false/);
  // 실제 이미지 파일 존재(전처리 산출물)
  for (const p of ['assets/3d/b5_gen.webp', 'assets/3d/b6_gen.webp']) {
    assert.ok(readFileSync(join(root, p)).length > 10_000, p + ' 존재·비어있지 않음');
  }
});

test('B56-06 main 수집: Turret/Weaver 분기 — 비변이만·상한·스탬프, 리셋·전달', () => {
  const m = read('js/main.js');
  assert.match(m, /e instanceof Turret\) {\s+\/\/ B5/);
  assert.match(m, /e instanceof Weaver\) {\s+\/\/ B6/);
  assert.match(m, /_b5n = 0; _b6n = 0;/);
  assert.match(m, /_sw\.b5\.n = _b5n; _sw\.b6\.n = _b6n;/);
  assert.match(m, /b5: { buf: _b5Buf, n: 0 }, b6: { buf: _b6Buf, n: 0 }/);
  // 검사실 가드 9타깃
  assert.match(m, /\['aurora', 'b1', 'b2', 'b4', 'b5', 'b6', 'allies', 'pickups', 'swarm']\.includes\(CHASE3D_LAB\)/);
});
