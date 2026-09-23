# Robot Workshop cp2: the five failures, built and diagnosed in real Chrome

Harness: `scripts/qa/robotics-cp2-failures.mjs`, run against the robotics dev server
(`npx vite --mode robotics --port 5247 --strictPort --host 127.0.0.1`) in headless system Chrome through
Playwright at 1366×768. Result: **70 of 70 checks pass** (`results.json`), with no console errors.

Each construction is placed with the studio's own placement actions, as the other cp2 harnesses do, so
assisted wiring and the creation card run as they do on a click. Everything after that is student input:

- clicks on parts in the canvas and in the hub's port list;
- the inspector's **Unplug**, **Plug into port A** and name field;
- the arrow keys, **R** and **Delete** on a selected brick;
- the panel's **Code** button and the **+** menu;
- blocks dragged out of the palette, a dropdown picked with a click, and digits typed into a number field;
- **Run**, **Reset**, **Test plate** / **My world**, **Someone walks up** and **Back to build**;
- the stage's own orbit, pan and zoom.

Every diagnosis is read from what the page shows:

- **Build:** panel lines, part rows, the selected-part line and the inspector.
- **Code:** block warnings, outlines, dropdown labels and glow; the problems list; the run-blocked line.
- **Stage:** the reading chips and the status line.

Poses and beam ends are drawn on the page but not printed, so the harness reads those numbers from the
stage's observation. The stage scene draws from that same observation.

## The contract's table, as measured

