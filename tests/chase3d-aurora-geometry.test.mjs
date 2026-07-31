import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.js';
import { createAuroraGeometry, samplePlanform, LODS, LENGTH, HALFW, ASPECT, mulberry32 } from '../js/chase3d-aurora-geometry.js';

// Opus5 §12.1 geometry — 실제 BufferGeometry 를 Node 에서 생성해 검증(WebGL 불필요).

const hashF32 = (arr) => { let h = 0x811c9dc5; for (let i = 0; i < arr.length; i += 5) { h ^= Math.round(arr[i] * 8192) & 0xff; h = Math.imul(h, 0x01000193); } return h >>> 0; };

let G0, G1, G2;
test('AG-00: LOD0/1/2 생성 성공(예외 없음)', () => {
  G0 = createAuroraGeometry(THREE, { lod: 0, seed: 7 });
  G1 = createAuroraGeometry(THREE, { lod: 1, seed: 7 });
  G2 = createAuroraGeometry(THREE, { lod: 2, seed: 7 });
  assert.ok(G0 && G1 && G2);
});

test('AG-01: LOD 별 triangles 예산(§6.5) — 18k~45k / 6k~15k / 1.5k~5k', () => {
  assert.ok(G0.triangles >= 18000 && G0.triangles <= 45000, `LOD0 ${G0.triangles}`);
  assert.ok(G1.triangles >= 6000 && G1.triangles <= 15000, `LOD1 ${G1.triangles}`);
  assert.ok(G2.triangles >= 1500 && G2.triangles <= 5000, `LOD2 ${G2.triangles}`);
});

test('AG-02: 모든 vertex/normal/UV 유한 + index 범위 정상', () => {
  for (const geo of [G0, G1, G2]) for (const k in geo.buckets) {
    const g = geo.buckets[k];
    const n = g.attributes.position.count;
    for (const at of ['position', 'normal', 'uv']) {
      const a = g.attributes[at]; assert.ok(a, `${k}.${at} 존재`);
      for (let i = 0; i < a.array.length; i++) assert.ok(Number.isFinite(a.array[i]), `${k}.${at}[${i}] 유한`);
    }
    for (let i = 0; i < g.index.count; i++) { const v = g.index.array[i]; assert.ok(v >= 0 && v < n, `${k} index ${v} < ${n}`); }
  }
});

test('AG-03: bounding box 합리적 — 전장·반폭·두께(A4 aspect 0.6885)', () => {
  let minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, minZ = 1e9, maxZ = -1e9;
  for (const k in G0.buckets) { const p = G0.buckets[k].attributes.position.array; for (let i = 0; i < p.length; i += 3) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); minY = Math.min(minY, p[i + 1]); maxY = Math.max(maxY, p[i + 1]); minZ = Math.min(minZ, p[i + 2]); maxZ = Math.max(maxZ, p[i + 2]); } }
  assert.ok(Math.abs(maxX - HALFW) < 0.12 && Math.abs(-minX - HALFW) < 0.12, `반폭 ${minX.toFixed(2)}..${maxX.toFixed(2)} ≈ ±${HALFW.toFixed(2)}`);
  assert.ok(maxZ > 2.1 && maxZ < 2.5, `노즈 +Z ${maxZ.toFixed(2)}`);
  assert.ok(minZ < -2.2 && minZ > -3.1, `함미(엔진 포함) −Z ${minZ.toFixed(2)}`);
  assert.ok(maxY < 0.8 && minY > -0.8, `두께 y ${minY.toFixed(2)}..${maxY.toFixed(2)}`);
  assert.ok(Math.abs((2 * HALFW) / LENGTH - ASPECT) < 1e-6, 'aspect = A4 실측');
});

test('AG-04: 전방 +Z — 노즈는 좁고 뾰족, 함미쪽이 갈라짐(§6.2)', () => {
  assert.ok(samplePlanform(0.02).outline < 0.06, '노즈 폭 매우 좁음');
  assert.ok(samplePlanform(0.68).outline > 0.9, '주익 최대폭');
  assert.ok(samplePlanform(0.85).boom, '함미 분기(붐) 존재');
  // 최대 +Z 정점들은 중심 근처(뾰족한 앞)
  const p = G0.buckets.armorTop.attributes.position.array;
  let noseMaxZ = -1e9, noseX = 0;
  for (let i = 0; i < p.length; i += 3) if (p[i + 2] > noseMaxZ) { noseMaxZ = p[i + 2]; noseX = p[i]; }
  assert.ok(Math.abs(noseX) < 0.15, `+Z 극점은 중심선 근처(x=${noseX.toFixed(3)})`);
});

test('AG-05: 좌우 대칭(그리블 제외 버킷) — 미러 정점 존재율 ≥ 99%', () => {
  for (const k of ['armorTop', 'under', 'gold', 'armorSide']) {
    const p = G0.buckets[k].attributes.position.array;
    const keys = new Set();
    const Q = (v) => Math.round(v * 1000);
    for (let i = 0; i < p.length; i += 3) keys.add(`${Q(p[i])},${Q(p[i + 1])},${Q(p[i + 2])}`);
    let ok = 0, tot = 0;
    for (let i = 0; i < p.length; i += 3) { tot++; if (keys.has(`${Q(-p[i])},${Q(p[i + 1])},${Q(p[i + 2])}`)) ok++; }
    assert.ok(ok / tot >= 0.99, `${k} 대칭율 ${(ok / tot * 100).toFixed(2)}%`);
  }
});

test('AG-06: degenerate triangle 비율 < 2%', () => {
  let bad = 0, tot = 0;
  for (const k in G0.buckets) {
    const g = G0.buckets[k], p = g.attributes.position.array, idx = g.index.array;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      tot++; if (cx * cx + cy * cy + cz * cz < 1e-14) bad++;
    }
  }
  assert.ok(bad / tot < 0.02, `degenerate ${bad}/${tot} = ${(bad / tot * 100).toFixed(2)}%`);
});

test('AG-07: 같은 seed → position hash 동일(결정성) / 다른 seed → 그리블(dark)만 변화', () => {
  const A = createAuroraGeometry(THREE, { lod: 1, seed: 7 });
  const B = createAuroraGeometry(THREE, { lod: 1, seed: 7 });
  const C = createAuroraGeometry(THREE, { lod: 1, seed: 13 });
  for (const k in A.buckets) assert.equal(hashF32(A.buckets[k].attributes.position.array), hashF32(B.buckets[k].attributes.position.array), `seed7 재생성 ${k} 동일`);
  assert.equal(hashF32(A.buckets.armorTop.attributes.position.array), hashF32(C.buckets.armorTop.attributes.position.array), '다른 seed: 구조(armorTop) 불변');
  assert.equal(hashF32(A.buckets.gold.attributes.position.array), hashF32(C.buckets.gold.attributes.position.array), '다른 seed: gold 불변');
  assert.notEqual(hashF32(A.buckets.dark.attributes.position.array), hashF32(C.buckets.dark.attributes.position.array), '다른 seed: 그리블 배치만 변화');
});

test('AG-08: mulberry32 결정성 + planform 전 구간 유한', () => {
  const r1 = mulberry32(42), r2 = mulberry32(42);
  for (let i = 0; i < 50; i++) assert.equal(r1(), r2());
  for (let i = 0; i <= 200; i++) { const s = samplePlanform(i / 200); assert.ok(Number.isFinite(s.outline) && Number.isFinite(s.hull)); }
});
