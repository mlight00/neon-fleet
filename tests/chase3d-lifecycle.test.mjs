import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// §12.4 수명주기 / §12.5 fallback / §12.6 시각계약.
//  scene/renderer 는 Three.js·WebGL 의존이라 헤드리스 Node 에서 인스턴스화 불가 →
//  소스-배선 정적 검사 + 실브라우저 QA(완료보고 §6·§12) 로 보완한다. 여기선 회귀를 막는 정적 계약.
const read = (f) => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8');
const scene = read('chase3d-scene.js');
const renderer = read('chase3d-renderer.js');
const models = read('chase3d-models.js');
const main = read('main.js');

// ── §12.4 객체 수명 ──
test('C3D-life-instanced: 드론은 InstancedMesh 로 렌더(§9.2 반복 개체)', () => {
  assert.match(models, /InstancedMesh/);
  assert.match(scene, /droneInstanced/);
  assert.match(scene, /drones\.count = dn/);           // 활성 수 = instance count
  assert.match(scene, /instanceMatrix\.needsUpdate = true/);
});

test('C3D-life-no-per-frame-alloc: apply() 는 프레임마다 Geometry/Material 을 새로 만들지 않음(§9.2)', () => {
  const s = scene.indexOf('function apply(');
  const e = scene.indexOf('function orientBeam(');
  assert.ok(s > 0 && e > s, 'apply() 본문 위치');
  const body = scene.slice(s, e);
  assert.ok(!/new THREE\.\w*Geometry\(/.test(body), 'apply()에 새 Geometry 없음');
  assert.ok(!/new THREE\.\w*Material\(/.test(body), 'apply()에 새 Material 없음');
});

test('C3D-life-dispose: teardown 시 geometry/material/renderer dispose(§9.4)', () => {
  assert.match(scene, /function dispose\(\)/);
  assert.match(scene, /kit\.dispose\(\)/);
  assert.match(models, /for \(const g of geos\) g\.dispose\(\)/);
  assert.match(models, /for \(const m of mats\) m\.dispose\(\)/);
  assert.match(scene, /renderer\.dispose\(\)/);
  assert.match(scene, /drones\.dispose\(\)/);
});

test('C3D-life-single-listener: context 리스너는 파이프라인당 1회 등록·해제(§9.4 중복 금지)', () => {
  // hero + legacy 두 파이프라인 — 인스턴스당 각 1회씩(소스에 정확히 2회), dispose 에서 각각 해제
  assert.equal((renderer.match(/addEventListener\('webglcontextlost'/g) || []).length, 2);
  assert.equal((renderer.match(/addEventListener\('webglcontextrestored'/g) || []).length, 2);
  assert.equal((renderer.match(/removeEventListener\('webglcontextlost'/g) || []).length, 2);
});

// ── §12.5 fallback ──
test('C3D-fallback-scene: renderer 생성 실패 시 재시도 후 ok:false 반환(§3.3·§5.1)', () => {
  assert.match(scene, /catch \(e1\)/);                 // 1차 실패
  assert.match(scene, /new THREE\.WebGLRenderer\(\{ canvas, alpha: true, antialias: false \}\)/);  // 안전 재시도
  assert.match(scene, /return \{ ok: false, reason: 'renderer-create-failed'/);
});

test('C3D-fallback-renderer: 미가용/degraded/휴면이면 frame() 0 반환(RC2 유지)', () => {
  assert.match(renderer, /if \(!ctl\.available \|\| ctl\.degraded\) \{ hide\(\); return 0; \}/);
  assert.match(renderer, /if \(!shouldRender3D\(zoom\) \|\| t <= 0\.001\) \{ hide\(\); return 0; \}/);
  assert.match(renderer, /catch \(e\) \{[\s\S]*ctl\.degraded = true;[\s\S]*return 0;/);   // 렌더 예외도 degraded+0
});

test('C3D-fallback-main: 초기화 실패/미가용이면 chase3d 미설정 → RC2 유지(§3.3)', () => {
  assert.match(main, /c = m\.createChase3D\(canvas3d, \{ hero: !CHASE3D_TEST, profile: PERF_PROFILE \}\);/);   // hero 기본(§9.1) — §G-14 로 소품 게이트 폐기
  assert.match(main, /_pendingChase3D = c; _c3dPhase = 2;/);
  assert.match(main, /catch \(e\) \{ _c3dPhase = 4; _c3dReason = 'init-exception'; console\.warn\('\[chase3d\] 초기화 예외/);
  assert.match(main, /_c3dPhase = 4; _c3dReason = 'module-load-failed'; console\.warn\('\[chase3d\] 모듈 로드 실패/);
  //  §G-21 §3.2: 실패는 세션 latch — 프레임마다 재시도하지 않는다.
  assert.match(main, /if \(_c3dPhase\) return;/);
  // draw() 에서 chase3d 없으면 t3d=0 → 2D 월드 정상 렌더(RC2)
  assert.match(main, /if \(chase3dFrameGate\(state, run && run\.phase, !!run, !!chase3d, camera\.target\)\) t3d = chase3d\.frame/);   // ctl 없으면 게이트가 닫혀 t3d=0(§G-21 §10)
});

// ── §12.6 시각 계약 정적 ──
test('C3D-visual-layers: #game3d/#game-hud 계층 + pointer-events:none, 플래그 있을 때만(§6)', () => {
  assert.match(main, /canvas3d\.id = 'game3d'/);
  assert.match(main, /hudCanvas\.id = 'game-hud'/);
  assert.match(main, /pointer-events:none/);
  //  §G-21 §3.2: 캔버스 생성은 ensureChase3DCanvases() 안으로 옮겼고, 그 호출은 (a)검사실·검증장면 부팅 또는
  //  (b)전투 중 사전 로드 경계 통과 시의 requestChase3D() 뿐이다 — 타이틀·무기 선택에서는 #game3d 가 생기지 않는다.
  const i = main.indexOf("canvas3d = document.createElement('canvas')");
  const guard = main.lastIndexOf('function ensureChase3DCanvases() {', i);
  assert.ok(guard > 0 && guard < i, '캔버스 생성은 ensureChase3DCanvases 안');
  assert.match(main, /if \(canvas3d\) return;/);   // 멱등
  const calls = (main.match(/ensureChase3DCanvases\(\)/g) || []).length;
  assert.equal(calls, 3, 'ensure 호출 = 정의 1 + 검사실/검증장면 부팅 1 + requestChase3D 1');
  //  ⚠️소스 문자열 대조를 **또** 깨뜨렸다(2026-08-11, 다섯 번째). §G-34 §10-2 의 교훈 그대로 —
  //   계약(=전투 중 게이트 통과 시에만 3D 를 요청한다)은 멀쩡한데 코드 형태만 바뀌어 실패했다.
  //   → 정규식 한 줄 대조 대신 **가드가 전부 살아 있는지**를 확인한다. 형태가 바뀌어도,
  //     조건 하나가 사라지면 잡힌다.
  const gi = main.indexOf('shouldInit3D(camera.target)');
  assert.ok(gi > 0, '3D 요청 게이트를 찾는다');
  const gate = main.slice(gi - 300, gi + 200);
  for (const cond of ["state === 'play'", 'run', '_c3dFps.tripped', 'shouldInit3D(camera.target)']) {
    assert.ok(gate.includes(cond), `3D 요청 게이트에 \`${cond}\` 조건이 있어야 한다`);
  }
});

test('C3D-visual-overlay-guard: 개발 오버레이는 chase3dTest 에서만(§11)', () => {
  assert.match(main, /if \(CHASE3D_TEST\) buildChase3DOverlay\(\)/);
  // 유일한 호출부는 CHASE3D_TEST 가드 안(정의 `function buildChase3DOverlay()` 는 제외하고 카운트)
  const calls = (main.replace('function buildChase3DOverlay()', '').match(/buildChase3DOverlay\(\)/g) || []).length;
  assert.equal(calls, 1, '오버레이 build 호출은 1회(가드 안)');
});

test('C3D-visual-no-cdn: chase3d 모듈·vendor 에 외부 CDN/모델 URL 없음(§10·§12.6·§16)', () => {
  const ext = /https?:\/\/(?!localhost|127\.0\.0\.1)[a-z0-9.-]+/i;
  for (const f of ['chase3d-config.js', 'chase3d-mapping.js', 'chase3d-models.js', 'chase3d-scene.js', 'chase3d-renderer.js']) {
    assert.ok(!ext.test(read(f)), `${f} 에 외부 URL 없음`);
  }
  // vendor three 도 실행 중 외부 요청(cdn/unpkg/jsdelivr) 없음
  const three = read('vendor/three.module.js');
  assert.ok(!/unpkg\.com|jsdelivr\.net|cdn\.|googleapis/i.test(three), 'three 에 CDN 참조 없음');
});

test('C3D-visual-three-vendored: 로컬 three 고정 버전 + 라이선스 문서(§5.1)', () => {
  const three = read('vendor/three.module.js');
  assert.match(three, /SPDX-License-Identifier: MIT/);
  const lic = readFileSync(new URL('../js/vendor/THREE-LICENSE.txt', import.meta.url), 'utf8');
  assert.match(lic, /MIT/);
});
