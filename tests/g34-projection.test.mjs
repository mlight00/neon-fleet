// ── §G-34 §3-3 / §4-4 — 전환 카메라와 발사체 깊이 기준의 단일화 ──
//  Codex 5차 A-2[중대]: `placeShots` 가 전환 중에도 `CAMERA.chase.dist` **고정값**을 `shotDepth` 에 넣는다.
//  실제 카메라는 `makeChaseCamera` 가 high ↔ chase 를 보간하므로, 하드 컷(t=0.5) 부근에서
//  "발사체가 놓이는 깊이"와 "카메라가 실제로 있는 깊이"가 벌어진다.
//  → 상한 80 클램프 문제가 아니라 **전환 카메라와 고정 full-chase 기준을 섞는 문제**다.
//
//  이 파일은 제품 함수(`makeChaseCamera`, `shotDepth`)를 직접 실행한다. 테스트 전용 복제 수학이 아니다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { makeChaseCamera, CAMERA, SCALE_Z } from '../js/chase3d-mapping.js';
import { shotDepth, SHOT_DEPTH_MAX } from '../js/chase3d-shot-place.js';
import { PROJECTION } from '../js/chase-camera.js';
import { readFileSync } from 'node:fs';

const LW = 480, LH = 800;

/** 카메라 원점(=기함)의 **시선 방향 깊이**. `applyCam` 이 트럭 이동 환산에 쓰는 바로 그 수식이다. */
export function originViewDepth(cam3d) {
  const [ex, ey, ez] = cam3d.eye;
  const fx = cam3d.target[0] - ex, fy = cam3d.target[1] - ey, fz = cam3d.target[2] - ez;
  const fl = Math.hypot(fx, fy, fz) || 1;
  return (-ex * fx - ey * fy - ez * fz) / fl;
}

test('G34-CAMERA-DEPTH: 발사체 깊이 기준은 고정 dist 가 아니라 현재 프레임 카메라의 원점 시선 깊이여야 한다', () => {
  //  전환 전 구간에서 실제 깊이와 고정값이 얼마나 벌어지는지 수치로 고정한다.
  const rows = [];
  for (const t of [0, 0.49, 0.5, 0.68, 1]) {
    const cam = makeChaseCamera(LW, LH, t);
    rows.push({ t, actual: +originViewDepth(cam).toFixed(3), fixed: CAMERA.chase.dist });
  }
  const at = (t) => rows.find((r) => r.t === t);

  //  ① 고정값과 실제가 **모든 구간에서 다르다**(t=1 조차 다르다 — dist 는 "카메라 z 오프셋"이지 시선 깊이가 아니다).
  for (const r of rows) {
    assert.notEqual(r.actual, r.fixed,
      `t=${r.t} 에서 고정 dist(${r.fixed})와 실제 원점 시선 깊이(${r.actual})가 같을 수 없다`);
  }

  //  ② 하드 컷 시작(t=0.5)에서의 벌어짐이 가장 문제다 — 이 값이 회귀 감시 대상이다.
  const half = at(0.5);
  const gapHalf = Math.abs(half.actual - half.fixed);
  assert.ok(gapHalf > 0.3,
    `t=0.5 실제 ${half.actual} vs 고정 ${half.fixed} — 차이 ${gapHalf.toFixed(3)}unit`);

  //  ③ 실제 깊이는 t 에 대해 **단조 증가**해야 한다(카메라가 점점 뒤로 물러난다).
  //   고정값을 쓰면 이 변화가 발사체에 전혀 반영되지 않는다.
  for (let i = 1; i < rows.length; i++) {
    assert.ok(rows[i].actual >= rows[i - 1].actual - 1e-9,
      `t 증가에 따라 원점 깊이도 증가: ${JSON.stringify(rows)}`);
  }
  assert.ok(at(1).actual - at(0).actual > 0.5, '전환 전후로 실제 깊이가 의미 있게 달라진다');
});

