# Hackable 3D Hero vs the classic 3D character: feel measurements, November 4, 2026

**Branch:** `claude/h3d-d1-feel`, cut at b1d96c98 (tip of `claude/hackable-3d-d1-18eb14`, "Merge claude/h3d-d1-blocks").
Committed locally only. It has not been pushed or deployed. No engine file was changed.

**Test:** `src/platformer/lab/kit3d/feel3d.test.ts`. It has 7 tests and runs in about 1 s of test time (4 s cold with
vitest start-up). Run it with `FEEL_JSON=1 npx vitest run src/platformer/lab/kit3d/feel3d.test.ts` to rewrite
`feel.json`, or with `FEEL_LOG=1` to print the numbers without their traces.

**Update, same day (D1 integration, `claude/hackable-3d-d1-18eb14`):** fixes **A** and **B** below were applied, and
the Hero now also runs on **Shift**. With A (`SNAP` 0.13 → 0.2), the three "going down" differences are gone, measured
by this same test (`feel.json` was rewritten after the change):

| Scenario | Hackable before A | Hackable after A | Classic |
|---|---|---|---|
| 4a walk off a 1-plate ledge: time off the ground | 0.167 s | **0 s** | 0 s |
| 5 down a slope: airborne spells / seconds | 2 / 0.367 s | **0 / 0 s** | 0 / 0 s |
| 5 down a stair: airborne spells / seconds | 3 / 0.500 s | **0 / 0 s** | 0 / 0 s |

