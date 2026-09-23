# Robot Workshop kid lane Y: Try it, the walk-up test, Code's stage and the light

Lane Y (Claude Opus 5.5), 2026-09-23, branch `claude/robotics-kid-tryit` off `9f24b4d`, merged into
`claude/robotics-kid-int` at `5a1485e`. The follow-up below (the Gate kit's Door sensor) is on the same branch:
built on `5a1485e` (lanes R and P), then merged with `claude/robotics-kid-int` at `244a1e2` (lanes M and W and
lane P's follow-ups) before the runs recorded here. Everything stays behind `VITE_ROBOTICS_PROTOTYPE=1`.

Harness: `scripts/qa/robotics-kid-tryit.mjs`, run against this lane's dev server
(`npx vite --mode robotics --port 5243 --strictPort --host 127.0.0.1`) in headless system Chrome through
Playwright, at 1366×768, one pass at 1024×768 and one on a touch screen. Result: **60 of 60 checks pass**
(`results.json`), no console errors.

    PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5243 node scripts/qa/robotics-kid-tryit.mjs

A student's input throughout: the drawer's **Robots** choice, a kit card and the command strip's **Place**; the
panel's **Try it** and **Code**; **Someone walks up**; **Back to build**; a click on a number block and typed
digits; **More → Swing open**; **Undo**. Two builds use the studio's own placement actions (as the cp1/cp2
harnesses do): the Gate with its sensor turned round to look at the door (select it, press R twice), and the same
with a wall of its own bricks between the sensor and the door; a signal light gets a wall of loose bricks in front
of its sensor. Measured from the stage (`window.__robotics.stageStore`: the visitor's phase and place, the sensor
reading, the hinge's angle, the light, the walk's verdict), from the page (the result line, the chips, the ready
row) and, for the light and the visitor, from the pixels. **Every first-try check ran five times, each in a fresh
page with a fresh world.**

## Follow-up: the Gate kit's Door sensor looks out of the front

| | Before (`before/`) | After |
|---|---|---|
| The kit card, and the Gate placed from it | `before/A1-gate-placed.png` | `A1-gate-placed.png` |
| Try it, before the press | `before/A2-gate-try-it.png` | `A2-gate-try-it.png` |
| Walking into the beam | `before/A3-gate-2-seen.png` | `A3-gate-2-seen.png` |
| Standing there: the gate open, *It worked! The gate opened.* | `before/A3-gate-3-standing.png` | `A3-gate-3-standing.png` |
| They have gone: the gate shut, the line still there | `before/A4-gate-after.png` | `A4-gate-after.png` |

Before, the kit's sensor looked at the door from the hub, so the visitor stood in the stud-wide gap between the
hub and the door, half hidden behind the hub from the home camera. Now it looks out of the gate's front, where
people come from: the visitor waits in front of the gate, walks up in open ground in full view, the sensor sees
them, the door swings open behind, and the way through the frame is open while they stand there.

- **The kit** (`src/robotics/kits/kits.ts`). The kit's copy of the spike gate turns its sensor a half turn on the
  hub (`rotation: 2`: the same two cells, its eyes now on the front face, flush with the kit's front edge). The
  spike fixture `gateBricks()` is unchanged, so the cp1/cp2 tests and harnesses and the model tests keep their
  pose; `run/walkUp.test.ts` builds its "nowhere to stand" case on it.
- **The name.** Default names follow the world facing, so a sensor facing the viewer is "Back sensor", which reads
  wrong on a gate. The kit calls it **Door sensor**: a kit can name its devices now (`Kit.names`, optional; only
  the Gate uses it), and `placeKitInSection` writes the names into `section.devices`, where a student's rename
  goes. So it reads *Door sensor* wherever a device name shows (Try it's and Code's chips, the blocks' *Door
  sensor · B*, the hub's card, the wiring lines), the student can rename it, it keeps its name when turned (D1), and
  the one Undo that takes the kit away takes the name too (`kits/kitPlacement.test.ts`).
- **The kit card** looks from the front-right now, the studio camera's side (`kits/kitPictures.ts`): the sensor's
  eyes, the door a little open inside the red frame behind, and the arrow over the frame (A1).
- **Try it's framing** is unchanged code (the robot and the visitor's whole path, in the canvas the panels leave
  free). The harness now measures where the visitor stands on every run (`A.runN.open-ground`, 5 of 5): the walk
  has no problem and comes across the beam from the camera's side; standing, the figure's back is
  2.3 studs clear of the gate's front edge, all of it on the canvas (250–373 × 384–551 px at 1366×768) and under
  none of the panels (the bar, the chips, the line, the button), and the pixels under its middle are its orange
  shirt, (231, 164, 67). The same framing at 1024×768: G1.
- **Turned round** (D1): pick the Door sensor and press R twice: it looks back at the door and keeps its name; the
  visitor comes to the gap between the hub and the door (the old pose) and it works. D2 turns it to the door
  first, then builds the wall of the gate's own bricks in that gap.

## What Noah hit, and what a student sees now

| Noah (S1, S2) | Now |
|---|---|
| The first "Someone walks up" looked like it did nothing: the whole walk took 7 s, so a look ten seconds later found the person back beside the gate, outside the beam, "sees nothing", "closed", and no word about what had happened. | The visitor always walks into the sensor's beam, slows for the last steps into it (seen while still walking), stands there 3 s, then walks back. One line says what happened (*It worked! The gate opened.*) and **stays** after the visitor has gone: a look 11 s later still says it (B1). |
| Code: "Someone walks up" did nothing unless the program was already running; after editing the wait the status was "Ready" and the arm stayed shut. | Any stage input (Someone walks up, the joystick, the keys pad, a button part on the stage) first runs the newest code, as Run would, when nothing runs or what runs is older than the saved program (E). An edit alone still never stops or restarts a run (CP2-PLAN §1); the stage says *Your code changed. Press Run to try it.* |
| The light was red when off; it switched off after 2 s while the person still stood there. | The light's own colour is a pale grey lamp (off); on the stage an off light is greyed and dimmed and a lit one is its colour with a glow (C). The Signal light's program keeps it red while someone is there and turns it off when they leave. |
| "Ready to try!" never changed after a success. | The ready row says what the last try did (*It worked! Try it again* with a tick, or *The gate didn't open. Try it again*) until the robot or its code changes (A5, D). |
| The walker reached the gate before the arm swung. | The gate starts opening as the visitor walks into the beam and is 70–71° open when they stop (all five runs). |
| The hub's cables vanished during **Test the motors**. | Cables whose device and hub ride on the same body move with it (F1): on the gate they stay put while the arm swings; on a driving Buggy they ride along. |
| "studs", "°" and port letters on these screens. | Try it and Code's stage chips say *3 steps away*, *sees something*, *open* / *closed*, *turned to 45*; the lines never use a unit. |

## Decisions

- **The walk** (`src/robotics/run/walkUp.ts`, pure). From the sensor's face and facing at the built pose (the one the
  active program reads, else the first plugged in): stop with the visitor's near side 3 studs from the face (the
  sensor reads 3), facing it; come in across the beam from the camera's side, else the far side, else straight up
  the beam; quick steps, then at least a second of slow ones into the beam; wait 3 s; walk back. Stops 3.5, 2.5, 4,
  2 and 4.5 studs away are tried when 3 is taken; the robot's own tall bricks and (in My world) the student's bricks
  are kept out of the stop and the path; plates are floor. The robot's own tall bricks also hide anyone behind
  them, as they would a real sensor's (the stage's ray skips the robot, so it never sees itself). If the beam leaves
  nowhere to stand, the visitor walks up to the robot's near side instead (`problem: 'no-room'`), is not seen, and
  the stage says so (D2). A student's brick inside "sees something" in the beam is flagged (`problem: 'wall'`).
  The visitor prop gains `legSeconds`, `pauseSeconds`, `sensorId` and `walk` (additive); the mechanics honour them.
