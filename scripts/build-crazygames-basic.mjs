// CrazyGames Basic Launch 전용 업로드 빌드 (지시서 §P0-6).
//  원본 저장소 전체를 압축하지 않는다 — 런타임에 실제 필요한 파일만 dist/crazygames-basic 에 모으고 ZIP으로 묶는다.
//  매니페스트는 정규식이 아니라 코드의 실제 데이터에서 만든다:
//    · 스프라이트 = sprites.js 의 RASTER_ART.C(최종 경로맵, remodel-v2 override 적용 → 죽은 art2-webp 원본 자동 제외)
//    · 배경       = zone-backdrop 의 assets/remodel-v2/backgrounds/s1..s6.webp
//    · 사운드     = assets/sound/*.ogg (런타임은 ogg만 요청 — mp3 30MB 제외)
//    · 폰트/아이콘/런타임 JS/CSS/HTML
//  게이트: 없는 참조=실패, 압축 전 합계 50MB↑=실패, 파일 1500개↑=실패, 절대경로 런타임 참조=실패, GA4 ID/Prolific URL/광고=실패.
import { readdirSync, statSync, existsSync, mkdirSync, copyFileSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { deflateRawSync } from 'node:zlib';

// ── 최소 ZIP 작성기(정방향 슬래시 보장) ───────────────────────
//  Windows Compress-Archive 는 일부 버전에서 엔트리 이름에 역슬래시를 넣어 ZIP 스펙을 위반한다.
//  포털 업로드용 ZIP은 반드시 '/' 구분자여야 하므로 Node에서 직접 쓴다(store/deflate + CRC32).
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; }
  return t;
})();
const crc32 = (buf) => { let c = 0xFFFFFFFF; for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
function makeZip(entries) {
  const local = [], central = []; let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, 'utf8');       // name 은 항상 '/' 구분 상대경로
    const crc = crc32(data);
    const comp = deflateRawSync(data);
    const store = comp.length >= data.length;         // 압축이 이득 없으면 저장(store)
    const method = store ? 0 : 8, body = store ? data : comp;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(nameBuf.length, 26);
    local.push(lh, nameBuf, body);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const centralBuf = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, centralBuf, eocd]);
}

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');                 // 저장소 루트 (scripts/..)
const OUT = resolve(ROOT, 'dist', 'crazygames-basic');
const ZIP = resolve(ROOT, 'dist', 'neon-fleet-crazygames-basic.zip');
const MAX_BYTES = 50 * 1024 * 1024;               // 압축 전 런타임 합계 상한(SDK 없는 Basic)
const MAX_FILES = 1500;

const die = (msg) => { console.error('\n[BUILD FAILED] ' + msg + '\n'); process.exit(1); };
const rel = (p) => relative(ROOT, p).split(sep).join('/');
const MB = (n) => (n / 1024 / 1024).toFixed(2) + ' MB';

// ── 1. 매니페스트 ─────────────────────────────────────────────
const manifest = new Set();
const add = (p) => manifest.add(String(p).split('\\').join('/'));
// 소스 경로 → dist 경로 재배치(다를 때만). 포털 전용 경량 자산을 원본과 같은 런타임 경로로 내보낼 때 쓴다.
const remap = new Map();
const distPath = (p) => remap.get(p) || p;

// (a) 정적 런타임 파일. tuner.js/tuner-spec.js 는 tuner.html 전용(런타임 미import) → 제외.
add('index.html');
add('css/style.css');
const EXCLUDE_JS = new Set(['tuner.js', 'tuner-spec.js']);
for (const f of readdirSync(join(ROOT, 'js'))) if (f.endsWith('.js') && !EXCLUDE_JS.has(f)) add('js/' + f);
// 벤더 런타임(로컬 Three.js 등) — 하위폴더는 위 readdir에 안 잡히므로 명시적으로 포함. `?chase3d=1`에서만 동적 import.
if (existsSync(join(ROOT, 'js', 'vendor'))) for (const f of readdirSync(join(ROOT, 'js', 'vendor'))) if (f.endsWith('.js')) add('js/vendor/' + f);

