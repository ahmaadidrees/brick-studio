# Robot Workshop spike — plan for checkpoints 2 to 4

Lead: Claude (Opus 5.5), 2026-09-23. Contract: `docs/robotics/CONTRACT.md` v2.2. Integration branch
`claude/robotics-spike` in `~/.codex/worktrees/robotics-lanes/A`, behind `VITE_ROBOTICS_PROTOTYPE=1`.
Checkpoint 1 and its repair are done (`7e1b759`). Nothing merges to `main` or deploys; the owner decides that.

Shared contracts seeded by the lead: `src/robotics/program/types.ts` (programs, IR, diagnostics) and
`src/robotics/run/types.ts` (tick snapshot, intents, runtime and controller interfaces). **Additive changes only**
(a new optional field, a new union member the other side can ignore). Anything else: say so in your report.

## 1. Decisions the lead took

These were open; they are now settled for the spike.

| Question | Decision |
|---|---|
| Editing the construction while a run is live | The run stops and is discarded (as now). The construction is the truth. |
| Loose bricks near a rover | Static scenery in My world; absent on the test plate. Stud-attached bricks are part of the body. |
| A deleted device's cable | Kept, so Undo of the delete restores the connection. It frees its port: a new device may take that port, which drops the stale cable. The port reads "free (was Left motor)". |
| Editing a program while it runs | The run keeps the revision it compiled. The edit saves. The stage says "Changed · press Run to use it". |
| Do program edits enter the studio's Undo | No. Blockly has its own undo. Studio Undo/Redo of construction or cables must never revert code: a history merge hook keeps the current `programs` when a document-level entry is restored. |
| Stop vs Reset | Stop: program ends, every actuator brakes, pose stays. Reset: back to the built pose, program stopped, sensors idle. Run: fresh program from the current pose. |
| Leaving Code, switching Test plate / My world | Resets the run. |
| A script ends | Its motors keep their last command (like a LEGO hub). `stop motors` or Stop brakes them. |
| Two autonomous scripts writing one motor in a tick | Later script in order wins; one info note on the block. A controller script writes last and wins. |
| `sees something` | A hit closer than 5 studs (`SEES_SOMETHING_STUDS`). Distance reads 40 studs when nothing is in range. |
| Starters | Program starters inside Code (by creation kind, plus "Joystick drive" for any creation with a drive pair). The Worlds starter gallery is later. |
| Live rooms | Code and Run are unavailable in a live room with one line explaining why (contract §8). |
| Device identity | The brick id. Names and ports are labels. Blocks keep the id; the last known name is kept per program. |

## 2. Checkpoints

**Checkpoint 2 — wiring and blocks.** The three journeys run from blocks, and the five failures are built and
diagnosed from what the app shows.
- Rover: Code opens on the test plate in the first-run state with the "Stop before the wall" starter. Run: it drives
  and stops before the wall; the readings are the values the blocks read. Move the left motor's cable to port C in Build:
  the block label updates and the rover still runs. Reset restores the pose. Open the "Joystick drive" program, Run,
  drive with the on-screen joystick and the arrow keys. Back to Build: construction unchanged, programs saved.
- Gate: Code defaults to My world with `when front sensor sees something → turn arm motor to 90°`. "Someone walks up"
  sends the visitor into the beam; the door swings about the hinge and nothing else. Reset returns it to zero.
- Signal post: `when front sensor sees something → set light to red` in My world.
- Five failures: wheel off (done), one motor backwards with raw motor blocks (turns; drive pair shows it reversed; speed
  readings show opposite signs), sensor sideways (beam drawn; card says which way it faces; the wall is never seen), arm
  built into the frame (contact highlighted; position reading stuck), unplugged motor (shown unplugged in Build; its
  blocks say "Not plugged in").
- Each flow: save, reload, reopen with everything intact; edit a program while it runs.

