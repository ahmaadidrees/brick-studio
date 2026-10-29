# Friction: 2D builder and race kit

I found 11 friction points that have code evidence, ranked by how many kids they likely hurt times how badly. The worst one stops a whole class from racing in one room. Points I inferred rather than read directly are marked "(inference)". All paths are under `/Users/ahmaadidrees/.codex/worktrees/microbit-editor-plan/`.

**1. A full room spins on "Joining the room…" forever**
- Who: the 17th and later kid when a whole class joins one class room (`/2d/w`), or any guest who joins just as a room fills.
- Evidence: `packages/platformer-core/src/net/roomCore.ts:370` caps rooms at 16 players and sends "This room is full". `src/platformer/net/roomLink.ts:298` treats `full` as a reason to retry, not to stop. The overlay at `src/platformer/ui/GameScreen.tsx:866` only shows the message and a Back button once the status is `offline`, which never happens here. Class rooms also have no "full" check before joining; guest rooms do (`src/platformer/PlatformerApp.tsx:256`).
- Severity: blocks.
- Fix: stop retrying on `full`, show the message and a Back button. Longer term, raise the cap or split the class into heats. S, then L.

**2. Guest rooms forget everything built in them after about two hours**
- Who: guests who build together, then come back the next day.
- Evidence: `src/platformer/PlatformerApp.tsx:244` says rooms are forgotten two hours after everyone leaves. "Save a copy to my account" needs a signed-in host (`GameScreen.tsx:716`), and "Copy a link to this world" only appears when playing alone (`GameScreen.tsx:779`). Leaving gives no warning.
- Severity: loses work.
- Fix: warn when leaving a guest room and offer "Download a copy" or a share link of the room's level. M.

**3. Hints say "Click" and "Press R" on iPads**
- Who: every touch builder who picks Pipe, Moving platform, Starting grid, Boost pad, Finish line or Walker.
- Evidence: a brick's own hint replaces the touch wording (`src/platformer/ui/BuildShell.tsx:123`). The hints themselves are in `src/platformer/editor/palette.ts:38,56` and `src/platformer/editor/racePalette.ts:36,40-42`.
- Severity: confuses.
- Fix: write separate touch hints that point to the Flip/Turn buttons. S.

**4. Messages point to pages with the wrong names**
- Who: anyone told where their work went.
- Evidence: "Delete one on the 2D worlds page" (`src/platformer/ui/drafts.ts:77`), but `/2d` now redirects to My projects (`src/platformer/PlatformerApp.tsx:30`). "Find it in My worlds" (`GameScreen.tsx:244,633`), while the header and exits say My projects (`GameScreen.tsx:755`).
- Severity: confuses. It matters most at the 30-draft limit, when a kid has to delete something.
- Fix: use one name everywhere and link straight to the page. S.

**5. Guest drafts live only in one browser**
- Who: guests on shared iPads or Chromebooks that wipe storage at logout (inference).
- Evidence: drafts are kept in `localStorage` (`src/platformer/ui/drafts.ts:6`). The 30-draft limit refuses new levels (`drafts.ts:62`), and the only notice is a 3.2-second toast plus the header status (`GameScreen.tsx:147,212`). Opening `/2d/build` reopens whichever level was saved last on that device (`PlatformerApp.tsx:139`), so kids sharing an iPad open each other's work.
- Severity: loses work.
- Fix: a lasting banner when not saved, plus a "Sign in to keep this" nudge after the first few edits. M.

**6. Every level a signed-in student tries becomes an account world on its first edit**
- Who: students who experiment a lot.
- Evidence: `GameScreen.tsx:229-233` creates the account world. When the account is full (`world_limit`), work quietly falls back to the browser (`GameScreen.tsx:252`). Abandoned tries filling the account is an inference.
- Severity: annoys.
- Fix: only create the account world after a few edits or a first Play, and show the account limit in My projects. M.

**7. Sharing with a friend is buried, and the link is a frozen copy**
- Who: kids sharing a level.
- Evidence: "Copy a link to this world" sits in the ⋯ "This project" menu (`src/platformer/ui/LevelMenu.tsx:45`). The whole level is packed into the link (`src/platformer/ui/shareCode.ts:24`), so later edits don't reach the friend. If clipboard access fails, the kid gets a `window.prompt` with a very long URL (`GameScreen.tsx:534`).
- Severity: confuses.
- Fix: a visible Share button, and say "this shares a snapshot". S.

**8. Pressing Play doesn't start from the beginning**
- Who: kids testing their level.
- Evidence: Play puts the player back where they were before switching to Build (`src/platformer/game/session.ts:575,580-586`). Starting from a chosen spot is a hidden P key (`GameScreen.tsx:391`) with no touch equivalent.
- Severity: confuses ("why did I clear it in 3 seconds?").
- Fix: add a "Play from start" button next to Play. S.

**9. In a room race, kids can't restart a race that is running**
- Who: kids racing a class.
- Evidence: Restart gives "You're in a race! Finish it, or ask the host to restart" (`session.ts:542`). Touch drivers have no restart control at all (`src/platformer/race/RaceTouchControls.tsx:74-86`; R restart is keyboard-only, `RaceHudView.tsx:96`). The steering hint strip is hidden for touch players in rooms (`RaceHudView.tsx:88`).
- Severity: annoys.
- Fix: a "stuck? respawn" button and a short controls hint in rooms. S.

**10. The last starter course ends with nothing new**
- Who: kids who finish all the starter courses.
- Evidence: the last course has no Next (`PlatformerApp.tsx:177,185`), so the card is the same "You made it!" (`GameScreen.tsx:890`), and nothing suggests building their own.
- Severity: annoys.
- Fix: an "All courses done! Build your own" card. S.

**11. Painting can lag on big race tracks on Chromebooks (inference)**
- Who: race builders on slow Chromebooks.
- Evidence: `LoopChip` re-checks the whole track's loop on every render, and the editor triggers a render on every painted tile (`BuildShell.tsx:186`, `GameScreen.tsx:182`). I did not measure this.
- Severity: annoys.
- Fix: memoise the check on the edit count, or delay it until the stroke ends. S.

Things that worked well: undo/redo buttons on touch, the eraser toggle, two-finger pan, the "Laps work / Laps don't count yet" chip, the warning before leaving with unsaved work, and the "Turn sideways" card.