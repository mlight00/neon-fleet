// ── §G-35 §1-4 / P0-5 — 실제 3D `frame()` 스모크 ──
//
//  Codex 6차 §4: 962개 테스트가 전부 통과하면서도 3D 전체가 꺼져 있었다.
//  `placeShots` 안의 `camOriginDepth` **선언 누락**이 첫 프레임에 `ReferenceError` 를 던졌고,
//  렌더러가 "이 세션은 2D 로 고정" 폴백에 들어갔다. 어떤 테스트도 `frame()` 을 **실행**하지 않았기 때문이다
//  (WebGL 이 필요하다). import 성공·정규식 대조로는 이런 실행 경로 오류를 절대 못 잡는다.
//
//  이 파일이 하는 일: **renderer 한 겹만** 가짜로 바꾸고 나머지는 전부 진짜로 돌린다.
//   · 씬·카메라·지오메트리·행렬·`placeShots` 수학 = **진짜 THREE / 진짜 제품 코드**
//   · 가짜인 것 = `WebGLRenderer` 뿐(GPU 가 없으니 어쩔 수 없다)
//  ⚠️금지 사항 준수: THREE API 전체 mock 아님 · 빈 스웜 아님(player/enemy shot 각 1개 이상 투입).
//  ⚠️브라우저 소프트웨어 WebGL 이 우선이지만 이 환경은 pane 이 숨겨져 프레임을 합성하지 못한다
//   (스크린샷조차 5초 타임아웃). 그래서 §6 의 2안(얇은 주입 + 최소 fake)을 쓴다.
//  §G-39 Task 8: `makeFakeRenderer`·`makeCanvas` 는 `tests/lib/frame-smoke-harness.mjs` 로 옮겼다 —
//   여기서는 그 유일한 원본을 import 만 한다(사본 갈림 금지, G35 교훈).
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeFakeRenderer, makeCanvas } from './lib/frame-smoke-harness.mjs';

/** 살아있는 squad + player/enemy shot 이 각각 든 최소 run. 빈 스웜은 이번 사고를 재현하지 못한다. */
function makeRun() {
  const squad = {
    x: 240, y: 670, dead: false, tier: 0, weapon: 'vulcan', weaponLv: 1,
    count: 8, cruisers: 0, hp: 100, maxHp: 100, charge: 0, chargeStage: 0,
    escortsFor3D: () => 0,
  };
  return { squad, phase: 'track', world: { squad, entities: [], bullets: [], enemyBullets: [] }, bosses: [] };
}

/** main 이 3D 로 넘기는 수집 버퍼와 같은 모양. **player shot 1개 + enemy shot 1개**를 반드시 넣는다. */
function makeSwarms() {
  const slot = (o) => ({ sx: 240, sy: 500, px: 20, wob: 0, col: 0x66e0ff, wx: 240, wy: 400, mul: 1, wmul: 1, core: 1, ...o });
  const props = {};
  for (const k of ['pbullet', 'ebullet', 'laser', 'missile']) props[k] = { buf: [slot(), slot()], n: 0 };
  props.pbullet.n = 1;                         // 아군 발사체 1개 — `placeShots` 분기를 실제로 통과
  props.ebullet.n = 1;                         // 적탄 1개 — 반대 방향(wob=π) 분기
  props.ebullet.buf[0].wob = Math.PI;
  return { props, drone: { buf: [], n: 0 }, cruiser: { buf: [], n: 0 } };
}

async function runSmoke(frames = 2) {
  const THREE = await import('../js/vendor/three.module.js');
  const { createChase3D } = await import('../js/chase3d-renderer.js');
  const canvas = makeCanvas();
  const ctl = createChase3D(canvas, {
    hero: true,
    profile: { mobile: false, lod: 0, pixelRatio: 1 },
    createRenderer: (T, c) => makeFakeRenderer(T, c),
  });
  const run = makeRun(), swarms = makeSwarms();
  //  t≥0.5 가 되도록 zoom 2.2(=전환 완료)로 넣는다. 프레임을 두 번 돌려 1회성 초기화 뒤도 확인한다.
  for (let i = 0; i < frames; i++) {
    ctl.frame(run, 2.2, 480, 800, 480, 800, 1 + i * 0.016, 0, swarms);
  }
  return ctl;
}

