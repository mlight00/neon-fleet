// ── §G-38 — 선로딩 2파 분리 (시작 직후 폴백 도형 노출 제거) ─────────────────────────────
//
//  이사님 제보(2026-08-12): "시작할 때 5각형 크리스탈이 날아온다."
//  그 오각형은 아트가 아니라 `entities.js` 의 **폴백 코드 도형**이다
//  (`getSprite('C1')` 이 null 일 때만 그려진다).
//
//  실측 원인 — dist 브라우저 resource timing:
//      nf2_prop_p1_crystal.webp : 요청 5123ms → 완료 6742ms (4,516 bytes 에 1,618ms)
//      마지막 아트 완료          : 10058ms
//  4.5KB 가 1.6초 걸린 것은 전송이 아니라 **큐 대기**다. 43개를 `Promise.all` 로 한꺼번에
//  던지면 브라우저는 호스트당 6개만 받고 나머지를 세운다.
//
//  → 출격 직후 보이는 것을 1파로 먼저 받는다. 총량은 같고 **순서만** 바뀐다.
//  ⚠️게임 로직·스폰·밸런스는 건드리지 않았다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { preloadWaves, SPRITE_SIZES, RASTER_ART, INSTANT_ART } from '../js/sprites.js';

test('G38-WAVES-COVER-ALL: 2파를 합치면 예전 CORE_PRELOAD 를 빠짐없이 덮는다', () => {
  const { first, rest, all } = preloadWaves();

  //  ① 중복 없음 — 같은 id 를 두 파에서 받으면 슬롯을 낭비한다.
  assert.equal(all.length, new Set(all).size,
    `1파·2파에 중복 id 가 있다 — ${all.filter((v, i) => all.indexOf(v) !== i).join(', ')}`);
  assert.equal(all.length, first.length + rest.length, '합계 = 1파 + 2파');

  //  ② 예전 목록이 전부 들어 있는가. **여기서 목록을 다시 적지 않는다** — 패턴으로 유도한다.
  const expected = new Set([
    'A1','A2','A3','A4','A5','A6',
    'B1','B2','B3','B4','B5','B6','C1','C2','C3','C4','C5',
    'B16','B17','B18','B19','B20','B21',
    'H2_BASE_FRAME','H2_ASSAULT','H2_CARRIER',
    ...Object.keys(SPRITE_SIZES).filter((id) =>
      id.startsWith('MOUNT_') || id.startsWith('PROJ_') || id.startsWith('VFX_') || id.startsWith('PROP_')),
  ]);
  const have = new Set(all);
  const missing = [...expected].filter((id) => !have.has(id));
  assert.deepEqual(missing, [], `분리하면서 빠뜨린 id: ${missing.join(', ')}`);
});

test('G38-FIRST-WAVE-HAS-PICKUPS: 이번 제보 대상(C1·C5)이 1파에 있고 앞순번이다', () => {
  const { first } = preloadWaves();

  //  ① 픽업이 1파에 있어야 한다 — 이게 빠지면 제보가 그대로 재현된다.
  assert.ok(first.includes('C1'), '크리스탈 픽업(C1)이 1파에 없다 — 시작 직후 폴백 오각형이 다시 보인다');
  assert.ok(first.includes('C5'), '보급 수송선(C5)이 1파에 없다');
  //  ② 기함 선체 — 출격 순간부터 화면에 있다.
  assert.ok(first.includes('H2_BASE_FRAME'), '2D 기함 선체가 1파에 없다');

  //  ③ ⭐**앞순번**이어야 실효가 있다. 브라우저는 호스트당 6개만 동시에 받는다 —
  //   1파 안에서도 7번째 뒤로 밀리면 다시 큐에서 기다린다.
  const BROWSER_PARALLEL = 6;
  for (const id of ['H2_BASE_FRAME', 'C1', 'C5']) {
    const at = first.indexOf(id);
    assert.ok(at < BROWSER_PARALLEL,
      `${id} 가 1파의 ${at + 1}번째다 — 동시 연결 ${BROWSER_PARALLEL}개 안에 들어야 즉시 받는다`);
  }
});

test('G38-FIRST-WAVE-SMALL: 1파가 2파보다 크면 분리의 의미가 없다', () => {
  const { first, rest } = preloadWaves();
  //  1파는 "먼저 받을 것"이지 "대부분"이 아니다. 절반을 넘으면 큐 대기가 그대로 재현된다.
  assert.ok(first.length <= rest.length + 5,
    `1파 ${first.length} · 2파 ${rest.length} — 1파가 지나치게 크면 다시 6슬롯 경합이 된다`);
});

test('G38-WAVE-IDS-RESOLVE: 두 파의 모든 id 가 실제 경로를 가진다(오타 id 차단)', () => {
  //  ⚠️목록에 오타를 적으면 조용히 아무것도 안 받는다 — 폴백이 영구히 보인다.
  //   `loadSprite` 는 경로가 없으면 null 을 캐시하고 끝낸다(예외 없음).
  const { all } = preloadWaves();
  const paths = RASTER_ART.C || {};
  const noPath = all.filter((id) => !paths[id]);
  assert.deepEqual(noPath, [],
    `경로가 없는 선로딩 id (오타이거나 경로맵 누락): ${noPath.join(', ')}`);
});

