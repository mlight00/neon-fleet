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
  e_grunt_hit:   Object.freeze({ file: 'E1_hit',    cols: 6, frames: 12, fw: 244, fh: 255, fps: 24, loop: false, refH: 200 }),
  e_grunt_death: Object.freeze({ file: 'E1_death',  cols: 6, frames: 12, fw: 365, fh: 294, fps: 12, loop: false, refH: 200 }),
});
export const SHEET_BASE3 = 'assets/rush3/';
//  시트 재생 길이(초)
export function sheetSec(key) { const m = SHEETS3[key]; return m ? m.frames / m.fps : 0; }

export function loadSprites3(base = 'assets/rush/', sheetBase = SHEET_BASE3) {
  const imgs = new Map(), sheets = new Map(), ready = new Set();
  //  Image 가 없는 환경(Node)에서는 즉시 빈 결과 — 게임은 폴백으로 돈다
  if (typeof Image === 'undefined') return Promise.resolve({ get: () => null, sheet: () => null, ready });
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
  return Promise.all(jobs).then(() => ({ get: (k) => imgs.get(k) ?? null, sheet: (k) => sheets.get(k) ?? null, ready }));
}
