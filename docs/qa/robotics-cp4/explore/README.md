# Robot Workshop spike — checkpoint 4, lane E: riding in Explore

Branch `claude/robotics-cp4-explore` (base `0836f56`), behind `VITE_ROBOTICS_PROTOTYPE=1`. Contract §7 (Explore runs
programs for real, writes nothing; leaving Explore returns every creation to its authored pose), §8 (shared rooms
deferred) and §9 rover ("Explore: ride it, drive with keys, hop off; leave Explore, construction unchanged").

Harness: `scripts/qa/robotics-cp4-explore.mjs`, real Chrome (Playwright, `scripts/qa/lib/env.mjs`) at 1366×768 against
`npx vite --mode robotics --port 5246 --strictPort --host 127.0.0.1`. **24/24 checks pass**, no console errors. The
files here are from the last of four full runs of this version, all 24/24 with the same outcome (walk 4.6–4.8 studs, drive 10.4–10.6
studs, turn 73–74°, walk-in stops 1.43–1.74 units from the rover's centre). `results.json` has every check, the
measurements and the character's trail while it walks into the rover.

## The journey, as the harness drives it

| Step | How | Evidence |
|---|---|---|
| Build the rover from loose parts, a seat on its hub, name it Mars buggy | the studio's own placement actions through the store (as `robotics-spike-cp1.mjs`), `confirmCard('Mars buggy')`; assisted wiring plugs both motors and the sensor | `A1-build-rover-with-seat.png` |
| Switch to Explore | the header's **Explore** switch (real click) | `B1-explore-start.png` |
| Walk up to the seat | **real keyboard**: W held until the prompt appeared (4.8 studs from the spawn point); no dev-hook placement was needed | `B2-prompt-press-e-to-ride.png` — "Mars buggy · Drives with a new Joystick drive program (not saved) · Press E to ride Mars buggy · Ride" |
| Ride | **E** | `C1-riding-seated.png` — the character on the seat (0.000 units off its centre, 0.39 above the pan), camera behind |
| Nothing moves without a key | 0.7 s idle: 0.000 studs | — |
| Drive forward | **W** held 1.1 s: 10.6 studs along the rover's forward (-Z), heading change 0.0°; the rider stays on the seat (0.09 units = one frame at 5.5 units/s) | `C2-driving-forward.png` |
| Turn | **←** held 1.0 s: 74° left, chassis moved 1.73 studs (spin in place) | `C3-turned-left.png` |
| Hop off | **E**: program stops, motors brake; the character is put down 0.75 studs from the rover's footprint on the plate, overlapping none of its colliders; the prompt offers the ride again | `D1-hopped-off-beside.png` |
| The prompt's buttons | **Ride** (mouse click), then **W** still drives (3.6 studs: the button kept no focus), **Hop off** (put down 0.75 studs from it) | — |
| It is solid | aim the follow camera at the rover (a `touchYaw` write; camera state only), hold **W** 2.2 s: the character closes from 4.18 to 1.74 units of the rover's centre and stops against it (0.000 units in the last 0.4 s; in some runs it steps up onto the 1-plate chassis first and stops at the hub); never inside a collider; the rover does not move | `D2-walked-into-rover-blocked.png` |
| Leave Explore | **Back to building** (real click): the document snapshot (sorted keys) is identical to the one taken before Explore; undo 18 → 18, redo 0 → 0 | `E1-build-after-explore-authored-pose.png` |
| Explore again | nothing live; the rover is its static, authored self; leave again, still identical | `E2-explore-again-authored-pose.png` |

## Design: two physics worlds

- **The creation runs in its own world.** Riding builds the creation's `RunController` (`run/controller.ts`) in *My
  world*: the creation's joints, motors and wheels, every other brick as static scenery. It is derived with **free
  bodies** (`deriveCreationForSpace(…, 'testPlate')`), because in My world a rover built on the plate is anchored to it
  and could not roll; the controller's `space: 'myWorld'` keeps the world as scenery and no props.
- **The character stays in the Explore world** (`@react-three/rapier`) with its kinematic character controller.
- **Mirror.** Every frame, before the character moves (`useFrame` priority -2), the ride layer advances the live
  controllers with frame time and sets each controller body's pose as the kinematic target of a matching
  `kinematicPosition` body in the Explore world. That body carries the body's bricks as colliders (the studio's own
  `brickPhysicalShapes`, like `BrickCollider`) and as meshes, so the meshes are interpolated exactly like the rider.
  Controller bodies start at the origin with no rotation, so body-local coordinates are world coordinates at the built
  pose and a pose maps straight across.
- **One-way on purpose.** The character cannot walk through a live creation and can stand on it; the creation never
  feels the character. A kinematic character pushes nothing in either world, so two-way coupling would add a second
  copy of the mechanics for no visible difference.
- **While ridden, the creation is not solid in the Explore world** (its mirrored colliders are disabled until the rider
  is put down): the rider sits inside it, and the follow camera's obstruction probe stopped at the seat back (seen in
  the first run). Parked, it is solid again; hop-off spots are outside its footprint by construction.
- **Hidden copies.** While a creation is live, the studio's static copy of its bricks is hidden through the existing
  `scene/hiddenBricks.ts` (`ExploreScene` now reads `useVisibleBricks`), so its static colliders go with it.

## What the ride runs

The creation's controller program, never anything the student did not program (contract §1.4–1.5): its active program
when it has a `when joystick moves` / `when controls update` script; else its other saved programs that do (so a
student's own edited joystick program wins over a fresh starter — a refinement of the brief); else the **Joystick drive**
starter compiled on the fly and never saved. A saved program is used only if it compiles without errors (a broken one is
passed over and named). The Explore movement keys (WASD and arrows per the player's keyboard setting, Space) and the touch
stick feed the program's input; the character never sees them while riding. No drive pair, or no plugged drive motor:
the prompt says so instead of offering Ride. In a live room: "Riding isn't available in a shared room yet."

## Honesty notes

- **The rider stands on the seat's pan** (the studio has no sitting pose); from the follow camera it reads as seated,
  because the seat back hides the legs. A ride nudges the camera pitch up to 0.8 rad so the rider shows over the back.
- **The character is teleported onto the seat** each frame (`setTranslation`). A kinematic target
  (`setNextKinematicTranslation`) stopped 1.4 units short of the seat in the first Chrome run, as the old robotics branch
  also recorded; the teleport lands exactly.
- **Leaving the plate.** The run controller's ground extends 20 units past the plate; Explore's ground ends at the
  plate. A ride whose seat goes 2 studs past the plate's edge (or falls) is sent back to where it was built, with a
  line saying so, and the rider is put down beside it there. Environment terrain beyond the plate is not in the
  controller's world.
- **Parked creations** keep simulating (braked) until they have been still for 0.6 s, then freeze.
- **An edit of the construction while anything is live** (Undo still works in Explore) sends every creation back to
  where it was built — unit-tested, not in this harness.
- **Touch** was exercised as the prompt's buttons clicked with a mouse at 1366×768; the touch stick driving the program
  is unit-tested (`rideStore.test.ts`), not run on a touch device here.
- One camera write in the harness (aiming the follow camera at the rover before walking into it) and one for the D2
  screenshot's framing; both are camera state, never the document.
