import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chase3dLabTarget } from '../js/chase3d-config.js';

// Opus5 §12.4 hero 하이브리드 배선 — 소스 정적 계약. 실동작(교차·자원·loss)은 브라우저 QA(보고서 §12) 실측.
const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../js/chase3d-renderer.js', import.meta.url), 'utf8');
const entities = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
const chaseRender = readFileSync(new URL('../js/chase-render.js', import.meta.url), 'utf8');

test('HW-01: hero 가 기본 — createChase3D(canvas3d, { hero })', () => {
  assert.match(main, /createChase3D\(canvas3d, \{ hero: !CHASE3D_TEST \}\)/);
  assert.match(renderer, /if \(opts\.hero\) return createHero3D\(canvas3d, opts\);/);
});

test('HW-02: 기함 스왑 최종형(§9.2 + 이사 3회 지적) — "겹침 0·공백 0" 하드 컷 + 워프 플래시', () => {
  // 1차(넓은 crossfade)→2차(좁은 겹침창 α≤0.18)→3차(±0.12 페이드 스왑) 전부 실기에서 "두 척"/"함선 소멸"로 기각.
  //  최종형: 페이드 자체를 금지 — 2D 는 t<0.5 에서 α=1, 3D 는 t≥0.5 에서 완전 불투명. 교체 팝은 워프 플래시가 가린다.
  assert.match(main, /flagshipAlpha: t3d < 0\.5 \? 1 : 0/);
  assert.match(renderer, /if \(t < 0\.5\) \{ hide\(\); return t; \}/);   // 3D 미점등 구간에도 t 반환 → 2D 게이트 동일 t 구동
  assert.match(renderer, /show\(1\)/);
  assert.ok(!/\(t - 0\.5\) \/ 0\.12/.test(renderer), '중간 페이드 부재(반투명 3D 뒤 2D 비침 = "두 척" 재발 방지)');
  assert.ok(!/\(0\.5 - t3d\) \/ 0\.12/.test(main), '2D 쪽도 페이드 부재(t=0.5 부근 함선 소멸 계곡 재발 방지)');
  assert.match(main, /function noteSwap\(/); assert.match(main, /drawSwapFlash\(hctx\)/);   // 스왑 순간 워프 플래시 배선
  assert.ok(!/if \(t3d < 0\.999\)/.test(main), 'Phase0 의 월드 생략 게이트 제거(적·이펙트는 전 구간 RC2)');
  // 수학적 증명: 어떤 t 에서도 "정확히 한 척" — 동시 표시 불가(겹침 0) + 동시 소멸 불가(공백 0)
  const a2 = (t) => (t < 0.5 ? 1 : 0);
  const a3 = (t) => (t < 0.5 ? 0 : 1);
  for (let t = 0; t <= 1.0001; t += 0.005) assert.equal(a2(t) + a3(t), 1, `t=${t.toFixed(3)} 정확히 한 척`);
});

test('HW-09: 부분 추종(이사) — 2D C0 이탈을 3D 카메라 트럭 이동으로 정합', () => {
  // "함선은 가운데 고정이고 배경이 이동한다" 지적 → 기함이 화면 안에서 실제로 움직여 보이게.
  assert.match(main, /const followX = chaseProjection \? chaseProjection\.C0 - chaseProjection\.centerX : 0/);
  assert.match(main, /performance\.now\(\) \* 0\.001, followX, _sw\)/);   // frame 8·9번째 인자(트럭 + 통합 스웜)
  assert.match(renderer, /followX \* \(cssW \/ logicalW\), cssH\)/);           // 논리→캔버스 픽셀 환산 후 applyCam
  assert.match(renderer, /camera\.position\.set\(cam3d\.eye\[0\] \+ ox/);      // 트럭 이동(회전 없는 평행이동)
  assert.match(renderer, /camera\.lookAt\(cam3d\.target\[0\] \+ ox/);
});

test('HW-10: 크리처 실전 스웜 B1+B2(이사 승인) — 화면 정합 배치 + 2D 하드 컷 + 안전 폴백', () => {
  // 3D 레이어 = AURORA + 종별 인스턴스(버킷 3 = 종당 +3 draw). 배치는 2.5D 투영 화면좌표·크기에 정합(unproject).
  // §G-4 이미지 파이프라인(이사): 적 12종 = Gemini 렌더 빌보드 — ENEMY3D 단일 진실 루프
  assert.match(renderer, /import \{ ENEMY3D, ALLY3D, PICKUP3D, FLAG3D, WEAPON3D, MOUNT_POINTS, SHOT_KEYS, SHOT_LEN, SHOT_W, SHOT_MIN_PX \} from '\.\/chase3d-prop-defs\.js'/);
  assert.match(renderer, /eswarm\[k\] = def\.glb \? makeGlbSwarm\(k, def\) : makeBillboardSwarm\(k, def\.cap\)/);
  assert.match(renderer, /function placeSwarm\(sw, buf, n, cap, mode = 'wob', time = 0, yawBase = Math\.PI, pitchBase = -0\.12, behindFlag = false\)/);
  assert.match(renderer, /\.unproject\(camera\)/);
  assert.match(renderer, /if \(sk\) placeSwarm\(eswarm\[k\], sk\.buf, sk\.n, ENEMY3D\[k\]\.cap, ENEMY3D\[k\]\.glb \? 'face' : 'wob', 0, Math\.PI, ENEMY3D\[k\]\.pitch \?\? -0\.12, true\)/);   // t≥0.5 도달 지점에서만 = 하드 컷 공유
  assert.match(renderer, /return null; \/\* 비치명/);                          // 생성 실패 → AURORA 단독 폴백
  // main: 비변이만 수집(변이=2D 유지로 링·표식 보존), 크리처는 크기별 b1/b2/b3, 프레임 스탬프로 수집분만 2D 스킵
  assert.match(main, /if \(e\.affixes && e\.affixes\.length\) return/);
  assert.match(main, /e\.size === 'small' \? 'b1' : e\.size === 'mid' \? 'b2' : 'b3'/);
  assert.match(main, /_in3dMap\.set\(e, _b1Stamp\)/);   // Codex P2: sidecar(WeakMap) — 게임 객체 무오염
  assert.match(main, /skipEntity: t3d >= 0\.5 \? _isB13D : null/);
  const cr = readFileSync(new URL('../js/chase-render.js', import.meta.url), 'utf8');
  assert.match(cr, /if \(skipEntity && skipEntity\(e\)\) continue/);
  // placeSwarm 본문 프레임 중 할당 금지: new THREE 없음(스크래치 재사용)
  const pb = renderer.slice(renderer.indexOf('function placeSwarm('), renderer.indexOf('function frame('));
  assert.ok(!/new THREE\./.test(pb), 'placeSwarm 안 new THREE 없음');
});

test('HW-11: 소품 3D(§G-2 갱신) — 발사체 3종 원본 텍스처 재질 + 정보 라벨 유지 + 공명만 2D 예외', () => {
  assert.match(renderer, /import \{ PROP_KEYS, PROP_CAPS, PROP_BASE_COLOR, createPropGeometry, createPropMaterial, createProjMaterial, createPickupParts, createEnemyBulletParts \} from '\.\/chase3d-props\.js'/);
  // §G-3 재설계(이사 "2D 이어붙이기 금지"): 픽업 5종=순수 조형 멀티 파트(파트별 InstancedMesh, instanceColor 미사용)
  assert.match(renderer, /const maker = k === 'ebullet' \? createEnemyBulletParts : createPickupParts/);
  assert.match(renderer, /props\[k\] = \{ meshes, count: 0, colored: k === 'ebullet' \}/);   // §G-4: 적탄만 탄색 틴트
  const propsSrc = readFileSync(new URL('../js/chase3d-props.js', import.meta.url), 'utf8');
  assert.match(propsSrc, /export function createEnemyBulletParts/);
  const props3 = readFileSync(new URL('../js/chase3d-props.js', import.meta.url), 'utf8');
  assert.match(props3, /export function createPickupParts/);
  assert.ok(!/PICKUP_TEX/.test(props3), '픽업 그림 텍스처는 폐기(순수 조형)');
  assert.ok(!/styleC\/C1\.png/.test(props3), '픽업에서 원본 그림 파일 참조 제거');
  assert.match(renderer, /new THREE\.InstancedMesh\(createPropGeometry\(THREE, k\), mat, PROP_CAPS\[k\]\)/);
  assert.match(renderer, /im\.setColorAt\(i, _sCol\)/);                                    // instanceColor(적탄·픽업)
  // §G-13 발사체는 props 에서 분리돼 shots(상시 3D)로 간다 — 픽업만 placeSwarm 'spin'
  assert.match(renderer, /if \(SHOT_KEYS\.includes\(k\)\) continue;   \/\/ 발사체는 아래 placeShots/);
  assert.match(renderer, /placeSwarm\(props\[k\], s\.buf, s\.n, PROP_CAPS\[k\], 'spin', time, Math\.PI, -0\.12, true\)/);
  // main: 레이저 랜스도 3D 수집(공명 레일만 2D 전용 렌더 유지), 발사체는 원본색(흰색 — 2D 도 원색 blit)
  assert.match(main, /if \(b\.dead \|\| b\.resonanceId\) continue;/);
  assert.match(main, /b\.kind === 'laser' \? 'laser' : b instanceof HomingMissile \? 'missile' : 'pbullet'/);
  assert.match(main, /putProp\(key, b, p, col, Math\.atan2/);   // §G-15 2D 와 같은 탄색을 넘긴다
  assert.match(main, /e instanceof Crystal\) \{ key = 'crystal'; label = `\+\$\{e\.payout\}`/);
  assert.match(main, /e instanceof DronePod\) \{ key = 'pod'; label = `▲\$\{e\.payout\}`/);
  assert.match(main, /function drawPropLabels\(c\)/);
  assert.match(main, /if \(t3d >= 0\.5\) drawPropLabels\(hctx\)/);
  // 적탄은 색 캐시+진행각 유지
  assert.match(main, /colInt\(b\.color, 0xff7a5a\), Math\.atan2\(b\.vx \|\| 0, -\(b\.vy \|\| 1\)\)/);
  // §G-2 발사체 텍스처 원본 = 게임 2D 와 같은 파일
  const props = readFileSync(new URL('../js/chase3d-props.js', import.meta.url), 'utf8');
  assert.match(props, /nf2_proj_vulcan_base\.webp/); assert.match(props, /nf2_proj_homing_base\.webp/); assert.match(props, /nf2_proj_laser_base\.webp/);
  assert.match(props, /blending: THREE\.AdditiveBlending/);
});

test('HW-12: §G-14 소품 3D 상시 + sidecar 무오염 + 진단 확장', () => {
  // 기본 OFF 였던 이유는 임시 조형이 "엉망"이라는 실기 판정 — §G-7 VARCO 실모델 교체로 전제가 사라져
  //  이사 지시로 픽업까지 상시 3D. 개발 플래그(chase3dProps)는 폐기했다(죽은 스위치 금지).
  const cfg = readFileSync(new URL('../js/chase3d-config.js', import.meta.url), 'utf8');
  assert.ok(!/chase3dPropsEnabled/.test(cfg), 'chase3dProps 플래그 폐기');
  assert.ok(!/CHASE3D_PROPS/.test(main), 'main 에 소품 게이트 상수 없음');
  assert.ok(!/opts\.propsEnabled/.test(renderer), 'renderer 에 소품 생성 게이트 없음');
  assert.match(main, /§G-13 발사체 3D 는 상시/);
  assert.match(main, /§G-14 상시/);                          // 픽업도 상시 3D
  // sidecar: 렌더 상태가 게임 객체에 기록되지 않는다(회귀 방지)
  assert.match(main, /const _in3dMap = new WeakMap\(\)/);
  assert.ok(!/\._in3d\b/.test(main), 'main 에 게임 객체 _in3d 필드 없음');
  assert.ok(!/_in3d/.test(entities), 'entities 에 _in3d 없음');
  // 진단: 확장 범위를 따라간다(b4·소품 count)
  assert.match(renderer, /Object\.keys\(ENEMY3D\)\.map\(\(k\) => \[k \+ 'Count', eswarm\[k\] \? eswarm\[k\]\.count : -1\]\)/);
  assert.match(renderer, /propCounts: props \? Object\.fromEntries\(PROP_KEYS\.filter\(\(k\) => !SHOT_KEYS\.includes\(k\)\)\.map/);
  assert.match(renderer, /shotCounts: shots \? Object\.fromEntries\(SHOT_KEYS\.map/);   // §G-13 발사체 진단
  // §G-14: 픽업도 상시 3D — 생성 게이트 자체가 없다(죽은 스위치 금지). 대신 픽업/발사체 스웜이 모두 준비되는지 확인.
  const propBlock = renderer.slice(renderer.indexOf('let props = null;'), renderer.indexOf('/** 셰이더 프리웜'));
  assert.ok(!/opts\.propsEnabled/.test(propBlock), '소품 생성 게이트 없음');
  assert.match(propBlock, /createPickupParts\(THREE, k\)/);
  assert.match(propBlock, /let shots = null;/);
  // Codex 재검토 P2-2: 기본 URL 정적 로드 체인 절단 — main 은 순수 상수 모듈만, 팩토리(→aurora-geometry)는 미로드
  const staticImports = [...main.matchAll(/^\s*import\s+[^;]*from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  assert.ok(staticImports.includes('./chase3d-prop-defs.js'), 'main 은 prop-defs(의존 0)만 정적 import');
  assert.ok(!staticImports.includes('./chase3d-props.js'), 'main 에 chase3d-props(팩토리) 정적 import 없음');
  assert.ok(!staticImports.some((s) => s.includes('chase3d-aurora')), 'main 에 aurora 계열 정적 import 없음');
  const defs = readFileSync(new URL('../js/chase3d-prop-defs.js', import.meta.url), 'utf8');
  assert.ok(!/^\s*import/m.test(defs), 'prop-defs 는 의존 0(어떤 import 도 없음)');
});

test('HW-03: 기함 본체만 페이드 — 피격핵은 alpha 밖(§9.3 판정 시각 유지)', () => {
  const i = entities.indexOf('if (fsAlpha > 0.02) {');
  assert.ok(i > 0, 'fsAlpha 게이트 존재');
  const block = entities.slice(i, entities.indexOf('this.drawHitCore(ctx);', i));
  assert.match(block, /drawFlames/); assert.match(block, /shipBaseSprite/); assert.match(block, /drawWeaponRig/);
  assert.match(block, /ctx\.globalAlpha = 1;\s*\}\s*$/, '본체 뒤 alpha 복원 → hitCore 는 항상 표시');
  assert.match(chaseRender, /flagshipAlpha: opts\.flagshipAlpha \?\? 1/);
});

test('HW-04: 입력은 기존 RC2 역변환만(§9.3) — 3D 입력 개입 없음', () => {
  const s = main.indexOf('function currentScreenToWorldX');
  const body = main.slice(s, main.indexOf('}', main.indexOf('return', s)) + 1);
  assert.ok(!/chase3d/.test(body), 'currentScreenToWorldX 에 chase3d 미사용');
  assert.match(body, /screenToWorldXAtPlayer/);
});

test('HW-05: hero 렌더러 색관리(§7.3) + 프리웜(§10.2) + 창 기준 LOD', () => {
  const hero = renderer.slice(renderer.indexOf('function createHero3D'), renderer.indexOf('function createLegacy3D'));
  assert.match(hero, /outputColorSpace = THREE\.SRGBColorSpace/);
  assert.match(hero, /toneMapping = THREE\.ACESFilmicToneMapping/);
  assert.match(hero, /compileAsync/);
  assert.match(hero, /prewarm/);
  assert.match(hero, /model\.setLOD\(ctl\._mobile \? 1 : 0\)/);
  // 프레임 중 할당 금지(§10.1): hero frame() 본문에 new THREE/배열 리터럴 생성 없음
  const f = hero.slice(hero.indexOf('function frame('), hero.indexOf('function show('));
  assert.ok(!/new THREE\./.test(f), 'frame() 안 new THREE 없음');
});

test('HW-06: lab 플래그 정책 — chase3d=1 없으면 검사실 불가(§8)', () => {
  assert.equal(chase3dLabTarget('?chase3d=1&chase3dLab=aurora'), 'aurora');
  assert.equal(chase3dLabTarget('?chase3dLab=aurora'), '');
  assert.equal(chase3dLabTarget(''), '');
  // 기본 URL 에서 lab 모듈 미로드: 동적 import 는 CHASE3D_LAB 타깃 가드 안
  const i = main.indexOf("import('./chase3d-lab.js')");
  const guard = main.lastIndexOf("if (['aurora', 'a0', 'flags', 'weapons', 'hazards', 'b1', 'b2', 'b4', 'b5', 'b6', 'models', 'allies', 'pickups', 'swarm'].includes(CHASE3D_LAB))", i);
  assert.ok(guard > 0 && guard < i, 'lab import 는 6타깃 플래그 가드 안');
});

test('HW-08: DOM 메뉴는 캔버스 계층 위(§6) — #stage flex 자식 z-index 함정 재발 방지', () => {
  // 실크롬 실측 버그: #game(z1, flex 자식이라 static이어도 z 적용)이 #overlay(z auto)를 가려 타이틀 메뉴가 통째로 안 보였음.
  assert.match(main, /_ovz\.style\.zIndex = '5'/);
  const i = main.indexOf("canvas.style.zIndex = '1'");
  const j = main.indexOf("_ovz.style.zIndex = '5'");
  assert.ok(i > 0 && j > i, 'overlay z=5 는 캔버스 z 설정과 같은 부트스트랩에서 함께');
  // 검사실·검증장면 캔버스를 메인 draw 가 만지지 않음(실 rAF 60fps 숨김 충돌 재발 방지)
  assert.match(main, /if \(CHASE3D_ON && !CHASE3D_TEST && !CHASE3D_LAB\)/);
});

test('HW-07: 구 임시 모델은 삭제하지 않고 dev fallback 으로 유지(§9.1)', () => {
  assert.match(renderer, /function createLegacy3D/);
  assert.match(renderer, /createChaseScene/);   // 구 경로가 여전히 배선됨(chase3dTest 전용)
});

test('HW-13: 기함 가림 계약(이사 "적·수송선이 기함 위로 지나감") — 적·픽업만 기함 뒤, 탄·아군은 앞', () => {
  // 근접 개체의 깊이 하한(6)이 기함(원점 시선깊이 ~11.2)보다 앞이라 z-buffer 가 적을 기함 위에 그렸다.
  // 교정: behindFlag 스웜은 깊이를 기함 기수 뒤로 리매핑 — 화면 위치(광선상 이동)·크기(scl 보정)는 불변, 개체 간 순서 유지(단조).
  assert.match(renderer, /const FLAG_NOSE_CLEAR = 2\.8/);
  assert.match(renderer, /const flagBehind = -camera\.position\.dot\(_sFwd\) \+ FLAG_NOSE_CLEAR/);
  assert.match(renderer, /if \(behindFlag && depth < flagBehind && flagBehind > 6\.5\) depth = flagBehind \+ \(\(depth - 6\) \/ \(flagBehind - 6\)\) \* 1\.5/);
  // 아군(드론·순양함)은 behindFlag 미전달(기함 갑판 위 편대 유지) — direct 호출에 9번째 인자 없음
  assert.match(renderer, /placeSwarm\(drone, swarms\.drone\.buf, swarms\.drone\.n, DRONE_INSTANCE_MAX, 'direct', 0, 0\)/);
  assert.match(renderer, /placeSwarm\(cruiser, swarms\.cruiser\.buf, swarms\.cruiser\.n, CRUISER_INSTANCE_MAX, 'direct', 0, 0\)/);
});

test('HW-14: §G-8 기함 실모델 등급 스왑 + 피격 연출 교체(이사 "섬광 말고 부품 이탈·흔들림")', () => {
  const defs = readFileSync(new URL('../js/chase3d-prop-defs.js', import.meta.url), 'utf8');
  // 등급 6종 테이블 — T0/T1 은 드론·순양함 원화 재사용, T2~T5 는 전용 실모델
  assert.match(defs, /export const FLAG3D = \{/);
  for (const [t, f] of [[0, 'a1'], [1, 'a2'], [2, 't2'], [3, 'a0'], [4, 't4'], [5, 't5']]) {
    assert.match(defs, new RegExp(`${t}: \{ glb: 'assets/3d/${f}_model\.glb'`), `T${t}=${f}`);
  }
  // ⚠️회전 규약: 서 있는 원본(a1/a2/a0)만 rotX -π/2, 누운 원본(t2/t4/t5)은 rotX 금지(적용 시 5m 벽으로 세워짐 — 실측)
  const flagBlock = defs.slice(defs.indexOf('export const FLAG3D'));
  for (const f of ['t2', 't4', 't5']) {
    const line = flagBlock.split('\n').find((l) => l.includes(`${f}_model.glb`));
    assert.ok(line && !/rotX/.test(line), `${f} 는 rotX 금지(이미 누운 원본)`);
    assert.match(line, /rotY: Math\.PI/, `${f} 노즈 +z 정렬`);
  }
  // renderer: 리그·홀더·등급 배율·가시성 스왑
  assert.match(renderer, /import \{ ENEMY3D, ALLY3D, PICKUP3D, FLAG3D, WEAPON3D, MOUNT_POINTS, SHOT_KEYS, SHOT_LEN, SHOT_W, SHOT_MIN_PX \}/);
  assert.match(renderer, /const TIER_SCALE = \[0\.62, 0\.75, 0\.88, 1\.00, 1\.13, 1\.26\]/);
  assert.match(renderer, /holder\.visible = false; holder\.scale\.setScalar\(FLAG_LEN \* \(TIER_SCALE\[\+t\] \?\? 1\)\)/);
  assert.match(renderer, /for \(const k of Object\.keys\(flags\)\) flags\[k\]\.holder\.visible = \(useGlb && \+k === tier\)/);
  assert.match(renderer, /model\.group\.visible = !useGlb/);   // 실모델 준비 전·실패 시 절차 AURORA 폴백
  // 피격 연출: 파편 InstancedMesh + 감쇠 흔들림, 신호는 squad.flash 상승 에지(게임 로직 무수정)
  assert.match(renderer, /const debris = new THREE\.InstancedMesh\(/);
  assert.match(renderer, /if \(fl > _prevFlash \+ 0\.1 && !prefersReducedMotion3D\(\)\)/);
  assert.match(renderer, /_shakeT = Math\.max\(0, _shakeT - dt\)/);
  assert.match(renderer, /flagRig\.rotation\.z = Math\.sin\(w \* 1\.3 \+ 0\.6\) \* 0\.09 \* k/);
  assert.ok(!/Math\.random\(\)/.test(renderer), '파편 난수는 결정적 LCG(_rnd) — Math.random 금지 계약');
  // 기각된 섬광 연출은 완전 제거(이사 "정말 별로다")
  assert.ok(!/drawImpactFlash/.test(main), '충돌 섬광 제거');
  assert.ok(!/noteImpact/.test(main), '충돌 섬광 감지 제거');
});

test('HW-15: §G-12 기함 무기 실모델(이사 VARCO 5종) — 갑판 포탑 스왑·기수 차지 포구·미사일 탄체', () => {
  const defs = readFileSync(new URL('../js/chase3d-prop-defs.js', import.meta.url), 'utf8');
  // 테이블: 5종 + 진열장 실측 회전(포신·노즈가 +z)
  assert.match(defs, /export const WEAPON3D = \{/);
  for (const [k, f] of [['vulcan', 'w1'], ['laser', 'w2'], ['homing', 'w3'], ['missile', 'w4'], ['muzzle', 'w5']]) {
    assert.match(defs, new RegExp(`${k}\s*:.*assets/3d/${f}_model\.glb`), `${k}=${f}`);
  }
  const wBlock = defs.slice(defs.indexOf('export const WEAPON3D'), defs.indexOf('export const MOUNT_POINTS'));
  const rotOf = (k) => (wBlock.split('\n').find((l) => l.trim().startsWith(k)) || '');
  assert.match(rotOf('vulcan'), /rotY: Math\.PI/);          // 포구 다발이 -z 원본
  assert.match(rotOf('laser'), /rotY: -Math\.PI \/ 4/);      // 비축 포신(315°에서 포구가 정면 — 6° 스윕 실측)
  assert.match(rotOf('homing'), /rotY: 0/);                 // 3×3 발사관이 이미 +z
  assert.match(rotOf('missile'), /rotY: Math\.PI/);         // 노즈 -z 원본(0°는 노즐·핀이 보인다)
  assert.match(rotOf('muzzle'), /rotY: 0/);                 // 금색 조리개가 +z
  // 장착점 표는 ships.js 의 NORMALIZED_MOUNTS 와 값이 같아야 한다(2D·3D 같은 자리)
  const ships = readFileSync(new URL('../js/ships.js', import.meta.url), 'utf8');
  const grab = (src, name) => {
    const i = src.indexOf(name);
    const s = src.indexOf('[', i), e = src.indexOf('];', s);
    return JSON.parse(src.slice(s, e + 1).replace(/\s+/g, '').replace(/,\]/g, ']'));   // 트레일링 콤마 제거
  };
  assert.deepEqual(grab(defs, 'export const MOUNT_POINTS'), grab(ships, 'const NORMALIZED_MOUNTS'), '2D·3D 장착점 표 동기');
  // renderer 배선: 무기 1종만 켜는 스왑 + 2D 와 같은 개수 규칙 + 기함 롤 공유
  assert.match(renderer, /const mountRig = new THREE\.Group\(\)/);
  assert.match(renderer, /for \(const k of \['vulcan', 'laser', 'homing'\]\)/);
  assert.match(renderer, /const n = Math\.min\(pts\.length, Math\.max\(1, 1 \+ tier \+ Math\.max\(0, lv - 1\)\)\)/);
  assert.match(renderer, /const wKey = sq\.weapon === 'laser' \? 'laser' : sq\.weapon === 'homing' \? 'homing' : 'vulcan'/);
  assert.match(renderer, /mountRig\.visible = useGlb && placeMounts\(tier, wKey, sq\.weaponLv \| 0, flags\[tier\]\.box/);
  assert.match(renderer, /mountRig\.rotation\.z = bank/);
  assert.match(renderer, /flags\[t\] = \{ holder, ok: false, box: null \}/);   // 장착점 환산 기준(기함 바운딩)
  // 차지 포구: chargeRig 자식이라 충전·발사 동안만 보인다(상시 표시 금지 — 실루엣 변형)
  assert.match(renderer, /const muzzleRig = new THREE\.Group\(\)/);
  assert.match(renderer, /chargeRig\.add\(muzzleRig\)/);
  assert.match(renderer, /muzzleRig\.position\.set\(0, 0\.35, NOSE_Z - ms \* 0\.9\)/);
  assert.match(renderer, /muzzleRig\.rotation\.set\(0, Math\.PI, time \* 1\.1\)/);   // 조리개가 카메라를 향한다(전방으로 두면 뚫린 뒷면=검은 덩어리 — 실측)
  // 기수 기준점은 등급별 실측 바운딩 — 상수 2.6(T3) 이면 T4·T5 에서 코어·포구가 선체에 묻힌다
  assert.match(renderer, /const NOSE_Z = \(flags\[tier\] && flags\[tier\]\.box \? flags\[tier\]\.box\.max\.z \* \(FLAG_LEN \* \(TIER_SCALE\[tier\] \?\? 1\)\) : 2\.25\) \+ 0\.35/);
  // 충전 신호: 실전 Squad 는 charge(초)만 갖는다 — charging/chargeFrac 만 읽던 §G-11 은 실플레이에서 안 떴다
  assert.match(renderer, /const chgOn = sq\.charging !== undefined \? !!sq\.charging : \(sq\.charge \|\| 0\) > 0\.001/);
  assert.match(renderer, /const CHARGE_FULL = BAL\.charge\.stageTime \* BAL\.charge\.maxStage/);
  // 미사일 탄체: 소품 경로에서 GLB 스왑(로드 실패 시 기존 원본 텍스처 조형 폴백)
  assert.match(renderer, /if \(k === 'missile' && WEAPON3D\.missile\.glb\) \{/);
  assert.match(renderer, /props\[k\] = makeGlbSwarm\(k, WEAPON3D\.missile,/);
  // 실제 GLB 파일 존재(개발본)
  for (const f of ['w1', 'w2', 'w3', 'w4', 'w5']) {
    const p = new URL(`../assets/3d/${f}_model.glb`, import.meta.url);
    assert.ok(readFileSync(p).length > 100_000, `${f}_model.glb 존재·비어있지 않음`);
  }
});

test('HW-16: §G-13 발사체 상시 3D — 화면 정합 + 월드 깊이·자세(이사 "포물선을 그리며 던지는 느낌")', () => {
  const defs = readFileSync(new URL('../js/chase3d-prop-defs.js', import.meta.url), 'utf8');
  assert.match(defs, /export const SHOT_KEYS = \['pbullet', 'ebullet', 'missile', 'laser'\]/);
  assert.match(defs, /export const SHOT_LEN = \{/);
  // 원인 기록: 2D 는 탄 스프라이트를 화면축 고정으로 그린다(회전 없음) — 그래서 어디에 있든 "똑바로 선" 그림
  assert.ok(!/rotate\(/.test(chaseRender), 'chase-render 는 회전을 쓰지 않는다(=2D 탄이 진행 방향으로 기울지 않던 원인)');
  // 상시 생성: 픽업(props)과 발사체(shots) 모두 어떤 URL 플래그에도 묶이지 않는다
  assert.ok(renderer.indexOf('let shots = null;') > renderer.indexOf('let props = null;'), 'shots 는 props 블록 뒤');
  assert.ok(!/propsEnabled/.test(renderer), 'renderer 전체에 소품 게이트 없음');
  // 배치: 화면좌표 역투영(정합) + 월드 진행축 깊이 + 진행 방향 yaw
  assert.match(renderer, /function placeShots\(sw, buf, n, cap, key, sqy\)/);
  assert.match(renderer, /const depth = Math\.min\(80, Math\.max\(3\.5, \(sqy - o\.wy\) \* SCALE_Z \+ CAMERA\.chase\.dist\)\)/);
  assert.match(renderer, /_sEul\.set\(0, Math\.PI - \(o\.wob \|\| 0\), 0\)/);   // 노즈 −z + 3D X 반전 보정
  assert.match(renderer, /placeShots\(shots\[k\], s \? s\.buf : null, s \? s\.n : 0, PROP_CAPS\[k\], k, sq\.y\)/);
  // placeShots 안에서 프레임 중 할당 금지(스크래치 재사용)
  const pb = renderer.slice(renderer.indexOf('function placeShots('), renderer.indexOf('function frame('));
  assert.ok(!/new THREE\./.test(pb), 'placeShots 안 new THREE 없음');
  // main: 월드 좌표 기록 + 발사체 수집은 플래그 밖
  assert.match(main, /o\.wx = e\.x; o\.wy = e\.y;/);
  assert.match(main, /wx: 0, wy: 0/);
});

test('HW-17: §G-15 이사 실기 4건 — 연출 구간 3D 소등 / 탄색 일치 / 최소 크기 / 죽은 보스 바 제거', () => {
  const defs = readFileSync(new URL('../js/chase3d-prop-defs.js', import.meta.url), 'utf8');
  const renderJs = readFileSync(new URL('../js/render.js', import.meta.url), 'utf8');
  // (3) 섹터 종료 연출에서 3D 소등 — flythrough 는 2D 기함이 화면 위로 빠져나가는데 3D 기함은 제자리라 두 척이 된다
  assert.match(main, /const cinematic = !!run && \(run\.phase === 'flythrough' \|\| run\.phase === 'cutscene'\)/);
  assert.match(main, /if \(chase3d && state === 'play' && run && !cinematic\)/);
  // (1) 발칸 색 = 2D 탄색(진화색), 미사일만 원본 흰색
  // §G-20 종류별로 2D 와 같은 색: 드론 예광탄=청록, 레이저=b.color, 발칸=백열 코어(흰색), 미사일=원색
  assert.match(main, /b\.kind === 'tracer' \? 0x3ff5e0/);
  assert.match(main, /b\.kind === 'laser' \? colInt\(b\.color, 0x8fe8ff\)/);
  assert.match(main, /: 0xfffefb;/);   // 발칸은 b.color 를 쓰지 않는다(2D 가 스프라이트+백열 코어라 흰색)
  assert.match(renderer, /createProjMaterial\(THREE, k, false\)/);   // 발칸·레이저는 주황 로켓 그림 미적용
  const props = readFileSync(new URL('../js/chase3d-props.js', import.meta.url), 'utf8');
  assert.match(props, /export function createProjMaterial\(THREE, key, textured = true\)/);
  // (1) 레이저=길고 가늘게, 미사일=크게, 화면 최소 크기 하한
  assert.match(defs, /export const SHOT_LEN = \{ pbullet: 0\.62, ebullet: 0\.50, missile: 1\.50, laser: 1\.70 \}/);
  assert.match(defs, /export const SHOT_W = \{ pbullet: 1\.0, ebullet: 1\.0, missile: 1\.0, laser: 0\.32 \}/);
  assert.match(defs, /export const SHOT_MIN_PX = \{/);
  assert.match(renderer, /const k2 = minPx > 0 \? Math\.max\(1, \(minPx \* depth\) \/ \(fpx \* len \* mul\)\) : 1/);
  // (4) 파괴된 보스는 HP 바에서 빠진다(빈 붉은 칸이 남지 않게)
  assert.match(renderJs, /const liveBosses = bosses\.filter\(\(b\) => b && !b\.dead\)/);
  assert.match(renderJs, /if \(liveBosses\.length\) \{/);
  assert.ok(!/ctx\.fillStyle = bo\.dead \?/.test(renderJs), '죽은 보스용 회색 채움 분기 제거(애초에 목록에서 빠짐)');
});

test('HW-18: §G-16 위험물 4종 — 모델 준비 게이트(없으면 2D 유지, 사라지지 않는다)', () => {
  const defs = readFileSync(new URL('../js/chase3d-prop-defs.js', import.meta.url), 'utf8');
  for (const [k, n] of [['h1', 'Meteor'], ['h2', 'Debris'], ['h3', 'Charger'], ['h4', 'Mine']]) {
    assert.ok(defs.includes(`glb: 'assets/3d/${k}_model.glb'`), `${k}=${n} 엔트리`);
  }
  assert.match(renderer, /ctl\.swarmReady = \(k\) => !!\(eswarm\[k\] && eswarm\[k\]\.meshes && eswarm\[k\]\.meshes\.length\)/);
  assert.match(main, /if \(chase3d && chase3d\.swarmReady && !chase3d\.swarmReady\(key\)\) return null;/);
  assert.match(main, /if \(e instanceof Meteor\) \{ put3D\('h1', e, e\.rot \|\| 0\); continue; \}/);
  assert.match(main, /if \(e instanceof Debris\) \{ put3D\('h2', e, e\.rot \|\| 0\); continue; \}/);
  assert.match(main, /if \(e instanceof Charger\) \{ put3D\('h3', e, 0\); continue; \}/);
  assert.match(main, /if \(e instanceof Mine\) \{ put3D\('h4', e, \(e\.t \|\| 0\) \* 1\.2\); continue; \}/);
});

test('HW-19: §G-20 2D↔3D 정합 3건 — 탄 색·크기 위계 / 레이저 가시성 / 차지 원형은 2D 전용', () => {
  const defs = readFileSync(new URL('../js/chase3d-prop-defs.js', import.meta.url), 'utf8');
  const ents = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
  // 드론 예광탄은 2D 에서 작다(2×8) — 3D 도 같은 위계로 배율을 싣는다
  assert.match(main, /sl\.buf\[sl\.n - 1\]\.mul = \(b\.kind === 'tracer'\) \? 0\.55 : 1;/);
  assert.match(main, /wx: 0, wy: 0, mul: 1/);
  assert.match(renderer, /const m2 = mul \* k2;/);
  // 레이저는 2D beamW\*2 대역 굵기여야 보인다(0.17 은 안 보였다)
  assert.match(defs, /laser: 0\.32 \}/);
  assert.match(defs, /missile: 22, laser: 26 \}/);
  // 3D 가 기함을 그리는 구간에서는 2D 차지 원·게이지 링을 그리지 않는다(단계 표시는 유지)
  assert.match(ents, /const flagIn3D = fsAlpha <= 0\.001;/);
  assert.match(ents, /if \(!flagIn3D\) \{/);
  const chargeBlock = ents.slice(ents.indexOf('// 차지 랜스 충전 표시'), ents.indexOf('// 파워/실드/무적 링'));
  assert.match(chargeBlock, /ctx\.fillText\('⚡' \+ stg/);   // 단계 표시는 3D 에서도 남는다
});
