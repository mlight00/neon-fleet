# Neon Fleet — CrazyGames Basic Launch Submission Checklist

Legend: **PASS** = verified this session · **NOT CHECKED** = needs a real portal/CDN or owner action · **MEDIA BLOCKED** = deferred to owner (image/video tooling)

## Technical requirements
| Requirement | Result | Evidence |
|---|---|---|
| English only (portal mode) | **PASS** | Weapon-pick, HUD, pause, death/result, free-upgrade cards, hangar, victory all English; 0 Korean in portal DOM (browser QA) |
| One-click to gameplay (≤1 click) | **PASS** | Fresh save → 1 weapon-card click → `state='play'`, fleet auto-firing, within the same frame |
| No forced intro / cutscene / survey before play | **PASS** | Portal skips title, story intro, and blocking guide; non-blocking hint only |
| Uncompressed runtime < 50 MB | **PASS** | 44.64 MB (build gate fails ≥ 50 MB) |
| File count < 1,500 | **PASS** | 198 files |
| All paths relative (0 absolute) | **PASS** | Build + `PKG-04` test scan: 0 absolute `src`/`href` |
| ZIP root contains `index.html` | **PASS** | `PKG-07` reads ZIP entries: `index.html` at root, forward-slash names, no wrapper folder |
| Chrome | **PASS** | In-app Chromium: 0 console errors on portal/normal/Prolific/dev URLs |
| Edge | **NOT CHECKED** | Chromium-based (same engine); owner to spot-check |
| First load < 10 s | **NOT CHECKED (local OK)** | Localhost load ~instant, all assets 200/304, 0 404; real timing depends on CrazyGames CDN transfer of 43.9 MB — confirm on staging |
| 60 Hz / high-refresh parity | **PASS (by design)** | Existing `dt`-based loop unchanged; no per-frame constants added |
| No console errors | **PASS** | 0 across all four URL modes |
| No missing assets / 404 | **PASS** | Network capture: every request 200/304; manifest built from actual code data (`RASTER_ART.C` + audio ogg + backgrounds) |
| No GA4 / analytics / ad requests (portal) | **PASS** | Network capture: 0 googletagmanager/gtag/ad/SDK requests; GA4 adapter suppressed like dev in portal |
| No mp3 in package (ogg only) | **PASS** | `PKG-03`: 0 mp3 |
| Save / progress persists | **PASS** | `localStorage neonFleet.v1`: best/coins/version written after run; survives reload |
| Fast retry (same weapon, no reload) | **PASS** | `PLAY AGAIN` → `state='play'` with same weapon, no weapon-pick screen |
| Desktop resolutions (821×462 … 1920×1080) | **PASS** | Canvas letterboxes (`height=vh, width=min(vw, vh×0.62)`); measured 821×462, 800×450, 390×844, 1920×1080 — canvas fits, panels fit, 0 overflow |
| Mobile regression (390×844, 800×450) | **PASS** | Canvas + panels fit, cards in view, no horizontal overflow |
| Content rating ≤ PEGI 12 | **PASS** | Sci-fi combat only; no blood, gambling, purchases, chat, or external links |

## Regression (non-portal modes unchanged)
| Mode | Result | Evidence |
|---|---|---|
| Normal Korean URL (`/`) | **PASS** | `lang=ko`, title "네온 함대", Korean title screen (출격하기 · 격납고) |
| Prolific URL (`?playtest=prolific`) | **PASS** | English research consent ("I agree — Start" / "I do not agree"), 4-minute flow intact |
| Dev URL (`?coreLoopTest=1`) | **PASS** | Loads, 0 console errors |
| Conflict (`?distribution=crazygames&playtest=prolific`) | **PASS** | Portal wins — weapon-pick shown, no consent screen |

## Automated tests
- **PASS** — `node --test tests/*.test.mjs` → **659 pass / 0 fail** (incl. `distribution-config`, `crazygames-wiring`, `crazygames-package`).

## Media (deferred — owner action)
### Cover images — **MEDIA BLOCKED**
Not produced here (image creation is owner-driven per standing project policy). Exact specs for the owner:
- **Landscape 1920×1080**, **Portrait 800×1200**, **Square 800×800** — consistent neon art style across all three.
- Title text "Neon Fleet" allowed; **no** "Play Now"/"New"/logos/store or platform icons; **no borders**; no blurry upscaling; must match the real game.
- Suggested source (rights-cleared, already in game): sector backgrounds `assets/remodel-v2/backgrounds/s1–s6.webp` as backdrop + fleet/boss art (`assets/art2-webp/ships/frames/H2_*`, `assets/remodel-v2/bosses/*`). Compose in the owner's image tool.

### Preview video — **MEDIA BLOCKED**
No video capture tool was used. Specs + shot list for the owner:
- 15–20 s, ≤ 50 MB, **Landscape 1080p 16:9** and **Portrait 1080p 2:3**, **muted**, default mouse cursor hidden, no black frames / long logo transitions / promo text.
- First frame = the cover image.
- Shot list (most visual moments): (1) weapon-pick → instant combat, (2) crystal/pod pickup growing the fleet, (3) a resonance combo firing, (4) a sector-boss HP bar + charge beam, (5) a flagship tier-up flash.
- Capture at `http://localhost:8322/?distribution=crazygames` (or the deployed portal) in a real browser.

## What the owner must do before uploading
1. **Confirm asset licenses** for AI-generated **sound** and **image art** (see `asset-license-audit.md`, items marked UNKNOWN).
2. **Produce the 3 cover images + preview video** per the specs above.
3. **Spot-check in real Chrome + Edge and on a phone** (this session used the in-app browser + headless stepping; the in-app pane freezes `requestAnimationFrame`, so real-time animation was verified via frame-stepping, DOM, network, and state — final feel should be confirmed in a normal browser).
4. **Time first load on CrazyGames staging** (< 10 s target).
5. **Create the CrazyGames account and upload** `dist/neon-fleet-crazygames-basic.zip` (not done here by policy).

> CrazyGames account, banking, and payout details are intentionally **not** recorded in this repo.
