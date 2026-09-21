# W7 QA — flows v2 results

Candidate: `claude/flows-v2` at **`52420c5`** ("Let the /worlds page scroll as a whole like /join and /class"), run on
`claude/flows-w7` at `669d334` (= `52420c5` + the W7 scripts and evidence; no product file differs from the candidate).
Run date 2026-09-18, Node 22.23.2, Playwright 1.61.1 with the system Chrome, headless, one browser at a time.

## What ran against what

| Backend | Used for | Why |
|---|---|---|
| Real Worker from this tree, `wrangler dev --port 8797 --local` (local Durable Objects, no secrets) | guest live rooms: two-client multiplayer, `/live/new`, the `/live/<id>` gate on the e2e | works without Supabase |
| **QA mock classroom backend** `scripts/qa/lib/classroom-mock-server.mjs` on 8798 (`VITE_CLASSROOM_SERVER_URL`) | every `/classroom/*` call from `/join`, `/worlds`, `/class`, `/class/projector`, the editor save sheet and the account chip | the real Worker answers **503 `classroom_unavailable`** on every classroom route without `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `SUPABASE_ANON_KEY` (`multiplayer/worker/src/classroom/index.ts:72`), and classroom live rooms also need `CLASSROOM_TICKET_SECRET`; this host has neither |

The mock mirrors `docs/classroom/API.md` and the W1 handlers route for route (same paths, bodies, status codes,
`{ error, code }` shapes, `username_taken` + `suggestions`, `invalid_password`, `class_code_required`, `sharing_disabled`,
`world_hidden`, `read_only`, `owner_required`, `world_limit`, `revision_conflict`, the suspended-owner 404 from `cf6fad9`).
The frontend runs the **real** `ClassroomClient` transport, sessionStorage session store, `useClassroomSession` hook and
pages; nothing is stubbed in the browser. `flows-e2e.mjs` records which backend answered (`results.json → backend.classroomKind`)
and exits 2 if it finds the unconfigured Worker. Three e2e steps need the classroom live room (viewer HUD, join-and-place,
eject on unshare) and are recorded as **blocked**, not passed; their access rules are proven at the API instead.

## Commands (re-run in this order)

```sh
cd /Users/ahmaadidrees/.codex/worktrees/flows-w7
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
export QA_COMMIT=$(git rev-parse --short HEAD)
OUT=docs/flows/qa/w7
# servers (check lsof -nP -iTCP:<port> -sTCP:LISTEN first; never kill another lane's process)
(cd multiplayer/worker && WRANGLER_SEND_METRICS=false npx wrangler dev --port 8797 --ip 127.0.0.1 --local)
PORT=8798 node scripts/qa/lib/classroom-mock-server.mjs
VITE_CLASSROOM_SERVER_URL=http://127.0.0.1:8798 VITE_LIVE_SERVER_URL=http://127.0.0.1:8797 npx vite --port 5277 --strictPort --host 127.0.0.1
# 1 end to end (three browser contexts, resets and re-seeds the mock)
UI_ORIGIN=http://127.0.0.1:5277 node scripts/qa/flows-e2e.mjs
# 2 six-viewport matrix over /join, /worlds, /class, /class/projector and the editor states (strict targets + focus)
STRICT_TOUCH_TARGETS=1 STRICT_FOCUS=1 SCREENSHOT_FORMAT=jpeg UI_ORIGIN=http://127.0.0.1:5277 UI_OUTPUT=$OUT/surfaces node scripts/qa/flows-surfaces.mjs
# 3 existing harnesses that still apply
SURFACES=landing,build,world-menu,settings,explore,scene-sheet,build-drawer VIEWPORTS=1366x768,390x844 VARIANTS=default STRICT_TOUCH_TARGETS=1 STRICT_FOCUS=1 SCREENSHOT_FORMAT=jpeg UI_ORIGIN=http://127.0.0.1:5277 UI_OUTPUT=$OUT/brand-surfaces-subset node scripts/qa/brand-surfaces.mjs
UI_ORIGIN=http://127.0.0.1:5277 UI_OUTPUT=$OUT/refinement-ui node scripts/qa/verify-refinement-ui.mjs
TOUCH_TEST_ORIGIN=http://127.0.0.1:5277 TOUCH_TEST_OUTPUT=$OUT/touch-layout node scripts/qa/verify-touch-layout.mjs
DESKTOP_TEST_ORIGIN=http://127.0.0.1:5277 DESKTOP_TEST_OUTPUT=$OUT/desktop-space node scripts/qa/verify-desktop-space.mjs
UI_ORIGIN=http://127.0.0.1:5277 UI_OUTPUT=$OUT/schema-roundtrip node scripts/qa/schema-roundtrip.mjs
QA_ORIGIN=http://127.0.0.1:5277 QA_API=http://127.0.0.1:8797 QA_OUTPUT=$OUT/multiplayer-local QA_LOCK_ROOM=1 node scripts/qa/verify-refinement-multiplayer.mjs
npx vitest run
npx tsc -p tsconfig.app.json --noEmit
```

`verify-student-login.mjs` was **not run**: it needs hosted fixtures (`CLASSROOM_TEST_*`, a Supabase service key) and
drives the pre-flows `/build?classroom=signin` dialog; its student paths are covered by `flows-e2e.mjs` on the mock.
`board-captures.mjs`, `route-transfer.mjs`, `verify-character-customizer.mjs` and `verify-expanded-performance.mjs`
were not part of this pass (locators updated for the first; the others are unchanged by flows v2).

## Counts

| Harness | Result | Evidence |
|---|---|---|
| `flows-e2e.mjs` | **22 passed, 0 failed, 3 blocked** (25 steps), 0 page errors | `e2e/results.json`, `e2e/01…21-*.jpeg`, `e2e.log` |
| `flows-surfaces.mjs` strict | **209 / 209 passed** (19 surfaces × 6 viewports = 114 default + 57 zoom200 + 38 reduced-motion), 0 touch targets < 44 px, 0 focus notes, 0 console errors, 0 animations under reduced motion; 123 notes, all "inner scroll container" (see Observations) | `surfaces/results.json`, `surfaces/<surface>/<viewport>[-variant].jpeg`, `surfaces.log` |
| `brand-surfaces.mjs` subset (7 editor surfaces × 1366/390, strict) | 13 / 14 — **D2** (drawer grip 28 px) | `brand-surfaces-subset/` |
| `verify-refinement-ui.mjs` | 7 / 7 viewports + Home → Continue round trip | `refinement-ui/results.json`, `<w>x<h>.png` |
| `verify-touch-layout.mjs` | 6 / 7 viewports — **D1** at 320×568 (strip Adjust row overlaps the camera cluster); all other checks on the six passing viewports green | `touch-layout/results.json`, `narrow-failure.png` |
| `verify-desktop-space.mjs` | 4 / 4 (1024×600, 1280×720, 1366×768, 1920×1080); catalog fully visible tiles 9 / 12 / 12 / 23 | `desktop-space/` |
| `schema-roundtrip.mjs` | 3 / 3 cases (schema 2, schema 3, legacy 1), equal after import, reload and Home → Continue → reload | `schema-roundtrip/` |
| `verify-refinement-multiplayer.mjs` (real Worker, guest room) | 9 / 9 steps, export == authoritative `GET /worlds/:id`, cold rejoin equal, room locked afterwards | `multiplayer-local/results.json`, `owner.png`, `peer.png` |
| `npx vitest run` | 122 files, 1243 tests passed | `vitest.log` |
| `npx tsc -p tsconfig.app.json --noEmit` | clean | `tsc.log` |

## End to end, step by step

Contexts: teacher 1366×768, student (owner) 1024×768, classmate 1366×768; all with clipboard permission and the
onboarding guide pre-dismissed. Every step reads the authoritative state as the acting account through
`GET /classroom/me`, `/classes`, `/worlds`, `/worlds/:id` before it passes.

| # | Step | Result | Authoritative check | Evidence |
|---|---|---|---|---|
| 1 | teacher opens `/class` signed out | passed → `/join?mode=teacher&next=/class` | — | — |
| 2 | "Use email and password" → teacher-login → `/class` first run | passed | `GET /me`: teacher, `classes: []` | `01-class-first-run.jpeg` |
| 3 | Name your class → Create class → invite step | passed | `GET /classes`: one class, code on the card == `code` | `02-class-invite-step.jpeg` |
| 4 | Copy join link | passed: `/join?classCode=ROOM-11` on the QA origin, QR is a PNG data URL | — | — |
| 5 | Show on projector → `/class/projector` → Close | passed: class name, code at 200 px, QR alt "Scan to join …", Close → `/class` | — | `03-class-projector.jpeg` |
| 6 | student opens the invite link | passed: class chip "Room 12 Builders", code prefilled and collapsed | — | `04-join-from-invite.jpeg` |
| 7 | weak passwords `abc`, `= username`, `password` | passed: a rule goes red, submit stays disabled (client checklist) | — | `05-join-weak-password.jpeg` |
| 8 | Create account and join (`maya_b`) | passed: register **201** → `/worlds` empty state | `GET /me` in the class; `GET /worlds` = `[]` | `06-worlds-empty.jpeg` |
| 9 | classmate registers the same username | passed: **409 `username_taken`**, alert + three free chips, tap `maya_b2` → 201 → `/worlds` | `GET /me` = `maya_b2` | `07-join-username-taken.jpeg` |
| 10 | Open the studio, place two bricks | passed: guest draft holds 2 bricks | localStorage draft | `08-editor-placed.jpeg` |
| 11 | `/build?classroom=save` → "Save this build to your account" → Save world | passed: `POST /worlds` 201 | `GET /worlds`: 1 private world, `canEdit`; `GET /worlds/:id` document has the 2 bricks | `09-editor-saved.jpeg` |
| 12 | Share with my class → sheet, "Classmates can look" default → Share | passed | `visibility: class`, `classCanEdit: false`, `sharedAt` set | `10-worlds-share-sheet.jpeg`, `11-worlds-shared-look.jpeg` |
| 13 | classmate Sign out → `/join?mode=signin` → username + password, no code | passed: session key cleared, no code field, → `/worlds` | `GET /me` | — |
| 14 | tap-your-name: I have a class code → ROOM-11 → roster → tap `maya_b2` → focus on password → Sign in | passed (both "Maya B." tiles told apart by username) | `GET /me` | `12-join-roster.jpeg` |
| 15 | classmate `/worlds?view=class` | passed: card "Maya B.", Look only, Visit → `/live/<id>`, no Join | `GET /worlds` lists it with `canEdit: false`, `ownerName: "Maya B."` | `13-worlds-classmate-look-only.jpeg` |
| 16 | Visit (read-only HUD) | **blocked**: `/live/<id>` reaches the classroom gate, then "Cannot open this classroom world" because the live room needs Supabase + `CLASSROOM_TICKET_SECRET` on the Worker | — | `14-live-visit.jpeg`, `15-…-failure.jpeg` |
| 17 | Make my own copy | passed: `POST /worlds/:id/copy` 201, "<title> (copy)" under Mine | copy is private, owned by the classmate, 2 bricks | `16-worlds-copy-under-mine.jpeg` |
| 18 | owner Sharing… → "Classmates can build with me" → Save sharing | passed | `classCanEdit: true` | — |
| 19 | classmate reload | passed: Join link + Build together chip | `canEdit: true` | `17-worlds-classmate-build-together.jpeg` |
| 20 | Join and place a brick | **blocked** (live room, as 16); Join href and `canEdit` proven | — | — |
| 21 | teacher `/class` Students → "Shared by students" → Hide from class | passed: owner "Maya B.", Build together, then "Hidden from the class" + Show again | teacher `hiddenByTeacher: true`; classmate: not listed, `GET /worlds/:id` → **403 `world_hidden`** | `18-class-shared-by-students.jpeg`, `19-class-hidden.jpeg` |
| 22 | classmate `/worlds?view=class` | passed: "Nothing shared yet" | — | `20-worlds-classmate-after-hide.jpeg` |
| 23 | teacher Show again | passed | listed again for the classmate | — |
| 24 | owner Sharing… → Stop sharing | passed | `visibility: private`, `sharedAt: null`; classmate `GET /worlds/:id` → **404**, not listed | `21-worlds-unshared.jpeg` |
| 25 | classmate ejected while inside | **blocked** (never inside, as 16); access loss proven at the API | — | — |

## Surfaces matrix

19 surfaces: `join-new` (`?classCode=`), `join-signin`, `join-signin-roster` (code entered, roster open), `join-teacher`,
`join-teacher-email`; `worlds-student-mine` (draft strip + own worlds), `worlds-student-class` (`?view=class`),
`worlds-share-sheet` (Escape closes, focus returns to "Share with my class"), `worlds-teacher` (`?view=class`,
Shared by students + Hide); `class-first-run`, `class-first-run-invite` (fresh teacher per run; class created,
code card + QR), `class-students`, `class-settings`, `class-worlds`, `class-projector`; `editor-idle`, `editor-brush`,
`editor-selected`, `editor-selected-color` (Escape closes the Color popover, focus returns to Recolor). Viewports
1366×768, 1024×768, 768×1024, 390×844, 320×740, 844×390; 200 % zoom at the three desktop/tablet sizes; reduced motion at
1366×768 and 390×844. Hard checks and strict flags as in `scripts/qa/lib/surfaces.mjs`.

The two `/worlds` rows that failed on `4be3b03` (`Join` / `Visit` / `Hide from class` below the fold at 1366×768 and
unreachable because the page could not scroll) **pass on `52420c5`** at every viewport and variant.

## Defects by owner lane

| Id | Lane | Severity | Where | What | Evidence |
|---|---|---|---|---|---|
| D1 | W6 | non-blocker | `src/brick/command-strip.css` (`.brick-compact-layout .command-strip`, `bottom: … + 68px`) vs `.brick-camera-cluster`; selectors `[data-testid="command-strip"]`, `[role=group][aria-label="Camera view"]`; viewport **320×568** touch | With a brick selected and **Adjust** open the strip grows to 283 px (8,209 → 312,492) and covers the camera cluster (254,116 → 312,316): Frame / Top / Front / 3D are unreachable until Adjust is collapsed. 320×740 and 390×844 are clear. | `touch-layout/narrow-failure.png`, `touch-layout/results.json` |
| D2 | W6 | non-blocker | `src/brick/touch-layout.css:4` `.brick-sheet-size` (button "Expand brick drawer" / "Make brick drawer smaller"); viewport 390×844 touch | The drawer sheet's resize grip is 360×28 px — under the 44 px contract (strict matrix fails `build-drawer@390x844`). Not on the baseline or integrated defect lists. | `brand-surfaces-subset/results.json` |
| D3 | W6 | non-blocker | `src/brick/BrickStudioApp.tsx:690` `nav.brick-creative-dock` ("Creative tools") + `header[aria-label="Studio toolbar"]` tools; viewports ≤ 1024 touch (768×1024, 390×844, 320×740, 844×390) | Two visible buttons named **Character** and two named **Scene** on compact layouts: the new header tool row and the old creative dock both render them. Duplicate controls with one accessible name (and a strict-mode locator hazard). The header's Home / ⋯ / mode switch / chip are single. | `refinement-ui/390x844.png`, `touch-layout/phone-selected.png` |
| D4 | W4 (fixed by the lead at `52420c5`) | was blocker | `src/pages/worlds/worlds.css` `.worlds-page` | `/worlds` could not scroll (`html/body/#root` are `overflow: hidden`; the page had no scroll rule): at 1366×768 the teacher view was 1473 px tall with `scrollTop` pinned at 0, at 390×844 4082 px — Join / Visit / Hide / World controls unreachable. Verified fixed: `worlds-*` rows green at all 209 runs. | first run: `surfaces-run1` rows `worlds-student-class@1366x768`, `worlds-teacher@1366x768` (superseded) |