| Student does | Student sees | The app makes the cause findable by | Result |
|---|---|---|---|
| Leaves a wheel off its axle | Motor spins, wheel stays still: the left output turned **546°** at 40 % speed in 3 s. The rover moved **0.000 studs** on the test plate, where it is free to roll. | The selected wheel and its part row say **"Wheel · Not on an axle · the nearest axle end is 1 stud away"** (red). The motor row says "Left motor · axle in it, no wheel". The stage chip reads "Left motor 40 % · speed 40 % · 583°". In Code, "drive forward" now says **"Choose two drive motors first · Left motor has no wheel on its axle"** (fixed here, see below). | Pass |
| Mounts one motor backwards (raw `run Left motor at 40 %` + `run Right motor at 40 %`) | The rover turns instead of driving straight. It spun **86°** in 3 s about a point 0.18 studs from midway between its wheels. Mean forward speed was 0.07 st/s. | The panel's drive line says **"Drive: Left motor + Right motor · Right motor reversed"**. The right motor's row and inspector say "runs backward (reversed)". The stage's red Motors chip reads **"40 · −40 %, speed 27 · −27 %"**: opposite forward speeds (`forwardPercent` +28.3 and −26.0). | Pass |
| Points the sensor sideways | The sensor never sees the wall. The rover drove **12.0 studs** into a wall 12.0 studs ahead and sits against it, still at 40 %. | The beam is drawn sideways on the stage: 40 studs across, −0.07 studs forward. The row and inspector say **"faces left"**, and the default name is "Left sensor". The sensor chip only ever read **"nothing seen"**. The glowing block stays on "wait until Left sensor · C sees something". | Pass |
| Builds the arm into the frame | The arm stops moving. It stayed at **0.00°** through the visitor's pass (door yaw 0.00°). | The stage highlights the contact in coral: **door ↔ bridge brick**. The arm chip reads **"0°, built into the frame · can't swing"** (red, even before Run). The block and problems list say "Arm motor's arm is built into the frame, so it can't swing". The panel says the same, and Build tints the lock red. | Pass |
| Unplugs a motor (the inspector's **Unplug**) | Code cannot control it. The left motor got **0 %** power and only coasted at 5.8 % as the rover dragged its wheel. The right motor still ran at −40 % (speed −26 %), so the rover swung 28° about its dead wheel. | Build shows the device unplugged: a loose cable end with a red plug, the inspector reads **"Unplugged · No power"**, the block preview says "Not plugged in", the row says "Not plugged in", and a toast appears. Its blocks read **"run Left motor · not plugged in"** with the amber warning "Left motor is not plugged in". "drive forward" gets the same warning. The stage chip reads "Left motor not plugged in · Right motor speed 26 %" (the detail is fixed here). | Pass |

Each failure's broken state survives a save and a cold reload. Each one is also repaired from what the app
pointed at, and the repair works:

| Failure | Repair | Result |
|---|---|---|
| Wheel off its axle | ArrowRight puts the wheel back on its axle | The drive pair returns |
| Motor mounted backwards | −40 typed into the right motor's block while the rover spins | The stage says **"Changed · press Run to use it"** and the run keeps its revision. After Reset and Run the rover goes straight (yaw −0.1°, 4.1 studs in 1.3 s) |
| Sensor sideways | **R** turns the sensor forward | It is renamed "Front sensor" and stops 2.48 studs from the wall |
| Arm built into the frame | The two bricks under the door are deleted | The door swings to 90.0° |
| Motor unplugged | **Plug into port A** | Port A, and no loose ends |

## Per failure

### F1. A wheel left off its axle (`F1a`–`F1d`)

The student builds the rover and opens Code: **Stop before the wall**, on the test plate. Back in Build, they
click the left wheel and press ArrowLeft, so it now stands one stud off its axle.

- **`F1a`.** The selected-part line and the red part row both read "Wheel · Not on an axle · the nearest
  axle end is 1 stud away". The creation line reads "1 wheel not on an axle · 1 motor with a wheel", and
  the drive line is gone.
- **`F1b`.** Code reopens on **My world**, not the test plate (finding A). "drive forward" has a red outline
  and says "Choose two drive motors first · Left motor has no wheel on its axle". Run shows "Can't run yet:
  …" with the same words. Before this lane's fix it said only "Choose two drive motors first", and the app
  has nowhere to choose one.
- **`F1c`.** The student adds a Blank program: `when run → run Left motor · A at 40 %`, dragged from Motion
  with 40 typed in. On the test plate the left chip reads "40 % · speed 40 % · 583°". The rover's pose is
  unchanged (0.000 studs, −0.03°).
- **`F1c-closeup-output-1/2`, `F1c-code-left-side-view`.** The stage view is orbited, panned and zoomed round
  to the left side. The output's yellow notch shows in one close-up (1658°) and is behind the axle in the
  other (1578°). The chip is the clearer evidence.
- **`F1d`.** In My world the loose wheel is the studio's own static copy at its built place, beside the
  turning axle (382°).
- **Repair.** ArrowRight puts the wheel back: "Wheel · on an axle in Left motor", and "Drive: Left motor +
  Right motor · Right motor reversed" returns.

### F2. One motor mounted backwards (`F2a`–`F2f`)

On a stud grid the natural rover mounts its two motors mirror-wise: each socket faces out toward its own
wheel. So one of them is always reversed relative to the pair's forward. The model says so from the
geometry, and the "drive" helpers fold it into the sign.

- **`F2a`.** The panel reads "Drive: Left motor + Right motor · Right motor reversed". Clicking the right
  motor, the inspector reads "Motor · wheel on its axle · runs backward (reversed)".
- **`F2b`.** A Blank program: `run Left motor · A at 40 %` then `run Right motor · B at 40 %`. The second
  block's dropdown was set to "Right motor · B" with a click. No block warns, because the program is
  valid and only the build explains the behaviour. The rover spins on the spot, and the red chip reads
  "40 · −40 % · speed 27 · −27 %".
- **`F2c`.** The student types −40 into the right motor's block while it still spins. The edit saves, the
  stage says "Changed · press Run to use it", and the run keeps spinning (−110° → −126°).
- **`F2d`.** After Reset and Run, it drives straight: "40 · 40 %", yaw −0.1°. For comparison, the starter's
  "drive forward at 40 %" also goes straight: it sends +40 and −40, and the chip reads 40 · 40 %.
- **`F2e`, `F2f`. The other way round, mounted physically.** The right motor goes outboard of its wheel with
  its socket facing in. It hangs from a 1×1 riser under a 1×6 beam carried by a pillar on the chassis plate.
  Now both motors face the same way:
  - The model finds **no reversed motor**: "Drive: Left motor + Right motor", and both rows say "runs
    forward".
  - The same two raw blocks at 40 % **drive straight**: 4.55 studs in 1.5 s, yaw −1.0°, chip "40 · 40 %".
  - The outboard motor was first named "Left motor" too, because names follow the socket direction
    (finding C). The student renamed it in the inspector.

### F5. A motor unplugged (`F5a`–`F5c`)

This runs on the F2 rover, which carries both of its programs.

- **`F5a`.** The student clicks the left motor and then **Unplug**. The results:
  - the document drops its cable, leaving B and C used;
  - the scene draws a loose end with a red plug and no cable to the hub;
  - the inspector reads "Unplugged", "No power" and "Nothing turns until a cable reaches a port.", and its
    block preview carries "Not plugged in";
  - the row reads "… · Not plugged in · runs forward";
  - a toast says "Left motor is unplugged. Blocks that use it show "Not plugged in"."

  A cold reload keeps it unplugged.
- **`F5b`.** In Code, the raw block reads "run Left motor · not plugged in at 40 %", with the amber warning
  "Left motor is not plugged in". "run Right motor · B" is clean. The problems list shows "Heads up · Left
  motor is not plugged in", and the chip reads "Left motor not plugged in".
- **`F5c`.** Run: the left motor has power 0 % and coasts at 5.8 %. The right motor runs at −40 % with speed
  −26 %, so the rover swings 28°. The chip now reads "Left motor not plugged in · Right motor speed 26 %",
  and the problems list adds "Left motor is not plugged in, so it did nothing". On the starter's tab,
  "drive forward" carries the same warning.
- **Repair.** **Plug into port A** gives "Port A" and no loose ends.

### F3. The sensor pointed sideways (`F3a`–`F3d`)

The sensor was turned a quarter (**R** once) at the plate's right edge.

- **`F3a`.** The row reads "Left sensor · faces left · port C". Opened from the hub's port list, the
  inspector reads "Distance sensor · faces left". A reload keeps it.
- **`F3b`, `F3c`.** Code opens **Stop before the wall** on the test plate, and the block reads "Left sensor ·
  C". The beam runs sideways: on screen from (1151, 469) to (754, 338), 40 studs long, 0.07 studs forward.
  The chip only ever reads "nothing seen". The rover drives the 12.0 studs to the wall and sits against it
  at 40 %, and "wait until …" keeps glowing.
- **`F3d`. Repair.** Three more **R** presses turn the sensor forward: "Front sensor · faces forward · port
  C". The same program now reads "Front sensor · C" and stops 2.48 studs before the wall.

### F4. The arm built into the frame (`F4a`, `F4b`)

The gate is cp2-code's, with two 2×2 bricks stacked on the sill under the door's far end. The door rests on
their studs.

- **`F4a`.** The creation line reads "Arm motor's arm is built into the frame, so it can't swing". The row is
  red: "Arm motor · arm built into the frame, so it can't swing · port A". From the hub's port list, the
  inspector reads "Hinge motor · arm built into the frame". The door and the bricks under it are tinted red.
  A reload keeps it.
- **`F4b`.** "Smart gate" opens in My world. Before Run, the arm chip already reads "0° · built into the
  frame · can't swing". **Someone walks up**: `turn Arm motor · A to 90°` runs and gets the amber warning.
  "Heads up" appears in the problems list, and the arm stays at 0.00°. The stage highlights the door and
  the brick it rests on in coral.
- **Repair.** Both bricks are deleted (select, then Delete). The line reads "Fixed side on the frame, moving
  side on the arm · zero is as built", and the door swings to 90.0°.

## Product changes made in this lane

All three are inside `src/robotics/**`. The whole suite passes: 153 files and 1666 tests, including
`src/robotics/codex-qa-20260922.test.ts`, which is unchanged. Typecheck (`tsconfig.app.json`, brick-core)
and `vite build --mode robotics` are clean.

1. **`src/robotics/program/compile.ts`.** A helper block with no drive pair now says why, from the build:
   "Choose two drive motors first · Left motor has no wheel on its axle". The other reasons are "… has
   nothing in its socket", "… is its only motor" and "its wheeled motors' axles don't line up".
   - `CompileContext` gains an optional `drivePairMissing`, filled by `compileContextFor` through a new
     `whyNoDrivePair`. The change is additive. A context without it (and a creation with no motors) keeps
     the contract's exact words.
   - Test: `compile.test.ts`, "without a drive pair the helper says why, from the build".
2. **`src/robotics/code/stageReadings.ts`.** While a run exists, the drive-pair chip with one motor unplugged
   shows the other motor's speed ("Right motor speed 26 %") instead of only the two names. Before Run it
   still shows the names. Test: extended in `stageReadings.test.ts`.
3. **`src/robotics/ui/RoboticsPanel.tsx`.** `roleTitle` capitalises wheel and axle, so the selected-part line
   reads "Wheel · Not on an axle …" rather than "wheel · …".

## Findings not fixed, with proposed fixes

- **A. A rover that loses a wheel stops being a rover** (`creations.ts`). Without a drive pair its kind
  becomes `creation`, and three things follow:
  - Its default run space flips from Test plate to **My world**. There its plate is stud-attached to the
    ground and anchored, so nothing could roll even with both wheels.
  - The test plate then offers a visitor instead of the wall.
  - The student's "drive forward" program can't run.

  Proposed fix, either:
  - write `testSpace` the first time Code opens a creation, so a later build change never moves it; or
  - derive the rover kind from "two motors with axles whose sockets line up", a would-be pair, and not only
    from a complete pair.
- **B. "Choose two drive motors first" has no place to choose.** Contract §6 says the student can inspect
  and change the pair, but only the automatic proposal exists. The fix above says why there is no pair.
  Proposed: a "Drive" row in the card or panel with two motor pickers, or reword the contract line.
- **C. Default names follow the socket direction.** Two motors facing the same way are both "Left motor"
  (F2e) until renamed, and the dropdown tells them apart only by port. A sensor turned sideways is renamed
  "Left sensor". That helps F3, but a rotation silently relabels the blocks. Proposed: name drive motors
  by their side of the creation (relative to the pair's forward) and number duplicates ("Left motor 2").
- **D. The reversed pair's chip shows −40 for a block that says 40.** "40 · −40 %" is the reading as the
  creation feels it. The contract's "readings show opposite speeds" is met, but nothing on the chip says
  why the second number is negative. Proposed: when the pair is fighting, add "· Right motor reversed" to
  the chip's detail, so it matches the panel's drive line.
- **E. On the test plate the loose wheel is not drawn** (`F1c`). It is not part of the creation, so the stage
  shows a bare axle, while in Build it sits beside the axle. This is consistent with the stage rules and
  arguably tells the student the wheel isn't attached. If it confuses in class, draw the card's "nearly
  attached" wheel as static scenery on the test plate.
- **F. Framing slides the camera sideways to clear the Code panel**, so orbiting the stage swings the
  creation out of view. The harness pans it back with a middle-drag. The stage's Frame button restores the
  home direction. A student who orbits to look at the far side loses the creation. Proposed: after a
  framing, orbit about the creation's centre (use a view offset for the panel instead of sliding the
  target).

## Screenshots

`F1a`–`F1d` (plus `F1c-closeup-output-1/2`, `F1c-code-left-side-view`), `F2a`–`F2f`, `F5a`–`F5c`,
`F3a`–`F3d`, `F4a`, `F4b`. The run order is F1, F2, F5, F3, F4, F2e/F2f. `results.json` holds every
check, the measured numbers (`measured`) and the texts read off the page (`seen`).
