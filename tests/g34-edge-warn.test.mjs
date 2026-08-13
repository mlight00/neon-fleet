// ── §G-34 §6 (P0-3) — 가장자리 경고 확대 + 가장자리 스크롤 정책 ──
//  데드존 카메라(§5)가 들어오면서 화면 밖에 남는 영역이 늘었다. 그래서 두 가지를 정한다:
//   ① 화면 밖에서 **나를 쏘는** 적(원거리 6종)도 경고에 넣는다 — 부딪히지 않아도 위험하다.
//   ② 기함이 트랙 끝에 닿았을 때 카메라를 어떻게 할지 **명시적으로** 정한다.
//  ⚠️제품 함수를 실행해 검증한다(수식·목록 복제 금지).
import test from 'node:test';
import assert from 'node:assert/strict';

import { collectEdgeWarnings } from '../js/chase-render.js';
import {
  createChaseProjection, screenToWorldXAtPlayer, visibleHalfWorld, PROJECTION,
  createChaseCameraState, updateChaseCameraX,
} from '../js/chase-camera.js';
import {
  Sniper, Turret, Weaver, Zapper, Shielder, BroodCarrier, Creature, Meteor,
} from '../js/entities.js';

const LW = 480, LH = 800, SQY = 670;
const VIEW = { w: LW, h: LH };

/** 화면 밖(월드 x 가 카메라 시야 밖)에 개체를 놓고 경고를 모은다. */
function warnsFor(entities, { squadX = 240, cameraWorldX = 240, zoom = 2.2 } = {}) {
  const proj = createChaseProjection({
    logicalW: LW, logicalH: LH, zoom, chaseBlend: 1, squadX, squadY: SQY, cameraWorldX,
  });
  const r = {
    squad: { x: squadX, y: SQY },
    bosses: [],
    world: { entities, bullets: [], enemyBullets: [] },
  };
  return collectEdgeWarnings(r, proj, VIEW);
}

test('G34-EDGE-SHOOTER: 화면 밖 원거리 공격형 6종이 모두 경고에 잡힌다', () => {
  //  §G-34 §6 이전에는 충돌형(Creature·Meteor 등)만 경고 대상이었다.
  //  이 6종은 화면 밖에서도 사격하므로 "저기 있다"를 알려야 한다.
  //  ⚠️생성자 시그니처는 클래스마다 다르다(`Weaver(fromLeft, logicalW)` 처럼).
  //   테스트가 거기 묶이면 생성자를 손볼 때마다 깨진다 → 만든 뒤 **위치만 직접** 지정한다.
  const makers = [
    ['Sniper', () => new Sniper(0)],
    ['Turret', () => new Turret(0, 0)],
    ['Weaver', () => new Weaver(true, LW)],
    ['Zapper', () => new Zapper(0)],
    ['Shielder', () => new Shielder(0)],
    ['BroodCarrier', () => new BroodCarrier(0)],
  ];
  for (const [name, make] of makers) {
    let e;
    try { e = make(); } catch (err) { assert.fail(`${name} 생성 실패: ${err.message}`); }
    //  §G-35 P0-1 이후: 가로 시야가 384(트랙 80%)로 넓어졌다. **먼 거리(y 작음)** 개체는
    //   소실점으로 수렴해 화면 안으로 들어오므로, "화면 밖"을 만들려면 근거리에 둬야 한다.
    //   (예전에는 가로에 zoom 이 곱해져 먼 개체도 화면 밖으로 나갔다 — 우연한 통과였다.)
    e.x = -260; e.y = SQY - 40; e.dead = false;      // 카메라 왼쪽 바깥(근거리 평면)
    const w = warnsFor([e]);
    assert.equal(w.length, 1, `${name}: 화면 밖이면 경고 1건이어야 한다 — 실측 ${w.length}`);
    assert.equal(w[0].danger, 'shooter', `${name}: 원거리 공격형은 'shooter' 로 표시된다 — 실측 ${w[0].danger}`);
    assert.equal(w[0].side, 'left', `${name}: 왼쪽 밖이므로 왼쪽 가장자리 — 실측 ${w[0].side}`);
  }
});

test('G34-EDGE-KINDS: 위협 종류가 뜻대로 갈린다(충돌 ≠ 사격)', () => {
  //  둘을 같은 표시로 묶으면 "부딪히니 피해라"와 "쏘니 조심해라"가 구별되지 않는다.
  //  ⚠️`Sniper` 생성자는 y 를 무시하고 내부에서 정한다(클래스마다 시그니처가 다르다) → 직접 지정.
  const cre = new Creature(-260, SQY - 40, 'small');
  const sni = new Sniper(-260); sni.x = -260; sni.y = SQY - 60; sni.dead = false;
  const w = warnsFor([cre, sni]);
  const kinds = w.map((x) => x.danger).sort();
  assert.deepEqual(kinds, ['collision', 'shooter'], `충돌형과 사격형이 각각 표시된다 — 실측 ${JSON.stringify(kinds)}`);
  //  사격형이 충돌형보다 먼저 온다(점수 대역: shooter 30000 > collision 20000).
  assert.equal(w[0].danger, 'shooter', '사거리가 화면보다 길어 존재 인지가 먼저다');
});

