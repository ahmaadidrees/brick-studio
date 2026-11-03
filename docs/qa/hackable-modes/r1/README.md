# Hackable Racing R1: the screens — November 2, 2026

The owner said "Yes, start R1" on November 2. Racing's engine parts (October 29, `../R1-engine.md`) now have their
screens: a kid can start a Hackable Racing project, paint a track, open the Car's code and race two computer racers.
The plan is in `../R1-SCREENS.md`.

- **Branch:** `claude/hackable-modes-proposal`, with main bce7b67 (group C, See inside, the inside view, teacher fixes)
  merged in first (32df4d8).
- **Not deployed.** Racing is switched on in this branch only (`KITS.race.ready`).

| Step | Commit | Record |
|---|---|---|
| Merge main | 32df4d8 | The conflicts were all about power files. Main's whole-power check now accepts known kits and refuses only an unknown game. The Racing blocks are on the shelf's known-block list. |
| Contract | a202bb8 | `studio/kitScreens.ts` (one description per game) and `studio/screen/kitParts.tsx` (per-game Play display, touch controls, Build chip), wired into the studio. |
| 1 Projects and words | 8e64821, b7c3298 | `projects.md` |
| 2 Build | 125a353 | `build.md` |
| 3 Code | f9100a3 | `code.md` |
| 4 Play | ff5eb99 | `play.md` |
| Integration | dafe75f, and the link fix after it | Below |

## What a kid gets

- **New project → Hackable Racing** opens "My race track" at `/2d/hackable-race` on the beginner oval: Road, Dirt, Ice,
  Barrier, Boost pad and Finish line, the Car, two Computer racers and a Starter (`int/desk-1-build.jpg`).
- **Build:**
  - The drawer groups Track, Racers, Start and My bricks.
  - The Car's card has its four sliders, the Kart / Drifty / On rails presets, and "More sliders".
  - The "Laps work" chip, or why laps don't count.
  - The finish line has an arrow to turn it.
  - A car placed or dropped clears Barriers and faces along the track. Its turn is part of the same undo step.
- **Code** (`int/desk-2-code.jpg`):
  - A Racing section in the palette. The landing and gravity blocks are hidden.
  - The Car opens on "When the race starts", "When the countdown says go", "When I finish my last lap", and
    "How I drive · 10 scripts", which opens as a list like the Hero's "How I move".
  - No "+ Power", and no Platformer starting points.
- **Play** (`int/desk-3-countdown.jpg`, `int/desk-4-driving.jpg`, `int/duo-2-play.jpg`):
  - The camera follows the Car, with "Whole track" and "Follow the Car".
  - The countdown shows big in the middle.
  - Place and "Lap x/3" show top left, then a results card with Race again and Keep building.
  - Arrows drive on a keyboard. On touch there are a steering pad, Brake and Gas.
  - Grass all round. Cars turn the short way past ±180°.
- **Projects:** My projects labels it "Hackable Racing" and links to its address. It is saved with its game, locally
  and in the account. Make my own copy keeps the game, and Start over goes back to the beginner track.

## Integration

- **Placing and dropping a car** (`Stage.tsx`) uses the Build lane's `landingPose`. `moveCopyEdit` carries an optional
  direction, so undo turns the car back too.
- **Worlds opened from the class panel or a 3D link** go to their own game's address (`ClassroomPanel.tsx`,
  `BrickStudioApp.tsx`).
- **Optional requests not taken** (none affects what a kid sees):
  - `help` and `view` fields on the kit description;
  - `CodeEditor` passing the palette from the description;
  - an empty `EARLIER_CAR_FINGERPRINTS` (the Car's fingerprint and labels are pinned in `carBrick.test.ts`);
  - `race-perf.mjs` drawing grass.

## Checks

- `tsc -b` is clean. The Worker tests pass, 256 of 256.
- **The full `vitest run`:** 15 tests in 7 files timed out. Another project's headless Chrome was using about 8 cores
  (load average 28–42). Rerun on their own:
  - `fileRoundTrip`, `Gallery`, `CodeEditor.loadFailure`, `perf` and `BrickStudioApp` pass.
  - `CodeEditor.sections` (6/6) and `CodeEditor.carSections` (2/2) pass once the load fell to about 13.
  - Main's `CodeEditor.sections` behaves the same under that load.
- **Headless Chrome against local Vite:**
  - **1366x768:** New project → Hackable Racing → Build → Code → Play. Countdown, driving with the arrows, place and lap.
  - **540x720 touch:** Build and Play with the steering pad.
  - The Hackable Platformer was checked unchanged: "How I move", coins, Follow the Hero, the jump hint.
  - No console errors.

## Not checked

- Finishing a full three-lap race in a browser, so the results card. Lane 4's tests cover it against
  `createBeginnerRace`.
- Signed-in saving of a race project against a Worker, and the class page's Open link for one.
- Real devices (Duo, iPad, Chromebook) and Safari. Touch dragging in Build.

## Seen, for the class test

- **The cars are small on screen,** about one brick wide when following the Car. Worth watching whether kids want a
  closer view.
- **The finish line's direction shows only in its card.** There is no arrow on the track itself.
- **Cars drive through each other.**
- **Some words still say "Hackable Platformer":** classroom contracts, the invite sheet, the Shelf tab, the Help page
  and the landing page.
- **No race starting point in Code.** "Start from Computer racer" would be the one to add. The Racing blocks have no
  "?" cards yet.