test('G38-HTML-PRELOAD-MATCHES: index.html 의 preload 링크가 INSTANT_ART 와 정확히 일치', async () => {
  //  ⚠️HTML 에 경로를 손으로 적었다 — 사본이다. 사본은 반드시 대조해야 한다.
  //   경로맵이 바뀌었는데 HTML 이 옛 경로를 preload 하면, 브라우저가 **쓰지도 않을 파일을**
  //   최우선으로 받고 정작 필요한 것은 늦는다. 조용히 느려지는 종류의 회귀다.
  const { readFileSync } = await import('node:fs');
  const { INSTANT_ART, RASTER_ART } = await import('../js/sprites.js');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

  const want = INSTANT_ART.map((id) => {
    const p = (RASTER_ART.C || {})[id];
    assert.ok(p, `INSTANT_ART 의 ${id} 에 경로가 없다`);
    return p;
  });
  const got = [...html.matchAll(/<link\s+rel="preload"[^>]*href="([^"]+)"/g)].map((m) => m[1]);

  assert.deepEqual(got, want,
    `index.html preload 링크가 INSTANT_ART 와 다르다.\n  HTML: ${got.join(', ')}\n  기대: ${want.join(', ')}`);
  //  작게 유지 — preload 끼리 경합하면 의미가 없다.
  assert.ok(want.length <= 6, `preload 는 6개 이하로 — 실측 ${want.length}개`);
  //  순서: main.js 보다 **앞**에 있어야 파싱 단계에서 먼저 시작된다.
  assert.ok(html.indexOf('rel="preload"') < html.indexOf('js/main.js'), 'preload 는 main.js 앞에 와야 한다');
  assert.ok(html.indexOf('js/preload-boot.js') < html.indexOf('js/main.js'), 'boot 모듈도 main.js 앞');
});

test('G38-PRELOAD-PRIORITY: preload 링크에 fetchpriority="high" 가 붙어 있다', async () => {
  //  ⚠️이게 없으면 preload 는 **효과가 거의 없다.** Chrome 은 `as="image"` preload 를 기본 Low 로,
  //   모듈 스크립트를 High 로 잡는다 → JS 56개(1.06MB) 뒤에서 굶는다.
  //  실측(같은 환경):
  //      fetchpriority 없음 : A2.webp 완료 5,315ms (모든 JS 완료 5,316ms 와 동시)
  //      fetchpriority=high : A2.webp 완료   388ms
  const { readFileSync } = await import('node:fs');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const links = [...html.matchAll(/<link\s+rel="preload"[^>]*>/g)].map((m) => m[0]);
  assert.ok(links.length > 0, 'preload 링크가 있어야 한다');
  const noPri = links.filter((l) => !/fetchpriority="high"/.test(l));
  assert.deepEqual(noPri, [],
    `fetchpriority="high" 가 빠진 preload 링크: ${noPri.join(' | ')}`);
});

test('G41-INSTANT-HAS-PROJECTILES: 시작 무기 3종의 볼트 아트가 최우선 목록에 있다', async () => {
  //  이사님 제보(2026-08-13): "레이저 무기 선택하고 출격하면 레이저가 예전 형태로 나온다".
  //  §G-38 이 INSTANT_ART 에 기함·픽업·적만 넣고 **발사체를 빠뜨렸다.**
  //  실측: 크리스탈(preload 걸림) 664ms 완료 vs 레이저 볼트 **7,199ms** — 그 사이 폴백 도형이 그려졌다.
  //  ⚠️출격하면 **첫 프레임부터** 쏜다. 적보다 볼트가 먼저 필요하다.
  const { INSTANT_ART } = await import('../js/sprites.js');
  const { weaponProjectileSpriteId } = await import('../js/ships.js');

  //  ⚠️id 를 손으로 적지 않는다 — 제품 함수가 주는 값을 그대로 쓴다(경로맵이 바뀌면 같이 따라간다).
  for (const weapon of ['vulcan', 'laser', 'homing']) {
    const id = weaponProjectileSpriteId(weapon, null, null);
    assert.ok(INSTANT_ART.includes(id),
      `시작 무기 '${weapon}' 의 기본 볼트 ${id} 가 INSTANT_ART 에 없다 — 출격 직후 폴백 도형이 보인다`);
  }
});

test('G41-INSTANT-STAYS-SMALL: 최우선 목록이 커지면 서로 슬롯을 다툰다', () => {
  //  ⚠️브라우저는 호스트당 6개만 동시에 받는다. preload 를 늘리면 정작 급한 것이 밀린다.
  //   실측 근거: A1~A3 를 넣었을 때 그 셋이 6.4초까지 밀렸다(§G-37 QA).
  const { first } = preloadWaves();
  assert.ok(INSTANT_ART.length <= 6, `INSTANT_ART 는 6개 이하여야 한다 — 실측 ${INSTANT_ART.length}개`);
  //  최우선에 넣은 것은 1파에도 반드시 있어야 한다(2파로 밀리면 preload 가 헛돈다).
  for (const id of INSTANT_ART) {
    assert.ok(first.includes(id), `${id} 가 INSTANT_ART 에 있는데 1파(FIRST_CONTACT)에 없다`);
  }
});