test('G34-EDGE-ONSCREEN: 화면 안에 있으면 경고하지 않는다', () => {
  //  경고가 남발되면 아무도 안 본다. 보이는 것에는 표식을 달지 않는다.
  const w = warnsFor([new Sniper(240, 300)]);      // 카메라 정면
  assert.equal(w.length, 0, `화면 안 개체는 경고 0 — 실측 ${w.length}`);
});

test('G34-EDGE-CAMERA-AWARE: 카메라가 움직이면 경고 대상도 따라 바뀐다', () => {
  //  데드존 카메라가 왼쪽을 비추면, 오른쪽에 있던 적이 새로 화면 밖이 된다.
  const e = new Turret(430, SQY - 40);
  assert.equal(warnsFor([e], { cameraWorldX: 380 }).length, 0, '카메라가 오른쪽을 보면 화면 안');
  const far = warnsFor([e], { cameraWorldX: 140 });
  assert.equal(far.length, 1, '카메라가 왼쪽으로 가면 화면 밖 → 경고');
  assert.equal(far[0].side, 'right', '오른쪽 가장자리에 표시');
});

test('G34-EDGE-POLICY: 카메라는 트랙 밖을 비추지 않는다(정책 B)', () => {
  //  §G-34 §6 결정: 기함이 트랙 끝에 닿아도 카메라는 한계에서 멈춘다.
  //   → 화면에 보이는 것은 **항상 유효한 월드**다(트랙 밖 빈 공간이 비치지 않는다).
  //   대안(카메라가 기함을 계속 따라감)이면 화면 절반이 정보 0인 여백이 된다.
  for (const zoom of [1.6, 2.0, 2.2]) {
    const visHalf = visibleHalfWorld(LW, zoom, PROJECTION);
    const st = createChaseCameraState(LW / 2);
    const opt = { deadHalf: 0, hysteresis: 0, cameraMin: visHalf, cameraMax: LW - visHalf };
    //  기함을 트랙 왼쪽 끝 밖까지 밀어붙인다.
    for (let i = 0; i < 400; i++) updateChaseCameraX(st, -50, 1 / 60, opt);
    const proj = createChaseProjection({
      logicalW: LW, logicalH: LH, zoom, chaseBlend: 1, squadX: 0, squadY: SQY, cameraWorldX: st.x,
    });
    //  화면 왼쪽 끝이 가리키는 월드 x 가 0 이상 = 트랙 밖이 안 보인다.
    const worldAtLeft = screenToWorldXAtPlayer(0, proj);
    assert.ok(worldAtLeft >= -0.01,
      `zoom=${zoom}: 화면 왼쪽 끝이 월드 ${worldAtLeft.toFixed(2)} — 음수면 트랙 밖 여백이 보인다`);
    //  오른쪽도 같은 방식으로.
    for (let i = 0; i < 400; i++) updateChaseCameraX(st, LW + 50, 1 / 60, opt);
    const proj2 = createChaseProjection({
      logicalW: LW, logicalH: LH, zoom, chaseBlend: 1, squadX: LW, squadY: SQY, cameraWorldX: st.x,
    });
    const worldAtRight = screenToWorldXAtPlayer(LW, proj2);
    assert.ok(worldAtRight <= LW + 0.01,
      `zoom=${zoom}: 화면 오른쪽 끝이 월드 ${worldAtRight.toFixed(2)} — 트랙(${LW})을 넘으면 여백이 보인다`);
  }
});

test('G34-EDGE-POLICY-SHIP: 정책 B 에서 기함은 화면 중앙을 벗어난 채 보인다(위치 정보)', () => {
  //  이것이 정책 B 의 대가이자 이점이다 — "지금 끝에 붙어 있다"가 화면에 그대로 드러난다.
  const zoom = 2.2;
  const visHalf = visibleHalfWorld(LW, zoom, PROJECTION);
  const st = createChaseCameraState(LW / 2);
  for (let i = 0; i < 400; i++) {
    updateChaseCameraX(st, 30, 1 / 60, { deadHalf: 0, cameraMin: visHalf, cameraMax: LW - visHalf });
  }
  const proj = createChaseProjection({
    logicalW: LW, logicalH: LH, zoom, chaseBlend: 1, squadX: 30, squadY: SQY, cameraWorldX: st.x,
  });
  //  기함 화면 x — 중앙보다 확실히 왼쪽이되, 화면 안에는 남아야 한다.
  const shipX = proj.C0;    // 기함(worldX=squadX)의 화면 x = C0
  assert.ok(shipX < LW / 2 - 20, `기함이 화면 중앙보다 왼쪽에 보인다 — 실측 ${shipX.toFixed(1)}`);
  assert.ok(shipX > 0, `그래도 화면 안에 남는다 — 실측 ${shipX.toFixed(1)}`);
});
