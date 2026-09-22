# Robot Workshop v2 — design contract

Status: agreed direction, 2026-09-21. Mock: https://claude.ai/artifact/CbqvHx8SHnaTRRZEFyyAKG (boards 1, 1b, 2, 3).
Supersedes the separate "Robots" mode on `codex/robotics-workshop`; the engine under `src/robotics/**` on that branch
(assembly compiler, hinge compiler, Blockly catalog, runtime and arbiter, raycast drivetrain, local persistence, Explore
ride) is the intended implementation and is ported onto current `main`, not merged.

This document is what the prototype is checked against. Anything not stated here is open; anything stated here changes
only by editing this file.

## 1. Principles

1. **Robotics is ordinary building with new bricks.** Motors, wheels, sensors, lights, hinge motors, turbo pods, seats and
   buttons live in the brick drawer under a *Robotics* category and are placed, moved, rotated and deleted like any brick.
   There is no Robots entrance, sheet or mode.
2. **All programming is blocks.** No text mode. Blockly, one editable source per program, a derived bounded IR at run time.
3. **Inputs are things a program reads.** Keyboard, on-screen joystick and buttons are blocks (`when joystick moves`,
   `joystick up amount`, `when key up pressed`). There is no built-in "drive yourself" that bypasses the program. A beginner
   block `drive using joystick` exists and is replaceable by individual motor blocks.
4. **Explore is the payoff.** A creation with a seat can be ridden in Explore; its program reads the rider's keys or
   joystick. Explore never runs anything the student did not program.
5. **Free build first.** Starters are ordinary worlds that arrive with a creation, a half-finished program and a goal.
   They appear on Worlds under *Robotics starters*; the primary action beside them is *Free build with motors*.

## 2. Creations: what is one machine (board 1b)

- A **creation** is the set of bricks that move together. Membership is **stud connectivity**: bricks joined by studs,
  transitively, from the placed part. Touching without a stud joint is not membership.
- Placing the **first powered part** (motor, hinge motor, turbo pod) on a group that is not yet a creation opens the
  *creation card*: the proposed members are highlighted in the world, the card shows the count, the parts found and a
  name field, and offers **Code this creation** / **Not now**. Membership is adjusted by tapping bricks in or out while the
  card is open. Confirming names the creation; declining leaves the bricks as plain bricks and the part inert.
- Adding a part to an existing creation never reopens the card; the parts strip in Code updates.
- A **hinge motor** splits one creation into a **base** and an **arm**: the arm is the stud-connected set on the hinge's
  moving face. The card shows both (blue base, coral arm). A creation may contain several hinges; each arm is one body.
