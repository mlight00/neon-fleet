// ── §G-38 — 날아오는 오브젝트 전체의 3D 시각 중심 보정 ─────────────────────────────────
//
//  이사님 제보(2026-08-12): "적이 기함 위치로 내려왔을 때 기함보다 위에 떠 있는 느낌" →
//  이어서 "날아오는 모든 오브젝트 위치를 다 동일하게 맞춰줘. 크리스탈, 보급선, 운석, 등등".
//
//  실측(dist 브라우저, 480x800, 같은 배치점 화면 y=664, 렌더 알파 경계):
//      적   top 627 / bot 700 / 중심 663.5   ← 배치점에 중심 정렬
//      기함 top 612 / bot 745 / 중심 678.5   ← 배치점보다 15px 아래(엔진·꼬리)
//
//  ⚠️먼저 "고도(월드 y)" 를 의심해 평면 고정을 시도했다 — 화면상 변화 **0**.
//   placeSwarm 은 화면 위치·크기를 맞추고 고도를 결과로 두므로 고도만 바꾸면 보이지 않는다.
//   이 테스트는 그 교훈을 값으로 붙잡아 둔다: **보정은 화면에 보여야 의미가 있다.**
import test from 'node:test';
import assert from 'node:assert/strict';

import { WORLD_OBJ_VIS_DROP, ENEMY_VIS_DROP } from '../js/chase3d-config.js';

test('G38-VIS-DROP-VALUE: 보정량이 폭주 방지 범위 안이고, 멀리서는 원근으로 줄어든다', () => {
  //  기함 깊이(≈14)·초점 fpx 에서 화면 px 로 환산: drop_px = DROP · fpx / depth
  const FPX = 800 / 2 / Math.tan((52 * Math.PI) / 360);   // chase fov 52, 논리 높이 800
  const atDepth = (d) => (WORLD_OBJ_VIS_DROP * FPX) / d;

  assert.ok(WORLD_OBJ_VIS_DROP > 0, '아래로 내리는 값이어야 한다');

  //  ⚠️여기서 잠그는 것은 "정확히 몇 px" 이 아니라 **폭주 방지 범위**다.
  //   0.26 이 시각 중심 정렬선이고, 그 아래(0.52·0.78)는 이사님의 연출 선택이다 —
  //   취향 구간을 테스트가 막으면 안 되지만, 사고로 10배가 들어가는 것은 막아야 한다.
  const near = atDepth(14);
  assert.ok(near >= 12, `기함 깊이 보정량 ${near.toFixed(1)}px — 12px 미만이면 "떠 보인다" 가 재발한다`);
  assert.ok(near <= 60, `기함 깊이 보정량 ${near.toFixed(1)}px — 60px 초과면 오브젝트가 기함 아래로 가라앉는다`);

  //  멀리(깊이 40)에서는 원근으로 작아져야 한다 — 화면 고정 px 였다면 여기서도 같은 양이라 원근이 깨진다.
  const far = atDepth(40);
  assert.ok(far < near / 2,
    `먼 거리 보정량 ${far.toFixed(1)}px 이 가까운 거리 ${near.toFixed(1)}px 의 절반 미만이어야 한다(원근)`);
});

test('G38-VIS-DROP-ALIAS: 옛 이름은 같은 값을 가리킨다', () => {
  //  이름이 `ENEMY_VIS_DROP` 이었을 때 적 전용이었다. 픽업까지 확대되며 이름을 바꿨고,
  //  별칭을 남겼다 — 두 값이 갈라지면 "적만 내려가고 픽업은 그대로" 가 조용히 생긴다.
  assert.equal(ENEMY_VIS_DROP, WORLD_OBJ_VIS_DROP, '별칭이 갈라졌다');
});

test('G38-VIS-DROP-SCOPE: 적·운석·잔해·픽업에 **같은 값**이 가고 발사체에는 안 간다', async () => {
  //  이사님 요구가 "다 동일하게" 다 — 한쪽만 적용되면 요구가 깨진다.
  //  ⚠️발사체는 제외가 **맞다**: 아군탄은 기함 포구에서 나가고 적탄은 기함에 맞는다.
  //   내리면 포구 정합(muzzleGapPx 0)과 명중 위치가 어긋난다.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/chase3d-renderer.js', import.meta.url), 'utf8');

  //  placeSwarm 호출 중 보정을 받는 것 = 적 스웜(eswarm) + 픽업(props). 둘 다 있어야 한다.
  const enemyCall = /placeSwarm\(eswarm\[k\][^)]*WORLD_OBJ_VIS_DROP\)/.test(src);
  const propCall = /placeSwarm\(props\[k\][^)]*WORLD_OBJ_VIS_DROP\)/.test(src);
  assert.ok(enemyCall, '적 스웜(운석 h1·잔해 h2 포함)이 보정을 못 받는다');
  assert.ok(propCall, '픽업(크리스탈·보급선·코인·POW)이 보정을 못 받는다 — "다 동일하게" 요구 위반');

  //  발사체는 placeShots 경로다 — 거기에 이 상수가 새어 들어가면 안 된다.
  const shotBlock = src.slice(src.indexOf('function placeShots'), src.indexOf('function placeShots') + 3000);
  assert.ok(!shotBlock.includes('WORLD_OBJ_VIS_DROP'),
    '발사체 배치에 시각 보정이 들어갔다 — 포구 정합·명중 위치가 어긋난다');
});

test('G38-VIS-DROP-COVERS-METEOR: 운석·잔해가 보정 대상(ENEMY3D)에 들어 있다', async () => {
  //  이사님이 이름을 직접 짚었다("운석"). 이들이 픽업이 아니라 **적 테이블**에 있다는 사실이
  //  코드를 안 읽으면 안 보이므로, 여기서 못 박아 둔다.
  const { ENEMY3D } = await import('../js/chase3d-prop-defs.js');
  assert.ok(ENEMY3D.h1, '운석(h1)이 ENEMY3D 에 있어야 적 경로의 보정을 받는다');
  assert.ok(ENEMY3D.h2, '잔해(h2)가 ENEMY3D 에 있어야 한다');
});

test('G38-VIS-DROP-RENDER-ONLY: 보정이 게임 판정에 새어 나가지 않는다', async () => {
  //  ⚠️3D 는 읽기 전용 표현 계층이다. 이 상수가 밸런스·충돌 모듈에서 읽히면 계약 위반이다.
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  for (const f of ['js/balance.js', 'js/collision.js', 'js/entities.js', 'js/main.js']) {
    const src = readFileSync(join(ROOT, f), 'utf8');
    for (const name of ['WORLD_OBJ_VIS_DROP', 'ENEMY_VIS_DROP']) {
      assert.ok(!src.includes(name),
        `${f} 가 렌더 전용 상수 ${name} 을 읽는다 — 3D 보정이 게임 truth 로 새면 안 된다`);
    }
  }
});
