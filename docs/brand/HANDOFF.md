# Brickgineers direction I — integration candidate handoff to Codex

Prepared by the Claude lead session on 2026-09-14/15. Codex owns independent review, hosted configuration, staging,
production deployment and domain wiring. Nothing here has been pushed, deployed, or applied to auth, DNS, providers or
live student data. The brand/domain pairing is still unresolved: no domain string exists in source.

## Candidate

- Branch `claude/brickgineers-brand`, worktree `/Users/ahmaadidrees/.codex/worktrees/brand-integration`
- **Candidate SHA: `25c9b7d91ba9511e54cbf677d3c775bf3aefac68`** (product code and evidence; the checks below ran at this
  commit). Any later commit on the branch is documentation only (this file, `docs/brand/status/lead.md`).
- Base of the pass: `7341db0` (codex/product-refinement); contracts `f8c7ad3`; lane branches `claude/brand-w0..w8` are
  all merged and may be deleted after review.
- Approved visuals (untracked, read-only): `/Users/ahmaadidrees/.codex/worktrees/brick-product-refinement/outputs/branding/`
  (`direction-I-approved.png`, `brickgineers-i-surfaces/NN-*.png`, `PACKAGE-MANIFEST.json`).

## Launch locally

```bash
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
cd /Users/ahmaadidrees/.codex/worktrees/brand-integration
npx vite --port 5190 --strictPort --host 127.0.0.1
```

Then open http://127.0.0.1:5190/ (landing), `/build` (editor), `/build?classroom=join|signin|teacher|worlds|class`,
`/dev/ui` (component gallery, dev only). Guest rooms against a local worker: start
`npm run dev --workspace brick-studio-race-worker -- --port 8787` and run Vite with
`VITE_LIVE_SERVER_URL=http://127.0.0.1:8787` (see `docs/brand/qa/README.md`).

## Checks on the candidate (Node 22.23.2)

| Command | Result |
|---|---|
| `npm run check` (= `vitest run`, worker tests, brick-core + worker typechecks, `tsc -b && vite build`) | frontend 109 files / 1075 tests passed; worker 6 files / 78 tests passed; typechecks clean; build succeeded |
| `npx tsc -p tsconfig.app.json --noEmit` | clean |
| Strict surfaces matrix at `ab98e1c` (W8) | 275 runs: 256 passed, 19 failed (N1 landscape, N5 colour picker, N9), 0 targets under 44px |
| Lead re-check of the 11 affected surfaces at `91ad099` (after the N1/N5/N9 fixes) | 99 runs: 99 passed |
| `verify-refinement-ui.mjs` at `ab98e1c` | 6/7 (the 844×390 row failed on N1, fixed in `91ad099`) |
| `verify-character-customizer.mjs` at `907a06c` | passed, 0 page errors |
| `schema-roundtrip.mjs` at `907a06c` | 3/3 (schema 2, schema 3, legacy 1→2; equal after import, reload, Home → Continue → reload) |
| `board-captures.mjs` at `ab98e1c` | 61 entries: 51 captured, 10 need an account/teacher fixture, 0 failed |
| `verify-refinement-multiplayer.mjs` (local worker) at `907a06c` | 9/9 (invite without owner fragment, 96→128 resize propagated, export == authoritative document, cold rejoin equal) |
| `route-transfer.mjs` at `907a06c` | landing 151.7 KB (no editor chunk), `/build` +1.6%, others ≤ +2.3% |
| `verify-expanded-performance.mjs` at `907a06c`, quiet host | Toy Room 87 draw calls / 923,174 tris / RAF p95 16.7 ms (pre-brand 103 / 923,622 / 16.7); Sky Island and Brick Valley identical to pre-brand |

Commits between `907a06c` and `25c9b7d` are layout-only CSS/TSX fixes (N1–N9), QA evidence and docs; the unit and
build gates were re-run at `25c9b7d`.

Browser acceptance (W8, `docs/brand/qa/integrated/RESULTS.md`): strict six-viewport surfaces matrix with 200% zoom and
reduced motion, refinement UI harness (header/toolbar bounds, Character shortcut, Settings, Escape focus, Place → Home →
Continue document equality), character customizer (real WebGL previews, Apply → reload, outfits), schema 2/3 and legacy
round trips, two-client guest room on a local worker (invite without owner fragment, resize propagation, export ==
authoritative document, cold rejoin equality), per-route compressed transfer, expanded performance on a quiet host.

