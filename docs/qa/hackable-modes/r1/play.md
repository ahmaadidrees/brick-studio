# R1 lane 4: Play — November 2, 2026

Branch `claude/racing-r1-play`, from a202bb8 (the contract). Code commit ff5eb99.

## What changed

**Camera (`studio/Stage.tsx`)**
- `followTargetOf(design, targets)`: Play follows the first placed copy of *any* player brick (`isPlayerBrick`). So the
  Car, a remixed "My Car" with a new id, and a Car whose original is still unplaced in the drawer all work. Before, only
  the first player brick in the list counted, so an unplaced original left the camera in the middle of the track.
- `playFollowWidth(screens, bounds, viewport)`: the descriptor's `followViewWidth` wins if set. A race is seen from
  above, so the screen's shorter side shows 360 steps (22 bricks) whichever way the screen is held. That makes the
  11-step Car about 13–16 px on a Duo screen (540×720, less the touch strip), about 24 px on an iPad and 11 px on a small phone held upright. The Platformer
  still uses `followViewWidth`, unchanged.
- In a race the camera button says "Whole track" (`StageControls` has a new `wholeLabel` prop; it defaults to "Whole
  level"). "Follow the Car" was already wired through `copy.followLabel`.
- The keyboard needed no change: the arrow keys already reach the runtime as the keys the Car reads.

**Short-way turns (`stage/renderer.ts`)**
- `blendDirection(from, to, alpha)` replaces the straight-line blend for every kit. When a turn is over 180°, it goes
  the short way and the result stays in (-180, 180]. Example: 179 → -179 goes through 180.
- Turns of 180° or less blend exactly as before. The Hero's 90 ↔ -90 flip is unchanged; a test checks this.

**Grass (`stage/sky.ts`, drawn by `renderer.ts` when `background: 'grass'`)**
- Grass green, lighter mowing stripes every 4 bricks, and a 32-step tuft pattern that moves with the track
  (`CanvasPattern.setTransform`).
- Everything is cut to what's on screen. Per frame that is 1 fill, at most about 4 stripes and 1 pattern fill. Where
  there is no canvas, or no `setTransform`/`DOMMatrix`, it draws plain grass.
- Build uses it too.

**HUD (`race/screens/RaceHud.tsx`, `raceHudState.ts`, `raceScreens.css`)**
- `readRaceHud(world, design)` is plain TS. It reads the race and changes nothing.
- **Countdown:** the Starter's own bubble while it is short and not "Results…", so a kid's own words show too. It
  appears big in the middle of the screen; "Go!" is green.
- **Lap pill:** "Lap x/N", with N from the Stage's `laps to win`. It says "Finished" at the end, and "Free drive" plus
  the Build chip's reason when the track doesn't lap.
- **Place pill:** "1st"/"2nd"/"3rd", from `racePlace`. It is hidden when there is only one racer or the track doesn't
  lap.
- **Keys hint:** shown for 7 s; the shell hides it on touch screens.
- **Results card:** opens when the Car finishes its last lap.
  - Title: "You won!" or "2nd place".
  - It lists everyone: the results list, then the Car if it isn't written yet (its lap script runs a tick later), then
    anyone "still racing".
  - "Race again" is `store.play()` and "Keep building" is `store.stop()`, the same calls PlayFeedback makes, so no new
    slot props were needed.
- The HUD reads the race 10 times a second.
- **Placement:** on a phone it sits under the view tools. On a Duo opened flat it sits on the right screen. The card
  uses `p2d-overlay`/`p2d-card`, which the shell already places on a Duo.

**Touch (`race/screens/RaceTouch.tsx`, `src/platformer/race/RaceTouchControls.tsx`)**
- `RaceTouch` renders the race kit's `RaceTouchControls` with no item button. It goes through `raceTouchKeys`:
  - steering left/right press the left and right arrows;
  - Gas presses the up arrow;
  - Brake presses the down arrow.
- Everything held is released when `RaceTouch` unmounts (Play stops, pauses or restarts).
- `RaceTouchControls`' prop is loosened to `Pick<Input, 'setTouch'>`; the race kit is unchanged.

**`core/race.ts`:** exports `racePlace(world, racer)`, which wraps the private `placeOf`. Laps logic is unchanged.

## Tests

New test files:
- `stage/renderer.test.ts`: 179 → -179 at 0.25, 0.5 and 0.75, and the other way round. Turns of 180° or less match
  the old formula exactly. `renderPlayMode` rotates the car by +90° halfway from 179 to -179.
- `stage/follow.test.ts`: the camera follows the Car, and a remixed "My Car" with the original unplaced (centred on the
  car). The race view is 360 steps across the shorter side on four screen sizes. The Platformer's follow width is
  unchanged.
- `race/screens/raceHudState.test.ts`, against `createBeginnerRace`:
  - countdown 3, 2, 1, Go!, one second apart, then nothing;
  - lap 1/3 and a place from the start;
  - a Car left alone stays on lap 1, ends up 3rd and gets no card;
  - a Car running the racers' blocks: laps go 1, 2, 3, then a card with all 3 racers and the Car on its line;
  - the same with a remixed Car;
  - the no-finish-line reason;
  - ordinals.
- `race/screens/RaceHud.test.tsx`: the rendered HUD with a real `StudioStore` (countdown, lap, place, keys hint,
  card), Race again starting a fresh race, Keep building going back to Build, and the hint going after 7 s.
- `race/screens/RaceTouch.test.tsx`:
  - Gas presses the up arrow and Brake the down arrow;
  - lifting lets go;
  - unmounting releases Gas;
  - the steering pad;
  - no item button;
  - no double presses.
- `core/racePlace.test.ts`: `racePlace` equals `race_myplace` for every target every 30 ticks for 1,500 ticks, and is 0
  for the Starter.

Added to existing tests:
- `stage/sky.test.ts`: grass fill and stripes cut to the screen; at most 5 fills on a 20,000-step level; nothing when
  off screen.
- `stage/StageControls.test.tsx`: "Whole track" and "Follow the Car" in a race; the Platformer's labels are unchanged.

**Gate**
- `npx tsc -b` is clean.
- `npx vitest run src/platformer src/projects src/pages` (with sibling lanes loading the machine): 1941 passed and 25
  expected fails, plus 9 timeouts.
- The timeouts were the 5 in `CodeEditor.sections`, and 1 each in `CodeEditor.loadFailure`, `perf`, `carBrick` and my
  own `racePlace`.
- I lightened `racePlace` and gave it a longer timeout.
- Rerun alone, `racePlace`, `perf`, `carBrick` and `CodeEditor.loadFailure` all pass (19/19). `CodeEditor.sections` is
  noted below.
- Platformer expectations are unchanged: no existing test was edited, only added to.

**Perf** (`RATES=1,4`, Vite on :5294, Apple M5 Max, with other lanes' test runs going at the same time, so both
columns are slower than R1-engine.md's numbers):

| | Start | Step p50/p95/max | Draw p50/p95/max | JS/frame p95/max | Frame interval p95 | Frames >25 ms |
|---|---|---|---|---|---|---|
| 1×, sky (script as is) | 5.6 ms | 0.4/0.6/1.6 | 0.8/1.1/2.3 | 1.5/3.4 | 16.8 | 0 |
| 1×, grass | 7.0 ms | 0.5/0.7/2.5 | 0.8/1.0/2.6 | 1.5/5.1 | 16.7 | 0 |
| 4×, sky | 20.9 ms | 2.1/3.5/16.1 | 3.9/5.3/14.3 | 7.8/21.4 | 16.8 | 1 |
| 4×, grass | 37.7 ms | 2.3/3.9/12.9 | 4.0/5.4/20.5 | 8.1/22.6 | 16.8 | 5 |

- The script passes no `background`, so it still draws the sky. The grass rows come from a scratch copy of the script
  that adds `background: 'grass'`.
- Grass draws in the same time as the sky at p50 and p95.
- The 4× tails and "Play start" moved in both columns between runs. That is the shared load, not the background
  (Play start doesn't draw).

## Integrator requests

None are required. Race again and Keep building use `store.play()` and `store.stop()`, like PlayFeedback. Optional:

1. `kitScreens.ts`: instead of `Stage.tsx` checking `screens.kit === 'race'`, add `view: 'side' | 'top'` (or set
   `followViewWidth`, though a fixed number loses the any-orientation behaviour) and `copy.wholeLabel: 'Whole track'`.
   `playFollowWidth` and the `wholeLabel` prop are ready for it.
2. `scripts/qa/race-perf.mjs`: pass `background: 'grass'` to its two `renderPlayMode` calls so it measures what a race
   draws.

## What I couldn't do

- I didn't look at it in a browser at Duo or iPad size. Race projects can't be opened in the studio until lane 1 adds
  the route and flips `ready`. The layout follows the shell's existing phone and Duo rules but hasn't been seen.
- Touch strip height: `.cl-touch` Play keeps the Platformer's 152 px bottom strip. The race pad (104 px) and Gas (96 px)
  fit in it, but this isn't checked on a device.
- `CodeEditor.sections` rerun alone, with the machine still loaded: 4 of 6 pass. The other 2 time out at about 80–90 s
  each. It is on the expected-timeout list, and none of the files it uses changed in this lane.
- Engine gaps from R1-engine.md are unchanged:
  - cars drive through each other;
  - `my place` after finishing (the HUD uses the results list for a finished Car instead).
