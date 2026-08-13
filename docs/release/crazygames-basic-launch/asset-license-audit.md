# Neon Fleet — Asset License Audit (CrazyGames Basic Launch)

Audit of every asset actually shipped in the portal ZIP (`dist/neon-fleet-crazygames-basic.zip`).
Items whose commercial-use rights cannot be verified from the repo are marked **UNKNOWN** and must be confirmed by the owner **before public launch**.

> **Updated 2026-08-13** — sound effects regenerated on **ElevenLabs paid (Starter)**; BGM and image art confirmed as paid-tier Google output. No **UNKNOWN** rows remain; three rows are **verify-at-release** (paid-tier terms).

| # | Asset group | Paths (in ZIP) | Creator / method | License / commercial use | Evidence in repo | Status |
|---|---|---|---|---|---|---|
| 1 | Font — Pretendard | `assets/fonts/Pretendard-Regular.woff2`, `Pretendard-Bold.woff2` | Kil Hyung-jin et al. (open-source webfont) | **SIL Open Font License 1.1** — embedding & commercial use permitted | `assets/fonts/LICENSE-Pretendard.txt` (OFL text, © 2021 Kil Hyung-jin, with Source/Inter) | **OK** |
| 2 | Sound effects (OGG) | `assets/sound/nf_sfx_*.ogg` (23 ids / 48 files) | Generated with **ElevenLabs Sound Effects** (`eleven_text_to_sound_v2`) on the owner's **paid Starter** plan, 2026-08-13, from in-house prompts; trimmed/normalised to spec by `scripts/gen-sfx-elevenlabs.mjs` | **Paid-tier output.** ElevenLabs grants commercial use on paid plans — confirm the attribution requirement for the Starter tier before a monetised release | `scripts/gen-sfx-elevenlabs.mjs` + `scripts/_sfx_plan.json` (exact prompts, durations, prompt-influence per id), `docs/2026-07-05-elevenlabs-sfx-prompts.md`, `docs/2026-08-13-SFX-재제작-사양서.md` | **LIKELY OK — verify attribution at release** |
| 3 | Music / BGM (OGG) | `assets/sound/nf_bgm_*`, `battle_s*`, `boss_s*` (`.ogg`) — 21 tracks | Generated with **Google Flow** (music) on the owner's **paid Google AI Pro** subscription | Paid-tier output; owner states commercial use intended. Verify current Google terms before monetised release | Owner statement 2026-08-13; `docs/BGM_SECTOR_PROMPTS.md` | **LIKELY OK — verify plan terms at release** |
| 4 | Ship / enemy / boss / weapon / VFX art (WebP) | `assets/art2-webp/**`, `assets/remodel-v2/**` | Created **for this project** via AI image tools (Gemini / "nanobanana") + in-house chroma-key & alignment processing; backgrounds regenerated in-house | Generated on the owner's **paid Gemini Pro** subscription. Paid-tier output; verify current Google terms before monetised release | Owner statement 2026-08-13; project memory (art pipeline, chroma-key scripts) | **LIKELY OK — verify plan terms at release** |
| 5 | Crystal / pod / misc raster (PNG) | `assets/styleC/C1.png`, `C2.png`, `C5.png` | Same as #4 (Gemini Pro, paid tier) | Same as #4 | Owner statement 2026-08-13; project memory | **LIKELY OK — verify plan terms at release** |
| 6 | Inline vector art (SVG data-URIs) | Embedded in `js/svg-art.js`, `js/sprites.js` (fallbacks) | **Original**, hand-authored in code by the project | Project-owned original code/art | Source is procedural (no external file) | **OK** |
| 7 | App icon | `assets/art2-webp/branding/app_icon.webp` | Same as #4 (Gemini Pro, paid tier) | Same as #4 | Owner statement 2026-08-13 | **LIKELY OK — verify plan terms at release** |
| 8 | Game code (HTML/CSS/JS) | `index.html`, `css/style.css`, `js/*.js` | **Original**, written for this project. Pure vanilla JS + Canvas 2D, **no third-party libraries or frameworks bundled** | Project-owned | Repo source; no `node_modules`, no CDN/vendored libs in ZIP | **OK** |

## Summary
- **Clear / commercial-safe:** Pretendard font (OFL), all game code, inline SVG art.
- **Likely OK, verify plan terms at monetised release:** sound effects (ElevenLabs **Starter**), BGM (Google Flow) and image art (Gemini) — all produced on the owner's **paid** subscriptions (confirmed 2026-08-13). Paid tiers generally grant commercial rights, but the exact terms in force — including any attribution requirement — should be re-read at release time.
- **History 2026-08-13 (two moves, same day):** the original SFX were ElevenLabs **free-tier** (commercial rights unclear). They were first replaced with Kenney CC0 sources, then — after the owner upgraded to a **paid ElevenLabs plan** — regenerated on ElevenLabs for a better fit to the game's sound design. Both replaced sets are kept outside the repo:
  `backups/sfx-elevenlabs-20260813/` (original free-tier) and `backups/sfx-kenney-20260813/` (Kenney CC0 interim).
  ⚠️The Kenney CC0 set remains a **fully unrestricted fallback** if the ElevenLabs terms ever become a problem — re-running `scripts/build-sfx-from-kenney.mjs` reproduces it.
- **No third-party libraries, no stock media, no external fonts/CDNs** are bundled in the portal build.

## Notes
- This audit covers the **shipped** files only. Development-only source folders (nanobanana originals, ElevenLabs WAV sources, backups) are excluded from the ZIP by the build script and are `.gitignore`-d.
- The build script fails if any GA4 measurement ID, Prolific completion URL, or ad SDK string is present in the package (none are).