B (the drawn Hero's height eases over steps of up to 0.22, render only, in `studio/three/Stage3D.tsx` `easeSteps`) has
no number here: it changes nothing in the game. C (ledge assist while falling) was not applied: the barely-short
4-stud jump still differs. The sections below are the measurements as first taken, before A.

**Raw numbers:** `feel.json`, in this folder. Every scenario has both characters' metrics and 30 Hz traces. Trace rows
are `[t, x, y, z, grounded]`.

## How it was measured

Both characters get the same keys on the same build, tick by tick. Tick *k* of the Hackable game (30 ticks a second)
lines up with classic frames 2*k* and 2*k* + 1 (60 frames a second).

- **Classic (the reference).** This is `src/brick/characterController.ts` run in Node on real Rapier
  (`@dimforge/rapier3d-compat` 0.19.2, the app's version), set up the way `BrickStudioScene.tsx` `ExplorerAvatar` does it:
  - a kinematic body with a 0.18 + 0.18 capsule and `createCharacterController(0.025)`, configured by
    `configureKinematicCharacterController`;
  - each 1/60 s frame runs one fixed 60 Hz step through `consumeCharacterFixedSteps` and
    `accumulateCharacterTranslation`, then one Rapier query (`applyKinematicCharacterStep`), then `world.step()`;
  - colliders are the build plate cuboid plus `brickPhysicalShapes(brick, 64)`: cuboids, round cuboids and convex hulls,
    as `PhysicalCollider` makes them;
  - keys go through `readKeyboardMove`, `combineMoveAxes` and `cameraRelativeMove` at camera yaw π, so forward is −z.
- **Hackable.** This is `createRuntime(design)` from `createStarter3dProject()`, with its copies replaced by the Hero
  alone and `scenery3d` replaced by the same bricks. Keys go through `runtime.pressKey` at camera yaw 0, so forward is
  also −z.
- **Run key.** The classic runs on **Shift**. The Hackable Hero runs on **X**: `physics3d.ts` reads only `x`, and
  Shift does nothing there.
- **Heights.** Classic heights are the capsule's bottom minus its resting gap on flat ground. That gap is 0.0251, set
  by the controller offset. Classic parts are 0.015 lower than their plate multiple and 0.035 narrower (collider
  insets), so a classic plate top reads 0.165 and a brick top reads 0.525. Hackable parts are exact: 0.18 and 0.54.
- **Units.** All distances are world units: 1 stud = 0.62 and 1 plate = 0.18. Times are seconds from the first key.
- **Air time and landing spot** are compared at 30 Hz on both characters. The classic's 60 Hz spells are kept in
  `feel.json` as `airborne60Hz`.

## Summary

| # | Scenario | Same outcome? | Key numbers (classic / Hackable) | Would a kid notice? |
|---|---|---|---|---|
| 1 | Flat walk and three jumps | **Match** | Walk about 0.0001 apart; jump arc ≤ 3e-7 apart; jump height 0.9056 / 0.9056; whole run ≤ 0.015 apart | No |
| 2 | Step up a 1-plate ledge | **Match** (both climb) | Time lost 0 / 0; slowest 1/30 s 2.83 / 3.49 units/s | No |
| 3 | Blocked by a brick | **Match** (both stop) | Stop z −4.773 / −4.780 (0.007 apart) | No |
| 4a | Walk off a 1-plate ledge | **Differs** | Off the ground 0 s / **0.167 s**; the classic rolls down, the Hackable falls | Barely by eye; **yes in code** (land and leave hats fire) |
| 4b | Walk off a 1-brick ledge | **Match** (both fall) | Air 0.233 / 0.267 s; same landing z; Hackable hangs 0.2 further over the edge | Hardly |
| 5 | Slope, stair, stacked slopes, going up | **Match** (all reach the top) | Biggest rise per 1/30 s 0.04–0.08 / **0.18**; climb time 0.40 / 0.20 s | **Yes**: the Hackable Hero hops up in plate-high pops |
| 5 | Slope and stair, going down | **Differs** | Off the ground 0 s / **0.37–0.50 s** (2–3 falls) | **Yes**: it falls down steps instead of walking |
| 6 | Jump onto a brick (standing, walking, running) | **Match** | All land on top; air 0.567 / 0.567 s; landing z within 0.01 | No |
| 6 | Jump 2- and 3-stud gaps (walking, running) | **Match** | All made; landing z 0.12–0.18 apart (the classic says "landed" one frame early) | No |
| 6 | Barely-short jumps (edge cases) | **Differs once** | 4-stud gap with Space 0.2 short of the edge: **made / fell in** | Rarely ("it worked in the builder") |
| 7 | Diagonal into a corner | **Match** | Stop (1.052, −3.532) / (1.060, −3.540); no jitter | No |
| 7 | Slide along a wall | **Match** | Slide speed 2.432 / 2.475 units/s (expected 2.475) | No |

**Overall:**
- On flat ground and for jumping, the Hero is the classic character, to the micrometre for the walk and the jump arcs.
- The differences are all about **height changes of one plate**. The box with plate-high steps pops up and falls down,
  where Rapier's round capsule glides.
- Two small engine changes (A and B below) would close most of that.

## 1. Flat walk, then three jumps

This is the timeline from the existing parity test: walk from tick 10 to tick 120; Space at ticks 30, 40 and 90. The
press at tick 40 is an air jump.

| | Classic | Hackable |
|---|---|---|
| End position z | −12.7337 | −12.7485 |
| Jump height above take-off | 0.9056 | 0.9056 |
| Highest point (jump plus air jump) | 1.8077 | 1.8111 |
| Air time: jump plus air jump / third jump | 1.15 / 0.667 s (60 Hz) | 1.167 / 0.70 s (30 Hz) |
| Worst gap in x and z from the first key to the first landing | 0.00011 | |
| Worst gap in the jump arcs, measured from each take-off | 2.6e-7 | |
| Worst gap over the whole run, y / z | 0.0134 / 0.0149 | |

What differs:
- **Rapier says "grounded" one 60 Hz frame early.** At that frame the feet are still 0.038 above the floor (third
  jump: the classic says landed at 3.667 s, the Hackable at 3.70 s).
- **The classic capsule makes small hops on flat ground after landing.** There were 6 in 2 seconds, each up to 0.014
  high. Each one costs about 0.003 of forward distance. This is Rapier's skin (the controller offset), not the
  character code. It is why the classic ends 0.015 behind.
- Before any landing the two agree to 0.0001. Measured from take-off, the jump arcs agree to 3e-7.

**Would a kid notice?** No. 0.015 is 2% of a stud after four seconds, and the hops are a millimetre-scale shimmer.

The test asserts:
- x and z within 1e-3 up to the first landing;
- jump arcs within 1e-3 of take-off;
- the whole run within 0.03.

The whole run cannot be held to 1e-3 against real Rapier, because of the early landing flag and the skin hops above.
The existing "classic feel parity" test in `physics3d.test.ts` holds 1e-6 only because it stands in for Rapier with a
hand-written floor.

## 2. Step up a 1-plate ledge (`plate_6x8`, walking)

| | Classic | Hackable |
|---|---|---|
| Climbs it | yes | yes |
| Time until the feet are at plate height | 0.783 s | 0.767 s |
| Slowest 1/30 s at the ledge | 2.83 units/s (−19%, one sample) | 3.49 units/s (−0.2%) |
| Time to reach z = −4 (same on flat ground) | 1.233 s (1.233) | 1.233 s (1.233) |
| Distance behind a flat-ground walk at 2 s | 0.015 | 0 |
| Biggest rise in 1/30 s | 0.14 | 0.18 (one substep) |

What differs:
- The classic's autostep and capsule shave a moment of speed. The Hackable steps up with no loss.
- Both pop up quickly: the classic rises 0.14 in 1/30 s; the Hackable rises 0.18 in one substep.

**Would a kid notice?** No.

## 3. Blocked by a brick (`brick_2x6`, 3 plates)

| | Classic | Hackable |
|---|---|---|
| Blocked | yes | yes |
| Stop z (the brick's grid face is at −4.96) | −4.7726 | −4.7800 |
| Gap from the centre to the grid face | 0.1874 (radius + offset − inset) | 0.1800 |
| Time to stop | 1.533 s (creeps the last millimetres) | 1.467 s |

The stops are 0.007 apart. **Would a kid notice?** No.

## 4. Walking off ledges

| | Classic, plate | Hackable, plate | Classic, brick | Hackable, brick |
|---|---|---|---|---|
| Ends on the floor | yes | yes | yes | yes |
| Left the ground | **no** | **yes** | yes | yes |
| Air time (30 Hz) | 0 | 0.167 s | 0.233 s | 0.267 s |
| Feet first below the top, centre past the edge by | 0.08 | 0.31 | 0.08 | 0.31 |
| Feet first on the floor at z, at time | −3.914, 0.567 s | −4.380, 0.700 s | −3.490, 0.800 s | −3.490, 0.800 s |
| Biggest drop in 1/30 s | 0.14 | 0.06 | 0.105 | 0.118 |

The plate's edge is at z = −3.72; the brick's edge is at z = −2.48.

What differs:
- **Plate ledge.** The classic's round capsule rolls down the 0.165 edge and stays grounded the whole way. The
  Hackable's snap distance (0.13) is shorter than a plate (0.18). So the box walks 0.18 past the edge on its back
  corner, then falls for 1/6 s.
- **Brick ledge.** Both fall and land at the same 30 Hz sample. The box stays up until its back edge leaves the top, so
  it stands about 0.2 further out over the edge before it drops.

**Would a kid notice?**
- The plate drop is barely visible.
- In code it shows: every plate-high step down starts "when I leave the ground" and then "when I land". A landing
  sound or a jump counter would go off as the Hero walks off a plate. Nothing like that happens in the classic.
- Hanging over a brick edge by about a third of a stud is just visible and reads as "standing on air".

## 5. Slopes and stairs

Each climb starts walking at z = 1.24. The climbs face −z and end on a brick-high deck (6 plates high for stacked
slopes). The descents start on a deck and go down a slope or stair facing +z.

| Going up | Slope C | Slope H | Stair C | Stair H | Stacked C | Stacked H |
|---|---|---|---|---|---|---|
| Reaches the top | yes | yes | yes | yes | yes | yes |
| Time from the foot to the top | 0.40 s | 0.20 s | 0.40 s | 0.30 s | 0.85 s | 0.53 s |
| Time to the top from the first key | 1.20 s | 1.00 s | 1.25 s | 1.10 s | 1.65 s | 1.33 s |
| Mean horizontal speed climbing | 2.84 | 3.50 | 2.88 | 3.50 | 2.83 | 3.50 |
| Slowest 1/30 s climbing | 2.81 | 3.50 | 1.57 | 3.50 | 2.81 | 3.50 |
| Biggest rise in 1/30 s | 0.041 | **0.18** | 0.080 | **0.18** | 0.041 | **0.18** |
| Pops (rise ≥ 0.1 in 1/30 s) | 0 | 3 | 0 | 3 | 0 | 6 |
| Off the ground on the way up | 0 | 0 | 0 | 0 | 0 | 0 |

C is classic and H is Hackable.

| Going down | Slope C | Slope H | Stair C | Stair H |
|---|---|---|---|---|
| Reaches the bottom | yes | yes | yes | yes |
| Spells off the ground | 0 | **2** | 0 | **3** |
| Time off the ground | 0 | 0.367 s | 0 | 0.50 s |
| Time to the bottom | 1.333 s | 1.533 s | 1.583 s | 1.700 s |
| Biggest drop in 1/30 s | 0.051 | 0.102 | 0.118 | 0.069 |

The height profiles against z are in `feel.json`. The classic slope is a straight ramp: about 0.041 of rise every 1/30 s, or 0.44 per unit of
travel. The Hackable climbs 0 → 0.18 → 0.36 → 0.54 in three steps, about 0.35–0.47 of travel apart.

What differs:
- **Going up.**
  - The Hackable's slopes are plate-high steps, so the Hero rises in three sudden 0.18 pops per brick of height, about
    8 pops a second. The classic glides up a smooth ramp, and its stairs are smoothed by riser ramps.
  - The Hackable also keeps full speed, where the classic slows by about 19% on a slope. It reaches the top
    0.2–0.3 s sooner.
- **Going down.**
  - The box overhangs each step and drops off it, so the Hero is airborne 2–3 times per slope or stair. Each time the
    land and leave hats fire.
  - On the slope it skips the middle step entirely: 0.54 → 0.18.
  - The classic walks down grounded the whole way.

**Would a kid notice?** **Yes.** This is the biggest feel difference.
- On a ramp the Hero visibly bobs up in steps and tumbles down in little falls.
- A ramp in the builder looks smooth, so the motion looks wrong for the brick.

## 6. Jumps

**Onto a brick-high deck** (two `brick_4x4`s; near face at z = −2.48):

| | Classic | Hackable |
|---|---|---|
| Standing 0.12 from the face (Up and Space together): lands on top | yes, z −3.473, air 0.567 s | yes, z −3.464, air 0.567 s |
| Walking, Space 1.0 from the face: lands on top | yes, z −3.506, air 0.567 s | yes, z −3.507, air 0.567 s |
| Running, Space 1.0 from the face: lands on top | yes, z −4.609, air 0.567 s | yes, z −4.609, air 0.567 s |
| Highest point (walking) | 0.897 (the capsule clipped the edge) | 0.906 |

**Gaps between two brick-high decks** of stacked `plate_6x8`s. Space is pressed when the centre is 0.08 short of the
edge walking, or 0.07 past it running (the box is still on the deck then). "Landing z past face B" is how far past the far deck's face the
first grounded 30 Hz sample is.

| Gap | Classic | Hackable |
|---|---|---|
| 2 studs, walking | made, landing z past face B 1.01 | made, 1.13 |
| 2 studs, running | made, 2.43 | made, 2.61 |
| 3 studs, walking | made, 0.39 | made, 0.51 |
| 3 studs, running | made, 1.81 | made, 1.99 |
| 4 studs, walking | made; the capsule was lifted from 0.05 below the top (−0.12) | made; the box overlapped by 0.07 (−0.11) |
| 4 studs, running | made, 1.19 | made, 1.37 |
| 4 studs walking, Space 0.20 short of the edge | **made**: hit the face 0.15 below the top and was stepped up | **fell in the gap** |
| 4 studs walking, Space 0.31 short of the edge | fell in | fell in |
| 5 studs running (Space on time, 0.11 early, 0.29 early) | made, made, made | made, made, made |
| 6 studs running | made (centre 0.05 short of the face, hanging on the edge) | made (0.13 past) |

What differs:
- Air time is 0.667 s (classic) against 0.70 s (Hackable) at 30 Hz. The landing spot is one tick of travel apart
  (0.12 walking, 0.18 running). Both come from Rapier's early "grounded" flag, not from the arc: the arcs are identical
  (scenario 1).
- **Ledge forgiveness.** When the capsule's round side clips a ledge from up to about 0.2 below its top, Rapier reports
  ground and autostep lifts it on. The box falls.

**Would a kid notice?** Not in ordinary jumps. Occasionally, on a just-short jump that the builder forgives and the
Hackable game doesn't.

## 7. A corner, and sliding along a wall

| | Classic | Hackable |
|---|---|---|
| Up and Right into an inside corner: stops in the corner | yes, at (1.0524, −3.5324) | yes, at (1.0600, −3.5400) |
| Gap to each wall | 0.1876 | 0.1800 |
| Jitter in the last half second | 0.0002 | 0 |
| Time to stop | 1.017 s | 1.033 s |
| Up and Right along a wall: speed along the wall (expected 3.5/√2 = 2.475) | 2.432 | 2.475 |
| Drift away from the wall | 0.0012 | 0 |
| Stayed grounded | yes | yes |

Rapier's slide loses 1.7% of speed along the wall. **Would a kid notice?** No.

## Engine changes that would close the gaps (not made here)

### A. Snap a whole plate: `SNAP` 0.13 → 0.2 in `src/platformer/lab/kit3d/physics3d.ts`

The snap must be at least one plate (0.18) plus one substep of the ground-stick fall (0.35 / 60 = 0.006).

Expected effect:
- Walking off a 1-plate ledge keeps the Hero grounded (scenario 4a). Leave and land hats no longer fire.
- Going down slopes and stairs becomes grounded the whole way, with no airborne spells (scenario 5, down). Each step
  becomes a 0.18 drop inside one substep. The Hero should reach the bottom about when the classic does, because it
  stops falling off the overhang.
- Brick ledges (0.54) still fall, as they do in the classic.
- Jumps are unaffected: snap is skipped on the jump substep and whenever the Hero wasn't grounded.
- Determinism and lockstep are unaffected: it is one constant.

The comment above the snap ("walking off a plate-high ledge keeps the Hero on the ground, as Rapier's snap did") is
not true at 0.13. The classic stays grounded because of its round capsule rolling over the edge, not because of
Rapier's 0.13 snap.

### B. Hide the plate pops: ease the drawn Hero's height (render only)

In the 3D renderer, ease the Hero's **drawn** y towards its physics y over about 60–80 ms whenever it is grounded and
the change is at most AUTOSTEP (0.22). That covers step-ups, slope steps and, with A, step-downs.

Expected effect:
- Going up a slope looks close to the classic's ramp: each 0.18 pop is spread over 4–5 frames instead of one substep.
- The simulation, fingerprints and lockstep are untouched.

This is the cheapest fix for the most visible difference.

The engine-side alternatives, in rising cost:
- **Half-plate slope steps in `parts3d.ts`.** The pops become 0.09 but twice as many. Each slope gets more boxes.
- **True ramps.** Give slope parts a height function and let `walk` set y to the ramp height under the footprint. All
  of it can be done in + − × ÷, so it stays deterministic. This also brings back the classic's roughly 19% slow-down
  on slopes, if that is wanted. It is the most work.

### C. Ledge assist while falling (optional)

In `stepBody`, allow the autostep in `walk` also when the Hero is airborne and falling (character, `vy ≤ 0`, not the
jump substep), as long as the face's top is no more than AUTOSTEP above the feet.

Expected effect:
- The barely-short 4-stud jump (Space 0.2 short) is made, as in the classic.
- Ordinary jumps are unchanged.
- It is slightly more generous than the classic at the box's square corners.

It is lower priority than A and B.

### Not worth changing

- Rapier's early landing flag: one 60 Hz frame.
- The classic's skin hops: 0.014 high.
- Collider insets and the offset: under 0.01 at walls.
- The 1.7% slower wall slide.

None of these is visible, and copying them would make the Hackable less exact.

## What this set-up does not reproduce exactly

- **Frame rate.** The classic is driven at exactly 60 frames a second, so `consumeCharacterFixedSteps` runs one step
  and one Rapier query every frame. In a browser at 120 Hz, or with dropped frames, the classic runs 0–3 steps per
  frame and accumulates them into one Rapier query. Collision results then differ slightly from these numbers (at
  120 Hz, every other frame has no step).
- **Physics stepping.** react-three-rapier's own `<Physics timeStep={1/60} interpolate>` loop is modelled as one
  `world.step()` after the character's query each frame. `interpolate` is render-only. The `ccd` flag on the body is
  not set; it has no effect on kinematic character-controller queries.
- **Spawn.** There is no `findSafeExploreSpawn` clearance search. The capsule is placed at the scenario's start, 0.03
  above the surface (`EXPLORE_SPAWN_FLOOR_GAP`), and settles for 10 ticks before any key.
- **Camera.** The camera is fixed at yaw π. The real follow camera would not turn in these runs:
  - straight-ahead walks already face the camera's direction;
  - diagonal walks switch follow off (`steering.x ≠ 0`).

  Touch, micro:bit, remote avatars, the camera probe and character size scaling (1 here) are not modelled.
- **Colliders.** Only the build plate and the bricks are present. The environment's own colliders (`EnvironmentWorld`)
  are not.
- **Sampling.** The Hackable is sampled at the end of each tick (30 Hz), so its air times and "first below" positions
  are quantised to 1/30 s. The classic's 60 Hz numbers are in `feel.json`.
