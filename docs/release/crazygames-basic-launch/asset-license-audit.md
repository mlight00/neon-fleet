# Neon Fleet — Asset License Audit (CrazyGames Basic Launch)

Audit of every asset actually shipped in the portal ZIP (`dist/neon-fleet-crazygames-basic.zip`).
Items whose commercial-use rights cannot be verified from the repo are marked **UNKNOWN** and must be confirmed by the owner **before public launch**.

> **Updated 2026-08-13** — sound effects moved to Kenney CC0 (was ElevenLabs free tier); BGM and image art confirmed as paid-tier Google output. No **UNKNOWN** rows remain.

| # | Asset group | Paths (in ZIP) | Creator / method | License / commercial use | Evidence in repo | Status |
|---|---|---|---|---|---|---|
| 1 | Font — Pretendard | `assets/fonts/Pretendard-Regular.woff2`, `Pretendard-Bold.woff2` | Kil Hyung-jin et al. (open-source webfont) | **SIL Open Font License 1.1** — embedding & commercial use permitted | `assets/fonts/LICENSE-Pretendard.txt` (OFL text, © 2021 Kil Hyung-jin, with Source/Inter) | **OK** |
| 2 | Sound effects (OGG) | `assets/sound/nf_sfx_*.ogg` (23 ids / 48 files) | Sourced from **Kenney.nl** CC0 audio packs (Sci-fi Sounds, Impact Sounds, Interface Sounds, Digital Audio, UI Audio), trimmed/normalised to spec by `scripts/build-sfx-from-kenney.mjs` | **CC0 1.0 (public domain dedication)** — commercial use permitted, **no attribution required** | `scripts/build-sfx-from-kenney.mjs` (source→output mapping), `docs/2026-08-13-SFX-재제작-사양서.md`; original ZIPs kept outside repo at `backups/kenney-src-20260813/` | **OK** |
| 3 | Music / BGM (OGG) | `assets/sound/nf_bgm_*`, `battle_s*`, `boss_s*` (`.ogg`) — 21 tracks | Generated with **Google Flow** (music) on the owner's **paid Google AI Pro** subscription | Paid-tier output; owner states commercial use intended. Verify current Google terms before monetised release | Owner statement 2026-08-13; `docs/BGM_SECTOR_PROMPTS.md` | **LIKELY OK — verify plan terms at release** |
| 4 | Ship / enemy / boss / weapon / VFX art (WebP) | `assets/art2-webp/**`, `assets/remodel-v2/**` | Created **for this project** via AI image tools (Gemini / "nanobanana") + in-house chroma-key & alignment processing; backgrounds regenerated in-house | Generated on the owner's **paid Gemini Pro** subscription. Paid-tier output; verify current Google terms before monetised release | Owner statement 2026-08-13; project memory (art pipeline, chroma-key scripts) | **LIKELY OK — verify plan terms at release** |
| 5 | Crystal / pod / misc raster (PNG) | `assets/styleC/C1.png`, `C2.png`, `C5.png` | Same as #4 (Gemini Pro, paid tier) | Same as #4 | Owner statement 2026-08-13; project memory | **LIKELY OK — verify plan terms at release** |
| 6 | Inline vector art (SVG data-URIs) | Embedded in `js/svg-art.js`, `js/sprites.js` (fallbacks) | **Original**, hand-authored in code by the project | Project-owned original code/art | Source is procedural (no external file) | **OK** |
| 7 | App icon | `assets/art2-webp/branding/app_icon.webp` | Same as #4 (Gemini Pro, paid tier) | Same as #4 | Owner statement 2026-08-13 | **LIKELY OK — verify plan terms at release** |
| 8 | Game code (HTML/CSS/JS) | `index.html`, `css/style.css`, `js/*.js` | **Original**, written for this project. Pure vanilla JS + Canvas 2D, **no third-party libraries or frameworks bundled** | Project-owned | Repo source; no `node_modules`, no CDN/vendored libs in ZIP | **OK** |

## Summary
- **Clear / commercial-safe:** Pretendard font (OFL), **all 48 sound effects (Kenney CC0)**, all game code, inline SVG art.
- **Likely OK, verify plan terms at monetised release:** BGM (Google Flow) and image art (Gemini) — both produced on the owner's **paid** subscriptions (confirmed 2026-08-13). Paid tiers generally grant commercial rights, but the exact terms in force should be re-read at release time.
- **Resolved 2026-08-13:** the previous UNKNOWN on sound effects is closed. The ElevenLabs **free-tier** SFX were replaced with Kenney CC0 sources — CC0 is a public-domain dedication with no commercial restriction and no attribution requirement. Replaced files are backed up outside the repo at `backups/sfx-elevenlabs-20260813/`.
- **No third-party libraries, no stock media, no external fonts/CDNs** are bundled in the portal build.

## Notes
- This audit covers the **shipped** files only. Development-only source folders (nanobanana originals, ElevenLabs WAV sources, backups) are excluded from the ZIP by the build script and are `.gitignore`-d.
- The build script fails if any GA4 measurement ID, Prolific completion URL, or ad SDK string is present in the package (none are).