test('G34-CAMERA-DEPTH-CLAMP: 살아있는 탄 범위에서 SHOT_DEPTH_MAX 클램프에 닿지 않는다', () => {
  //  Codex A-1: 클램프 자체는 현재 수치에서 문제되지 않는다. 다만 깊이 기준을 바꾼 뒤에도
  //  그 성질이 유지되는지 **실행으로** 잠가 둔다(일반 Bullet y<-50, HomingMissile y<-30 에서 죽는다).
  const sqy = 670;
  for (const t of [0.5, 1]) {
    const cam = makeChaseCamera(LW, LH, t);
    const camDepth = originViewDepth(cam);
    for (const wy of [sqy, 400, 200, 0, -50]) {     // 발사 직후 ~ 소멸 직전
      const d = shotDepth(sqy, wy, SCALE_Z, camDepth);
      assert.ok(d < SHOT_DEPTH_MAX,
        `t=${t} worldY=${wy} → 깊이 ${d.toFixed(2)} 가 상한 ${SHOT_DEPTH_MAX} 에 닿으면 안 된다`);
      assert.ok(d > 0, '깊이는 양수');
    }
  }
});

test('G34-HORIZON-FINITE: finite top plane 계약 — horizonYFrac 은 음수가 될 수 없다', () => {
  //  Codex B-2[치명]: 음수 horizon 은 2D 화면 상단을 보존하는 게 아니라 **월드 상단을 화면 밖으로 숨긴다.**
  //  world y=0 이 화면 안(또는 상단 경계)에 남아야 2D 에서 보이던 스폰·적·탄이 추적 모드에서도 보인다.
  assert.ok(PROJECTION.horizonYFrac >= 0,
    `horizonYFrac=${PROJECTION.horizonYFrac} — 3D 소실점(음수)에 숫자로 동기화하면 안 된다`);
  assert.ok(PROJECTION.horizonYFrac < PROJECTION.nearYFrac,
    'horizon 은 근거리보다 위에 있어야 depth 보간이 단조롭다');
});

// ─────────────────────────────────────────────────────────────────────────────
// §4-1 단일 투영 계약 — 한 프레임에 투영이 둘이면 조준과 그림이 어긋난다 (Codex D-2)
// ─────────────────────────────────────────────────────────────────────────────
//  ⚠️`G34-AIM-CAMERA-INDEPENDENT` / `G34-AIM-MONOTONE` 은 **삭제**했다(§G-35 P0-2).
//   그 둘은 A안(추적에서 `screenX == worldX` 트랙 절대 매핑)을 잠그던 테스트인데, A안을 철회했다.
//   렌더와 입력은 다시 **같은 affine**(정확한 역함수)을 쓴다 — `G35-INVERSE-EXACT` 가 그것을 검증하고,
//   폐루프 방지는 좌표계 분리가 아니라 **포인터 기반 카메라 목표**가 담당한다(`G35-POINTER-*`).

test('G34-PROJ-SINGLE-SNAPSHOT: 같은 입력이면 몇 번을 만들어도 같은 투영이 나온다(순수성)', async () => {
  const { createChaseProjection } = await import('../js/chase-camera.js');
  //  단일 스냅샷 계약의 전제 — 투영 생성이 순수해야 "한 번 만들어 공유"가 성립한다.
  //  (숨은 전역 상태가 있으면 공유해도 값이 갈라진다.)
  const args = { logicalW: 480, logicalH: 800, zoom: 2.2, chaseBlend: 1, squadX: 137, squadY: 670 };
  const a = createChaseProjection(args), b = createChaseProjection(args);
  for (const k of ['C0', 'slope', 'centerX', 'horizonY', 'nearY', 'chaseAnchorX']) {
    assert.equal(a[k], b[k], `${k} 가 호출마다 달라지면 스냅샷 공유가 무의미하다`);
  }
});

