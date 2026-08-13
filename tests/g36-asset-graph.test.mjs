// ── §G-36 §3-3 — asset graph fixture 테스트 ──
//
//  Codex 7차 §3: G35 의 동적 게이트는 `dynamic.filter((d) => !declared.size)` 였다.
//  `declared.size` 가 75 라 **항상 false** → 어떤 미등록 동적 경로도 통과했다(전역 허용 버그).
//  "현재 우연히 빠진 게 없다"를 확인하는 것만으로는 이 결함을 절대 못 잡는다
//  → **문자열 fixture** 로 수집기 자체의 규칙을 검증한다.
import test from 'node:test';
import assert from 'node:assert/strict';

import { scanSource, stripComments, matchDynamics, buildAssetGraph, createCrazyGamesAssetFamilies, setNodeFs } from '../scripts/lib/asset-graph.mjs';

//  §G-37: `source` 는 **실제 매칭 조건**이다(설명 문자열이 아니다) — 기본은 fixture 의 소스 파일명.
const fam = (id, rx, entries = ['assets/x/1.webp'], source = 'fixture.js') => ({
  id, source, why: 'fixture', matches: (e) => rx.test(e), entries,
});

test('G36-ASSET-STATIC: 따옴표 3종 · 확장자 무관 · CSS url() · HTML src/href 를 모두 잡는다', () => {
  const src = [
    "const a = 'assets/a/one.webp';",
    'const b = "assets/b/two.png";',
    'const c = `assets/c/three.glb`;',            // 정적 백틱
    "const d = 'assets/d/four.ogg';",
    "const e = 'assets/e/five.woff2';",
    "const f = 'assets/f/six.txt';",
    "const g = 'assets/g/seven.jpg';",
  ].join('\n');
  const { statics } = scanSource(src);
  for (const want of ['assets/a/one.webp', 'assets/b/two.png', 'assets/c/three.glb',
    'assets/d/four.ogg', 'assets/e/five.woff2', 'assets/f/six.txt', 'assets/g/seven.jpg']) {
    assert.ok(statics.includes(want), `${want} 를 찾아야 한다 — 실측 ${JSON.stringify(statics)}`);
  }

  const css = '.a { background: url(assets/css/bg.webp); } .b{background:url("assets/css/b2.png")}';
  const cs = scanSource(css).statics;
  assert.ok(cs.includes('assets/css/bg.webp') && cs.includes('assets/css/b2.png'), `CSS url() — ${JSON.stringify(cs)}`);

  const html = '<img src="assets/html/i.webp"><link href="assets/html/s.css">';
  const hs = scanSource(html).statics;
  assert.ok(hs.includes('assets/html/i.webp') && hs.includes('assets/html/s.css'), `HTML src/href — ${JSON.stringify(hs)}`);
});

test('G36-ASSET-COMMENT: 주석 속 가짜 경로는 제외하고, 문자열 안 `//` 는 손상시키지 않는다', () => {
  //  실제 사고: 벤더 GLTFLoader 주석의 `url = 'assets/models/model.gltf'` 가 "누락"으로 잡혔다.
  const src = [
    "// 예시: const x = 'assets/fake/line.webp';",
    "/* 블록 주석 'assets/fake/block.png' */",
    "const real = 'assets/real/ok.webp';",
    "const url = 'https://cdn.example.com/x';",     // 문자열 안 `//` — 손상되면 뒤 참조를 놓친다
    "const after = 'assets/real/after.webp';",
  ].join('\n');
  const { statics } = scanSource(src);
  assert.ok(statics.includes('assets/real/ok.webp'), '주석 밖 참조는 잡는다');
  assert.ok(statics.includes('assets/real/after.webp'), '문자열 안 `//` 뒤의 참조도 잡는다');
  assert.ok(!statics.includes('assets/fake/line.webp'), '줄 주석 속 가짜 경로 제외');
  assert.ok(!statics.includes('assets/fake/block.png'), '블록 주석 속 가짜 경로 제외');
  //  stripComments 가 URL 을 통째로 날리지 않는지 직접 확인.
  assert.ok(stripComments("const u = 'https://a.b/c';").includes('https://a.b/c'), 'URL 보존');
});

