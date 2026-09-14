# W5 evidence — scene & plate sheet, custom bricks, resize, color (boards 08, 10, 16)

Script: `capture-boards.mjs` (Playwright + Chrome, guest local build only, nothing saved).

```
PLAYWRIGHT_MODULE=/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
UI_ORIGIN=http://127.0.0.1:5195 UI_OUTPUT=docs/brand/qa/w5/final node docs/brand/qa/w5/capture-boards.mjs
```

Viewports: 1366×768, 390×844 (touch), 320×740 (touch), 844×390 (phone landscape, touch) and 683×384 (1366×768 at
200% zoom, touch) — the conditions behind the W8 pre-brand baseline defects D2, D5, D6 and D7.

For every sheet it opens (Scene & character, Create a brick, Choose any color, Resize brick) the script asserts,
after the open animation has finished:

- no horizontal page overflow and `window.scrollX === 0`; every open modal dialog (the sheet under test and any parent
  sheet such as the brick drawer sheet) is inside the viewport; the footer is visible; the sheet body is a scroll
  container (`overflow-y: auto`) — D2 (sheet taller than 844×390 / 200% zoom) and D5 (color picker pushing the brick
  sheet off the left edge);
- on touch viewports every button / input / select / tab / radio inside the dialog is at least 44px tall — D7 (the
  character tab body is W6's; its sub-44px controls are recorded in `results.json`, not asserted);
- 30 × Tab then 10 × Shift+Tab never leave the dialog;
- Escape closes it and focus returns to the opener (Scene button; "Create a brick" on desktop or the drawer button
  "Open brick drawer" on compact layouts, where the drawer sheet closes as Create opens; "Choose any brick color" with
  the brick sheet still open — D6; the "Resize brick" button).

`results.json` records the measured boxes and the element that received focus per sheet. Resize is only exercised
at 1366×768 (placing then selecting a brick through the touch selection bar is a different flow the script does
not drive).

Folders: `baseline/` — the sheets before this pass (desktop only); `final/` — after (duplicate "max"/"invalid" shots
dropped at the two short viewports to keep the count modest; `results.json` covers every sheet at every viewport).

Not covered by this script: the character tab body (W6, board 09), reduced-motion emulation (the shared Sheet and
the picker cards disable their animations under `prefers-reduced-motion`; verified in CSS only), real scene photos
(W7's `public/brand/media/scene-*` files were not present; the SVG art is what the screenshots show).
