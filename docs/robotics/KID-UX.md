# Robot building a third grader can do — kid-UX pass

Lead: Claude (Opus 5.5), 2026-09-23. Builds on `claude/robotics-spike` (checkpoints 1–4 done, `5d9f2ae`). Goal from the
owner: *a 3rd grader can build something that drives and customize it as much as they like*. The owner's first try found
it hard: the lead reproduced why (a motor next to a hub was a second creation asking for a hub; an axle that looked like
it was in the socket was not; snapping only worked when hovering exactly over the target part; the panel was a wall of
text with developer controls).

## Principles

1. **Nothing that looks connected is unconnected.** Connections snap, or the gap is shown and named.
2. **Always show the next step.** The creation tells the student what to add next and arms that part in one tap.
3. **Start from something that works.** Kits drop a ready robot; students change it, break it and fix it.
4. **Driving is one button away.** No code needed to drive; Code is there for when they are ready.
5. **Few words, big targets.** Sentences of about eight words a third grader can read; a verb first on every button;
   icons with labels; 44 px targets everywhere, 15 px text or larger in robotics UI on touch, 14 px on desktop.

## Copy guide

Use: robot, plate, hub ("the robot's brain"), motor, axle, wheel, sensor ("its eyes"), light, seat, arm, drive, try it,
plug in, stack. Avoid in student-facing text: creation (say "robot" in guidance; the name is the student's), assembly,
mechanism, body, anchored, test space, assisted/manual wiring, nudge, drive pair, reversed (say "facing the other way"),
port letters unless in the wiring inspector. Tell, don't blame: "Put a wheel on the axle", not "Wheel missing".

## The pieces (one lane each; files each lane owns in brackets)

### K · Kits and the drawer [`src/robotics/kits/**`, a one-line mount in the drawer]
- The Robotics category is easy to reach: a visible "Robots" choice, not only inside the category dropdown.
- At the top of it, **Start with a kit**: *Buggy* (drives), *Gate* (swings open), *Signal light* (lights up),
  *Robot base* (a plate and a hub to build your own). Each kit card has a picture, a name and three words.
- Choosing a kit gives a ghost of the whole kit that follows the pointer (or the tap) and places with one click or the
  Place button, like any brick. Placed, it is already a named robot ("Buggy", "Buggy 2"…), every device plugged into the
  hub, and the panel shows it ready. One Undo removes the whole kit.
- Kit layouts come from `src/robotics/model/fixtures.ts` (rover, gate, signal post), re-positioned where it is placed.

### S · Magnetic connections [`src/robotics/model/snap.ts`, `scene/draftSnap.ts`, a new target-marker scene component, the
snap hook in `BrickStudioScene.tsx`]
- While an axle, a wheel or a motor is armed, every place it can connect glows (free motor sockets, free wheel holes,
  free axle ends, plate edges for a motor). The glow is visible from the default camera and on touch.
- **Proximity snap**: the ghost snaps when the pointer is near where the part would sit (about 1.5 studs), not only when
  it is exactly over the target part. A snapped ghost looks different (a green outline) from a free one.
- **Motors orient themselves**: a motor hovered over a plate near one of its edges turns so its socket faces out over
  that edge and sits flush with it. R still works away from an edge.
- **Motors on the bare baseplate**: a motor can only take an axle and a wheel when it stands on a plate (its socket is
  otherwise one plate too low for a wheel on the ground). Near a robot's plate, a motor snaps onto that plate; placed on
  bare ground anyway, the motor says "Put motors on a plate so wheels reach the ground" where the student is looking.
- **Not attached**: a device placed on the ground next to a robot but not on it says, in one line, which robot it is not
  part of and how to attach it ("Put it on Buggy's plate").
- A near miss never looks right: if an axle or a wheel is placed next to a connector without connecting, a red gap marker
  shows on it until it is fixed.

### G · Next steps and a simpler panel [`src/robotics/guide/**`, `ui/RoboticsPanel.tsx`, `ui/robotics.css`]
- `nextSteps(creation, model)` (pure): the ordered list of what this robot needs, from the same model the card uses. Each
  step has a one-line instruction and an action (arm a part; plug a device in; open Drive). Rover path: hub → a motor on
  each side → an axle in each motor → a wheel on each axle → plugged in → **Ready to drive!** Then optional ideas: a
  sensor at the front, a light, a seat to ride it, "Stack bricks on top. They ride along." Gate and signal light have their
  own paths. `drive/readiness.ts` (seeded) gives the one-line reason; keep the two consistent.
- The creation card becomes short: "You started a robot!" + a name field with a good default + one big button; the
  explanation paragraph moves behind a small "?".
- The panel: the robot's name, a big **Drive** (or **Try it**) button when ready and **Code**; then **Next steps**; then
  **Parts** (collapsed by default, expandable); the device inspector when a device is selected. "Runs on", "Wiring
  assisted/manual" and the motor test buttons move into a collapsed **More** section at the bottom (still reachable, and
  the existing harnesses updated to open it).
- Text and targets per the principles. Update every harness under `scripts/qa/` whose selectors your changes break, and
  keep them passing.

### D · Drive and Try it [`src/robotics/drive/**` except `readiness.ts`, the view's mount next to the Code view's]
- **Drive** (a robot with wheels) opens a Drive view: the stage full width, Back to build, the robot's name, Test plate /
  My world, Reset, a big joystick (bottom right) and the arrow keys / WASD, a small speed readout, and a line "Drag the
  joystick or use the arrow keys". It runs the robot's own joystick program if it has one, else a Joystick drive program
  made on the fly and not saved (reuse `chooseRideProgram` from `explore/rideModel.ts`; move it somewhere shared if
  needed). The test plate has something fun to drive around (a few walls or cones as test props).
- **Try it** (a gate or a signal light) runs its starter (or its own saved program) in My world and shows a big "Someone
  walks up" button.
- Opening is `useDriveView.openDrive(id)` (seeded in `drive/driveViewState.ts`); the panel's button is lane G's.

## Acceptance (checked by novice-tester agents that see only screenshots and use only mouse, keyboard or touch)

1. **Kit to driving**: from an empty world, a Buggy kit placed and driven with the joystick in six clicks or taps.
2. **From parts**: a car that drives, built from separate parts using only the next steps and snapping, with no placement
   that looks connected but is not.
3. **Make it mine**: stack at least five bricks on it, recolor it, add a light; it still drives. Add a seat; ride it in
   Explore.
4. **Gate and signal light kits**: Try it; someone walks up; the door opens / the light turns red.
5. **iPad**: journeys 1 and 2 by touch in iPadOS Safari on the simulator.

Everything stays behind `VITE_ROBOTICS_PROTOTYPE=1`; no push, no merge to `main`, no deploy.
