// rush3/sprites.js — rush/sprites.js 복제(v3 키). 있으면 그림, 없으면 null(호출부가 도형 폴백). 그림 0장으로도 완주 가능.
export const SPRITE_KEYS3 = {
  //  아군: 히어로 1단 + 병사
  m1: 'M01', soldier: 'SOLDIER',
  //  보급 통·게이트
  supply: 'SUPPLY', gate: 'GATE',
  //  배경 3구간(스테이지 1~3)
  bg1: 'BG1', bg2: 'BG2', bg3: 'BG3', bg4: 'BG4', bg5: 'BG5',
  //  역할 근사 그림(B-3·C-1·C-2): 스폰·정예의 skin 값이 이 키('skin:'+파일명)로 그림을 고른다
  'skin:E2_ramhound': 'E2_ramhound', 'skin:E3_wallguard': 'E3_wallguard', 'skin:E4_needleeye': 'E4_needleeye',
  'skin:E7_cartyard': 'E7_cartyard', 'skin:E8_manholejumper': 'E8_manholejumper', 'skin:E9_spawnpod': 'E9_spawnpod', 'skin:E10_magnethead': 'E10_magnethead',
  'skin:B2_gantrywidow': 'B2_gantrywidow', 'skin:B3_railleviathan': 'B3_railleviathan', 'skin:B4_smelter': 'B4_smelter', 'skin:B5_crownbreaker': 'B5_crownbreaker',
  //  적 3종(계약서 e_shooter='E4_signaler'는 파일이 없어 실존 E6_signaler로 매핑)
  e_grunt: 'E1_scrapbit', e_rusher: 'E5_wheeler', e_shooter: 'E6_signaler',
  //  정예
  elite: 'B1_grader',
  //  새 장치 그림(2026-09-19 Gemini, 이미지프롬프트_v6): 차량 통·구출 캡슐·보너스 표적 2·병사 수 아이콘 1~3·광장 배경 2. 없으면 도형 폴백
  vehicle: 'D_vehicle', capsule: 'D_capsule', bonus_gift: 'D_bonus_gift', bonus_coin: 'D_bonus_coin',
  soldiers_1: 'ICON_soldiers_1', soldiers_2: 'ICON_soldiers_2', soldiers_3: 'ICON_soldiers_3',
  arena1: 'ARENA1', arena2: 'ARENA2',
  //  발사체 6종(2026-09-20 Gemini v6 P-6, 이사 소감 "탄환은 색만 바뀌어 차이가 안 느껴진다"): 위를 향한 자세·꼬리 아래. 없으면 종전 막대 폴백
  bullet_rifle: 'BULLET_rifle', bullet_auto: 'BULLET_auto', bullet_heavy: 'BULLET_heavy',
  bullet_scatter: 'BULLET_scatter', bullet_sniper: 'BULLET_sniper', bullet_arc: 'BULLET_arc',
};

//  적 그림 파일 목록(정지 그림 기준) — 3상태 그림(r3.26)의 키를 이 목록에서 만든다
export const ENEMY_ART3 = Object.freeze(['E1_scrapbit', 'E2_ramhound', 'E3_wallguard', 'E4_needleeye', 'E5_wheeler', 'E6_signaler',
  'E7_cartyard', 'E8_manholejumper', 'E9_spawnpod', 'E10_magnethead', 'B1_grader', 'B2_gantrywidow', 'B3_railleviathan', 'B4_smelter', 'B5_crownbreaker']);
//  3상태 그림(2026-09-23 Gemini, 이미지프롬프트 v7): 맞는 순간 `hit:` · 크게 부서진 모습 `dmg:` · 파괴 조각 `dead:`.
//   아직 그리지 못한 적은 파일이 없고, 없는 그림은 조용히 폴백된다(종전 정지 그림 + 코드 연출) — 키는 15종 전부 미리 둔다
for (const base of ENEMY_ART3) {
  SPRITE_KEYS3['hit:' + base] = base + '_hit';
  SPRITE_KEYS3['dmg:' + base] = base + '_dmg';
  SPRITE_KEYS3['dead:' + base] = base + '_dead';
}

