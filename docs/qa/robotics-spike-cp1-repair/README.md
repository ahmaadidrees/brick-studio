# Robot Workshop spike — checkpoint 1 repair pass

Branch `claude/robotics-spike`, worktree `robotics-lanes/A`, still behind `VITE_ROBOTICS_PROTOTYPE=1`. No merge, no deploy.
Answers the Codex QA of candidate `c6054b0` (`output/robotics-qa-20260922/REPORT.md`: four reproduced defects and the
pointer-assembly gaps). Codex's regression file `src/robotics/codex-qa-20260922.test.ts` is committed unchanged; all
seven assertions pass. The original checkpoint-1 evidence under `docs/qa/robotics-spike-cp1/` is left as it was.

## The four defects

| # | Defect | Repair | Where |
|---|---|---|---|
| 1 | Physics time depended on frame rate (1 s at 90 fps = 0.75 s, at 240 fps = 2 s) | Fixed-step accumulator: frame time accumulates, the world advances in whole 1/120 s steps, the remainder carries over. Backlog capped at 0.1 s (12 steps per frame): a stall is dropped and reported, never replayed as a burst. `step` ignores non-finite input; every read is safe after `dispose`. | `src/robotics/sim/mechanics.ts` |
| 2 | Wiring-line Undo silently did nothing once another history entry (the card's confirm) sat on top | The line remembers the history entry its wiring wrote and the cables it added. On top: a real history undo (Redo restores). Otherwise: a fresh `Unplug …` edit removing exactly those cables, leaving the later edit alone. Nothing to remove: no-op, no history. | `roboticsStore.ts` `undoWiring` |
| 3 | Reset did not cancel a `startSim` still awaiting its imports | A start generation: every `startSim`/`resetSim` advances it; a start re-checks after each await and publishes nothing when superseded. Reset, a construction edit, a scene exit and a newer start all cancel; the loading flag belongs to the newest start. | `roboticsStore.ts` `startSim`/`resetSim` |
| 4 | A cable edit during a run left the simulation live with the old powered state | The simulation carries a behaviour key (cables, creation membership, run space, plate, part shapes). The watcher retires the run, or a pending start, when the bricks or the key change. A rename changes neither and keeps the run. `setTestSpace` stops before it writes. | `roboticsStore.ts` `simBehaviorKey`, watcher |

## The pointer-assembly gaps

- **Axle over a motor said "overlaps".** Connector snapping: with an axle armed, hovering a motor puts the ghost into
  its free socket (turned to match); hovering a loose wheel puts it through the hole. With a wheel armed, hovering an
  axle (or a motor whose axle has a free end) puts it on the nearest free end. The pose is computed from the same
  connector geometry `mechanism.ts` reads, so a snapped part is connected by construction. The shared scene consults a
  tiny registry (`scene/draftSnap.ts`) that the robotics layer fills while mounted; an unflagged studio places exactly as
  before. `model/snap.ts`, `BrickStudioScene.tsx` (`supportedDraftFromPoint`).
- **Naming interrupted every device placement.** The card opens only for the first device on bricks that are not yet a
  creation. A device joining a saved creation gets the wiring line and a panel row; the same wiring write refreshes the
  creation's anchors (no extra history entry). Contract §4 unchanged.
- **Framing ignored the panels.** A frame request (card open, `openCardFor`, `requestFrame`) frames the creation's
  bricks inside the canvas rectangle the drawer, the card/panel and the command strip leave free: the distance fits that
  rectangle and the camera slides so the creation's centre lands on its centre. `scene/framing.ts`.
- **Parts all one colour; sensor thumbnail hid its eyes.** `BrickPart.defaultColor` (optional, brick-core): a part with
  its own colour arms in it and the drawer draws it in it; the brush is untouched and stock bricks are unchanged.
  `thumbnailTurn` turns the sensor's thumbnail to show its eyes. `parts/catalog.ts` `ROBOTICS_PART_COLORS`.

## Evidence (real Chrome, 1366×768, `--mode robotics` on 127.0.0.1:5232)

**`pointer/`** — `scripts/qa/robotics-spike-cp1-pointer.mjs`, **78/78**. Every part chosen in the drawer with a click,
turned with the R key, aimed with the real mouse and placed with a click; where the mouse goes comes from the app's own
world→screen projection (dev-only `window.__robotics.project`), the aiming a student does by eye. No injected
coordinates, no fixture. The ghost's pose is read back before every click.

| Shot | What it shows |
|---|---|
| P1 | Hub placed on the plate: the card opens, the pair framed inside the free canvas area (insets L276 R444 B66 measured from the DOM); drawer parts in their own colours |
| P2 | Both short axles snapped into the motor sockets by hovering the motors (ghost read 26,0,32 and 34,0,32 before the clicks) |
| P3 | Wheels snapped onto the axle rods by hovering the rods; sensor placed from the top view (its spot is behind the hub from the home angle); nine bricks, three bodies, "Right motor reversed"; the card never reopened |
| P4 | Drive forward 40%: 4.93 forward, 0.01 sideways, yaw 0.0° after 2.6 s; the clock simulated 2.62 s in 2.6 s of wall time |
| P5 | A 1×1 brick placed with the mouse while the rover ran: the run retired ("Built pose"), the brick stayed, history Undo removed only it |
| P6 | Wheel nudged off its axle with the arrow key: "Not on an axle · the nearest axle end is 1 stud away", motor output turned 290°, wheel stayed, body moved 0.00 |
| P7 | Cold reload: the document round-trips byte for byte, name and all three cables intact |
| P8–P10 | Gate assembled the same way (posts, sill turned once, hinge motor, door turned once, hub powers the waiting hinge, sensor on the hub); swings to 60.0° with the frame unmoved; built into the frame with two bricks from the top view → locked, explained |

**`store-driven/`** — the checkpoint-1 harness `scripts/qa/robotics-spike-cp1.mjs`, updated for the closed card and
the panel rename, **49/49** (rover, wheel off, same-sign turn, save/reload, gate, locked gate, signal post, legacy
document, drawer category).

Tests: `npx vitest run` (full frontend suite: 131 files, 1409 tests after the review fixes, all passing; 1365 before this pass), `tsc --noEmit -p tsconfig.app.json`,
`tsc -p packages/brick-core/tsconfig.json`, `vite build --mode robotics`. New unit coverage: the clock at 30–240 fps and
the backlog cap (`mechanics.test.ts`), precise wiring Undo, cancelled and superseded starts, cable-edit vs rename
retirement, the behaviour key, a run never writing (`roboticsStore.test.ts`), connector snapping against the rover
fixture (`model/snap.test.ts`), framing maths and inset measurement (`scene/framing.test.ts`).

## Lead review (2026-09-23)

A second read of the repair found three problems, fixed in the follow-up commit:

- **Two clock policies.** The scene still clamped each frame to 0.05 s before handing it to the accumulator, so below
  20 fps the simulation ran slow. The scene now passes real frame time; the mechanics backlog cap is the only policy.
- **A snap kept the student's rotation.** After an axle turned to fit a socket it stayed turned when the pointer left.
  The snap now borrows the rotation and gives it back.
- **Codex's case, a motor standing on a hub.** An axle's grid box is 8 plates tall, so with the socket facing over
  the hub the box meets the hub even though the rod clears it. That refusal now names the part in the way: *"The axle
  fits Left motor's socket, but there it would overlap Hub. Turn or move the motor so its socket faces open space."*
  With the socket facing open space the snapped axle places and reads as in the socket. Both are unit tests.

Method correction: `tsc --noEmit -p tsconfig.json` (used here and in the Codex QA) checks nothing, because that
config has `files: []` and only references `tsconfig.app.json` and `tsconfig.node.json`. Both real configs were run on
the integration branch on 2026-09-23 and pass.

Contract gap noted for checkpoint 2: a device that bridges two creations no longer reopens the card for their union
(contract §4); neither version implemented the union.

## Not done, and what the run surfaced

- iPad / touch is unverified. Everything here is a mouse at 1366×768.
- While a run is live the studio hides the creation's authored bricks and draws the moving bodies, so a student cannot
  aim at "the rover" mid-run (the harness placed its mid-run brick on clear baseplate). What an edit during a run means
  is checkpoint 2's first open question.
- A wheel coming off turns a rover into a plain creation, so its default run space chip flips from the test plate to
  my world until the wheel is back. Derived, correct, and a little surprising.
- At 1024×768 the drawer and panel still cover most of the canvas; framing now accounts for them, the layout does not.
