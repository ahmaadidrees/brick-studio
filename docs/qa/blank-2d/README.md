# Blank 2D: "Start from nothing"

A game that starts as an empty stage. The kid draws every brick, gives each one a job, or writes its code. It is
built from the approved mock canvas, "Brickgineers: Start from nothing"
(<https://claude.ai/artifact/1fZbYxgCKuK8VpbReWoEUj>, 11 boards), and the owner decisions of 2026-11-04.

- **Branch:** `claude/blank-2d-02a834`, cut from production main `32ce3e0b`.
- **State:** committed locally only. Nothing is pushed, opened as a PR or deployed.
- **The card is on:** `FROM_NOTHING_HREF = '/2d/hackable-blank?new=1'` in `src/projects/gameStarts.ts`. The landing
  page and the Make a game picker both show the outlined From nothing card.
- **Play together:** it works with the stored player brick, and the button stays. See [Play together](#play-together).

| Commit | What |
| --- | --- |
| `52f16aee` | Lane A: the kit seam |
| `9743a52c` | Lane B: the build screens |
| `b561d1b6` | Lane C: the six jobs and the Score |
| `38441076` | Lane D: Code |
| `90f934de` | The card switched on; Play together for a game from nothing; the Score in Build |
| `2c4bbefe` | Fixes from the browser run |
| `9dfb4f1e` | The next-step line lets taps through; the browser harness and its screenshots |
| The next commit | This record |

## The lanes

### A. Kit seam (`52f16aee`)

- **The kit.** `KitId` gains `'blank'` (`core/contracts.ts`). Its engine is Racing's engine plus one Game block
  (`core/index.ts`). That engine already holds every Platformer and Racing block, and bodies start with gravity off,
  so no new runtime was needed.
  - `KITS.blank` is named **Own game** at `/2d/hackable-blank` (`kits.ts`).
- **The starter.** `createBlankProject()` (`studio/blank/blankProject.ts`) is one screen of 30 × 22 cells
  (480 × 352 steps) with no bricks. The backdrop is paper with the grid.
- **The player.** `LevelDesign.player` stores the player brick's id. `isPlayerBrick`, `playerBrickOf` and `hasPlayer`
  read it for this kit only (`studio/kitScreens.ts`), so the rooms' `spawnOf` works unchanged.
  - A brick named "Hero" is never the player by its name in a game from nothing.
  - Deleting the player brick clears `player`.
- **The backdrop.** `LevelDesign.backdrop` is one of paper, sky, grass or night. `validateDesign` checks it and
  `player`. The Stage draws paper and night with the cell grid (`stage/sky.ts drawPaper`).
- **Screens.** `KIT_SCREENS.blank` has `fromNothing: true` and `playNeedsPlayer: false`, so Play works with no player,
  like Scratch. `KIT_PARTS.blank` uses `BlankHud` in Play, with the Platformer's touch d-pad.
- **Route and saves.**
  - `routes2d.ts` reads `/2d/hackable-blank` as `kit: 'blank'`.
  - `hackableRoute`, `newProjectName` ("My game") and Start over ("an empty stage") know the kit.
  - My projects' kind is `'hackable-blank'`, labelled **Own game** (`projects/projectFile.ts`).
- **Worker and classroom.**
  - `HackableKit` and `worldKit` accept `'blank'`, and so does the shelf's game list (`multiplayer/worker`).
  - The classroom `kit` and shelf `game` types accept it too.
  - The room Worker checks projects with the app's own `checkProject`, which accepts the kit.

### B. Build screens (`9743a52c`)

- **The empty stage** (board 1, `blank/BlankBuild.tsx`): "Your stage is empty" with **Draw a brick**, which opens the
  New brick sheet on its canvas, and **or pick a picture**.
- **The next-step line** (board 4a, `blank/nextStep.ts`). It replaces the kits' three first-run tips. The lines are:
  - Start by drawing a brick
  - Tap the stage to place Zip (while Zip's brush is armed; otherwise "Pick Zip in My bricks, then tap the stage")
  - Tap Zip to give it a job ("Press Done, then tap Zip…" while a brush is armed)
  - Pick a job, then press Play
  - Next: give Flag the Goal job
  - Play together: open This project, then Play together, and send the link

  Each line goes once its step is done. × hides the line for good in this browser.
- **The drawer** shows My bricks only, with no search and no categories. Under it are two rows:
  - **Stage**, which shows the size and backdrop and opens the Stage card.
  - **Borrow a brick**, which turns the drawer into Borrow (`blank/borrow.ts`). From the Platformer: Hero, Walker,
    Coin, Spring, Goal, Ground and Spikes. From Racing: Car, Computer racer, Starter, Road, Barrier and Finish.

  A borrowed brick comes with its code, a free name and a free grid character. It no longer remembers the kit's brick
  it came from. A borrowed Hero or Car becomes the player of a game that has none. Racing's bricks bring their Stage
  variables ("laps to win", "results").
- **The name step** (board 2b) gains **One thing / Tiles**, picked from the picture. The grid bricks' pictures
  (Brick, Stone, Mystery, Bouncy) start as Tiles; a drawn brick or any other picture starts as One thing.
  - A picture bigger than one cell can't be Tiles.
  - Tiles get a free grid character, and they start solid with the Wall job (lane C).
- **The Stage card** (a dialog) sets:
  - the size: One screen, Wide, Tall or Big;
  - the backdrop: Paper, Sky, Grass or Night.

  Each change is one undo step. Making the stage smaller asks first when it would cut painted cells or move bricks
  back inside (`blank/stageLayout.ts`).
- **Drawing.** A drawn brick in a game from nothing is one 16 × 16 cell (`CostumeEditor.tsx`).

### C. The six jobs and the Score (`b561d1b6`)

- **Jobs are built-in powers** with `game: 'blank'` (`blank/jobs.ts`):
  - their blocks are real blocks in Code;
  - their numbers are sliders (`showInBuild`);
  - On/Off and Take off work as for any power.

  `store.giveJob` tags the snap with `SnappedPower.job`, such as `'player:walk'` or `'wall'`. Unlike a power, a job
  fits a grid brick, so a Wall of tiles works.
- **Player** makes the brick the player. Its three ways to move:
  - **Walks around**: the arrow keys move it four ways, seen from above, and walls stop it. The speed slider starts
    at 3.
  - **Runs and jumps**: the Platformer Hero's own scripts, with its sliders. The brick also gets the Hero's "Ouch"
    sound.
  - **Drives**: the Racing Car's own scripts, minus the race-only parts (the countdown, the off-road slowdown on
    unpainted ground, the last lap). It adds "I can drive when the game starts" and "back to the start when hurt".

  A second way of moving replaces the first. Giving another brick the Player job moves the player, and takes the
  old player's Player job off if the kid hasn't changed it.
- **The other five jobs:**
  - **Wall**: solid.
  - **Collect**: when the player touches it, it adds its **points** slider to the one team **Score** and vanishes.
    The first Collect job adds the Score variable to the Stage.
  - **Goal**: says "You win!", broadcasts `course clear` and stops all.
  - **Hurts**: broadcasts `hero hurt`; the player's job sends it back to the start.
  - **Falls**: gravity on.
- **Touching the player.** The jobs use a new Game block, **touching the player?** (`core/game.ts`). It reads the
  player brick id from the world (`World.player`, or `world.design.player` in a room), so no job names the player.
  Only the blank engine runs it, and `knownBlocks` and the definitions list it.
- **The brick card** (board 3a):
  - A brick with no code shows **Give Zip a job**. Tap **Player**, and the three ways open; picking one gives the
    job and starts Play.
  - A brick with a job shows **Job: Collect**, its line, and **Change** above its sliders, with "Every Gold / Just this
    one" as for any brick (board 3c).
  - **Make this the player** is in the card's ··· menu.
- **Play** (`blank/BlankHud.tsx`):
  - The Score shows like a Scratch variable monitor, and also in Build once a Collect job keeps one.
  - Play shows "You win!" with the time and the Score, and "Ouch! Back to the start." when the player is hurt.
  - A one-screen game shows the whole stage; a bigger one follows the player.
- **A fix outside the lane:** `powers.isPowerOn` counted a power's My Block definitions, which On/Off never switches,
  so a power with a My Block (the Car's driving) never read Off.

### D. Code (`38441076`)

- **One Game category** (`palette.game`, `core/editor/toolbox.ts`) sits where Platformer was. It holds
  "touching the player?" first, then every Platformer block and every Racing block under their own labels. The Stage
  has none, and the kits' palettes are unchanged.
- **Start from…** for a fresh brick offers the jobs: Player · walks around, Player · runs and jumps, Player · drives,
  Wall, Collect, Goal, Hurts and Falls.
- **The Powers row** reads **Jobs and powers**. **+ Job or power** lists the jobs first, and tiles show the row too
  (board 3b).
- **Placement:** a job on a fresh brick replaces its empty starter hat, and a power snapped onto an empty brick starts
  at the left of Code (`2c4bbefe`).

### Play together

Play together **works with the stored player brick**, so the button stays for a game from nothing. The menu says
"each with their own player".

- Each friend who joins gets a copy of the brick that has the Player job, and their keys move only their own copy.
- The Score is one team Score (owner decision).
- A friend joining part way, from a keyframe, gets the same game, with `World.player` carried in the snapshot.
- A game with no player yet still opens a room, and friends join and watch.
- The room accepts the project as kit `blank`.

These are covered by `blank/blankRoom.test.ts`, which uses the rooms' own `freshGame`, `applyRoomEvent`,
`gameFromBase` and `checkProject`.

It has not been tried with two real browsers. Lane E (name tags, the invite line for a game with no player, and own
scores) waits for M2. See [What is unverified](#what-is-unverified).

## Screenshots next to the mock's boards

The mock canvas is an artifact made from a type, so its boards can't be exported as pictures here. Each row gives
the board's title from the canvas and what the board shows, beside the built screen.

- Screenshots in `shots/` come from the in-app browser at 1280 × 800.
- Screenshots in `shots/run/` come from `scripts/qa/blank-2d.mjs` (headless Chrome: 1280 × 800, and a 390 × 844 phone).

| Board on the canvas | What the board shows | Built |
| --- | --- | --- |
| 0 · Make a game: the From nothing card | A fourth card, outlined, "An empty stage. Draw your own bricks and give them code." | [picker](shots/00-picker-desktop.jpg), [landing](shots/00-landing-card-desktop.jpg), [harness picker](shots/run/17-desktop-picker.jpg), [phone landing](shots/run/14-phone-landing-card.jpg), [phone picker](shots/run/15-phone-picker-from-nothing.jpg) |
| 1 · The empty stage: one obvious action | Paper with a faint grid, one button, the drawer with only New brick, Borrow at the bottom, the dark line "Start by drawing a brick." | [desktop](shots/01-empty-stage.jpg), [phone](shots/run/16-phone-empty-stage.jpg) |
| 2a · Draw it (or pick a picture) | The New brick sheet's canvas | [draw](shots/02a-draw.jpg) |
| 2b · Name it: one thing, or tiles | Name, then "What is it?" One thing / Tiles, already picked | [drawn: One thing](shots/02b-name.jpg), [harness: One thing](shots/run/03-name-one-thing.jpg), [Stone: Tiles](shots/run/04-name-tiles.jpg) |
| 2c · Place it, paint many | Tiles painted by dragging | [maze](shots/02c-paint-tiles.jpg), [harness](shots/run/05-paint-tiles.jpg) |
| 3a · Give it a job | "Give Zip a job", Player with three ways, five jobs, "See inside: write my own" | [card](shots/03a-give-job.jpg), [harness](shots/run/06-give-zip-a-job.jpg), [moving at once](shots/run/07-play-moving.jpg), [stopped by a wall](shots/03a-play-walls-stop-zip.jpg) |
| 3b · The job is real code | Jobs and powers row, the job's blocks, a Game category | [Collect's blocks](shots/03b-code-collect-job.jpg), [Game category](shots/03b-code-game-category.jpg), [harness](shots/run/10-code-game-category.jpg) |
| 3c · A score and a goal | Score monitor on the stage, "Job: Collect", Change, points slider | [card and Score](shots/03c-score-collect.jpg), [harness](shots/run/08-collect-score.jpg), [You win! with Score 3](shots/run/09-you-win.jpg) |
| 4a · Help: next-step line and Borrow | Borrow: from your class, the Platformer, Racing | [Borrow](shots/04a-borrow.jpg), [harness](shots/run/11-borrow.jpg), [Hero borrowed](shots/run/12-borrowed-hero.jpg) |
| 5 · Play together | One copy per friend, name tags, team score | Not shown on screen. Covered by tests; name tags are lane E. |
| How From nothing differs from the kits | A comparison table | Not a screen. |
| (not a board) My projects | "Own game" | [My projects](shots/run/13-my-projects-own-game.jpg) |

## The checks

| Check | Result |
| --- | --- |
| `tsc` (`tsconfig.app.json`, `tsconfig.node.json`, `packages/platformer-core`, `packages/brick-core`) | Clean. |
| Worker `tsc --noEmit` and its test config | Clean. |
| Worker tests (`vitest --config vitest.config.ts`) | 264 passed (263 before, plus the new `worldKit` blank test). |
| Full app vitest suite | 3,680 passed, 25 expected to fail, 8 failed. All 8 were timeouts on a machine at load average ~23, with other sessions running suites. Run alone, all 4 files pass: `BrickStudioApp.test.tsx` 62/62, `perf.test.ts` 4/4 (a known flake), `CodeEditor.carSections` 2/2, `CodeEditor.sections` 6/6 (a known flake). An earlier run under heavier load, with lockstep running at the same time, had 20 failures, all timeouts or perf. |
| Feel harness (`npx vitest run src/platformer/lab/feel`) | 64 passed, 25 expected to fail. `FEEL.md` was regenerated byte-identical: **25 of 25** inside tolerance. |
| `node scripts/qa/lockstep/run.mjs --strict-rejoin --out <scratch>` | All 4 timelines (Platformer and Racing, solo and room) are the same on all 1800 ticks in Node v26.8.2 (twice), Chrome 156 and WebKit 26.5. The late joiner at tick 900 matches to the end. Exit 0. The harness has no blank timeline; see below. |
| `UI_ORIGIN=http://localhost:5262 node scripts/qa/blank-2d.mjs` | 12 of 12 steps (listed below). |
| In-app browser run at 1280 × 800 | Boards 0 to 4a by hand. A clean run (no source edits) was reopened after a reload with everything kept. |

The browser harness steps:

1. Landing card.
2. Empty stage.
3. Picture to Zip, placed.
4. Tiles from Stone, painted.
5. Three taps (Zip, Player, Walks around) start Play, and held arrows move Zip.
6. Gold with Collect and the Score; Flag with Goal.
7. Play: three Gold, Score 3, "You win!".
8. Code shows the Game category with "touching the player?".
9. Borrow the Hero.
10. A reload keeps everything.
11. My projects says "Own game".
12. Phone landing and picker, then desktop picker. Both start a blank game.

New tests (all under `src/platformer/lab/studio/blank/`):

- `blankProject.test.ts`: the kit seam.
- `blankBuild.test.tsx`: the next-step line, the Stage card, Borrow (every borrowable brick checks out and runs), the
  empty stage and One thing / Tiles.
- `jobs.test.ts`: every job passes the shelf's power checks. Walking, walls, Collect and the Score, Goal, Hurts,
  Falls, Runs and jumps, and Drives all run in the engine. It also covers On/Off, Take off, and moving the player.
- `jobCard.test.tsx`: three taps to moving, the job chips, Change, Make this the player, and new Tiles starting solid.
- `blankCode.test.tsx`: the Game category, the kits' palettes, Start from jobs and + Job or power.
- `blankRoom.test.ts`: Play together.

Tests updated for the switched-on card: `kits.test.ts`, `NewProjectSheet.test.tsx` and `LandingPage.test.tsx`. The
Worker's `classroom.test.ts` gains a blank `worldKit` test.

## Changes from the mock, and why

- **The stage is 480 × 352 steps, not 480 × 360.** It is 22 rows of 16-step cells, so the grid fills the stage
  exactly. That is 30 × 22 cells, as decided.
- **Picking a way to move starts Play at once.** The brief asks for "the brick, then Player, then Walks around" to make
  it move within three taps. So the Player tile opens its three ways (the mock draws it already open), and picking
  one plays. The other jobs stay in Build, where the line says "Press Play to try your game."
- **There is no "From your class" in Borrow.** The class shelf holds only powers today, not bricks. Borrow offers the
  Platformer's and Racing's bricks.
- **Collect has a points slider, but no "Spins" switch.** The Score can't be dragged; it sits in the stage's top-left
  corner. Both are small additions for later.
- **The jobs talk with the Platformer's own messages** (`course clear`, `hero hurt`), so a borrowed Coin, Spikes or
  Goal and a brick with a job understand each other. A kid reading Code sees "hero hurt" even when the player isn't a
  Hero.
- **The Stage card opens from a Stage row under the drawer.** The mock shows the Stage only in Code's "In this game".
  Besides One screen and paper, it offers Wide, Tall and Big, and Sky, Grass and Night.
- **A drawn brick is one cell (16 × 16).** The kits draw on 32 × 32. One cell matches the mock, where Zip fills one
  cell.
- **The next-step line has two extra rules from the browser run.** It says "Press Done, then tap Zip…" while a brush is
  armed, and new Tiles (which start solid) don't count as a brick with a job. It lets taps through to the stage, except
  on its × button.
- **The drawer hides the picker's search and category menu**, so it holds only My bricks.

## What is unverified

- **Play together in real browsers.** It has not been tried with two people in a live room, locally or on the Worker.
  The lockstep harness has no blank timeline; the blank coverage is `blankRoom.test.ts` plus the kits' lockstep run.
  Two known gaps for lane E:
  - Hurts broadcasts to everyone, so in a room every friend goes back to the start, not only the one who touched it.
  - There are no name tags over the copies yet.
- **Borrowed Platformer bricks look for a brick named "Hero".** The Coin, Walker, Spikes and Goal touch or bump "Hero"
  by name, so they ignore a player called Zip. They work with a borrowed Hero. Rewriting them to "touching the player?"
  when borrowed is a possible follow-up.
- **Signed-in saving.** The Worker accepts kit `blank` (`worldKit`, the `document()` checks) in tests, but no account
  save or class share was made against a real or mock backend.
- **Touch play on a phone.** The d-pad is the Platformer's and presses the arrow keys every way of moving reads. It
  wasn't driven on a touch device; only the phone landing, picker and empty stage were checked.
- **Two small Build issues were seen and not fixed:**
  - The zoom buttons cover the top-right cells of a one-screen stage, so a brick there is hard to tap.
  - Once, after the in-app browser's viewport changed, the Build view opened zoomed in until Fit was pressed.
- **The in-app browser pane was hidden for part of the run.** A hidden pane pauses its game loop, so the gameplay was
  driven with headless Playwright instead. Two earlier "lost" projects were Vite hot reloads while source files were
  being edited; a clean run kept everything.
- **The mock's board images aren't embedded.** See [the boards table](#screenshots-next-to-the-mocks-boards).

## Re-running

```bash
npx tsc -p tsconfig.app.json --noEmit
npx vitest run src/platformer/lab/studio/blank
node scripts/qa/lockstep/run.mjs --strict-rejoin --out /tmp/lockstep
UI_ORIGIN=http://localhost:5173 node scripts/qa/blank-2d.mjs   # needs `npm run dev`; writes docs/qa/blank-2d/shots/run
```
