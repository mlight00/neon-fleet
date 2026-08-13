// ── §G-39 Task 8 — hero 적 `instanceColor` 실행 테스트(진짜 게이트, 장애 주입 경로) ─────────
//
//  검증 대상: `placeSwarm` 안에서 `setColorAt` 이 실패해도 그 스웜의 국소 격리(`sw.colored=false`)만
//  일어나고, `frame()` 의 render-exception 폴백(3D 세션 전체 종료, §5.1)을 타지 않는지 — **실행으로** 증명한다.
//  Task 7 이 픽업 대리 검증체로 이 계약을 증명했다면, 이 파일은 **실제 적 스웜**에서 재확인한다.
//
//  ⚠️금지: THREE 전체 mock · meshes 가 빈 채 "예외 없음"만 확인 · 소스에서 setColorAt 문자열만 확인 ·
//   legacy buildSnapshot 테스트를 배선 근거로 사용.
//  실제 GLB 재질·emissiveMap·톤매핑 결과는 여기서 증명하지 않는다 — 브라우저 WebGL 게이트 담당.
//
//  ⚠️왜 `G39-HERO-INSTANCE-COLOR`(정상 경로)와 같은 파일에 안 두고 따로 뒀나 — 코드리뷰 지적
//   (2026-08-13) 반영. 벤더 `js/vendor/three.module.js`의 `FileLoader`(zd)는 URL별 in-flight 요청을
//   **모듈 전역** `Fd{}`에 등록했다가 완료 시 지우는데, Node 에서 상대경로(`assets/3d/*.glb`)를 넘기면
//   `new Request(url)`이 그 등록 **직후**·`fetch()` 호출 **이전**에 동기 `TypeError`를 던진다. 이 예외는
//   `Fd[url]`을 지우는 `.finally()`가 걸리기도 전에 나므로 **그 URL은 프로세스 수명 내내 오염**된다
//   (§G-39 Task 7이 `g39-swarm-color-fallback.test.mjs`에서 최초 재현). 같은 프로세스에서
//   `createChase3D`를 **두 번째** 호출하면, 그 오염된 URL에 의존하는 스웜(기함 등급·무기 포탑·픽업·
//   아군 — 이 파일의 `createEnemyParts` 는 **적**만 우회하고 이들은 여전히 로더를 탄다)은 콜백만 죽은
//   대기열에 쌓고 영영 resolve/reject 되지 않는다. 이 파일의 단일 테스트는 그 상태를 안 읽어서
//   안전했지만, 나중에 누가 이 파일에 다른 테스트를 보태며 `ctl.ready.ally(...)`·`ctl.info().propCounts`·
//   `weaponReady` 같은 필드를 무심코 읽으면 "왜 준비가 안 되지?"로 헤매는 조용한 실패가 난다.
//   Node 24 기본값 `--test-isolation=process`는 **파일마다 별도 프로세스**이므로, 이 테스트를
//   `g39-hero-instance-color.test.mjs`(정상 factory)와 **별개 파일**로 두면 `Fd{}` 오염이 파일 경계를
//   못 넘어 위험이 원천 소멸한다. ⚠️두 파일을 다시 합치고 싶다면 이 주석부터 다시 읽을 것.
import test from 'node:test';
import assert from 'node:assert/strict';

test('G39-HERO-COLOR-FAULT: setColorAt 장애가 3D 전체를 죽이지 않는다', async () => {
  const THREE = await import('../js/vendor/three.module.js');
  const { createChase3D } = await import('../js/chase3d-renderer.js');
  const { makeCanvas, makeFakeRenderer } = await import('./lib/frame-smoke-harness.mjs');

  //  setColorAt 이 항상 던지는 파트를 주입한다.
  const badFactory = () => () => [{
    geo: new THREE.BoxGeometry(1, 1, 1),
    mat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
    __breakColor: true,
  }];
  const ctl = createChase3D(makeCanvas(), {
    hero: true, profile: { mobile: false, lod: 0, pixelRatio: 1 },
    createRenderer: (T, c) => makeFakeRenderer(T, c),
    createEnemyParts: badFactory(),
  });
  const meshes = ctl.debugEnemyMeshes ? ctl.debugEnemyMeshes('b1') : [];
  for (const im of meshes) im.setColorAt = () => { throw new Error('color-fault'); };

  const run = { squad: { x: 240, y: 670, dead: false, tier: 0, weapon: 'vulcan', weaponLv: 1,
    count: 8, cruisers: 0, hp: 100, maxHp: 100, charge: 0, chargeStage: 0, escortsFor3D: () => 0 },
    phase: 'track', world: { squad: {}, entities: [], bullets: [], enemyBullets: [] }, bosses: [] };
  const swarms = { props: {}, drone: { buf: [], n: 0 }, cruiser: { buf: [], n: 0 },
    b1: { buf: [{ sx: 240, sy: 500, px: 60, wob: 0, cr: 1, cg: 0.4, cb: 0.3 }], n: 1 } };

  ctl.frame(run, 2.2, 480, 800, 480, 800, 1, 0, swarms);
  ctl.frame(run, 2.2, 480, 800, 480, 800, 1.016, 0, swarms);

  assert.equal(ctl.degraded, false, `색 실패로 3D 가 꺼지면 안 된다 — ${ctl.reason}`);
  assert.equal(ctl.available, true, 'hero 3D 는 유지된다');
  assert.equal(ctl.info().b1Count, 1, '적은 여전히 배치된다(색만 원본)');
});
