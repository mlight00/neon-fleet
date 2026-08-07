import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chase3dEnabled, chase3dTestEnabled, transitionT, shouldRender3D, CHASE3D, QUALITY } from '../js/chase3d-config.js';

// §12.1 기능 플래그 + §7 전환값. config 는 순수(Three.js 미의존)라 Node 에서 그대로 검증.

test('C3D-flag: §G-19 chase3dEnabled 는 기본 ON, ?chase3d=0 만 해제', () => {
  // 배포판(포털)은 index.html 을 쿼리 없이 연다 — 예전 계약(=1 필수)이면 3D 가 영영 안 켜진다.
  assert.equal(chase3dEnabled('?chase3d=1'), true);
  assert.equal(chase3dEnabled('?chase3d=1&x=2'), true);
  assert.equal(chase3dEnabled(''), true);
  assert.equal(chase3dEnabled('?chase3d=0'), false);
  assert.equal(chase3dEnabled('?foo=1'), true);
});

test('C3D-testflag: chase3dTestEnabled 는 chase3d=1 과 chase3dTest=1 둘 다 필요', () => {
  assert.equal(chase3dTestEnabled('?chase3d=1&chase3dTest=1'), true);
  assert.equal(chase3dTestEnabled('?chase3dTest=1'), false);      // chase3d 없으면 무의미
  assert.equal(chase3dTestEnabled('?chase3d=1'), false);
});

test('C3D-transition: t 는 100~160%→0, 200~220%→1, 1.8=0.5, 단조 증가(§7)', () => {
  assert.equal(transitionT(1.0), 0);
  assert.equal(transitionT(1.6), 0);
  assert.equal(transitionT(2.0), 1);
  assert.equal(transitionT(2.2), 1);
  assert.ok(Math.abs(transitionT(1.8) - 0.5) < 1e-9, `1.8→${transitionT(1.8)}`);
  let prev = -1;
  for (let z = 1.0; z <= 2.2001; z += 0.05) { const t = transitionT(z); assert.ok(t >= prev - 1e-9 && t >= 0 && t <= 1, `단조/범위 z=${z} t=${t}`); prev = t; }
});

test('C3D-dormant: 160% 미만은 WebGL 휴면(§9.4)', () => {
  assert.equal(shouldRender3D(1.0), false);
  assert.equal(shouldRender3D(1.59), false);
  assert.equal(shouldRender3D(1.6), true);
  assert.equal(shouldRender3D(2.2), true);
});

test('C3D-const: 전환 경계·품질 상수 계약', () => {
  assert.equal(CHASE3D.START_ZOOM, 1.6);
  assert.equal(CHASE3D.FULL_ZOOM, 2.0);
  assert.equal(QUALITY.PIXEL_RATIO_MOBILE, 1.0);
  assert.equal(QUALITY.PIXEL_RATIO_DESKTOP, 1.5);
  assert.ok(QUALITY.ADD_BYTES_BUDGET === 3 * 1024 * 1024, '추가 용량 예산 3MB');
});

// §12.1 정적: 기본 URL 로드 시 Three.js 를 import 하지 않는다 — main.js 는 renderer/scene/models 를 정적 import 하지 않고,
//  three 를 쓰는 모듈은 오직 동적 import('./chase3d-renderer.js') 로만 진입한다(플래그가 있을 때만).
test('C3D-no-static-three: main.js 는 three/renderer/scene/models 를 정적 import 하지 않음(§3.2)', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  // 정적 import 라인에 three/renderer/scene/models 가 없어야
  const staticImports = [...main.matchAll(/^\s*import\s+[^;]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  for (const bad of ['./vendor/three.module.js', './chase3d-renderer.js', './chase3d-scene.js', './chase3d-models.js']) {
    assert.ok(!staticImports.includes(bad), `정적 import 금지: ${bad}`);
  }
  // config/mapping 은 순수 → 정적 import 허용(three 미로드)
  assert.ok(staticImports.includes('./chase3d-config.js'), 'config 는 정적 import(순수)');
  // renderer 는 동적 import 로만
  assert.match(main, /import\('\.\/chase3d-renderer\.js'\)/);
});

// config/mapping 이 three 를 import 하지 않는지(정적 검사) — 이게 깨지면 기본 URL 에서 three 가 로드됨
test('C3D-pure-modules: config·mapping 은 Three.js 를 import 하지 않음', () => {
  for (const f of ['chase3d-config.js', 'chase3d-mapping.js']) {
    const src = readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
    assert.ok(!/three\.module\.js/.test(src), `${f} 는 three 미의존`);
  }
});
