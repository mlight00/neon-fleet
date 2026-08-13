// ── §G-39 Task 8 — hero 적 `instanceColor` 실행 테스트(진짜 게이트, 정상 경로) ──────────────
//
//  검증 대상: `chase3d-renderer.js` 의 적 스웜 생성부(ENEMY_KEYS 루프)가 실제 THREE.InstancedMesh 를
//  만들고, `placeSwarm` 이 체력·피격에 따라 `instanceColor` 를 실제로 갱신하는지 — **실행으로** 증명한다.
//  Task 6·7 은 배치 수학과 색 쓰기 계약을 (각각 발사체/픽업 대리 검증체로) 증명했지만, 적 스웜 자체가
//  실제로 3D 버퍼에 들어가는지는 아직 실행으로 증명된 적이 없다 — 이 파일이 그 마지막 게이트다.
//
//  ⚠️금지: THREE 전체 mock · meshes 가 빈 채 "예외 없음"만 확인 · 소스에서 setColorAt 문자열만 확인 ·
//   legacy buildSnapshot 테스트를 배선 근거로 사용.
//  실제 GLB 재질·emissiveMap·톤매핑 결과는 여기서 증명하지 않는다 — 브라우저 WebGL 게이트 담당.
//
//  ⚠️왜 `G39-HERO-COLOR-FAULT`(장애 주입)를 이 파일에 같이 안 두고 `g39-hero-color-fault.test.mjs`로
//   쪼갰나 — 코드리뷰 지적(2026-08-13) 반영. 벤더 `js/vendor/three.module.js`의 `FileLoader`(zd)는
//   URL별 in-flight 요청을 **모듈 전역** `Fd{}`에 등록했다가 완료 시 지우는데, Node 에서 상대경로
//   (`assets/3d/*.glb`)를 넘기면 `new Request(url)`이 그 등록 **직후**·`fetch()` 호출 **이전**에 동기
//   `TypeError`를 던진다. 이 예외는 `Fd[url]`을 지우는 `.finally()`가 걸리기도 전에 나므로 **그 URL은
//   프로세스 수명 내내 오염**된다(§G-39 Task 7이 `g39-swarm-color-fallback.test.mjs`에서 최초 재현).
//   같은 프로세스에서 `createChase3D`를 **두 번째** 호출하면, 그 오염된 URL에 의존하는 스웜(기함 등급·
//   무기 포탑·픽업·아군 — 이 파일의 `createEnemyParts` 는 **적**만 우회하고 이들은 여전히 로더를 탄다)
//   은 콜백만 죽은 대기열에 쌓고 영영 resolve/reject 되지 않는다. 지금 이 파일의 단일 테스트는 그
//   상태를 안 읽어서 안전했지만, 나중에 누가 이 파일에 세 번째 테스트를 보태며 `ctl.ready.ally(...)`·
//   `ctl.info().propCounts`·`weaponReady` 같은 필드를 무심코 읽으면 "왜 준비가 안 되지?"로 헤매는
//   조용한 실패가 난다. Node 24 기본값 `--test-isolation=process`는 **파일마다 별도 프로세스**이므로,
//   `G39-HERO-INSTANCE-COLOR`(정상 factory)와 `G39-HERO-COLOR-FAULT`(고장 factory, `setColorAt` 을
//   영구 monkey-patch)를 **별개 파일**로 나누면 `Fd{}` 오염이 파일 경계를 못 넘어 위험이 원천 소멸한다.
//   ⚠️이 파일을 다시 합치고 싶다면 이 주석부터 다시 읽을 것 — 두 팩토리가 다르다는 이유만으로 ctl 을
//   공유 못 하는 게 아니라, "안전하다고 확인된 범위(현재 assertion)를 벗어나는 순간" 위험해진다.
import test from 'node:test';
import assert from 'node:assert/strict';

/** 실제 THREE 로 만든 얇은 적 파트 팩토리(파트 2개 = 다중 파트 검증용). */
async function twoPartFactory(THREE) {
  return () => [0, 1].map(() => ({
    geo: new THREE.BoxGeometry(1, 1, 1),
    mat: new THREE.MeshBasicMaterial({ color: 0xffffff }),
  }));
}