**Checkpoint 3 — preservation and usability.** Real pointer placement and wiring at 1366×768 and 1024×768; touch on
iPadOS Safari in the iOS Simulator (real WebKit and touch, not desktop emulation; a physical iPad remains unverified
unless tested); the union card (a brick joining two creations reopens the card for both); layout so the drawer, panel and
Code view leave a usable stage at 1024×768.

**Checkpoint 4 — Explore.** Ride a creation with a seat, drive with keys, hop off; leaving Explore leaves the
construction unchanged.

## 3. Programs in the document

- `RoboticsSection.programs: RoboticsProgram[]` (see `program/types.ts`), additive to section v1, read defensively
  like the rest (a malformed program is dropped alone; limits in `PROGRAM_LIMITS`). `RoboticsCreation.activeProgramId?`.
- Blockly workspace JSON is the source of truth; the compiler turns it into `ProgramIR` at Run. Nothing compiled is stored.
- Program writes use `setRoboticsSection(…, label, { history: false })` (new option; default unchanged) and are debounced
  by the Code view (~400 ms). A merge hook registered by the robotics layer (`registerRoboticsHistoryMerge`) makes studio
  Undo/Redo keep the current `programs` while restoring everything else in the section.
- Deleting a creation (from its card, later) deletes its programs. Removing hardware never deletes a program.

## 4. Running

- `createRunController({ rapier, bricks, partMap, plateSize, creation, space, props, fixedStep })` owns one mechanics world.
  Test plate: every brick outside the creation is left out and the props are added; the studio hides all bricks and the
  stage draws the creation and the props. My world: other bricks are static scenery; the studio hides only the creation.
- Props: rover starters get a wall 12 studs ahead of the creation's front (the drive pair's forward), wide enough to meet.
  Gate and signal post get a visitor that walks up to 3 studs in front of the first sensor and back.
- Sensors: a ray from the sensor face along its facing, in the moving body's pose, ignoring the creation's own colliders.
- Motors: power mode (velocity) or target mode (position, degrees) on the same joint; readings in percent and degrees.
  Hinge motors: `turnMotorTo` sets the arm target through the existing hinge law.
- Lights and buttons live in the controller; the stage draws a light's colour and lets a click press a button part.
- The stage scene (`scene/StageLayer.tsx`) draws the creation at the controller's poses, the props, the sensor beams, lit
  lights and the arm-contact highlight. The Code view mounts it; the build Nudge stays as the dev tool it is.

## 5. Blocks (contract §6; the mock's Code board is the look)

Categories and colours: Events `#E0A030`, Motion `#3565BF`, Sensing `#5888DA`, Input `#8A5CF6`, Light `#F17861`,
Control `#E0A030`, Logic `#3FA36B`, Math `#2FA3A0`, Variables `#E36A9A`.

- Events: `when run`, `when [sensor] sees something`, `when [button] pressed`, `when key [up] pressed`; Input:
  `when joystick moves`, `when controls update` (advanced, off the first-run palette).
- Motion: `drive [forward|backward] at (40) %`, `turn [left|right] at (40) % for (1) s`, `drive using joystick`,
  `stop motors`, `run [motor] at (50) %`, `turn [motor] to (90) °`, `stop [motor]`.
- Sensing: `[sensor] distance (studs)`, `[sensor] sees something closer than (3) studs`, `[motor] position (°)`,
  `[motor] speed (%)`, `[button] pressed?`, `timer (s)`.
- Input: `joystick [up|right] amount`, `key [up] held?`.
- Light: `set [light] to [red…]`, `turn [light] off`.
- Control: `wait (1) s`, `wait until <>`, `repeat (10)`, `forever`, `if <> then`, `if <> then else`, `stop this script`.
- Logic, Math, Variables: comparisons, and/or/not, + − × ÷, min/max; one-level variables (`set`, `change`, reporter).
- Device dropdown values are brick ids. Labels are `name · port` (`Left motor · A`), `Left motor · not plugged in`, or
  `front sensor (missing)` from `deviceNames`. A dropdown never silently changes its value when the device is gone.
