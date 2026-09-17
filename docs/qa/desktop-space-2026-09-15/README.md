# Desktop / Chromebook canvas-space pass — 2026-09-15

Based on the shipped mobile/tablet release `99185c9`; student auth and guest/live/cloud persistence protocols are unchanged.

## Changes

- Docked library: search + category select, compact Create a brick, three-column mouse catalog, two-row color palette. Touch targets retain their touch sizing; phone sheets retain category tabs.
- Removed the duplicate placement inspector and its obsolete CSS. Placement uses one compact confirmation strip.
- Desktop selection has Color, Rotate, Duplicate, Delete, and Adjust. Precise transforms, coordinates, copy/paste, focus and explicit move are in the expandable detail area. Color opens the existing custom picker; the library is the single full palette.
- Undo/Redo and Frame Build stay visible at the top of the canvas. Camera presets use one native View select.
- Fixed specificity that kept Box Select visible on mouse-only desktop; any-coarse-pointer devices retain it.

## Evidence

- At 1366x768 the unscrolled catalog increased from 234px high / 4 fully visible cards to 405px / 12 fully visible cards. Timestamped comparison source: old public release versus this local branch; screenshots `before.png` and `after.png`.
- `scripts/qa/verify-desktop-space.mjs`: 1024x600, 1280x720, 1366x768, 1920x1080. Real browser category/search, place, select, custom color, rotate, raise, JSON export equality, cold reload, View/reset and palette collapse. Bounds asserted. No page errors. `local/results.json`.
- Existing seven-layout touch/desktop browser regression passed (`regression/results.json`).
- 1,087 frontend + 129 Worker tests pass; final typecheck/build passes. Graphics-loss store/inert backstop remains covered with the new panel.
- Browser viewport emulation is not certification on a physical Chromebook or iPad.

## Rollback

Previous production frontend: `dpl_DSYsFviv9sfebZ4r47DCFLhuoRJa`, https://virtual-legos-akgm86i69-ahmaadidrees-projects.vercel.app . No Worker/database rollback is involved.

## Shipped

- Product source: `f42372a`, branch `codex/desktop-canvas-space`.
- Deployment: `dpl_HKsy8HmmEjaFkckeDFdfBVz8Eg1i`.
- Candidate: https://virtual-legos-fr5412g7f-ahmaadidrees-projects.vercel.app .
- Hosted `candidate/results.json`: four desktop sizes, all checks pass, no page errors.
- Hosted `candidate-touch/results.json`: seven regression sizes, all checks pass, no page errors. Existing deployment protection preserved with origin-scoped verification credentials.
- Promoted to https://brickgineers.com . `public-release.json` verifies exact script-asset equality with the prebuilt artifact on both public origins, plus public Chromebook placement and catalog readback: at least 12 fully visible cards, Box Select hidden for mouse.
- No backend deployment or auth/provider changes. Current production mobile/tablet and student-login releases remain included.