//  동작 시트(2026-09-18 에테르AI 파일럿, newmode/v3/research/sprite-pilot-20260918): 칸은 열 우선, 같은 크기.
//  refH = 몸통 기준 높이(px) — 렌더는 칸 높이가 아니라 이 값으로 배율을 잡아 걷기·사격·피격·사망 사이에서 몸 크기가 같게 보인다.
//  fps·frames 로 재생 길이가 정해진다(셸 fx 타이머가 이 값을 읽는다). loop=false 는 마지막 칸에 머문다.
export const SHEETS3 = Object.freeze({
  m1_walk:       Object.freeze({ file: 'M01_walk',  cols: 6, frames: 12, fw: 206, fh: 241, fps: 12, loop: true,  refH: 225 }),
  m1_fire:       Object.freeze({ file: 'M01_fire',  cols: 8, frames: 8,  fw: 325, fh: 283, fps: 12, loop: true,  refH: 225 }),
  soldier_walk:  Object.freeze({ file: 'SOLDIER_walk', cols: 6, frames: 12, fw: 202, fh: 231, fps: 12, loop: true, refH: 207 }),
  soldier_fire:  Object.freeze({ file: 'SOLDIER_fire', cols: 8, frames: 8,  fw: 328, fh: 222, fps: 12, loop: true, refH: 207 }),
  //  무기별 사격 시트(2026-09-19, 장착 그림 → 에테르AI): render 는 m1_fire_<weapon> 이 있으면 그것을, 없으면 m1_fire 를 쓴다
  m1_fire_rifle: Object.freeze({ file: 'M01_rifle_fire', cols: 8, frames: 8, fw: 285, fh: 283, fps: 12, loop: true, refH: 271 }),
  m1_fire_auto: Object.freeze({ file: 'M01_auto_fire', cols: 8, frames: 8, fw: 300, fh: 288, fps: 12, loop: true, refH: 275 }),
  m1_fire_heavy: Object.freeze({ file: 'M01_heavy_fire', cols: 8, frames: 8, fw: 248, fh: 372, fps: 12, loop: true, refH: 264 }),
  soldier_fire_rifle: Object.freeze({ file: 'SOLDIER_rifle_fire', cols: 8, frames: 8, fw: 277, fh: 286, fps: 12, loop: true, refH: 266 }),
  soldier_fire_auto: Object.freeze({ file: 'SOLDIER_auto_fire', cols: 8, frames: 8, fw: 338, fh: 317, fps: 12, loop: true, refH: 250 }),
  soldier_fire_heavy: Object.freeze({ file: 'SOLDIER_heavy_fire', cols: 8, frames: 8, fw: 251, fh: 327, fps: 12, loop: true, refH: 264 }),
  e_grunt_hit:   Object.freeze({ file: 'E1_hit',    cols: 6, frames: 12, fw: 244, fh: 255, fps: 24, loop: false, refH: 200 }),
  e_grunt_death: Object.freeze({ file: 'E1_death',  cols: 6, frames: 12, fw: 365, fh: 294, fps: 12, loop: false, refH: 200 }),
  //  r4.8 걷기 동작 시트 자리(이사님 지시 2026-09-26 "적들이 걸어서 내려오는 듯한 스프라이트도 추가하자") → r4.11 파일 반입(2026-09-27 Gemini v9, 8칸 한 주기).
  //   render.drawEnemy 가 코드 움직임(enemyMotionPose) 대신 이 시트를 쓴다(칸 = 걸음 박자 — 두 걸음에 시트 한 바퀴, fps 는 쓰지 않는다).
  //   pending: true 인 자리는 불러오지 않는다(파일이 없을 때 콘솔 404 방지 — 지금은 쓰는 곳 없음)
  e_grunt_walk:  Object.freeze({ file: 'E1_walk',   cols: 8, frames: 8,  fw: 209, fh: 200, fps: 12, loop: true,  refH: 188.8, oy: -0.014 }),
  //  ── r4.11 그림 시트(2026-09-27 Gemini v9 — 이사님 지시 2026-09-26 "보스 광역 대미지 그래픽도 코드로 그리지 말고 이미지를 만들어서 사용하자.
  //   그리고 보스의 피격시, 파괴 시 이미지와 일반 적들의 걸어오는 모습등과 피격등 모든 이미지들을 스프라이트로 만들자").
  //   refH·ox·oy = 정지 그림(assets/rush/<그림>.png)과 몸 높이·몸 가운데가 같게 맞춘 값(newmode/sprites/v9/measure_fit.py 실측) —
  //   ox·oy 는 몸 높이 h 에 대한 비율로, 칸 가운데를 정지 그림 가운데로 옮긴다. 파일이 없으면 null → 종전 정지 그림·코드 연출(폴백)
  //  적 움직임 시트 mv:<그림>(칸 = 걸음·바퀴 박자 — 규칙 거리로 고른다). E1 잡졸은 위 e_grunt_walk. E5 굴러오기는 시트를 쓰지 않는다(코드 회전)
  'mv:E3_wallguard':  Object.freeze({ file: 'E3_walk',  cols: 4, frames: 4, fw: 165, fh: 256, fps: 8, loop: true, refH: 217.0, ox: 0.001, oy: -0.081 }),
  'mv:E2_ramhound':   Object.freeze({ file: 'E2_drive', cols: 4, frames: 4, fw: 256, fh: 225, fps: 8, loop: true, refH: 205.2, ox: 0.001, oy: -0.029 }),
  'mv:E7_cartyard':   Object.freeze({ file: 'E7_drive', cols: 4, frames: 4, fw: 269, fh: 256, fps: 8, loop: true, refH: 248.0, oy: -0.004 }),
  //  적 피격 시트 hs:<그림>([맞음(섬광) · 튕김 · 평상] — 맞자마자 섬광이 보이게 첫 평상 칸은 뺐다). E8 = [섬광 · 평상] · E10 = [젖혀짐 · 평상](둘째 칸이 잘려 나와 못 씀).
  //   E1 잡졸은 종전 12칸 e_grunt_hit. E3 장갑체는 걷기 시트와 몸 비율이 달라(맞을 때마다 모습이 바뀌어 보인다) 피격 시트를 쓰지 않는다(코드 번쩍임)
  'hs:E2_ramhound':      Object.freeze({ file: 'E2_hitsheet',  cols: 3, frames: 3, fw: 269, fh: 256, fps: 14, loop: false, refH: 236.0, ox: 0.002, oy: -0.025 }),
  'hs:E4_needleeye':     Object.freeze({ file: 'E4_hitsheet',  cols: 3, frames: 3, fw: 169, fh: 256, fps: 14, loop: false, refH: 243.0, ox: 0.022, oy: -0.019 }),
  'hs:E5_wheeler':       Object.freeze({ file: 'E5_hitsheet',  cols: 3, frames: 3, fw: 198, fh: 256, fps: 14, loop: false, refH: 247.0, oy: -0.006 }),
  'hs:E6_signaler':      Object.freeze({ file: 'E6_hitsheet',  cols: 3, frames: 3, fw: 204, fh: 256, fps: 14, loop: false, refH: 248.0, ox: 0.002 }),
  'hs:E7_cartyard':      Object.freeze({ file: 'E7_hitsheet',  cols: 3, frames: 3, fw: 251, fh: 256, fps: 14, loop: false, refH: 244.0, oy: -0.008 }),
  'hs:E8_manholejumper': Object.freeze({ file: 'E8_hitsheet',  cols: 2, frames: 2, fw: 236, fh: 256, fps: 10, loop: false, refH: 250.0, oy: -0.004 }),
  'hs:E9_spawnpod':      Object.freeze({ file: 'E9_hitsheet',  cols: 3, frames: 3, fw: 230, fh: 254, fps: 14, loop: false, refH: 254.9, ox: 0.002, oy: 0.018 }),
  'hs:E10_magnethead':   Object.freeze({ file: 'E10_hitsheet', cols: 2, frames: 2, fw: 180, fh: 256, fps: 10, loop: false, refH: 250.0 }),
  //  보스 몸 시트 bd:<그림>([평상 · 맞음 · 폭발 · 잔해]). 보스는 시트가 있으면 **몸 전체를 시트로** 그린다(평상 = 0칸) — 정지 그림과 섞으면
  //   맞을 때마다 두 그림이 번갈아 깜빡여 보인다(B3 은 몸 모양이 조금 다르다). 파괴 = 셸 fx.bossWrecks 가 2 → 3칸
  'bd:B1_grader':        Object.freeze({ file: 'B1_grader_hitdie',        cols: 4, frames: 4, fw: 245, fh: 239, fps: 8, loop: false, refH: 215.2, ox: -0.002, oy: -0.056 }),
  'bd:B2_gantrywidow':   Object.freeze({ file: 'B2_gantrywidow_hitdie',   cols: 4, frames: 4, fw: 271, fh: 256, fps: 8, loop: false, refH: 250.0 }),
  'bd:B3_railleviathan': Object.freeze({ file: 'B3_railleviathan_hitdie', cols: 4, frames: 4, fw: 141, fh: 256, fps: 8, loop: false, refH: 230.0, oy: -0.048 }),
  'bd:B4_smelter':       Object.freeze({ file: 'B4_smelter_hitdie',       cols: 4, frames: 4, fw: 236, fh: 256, fps: 8, loop: false, refH: 233.0, oy: -0.036 }),
  'bd:B5_crownbreaker':  Object.freeze({ file: 'B5_crownbreaker_hitdie',  cols: 4, frames: 4, fw: 279, fh: 256, fps: 8, loop: false, refH: 248.0, oy: 0.008 }),
  //  보스 광역 효과 시트 fx:<공격 종류>(위에서 본 모습 — 칸은 터짐 진행도로 고른다, fps 는 쓰지 않는다). 칸 가운데 = 효과 가운데
  //   (철퇴 mace 만 칸 아래 가운데 = 부채꼴 꼭짓점, 위로 펼쳐진다 · 충격파 quake 는 끊긴 틈이 칸 위쪽 · 레일 rail 은 세로 띠)
  'fx:smoke': Object.freeze({ file: 'fx_b1_smoke', cols: 4, frames: 4, fw: 263, fh: 256, fps: 8, loop: false, refH: 256 }),
  'fx:hook':  Object.freeze({ file: 'fx_b2_hook',  cols: 4, frames: 4, fw: 248, fh: 226, fps: 8, loop: false, refH: 226 }),
  'fx:web':   Object.freeze({ file: 'fx_b2_web',   cols: 3, frames: 3, fw: 237, fh: 256, fps: 8, loop: false, refH: 256 }),
  'fx:rail':  Object.freeze({ file: 'fx_b3_rail',  cols: 3, frames: 3, fw: 129, fh: 384, fps: 8, loop: false, refH: 384 }),
  'fx:pour':  Object.freeze({ file: 'fx_b4_pool',  cols: 3, frames: 3, fw: 278, fh: 256, fps: 8, loop: false, refH: 256 }),
  'fx:rain':  Object.freeze({ file: 'fx_b4_rain',  cols: 4, frames: 4, fw: 224, fh: 216, fps: 8, loop: false, refH: 216 }),
  'fx:mace':  Object.freeze({ file: 'fx_b5_mace',  cols: 3, frames: 3, fw: 246, fh: 256, fps: 8, loop: false, refH: 256 }),
  'fx:quake': Object.freeze({ file: 'fx_b5_quake', cols: 4, frames: 4, fw: 243, fh: 224, fps: 8, loop: false, refH: 224 }),
});
//  r4.11 적 피격 시트 키: 그림(artBase3) → SHEETS3 키 | null. E1 잡졸 = 종전 12칸 e_grunt_hit, 나머지 = hs:<그림>(없으면 null — 코드 번쩍임만)
export function hitSheetKey3(art) {
  if (!art) return null;
  if (art === 'E1_scrapbit') return 'e_grunt_hit';
  return SHEETS3['hs:' + art] ? 'hs:' + art : null;
}
//  r4.11 적 움직임 시트 키: 그림 → SHEETS3 키 | null(E1 = e_grunt_walk · 나머지 = mv:<그림>)
export function moveSheetKey3(art) {
  if (!art) return null;
  if (art === 'E1_scrapbit') return 'e_grunt_walk';
  return SHEETS3['mv:' + art] ? 'mv:' + art : null;
}
export const SHEET_BASE3 = 'assets/rush3/';
//  무기 아이콘(2026-09-19 Gemini 생성, 이미지프롬프트_v5): 6종 × Mk I~III, 옆모습·투명. HUD 칩·보급 통 내용물이 쓴다.
//  규칙에는 아직 강화 단계(Mk)가 없으므로 렌더는 mk 1 을 기본으로 읽는다. 없으면 종전 도형 폴백.
export const WEAPON_ICON_IDS3 = Object.freeze(['rifle', 'auto', 'heavy', 'scatter', 'sniper', 'arc']);
export const WEAPON_ICON_BASE3 = 'assets/rush3/weapons/';
//  시트 재생 길이(초)
export function sheetSec(key) { const m = SHEETS3[key]; return m ? m.frames / m.fps : 0; }

