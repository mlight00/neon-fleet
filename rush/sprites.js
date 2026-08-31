// rush/sprites.js — 있으면 그림, 없으면 null(호출부가 도형 폴백). 게임은 그림 0장으로도 완주 가능해야 한다.
export const SPRITE_KEYS = {
  m1: 'M01', m2: 'M02', m3: 'M03', m4: 'M04', m5: 'M05',
  e_scrapbit: 'E1_scrapbit', e_ramhound: 'E2_ramhound', e_wallguard: 'E3_wallguard',
  e_needleeye: 'E4_needleeye', e_boss: 'E5_crownbreaker', gate: 'GATE',
};

export function loadSprites(base = 'assets/rush/') {
  const imgs = new Map(), ready = new Set();
  const jobs = Object.entries(SPRITE_KEYS).map(([key, name]) => new Promise((res) => {
    const im = new Image();
    im.onload = () => { imgs.set(key, im); ready.add(key); res(); };
    im.onerror = () => res();                       // 없는 그림은 조용히 폴백
    im.src = base + name + '.png';
  }));
  return Promise.all(jobs).then(() => ({ get: (k) => imgs.get(k) ?? null, ready }));
}