- Helpers use the configured drive pair and say "Choose two drive motors first" without one.
- Starters (workspace JSON in `program/starters.ts`): `stop-before-wall` (rover), `joystick-drive` (any drive pair),
  `smart-gate` (hinge + sensor), `signal-post` (sensor + light), `blank` (one `when run`). Each has a goal line.

## 6. Wiring (contract §5, the mock's Wiring board)

- Actions: unplug, plug into a port, move to another port, swap two devices' ports, rename a device, set the project's
  wiring mode (assisted / manual). All are ordinary undoable edits of the section.
- Build shows cables from hub port to device (drawn, auto-routed, never positioned), highlights both ends of a selected
  device or port, marks an unplugged device, and a device inspector in the panel: name field, plugged-in state, port chips
  (free / used / this one), the current reading when a run exists, the matching block with "Not plugged in", and the
  buttons Unplug / Plug into port … / Move to port … / Swap with ….

## 7. Code view

Layout from the mock's Code board, inside the build shell, over the canvas's left part so the 3D canvas on the right is
the stage (one WebGL context): header (Back to build, creation name, program tabs with +, Test plate / My world), category
rail, palette (collapsed on first run), scripts area, stage panel (Run, Stop, status with time, Reset, readings,
Joystick / Keys, "Someone walks up" when there is a visitor, goal line). Blocks show diagnostics inline and the active
block glows while it runs. The framing helper counts the Code view as a left inset.

## 8. Lanes

Each lane has its own worktree under `~/.codex/worktrees/robotics-lanes/`, a branch off `7e1b759`+plan, and a dev port.

| Lane | Branch | Port | Owns |
|---|---|---|---|
| P · programs and runtime | `claude/robotics-cp2-program` | 5241 | `src/robotics/program/**` (not `types.ts`), `src/robotics/runtime/**`, section `programs` codec in `model/section.ts`, the history option and merge hook in `src/brick/store.ts` |
| M · mechanics and run | `claude/robotics-cp2-run` | 5242 | `src/robotics/sim/**`, `src/robotics/run/**` (not `types.ts`), `src/robotics/scene/StageLayer.tsx` |
| W · wiring in Build | `claude/robotics-cp2-wiring` | 5243 | `src/robotics/wiring/**`, cable drawing, the device inspector, wiring-mode toggle, `model/control.ts` |
| U · Code view (phase 2) | `claude/robotics-cp2-code` | 5244 | `src/robotics/code/**` |
| T · touch and tablet (phase 2) | `claude/robotics-cp3-touch` | 5245 | layout CSS, touch paths, iOS Simulator evidence |
| E · Explore riding (phase 3) | `claude/robotics-cp4-explore` | 5246 | Explore integration |

Shared files (`roboticsStore.ts`, `RoboticsPanel.tsx`, `RoboticsBuildLayer.tsx`, `robotics.css`): touch them only to
mount your own component or add your own action, in as few lines as possible. The lead resolves the merges.

## 9. Rules for every lane

- Node: `PATH=/opt/homebrew/opt/node@22/bin:$PATH`. Never `npm run check` (its build bakes production URLs); run
  `npx vitest run`, `npx tsc --noEmit -p tsconfig.app.json` (not `tsconfig.json`: it has `files: []` and only
  references other configs, so it checks nothing), `npx tsc -p packages/brick-core/tsconfig.json` and
  `npx vite build --mode robotics --outDir <scratch>` separately.
- Dev server: `npx vite --mode robotics --port <your port> --strictPort --host 127.0.0.1` from your worktree. Evidence
  comes from real Chrome via Playwright (`scripts/qa/lib/env.mjs`), never from an embedded pane, which throttles clocks.
- Keep `src/robotics/codex-qa-20260922.test.ts` unchanged and passing. Keep every existing test passing.
- Commit on your branch with a clear message ending in the Co-Authored-By line you were given. No push, no PR, no merge,
  no deploy, no edits outside your worktree.
- Report: final SHA, what you built, test counts, evidence paths, anything you could not do and why, and any change you
  needed in a shared contract or shared file.
