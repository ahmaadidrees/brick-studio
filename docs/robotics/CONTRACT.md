# Robot Workshop v2 — design contract (v2.1)

Status: agreed direction, revised 2026-09-22 after two rounds of Codex review. Mock:
https://claude.ai/artifact/CbqvHx8SHnaTRRZEFyyAKG (boards 1, 1b, 1c wiring, 2, 3).
Supersedes the separate "Robots" mode on `codex/robotics-workshop`. Pieces of that branch's engine under
`src/robotics/**` (Blockly catalog, runtime and actuator arbiter, local persistence, Explore ride) are expected to carry
over; the assembly compiler and drivetrain are **not** assumed to survive (section 10).

This document is what the prototype is checked against. Anything not stated here is open; anything stated here changes
only by editing this file.

## 0. The standard

**A student can explain the chain from their code, through the hub and the motor, to the part that moves, and can point
to where that chain is broken.** Every screen, block and message in this design exists to make that chain visible.
Section 9 turns it into acceptance tests.

## 1. Principles

1. **Robotics is ordinary building with new bricks.** Hub, motors, axles, wheels, sensors, lights, hinges, seats and
   buttons live in the brick drawer under a *Robotics* category and are placed, moved, rotated and deleted like any brick.
   There is no Robots entrance, sheet or mode.
2. **How it is built and connected determines what it can do.** Nothing moves by selection, grouping or naming. A motor
   with nothing on its axle spins its output and moves nothing else.
3. **All programming is blocks.** No text mode. Blockly, one editable source per program, a derived bounded IR at run time.
4. **Inputs are things a program reads.** Keyboard, on-screen joystick and buttons are blocks. There is no built-in
   "drive yourself" that bypasses the program. A beginner block `drive using joystick` exists and is replaceable by
   individual motor blocks.
5. **Explore is the payoff.** A creation with a seat can be ridden in Explore; its program reads the rider's keys or
   joystick. Explore never runs anything the student did not program.
6. **Free build first.** Starters are ordinary worlds that arrive with a creation, a half-finished program and a goal.
   They appear on Worlds under *Robotics starters*; the primary action beside them is *Free build with motors*.
7. **Virtual conveniences are visible and reversible.** Assisted wiring, snap-to-axle and auto-routed cables save fiddling;
   none of them hides a connection or changes one the student made.

## 2. The three relationships

The model keeps three questions apart. The UI asks them in plain words and never mixes them.

| Relationship | Question a student asks | What it is |
|---|---|---|
| **Assembly** | Is it attached? | Structural joints: studs and pins. Bricks joined this way move as one rigid body. |
| **Mechanism** | Can it move? | Motor output → axle; axle → wheel; hinge between a base body and an arm body. A mechanism relates two bodies. |
| **Control** | Is it plugged in? | A device (motor, sensor, light, button) connected by a cable to a port on a hub. |

- A **creation** is a *name* over a set of bodies that a student chose to treat as one thing (a buggy, a gate, a crane).
  It organizes and labels; it never attaches, moves or wires anything. Membership follows assembly and mechanism links
  from the parts the student named; a body reachable only through a cable is **not** part of the creation.
- A hub may control a motor on a different mechanism than the one it sits on (a base hub driving a pivoting arm). That
  is normal and the model must represent it.

## 3. Parts (first milestone set)

Hub (4 ports A–D), motor (output axle on one face), axle (short/long), wheel (fits an axle), distance sensor, light,
button, hinge (a pin joint with a defined swing axis), seat. Studs and pins are properties of every brick.
**Out of the first milestone:** gears, transmissions, turbo pods and other power-ups, second hub.

Attachment rules the placement system enforces and shows:
- A wheel snaps onto a free axle end; elsewhere it is a decorative brick and the card says so.
- A motor's output face accepts one axle; a wheel on that axle turns with the motor.
- A hinge connects exactly two bodies; the arm is whatever is stud-attached on its moving face.
- Cables connect one device to one port. A port holds one cable.

## 4. Creations and the creation card (board 1b)

- Placing the **first powered part** (motor or hinge with a motor) on bricks that are not yet a creation opens the
  *creation card*: bodies found are highlighted (assembly in blue, a moving arm in coral), the card lists parts found,
  offers a name and **Code this creation** / **Not now**.
- The card **reports** structure; it does not edit it. There is no "tap a brick to add it". To include a brick, attach it.
- Copy states what is attached and what a part can do (*"7 bricks attached · 2 wheels on motors, so it can roll"*). It
  never claims the creation can drive or work.
- Two creations touching stay two creations. Attaching them with a brick reopens the card for the union.
- Removing the last powered part turns a creation back into plain bricks after confirmation; its programs stay on the
  world record for 30 days.

## 5. Wiring (board 1c)

Per project setting **Wiring: assisted (default) / manual**, shown in the creation card and in Code.

Assisted:
1. Starter builds include a visible hub. Free builds get a hub from the drawer like any part.
2. Placing a device with a hub in the same creation **suggests** a valid connection: the cable is drawn, the port
   highlighted, and a brief line says *"Left motor connected to port A"*.
3. Assisted wiring **only adds**. It never moves, swaps or removes an existing connection.
4. No hub, or all ports used: the device is placed unpowered and the card explains what is needed (*"Add a hub"*,
   *"Port A–D are full. Unplug something or add a hub"*).

Always (assisted or manual):
- Selecting a device or a port highlights the other end, the cable, the device's name and port, its current reading or
  output, and (in Code) the blocks that reference it.
- Students can unplug (drag the cable end off or press Unplug), plug into another port (drag to a port or pick from a
  list), rename a device, and swap two devices' ports.
