// ── Kenney CC0 팩 → 네온 함대 효과음 48파일 조립 ────────────────────────────────────────
//
//  이사님 지시(2026-08-13): ElevenLabs 무료 등급 효과음을 상업 이용 가능한 소스로 교체.
//  Kenney 오디오 5팩(전부 **CC0** — 저작권 포기, 상업 이용 자유)에서 골라 사양서 규격으로 맞춘다.
//
//  ⚠️소스는 길이가 제각각이다(5초짜리 루프도 있다). ffmpeg 으로 **앞부분을 잘라** 사양서 길이에 맞추고,
//   페이드아웃을 걸어 뚝 끊기지 않게 한다. 앞 여백은 제거한다 — 발사 순간과 소리가 어긋나면 안 된다.
//  ⚠️게임이 읽는 형식은 OGG Vorbis 48kHz 모노다(`js/audio.js` 의 fetch 경로).
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'assets/sound/_new-sfx/_kenney-src');
const OUT = join(ROOT, 'assets/sound/_new-sfx');
const FF = 'C:/Users/User/AppData/Local/Microsoft/WinGet/Packages/Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe/ffmpeg-8.1.1-full_build/bin/ffmpeg.exe';

/** 팩 폴더 안에서 파일명으로 실제 경로를 찾는다(팩마다 하위 구조가 다르다). */
const index = new Map();
function scan(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) scan(p);
    else if (e.name.endsWith('.ogg')) index.set(e.name.replace(/\.ogg$/, ''), p);
  }
}
scan(SRC);

/**
 * 사양서 §4 매핑.
 *  src   = Kenney 파일명(확장자 없이)   dur = 목표 길이(초)   gain = 음량 보정(dB)
 *  trim  = 앞에서 잘라낼 시작 위치(초, 기본 0)
 *  ⚠️같은 id 의 변형끼리는 **같은 계열**에서 골랐다 — 완전히 다른 소리면 연사 때 튄다.
 */
const MAP = {
  //  무기 — 가장 자주 들린다
  vulcan:      [{ src: 'laserRetro_000', dur: 0.22 }, { src: 'laserRetro_001', dur: 0.22 }, { src: 'laserRetro_002', dur: 0.22 }],
  laser:       [{ src: 'laserSmall_000', dur: 0.24 }, { src: 'laserSmall_001', dur: 0.25 }, { src: 'laserSmall_004', dur: 0.24 }],
  missile:     [{ src: 'thrusterFire_000', dur: 0.45, trim: 0.05, gain: 2 }, { src: 'thrusterFire_001', dur: 0.45, trim: 0.05, gain: 2 }],
  lance_fire:  [{ src: 'laserLarge_000', dur: 0.60 }, { src: 'laserLarge_001', dur: 0.60 }, { src: 'laserLarge_002', dur: 0.60 }, { src: 'laserLarge_003', dur: 0.60 }],
  charge_up:   [{ src: 'phaserUp1', dur: 0.50 }, { src: 'phaserUp2', dur: 0.42 }, { src: 'phaserUp3', dur: 0.52 }, { src: 'phaserUp4', dur: 0.37 }],
  charge_full: [{ src: 'forceField_000', dur: 0.95 }, { src: 'forceField_001', dur: 0.95 }, { src: 'forceField_002', dur: 0.96 }, { src: 'forceField_003', dur: 0.96 }],

  //  타격·폭발
  hit:         [{ src: 'impactMetal_light_001', dur: 0.20 }, { src: 'impactMetal_light_002', dur: 0.20 }, { src: 'impactMetal_heavy_002', dur: 0.14 }],
  explode_s:   [{ src: 'explosionCrunch_000', dur: 0.60 }, { src: 'explosionCrunch_002', dur: 0.60 }, { src: 'explosionCrunch_003', dur: 0.60 }],
  explode_l:   [{ src: 'lowFrequency_explosion_001', dur: 1.00 }, { src: 'explosionCrunch_001', dur: 1.00, gain: 2 }],
  damage:      [{ src: 'impactMetal_heavy_000', dur: 0.35, gain: 2 }, { src: 'impactMetal_heavy_003', dur: 0.35, gain: 2 }],
  shield_pop:  [{ src: 'impactGlass_heavy_001', dur: 0.45 }, { src: 'impactGlass_heavy_000', dur: 0.30 }],
  shield_on:   [{ src: 'forceField_004', dur: 0.95 }],

  //  보스
  boss_in:     [{ src: 'spaceEngineLow_000', dur: 1.40, trim: 0.30, gain: 3 }],
  boss_die:    [{ src: 'lowFrequency_explosion_000', dur: 2.00, gain: 2 }],
  telegraph:   [{ src: 'computerNoise_001', dur: 0.35, trim: 0.20 }],

  //  수집·보상
  pickup:      [{ src: 'pepSound1', dur: 0.45 }, { src: 'pepSound3', dur: 0.44 }],
  crystal:     [{ src: 'impactGlass_light_000', dur: 0.55 }, { src: 'impactGlass_medium_000', dur: 0.60 }],
  evolve:      [{ src: 'powerUp1', dur: 1.00 }],
  demote:      [{ src: 'phaserDown3', dur: 0.55 }],
  gate_good:   [{ src: 'twoTone1', dur: 0.60 }, { src: 'confirmation_002', dur: 0.54 }],
  gate_bad:    [{ src: 'zapThreeToneDown', dur: 0.60 }, { src: 'error_003', dur: 0.53 }],

  //  UI
  click:       [{ src: 'click_001', dur: 0.12 }],
  buy:         [{ src: 'confirmation_004', dur: 0.55 }],
};

mkdirSync(OUT, { recursive: true });
let ok = 0, miss = [];
const rows = [];

for (const [id, variants] of Object.entries(MAP)) {
  variants.forEach((v, i) => {
    const src = index.get(v.src);
    if (!src) { miss.push(`${id}_${i + 1} ← ${v.src}`); return; }
    const out = join(OUT, `nf_sfx_${id}_${i + 1}.ogg`);
    //  filters: 앞 무음 제거 → 목표 길이로 자름 → 끝 12% 페이드아웃 → 피크 정규화(−1dBFS)
    const fade = Math.max(0.03, v.dur * 0.12);
    const filters = [
      'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0',
      `afade=t=out:st=${Math.max(0, v.dur - fade).toFixed(3)}:d=${fade.toFixed(3)}`,
      v.gain ? `volume=${v.gain}dB` : null,
      'alimiter=limit=0.89',
    ].filter(Boolean).join(',');
    execFileSync(FF, [
      '-y', '-v', 'error',
      '-ss', String(v.trim ?? 0), '-i', src,
      '-t', String(v.dur),
      '-af', filters,
      '-ac', '1', '-ar', '48000', '-c:a', 'libvorbis', '-b:a', '96k',
      out,
    ]);
    ok++;
    rows.push(`  nf_sfx_${id}_${i + 1}.ogg  ←  ${v.src}  (${v.dur}s)`);
  });
}

console.log(rows.join('\n'));
console.log(`\n[결과] 생성 ${ok}개 / 누락 ${miss.length}개`);
if (miss.length) console.log('  누락(소스 파일명 불일치):\n' + miss.map((m) => '   ' + m).join('\n'));
