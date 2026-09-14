# Pre-brand baseline results (W8)

Every artifact below was captured from worktree `brand-w8` against a local server; nothing hosted was touched.
"Base" is the exact commit the served code was at. Two bases exist: the first artifacts were captured at `f8c7ad3`
(the contracts commit, pure pre-brand product code); the surfaces matrix, local multiplayer, schema round trip and
board captures were captured later against `4002fc7` = `f8c7ad3` + the W0 entry-intent wiring + the W1 brand
foundation (tokens, `src/brand`, `src/ui`, identity assets) — no lane UI had merged yet, so the product surfaces are
still pre-brand, but `classroom=join|signin|teacher` exist and the identity assets are the Brickgineers ones.

| Artifact | Base SHA served | Harness | Result | Raw |
|---|---|---|---|---|
| Refinement UI (six viewports, Home → Continue) | `f8c7ad3` | `verify-refinement-ui.mjs` @ `http://127.0.0.1:5208`, 2026-09-14T22:07Z | 7/7 checks passed: 6 viewports with no controls outside and no overlaps, `guestHomeContinue` passed (1 saved brick) | `refinement-ui/results.json`, six PNGs |
| Character customizer | `f8c7ad3` | `verify-character-customizer.mjs` @ 5208, 2026-09-14T22:07Z | 7/7 checks passed: Character shortcut → Scene tab (pre-brand behavior, recorded), Pip/Fern/Nova four distinct animation hashes each + Apply → reload, Toy Figure appearance + outfit/favorite restore, 390 and 320 sheet fit; 6 GLB requests 200; 0 errors | `character-customizer/results.json`, 17 PNGs |
| Bundle + per-route transfer | `f8c7ad3` (docs commit `4e3a067`) | `npm run build` + `route-transfer.mjs` @ `vite preview` 5209, 2026-09-14T22:18Z | 5/5 routes measured; landing 87.7 KB with no editor chunk; `/build` 1,242.8 KB; character sheet +1,309.8 KB of PNG previews | `BUNDLE.md`, `route-transfer/results.json`, `transfer.md` |
| Surfaces matrix (six viewports, 200 % zoom, reduced motion) | `4002fc7` | `brand-surfaces.mjs` @ 5208 (non-strict, JPEG), 2026-09-14 | 264 runs: 231 passed, 33 failed, 0 skipped, 84 notes. All 33 failures are at 844×390 or 200 % zoom (list below). Notes: 76 runs with sub-44 px touch targets, 8 runs where the "Choose a shape" sheet does not contain focus | `surfaces/results.json`; screenshots for every 1366×768 and 390×844 default run plus every failed run (81 JPEGs) |
| Local two-client guest room | `4002fc7` | `verify-refinement-multiplayer.mjs` @ `QA_ORIGIN=http://127.0.0.1:5211` (dev with `VITE_LIVE_SERVER_URL=http://127.0.0.1:8787`), `QA_API=http://127.0.0.1:8787` (`wrangler dev`, local Durable Objects, no secrets) | 9/9 steps passed, 0 page errors: room created through the UI, invite without owner fragment, second isolated browser joined, 96 → 128 resize propagated, edge brick, Toy Figure/Nova profile propagation, UI export == authoritative `GET /worlds/:id` (schema 3, plate 128), cold rejoin identical | `multiplayer-local/results.json`, `export.json`, `initial/scene/owner/peer.png` |
| Schema 2/3 round trip + Home → Continue → reload | `4002fc7` | `schema-roundtrip.mjs` @ 5208 | 3/3 cases passed, every step equal: schema 2 (250 bricks), schema 3 (128 plate), legacy schema 1 → normalized schema 2; download name `brick-studio-build.brickstudio.json` | `schema-roundtrip/results.json`, `*-home.png`, `*-final.png` |
| Per-board captures (dry run of the integrated script) | `4002fc7` | `board-captures.mjs` @ 5211 (worker reachable, so board 11 created a real guest room) | 61 entries: 51 captured, 10 need a fixture, 0 failed. Every guest-reachable board at 1366×768 and 390×844 (16 at 390 only); 04 password-reset, 05, 13, 14 need an account/teacher session plus a worker with classroom secrets (exact reason in `captures.json`). Header probe at the base: worldMenu, saveStatus, Scene, Character, Build together / People, Settings, Explore / Back to building visible; `brandHome` (link "Brickgineers") absent — expected pre-brand | `boards/captures.json`, `boards/README.md`, 51 JPEGs (converted from the script's PNGs with `sips` to keep the repo light) |
| Expanded performance | — | `verify-expanded-performance.mjs` | **Not run at the base**: the host was shared with seven other lanes (load average 5–10 on 18 cores during the baseline). Placeholder; capture on a quiet host with `UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=docs/brand/qa/baseline/expanded-performance node scripts/qa/verify-expanded-performance.mjs` and add the row (`hostBefore`/`hostAfter` load must stay under the CPU count) | — |

## Surfaces matrix at the base — what passed

- Every surface at 1366×768, 1024×768, 768×1024, 390×844 and 320×740 (default and reduced motion) passed the hard
  checks: expected element visible, no page errors, no horizontal overflow, no control outside the viewport, dialogs
  fit, Escape closes, seeded document unchanged (corrupt import, remix confirm), `classroom=join|signin|teacher` open
  the panel with the matching nav button pressed and the mode-only field visible.
- `prefers-reduced-motion: reduce` applied on both reduced-motion viewports with no running animations recorded.
- 200 % zoom at 768×1024 (384×512 CSS) passed for every surface except `live-create`.
- The only console error is the expected `GET /worlds/<unknown>` 404/401 on `live-unavailable`.

## Pre-brand defects found by the matrix (owner lanes)

These fail at the base; the integrated candidate must not add to this list and should shrink it.

| # | Defect | Where | Owner |
|---|---|---|---|
| D1 | Editor toolbar controls ("Place positioned brick" at 1366; "Raise/Lower brick one plate" + "Place positioned brick" at 1024) sit outside the viewport at 200 % zoom (683×384 / 512×384 CSS) — the toolbar does not wrap or scroll | every `/build` surface at `zoom200` 1366×768 and 1024×768 (entry-*, quick-start, build-drawer, world-menu, settings, create-brick, color-picker, scene/character sheet) | W4 (`brick-studio.css` toolbar) |
| D2 | "Scene & character" sheet is taller than the viewport (832 px at 844×390; 2,087–2,377 px on the Character tab at 200 % zoom) and its scene cards / animation buttons (Idle, Walk, Run, Jump, Pause character animation) are unreachable — the sheet body does not scroll | `scene-sheet`, `character-sheet` at 844×390 and `zoom200` 1366/1024 | W5 (sheet frame), W6 (character tab body), W1 (Sheet primitive must scroll its body) |
| D3 | Live create form ("Your builder name" input, "Create my live room", "Back to Brick Studio") extends below a 390-px-tall viewport with no page scroll | `live-create` at 844×390 and every `zoom200` viewport | W4 (`LiveWorldGate`, `live-world.css`) |
| D4 | Quick start guide's "Start building" button is below the fold at 844×390 and at 200 % zoom | `quick-start` at 844×390, `zoom200` 1366×768 | W4 (`OnboardingGuide`) |
| D5 | Opening the color picker on the touch-less 200 % zoom desktop pushes the "Choose a shape" sheet and the drawer controls off the left edge (`-27,56,683,328`) | `color-picker` at `zoom200` 1366×768 | W5 (`custom-color-picker.css`, drawer sheet) |
| D6 | "Choose a shape" brick sheet does not contain focus after the color picker opens (focus stays on the color dialog); recorded as a note, becomes a failure with `STRICT_FOCUS=1` | `color-picker` at 390×844, 320×740, 844×390 (8 runs) | W5 |
| D7 | Touch targets under 44 px on touch viewports (76 runs): World menu 110×21 (every surface), Close classroom 38×38, classroom nav buttons 110×40, classroom inputs 42 px tall, password Show 38 px, Keep building as a guest, Scene/Character/Settings header buttons, Close settings 40×40, Close create a brick 42×42, color sliders 36 px, hex field 40 px, plate size buttons, Remix this world, Frame Build 40×44, Continue with Google 40 px; becomes a failure with `STRICT_TOUCH_TARGETS=1` | all touch viewports | W4 (header, settings), W3 (classroom panel), W5 (create brick, color picker, plate buttons), W2 (landing CTA sizes are fine — links are exempt) |
| D8 | Character shortcut in the header opens the sheet on the Scene tab, not the Character tab (`sceneTabFromCharacterShortcut`, `characterShortcutTab: "Scene"`) | header → Character | W4 / W5 (`initialTab` wiring; CONTRACTS says Character opens the character tab) |
| D9 | `/live/<unknown id>` with a reachable worker answers 401 and the page shows the classroom sign-in panel instead of a "room not found" state; with the worker unreachable it shows "Cannot reach this room" | `live-unavailable` | W4 (`LiveWorldPage` BlockedView copy) — behavior, not a layout bug; both outcomes are accepted by the harnesses |
| D10 | In a live room the "Pick a brick, position it over the plate, then place it." hint toast overlaps the People panel title (`boards/11-guest-collaboration-in-room-people-1366x768.jpg`); Explore is disabled while a placement is pending | board 11 in-room | W4 (`LiveWorldHud` / toast stacking, `--z-toast` vs panel) |

Nothing in this list requires a W8 change; the harnesses report them.

## Reproduce

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
cd /Users/ahmaadidrees/.codex/worktrees/brand-w8
# servers: npx vite --port 5208 …; npm run build && npx vite preview --port 5209 …;
#          cd multiplayer/worker && WRANGLER_SEND_METRICS=false npx wrangler dev --port 8787 --ip 127.0.0.1;
#          VITE_LIVE_SERVER_URL=http://127.0.0.1:8787 npx vite --port 5211 …
UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=docs/brand/qa/baseline/refinement-ui node scripts/qa/verify-refinement-ui.mjs
UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=docs/brand/qa/baseline/character-customizer node scripts/qa/verify-character-customizer.mjs
UI_ORIGIN=http://127.0.0.1:5209 UI_OUTPUT=docs/brand/qa/baseline/route-transfer node scripts/qa/route-transfer.mjs
SCREENSHOT_FORMAT=jpeg UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=/tmp/surfaces node scripts/qa/brand-surfaces.mjs
QA_ORIGIN=http://127.0.0.1:5211 QA_API=http://127.0.0.1:8787 QA_OUTPUT=docs/brand/qa/baseline/multiplayer-local node scripts/qa/verify-refinement-multiplayer.mjs
UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=/tmp/schema node scripts/qa/schema-roundtrip.mjs
UI_ORIGIN=http://127.0.0.1:5211 UI_OUTPUT=/tmp/boards node scripts/qa/board-captures.mjs
```
