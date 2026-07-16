// 오디오 시스템: BGM(크로스페이드) + 효과음(WebAudio 합성음).
// 브라우저 자동재생 정책 때문에 첫 사용자 제스처에서 unlock() 호출 필요.
// 파일/컨텍스트 실패 시 전부 무음으로 조용히 폴백 (게임 진행에 영향 없음).

const BGM_FILES = {
  title: 'assets/sound/nf_bgm_title',
  battle1: 'assets/sound/nf_bgm_battle1',
  boss: 'assets/sound/nf_bgm_boss',
};

let ctx = null;
let masterSfx = null;   // 효과음 마스터 게인
let masterBgm = null;   // BGM 마스터 게인
let unlocked = false;
let settings = { bgm: 0.5, sfx: 0.8, mute: false };
let saveRef = null;     // save 객체 (설정 영속화)
// 효과음 전역 감쇠: 베이스 합성음이 커서 슬라이더를 낮춰도 시끄러웠음 → 실제 출력 = 슬라이더값 × 이 배수.
// (밤시간·저볼륨 환경 대응. 슬라이더는 이 배수 위에서 비례 조절된다.)
const SFX_MASTER = 0.1;

const bgmBuffers = {};  // name → AudioBuffer | null(로드실패)
let bgmSlot = null;     // { name, src, gain }
let pendingBgm = null;  // unlock 전에 요청된 BGM
let bgmIntensity = 0.35; // 0=항해/여백, 1=보스 절정. 곡을 바꾸지 않고 음색·체감을 적응시킨다.

// ElevenLabs 실효과음: id → 변형 개수. 있으면 합성음보다 우선 재생.
const SFX_SAMPLES = {
  vulcan: 3, laser: 3, missile: 2, hit: 3, explode_s: 3, explode_l: 2,
  crystal: 2, gate_good: 2, gate_bad: 2, pickup: 2, evolve: 1, demote: 1,
  shield_on: 1, shield_pop: 2, damage: 2, telegraph: 1, boss_in: 1,
  boss_die: 1, click: 1, buy: 1,
  charge_up: 4, charge_full: 4, lance_fire: 4,
};
// 연사·타격 계열은 피치를 랜덤 변조해 반복감을 없앤다 (연사 기관총 느낌)
const SFX_PITCH = {
  vulcan: 0.12, laser: 0.10, missile: 0.08, hit: 0.15, tracer: 0.12,
  explode_s: 0.10, explode_l: 0.06, damage: 0.08, charge_up: 0.06,
};
const sampleBuffers = {}; // `${id}:${n}` → AudioBuffer | null
let samplesReady = false;

// 효과음 스로틀: id별 마지막 재생 시각 + 동시 상한
const lastPlay = {};
const COOLDOWN = { // 초 — 연사 계열은 짧게
  vulcan: 0.05, laser: 0.06, missile: 0.09, hit: 0.04, tracer: 0.05,
  damage: 0.08, telegraph: 0.25,
};

export function initAudio(save) {
  saveRef = save;
  const s = save?.get?.().snd;
  if (s) settings = { ...settings, ...s };
}

/** 첫 사용자 제스처에서 호출 — AudioContext 생성/재개 */
export function unlockAudio() {
  if (unlocked) return;
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    masterBgm = ctx.createGain();
    masterSfx = ctx.createGain();
    masterBgm.gain.value = settings.mute ? 0 : settings.bgm;
    masterSfx.gain.value = settings.mute ? 0 : settings.sfx * SFX_MASTER;
    masterBgm.connect(ctx.destination);
    // SFX 버스에 컴프레서 → 타격감(펀치)과 글루. 무기 소리를 묵직하게.
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12;
    comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.12;
    masterSfx.connect(comp).connect(ctx.destination);
    unlocked = true;
    if (ctx.state === 'suspended') ctx.resume();
    loadSamples(); // 실효과음 백그라운드 로드
    if (pendingBgm) { const p = pendingBgm; pendingBgm = null; playBgm(p); }
  } catch {
    ctx = null;
  }
}

function applyVolumes() {
  if (!ctx) return;
  masterBgm.gain.setTargetAtTime(settings.mute ? 0 : settings.bgm, ctx.currentTime, 0.05);
  masterSfx.gain.setTargetAtTime(settings.mute ? 0 : settings.sfx * SFX_MASTER, ctx.currentTime, 0.05);
}