// (b) 스프라이트 — RASTER_ART.C 최종 경로맵(override 반영). sprites.js 를 실제로 import해 값에서 뽑는다.
const sprites = await import(pathToFileURL(join(ROOT, 'js', 'sprites.js')).href);
if (!sprites.RASTER_ART || !sprites.RASTER_ART.C) die('sprites.RASTER_ART.C 를 읽지 못함');
for (const v of Object.values(sprites.RASTER_ART.C)) if (typeof v === 'string' && v.startsWith('assets/')) add(v);

// (c) 섹터 배경(zone-backdrop): s1..s6
for (let i = 1; i <= 6; i++) add(`assets/remodel-v2/backgrounds/s${i}.webp`);

// (d) 폰트(전부: woff2 + 라이선스)
for (const f of readdirSync(join(ROOT, 'assets', 'fonts'))) add('assets/fonts/' + f);

// (e) 사운드: ogg만(mp3 제외)
for (const f of readdirSync(join(ROOT, 'assets', 'sound'))) if (f.endsWith('.ogg')) add('assets/sound/' + f);

// (f) 브랜딩 — 앱 아이콘 + 타이틀 엠블럼(ui.js 가 타이틀 화면에서 <img> 로 직접 참조).
//  emblem 은 매니페스트에 없어 포털 빌드에서 404 였다(실측 — dist 브라우저 QA에서 발견).
add('assets/art2-webp/branding/app_icon.webp');
add('assets/art2-webp/branding/emblem.webp');

// (g) §G-4 이미지 빌보드 텍스처(터렛·위버) — 모듈의 경로 테이블에서 자동 동기
const billboards = await import(pathToFileURL(join(ROOT, 'js', 'chase3d-billboards.js')).href);
for (const v of Object.values(billboards.BILLBOARD_TEX)) add(v);
// (h) §G-10 실모델(GLB) 포털 포함 — 이사 결정 "사운드 재인코딩해서 3D 넣어줘".
//  개발본(assets/3d/*.glb, 종당 ~2MB)은 그대로 두고, 포털은 경량본(assets/3d/portal/)을 같은
//  런타임 경로(assets/3d/)로 재배치해 내보낸다. 코드·경로 수정 없이 포털에서도 실모델이 뜬다.
//  경량본이 없으면 매니페스트에 안 들어가고 로더가 404 → 빌보드 폴백(기존 동작 유지).
const PORTAL_GLB_DIR = join(ROOT, 'assets', '3d', 'portal');
if (existsSync(PORTAL_GLB_DIR)) {
  for (const f of readdirSync(PORTAL_GLB_DIR)) {
    if (!f.endsWith('.glb')) continue;
    const srcRel = 'assets/3d/portal/' + f;
    add(srcRel);
    remap.set(srcRel, 'assets/3d/' + f);
  }
}

// ── 2. 존재 검증 (§P0-6.7) ────────────────────────────────────
const missing = [...manifest].filter((p) => !existsSync(join(ROOT, p)));
if (missing.length) die('매니페스트 참조 파일 없음:\n  ' + missing.join('\n  '));
if ([...manifest].some((p) => p.endsWith('.mp3'))) die('mp3가 매니페스트에 포함됨(포털 빌드는 ogg만)');

// ── 3. 출력 경로 가드 + 정리 (§P0-6.2) ────────────────────────
const distRoot = resolve(ROOT, 'dist');
if (!OUT.startsWith(distRoot + sep) || OUT === ROOT || OUT === distRoot) die('안전하지 않은 출력 경로: ' + OUT);
if (existsSync(OUT)) rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

// ── 4. 복사 ──────────────────────────────────────────────────
let bytes = 0, count = 0;
for (const p of manifest) {
  const src = join(ROOT, p), dst = join(OUT, distPath(p));
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  bytes += statSync(src).size; count++;
}

// dist index.html 은 포털 전용 → 첫 페인트부터 영어(lang/title 치환) + 개발용 no-cache 메타(한국어 주석 포함) 제거.
//  소스 index.html 은 일반 모드용 한국어 그대로 유지. no-cache 제거 = 포털 CDN 캐시 이득(첫 로딩·재방문 속도).
const idxPath = join(OUT, 'index.html');
const idxHtml = readFileSync(idxPath, 'utf8')
  .replace('<html lang="ko">', '<html lang="en">')
  .replace('<title>네온 함대 — Neon Fleet</title>', '<title>Neon Fleet</title>')
  .replace(/\n\s*<!-- 개발 중[^\n]*-->/, '')
  .replace(/\n\s*<meta http-equiv="Cache-Control"[^>]*>/, '')
  .replace(/\n\s*<meta http-equiv="Pragma"[^>]*>/, '')
  .replace(/\n\s*<meta http-equiv="Expires"[^>]*>/, '');
