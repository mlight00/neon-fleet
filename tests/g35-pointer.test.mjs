// ── §G-35 §1-2 — 포인터 폐루프 제거 검증 (P0-2) ──
//
//  Codex 6차 §2: 튕김의 직접 원인은 `input.tick()` 이 **정지한 포인터를 매 프레임 새 카메라로
//  역변환**하고, 그 목표로 기함이 움직이고, 다시 카메라가 기함을 따라가는 폐루프였다.
//  → 카메라 목표를 **포인터 화면 위치**에서 직접 정하면(기함과 독립) 고리가 끊긴다.
//    동시에 렌더·입력은 같은 affine(정확한 역함수)을 계속 쓴다.
//
//  ⚠️여기서는 그 폐루프를 **실제로 돌려 본다** — 카메라·역변환·기함 이동을 제품 함수로 반복 적분한다.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createChaseProjection, screenToWorldXAtPlayer, projectObject,
  visibleHalfWorld, pointerCameraTarget, chaseCameraBounds, PROJECTION,
} from '../js/chase-camera.js';
import { LW, LH, SQY, VIS, BOUNDS, laneFor, runPointerHold } from './lib/pointer-sim.mjs';

//  §G-37 §2: 시뮬레이터·lane·bounds 는 `tests/lib/pointer-sim.mjs` **한 곳**에서 온다.
//  ⚠️여기에 복사본을 두면 G35 회귀(테스트가 제 clamp 로 적분해 실패를 숨김)가 그대로 재현된다.

test('G35-POINTER-CLOSED-LOOP: 포인터를 10초 고정해도 발산하지 않는다', () => {
  for (const sx of [40, 120, 240, 360, 440]) {
    const r = runPointerHold(sx, 10);
    assert.ok(Number.isFinite(r.camX) && Number.isFinite(r.sqX), `유한값 유지 — ${JSON.stringify(r.trace)}`);
    const [t2, t6, t10] = r.trace;
    //  2초 이후로는 한 방향으로 계속 흐르지 않는다(정착).
    assert.ok(Math.abs(t10.sqX - t6.sqX) < 1,
      `sx=${sx}: 6초→10초 사이 기함이 ${Math.abs(t10.sqX - t6.sqX).toFixed(2)}px 더 흘렀다 — 정착해야 한다\n  ${JSON.stringify(r.trace)}`);
    assert.ok(Math.abs(t6.sqX - t2.sqX) < 2,
      `sx=${sx}: 2초→6초 사이 ${Math.abs(t6.sqX - t2.sqX).toFixed(2)}px 이동 — 이미 정착해 있어야 한다`);
  }
});

test('G35-POINTER-NO-WALL-BOUNCE: 트랙 끝에서 튕기지 않는다(진동 0)', () => {
  //  ⚠️"끝에 붙는 것"과 "튕기는 것"은 다르다. 포인터를 화면 맨 끝에 두면 기함이 트랙 끝으로 가는 것이
  //   **올바른 동작**이다. 막아야 할 것은 clamp 에 부딪힌 뒤 반대로 밀려나 왔다갔다 하는 **진동**이다.
  //   (폐루프가 있으면 정확히 그렇게 된다 — 이사님이 본 "여러 번 튕겨나오는 현상".)
  for (const sx of [0, 40, 440, 480]) {
    //  마지막 2초 구간의 위치 변화를 본다 — 진동하면 값이 계속 바뀐다.
    const a = runPointerHold(sx, 8);
    const b = runPointerHold(sx, 8.5);
    const c = runPointerHold(sx, 10);
    const spread = Math.max(a.sqX, b.sqX, c.sqX) - Math.min(a.sqX, b.sqX, c.sqX);
    assert.ok(spread < 0.5,
      `sx=${sx}: 8·8.5·10초 위치가 ${spread.toFixed(3)}px 범위로 흔들린다 — 정착해야 한다`
      + ` (8s ${a.sqX.toFixed(2)} / 8.5s ${b.sqX.toFixed(2)} / 10s ${c.sqX.toFixed(2)})`);
    //  카메라도 같이 흔들리면 안 된다.
    const camSpread = Math.max(a.camX, b.camX, c.camX) - Math.min(a.camX, b.camX, c.camX);
    assert.ok(camSpread < 0.5, `sx=${sx}: 카메라가 ${camSpread.toFixed(3)}px 흔들린다`);
  }
});

