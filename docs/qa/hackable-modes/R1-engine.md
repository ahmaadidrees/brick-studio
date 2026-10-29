# R1 under the hood: Hackable Racing's engine parts — October 29, 2026

These are the parts of R1 that kids can't see. The screens are held until the owner's class notes come in:

- the project card and route;
- the Build drawer and inspector;
- touch steering;
- any change to the shared studio UI.

Racing's engine runs headless. The studio still refuses race projects: `KITS.race.ready` is false in
`src/platformer/lab/kits.ts`.

## What landed

1. **The Car, as open blocks** (`studio/race/carBrick.ts`).
   - **The basics:**
     - read the keys (left and right steer, up is gas, down is brake);
     - start each tick with the normal numbers;
     - steer;
     - split speed into forward and sideways;
     - gas and brakes;
     - grip;
     - drive, using the My Block "drive and bounce off barriers".
   - **The feel scripts:** off-road slowdown, grip and drift, and boost pads. Each one can be switched off and the car
     still drives. Tests check this.
   - **Sliders:** four of them show in Build: top speed, acceleration, steering and grip. Every other number is a
     named variable.
   - **The numbers** are car.ts's "Kart" feel, converted to 30 ticks a second:
     - speeds ×2;
     - accelerations ×4;
     - steering ×2;
     - frame counts ÷2;
     - "keep k of it each frame" becomes k² each tick.
   - **Angles** are Scratch directions. Only the operators' `sin` and `cos` are used, which go through detmath.
2. **Laps on grid-brick tracks** (`core/race.ts`). This is `laps.ts` moved over to grid bricks.
   - **Road** is any painted cell whose brick never says `solid [on]`. A kid's Mud brick across the road still laps;
     a kid's wall does not.
   - **The finish line** is the grid brick with `grid.finish`, which holds its direction. That is a new optional
     `GridSpec` field, checked by `validateDesign`.
   - **The three reasons** a track doesn't lap use the race kit's own wording, for the Build chip later.
3. **The Racing blocks**, which work "built in, like touching":
   - `ground under me`;
   - `direction along the track`, which aims like the race kit's autopilot, 4 to 8 cells ahead;
   - `laps done`;
   - `when I finish a lap`;
   - `my place`.

   Racers are the bricks that move themselves, not counting painted cells. The editor has block definitions for all
   five, in a new Racing colour. The toolbox doesn't show them yet.
4. **The beginner track** (`studio/race/raceTrack.ts`).
   - It is 64 × 40 cells, Snowy Oval's size and shape, painted with Road, Dirt, Ice, Barrier, Boost pad and Finish
     line.
   - **Two Computer racers** drive on three blocks: `every tick → point in direction (direction along the track) →
     set gas to (go)`. They are set a little slower than the Car (top speed 5.8 rather than 6.4).
   - **A Starter brick** counts down "3, 2, 1, Go!" and shows "Results: 1. … 2. …".
5. **The kit engine.** `core/index.ts` registers `race` as the Platformer's blocks plus the Racing blocks. Laps are
   counted in `afterTick`.

## Car feel: race kit vs Hackable

All 11 numbers are within the Hero's tolerances on the first run, and no tolerance was loosened. The full table is in
`RACE_FEEL.md`, which `feel/race/carFeel.test.ts` rewrites on every run.

| Measurement | Race kit | Hackable | Tolerance |
| --- | --- | --- | --- |
| Top speed on road | 192.0 steps/s | 192.0 | ±3% |
| Time to top speed | 766.7 ms | 766.7 | ±1 tick |
| Stopping distance from top speed | 33.6 steps | 35.2 | ±2 steps |
| Turning circle at top speed | 110.2 steps | 109.6 | ±4 steps |
| Top speed on grass | 86.4 steps/s | 86.4 | ±3% |
| Top speed on dirt | 144.0 steps/s | 144.0 | ±3% |
| Boost pad: fastest | 304.6 steps/s | 302.1 | ±3% |
| Boost pad: time above 1.1 × top | 666.7 ms | 633.3 | ±1 tick |
| Drift on ice, 0.5 s of full steering | 61.3° | 60.4° | ±3° |
| Drift on ice, 1 s of full steering | 60.4° | 59.5° | ±3° |
| Slide on road, 0.5 s of full steering | 11.8° | 10.3° | ±3° |

### Where it isn't the same

- **Stopping distance is 1.6 steps longer.**
  - That is 80% of the tolerance. A tick moves by the speed after braking, once for two frames.
  - The Hero corrects this kind of gap with a "tick correction" on its jumps. The Car doesn't have one, because the
    gap is a tenth of a brick.
