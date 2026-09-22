# Robot Workshop spike — checkpoint 1 (mechanics)

Branch `claude/robotics-spike` (forked from `main` ded7b78). Contract: `docs/robotics/CONTRACT.md` v2.2, sections 0–3, 9, 10.
Everything here is behind `VITE_ROBOTICS_PROTOTYPE=1` (the `robotics` vite mode, `.env.robotics`); without it the studio is unchanged.

Evidence was produced in real Chrome at 1366×768 by `scripts/qa/robotics-spike-cp1.mjs` against
`npx vite --mode robotics --port 5232 --strictPort --host 127.0.0.1`. The harness places every part from loose parts through the
studio's own placement actions (choose → rotate → position → place, so the layout rules run), then reads the cards and drives the
Nudge through their real buttons. `results.json` holds the 45 checks; each line below names the PNG that shows it.

Rerun: `PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-spike-cp1.mjs` (clears and rewrites the guest project in local storage).

## What a student can do now

Open the drawer's **Robotics** category and place a hub, motors, axles (short/long), wheels, a distance sensor, a light, a button, a
hinge motor and a seat like any brick: move, rotate, delete, recolour. Each shape shows its connection: the motor's socket ring with a
notched output disc, the axle as a square rod that reaches into socket and hole, the wheel's hole through its hub, the hub's four
labelled ports (A, B on one side, C, D on the other), the sensor's two eyes, the hinge motor's fixed housing under a moving turntable.

Placing the first device on bricks that are not yet a creation opens the **creation card**: the attached bricks glow blue, a swinging
arm coral, a contact that locks an arm red; the card lists the parts found, what they can do, offers a name and *Code this creation* /
*Not now* (both keep the creation; Code is a toast until checkpoint 2). With **assisted wiring** a placed device is cabled to the
first free port of a hub in its creation, with the line *"Left motor connected to port A"* and **Undo**; a hub placed later powers the
parts already waiting; no hub or a full hub explains itself. The **creation panel** then reports every part's chain (axle? wheel?
port? which way it drives; wheel *Not on an axle · the nearest axle end is 1 stud away*; sensor faces forward/left/…; hinge fixed side /
moving side / zero as built / built into the frame), the proposed drive pair with the reversed motor, and where the creation runs
(*on the test plate* for a rover, *in my world* for a gate — flippable).

**Nudge** (dev-only, mechanics only) runs a Rapier simulation of that creation with no code: run a motor at ±40 %, drive the pair
forward/back, swing a hinge to ±60°, back to 0°, stop, **Reset**. A powered motor with nothing in its socket only spins its disc; with an
axle and wheel the wheel turns; two motors with wheels on a plate roll the plate (mirror-mounted, so same-sign power pivots it and the
card says which motor is reversed); a hinge motor swings its arm body about the turntable axis and nothing else; an unplugged motor is
inert. Bodies are derived from what is stud-attached, never from selection; the document is never written by a run.

## Acceptance results

| Flow | Result | Evidence |
|---|---|---|
| (a) Rover from loose parts: plate, hub, 2 motors, 2 axles, 2 wheels, sensor | Card opens on the hub (*Hub added · 2 bricks attached*); after all parts: one creation, 9 bricks, 3 bodies, *Axles and wheels on both motors, so it can roll*, both wheels on motors, drive pair with *Right motor reversed*; each device cabled (A, B, C) with the undoable line | `A1-hub-card.png`, `A2-motor-wired.png`, `A3-rover-card.png` |
| Nudge both motors → it rolls | *Drive forward 40 %*: 4.93 units forward in 2.6 s, 0.01 sideways, yaw 0.0°; Reset → document identical | `A4-rover-rolls.png` |
| Leave one wheel off its axle | Wheel row and selected-part line say *Not on an axle · the nearest axle end is 1 stud away*; nudging the motor turns its output 290° while the wheel stays (not simulated) and the body moves 0.00 | `A5-wheel-off-axle.png` |
| "Mount one motor backwards" (see deviation) | Both motors at +40 %: yaw −68.5°, drift 0.62 — it turns instead of driving; panel shows *Right motor reversed* | `A6-same-sign-turns.png` |
| (b) Gate: frame studded to the plate, hinge fixed side on the sill, door on the moving side, hub, sensor | Card opens on the hinge motor; base (1 anchored body) and arm (1 body, 1 brick); *Fixed side on the frame, moving side on the arm · zero is as built*; runs in my world; hub arrival cables the hinge (*Arm motor connected to port A*) | `B1-gate-card.png` |
| Nudge → door swings about the hinge axis only | Swing to 60°: hinge at 60.0°, arm quaternion x=z=0 (pure yaw), frame unmoved; Back to 0° → 0.0°; Reset → document identical | `B2-gate-swings.png` |
| Build the door into the frame | Door + bridge post highlighted red, hinge *built into the frame, so it can't swing*, the bridging stud joint named; Nudge explains and nothing moves | `B3-gate-built-into-frame.png` |
| (c) Signal post: hub + sensor + light, no motor | One creation, kind signal, *Hub, sensor and light, so it can sense and signal*, sensor on A, light on B | `C1-signal-post.png` |
| (d) Save / reload | Rover document round-trips through autosave and reload (structurally identical); creation name and cables survive; a document from before this work loads unchanged and reads as no creations; the drawer offers Robotics | `D1-reloaded.png`, `D2-legacy-and-drawer.png` |
| Construction identical after any nudge + Reset | Checked after every nudge in (a) and (b): document diff empty | `results.json` |

## Deviation from the contract (stated up front)

**"Mount one motor backwards."** On a stud grid the only mounting freedom a motor has is which way its socket faces, and a rover's two
motors must face outward, so they are always mirror-mounted. That mirror is exactly what makes same-sign power turn the rover; there
is no second "backwards" orientation to build. The failure is therefore reproduced as *both motors commanded the same way* (the naive
"both forward"), and the card makes the cause findable the way the contract asks: the drive pair shows one motor *reversed*. The
drive-pair helper (*Drive forward*) applies that reversal. A motor rotated to face front/back is reported as *runs sideways* and is
not offered as a drive pair.

## Unit tests

- `src/robotics/model/model.test.ts` — 31 tests: stud joints (rotation- and corner-aware, world anchoring, hinge halves), motor→axle→wheel
  matching (one stud off, one plate off, sideways axle), union-find bodies in both spaces, creations (rover, loose wheel, sideways sensor,
  gate, locked gate with the bridging joint, signal post, removal never dissolves, two creations touching, cable never joins), cables
  and assisted planning, section round-trip byte for byte, legacy document unchanged, malformed entries dropped individually.
- `src/robotics/sim/mechanics.test.ts` — 12 headless Rapier tests: rolls straight, same-sign pivots, wheel off axle stays, output-only
  spin, inert without cable, inert without hub, built pose, gate swings about Y only with the pivot fixed, back to zero, locked door
  does not move, unplugged hinge inert.
- `src/robotics/state/roboticsStore.test.ts` — 7 tests through the real brick store: card on first device, Not now keeps the creation,
  assisted wiring + Undo (cable first, brick second), unpowered line, hub powers waiting parts, full hub, undo/redo never re-wires, the
  section rides the document snapshot.
- Full frontend suite: 128 files, 1365 tests green; `tsc --noEmit -p tsconfig.json` clean.
