import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../js/vendor/three.module.js';
import { PROP_KEYS, PROP_CAPS, PROP_BASE_COLOR, createPropGeometry, createPropMaterial, createPickupParts } from '../js/chase3d-props.js';

// 소품 3D(이사 "무기·배지") — 초경량·결정적·전장 1.0 계약.

test('PR-01: 키·상한·기본색 정의 일치 + Math.random() 미사용', () => {
  assert.deepEqual(PROP_KEYS, ['pbullet', 'ebullet', 'missile', 'laser', 'crystal', 'coin', 'pow', 'pod', 'capsule']);   // §G-2: 레이저 랜스 추가
  for (const k of PROP_KEYS) {
    assert.ok(Number.isInteger(PROP_CAPS[k]) && PROP_CAPS[k] > 0, `cap ${k}`);
    assert.ok(Number.isInteger(PROP_BASE_COLOR[k]), `color ${k}`);
  }
  const src = readFileSync(new URL('../js/chase3d-props.js', import.meta.url), 'utf8');
  assert.ok(!/Math\.random\(\)/.test(src));
});

test('PR-02: 지오메트리 — 유한값·전장 1.0 정규화·예산(탄 ≤200 / 픽업 파트합 ≤600)', () => {
  const PICKUPS = ['crystal', 'coin', 'pow', 'pod', 'capsule'];
  for (const k of PROP_KEYS) {
    if (PICKUPS.includes(k)) {
      // §G-3 순수 조형 파이프라인(이사 "2000년대 초반 그래픽" 기각 후): 파트 목록 + 절차 텍스처.
      //  인스턴스 상한이 작아(cap 8~48) 예산을 소품 200→파트합 600 으로 상향.
      const parts = createPickupParts(THREE, k);
      let tris = 0, span = 0;
      for (const p of parts) {
        const pos = p.geo.attributes.position;
        for (let i = 0; i < pos.count; i++) assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)), `${k} vtx`);
        p.geo.computeBoundingBox(); const bb = p.geo.boundingBox;
        span = Math.max(span, bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
        tris += (p.geo.index ? p.geo.index.count : pos.count) / 3;
      }
      assert.ok(Math.abs(span - 1.0) < 0.01, `${k} 전장 ${span.toFixed(3)} ≈ 1.0`);
      assert.ok(tris <= 600, `${k} ${tris} ≤ 600 tris(파트합)`);
      continue;
    }
    const g = createPropGeometry(THREE, k);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) assert.ok(Number.isFinite(pos.getX(i)) && Number.isFinite(pos.getY(i)) && Number.isFinite(pos.getZ(i)), `${k} vtx ${i}`);
    g.computeBoundingBox();
    const bb = g.boundingBox;
    const span = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
    assert.ok(Math.abs(span - 1.0) < 0.01, `${k} 전장 ${span.toFixed(3)} ≈ 1.0`);
    const tris = (g.index ? g.index.count : pos.count) / 3;
    assert.ok(tris <= 200, `${k} ${tris} ≤ 200 tris`);
  }
});

test('PR-03: 결정성(같은 키=같은 지오메트리) + 공용 재질(자발광·toneMapped 끔)', () => {
  const a = createPropGeometry(THREE, 'crystal').attributes.position.array;
  const b = createPropGeometry(THREE, 'crystal').attributes.position.array;
  assert.deepEqual(Array.from(a), Array.from(b));
  const m = createPropMaterial(THREE);
  assert.equal(m.toneMapped, false, '네온 원색 유지(ACES 비적용)');
  assert.equal(m.type, 'MeshBasicMaterial', '라이팅 비의존(수십 인스턴스 저비용)');
});