- **The verdict** (`src/robotics/drive/tryOutcome.ts`, pure). "It worked!" as soon as the sensor has seen the
  visitor and the gate has opened (≥ 20° from built, the chips' own "open") or the light came on; otherwise decided
  when the visitor turns to walk away: *the sensor didn't see them* (with an arrow turned the way the beam runs on
  screen, and the beam drawn thick and pulsing with an arrowhead), *the sensor isn't plugged in*, *the sensor
  already sees something* (a wall), *the code isn't running*, *the code didn't open the gate / turn the light on*
  (Try it offers **Open Code**), *the arm is stuck to the frame*, *Arm motor isn't plugged in*, or *the gate was open
  already*. The stage store watches each walk (`walk`); the first verdict is also kept per robot, in memory only,
  with the bricks array and a key of cables, run spaces, parts and the active program's revision: any change makes
  it stale and the row reads *Ready to try!* again. Not persisted on purpose: a reload starts fresh.
- **Code's stage** (CP2-PLAN-consistent). The Code view registers a stage runner while it is open; a stage input
  asks it first. The physical arrow keys are left as they were (only while running), so typing or moving around
  Blockly never starts a program by surprise. A verdict from before an edit is hidden once the code changed.
- **Kit programs** (`src/robotics/program/starters.ts`). Smart gate: `when run · forever · if Door sensor sees
  something closer than 5 studs → turn Arm motor to 90°, else → turn Arm motor to 0°`; Signal post: the same with
  its Front sensor and `set Light to red` / `turn Light off`. 5 is the event hat's own "sees something", so the
  visitor at 3 is seen. The gate's tip is unchanged (*change 90 to 45*); the signal's is now *change red to green.
  Then press "Someone walks up".* Block ids keep their names (`smart-gate:open` …), so the failure harness still
  finds them.
