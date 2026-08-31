// rush/sprites.js — 있으면 그림, 없으면 null(호출부가 도형 폴백). 게임은 그림 0장으로도 완주 가능해야 한다.
export const SPRITE_KEYS = {
  //  아군: 히어로 5단 + 병사(군단원)
  m1: 'M01', m2: 'M02', m3: 'M03', m4: 'M04', m5: 'M05',
  soldier: 'SOLDIER',
  //  적 10종 (구간 순)
  e_scrapbit: 'E1_scrapbit', e_wheeler: 'E5_wheeler',
  e_ramhound: 'E2_ramhound', e_signaler: 'E6_signaler',
  e_wallguard: 'E3_wallguard', e_cartyard: 'E7_cartyard',
  e_needleeye: 'E4_needleeye', e_manholejumper: 'E8_manholejumper',
  e_spawnpod: 'E9_spawnpod', e_magnethead: 'E10_magnethead',
  //  구간 보스 5종
  b1: 'B1_grader', b2: 'B2_gantrywidow', b3: 'B3_railleviathan', b4: 'B4_smelter', b5: 'B5_crownbreaker',
  //  게이트·배경 5구간
  gate: 'GATE',
  bg1: 'BG1', bg2: 'BG2', bg3: 'BG3', bg4: 'BG4', bg5: 'BG5',
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