- Cables route automatically. There is no cable positioning.
- A disconnected device is visibly unplugged in Build, and every block referencing it shows *"Not plugged in"* in Code.

## 6. Code view (board 2)

- Layout: category rail (fixed colors), collapsible block palette, scripts, and the **stage** on the right.
- **First run** of any program: one script, one goal line, palette collapsed, controller blocks out of sight unless the
  starter is a controller starter. The rail stays visible.
- Controls are labeled words with icons: **Run**, **Stop**, **Reset**.
- Every script starts from a hat: `when run`, `when <sensor> sees something`, `when <button> pressed`,
  `when joystick moves`, `when key <k> pressed`, `when controls update` (advanced).
- Blocks name the student's parts (*left motor*, *arm motor*, *front sensor*) and units are studs, degrees, seconds and
  percent. Never X/Y/Z. Distance unit default **studs**.
- Motor blocks are real motor blocks: `run <motor> at <n> %`, `turn <motor> to <n> °`, `<motor> position`,
  `<motor> speed`, `stop <motor>`.
- Helper blocks (`drive <direction> at <n> %`, `turn <direction>`, `drive using joystick`) operate on a **configured
  drive pair**: two motors with wheels, proposed automatically when the shape allows and shown in the creation card
  (*"Drive: left motor + right motor"*). The student can inspect and change the pair. A helper with no drive pair shows
  *"Choose two drive motors first"*.

## 7. The stage: test plate and my world

The stage is a **preview** of the creation running its program. Two places to run, one creation, one code:

1. **Same creation, same code in both.** Switching Test plate ↔ My world never edits the program or the construction.
2. **A run never edits the construction.** Positions, attachments and connections after a run are exactly what they were
   before it. Code edits made in the Code view are saved as usual.
3. **Reset restores the authored starting state**: every body at its built pose, program stopped, sensors idle.
4. **Test props belong to the testing space.** The wall, pad or post a starter supplies exist on the test plate only.
5. **World-dependent creations test in context.** A gate or signal post defaults to *My world*; a rover to *Test plate*.
   The default is per creation kind and can be flipped.

**Explore.** Explore runs programs for real inside the world session but writes nothing to the construction. Leaving
Explore, or pressing Reset in Build, returns every creation to its authored pose. What persists across sessions is the
construction and the programs, never a run's motion.

## 8. Running

- Each tick: sample inputs and sensors → autonomous scripts → the controller script (`when joystick moves` /
  `when controls update`) last → the arbiter keeps at most **one command per actuator**, controller wins for actuators it
  wrote → physics → readings. Readings shown on the stage are the values the blocks read.
- Starters keep autonomous driving and controller driving as **separate example programs**. Combining them is a later
  lesson where the rule above is taught explicitly.
- **Shared rooms are deferred.** In pass 1, Code and Run are unavailable in a live room, with a one-line explanation;
  building with robotics parts still works and the construction syncs like any bricks. Synchronized running is a later
  gate with its own contract.

## 9. Acceptance — prototype spike

Built on current `main` behind a robotics flag. Real Chrome, 1366×768 and iPad. Small parts set of section 3.

**Rover, from loose parts:** place a hub, two motors, two axles, two wheels and a distance sensor on a plate. Confirm and
name the creation. Assisted wiring connects each device with the explanation line. Code opens on the test plate in the
first-run state. Run: the rover drives and stops before the wall; readings match the blocks. Reconnect the left motor to
port C; the block updates, the rover still runs. Reset restores the pose. Open the controller starter, Run, drive with the
on-screen joystick. Back to build: construction unchanged (bricks, poses, attachments, cables identical), programs saved.
Explore: ride it, drive with keys, hop off; leave Explore, construction unchanged.

**Gate, from loose parts:** build a frame, place a hinge and a door on its moving face, a motor on the hinge, a hub and a
distance sensor. The card shows base and arm. Code defaults to My world; `when front sensor sees something → turn arm
motor to 90°` runs in place. Reset returns the door to closed. Construction unchanged after the run.

**The five failures, each built deliberately, each diagnosable from what the app shows:**

| Student does | Student sees | The app makes the cause findable by |
|---|---|---|
| Leaves a wheel off its axle | motor spins, wheel stays still | wheel card says *"Not on an axle"*; motor output visibly turning |
| Mounts one motor backwards | rover turns instead of driving straight | drive pair in the card shows one motor *reversed*; readings show opposite speeds |
| Points the sensor sideways | sensor never sees the wall | sensor beam drawn on the stage; card says which way it faces |
| Builds the arm into the frame | arm stops moving | stage highlights the contact; readings show position stuck |
| Unplugs a motor | code cannot control it | device shown unplugged in Build; its blocks say *"Not plugged in"* |

Each flow includes save, reload and reopen with everything intact.

## 10. Implementation posture

- Port from `codex/robotics-workshop` only what the spike proves useful; the Blockly catalog, runtime, arbiter, local
  persistence and Explore ride are expected to; the assembly compiler and drivetrain are expected **not** to survive as
  designed, because they assume a rover. Whether their code survives is decided by the spike's evidence, not up front.
- Creations, connections and programs live in the world document (a versioned `robotics` section) so they autosave,
  share, duplicate and checkpoint with the world. No separate store.
- Storage keys, tables, RPCs and the live protocol are unchanged by this work.

## 11. Open decisions (defaults if unanswered)

| Decision | Default |
|---|---|
| Distance unit | studs |
| Wiring mode | assisted, per project setting |
| Beginner blocks | helpers on a configured drive pair, plus real motor blocks in the same toolbox |
| Where starters live | Worlds → Robotics starters |