test('G36-ASSET-DYNAMIC-UNREGISTERED: **미등록 동적 경로는 반드시 실패한다**', () => {
  //  ⭐이 파일의 존재 이유. G35 는 여기서 통과했다.
  const families = [fam('sfx', /^assets\/sound\//)];
  const { problems } = matchDynamics([{ expr: 'assets/new/${id}.webp', file: 'fixture.js' }], families);
  assert.equal(problems.length, 1, `미등록 표현은 문제로 잡혀야 한다 — 실측 ${JSON.stringify(problems)}`);
  assert.match(problems[0].reason, /family 없음/, `사유가 명확해야 한다 — ${problems[0].reason}`);
});

test('G36-ASSET-DYNAMIC-OTHER-FAMILY: 다른 family 가 등록돼 있어도 미등록 표현은 통과 못 한다', () => {
  //  ⭐G35 버그의 정확한 형태: `declared.size > 0` 이면 전부 통과했다.
  const families = [
    fam('sfx', /^assets\/sound\//, ['assets/sound/a.ogg']),
    fam('bg', /^assets\/remodel-v2\/backgrounds\//, ['assets/remodel-v2/backgrounds/s1.webp']),
  ];
  const { resolved, problems } = matchDynamics([
    { expr: 'assets/sound/${id}.ogg', file: 'fixture.js' },      // 등록됨 → 통과
    { expr: 'assets/new-family/${id}.webp', file: 'fixture.js' }, // 미등록 → 실패
  ], families);
  assert.equal(resolved.length, 1, '등록된 표현 1건만 해결');
  assert.equal(problems.length, 1, `미등록 1건은 반드시 남는다 — 실측 ${JSON.stringify(problems)}`);
  assert.equal(problems[0].file, 'fixture.js');
});

test('G36-ASSET-DYNAMIC-AMBIGUOUS: 두 family 가 매칭되면 모호성으로 실패', () => {
  const families = [fam('a', /^assets\/shared\//), fam('b', /^assets\/shared\//)];
  const { problems } = matchDynamics([{ expr: 'assets/shared/${id}.webp', file: 'fixture.js' }], families);
  assert.equal(problems.length, 1);
  assert.match(problems[0].reason, /모호/, `모호성으로 실패해야 한다 — ${problems[0].reason}`);
});

test('G36-ASSET-DYNAMIC-EMPTY-ENTRIES: family 는 있지만 entries 가 비면 실패', () => {
  //  G35 는 remodel/styleC 를 `list: []` 로 두고 "해결했다"고 했다 — 증거가 아니다.
  const families = [fam('empty', /^assets\/x\//, [])];
  const { problems } = matchDynamics([{ expr: 'assets/x/${id}.webp', file: 'fixture.js' }], families);
  assert.equal(problems.length, 1);
  assert.match(problems[0].reason, /entries 가 비어/, problems[0].reason);
});

test('G36-ASSET-DYNAMIC-REGISTERED: 등록된 family 는 통과하고 실제 파일 목록을 돌려준다', () => {
  const entries = ['assets/sound/a.ogg', 'assets/sound/b.ogg'];
  const families = [fam('sfx', /^assets\/sound\//, entries)];
  const g = buildAssetGraph(
    [{ rel: 'fixture.js', src: 'fetch(`assets/sound/nf_${id}_${n}.ogg`)' }], families);
  assert.equal(g.problems.length, 0, `문제 없어야 한다 — ${JSON.stringify(g.problems)}`);
  assert.equal(g.resolved.length, 1, '동적 표현 1건 해결');
  assert.deepEqual(g.familyEntries.sort(), entries.sort(), 'family 가 열거한 실제 파일이 나온다');
});

test('G36-ASSET-GRAPH-PRODUCTION: 실제 빌드가 쓰는 family 로 동적 표현이 전부 해결된다', async () => {
  //  fixture 만으로 끝내지 않는다 — 제품의 실제 5개 동적 표현이 지금도 매칭되는지 본다.
  const { readFileSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const ROOT = fileURLToPath(new URL('..', import.meta.url));
  const sprites = await import('../js/sprites.js');
  const zone = await import('../js/zone-backdrop.js');
  //  §G-37 §1-2: 테스트가 family 를 **다시 적지 않는다**. 빌드가 쓰는 그 factory 를 그대로 부른다.
  //  ⚠️여기서 복사본을 쓰면 "테스트는 통과, 패키지에는 누락" 이 다시 가능해진다.
  setNodeFs(await import('node:fs'));
  const families = createCrazyGamesAssetFamilies({ root: ROOT, sprites, zone });
  assert.deepEqual(families.map((f) => f.id).sort(),
    ['raster-final-map', 'sector-backgrounds', 'sfx'], '제품 family 3종');
  for (const f of families) {
    assert.ok(f.entries.length > 0, `family ${f.id} 는 실제 파일을 열거해야 한다`);
    assert.ok(Array.isArray(f.source) && f.source.length > 0, `family ${f.id} 는 source 를 강제해야 한다`);
  }
  const srcs = ['js/audio.js', 'js/sprites.js', 'js/zone-backdrop.js']
    .map((rel) => ({ rel, src: readFileSync(join(ROOT, rel), 'utf8') }));
  const g = buildAssetGraph(srcs, families);
  assert.equal(g.problems.length, 0,
    `제품의 동적 표현이 전부 해결돼야 한다 — 실측 ${JSON.stringify(g.problems)}`);
  assert.ok(g.dynamics.length >= 5, `동적 표현이 5개 이상 잡혀야 한다 — 실측 ${g.dynamics.length}`);
});

// ── §G-37 §1-5 — graph 결과를 **실제 manifest·복사·dist 검증**까지 연결 ──
//  Codex 8차 §2: helper 가 `familyEntries` 를 돌려줘도 빌드는 `statics` 만 add 했다.
//  SFX·배경이 패키지에 있던 건 앞선 수동 규칙 (b)(c)(e) 가 우연히 넣어서였다.

test('G37-ASSET-SOURCE-MISMATCH: 다른 파일의 같은 폴더 표현은 family 로 통과하지 못한다', async () => {
  //  G36 은 `source` 를 설명 문자열로만 뒀다 → `js/not-audio.js` 의 SFX 표현도 sfx family 로 통과했다.
  const { familyAcceptsSource } = await import('../scripts/lib/asset-graph.mjs');
  const sfx = fam('sfx', /^assets\/sound\//, ['assets/sound/a.ogg'], 'js/audio.js');
  assert.equal(familyAcceptsSource(sfx, 'js/audio.js'), true, '선언한 소스는 통과');
  assert.equal(familyAcceptsSource(sfx, 'js/not-audio.js'), false, '다른 파일은 거부');

  const { problems, resolved } = matchDynamics([
    { expr: 'assets/sound/${id}.ogg', file: 'js/audio.js' },
    { expr: 'assets/sound/${id}.ogg', file: 'js/not-audio.js' },
  ], [sfx]);
  assert.equal(resolved.length, 1, 'audio.js 것만 해결');
  assert.equal(problems.length, 1, `not-audio.js 는 문제로 남는다 — ${JSON.stringify(problems)}`);
  assert.equal(problems[0].file, 'js/not-audio.js');

  //  경로 구분자가 달라도 같은 파일로 본다(Windows).
  //  Windows 경로. 소스에 역슬래시를 직접 쓰면 편집 도구마다 이스케이프가 달라지므로 문자 코드로 만든다.
  const winPath = 'js' + String.fromCharCode(92) + 'audio.js';
  assert.equal(familyAcceptsSource(sfx, winPath), true, '역슬래시 정규화: ' + JSON.stringify(winPath));
});

test('G37-ASSET-FAMILY-EMITTED-TO-MANIFEST: 새 family entry 가 **수동 add 없이** 레코드에 들어간다', async () => {
  //  ⭐이 파일의 새 핵심. G36 은 여기서 통과했지만 빌드 매니페스트에는 안 들어갔다.
  const { buildAssetGraph, toAssetRecords } = await import('../scripts/lib/asset-graph.mjs');
  const families = [fam('new-family', /^assets\/new\//, ['assets/new/a.webp', 'assets/new/b.webp'], 'js/new.js')];
  const g = buildAssetGraph([{ rel: 'js/new.js', src: 'const u = `assets/new/${id}.webp`;' }], families);
  assert.equal(g.problems.length, 0, `해결돼야 한다 — ${JSON.stringify(g.problems)}`);

  const records = toAssetRecords(g);
  const dyn = records.filter((r) => r.kind === 'dynamic-family').map((r) => r.sourcePath).sort();
  assert.deepEqual(dyn, ['assets/new/a.webp', 'assets/new/b.webp'],
    `family entries 가 레코드로 나와야 한다 — 실측 ${JSON.stringify(records)}`);
  //  레코드에 출처가 남아 누락 시 원인을 추적할 수 있다.
  const one = records.find((r) => r.sourcePath === 'assets/new/a.webp');
  assert.equal(one.familyId, 'new-family');
  assert.equal(one.sourceFile, 'js/new.js');
  assert.ok(one.expression.includes('assets/new/'), '어떤 표현이 이 파일을 불렀는지 남는다');
});

test('G37-ASSET-MISSING-SOURCE: family entry 의 source 파일이 없으면 실패', async () => {
  const { toAssetRecords, verifyAssetRecords, formatMissing } = await import('../scripts/lib/asset-graph.mjs');
  const families = [fam('f', /^assets\/x\//, ['assets/x/present.webp', 'assets/x/absent.webp'], 'js/f.js')];
  const g = buildAssetGraph([{ rel: 'js/f.js', src: '`assets/x/${id}.webp`' }], families);
  const records = toAssetRecords(g);
  const have = new Set(['assets/x/present.webp']);
  const { missingSource } = verifyAssetRecords(records, { source: (p) => have.has(p) });
  assert.equal(missingSource.length, 1, `없는 source 1건 — 실측 ${JSON.stringify(missingSource)}`);
  assert.equal(missingSource[0].sourcePath, 'assets/x/absent.webp');
  //  보고 형식에 family 출처가 들어간다(빌드와 PKG-08 이 같은 문구를 쓴다).
  assert.match(formatMissing('소스 없음', missingSource), /family f ← js\/f\.js/);
});

test('G37-ASSET-MISSING-DIST: source 는 있지만 최종 dist 에 없으면 실패', async () => {
  const { toAssetRecords, verifyAssetRecords } = await import('../scripts/lib/asset-graph.mjs');
  const families = [fam('f', /^assets\/x\//, ['assets/x/a.webp'], 'js/f.js')];
  const g = buildAssetGraph([{ rel: 'js/f.js', src: '`assets/x/${id}.webp`' }], families);
  const records = toAssetRecords(g);
  const { missingDist } = verifyAssetRecords(records, { source: () => true, dist: () => false });
  assert.equal(missingDist.length, 1, '복사가 안 됐으면 잡아야 한다');
  assert.equal(missingDist[0].distPath, 'assets/x/a.webp');
});

test('G37-ASSET-REMAP: source→dist remap 이 반영된 경로로 검증된다', async () => {
  //  실제 사례: `assets/3d/portal/w1_model.glb` → dist `assets/3d/w1_model.glb`.
  const { toAssetRecords, verifyAssetRecords } = await import('../scripts/lib/asset-graph.mjs');
  const SRC = 'assets/3d/portal/w1_model.glb', DIST = 'assets/3d/w1_model.glb';
  const families = [fam('portal-glb', /^assets\/3d\/portal\//, [SRC], 'js/portal.js')];
  const g = buildAssetGraph([{ rel: 'js/portal.js', src: '`assets/3d/portal/${id}.glb`' }], families);
  const records = toAssetRecords(g, { resolveDist: (p) => (p === SRC ? DIST : p) });
  const rec = records.find((r) => r.sourcePath === SRC);
  assert.equal(rec.distPath, DIST, `remap 이 레코드에 반영돼야 한다 — 실측 ${rec.distPath}`);
  //  dist 존재 검사는 **remap 된 경로**로 한다 — source 경로로 보면 항상 실패한다.
  const distHave = new Set([DIST]);
  const { missingDist } = verifyAssetRecords(records, { source: () => true, dist: (p) => distHave.has(p) });
  assert.deepEqual(missingDist, [], `remap 경로에 있으면 통과 — 실측 ${JSON.stringify(missingDist)}`);
  //  서로 다른 source 가 같은 dist 를 노리면 실패한다(덮어쓰기 방지).
  const dup = [{ sourcePath: 'a/x.webp', distPath: 'z.webp', kind: 'static' },
    { sourcePath: 'b/y.webp', distPath: 'z.webp', kind: 'static' }];
  const { conflicts } = verifyAssetRecords(dup, { source: () => true, dist: () => true });
  assert.equal(conflicts.length, 1, '충돌 감지');
});

test('G37-ASSET-PKG08-DYNAMIC: PKG-08 이 쓰는 검증이 동적 family 까지 본다', async () => {
  //  Codex 8차 §2-2: PKG-08 은 `scanSource().statics` 만 봤다 → 동적 family 누락을 못 봤다.
  //  이제 같은 `toAssetRecords`/`verifyAssetRecords` 로 정적+동적을 한 목록에서 검사한다.
  const { toAssetRecords, verifyAssetRecords } = await import('../scripts/lib/asset-graph.mjs');
  const families = [fam('f', /^assets\/dyn\//, ['assets/dyn/a.webp'], 'js/f.js')];
  const g = buildAssetGraph([{ rel: 'js/f.js', src: "'assets/static/s.webp'; `assets/dyn/${id}.webp`" }], families);
  const records = toAssetRecords(g);
  assert.equal(records.length, 2, `정적 1 + 동적 1 — 실측 ${JSON.stringify(records)}`);
  //  동적 쪽만 dist 에 없으면 그것만 잡혀야 한다.
  const distHave = new Set(['assets/static/s.webp']);
  const { missingDist } = verifyAssetRecords(records, { source: () => true, dist: (p) => distHave.has(p) });
  assert.equal(missingDist.length, 1, '동적 family 누락을 잡는다');
  assert.equal(missingDist[0].kind, 'dynamic-family');
  assert.equal(missingDist[0].familyId, 'f');
});
