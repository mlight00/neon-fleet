// rush3/sprites.js — rush/sprites.js 복제(v3 키). 있으면 그림, 없으면 null(호출부가 도형 폴백). 그림 0장으로도 완주 가능.
export const SPRITE_KEYS3 = {
  //  아군: 히어로 1단 + 병사
  m1: 'M01', soldier: 'SOLDIER',
  //  보급 통·게이트
  supply: 'SUPPLY', gate: 'GATE',
  //  배경 3구간(스테이지 1~3)
  bg1: 'BG1', bg2: 'BG2', bg3: 'BG3',
  //  적 3종(계약서 e_shooter='E4_signaler'는 파일이 없어 실존 E6_signaler로 매핑)
  e_grunt: 'E1_scrapbit', e_rusher: 'E5_wheeler', e_shooter: 'E6_signaler',
  //  정예
  elite: 'B1_grader',
};

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
  m1_fire_heavy: Object.freeze({ file: 'M01_heavy_fire', cols: 8, frames: 8, fw: 478, fh: 328, fps: 12, loop: true, refH: 266 }),
  soldier_fire_rifle: Object.freeze({ file: 'SOLDIER_rifle_fire', cols: 8, frames: 8, fw: 277, fh: 286, fps: 12, loop: true, refH: 266 }),
  soldier_fire_auto: Object.freeze({ file: 'SOLDIER_auto_fire', cols: 8, frames: 8, fw: 338, fh: 317, fps: 12, loop: true, refH: 250 }),
  soldier_fire_heavy: Object.freeze({ file: 'SOLDIER_heavy_fire', cols: 8, frames: 8, fw: 469, fh: 326, fps: 12, loop: true, refH: 260 }),
  e_grunt_hit:   Object.freeze({ file: 'E1_hit',    cols: 6, frames: 12, fw: 244, fh: 255, fps: 24, loop: false, refH: 200 }),
  e_grunt_death: Object.freeze({ file: 'E1_death',  cols: 6, frames: 12, fw: 365, fh: 294, fps: 12, loop: false, refH: 200 }),
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
    jobs.push(load(sheetBase + meta.file + '.png', (im) => { sheets.set(key, { img: im, ...meta }); ready.add(key); }));
  }
  for (const id of WEAPON_ICON_IDS3) for (const mk of [1, 2, 3]) {
    jobs.push(load(WEAPON_ICON_BASE3 + 'W_' + id + '_' + mk + '.png', (im) => { icons.set(id + ':' + mk, im); }));
  }
  return Promise.all(jobs).then(() => ({ get: (k) => imgs.get(k) ?? null, sheet: (k) => sheets.get(k) ?? null,
                                        icon: (id, mk = 1) => icons.get(id + ':' + mk) ?? null, ready }));
}
