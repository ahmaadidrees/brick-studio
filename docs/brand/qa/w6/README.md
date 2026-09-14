# W6 evidence — character studio and original avatars

Script: `audit-avatars.mjs` (Playwright + headless Chrome against the W6 Vite server on port 5196).

```sh
PLAYWRIGHT_MODULE=/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
UI_ORIGIN=http://127.0.0.1:5196 UI_OUTPUT=docs/brand/qa/w6 UI_TAG=after node docs/brand/qa/w6/audit-avatars.mjs
```

It opens `/build`, dismisses the quick start, opens the Character tab of the "Scene & character" sheet, waits for the
real WebGL preview (`.character-preview canvas` present, no loading status), then for each character clicks its card and
captures the preview stage in Idle and Walk. It fails on any page error.

## What each file shows

- `after-<id>-{idle,walk}.png` (`classic`, `toy-figure`, `cc0-hero`, `pip`, `fern`, `nova`): the live studio preview
  after the palette work — Classic Builder and Toy Figure on brand defaults (Toy Figure hands in the skin tone), Robot
  Hero repainted at runtime, and the regenerated Pip/Fern/Nova GLBs from `assets/characters-original/`.
- `after-sheet-1366x768.png`: board 09 on desktop — intro, live rotatable preview with Idle/Walk/Run/Jump/Pause, sheet
  footer with Cancel/Apply.
- `after-sheet-390x844.png`, `after-sheet-320x740.png`: the character tab on phone widths with the sheet footer visible.
- `audit/before-*`: the wave-0 baseline captured with the same script before any change (see `docs/brand/status/w6.md`).

## What was checked by hand from these captures

- No LEGO-minifigure look: no round yellow heads, no C-claw hands (Toy Figure hands are skin-tone mittens), no flared
  minifigure torso.
- Each avatar animates (Idle vs Walk frames differ) and stays grounded on the stage disc.
- Sheet footer (Cancel/Apply) is visible at 1366×768, 390×844 and 320×740; the studio body scrolls beneath it.

Unit-level checks live in `src/brick/characters/*.test.tsx`: one Canvas at DPR [1, 1.5], `demand` frameloop when paused,
hidden or under reduced motion, boundary fallback when the 3D context fails, Apply/Cancel left to the parent sheet
(`onDraftChange` only, no preference persistence or store writes while drafting), wardrobe persistence in
`brick-studio.wardrobe.v1` (max 24, failed and blocked storage surfaced), legacy saved profiles resolving.
