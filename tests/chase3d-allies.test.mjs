import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../js/vendor/three.module.js';
import { createDroneGeometry, createCruiserGeometry, DRONE_INSTANCE_MAX, CRUISER_INSTANCE_MAX, A1_HALF, A2_HALF, A2_BODY_CAP, a1Half, a2Half } from '../js/chase3d-allies.js';

// §G-1(이사): 순양함↔드론 차별화, 드론 단순화 — 위계 계약(기함 > 순양함 > 드론).
// 구 소품 기각 교훈 반영: 원본 스프라이트(A1/A2) 디지타이즈 planform 이 단일 진실.

test('AL-00: planform 단일 진실 — 모듈 상수 = fixture(원본 A1/A2 디지타이즈)', () => {
  const fx = JSON.parse(readFileSync(new URL('./fixtures/allies-planform.json', import.meta.url), 'utf8'));
  const half = (rows) => rows.map((runs) => {
    if (!runs.length) return 0;
    let main = runs.find((r) => r[0] <= 0 && r[1] >= 0);
    if (!main) main = runs.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
    return +(((Math.abs(main[0]) + Math.abs(main[1])) / 2).toFixed(3));
  });
  assert.deepEqual(A1_HALF, half(fx.a1.rows), 'A1 반폭 64행 = fixture 유도값');
  assert.deepEqual(A2_HALF, half(fx.a2.rows), 'A2 반폭 64행 = fixture 유도값');
  // 원본 정체성: A1=노즈 좁고 델타 최대폭이 후미(행 43~46), A2=어깨(행 20~22) 뒤 잘록
  assert.ok(a1Half(0.02) < 0.2 && a1Half(0.7) > 0.9, `A1 델타(노즈 ${a1Half(0.02)} → 후미 ${a1Half(0.7)})`);
  assert.ok(a2Half(0.34) <= A2_BODY_CAP && A2_HALF[36] > 0.9, 'A2 포드 합류 구간은 캡(포드는 별도 지오)');
  for (let i = 0; i <= 100; i++) { assert.ok(Number.isFinite(a1Half(i / 100)) && Number.isFinite(a2Half(i / 100))); }
});

test('AL-01: 드론=초경량 단순 다트(≤200tri, 버킷 2) / 순양함=구조 함선(≤800tri, 버킷 3·금 트림)', () => {
  const d = createDroneGeometry(THREE), c = createCruiserGeometry(THREE);
  assert.ok(d.triangles <= 200, `드론 ${d.triangles} ≤ 200(단순화 계약)`);
  assert.ok(c.triangles <= 800, `순양함 ${c.triangles} ≤ 800`);
  assert.ok(c.triangles > d.triangles * 2, `위계: 순양함(${c.triangles})이 드론(${d.triangles})보다 확실히 구조적`);
  assert.deepEqual(Object.keys(d.buckets).sort(), ['glow', 'hull'], '드론 버킷 2(트림 없음 — 단순)');
  assert.deepEqual(Object.keys(c.buckets).sort(), ['glow', 'hull', 'trim'], '순양함 버킷 3(금 스파인 트림)');
});

test('AL-02: 전장 1.0 정규화·좌우 대칭·유한값·결정성', () => {
  for (const make of [createDroneGeometry, createCruiserGeometry]) {
    const g = make(THREE);
    const hull = g.buckets.hull;
    hull.computeBoundingBox();
    const bb = hull.boundingBox;
    const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    assert.ok(Math.abs(span - 1.0) < 0.01, `전장 ${span.toFixed(3)}`);
    assert.ok(Math.abs(bb.max.x + bb.min.x) < 0.02, `x 대칭`);
    for (const k in g.buckets) for (const v of g.buckets[k].attributes.position.array) assert.ok(Number.isFinite(v));
    const h2 = make(THREE).buckets.hull.attributes.position.array;
    assert.deepEqual(Array.from(hull.attributes.position.array), Array.from(h2), '결정성');
  }
  const src = readFileSync(new URL('../js/chase3d-allies.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random\(\)/.test(src));
});

test('AL-03: 실전 배선 — Squad.escortsFor3D + hideEscorts 게이트 + renderer 아군 yaw 0', () => {
  const entities = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
  assert.match(entities, /escortsFor3D\(out\) \{/);
  // 수집 수식 = draw 수식(드론 bob sin(t*3+phase)*2, 호위 bob sin(t*3+i)*1.5, clearR 스킵)
  const ef = entities.slice(entities.indexOf('escortsFor3D(out) {'), entities.indexOf('draw(ctx, projector = null) {'));
  assert.match(ef, /Math\.sin\(this\.t \* 3 \+ o\.phase\) \* 2/);
  assert.match(ef, /Math\.sin\(this\.t \* 3 \+ i\) \* 1\.5/);
  assert.match(ef, /< def\.clearR\) continue/);
  // 2D 스킵: 본체 blit 만 게이트(HP바·플래시 링은 유지)
  assert.match(entities, /const hideEsc = !!\(this\._viewOpts && this\._viewOpts\.hideEscorts\)/);
  assert.match(entities, /if \(!hideEsc\) for \(let i = 0; i < n; i\+\+\) \{/);
  assert.match(entities, /if \(!hideEsc\) blit\(ctx, type === 'cruiser'/);
  const cr = readFileSync(new URL('../js/chase-render.js', import.meta.url), 'utf8');
  assert.match(cr, /hideEscorts: !!opts\.hideEscorts/);
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /hideEscorts: t3d >= 0\.5/);
  assert.match(main, /run\.squad\.escortsFor3D\(_escBuf\)/);
  const renderer = readFileSync(new URL('../js/chase3d-renderer.js', import.meta.url), 'utf8');
  assert.match(renderer, /placeSwarm\(drone, swarms\.drone\.buf, swarms\.drone\.n, DRONE_INSTANCE_MAX, 'direct', 0, 0\)/);
  assert.match(renderer, /placeSwarm\(cruiser, swarms\.cruiser\.buf, swarms\.cruiser\.n, CRUISER_INSTANCE_MAX, 'direct', 0, 0\)/);
  assert.equal(DRONE_INSTANCE_MAX, 60); assert.equal(CRUISER_INSTANCE_MAX, 10);
});

test('AL-04: 검사실 allies 타깃(6타깃 가드)', () => {
  const lab = readFileSync(new URL('../js/chase3d-lab.js', import.meta.url), 'utf8');
  assert.match(lab, /import \{ createAlliesModel \} from '\.\/chase3d-allies\.js'/);
  assert.match(lab, /target === 'allies'/);
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  assert.match(main, /\['aurora', 'b1', 'b2', 'b4', 'allies', 'swarm']\.includes\(CHASE3D_LAB\)/);
});