- **The Gate kit's sensor** faces out of the front and is called *Door sensor* (the follow-up above).
- **The light**: `ROBOTICS_PART_COLORS.light` is `#c6ced4`; the kit picture draws a lit light in red.
- **Touch** (coordinator's addendum): the Drive hint reads *Drag the blue ball to drive* when the primary pointer is
  coarse, *Drag the joystick or use the arrow keys* otherwise. Kept inside `DriveView.tsx`'s own foot component.

## Shots

| Shot | What it shows |
|---|---|
| `A1-gate-placed` | The Gate kit from the drawer (its card now from the front), ready: *Ready to try!* |
| `A2-gate-try-it` | Try it: the visitor waiting in front of the gate, the Door sensor's beam running out of its front, *Press the big button. Watch what happens.* |
| `A3-gate-2-seen` | The visitor walking slowly into the beam: the beam turns red, *sees something*, *Here they come. Watch the sensor.* |
| `A3-gate-3-standing` | Standing in the beam in open ground: the gate open, *It worked! The gate opened.*; the cables drawn on the stage too. |
| `A4-gate-after` | The visitor gone, the gate shut, the line still there. |
| `A5-gate-back-in-build` | The ready row: *It worked! Try it again* with a tick. |
| `before/A1`–`A4` | The same moments with the kit's sensor as it was (looking at the door from the hub). |
| `B1-gate-eleven-seconds-later` | A look 11 s after the press (Noah's delay): the gate shut, the line still says it worked. |
| `C1-signal-light-placed` | The Signal light kit in Build: the light a pale grey lamp. |
| `C2-signal-light-try-it` | On the stage, off: grey. |
| `C3-signal-light-on` | The visitor standing in the beam: the dome bright red with a glow, *It worked! The light came on.* |
| `C4-signal-light-after` | They have gone: off again. |
| `D1-turned-to-the-door-*` | The Door sensor turned round (R twice) to look at the door: the visitor comes to the gap between the hub and the door; it works. |
| `D2-sensor-blocked-build`, `D2-sensor-blocked-3-standing`, `D3-sensor-blocked-after` | The sensor turned to the door and a wall of the gate's own bricks in that gap: the visitor walks up to the gate's front, is not seen, and the stage says *The sensor didn't see them. It looks this way* with an arrow along the (thick, pulsing) beam. |
| `D4-sensor-faces-a-wall-*` | A Signal light facing loose bricks 2 steps away: the light is on before anyone comes; *The sensor already sees something. Give it room in front.* |
| `E1-code-open` | Code on the Gate: *Ready*, the new Smart gate reading the Door sensor. |
| `E2-code-2-seen`, `E2-code-3-standing` | 90 changed to 45, then **Someone walks up** without Run: it runs, the arm goes to 45, *It worked! The gate opened.*; chips *3 steps away · sees something*, *open · turned to 45*. |
| `E3-code-changed-while-running` | 45 changed to 80 while it runs: *Your code changed. Press Run to try it.* |
| `F1-test-the-motors-cables` | More → Swing open: the gate's two cables stay while the arm swings. |
| `G1-gate-1024-*` | The same at 1024×768; the visitor in open ground, the line above the button. |
| `G2-drive-touch-hint` | A touch screen: *Drag the blue ball to drive*. |

## Measured (five fresh runs each)

| | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---|---|---|---|---|
| Gate: first seen after the press (while still walking) | 2.0 s | 2.0 s | 2.0 s | 2.0 s | 2.0 s |
| Gate: arm when the visitor stops | 70.2° | 70.9° | 70.9° | 70.9° | 70.9° |
| Gate: arm, most open; after they left | 90°; 0° | 90°; 0° | 90°; 0° | 90°; 0° | 90°; 0° |
| Gate: "It worked!" shown after the press | 2.3 s | 2.2 s | 2.2 s | 2.2 s | 2.3 s |
| Gate: standing, their back clear of the gate's front edge | 2.3 studs | 2.3 studs | 2.3 studs | 2.3 studs | 2.3 studs |
| Gate: the whole figure on the canvas, under no panel (its box, px) | yes (250–373 × 384–551) | yes (same) | yes (same) | yes (same) | yes (same) |
| Gate: the colour under the figure's middle (its shirt) | (231, 164, 67) | (231, 164, 67) | (231, 164, 67) | (231, 164, 67) | (231, 164, 67) |
| Signal light: samples while standing, all red | 24 | 25 | 25 | 25 | 25 |
| Signal light: after they left | off | off | off | off | off |
| Code: status before the press; arm reached (typed 45) | Ready; 45° | Ready; 45.1° | Ready; 45.1° | Ready; 45.1° | Ready; 45° |

The light's dome on screen: in Build (223, 225, 227); on the stage, off (208, 212, 215) and on (255, 117, 92).

## The other harnesses

For the follow-up, on the merged tree (`244a1e2` merged in), against this lane's dev server with `UI_OUTPUT` in a
scratch folder (so other lanes' evidence folders are left as they were): `robotics-kid-kits` 39/39,
`robotics-kid-guide` 116/116, `robotics-kid-paint` 60/60 (it places the Gate kit and clicks its hub),
`robotics-cp2-run` 18/18 and `robotics-cp2-failures` 69/70. The one failure, `F1.run.output-closeups`, does not come
from this change (the check zooms in on a rover built from parts, no kit): it zooms with 14 wheel events of 400 px,
and under lane M's new wheel zoom (`basics/wheelZoom.ts`: 400 px doubles the distance, where one event was 5 %)
that most likely flies the camera past the motor. Its socket ends up behind the camera (`inFront: false`) and the
stage shows nothing. Lane M's harness table does not list cp2-failures. One wheel event of 400 px (or four of 100)
would zoom as far as the 14 did before.

None of the cp2 harnesses places a kit (they build their gates and rovers from parts), and neither does
`robotics-kid-guide`; `robotics-kid-kits` and `robotics-kid-paint` place the Gate kit. `robotics-kid-kits`' Gate
check now also reads its sensor's name (*Door sensor*).

The first pass (before the merge at `5a1485e`) ran `robotics-kid-drive` 71/71, `robotics-cp2-run` 18/18,
`robotics-cp2-code` 51/51, `robotics-cp2-failures` 70/70, `robotics-kid-kits` 38/38, `robotics-cp2-wiring` 53/53 and
`robotics-kid-guide` 116/116. Expectations changed on purpose then (the wording above): `robotics-cp2-code` R2 (the
sensor chip reads *N steps away (sees something)*) and R4 (*Your code changed. Press Run to try it.*);
`robotics-cp2-failures` F2 (the same line) and F4.run.chip (a stuck arm's chip reads *closed*);
`robotics-cp3-ipad-code` run:readings-update (the sensor chip in steps). The iPad harness was not run: the iOS
Simulator is off limits to this lane.

## Merging

The first pass was merged into `claude/robotics-kid-int` at `5a1485e`. The follow-up's branch contains
`claude/robotics-kid-int` at `244a1e2` (merged clean); on it the robotics unit tests pass (59 files, 746 tests), the
whole suite passes (185 files, 2066 tests), the app, node and brick-core typechecks are clean, and
`src/robotics/codex-qa-20260922.test.ts` is unchanged and passing. To merge cleanly beside lane P, the ready row's
tick has its own icon type and import line, and its tests their own file (`guide/nextStepsTried.test.ts`).

## Unit tests

`run/walkUp.test.ts` (sensors facing −Z, −X, +Z, +X; both kits turned 0–3 quarter turns; the Gate kit's visitor in
open ground in front of it; seen while walking, read at 3, seen for the whole wait; the camera's side blocked; a
wall in the beam; the beam into the robot itself; the program's sensor of two; no sensor),
`kits/kits.test.ts` (the Gate's Door sensor faces out, flush with the kit's front, named in the section; only the
Gate names a device), `kits/kitPlacement.test.ts` (the name through the real stores: renamed, Undo),
`drive/tryOutcome.test.ts` (every verdict and its line, the ready row and its staleness, both kits' programs
reacting to the walk), `state/stageStore.test.ts` (the watch, the kept verdict, the runner), `code/CodeView.test.tsx`
(Someone walks up runs the newest code; an edit while running; code that cannot run; the keys pad),
`drive/DriveView.test.tsx` (the lines, the fallback, Open Code, the ready row, the touch hint),
`guide/nextStepsTried.test.ts`, `code/stageReadings.test.ts`, `sim/mechanics.test.ts`, `wiring/route.test.ts`,
`run/controller.test.ts`, `program/compile.test.ts`, `drive/playProgram.test.ts`.

## Not done

- **Block dropdowns** still read *Door sensor · B*: `program/devices.ts` labels are `name · port` by CP2-PLAN §5 and
  the wiring harness (W2) checks that a block's label follows its cable. Dropping the port is a one-line change in
  `deviceLabel` plus the inspector's block preview, with tests in lanes P, U and W.
- The verdict is for "Someone walks up" only; the other stage inputs start the program but have nothing to judge.
- The visitor stands in front of the hub, where the Door sensor looks, not in the frame's opening; they could walk
  on through the open gate, but the walk-up does not (it walks back the way it came).
- The Signal light kit's sensor still looks away from the home camera, so its visitor stands behind the post; the
  post is low, so they stand in full view (C3). Left as it is.
