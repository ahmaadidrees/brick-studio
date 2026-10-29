# Friction pass: recovery note and overnight plan (draft, NOT approved)

Written 2026-10-28 ~21:55 PT by a fresh Claude session that took over after the
original account ("Brickgineers project exploration", transcript
`~/.claude/projects/-Users-ahmaadidrees--codex-worktrees-microbit-editor-plan/c4a3841c-….jsonl`)
hit its rate limit. These files are **untracked**; nothing was committed, pushed or deployed.

## Recovered state (checked, not just reported)

| Thing | State |
|---|---|
| Checkout | `/Users/ahmaadidrees/.codex/worktrees/microbit-editor-plan` |
| Branch / HEAD | `claude/code-lab-on-main` @ `9b0a43e`, clean, equal to origin |
| PR | ahmaadidrees/brick-studio#22, OPEN, MERGEABLE, both `test-and-build` checks SUCCESS, head `9b0a43e`, 0 comments |
| main | `origin/main` @ `5c30d2a` (PR #22 not merged) |
| Deploy | none from this branch (PROD is still `claude/microbit-scrub`) |
| Dev server | vite on `[::1]:5179`, pid 17117, serving this checkout |
| Workers | the six explorer subagents all finished ~20:45 PT; no writer is running in this checkout |
| Last user request | swap landing → light verify → push → fan out explorers → **review the list together and plan**. The six-lane overnight plan was proposed; **no approval** exists in the transcript. |

## Checks run by this session (2026-10-28 ~21:50 PT)

- Landing at 1366×768 (Chromium emulation in the Claude browser pane): Hackable band shows
  `/brand/media/hackable-ledge.jpg`; CTA `/2d/hackable?new=1`; code box posts `mode=join`.
- Guest journey, same emulation: `/2d/hackable?new=1` → placed 2 coins, renamed to
  "Recovery check 1028" → hard reload keeps both → `/projects` lists it ("On this computer only")
  → Open reopens the same draft. **Pass.** (Signed-in account save/reopen NOT re-tested.)
- Seen in passing: at 1366 a long project name truncates the "On this computer only" chip.
- Spot-checked in code (confirmed, not inferred):
  - Hackable Help is a no-op: `src/platformer/lab/studio/screen/StudioShell.tsx:154`.
  - Class autosave stops after one failure until Retry; no `online` listener:
    `src/classroom/cloudAutosave.ts:38,45,47`.
  - Full 2D room retries forever: `src/platformer/net/roomLink.ts:298`.
  - Landing "Got a class code?" always opens create-account: `src/brick/landing/LandingPage.tsx:354`.
  - `deleteBrick` has no UI caller: `src/platformer/lab/studio/store.ts:384`.
- Not done: physical iPad / Chromebook / Duo playtests, no-WebGL test, offline test.

## Raw findings

`explorer-reports/1…6-*.md` hold the six explorer reports verbatim (≈65 items, code-reading only;
items marked *inference* are hypotheses).

## Proposed overnight plan (awaiting approval; lane split revised in "Pass 2" below)

Base every lane on `9b0a43e` explicitly (`git worktree add -b claude/fx-<lane> <path> 9b0a43e`).
Each lane: tier 1 first, tier 2 if time allows, tests + typecheck + build, commit on its own
branch. No push, no deploy, no Worker or migration changes. Morning: merge passing lanes into
`claude/friction-int`, run full suite + browser journeys, report.

Tier 1 = confirmed in code and loses work or dead-ends a kid. Tier 2 = confirmed friction, S.
Tier 3 = hypothesis; measure or reproduce before fixing.

| Lane | Owns | Tier 1 | Tier 2 | Tier 3 / skip tonight |
|---|---|---|---|---|
| A 3D + rooms | `src/brick`, 3D guest-draft keys | confirm + auto-download on "Use as my local build"; truthful "New build" (keep last 3 drafts); room keeps local copy + "Continue your copy" on closed screen | reopen last world (localStorage per user); owner key in localStorage; Delete·Undo toast; Rotate in quick start; room jargon; Remote button visible in Build (mount only) | WebGL check → 2D (M, needs a no-WebGL test); Explore perf |
| B saving + network | `src/classroom/cloudAutosave.ts`, `client.ts`, `src/main.tsx`, error boundary | autosave auto-retry with backoff + on `online`; one short message; `vite:preloadError` reload-once | — | save-before-sign-out: reproduce first (`useClassroomSession.ts:91`) |
| C joining + accounts | `src/pages/join`, `src/classroom/EntryViews/RecoveryViews`, landing code box, `src/projects/ProjectSections.tsx` | code box → "Tap your name" + "I'm new"; "Are you X? / Not me" when a code is present and someone is signed in; confirm "Move all" with ages/kinds | say why signup is greyed; live password checklist on forced reset; "project" wording; teacher "Request access"/"Forgot password?" contact lines; portrait iPad image | — |
| D teacher pages | `src/pages/class`, `src/classroom/RosterView`, class-page copy | show reset password large after save + word-plus-number generator | roster refresh while enrollment open + joined count on projector; one-tap "Pause building" chip; shelf waiting badge; sharing-setting description; "View class codes" target; teacher wording for world limit / closed collaboration | archive class worlds, bulk groups (M–L, held) |
| E 2D + race | `src/platformer/{ui,editor,race,net,game}` (not `lab`) | stop on `full` with message + Back; leave-guest-room warning with Download | touch hints; page names; Play from start; touch respawn in rooms; "All courses done" card; visible Share | race-track lag (measure first); account-world-per-try |
| F Hackable + Remote | `src/platformer/lab`, `src/microbit` | slider edits into history + per-slider reset; "Bring back this script" in Code; Undo for Reset/Open file | first-run "Tap me" + working Help; "Place it" chip; plain slider names + one-liners; touch hints; Delete brick; editor-error Try again; switch hit area ≥44px; Remote in StudioShell; iOS→Scrub message, hide drag-to-drive on iOS, disconnect toast, replace-program warning, hide "Code your micro:bit" without `/micro` | per-brick code undo (L); upright-iPad fold (M); script budget perf |

Overlap rules: only F edits `src/microbit`; A mounts the existing button only. Only C edits
`src/projects`. B owns `src/main.tsx`; others don't touch it.

Held for owner decisions: teacher self-signup; teacher view of every student's work (privacy +
Worker); End room / remove player (Worker); >16-player rooms or heats; bulk groups; per-brick
code undo; Explore perf; smaller downloads/self-hosted fonts; shelf Peek block preview.

