# Step 5, harness lane: report

Branch `claude/s5-harness`. Everything is in `src/platformer/lab/feel/` plus the generated `docs/qa/code-lab-core/FEEL.md`. Nothing in `platformer-core`, `core/**` or `studio/**` was touched. `npx vitest run src/platformer/lab` (662 passed, 25 expected fail) and `npx tsc --noEmit -p tsconfig.app.json` are clean.

## What was built

| File | Job |
| --- | --- |
| `metrics.ts` | Input scripts per 60 Hz frame, trajectory metric functions, the metric table with tolerances (`METRICS`), `measureAll(runner)` and `compare(old, new)`. Engine-agnostic. |
| `oldEngine.ts` | `oldEngineRunner()`: platformer-core `harness()` on flat levels built in code (flat, ledge, drop, wall). The only y-down to y-up conversion is `toSample`. |
| `adapter.ts` | `HeroRunner` plumbing and `codeLabRunner(options)`: `play(design)`, 30 ticks/s, each tick's keys are the OR of its two frames, `pressKey`/`releaseKey` only on change, sample after every tick. |
| `jumperStandIn.ts` | The starter's Jumper on Ground only, as the stand-in hero. |
| `target.ts` | The integrator's single swap point (see below). |
| `report.ts` | `expectedFromFeel()` (what feel.ts implies for each metric) and `renderFeelMarkdown()`. |
| `feel.test.ts` | Old-engine sanity checks, plumbing, Jumper stand-in (`it.fails`), Hero acceptance (skipped until plugged in), FEEL.md writer. |
| `node-shim.d.ts` | Type shim so the test can write FEEL.md (tsconfig.app excludes @types/node). |

Both engines go through the same `measureAll(runner)`, so the old and new columns are computed identically.

## Old engine's numbers (each from `feel.test.ts`, "old engine metrics vs feel.ts")

All match the closed-form values from `feel.ts` (checked with `expectedFromFeel`, within 0.01).

| Metric | Measured | Derivation from feel.ts |
| --- | ---: | --- |
| Walk top speed | 90 px/s | walkMax 1.5 x 60 |
| Run top speed | 150 px/s | runMax 2.5 x 60 |
| P-speed | 210 px/s | pMax 3.5 x 60 |
| Time to walk top | 466.7 ms (28 frames) | ceil(384 / 14 sub) |
| Time to run top | 666.7 ms (40 frames) | 640 / 16 sub |
| Time to P-speed | 1833.3 ms (110 frames) | meter starts at step 39, 7 x 8 frames, then 16 frames of runAccel |
| Stop from walk / run / P | 19.83 / 55.90 / 110.25 px | sum of per-frame speed after releaseDecel |
| Skid, reverse from run | 23.75 px | 20 frames at skidDecel 0.125 |
| Jump apex: tap / stand / walk / run / P | 22.00 / 62.00 / 70.13 / 80.15 / 88.95 px | stepping jump0..3 with hold or fall gravity |
| Airtime: tap / stand / walk / run / P | 366.7 / 866.7 / 933.3 / 983.3 / 1050.0 ms | same stepping |
| Jump distance: run / P | 147.5 / 220.5 px | takeoff speed x airtime frames (59 and 63) |
| Max fall speed | 255 px/s | maxFall 4.25 x 60 |
| Coyote time | 66.7 ms (4 frames) | coyoteFrames |
| Jump buffer | 83.3 ms (5 frames) | bufferFrames |
| Wall slide speed | 60 px/s | wallSlideMax 1.0 x 60 |
| Wall jump apex | 62.00 px | same as the standing hold jump (wallJumpY 4.0, holdSlow) |

Definitions worth knowing:
- Speeds are the plateau speeds of the 3 s walk script and 4 s run script (run needs 4 s so the P-meter has time to fill; the run script has two plateaus, run top first, P last). A plateau is 0.25 s within 0.5%.
- Coyote window is probed by pressing jump `n` frames after the first airborne step (n = 0, 1, ...) until it stops working; window = last working n + 1 frames. Buffer works the same, pressing `n` frames before the landing step.
- Jump apex, airtime and landing are judged from y only (airtime runs from the start of the press frame to the end of the landing step).

Where the old collision box is not 16 x 16: it is 12 wide, 14 high (`PLAYER_W`, `H_SMALL`; 26 when big). Metrics only use differences, so the box offset cancels, but the Hero lane should know the opaque rectangle it needs for landing heights to match 1:1.

## Jumper stand-in

All 25 judged metrics miss tolerance (marked `it.fails`; if one ever passes the test fails loudly). It really measures: walk 120 px/s (4 per tick), no run, no P, stops at once, one jump height of 66 px, 766.7 ms airtime, fall 480 px/s, coyote 16.7 ms, buffer 0. Wall metrics are `n/a` (no wall level). See `FEEL.md`.

## How to plug the Hero in (integrator)

Edit only `src/platformer/lab/feel/target.ts`:

```ts
import { createHeroTestDesign } from '../studio/hero/heroLevel'
export function heroTarget(): ComparisonTarget | null {
  return { name: 'Hero (open blocks)', options: { design: createHeroTestDesign() } }
}
```

Then `npx vitest run src/platformer/lab/feel`. The "Hero acceptance" tests switch on (one test per judged metric, no `it.fails`), and FEEL.md is rewritten with Hero numbers instead of the Jumper's. The Jumper stand-in tests stay (they still use the Jumper).

Requirements on `createHeroTestDesign()`'s design:
- A brick named `Hero` with one painted copy (or pass `heroCopyId` / `heroBrickName`), standing on or just above a wide solid floor at least about 2000 steps to the right of the Hero (the 4 s P-speed run travels roughly 700 steps; the run script holds 4 s).
- Controls as in STEP5.md: left/right arrows, space jump, x run.
- Nothing else nearby.
- Scenarios: `drop` is derived by lifting the Hero copy 200 steps. `ledge` is derived by deleting every other copy whose centre is more than `ledgeOffset` (default 150) steps right of the Hero, so the floor must be made of copies narrower than that grain (the stand-in's 128-wide Ground works; one 960-wide floor copy won't, and then pass `designFor('ledge')`). The pit's bottom is the level's bottom edge, 16 steps below the floor in the starter bounds; a coyote/buffer probe needs a fall of at least 8 frames' worth, so keep the floor at least 16 above the level bottom. `wall` has no default; pass `designFor('wall')` with a tall solid wall just right of the Hero if the Hero can sense walls, otherwise the wall metrics read `n/a` (report-only, a known gap).

The tick rate decision: 30 ticks/s quantises coyote, buffer, airtime and time-to-speed to 33.3 ms, which is exactly the +-1 tick tolerance. The old values for coyote (66.7 ms) and buffer (83.3 ms) are 2 and 2.5 ticks, so the buffer can only be matched to within half a tick of rounding: expect an off-by-one tick there that still passes.

## Known gaps

- Springs, stomps, bounce blocks and corner nudge are not measured (out of scope).
- Wall slide and wall jump are report-only; the Code Lab side needs a wall level and a way for the Hero to sense a wall (the engine's `when I bump [side]` hat may be enough for slide start; a "touching wall on this side?" sensor would be the missing block).
- Sub-pixel rounding: the old engine is integer sub-pixels (1/256 px); Code Lab uses floats, so tiny differences are expected and well inside tolerance.