Observations, not defects:

- **Page-level scrolling** on `/join`, `/worlds`, `/class` is implemented as the page root (`div.join-page`,
  `div.worlds-page`, `div.class-page`) being the scroller, because `html, body, #root` stay `overflow: hidden` for the
  editor (`src/styles.css:142`). The whole page scrolls as one; the matrix records it as a note (123 notes) and
  `STRICT_PAGE_SCROLL=1` would fail it if the lead wants the document itself to scroll. The roster grid on
  `/join?mode=signin` is capped at two rows under 700 px by design (W3 note) and is the only other inner scroller.
- `class-projector` uses `main.class-projector-page` as its scroller; content fits at every viewport, nothing scrolls.
- The classroom **live** path (viewer read-only HUD, editor join, eject on unshare / hide / sharing-off) is untested
  in the browser on this host. Recommended: one run of `flows-e2e.mjs` against a staging Worker with Supabase and
  `CLASSROOM_TICKET_SECRET` (`CLASSROOM_API=<staging worker> LIVE_API=<staging worker>`, frontend started with both
  `VITE_*` URLs pointing there); the script needs no change — it already detects a real backend and skips the mock reset.
- Presence: the mock returns `buildingNow: null`, so the "N building now" chip on `/class` is not exercised
  (real Worker fills it on `GET /classes` only, 30/min per teacher per the lead's note).

## Manual walkthrough checklist (owner)

Environment: the three servers from "Commands" (Worker 8797, mock 8798, Vite 5277), or a staging pair with real accounts.
Seed the mock fixture first: `curl -X POST http://127.0.0.1:8798/__qa/reset; curl -X POST http://127.0.0.1:8798/__qa/seed -H 'content-type: application/json' -d '{}'`.

Seeded accounts (mock): teacher **qa-teacher@example.com / teach-bricks** (class "Period 3 Makers", code **ROOM-11**);
students **ava_builds, ben_k, chloe_m, diego_s, emma_l, finn_o / brick-time** (Ava owns Treehouse Hideout · private,
Rainbow Rocket · look only, Lava Lab · build together; Ben's Sky Bridge and Emma's Secret Garden are build-together,
Chloe's Cloud Castle look-only, Diego's Moon Base hidden by the teacher; teacher worlds Class Town and Bridge Team with
Ava as member). Any **new** teacher email (password ≥ 8 chars) gets a fresh account with no class → first run.
After `flows-e2e.mjs`: teacher qa-teacher@example.com / teach-bricks (class "Room 12 Builders", ROOM-11), students
**maya_b / castle-99** (owner of "Maya's Tower …") and **maya_b2 / rocket-42**.

| ✓ | Flow | Do | Expect |
|---|---|---|---|
| ☐ | Teacher first run | Signed out, open `/class` | Lands on `/join?mode=teacher&next=/class`; "Use email and password" → sign in with a **new** email → `/class` shows "Set up your class" with three steps |
| ☐ | Name the class | Type a name → Create class | Step 2 opens with the code card: QR, code in display type, "Students go to <host>/join…", Show on projector / Copy join link / Print QR |
| ☐ | Invite link | Copy join link, paste somewhere | `https://<host>/join?classCode=<CODE>`; button reads "Link copied" for ~2 s |
| ☐ | Projector | Show on projector | Full-screen class name, code ≥ 200 px, 320 px QR, join line; Close → `/class` (everyday page, Students tab) |
| ☐ | Student joins from the link | Open the invite link on a second device / private window | "Join your class", class name chip, code hidden behind "Change class code"; username and password checklists grey |
| ☐ | Weak password | Type `abc`, then your username, then `password` | The matching rule turns red, "Create account and join" stays disabled |
| ☐ | Taken username | Register a second student with an existing username | Red alert "Someone already has that username…" and up to three "Free right now" chips; tapping one fills the field |
| ☐ | Success | Valid name, roster name and password → Create account and join | Lands on `/worlds`: "Your first world starts here." with **Open the studio**; account chip shows "First L." + class name |
| ☐ | Build and save | Open the studio, place a few bricks, account chip → "Save this build to my account" (or `/build?classroom=save`) → name → Save world | Save pill turns to the account state; `/worlds` shows the world under "Saved to your account" with Open / Share with my class / ⋯ |
| ☐ | Draft strip | With a guest draft in this browser, open `/worlds` | "Build in progress on this device · This browser only · N bricks" with Continue building / Save to my account |
| ☐ | Share look only | Share with my class → keep "Classmates can look" → Share | Notice "…Classmates can look."; card chip "Shared · look only"; button now "Sharing…" |
| ☐ | Classmate sign-in (no code) | Second student: account chip → Sign out → sign in with username + password only | No class-code field; lands on `/worlds` |
| ☐ | Tap your name | Sign out → `/join?mode=signin` → "I have a class code" → code | Class chip + "Tap your name, then type your password." tiles (display name + username); tap → username filled, focus in the password (relabelled "<Name>, type your password") → Sign in |
| ☐ | Remembered class | Reload `/join?mode=signin` after a sign-in | Class chip with "Not you? Change class"; Change clears it |
| ☐ | Shared by classmates | Classmate: `/worlds` → class tab (or account chip → My class) | Card with owner "First L.", **Look only**, **Visit** (no Join), **Make my own copy** |
| ☐ | Visit (needs live Worker) | Visit | Live room opens as a viewer: bricks cannot be placed, HUD says look-only, Explore works |
| ☐ | Make my own copy | Make my own copy | Notice "“<title> (copy)” is in your worlds now."; Mine tab shows the copy (private) |
| ☐ | Build with me | Owner: Sharing… → "Classmates can build with me" → Save sharing | Chip "Shared · build together"; classmate reload shows **Join** + "Build together" |
| ☐ | Join and place (needs live Worker) | Classmate: Join → place a brick | Brick appears for the owner too; save pill shows the shared state |
| ☐ | Teacher sees it | Teacher `/class` Students tab | "Shared by students" card: title, owner, Look only / Build together, Visit, **Hide from class**; "Students can share: On" chip |
| ☐ | Hide | Hide from class | Notice "…is hidden from the class. The student keeps their build."; card reads "Hidden from the class" with **Show again**; classmate's class tab no longer lists it (owner still sees "Sharing…") |
| ☐ | Show again | Show again | Listed again for classmates |
| ☐ | Unshare while inside (needs live Worker) | Classmate inside the room; owner Sharing… → Stop sharing | Classmate is dropped with the "access changed" screen and a way back to My worlds; owner keeps building; card back to "Share with my class" |
| ☐ | Sharing off (teacher) | Settings → "Students can share their own builds" Off | Students lose "Share with my class"; already-shared worlds stop showing to classmates; owners keep "Sharing…" to stop |
| ☐ | Collaboration closed | Settings → Building together → Close now | Students' class tab shows one line "<Teacher> closed collaboration…", no cards |
| ☐ | Signed-out guards | Signed out: open `/worlds`, `/class`, `/class/projector` | → `/join?mode=signin&next=/worlds`, `/join?mode=teacher&next=/class`, `…next=/class/projector`; a student on `/class` → `/worlds` |
| ☐ | Editor chrome | `/build` at 1366 and 390 | Header: mark, title + ⋯ "This build" (Rename on account worlds, Download / Import / New build, Settings, Help), save pill, Scene / Character / People, Build \| Explore pill, account chip; strip idle / brush / selected states; camera cluster bottom-right; Undo / Redo top-left |
| ☐ | Phone check | 390×844: `/join`, `/worlds`, `/class` | Whole page scrolls, no horizontal scroll, every tap target ≥ 44 px, share sheet fits and Escape/Cancel closes it |

Legend: "needs live Worker" = a Worker with Supabase + `CLASSROOM_TICKET_SECRET` (staging); everything else was verified
here on the mock.

## Evidence layout

`e2e/` (21 step screenshots + `results.json`), `surfaces/` (`results.json` for all 209 runs; screenshots kept for the
1366×768 and 390×844 rows of every variant — the 1024×768, 768×1024, 320×740 and 844×390 JPEGs were deleted after the
run to keep the directory small, the same pruning the integrated brand run used; every one of those rows passed, and a
re-run of the matrix recreates them), `surfaces-run1-4be3b03.json` (the superseded run that caught D4),
`brand-surfaces-subset/`, `refinement-ui/`, `touch-layout/` (onboarding shots dropped), `desktop-space/`,
`schema-roundtrip/`, `multiplayer-local/`, and one `<harness>.log` per command above.
