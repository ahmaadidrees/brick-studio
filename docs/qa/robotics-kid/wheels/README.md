# Robot Workshop kid-UX pass, lane W: a drivable car from separate parts

Branch `claude/robotics-kid-wheels` (worktree `robotics-lanes/kid-W`, from `9f24b4d`), behind `VITE_ROBOTICS_PROTOTYPE=1`.
No push, no merge, no deploy. Harness: `scripts/qa/robotics-kid-wheels.mjs`, real Chrome, real mouse and keyboard (section D
by touch), against `npx vite --mode robotics --port 5242 --strictPort --host 127.0.0.1`:

    PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5242 node scripts/qa/robotics-kid-wheels.mjs

**97/97 checks** (`results.json`, `run.log`). Parts come from the drawer with a click and are placed with a click where
the mouse is; the robot panel's rows and the line's buttons are clicked. Where a spot is on the screen comes from the
studio's own world→screen projection (dev-only `window.__robotics.project`). No fixture is loaded.

## What was wrong

**Leo (9), 1366 × 768, skipping the kits** (`scratchpad/novice/leo/`, 90 actions, 26 of them stuck on one motor):

- No plate among Robot parts; he found Plates in the category list.
- Four wheels at the corners of the plate looked like a finished car. Nothing said they could not turn (004–022).
- His first motor went in the middle of the plate and was called "Left motor".
- The second motor had no room on his 4 × 6 plate (hub and motor filled it): a red preview over a wheel with no reason;
  the part's panel said "No hub · No power · Add a hub to Speedy" although Speedy had one; the line said "Stack it on
  Speedy"; arrows and the height handle gave studio messages; a move left the motor in the air (042–056).
- Axle targets glowed at the loose wheels, where an axle turns nothing (069–071).
- The left wheel's preview was red with no reason (an old plate underneath) (075).
- "Ready to drive!" with three loose wheels; Parts said "5 wheels"; the loose wheels vanished in Drive (080–088).

**Sam (8), iPad, Robot base kit** (`scratchpad/novice/sam2/`): the second motor's preview sat on the hub, Place put it
there and "Put a motor on each side" ticked (032–033), then no axle could go in (040–041); a motor on the green right-side
spot faced backwards and the step said "Put the motors on opposite sides, facing out." (062); Rotate renamed the motor
Front → Left → Back → Right (043–047).

**Ava**: a seat dropped in front of the car stayed loose with no message; Explore had nothing to ride.

## What a student sees now

- **Robot plate first.** Robot parts open with a "Robot plate" tile: the Buggy's 6 × 8 plate (W01). The step "Put the
  robot on a plate" arms the same part.
- **A wheel that can't spin says so, the moment it lands.** "This wheel can't spin yet. It needs an axle in a motor." on
  the line, with **Add a motor for it**, and beside the wheel; a red ring with a bar across its hub on both faces and a red
  "!" badge stay on it while it is loose (W02, W03). The one tap adds a motor on the long side of the plate by the wheel,
  socket facing the wheel's side, an axle in it, and moves the wheel onto the axle's end (on the ground, not in the air);
  one Undo takes it all away ("Add a motor for the wheel") (W04). It uses a waiting motor or a free axle end first
  ("Put it on Left motor", "Put it on Left motor's axle") and never carries a wheel across the robot. With no room:
  "No room for a motor here. Try a bigger plate." with what is in the way outlined in orange and a red motor where it
  would go (W11); with no plate near: **Put a plate down**, then the line offers the motor.
- **Loose wheels in the panel.** Under the steps: "1 wheel spins. 3 wheels aren't on an axle." and **Fix wheel 1/2/3** /
  **Take it off**, numbered as the badges on the wheels (W05). Once it can drive, Drive stays on and the line under "Ready
  to drive!" adds "They stay here when you drive." (W07). Parts counts them apart: "4 wheels, 4 axles · 3 loose wheels",
  each loose wheel with its own Fix / Take it off (W08).
- **"The other side" is shown, not told.** Arming the next motor from the step puts its ghost exactly across from the first
  (the mirror across the plate), with a green motor-shaped target there (W13). If that spot is taken the row says "No room
  there. Try a bigger plate." (or "Something is in the way there." when only a loose wheel blocks it), the target is red
  and what is in the way is outlined (W10).
- **A motor goes only where a wheel can work.** Anywhere over a plate, or over the robot's hub or any of its parts, a motor
  goes to the nearer long side of the robot's plate, facing out, where an axle fits; never on top of the hub (W12). A motor
  from the steps (Make it move, the other side) starts where it goes. On a touch screen a motor ghost left on the hub moves
  to a side before Place (W16). "A motor on each side" ticks only when every motor can turn a wheel: one in the middle, on
  the hub, turned around, or facing the front or back gets a one-tap fix (**Move it to the side**, **Turn it**) with a green
  arrow to where it goes and kid words: "Turn Left motor around.", "Motors go on the sides so the wheels touch the ground."
  (W15).
