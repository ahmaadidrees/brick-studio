# Code Lab — step 5: the Hero in open blocks, behind feel tests

Build step 5 of [the spec](../../CODE-LAB-BRICK-MODEL.md): the Hero's movement moves into open blocks, but only where feel tests prove it still feels like today's game. A broad pass that changed physics and UI together was once reverted because the game stopped feeling right, so this step is measurement-first and changes **nothing** in `packages/platformer-core`, the old `/2d/lab`, or the live 2D game.

**Today's feel** is `packages/platformer-core/src/engine/feel.ts` (`DEFAULT_FEEL`, Super Mario Bros. 3-shaped). It runs at **60 frames per second in subpixels** (`SUB = 256`), with a test harness in `engine/testHarness.ts` (`harness(level).step(input)`). Code Lab scripts run at **30 ticks per second** (decision 3). Each tick covers two old frames, so speeds per tick are 2× and accelerations per tick² are about 4×. Integration differences are expected; how big they get is what this step measures.

**Decision 3 says the 30 vs 60 choice becomes final only after this measurement.** If the open-block Hero can't land inside the tolerances below at 30 ticks per second, report the gap with numbers. That's a product decision for the owner, not something a lane decides.

Integration branch `claude/code-lab-core`. Each lane works on its own branch and worktree, forked from the step 5 brief commit.

## Already done by the integrator

Platformer stack blocks now count as a visible change. A non-warp `forever { change y speed by -1 }` runs **once per tick** (test: `core/platformer.test.ts` "pacing"). An open-block Hero can therefore do its own per-tick math.

## Shared conventions

- **Controls:** left/right arrows, **space** = jump, **x** = run. The old engine's `PlayerInput` maps as `left`, `right`, `jump`, `jumpPressed` (the first tick space is down), `run`, and `down`.
- **Hero brick:** a 16 × 16 visible box. The old player's collision box (check `player.ts`) decides the exact opaque rectangle, so landing heights compare 1:1.
- **Units:** both engines use 1 art pixel = 1 step and y up in Code Lab. The old engine is y-down; convert in exactly one function in the harness.

## Feel metrics and tolerances (the acceptance tests)

Each metric is measured on a flat floor with nothing nearby, from a standing start unless noted, in pixels and seconds. Tolerances are first proposals; report the actual numbers either way.

| Metric | How | Tolerance |
| --- | --- | --- |
| Walk top speed, run top speed, P-speed | hold → (and run) for 3 s; steady speed, px/s | ±3% |
| Time to walk top speed, run top speed, P-speed | from standing | ±1 tick (33 ms) |
| Stopping distance from walk, run and P-speed | release all keys at top speed | ±2 px |
| Skid: distance to reverse from run | hold the opposite direction at run speed | ±3 px |
| Jump apex: tap jump (1 tick), standing | max height above the floor | ±2 px |
| Jump apex: hold jump, standing / walking / running / P-speed | jump0..jump3 with hold gravity | ±2 px |
| Airtime for each jump above | takeoff to landing | ±1 tick |
| Horizontal distance of a running and a P-speed jump | takeoff to landing | ±4 px |
| Max fall speed | drop from high up | ±3% |
| Coyote time | still jumps when pressed N ms after walking off a ledge | ±1 tick |
| Jump buffer | jump pressed N ms before landing still jumps | ±1 tick |
| Wall slide speed, wall jump | if expressible; otherwise a known gap with the reason | report |

Out of scope, recorded as known gaps: springs, stomps, bounce blocks, corner nudge.

## Lanes

### harness: measure the old engine and compare
Files: everything under `src/platformer/lab/feel/` (new).
- `metrics.ts`: input scripts for every metric above, as sequences of `{ left, right, jump, run, down }` per **60 Hz frame**, plus functions that compute each metric from a trajectory (`{ t_ms, x, y, onGround }[]`).
- `oldEngine.ts`: run those inputs through `platformer-core`'s `harness()` on a flat test level built in code, and return the trajectory. **Read-only use of platformer-core:** import from it, never edit it.
- `adapter.ts`: the interface `HeroRunner = (inputs per 60 Hz frame) => trajectory`. Also a runner for a Code Lab `LevelDesign` plus hero brick through `play()`:
  - feed the inputs at 30 ticks/s: each tick gets the OR of its two frames, and `jumpPressed` holds if either frame has it;
  - map keys to `pressKey`/`releaseKey`;
  - sample position after each tick.
- `report.ts` and `feel.test.ts`:
  - compute every metric for the old engine and **sanity-check it against `feel.ts`** (for example, the old walk top speed must be `walkMax × 60` px/s);
  - include a comparison runner that takes any `HeroRunner` and writes `docs/qa/code-lab-core/FEEL.md`, with a table of old value, new value, difference, tolerance and pass/fail;
  - until the Hero lane merges, run the comparison against the starter's simple **Jumper** as a stand-in hero, to prove the plumbing. It's expected to fail most tolerances; mark those `it.fails` with a comment.

### hero: the Hero brick in open blocks
Files: everything under `src/platformer/lab/studio/hero/` (new).
- `heroBrick.ts`: a `BrickDef` factory and its Blockly workspace JSON, made only of Scratch blocks plus the existing Platformer blocks:
  - turn platformer gravity **off** and compute `y speed` itself each tick, so it can use hold gravity vs fall gravity;
  - walk/run acceleration, release deceleration, skid, the P-meter (fill/drain frames), jump0..3 picked by speed, hold vs fall gravity, max fall, coyote time and jump buffer through counters, and wall slide/jump if bump hats make it expressible;
  - every tunable number is a **named local variable with `showInBuild`** (walk max, run max, jump power, gravity, …), converted to per-tick units with the conversion written next to it;
  - split the program into readable scripts and My Blocks ("walk", "jump", "fall") so a kid can open it and understand it.
- `heroBrick.test.ts`, kid-visible:
  - compiles with no errors and validates in a design;
  - on a flat floor it walks, runs and jumps;
  - its numbers match the targets **you derive from `feel.ts`** (write the derivation in the test), within the tolerances above.
- Don't add new core blocks. If the Hero truly can't be expressed with what exists (for example, sensing a wall to slide on), write the exact block you'd need in your report.
- `heroLevel.ts`: a tiny flat test level with the Hero, for the harness lane to plug in. Export `createHeroTestDesign()`.

## Rules

[`WAVE2.md`](WAVE2.md)'s rules apply (own only your files, deterministic core, clean room, tests, report, no push or merge). Never edit `packages/platformer-core`, `core/**`, `studio/starter.ts` or `studio/store.ts`. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Reports go in `docs/qa/code-lab-core/reports/step5-<lane>.md`, and every number in them comes from a test you ran.
