// ── §G-22 Codex 재검수 반영 — 실행 기반 회귀 테스트 ──
//  §11.2 지시대로 G21 의 자명한(동어반복) 테스트를 교체했다.
//   · G21-PLACE(unproject→project 항등) → **2.5D 투영(chase-camera)과 3D 카메라가 같은 화면점을 가리키는가**로 교체.
//     두 모듈은 완전히 다른 수학(2.5D 수동 투영 vs THREE 원근 카메라)이라 이 일치는 자명하지 않다.
//   · G21-SPEC(사양 반환값만 확인) → **실제 `Bullet.draw()` 를 기록 캔버스로 실행**해 그려진 상자·색·코어 유무를
//     측정하고, 그 값이 중립 사양·3D 어댑터와 일치하는지 대조.
//   · G21-CINE(테스트 전용 호출) → production main 이 실제로 쓰는 `flagshipLayer`·`chase3dFrameGate` 를 그대로 호출.
//  WebGL 이 필요한 항목(instance matrix·readiness·GLB 지연/404·context loss)은 브라우저 실측으로 검증한다(보고서 §5).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../js/vendor/three.module.js';

import {
  chase3dEnabled, chase3dTestEnabled, chase3dLabTarget,
  shouldInit3D, INIT_ZOOM, CHASE3D, createFpsGuard,
  performanceProfileForViewport, QUALITY, chase3dFrameGate, flagshipLayer,
} from '../js/chase3d-config.js';
import { shotSpec, makeShotSpec, SHOT_COLOR, WIDTH_MUL_MAX } from '../js/chase3d-shot-spec.js';
import { shotDepth, shotYaw, focalPx, shotScale, screenLenPx, placeOnRay, toNdcX, toNdcY, SHOT_DEPTH_MAX } from '../js/chase3d-shot-place.js';
import { SHOT_LEN, SHOT_W, SHOT_MIN_PX } from '../js/chase3d-prop-defs.js';
import { makeChaseCamera, CAMERA, SCALE_Z } from '../js/chase3d-mapping.js';
import { createChaseProjection, projectObject } from '../js/chase-camera.js';
import { drawHUD, bossHudView, NO_BOSSES, COLORS } from '../js/render.js';
import { Bullet } from '../js/entities.js';
import { PROJ_COLOR, TRACER_BOX, laserBoltLength, laserScreenWidth, squadLaserBeamW, vulcanArtScale, VULCAN_CORE, vulcanCoreWidth } from '../js/projectile-visual-spec.js';

const LOGICAL_W = 480, LOGICAL_H = 776;

// ─────────────────────────────────────────────────────────────────────────────
// §3.1 URL 판정 (유지)
// ─────────────────────────────────────────────────────────────────────────────
test('G22-URL: chase3d 판정 우선순위 — 0 최우선 / 1 명시 ON / 측정·개발 하네스는 기본 OFF', () => {
  const rows = [
    ['', true], ['?utm_source=x', true], ['?chase3d=1', true], ['?chase3d=0', false],
    ['?playtest=prolific', false], ['?coreLoopMeasure=1', false], ['?campaign25=1', false],
    ['?fleetlab=1', false], ['?bosslab=1&boss=B14', false], ['?fleetlab', false],
    ['?playtest=prolific&chase3d=1', true], ['?bosslab=1&boss=B14&chase3d=1', true],
    ['?chase3d=0&chase3dTest=1', false], ['?fleetlab=1&chase3d=0', false],
    ['?coreLoopTest=1', true],   // 사람 플레이 하네스는 측정용이 아니다
  ];
  for (const [search, want] of rows) assert.equal(chase3dEnabled(search), want, search || '(빈 쿼리)');
  assert.equal(chase3dLabTarget('?chase3dLab=hazards'), '');
  assert.equal(chase3dLabTarget('?chase3d=1&chase3dLab=hazards'), 'hazards');
  assert.equal(chase3dTestEnabled('?chase3dTest=1'), false);
});

// ─────────────────────────────────────────────────────────────────────────────
// §4.1 초기화 트리거 — 150% 선로딩 제거
// ─────────────────────────────────────────────────────────────────────────────
test('G22-INIT: 3D 초기화는 200% 요청에서만 — 150% 는 자원을 읽지 않는다', () => {
  assert.equal(INIT_ZOOM, CHASE3D.FULL_ZOOM);
  assert.equal(shouldInit3D(1.00), false, '100% 미로드');
  assert.equal(shouldInit3D(1.50), false, '150% 미로드 — G21 회귀 지점');
  assert.equal(shouldInit3D(1.99), false);
  assert.equal(shouldInit3D(2.00), true, '200% 요청에서 초기화');
  assert.equal(shouldInit3D(2.20), true);
  //  초기화 경계는 3D 가 실제로 보이기 시작하는 배율보다 위 — 보간 구간이 곧 로딩 여유다.
  assert.ok(INIT_ZOOM > CHASE3D.START_ZOOM);
});

