# Editor visual verification — Codex

Reviewed the actual approved raster boards 06, 07, 11, 12, 15 and 16, with current local browser captures at `http://127.0.0.1:5190`.

## Changes

Shell commit `3686808` changes only `BrickStudioApp.tsx`, `brick-studio.css` and `explore-camera-settings.css`:

- More prominent desktop wordmark, world title and separated creative controls; 80px desktop header with responsive compact layouts retained.
- Cool pale drawer tiles, a larger Bricks heading with icon, solid Create a brick entry, circular color swatches.
- A short persistent drag/orbit hint; selection modifiers remain discoverable in the selection tooltip and full shortcuts in Settings.
- Rounded Explore back/action clusters, distinct history and frame-build controls.
- Visible mobile Scene, Character, People and Settings labels.
- Floating rounded desktop Settings card, larger title and section headings, scrollable body and persistent footer.

## Independent verification

| Check | Result | Artifacts |
|---|---|---|
| Existing BrickStudioApp + ExploreCameraSettings unit tests | 60/60 passed | Tool output at shell candidate |
| Six viewport editor layout, Settings/Escape/focus and Home → Continue document equality | 7/7 passed | `/tmp/brand-editor-ui-final` |
| Boards 06/07/12 desktop and mobile captures | 10/10 captured | `/tmp/brand-editor-verified` |
| Full strict guest surfaces matrix | **275/275 passed**, no failures or skipped cases | `/tmp/brickgineers-final-matrix` |
| Final scene/character portrait change recheck, all variants | 22/22 passed | `/tmp/brickgineers-final-creative` |
| Final media landing/continue/scene/live-create desktop + phone recheck | 8/8 passed | `/tmp/brickgineers-final-media` |

The full matrix enforces 44px touch controls, topmost dialog focus, expected surface visibility, viewport containment, no horizontal page overflow, no page errors, relevant Escape/focus restoration, and unchanged guest documents where declared. It runs six base viewports, three 200% zoom sizes and two reduced-motion sizes. The eight notes concern focus correctly belonging to a child color dialog above the brick drawer. Console 401 messages occur only for the deliberately unknown live-room fixture; they are expected and not hidden.

## Provenance

The matrix began at `18a9a9fdc51c5204219d30aee39fcad84b422198`, with the portrait lane's PreviewArtwork/CSS edits in progress, and finished after `fe02a1b` (classroom partial-load recovery). This was an integration run, **not all 275 screenshots taken at one frozen SHA**. The portrait change `5cef1c1` was independently rechecked across all 22 scene/character cases. Media replacements `316a0e7` retained dimensions and were rechecked in eight relevant final desktop/mobile cases. The classroom signed-in loading change is outside this guest matrix and requires its separate auth verification. Exact source snapshots and counts are in `editor-matrix-summary.json`.

## Real issue found and resolved

A restored 250-brick draft rendered a blank Build canvas on a phone viewport even after waiting five seconds and pressing Frame Build. A fresh empty draft rendered normally. This was not dismissed as a screenshot artifact. The scene lane traced it to opaque fog before the distant portrait framing camera and fixed it in `5fe35ba`. The refreshed `/tmp/brand-editor-verified/06-build-editor-390x844.png` shows all restored bricks.

## Visual limits

The shell is closer to the approved hierarchy and geometry, but it is not pixel-identical to generated artwork. The real Toy Room camera/build content and character models differ from the illustrative scene, and a fresh close-up Build camera can show mostly the plate. No fake world thumbnails or unsupported camera-view active states were added. Original runtime characters remain real selectable characters. Hosted account/classroom state, physical Chromebook performance, production origin wiring and final deployment verification belong to the release lead's separate checks.
