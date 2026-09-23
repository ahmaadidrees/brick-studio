# Robot Workshop kid-UX pass, lane S: magnetic connections

Branch `claude/robotics-kid-snap` (worktree `robotics-lanes/kid-S`), behind `VITE_ROBOTICS_PROTOTYPE=1`. No push, no
merge, no deploy. Spec: `docs/robotics/KID-UX.md` §S. Harness: `scripts/qa/robotics-kid-snap.mjs`, real Chrome, real
mouse and keyboard, against `npx vite --mode robotics --port 5252 --strictPort --host 127.0.0.1`:

    PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5252 node scripts/qa/robotics-kid-snap.mjs

**96/96 checks** (`results.json`, `run.log`). Every part is chosen in the drawer with a click and placed with one click.
The mouse is aimed *near* where the part belongs, never on the exact spot; where "near" is on the screen comes from the
studio's own world→screen projection (the dev-only `window.__robotics.project`), the aiming a student does by eye.
Nothing is placed with injected coordinates and no fixture is loaded.

## What a student sees now

- **Targets glow while a part is armed.** A motor: green bars along the free stretches of the robot plate's long sides,
  arrows pointing out (the way the socket will face) and a pad where the motor will sit. An axle: a green ring on every
  free motor socket and loose wheel hole, and a pad on the ground where the axle will lie. A wheel: a ring on every free
  axle end and a pad where the wheel will stand; motors with nothing in their socket show a grey ring, and say
  "Put an axle in first" when the mouse comes near. Rings and bars keep a readable size when the camera is far.
- **Snaps from near, not only from on top.** The ghost snaps when the mouse is within about 1.5 studs of where the part
  would sit, over the part it connects to, another brick or the bare ground; the nearer of two targets wins. A snapped
  ghost has a bright green outline (seen through the robot when the spot is behind it) and its target brightens.
- **Motors turn themselves.** Over a plate within 2 studs of an edge, the motor turns so its socket faces out over that
  edge and sits flush with it, sliding along the edge to the nearest spot with room. At a corner the student's own R
  turn picks the edge. On bare ground within 3 studs of a robot's plate, it goes onto that plate's edge.
- **Motors on the bare ground** say "Put motors on a plate so wheels reach the ground" next to the part (and in the
  wiring line when it was just placed). **A device beside a robot but not on it** says which robot and how, in the
  wiring line: "Right motor isn't on Buggy yet. Put it on Buggy's plate." (only when the plate has room; otherwise
  "Stack it on Buggy."). It does not start a second robot.
- **A near miss never looks right.** A wheel or an axle next to a connector without connecting gets a red ring on its
  connector, a red bar across the gap and a line: "Put the wheel on the axle", "Push the axle into the motor"; for an
  axle beside a motor on the ground, the motor's own line says why.
- **Fixing is one drag.** A dragged part snaps like a new one: a wheel dragged back near its axle end goes on; a motor
  dragged toward the robot's plate mounts itself on the edge.

## Counts

| Build | Viewport | Placements | Looked connected but was not |
|---|---|---|---|
| A. A car from parts | 1366×768 | **8** (plate, hub, 2 motors, 2 axles, 2 wheels; no retries) | **0** |
| B. The owner's first try replayed | 1366×768 | 3 (hub, motor, axle, all on bare ground) | **0** (the axle beside the grounded motor is marked red) |
| D. A motor on the ground, fixed with one drag | 1366×768 | 4 + 1 drag | **0** |
| C. The same car | 1024×768 | **8** | **0** |

"Looked connected but was not" counts a placement whose ghost showed the green snapped outline but whose part did not
connect (per the model: axle in a socket, wheel on an axle, motor on the robot), or an axle or wheel left unconnected
without a red gap marker. After each car, `readiness()` (`src/robotics/drive/readiness.ts`) says
`{ kind: 'drive', ready: true }` and no gap marker remains.

At 1024×768 the robotics panel covers the right side of the car, so the harness does what a student would: presses the
panel's own Hide and scrolls out with the mouse wheel (20 notches) until the car's working area is on the canvas (a
point counts only when `document.elementFromPoint` there is the canvas). The robot is then small; the markers keep
their minimum size.

## Shots

| Shot | What it shows |
|---|---|
| S1 | Motor armed, mouse parked on open ground: the plate's two free side stretches glow, arrows out, pads where motors fit |
| S2 | Mouse on the ground 1.6 studs left of the plate, level with the hub: the motor jumped onto the left edge, turned to face out (r2), green outline |
| S3 | Axle armed: both sockets ringed (the hidden left one seen through the motor), a pad where the right axle will lie |
| S4 | Mouse on the ground a stud past the left socket's axle spot and half a stud to the side: the axle snapped in, green, its ring brightened |
| S5 | Wheel armed: both axle ends ringed, pads where the wheels will stand |
| S6 | Mouse on the ground near the left axle end: the wheel snapped on, green |
| S7 | The finished car: no markers, ready to drive |
| S8 | A motor dropped on the ground behind the finished car: "Right motor isn't on Buggy yet. Stack it on Buggy." (the plate is full) and, next to it, "Put motors on a plate so wheels reach the ground"; no second robot, no card |
| S9 | The left wheel nudged a stud off its axle: red ring, red line, "Put the wheel on the axle" |
| S9b | Dragged back with the real mouse: mid-drag the ghost snaps on (green) and the red line hides for the part being moved; released, the marker is gone and the car is ready again |
| S10 | The owner's first try: a hub on the bare ground, a motor beside it: no second robot asking for a hub; "Right motor isn't on Robo yet. Put them both on a plate." and the ground line next to the motor |
| S11 | An axle aimed where it looks like it goes in front of that motor: no snap (its socket is one plate too low), the motor's line stands out |
| S12 | Placed anyway: the rod points into the ring but is not in it, so the red ring marks the gap |
| S13 | Section D: the second motor dropped too far out to be pulled on ("…Put it on Buggy's plate."), then dragged toward the plate: mid-drag it mounts itself on the right edge, green |
| S14 | Released: "Right motor connected to port B", the ground line gone |

`*-1366.png` and `*-1024.png` for S1–S7.

## Looked at as a third grader would

Two rounds of reading these PNGs changed the build:

- At 1024×768, zoomed out, the rings and the motor bars were too thin to notice: they now never draw smaller than a
  set size on screen (rings about 28 px across, bars 7 px thick).
- A thin bar alone did not say "a motor goes here": a pad now shows exactly where the motor will sit, like the axle and
  wheel pads.
- The snapped left axle hid behind its motor; its green glow now shows through the robot.
- While the wheel was dragged back (green ghost), its red "Put the wheel on the axle" line still showed: gap markers now
  hide for the part being moved.
- A motor on the ground with an axle aimed at it showed two nearly identical lines; the hint now makes the motor's own
  line stand out instead. Hints are not "go" messages, so they are no longer green.
- After Undo removed the stray motor, the wiring line still said it was not on Buggy: a line about a part that is gone
  now goes away.
- "Put it on Buggy's plate." for a motor beside a car whose plate is full could not be followed: the line now says the
  plate only when it has room.

## Companion harnesses (same server, output to a scratch folder)

- `scripts/qa/robotics-spike-cp1-pointer.mjs`: **78/78**, no aim changed. Its left motor is aimed exactly at the
  plate's near-left corner after two R presses; the corner rule (the student's own turn picks the edge) keeps it on the
  left edge, where it was before.
- `scripts/qa/robotics-spike-cp1.mjs` (store-driven): **49/49**, unchanged.
