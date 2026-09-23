# Robot Workshop spike — checkpoints 1 to 4, final evidence

Branch `claude/robotics-spike` (worktree `~/.codex/worktrees/robotics-lanes/A`), behind `VITE_ROBOTICS_PROTOTYPE=1`
(`npx vite --mode robotics`). Contract: `docs/robotics/CONTRACT.md` v2.2. Plan and lead decisions:
`docs/robotics/CP2-PLAN.md`. Nothing is merged to `main` or deployed; that is the owner's call.

The spike's question (contract §9): *does assembling, programming, breaking and repairing this feel like a coherent
robotics kit?* Everything below was built to answer it and is evidenced in real browsers.

## What a student can do now

1. **Build from loose parts** in the ordinary drawer (Robotics category): hub, motors, axles, wheels, distance sensor,
   light, button, hinge motor, seat, each in its own colour. An axle hovered over a motor snaps into the socket; a wheel
   hovered over an axle end snaps onto it; a refused snap names the part in the way.
2. **Name a creation** on the card the first device opens (it never interrupts later parts). A brick that joins two
   creations reopens the card for both and makes one creation that keeps every program.
3. **Wire it**: assisted wiring plugs each device into the first free port with Undo; the device inspector unplugs, plugs
   in, moves ports, swaps two devices and renames them; cables are drawn from port to device; manual mode leaves new
   parts unplugged.