## Surface comparisons (board → implementation → capture)

Captures live under `docs/brand/qa/integrated/boards/` (1366×768 and 390×844). Lane-level captures with more states are
under `docs/brand/qa/w1..w7/`.

| Board | Implemented in | Captures | Deviations from the raster (all deliberate) |
|---|---|---|---|
| 01 Landing | `src/brick/landing/**` | `01-landing-start-building-*`, `01-landing-continue-building-*` | Footer carries no domain; hero/scene/character art are the captured runtime media (`public/brand/media`), Help/Privacy are in-page sections with drafts in `docs/brand/copy/` pending review |
| 02 How it works / teachers | `src/brick/landing/**` | `02-how-it-works-teachers-*` | "Explore worlds" nav not built (no public gallery); teacher copy says Google is primary and that the page does not create teacher accounts |
| 03 Entry | `src/classroom/{ClassroomPanel,EntryViews,fields}.tsx` | `03-sign-in-enrollment-{join,student-sign-in,teacher-sign-in}-*` | Three-way switch Student / Join a class / Teacher; Lucide icons only (no Google "G") |
| 04 Recovery / save handoff | `src/classroom/RecoveryViews.tsx`, `TeacherGoogleCallback.tsx` | `04-account-recovery-guest-save-handoff-*`; password-reset needs an account fixture (lane capture in `docs/brand/qa/w3/`) | BrickMark instead of world thumbnails |
| 05 My Worlds / My Class | `src/classroom/{WorldsView,ClassView}.tsx` | needs an account fixture; mocked-session captures in `docs/brand/qa/w3/` | Explicit buttons instead of a kebab; BrickMark, no fake thumbnails or counts |
| 06 Build editor | `src/brick/BrickStudioApp.tsx`, `StudioMenu.tsx`, `brick-studio.css` | `06-build-editor-*`, `06-build-editor-brick-drawer-*` | 64px header; selection glow restrained; guest title "My build" (no schema field) |
| 07 Explore | `src/brick/BrickStudioApp.tsx` (ExploreHud) | `07-explore-*` | World menu is reachable via Back to building (HUD keeps Character/People/Settings) |
| 08 Scenes & plate | `src/brick/contentPicker/**` | `08-scenes-plate-*` | Right-docked sheet so the live preview stays visible; no terrain tools |
| 09 Character studio | `src/brick/characters/**` | `09-character-studio-*` | Names stay "Toy Figure"/"Classic Builder"; text chips instead of tile thumbnails; Robot Hero selectable but out of marketing |
| 10 Custom bricks & color | `src/brick/customParts/**`, `CustomColorPicker.tsx` | `10-custom-bricks-color-{create-brick,color-picker}-*` | Real `CustomPartTemplate` union + three-way studs select; Arch/toggle/"Recently used" not built |
| 11 Guest collaboration | `src/brick/live/**`, `LiveWorldPage.tsx` | `11-guest-collaboration-{create-room,in-room-people}-*` | One People panel opened from the header (HUD popovers merged) |
| 12 Settings & world menu | `src/brick/ExploreCameraSettings.tsx`, `StudioMenu.tsx` | `12-settings-world-menu-{settings,world-menu}-*` | Motion keeps three options; replace-draft confirmation is still `window.confirm` (lead-owned hook, see limitations) |
| 13 Teacher roster | `src/classroom/RosterView.tsx` | needs a teacher fixture; mocked captures in `docs/brand/qa/w3/` | Manage replaces the list in place |
| 14 Class access & groups | `src/classroom/{ClassView,GroupControls}.tsx` | needs a teacher fixture; mocked captures in `docs/brand/qa/w3/` | Open/Closed chips + verb buttons instead of switches |
| 15 Safe states & viewer | `AppErrorBoundary`, `GraphicsPausedOverlay`, `PublishedWorldPage`, `live/LiveStateViews` | `15-safe-states-viewer-{published-viewer,remix-confirm,graphics-paused,import-corrupt,live-unavailable,not-found}-*` | Graphics pause offers Reload after 10 s + Download (no Resume); remix `replaceState('/build')` |
| 16 Mobile | every surface owner | `16-mobile-{quick-start,build,brick-sheet}-390x844` plus every `*-390x844` above | Menu toggle keeps a visible "Menu" label; save chip icon-only on phones except error/offline |

