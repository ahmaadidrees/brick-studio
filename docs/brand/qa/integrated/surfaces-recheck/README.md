# Lead re-check after the N1/N5/N9 fixes (commit 91ad099)

```
QA_COMMIT=91ad099 STRICT_TOUCH_TARGETS=1 STRICT_FOCUS=1 INCLUDE_PENDING=1 SCREENSHOT_FORMAT=jpeg \
SURFACES=build,build-drawer,world-menu,color-picker,create-brick,quick-start,explore,settings,scene-sheet,character-sheet,entry-join \
VIEWPORTS=390x844,320x740,844x390,1024x768,1366x768 UI_ORIGIN=http://127.0.0.1:5190 node scripts/qa/brand-surfaces.mjs
```

Result: 99 runs, 99 passed, 0 failed, 6 notes (the expected "Bricks sheet below the colour picker" stacking note).
Covers the three items left open by W8's final re-run at `ab98e1c`: N1 at 844×390 (world-menu trigger inside the
header), N5 for the colour picker at 200% zoom 1024×768 (no page scroll), N9 (Bricks sheet colour row reachable on
short viewports). Screenshots were not kept; `results.json` holds the per-run measurements.
