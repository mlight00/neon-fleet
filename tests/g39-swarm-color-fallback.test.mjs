// ── §G-39 Task 7 — placeSwarm 색 적용 + 국소 폴백 ──────────────────────────────────────
//
//  검증 대상: `chase3d-renderer.js` 의 `makeGlbSwarm`(attach 안 색 probe) + `placeSwarm`(색 쓰기 블록).
//  Task 6 이 만든 적 슬롯 `{ sx, sy, px, wob, cr, cg, cb }` 를 3D 가 실제 모델에 입히고, 색 쓰기가
//  실패해도 `frame()` 의 render-exception 폴백(3D 세션 전체 종료)을 타지 않아야 한다.
//
//  ⚠️브리프(task-7-brief.md Step 1)는 이 세 계약을 `readFileSync` + 정규식 소스 대조로 검증했다.
//   이 리포는 그 방식으로 같은 세션에 11번 깨진 전례가 있고(§G-38 주석 참고), test-quality-ratchet
//   이 그런 대조를 102개로 못 박아 두고 있다. 그래서 여기서는 **실제로 3D `frame()` 을 실행**해
//   진짜 `THREE.InstancedMesh.instanceColor` 버퍼 값을 읽어 계약을 증명한다(정규식 0줄).
//
//  ⚠️적(enemy) 종을 직접 못 쓰는 이유: 이 헤드리스 Node 환경엔 `fetch` 상대경로 해석과 `document` 가
//   없다. 적 GLB 로드는 항상 실패하고, 그 폴백(`createBillboardParts`)은 `TextureLoader` 가 내부에서
//   `document.createElementNS` 를 불러 **동기 예외**를 던진다(실측: makeGlbSwarm 의 `catch(e2){}` 가
//   조용히 삼켜 `attach()` 자체가 안 붙는다 → 적 스웜은 Node 에서 영원히 `meshes=[]`).
//   반면 픽업(crystal 등)의 폴백(`createPickupParts`)은 순수 절차 지오메트리·`DataTexture` 라 Node 에서도
//   완주된다(실측). `placeSwarm`/`makeGlbSwarm.attach` 는 종에 무관한 **공용 코드**이므로, Node 에서
//   완주되는 픽업 스웜(crystal·pod)을 "대리 검증체"로 써서 같은 함수를 검증한다 — 대리일 뿐 결과는 같다.
//
//  ⚠️`createChase3D({hero:true})` 는 **파일당 한 번만** 부른다(아래 모듈 스코프 top-level await).
//   실측(2026-08-12): 벤더 `vendor/three.module.js` 의 `FileLoader`(minified `zd`)는 in-flight 요청을
//   URL 별로 모듈 전역 `Fd{}` 에 등록했다가 완료 시 지운다. 그런데 상대경로(`assets/3d/*.glb`)를
//   Node 에서 `new Request(url)` 에 넘기면 **동기 TypeError**("Failed to parse URL from …")가 `fetch()`
//   호출 *이전*에 나서, `Fd[url]` 등록만 되고 정리 콜백은 영영 안 걸린다 — 그 URL 은 프로세스 수명 내내
//   "누가 로딩 중"으로 오염된다. 같은 프로세스에서 `createChase3D` 를 두 번째로 부르면 같은 URL 의
//   `load()` 가 그 죽은 대기열에 콜백만 쌓고 **영영 resolve/reject 되지 않는다**(attach() 무한 대기).
//   테스트 파일마다 새 프로세스를 쓰는 `node --test` 관례 덕에 파일 간에는 안전하지만, **한 파일 안에서
//   두 번째 `createChase3D` 호출은 픽업 스웜을 영원히 준비 안 되게 만든다** — 실제로 겪은 회귀라 여기 남긴다.
//   (브라우저에서는 상대경로가 `document.baseURI` 로 정상 해석되므로 이 문제가 없다 — 순수 Node 테스트 아티팩트.)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../js/vendor/three.module.js';
import { createChase3D } from '../js/chase3d-renderer.js';
import { createPickupParts } from '../js/chase3d-props.js';

