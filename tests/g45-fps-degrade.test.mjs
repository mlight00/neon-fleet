// §G-45 — 저FPS 일 때 3D 를 끄기 전에 품질을 낮춘다(이사 결정 2026-08-14).
//
// 회귀 배경: 지속 저FPS 한 번이면 chase3d 를 버리고 _c3dPhase=4 로 잠갔다.
// 그 판이 끝날 때까지 3D 가 돌아오지 않아, 스테이지 3 부근에서 기함이 2D 로 굳었다(실기 확정 reason:'low-fps').
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFpsGuard, degradeProfile, performanceProfileForViewport, QUALITY } from '../js/chase3d-config.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('사다리: 데스크톱은 픽셀비율 → LOD 순으로 내려가고 바닥에서 null', () => {
  let p = performanceProfileForViewport(1920, 1080);
  assert.equal(p.pixelRatioCap, QUALITY.PIXEL_RATIO_DESKTOP);
  assert.equal(p.lod, 0);

  const seen = [];
  for (let i = 0; i < 10; i++) {
    const next = degradeProfile(p);
    if (!next) break;
    seen.push([next.pixelRatioCap, next.lod]);
    p = next;
  }
  assert.deepEqual(seen, [[1.0, 0], [0.85, 1], [0.7, 1]], '데스크톱 사다리가 예상과 다르다');
  assert.equal(degradeProfile(p), null, '바닥에서 null 이어야 2D 로 접는다');
});

test('사다리는 단조 감소한다 — 무한 루프가 불가능하다', () => {
  for (const w of [1920, 1280, 820, 390]) {
    let p = performanceProfileForViewport(w, 800);
    let prevPx = Infinity, prevLod = -1, n = 0;
    while (true) {
      const next = degradeProfile(p);
      if (!next) break;
      assert.ok(n++ < 20, `폭 ${w}: 사다리가 끝나지 않는다`);
      //  픽셀비율이 내려가거나, 같은 값이면 LOD 가 올라가야 한다(= 품질이 실제로 내려감)
      const improved = next.pixelRatioCap < p.pixelRatioCap || next.lod > p.lod;
      assert.ok(improved, `폭 ${w}: 품질이 실제로 내려가지 않았다`);
      prevPx = next.pixelRatioCap; prevLod = next.lod; p = next;
    }
    assert.ok(n >= 1, `폭 ${w}: 낮출 여지가 한 칸도 없다`);
  }
});

test('판정 기준(minFps)과 mobile 은 강등해도 그대로다', () => {
  //  기준까지 같이 내리면 사다리가 무의미해진다 — 항상 통과해 버린다.
  let p = performanceProfileForViewport(1920, 1080);
  const { minFps, mobile } = p;
  for (let i = 0; i < 5; i++) {
    const next = degradeProfile(p);
    if (!next) break;
    assert.equal(next.minFps, minFps, 'minFps 가 바뀌었다');
    assert.equal(next.mobile, mobile, 'mobile 이 바뀌었다');
    p = next;
  }
});

test('가드 reset(): 품질을 낮춘 뒤 다시 잴 수 있다', () => {
  const g = createFpsGuard({ minFps: 45 });
  const dt = 1000 / 30;   // 30fps — 기준 미달
  let tripped = false;
  for (let t = 0; t < 20000 && !tripped; t += dt) tripped = g.sample(dt, true, false);
  assert.ok(tripped, '30fps 인데 걸리지 않았다');
  assert.equal(g.tripped, true);

  g.reset();
  assert.equal(g.tripped, false, 'reset 후에도 latch 가 걸려 있다');
  assert.equal(g.strikes, 0);
  assert.equal(g.warmedUp, false, 'reset 은 warm-up 도 되돌려야 한다(픽셀비율 변경 직후 프레임은 표본이 아니다)');

  //  reset 뒤 좋은 프레임이면 다시 걸리지 않는다
  const good = 1000 / 60;
  let again = false;
  for (let t = 0; t < 20000 && !again; t += good) again = g.sample(good, true, false);
  assert.equal(again, false, 'reset 뒤 60fps 인데 다시 걸렸다');
});