// ─────────────────────────────────────────────────────────────────────────────
// §5.1 성능 프로필 통합
// ─────────────────────────────────────────────────────────────────────────────
test('G22-PROFILE: renderer(픽셀비율·LOD)와 FPS 가드가 같은 프로필을 쓴다(820px 단일 기준)', () => {
  const rows = [
    [390, 844, true, QUALITY.SAFE_MIN_FPS_MOBILE],
    [500, 900, true, QUALITY.SAFE_MIN_FPS_MOBILE],
    [600, 900, true, QUALITY.SAFE_MIN_FPS_MOBILE],
    [800, 450, true, QUALITY.SAFE_MIN_FPS_MOBILE],
    [820, 600, true, QUALITY.SAFE_MIN_FPS_MOBILE],
    [821, 600, false, QUALITY.SAFE_MIN_FPS_DESKTOP],
    [1280, 800, false, QUALITY.SAFE_MIN_FPS_DESKTOP],
  ];
  for (const [w, h, mobile, minFps] of rows) {
    const p = performanceProfileForViewport(w, h);
    assert.equal(p.mobile, mobile, `${w}×${h} mobile`);
    assert.equal(p.minFps, minFps, `${w}×${h} minFps`);
    assert.equal(p.pixelRatioCap, mobile ? QUALITY.PIXEL_RATIO_MOBILE : QUALITY.PIXEL_RATIO_DESKTOP);
    assert.equal(p.lod, mobile ? 1 : 0);
    //  같은 뷰포트를 두 번 물어도 같은 값 — renderer 와 가드가 각자 계산해도 갈라지지 않는다.
    const q = performanceProfileForViewport(w, h);
    assert.deepEqual({ ...p, viewport: null }, { ...q, viewport: null });
  }
  //  G21 의 "세로 && ≤500px" 기준이 남아 있지 않은지 — 600×900 은 그 기준으로는 데스크톱이었다.
  assert.equal(performanceProfileForViewport(600, 900).mobile, true);
});

// ─────────────────────────────────────────────────────────────────────────────
// §5.3 visible 극저FPS를 버리지 않는다
// ─────────────────────────────────────────────────────────────────────────────
const runGuard = (g, dtMs, frames, sampling = true, interrupted = false) => {
  let trippedAt = -1;
  for (let i = 0; i < frames; i++) {
    const t = g.sample(dtMs, sampling, i === 0 ? interrupted : false);
    if (t && trippedAt < 0) trippedAt = i;
  }
  return trippedAt;
};

test('G22-FPS1: 60fps 20초는 절대 트립되지 않는다', () => {
  const g = createFpsGuard({ minFps: QUALITY.SAFE_MIN_FPS_DESKTOP });
  assert.equal(runGuard(g, 1000 / 60, 1200), -1);
  assert.equal(g.tripped, false);
});

test('G22-FPS2: 35fps — 모바일(하한 30)은 미트립, 데스크톱(하한 45)은 트립', () => {
  const mob = createFpsGuard({ minFps: QUALITY.SAFE_MIN_FPS_MOBILE });
  assert.equal(runGuard(mob, 1000 / 35, 900), -1, '모바일 35fps 는 정상 범위');
  assert.equal(mob.tripped, false);
  const desk = createFpsGuard({ minFps: QUALITY.SAFE_MIN_FPS_DESKTOP });
  assert.ok(runGuard(desk, 1000 / 35, 900) > 0, '데스크톱 35fps 는 하한 미달');
  assert.equal(desk.tripped, true);
});

test('G22-FPS3: **visible 1fps·2fps 는 반드시 트립된다**(G21 은 dt>500ms 를 버려 영영 못 잡았다)', () => {
  for (const fps of [1, 2]) {
    const g = createFpsGuard({ minFps: QUALITY.SAFE_MIN_FPS_DESKTOP });
    const at = runGuard(g, 1000 / fps, 40);
    assert.ok(at > 0, `${fps}fps 트립됨(프레임 ${at})`);
    assert.equal(g.tripped, true);
    //  단일 긴 프레임이 창을 즉시 닫으므로 strike 는 창마다 1회 — 연속 2창을 채워야 트립한다.
    assert.ok((at + 1) * (1000 / fps) >= 2000 + 3000, '최소 warm-up + 창 2개 시간이 지난 뒤 트립');
  }
});

test('G22-FPS4: hidden 4초 후 복귀는 트립하지 않는다(중단은 dt 가 아니라 interrupted 로 안다)', () => {
  const g = createFpsGuard({ minFps: QUALITY.SAFE_MIN_FPS_DESKTOP });
  for (let i = 0; i < 200; i++) g.sample(1000 / 60, true, false);   // warm-up 통과
  assert.equal(g.tripped, false);
  //  탭 복귀: 첫 프레임 dt 4초 + interrupted=true → 창을 버린다
  assert.equal(g.sample(4000, true, true), false);
  for (let i = 0; i < 400; i++) g.sample(1000 / 60, true, false);
  assert.equal(g.tripped, false, '복귀 후 정상 프레임이면 트립 없음');
  assert.equal(g.strikes, 0);
});

test('G22-FPS5: 드래프트·스테이지 요약(=sampling false) 20초 동안 warm-up 이 진행되지 않는다', () => {
  const g = createFpsGuard({ minFps: QUALITY.SAFE_MIN_FPS_DESKTOP });
  for (let i = 0; i < 1200; i++) g.sample(1000 / 60, false, false);
  assert.equal(g.warmedUp, false);
  assert.equal(g.tripped, false);
});