/** GPU 없이 THREE 가 요구하는 최소 표면만 갖춘 renderer(§G-35 g35-frame-smoke 와 동형).
 *  render() 가 실행될 때마다 그 프레임의 실제 scene 을 캡처해 둔다 — instanceColor 판독용. */
function makeFakeRenderer(THREE, canvas) {
  const state = { renders: 0, lastScene: null, lastCamera: null };
  const rt = { texture: { dispose() {} }, dispose() {} };
  const r = {
    __state: state,
    domElement: canvas,
    render(scene, camera) { state.renders++; state.lastScene = scene; state.lastCamera = camera; },
    setSize() {}, setPixelRatio() {}, setViewport() {}, setScissor() {}, setScissorTest() {},
    setClearColor() {}, setClearAlpha() {}, clear() {}, clearDepth() {},
    compile() {}, dispose() {}, forceContextLoss() {},
    getContext: () => ({ getExtension: () => null, getParameter: () => 0 }),
    getPixelRatio: () => 1,
    getSize: (v) => (v && v.set ? v.set(canvas.width, canvas.height) : { width: canvas.width, height: canvas.height }),
    getRenderTarget: () => null, setRenderTarget() {},
    initTexture() {}, resetState() {},
    outputColorSpace: '', toneMapping: 0, toneMappingExposure: 1,
    shadowMap: { enabled: false, type: 0 },
    capabilities: { isWebGL2: true, getMaxAnisotropy: () => 1, precision: 'highp' },
    extensions: { get: () => null, has: () => false },
    properties: { get: () => ({}), remove() {} },
    info: { render: { calls: 0, triangles: 0 }, memory: { geometries: 0, textures: 0 }, programs: [], autoReset: true, reset() {} },
    xr: { enabled: false, isPresenting: false, addEventListener() {} },
    _pmrem: rt,
  };
  return r;
}

/** 최소 canvas 스텁 — DOM 없이 frame() 이 읽는 속성만(§G-35 와 동형). */
function makeCanvas(w = 480, h = 800) {
  return {
    width: w, height: h, clientWidth: w, clientHeight: h,
    style: { width: `${w}px`, height: `${h}px`, opacity: '0', visibility: 'hidden', display: 'block' },
    addEventListener() {}, removeEventListener() {},
    getContext: () => null,
  };
}

/** 살아있는 squad 최소 run(§G-35 와 동형 — escortsFor3D 등 frame() 이 읽는 필드만). */
function makeRun() {
  const squad = {
    x: 240, y: 670, dead: false, tier: 0, weapon: 'vulcan', weaponLv: 1,
    count: 8, cruisers: 0, hp: 100, maxHp: 100, charge: 0, chargeStage: 0,
    escortsFor3D: () => 0,
  };
  return { squad, phase: 'track', world: { squad, entities: [], bullets: [], enemyBullets: [] }, bosses: [] };
}

/** placeSwarm 버퍼 슬롯 — 적(cr/cg/cb)·픽업(col) 두 모양을 다 흉내 낼 수 있게 overrides 로 연다. */
function slot(overrides = {}) {
  return { sx: 240, sy: 500, px: 20, wob: 0, wx: 240, wy: 400, mul: 1, wmul: 1, core: 1, col: -1, ...overrides };
}

/** main 이 3D 로 넘기는 swarms 모양 — 픽업 5종 + 발사체 4종 자리를 n=0 으로 채워 둔다(placeShots 도 안전).
 *  매 테스트가 독립된 버퍼를 갖도록 매번 새로 만든다(공유하는 것은 아래 hero 의 ctl/scene 뿐). */
