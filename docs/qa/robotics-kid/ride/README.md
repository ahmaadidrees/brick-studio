# Robot Workshop kid-UX pass, lane R: riding in Explore

Branch `claude/robotics-kid-ride`, from `9f24b4d`, behind `VITE_ROBOTICS_PROTOTYPE=1`. Worked by Claude (Opus 5.5)
on 2026-09-23 after a novice tester playing an 8-year-old ("Maya") hit a crash while riding the Buggy in Explore.

| Commit | What it does |
|---|---|
| `9849528` | **The crash fix only.** Can be cherry-picked on its own. |
| `f2cc21d` | The edge rule (a curb at the plate's edge, back to the start with the rider still on) and the ride card in kid words. |
| `928b6fb` | Drive's My world gets the same curb, so Drive and Explore agree. Separate so it can be dropped. |
| `d4ecb33` | Wall textures shared by size (no texture leak per ride); the harness covers touch and hopping off at the curb. |
| `3426c81` | Hopping off clears "Back to the start!"; a clearer harness line. |

## What was wrong

**1. Blocker: Ride again crashed the studio.** I reproduced it 2 of 2 times on `9f24b4d` in real Chrome with the tester's
steps: Buggy kit, a seat, Explore, E to ride, W until it left the plate, then E to ride again and W. The studio showed
"Oops! The studio tripped over a brick" ("expected instance of EA"). One run logged 1 × `RuntimeError: unreachable`,
23 × "recursive use of an object detected which would lead to unsafe aliasing in rust", 1 × "attempted to take ownership
of Rust value while it was borrowed", 2 × "null pointer passed to rust" and 2 × "expected instance of EA". That matches
the tester's console. The stack of the first error:

```
RuntimeError: unreachable
    at wasm-function[1156] … wasm-function[1020]
    at LA.rbNumColliders (@dimforge_rapier3d-compat.js)
    at GI.numColliders (@dimforge_rapier3d-compat.js)
    at setSolid (src/robotics/explore/ExploreRides.tsx)
    at Object.current (src/robotics/explore/ExploreRides.tsx)   ← the useFrame loop
```

*Root cause.* `ExploreRides` kept each live robot's mirror bodies in a map. The map was filled by a function ref on
`<RigidBody>`. `@react-three/rapier` 2.2 calls that ref once, with the body, and never calls it with `null` when it
removes the body. So after a ride was sent back, the map still held bodies that were no longer in the world. On the next
Ride, the frame loop reached them before React had mounted the new ones. The first call into a removed body made Rapier's
WASM panic, and every later call threw.

**2. Thrown out at an edge she could not see.** A ride whose seat went 2 studs past the plate's edge was sent back: the
car vanished and the rider was put down beside where it was built (`before/before-2…`, `before/before-3…`). In Drive's My
world the robot could leave the plate and keep going. The two modes disagreed.

**3. Jargon on the ride card.** It said "A new Joystick drive program (not saved) reads WASD / arrows"
(`before/before-1…`).

## What the world is beyond the plate

- **Explore, Classic studio (the default).** The only ground collider is the plate, exactly its size. The drawn plate is
  0.175 units wider. Past the edge there is nothing. The character falls and respawns once it drops below y = −30
  (`ExplorerAvatar`'s `respawnBelowY`).
- **Explore in the other worlds.** Toy Room has a desk one plate below the plate's top, much larger than the plate, with
  guard walls and props. Brick Valley has hills and Sky Island has an island. There is ground past the plate for the
  character, but **none of it is in the ridden robot's physics world**.
- **The ridden robot's physics (the run controller in My world).** Flat ground reaches 20 units (about 32 studs) past the
  plate's edge, and nothing draws it. The student's other bricks are static scenery. The environment's scenery is not
  included.
- **Drive's My world** uses that same physics world. A robot left the plate, drove on the undrawn ground and fell off its
  far end. Nothing brought it back except Reset.

## The decision: a curb, and no one is ever thrown out

The robot's world and the child's world agree only on the plate. Letting the car drive past the edge would look wrong
everywhere:

- In the Classic studio it floats over nothing, and a rider who hops off there has no ground to land on.
- In the Toy Room it floats one plate above the desk and drives through the desk's props.

So a boundary is needed. It is visible and solid, like the Test plate's fence:

- **The curb** (`explore/plateCurb.ts`): four walls just outside the plate's edge, 4 plates tall (like the Test plate's
  fence), meeting at the corners. The ride's run controller gets them as props, so the robot bumps into them and stops.
  Explore draws the same walls (`CurbWall`, with the fence's brick look from `scene/brickWall.ts`) while the rider is on
  board, so what she sees is exactly what the robot hits. Driven flat out at the edge for 7 s, the Buggy stops with its
  front at the edge. It does not climb the curb or tip.
- **The rider is never put down for this.** Crossing the plate's edge is no longer a reason to send the robot back. The
  only reasons are (`rideTrouble`):
  - the robot got past the curb anyway (its seat more than a stud beyond the curb's outer face);
  - it fell (seat below y = −3);
  - it has lain tipped over for 1.5 s.

  Then it goes back to where it was built **with the rider still riding**: a fresh controller and program run, the keys
  she is holding still drive it, and the card says "Back to the start!" for a few seconds.
- **An edit while riding** (Undo in Explore) still sends every robot back and puts the rider down beside it: the build is
  the truth. The card now says "The build changed, so robots went back to the start."
- **Drive's My world** gets the same curb (`928b6fb`), so "My world" means the same thing in both places. Try it and the
  Code view are unchanged.
- **The curb shows only while someone rides**, because it is the car's boundary. Walking is unchanged: a walker can still
  walk off the plate or onto a world's desk or hills, as before. A curb drawn while walking would look solid but let the
  walker through. Making it solid for walkers would change walking in every world, so that is left as a separate decision.

## The ride card, in kid words

| When | Before | Now |
|---|---|---|
| Near a robot | Buggy · Drives with a new Joystick drive program (not saved) · Press E to ride Buggy · Ride | Buggy · Press E to ride Buggy · **Ride** |
| Riding | Riding Buggy · A new Joystick drive program (not saved) reads WASD / arrows · Press E to hop off · Hop off | **Riding Buggy** · Drive with the arrow keys or WASD. · Press E to hop off · **Hop off** |
| Riding, on touch | (same as above; no key hint) | Riding Buggy · **Drive with the stick.** · Hop off |
| Riding with her own code | Your program "My driving" reads WASD / arrows | …plus **Using your code: My driving** (near: "Drives with your code: My driving") |
| Keyboard setting | (not shown) | "Drive with the WASD keys." / "Drive with the arrow keys." when the other set turns the camera |
| Sent back | Buggy left the plate, so it went back to where you built it. (rider put down) | **Back to the start!** (still riding) |
| Code stopped | The program stopped. Hop off and fix it in Code. | Your code stopped. Hop off and fix it in Code. |
| No drive motors / unplugged / shared room | It has a seat but no drive motors. Choose two drive motors first. · Its drive motors aren't plugged in. Plug them into the hub in Build to ride it. · Riding isn't available in a shared room yet. | Add a motor on each side to drive it. · Plug its motors into the hub to ride it. · Riding is off in a shared world for now. |

Text is now 14–16 px on desktop and 15–17 px on touch, and the buttons are 44 px tall, as in the KID-UX principles.

## How it was verified

- **Unit tests.** `npx vitest run`: **169 files, 1897 tests, all green** (at `9f24b4d` it was 168 files, 1885 tests).
  `npx tsc --noEmit -p tsconfig.app.json` and `npx tsc -p packages/brick-core/tsconfig.json --noEmit` are clean.
  `src/robotics/codex-qa-20260922.test.ts` is unchanged and passes. New or changed tests:
  - `explore/mirrors.test.ts`, in a real Rapier world: a removed body is never handed out, even when Rapier reuses its
    slot for a new body (a lookup by the old handle then finds the new body, so checking presence alone would not be
    enough); an older generation cannot shadow or unregister a newer one.
  - `explore/rideStore.test.ts`: at full speed against the curb for 10 s the Buggy stays ridden, stops at the edge,
    stays on its wheels, and backs away; a ride past the curb, or tipped over for 1.5 s, comes back to the start still
    ridden and drives on with the held key; hop off and ride again after that.
  - `explore/rideModel.test.ts`: the curb's geometry for 64, 96 and 128 plates, the back-to-the-start rule, and the card's
    words (no program jargon, lines of 10 words or fewer).
  - `explore/ExploreRidePrompt.test.tsx`: keyboard setting, touch, "Back to the start!".
  - `drive/DriveView.test.tsx`: My world stops at the curb.
- **The crash fix alone** (`9849528`, clean checkout). Typecheck and the Explore tests are green. The tester's exact
  journey (drive off the plate, sent back, Ride again, W) ran **4 of 4 clean** in real Chrome: the second ride drove about
  8 studs with 0 console errors. The same script on `9f24b4d` crashed 2 of 2 times.
- **Real Chrome**, on this worktree's dev server (`npx vite --mode robotics --port 5241 --strictPort --host 127.0.0.1`):

  | Harness | Result |
  |---|---|
  | `scripts/qa/robotics-kid-ride.mjs` (new) | **33/33**, in six full runs with the same results; this folder holds the last, on the final code (`results.json`) |
  | `scripts/qa/robotics-cp4-explore.mjs` (card checks updated) | **24/24** (`cp4-explore-results.json`) |
  | `scripts/qa/robotics-kid-drive.mjs` (D5 expects the curb) | **71/71** (`kid-drive-results.json`) |

  Every run had 0 page errors and 0 console errors.

### Numbers (`results.json`, the recorded run)

| What | Measured |
|---|---|
| W held 7 s toward the −Z edge | drove 26 studs, then stopped. Front 0.027 units past the plate's edge, which is contact overlap with the curb. Speed ≤ 0.007 units/s over the last second. Chassis height 0.035, the same as at the start. |
| While pushing on the curb | phase `riding` and generation 1 in every one of 68 samples; no notice; the rider at most 0.14 units off the seat (about one frame at speed) |
| Hop off at the curb | the character stands on the plate beside the Buggy, inside no collider. E rides again, and S backs 3.8 studs away. |
| Back to the start | generation 1 → 2; chassis 0.05 units from where it was built; rider 0.016 units off the seat; card "Back to the start!". W still held drives it 12.2 studs in 1.2 s. The new bodies are mirrored (3/3) and match the chassis. |
| Three more trips back in quick succession, one a frame after the last | generations 3, 4, 5; no errors; still riding; driving again |
| An edit while riding (Undo, Redo), then Ride again | the rider is put down beside it with the new line. Ride again moves generation 6 → 7, and W drives 6.6 studs with every body mirrored. This is the same remount that crashed before. |
| Touch at 1024×768 (Chrome touch emulation) | walked up with one finger on the stick; tapped Ride. The card reads "Drive with the stick." at 15 px with a 44 px Hop off and no key hint. The stick drove 13.8 studs, and a tap on Hop off put the character down. |
| Leave Explore | document snapshot identical; undo and redo stacks unchanged |

## Screenshots

| File | Shows |
|---|---|
| `before/before-1-old-card-jargon.png` | on `9f24b4d`: the old card ("A new Joystick drive program (not saved) reads WASD / arrows") |
| `before/before-2-thrown-out-past-the-edge.png` | on `9f24b4d`: the car gone at the edge, the rider hanging past the plate |
| `before/before-3-put-down-by-the-built-pose.png` | on `9f24b4d`: put down by the built pose, "Buggy left the plate, so it went back to where you built it." |
| `before/before-4-ride-again-crash.png` | on `9f24b4d`: Ride again, "Oops! The studio tripped over a brick" |
| `A1-buggy-with-seat.png` | the Buggy kit with a seat on its hub |
| `B1-near-press-e-to-ride.png` | near it: "Buggy · Press E to ride Buggy · Ride" |
| `C1-riding-card.png` | riding: "Riding Buggy · Drive with the arrow keys or WASD. · Press E to hop off · Hop off" |
| `D1-bumped-the-curb-still-riding.png` | **bumped the curb, still riding** (W held) |
| `D2-against-the-curb-side-view.png` | side view: the Buggy stopped against the curb at the plate's edge |
| `D3-hopped-off-at-the-curb.png` | hopped off at the curb, on the plate, Ride offered again |
| `E1-back-to-the-start-still-seated.png` | **brought back to the start, still seated**, "Back to the start!" |
| `E2-driving-again-after-the-start.png` | driving on from the start with the key still held |
| `F1-riding-again.png` | **riding a second time** after hopping off |
| `H1-ride-again-after-the-edit.png` | Ride again after an edit put the rider down (the old crash path) |
| `T1-touch-riding-drive-with-the-stick.png` | touch: "Riding Buggy · Drive with the stick." |
| `drive-my-world-curb-1366.png` | Drive's My world with the same curb along the plate's edges |

## Notes and limits

- **The "back to the start" path in Chrome** is forced through the dev hook `window.__robotics.exploreRides.bringBack()`.
  The curb stops the Buggy, so driving alone never gets it there. The unit tests trigger it through `advanceRides`: once by
  pulling the limit in on a live ride, and once by forcing a tipped pose on the seat body.
- **A world's own ground past the plate is not drivable** (the Toy Room desk, Brick Valley, Sky Island). That would need
  the environment's colliders in the ride's physics world.
- **Only one `<RigidBody>` under `src/robotics` took a function ref** (`ExploreRides`), and it is fixed. The explorer's
  body in the studio uses an object ref tied to its component's lifetime.
- **Not tested on the iPad Simulator** (not touched, per instructions). Touch was tested with Chrome's touch emulation.
