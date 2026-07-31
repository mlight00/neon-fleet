# Neon Fleet — Asset License Audit (CrazyGames Basic Launch)

Audit of every asset actually shipped in the portal ZIP (`dist/neon-fleet-crazygames-basic.zip`).
Items whose commercial-use rights cannot be verified from the repo are marked **UNKNOWN** and must be confirmed by the owner **before public launch**.

| # | Asset group | Paths (in ZIP) | Creator / method | License / commercial use | Evidence in repo | Status |
|---|---|---|---|---|---|---|
| 1 | Font — Pretendard | `assets/fonts/Pretendard-Regular.woff2`, `Pretendard-Bold.woff2` | Kil Hyung-jin et al. (open-source webfont) | **SIL Open Font License 1.1** — embedding & commercial use permitted | `assets/fonts/LICENSE-Pretendard.txt` (OFL text, © 2021 Kil Hyung-jin, with Source/Inter) | **OK** |
| 2 | Sound effects (OGG) | `assets/sound/nf_sfx_*.ogg` | Generated with **ElevenLabs** SFX from in-house prompts | Commercial rights depend on the owner's ElevenLabs plan/terms at generation time | `docs/2026-07-05-elevenlabs-sfx-prompts.md`, `docs/2026-07-05-sound-design-사운드설계+AI지시서.md` | **UNKNOWN — owner confirm** |
| 3 | Music / BGM (OGG) | `assets/sound/nf_bgm_*`, `battle_s*`, `boss_s*` (`.ogg`) | In-house sound-design pipeline (AI-assisted) | Source tool & commercial terms not documented in repo | `docs/2026-07-05-sound-design-*.md` (design), README "BGM" section | **UNKNOWN — owner confirm** |
| 4 | Ship / enemy / boss / weapon / VFX art (WebP) | `assets/art2-webp/**`, `assets/remodel-v2/**` | Created **for this project** via AI image tools (Gemini / "nanobanana") + in-house chroma-key & alignment processing; backgrounds regenerated in-house | Intended as project-owned original assets; AI-tool output terms not attached in repo | Project memory (art pipeline, chroma-key scripts); no third-party attribution files present | **UNKNOWN — owner confirm AI-tool output terms** |
| 5 | Crystal / pod / misc raster (PNG) | `assets/styleC/C1.png`, `C2.png`, `C5.png` | Same as #4 (Gemini/nanobanana + in-house processing) | Same as #4 | Project memory (crystal/pod image pipeline) | **UNKNOWN — owner confirm** |
| 6 | Inline vector art (SVG data-URIs) | Embedded in `js/svg-art.js`, `js/sprites.js` (fallbacks) | **Original**, hand-authored in code by the project | Project-owned original code/art | Source is procedural (no external file) | **OK** |
| 7 | App icon | `assets/art2-webp/branding/app_icon.webp` | Same as #4 (project-created) | Same as #4 | — | **UNKNOWN — owner confirm** |
| 8 | Game code (HTML/CSS/JS) | `index.html`, `css/style.css`, `js/*.js` | **Original**, written for this project. Pure vanilla JS + Canvas 2D, **no third-party libraries or frameworks bundled** | Project-owned | Repo source; no `node_modules`, no CDN/vendored libs in ZIP | **OK** |

## Summary
- **Clear / commercial-safe:** Pretendard font (OFL), all game code, inline SVG art.
- **Requires owner confirmation before public launch (UNKNOWN):** AI-generated **sound** (SFX + BGM — ElevenLabs / sound pipeline) and AI-generated **image art** (Gemini/nanobanana). These were produced for the project, but the repo does not carry the generating tool's commercial-use terms. The owner should confirm that the ElevenLabs plan and image-tool terms in force at generation time permit commercial distribution on CrazyGames.
- **No third-party libraries, no stock media, no external fonts/CDNs** are bundled in the portal build.

## Notes
- This audit covers the **shipped** files only. Development-only source folders (nanobanana originals, ElevenLabs WAV sources, backups) are excluded from the ZIP by the build script and are `.gitignore`-d.
- The build script fails if any GA4 measurement ID, Prolific completion URL, or ad SDK string is present in the package (none are).