function makeSwarms() {
  const props = {};
  for (const k of ['crystal', 'coin', 'pow', 'pod', 'capsule', 'pbullet', 'ebullet', 'laser', 'missile']) {
    props[k] = { buf: [slot(), slot()], n: 0 };
  }
  return { props, drone: { buf: [], n: 0 }, cruiser: { buf: [], n: 0 } };
}

/** scene 을 훑어 instanceColor[0] 의 R 채널이 minR 을 넘는 InstancedMesh 를 전부 찾는다.
 *  setHex 는 24비트라 절대 1 을 못 넘으므로, 이 결과가 하나라도 있으면 그 자체가 setRGB 사용의 증거다. */
function findBoostedMeshes(scene, minR) {
  const found = [];
  scene.traverse((o) => {
    if (o.isInstancedMesh && o.instanceColor && o.instanceColor.getX(0) > minR) found.push(o);
  });
  return found;
}

//  ── 파일당 단 한 번의 hero 부팅(위 헤더의 FileLoader Fd{} 오염 회피) ──────────────────────
const canvas = makeCanvas();
const rendererRef = {};
const hero = createChase3D(canvas, {
  hero: true,
  profile: { mobile: false, lod: 0, pixelRatio: 1 },
  createRenderer: (T, c) => {
    const r = makeFakeRenderer(T, c);
    rendererRef.state = r.__state;
    return r;
  },
});
{
  //  GLB 실패 → 픽업 절차 폴백의 attach() 가 끝날 때까지 기다린다(최대 500ms 폴링 — 시스템 부하 여유).
  const deadline = Date.now() + 500;
  while (!hero.ready.pickup('crystal') && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

const CRYSTAL_PARTS = createPickupParts(THREE, 'crystal').length;   // 셸+코어+오라 = 3(§G-39 다파트 검증의 기준값)
let _t = 1;
const nextTime = () => (_t += 0.02);   // 프레임마다 시간을 조금씩 흘려 dt=0 을 피한다(장식적 상태용, 판정 무관)

test('G39-SWARM-SETRGB: 1 을 넘는 피격 번쩍 값이 살아남는다(setHex 였다면 24비트에 막혀 절대 못 넘는다)', () => {
  assert.ok(hero.ready.pickup('crystal'),
    '대리 검증체(크리스탈) 스웜이 준비되지 않았다 — Node 헤드리스에서 GLB 폴백 타이밍 가정이 깨졌을 수 있다');
  const run = makeRun(), swarms = makeSwarms();

  const BOOST = 3.744;   // damage-feedback.js FEEDBACK.boost 대역(1 을 넘는 값) — Task 6 의 cr/cg/cb 가 실제로 이런 값을 준다.
  swarms.props.crystal.buf[0] = slot({ cr: BOOST, cg: 0.12, cb: 0.12 });
  swarms.props.crystal.n = 1;
  hero.frame(run, 2.2, 480, 800, 480, 800, nextTime(), 0, swarms);

  const found = findBoostedMeshes(rendererRef.state.lastScene, 1.5);
  assert.ok(found.length > 0,
    'instanceColor 에 1 을 넘는 값이 하나도 없다 — setHex 를 썼다면 항상 이렇게 된다(§G-39 핵심 회귀)');
  for (const im of found) {
    assert.ok(Math.abs(im.instanceColor.getX(0) - BOOST) < 0.01,
      `R 채널이 ${BOOST} 근처여야 한다(setRGB 로 그대로 보존) — 실측 ${im.instanceColor.getX(0)}`);
  }
});

test('G39-SWARM-ALL-PARTS: 같은 인스턴스의 모든 파트(크리스탈 셸·코어·오라)가 같은 색을 받는다', () => {
  assert.ok(hero.ready.pickup('crystal'), '대리 검증체(크리스탈) 스웜이 준비되지 않았다');
  const run = makeRun(), swarms = makeSwarms();

  const BOOST = 1.8;
  swarms.props.crystal.buf[0] = slot({ cr: BOOST, cg: BOOST, cb: BOOST });
  swarms.props.crystal.n = 1;
  hero.frame(run, 2.2, 480, 800, 480, 800, nextTime(), 0, swarms);

  const found = findBoostedMeshes(rendererRef.state.lastScene, 1.5);
  assert.equal(found.length, CRYSTAL_PARTS,
    `한 인스턴스의 파트 ${CRYSTAL_PARTS}개(createPickupParts 실측) 전부가 색을 받아야 한다 — ` +
    `실측 ${found.length}개(한 파트만 물들면 "몸통만 붉어진다" 회귀)`);
  for (const im of found) {
    assert.ok(Math.abs(im.instanceColor.getX(0) - BOOST) < 0.01 &&
      Math.abs(im.instanceColor.getY(0) - BOOST) < 0.01 &&
      Math.abs(im.instanceColor.getZ(0) - BOOST) < 0.01, '전 파트가 같은 RGB 값을 가져야 한다');
  }
});

test('G39R1-SWARM-RESTORE-WHITE: 두 번째 파트에서만 색이 실패해도 전 파트가 원래 흰색으로 복구된다', () => {
  //  §G39-R1 (Codex 구현검수 §4): 예전 구현은 `colored=false` 만 내려 **직전 프레임의 색이 얼어붙었다.**
  //   여러 파트 중 두 번째에서 실패하면 첫 파트만 새 색인 **부분 적용**까지 생겼다.
  //   예전 테스트는 "장애 뒤 새 1.9 로 바뀌지 않았다"만 봐서 **옛 색이 그대로 남아도 통과**했다 —
  //   그건 폴백의 증거가 아니라 얼어붙음의 증거였다. 그래서 이 테스트로 교체한다.
  //
  //  ⚠️이 테스트는 크리스탈 스웜의 colored 를 영구히 꺼뜨린다 — 파일 안에서 반드시 마지막에 돈다
  //   (node:test 는 선언 순서대로 순차 실행하므로 위 두 테스트 뒤에 두면 안전하다).
  assert.ok(hero.ready.pickup('crystal'), '대리 검증체(크리스탈) 스웜이 준비되지 않았다');
  assert.ok(hero.ready.pickup('pod'), '이웃 스웜(pod)이 준비되지 않아 국소성(§G-39)을 확인할 수 없다');
  const run = makeRun(), swarms = makeSwarms();

  // ── 프레임 A: 다중 파트 전부가 **최대 flash 색**을 정상으로 받는다(복구할 "더러운 상태"를 만든다) ──
  const MARK = 3.744;   // FEEDBACK.boost — 실제 피격 번쩍 값
  swarms.props.crystal.buf[0] = slot({ cr: MARK, cg: MARK, cb: MARK });
  swarms.props.crystal.n = 1;
  hero.frame(run, 2.2, 480, 800, 480, 800, nextTime(), 0, swarms);
  const crystalMeshes = findBoostedMeshes(rendererRef.state.lastScene, 1.5);
  assert.equal(crystalMeshes.length, CRYSTAL_PARTS, '표식 프레임에서 크리스탈 파트를 특정하지 못했다(사전 조건 실패)');
  for (const im of crystalMeshes) {
    assert.equal(im.count, 1, '표식 프레임 — 모델이 그려지는 상태(count=1)여야 한다');
    assert.ok(Math.abs(im.instanceColor.getX(0) - MARK) < 0.01, '전제: 장애 직전 전 파트가 최대 flash 색이어야 한다');
  }
  const matrixVersionA = crystalMeshes.map((im) => im.instanceMatrix.version);

  // ── 프레임 B: **두 번째 mesh 의 setColorAt 만** 던진다(첫 파트는 성공 → 부분 적용 상황 재현) ──
  const victim = crystalMeshes[1];
  const originalSetColorAt = victim.setColorAt;
  let thrown = 0, threwToTopLevel = false;
  victim.setColorAt = function () { thrown++; throw new Error('boom-in-setColorAt(2nd-mesh)'); };
  try {
    swarms.props.crystal.buf[0] = slot({ cr: 2.9, cg: 0.4, cb: 0.4 });   // 새 저체력 틴트를 시도한다
    try {
      hero.frame(run, 2.2, 480, 800, 480, 800, nextTime(), 0, swarms);
    } catch (e) { threwToTopLevel = true; }

    assert.equal(threwToTopLevel, false, '색 예외가 최상위로 새면 안 된다');
    assert.ok(thrown > 0, '전제: 주입한 장애가 실제로 발동해야 한다');
    assert.equal(hero.available, true, `3D 세션이 꺼지면 안 된다 — reason=${hero.reason}`);
    assert.equal(hero.degraded, false, `degraded 로 떨어지면 안 된다 — reason=${hero.reason}`);
    assert.ok(!String(hero.reason || '').includes('render-exception'),
      `frame() 의 render-exception 폴백(전체 3D 종료)을 타면 안 된다 — 실측 "${hero.reason}"`);

    //  ⭐핵심: 전 파트가 **원래 흰색(1,1,1)** 이어야 한다. 옛 3.744 도, 새 2.9 도 남으면 안 된다.
    crystalMeshes.forEach((im, i) => {
      const [r, g, b] = [im.instanceColor.getX(0), im.instanceColor.getY(0), im.instanceColor.getZ(0)];
      assert.ok(Math.abs(r - 1) < 1e-6 && Math.abs(g - 1) < 1e-6 && Math.abs(b - 1) < 1e-6,
        `파트 ${i} 가 흰색으로 복구되지 않았다 — 실측 [${r}, ${g}, ${b}] (옛 색 ${MARK} 이 얼어붙었거나 새 색 2.9 가 부분 적용됐다)`);
      assert.equal(im.instanceColor.needsUpdate, undefined, 'needsUpdate 는 setter 전용이다(getter 없음) — version 으로 본다');
      assert.equal(im.count, 1, '색이 실패해도 모델은 계속 그려져야 한다');
    });
    crystalMeshes.forEach((im, i) => {
      assert.ok(im.instanceMatrix.version > matrixVersionA[i], `파트 ${i} 의 행렬 갱신이 멈추면 안 된다`);
    });

    // ── 이웃 스웜(pod)은 멀쩡해야 한다 — "그 스웜만" 죽는다 ──
    swarms.props.pod.buf[0] = slot({ cr: 1.7, cg: 1.7, cb: 1.7 });
    swarms.props.pod.n = 1;
    hero.frame(run, 2.2, 480, 800, 480, 800, nextTime(), 0, swarms);
    const podFound = findBoostedMeshes(rendererRef.state.lastScene, 1.5).filter((im) => !crystalMeshes.includes(im));
    assert.ok(podFound.length > 0, '크리스탈이 실패해도 이웃 스웜(pod)은 정상 색을 받아야 한다(국소 격리 회귀)');

    // ── 프레임 C: 계속 렌더한다. 크리스탈은 흰색을 유지하고 다시 칠해지지 않는다 ──
    const before = thrown;
    swarms.props.crystal.buf[0] = slot({ cr: 1.9, cg: 1.9, cb: 1.9 });
    hero.frame(run, 2.2, 480, 800, 480, 800, nextTime(), 0, swarms);
    assert.equal(thrown, before, '실패 뒤에는 이 스웜의 색 쓰기를 재시도하지 않아야 한다(추가 예외 0)');
    for (const im of crystalMeshes) {
      assert.ok(Math.abs(im.instanceColor.getX(0) - 1) < 1e-6,
        `실패 이후에도 흰색이어야 한다(다시 칠해지지 않는다) — 실측 ${im.instanceColor.getX(0)}`);
      assert.equal(im.count, 1, '3D 렌더는 계속된다');
    }
  } finally {
    victim.setColorAt = originalSetColorAt;   // ⚠️인스턴스 메서드 — 반드시 원복
  }
});