test('G39-HERO-INSTANCE-COLOR: 실제 적이 배치되고 체력·피격이 색으로 나온다', async () => {
  const THREE = await import('../js/vendor/three.module.js');
  const { createChase3D } = await import('../js/chase3d-renderer.js');
  const { makeCanvas, makeFakeRenderer } = await import('./lib/frame-smoke-harness.mjs');

  const ctl = createChase3D(makeCanvas(), {
    hero: true, profile: { mobile: false, lod: 0, pixelRatio: 1 },
    createRenderer: (T, c) => makeFakeRenderer(T, c),
    createEnemyParts: await twoPartFactory(THREE),
  });

  //  §G39-R1 (Codex 구현검수 §5): 예전에는 여기서 `{cr, cg, cb}` 를 **손으로 지어** 넣었다.
  //   그러면 "임의의 RGB 가 renderer 까지 간다"만 증명될 뿐, **제품이 실제 적에게 계산하는 수치**가
  //   그 경로를 통과하는지는 증명되지 않는다. 하드코딩 `2.4` 도 현재 확정값(3.744)과 어긋나 있었다.
  //   → production `put3D()` 가 부르는 바로 그 함수(`writeEnemySlot`)로 슬롯을 만든다.
  const { writeEnemySlot } = await import('../js/chase3d-collect.js');
  const { FEEDBACK, recordDamageFeedback } = await import('../js/damage-feedback.js');
  const enemy = { hp: 100, maxHp: 100, x: 240, y: 400 };
  const proj = { x: 240, y: 500, scale: 1 };
  const def = { len: 60, max: 120 };
  const slot = { sx: 0, sy: 0, px: 0, wob: 0, cr: 1, cg: 1, cb: 1 };
  /** 실제 적 → 실제 seam → 슬롯. 색을 우리가 정하지 않는다. */
  const mkFromEntity = (now) => writeEnemySlot(slot, enemy, proj, def, 0, now, FEEDBACK.boost);
  const run = { squad: { x: 240, y: 670, dead: false, tier: 0, weapon: 'vulcan', weaponLv: 1,
    count: 8, cruisers: 0, hp: 100, maxHp: 100, charge: 0, chargeStage: 0, escortsFor3D: () => 0 },
    phase: 'track', world: { squad: {}, entities: [], bullets: [], enemyBullets: [] }, bosses: [] };
  const swarms = { props: {}, drone: { buf: [], n: 0 }, cruiser: { buf: [], n: 0 } };

  const paint = (slot) => { swarms.b1 = { buf: [slot], n: 1 };
    ctl.frame(run, 2.2, 480, 800, 480, 800, 1, 0, swarms); };

  paint(mkFromEntity(0));                         // HP 100%
  const meshes = ctl.debugEnemyMeshes ? ctl.debugEnemyMeshes('b1') : [];
  assert.ok(meshes.length >= 2, `다중 파트가 있어야 한다 — 실측 ${meshes.length}`);
  assert.ok(meshes[0].instanceColor, 'instanceColor 가 실제로 생성돼야 한다');

  const read = (im, i) => { const c = new THREE.Color(); im.getColorAt(i, c); return [c.r, c.g, c.b]; };
  const full = read(meshes[0], 0);

  //  ⚠️needsUpdate 는 boolean 필드가 아니라 version 을 올리는 setter 다 — version 으로 본다.
  const v0 = meshes[0].instanceColor.version;
  enemy.hp = 35;                                  // 저체력 — 색은 seam 이 정한다
  paint(mkFromEntity(0));
  const low = read(meshes[0], 0);
  assert.notDeepEqual(low, full, '체력이 낮으면 색이 달라야 한다');
  assert.ok(meshes[0].instanceColor.version > v0, 'instanceColor.version 이 올라야 한다');

  //  피격 번쩍 — 실제 사이드카에 기록하고 같은 시각에 읽는다(값을 손으로 넣지 않는다).
  recordDamageFeedback(enemy, enemy.x, enemy.y, 10, 5);
  paint(mkFromEntity(10));
  const flash = read(meshes[0], 0);
  assert.notDeepEqual(flash, low, '피격 직후 색이 달라야 한다');
  //  ⭐현재 확정값이 실제로 GPU 버퍼까지 갔는가 — R 채널은 체력 틴트가 1 을 유지하므로 정확히 boost 다.
  assert.ok(Math.abs(flash[0] - FEEDBACK.boost) < 1e-5,
    `피격 R 채널이 FEEDBACK.boost(${FEEDBACK.boost}) 여야 한다 — 실측 ${flash[0]}`);
  assert.ok(flash[1] < flash[0] && flash[2] < flash[1],
    `저체력 붉은 기가 번쩍 중에도 유지돼야 한다(흰색으로 뭉개지면 안 된다) — 실측 [${flash}]`);
  //  슬롯의 위치 필드도 seam 이 같이 썼다 — 색만 따로 지우는 회귀가 성립하지 않는다는 구조적 근거.
  assert.equal(slot.sx, proj.x, 'seam 이 위치도 함께 기록해야 한다');
  assert.equal(slot.px, Math.min(def.max, def.len * proj.scale), 'seam 이 화면 크기도 함께 기록해야 한다');

  //  ⭐다중 파트 전부 같은 색이어야 한다 — 한 파트만 칠하면 몸통만 붉어진다.
  for (const im of meshes) assert.deepEqual(read(im, 0), flash, '전 파트 동일 색');

  //  ⚠️코드리뷰 지적(2026-08-13): `degraded===false` 는 "예외가 없었다"만 말한다. 색이 버퍼에
  //   써졌어도 render() 앞에서 early-return 하면 화면엔 안 나온다 — 도달 자체를 직접 짚는다.
  //   위에서 paint() 를 3번 불렀으니(HP100%·저체력·피격) render() 도 3번 불렸어야 한다.
  assert.ok(ctl.renderer && ctl.renderer.__state && ctl.renderer.__state.renders >= 3,
    `renderer.render() 가 paint 횟수(3)만큼 불려야 한다 — 실측 ${ctl.renderer?.__state?.renders}`);

  assert.equal(ctl.degraded, false, `degraded 면 안 된다 — ${ctl.reason}`);
});
