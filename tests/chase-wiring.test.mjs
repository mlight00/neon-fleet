import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectObject, createChaseProjection } from '../js/chase-camera.js';

const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
const ent = readFileSync(new URL('../js/entities.js', import.meta.url), 'utf8');
const chaseCam = readFileSync(new URL('../js/chase-camera.js', import.meta.url), 'utf8');
const chaseRender = readFileSync(new URL('../js/chase-render.js', import.meta.url), 'utf8');
const ui = readFileSync(new URL('../js/ui.js', import.meta.url), 'utf8');

// §13 렌더·규칙 불변 계약(소스 배선 + 순수성). 실동작 투영은 chase-camera/chase-render 테스트가 검증.

// 16/17. draw 경로 분리: chaseBlend>0=개체별 투영, 아니면 기존 전술 global transform 유지
test('CW2-16: draw가 chaseBlend로 전술/추적 경로를 분기', () => {
  assert.match(main, /const useChase = state === 'play' && chase\.current > 0\.001;/);
  assert.match(main, /drawWorldProjected\(ctx, r, chaseProj/);
  // 전술(else) 경로의 기존 global transform 보존
  assert.match(main, /ctx\.scale\(camera\.current, camera\.current\);/);
});

// 프레임에서 chaseBlend 별도 보간
test('CW2-adv: frame이 chaseBlend를 별도 보간(줌 기준)', () => {
  assert.match(main, /chase\.target = chaseBlendForZoom\(camera\.current\)/);
  assert.match(main, /chase\.current = advanceChaseBlend\(chase\.current, chase\.target, dt, prefersReducedMotion\(\)\)/);
});

// 19. HUD·전체 화면 플래시는 추적 미적용(공통, 분기 밖)
test('CW2-19: effects.drawScreen은 분기 밖 공통(추적에도 고정)', () => {
  const draw = main.slice(main.indexOf('function draw()'));
  const ds = (draw.match(/r\.effects\.drawScreen\(hctx, LOGICAL_W, logicalH\)/g) || []).length;   // hctx=base에선 ctx
  assert.equal(ds, 1, 'drawScreen은 한 번(분기 공통) — 추적/전술 모두 카메라 밖 고정');
});

// 15. C 토글 배선
test('CW2-15: 키보드 C가 추적 시점 토글', () => {
  assert.match(main, /e\.key === 'c' \|\| e\.key === 'C'.*toggleChaseView\(\)/);
  assert.match(main, /function toggleChaseView\(\) \{[\s\S]{0,200}camera\.target >= CHASE_FULL_ZOOM \? DEFAULT_ZOOM : MAX_ZOOM/);
});

// 일시정지 추적 버튼 배선 + 영어/한국어 aria
test('CW2-pause: 일시정지 추적 버튼 + aria(EN/KO)', () => {
  assert.match(main, /onToggleChase: \(\) => toggleChaseView\(\)/);
  assert.match(ui, /id="btn-chase-view"/);
  assert.match(ui, /Pursuit View|함미 추적 시점/);
  assert.match(ui, /Tactical View|전술 시점/);
});

// 화면 밖 위험 경고 호출
test('CW2-warn: 화면 밖 위험 경고를 추적 시점에 그림', () => {
  assert.match(main, /drawEdgeWarnings\(hctx, r, chaseProj\)/);   // hctx=base에선 ctx(3D 시 HUD 계층)
  assert.match(main, /collectEdgeWarnings\(r, proj/);
});

// 20. entities effects가 투영 렌더 지원(긴 것 아닌 파티클·텍스트 개별 투영)
test('CW2-20: effects.drawWorldProjected(개체별 투영) 존재', () => {
  assert.match(ent, /drawWorldProjected\(ctx, project, minTextPx = 10\)/);
});

// 27. 카메라 모듈을 전투 로직 모듈이 import하지 않음 + 카메라 모듈이 전투/게임 상태를 import하지 않음
test('CW2-27: chase 카메라/렌더가 전투 로직을 import하지 않음(규칙 불변 경계)', () => {
  // chase-camera는 아무 것도 import하지 않음(순수)
  assert.ok(!/^\s*import /m.test(chaseCam), 'chase-camera.js는 import 없음(순수)');
  // chase-render는 chase-camera만 import(전투/월드 모듈 금지)
  const imports = [...chaseRender.matchAll(/from '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual(imports, ['./chase-camera.js'], `chase-render imports=${imports}`);
  for (const bad of ['collision', 'logic', 'balance', 'entities', 'run-director', 'survivability']) {
    assert.ok(!chaseCam.includes(`./${bad}`), `chase-camera가 ${bad} 미참조`);
    assert.ok(!chaseRender.includes(`./${bad}.js`), `chase-render가 ${bad} 미참조`);
  }
});

// 25/26 근사: projectObject는 입력을 변형하지 않고 새 결과만 반환(월드 상태 불변 — 카메라는 읽기 전용)
test('CW2-25: 투영은 순수 — 입력 점을 변형하지 않음(월드 좌표 불변)', () => {
  const p = createChaseProjection({ zoom: 2.2, chaseBlend: 1, squadX: 240, squadY: 660, logicalW: 480, logicalH: 800 });
  const point = { x: 123, y: 456 };
  const before = { ...point };
  const out = projectObject(point, 'enemy', p);
  assert.deepEqual(point, before, '입력 점 불변');
  assert.notStrictEqual(out, point, '새 객체 반환');
  assert.ok(Number.isFinite(out.x) && Number.isFinite(out.y) && Number.isFinite(out.scale));
});

// 저장 마이그레이션 배선(구 축소값 → 100%)은 camera-zoom safeZoom(CZ-05)·save(CS)로 검증됨을 상호참조
test('CW2-save: view.zoom 저장 키 유지(추적 여부 별도 불리언 저장 안 함)', () => {
  assert.match(main, /zoom: safeZoom\(camera\.target\)/);      // 목표 배율만 저장
  assert.ok(!/chaseView:\s*(true|false)|view\.chase/.test(main), '추적 여부를 별도로 저장하지 않음(zoom으로 결정)');
});