// ─────────────────────────────────────────────────────────────────────────────
// §11.2 발사체: **실제 Bullet.draw()** 를 기록 캔버스로 실행해 2D 그림을 측정한다
// ─────────────────────────────────────────────────────────────────────────────
/** 최소 2D 컨텍스트 스텁 — fillRect 를 현재 변환·색과 함께 기록한다(회전은 축정렬 사각에만 적용). */
function recordCtx() {
  const rects = [];
  let m = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack = [];
  const api = {
    rects,
    fillStyle: '#000000', strokeStyle: '#000', lineWidth: 1, globalAlpha: 1, globalCompositeOperation: 'source-over', font: '',
    save() { stack.push({ ...m, fillStyle: api.fillStyle }); },
    restore() { const s = stack.pop(); if (s) { m = { a: s.a, b: s.b, c: s.c, d: s.d, e: s.e, f: s.f }; api.fillStyle = s.fillStyle; } },
    translate(x, y) { m.e += m.a * x + m.c * y; m.f += m.b * x + m.d * y; },
    rotate(r) {
      const cs = Math.cos(r), sn = Math.sin(r);
      const a = m.a * cs + m.c * sn, b = m.b * cs + m.d * sn;
      const c = m.a * -sn + m.c * cs, d = m.b * -sn + m.d * cs;
      m.a = a; m.b = b; m.c = c; m.d = d;
    },
    scale(x, y) { m.a *= x; m.b *= x; m.c *= y; m.d *= y; },
    fillRect(x, y, w, h) {
      const px = m.a * x + m.c * y + m.e, py = m.b * x + m.d * y + m.f;
      const w2 = Math.hypot(m.a * w, m.b * w), h2 = Math.hypot(m.c * h, m.d * h);
      rects.push({ x: px, y: py, w: w2, h: h2, color: String(api.fillStyle).toLowerCase() });
    },
    beginPath() {}, closePath() {}, moveTo() {}, lineTo() {}, arc() {}, fill() {}, stroke() {}, fillText() {},
    createLinearGradient() { return { addColorStop() {} }; },
  };
  return api;
}
const WHITE = new Set(['#ffffff', PROJ_COLOR.vulcanCore.toLowerCase()]);

test('G22-2D1: 드론 예광탄 2D 실측 — 2×8 청록 상자, **백열 코어 없음**', () => {
  const c = recordCtx();
  const b = new Bullet(100, 200, 1, { kind: 'tracer' });
  b.prevY = 200;
  b.draw(c);
  assert.equal(c.rects.length, 1, '상자 하나만 그린다');
  const r = c.rects[0];
  assert.equal(r.w, TRACER_BOX.w); assert.equal(r.h, TRACER_BOX.h);
  assert.equal(r.color, PROJ_COLOR.tracer.toLowerCase());
  assert.ok(!c.rects.some((x) => WHITE.has(x.color)), '2D 예광탄에는 흰 코어가 없다 — 3D 도 없어야 한다(§G-22 §6)');
  //  3D 어댑터도 같은 결론이어야 한다.
  const sp = shotSpec('pbullet', b, makeShotSpec());
  assert.equal(sp.core, 0);
  assert.equal(sp.coreColor, -1);
  assert.equal(sp.color, SHOT_COLOR.tracer);
});

test('G22-2D2: 기함 발칸 2D 실측 — 진화색 외곽 + 백열 코어(3D 는 core=1)', () => {
  const c = recordCtx();
  const b = new Bullet(100, 200, 1, { kind: 'vulcan', lv: 1, color: '#ff9a3c' });
  b.prevY = 200;
  b.draw(c);
  const outer = c.rects.filter((r) => r.color === '#ff9a3c');
  const core = c.rects.filter((r) => WHITE.has(r.color));
  assert.ok(outer.length >= 1, '진화색 외곽이 그려진다');
  assert.ok(core.length >= 1, '백열 코어가 그려진다');
  const sp = shotSpec('pbullet', b, makeShotSpec());
  assert.equal(sp.core, 1);
  assert.equal(sp.coreColor, SHOT_COLOR.vulcanCore);
  assert.equal(sp.color, 0xff9a3c, '3D 외곽 = 2D 진화색');
});

test('G22-2D3: 레이저 2D 실측 — 폭 = beamW×2, 길이 = 34+lv×8, 흰 심 존재', () => {
  for (const lv of [1, 2, 3]) {
    const beamW = squadLaserBeamW(lv);
    const c = recordCtx();
    const b = new Bullet(100, 300, 1, { kind: 'laser', lv, beamW, color: '#a8f0ff' });
    b.prevY = 300;
    b.draw(c);
    const body = c.rects.find((r) => r.color === '#a8f0ff');
    const core = c.rects.find((r) => WHITE.has(r.color));
    assert.ok(body, `lv${lv} 빔 본체`);
    assert.equal(body.w, laserScreenWidth(beamW), `lv${lv} 폭 = beamW×2`);
    assert.equal(body.h, laserBoltLength(lv), `lv${lv} 길이 = 34+lv×8`);
    assert.ok(core, `lv${lv} 백열 심`);
  }
  //  기본색(진화색 없음)이 2D·3D 에서 같은가 — G21 은 3D 만 0x8fe8ff 로 어긋나 있었다.
  const c2 = recordCtx();
  const b2 = new Bullet(50, 50, 1, { kind: 'laser', lv: 1, beamW: 4.5 });
  b2.prevY = 50; b2.draw(c2);
  assert.ok(c2.rects.some((r) => r.color === PROJ_COLOR.laser.toLowerCase()), '2D 기본 레이저색');
  assert.equal(shotSpec('laser', b2, makeShotSpec()).color, SHOT_COLOR.laser);
  assert.equal(SHOT_COLOR.laser, parseInt(PROJ_COLOR.laser.replace('#', ''), 16), '3D 기본색 = 2D 기본색');
});

