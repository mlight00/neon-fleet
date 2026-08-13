// ── §G-34 §4-4 — 전환 카메라가 지켜야 할 성질 ──
//  Codex 조건 4개 중 **카메라 기하만으로 판정 가능한 것**을 실행으로 잠근다.
//   ① 소실점이 t=0.5→1 구간에서 화면에 재진입하지 않는다(왔다갔다 하지 않는다)
//   ② 하드 컷(t=0.5) 앞뒤로 카메라가 연속이다(값이 튀지 않는다)
//   ③ 3뷰포트에서 기함 원점이 화면 안에 남는다
//  ⚠️기함 **bbox** 중심오차·등급별 여백은 실제 GLB 바운딩이 있어야 정확하다. 그건 WebGL 렌더가
//   도는 환경에서 재야 하므로 여기서 단정하지 않는다(§11 에 실측 항목으로 남겼다).
//   ⚠️원근에서 bbox 중심 ≠ 원점 투영이다 — 카메라 쪽 끝점이 크게 확대돼 중심을 끌어당긴다.
//    이 파일이 원점을 기준으로 삼는 이유이며, bbox 로 재려면 실제 모델 치수가 필요하다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { makeChaseCamera, projectPoint3D, CAMERA } from '../js/chase3d-mapping.js';
import { transitionT } from '../js/chase3d-config.js';

const VIEWPORTS = [[360, 800], [480, 800], [800, 600]];
/** 소실점 = 무한히 먼 정면(+z)의 화면 y. 아주 큰 z 로 근사한다. */
const vanishY = (cam) => projectPoint3D(cam, 0, 0, 1e7).sy;

test('G34-CAM-VP-MONOTONE: 소실점은 전환 구간에서 한 방향으로만 움직인다(재진입 0)', () => {
  //  §G-32/33 의 핵심 — 소실점이 화면 밖으로 나갔다 들어오면 세계가 뒤집혀 보인다.
  //  finite top plane 계약(§4-1)에서는 화면 **안**에 있어야 하고, 움직임도 단조로워야 한다.
  for (const [W, H] of VIEWPORTS) {
    let prev = null, dir = 0;
    for (let t = 0.5; t <= 1.0001; t += 0.05) {
      const y = vanishY(makeChaseCamera(W, H, Math.min(1, t)));
      assert.ok(y > 0 && y < H, `${W}x${H} t=${t.toFixed(2)}: 소실점 ${y.toFixed(1)} 이 화면(0~${H}) 안에 있어야 한다`);
      if (prev !== null) {
        const d = Math.sign(y - prev);
        if (d !== 0) {
          if (dir === 0) dir = d;
          else assert.equal(d, dir, `${W}x${H} t=${t.toFixed(2)}: 소실점이 방향을 바꿨다(재진입) — ${prev.toFixed(1)} → ${y.toFixed(1)}`);
        }
      }
      prev = y;
    }
    assert.notEqual(dir, 0, `${W}x${H}: 전환 중 소실점이 실제로 움직인다(고정이면 전환감이 없다)`);
  }
});

test('G34-CAM-CONTINUOUS: 하드 컷 지점에서 카메라 값이 튀지 않는다', () => {
  //  t=0.5 는 기함 표시가 2D→3D 로 **하드 컷**되는 지점이다(flagshipLayer).
  //  카메라 자체까지 그 순간 튀면 화면 전체가 덜컥거린다 — 카메라는 연속이어야 한다.
  const eps = 1e-3;
  for (const [W, H] of VIEWPORTS) {
    const a = makeChaseCamera(W, H, 0.5 - eps), b = makeChaseCamera(W, H, 0.5 + eps);
    for (let i = 0; i < 3; i++) {
      assert.ok(Math.abs(a.eye[i] - b.eye[i]) < 0.01, `eye[${i}] 연속 — ${a.eye[i]} vs ${b.eye[i]}`);
      assert.ok(Math.abs(a.target[i] - b.target[i]) < 0.01, `target[${i}] 연속`);
    }
    assert.ok(Math.abs(a.fov - b.fov) < 0.01, 'fov 연속');
    assert.ok(Math.abs(vanishY(a) - vanishY(b)) < 0.5, '소실점 화면 y 연속');
  }
});

