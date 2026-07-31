import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, statSync, existsSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

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