export function getSettings() { return { ...settings }; }
export function isMuted() { return settings.mute; }
export function toggleMute() {
  settings.mute = !settings.mute;
  applyVolumes();
  saveRef?.set?.({ snd: { ...settings } });
  return settings.mute;
}
export function setBgmVolume(v) {
  settings.bgm = Math.max(0, Math.min(1, v));
  applyVolumes();
  saveRef?.set?.({ snd: { ...settings } });
}
export function setSfxVolume(v) {
  settings.sfx = Math.max(0, Math.min(1, v));
  applyVolumes();
  saveRef?.set?.({ snd: { ...settings } });
}

// ───────────────────────── BGM
async function loadBgm(name) {
  if (name in bgmBuffers) return bgmBuffers[name];
  bgmBuffers[name] = null;
  const base = BGM_FILES[name];
  if (!base || !ctx) return null;
  // OGG 우선, 실패 시 MP3
  for (const ext of ['.ogg', '.mp3']) {
    try {
      const res = await fetch(base + ext);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      bgmBuffers[name] = decoded;
      return decoded;
    } catch { /* 다음 포맷 시도 */ }
  }
  return null;
}

export async function playBgm(name, { fade = 1.2 } = {}) {
  if (!unlocked) { pendingBgm = name; return; }
  if (bgmSlot && bgmSlot.name === name) return; // 이미 재생 중
  const buffer = await loadBgm(name);
  const now = ctx.currentTime;

  // 이전 곡 페이드아웃 후 정지
  if (bgmSlot) {
    const old = bgmSlot;
    old.gain.gain.cancelScheduledValues(now);
    old.gain.gain.setValueAtTime(old.gain.gain.value, now);
    old.gain.gain.linearRampToValueAtTime(0, now + fade);
    try { old.src.stop(now + fade + 0.05); } catch {}
    bgmSlot = null;
  }
  if (!buffer) return; // 로드 실패 — 무음

  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const gain = ctx.createGain();
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 0.55;
  filter.frequency.value = 1100 + bgmIntensity * 8900;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(1, now + fade);
  src.connect(filter).connect(gain).connect(masterBgm);
  src.start(now);
  bgmSlot = { name, src, gain, filter };
}

/**
 * 전투 강도에 따라 BGM의 고역 개방과 미세한 재생 속도를 바꾼다.
 * 새 음원이 들어오면 같은 API 뒤에 레이어를 추가할 수 있는 Phase A 기반이다.
 */
export function setBgmIntensity(value) {
  bgmIntensity = Math.max(0, Math.min(1, Number(value) || 0));
  if (!ctx || !bgmSlot) return;
  const now = ctx.currentTime;
  bgmSlot.filter?.frequency?.setTargetAtTime(1100 + bgmIntensity * 8900, now, 0.18);
  bgmSlot.src.playbackRate?.setTargetAtTime(0.985 + bgmIntensity * 0.03, now, 0.25);
}

export function stopBgm({ fade = 0.6 } = {}) {
  if (!ctx || !bgmSlot) { pendingBgm = null; return; }
  const now = ctx.currentTime;
  const old = bgmSlot;
  old.gain.gain.cancelScheduledValues(now);
  old.gain.gain.setValueAtTime(old.gain.gain.value, now);
  old.gain.gain.linearRampToValueAtTime(0, now + fade);
  try { old.src.stop(now + fade + 0.05); } catch {}
  bgmSlot = null;
}

// ───────────────────────── 효과음 합성 프리미티브
function tone(t0, { freq, freq2, type = 'sine', dur, vol = 0.3, attack = 0.005, dest }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (freq2 != null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + attack);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  osc.connect(g).connect(dest || masterSfx);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

// 새추레이션 커브 (WaveShaper) — 캐시. amount 클수록 그릿/왜곡 강함.
const shaperCache = {};
function makeShaper(amount) {
  const key = amount | 0;
  if (shaperCache[key]) return shaperCache[key];
  const n = 1024;
  const curve = new Float32Array(n);
  const k = amount;
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = ((1 + k) * x) / (1 + k * Math.abs(x)); // 소프트 클립
  }
  const ws = ctx.createWaveShaper();
  ws.curve = curve;
  shaperCache[key] = ws;
  return ws;
}

// 묵직한 저역 펀치: 사인 서브 + 새추레이션 (무기 바디용)
function subPunch(t0, { freq, freq2, dur, vol, sat = 6, dest }) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freq2), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  const ws = makeShaper(sat);
  osc.connect(ws).connect(g).connect(dest || masterSfx);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

