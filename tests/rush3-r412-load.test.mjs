// rush3-r412-load — r4.12 첫 화면 빨리 띄우기(개선 루프 1바퀴, 2026-09-27). **그림 불러오기만 — 규칙·그리기 불변**.
//  전에는 첫 화면이 뜨기 전에 그림 139장(PNG 37.3MB)을 전부 받아야 했다(데스크톱 7초, 휴대폰 회선은 그 몇 배).
//  LOAD-1: 불러오는 모든 PNG 옆에 같은 크기의 WebP(tools/webp_build.py — assets/webp-manifest.json)가 있고, PNG 가 바뀌면(바이트 수) 검사가 알려 준다
//  LOAD-2: 차례 — WebP 확인 → A(타이틀 2장) 끝나면 ready → B(1판) 는 곧바로 · C(나머지)는 B 뒤 · 전부 WebP · 진행(progress) 끝 = 전체
//  LOAD-3: WebP 가 안 되는 브라우저 = 전부 PNG · WebP 한 장이 실패하면 그 그림만 PNG 로 다시(나머지는 WebP 그대로)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SPRITE_KEYS3, SHEETS3, SHEET_BASE3, WEAPON_ICON_IDS3, WEAPON_ICON_BASE3, loadSprites3, loadTier3, LOAD_TIER_A, WEBP_PROBE } from '../rush3/sprites.js';

const ROOT = new URL('../', import.meta.url);
//  불러오는 PNG 목록(sprites.js 와 같은 규칙 — tools/webp_build.py 도 같은 목록을 Node 로 얻는다)
function targets() {
  const out = [];
  for (const name of Object.values(SPRITE_KEYS3)) out.push('assets/rush/' + name + '.png');
  for (const m of Object.values(SHEETS3)) if (!m.pending) out.push(SHEET_BASE3 + m.file + '.png');
  for (const id of WEAPON_ICON_IDS3) for (const mk of [1, 2, 3]) out.push(WEAPON_ICON_BASE3 + 'W_' + id + '_' + mk + '.png');
  return [...new Set(out)];
}
function pngSize(buf) { return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) }; }
//  WebP 머리(RIFF): VP8X(확장 — 알파) = 캔버스 크기 24비트 LE(−1) · VP8(손실) = 14비트 · VP8L(무손실) = 14비트 묶음
function webpSize(buf) {
  assert.equal(buf.toString('latin1', 0, 4), 'RIFF'); assert.equal(buf.toString('latin1', 8, 12), 'WEBP');
  const kind = buf.toString('latin1', 12, 16);
  if (kind === 'VP8X') return { w: 1 + buf.readUIntLE(24, 3), h: 1 + buf.readUIntLE(27, 3) };
  if (kind === 'VP8 ') return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
  if (kind === 'VP8L') { const b = buf.readUInt32LE(21); return { w: 1 + (b & 0x3fff), h: 1 + ((b >> 14) & 0x3fff) }; }
  throw new Error('모르는 WebP 꼴 ' + kind);
}

test('LOAD-1: 불러오는 PNG 마다 같은 크기의 WebP 가 있다 · 목록(webp-manifest.json)의 PNG 바이트 수 = 지금 PNG(바뀌었으면 tools/webp_build.py 를 다시) · WebP 합계가 PNG 의 1/3 아래', () => {
  const man = JSON.parse(readFileSync(new URL('assets/webp-manifest.json', ROOT), 'utf8'));
  let png = 0, webp = 0;
  for (const rel of targets()) {
    const p = new URL(rel, ROOT), w = new URL(rel.replace(/\.png$/, '.webp'), ROOT);
    assert.ok(existsSync(p), rel + ' PNG');
    assert.ok(existsSync(w), rel + ' → WebP 가 없다(python tools/webp_build.py)');
    const pb = readFileSync(p), wb = readFileSync(w);
    const a = pngSize(pb), b = webpSize(wb);
    assert.deepEqual(b, a, rel + ' WebP 크기 = PNG 크기');
    assert.ok(man[rel], rel + ' 목록에 있다');
    assert.equal(man[rel].png, pb.length, rel + ' PNG 가 바뀌었다 — python tools/webp_build.py 로 WebP 를 다시 만든다');
    png += pb.length; webp += wb.length;
  }
  assert.ok(webp < png / 3, `WebP 합계 ${(webp / 1048576).toFixed(1)}MB < PNG ${(png / 1048576).toFixed(1)}MB 의 1/3`);
});

//  가짜 Image: src 를 받으면 다음 틱에 성공(1×1 → WebP 확인 통과) 또는 실패. fail(src) 로 실패할 그림을 고른다
function mockImage(fail = () => false) {
  const req = [];
  globalThis.Image = class {
    set src(v) {
      req.push(v);
      setTimeout(() => { if (fail(v)) this.onerror && this.onerror(); else { this.naturalWidth = this.width = 1; this.onload && this.onload(); } }, 0);
    }
  };
  return req;
}
const bare = (s) => s.replace(/^assets\/rush3?\/(weapons\/)?/, '').replace(/\.(png|webp)$/, '');