test('G34-PROJ-FRAME-ONCE: main 은 프레임당 한 번만 투영을 확정한다', () => {
  //  ⚠️이 항목만은 배선 확인이라 소스를 본다 — 다만 "문자열이 있다"가 아니라
  //   **생성 호출 수**를 세어 계약(1곳)을 지킨다. 동작 자체는 위 왕복 테스트가 검증한다.
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const calls = (main.match(/createChaseProjection\(/g) || []).length;
  assert.ok(calls <= 2,
    `main 의 createChaseProjection 호출은 갱신 1곳 + 부트스트랩 폴백뿐이어야 한다 — 실측 ${calls}곳`);
  //  draw 는 만들지 말고 확정된 스냅샷을 받아 써야 한다.
  assert.match(main, /chaseProj = chaseProjection;/, 'draw 는 스냅샷을 공유한다');
  //  갱신은 월드 갱신이 끝난 뒤여야 draw 와 같은 기준이 된다.
  const upd = main.slice(main.indexOf('function update(dt)'), main.indexOf('function draw('));
  assert.ok(upd.lastIndexOf('rebuildChaseProjection();') > upd.indexOf('input.tick(dt);'),
    '투영 확정은 input.tick 뒤(=월드 갱신 후)에 온다');
});

// ─────────────────────────────────────────────────────────────────────────────
// §4-3 차지빔 유한 끝점 — 빔은 world y=0 에서 끝난다 (Codex G-2)
// ─────────────────────────────────────────────────────────────────────────────
test('G34-LANCE-FINITE: 빔 길이는 발사체 깊이 규칙에서 그대로 나온다(sqy·SCALE_Z)', () => {
  //  제품이 쓰는 길이식 `sqy * SCALE_Z` 가 **발사체 규칙과 같은 값**인지 실행으로 확인한다.
  //  (수식을 옮겨 적은 게 아니라 shotDepth 를 두 번 호출해 차이를 잰다 — 규칙이 바뀌면 같이 깨진다.)
  for (const t of [0.5, 0.68, 1]) {
    const cam = makeChaseCamera(LW, LH, t);
    const camDepth = originViewDepth(cam);
    for (const sqy of [560, 670, 720]) {
      const atMuzzle = shotDepth(sqy, sqy, SCALE_Z, camDepth);   // 기함 평면
      const atTop = shotDepth(sqy, 0, SCALE_Z, camDepth);        // world y=0 (유한 상단면)
      const lanceLen = sqy * SCALE_Z;                            // 제품 발사 블록의 길이식
      assert.ok(Math.abs((atTop - atMuzzle) - lanceLen) < 1e-9,
        `t=${t} sqy=${sqy}: 빔 길이 ${lanceLen} 이 깊이차 ${(atTop - atMuzzle).toFixed(4)} 와 같아야 한다`);
      //  끝점이 카메라 far 안쪽이어야 잘리지 않는다.
      assert.ok(atTop < CAMERA.far, `끝 깊이 ${atTop.toFixed(2)} < far ${CAMERA.far}`);
      //  ⚠️예전 고정값 1400 은 이 끝점보다 한참 멀었다 — 그래서 빔이 소실점에 붙어버렸고,
      //   화면 밖 구간을 2D 잔광으로 메워야 했다(그 잔광이 G-2 의 104.4px 어긋남).
      assert.ok(1400 > lanceLen * 10,
        `옛 상수 1400 이 실제 필요 길이 ${lanceLen.toFixed(1)} 의 10배를 넘었다는 사실을 기록`);
    }
  }
});

test('G34-LANCE-NO-AFTERGLOW: 유한 끝점이면 화면 밖을 메울 구간이 없다', () => {
  //  잔광이 필요했던 근거는 "world y=0 이 소실점 너머(화면 밖)"라는 전제였다.
  //  finite top plane 계약에서 그 전제가 거짓임을 값으로 고정한다 — 전제가 거짓이면 잔광도 불필요하다.
  assert.ok(PROJECTION.horizonYFrac >= 0,
    `world y=0 이 화면 안(또는 상단 경계)에 있어야 빔이 닿을 수 있다 — horizonYFrac=${PROJECTION.horizonYFrac}`);
  //  그리고 빔 끝 깊이는 유한하다(무한히 뻗지 않는다) — 위 테스트의 길이가 sqy 에 비례해 유한.
  const cam = makeChaseCamera(LW, LH, 1);
  const end = shotDepth(670, 0, SCALE_Z, originViewDepth(cam));
  assert.ok(Number.isFinite(end) && end > 0, `끝 깊이가 유한한 양수 — 실측 ${end}`);
});
