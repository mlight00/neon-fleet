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

export function loadSprites3(base = 'assets/rush/') {
  const imgs = new Map(), ready = new Set();
  //  Image 가 없는 환경(Node)에서는 즉시 빈 결과 — 게임은 폴백으로 돈다
  if (typeof Image === 'undefined') return Promise.resolve({ get: () => null, ready });
  const jobs = Object.entries(SPRITE_KEYS3).map(([key, name]) => new Promise((res) => {
    let im;
    try { im = new Image(); } catch { res(); return; }
    im.onload = () => { imgs.set(key, im); ready.add(key); res(); };
    //  없는 그림은 조용히 폴백
    im.onerror = () => res();
    im.src = base + name + '.png';
  }));
  return Promise.all(jobs).then(() => ({ get: (k) => imgs.get(k) ?? null, ready }));
}
