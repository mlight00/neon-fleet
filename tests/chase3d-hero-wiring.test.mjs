import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chase3dLabTarget } from '../js/chase3d-config.js';

// Opus5 §12.4 hero 하이브리드 배선 — 소스 정적 계약. 실동작(교차·자원·loss)은 브라우저 QA(보고서 §12) 실측.
const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../js/chase3d-renderer.js', import.meta.url), 'utf8');
const entities = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
const chaseRender = readFileSync(new URL('../js/chase-render.js', import.meta.url), 'utf8');

test('HW-01: hero 가 기본 — createChase3D(canvas3d, { hero, propsEnabled })', () => {
  assert.match(main, /createChase3D\(canvas3d, \{ hero: !CHASE3D_TEST, propsEnabled: CHASE3D_PROPS \}\)/);
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
  assert.match(renderer, /import \{ ENEMY3D \} from '\.\/chase3d-prop-defs\.js'/);
  assert.match(renderer, /for \(const k of Object\.keys\(ENEMY3D\)\) eswarm\[k\] = makeBillboardSwarm\(k, ENEMY3D\[k\]\.cap\)/);
  assert.match(renderer, /function placeSwarm\(sw, buf, n, cap, mode = 'wob', time = 0, yawBase = Math\.PI\)/);
  assert.match(renderer, /\.unproject\(camera\)/);
  assert.match(renderer, /if \(sk\) placeSwarm\(eswarm\[k\], sk\.buf, sk\.n, ENEMY3D\[k\]\.cap, 'wob', 0\)/);   // t≥0.5 도달 지점에서만 = 하드 컷 공유
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
  assert.match(renderer, /\(k === 'pbullet' \|\| k === 'ebullet' \|\| k === 'missile' \|\| k === 'laser'\) \? 'direct' : 'spin'/);   // 탄=진행각, 픽업=스핀
  // main: 레이저 랜스도 3D 수집(공명 레일만 2D 전용 렌더 유지), 발사체는 원본색(흰색 — 2D 도 원색 blit)
  assert.match(main, /if \(b\.dead \|\| b\.resonanceId\) continue;/);
  assert.match(main, /b\.kind === 'laser' \? 'laser' : b instanceof HomingMissile \? 'missile' : 'pbullet'/);
  assert.match(main, /putProp\(key, b, p, 0xffffff/);
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

test('HW-12: Codex 검토 반영 — 소품 3D 기본 OFF 게이트 + sidecar 무오염 + 진단 확장', () => {
  // 이사 실기 "무기·크리스탈·수송함 엉망" + Codex "가독성 A/B 통과 전 2D 유지" → 소품 3D 는 chase3dProps=1 개발 전용.
  const cfg = readFileSync(new URL('../js/chase3d-config.js', import.meta.url), 'utf8');
  assert.match(cfg, /export function chase3dPropsEnabled\(search = ''\)/);
  assert.match(cfg, /p\.get\('chase3d'\) === '1' && p\.get\('chase3dProps'\) === '1'/);
  assert.match(main, /const CHASE3D_PROPS = chase3dPropsEnabled\(location\.search\)/);
  assert.match(main, /if \(!CHASE3D_PROPS\) continue;/);      // 픽업 수집 게이트
  assert.match(main, /if \(CHASE3D_PROPS\) \{/);              // 탄 수집 게이트
  // sidecar: 렌더 상태가 게임 객체에 기록되지 않는다(회귀 방지)
  assert.match(main, /const _in3dMap = new WeakMap\(\)/);
  assert.ok(!/\._in3d\b/.test(main), 'main 에 게임 객체 _in3d 필드 없음');
  assert.ok(!/_in3d/.test(entities), 'entities 에 _in3d 없음');
  // 진단: 확장 범위를 따라간다(b4·소품 count)
  assert.match(renderer, /Object\.keys\(ENEMY3D\)\.map\(\(k\) => \[k \+ 'Count', eswarm\[k\] \? eswarm\[k\]\.count : -1\]\)/);
  assert.match(renderer, /propCounts: props \? Object\.fromEntries\(PROP_KEYS\.map/);
  // Codex 재검토 P2-1: 소품 OFF = GPU 자원 생성까지 OFF(표시만 OFF 금지)
  const propBlock = renderer.slice(renderer.indexOf('let props = null;'), renderer.indexOf('/** 셰이더 프리웜'));
  assert.match(propBlock, /if \(opts\.propsEnabled\) \{/);
  assert.ok(propBlock.indexOf('if (opts.propsEnabled) {') < propBlock.indexOf('createPropMaterial(THREE)'), '재질·지오메트리 생성이 게이트 안');
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
  const guard = main.lastIndexOf("if (['aurora', 'b1', 'b2', 'b4', 'b5', 'b6', 'allies', 'pickups', 'swarm'].includes(CHASE3D_LAB))", i);
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