test('G35-POINTER-ANCHOR: 정착 뒤 기함 화면 위치가 포인터와 2px 이내', () => {
  //  A안에서는 이게 불가능했다(마우스 40 → 기함 화면 44%). 정확한 역함수를 되찾은 이유가 이것이다.
  //  ⚠️단, 트랙 여백에 막히면 포인터를 따라갈 수 없다 — 그 경우는 안전 범위(safe anchor)로 본다.
  const rows = [];
  for (const sx of [120, 200, 240, 280, 360]) {
    const r = runPointerHold(sx, 10);
    rows.push({ 포인터: sx, 카메라: +r.camX.toFixed(1), 기함월드: +r.sqX.toFixed(1), 기함화면: +r.shipScreenX.toFixed(1) });
    assert.ok(Math.abs(r.shipScreenX - sx) <= 2,
      `포인터 ${sx} ↔ 기함 화면 ${r.shipScreenX.toFixed(2)} — 오차 ${Math.abs(r.shipScreenX - sx).toFixed(2)}px (≤2 요구)\n  ${JSON.stringify(rows)}`);
  }
});

test('G35-POINTER-CAMERA-INDEPENDENT: 카메라 목표는 기함이 아니라 포인터가 정한다', () => {
  //  폐루프가 끊긴 근거 — 기함이 어디 있든 같은 포인터면 카메라 목표가 같다.
  for (const sx of [0, 120, 240, 360, 480]) {
    const a = pointerCameraTarget(sx, LW, VIS, PROJECTION);
    assert.ok(Number.isFinite(a), '유한');
    //  기함 위치는 인자에 없다 — 구조적으로 독립이다. 값 범위도 카메라 한계 안이어야 한다.
    //  §G-35 후속(이사님 판단): 카메라는 트랙 **밖**을 `edgeOverscanPx` 만큼 비출 수 있다.
    //   그래야 "카메라가 움직여 가려진 곳이 드러나는" 이사님 최초 의도가 성립한다
    //   (이동 여유가 96px → 256px). §G-34 §6 정책 B 를 의도적으로 완화한 것이다.
    const OV = PROJECTION.edgeOverscanPx || 0;
    assert.ok(a >= VIS - OV - 1e-9 && a <= LW - VIS + OV + 1e-9,
      `카메라 목표 ${a} 가 [${VIS - OV}, ${LW - VIS + OV}] 안에 있어야 한다`);
  }
  //  중앙 데드존(화면 ±10%) 안에서는 카메라가 중앙을 본다.
  assert.ok(Math.abs(pointerCameraTarget(240, LW, VIS, PROJECTION) - 240) < 1e-9, '정중앙');
  assert.ok(Math.abs(pointerCameraTarget(264, LW, VIS, PROJECTION) - 240) < 1e-9, '데드존 안(+24px)');
  assert.ok(pointerCameraTarget(400, LW, VIS, PROJECTION) > 240, '데드존 밖이면 그쪽으로 민다');
});

test('G35-INVERSE-EXACT: 렌더와 입력이 같은 affine (정확한 역함수)', () => {
  //  A안 철회의 핵심 계약. 카메라가 어디 있든 왕복 오차 0.
  for (const zoom of [1.0, 1.8, 2.0, 2.2]) {
    for (const blend of [0, 0.5, 1]) {
      for (const camX of [192, 240, 288]) {
        const p = createChaseProjection({
          logicalW: LW, logicalH: LH, zoom, chaseBlend: blend, squadX: 300, squadY: SQY, cameraWorldX: camX,
        });
        for (const sx of [0, 120, 240, 360, LW]) {
          const wx = screenToWorldXAtPlayer(sx, p);
          const back = projectObject({ x: wx, y: SQY, r: 1 }, 'enemy', p).x;
          assert.ok(Math.abs(back - sx) < 1e-9,
            `zoom=${zoom} blend=${blend} cam=${camX} sx=${sx}: 왕복 ${back}`);
        }
      }
    }
  }
});