//  r4.12 불러오기 차례(개선 루프 1바퀴 — 첫 화면이 뜨기 전에 그림 139장 37MB 를 전부 받아야 했다. 데스크톱 7초, 휴대폰 회선은 그 몇 배):
//   A = 타이틀(배경 1·주인공 로봇) → 여기서 ready 가 풀려 타이틀이 바로 뜬다 · B = 1판에 바로 쓰는 것(병사·게이트·보급·장치·기본 적 3종과 3상태·탄·
//   히어로/병사 사격·걷기 시트·잡졸 시트·무기 아이콘) · C = 나머지(보스·광역 효과·다른 적·배경 2~5·광장). B 는 A 뒤에, C 는 B 가 끝난 뒤에 받기 시작한다
//   (좁은 회선에서 먼저 쓸 것을 먼저). 늦게 도착한 그림은 같은 Map 에 들어가 렌더가 다음 프레임부터 그린다(없는 동안은 종전 폴백 — 그림 0장으로도 완주 가능).
export const LOAD_TIER_A = Object.freeze(['bg1', 'm1']);
const TIER_B_IMG = new Set(['soldier', 'supply', 'gate', 'vehicle', 'capsule', 'bonus_gift', 'bonus_coin', 'soldiers_1', 'soldiers_2', 'soldiers_3',
  'e_grunt', 'e_rusher', 'e_shooter', 'bullet_rifle', 'bullet_auto', 'bullet_heavy', 'bullet_scatter', 'bullet_sniper', 'bullet_arc',
  ...['E1_scrapbit', 'E5_wheeler', 'E6_signaler'].flatMap((b) => ['hit:' + b, 'dmg:' + b, 'dead:' + b])]);
