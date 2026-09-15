# Mobile and tablet editor release — 2026-09-15

## Scope

Based on the shipped student-login release (`0a9c140`), preserving six-character student credentials, remembered classes, guest building and existing cloud/live protocols. The separate landing-page and robotics worktrees are not included.

- Compact header: world/save status, People, Explore. Settings remains in the world menu; Scene and Character move to a labeled creative dock.
- Contextual placement/selection bar, with precise transforms and secondary actions behind Adjust. Undo/Redo and camera reset remain available separately.
- Touch landscape tablets >=960px wide and >=600px high retain the collapsible brick palette. Portrait uses the compact dock. Rotation preserves the document and selection.
- Expandable brick sheet; choosing a shape closes the sheet and retains the armed preview.
- Short touch-specific onboarding; no simultaneous hint overlay. Existing touch gestures and explicit Place remain in place.
- Larger invisible height-handle target, with the existing small visual grip.
- Character customization: sticky compact phone preview and side-by-side tablet preview/options on sufficiently tall screens.
- Guest autosave flushes on pagehide/hidden visibility, closing the existing 400ms debounce window when a browser leaves or freezes a tab. Disabled guest persistence for cloud/live sessions is covered by regression tests.

## Verification

- Node 22 `npm run check`: 1,087 frontend tests + 129 Worker tests, both typechecks and production build pass.
- `scripts/qa/verify-touch-layout.mjs`: seven browser contexts (320x568, 390x844, 844x390, 768x1024, 1024x768, 1180x820 touch, 1366x768 desktop).
- Browser paths: guest placement, selection, height adjustment/undo, JSON export, cold reload, Settings and focus return, palette choice/collapse, character picker, Explore and return. Bounds and non-overlap assertions on editing controls. No page errors.
- Screenshots and timestamped machine-readable results in `local/`.
- Full production-target candidate verification and production alias readback are recorded below after promotion.

## Limits

Browser touch emulation and viewport testing are not physical iPad/Chromebook certification. No backend, database schema or authentication setting changes. The existing build gestures remain unchanged; two fingers pan/pinch, one finger orbits empty space or drags a preview/selection. Mobile students should still receive physical-device rehearsal.

## Rollback

Previous frontend: `dpl_D4dsoMoGCxQniDEfEstGACPBCkPU`, https://virtual-legos-h0sg49g4b-ahmaadidrees-projects.vercel.app . Keep the current Worker (six-character student-password support); this release changes only the frontend.