test('G35-RENDERER-FRAME-SMOKE: player/enemy shot 이 든 프레임이 예외 없이 렌더까지 간다', async () => {
  const ctl = await runSmoke(2);

  assert.equal(ctl.available, true, `available 이어야 한다 — reason=${ctl.reason}`);
  assert.equal(ctl.degraded, false, `degraded 면 안 된다 — reason=${ctl.reason}`);
  assert.ok(!String(ctl.reason || '').includes('render-exception'),
    `reason 에 render-exception 이 없어야 한다 — 실측 "${ctl.reason}"`);
  assert.equal(ctl._rendered, true, '_rendered=true — frame() 이 실제로 렌더까지 도달했다');

  //  ⚠️핵심: `renderer.render()` 가 실제로 불렸는가. 여기까지 와야 `placeShots` 를 통과한 것이다.
  const info = ctl.info ? ctl.info() : null;
  assert.ok(info, 'info() 를 읽을 수 있다');
  assert.equal(info.hero, true, 'hero 렌더러');
  //  §G-36 §5: 검증 **범위를 정확히** 한다 — 이 테스트가 보장하는 것은
  //  "실제 THREE 씬·행렬·배치 코드의 frame 실행 중 JS 예외가 없다"뿐이다.
  //  PMREM·셰이더 컴파일·재질·실제 GL 컨텍스트는 **브라우저 WebGL QA** 가 담당한다(별도 게이트).
  assert.ok(ctl.renderer && ctl.renderer.__state && ctl.renderer.__state.renders >= 2,
    `renderer.render() 가 2회 이상 불려야 한다(2프레임) — 실측 ${ctl.renderer?.__state?.renders}`);

  //  §G-37 §5(Codex 8차 §6): "예외 없이 돌았다"는 **탄이 0개여도** 참이다.
  //   `camOriginDepth` 회귀는 `placeShots` **안**에서 터졌으므로, 그 코드에 실제로 들어갔음을 세야 한다.
  //  ⚠️`renders >= 2` 만 보면 탄 배치 경로 전체가 죽어도 초록이다.
  assert.ok(info.shotCounts, `info().shotCounts 를 읽을 수 있어야 한다 — 실측 ${JSON.stringify(info.shotCounts)}`);
  assert.ok(info.shotCounts.pbullet >= 1,
    `플레이어 탄이 최소 1발 배치돼야 한다 — 실측 ${info.shotCounts.pbullet} (${JSON.stringify(info.shotCounts)})`);
  assert.ok(info.shotCounts.ebullet >= 1,
    `적 탄이 최소 1발 배치돼야 한다 — 실측 ${info.shotCounts.ebullet} (${JSON.stringify(info.shotCounts)})`);
});

test('G35-RENDERER-FRAME-SMOKE-TWICE: 두 번째 프레임도 안전하다(1회성 초기화 뒤)', async () => {
  //  첫 프레임에서만 만들어지는 자원(리그·인스턴스·행렬)이 두 번째 프레임을 깨뜨리지 않는지 본다.
  const ctl = await runSmoke(2);
  assert.equal(ctl.degraded, false, `2프레임 뒤에도 정상 — reason=${ctl.reason}`);
  assert.equal(ctl._rendered, true, '2프레임 뒤에도 렌더 도달');
});

test('G36-RENDER-EXCEPTION-FALLBACK: 렌더 중 예외가 degraded 로 드러난다(조용한 통과 금지)', async () => {
  //  ⚠️스모크가 "그냥 통과만 하는" 테스트가 되지 않도록, **잡을 수 있다는 것**을 증명한다.
  //   `camOriginDepth` 누락과 같은 종류(= placeShots 실행 중 예외)를 인위적으로 만들어 본다:
  //   shot 버퍼에 좌표 대신 깨진 값을 넣으면 배치 수학이 NaN 을 만들고, 렌더러는 그래도 죽지 않아야 한다.
  //   (여기서 확인하는 것은 "예외가 나면 degraded 로 드러난다"는 계약이다 — 조용히 통과하면 안 된다.)
  const THREE = await import('../js/vendor/three.module.js');
  const { createChase3D } = await import('../js/chase3d-renderer.js');
  const canvas = makeCanvas();
  const ctl = createChase3D(canvas, {
    hero: true,
    profile: { mobile: false, lod: 0, pixelRatio: 1 },
    //  render() 에서 던지는 renderer — 실행 경로 예외가 degraded 로 이어지는지 확인한다.
    createRenderer: (T, c) => {
      const r = makeFakeRenderer(T, c);
      r.render = () => { throw new Error('boom-in-render'); };
      return r;
    },
  });
  const run = makeRun(), swarms = makeSwarms();
  ctl.frame(run, 2.2, 480, 800, 480, 800, 1, 0, swarms);
  assert.equal(ctl.degraded, true, '렌더 중 예외는 degraded 로 드러나야 한다(조용히 통과 금지)');
  assert.ok(String(ctl.reason || '').includes('render-exception'),
    `reason 에 render-exception 이 남아야 한다 — 실측 "${ctl.reason}"`);
});
