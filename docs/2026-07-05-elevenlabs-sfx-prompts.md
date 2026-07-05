# Neon Fleet — ElevenLabs Sound Effects Prompts

- Purpose: generate the 21 in-game sound effects with ElevenLabs "Sound Effects" (text-to-SFX).
- These replace the current WebAudio-synthesized SFX. Filenames match the game's event IDs so integration is drop-in.

## How to use (per prompt)

1. Open ElevenLabs → **Sound Effects**.
2. Paste the **Prompt** below.
3. Set **Duration** to the value in the table (or leave "Auto" if unsure).
4. **Prompt influence: high (~0.8)** for weapons/impacts (want literal), **medium (~0.5)** for chimes/UI (want musicality).
5. Generate 3–4 takes, pick the punchiest, **download as MP3** (WAV also fine).
6. Save to `assets/sound/` with the exact **Filename** in the table.
7. Tell me when done — I'll wire `audio.js` to prefer the real files (with synth fallback if a file is missing).

## Global rules (important)

- **Weapons & impacts must be DRY** — add "dry, no reverb, no tail, tight" so rapid fire doesn't turn into mush (vulcan fires ~20×/sec in game; a long tail ruins it).
- **One-shots, looping OFF.**
- Keep peaks clean (no distortion/clipping in the export).
- Mono is fine (game plays them positional-agnostic).

---

## 1. Player weapons  (short, punchy — fired rapidly, pitch is varied in-engine)

| Filename | Event | Duration | Prompt |
| --- | --- | --- | --- |
| `nf_sfx_vulcan.mp3` | 발칸 발사 | 0.2s | `Single heavy sci-fi pulse cannon shot, punchy gun blast with a deep bass thump and a sharp metallic snap, aggressive and weighty, dry, no reverb, no tail, tight one-shot` |
| `nf_sfx_laser.mp3` | 레이저 발사 | 0.2s | `Single sci-fi energy laser bolt, sharp electric zap with a fast downward pitch sweep and a thick punchy low-end, powerful, dry, no reverb, tight one-shot` |
| `nf_sfx_missile.mp3` | 호밍 발사 | 0.4s | `Sci-fi homing rocket launch, quick ignition click then a whooshing thruster with a low rumble, punchy, dry, short` |

## 2. Impacts & destruction

| Filename | Event | Duration | Prompt |
| --- | --- | --- | --- |
| `nf_sfx_hit.mp3` | 적 피격 틱 | 0.1s | `Tiny metallic impact tick, a bullet striking metal armor, very short, dry, crisp` |
| `nf_sfx_explode_s.mp3` | 소형 폭발 | 0.4s | `Small sci-fi explosion, quick punchy blast with metallic debris and a short low thump, dry, tight` |
| `nf_sfx_explode_l.mp3` | 대형 폭발 | 0.8s | `Large heavy sci-fi explosion, deep booming blast with flying metal shrapnel and a powerful low-end punch, cinematic but tight` |
| `nf_sfx_crystal.mp3` | 크리스탈 파괴(보상) | 0.7s | `Bright crystal shatter followed by an ascending magical sparkle chime, glassy, rewarding, satisfying collect sound` |

## 3. Growth & choices  (the "dopamine" sounds — make them satisfying)

| Filename | Event | Duration | Prompt |
| --- | --- | --- | --- |
| `nf_sfx_gate_good.mp3` | 이득 게이트 | 0.5s | `Positive sci-fi power-up chime, a quick bright ascending warp tone, energizing, clean and uplifting` |
| `nf_sfx_gate_bad.mp3` | 손해 게이트 | 0.5s | `Negative sci-fi warning tone, a quick descending warp buzz, ominous and disappointing` |
| `nf_sfx_pickup.mp3` | 캡슐/파워 획득 | 0.3s | `Short sci-fi item pickup blip, a satisfying digital click with a soft warm hum, clean` |
| `nf_sfx_evolve.mp3` | 함선 진화 | 1.5s | `Powerful sci-fi ship transformation, a rising metallic energy charge building into a bright triumphant burst, heroic upgrade, epic and satisfying` |
| `nf_sfx_demote.mp3` | 강등 | 0.8s | `Sci-fi power-down, a descending failing energy tone with a soft mechanical wind-down, disappointing` |
| `nf_sfx_shield_on.mp3` | 실드 획득 | 0.6s | `Sci-fi energy shield activating, a protective humming force field powering up with a soft bloom` |
| `nf_sfx_shield_pop.mp3` | 실드로 피해 무효 | 0.5s | `Energy shield deflecting a hit, a sharp electric zap and the shatter of a force field bubble` |

## 4. Threat & damage

| Filename | Event | Duration | Prompt |
| --- | --- | --- | --- |
| `nf_sfx_damage.mp3` | 드론 손실 | 0.4s | `Taking damage, a dull heavy metallic crunch impact with a brief low alarm undertone, dry` |
| `nf_sfx_telegraph.mp3` | 적 발사 예고 | 0.3s | `Short menacing alien weapon charge-up beep, a warning that an enemy is about to fire, tense` |
| `nf_sfx_boss_in.mp3` | 보스 등장 | 2s | `Massive alien mothership arrival, a deep intimidating horn roar layered with heavy metallic rumble, dread and scale` |
| `nf_sfx_boss_die.mp3` | 보스 격파 | 2.5s | `Huge boss death sequence, an enormous chain of explosions with deep booms and scattering debris, climactic and victorious` |

## 5. UI

| Filename | Event | Duration | Prompt |
| --- | --- | --- | --- |
| `nf_sfx_click.mp3` | 버튼 클릭 | 0.15s | `Soft clean sci-fi interface button click, subtle, crisp, minimal` |
| `nf_sfx_buy.mp3` | 격납고 구매 | 0.6s | `Satisfying sci-fi upgrade purchase, a metallic clank combined with a bright coin chime, rewarding` |
| `nf_sfx_start.mp3` | 출격 | 1s | `Spaceship fleet launch, a powerful engine ignition whoosh building and taking off, energetic` |

---

## Priority (if generating in batches)

1. **Weapons** (vulcan, laser, missile) — most heard, biggest impact on "feel".
2. **crystal, gate_good, evolve** — the satisfaction/dopamine core.
3. **explode_s, explode_l, boss_die, boss_in** — combat weight.
4. Everything else.

## After delivery

Drop the files in `assets/sound/` with the exact names above. I'll update `audio.js` to load `nf_sfx_<id>.mp3` per event (OGG/MP3 both OK), keep the current synth as automatic fallback for any missing file, and re-apply the rapid-fire throttle + pitch variation on the weapon samples so they still sound like a machine-gun and not one repeated clip.
