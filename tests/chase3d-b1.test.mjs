import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../js/vendor/three.module.js';
import { createB1Geometry, forgeB1Hull, b1Body, B1_ROWS, B1_ASPECT } from '../js/chase3d-b1.js';

// B1 — AURORA 와 같은 파이프라인 기준(예산·유한·대칭·결정성·IoU 는 브라우저 실측 0.8711 보고).

const hashF32 = (arr) => { let h = 0x811c9dc5; for (let i = 0; i < arr.length; i += 5) { h ^= Math.round(arr[i] * 8192) & 0xff; h = Math.imul(h, 0x01000193); } return h >>> 0; };
const hashU8 = (arr) => { let h = 0x811c9dc5; for (let i = 0; i < arr.length; i += 7) { h ^= arr[i]; h = Math.imul(h, 0x01000193); } return h >>> 0; };

let G0, G1, G2;
test('B1-00: LOD0/1/2 생성 + 일반 적 예산(§4.3: 개체당 ≤3,000)', () => {
  G0 = createB1Geometry(THREE, { lod: 0 });
  G1 = createB1Geometry(THREE, { lod: 1 });
  G2 = createB1Geometry(THREE, { lod: 2 });
  assert.ok(G0.triangles <= 3000 && G0.triangles >= 900, `LOD0 ${G0.triangles} ∈ [900,3000]`);
  assert.ok(G1.triangles < G0.triangles, 'LOD1 < LOD0');
  assert.ok(G2.triangles < G1.triangles, 'LOD2 < LOD1');
  assert.deepEqual(Object.keys(G0.buckets), ['hull', 'glow', 'core'], '버킷 3(스웜 InstancedMesh 3 draw 대비)');
});

test('B1-01: 모든 vertex/normal/UV 유한 + index 범위', () => {
  for (const geo of [G0, G1, G2]) for (const k in geo.buckets) {
    const g = geo.buckets[k], n = g.attributes.position.count;
    for (const at of ['position', 'normal', 'uv']) for (const v of g.attributes[at].array) assert.ok(Number.isFinite(v));
    for (let i = 0; i < g.index.count; i++) assert.ok(g.index.array[i] >= 0 && g.index.array[i] < n);
  }
});

test('B1-02: bbox — aspect 0.4617(가늘고 김), 등 첨두 +Z·전면 침 −Z', () => {
  let minX = 9, maxX = -9, minZ = 9, maxZ = -9;
  for (const k in G0.buckets) { const p = G0.buckets[k].attributes.position.array; for (let i = 0; i < p.length; i += 3) { minX = Math.min(minX, p[i]); maxX = Math.max(maxX, p[i]); minZ = Math.min(minZ, p[i + 2]); maxZ = Math.max(maxZ, p[i + 2]); } }
  const HW = 0.5 * B1_ASPECT;
  assert.ok(Math.abs(maxX - HW) < 0.05 && Math.abs(-minX - HW) < 0.05, `반폭 ±${HW.toFixed(3)} (실측 ${minX.toFixed(3)}..${maxX.toFixed(3)})`);
  assert.ok(maxZ > 0.45 && minZ < -0.45, `전장 z ${minZ.toFixed(2)}..${maxZ.toFixed(2)}`);
  // 노즈(+Z) 좁음 / 몸통 최대폭은 중반부(원본 정체성)
  assert.ok(b1Body(0.02) < 0.09 && b1Body(0.45) > 0.6, `planform: 첨두 좁고(${b1Body(0.02).toFixed(3)}) 중반 최대(${b1Body(0.45).toFixed(3)})`);
});

test('B1-03: 좌우 대칭 ≥ 99%(전 버킷 — B1 은 시드 그리블 없음)', () => {
  for (const k in G0.buckets) {
    const p = G0.buckets[k].attributes.position.array;
    const Q = (v) => Math.round(v * 1000);
    const keys = new Set();
    for (let i = 0; i < p.length; i += 3) keys.add(`${Q(p[i])},${Q(p[i + 1])},${Q(p[i + 2])}`);
    let ok = 0, tot = 0;
    for (let i = 0; i < p.length; i += 3) { tot++; if (keys.has(`${Q(-p[i])},${Q(p[i + 1])},${Q(p[i + 2])}`)) ok++; }
    assert.ok(ok / tot >= 0.99, `${k} 대칭율 ${(ok / tot * 100).toFixed(2)}%`);
  }
});

test('B1-04: 지오메트리 결정성 — 재생성 해시 동일', () => {
  const A = createB1Geometry(THREE, { lod: 1 });
  const B = createB1Geometry(THREE, { lod: 1 });
  for (const k in A.buckets) assert.equal(hashF32(A.buckets[k].attributes.position.array), hashF32(B.buckets[k].attributes.position.array), k);
});

test('B1-05: 키틴 텍스처 — 같은 seed 해시 동일·다른 seed 상이·맵 상이', () => {
  const a = forgeB1Hull(7, 64), b = forgeB1Hull(7, 64), c = forgeB1Hull(11, 64);
  assert.equal(hashU8(a.albedo), hashU8(b.albedo));
  assert.notEqual(hashU8(a.albedo), hashU8(c.albedo));
  assert.notEqual(hashU8(a.albedo), hashU8(a.normal));
  assert.notEqual(hashU8(a.albedo), hashU8(a.orm));
  assert.equal(a.albedo.length, 64 * 64 * 4);
});

test('B1-06: 디지타이즈 planform — 뿔 분리 런 존재(굽은 뿔의 근거) + 전 구간 유한', () => {
  const splitRows = B1_ROWS.filter((r) => r.length > 1).length;
  assert.ok(splitRows >= 10, `분리 런 행 ${splitRows} ≥ 10(뿔·핀)`);
  for (let i = 0; i <= 100; i++) assert.ok(Number.isFinite(b1Body(i / 100)));
});

test('B1-07: 배선 — lab 타깃 가드(B2 추가로 4종)·Math.random 금지·기본 URL 미로드 유지', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /\['aurora', 'b1', 'b2', 'b4', 'b5', 'b6', 'allies', 'pickups', 'swarm']\.includes\(CHASE3D_LAB\)/);
  assert.match(main, /createAuroraLab\(canvas3d, \{ target: CHASE3D_LAB \}\)/);
  const b1src = readFileSync(new URL('../js/chase3d-b1.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random\s*\(/.test(b1src), 'chase3d-b1 에 Math.random 없음');
  // 정적 import 는 main 에 추가되지 않음(three 는 여전히 플래그 뒤에서만)
  const staticImports = [...main.matchAll(/^\s*import\s+[^;]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.ok(!staticImports.includes('./chase3d-b1.js'), 'b1 모듈은 lab 경유 동적 로드만');
});
