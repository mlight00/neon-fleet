import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// P0-6: CrazyGames 업로드 빌드/ZIP 무결성(§5.1). 빌드 스크립트를 실행해 산출물을 실제로 검사한다.
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = join(ROOT, 'dist', 'crazygames-basic');
const ZIP = join(ROOT, 'dist', 'neon-fleet-crazygames-basic.zip');

function walk(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}

before(() => {
  // 빌드 실행(실패 시 스크립트가 process.exit(1) → execFileSync throw → 여기서 테스트 실패)
  execFileSync('node', ['scripts/build-crazygames-basic.mjs'], { cwd: ROOT, stdio: 'pipe' });
});

test('PKG-01: dist 산출물과 ZIP이 생성된다', () => {
  assert.ok(existsSync(OUT), 'dist/crazygames-basic 존재');
  assert.ok(existsSync(ZIP), 'ZIP 존재');
  assert.ok(existsSync(join(OUT, 'index.html')), 'index.html 이 dist 루트에');
});

test('PKG-02: 압축 전 런타임 합계 < 50MB, 파일 수 < 1500', () => {
  const files = walk(OUT);
  const bytes = files.reduce((s, f) => s + statSync(f).size, 0);
  assert.ok(files.length < 1500, `파일 수 ${files.length} < 1500`);
  assert.ok(bytes < 50 * 1024 * 1024, `합계 ${(bytes / 1048576).toFixed(2)}MB < 50MB`);
});

test('PKG-03: mp3·dev 파일·docs/tests/dev 미포함', () => {
  const files = walk(OUT).map((f) => relative(OUT, f).split(sep).join('/'));
  assert.ok(!files.some((f) => f.endsWith('.mp3')), 'mp3 없음(ogg만)');
  assert.ok(!files.some((f) => f === 'tuner.html' || f.endsWith('tuner.js') || f.endsWith('tuner-spec.js')), 'tuner 미포함');
  assert.ok(!files.some((f) => f.startsWith('docs/') || f.startsWith('tests/') || f.startsWith('dev/') || f.startsWith('.git')), 'docs/tests/dev 미포함');
});

test('PKG-04: 런타임 참조가 모두 상대경로(절대경로 0)', () => {
  const files = walk(OUT).filter((f) => /\.(html|css|js)$/.test(f));
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    const abs = [...txt.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1])
      .filter((u) => u.startsWith('/') || /^https?:\/\//i.test(u));
    assert.deepEqual(abs, [], `${relative(OUT, f)} 절대경로 참조 없음`);
  }
});