- **Names stay put.** A motor on a plate is named by the side it stands on (Left, Right; Front left, Back left on a long
  side with two), so Rotate never renames it; one in the middle is "Middle motor".
- **A red preview always says why** (robot parts): "Something is in the way.", "No room on the plate. Try a bigger plate.",
  "A wheel is in the way.", "It needs to sit on the robot's plate.", "Motors go on a plate on the ground.", "Too close to
  the edge." above the ghost, what is in the way outlined; a refused click says the same words (W14).
- **A part beside the robot.** "This motor isn't on Speedy yet." with **Put it on Speedy** (to a free side spot facing
  out, across from its motor first); a seat or a light: "This seat isn't on Buggy yet." with **Put it on top** (the robot's
  very top: the seat can be ridden) (W19, W20); a sensor on the plate. Its panel says "Not on Speedy" with the same button,
  never "Add a hub" for a robot that has one. "placed unpowered · add a hub" is now "needs a hub. Add a hub to plug it in.".
- **Axle targets only at free motor sockets whose axle lies on the ground**, never at a loose wheel, never at a motor on
  the hub (its wheel could never touch the ground: "Too high. Its wheel can't touch the ground." near it instead).

## Decisions

- **Wheels do not start a robot.** The contract says a robot starts with a device; a wheel is not one. The line and the
  one-tap fix guide the child instead: the fix adds a motor, the motor starts the robot (its card opens) and the steps
  follow (W04). A wheel with no plate near says "Put a plate down" first.
- **Loose wheels stay in the build when driving** rather than riding along as static bricks: carried along, they would look
  attached. The ready line says so before Drive is pressed.
- **No axle snap through a loose wheel, ever.** An axle through a wheel with no motor turns nothing, so that target would
  look connected and not be; the wheel's own fix builds the whole chain in one tap. The wheel-hole target is gone (updated
  `snap.test.ts`, `snapProximity.test.ts`). Likewise no axle target at a motor whose axle would hang in the air (a motor on
  the hub): the two "motor on a hub (the Codex QA case)" tests in `roboticsStore.test.ts` now check that there is no snap
  there and the hint says why, and the hub-naming refusal is checked with a motor on the plate facing into the hub. The
  mechanism still reads an axle put there by hand as in the socket; only the offer changed.
  (`src/robotics/codex-qa-20260922.test.ts` is unchanged and passes.)
- **Motor names by the side of the plate, not stored.** Writing the default name into the section when a motor joins would
  freeze a name that becomes wrong when the motor moves ("Left motor" on the right side) and add a document edit for every
  motor. Naming by where it stands never changes on Rotate (Sam's case) and stays true after a move; a student's own name
  (section `devices`) still wins. Off a plate, the old facing-based name is kept.
- **Motors on the long sides only.** In this parts set a motor's only job is turning an axle, and a wheel at the front or
  back of a car rolls sideways, so the snapper never offers other spots; a motor put there anyway gets a one-tap fix.
- **Fixes run through the studio's own actions** (choose / place / move), so assisted wiring plugs a new motor in and a
  first motor opens the card exactly as a placement does; the steps are folded with `mergeHistory` into one Undo. Advice
  lines are muted while a fix runs and the fix's own line ("The wheel can spin now!", green, with Undo) replaces them.
- **The motor-ghost guard is touch-only.** With a mouse the ghost follows the pointer, which never lands on the hub; moving
  a mouse user's ghost (and turn) under them broke aiming in `robotics-kid-snap.mjs`.

## Numbers

| Build | Placements | One-tap fixes | Looked connected but was not | Result |
|---|---|---|---|---|
| A. Leo's car, 1366 × 768 | 9 (plate, 4 wheels, hub, 3 leftover wheels) | 4 | **0** | drove **14.0 studs** in 2.5 s; 4 of 4 wheels spin |
| B. No room, 4 × 6 plate | 4 | 1 refused (why + outline) | **0** | nothing moved |
| C. Sam, 1366 × 768 | 4 | 1 (Turn it) | **0** | never on the hub; faces out; name kept through 3 Rotates |
| D. Sam by touch, 1024 × 768 | kit + 2 | 1 | **0** | Place alone puts the motor on a side |
| E. Ava, 1366 × 768 | 3 | 3 | – | seat on top (a seat of the robot), light on top, sensor on the plate |

"Looked connected but was not" is counted after every placement and fix: a wheel that does not spin by the model (on an
axle whose other end is in a motor) without its red mark or gap marker, or a green snapped ghost whose part did not
connect. Leo's path now takes about 18 clicks from an empty world to a four-wheel car driving (robots choice, plate tile,
plate, wheel tile, 4 wheels, Add a motor for it, Keep building, Fix wheel 1 × 3, the hub step and its click, Drive), against
his 90 actions with 26 stuck.

## Shots

