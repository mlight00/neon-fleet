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
  //  r4.8 걷기 동작 시트 **자리**(이사님 지시 2026-09-26 "적들이 걸어서 내려오는 듯한 스프라이트도 추가하자") — 파일은 아직 없다(그림 제작은 따로).
  //   assets/rush3/E1_walk.png 가 들어오면 render.drawEnemy 가 코드 움직임(enemyMotionPose) 대신 이 시트를 쓴다(칸 = 걸음 박자 — 두 걸음에 시트 한 바퀴, fps 는 쓰지 않는다).
  //   pending: true = 파일이 아직 없어 **불러오지 않는다**(없는 파일을 매번 요청하면 브라우저 콘솔에 404 오류가 남는다) — 그동안은 코드 움직임.
  //   ⚠️파일을 넣을 때: ① pending 을 지운다 ② cols·frames·fw·fh·refH 를 그 시트에 맞춰 고친다(지금 값은 같은 잡졸의 피격 시트 E1_hit 꼴 — 자리값)
  e_grunt_walk:  Object.freeze({ file: 'E1_walk',   cols: 6, frames: 12, fw: 244, fh: 255, fps: 12, loop: true,  refH: 200, pending: true }),
});
export const SHEET_BASE3 = 'assets/rush3/';
//  무기 아이콘(2026-09-19 Gemini 생성, 이미지프롬프트_v5): 6종 × Mk I~III, 옆모습·투명. HUD 칩·보급 통 내용물이 쓴다.
//  규칙에는 아직 강화 단계(Mk)가 없으므로 렌더는 mk 1 을 기본으로 읽는다. 없으면 종전 도형 폴백.
export const WEAPON_ICON_IDS3 = Object.freeze(['rifle', 'auto', 'heavy', 'scatter', 'sniper', 'arc']);
export const WEAPON_ICON_BASE3 = 'assets/rush3/weapons/';
//  시트 재생 길이(초)
export function sheetSec(key) { const m = SHEETS3[key]; return m ? m.frames / m.fps : 0; }

export function loadSprites3(base = 'assets/rush/', sheetBase = SHEET_BASE3) {
  const imgs = new Map(), sheets = new Map(), icons = new Map(), ready = new Set();
  //  Image 가 없는 환경(Node)에서는 즉시 빈 결과 — 게임은 폴백으로 돈다
  if (typeof Image === 'undefined') return Promise.resolve({ get: () => null, sheet: () => null, icon: () => null, ready });
  const load = (src, onOk) => new Promise((res) => {
    let im;
    try { im = new Image(); } catch { res(); return; }
    im.onload = () => { onOk(im); res(); };
    //  없는 그림은 조용히 폴백
    im.onerror = () => res();
    im.src = src;
  });
  const jobs = Object.entries(SPRITE_KEYS3).map(([key, name]) => load(base + name + '.png', (im) => { imgs.set(key, im); ready.add(key); }));
  for (const [key, meta] of Object.entries(SHEETS3)) {
    //  r4.8: 아직 파일이 없는 자리(pending)는 요청하지 않는다(콘솔 404 없이 코드 움직임으로)
    if (meta.pending) continue;
    jobs.push(load(sheetBase + meta.file + '.png', (im) => { sheets.set(key, { img: im, ...meta }); ready.add(key); }));
  }
  for (const id of WEAPON_ICON_IDS3) for (const mk of [1, 2, 3]) {
    jobs.push(load(WEAPON_ICON_BASE3 + 'W_' + id + '_' + mk + '.png', (im) => { icons.set(id + ':' + mk, im); }));
  }
  return Promise.all(jobs).then(() => ({ get: (k) => imgs.get(k) ?? null, sheet: (k) => sheets.get(k) ?? null,
                                        icon: (id, mk = 1) => icons.get(id + ':' + mk) ?? null, ready }));
}
