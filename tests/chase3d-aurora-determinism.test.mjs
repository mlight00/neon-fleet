import { test } from 'node:test';
import assert from 'node:assert/strict';
import { forgeAuroraTextures, forgeEnvEquirect, normalFromHeight, hashPixels } from '../js/chase3d-aurora-materials.js';

// Opus5 §12.2 material — CPU TextureForge 는 순수 typed-array → Node 에서 픽셀 해시로 결정성 검증.

test('AM-01: 같은 seed → 모든 맵 픽셀 해시 동일', () => {
  const A = forgeAuroraTextures({ seed: 7, size: 128 });
  const B = forgeAuroraTextures({ seed: 7, size: 128 });
  for (const k in A) for (const m of ['albedo', 'normal', 'orm']) {
    assert.equal(hashPixels(A[k][m]), hashPixels(B[k][m]), `${k}.${m}`);
  }
});

test('AM-02: 다른 seed → 표면 변화(해시 상이), 크기·포맷 불변', () => {
  const A = forgeAuroraTextures({ seed: 7, size: 128 });
  const C = forgeAuroraTextures({ seed: 99, size: 128 });
  let diff = 0, tot = 0;
  for (const k in A) { tot++; if (hashPixels(A[k].albedo) !== hashPixels(C[k].albedo)) diff++; assert.equal(A[k].albedo.length, C[k].albedo.length); }
  assert.ok(diff >= tot - 1, `대부분 맵이 seed 에 반응(${diff}/${tot})`);
});

test('AM-03: albedo/normal/ORM/emissive 는 서로 다른 데이터(§12.2)', () => {
  const A = forgeAuroraTextures({ seed: 7, size: 128 });
  const t = A.armorTop;
  assert.notEqual(hashPixels(t.albedo), hashPixels(t.normal));
  assert.notEqual(hashPixels(t.albedo), hashPixels(t.orm));
  assert.notEqual(hashPixels(t.normal), hashPixels(t.orm));
  // ORM 채널 계약: r=AO(밝음 위주), g=roughness(중간), b=metalness(armor 는 낮음 일정)
  let aoSum = 0, mSum = 0, n = 0;
  for (let i = 0; i < t.orm.length; i += 4) { aoSum += t.orm[i]; mSum += t.orm[i + 2]; n++; }
  assert.ok(aoSum / n > 150, 'AO 평균은 밝음(가려짐만 어두움)');
  assert.ok(mSum / n < 120, 'armor metalness 낮음(도장 금속)');
});

test('AM-04: 맵 크기 계약 — armorTop=size, 나머지=size/2', () => {
  const A = forgeAuroraTextures({ seed: 7, size: 256 });
  assert.equal(A.armorTop.w, 256); assert.equal(A.under.w, 128); assert.equal(A.gold.w, 128);
  assert.equal(A.armorTop.albedo.length, 256 * 256 * 4);
});

test('AM-05: normalFromHeight — 평지=+Z(128,128,255 근방), 경사=기울어짐', () => {
  const S = 16; const flat = new Float32Array(S * S);
  const n1 = normalFromHeight(flat, S, 2);
  assert.ok(Math.abs(n1[0] - 127) <= 1 && Math.abs(n1[1] - 127) <= 1 && n1[2] >= 250, '평지 노멀=+Z');
  const slope = new Float32Array(S * S); for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) slope[y * S + x] = x * 0.5;
  const n2 = normalFromHeight(slope, S, 2);
  assert.ok(n2[(8 * S + 8) * 4] < 120, '경사면 x 성분 반응');
});

test('AM-06: 환경맵 equirect 결정성 + 유효 크기', () => {
  const a = forgeEnvEquirect(7), b = forgeEnvEquirect(7), c = forgeEnvEquirect(8);
  assert.equal(hashPixels(a.data), hashPixels(b.data));
  assert.notEqual(hashPixels(a.data), hashPixels(c.data));
  assert.equal(a.w * a.h * 4, a.data.length);
});

test('AM-07: Math.random 미사용(결정성 규율 §7.1) — aurora 모듈 소스 정적 검사', async () => {
  const { readFileSync } = await import('node:fs');
  for (const f of ['chase3d-aurora-geometry.js', 'chase3d-aurora-materials.js', 'chase3d-aurora-model.js', 'chase3d-lab.js']) {
    const src = readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
    assert.ok(!/Math\.random\s*\(/.test(src), `${f} 에 Math.random 없음`);
  }
});