4. **Code it** (Code this creation / Code): a Scratch-shaped Blockly editor with a category rail, a first-run starter by
   kind (Stop before the wall, Smart gate, Signal post, Joystick drive), program tabs, device dropdowns that name parts and
   ports (`Left motor · C`), and block diagnostics in plain words ("front sensor is missing", "Not plugged in", "Choose two
   drive motors first · Left motor has no wheel on its axle").
5. **Run it on the stage**: the canvas beside the editor is the stage, on the Test plate (world hidden, a wall ahead of a
   rover) or in My world (a visitor walks up to a gate or signal post). Run / Stop / Reset, reading chips that are the
   values the blocks read, the sensor beam, the active block glowing, an on-screen joystick and arrow keys. Editing while
   running keeps the run and says "Changed · press Run to use it".
6. **Break and repair it**: the five failures in the contract are each findable from what the app shows (below).
7. **Ride it** in Explore: walk up to a creation with a seat, press E, drive with the keys, hop off; leaving Explore puts
   everything back and the document is byte-for-byte unchanged.

Programs and cables live in the world document's versioned `robotics` section: they autosave, reload and ride along with
the world. Studio Undo covers construction and cables but never reverts code (Blockly has its own undo).

## Evidence (real Chrome 1366×768 unless noted; every row re-run on commit `d34ebfb` on 127.0.0.1:5232)

Summary file: `regression/summary.txt`. Lane-by-lane evidence with more screenshots: `../robotics-cp2/`, `../robotics-cp3/`,
`../robotics-cp4/`; the checkpoint 1 repair and the lead's review: `../robotics-spike-cp1-repair/README.md`.

| Checkpoint | Harness | Result | Evidence |
|---|---|---|---|
| 1 · mechanics from loose parts (store placement) | `scripts/qa/robotics-spike-cp1.mjs` | 49/49 | `regression/robotics-spike-cp1/` |
| 1 · assembly by real mouse and keyboard | `scripts/qa/robotics-spike-cp1-pointer.mjs` | 78/78 | `regression/robotics-spike-cp1-pointer/` |
| 2 · wiring in Build | `scripts/qa/robotics-cp2-wiring.mjs` | 53/53 | `regression/robotics-cp2-wiring/` |
| 2 · run controller and stage | `scripts/qa/robotics-cp2-run.mjs` | 18/18 | `regression/robotics-cp2-run/` |
| 2 · Code view journeys (rover, joystick, gate, signal post, reload) | `scripts/qa/robotics-cp2-code.mjs` | 51/51 | `regression/robotics-cp2-code/` |
| 2 · the five failures | `scripts/qa/robotics-cp2-failures.mjs` | 70/70 | `regression/robotics-cp2-failures/` |
| 3 · build journey by real touch, iPadOS Safari (simulator, portrait) | `scripts/qa/robotics-cp3-touch.mjs` | 46/46 | `regression/robotics-cp3-touch/` |
| 3 · Code view by real touch, iPadOS Safari (simulator, portrait, stacked layout) | `scripts/qa/robotics-cp3-ipad-code.mjs` | 39/39 | `regression/robotics-cp3-ipad-code/` |
| 4 · Explore riding | `scripts/qa/robotics-cp4-explore.mjs` | 24/24 | `regression/robotics-cp4-explore/` |

Unit and type checks on the final commit: `npx vitest run` (whole suite, including Codex's
`src/robotics/codex-qa-20260922.test.ts` unchanged), `npx tsc --noEmit -p tsconfig.app.json`,
`npx tsc -p packages/brick-core/tsconfig.json`, `vite build --mode robotics`. An unflagged build keeps Blockly, Rapier's
run code and the runtime in lazy chunks; the entry chunk only gains the small parts catalog and a few hook modules.

### The five failures (contract §9)

| Student does | Student sees | Findable by |
|---|---|---|
| Leaves a wheel off its axle | motor output turns (546° at 40 %), the rover moves 0.000 studs | wheel row and selected part: "Not on an axle · the nearest axle end is 1 stud away"; helper blocks: "Choose two drive motors first · Left motor has no wheel on its axle" |
| Motor backwards (raw motor blocks on a mirrored pair) | spins 86° on the spot | drive line "Right motor reversed"; Motors chip "40 · −40 % · speed 28 · −26 % · Right motor is mounted reversed" in red |
| Points the sensor sideways | never stops, drives into the wall | panel "faces left"; the beam drawn sideways on the stage; the sensor chip only ever reads "nothing seen" |
| Builds the arm into the frame | the door stays at 0° | panel "arm is built into the frame"; the lock tinted red; arm chip "0° · built into the frame · can't swing"; the contact highlighted on the stage |
| Unplugs a motor | that motor does nothing, the other still runs | loose cable end with a red plug; "Not plugged in" in the inspector, on the row and on every block that uses it |

## Decisions the lead took (full list in `docs/robotics/CP2-PLAN.md` §1)

A construction edit stops a run. A deleted device's cable is kept for Undo but frees its port. Program edits never enter
studio Undo. Stop brakes, Reset returns to the built pose, a script that ends leaves its motors running. "Sees something"
is 5 studs. Starters live inside Code. Code and Run are off in a live room with one line. Device identity is the brick id.
A rover missing a wheel is still a rover (same run space, same wall).

## Not done, and what a person should know

- **Physical iPad**: every touch result is iPadOS Safari 26.5 on the iOS Simulator (real WebKit, real touch events, one
  finger). A real iPad, pinch and landscape are unverified; landscape needs someone to rotate the simulator (⌘←) and re-run
  the touch harnesses, which write to `landscape/` folders.
- **Portrait tablet panel**: in Build, the creation panel's Nudge Reset needs a scroll inside the panel (Hide collapses
  it). Blockly's number dialog brings up the full keyboard on a real iPad (a decimal keypad needs a custom prompt).
- **Studio-wide touch findings left for `main`** (`../robotics-cp3/touch/README.md`): a tap inside the armed ghost's own
  area does nothing; a spot hidden behind a part needs the Top view; Safari reports a tap's click as `pointerType: mouse`.
- **Later by design**: the Worlds starter gallery, a drive-pair picker (the pair is proposed automatically; "Choose two
  drive motors first" names why it is missing), synchronized running in shared rooms, a sitting pose for riders, rides
  past the plate edge (sent back with a message), hinge arms moving in the Explore mirror.
- **Naming**: default device names follow the socket's direction, so two motors facing the same way are both "Left motor"
  (told apart by port). A rename fixes it; a smarter default is future work.
- **The iOS Simulator tool** in this app refused ("Xcode is installed but not selected"); `sudo xcode-select -s
  /Applications/Xcode.app/Contents/Developer` fixes it. The harnesses use `simctl` and Safari's WebDriver instead.

## How to run it

```bash
cd ~/.codex/worktrees/robotics-lanes/A
PATH=/opt/homebrew/opt/node@22/bin:$PATH npx vite --mode robotics --port 5232 --strictPort --host 127.0.0.1
```

Then any harness with `UI_ORIGIN=http://127.0.0.1:5232 PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/<name>.mjs`.