writeFileSync(idxPath, idxHtml);
if (/[가-힣]/.test(idxHtml)) die('dist index.html 에 한글 잔존(포털은 한국어 0)');

// ── 5. 상대경로 / 금지내용 검증 ───────────────────────────────
for (const p of manifest) {
  if (!/\.(html|css|js)$/.test(p)) continue;
  const txt = readFileSync(join(OUT, distPath(p)), 'utf8');
  const abs = [...txt.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)].map((m) => m[1])
    .filter((u) => u.startsWith('/') || /^https?:\/\//i.test(u));
  if (abs.length) die(`${p} 에 절대경로 런타임 참조: ${abs.join(', ')}`);
}
for (const p of manifest) {
  if (!p.endsWith('.js') && !p.endsWith('.html')) continue;
  const txt = readFileSync(join(OUT, distPath(p)), 'utf8');
  // 실제 시크릿/ID: 어떤 파일에도 GA4 측정 ID·Prolific 완료 URL이 채워져 있으면 안 된다(둘 다 빈 값이어야 함).
  if (/measurementId:\s*'G-[A-Z0-9]{4,}'/.test(txt)) die(`${p} 에 GA4 측정 ID(비어 있어야 함)`);
  if (/(PROLIFIC_COMPLETION_URL|PROLIFIC_NO_CONSENT_URL)\s*=\s*'https?:/.test(txt)) die(`${p} 에 Prolific 완료 URL(비어 있어야 함)`);
  // 외부 광고/분석 '태그'는 실제 서빙되는 HTML/CSS 에 없어야 한다(포털이 로드하는 표면).
  //  ⚠️ first-party 분석 어댑터(js/analytics-ga4.js)는 googletagmanager URL을 '주입 템플릿'으로만 보유한다.
  //     포털에선 어댑터가 dev처럼 완전 억제되어 아무것도 주입/전송하지 않는다(브라우저 네트워크 QA로 0건 확인).
  //     따라서 이 태그 검사는 js 가 아니라 html/css 만 대상으로 한다.
  if (/\.(html|css)$/.test(p) && /googletagmanager|adsbygoogle|googlesyndication|sdk\.crazygames|gtag\(/i.test(txt)) die(`${p} 에 외부 광고/분석 태그`);
}

// ── 6. 크기·파일수 게이트 ─────────────────────────────────────
if (bytes >= MAX_BYTES) die(`압축 전 런타임 합계 ${MB(bytes)} ≥ 50MB — 에셋 정리 필요`);
if (count >= MAX_FILES) die(`파일 수 ${count} ≥ ${MAX_FILES}`);

// ── 7. ZIP (index.html 이 루트, 정방향 슬래시) ────────────────
if (existsSync(ZIP)) rmSync(ZIP);
writeFileSync(ZIP, makeZip([...manifest].map((p) => ({ name: distPath(p), data: readFileSync(join(OUT, distPath(p))) }))));
const zipBytes = statSync(ZIP).size;

// ── 8. 요약 ──────────────────────────────────────────────────
const byDir = {};
for (const p of manifest) { const d = p.split('/').slice(0, 2).join('/'); byDir[d] = (byDir[d] || 0) + statSync(join(ROOT, p)).size; }
console.log('\n=== CrazyGames Basic 빌드 요약 ===');
console.log('출력 폴더 :', rel(OUT));
console.log('ZIP       :', rel(ZIP));
console.log('파일 수   :', count, '/', MAX_FILES);
console.log('압축 전   :', MB(bytes), '/ 50 MB');
console.log('ZIP 크기  :', MB(zipBytes));
console.log('구성(디렉토리별 압축 전):');
for (const [d, b] of Object.entries(byDir).sort((a, b) => b[1] - a[1])) console.log('   ', d.padEnd(22), MB(b));
console.log('\n[OK] 빌드 성공. 업로드 전 브라우저 404 QA로 후반 섹터/보스 에셋 완결성 확인 권장.\n');