test('LOAD-2: 차례 — WebP 확인 → A(타이틀: 배경 1·주인공 로봇)만 받고 ready → 그때 B(1판 그림)는 이미 요청, C(보스·효과·다른 적)는 아직 → 전부 끝나면 C 까지 · 모두 .webp · 진행 끝 = 전체', async () => {
  const req = mockImage();
  let api;
  try {
    const p = loadSprites3('assets/rush/', 'assets/rush3/');
    api = await p;
    assert.equal(req[0], WEBP_PROBE, '첫 요청 = WebP 확인');
    const files = req.slice(1);
    assert.deepEqual(files.slice(0, LOAD_TIER_A.length).map(bare).sort(), LOAD_TIER_A.map((k) => SPRITE_KEYS3[k]).sort(), 'A 차례 = 타이틀 2장');
    assert.ok(files.every((s) => s.endsWith('.webp')), '모두 WebP');
    assert.equal(api.ext, '.webp');
    //  ready 가 풀린 순간: B 는 요청됨, C 는 아직
    assert.ok(files.some((s) => s.includes('/SOLDIER.')) && files.some((s) => s.includes('M01_walk')) && files.some((s) => s.includes('W_rifle_1')), 'B(1판) 요청');
    assert.ok(!files.some((s) => s.includes('fx_b1_smoke') || s.includes('B3_railleviathan')), 'C(효과·보스)는 아직');
    assert.ok(api.get('m1') && api.get('bg1'), '타이틀 그림 준비');
    const pr = api.progress();
    assert.ok(pr.done >= LOAD_TIER_A.length && pr.done < pr.total, '진행 중 ' + JSON.stringify(pr));
    await api.all;
  } finally { delete globalThis.Image; }
  const files = req.slice(1);
  assert.ok(files.some((s) => s.includes('fx_b1_smoke')) && files.some((s) => s.includes('B3_railleviathan_hitdie')), 'C 까지 받는다');
  const pr = api.progress();
  assert.equal(pr.done, pr.total, '진행 끝 = 전체');
  assert.equal(new Set(files).size, files.length, '같은 그림을 두 번 받지 않는다');
  //  차례 표: 효과·보스 몸·다른 적 = C · 사격 시트·병사 = B
  assert.equal(loadTier3('sheet', 'fx:smoke'), 'C');
  assert.equal(loadTier3('sheet', 'bd:B1_grader'), 'C');
  assert.equal(loadTier3('img', 'skin:E3_wallguard'), 'C');
  assert.equal(loadTier3('sheet', 'soldier_fire'), 'B');
  assert.equal(loadTier3('img', 'soldier'), 'B');
  assert.equal(loadTier3('icon', 'rifle'), 'B');
});

test('LOAD-3: WebP 가 안 되는 브라우저 = 전부 PNG · WebP 한 장이 실패하면 그 그림만 PNG 로 다시(성공하면 그 그림도 쓴다) · 실패한 그림이 있어도 기다림이 끝난다', async () => {
  //  (가) WebP 확인 실패 → PNG
  let req = mockImage((v) => v === WEBP_PROBE);
  try {
    const api = await loadSprites3('assets/rush/', 'assets/rush3/');
    await api.all;
    assert.equal(api.ext, '.png');
    assert.ok(req.slice(1).every((s) => s.endsWith('.png')), '전부 PNG');
  } finally { delete globalThis.Image; }
  //  (나) M01.webp 만 실패 → M01.png 로 다시, 나머지는 WebP
  req = mockImage((v) => v.endsWith('/M01.webp'));
  try {
    const api = await loadSprites3('assets/rush/', 'assets/rush3/');
    assert.ok(api.get('m1'), 'PNG 로 다시 받아 쓴다');
    await api.all;
    assert.ok(req.includes('assets/rush/M01.png') && req.filter((s) => s.endsWith('.png')).length === 1, 'PNG 는 그 한 장만');
    const pr = api.progress();
    assert.equal(pr.done, pr.total);
  } finally { delete globalThis.Image; }
  //  (다) 어떤 그림이 WebP·PNG 모두 없어도(둘 다 실패) 끝난다 — 그 그림은 폴백
  req = mockImage((v) => v.includes('fx_b2_web'));
  try {
    const api = await loadSprites3('assets/rush/', 'assets/rush3/');
    await api.all;
    assert.equal(api.sheet('fx:web'), null, '없는 그림 = null(폴백)');
    assert.ok(api.sheet('fx:smoke'), '다른 그림은 있다');
  } finally { delete globalThis.Image; }
});