test('PKG-05: ZIP에 GA4 측정 ID·Prolific 완료 URL·비밀값 없음', () => {
  const files = walk(OUT).filter((f) => /\.(html|js|css)$/.test(f));
  for (const f of files) {
    const txt = readFileSync(f, 'utf8');
    assert.ok(!/measurementId:\s*'G-[A-Z0-9]{4,}'/.test(txt), `${relative(OUT, f)} GA4 ID 없음`);
    assert.ok(!/(PROLIFIC_COMPLETION_URL|PROLIFIC_NO_CONSENT_URL)\s*=\s*'https?:/.test(txt), `${relative(OUT, f)} Prolific URL 없음`);
  }
  // 서빙되는 HTML/CSS 에 외부 광고/분석 태그 없음(js 휴면 어댑터는 포털에서 미로드 — 별도 네트워크 QA)
  for (const f of walk(OUT).filter((f) => /\.(html|css)$/.test(f))) {
    assert.ok(!/googletagmanager|adsbygoogle|googlesyndication|gtag\(/i.test(readFileSync(f, 'utf8')), `${relative(OUT, f)} 외부 태그 없음`);
  }
});

test('PKG-06: dist index.html 이 영어(lang=en, title=Neon Fleet)', () => {
  const idx = readFileSync(join(OUT, 'index.html'), 'utf8');
  assert.match(idx, /<html lang="en">/);
  assert.match(idx, /<title>Neon Fleet<\/title>/);
  assert.ok(!/[가-힣]/.test(idx), 'dist index.html 에 한글 없음');
});

test('PKG-07: ZIP 최상단에 index.html, 상위 폴더 래핑 없음', () => {
  // .NET ZipArchive 로 엔트리 이름을 읽어 루트 구조를 확인한다.
  const ps = `$ErrorActionPreference='Stop';`
    + `Add-Type -AssemblyName System.IO.Compression.FileSystem;`
    + `$z=[System.IO.Compression.ZipFile]::OpenRead('${ZIP.split('\\').join('/')}');`
    + `$z.Entries | ForEach-Object { $_.FullName }; $z.Dispose()`;
  const names = execFileSync('powershell', ['-NoProfile', '-Command', ps], { encoding: 'utf8' })
    .split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
  assert.ok(names.includes('index.html'), 'index.html 이 ZIP 루트 엔트리');
  assert.ok(!names.some((n) => n.startsWith('crazygames-basic/')), '상위 폴더로 래핑되지 않음');
  assert.ok(!names.some((n) => n.endsWith('.mp3')), 'ZIP 내 mp3 없음');
  assert.ok(names.some((n) => n.startsWith('js/')) && names.some((n) => n.startsWith('assets/')), 'js/·assets/ 상대구조 유지');
});

test('PKG-08: dist 코드가 참조하는 asset(정적 + 동적 family)이 dist 에 다 있다', async () => {
  //  §G-36 P0-3(Codex 7차 §3): 빌드와 이 테스트가 정규식·주석제거를 **복사**해 쓰고 있었다.
  //  §G-37 §1-4(Codex 8차 §2): 더 나아가 이 테스트는 `scanSource().statics` 만 봤다 —
  //   **동적 family 가 만든 경로는 검증 밖**이었다. SFX 312개가 dist 에서 빠져도 통과했다.
  //   이제 빌드와 **완전히 같은 파이프라인**을 탄다: buildAssetGraph → toAssetRecords → verifyAssetRecords.
  //  ⚠️`before` 훅이 빌드를 실제로 돌리므로 여기서 보는 것은 "빌드 직후 dist" 다.
  const { buildAssetGraph, toAssetRecords, verifyAssetRecords, formatMissing,
    createCrazyGamesAssetFamilies, setNodeFs } = await import('../scripts/lib/asset-graph.mjs');

  //  allowlist — **이름 없는 예외 금지**(Codex 6차 §5). 사유와 만료 조건을 적는다.
  //   `art2-webp/styleC/B16~B21`, `bosses/b7`, `bosses/b22` 는 remodel-v2 override 로 **대체된 원본**이다.
  //   경로맵(RASTER_ART.C)이 최종 경로를 remodel-v2 로 확정하므로 런타임은 읽지 않는다.
  //   만료: override 가 풀려 이 원본을 다시 쓰게 되면 목록에서 빼고 dist 에 포함시킨다.
  const ALLOW_DEAD_ORIGINALS = /^assets\/art2-webp\/(?:styleC\/B1[6-9]|styleC\/B2[01]|bosses\/b7|bosses\/b22)/;

  const texts = [];
  const walk = (dir, rel = '') => {
    for (const e of readdirSync(join(OUT, dir), { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) { if (e.name !== 'assets') walk(join(dir, e.name), r); }
      else if (/\.(?:js|mjs|css|html)$/i.test(e.name)) texts.push(r);
    }
  };
  walk('.');
  assert.ok(texts.length > 10, `스캔 대상이 있어야 한다 — 실측 ${texts.length}개`);

  //  family 는 **dist 를 루트로** 만든다 — dist 안의 sound/ 목록과 dist 의 sprites.js 경로맵을 본다.
  setNodeFs(await import('node:fs'));
  const sprites = await import(pathToFileURL(join(OUT, 'js', 'sprites.js')).href);
  const zone = await import(pathToFileURL(join(OUT, 'js', 'zone-backdrop.js')).href);
  const families = createCrazyGamesAssetFamilies({ root: OUT, sprites, zone });

  const g = buildAssetGraph(texts.map((rel) => ({ rel, src: readFileSync(join(OUT, rel), 'utf8') })), families);
  assert.deepEqual(g.problems, [],
    `dist 코드의 동적 asset 표현이 전부 family 로 해결돼야 한다 — 실측 ${JSON.stringify(g.problems)}`);

  //  dist 안에서는 재배치가 끝났으므로 distPath = sourcePath(항등).
  const records = toAssetRecords(g).filter((r) => !ALLOW_DEAD_ORIGINALS.test(r.sourcePath));
  const { missingDist } = verifyAssetRecords(records, { dist: (p) => existsSync(join(OUT, p)) });
  assert.deepEqual(missingDist, [],
    formatMissing('dist 코드가 참조하는 asset 이 dist 에 없다(포털 404)', missingDist));

  //  ⭐동적 family 가 실제로 검증에 **포함됐는지** 스스로 증명한다(빈 목록으로 통과하는 착시 방지).
  //  ⚠️여기에 매직넘버(>=300)를 박지 않는다 — 자산이 줄면 테스트가 먼저 터지고, 늘면 무의미해진다.
  //   **해결된 family 가 열거한 entry 전부**가 레코드에 있는지를 본다. 기대값이 제품에서 나온다.
  const dyn = new Set(records.filter((r) => r.kind === 'dynamic-family').map((r) => r.sourcePath));
  const resolvedFamilies = [...new Set(g.resolved.map((r) => r.family))];
  assert.ok(resolvedFamilies.length >= 3, `dist 에서 해결된 family 3종 — 실측 ${resolvedFamilies.length}`);
  for (const f of resolvedFamilies) {
    const want = f.entries.filter((e) => !ALLOW_DEAD_ORIGINALS.test(e));
    const lost = want.filter((e) => !dyn.has(e));
    assert.deepEqual(lost, [],
      `family ${f.id} 의 entry 가 검증 레코드에서 빠졌다(${lost.length}/${want.length}): ${lost.slice(0, 5).join(', ')}`);
  }
  //  sfx 는 dist 디렉터리 실측과 대조 — family 가 조용히 비어도 여기서 걸린다.
  const sfxOnDisk = readdirSync(join(OUT, 'assets', 'sound')).filter((f) => f.endsWith('.ogg'));
  assert.ok(sfxOnDisk.length > 0 && sfxOnDisk.every((f) => dyn.has('assets/sound/' + f)),
    `dist 의 ogg ${sfxOnDisk.length}개가 전부 동적 레코드에 있어야 한다`);
  assert.ok(g.dynamics.length >= 5, `dist 동적 표현 5개 이상 — 실측 ${g.dynamics.length}`);
});
