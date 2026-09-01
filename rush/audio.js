// rush/audio.js — 기존 네온함대 사운드 자산(assets/sound)을 그대로 쓰는 경량 재생기.
//  코드 의존은 없이 파일만 공유한다(클린룸). 첫 입력에서 unlock(브라우저 자동재생 정책).
const DIR = 'assets/sound/';

//  용도별 파일(변형은 라운드로빈). 이름은 기존 게임 자산 그대로.
const SFX = {
  fire:    ['nf_sfx_vulcan_1', 'nf_sfx_vulcan_2', 'nf_sfx_vulcan_3'],
  kill:    ['nf_sfx_explode_s_1', 'nf_sfx_explode_s_2', 'nf_sfx_explode_s_3'],
  bossDie: ['nf_sfx_explode_l_1', 'nf_sfx_explode_l_2'],
  hurt:    ['nf_sfx_damage_1', 'nf_sfx_damage_2'],
  gateGood: ['nf_sfx_gate_good_1', 'nf_sfx_gate_good_2'],
  gateBad: ['nf_sfx_gate_bad_1', 'nf_sfx_gate_bad_2'],
  bossIn:  ['nf_sfx_boss_in_1'],
  evolve:  ['nf_sfx_evolve_1'],
  buy:     ['nf_sfx_buy_1'],
  click:   ['nf_sfx_click_1'],
  record:  ['nf_sfx_charge_full_1'],
};
const THROTTLE = { fire: 0.09, kill: 0.08, hurt: 0.25 };   // 연타 소음 방지(초)
const VOL = { fire: 0.16, kill: 0.4, bossDie: 0.8, hurt: 0.55, gateGood: 0.6, gateBad: 0.6,
              bossIn: 0.8, evolve: 0.8, buy: 0.6, click: 0.5, record: 0.7 };

export function createAudio() {
  let unlocked = false;
  const rr = {};                                     // 라운드로빈 인덱스
  const lastAt = {};
  const bgmEl = typeof Audio !== 'undefined' ? new Audio() : null;
  if (bgmEl) { bgmEl.loop = true; }
  let bgmName = null, baseVol = 0.45, duckMult = 1;

  function playBgm(name) {
    if (!bgmEl || bgmName === name) return;
    bgmName = name;
    bgmEl.src = DIR + name + '.ogg';
    bgmEl.volume = baseVol * duckMult;
    if (unlocked) bgmEl.play().catch(() => {});
  }

  return {
    unlock() {                                       // 첫 pointerdown 에서 호출
      if (unlocked) return;
      unlocked = true;
      if (bgmEl && bgmName) bgmEl.play().catch(() => {});
    },
    bgmBattle() { playBgm('nf_bgm_battle1'); },
    /** 구간별 보스곡: 1~2구간=sector1, 3구간=sector2, 4구간=sector3, 최종=boss */
    bgmBoss(zone = 4) {
      const pick = ['nf_bgm_boss_sector1', 'nf_bgm_boss_sector1', 'nf_bgm_boss_sector2', 'nf_bgm_boss_sector3', 'nf_bgm_boss'][zone] ?? 'nf_bgm_boss';
      playBgm(pick);
    },
    /** A-3 보스 앞 정적: 0~1 (1=평상시) */
    duck(mult) {
      duckMult = mult;
      if (bgmEl) bgmEl.volume = baseVol * duckMult;
    },
    sfx(name) {
      if (!unlocked || typeof Audio === 'undefined') return;
      const files = SFX[name];
      if (!files) return;
      const now = performance.now() / 1000;
      if (THROTTLE[name] && now - (lastAt[name] ?? -9) < THROTTLE[name]) return;
      lastAt[name] = now;
      rr[name] = ((rr[name] ?? -1) + 1) % files.length;
      const a = new Audio(DIR + files[rr[name]] + '.ogg');
      a.volume = VOL[name] ?? 0.5;
      a.play().catch(() => {});
    },
  };
}