test('전체 시나리오: 저FPS 가 계속돼도 사다리 칸 수만큼 버틴 뒤에야 2D', () => {
  //  main.js 의 루프를 그대로 흉내낸다 — 걸릴 때마다 한 칸 낮추고 reset, 바닥이면 포기.
  let profile = performanceProfileForViewport(1920, 1080);
  const g = createFpsGuard({ minFps: profile.minFps });
  const dt = 1000 / 25;   // 계속 25fps
  let degrades = 0, gaveUp = false;
  for (let t = 0; t < 300000; t += dt) {
    if (!g.sample(dt, true, false)) continue;
    const next = degradeProfile(profile);
    if (next) { profile = next; g.reset(); degrades++; }
    else { gaveUp = true; break; }
  }
  assert.equal(degrades, 3, '데스크톱은 3칸 낮춘 뒤에 포기해야 한다');
  assert.ok(gaveUp, '바닥까지 갔는데 2D 로 접지 않았다');
  assert.equal(profile.qualityStep, 3);
});

test('main.js 가 강등 경로를 실제로 쓴다 — 즉시 dispose 로 되돌아가지 않았는가', () => {
  const src = readFileSync(join(ROOT, 'js/main.js'), 'utf8');
  const i = src.indexOf('_c3dFps.sample(');
  assert.notEqual(i, -1, 'FPS 가드 호출부를 찾지 못했다');
  const block = src.slice(i, i + 1400);
  assert.ok(/degradeProfile\s*\(/.test(block), 'sample() 분기에서 degradeProfile 을 부르지 않는다');
  assert.ok(/_c3dFps\.reset\s*\(/.test(block), '강등 후 reset 을 부르지 않는다 — 다시 재지 못한다');
  //  강등 없이 곧장 버리면 이 회귀가 되살아난다
  assert.ok(/더 낮출 품질 없음/.test(block), 'dispose 가 "사다리 소진" 분기에 있지 않다');
  assert.ok(/degradeProfile/.test(src.slice(0, src.indexOf('\n', src.indexOf('chase3d-config.js')))),
    'degradeProfile 을 import 하지 않았다');
});

test('프로필을 갈아끼우지 않고 값만 바꾼다 — 렌더러가 같은 객체를 붙잡고 있다', () => {
  const src = readFileSync(join(ROOT, 'js/main.js'), 'utf8');
  const i = src.indexOf('_c3dFps.sample(');
  const block = src.slice(i, i + 1400);
  //  `PERF_PROFILE = next` 로 대입하면 renderer 의 ctl._profile 은 옛 객체라 화면이 안 바뀐다.
  assert.ok(/Object\.assign\(PERF_PROFILE/.test(block), 'PERF_PROFILE 을 Object.assign 으로 갱신하지 않는다');
  assert.ok(!/^\s*PERF_PROFILE\s*=/m.test(block), 'PERF_PROFILE 을 재대입하고 있다(렌더러에 반영되지 않는다)');
});

test('렌더러가 품질을 매 프레임 읽는다 — 런타임 변경이 실제로 먹는 전제', () => {
  //  이 전제가 깨지면(생성 시 1회만 읽도록 바뀌면) 강등이 조용히 무효가 된다.
  const r = readFileSync(join(ROOT, 'js/chase3d-renderer.js'), 'utf8');
  assert.ok(/ctl\._profile\.pixelRatioCap/.test(r), '렌더러가 _profile.pixelRatioCap 을 읽지 않는다');
  assert.ok(/setLOD\(ctl\._profile\.lod\)/.test(r), '렌더러가 매 프레임 _profile.lod 로 LOD 를 설정하지 않는다');
});