// ── §G-35 P0-3 — 키보드 카메라 3상태 (TRACK / HOLD / RECENTER) ──
test('G35-CAMSTATE: 키보드는 데드존 안에서 유지하되 idle 이면 느리게 복귀한다', async () => {
  //  Codex 6차 §2: "영구 정지"는 한 번 어긋난 구도를 계속 남긴다(28%/72% 고착의 원인).
  //  그렇다고 항상 복귀시키면 조준 폐루프가 생긴다 → **입력이 멈춘 뒤에만** 복귀한다.
  const { createChaseCameraState, updateChaseCameraX } = await import('../js/chase-camera.js');
  const o = { deadHalf: 40, hysteresis: 6, tau: 0.12, idleRecenter: true, tauRecenter: 0.9, idleHold: 0.5 };

  //  ① TRACK — 데드존 밖이면 빠르게 따라간다.
  const st = createChaseCameraState(240);
  updateChaseCameraX(st, 400, 1 / 60, o);
  assert.equal(st.phase, 'TRACK', `데드존 밖 → TRACK (실측 ${st.phase})`);

  //  ② HOLD — 기함이 데드존 안에서 **움직이는 동안**은 카메라 유지(조준 안정).
  const st2 = createChaseCameraState(240);
  //  ⚠️데드존(±40) **안**에 머물러야 HOLD 다 — 밖으로 나가면 TRACK 이 맞다.
  //   좌우로 흔들어 "움직이는 중"을 만들되 이탈은 30px 이내로 유지한다(180 px/s).
  let x = 240;
  for (let i = 0; i < 40; i++) { x = 240 + Math.sin(i * 0.4) * 30; updateChaseCameraX(st2, x, 1 / 60, o); }
  assert.equal(st2.phase, 'HOLD', `데드존 안 + 이동 중 → HOLD (실측 ${st2.phase})`);
  assert.ok(Math.abs(st2.x - 240) < 0.01, `HOLD 중에는 카메라가 그대로 — 실측 ${st2.x.toFixed(3)}`);

  //  ③ RECENTER — 입력이 멈추고(기함 정지) 0.5초가 지나면 느리게 복귀한다.
  const st3 = createChaseCameraState(200);
  for (let i = 0; i < 40; i++) updateChaseCameraX(st3, 230, 1 / 60, o);    // 0.66초 정지 유지
  assert.equal(st3.phase, 'RECENTER', `idle 지속 → RECENTER (실측 ${st3.phase})`);
  const before = st3.x;
  for (let i = 0; i < 180; i++) updateChaseCameraX(st3, 230, 1 / 60, o);   // 3초 더
  assert.ok(Math.abs(st3.x - 230) < Math.abs(before - 230),
    `복귀가 진행된다 — ${before.toFixed(2)} → ${st3.x.toFixed(2)} (목표 230)`);
  assert.ok(Math.abs(st3.x - 230) < 2, `충분한 시간 뒤 기함에 맞춰진다 — 실측 ${st3.x.toFixed(2)}`);

  //  ④ 복귀를 끄면(마우스·터치 경로) 데드존 안에서 카메라가 움직이지 않는다.
  const st4 = createChaseCameraState(200);
  for (let i = 0; i < 200; i++) updateChaseCameraX(st4, 230, 1 / 60, { ...o, idleRecenter: false });
  assert.ok(Math.abs(st4.x - 200) < 0.01, `idleRecenter=false 면 유지 — 실측 ${st4.x.toFixed(3)}`);
});

