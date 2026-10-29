# Overnight friction fixes, 2026-10-28 → 29 (APPROVED: five lanes)

Approved by the owner on 2026-10-28 ~23:00 PT ("Yes, five lanes"), after two explore passes
(`explorer-reports/1…12`) and an independent review (`addendum-independent-review.txt`).
Scope: the five lanes below. **No push, no deploy, no Worker or migration changes.**

## Layout

| Lane | Branch | Worktree (all from `9b0a43e`) |
|---|---|---|
| Integration (Claude session) | `claude/friction-int` | `~/.codex/worktrees/friction/int` |
| L1 Hackable data | `claude/fx-hackable-data` | `~/.codex/worktrees/friction/L1-hackable-data` |
| L2 Powers, shelf, runtime | `claude/fx-powers-runtime` | `~/.codex/worktrees/friction/L2-powers-runtime` |
| L3 Saving for 3D and classes | `claude/fx-saving` | `~/.codex/worktrees/friction/L3-saving` |
| L4 2D and race | `claude/fx-2d` | `~/.codex/worktrees/friction/L4-2d` |
| L5 Joining and teacher quick wins | `claude/fx-joining` | `~/.codex/worktrees/friction/L5-joining` |

Rules for every lane:
- Verify `git rev-parse --short HEAD` is `9b0a43e` (or a descendant on your own branch) before editing.
- Edit only the files your lane owns (below). If a fix truly needs another lane's file, stop and
  report it instead of editing.
- Node 22: `export PATH=/opt/homebrew/opt/node@22/bin:$PATH`. Run `npm ci` once.
- Tests: targeted `npx vitest run <files> --maxWorkers=2 --testTimeout=15000`; then
  `npx tsc -b` (or `npm run build`). The Mac is shared with other projects: no full `npm test`,
  no long benchmarks, no GPU jobs. Don't run `scripts/local/start.mjs` (integration owns the one
  local stack on 5185/8798/8799/9235). For a browser check, run vite on your lane's port only
  (L1 5281, L2 5282, L3 5283, L4 5284, L5 5285) with headless Playwright via `scripts/qa/lib/env.mjs`;
  never the Claude browser pane. `scripts/qa/live-latency.mjs` defaults to staging: don't run it.
- Commit small, on your own branch, with tests in the same commit. Message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Never push, never touch other branches.
- Autosave/retry work: retry only transient failures (network, timeout, 5xx). Never auto-retry 409
  conflicts, validation or auth failures (`src/classroom/cloudAutosave.test.ts:31` guards 409).
- Kid-facing copy: short, plain words, "project" (not "world") for things kids own.
- Separate in your report what is proven by tests, by headless browser, and what is inference.

## L1 Hackable data — owns
`src/platformer/lab/studio/{persist/*, storage.ts, StudioApp.tsx, assets/*, CostumeEditor.tsx, pixels.ts, store.ts, starter.ts}`,
`src/platformer/lab/studio/screen/StudioShell.tsx` (leave-flush only), `src/projects/projectFile.ts`,
`src/pages/worlds/*`, `src/classroom/InviteSheet.tsx`, matching tests.

`src/platformer/lab/core/*` is L2's: read it, don't change limits there (fix by keeping pictures small
and by raising the My projects import cap instead).

Tier 1, in order:
1. **Stage Costumes save break (reproduced in browser).** Opening Code → Stage → Costumes
   auto-creates a 480×360 backdrop (`CostumeEditor.tsx:98-107`, PNG encoding in `pixels.ts:117-130`) over the 200k picture limit
   (`core/project.ts:59,428`); every later local save is refused (`storage.ts:190-200`). Don't create a
   backdrop until the kid paints; keep pictures within limits (crop to content and/or compress).
   **Also recover already-broken projects**: local and account saves holding an oversized/empty
   auto-backdrop must open again (drop or shrink that asset on load) instead of being refused.
2. **Validate before account save** (`persist/hackableCloud.ts:90-91`) so the account never stores a
   project that `hackableSave.ts:17-19` will refuse to reopen; kid message when it fails.
3. **Rebuild the project list.** Corrupt index reads as `[]` (`persist/hackableProjects.ts:59-66`)
   and the next save rewrites it with one project; a direct `?draft=` link whose payload exists but
   isn't listed is refused (`StudioApp.tsx:79`). Rebuild entries by scanning stored payloads; open a
   listed-or-stored draft; never drop recoverable projects.
4. **File round trip.** My projects' download (`.brickgineers`) must open via Hackable Open File
   (picker only takes `.json`, `persist/ProjectMenu.tsx:97`; `projectIo.ts:36-77`) and Hackable files
   up to the Hackable save limit must import via My projects (`projectFile.ts:20,86` caps at
   3,000,000 vs `core/save.ts:33` 5 MiB). Distinct, explicit limits with kid-word errors.
5. **Save before leaving.** Logo and My projects buttons navigate without flushing
   (`screen/StudioShell.tsx:143,155`); also save when the tab is hidden (`storage.ts:331-334`).
6. **"Make my own copy"** clones the server original, dropping the kid's tries (`StudioApp.tsx:195`):
   copy the open project.