## Acceptance journeys for the morning (emulated unless a device is named)

1. Guest 3D: build → New build → reload → old build still listed and openable.
2. Guest room (3D and 2D): build together → everyone leaves → closed-room screen offers your copy.
3. Class world: kill network mid-save (DevTools offline) → keep building → back online → saves
   without pressing Retry.
4. Day one: landing code box with a class code → name tiles + "I'm new"; second kid on same
   browser sees "Not me".
5. Teacher: reset a password → it stays readable after saving.
6. 2D class room with 17 clients (scripted) → 17th sees "room is full" + Back.
7. Hackable: drag gravity slider → Ctrl+Z restores it; new brick → "Place it" works.
8. Layouts: 1366×768, 768×1024 portrait, 1024×768 landscape touch, Duo dual-screen preset.
Physical iPad + Chromebook playtest remains for the owner.

---

## Pass 2 (2026-10-28 ~22:40 PT): second explore pass, owner asked for it

Six more read-only explorers (reports `explorer-reports/7…12-*.md`) plus a browser pass by this
session. ≈75 new items; nothing repeats pass 1. Still **no implementation approved**.

### Browser checks, pass 2 (Chromium emulation in the Claude browser pane; no touch, no device)

- **Reproduced, loses work (new #1):** Hackable → Code → Stage → Costumes. The editor
  auto-creates a 480×360 "Sky" backdrop that exceeds the 200k-char picture limit; the red bar
  "We could not save your last change…" appears at once, the sky turns pale, and **every later
  edit is refused**: 3 coins placed afterwards were gone after reload, with no leave warning.
  (Report 7 #1; `CostumeEditor.tsx:98-107`, `core/project.ts:59,428`, `storage.ts:190-200`.)
  For account projects the save isn't validated, so the account copy is reported unopenable.
- Upright iPad 768×1024, Hackable Code: an open block category covers the script area (~50px left).
- 768 wide headers: project name truncates to "R…"/"B." (Hackable, race) or vanishes (2D build);
  save chip to "On t…".
- Hackable ⋯ menu: Save File / Open File / Reset only; stray empty box under it.
- Back/forward after `?new=1`: no duplicates, but opening a Hackable project saves an empty one.
- Hackable header Sign in link has no accessible name. No console errors anywhere visited.
- The pane auto-cancels native `confirm()`, so 3D "New build" accept path wasn't exercised.

### New tier-1 items (confirmed in code or browser; lose work or dead-end)

| # | Item | Lane | Size |
|---|---|---|---|
| 1 | Stage Costumes breaks all saving (above); also validate before account save | F1 | S–M |
| 2 | Stale 3D tab overwrites the build on hide/close (`documentPersistence.ts:123`) | A | S |
| 3 | Guest new 2D level never gets `?draft=`, so refresh/sign-in shows a blank level (`GameScreen.tsx:198-215`) | E | S |
| 4 | Involuntary sign-out (suspend, reset, other tab) silently swaps to the guest build (`useClassroomWorld.ts:85`) | B | S–M |
| 5 | Hackable invite: `?world=…?invited=1` URL bug + two kids saving over one project; force look-only + "Make my own copy" | F1 + G | S |
| 6 | Hackable logo / My projects leave without flushing the save (`StudioShell.tsx:143,155`) | F1 | S |
| 7 | Power "Take off" (6px from On/Off) deletes edited blocks without confirm | F2 | S |
| 8 | "Make my own copy" clones the server original, dropping the kid's tries | F1 | S |
| 9 | 2D account levels never warn on leave (`GameScreen.tsx:218-221`); no recovery copy for 2D/Hackable account saves | E + F1 | S / M |
| 10 | Unreadable local drafts: 3D "recovery storage" never read; 2D opens blank | A + E | S |
| 11 | 2D account level the app can't read → endless /build ↔ /2d redirect | E | S |
| 12 | 3D account world that fails to load gets the guest build saved into it | B | S |
| 13 | Dash unusable on touch; Hero respawns at a fixed spot, not where placed | F2 | S |

### Tier 2 additions (S unless noted)

- **B:** revision-conflict choices "Keep this version / Open the other" using `currentRevision` (M; never auto-retry 409, test at `cloudAutosave.test.ts:31` guards it); kid-word error mapper at the source `classroom/client.ts:134` (M); session copy of 3D recovery in localStorage.
- **A:** look-only rooms say so (use `world.canEdit`); kicked-out card gives a reason + My class; keep undo across room snapshots (M); Delete/long toasts stay until dismissed; colour swatch names.
- **C:** `/join` replaces history (Back loop); landing sign-in links go straight to `/join`, not via `/build`; "Make a platformer" starts new rather than reopening a race track.
- **E:** missing `?draft=` message; toasts persist for errors; hit-flicker reduced-motion; 2D own `PlatformerApp.tsx` + `routes2d.ts`.
- **F1 (Hackable data):** at 50-world limit fall back to browser save; save on hidden tab; Open File accepts `.brickgineers`; kid-word file errors; My powers save failure honest; Reset keeps the name.
- **F2 (Hackable UX):** Powers section in Build inspector (M); Play "Open its code · Put the original back" chip (M); costume editor undo/size/touch; power chip scrolls to its blocks; power slider ranges; palette words ("when ⚑ clicked", "Platformer extension", tooltips); keyboard-proper Code dialogs (use `ui/Dialog`); contrast fixes; selection outline; ask-dialog focus.
- **G (NEW: shell, My projects, copy):** owns `src/shell/AccountMenu.tsx`, `navigation.ts`, `src/pages/worlds/*`, `InviteSheet.tsx`, page titles. Account-menu "New build" → New project; My projects search covers local, Hackable art + empty-state; confirm "Open alone"/"Stop sharing" while classmates are in; "Today in {class}" strip; "Invite classmates" says why it's gone; `/2d/lab` → redirect; one name each for "build together" and "download/open a file"; 768px header truncation.
- **Cross-tab watcher** for 2D/Hackable/My powers (M) → B, tier 2.

### Revised lanes and ownership

Splitting F (now ~45 items) into **F1 Hackable data** (`lab/studio/persist/*`, `storage.ts`,
`StudioApp.tsx`, `assets/*`, `hackableCloud`) and **F2 Hackable UX + Remote** (`screen/*`,
`powers/*`, `code/*`, `hero/*`, `workshop/*`, `builder/*`, `stage/*`, `src/microbit`), and adding
**G**. That is 8 lanes; the recommended overnight scope is **tier 1 everywhere + tier 2 for B, E,
F1, F2**, leaving C/D/G tier 2 for a second night if time runs out.

### Before lanes start (harness, from report 12)

- `scripts/local/start.mjs` uses fixed ports (5185/8798/8799/9235): add `LOCAL_PORT_BASE` so lanes
  can each run the local stack. Put it on a base branch `claude/friction-base` from `9b0a43e`.
- Each lane: `npm ci`; targeted `npx vitest run <files> --maxWorkers=2 --testTimeout=15000`;
  typecheck + build; no Worker changes. Full `npm test` + browser journeys at the morning merge.
- `scripts/qa/live-latency.mjs` defaults to **staging**: always set `QA_API`.
  `scripts/qa/flows-e2e.mjs` reads the old v1 session key (likely stale).
- Use Node 22 (`/opt/homebrew/opt/node@22/bin`) for `start.mjs`; default node is 26.
- New acceptance journey: **Hackable → Stage → Costumes → place a brick → reload → brick is there.**

---

## Approved 2026-10-28 ~23:00 PT: five-lane overnight cut

The owner approved the revised five-lane cut. The canonical plan, ownership and status table
now live in `OVERNIGHT.md` on branch `claude/friction-int`
(`~/.codex/worktrees/friction/int/docs/qa/friction-2026-10-28/`). The independent review that
shaped it is `addendum-independent-review.txt`. The 8-lane "Revised lanes" section above is
superseded.