let noiseBuf = null;
function noise(t0, { dur, vol = 0.3, filter = 'bandpass', freq = 1200, q = 1, freqEnd, dest }) {
  if (!noiseBuf) {
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  const bp = ctx.createBiquadFilter();
  bp.type = filter; bp.frequency.setValueAtTime(freq, t0); bp.Q.value = q;
  if (freqEnd != null) bp.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0008, t0 + dur);
  src.connect(bp).connect(g).connect(dest || masterSfx);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// 이벤트 id → 합성 레시피
const SFX = {
  // 발칸: 육중한 펄스 캐논 — 날카로운 노이즈 어택 + 새추레이션 서브베이스(쿵) + 저역 노이즈 바디
  vulcan: (t) => {
    noise(t, { dur: 0.04, vol: 0.22, filter: 'highpass', freq: 1700, q: 0.7 }); // 어택 탁
    subPunch(t, { freq: 200, freq2: 48, dur: 0.14, vol: 0.5, sat: 8 });          // 서브베이스 쿵
    noise(t, { dur: 0.08, vol: 0.14, filter: 'lowpass', freq: 700, freqEnd: 180 }); // 바디 두께
    tone(t, { freq: 520, freq2: 130, type: 'sawtooth', dur: 0.05, vol: 0.06 });   // 에너지 색
  },
  tracer: (t) => { noise(t, { dur: 0.03, vol: 0.05, filter: 'highpass', freq: 2400 }); tone(t, { freq: 300, freq2: 120, type: 'sine', dur: 0.04, vol: 0.05 }); },
  // 레이저: 두꺼운 에너지 자프 — 하강 스윕 + 새추레이션 저역 + 스파클
  laser: (t) => {
    tone(t, { freq: 2000, freq2: 440, type: 'sine', dur: 0.16, vol: 0.16 });      // 하강 자프
    subPunch(t, { freq: 300, freq2: 90, dur: 0.13, vol: 0.34, sat: 6 });          // 두꺼운 저역
    noise(t, { dur: 0.06, vol: 0.10, filter: 'bandpass', freq: 3400, q: 1.6 });   // 스파클
  },
  // 호밍: 굵은 로켓 발사 — 점화 클릭 + 로켓 슉 + 새추레이션 럼블
  missile: (t) => {
    noise(t, { dur: 0.035, vol: 0.18, filter: 'highpass', freq: 2400 });          // 점화 클릭
    noise(t, { dur: 0.34, vol: 0.20, filter: 'bandpass', freq: 450, freqEnd: 2000, q: 0.6 }); // 슉
    subPunch(t, { freq: 150, freq2: 44, dur: 0.32, vol: 0.4, sat: 7 });           // 럼블
  },
  hit: (t) => { noise(t, { dur: 0.05, vol: 0.12, filter: 'bandpass', freq: 2600, q: 0.8 }); },
  explode_s: (t) => { noise(t, { dur: 0.35, vol: 0.35, filter: 'lowpass', freq: 1800, freqEnd: 300 }); tone(t, { freq: 180, freq2: 60, type: 'sine', dur: 0.3, vol: 0.2 }); },
  explode_l: (t) => { noise(t, { dur: 0.7, vol: 0.5, filter: 'lowpass', freq: 1400, freqEnd: 150 }); tone(t, { freq: 120, freq2: 40, type: 'sine', dur: 0.6, vol: 0.35 }); },
  crystal: (t) => { [880, 1175, 1568].forEach((f, i) => tone(t + i * 0.05, { freq: f, type: 'triangle', dur: 0.18, vol: 0.16 })); },
  gate_good: (t) => { tone(t, { freq: 520, type: 'triangle', dur: 0.12, vol: 0.18 }); tone(t + 0.08, { freq: 780, type: 'triangle', dur: 0.18, vol: 0.18 }); },
  gate_bad: (t) => { tone(t, { freq: 400, type: 'sawtooth', dur: 0.12, vol: 0.16 }); tone(t + 0.08, { freq: 240, type: 'sawtooth', dur: 0.2, vol: 0.16 }); },
  pickup: (t) => { tone(t, { freq: 660, freq2: 1320, type: 'square', dur: 0.12, vol: 0.16 }); },
  evolve: (t) => { tone(t, { freq: 300, freq2: 1400, type: 'sawtooth', dur: 0.5, vol: 0.22 }); [523, 659, 784, 1046].forEach((f, i) => tone(t + 0.25 + i * 0.06, { freq: f, type: 'triangle', dur: 0.3, vol: 0.16 })); },
  demote: (t) => { tone(t, { freq: 500, freq2: 140, type: 'sawtooth', dur: 0.5, vol: 0.2 }); },
  shield_on: (t) => { tone(t, { freq: 320, freq2: 520, type: 'sine', dur: 0.4, vol: 0.18 }); },
  shield_pop: (t) => { noise(t, { dur: 0.3, vol: 0.25, filter: 'bandpass', freq: 1800, freqEnd: 600, q: 2 }); },
  damage: (t) => { noise(t, { dur: 0.28, vol: 0.28, filter: 'lowpass', freq: 900, freqEnd: 200 }); },
  telegraph: (t) => { tone(t, { freq: 300, freq2: 520, type: 'square', dur: 0.22, vol: 0.1 }); },
  boss_in: (t) => { tone(t, { freq: 90, freq2: 55, type: 'sawtooth', dur: 1.6, vol: 0.35 }); tone(t, { freq: 180, type: 'square', dur: 1.4, vol: 0.12 }); },
  boss_die: (t) => { noise(t, { dur: 1.4, vol: 0.5, filter: 'lowpass', freq: 1600, freqEnd: 100 }); tone(t, { freq: 140, freq2: 30, type: 'sine', dur: 1.3, vol: 0.4 }); },
  click: (t) => { tone(t, { freq: 800, type: 'square', dur: 0.05, vol: 0.1 }); },
  buy: (t) => { tone(t, { freq: 600, freq2: 900, type: 'square', dur: 0.08, vol: 0.14 }); tone(t + 0.06, { freq: 1200, type: 'triangle', dur: 0.2, vol: 0.14 }); },
  // 시작음: 거친 밴드패스 노이즈+톱니파 → 부드러운 삼각파 상승음 + 사인 베이스 + 약한 로우패스 스우시
  start: (t) => {
    tone(t, { freq: 200, freq2: 520, type: 'triangle', dur: 0.5, vol: 0.11 });   // 부드러운 상승 런치음
    tone(t, { freq: 90, freq2: 150, type: 'sine', dur: 0.4, vol: 0.08 });         // 낮은 사인 베이스(묵직)
    noise(t, { dur: 0.4, vol: 0.05, filter: 'lowpass', freq: 1400, freqEnd: 300, q: 0.4 }); // 부드러운 스우시(로우패스, 약하게)
  },
  // 차지 랜스 (실샘플 우선, 아래는 폴백 합성음)
  charge_up: (t) => { tone(t, { freq: 440, freq2: 880, type: 'triangle', dur: 0.18, vol: 0.13 }); },
  charge_full: (t) => { tone(t, { freq: 660, freq2: 990, type: 'sine', dur: 0.5, vol: 0.16 }); noise(t, { dur: 0.4, vol: 0.07, filter: 'bandpass', freq: 2200, q: 2 }); },
  lance_fire: (t) => { subPunch(t, { freq: 320, freq2: 70, dur: 0.4, vol: 0.5, sat: 8 }); noise(t, { dur: 0.5, vol: 0.3, filter: 'bandpass', freq: 1200, freqEnd: 3000, q: 0.7 }); tone(t, { freq: 1600, freq2: 300, type: 'sawtooth', dur: 0.3, vol: 0.12 }); },
};

// ── 실효과음 샘플 로드 (unlock 후 백그라운드)
function loadSamples() {
  if (samplesReady || !ctx) return;
  samplesReady = true;
  for (const [id, count] of Object.entries(SFX_SAMPLES)) {
    for (let n = 1; n <= count; n++) {
      const key = `${id}:${n}`;
      fetch(`assets/sound/nf_sfx_${id}_${n}.ogg`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject()))
        .then((buf) => ctx.decodeAudioData(buf))
        .then((decoded) => { sampleBuffers[key] = decoded; })
        .catch(() => { sampleBuffers[key] = null; });
    }
  }
}

/** 실샘플 재생 (변형 랜덤 + 피치 변조). 로드 전이면 false 반환 → 합성음 폴백 */
function playSample(id, now) {
  const count = SFX_SAMPLES[id];
  if (!count) return false;
  // 로드된 변형 수집
  const avail = [];
  for (let n = 1; n <= count; n++) {
    const b = sampleBuffers[`${id}:${n}`];
    if (b) avail.push(b);
  }
  if (!avail.length) return false;
  const buffer = avail[(Math.random() * avail.length) | 0];
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const pv = SFX_PITCH[id];
  if (pv) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * pv;
  src.connect(masterSfx);
  src.start(now);
  return true;
}

export function sfx(id) {
  if (!unlocked || !ctx || settings.mute) return;
  const now = ctx.currentTime;
  const cd = COOLDOWN[id] ?? 0;
  if (cd && lastPlay[id] && now - lastPlay[id] < cd) return; // 쿨다운
  lastPlay[id] = now;
  // 실샘플 우선, 없으면(로드 전/실패) 합성음 폴백
  try {
    if (playSample(id, now)) return;
    const recipe = SFX[id];
    if (recipe) recipe(now);
  } catch {}
}