test('G22-2D4: 중립 모듈이 2D·3D 의 단일 진실 — 예광탄 색은 COLORS.ally 와 같다', () => {
  assert.equal(PROJ_COLOR.tracer, COLORS.ally);
  assert.equal(SHOT_COLOR.tracer, parseInt(COLORS.ally.replace('#', ''), 16));
  //  발칸 크기 사양도 같은 함수에서 나온다
  assert.ok(Math.abs(vulcanArtScale(1) - 0.45) < 1e-9);
  assert.ok(vulcanArtScale(3) > vulcanArtScale(1));
  assert.equal(VULCAN_CORE.wMax, 2.8);   // 옛 고정폭이 이제 상한
});

//  §G-34 §10-2: `G27-EBULLET`(소스 문자열 대조)은 **삭제**하고 실행 기반으로 옮겼다.
//   → tests/g34-render-exec.test.mjs 의 `G34-EBULLET-EXEC*` — 기록 ctx 로 실제 draw 를 돌린다.
//   교체하면서 문자열 대조가 못 보던 결함이 하나 나왔다: ember 탄(보스 탄막)에 shadowBlur 가 남아 있었다.


test('G25-LANCE: 차지 빔은 발사체와 같은 사거리 — 화면 상단까지 간다(소실점에 갇히지 않는다)', () => {
  //  이사 지적: "함미모드일 때 차지샷이 다른 발사체의 2/3 지점까지밖에 안 나간다."
  //  원인은 길이가 아니라 **방향**이었다 — 빔을 기함 로컬 +z 로만 뻗으면 원근상 소실점으로 수렴한다.
  //  발사체는 화면 좌표를 재현하므로 화면 상단(y=0)에 닿는데, 그 3D 지점은 y 가 위로 올라간 곳이다.
  const LW = 480, LH = 800;
  const c3 = makeChaseCamera(LW, LH, 1);
  const cam = new THREE.PerspectiveCamera(c3.fov, c3.aspect, CAMERA.near, CAMERA.far);
  cam.up.set(0, 1, 0);
  cam.position.set(c3.eye[0], c3.eye[1], c3.eye[2]);
  cam.lookAt(c3.target[0], c3.target[1], c3.target[2]);
  cam.updateMatrixWorld(true); cam.updateProjectionMatrix();
  const screenY = (v) => (1 - v.clone().project(cam).y) / 2 * LH;   // 논리 화면 y(0=상단)

  const NOSE_Z = 2.6;
  const nose = new THREE.Vector3(0, 0.35, NOSE_Z);
  const noseY = screenY(nose);

  //  ① 옛 방식(+z 로만 뻗음)은 길이를 4배 가까이 늘려도 소실점을 못 넘는다.
  const oldEnd110 = screenY(new THREE.Vector3(0, 0.35, NOSE_Z + 110));
  const oldEnd400 = screenY(new THREE.Vector3(0, 0.35, NOSE_Z + 400));
  const vanish = screenY(new THREE.Vector3(0, 0.35, 1e6));
  assert.ok(oldEnd400 > vanish - 1, '길이를 늘려도 소실점 위로는 못 간다');
  assert.ok(oldEnd110 - oldEnd400 < 40, '110 → 400 으로 늘려도 화면상 40px 미만만 이동');
  assert.ok(vanish > LH * 0.15, '소실점 자체가 화면 상단이 아니다(=구조적 한계)');

  //  ② 새 방식: 발사체가 화면 상단에 놓이는 그 지점을 향한다.
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  const end = new THREE.Vector3(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3();
  const ndcX = nose.clone().project(cam).x;
  placeOnRay(cam, fwd, ndcX, 1, SHOT_DEPTH_MAX, end, v1, v2);
  assert.ok(Math.abs(screenY(end)) < 1, '빔 끝이 화면 최상단에 닿는다');
  assert.ok(end.y > nose.y + 5, '도달점은 기수보다 확실히 위 — 순수 +z 로는 갈 수 없는 자리');

  //  ③ 사거리 회귀 가드: 옛 방식은 발사체 대비 70% 미만이었고, 새 방식은 100% 다.
  const reachOld = (noseY - oldEnd110) / noseY;
  const reachNew = (noseY - screenY(end)) / noseY;
  assert.ok(reachOld < 0.7, `옛 방식 사거리 ${(reachOld * 100).toFixed(0)}% — 이사가 본 "2/3"`);
  assert.ok(reachNew > 0.99, `새 방식 사거리 ${(reachNew * 100).toFixed(0)}%`);

  //  ④ 배선 계약은 **소스 문자열이 아니라 실행**으로 본다(§G-28 §5).
  //   빔이 씬 직속인지·포구를 따라가는지·숨김 후 잔상이 없는지는 WebGL 이 필요하므로
  //   브라우저 실측(hero controller 를 실제로 만들고 frame() 을 돌린다)에서 검증한다 — 보고서 §6.
  //   여기서는 순수 수학만 고정한다. 깊이 상수 공유만 값으로 확인.
  assert.equal(SHOT_DEPTH_MAX, 80, '빔 도달 깊이 = 발사체 최대 깊이(상수 공유)');
});

test('G24-TIP3D: 3D 발칸탄도 2D 와 같은 진화색 — 탄저 발광만 물들이고 금속 본체는 원색', async () => {
  //  §G-24. 실모델 본체를 instanceColor 로 물들이면 은색·황동 텍스처가 통째로 물든다(§G-2 실패 재현).
  //  그래서 가산 발광체 하나만 얹고 그 파트만 틴트한다. 추적 카메라는 탄을 뒤에서 보므로 발광은 탄저에 둔다
  //  (노즈에 두면 몸체에 가려 3색 전부 안 보였다 — 실측). 실제 예광탄도 탄저의 예광제가 타며 빛난다.
  const src = readFileSync(new URL('../js/chase3d-renderer.js', import.meta.url), 'utf8');
  const blk = src.slice(src.indexOf("if (k === 'pbullet' && WEAPON3D.round"), src.indexOf('shots[k] = sw;'));
  assert.match(blk, /createVulcanTracerGlow\(THREE\)/, '탄저 발광 파트를 붙인다');
  assert.match(blk, /const tint = parts\.map\(\(\) => false\)/, 'GLB 본체 파트는 틴트하지 않는다');
  assert.match(blk, /tint\.push\(true\)/, '마지막(발광)만 진화색');
  assert.match(blk, /corePart: parts\.length/, '발광 = corePart — 드론 예광탄(core 0)에서는 숨는다');
  assert.match(blk, /colored: true/, '스웜 전체는 틴트 가능 상태');

  //  발광 자체의 계약: 탄저(+z) 쪽 · 가산합성 · 깊이 미기록(뒤 금속을 지우지 않는다)
  const ops = [];
  const THREEStub = {
    AdditiveBlending: Symbol('add'),
    SphereGeometry: class { constructor(r) { this.radius = r; }
      scale(x, y, z) { ops.push(['scale', x, y, z]); return this; }
      translate(x, y, z) { ops.push(['translate', x, y, z]); return this; } },
    MeshBasicMaterial: class { constructor(o) { Object.assign(this, o); } },
  };
  const { createVulcanTracerGlow } = await import('../js/chase3d-props.js');
  const part = createVulcanTracerGlow(THREEStub);
  const tr = ops.find((o) => o[0] === 'translate');
  assert.ok(tr && tr[3] > 0.5, '발광은 탄저(+z)면 바깥 — 카메라가 보는 면. V1 실측: −z 0.034(노즈) < +z 0.094(탄저)');
  assert.ok(part.geo.radius < 0.094, '발광 반경 < 탄피 반경 — 황동 링이 테두리로 남는다');
  assert.equal(part.mat.blending, THREEStub.AdditiveBlending);
  assert.equal(part.mat.depthWrite, false);
});

test('G24-CORE: 백열 심은 탄 폭에 비례하고 탄을 덮지 않는다', () => {
  //  §G-24. 고정 2.8px 시절엔 폭 3~8px 인 발칸탄의 40~100% 를 심이 덮어 그림이 안 보였다.
  const widths = [3, 4, 6, 8, 10, 20];
  for (const w of widths) {
    const cw = vulcanCoreWidth(w);
    assert.ok(cw <= VULCAN_CORE.wMax, `상한 준수 (w=${w})`);
    assert.ok(cw >= VULCAN_CORE.wMin, `하한 준수 — 가는 니들에서도 위치 식별 (w=${w})`);
    if (w >= VULCAN_CORE.wMin / VULCAN_CORE.wRel) {
      assert.ok(cw / w <= 0.5, `심이 탄의 절반을 넘지 않는다 (w=${w}, cw=${cw})`);
    }
  }
  assert.ok(vulcanCoreWidth(8) > vulcanCoreWidth(4), '굵은 탄일수록 심도 굵다');
  //  심은 탄두 쪽 일부 구간에만 — 세로 전체를 관통하지 않는다(팁의 진화색이 남는다)
  assert.ok(VULCAN_CORE.hRel < 0.5, '심 길이는 탄 길이의 절반 미만');
  assert.ok(VULCAN_CORE.yRel < 0, '심 중심은 탄두 쪽');
  assert.ok(Math.abs(VULCAN_CORE.yRel) + VULCAN_CORE.hRel / 2 <= 0.5, '심이 탄 밖으로 나가지 않는다');
});

// ─────────────────────────────────────────────────────────────────────────────
// §6 크기·굵기 위계(유지) + 상한 근거
// ─────────────────────────────────────────────────────────────────────────────
const spec = (key, b) => shotSpec(key, b, makeShotSpec());

test('G22-SIZE: 모든 깊이에서 예광탄 < 발칸lv1 < lv3, 레이저 lv1 < lv3 < 절단탄', () => {
  const cam = chaseCamera();
  const fpx = focalPx(LOGICAL_H, cam.fov);
  const out = { x: 0, y: 0, z: 0 };
  const px = (key, mul, wmul, depth) => {
    shotScale(SHOT_LEN[key], SHOT_W[key] ?? 1, mul, wmul, SHOT_MIN_PX[key] || 0, depth, fpx, out);
    return { len: screenLenPx(out.z, depth, fpx), wid: screenLenPx(out.x, depth, fpx) };
  };
  const t = spec('pbullet', { kind: 'tracer' });
  const v1 = spec('pbullet', { kind: 'vulcan', lv: 1 });
  const v3 = spec('pbullet', { kind: 'vulcan', lv: 3 });
  const l1 = spec('laser', { kind: 'laser', lv: 1, beamW: squadLaserBeamW(1) });
  const l3 = spec('laser', { kind: 'laser', lv: 3, beamW: squadLaserBeamW(3) });
  const lc = spec('laser', { kind: 'laser', lv: 3, beamW: squadLaserBeamW(3) * 2.3, cutter: 16 });
  for (const d of [4, 10, 25, 60, 80]) {
    assert.ok(px('pbullet', t.lengthMul, 1, d).len < px('pbullet', v1.lengthMul, 1, d).len * 0.95, `d=${d} 예광탄<발칸`);
    assert.ok(px('pbullet', v1.lengthMul, 1, d).len < px('pbullet', v3.lengthMul, 1, d).len, `d=${d} lv1<lv3`);
    const w1 = px('laser', l1.lengthMul, l1.widthMul, d).wid;
    const w3 = px('laser', l3.lengthMul, l3.widthMul, d).wid;
    const wc = px('laser', lc.lengthMul, lc.widthMul, d).wid;
    assert.ok(w1 < w3 && w3 < wc, `d=${d} 레이저 굵기 순서`);
    assert.ok(px('pbullet', v1.lengthMul, 1, d).len >= SHOT_MIN_PX.pbullet - 1e-6, `d=${d} 발칸 하한 작동`);
  }
  //  §8.3 상한 근거: 가장 굵은 변형도 §G-18 반려 폭(전장 3.4 × 굵기 0.5 = 1.70 unit)보다 좁다.
  const REJECTED = 3.4 * 0.5;
  const widest = SHOT_LEN.laser * SHOT_W.laser * lc.widthMul;
  assert.ok(lc.widthMul <= WIDTH_MUL_MAX);
  assert.ok(widest < REJECTED * 0.7, `절단탄 월드 폭 ${widest.toFixed(3)} < 반려 폭의 70%(${(REJECTED * 0.7).toFixed(3)})`);
  assert.ok(SHOT_LEN.laser * SHOT_W.laser > 0.4, '기본 레이저는 §G-20 의 "안 보이던" 폭(0.17대)보다 굵다');
});

// ─────────────────────────────────────────────────────────────────────────────
// §11.2 위치: 2.5D 투영(production)과 3D 카메라가 같은 화면점을 가리키는가
// ─────────────────────────────────────────────────────────────────────────────
function chaseCamera() {
  const c = makeChaseCamera(LOGICAL_W, LOGICAL_H, 1);
  const cam = new THREE.PerspectiveCamera(c.fov, c.aspect, CAMERA.near, CAMERA.far);
  cam.up.set(0, 1, 0);
  cam.position.set(c.eye[0], c.eye[1], c.eye[2]);
  cam.lookAt(c.target[0], c.target[1], c.target[2]);
  cam.updateProjectionMatrix(); cam.updateMatrixWorld(true);
  return cam;
}
const toScreen = (cam, p) => { const v = p.clone().project(cam); return { x: ((v.x + 1) / 2) * LOGICAL_W, y: ((1 - v.y) / 2) * LOGICAL_H }; };

test('G22-PLACE: production 2.5D 투영 좌표 → 3D 배치 → 재투영 오차 ≤ 2 logical px', () => {
  //  G21 은 같은 카메라로 unproject→project 해 항등이었다. 여기서는 **다른 모듈**(chase-camera 의 2.5D 수동 투영)이
  //  만든 화면 좌표를 3D 배치에 넣고 THREE 카메라로 되읽는다 — 두 좌표계 규약이 어긋나면 즉시 벌어진다.
  const cam = chaseCamera();
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  const pos = new THREE.Vector3(), tv = new THREE.Vector3(), td = new THREE.Vector3();
  const squadX = 240, squadY = 600;
  const proj = createChaseProjection({ zoom: 2.2, chaseBlend: 1, squadX, squadY, logicalW: LOGICAL_W, logicalH: LOGICAL_H });
  let worst = 0, n = 0;
  for (const wx of [60, 160, 240, 320, 420]) {
    for (const wy of [590, 500, 380, 200, 0, -300]) {
      const p = projectObject({ x: wx, y: wy }, 'playerBullet', proj);
      if (!(p.y > -200 && p.y < LOGICAL_H + 200)) continue;   // 화면 밖 외삽 구간은 배치 대상이 아니다
      const depth = shotDepth(squadY, wy, SCALE_Z, CAMERA.chase.dist);
      placeOnRay(cam, fwd, toNdcX(p.x, LOGICAL_W), toNdcY(p.y, LOGICAL_H), depth, pos, tv, td);
      const s = toScreen(cam, pos);
      worst = Math.max(worst, Math.hypot(s.x - p.x, s.y - p.y)); n++;
    }
  }
  assert.ok(n >= 20, `표본 ${n}개`);
  assert.ok(worst <= 2, `최대 오차 ${worst.toFixed(4)}px ≤ 2px`);
});

test('G22-DEPTH: 깊이 클램프 [3.5, 80] + 단조 증가, 진행각 부호(화면 오른쪽 = 월드 −X)', () => {
  const prev = [];
  for (let wy = 620; wy >= -2000; wy -= 20) prev.push(shotDepth(600, wy, SCALE_Z, CAMERA.chase.dist));
  for (const v of prev) assert.ok(v >= 3.5 && v <= 80);
  for (let i = 1; i < prev.length; i++) assert.ok(prev[i] >= prev[i - 1] - 1e-9);

  const cam = chaseCamera();
  const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
  const pos = new THREE.Vector3(), tv = new THREE.Vector3(), td = new THREE.Vector3();
  placeOnRay(cam, fwd, toNdcX(240, LOGICAL_W), toNdcY(400, LOGICAL_H), shotDepth(600, 300, SCALE_Z, CAMERA.chase.dist), pos, tv, td);
  const dirOf = (wob) => new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, shotYaw(wob), 0));
  assert.ok(dirOf(0).z > 0.99, 'wob=0 → 소실점(+z)');
  assert.ok(dirOf(Math.PI).z < -0.99, 'wob=π(적탄) → 카메라(−z)');
  const base = toScreen(cam, pos);
  for (const wob of [0.2, 0.5]) assert.ok(toScreen(cam, pos.clone().addScaledVector(dirOf(wob), 1.2)).x > base.x + 0.5, `wob=${wob} 오른쪽`);
  for (const wob of [-0.2, -0.5]) assert.ok(toScreen(cam, pos.clone().addScaledVector(dirOf(wob), 1.2)).x < base.x - 0.5, `wob=${wob} 왼쪽`);
});