- Copy: the card says what is joined and what the part can do (*"7 bricks move together"*, *"Wheels on both motors, so
  it can roll"*). It never claims the creation can drive, run or work.
- **Two creations touching** stay two creations. Merging is an explicit act: place a brick that stud-joins them, and the
  card reopens for the union with the larger creation's name proposed.
- Deleting the last powered part turns a creation back into plain bricks after confirmation; its programs are kept on the
  world record for 30 days so an undo or re-add restores them.
- The world header (Scene / Character / Invite) is unchanged. A world's creations are listed in Code, not in the header.

## 3. Code view (board 2)

- Layout: category rail (colors fixed per category), block palette (collapsible), scripts, and the **stage** on the right.
- **First run** of any program: one script, one goal line, palette collapsed, controller blocks out of sight unless the
  starter is a controller starter. The rail stays visible.
- Controls are labeled words with icons: **Run**, **Stop**, **Reset**. No unlabeled flag or stop sign.
- Every script starts from a hat: `when run`, `when <sensor> sees something`, `when <button> pressed`,
  `when joystick moves`, `when key <k> pressed`, `when controls update` (advanced).
- Block vocabulary uses studs, degrees, seconds and percent. Never X/Y/Z. Distance unit default **studs**
  (open decision; cm is the alternative).
- Beginner motion: `drive <direction> at <n> %`, `turn <direction> at <n> %`, `stop motors`, `drive using joystick`.
  Advanced: `set <motor> to <n> %`. Both ship in one toolbox, helper first.

## 4. The stage: test plate and my world

The stage is a **preview** of the creation running its program. Two places to run, one creation, one code:

1. **Same creation, same code in both.** Switching Test plate ↔ My world never edits the program or the creation.
2. **Testing never removes or relocates the authored creation.** The world's bricks are untouched by anything that
   happens on the stage. Positions in the world after a run are exactly what they were before.
3. **Reset restores the authored starting state**: the creation's pose as built, program stopped, sensors idle.
4. **Test props belong to the testing space.** The wall, pad or gate post a starter supplies exist on the test plate only
   and are never pasted into the world. (This retires the pasted-props defect on the old branch.)
5. **World-dependent creations test in context.** A gate, a signal post or a sensor room defaults to *My world*, where
   the run plays inside the world with the same guarantees (2) and (3). A rover defaults to *Test plate*. The default is
   per creation kind and can be flipped.

Explore is not a test: in Explore the creation runs for real and its motion persists until the student rebuilds.

## 5. Running: one rule for competing scripts

- Each tick, at most **one command per actuator**. Autonomous scripts run first; the controller script
  (`when joystick moves` / `when controls update`) is evaluated **last** and wins for the actuators it writes that tick.
- A `stop motors` from an autonomous script therefore holds only until the controller writes again. This is the rule the
  runtime already implements; it is **not** presented to beginners.
- Starters keep autonomous driving and controller driving as **separate example programs**. Combining them is a later
  lesson ("Who's driving?"), where the rule above is taught explicitly.
- Sensors are sampled once per tick, before scripts run; readings shown on the stage are the same values the blocks read.

## 6. Inputs

- Joystick: an on-screen control shown on the stage (and in Explore on touch devices) exposing `up`, `right` in -1..1 and
  a button. Keyboard maps to the same values (arrows/WASD, space). A program never knows which one is present.
- The stage has an **Input** switch, Joystick / Keys, for testing without a keyboard. It changes the visible control only.

## 7. Persistence and sharing

- Creations and programs are part of the world document (a versioned `robotics` section), so they autosave, share,
  duplicate and checkpoint with the world. No separate namespace, no separate storage key.
- Live rooms: pass 1 runs programs **locally per client** from the shared document; motion is not synchronized between
  builders. Running a creation in a shared room shows a "runs on your screen only" note. Synchronized running is a
  later gate.
- Storage keys, tables, RPCs and the live protocol are unchanged by this work.

## 8. Prototype spike — acceptance

Built on current `main` behind a robotics flag, with the `src/robotics` engine ported from `codex/robotics-workshop`.

**Buggy flow (must pass, real Chrome, 1366×768 and iPad):**
1. Place two motors, two wheels and a distance sensor on a plate from the Robotics category.
2. The creation card appears on the first motor; confirm and name it.
3. Code opens on the test plate with the creation and a wall; the first-run state shows one script and one goal.
4. Run: the buggy drives and stops before the wall; readings match the blocks. Stop, Reset restore the start pose.
5. Switch Input to Joystick, open the controller starter, Run, drive with the on-screen stick.
6. Back to build: the world is byte-identical to before Code was opened (document diff empty).
7. Explore: walk to the buggy, ride it, drive with keys, hop off.

**Gate flow (must pass):**
1. Build a frame, place a hinge motor and a door brick on its moving face; the card shows base and arm.
2. Code defaults to My world; `when front sensor sees something → move hinge to 90°` runs in place.
3. Reset returns the door to closed; the world document is unchanged after the run.

**Non-goals for the spike:** turbo pod, missions/verdicts, Chromebook performance numbers, synchronized live running.

## 9. Open decisions (defaults if unanswered)

| Decision | Default |
|---|---|
| Distance unit | studs |
| Robotics in shared/live worlds in pass 1 | allowed, runs locally per client with a note |
| Beginner blocks | helper first, raw motor blocks in the same toolbox |
| Where starters live | Worlds → Robotics starters |
