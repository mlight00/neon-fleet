// rush3/audio.js — rush/audio.js 복제(v3 SFX 맵). 기존 사운드 자산(assets/sound)만 공유, 코드 의존 없음.
//  Node 에서 import 만 해도 죽지 않는다(Audio/window 없으면 전부 no-op). 첫 입력에서 unlock(자동재생 정책).

//  용도별 파일(변형은 라운드로빈). 6장 오디오 이벤트 이름 → 실존 파일. 없는 음은 유사음 재사용.
const SFX = {
  fire_rifle: ['nf_sfx_vulcan_1', 'nf_sfx_vulcan_2', 'nf_sfx_vulcan_3'],
  fire_auto:  ['nf_sfx_laser_1', 'nf_sfx_laser_2', 'nf_sfx_laser_3'],
  fire_heavy: ['nf_sfx_missile_1', 'nf_sfx_missile_2'],
  //  통 피격·파괴: hit(단타) / pickup(보상 팝)
  crateHit:   ['nf_sfx_hit_1', 'nf_sfx_hit_2', 'nf_sfx_hit_3'],
  crateBreak: ['nf_sfx_pickup_1', 'nf_sfx_pickup_2'],
  //  게이트 숫자 증가·음수→양수 전환
  gateTick:   ['nf_sfx_crystal_1', 'nf_sfx_crystal_2'],
  gateFlip:   ['nf_sfx_gate_good_1', 'nf_sfx_gate_good_2'],
  //  게이트 셔터 열림(사격 활성 구간 진입) — 행마다 1회
  gateOpen:   ['nf_sfx_gate_good_1'],
  //  닫힌 셔터에 탄이 막힘 = 금속 튕김(피격음과 다른 계열이라 '지금은 안 먹힌다'가 소리로도 구분된다)
  gateClang:  ['nf_sfx_shield_pop_1', 'nf_sfx_shield_pop_2'],
  //  랜덤 길 위험 항목 공개 = 중립 경고음(피격음이 아니다 — 무력화 성공을 흐리지 않게, 2026-09-17 검수 N4)
  lotWarn:    ['nf_sfx_telegraph_1'],
  //  함정(확정 손실) 게이트에 탄이 맞음 = 둔탁한 차단음. 셔터의 금속 튕김(gateClang)과 다른 계열이라
  //   '잠깐 막힌 것'과 '아예 안 먹히는 장치'가 소리로도 구분된다(2026-09-17 이사 결정 ③)
  trapHit:    ['nf_sfx_hit_1', 'nf_sfx_hit_2'],
  //  3명 이상 합류·무기 교체
  joinMany:   ['nf_sfx_evolve_1'],
  weaponSwap: ['nf_sfx_buy_1'],
  hurt:       ['nf_sfx_damage_1', 'nf_sfx_damage_2'],
  kill:       ['nf_sfx_explode_s_1', 'nf_sfx_explode_s_2', 'nf_sfx_explode_s_3'],
  //  정예 등장 / 승리(정예 폭발) / 패배(강등음 재사용)
  elite:      ['nf_sfx_boss_in_1'],
  win:        ['nf_sfx_explode_l_1', 'nf_sfx_explode_l_2'],
  lose:       ['nf_sfx_demote_1'],
  click:      ['nf_sfx_click_1'],
};
//  이름별 스로틀(초). 기본 0.045, 아래는 예외
const THROTTLE = { crateHit: 0.03, kill: 0.08, hurt: 0.25, gateTick: 0.03, gateClang: 0.09, trapHit: 0.09 };
const THROTTLE_DEFAULT = 0.045;
const VOL = { fire_rifle: 0.11, fire_auto: 0.11, fire_heavy: 0.14, crateHit: 0.35, crateBreak: 0.7, gateTick: 0.4, gateFlip: 0.6, gateOpen: 0.45,
              gateClang: 0.3, lotWarn: 0.55, trapHit: 0.4,
              joinMany: 0.8, weaponSwap: 0.6, hurt: 0.55, kill: 0.4, elite: 0.8, win: 0.8, lose: 0.75, click: 0.5 };
//  이름별 Audio 풀 크기(순환) · 전체 동시 재생 상한
const POOL_SIZE = 4;
const MAX_CONCURRENT = 12;

export const SFX_NAMES3 = Object.freeze(Object.keys(SFX));
//  이름 → 실존 파일 목록(검사에서 assets/sound 에 그 .ogg 가 있는지 대조한다 — 없는 파일을 매핑하면 소리가 조용히 사라진다)
export const SFX_FILES3 = Object.freeze(Object.fromEntries(Object.entries(SFX).map(([k, v]) => [k, Object.freeze(v.slice())])));