const TIER_B_SHEET = new Set(['m1_walk', 'm1_fire', 'soldier_walk', 'soldier_fire', 'm1_fire_rifle', 'm1_fire_auto', 'm1_fire_heavy',
  'soldier_fire_rifle', 'soldier_fire_auto', 'soldier_fire_heavy', 'e_grunt_hit', 'e_grunt_death', 'e_grunt_walk', 'hs:E5_wheeler', 'hs:E6_signaler']);
/** 그림 키의 불러오기 차례 'A' | 'B' | 'C'. kind = 'img'(SPRITE_KEYS3) | 'sheet'(SHEETS3) | 'icon'(무기 아이콘 — 모두 B) */
export function loadTier3(kind, key) {
  if (kind === 'icon') return 'B';
  if (kind === 'img') return LOAD_TIER_A.includes(key) ? 'A' : TIER_B_IMG.has(key) ? 'B' : 'C';
  return TIER_B_SHEET.has(key) ? 'B' : 'C';
}
//  r4.12 WebP(같은 크기 · 용량 약 1/6 — tools/webp_build.py 가 PNG 옆에 만든다): 한 번만 확인한다 — 1×1 손실+알파 WebP 를 풀어 본다.
//   (Safari 는 WebP 를 풀 수 있지만 만들지는 못해 canvas.toDataURL 로 확인하면 아이폰에서 '안 됨'이 나온다.) 안 되면 PNG. WebP 한 장이 실패하면 그 그림만 PNG 로 다시
export const WEBP_PROBE = 'data:image/webp;base64,UklGRkoAAABXRUJQVlA4WAoAAAAQAAAAAAAAAAAAQUxQSAwAAAARBxAR/Q9ERP8DAABWUDggGAAAABQBAJ0BKgEAAQAAAP4AAA3AAP7mtQAAAA==';
function probeWebp() {
  return new Promise((res) => {
    let im;
    try { im = new Image(); } catch { res(false); return; }
    im.onload = () => res((im.naturalWidth || im.width) === 1);
    im.onerror = () => res(false);
    im.src = WEBP_PROBE;
  });
}