## What changed (summary)

- Brand foundation: `src/brand/**` (constants, mark, wordmark), `src/ui/**` (Button, Field, Select, Sheet/Dialog,
  SegmentedControl, SaveStatus, gallery), semantic tokens and z-scale in `src/styles.css`, identity assets in `public/`,
  `index.html` metadata (origin still read from `VITE_PUBLIC_ORIGIN`).
- Lead: entry-intent contract (`src/routes.ts`), CharacterStudio extraction, live state views, dev-only `/dev/ui`,
  visible copy rebrand in lead-owned modules (messages, brick-core import errors, worker refresh/session messages,
  README), default download name `brickgineers-build.brickstudio.json`.
- Lanes W2–W7 as in the table above; Toy Room polished (`src/brick/environments/toy-room/**`, 87 draw calls vs 103);
  marketing media pipeline (`scripts/art/media-*.mjs`, `public/brand/media/**` with manifest and provenance);
  original characters recolored via Blender with regenerated GLBs/previews (`assets/characters-original/**`).
- QA: `scripts/qa/**` parameterized harnesses, surfaces matrix, board captures, schema round trip, route transfer;
  evidence under `docs/brand/qa/**`.
- Dependency: `qrcode@1.5.4` was added (`package.json`/lockfile) for the class invite QR. It is a dynamic import in
  `src/classroom/ClassInvite.tsx` (loaded when the invite opens), so it is not in the landing or editor initial chunks.
- Note for Codex (hosted auth): the worker admits `https://www.brickgineers.com` as a distinct application origin next
  to `https://brickgineers.com` (`multiplayer/worker/src/applicationOrigin.ts`). Supabase Auth's redirect allow-list
  (teacher Google callback) must therefore include both hosts, unless `www` is redirected to the apex before the app loads.

Unchanged by design: every `brick-studio.*` storage key, `.brickstudio.json`, package name, tables, worker names,
Durable Object bindings, document schema, character/environment IDs, live protocol, `package.json`/lockfile (except
the `qrcode` addition above), `vercel.json`, `wrangler.jsonc`, `.env*`.

## Known deviations and limitations

1. Landing compressed transfer is 151.7 KB vs 87.7 KB pre-brand (+73%): 59 KB is the new brand media at 1366×768
   (hero 23.6 KB AVIF + three scene thumbnails + one character portrait); JS grew 5.3 KB. Media stays within the
   250 KB hero / 600 KB initial budgets and the landing still loads no editor/three chunk. Editor routes grew ≤ 2.3%.
2. Hosted classroom flows (boards 04 password reset, 05, 13, 14) were verified with unit tests and mocked-session
   captures only; the local worker has no classroom secrets. Codex's staging pass with disposable fixtures covers them.
3. "Open this build?" replace-draft confirmation stays a native `window.confirm` (it lives in lead-owned
   `useBrickStudioDocuments`); W4 requested a confirm hook so it can become a `Dialog`.
4. `/live/<unknown id>` with a reachable worker still receives 401 from the worker; the page now shows an explicit
   "This world needs a class sign-in" state. A distinct 404 for unknown rooms would need a worker change.
5. Help and Privacy copy (`docs/brand/copy/*.md`) are factual drafts with open questions; publication needs review.
6. Headless captures at touch viewports do not paint the Build-mode WebGL canvas (pre-existing capture artifact; Explore
   and published captures do render; customizer previews are hashed from real frames). No physical Chromebook run.
7. Consumer adoption of the newest primitives (`Button href`, `Select`, `Field requiredMark`) in W2/W3 files is
   optional cleanup; those lanes still use their local equivalents.
8. One unit test (`BrickStudioApp.test.tsx` "applies a custom group color…") and two others failed once each in full
   runs at host load 21 on 18 cores while the browser matrix ran; they pass alone and in every quiet-host run.

## Lane branches and evidence

| Lane | Branch | Status note | Evidence |
|---|---|---|---|
| Lead | `claude/brickgineers-brand` | `docs/brand/status/lead.md` | this file |
| W0–W8 | `claude/brand-w0..w8` | `docs/brand/status/w0..w8.md` | `docs/brand/qa/w1..w8`, `docs/brand/qa/baseline`, `docs/brand/qa/integrated` |