// ── §G-35 P0-4 — 기함 표시 묶음(선체 + 선택 무기) 원자 게이트 ──
test('G36-READY-BUNDLE: 제품 함수 `isFlagshipBundleReady` 를 직접 검증한다', async () => {
  //  §G-36 P1(Codex 7차 §4): G35 는 `(a,b) => a && b` **복제 lambda** 만 검사해서,
  //   제품이 다시 선체만 보도록 바뀌어도 통과했다. 이제 **제품이 쓰는 그 함수**를 부른다.
  const { isFlagshipBundleReady } = await import('../js/chase3d-renderer.js');
  const mount = (ok, n) => ({ ok, meshes: new Array(n).fill(0) });

  //  ① 네 조합
  assert.equal(isFlagshipBundleReady({ ok: false }, mount(false, 0)), false, '둘 다 미준비 → 2D');
  assert.equal(isFlagshipBundleReady({ ok: true }, mount(false, 0)), false, '선체만 준비 → 2D(무기 공백 방지)');
  assert.equal(isFlagshipBundleReady({ ok: false }, mount(true, 3)), false, '무기만 준비 → 2D');
  assert.equal(isFlagshipBundleReady({ ok: true }, mount(true, 3)), true, '둘 다 준비 → 3D');

  //  ② 무기를 vulcan → laser 로 바꿨는데 laser 가 미준비인 경우(같은 선체, 다른 마운트 레코드)
  const hull = { ok: true };
  const mounts = { vulcan: mount(true, 3), laser: mount(false, 0) };
  assert.equal(isFlagshipBundleReady(hull, mounts.vulcan), true, 'vulcan 은 준비됨');
  assert.equal(isFlagshipBundleReady(hull, mounts.laser), false, 'laser 로 바꾸면 다시 2D');

  //  ③ `ok=true` 인데 메시가 0개 — "플래그만 섰고 그릴 게 없는" 상태를 통과시키면 안 된다.
  assert.equal(isFlagshipBundleReady(hull, mount(true, 0)), false, 'ok=true 라도 meshes 0 이면 미준비');

  //  ④ 결측/undefined 방어
  assert.equal(isFlagshipBundleReady(undefined, mount(true, 3)), false, '선체 레코드 없음');
  assert.equal(isFlagshipBundleReady(hull, undefined), false, '마운트 레코드 없음');
});

test('G37-REVEAL-BREAKDOWN: reveal 을 5개 지표로 분해한다(플레이어 근거리 평면 기준)', () => {
  //  §G-36 §1-3(Codex 7차 §2): G35 의 `G35-REVEAL` 은 "같은 월드 점의 화면 이동량 >200px" 이라는
  //   **임의 기준**이었다. 그 문턱을 맞추려다 오버스캔이 필요해졌고, 오버스캔은 새 트랙을 드러낸 게
  //   아니라 **유효 트랙을 배경으로 교체**했다(양 끝에서 트랙 55% + 트랙밖 31%).
  //  §G-37 §4(Codex 8차 §5): "revealed 240" 한 숫자로는 **어느 쪽으로 얼마나** 드러나는지 알 수 없다.
  //   좌우가 비대칭이어도, 한쪽이 0 이어도 합은 240 이 될 수 있다 → 방향별로 쪼개 기록한다.
  //
  //  ⚠️**기준면 명시**: 아래 모든 px 는 **플레이어(기함)가 놓인 근거리 평면**의 월드 좌표다.
  //   3D 원근에서 먼 평면은 같은 화면 폭이 더 넓은 월드 구간에 대응하므로 숫자가 달라진다.
  //   게임 판정·이동·트랙 폭이 전부 이 평면에서 정의되므로 체감 지표도 이 평면으로 잰다.
  const B = chaseCameraBounds(LW, VIS, PROJECTION);
  const leftView = [B.min - VIS, B.min + VIS];      // 카메라 좌한계에서 보이는 월드 구간
  const rightView = [B.max - VIS, B.max + VIS];     // 우한계

  const union = [Math.min(leftView[0], rightView[0]), Math.max(leftView[1], rightView[1])];
  const inter = [Math.max(leftView[0], rightView[0]), Math.min(leftView[1], rightView[1])];
  const alwaysVisible = Math.max(0, inter[1] - inter[0]);

  const M = {
    //  ① 합집합 — 좌우로 다 움직였을 때 볼 수 있는 전체 구간
    unionSpan: union[1] - union[0],
    //  ② 교집합 — 카메라가 어디 있든 **항상** 보이는 구간(= 절대 안 드러나는 게 아니라 늘 보이는 곳)
    intersectionSpan: alwaysVisible,
    //  ③ 좌→우 이동으로 **새로 드러나는** 오른쪽 구간
    revealRightward: Math.max(0, rightView[1] - leftView[1]),
    //  ④ 우→좌 이동으로 새로 드러나는 왼쪽 구간
    //   = 우한계 뷰의 왼쪽 끝보다 **더 왼쪽**으로 새로 보이게 되는 길이.
    revealLeftward: Math.max(0, rightView[0] - leftView[0]),
    //  ⑤ 트랙 밖 표시 — C안은 0(연출 여백 없이 유효 영역만)
    outOfTrack: Math.max(0, 0 - union[0]) + Math.max(0, union[1] - LW),
  };

  //  카메라 이동 거리 = 트랙 폭 − 가시 폭. 이 항등식이 5개 지표의 뼈대다.
  const travel = B.max - B.min;
  assert.equal(travel, LW - VIS * 2, `카메라 이동 = 트랙 − 가시폭 — 실측 ${travel}`);

  assert.deepEqual(M, {
    unionSpan: 480, intersectionSpan: 0,
    revealRightward: 240, revealLeftward: 240, outOfTrack: 0,
  }, `reveal 분해(플레이어 근거리 평면 기준) 실측: ${JSON.stringify(M, null, 2)}`);

  //  ⭐항등식으로 서로 묶는다 — 한 숫자만 맞춰 놓고 나머지가 어긋나는 상태를 막는다.
  assert.equal(M.revealRightward, travel, '오른쪽으로 드러나는 양 = 카메라 이동 거리');
  assert.equal(M.revealLeftward, travel, '왼쪽도 같다(좌우 대칭)');
  assert.equal(M.unionSpan - M.intersectionSpan, M.revealRightward + M.revealLeftward,
    '합집합 − 교집합 = 좌우 reveal 합');
  assert.equal(M.unionSpan, LW, '합집합이 트랙과 정확히 일치(모자라지도 넘치지도 않는다)');
  assert.equal(M.outOfTrack, 0, 'C안: 트랙 밖은 한 픽셀도 비추지 않는다');

  //  ⑥ 한 화면 트랙 표시 비율 — 중앙과 가장자리가 **같아야** 한다(오버스캔이 없으므로).
  const coverCenter = (VIS * 2) / LW;
  const coverEdge = (Math.min(LW, rightView[1]) - Math.max(0, rightView[0])) / LW;
  assert.ok(Math.abs(coverCenter - coverEdge) < 1e-9,
    `중앙 ${(coverCenter * 100).toFixed(0)}% vs 가장자리 ${(coverEdge * 100).toFixed(0)}% — 오버스캔 0 이면 같아야 한다`);
  assert.equal(+(coverCenter * 100).toFixed(2), 50, '한 화면에 트랙의 50% (C안)');
});