- **Boost pads have no arrow.**
  - A race-kit pad only boosts a car heading roughly its way. A Hackable pad boosts whichever way the car points.
  - Kids can add a check to the Boost pads script.
- **The collision shape is different.**
  - The race-kit car is a circle of radius 5.5 that touches tiles. The Hackable Car is an 11 × 11 box that the
    self-move sweep stops flush.
  - "Drive and bounce off barriers" sets `rotation style [don't rotate]` while it moves. That keeps the box the same
    size whichever way the car points. Otherwise turning beside a barrier would grow the box into it, and the sweep
    lets a box that already overlaps pass through.
  - Bounces aren't feel-tested. The numbers are the race kit's: bounce 0.35, and 0.85 kept along the barrier.
- **Cars don't bump each other.** They aren't solid. The two racers can drive through each other and finish on top of
  one another.
- **The countdown is on a Starter brick, not the Stage.** Scratch's Stage can't `say`.
- **`my place` after finishing.** A finisher that has stopped can be passed on its own lap count by a later finisher.
  The results list is built at the moment each racer crosses the line, so the results are right.

## Tests

- **`feel/race/carFeel.test.ts`** (14 tests):
  - checks of the race kit's own numbers;
  - 11 acceptance measurements;
  - writes `RACE_FEEL.md`.
- **`studio/race/carBrick.test.ts`** (9 tests):
  - the bricks compile with no problems;
  - the four Build sliders;
  - every script is labelled;
  - sin and cos only;
  - each feel script switches off and the car still drives.
- **`studio/race/race.test.ts`** (17 tests):
  - laps parity with `laps.ts`, cell for cell, on the beginner track;
  - the three reasons a track won't lap;
  - kid bricks;
  - start crossings, turning round and cutting the infield don't count;
  - `my place`;
  - `ground under me` (also off the grid, and kid bricks);
  - `direction along the track` round all four sides;
  - a track that doesn't lap.
- **`studio/race/beginnerRace.test.ts`** (7 tests), a whole race with no input:
  - the countdown, one second apart;
  - nobody moves before Go;
  - both racers do 3 laps and stop;
  - results in finishing order;
  - deterministic;
  - saves and reopens.

## Performance

`scripts/qa/race-perf.mjs` runs headless Chrome against a local Vite server. It throttles the CPU through DevTools
(`Emulation.setCPUThrottlingRate`) and runs the beginner race:

- 1,076 painted cells, the Car, two racers and the Starter (1,080 targets).
- It plays on animation frames the way the Stage does: one tick every other frame, and a draw every frame with
  `renderPlayMode` into a 960 × 540 canvas.
- 900 ticks (30 s, 1,799 frames) per rate.
- The host was an Apple M5 Max.

| CPU slowdown | Play start | Tick (step) p50 / p95 / max | Draw p50 / p95 / max | JS per frame p95 / max | Frame interval p95 | Frames over 25 ms |
| --- | --- | --- | --- | --- | --- | --- |
| 1× | 3.1 ms | 0.3 / 0.6 / 1.6 ms | 0.6 / 0.8 / 1.3 ms | 1.3 / 2.6 ms | 16.7 ms | 0 |
| 4× | 13.6 ms | 0.8 / 1.3 / 4.5 ms | 1.9 / 2.4 / 3.9 ms | 3.3 / 8.4 ms | 16.7 ms | 0 |
| 6× | 22.5 ms | 1.0 / 1.8 / 7.9 ms | 2.8 / 3.8 / 7.1 ms | 4.8 / 15.0 ms | 16.8 ms | 0 |

4× and 6× are the usual DevTools stand-ins for mid-range and low-end Chromebooks. None of this was measured on a
Chromebook.

What these numbers mean:

- **At 6× slowdown, the worst frame still fits in a 60 fps frame.** The engine is a small part of each frame. Drawing
  the 1,076 cells is most of it.
- **CPU throttling slows the main thread only.** Rasterising and the GPU run at this Mac's speed, so a real
  Chromebook's drawing will be slower than these numbers. This is still not a measurement on Chromebook hardware.
- **An earlier version of the harness gave a misleading slow tail.** It stepped and drew 1,800 times in one loop,
  without ever yielding to the browser. That showed p95 draws of 38 ms at 4×. Those were deferred canvas flushes
  piling up, not the race's work. The frame-paced numbers above are the ones that count.

Run it again:

```bash
npx vite --port 5196 --strictPort --host 127.0.0.1
```

```bash
RATES=1,4,6 node scripts/qa/race-perf.mjs
```