export function createAudio3({ dir = 'assets/sound/' } = {}) {
  const hasAudio = typeof Audio !== 'undefined';
  let unlocked = false;
  let muted = false;
  //  라운드로빈 인덱스 · 마지막 재생 시각 · 이름별 Audio 풀
  const rr = {};
  const lastAt = {};
  const pools = {};
  let playing = 0;
  let bgmEl = null;
  if (hasAudio) { try { bgmEl = new Audio(); bgmEl.loop = true; } catch { bgmEl = null; } }
  let bgmName = null, baseVol = 0.45, duckMult = 1, volMult = 1;
  const clock = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()) / 1000;

  function applyBgmVol() { if (bgmEl) bgmEl.volume = baseVol * duckMult * volMult; }
  function bgmPlay(name) {
    if (!bgmEl || !name || bgmName === name) return;
    bgmName = name;
    bgmEl.src = dir + name + '.ogg';
    applyBgmVol();
    if (unlocked && !muted) bgmEl.play().catch(() => {});
  }
  //  이름·파일별 풀에서 다음 Audio 를 꺼낸다(생성 실패 시 null). src 는 생성 때 한 번만 — 재생마다 파일을 재요청하지 않게
  function acquire(name, file, perFile = POOL_SIZE) {
    const key = name + ':' + file;
    const pool = pools[key] ?? (pools[key] = { els: [], i: 0 });
    let a;
    if (pool.els.length < perFile) {
      try { a = new Audio(); } catch { return null; }
      a.addEventListener('ended', () => { playing = Math.max(0, playing - 1); });
      a.src = dir + file + '.ogg';
      pool.els.push(a);
    } else {
      a = pool.els[pool.i]; pool.i = (pool.i + 1) % pool.els.length;
      //  재사용 중이던 객체는 끝난 것으로 셈
      if (!a.paused && !a.ended) playing = Math.max(0, playing - 1);
    }
    return a;
  }

  return {
    //  첫 pointerdown 에서 호출
    unlock() {
      if (unlocked) return;
      unlocked = true;
      if (bgmEl && bgmName && !muted) bgmEl.play().catch(() => {});
    },
    isUnlocked() { return unlocked; },
    isMuted() { return muted; },
    getVolume() { return volMult; },
    setVolume(v) {
      volMult = Math.max(0, Math.min(1, Number(v) || 0));
      applyBgmVol();
    },
    setMuted(v) {
      muted = !!v;
      if (bgmEl) { if (muted) bgmEl.pause(); else if (unlocked && bgmName) bgmEl.play().catch(() => {}); }
    },
    bgmPlay,
    bgmPause() { if (bgmEl) bgmEl.pause(); },
    bgmResume() { if (bgmEl && unlocked && bgmName && !muted) bgmEl.play().catch(() => {}); },
    bgmName() { return bgmName; },
    //  보스 앞 정적: 0~1 (1=평상시)
    duck(mult) {
      duckMult = Math.max(0, Math.min(1, Number(mult) || 0));
      applyBgmVol();
    },
    //  효과음. opts.vol = 0~1 배율(기본 1), opts.throttle = 이름별 스로틀 덮어쓰기(초)
    sfx(name, opts = {}) {
      if (!hasAudio || !unlocked || muted) return false;
      const files = SFX[name];
      if (!files) return false;
      const now = clock();
      const th = opts.throttle ?? THROTTLE[name] ?? THROTTLE_DEFAULT;
      if (th > 0 && now - (lastAt[name] ?? -9) < th) return false;
      if (playing >= MAX_CONCURRENT) return false;
      lastAt[name] = now;
      rr[name] = ((rr[name] ?? -1) + 1) % files.length;
      //  이름당 총 POOL_SIZE 개를 파일들이 나눠 갖는다(발사음만으로 동시 상한을 채우지 않게)
      const a = acquire(name, files[rr[name]], Math.max(1, Math.ceil(POOL_SIZE / files.length)));
      if (!a) return false;
      const mult = Math.max(0, Math.min(1, opts.vol ?? 1));
      a.volume = Math.max(0, Math.min(1, (VOL[name] ?? 0.5) * mult * volMult));
      playing++;
      try { a.currentTime = 0; } catch { /* 소스 미로드 시 무시 */ }
      const p = a.play();
      if (p && p.catch) p.catch(() => { playing = Math.max(0, playing - 1); });
      return true;
    },
  };
}