7. **Hackable invites.** URL built as `?world=<id>?invited=1` (`pages/worlds/WorldsPage.tsx:252`,
   `worldsData.ts:142`) — fix the join. Hackable has no live rooms, so classmates must open it
   look-only with "Make my own copy" (never save over the owner's project), and the invite sheet must
   not promise "build with you, live" for Hackable (`InviteSheet.tsx:58,138`).

Tier 2 if time: Undo for Reset/Open File (first-pass F#8); Reset keeps the project name;
at the 50-world account limit fall back to browser save (`StudioApp.tsx:63`); kid-word Open File
errors; `?new=1` creates nothing until the first edit; My powers save failure reported honestly.

Acceptance: Hackable → Stage → Costumes → place a brick → reload → brick still there; a project
saved with the old oversized backdrop opens; corrupt the index → project reappears in My projects;
download from My projects → Hackable Open File reopens it; 3.5 MB project round-trips; tap logo 0.3 s
after an edit → edit is saved; invite link opens the right project look-only.

## L2 Powers, shelf, runtime — owns
`src/platformer/lab/core/*` (runtime), `src/platformer/lab/studio/{powers/*, hero/*, stage/*}`,
`screen/PowersBar.tsx`, the power-chip rules in `screen/screen.css`, `screen/PlayTouchControls.tsx`,
`builder/playRules.ts`, `builder/PlayFeedback.tsx`,
`src/pages/class/ShelfTab.tsx`, matching tests. Not `store.ts` or `StudioShell.tsx` (L1).

Tier 1, in order:
1. **Cyclic broadcasts freeze the tab.** `when I receive a → broadcast b` / `when I receive b →
   broadcast a` keeps appending threads inside one live-array sweep (`core/runtime.ts:428-444`,
   `:1004-1019`, `broadcast` at `:347`); budget and `MAX_SWEEPS_PER_TICK` are only checked between
   sweeps. Bound work inside the sweep (e.g. threads started during a sweep wait for the next sweep,
   and the budget is checked per thread) while keeping Scratch ordering and restart semantics.
   Tests: ping-pong returns control each tick; Stop works; ordinary broadcast order unchanged; all
   existing core/conformance tests pass.
2. **Nested custom blocks in powers.** `makePower` follows My Block calls one level only
   (`powers/powers.ts:277-288`): take the transitive closure with a visited set (mutual recursion
   safe), keep variables and credits. Test: script → A → B exports/imports and plays the same.
3. **Confirm before "Take off"** when the power's blocks changed since it was snapped
   (`powers/powers.ts:224-225`; button 6px from the switch, `screen/screen.css:289-295` — CSS tweak OK).
4. **Dash on touch.** Dash reads `z` (`powers/powers.ts:381`); touch buttons only send arrows,
   space, x (`screen/PlayTouchControls.tsx:8-15`); hint is fixed keyboard text (`builder/playRules.ts:17`).
   Let a power declare its key, show a touch button for snapped powers, name it in the hint.
5. **Hero respawn** goes to fixed `HERO_START` (`hero/heroBrick.ts:158,541`), not where the kid
   placed it: remember the level-start position. Careful: untouched old Heroes are upgraded on load
   by fingerprint — keep that working and tested.
6. **Class shelf stays live.** Teacher Shelf loads only on mount/class change
   (`pages/class/ShelfTab.tsx:57-66`); student picker only on open/after share
   (`powers/useClassShelf.ts:36-51`). Add a Refresh control plus light polling while visible
   (keep selection/Peek), and ignore stale responses after class/session changes.

Tier 2 if time: sounds that finish loading after Stop must not start (`stage/audio.ts:65-100,127-131`).

## L3 Saving for 3D and classes — owns
`src/classroom/{cloudAutosave.ts, client.ts, useClassroomWorld.ts}`, `src/main.tsx`,
`src/brick/AppErrorBoundary.tsx`, `src/brick/{documentPersistence.ts, useBrickStudioDocuments.ts,
BrickStudioApp.tsx, LiveWorldPage.tsx}`, `src/shell/useClassroomSession.ts`, matching tests.

Tier 1:
1. **Autosave recovers by itself.** One failure sets `failed=true` and nothing flushes until Retry
   (`cloudAutosave.ts:38,45,47`); no `online` listener. Retry transient failures with backoff and on
   `online`; never 409/validation/auth. One short kid message.
2. **Stale 3D tab overwrites the build.** `flush` saves even when unchanged, on every pagehide/hide
   (`documentPersistence.ts:123-130`, `useBrickStudioDocuments.ts:101-104`): only save when this tab
   changed something. If time: banner when another tab changed the build.
3. **"Use as my local build"** overwrites silently (`LiveWorldPage.tsx:584-587`): confirm and download
   the old build first. **"New build"** promises Undo that dies on reload
   (`useBrickStudioDocuments.ts:130`): make the confirm honest and offer Download first. No multi-draft.
4. **Involuntary sign-out** (suspend, reset, other tab) silently swaps to the guest build
   (`client.ts:117-119`, `useClassroomWorld.ts:22-31,85`): keep the world on screen read-only with
   "You were signed out — sign in to keep saving" and Download.
5. **A 3D account world that fails to load must never receive the guest build** (`useClassroomWorld.ts:59-65`).
6. **Failed lazy chunk** (`main.tsx:12-24`): handle `vite:preloadError`, reload once (guarded),
   otherwise "Check your internet and try again".
7. **Header sign-out skips the save** (`useClassroomSession.ts:91-97`): write a test that proves or
   disproves the loss first; fix if real.

## L4 2D and race — owns
`src/platformer/{ui,editor,race,net,game}/*`, `src/platformer/PlatformerApp.tsx`,
`src/platformer/routes2d.ts`, matching tests. Not `src/platformer/lab/**`.

Tier 1:
1. **Full room spins forever**: `full` is treated as retryable (`net/roomLink.ts:298`); the overlay
   only shows on `offline` (`ui/GameScreen.tsx:866`). Stop on `full`, show "This room is full" + Back;
   keep a backed-off retry for `rate`.
2. **Guest new level never gets `?draft=`** (`ui/GameScreen.tsx:198-215`): replace the URL after the
   first save so refresh, Back and the guest Sign in link (`src/shell/AccountChip.tsx:40` builds from
   the URL) reopen it.
3. **Leave warnings.** `save()` returns true whenever an account saver exists
   (`GameScreen.tsx:218-221`), so the warning never fires for account levels: track real pending/failed
   state. Warn when leaving a guest room, with Download.
4. **Unreadable or missing `?draft=`** opens a blank level silently (`PlatformerApp.tsx:118-143`):
   say so, and offer saving the unreadable draft to a file.
5. **Account level the app can't read** loops `/2d` ↔ `/build` (`ui/cloudLevel.ts:22-23`,
   `PlatformerApp.tsx:113`): show a problem card instead.

Tier 2 if time: touch-specific hints (`ui/BuildShell.tsx:123`, `editor/palette.ts`,
`editor/racePalette.ts`); Play from start; touch respawn in room races; "All courses done" card;
page names ("My projects").

## L5 Joining and teacher quick wins — owns
`src/pages/join/*`, `src/brick/landing/LandingPage.tsx`, `src/projects/{ProjectSections.tsx, projects.ts}`,
`src/classroom/{RosterView.tsx, panelShared.ts, PasswordField.tsx, RecoveryViews.tsx, EntryViews.tsx}`,
`src/pages/class/*` (incl. `ClassCodeCard.tsx`, `ProjectorPage.tsx`) except `ShelfTab.tsx`, the single link at
`src/brick/live/LiveWorldGate.tsx:182`, `src/classroom/TeacherGoogleCallback.tsx`, matching tests.
Not `src/classroom/client.ts` (L3).

Tier 1:
1. **Class code opens "tap your name" plus "I'm new"**: the landing box hard-codes `mode=join`
   (`LandingPage.tsx:353-357`) and QR/printouts open create-account (`joinQuery.ts:29`) while tiles
   only show in sign-in mode (`JoinPage.tsx:187`). No Worker change: reuse the existing sign-in lookup.
2. **Shared device "Are you Ava R.? / Not me"** when a code is present and someone is signed in
   (`JoinPage.tsx:97-102`).
3. **Confirm before "Move all to my account"**, listing each project's kind and age
   (`ProjectSections.tsx:44,70-72`, `projects.ts:117-122`).
4. **Readable reset password**: show it large after saving and generate an easy word-plus-number
   password that still passes the server's rules (check them in `multiplayer/worker`, read-only)
   (`panelShared.ts:9-11`, `PasswordField.tsx:14-17`, `ClassPage.tsx:138-139`).
5. **Back loops**: `/join` adds itself to history before redirecting (`JoinPage.tsx:66,97-101,168`);
   landing sign-in links detour via `/build?classroom=…` (`LandingPage.tsx:56-58,247-249,301,360,534-536`,
   `LiveWorldGate.tsx:182`, `TeacherGoogleCallback.tsx:29`): link straight to `/join` and replace history.

Tier 2 if time: say why "Create account" is greyed (`JoinPage.tsx:152,304`); live password checklist
on the forced reset (`RecoveryViews.tsx:12-13`); roster refresh while enrollment is open.

## Deferred (owner decision or a later night)
Shell/My projects/copy lane, several 3D drafts, Remote in the Hackable Platformer, upright-iPad Code
layout, image-cache lifetime, shelf size-limit mismatch, performance work, and everything held in
RECOVERY.md "Held for owner decisions".

## Integration (Claude session, `claude/friction-int`)
Merge each lane as it reports, in order of arrival; run that lane's tests plus typecheck after each
merge; one local stack (`scripts/local/start.mjs`, Node 22) for browser journeys; full `npm test`
and `npm run build` once lanes are quiet. Status is kept in the table below.

| Lane | Status | Head | Merged | Notes |
|---|---|---|---|---|
| L1 | running | | | |
| L2 | running | | | |
| L3 | running | | | |
| L4 | running | | | |
| L5 | running | | | |