test('G37-FLAGSHIP-DISPLAY: bundle 이 없으면 2D 유지 — 레거시 우회로 차단', async () => {
  //  Codex 8차 §5: main 이 `bundle ? bundle() : flagship()` 이라 bundle 이 빠지면
  //  **조용히 선체 전용 판정으로 되돌아갔다.** 이제 제품 helper 가 그 경로를 막는다.
  const { flagshipReadyForDisplay } = await import('../js/chase3d-config.js');

  assert.equal(flagshipReadyForDisplay(null, 0, 'vulcan'), false, 'ready 자체가 없음 → 2D');
  //  ⭐핵심: bundle 이 없고 flagship 만 true 여도 **false** 여야 한다.
  assert.equal(flagshipReadyForDisplay({ flagship: () => true }, 0, 'vulcan'), false,
    'flagshipBundle 이 없으면 flagship=true 라도 2D 유지(선체 전용 판정 금지)');
  assert.equal(flagshipReadyForDisplay({ flagshipBundle: () => false }, 0, 'vulcan'), false, 'bundle false → 2D');
  assert.equal(flagshipReadyForDisplay({ flagshipBundle: () => true }, 0, 'vulcan'), true, 'bundle true → 3D');

  //  무기 교체: vulcan 준비 → laser 미준비면 다시 2D.
  const ready = { flagshipBundle: (t, w) => w === 'vulcan' };
  assert.equal(flagshipReadyForDisplay(ready, 0, 'vulcan'), true, 'vulcan 준비');
  assert.equal(flagshipReadyForDisplay(ready, 0, 'laser'), false, 'laser 로 바꾸면 2D');
});
