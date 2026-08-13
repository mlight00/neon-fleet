// ── §G-36 P0-3 — runtime asset graph (빌드와 PKG-08 이 **함께 import** 하는 단일 진실) ──
//
//  Codex 7차 §3: 빌드와 테스트가 정규식·주석제거 로직을 **복사**해 쓰고 있었다(갈라질 수 있다).
//  더 심각한 것은 동적 경로 게이트가 이랬다는 점이다:
//      const unresolved = dynamic.filter((d) => !declared.size);
//  `declared.size` 가 75 라 **항상 false** → 어떤 미등록 동적 경로도 통과했다. 전역 허용 버그다.
//  → 각 동적 표현이 **정확히 한 family** 에 매칭돼야 한다. 0개면 실패, 2개 이상이면 모호성 실패.

/** 주석 제거 — 벤더 GLTFLoader 의 예시 주석 `'assets/models/model.gltf'` 가 오탐이었다.
 *  문자열 안의 `//` 는 경로에 나타나지 않으므로 이 정도로 안전하다(완전한 파서는 과하다). */
export function stripComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/[^\r\n]*/g, '$1');
}

//  정적 참조: 따옴표 3종 · 확장자 무관. 허용 문자를 **실제 경로 문자**로 좁힌다
//  (넓게 잡으면 `${}` 백틱과 주석 속 서술까지 경로로 오인한다).
const RX_STR = /['"`](assets\/[A-Za-z0-9_\-./]+\.[A-Za-z0-9]{2,5})['"`]/g;
const RX_CSS = /url\(\s*['"]?(assets\/[^'")]+)['"]?\s*\)/g;
const RX_ATTR = /(?:src|href)\s*=\s*['"](assets\/[^'"]+)['"]/g;
//  동적 표현: `assets/...${...}` — 한 줄 안에서 잡는다.
const RX_DYN = /['"`](assets\/[^'"`\r\n]*\$\{[^'"`\r\n]*)['"`]?/g;

/** 한 소스에서 정적 참조와 동적 표현을 뽑는다. */
export function scanSource(src) {
  const clean = stripComments(src);
  const statics = new Set(), dynamics = [];
  for (const rx of [RX_STR, RX_CSS, RX_ATTR]) for (const m of clean.matchAll(rx)) statics.add(m[1]);
  for (const m of clean.matchAll(RX_DYN)) dynamics.push(m[1]);
  return { statics: [...statics], dynamics };
}

/**
 * 동적 표현을 family 에 매칭한다. **정확히 하나**여야 한다.
 *  @param families [{ id, source, matches(expr, file), entries: string[], why }]
 *  @returns { resolved: [{expr, file, family}], problems: [{expr, file, reason}] }
 */
export function matchDynamics(dynamics, families) {
  const resolved = [], problems = [];
  for (const { expr, file } of dynamics) {
    //  §G-37: `matches(expr)` 뿐 아니라 **source 파일까지** 일치해야 한다(Codex 8차 §2-1).
    //   G36 은 source 를 설명용으로만 뒀다 → 다른 파일의 같은 폴더 표현이 통과했다.
    const hit = families.filter((f) => {
      try { return familyAcceptsSource(f, file) && !!f.matches(expr, file); } catch { return false; }
    });
    if (hit.length === 0) {
      problems.push({ expr, file, reason: 'family 없음 — ASSET_FAMILIES 에 등록하라' });
    } else if (hit.length > 1) {
      problems.push({ expr, file, reason: `family 모호(${hit.map((f) => f.id).join(', ')})` });
    } else if (!hit[0].entries || hit[0].entries.length === 0) {
      problems.push({ expr, file, reason: `family '${hit[0].id}' 의 entries 가 비어 있다` });
    } else {
      resolved.push({ expr, file, family: hit[0] });
    }
  }
  return { resolved, problems };
}

/** 여러 소스를 한 번에 훑는다. @param files [{ rel, src }] */
export function buildAssetGraph(files, families = []) {
  const statics = new Set(), dynamics = [];
  for (const { rel, src } of files) {
    const r = scanSource(src);
    for (const s of r.statics) statics.add(s);
    for (const expr of r.dynamics) dynamics.push({ expr, file: rel });
  }
  const { resolved, problems } = matchDynamics(dynamics, families);
  //  family 가 열거한 실제 파일도 참조 목록에 넣는다(동적 경로의 해석 결과).
  const fromFamilies = new Set();
  for (const { family } of resolved) for (const e of family.entries) fromFamilies.add(e);
  return { statics: [...statics], dynamics, resolved, problems, familyEntries: [...fromFamilies] };
}

// ── §G-37 P0 — graph 결과를 **실제 매니페스트 레코드**로 정규화한다 ──
//
//  Codex 8차 §2: helper 가 `familyEntries` 를 돌려줘도 **빌드는 `statics` 만 추가**했다.
//  SFX·배경·RASTER_ART 가 패키지에 있던 건 앞선 수동 규칙 (b)(c)(e) 가 우연히 같은 파일을 넣어서였다.
//  → 새 family 를 정상 등록해도 매니페스트에 안 들어가는 사각지대가 그대로 남아 있었다.
//  이제 정적 참조와 family entries 를 **같은 레코드 목록**으로 합쳐 빌드·PKG-08 이 함께 순회한다.

/** 경로 구분자 정규화 — `source` 강제 비교가 OS 에 따라 갈리면 안 된다. */
export const normPath = (p) => String(p).replaceAll(String.fromCharCode(92), String.fromCharCode(47));

/**
 * family 의 `source` 를 **실제 매칭 조건으로 강제**한다.
 *  ⚠️G36 은 `source` 를 설명 문자열로만 뒀다 → `js/not-audio.js` 의 SFX 표현도 `sfx` family 로 통과했다.
 *  @param family { source?: string | string[] | (file)=>boolean }
 */
export function familyAcceptsSource(family, file) {
  const src = family.source;
  if (src == null) return true;                       // 미지정이면 파일 제한 없음(명시적 선택)
  const f = normPath(file);
  if (typeof src === 'function') return !!src(f);
  const list = Array.isArray(src) ? src : [src];
  return list.some((s) => normPath(s) === f);
}

/**
 * graph 결과 → **asset record 목록**.
 *  @returns [{ sourcePath, distPath, kind: 'static'|'dynamic-family', sourceFile, familyId, expression }]
 */
export function toAssetRecords(graph, { resolveDist = (p) => p } = {}) {
  const out = [];
  for (const sourcePath of graph.statics) {
    out.push({ sourcePath, distPath: normPath(resolveDist(sourcePath)), kind: 'static',
      sourceFile: null, familyId: null, expression: null });
  }
  for (const { family, expr, file } of graph.resolved) {
    for (const sourcePath of family.entries) {
      out.push({ sourcePath, distPath: normPath(resolveDist(sourcePath)), kind: 'dynamic-family',
        sourceFile: file, familyId: family.id, expression: expr });
    }
  }
  return out;
}

/**
 * 레코드 목록을 검증한다. **빌드와 PKG-08 이 같은 함수를 쓴다.**
 *  @param exists  { source(p):boolean, dist(p):boolean }
 */
export function verifyAssetRecords(records, exists) {
  const missingSource = [], missingDist = [], conflicts = [];
  const byDist = new Map();
  for (const r of records) {
    if (exists.source && !exists.source(r.sourcePath)) missingSource.push(r);
    if (exists.dist && !exists.dist(r.distPath)) missingDist.push(r);
    const prev = byDist.get(r.distPath);
    //  같은 distPath 가 **다른 source** 를 가리키면 하나가 다른 하나를 덮어쓴다.
    if (prev && prev !== r.sourcePath) conflicts.push({ distPath: r.distPath, a: prev, b: r.sourcePath });
    else byDist.set(r.distPath, r.sourcePath);
  }
  return { missingSource, missingDist, conflicts };
}

/** 누락 보고 형식 — 빌드와 테스트가 **같은 문구**를 쓴다(형식이 갈리면 원인 추적이 어려워진다). */
export function formatMissing(label, records) {
  return `${label} (${records.length}건): ` + records
    .map((r) => (r.kind === 'static' ? r.sourcePath
      : `${r.sourcePath} [family ${r.familyId} ← ${r.sourceFile}]`))
    .join(' | ');
}

// ── §G-37 §1-2 — CrazyGames family 정의의 **단일 출처** ────────────────────────────────
//  Codex 8차 §2: 빌드와 g36 테스트가 family 3종을 각자 선언하고 있었다. 한쪽만 고치면
//  "테스트는 통과하는데 빌드 매니페스트에는 안 들어가는" 상태가 다시 생긴다.
//  ⚠️`entries` 는 **코드에서 끌어온다**(디렉터리 스캔 · RASTER_ART.C · SECTOR_BACKDROP).
//   손으로 적은 목록은 자산이 늘어나면 조용히 낡는다.
/**
 * @param root    프로젝트 루트(assets/ 가 있는 폴더)
 * @param sprites `js/sprites.js` 모듈(RASTER_ART 제공)
 * @param zone    `js/zone-backdrop.js` 모듈(SECTOR_BACKDROP 제공)
 * @param readdir 디렉터리 나열 주입(기본 node:fs) — 테스트에서 가짜 트리를 넣을 수 있다
 */
export function createCrazyGamesAssetFamilies({ root, sprites, zone, readdir }) {
  const list = readdir || ((dir) => {
    //  lazy require: 이 모듈의 나머지는 순수하다 — fs 는 이 factory 안에서만 쓴다.
    const { readdirSync } = globalThis.__NF_FS || require_fs();
    return readdirSync(dir);
  });
  const j = (...parts) => parts.join('/');
  //  최종 경로맵(RASTER_ART.C)이 remodel/styleC 동적 표현의 **provider** 다 — 코드로 연결한다.
  const rasterFinal = Object.values((sprites && sprites.RASTER_ART && sprites.RASTER_ART.C) || {})
    .filter((v) => typeof v === 'string');
  return [
    { id: 'sfx', source: ['js/audio.js'], why: 'audio.js 가 `nf_sfx_${id}_${n}.ogg` 로 조립',
      matches: (e) => /^assets\/sound\//.test(e),
      entries: list(j(root, 'assets', 'sound')).filter((f) => f.endsWith('.ogg')).map((f) => 'assets/sound/' + f) },
    { id: 'sector-backgrounds', source: ['js/zone-backdrop.js'], why: '`backgrounds/s${i}.webp`',
      matches: (e) => /^assets\/remodel-v2\/backgrounds\//.test(e),
      entries: ((zone && zone.SECTOR_BACKDROP) || []).map((b) => b.url) },
    { id: 'raster-final-map', source: ['js/sprites.js'], why: 'remodel 적·보스·styleC — RASTER_ART.C 가 최종 경로를 확정',
      matches: (e) => /^assets\/(?:remodel-v2\/(?:enemies|bosses)|styleC)\//.test(e),
      entries: rasterFinal },
  ];
}

let _fs = null;
function require_fs() {
  if (!_fs) throw new Error('createCrazyGamesAssetFamilies: readdir 를 넘기거나 setNodeFs() 로 fs 를 주입하라');
  return _fs;
}
/** node 환경에서 한 번 호출해 fs 를 붙인다(브라우저 번들에 fs 가 끌려들어가지 않게 하기 위함). */
export function setNodeFs(fs) { _fs = fs; }
