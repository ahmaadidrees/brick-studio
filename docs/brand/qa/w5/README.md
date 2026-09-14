# W5 evidence — scene & plate sheet, custom bricks, resize, color (boards 08, 10, 16)

Script: `capture-boards.mjs` (Playwright + Chrome, guest local build only, nothing saved).

```
PLAYWRIGHT_MODULE=/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
UI_ORIGIN=http://127.0.0.1:5195 UI_OUTPUT=docs/brand/qa/w5/final node docs/brand/qa/w5/capture-boards.mjs
```

Viewports: 1366×768, 390×844 (touch), 320×740 (touch). A 683×384 run (1366×768 at 200% zoom) also passed; its
screenshots are not kept.

For every sheet it opens (Scene & character, Create a brick, Choose any color, Resize brick) the script asserts,
after the open animation has finished:

- no horizontal page overflow; the dialog and its footer are inside the viewport;
- on touch viewports every button / input / select / tab / radio inside the dialog is at least 44px tall;
- 30 × Tab then 10 × Shift+Tab never leave the dialog;
- Escape closes it and focus returns to the opener (Scene button; "Create a brick" on desktop or the drawer button
  "Open brick drawer" on compact layouts, where the drawer sheet closes as Create opens; the "Resize brick" button).

`results.json` records the measured boxes and the element that received focus per sheet. Resize is only exercised
at 1366×768 (placing then selecting a brick through the touch selection bar is a different flow the script does
not drive).

Folders: `baseline/` — the sheets before this pass (desktop only); `final/` — after.

Not covered by this script: the character tab body (W6, board 09), reduced-motion emulation (the shared Sheet and
the picker cards disable their animations under `prefers-reduced-motion`; verified in CSS only), real scene photos
(W7's `public/brand/media/scene-*` files were not present; the SVG art is what the screenshots show).