/** 반환 Promise<{ get, sheet, icon, ready, progress() → { done, total }, all(Promise — 전부 끝남) }> — **A 차례가 끝나면** 풀린다.
 *  opts.webp = false 면 WebP 확인 없이 PNG(개발 대조용) */
export function loadSprites3(base = 'assets/rush/', sheetBase = SHEET_BASE3, opts = {}) {
  const imgs = new Map(), sheets = new Map(), icons = new Map(), ready = new Set();
  let done = 0, total = 0;
  const api = { get: (k) => imgs.get(k) ?? null, sheet: (k) => sheets.get(k) ?? null, icon: (id, mk = 1) => icons.get(id + ':' + mk) ?? null,
                ready, progress: () => ({ done, total }), all: Promise.resolve() };
  //  Image 가 없는 환경(Node)에서는 즉시 빈 결과 — 게임은 폴백으로 돈다
  if (typeof Image === 'undefined') return Promise.resolve(api);
  const tiers = { A: [], B: [], C: [] };
  const add = (tier, path, onOk) => { tiers[tier].push({ path, onOk }); total++; };
  for (const [key, name] of Object.entries(SPRITE_KEYS3)) add(loadTier3('img', key), base + name, (im) => { imgs.set(key, im); ready.add(key); });
  for (const [key, meta] of Object.entries(SHEETS3)) {
    //  r4.8: 아직 파일이 없는 자리(pending)는 요청하지 않는다(콘솔 404 없이 코드 움직임으로)
    if (meta.pending) continue;
    add(loadTier3('sheet', key), sheetBase + meta.file, (im) => { sheets.set(key, { img: im, ...meta }); ready.add(key); });
  }
  for (const id of WEAPON_ICON_IDS3) for (const mk of [1, 2, 3]) add('B', WEAPON_ICON_BASE3 + 'W_' + id + '_' + mk, (im) => { icons.set(id + ':' + mk, im); });
  //  한 장: 성공이든 실패든 끝나면 done 을 센다(실패한 그림은 조용히 폴백 — 기다림이 멈추지 않게). WebP 가 실패하면 그 그림만 PNG 로 한 번 더
  const loadOne = (src, fallback, onOk) => new Promise((res) => {
    let im;
    try { im = new Image(); } catch { done++; res(); return; }
    im.onload = () => { onOk(im); done++; res(); };
    im.onerror = () => { if (fallback) loadOne(fallback, null, onOk).then(res); else { done++; res(); } };
    im.src = src;
  });
  const runTier = (list, ext) => Promise.all(list.map((j) => loadOne(j.path + ext, ext === '.webp' ? j.path + '.png' : null, j.onOk)));
  return (opts.webp === false ? Promise.resolve(false) : probeWebp()).then((webp) => {
    const ext = webp ? '.webp' : '.png';
    api.ext = ext;
    return runTier(tiers.A, ext).then(() => {
      //  B 는 지금 시작, C 는 B 가 끝난 뒤(좁은 회선에서 1판 그림을 먼저). api.all = 전부 끝남(측정·검사용)
      api.all = runTier(tiers.B, ext).then(() => runTier(tiers.C, ext)).then(() => undefined);
      return api;
    });
  });
}
