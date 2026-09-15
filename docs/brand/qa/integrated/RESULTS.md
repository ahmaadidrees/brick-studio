# Integrated candidate results (W8, direction I — Brickgineers)

**Final candidate SHA: `ab98e1c`** ("Keep the phone header title and save chip in one 44px row", 17:31:37 local; on top of
`eb1bcdd` "Fix the W8 integrated-run defects N1–N8" and `af85a5f`, the merge of W8's harness fixes). The full run below
was made at `907a06c`; the **Final re-run** section re-measures N1–N8 at `ab98e1c` with the strict matrix, the
refinement-UI harness and the 16-board captures (`boards/` now holds the `ab98e1c` PNGs; the `907a06c` board captures
were replaced). Multiplayer, schema, customizer, transfer and performance were not re-run (the lead's fixes touch
`brick-studio.css`, `live-world.css`, `ui.css`, `BrickStudioApp.tsx`, `StudioMenu.tsx` layout only).

## Final re-run at `ab98e1c` (2026-09-14, 17:33–17:52 local, 5190 + 5211 hot-reloaded and verified)

| Command | Result |
|---|---|
| `QA_COMMIT=ab98e1c STRICT_TOUCH_TARGETS=1 STRICT_FOCUS=1 INCLUDE_PENDING=1 SCREENSHOT_FORMAT=jpeg UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=docs/brand/qa/integrated/surfaces-final node scripts/qa/brand-surfaces.mjs` | **275 runs: 256 passed, 19 failed, 0 skipped, 8 notes** (up from 194 passed at `907a06c`). **0 touch targets under 44 px anywhere.** Failures: 17 at 844×390 (N1 landscape remnant, one of them also N9/N5), 2 at 200 % zoom 1024×768 (N5 color picker, N9). The 8 notes are the expected stacked-dialog notes. Screenshots kept for every 1366×768 / 390×844 default run and every failure (69 JPEGs, 4.1 MB); `surfaces-final/results.json` |
| `QA_COMMIT=ab98e1c UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=docs/brand/qa/integrated/refinement-ui-final node scripts/qa/verify-refinement-ui.mjs` | **6/7 passed**: 1366, 1024, 768, 390, 320 layouts + Home → Continue; 844×390 fails only on `World menu 201,-12,95,44` (N1 remnant). Character → Character tab, Settings fit, menu, focus return, no recovery at every viewport |
| `QA_COMMIT=ab98e1c UI_ORIGIN=http://127.0.0.1:5211 UI_OUTPUT=docs/brand/qa/integrated/boards node scripts/qa/board-captures.mjs` | **61 entries: 51 captured, 10 need a fixture, 0 failed**; board 11 in-room-people at 1366×768 and 390×844 eyeballed for N8 (below) |

### N1–N8 at `ab98e1c`

| # | Status | Measurement |
|---|---|---|
| N1 | **Fixed at 390×844 and 320×740, still open at 844×390** | Phone header is one 44 px row (title trigger beside the icon-only save chip); every 390/320 surface passes. At 844×390 (landscape, above the 700 px phone rule) `.studio-world-title` still measures `201,-12,95,44`: the coarse-pointer `min-height: 44px; padding: 8px 4px` makes the trigger taller than its header row, which starts at y = 0, so 12 px of the hit box is above the viewport (32 px effective). 17 matrix rows + 1 refinement-UI viewport. Owner W4: apply the same one-row treatment (or a taller header row) to coarse pointers wider than 700 px |
| N2 | **Fixed** | `Search bricks` input 44 px on touch; no sub-44 px target in any of the 275 runs |
| N3 | **Fixed** | `world-menu` passes at 320×740 (popover anchored to the header edges, all menu items inside 8–312) |
| N4 | **Fixed** | `explore` passes at 844×390; Build together / Character / Settings 44×44 on coarse pointers |
| N5 | **Fixed for the Bricks sheet, still open for the color picker** | `build-drawer` at 200 % zoom 1024×768 no longer scrolls the header out (`preventScroll` on the sheet). Opening **Choose any color** from the sheet still scrolls the page: header at y −35 at `zoom200` 1024×768 (Bricks sheet top moves 56 → 15) and by 2 px at 844×390 (`Brickgineers Home 12,-2,…`, Bricks sheet top 56 → 54). Owner W5: `CustomColorPicker` focus → `focus({ preventScroll: true })` like the sheet |
| N6 | **Fixed** | `published-viewer` / `published-remix-confirm` pass at all 11 viewport/variant combinations with `aria-label="Make a copy"` on every layout (locator still accepts the old compact name; harmless) |
| N7 | **Fixed** | `entry-worlds/save/join/signin/teacher/teacher-email` pass at 390×844 and 320×740; the header is no longer clipped when the classroom sheet opens (it was the N1 offset) |
| N8 | **Fixed** | Board 11 in-room-people at 1366×768 and 390×844: "Copy link" complete, invite sentences wrap inside the panel, Room buttons fit; `.live-panel-section { grid-template-columns: minmax(0, 1fr) }`. Cosmetic residue: the half-width "Get latest world" button truncates its label to "Get latest w…" at 1366 (ellipsis, not clipping) |

### New at `ab98e1c`

| # | Defect | Owner | File / selector | Viewports | Severity |
|---|---|---|---|---|---|
| N9 | Bricks drawer sheet: the colour row at the bottom of the sheet extends below the viewport and no ancestor scrolls it — `Use color #52636c / #7b5238` and `Choose any brick color` at y 381 (44 tall) on the 384-px-tall 200 % zoom 1024×768 viewport (sheet rect `0,56,512,328`), and the pressed swatch `Use color #3e83d7 254,346,46,46` 2 px below the 390-px 844×390 viewport (sheet `0,56,844,334`; the pressed swatch is 46 px, its neighbours 44). Was masked at `907a06c` by N5's header scroll | W5 (drawer sheet) | `dialog[aria-label="Bricks"]` colour row (`.part-library` colour strip) | zoom200 1024×768 (41 px), 844×390 (2 px) | non-blocker |

Blockers at `ab98e1c`: **none**. Still-open non-blockers: N1 (844×390 only), N5 (color picker only), N9.

---

## Run at `907a06c` (superseded for N1–N8 by the section above)

**Candidate SHA of this run: `907a06c`** ("Lead fixes from the integrated risk review", integration branch `claude/brickgineers-brand`,
committed 2026-09-14 17:00:49 local). It is `7083387` (all lanes merged) + `eda37f7` (lead status doc) + the lead's
risk-review fixes (live-room save status for pending/replaced sessions, classroom panel no longer closes on backdrop
click, recovery download names, reduced-motion class on `<html>`, "Back to building" link on the guest join gate).

App under test: the integration worktree's Vite dev server `http://127.0.0.1:5190` (pid 68702, cwd
`/Users/ahmaadidrees/.codex/worktrees/brand-integration`), which hot-reloaded `907a06c` at 17:00:49. For the local
worker runs (board 11, two-client room) the frontend must point at `127.0.0.1:8787`, which 5190 does not
(no `VITE_LIVE_SERVER_URL`; the product falls back to `localhost:8787`, whose IPv6 side is an unrelated
worktree's server), so those two runs used `http://127.0.0.1:5211` — W8's own dev server started with
`VITE_LIVE_SERVER_URL=http://127.0.0.1:8787` from `brand-w8` after `git merge claude/brickgineers-brand`
(`acec80e`; `git diff --stat 907a06c HEAD -- src public` is empty, so the product code is identical) — and
`wrangler dev` (workerd pid 49849, local Durable Objects, no secrets) on `127.0.0.1:8787`. Transfer sizes come from
`npm run build` of that merged tree served by `vite preview` on `127.0.0.1:5209`.

Timing note requested by the lead: the only things that ran before 17:00 local were the three
`npx vitest run src/brick/BrickStudioApp.test.tsx` runs (unit tests of the `7083387` source in `brand-w8`, not the
served app) and a first strict surfaces run that I aborted at 17:01 to fix two harness bugs (its output was
discarded). Every artifact recorded below ran against `907a06c` (verified: 5190 and 5211 both serve the
`closeOnBackdrop` change of `907a06c`).

Harness changes made for this run (W8 files only, committed in `brand-w8`): `scripts/qa/locators.json` updated to
the final accessible names verified in the DOM (list in `docs/brand/qa/README.md`); `css` locator type for the save
chip; `expectPressed` accepts `aria-checked` (the classroom modes are radios); selected-tab checks scoped to the open
sheet (the brick drawer now has a selected category tab); only the topmost of stacked modal dialogs must hold focus
(the color picker stacks above the brick sheet by design); the teacher entry surface asserts "Continue with Google"
+ "Use email and password" and a second state opens the email form; the two-client harness and board 11 follow the
new live gate ("Your name" / "World name" / "Create shared world" / "Join world") and the People panel.

## Commands and counts

All commands from `/Users/ahmaadidrees/.codex/worktrees/brand-w8` with `PATH=/opt/homebrew/opt/node@22/bin:$PATH`.

| # | Command | Result |
|---|---|---|
| 1 | `npx vitest run src/brick/BrickStudioApp.test.tsx` ×3 (sequential, host load 11–22 on 18 cores) | **3/3 runs passed, 54/54 tests each** — the "applies a custom group color as one undoable edit and keeps Cancel local" failure the lead saw once did not reproduce (logs: session scratch `vitest-1..3.log`) |
| 2 | `QA_COMMIT=7083387 STRICT_TOUCH_TARGETS=1 STRICT_FOCUS=1 INCLUDE_PENDING=1 SCREENSHOT_FORMAT=jpeg UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=docs/brand/qa/integrated/surfaces node scripts/qa/brand-surfaces.mjs` (`QA_COMMIT` was set before the lead's note; the run started 17:01:30 against `907a06c`) | **275 runs: 194 passed, 81 failed, 0 skipped, 8 notes.** 25 surfaces × 6 viewports + 200 % zoom (3) + reduced motion (2). Failures by cause: 62 = N1 (World menu hit box 8–12 px above the viewport on every touch viewport), 8 = published viewer copy-button name (N6, re-run below passes), 3 = N2 "Search bricks" 24 px, 1 = N3 studio menu overflow at 320, 1 = N4 Explore toolbar 44×40 at 844×390, 2 = N5 header scrolled out at 200 % zoom 1024×768 with the drawer/color picker open (N2/N3 co-occur with N1 on their rows). Notes: 8 × "dialog Bricks is below another open dialog" (expected stacking). `surfaces/results.json`, one JPEG per run |
| 2b | same with `SURFACES=published-viewer,published-remix-confirm QA_COMMIT=907a06c UI_OUTPUT=docs/brand/qa/integrated/surfaces-published-rerun` after accepting both copy-button names | **22/22 passed** (both surfaces at all 11 viewport/variant combinations) |
| 3 | `UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=docs/brand/qa/integrated/refinement-ui node scripts/qa/verify-refinement-ui.mjs` | **4/7 passed, 3 failed (exit 1)**: 1366×768, 1024×768, 768×1024 — no header/toolbar control outside, no overlaps; `guestHomeContinue` passed (Place → Home → Continue building → identical guest document, 1 brick). 390×844, 320×740, 844×390 fail only on N1 (`World menu 65,-8,91,44` / `65,-8,88,44` / `201,-12,95,44`); at every viewport the Character shortcut opened the Character tab, Settings fit the viewport, the world menu listed My Worlds / My Class, Escape returned focus to the trigger, no recovery screen, 0 page errors. `refinement-ui/results.json`, six PNGs |
| 4 | `UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=docs/brand/qa/integrated/character-customizer node scripts/qa/verify-character-customizer.mjs` | **passed (exit 0), 0 page errors**: Character shortcut opens the Character tab (D8 fixed), Pip / Fern / Nova real WebGL previews with four distinct animation frames each and Apply → reload persisted, Toy Figure appearance (Curls, Glasses, Freckles, Overalls) Apply → reload, outfit "Curly Builder QA" saved + favorited + restored after reload and re-applied on Nova, sheet fits at 390×844 and 320×740 (no control outside, footer inside, no horizontal scroll), 6/6 GLB requests 200. `character-customizer/results.json` + PNGs |
| 5 | `UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=docs/brand/qa/integrated/schema-roundtrip node scripts/qa/schema-roundtrip.mjs` | **3/3 cases passed**, every step equal (after import, after reload, after Home → Continue building → reload): schema 2 (250 bricks), schema 3 (128 plate + edge brick), legacy schema 1 → normalized schema 2. Exports next to `schema-roundtrip/results.json` |
| 6 | `QA_COMMIT=907a06c UI_ORIGIN=http://127.0.0.1:5211 UI_OUTPUT=docs/brand/qa/integrated/boards node scripts/qa/board-captures.mjs` | **61 captures: 51 captured, 10 need a fixture, 0 failed (exit 0)** — every guest-reachable board at 1366×768 and 390×844 (16 at 390 only) as PNG in `boards/`; `boards/captures.json` + `boards/README.md`. Header probe: boards 06/16 show brandHome, worldMenu, saveStatus, Scene, Character, Build together, Settings, Explore; board 07 (Explore) shows brandHome, Character, Build together, Settings, Back to building; board 11 in-room shows People ("People, 1 here") instead of Build together. Board 11 created a real guest room on the local worker. Board 02 captured the top of the landing because the section-heading patterns predate the final copy (see evidence gaps) |
| 7 | `QA_ORIGIN=http://127.0.0.1:5211 QA_API=http://127.0.0.1:8787 QA_OUTPUT=docs/brand/qa/integrated/multiplayer-local node scripts/qa/verify-refinement-multiplayer.mjs` | **9/9 steps passed, 0 page errors** (run 2026-09-15T00:21:49Z, after scoping the harness's tab read; the first run also passed 9/9 but read the selected tab before the switch): guest room created through the gate ("Your name" / "World name" / "Create shared world"); invite copied from the People panel with no `#owner` fragment and pointing at the QA origin; second isolated browser joined via "Join world"; 96 → 128 resize propagated; edge brick at x=126 on the 128 plate; Toy Figure + Bun + Glasses and Nova profile propagation confirmed on the peer; UI "Export copy" == authoritative `GET /worlds/:id` (schema 3, plate 128, 1 brick); cold peer reload rejoined with an identical document; socket `ws://127.0.0.1:8787/worlds/<id>/connect`; `characterShortcutTab` = Character. `multiplayer-local/results.json`, `export.json`, `initial/scene/owner/peer.png` |
| 8 | `npm run build` (merged tree `acec80e`) + `UI_ORIGIN=http://127.0.0.1:5209 UI_OUTPUT=docs/brand/qa/integrated/route-transfer node scripts/qa/route-transfer.mjs` | **5/5 routes measured, 0 errors; landing loads no editor/three chunk** (7 JS files, 81.4 KB: index, LandingPage, parts, jsx-runtime, Button, createLucideIcon, link-2). Landing 151.7 KB vs 87.7 KB baseline (+64.0 KB, **+73 %, over the 10 % rule** — 59.0 KB of it is the new brand media at 1366×768: hero-800.avif 23.6 KB + three scene thumbnails 29.2 KB + character-nova-400.avif 5.3 KB + favicon; JS +5.3 KB, CSS +0.3 KB). `/build` 1,262.9 KB (+20.1 KB, +1.6 %), character sheet 2,610.4 KB (+2.3 %), live gate 1,287.7 KB (+1.4 %), viewer 1,264.9 KB (+1.6 %) — all within 10 %. Media budgets from `public/brand/media/manifest.json`: hero delivered 55.8 KB AVIF / 90.4 KB WebP ≤ 250 KB cap; initial marketing set 168.6 KB AVIF / 250.3 KB WebP ≤ 600 KB cap (`heroDeliveredOk`, `initialSetOk` both true; folder 1.6 MB, 45 files incl. PNG fallbacks). Table below; `route-transfer/results.json`, `transfer.md` |
| 9 | `UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=docs/brand/qa/integrated/expanded-performance node scripts/qa/verify-expanded-performance.mjs` (last, quiet host) | **passed (exit 0), 0 errors in all three scenes.** Host quiet: pre-run `uptime` load 4.46 / no other headless Chrome (`perf-host` check 17:24:18), `hostBefore` load [4.5, 5.1, 6.79], `hostAfter` [4.21, 4.92, 6.6] on 18 cores. Custom-part geometry 64×64×192: none 0 ms / 12 tris; auto studs 43.7 ms / 131,084 tris / 8,389,520 B; full studs 33.9 ms / 131,084 tris (validation 0.6 / 1.2 / 0.2 ms, all valid). 128-plate Explore with the maximum brick: Toy Room spawn ready, RAF p50 16.7 / p95 16.7 / max 16.8 ms, **87 draw calls, 923,174 triangles** (71 geometries, 13 textures), 12 s travel reached x = 55.17 beyond the 39.68 plate edge, return leg ready; Sky Island p95 16.8 ms, 42 calls / 281,240 tris, travel x = 47.15; Brick Valley p95 16.8 ms, 43 calls / 1,013,958 tris, travel x = 59.71. Table below; `expanded-performance/results.json` + three PNGs |

## Per-route compressed transfer (vite preview on 5209, merged tree `acec80e` = `907a06c` product code)

| Route | Baseline KB (`f8c7ad3`) | Candidate KB | Δ KB | Δ % | JS KB (files) | CSS KB | Images KB | Editor chunks on route | Gate |
|---|---:|---:|---:|---:|---:|---:|---:|---|---|
| landing | 87.7 | 151.7 | +64.0 | +73.0 | 81.4 (7) | 9.0 | 59.0 | none | no editor chunk: OK; size over +10 % — media, within budget |
| build | 1242.8 | 1262.9 | +20.1 | +1.6 | 1235.2 (19) | 24.4 | 0.9 | BrickStudioApp-DKzc64HR.js, events-b389eeca.esm-C_oOfuYP.js, rapier-DJ-fG79w.js, BrickStudioApp-7dNNOJ5z.css | within 10 % |
| build-character-sheet | 2551.9 | 2610.4 | +58.5 | +2.3 | 1235.2 (19) | 24.4 | 1348.4 | same | within 10 % |
| live-create | 1269.3 | 1287.7 | +18.4 | +1.4 | 1256.7 (21) | 27.7 | 0.9 | same | within 10 % |
| published-viewer | 1244.7 | 1264.9 | +20.2 | +1.6 | 1237.2 (20) | 24.4 | 0.9 | same | within 10 % |

The character sheet's 1,348 KB of images are the PNG character previews already present at the baseline (1,309.8 KB);
they are not marketing media.

## Per-board captures

Generated from `boards/captures.json` (31 board states; `boards/README.md` has the per-capture table with the header probe).

| Board | State | 1366×768 | 390×844 | Notes |
|---|---|---|---|---|
| 01 landing | start-building | `boards/01-landing-start-building-1366x768.png` | `boards/01-landing-start-building-390x844.png` |  |
| 01 landing | continue-building | `boards/01-landing-continue-building-1366x768.png` | `boards/01-landing-continue-building-390x844.png` |  |
| 02 how-it-works-teachers | default | `boards/02-how-it-works-teachers-1366x768.png` | `boards/02-how-it-works-teachers-390x844.png` | no heading matched Three moves | How it works | Build together, actually together | teachers; captured the top of the page |
| 03 sign-in-enrollment | join | `boards/03-sign-in-enrollment-join-1366x768.png` | `boards/03-sign-in-enrollment-join-390x844.png` |  |
| 03 sign-in-enrollment | student-sign-in | `boards/03-sign-in-enrollment-student-sign-in-1366x768.png` | `boards/03-sign-in-enrollment-student-sign-in-390x844.png` |  |
| 03 sign-in-enrollment | teacher-sign-in | `boards/03-sign-in-enrollment-teacher-sign-in-1366x768.png` | `boards/03-sign-in-enrollment-teacher-sign-in-390x844.png` |  |
| 04 account-recovery | guest-save-handoff | `boards/04-account-recovery-guest-save-handoff-1366x768.png` | `boards/04-account-recovery-guest-save-handoff-390x844.png` |  |
| 04 account-recovery | password-reset | **needs fixture** — a signed-in classroom account (sessionStorage key brick-studio.classroom-session.v1) and a worker with the classroom secrets | **needs fixture** — a signed-in classroom account (sessionStorage key brick-studio.classroom-session.v1) and a worker with the classroom secrets |  |
| 05 worlds-class | my-worlds | **needs fixture** — a signed-in classroom account (sessionStorage key brick-studio.classroom-session.v1) and a worker with the classroom secrets | **needs fixture** — a signed-in classroom account (sessionStorage key brick-studio.classroom-session.v1) and a worker with the classroom secrets |  |
| 05 worlds-class | my-class | **needs fixture** — a signed-in classroom account (sessionStorage key brick-studio.classroom-session.v1) and a worker with the classroom secrets | **needs fixture** — a signed-in classroom account (sessionStorage key brick-studio.classroom-session.v1) and a worker with the classroom secrets |  |
| 06 build-editor | default | `boards/06-build-editor-1366x768.png` | `boards/06-build-editor-390x844.png` | header: brandHome, worldMenu, saveStatus, scene, character, buildTogether, settings, exploreMode |
| 06 build-editor | brick-drawer | `boards/06-build-editor-brick-drawer-1366x768.png` | `boards/06-build-editor-brick-drawer-390x844.png` | header: brandHome, worldMenu, saveStatus, scene, character, buildTogether, settings, exploreMode |
| 07 explore | default | `boards/07-explore-1366x768.png` | `boards/07-explore-390x844.png` | header: brandHome, character, buildTogether, settings, backToBuilding |
| 08 scenes-plate | default | `boards/08-scenes-plate-1366x768.png` | `boards/08-scenes-plate-390x844.png` |  |
| 09 character-studio | default | `boards/09-character-studio-1366x768.png` | `boards/09-character-studio-390x844.png` |  |
| 10 custom-bricks-color | create-brick | `boards/10-custom-bricks-color-create-brick-1366x768.png` | `boards/10-custom-bricks-color-create-brick-390x844.png` |  |
| 10 custom-bricks-color | color-picker | `boards/10-custom-bricks-color-color-picker-1366x768.png` | `boards/10-custom-bricks-color-color-picker-390x844.png` |  |
| 11 guest-collaboration | create-room | `boards/11-guest-collaboration-create-room-1366x768.png` | `boards/11-guest-collaboration-create-room-390x844.png` |  |
| 11 guest-collaboration | in-room-people | `boards/11-guest-collaboration-in-room-people-1366x768.png` | `boards/11-guest-collaboration-in-room-people-390x844.png` | header: brandHome, worldMenu, saveStatus, scene, character, people, settings, exploreMode |
| 12 settings-world-menu | settings | `boards/12-settings-world-menu-settings-1366x768.png` | `boards/12-settings-world-menu-settings-390x844.png` |  |
| 12 settings-world-menu | world-menu | `boards/12-settings-world-menu-world-menu-1366x768.png` | `boards/12-settings-world-menu-world-menu-390x844.png` |  |
| 13 teacher-roster | default | **needs fixture** — a signed-in teacher session (sessionStorage key brick-studio.classroom-session.v1 with a teacher user) and a worker with the classroom secrets | **needs fixture** — a signed-in teacher session (sessionStorage key brick-studio.classroom-session.v1 with a teacher user) and a worker with the classroom secrets |  |
| 14 teacher-access-groups | default | **needs fixture** — a signed-in teacher session (sessionStorage key brick-studio.classroom-session.v1 with a teacher user) and a worker with the classroom secrets | **needs fixture** — a signed-in teacher session (sessionStorage key brick-studio.classroom-session.v1 with a teacher user) and a worker with the classroom secrets |  |
| 15 safe-states-viewer | published-viewer | `boards/15-safe-states-viewer-published-viewer-1366x768.png` | `boards/15-safe-states-viewer-published-viewer-390x844.png` |  |
| 15 safe-states-viewer | remix-confirm | `boards/15-safe-states-viewer-remix-confirm-1366x768.png` | `boards/15-safe-states-viewer-remix-confirm-390x844.png` |  |
| 15 safe-states-viewer | graphics-paused | `boards/15-safe-states-viewer-graphics-paused-1366x768.png` | `boards/15-safe-states-viewer-graphics-paused-390x844.png` |  |
| 15 safe-states-viewer | import-corrupt | `boards/15-safe-states-viewer-import-corrupt-1366x768.png` | `boards/15-safe-states-viewer-import-corrupt-390x844.png` |  |
| 15 safe-states-viewer | live-unavailable | `boards/15-safe-states-viewer-live-unavailable-1366x768.png` | `boards/15-safe-states-viewer-live-unavailable-390x844.png` |  |
| 15 safe-states-viewer | not-found | `boards/15-safe-states-viewer-not-found-1366x768.png` | `boards/15-safe-states-viewer-not-found-390x844.png` |  |
| 16 mobile | quick-start | — (board 16 is phone-only) | `boards/16-mobile-quick-start-390x844.png` |  |
| 16 mobile | build | — (board 16 is phone-only) | `boards/16-mobile-build-390x844.png` | header: brandHome, worldMenu, saveStatus, scene, character, buildTogether, settings, exploreMode |
| 16 mobile | brick-sheet | — (board 16 is phone-only) | `boards/16-mobile-brick-sheet-390x844.png` |  |


## Pre-brand defects D1–D10 re-measured at `907a06c`

| # | Pre-brand defect | Status at the candidate | Evidence |
|---|---|---|---|
| D1 | Editor toolbar controls outside the viewport at 200 % zoom (1366/1024) | **Fixed** — every `/build` surface passes `zoom200` at 1366×768 and 1024×768 except the two N5 rows (a different cause: page scroll with the drawer open) | `surfaces/results.json` zoom200 rows |
| D2 | "Scene & character" sheet taller than the viewport at 844×390 / 200 % zoom, body does not scroll | **Fixed** — `scene-sheet` and `character-sheet` pass at 844×390 and all `zoom200` viewports (dialog fits, animation buttons reachable); the Sheet body scrolls | `surfaces/scene-sheet/844x390.jpeg`, `surfaces/character-sheet/844x390.jpeg` |
| D3 | Live create form below the fold at 844×390 / 200 % zoom | **Fixed** — `live-create` passes at all 11 viewport/variant combinations (the gate is now "Build together." with "Your name" / "World name" / "Create shared world") | `surfaces/live-create/*` |
| D4 | Quick start "Start building" below the fold at 844×390 / 200 % zoom | **Fixed** — `quick-start` passes at 844×390 and every `zoom200` viewport (its only failures are N1) | `surfaces/quick-start/844x390.jpeg` |
| D5 | Color picker pushes the "Choose a shape" sheet off the left edge at 200 % zoom 1366 | **Fixed** — `color-picker` passes `zoom200` 1366×768 (sheet now titled "Bricks"); at `zoom200` 1024×768 it fails for N5 instead | `surfaces/color-picker/zoom200-1366x768.jpeg` |
| D6 | Brick sheet does not contain focus after the color picker opens | **Not a defect** — the color picker is a child dialog stacked above the sheet and holds focus, which is the intended behavior (`CustomColorPicker.tsx`); the harness now requires focus only in the topmost open modal and records the lower one as a note (8 notes) | `surfaces/results.json` notes |
| D7 | Touch targets under 44 px (76 runs) | **Mostly fixed** — World menu, Close classroom, classroom nav/inputs, Show, Keep building as a guest, Scene/Character/Settings, Close settings, Close create a brick, sliders, hex field, plate size, Make a copy, Frame build, Continue with Google all measure ≥ 44 px. Remaining: N2 ("Search bricks" input 24 px tall, 3 viewports) and N4 (Explore toolbar Build together / Character / Settings 44×40 at 844×390) | `surfaces/results.json` `checks.small` |
| D8 | Character shortcut opens the Scene tab | **Fixed** — `character-sheet` surfaces select the Character tab at every viewport; `verify-character-customizer` `sceneTabFromCharacterShortcut: passed`; two-client run `characterShortcutTab` = Character | `character-customizer/results.json` |
| D9 | `/live/<unknown>` with a reachable worker shows the classroom sign-in panel (401) | **Changed to an explicit state** — the page now renders a "This world needs a class sign-in" region with "Sign in to my class" and "Go to builder"; with the worker unreachable it still shows "Cannot reach this room". Accepted by the harness (`liveBlockedHeading`) | `surfaces/live-unavailable/1366x768.jpeg` |
| D10 | Hint toast overlaps the People panel title in a live room | **Fixed** — the "Pick a brick…" hint sits top-centre and the People panel opens clear of it at 1366×768 and 390×844. Still true: Explore stays disabled while a placement is pending (by design). A new clipping defect in the same panel is N8 | `boards/11-guest-collaboration-in-room-people-1366x768.png`, `…-390x844.png` |

## New defects at the candidate (owner lane, file, selector, viewport, severity)

None of these blocks a guest flow; every one is reachable/usable, so all are **non-blockers**. They are listed in order of
how many strict-matrix rows they fail.

| # | Defect | Owner | File / selector | Viewports | Severity |
|---|---|---|---|---|---|
| N1 | World-title menu trigger's 44 px touch box starts 8 px above the viewport (12 px at 844×390): `.studio-world-title` measures `65,-8,91,44` at 390×844 and 320×740, `201,-12,95,44` at 844×390. Cause: `src/brick/brick-studio.css:408` (`@media (pointer: coarse) { .studio-world-title { min-height: 44px; padding: 8px 4px; margin: -8px 0 } }`) while `.brick-header` sits at `top: 0` with no room for the negative margin, so the top 8 px of the target is off-screen (36 px effective). Suggested change: drop the negative margin and let the header row grow, or expand the hit area with a `::before` pseudo-element instead. 62 strict rows | W4 (header) | `src/brick/brick-studio.css:408`, `src/brick/StudioMenu.tsx:162` `button.studio-world-title[aria-label="World menu"]` | 390×844, 320×740, 844×390 (default + reduced motion) | non-blocker |
| N2 | Brick drawer sheet search field is 24 px tall on touch layouts (`Search bricks` 314×24 at 390, 244×24 at 320, 768×24 at 844×390) | W5 (brick drawer) | `src/brick/BrickStudioApp.tsx:498` `input[aria-label="Search bricks"]` | 390×844, 320×740, 844×390 | non-blocker |
| N3 | Studio menu popover overflows the right edge at 320 px: menu items span x 74–328 on a 320 px viewport (`.studio-menu-popover { width: 272px; left: 0 }`), so the last ~8 px of every item is clipped | W4 (StudioMenu) | `src/brick/brick-studio.css:106` `.studio-menu-popover[role="menu"]` | 320×740 | non-blocker |
| N4 | Explore toolbar cluster buttons are 44×40 on touch landscape (`Build together`, `Character`, `Settings`) — `.brick-explore-cluster .brick-header-tool.ui-button { min-height: 40px }` | W4 (Explore HUD) | `src/brick/brick-studio.css:319`; `[aria-label="Explore toolbar"] .brick-header-tool` | 844×390 | non-blocker |
| N5 | At 200 % zoom on 1024×768 (512×384 CSS) opening the brick drawer sheet (and the color picker from it) scrolls the page so the whole header is above the viewport (`Brickgineers Home 8,-35,44,44`, `World menu 65,-39,91,28`, Scene/Character/Build together/Settings/Explore at y −35). Header unreachable while the sheet is open (Escape closes it). Not reproduced at 683×384 (1366 zoom) or 384×512 (768 zoom) | W5 (drawer sheet) / W1 (Sheet scroll lock) | `src/ui/Sheet.tsx` focus/scroll-lock on open; `dialog[aria-label="Bricks"]` | zoom200 1024×768 | non-blocker |
| N6 | Published viewer copy button has two accessible names: "Make a copy" on wide layouts, "Save a copy of this world as your guest build" on compact layouts, because `.published-world-actions .brick-header-tool .ui-button-label { display: none }` (`brick-studio.css:396`) leaves the `title` as the name. One control should keep one name (e.g. `aria-label="Make a copy"` and keep the sentence as `title`) | W4 (PublishedWorldBar) | `src/brick/BrickStudioApp.tsx:390`, `src/brick/brick-studio.css:396` `.published-world-remix` | ≤ 512 px CSS (390×844, 320×740, zoom200 1024/768) | non-blocker |
| N7 | With the classroom sheet open at 390×844 the page scrolls by ~8 px (the header's brand mark and title are clipped at the top) — visible in `surfaces/entry-*/390x844.jpeg`; the measured header offset is the same −8 as N1, so it may be the same cause (verify after N1) | W3 / W1 | `.classroom-sheet` (Sheet variant dialog) | 390×844 | non-blocker |

| N8 | People panel (live room) clips its content on the right at both viewports: every row — the invite `<code>` + "Copy link" button, plain paragraphs and the Room buttons — is cut at the same x, so the panel's content box is wider than its visible area — `.live-panel-section { display: grid }` (`live-world.css:205`) has no `min-width: 0` / `minmax(0, 1fr)` column, so the long invite `<code>` (a grid item with the default `min-width: auto`) widens the track beyond the 360 px panel and every row in that section is clipped by `.live-panel-body`'s overflow. Suggested change: `.live-panel-section { grid-template-columns: minmax(0, 1fr); min-width: 0 }`: "Copy link" renders as "Co" (1366) / "Copy li" (390) and the sentences "Anyone with this invite can join as a guest. No account needed.", "Temporary room. Expires after 2 hours without activity. Download a copy…" and the "Get latest world" button are cut off. Visible on the primary desktop board (11). The button still works (the two-client harness clicked it) | W4 (LiveWorldHud) | `src/brick/live/LiveWorldHud.tsx:215–218` (`.live-share-row` / `.live-share-link`), `src/brick/live/live-world.css:101–108`; `dialog[aria-label="<room name>"] .live-share-link` | 1366×768, 390×844 | non-blocker (highest priority of the list: visibly broken on the primary desktop) |


## Expanded performance (candidate `907a06c` at 5190 vs pre-brand `docs/classroom/EXPANDED-PERFORMANCE-QA.md`)

| Scene (128 plate + 64×64×192 brick, Explore) | RAF p50 / p95 / max ms | Draw calls | Render triangles | Pre-brand draw calls / triangles / p95 | 12 s travel (plate edge 39.68) |
|---|---|---:|---:|---|---|
| Toy Room | 16.7 / 16.7 / 16.8 | 87 | 923,174 | 103 / 923,622 / 16.7 ms | x 55.17, y 0.16, return ready |
| Sky Island | 16.7 / 16.8 / 16.8 | 42 | 281,240 | 42 / 281,240 / 16.7 ms | x 47.15, y 0.20, return ready |
| Brick Valley | 16.7 / 16.8 / 16.8 | 43 | 1,013,958 | 43 / 1,013,958 / 16.7 ms | x 59.71, y 0.18, return ready |

Toy Room draws 16 fewer calls than pre-brand (87 vs 103) at the same triangle count (−448); Sky Island and Brick
Valley are identical. Geometry timings (auto 43.7 ms, full 33.9 ms) sit inside the pre-brand 35–43 / 34–36 ms
ranges. `docs/PERF-BASELINE.md` holds only a template row (no measured Toy Room numbers), so the classroom doc is
the only pre-brand reference.

## Evidence gaps

- Hosted classroom flows were not exercised: boards 05 (My Worlds / My Class), 13, 14 and the 04 password-reset state
  need a signed-in student/teacher session and a worker with the classroom secrets; local `wrangler dev` has no
  `.dev.vars`. `board-captures.mjs` records them as `needs-fixture` with the exact reason; `SESSION_STORAGE_FILE`
  is the hook once a session fixture exists.
- No physical Chromebook / touch device: touch viewports are Chrome emulation (`hasTouch`, `isMobile`) in headless
  Chrome on an M5 Max; the 44 px checks are geometric.
- Headless screenshots at the touch viewports do not paint the WebGL build canvas in Build mode (blank plate area in
  `surfaces/build/390x844.jpeg` and the 390 board PNGs); the pre-brand baseline shows the same, and Explore/published
  captures at 390 do render, so this is a capture artifact, not a regression. The customizer previews are hashed
  from real WebGL frames.
- 200 % zoom is emulated (half CSS viewport at deviceScaleFactor 2), reduced motion via `prefers-reduced-motion`
  emulation; the in-app "Reduced" preference was not toggled by the harness.
- Performance: **passed (exit 0), 0 errors in all three scenes.** Host quiet: pre-run `uptime` load 4.46 / no other headless Chrome (`perf-host` check 17:24:18), `hostBefore` load [4.5, 5.1, 6.79], `hostAfter` [4.21, 4.92, 6.6] on 18 cores. Custom-part geometry 64×64×192: none 0 ms / 12 tris; auto studs 43.7 ms / 131,084 tris / 8,389,520 B; full studs 33.9 ms / 131,084 tris (validation 0.6 / 1.2 / 0.2 ms, all valid). 128-plate Explore with the maximum brick: Toy Room spawn ready, RAF p50 16.7 / p95 16.7 / max 16.8 ms, **87 draw calls, 923,174 triangles** (71 geometries, 13 textures), 12 s travel reached x = 55.17 beyond the 39.68 plate edge, return leg ready; Sky Island p95 16.8 ms, 42 calls / 281,240 tris, travel x = 47.15; Brick Valley p95 16.8 ms, 43 calls / 1,013,958 tris, travel x = 59.71. Table below; `expanded-performance/results.json` + three PNGs-GAP