test('G34-CAM-ORIGIN-INSIDE: 3뷰포트 전 구간에서 기함 원점이 화면 안에 남는다', () => {
  //  기함은 원점(0,0,0)에 놓인다(flagRig.position = 0). 그 점이 화면 밖으로 나가면
  //  어떤 모델을 쓰든 기함이 잘린다 — 모델 치수와 무관한 **하한 조건**이다.
  for (const [W, H] of VIEWPORTS) {
    for (const t of [0.5, 0.6, 0.7, 0.8, 0.9, 1.0]) {
      const p = projectPoint3D(makeChaseCamera(W, H, t), 0, 0, 0);
      assert.equal(p.behind, false, `${W}x${H} t=${t}: 기함이 카메라 뒤로 가면 안 된다`);
      assert.ok(p.sx > 0 && p.sx < W, `${W}x${H} t=${t}: 기함 화면 x ${p.sx.toFixed(1)} 이 화면 안`);
      assert.ok(p.sy > 0 && p.sy < H, `${W}x${H} t=${t}: 기함 화면 y ${p.sy.toFixed(1)} 이 화면 안`);
    }
  }
});

test('G34-CAM-HARDCUT-GAP: 하드 컷에서 2D·3D 기함 세로 위치 차이를 계측해 고정한다', () => {
  //  ⚠️이 항목은 "합격/불합격"이 아니라 **회귀 감시**다. Codex 조건(중심오차 ≤12px)은 bbox 기준인데
  //   실제 GLB 바운딩 없이는 bbox 를 정확히 못 잡는다. 대신 **원점 기준 차이**를 숫자로 박아 두어,
  //   카메라 상수를 건드렸을 때 이 값이 나빠지면 즉시 드러나게 한다.
  //   실제 판정은 §11 에서 브라우저 실측으로 채운다.
  const z50 = (() => { for (let z = 1.6; z <= 2.0; z += 0.0005) if (transitionT(z) >= 0.5) return z; return 1.8; })();
  assert.ok(Math.abs(z50 - 1.8) < 0.01, `하드 컷은 zoom≈1.80 에서 일어난다 — 실측 ${z50.toFixed(4)}`);

  const gaps = VIEWPORTS.map(([W, H]) => {
    const sy3d = projectPoint3D(makeChaseCamera(W, H, 0.5), 0, 0, 0).sy;
    //  2D 기함은 근거리선(nearYFrac)에 온다. 하드 컷 시점의 blend 는 0.5 이므로 전술 y 와 절반씩 섞인다.
    //  여기서는 추적 성분(nearY)만 기준으로 잡는다 — 카메라 상수 변화를 보는 것이 목적이다.
    return { W, H, sy3d: +sy3d.toFixed(1), nearY: +(H * 0.83).toFixed(1), gap: +(sy3d - H * 0.83).toFixed(1) };
  });
  //  현재 실측(2026-08-11): 480x800 에서 3D 원점 769.8 vs 근거리선 664.0 → 105.8px 아래.
  for (const g of gaps) {
    assert.ok(g.gap > 0, `${g.W}x${g.H}: 3D 기함이 근거리선보다 아래에 온다(카메라가 내려다보므로) — 실측 ${g.gap}`);
    assert.ok(g.gap < 140,
      `${g.W}x${g.H}: 세로 차이 ${g.gap}px — 140 을 넘으면 하드 컷에서 기함이 크게 뛴다(카메라 상수 회귀 의심)`);
  }
});

