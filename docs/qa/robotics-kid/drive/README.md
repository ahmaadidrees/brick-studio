# Robot Workshop kid-UX pass, lane D: Drive and Try it in real Chrome

Harness: `scripts/qa/robotics-kid-drive.mjs`, run against the lane's dev server
(`npx vite --mode robotics --port 5254 --strictPort --host 127.0.0.1`) in headless system Chrome through
Playwright, at 1366×768 and 1024×768, plus one touch run at 1024×768. Result: **71 of 71 checks pass**
(`results.json`), with no console errors. Run on `claude/robotics-kid-drive` after merging
`claude/robotics-spike` at `f6104f6` (lane M2's four-wheel cars).

    PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-kid-drive.mjs

The Buggy (the spike's rover), a four-wheel car, the gate and the signal light are built from loose parts
with the studio's own placement actions, as the cp1/cp2 harnesses build them, and named through the
robotics store. The Drive view is opened through the dev hook `window.__robotics.driveView.openDrive(id)`,
standing in for lane G's Drive / Try it button. After that, everything is a student's input: a real mouse
drag on the joystick, one finger on it (DevTools touch events, Chrome with touch), the arrow keys and W,
clicks on Reset, Test plate / My world, Someone walks up and Back to build, and Escape.

Movement is measured from the stage itself (`window.__robotics.stageStore`): the chassis pose applied to the
middle of the robot's plate and to its forward. After every Back to build the whole document (every brick,
and the robotics section: cables, device names, creations with their run space, programs) is compared with
what it was before Drive opened.

## What a student sees

**Drive** (a robot that can drive): the stage fills the canvas. One bar across the top: **Back to build**, the
robot's name, **Test plate** / **My world**, **Reset**. Bottom right, in one corner: the speed, the line
*"Drag the joystick or use the arrow keys"* pointing down at a big joystick. There is no Run button: the
robot is driving-ready the moment the view opens. Until the joystick is first used, its knob nudges upwards
to show which way to drag; while an arrow key is held, the knob leans that way. The test plate has a fenced
course: two orange posts make a gate straight ahead, and a yellow post stands in the robot's path further on.

**Try it** (a gate or a signal light): the stage in My world, the robot's name and Reset in the bar, what it
does in words bottom left (*Front sensor: sees nothing*, *Arm motor: closed*, *Light: off*), and bottom right
the line *"Press the big button. Watch what happens."* over a big **Someone walks up** button.

**Not ready**: one card, *"Buggy is almost ready! Put a wheel on Left motor's axle."*, and Back to build.

## Shots

| Shot | What it shows |
|---|---|
| `D1-drive-open-{1366,1024}` | The Buggy opens on the test plate's course, driving-ready. The course is framed whole, clear of the bar and the control column: at 1366 it clears them by 95 to 110 px and the robot's 6-stud plate is drawn 97 px wide; at 1024, by 47 px or more, 71 px wide. |
| `D2-joystick-forward-{1366,1024}` | A mouse drag pushes the knob 92 % up. The Buggy drives through the gate at 8.2 studs a second; the readout says so. |
| `D3-arrow-turn-{1366,1024}` | ArrowLeft held: the Buggy turns on the spot and the knob leans left. |
| `D4-my-world-{1366,1024}` | My world: no course, the student's own bricks around it, and the Buggy rolls free among them (ArrowUp drove it 6.3 studs). |
| `D5-not-ready-{1366,1024}` | A wheel taken off while it drove closed Drive; opened again, the card says what to do. |
| `D6-touch-drag-1024` | One finger on the joystick (Chrome with touch): the Buggy drives 9.8 studs; the page neither scrolls nor zooms. |
| `D7-four-wheel-{1366,1024}` | Lane M2's four-wheel car, built from loose parts: the joystick drives all four motors. |
| `T1-gate-{1366,1024}` | Try it on the gate: My world, the visitor waiting to the side, the big button. |
| `T2-gate-open-{1366,1024}` | Someone walked up: the door swung to 90° and the results turned green (*sees something*, *open*). |
| `T3-signal-red-{1366,1024}` | Try it on the signal light: the light is red, the results say *red* with a red dot, and the button waits while the visitor is there. |

## Measured

| | 1366×768 | 1024×768 |
|---|---|---|
| Joystick dragged 92 % up for 0.9 s | 9.1 studs forward, 8.2 studs/s, turned −0.1° | 8.9 studs, 8.2 studs/s, 0.0° |
| Letting go | knob back to 0, motors off, speed 0.00 | the same |
| ArrowLeft held 0.8 s | turned 67.5° left, on the spot (the plate's middle moved 2.7 studs) | 64.5° left |
| ArrowRight held 0.8 s, then W 0.6 s | turned back 60.4°; W drove 4.3 studs | 60.3°; 4.6 studs |
| Reset | back to the built pose (0.000), driving-ready again | the same |
| My world, ArrowUp 0.7 s | 6.3 studs forward | 6.3 studs |
| Four-wheel car, joystick 92 % up | all four motors at 92 % (raw 92, −92, 92, −92: the right-hand motors face the other way), 8.9 studs at 8.7 studs/s | 8.6 studs at 8.7 studs/s |
| Four-wheel car, ArrowLeft 1.2 s | turned 59.2° left | 58.9° |
| Gate: someone walks up | door to 90.0°, then closed again | 90.1° |
| Signal light: someone walks up | light red | red |
| One finger (touch run) | — | knob 92 % up, 9.8 studs forward; scroll 0, zoom 1; smallest button 44 px |

## Checks along the way

- Drive opens with the program already running and no Run button; the line reads exactly
  *"Drag the joystick or use the arrow keys"*.
- The brick drawer, the command strip, the camera cluster and the robotics panel step aside while it is open.
- The framing counts the bar as a top inset and the speed / hint / joystick column as a right inset (nothing
  covers the bottom), and every corner of the fence and of the robot's plate is drawn inside what they leave free.
- After the drags and the keys the page has not scrolled or zoomed.
- Back to build after driving (joystick, keys, Reset, My world and back): the document is identical, no
  program was saved, the studio's Undo stack is unchanged and the stage is closed. The same after the
  four-wheel car, the gate (its Smart gate starter ran on the fly) and the signal light (Signal post on the fly).
- Taking a wheel off while it drives closes Drive (a construction edit); opening it again gives the not-ready card.
- Escape is Back to build too.

## Not covered here

- The live-room refusal and Try it on a gate with no sensor are covered by the unit tests
  (`src/robotics/drive/DriveView.test.tsx`), not in Chrome: the local robotics server has no live rooms.
- The camera does not follow the robot. On the test plate the fence keeps it in view; in My world a student can
  drive out of the framed area (orbit the camera, or press Reset).
- iPadOS Safari was not run; the touch run is Chrome with touch events.