| Shot | What it shows |
|---|---|
| W01 | Robot parts open with "Robot plate" |
| W02 | A wheel on the plate's corner: the line with Add a motor for it, the red can't-spin mark, the line beside it |
| W03 | Four corner wheels, each marked with its red ring and "!" |
| W04 | After one tap: a motor, an axle, the wheel on it (green line with Undo); "You started a robot!" |
| W05 | Speedy's panel: "1 wheel spins. 3 wheels aren't on an axle." Fix wheel 1–3, numbered like the badges |
| W06 | All four fixed: a four-wheel car, every wheel on an axle in a motor |
| W07 | Ready to drive with three leftover wheels: Drive on, "They stay here when you drive." |
| W08 | Parts: "4 wheels, 4 axles · 3 loose wheels", each loose wheel with Fix / Take it off |
| W09 | Driving on the test plate (the leftovers are not part of it) |
| W10 | Leo's 4 × 6 plate: the other side red, the motor in the way outlined, "No room for a motor here. Try a bigger plate." |
| W11 | A wheel's fix with no room: the same words, the motor in the way outlined, a red motor where it would go |
| W12 | A motor aimed at the hub goes to the left side, green, facing out |
| W13 | "Put a motor on the other side.": the ghost armed across from the first, green target |
| W14 | Both sides full: red ghost, "No room on the plate. Try a bigger plate.", the hub outlined |
| W15 | A motor turned the wrong way: "Turn Left motor around." with a green arrow |
| W16 | Touch: Make it move puts the motor's ghost on a side of the Robot base, not the hub |
| W17 | Touch at 1024: a wheel's line with its button under the words (44 px) |
| W18 | Touch: one tap, the wheel spins |
| W19 | Ava: "This seat isn't on Buggy yet." with Put it on top |
| W20 | The seat on top; "Add a seat" ticks |

## Harnesses (all against the same server; outputs of the others went to a scratch folder)

| Harness | Result | Expectations changed on purpose |
|---|---|---|
| `robotics-kid-wheels.mjs` (new) | **97/97** | — |
| `robotics-kid-snap.mjs` | 96/96 | the not-attached lines ("This motor isn't on Buggy yet." + its fix; no room says so) |
| `robotics-kid-guide.mjs` | 116/116 | Make it move arms the motor at the back of the left side (28,1,31 r2) instead of unplaced r0 |
| `robotics-kid-kits.mjs` | 38/38 | — |
| `robotics-spike-cp1.mjs` | 49/49 | the picked wheel's line ("This wheel isn't on the axle yet." + "Put it on Left motor's axle") |
| `robotics-spike-cp1-pointer.mjs` | 78/78 | same as cp1 (one earlier run failed once placing the gate's hinge motor a stud off; see below) |
| `robotics-kid-drive.mjs` | 71/71 | — |
| `robotics-cp2-wiring.mjs` | 53/53 | the manual-wiring line ("Light isn't plugged in yet. Pick it to plug it in.") |
| `robotics-cp2-failures.mjs` | 70/70 | the picked wheel's line |

Unit tests: new `src/robotics/model/fixPlans.test.ts` and `src/robotics/guide/fixes.test.ts` (36 tests), new cases in
`RoboticsPanel.test.tsx`, `nextSteps.test.ts`, `snapProximity.test.ts`, `connectionAdvice.test.ts`; tests that pinned the old
wording or behaviour updated. Full `npx vitest run`: 170 files / 1930 tests green (168 / 1885 at `9f24b4d`);
`npx tsc --noEmit -p tsconfig.app.json` and the brick-core typecheck clean; `src/robotics/codex-qa-20260922.test.ts`
unchanged and passing.

## Not done, and notes

- **General studio moves still keep a part's height.** Dragging a selected brick (`BrickStudioScene.tsx`, the pointer-move
  `selectedDrag` branch: `state.setDraftPosition(x, direct.anchor.y, z)` when the robotics snapper does not answer), the
  arrow keys (`store.ts` `nudge`: `y: Math.max(0, target.y + dy)`) and the height handle leave a part at its old height, so a
  motor dragged off the hub stays 7 plates up. A motor dragged near a robot snaps onto its plate (so it lands); anywhere
  else the studio's rule applies. Every pose this lane's fixes use stands on what is under it. General moves are the
  studio-moves lane's.
- **Desktop, drawer-armed motor with the camera on the hub:** until the mouse moves over the canvas its ghost starts where
  the studio arms any part (on the hub); pressing Place or Enter without moving the mouse would put it there (the step
  then says "Move … to the side of the plate." with a one-tap fix). Touch has the guard.
- **The seat idea row** ("Add a seat. Ride it in Explore.") is lane P's; this lane only covers a seat left beside the robot.
- `robotics-spike-cp1-pointer.mjs` failed once in seven runs placing the gate's hinge motor a stud off (21,2,22 for
  21,2,21); the hinge motor is not touched by this lane's snapping; the other six runs passed 78/78.
