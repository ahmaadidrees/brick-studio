# Robot Workshop kid lane Y: Try it, the walk-up test, Code's stage and the light

Lane Y (Claude Opus 5.5), 2026-09-23, branch `claude/robotics-kid-tryit` off `9f24b4d`. Everything stays behind
`VITE_ROBOTICS_PROTOTYPE=1`.

Harness: `scripts/qa/robotics-kid-tryit.mjs`, run against this lane's dev server
(`npx vite --mode robotics --port 5243 --strictPort --host 127.0.0.1`) in headless system Chrome through
Playwright, at 1366×768, one pass at 1024×768 and one on a touch screen. Result: **54 of 54 checks pass**
(`results.json`), no console errors.

    PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5243 node scripts/qa/robotics-kid-tryit.mjs

A student's input throughout: the drawer's **Robots** choice, a kit card and the command strip's **Place**; the
panel's **Try it** and **Code**; **Someone walks up**; **Back to build**; a click on a number block and typed
digits; **More → Swing to 60°**; **Undo**. Two builds use the studio's own placement actions (as the cp1/cp2
harnesses do): a gate whose sensor was turned round (select it, press R twice) and a gate with a wall of its own
bricks in front of its sensor; a signal light gets a wall of loose bricks in front of its sensor. Measured from the
stage (`window.__robotics.stageStore`: the visitor's phase, the sensor reading, the hinge's angle, the light, the
walk's verdict), from the page (the result line, the chips, the ready row) and, for the light, from the pixels.
**Every first-try check ran five times, each in a fresh page with a fresh world.**

## What Noah hit, and what a student sees now

| Noah (S1, S2) | Now |
|---|---|
| The first "Someone walks up" looked like it did nothing: the whole walk took 7 s, so a look ten seconds later found the person back beside the gate, outside the beam, "sees nothing", "closed", and no word about what had happened. | The visitor always walks into the sensor's beam, slows for the last steps into it (seen while still walking), stands there 3 s, then walks back. One line says what happened (*It worked! The gate opened.*) and **stays** after the visitor has gone: a look 11 s later still says it (B1). |
| Code: "Someone walks up" did nothing unless the program was already running; after editing the wait the status was "Ready" and the arm stayed shut. | Any stage input (Someone walks up, the joystick, the keys pad, a button part on the stage) first runs the newest code, as Run would, when nothing runs or what runs is older than the saved program (E). An edit alone still never stops or restarts a run (CP2-PLAN §1); the stage says *Your code changed. Press Run to try it.* |
| The light was red when off; it switched off after 2 s while the person still stood there. | The light's own colour is a pale grey lamp (off); on the stage an off light is greyed and dimmed and a lit one is its colour with a glow (C). The Signal light's program keeps it red while someone is there and turns it off when they leave. |
| "Ready to try!" never changed after a success. | The ready row says what the last try did (*It worked! Try it again* with a tick, or *The gate didn't open. Try it again*) until the robot or its code changes (A5, D). |
| The walker reached the gate before the arm swung. | The gate starts opening as the visitor walks into the beam and is 71–75° open when they stop (all five runs). |
| The hub's cables vanished during **Test the motors**. | Cables whose device and hub ride on the same body move with it (F1): on the gate they stay put while the arm swings; on a driving Buggy they ride along. |
| "studs", "°" and port letters on these screens. | Try it and Code's stage chips say *3 steps away*, *sees something*, *open* / *closed*, *turned to 45*; the lines never use a unit. |

The Gate kit's sensor looks at the door from the hub, so the visitor stands in the stud-wide gap between the hub and
the door: partly behind the hub from the home camera (A3). The robot works and says so; see "Not done" for the
one-line kit change that would put the visitor in open ground (D1 shows how that looks).

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
- **Kit programs** (`src/robotics/program/starters.ts`). Smart gate: `when run · forever · if Front sensor sees
  something closer than 5 studs → turn Arm motor to 90°, else → turn Arm motor to 0°`; Signal post: the same with
  `set Light to red` / `turn Light off`. 5 is the event hat's own "sees something", so the visitor at 3 is seen.
  The gate's tip is unchanged (*change 90 to 45*); the signal's is now *change red to green. Then press "Someone walks
  up".* Block ids keep their names (`smart-gate:open` …), so the failure harness still finds them.
- **The light**: `ROBOTICS_PART_COLORS.light` is `#c6ced4`; the kit picture draws a lit light in red.
- **Touch** (coordinator's addendum): the Drive hint reads *Drag the blue ball to drive* when the primary pointer is
  coarse, *Drag the joystick or use the arrow keys* otherwise. Kept inside `DriveView.tsx`'s own foot component.

## Shots

| Shot | What it shows |
|---|---|
| `A1-gate-placed` | The Gate kit from the drawer, ready: *Ready to try!* |
| `A2-gate-try-it` | Try it: the visitor waiting to the side, *Press the big button. Watch what happens.* |
| `A3-gate-2-seen` | The visitor walking slowly into the beam: the beam turns red, *sees something*, *Here they come. Watch the sensor.* |
| `A3-gate-3-standing` | Standing in the beam: the gate open, *It worked! The gate opened.*; the cables drawn on the stage too. |
| `A4-gate-after` | The visitor gone, the gate shut, the line still there. |
| `A5-gate-back-in-build` | The ready row: *It worked! Try it again* with a tick. |
| `B1-gate-eleven-seconds-later` | A look 11 s after the press (Noah's delay): the gate shut, the line still says it worked. |
| `C1-signal-light-placed` | The Signal light kit in Build: the light a pale grey lamp. |
| `C2-signal-light-try-it` | On the stage, off: grey. |
| `C3-signal-light-on` | The visitor standing in the beam: the dome bright red with a glow, *It worked! The light came on.* |
| `C4-signal-light-after` | They have gone: off again. |
| `D1-turned-sensor-*` | The gate's sensor turned round to face the front: the visitor comes to where it now looks, in open ground in front of the gate; it works. |
| `D2-sensor-blocked-build`, `D2-sensor-blocked-3-standing`, `D3-sensor-blocked-after` | A wall of the gate's own bricks in front of its sensor: the visitor walks up to the gate's front, is not seen, and the stage says *The sensor didn't see them. It looks this way* with an arrow along the (thick, pulsing) beam. |
| `D4-sensor-faces-a-wall-*` | A Signal light facing loose bricks 2 steps away: the light is on before anyone comes; *The sensor already sees something. Give it room in front.* |
| `E1-code-open` | Code on the Gate: *Ready*, the new Smart gate. |
| `E2-code-2-seen`, `E2-code-3-standing` | 90 changed to 45, then **Someone walks up** without Run: it runs, the arm goes to 45, *It worked! The gate opened.*; chips *3 steps away · sees something*, *open · turned to 45*. |
| `E3-code-changed-while-running` | 45 changed to 80 while it runs: *Your code changed. Press Run to try it.* |
| `F1-test-the-motors-cables` | More → Swing to 60°: the gate's two cables stay while the arm swings. |
| `G1-gate-1024-*` | The same at 1024×768; the line sits above the button. |
| `G2-drive-touch-hint` | A touch screen: *Drag the blue ball to drive*. |

## Measured (five fresh runs each)

| | Run 1 | Run 2 | Run 3 | Run 4 | Run 5 |
|---|---|---|---|---|---|
| Gate: first seen after the press (while still walking) | 1.9 s | 1.9 s | 2.0 s | 2.0 s | 2.0 s |
| Gate: arm when the visitor stops | 74.7° | 75.4° | 75.4° | 70.9° | 70.9° |
| Gate: arm, most open; after they left | 90°; 0° | 90°; 0° | 90°; 0° | 90°; 0° | 90°; 0° |
| Gate: "It worked!" shown after the press | 2.2 s | 2.3 s | 2.2 s | 2.2 s | 2.2 s |
| Signal light: samples while standing, all red | 23 | 24 | 25 | 24 | 24 |
| Signal light: after they left | off | off | off | off | off |
| Code: status before the press; arm reached (typed 45) | Ready; 45° | Ready; 45° | Ready; 45° | Ready; 45° | Ready; 45° |

The light's dome on screen: in Build (222, 225, 226); on the stage, off (208, 212, 215) and on (255, 117, 92).

## The other harnesses

Run against this lane's dev server with `UI_OUTPUT` in a scratch folder (so other lanes' evidence folders are left
as they were): `robotics-kid-drive` 71/71, `robotics-cp2-run` 18/18, `robotics-cp2-code` 51/51,
`robotics-cp2-failures` 70/70, `robotics-kid-kits` 38/38, and, because this lane touched cables and the ready row,
`robotics-cp2-wiring` 53/53 and `robotics-kid-guide` 116/116.

Expectations changed on purpose (the wording above): `robotics-cp2-code` R2 (the sensor chip reads *N steps away
(sees something)*) and R4 (*Your code changed. Press Run to try it.*); `robotics-cp2-failures` F2 (the same line) and
F4.run.chip (a stuck arm's chip reads *closed*); `robotics-cp3-ipad-code` run:readings-update (the sensor chip in
steps). The iPad harness was not run: the iOS Simulator is off limits to this lane.

## Unit tests

`run/walkUp.test.ts` (sensors facing −Z, −X, +Z, +X; both kits turned 0–3 quarter turns; seen while walking, read
at 3, seen for the whole wait; the camera's side blocked; a wall in the beam; the beam into the robot itself; the
program's sensor of two; no sensor), `drive/tryOutcome.test.ts` (every verdict and its line, the ready row and its
staleness, both kits' programs reacting to the walk), `state/stageStore.test.ts` (the watch, the kept verdict, the
runner), `code/CodeView.test.tsx` (Someone walks up runs the newest code; an edit while running; code that cannot
run; the keys pad), `drive/DriveView.test.tsx` (the lines, the fallback, Open Code, the ready row, the touch hint),
`guide/nextSteps.test.ts`, `code/stageReadings.test.ts`, `sim/mechanics.test.ts`, `wiring/route.test.ts`.

## Not done

- **The Gate kit's sensor** looks at the door from the hub, so the visitor stands behind the hub (A3). Turning the
  kit's sensor to face out of the front (`rotation: 2` in the kit's copy of the fixture, plus a name, since a sensor
  facing the viewer is called "Back sensor") would put the visitor in open ground (D1). The kit is lane K's.
- **Block dropdowns** still read *Front sensor · B*: `program/devices.ts` labels are `name · port` by CP2-PLAN §5 and
  the wiring harness (W2) checks that a block's label follows its cable. Dropping the port is a one-line change in
  `deviceLabel` plus the inspector's block preview, with tests in lanes P, U and W.
- **More → Test the motors** keeps *Swing to 60°*: More is for grown-ups, and the cp1 harnesses click those names.
- The verdict is for "Someone walks up" only; the other stage inputs start the program but have nothing to judge.