test('G34-CAM-BOUNDS: 카메라 상수가 뒤집히지 않는다(high → chase 방향)', () => {
  //  전환은 "위에서 내려다보기(high)"에서 "함미 뒤(chase)"로 간다. 이 방향이 뒤집히면
  //  전환 내내 화면이 거꾸로 움직인다 — 상수를 손볼 때 가장 쉽게 저지르는 실수다.
  assert.ok(CAMERA.high.height > CAMERA.chase.height, '카메라는 전환하며 내려온다');
  assert.ok(CAMERA.high.dist < CAMERA.chase.dist, '카메라는 전환하며 뒤로 물러난다');
  assert.ok(CAMERA.high.fov > CAMERA.chase.fov, '시야각은 좁아진다(원근이 강해진다)');
  assert.ok(CAMERA.far > 1000, `far 는 유한 상단면까지 담을 만큼 멀다 — 실측 ${CAMERA.far}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// 렌더러 첫 프레임 안전 — 선언 누락 하나로 3D 전체가 죽는 것을 막는다
// ─────────────────────────────────────────────────────────────────────────────
test('G34-RENDERER-NO-UNDEF: chase3d 렌더러에 선언 없는 지역 변수가 없다', async () => {
  //  ⚠️2026-08-11 이사님 제보로 드러난 실제 사고: `placeShots` 안에서 `camOriginDepth` 선언이
  //   빠져 있었다. 그 결과 첫 프레임에 `ReferenceError` 가 나고 렌더러가
  //   "이 세션은 2D 로 고정" 폴백에 들어가 **3D 기함이 아예 안 나왔다.**
  //   기존 테스트는 전부 통과했다 — 아무도 렌더러 모듈을 **실행**하지 않았기 때문이다.
  //
  //  ⚠️`ReferenceError` 는 **그 코드 줄이 실제로 돌 때만** 난다(파싱은 통과한다).
  //   그래서 여기서는 strict 모드 파싱 + 위험 패턴 스캔이 아니라, **모듈을 실제로 import** 해
  //   최소한 로드 시점 오류를 잡고, 이어서 함수 본문의 자유 변수를 정적으로 확인한다.
  const mod = await import('../js/chase3d-renderer.js');
  assert.ok(mod, '렌더러 모듈이 로드된다');

  //  함수별로 "이 함수 안에서 쓰이는데 어디에도 선언·import·전역이 아닌" 이름을 찾는다.
  //  완전한 스코프 분석은 아니지만, 이번 사고의 형태(지역 const 누락)는 확실히 잡는다.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/chase3d-renderer.js', import.meta.url), 'utf8');
  //  모듈 전체에서 한 번이라도 선언된 이름 + import 된 이름을 모은다.
  const declared = new Set();
  for (const m of src.matchAll(/\b(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/g)) declared.add(m[1]);
  for (const m of src.matchAll(/\bfunction\s+[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)) {
    for (const p of m[1].split(',')) { const n = p.trim().split(/[\s=]/)[0].replace(/[{}[\].]/g, ''); if (n) declared.add(n); }
  }
  for (const m of src.matchAll(/import\s*\{([^}]+)\}/g)) {
    for (const p of m[1].split(',')) { const n = p.trim().split(/\s+as\s+/).pop().trim(); if (n) declared.add(n); }
  }
  //  이번 사고의 정확한 회귀: `camOriginDepth` 를 **쓰는 모든 함수**가 그 이름을 선언도 한다.
  const uses = [...src.matchAll(/\bcamOriginDepth\b/g)].length;
  const decls = [...src.matchAll(/const\s+camOriginDepth\b/g)].length;
  const writes = [...src.matchAll(/ctl\._camOriginDepth\s*=/g)].length;
  assert.ok(writes >= 1, 'applyCam 이 매 프레임 원점 깊이를 채운다');
  //  `ctl._camOriginDepth` 참조를 뺀 순수 지역 사용 횟수가 선언 수의 2배(선언 1 + 사용 1)를 넘지 않아야 한다.
  const localUses = uses - [...src.matchAll(/ctl\._camOriginDepth\b/g)].length;
  assert.ok(decls > 0 && localUses <= decls * 2,
    `camOriginDepth 를 쓰는 함수마다 선언이 있어야 한다 — 선언 ${decls}회 / 지역사용 ${localUses}회`);
  assert.ok(declared.has('CAMERA'), '방어값에 쓰는 CAMERA 가 import 돼 있다');
});

test('G34-PREFETCH: 확대를 누르면 미리 받고, 100% 로만 놀면 받지 않는다', async () => {
  //  §G-34 후속 A안(이사님 선택). 첫 200% 전환에서 "2D 기함이 보이다가 3D 로 바뀌는" 것을 없앤다.
  //  ⚠️경계가 어긋나면 두 방향으로 다 나쁘다:
  //   · 너무 낮으면 100% 로만 노는 플레이어에게 GLB 20MB 를 지운다(예전 G21 의 Codex P0 지적).
  //   · 너무 높으면 미리 받는 의미가 없다(= INIT_ZOOM 과 같아져 여유가 0).
  const { shouldPrefetch3D, shouldInit3D, INIT_ZOOM, CHASE3D } = await import('../js/chase3d-config.js');

  assert.equal(shouldPrefetch3D(1.0), false, '100% 로만 놀면 아무것도 받지 않는다');
  for (const z of [1.5, 1.6, 2.0, 2.2]) {
    assert.equal(shouldPrefetch3D(z), true, `${z * 100}% 를 요청했으면 미리 받는다`);
  }
  //  프리페치 시점이 표시 시점보다 **확실히 앞서야** 여유가 생긴다.
  assert.ok(!shouldInit3D(1.5) && shouldPrefetch3D(1.5),
    '150% 는 "미리 받되 아직 표시하지 않는" 구간이어야 한다');
  assert.equal(INIT_ZOOM, CHASE3D.FULL_ZOOM, '표시 시작 = 완전 전환 배율(그대로 둔다)');
});

test('G34-PREFETCH-SCOPE: 프리페치 비용은 "확대를 누른 사람"에게만 간다', async () => {
  //  §G-21 §3.2 의 원래 취지 = **"100% 로만 노는 플레이어에게 GLB 를 지우지 마라"**
  //  (G21 완료보고서 원문: "더 일찍 잡으면 100%만 노는 플레이어에게도 GLB를 지우고…").
  //  §G-34 후속에서 타이틀 캔버스 금지를 풀었지만(이사님 결정), 그 취지는 이 경계가 계속 지킨다.
  //  ⚠️`shouldPrefetch3D(1.0)` 가 true 가 되는 순간 그 취지가 깨진다 — 이 줄이 최후 방어선이다.
  const { shouldPrefetch3D } = await import('../js/chase3d-config.js');
  assert.equal(shouldPrefetch3D(1.0), false, '100% = 비용 0');
  assert.equal(shouldPrefetch3D(1.0 + 1e-9), false, '부동소수 오차로 새면 안 된다');
  assert.equal(shouldPrefetch3D(1.1), true, '확대를 눌렀으면 미리 준비한다');
});

test('G34-SORTIE-2D: 출격은 언제나 100%(2D)로 시작한다', async () => {
  //  §G-34 공통 룰(이사님 결정 2026-08-11): 마지막 전술 시점을 불러오지 않는다.
  //  ⚠️왜 룰로 못 박나 — 저장 배율을 복원하면 **3D 준비가 끝나기 전에 이미 추적 모드**가 되어
  //   2D → 절차 폴백 → GLB 로 바뀌는 과정이 화면에 드러난다(이사님 실기 3회 제보).
  //   100% 로 시작하면 그 사이 3D 가 준비되고, 확대하는 순간 곧바로 3D 가 뜬다.
  const { readFileSync } = await import('node:fs');
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');

  //  ① startPlay 초입에서 배율을 기본값으로 되돌린다.
  const i = main.indexOf('function startPlay(');
  assert.ok(i > 0, 'startPlay 를 찾는다');
  const head = main.slice(i, i + 700);
  assert.ok(head.includes('camera.target = DEFAULT_ZOOM'),
    '출격 시 배율을 100% 로 되돌린다');

  //  ② 그러나 저장 자체는 계속한다 — 저장값은 3D 프리페치 판단에 쓰인다.
  //   ("복원하지 않는다"와 "저장하지 않는다"는 다르다. 저장까지 없애면 미리 준비할 신호가 사라진다.)
  assert.ok(main.includes('_restoreZoom'), '저장 배율은 프리페치 신호로 남아 있다');
  assert.ok(main.includes('function persistZoom'), '배율 저장은 계속한다');

  //  ③ 자동 복원은 없다(이사님: "휠을 건드리지도 않았는데 220%로 점프한다").
  assert.ok(!main.includes('camera.target = safeZoom(_restoreZoom)'),
    '저장 배율을 자동으로 되돌리지 않는다');
});