// ─────────────────────────────────────────────────────────────────────────────
// §9 프레임 할당 — 보스 HUD 경로
// ─────────────────────────────────────────────────────────────────────────────
function recordingHud() {
  const texts = [];
  const noop = () => {};
  const t = { texts };
  return new Proxy(t, {
    get(o, k) {
      if (k === 'texts') return texts;
      if (k === 'fillText' || k === 'strokeText') return (s) => { texts.push(String(s)); };
      if (k === 'measureText') return () => ({ width: 20 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => ({ addColorStop: noop });
      if (k === 'canvas') return { width: LOGICAL_W, height: LOGICAL_H };
      if (k in o) return o[k];
      return noop;
    },
    set(o, k, v) { o[k] = v; return true; },
  });
}
const noAlloc = (arr) => new Proxy(arr, {
  get(t, k) {
    if (k === 'filter' || k === 'map' || k === 'slice' || k === 'concat' || k === 'flatMap') throw new Error('프레임 배열 할당: ' + String(k));
    return t[k];
  },
});
const hudArgs = (bosses) => ({ progress: 0.5, bosses, count: 3, cruisers: 1, tierName: 'AURORA', shipName: 'AURORA', tierPower: 10, stage: 2, weapon: 'vulcan', weaponLv: 2, logicalH: LOGICAL_H });

test('G22-ALLOC1: bossHudView 는 배열·엔트리를 재사용한다(600프레임 신규 할당 0)', () => {
  const bosses = [
    { hp: 40, maxHp: 100, korName: 'ALPHA', spriteId: 'b7', dead: false, stagger: 1, breakT: 0 },
    { hp: 70, maxHp: 100, korName: 'BETA', spriteId: 'b14', dead: false, stagger: 2, breakT: 0 },
  ];
  const out = [];
  const nameOf = (b) => b.korName;
  const first = bossHudView(bosses, out, nameOf, 10);
  const e0 = first[0], e1 = first[1];
  for (let i = 0; i < 600; i++) {
    const v = bossHudView(bosses, out, nameOf, 10);
    assert.equal(v, out, '같은 배열을 되돌린다');
    assert.equal(v[0], e0, '엔트리 객체도 재사용');
    assert.equal(v[1], e1);
  }
  //  보스가 줄면 길이만 줄고 엔트리는 남는다(다음 보스전에서 재사용)
  const v2 = bossHudView([bosses[0]], out, nameOf, 10);
  assert.equal(v2.length, 1);
  assert.equal(bossHudView(bosses, out, nameOf, 10)[1], e1, '다시 늘어나도 옛 엔트리 재사용');
  assert.ok(Object.isFrozen(NO_BOSSES) && NO_BOSSES.length === 0, '보스 없는 프레임은 공유 빈 배열');
});

test('G22-ALLOC2: drawHUD 보스 경로에 filter/map/slice 없음 + 죽은 보스 처리', () => {
  const c1 = recordingHud();
  assert.doesNotThrow(() => drawHUD(c1, LOGICAL_W, hudArgs(noAlloc([
    { hp: 40, maxHp: 100, name: 'ALPHA', dead: false },
    { hp: 70, maxHp: 100, name: 'BETA', dead: false },
  ]))));
  assert.ok(c1.texts.some((s) => s.includes('×2')));

  const c2 = recordingHud();
  drawHUD(c2, LOGICAL_W, hudArgs(noAlloc([
    { hp: 0, maxHp: 100, name: 'ALPHA', dead: true },
    { hp: 70, maxHp: 100, name: 'BETA', dead: false },
  ])));
  assert.ok(c2.texts.includes('BETA') && !c2.texts.includes('ALPHA'));

  const c3 = recordingHud();
  drawHUD(c3, LOGICAL_W, hudArgs(noAlloc([
    { hp: 0, maxHp: 100, name: 'ALPHA', dead: true },
    { hp: 0, maxHp: 100, name: 'BETA', dead: true },
  ])));
  assert.ok(!c3.texts.includes('ALPHA') && !c3.texts.includes('BETA'), '전멸 시 보스 HUD 소멸');
});

// ─────────────────────────────────────────────────────────────────────────────
// §10 연출·기함 알파 — production 이 쓰는 바로 그 함수로 검사
// ─────────────────────────────────────────────────────────────────────────────
test('G22-CINE1: 게이트 — bossDeath 3D 유지 / flythrough·cutscene 소등 / 200% 미만 미표시', () => {
  assert.equal(chase3dFrameGate('play', 'combat', true, true, 2.2), true);
  assert.equal(chase3dFrameGate('play', 'bossDeath', true, true, 2.2), true);
  assert.equal(chase3dFrameGate('play', 'flythrough', true, true, 2.2), false);
  assert.equal(chase3dFrameGate('play', 'cutscene', true, true, 2.2), false);
  assert.equal(chase3dFrameGate('map', 'combat', true, true, 2.2), false);
  assert.equal(chase3dFrameGate('play', 'combat', true, false, 2.2), false, 'renderer 미준비');
  assert.equal(chase3dFrameGate('play', 'combat', false, true, 2.2), false);
  //  §4.2: 준비돼 있어도 사용자가 200% 미만을 요청한 상태면 그리지 않는다
  assert.equal(chase3dFrameGate('play', 'combat', true, true, 1.5), false);
  assert.equal(chase3dFrameGate('play', 'combat', true, true, 1.0), false);
  assert.equal(chase3dFrameGate('play', 'combat', true, true, 2.0), true);
});

test('G22-CINE2: play→bossDeath→flythrough→cutscene→play 전 구간 기함은 정확히 한 척', () => {
  const seq = [
    ['play', 'combat', 2.2], ['play', 'bossDeath', 2.2], ['play', 'flythrough', 2.2],
    ['map', 'cutscene', 2.2], ['play', 'cutscene', 2.2], ['play', 'combat', 2.2],
    ['play', 'combat', 1.5], ['play', 'combat', 2.0],
  ];
  const ts = [0, 0.2, 0.4999, 0.5, 0.75, 1];
  let frames = 0, swaps = 0, prev = null;
  for (const [state, phase, zt] of seq) {
    for (const t of ts) {
      const open = chase3dFrameGate(state, phase, state === 'play', true, zt);
      const t3d = open ? t : 0;
      const layer = flagshipLayer(t3d > 0, t3d);
      assert.equal((layer === '2d' ? 1 : 0) + (layer === '3d' ? 1 : 0), 1, `${state}/${phase}@${zt} t=${t}`);
      if (prev !== null && prev !== layer) swaps++;
      prev = layer; frames++;
    }
  }
  assert.equal(frames, seq.length * ts.length);
  assert.ok(swaps > 0 && swaps <= seq.length * 2, `레이어 전환 ${swaps}회 — 프레임마다 깜빡이지 않는다`);
  for (const t of ts) {
    assert.equal(flagshipLayer(chase3dFrameGate('play', 'flythrough', true, true, 2.2), t), '2d');
    assert.equal(flagshipLayer(chase3dFrameGate('play', 'cutscene', true, true, 2.2), t), '2d');
  }
});

test('G22-CINE3: production main 이 flagshipLayer·chase3dFrameGate 를 실제로 호출한다', () => {
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  //  §G-34 후속(2026-08-11): 게이트에 **기함 GLB 준비 여부**가 추가됐다(이사님 "큰 기함이 스친다").
  //   계약은 그대로 — 레이어 판정은 여전히 `flagshipLayer` 한 함수가 한다. 조건이 하나 늘었을 뿐이다.
  //   ⚠️정규식 한 줄 대조가 또 깨졌다(일곱 번째) → **구성 요소**로 확인한다.
  assert.match(main, /in3D = .*flagshipLayer\(t3d > 0, t3d\) === '3d'/,
    'in3D 는 flagshipLayer 판정을 그대로 쓴다');
  //  §G-35 P0-4: 선체만이 아니라 **선체+선택 무기 묶음**이 준비돼야 3D 로 넘긴다.
  //  §G-37 P1: 판정이 순수 helper 로 빠졌다 — main 은 그것을 호출한다(레거시 fallback 제거).
  assert.ok(main.includes('flagshipReadyForDisplay(chase3d && chase3d.ready, _flagTier, _wKey)'),
    '기함 표시 판정은 flagshipReadyForDisplay 하나를 쓴다(bundle 없으면 2D)');
  assert.ok(!main.includes('_rdy.flagship(_flagTier)'), '선체 전용 fallback 이 남아 있으면 안 된다');
  assert.match(main, /flagshipAlpha: in3D \? 0 : 1/);
  assert.match(main, /const side = flagshipLayer\(t3d > 0, t3d\) === '3d' \? 1 : 0;/);   // noteSwap 도 같은 함수
  assert.match(main, /if \(chase3dFrameGate\(state, run && run\.phase, !!run, !!chase3d, camera\.target\)\)/);
  //  0/1 하드 컷에 중간값이 없다
  for (let t = 0; t <= 1.00001; t += 0.001) {
    const a3 = flagshipLayer(true, t) === '3d' ? 1 : 0;
    assert.equal(a3, t >= 0.5 ? 1 : 0);
  }
});
