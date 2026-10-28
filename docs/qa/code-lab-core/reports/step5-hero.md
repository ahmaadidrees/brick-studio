# Step 5, hero lane: the Hero in open blocks

Branch `claude/s5-hero`. Files: `src/platformer/lab/studio/hero/` (`heroBrick.ts`, `heroLevel.ts`, `heroBrick.test.ts`) and this report. Nothing in `packages/platformer-core`, `core/**`, `starter.ts` or `store.ts` changed, and no core block was added.

Result: every metric in the STEP5 table lands inside its tolerance at **30 ticks per second**, including wall slide and wall jump. No `it.fails` was needed. Every number below was printed by `heroBrick.test.ts` (43 tests, all passing; `npx tsc --noEmit -p tsconfig.app.json` is clean).

## The Hero's program, in words

Gravity is **off** (`turn gravity [off]`), so the Platformer physics step only moves the Hero by its own `x speed` and `y speed` and stops it at solids. One `forever` loop runs once per tick and calls six My Blocks in order. The loop yields once per tick because `fall` always runs `change y speed by` (a visible Platformer change).

- **when flag clicked**: gravity off, rotation style left-right, x speed 0, y speed 0, then `forever { read keys, feel the wall, walk, run meter, jump, fall }`.
- **read keys**: `arrow` is +1 for right, -1 for left, 0 for both or neither. `running` is 1 while x is held. A press of space (the first tick it is down) starts the early-jump timer (`early jump left = early jump ticks + 1`). `steer` is `arrow`, except for a few ticks after a wall jump when steering back into the wall is ignored.
- **feel the wall**: a wall slide needs "not on ground, not rising, pushing an arrow, and a wall on that side". The only way to sense a wall is the bump hats, which leave a note in `wall hit`. If the note matches the arrow, `wall side` is set and a short `wall late left` timer starts. The note is cleared each tick and the bump hats set it again if the Hero is still pushing.
- **walk** (mirrors `player.ts` "Horizontal speed"): `top speed now` is walk top speed, run top speed, or p speed (p speed needs a full run meter on the ground, or a p-speed takeoff in the air). With no arrow, friction on the ground only. With an arrow the Hero is standing still or going that way: add walk, run or air push up to the top speed, or on the ground above it slow down by friction. Against its way: skid on the ground, air turn in the air. It also points left or right.
- **run meter**: on the ground, while running flat out (x held, moving the way it steers, within `meter slack` of run top speed) `meter timer` counts up and every `meter fill ticks` the `run meter` goes up by 1 to 7. Otherwise it drains by 1 every `meter drain ticks`. 7 means p speed.
- **jump**: refill `late jump left` while on the ground and count it down in the air. If a press is waiting and the Hero is on the ground or has late jump left: the takeoff speed is picked by `|x speed|` (standing, walking, running, p speed), `float gravity now` is picked too (slow for standing and walking, fast for running and p speed), and `p jump` remembers whether the meter was full. If it is in the air but touching a wall (or just left one): wall jump, with x speed away from the wall, y speed up, a steer lock and the slow float gravity. A press that cannot jump yet stays live for `early jump ticks` ticks.
- **fall**: while rising with space held, gravity is `float gravity now`; otherwise `fall gravity`. When y speed is no longer upward `jumping` ends. y speed is clamped to `top fall speed`, or `wall slide speed` while grabbing a wall (shedding half the excess, at least `wall shed`, per tick).
- **hit a wall** (called by `when I bump [left]` and `when I bump [right]` of anything, after they set `wall hit`): the run meter drops by 2 if it is on the ground, as in `player.ts`.

## Variables (all local, `showInBuild`), per-tick values at 30 ticks/s

Conversion: speed (px/frame to px/tick) x 2; acceleration (px/frame² to px/tick²) x 4; frames to ticks / 2. Accelerations are first rounded to whole 1/256 px, as the engine does (`sub()`), so e.g. `0.0547` is really 14/256. Each row's conversion is also written in `HERO_KNOBS` in `heroBrick.ts`, and the test "Every knob equals today's feel" re-derives all of them from `DEFAULT_FEEL`.

| Variable | Per tick | Derivation |
| --- | --- | --- |
| walk top speed | 3 | walkMax 1.5 x 2 |
| run top speed | 5 | runMax 2.5 x 2 |
| p speed | 7 | pMax 3.5 x 2 |
| walk push | 0.21875 | walkAccel 14/256 x 4 |
| run push | 0.25 | runAccel 16/256 x 4 |
| air push | 0.21875 | airAccel 14/256 x 4 |
| friction | 0.21875 | releaseDecel 14/256 x 4 |
| skid | 0.5 | skidDecel 32/256 x 4 |
| air turn | 0.375 | airTurn 24/256 x 4 |
| meter slack | 0.125 | the 0.0625 px/frame below run top speed that still fills the meter x 2 |
| meter fill ticks | 4 | pFillFrames 8 / 2 |
| meter drain ticks | 12 | pDrainFrames 24 / 2 |
| meter full | 7 | P_SEGMENTS |
| jump standing | 8.125 | jump0 4.0 x 2 = 8, plus a quarter of float gravity slow (0.5) = 0.125, the tick correction (below) |
| jump walking | 8.625 | jump1 4.25 x 2 = 8.5, plus 0.125 |
| jump running | 9.63671875 | jump2 4.75 x 2 = 9.5, plus a quarter of float gravity fast (0.546875) = 0.13671875 |
| jump at p speed | 10.13671875 | jump3 5.0 x 2 = 10, plus 0.13671875 |
| walking jump from / running jump from / p jump from | 2 / 4.5 / 6.5 | tier speeds 1, 2.25, 3.25 px/frame x 2 |
| float gravity slow | 0.5 | holdSlow 32/256 x 4 |
| float gravity fast | 0.546875 | holdFast 35/256 x 4 |
| fall gravity | 1.5 | fallGravity 96/256 x 4 |
| top fall speed | 8.5 | maxFall 4.25 x 2 |
| late jump ticks | 3 | coyoteFrames 4. The old Hero allows a late jump up to 3 frames (1.5 ticks) after the ledge. 3 here allows 2 ticks. |
| early jump ticks | 3 | bufferFrames 5. The old Hero counts a press up to 4 frames (2 ticks) before landing. 3 here counts 2 ticks. |
| wall slide speed | 2 | wallSlideMax 1.0 x 2 |
| wall shed | 1.5 | the 0.75 px/frame least shed x 2 |
| wall jump push / up | 4 / 8 | wallJumpX 2.0, wallJumpY 4.0 x 2 |
| wall jump lock ticks | 5 | wallJumpLock 9 / 2 = 4.5, rounded up |
| wall late ticks | 2 | WALL_COYOTE 5 / 2 = 2.5, rounded down |

**The tick correction.** With one step per tick instead of two, a rising Hero lands `gravity x ticks` pixels lower than the old Hero (it covers `v_k` per tick, the old Hero covered `v_k + g/4`). That put the three held-jump apexes 2.1 to 2.5 px low, just outside the 2 px tolerance. Adding `g/4` to the jump speed fixes the whole rise exactly (apexes now match to the pixel). It is a visible tunable, not a hidden one, and it is the only value that is not a pure unit conversion.

## Targets vs measured

Targets come from running today's real Hero (`packages/platformer-core` `harness`, `DEFAULT_FEEL`, read-only) with the same inputs. The test also derives the closed-form targets from `feel.ts` and requires the engine to agree (walk, run and P top speed = walkMax, runMax, pMax x 60 px/s; max fall = maxFall x 60 px/s). Inputs are keys held for N ms, so a tick is two frames.

| Metric | Test | Target (old) | Measured (open blocks) | Tolerance | Result |
| --- | --- | --- | --- | --- | --- |
| Walk top speed | Speeds: walk top speed | 90 px/s | 90 px/s | 3% | pass |
| Run top speed (plateau at 1 s) | Speeds: run top speed | 150 px/s | 150 px/s | 3% | pass |
| P-speed (3 s) | Speeds: P-speed | 210 px/s | 210 px/s | 3% | pass |
| Time to walk top speed | Time to top speed: walk | 466.7 ms | 466.7 ms | 33.3 ms | pass |
| Time to run top speed | Time to top speed: run | 666.7 ms | 666.7 ms | 33.3 ms | pass |
| Time to P-speed | Time to top speed: P-speed | 1833.3 ms | 1833.3 ms | 33.3 ms | pass |
| Stop from walk | Stopping distance: from walk speed | 19.83 px | 19.09 px | 2 px | pass (0.73 off) |
| Stop from run | Stopping distance: from run speed | 55.90 px | 54.66 px | 2 px | pass (1.24 off) |
| Stop from P-speed | Stopping distance: from P-speed | 110.25 px | 108.50 px | 2 px | pass (1.75 off, the tightest) |
| Skid from run | Skid: distance to reverse from run speed | 23.75 px | 22.50 px | 3 px | pass |
| Apex, tap, standing | Jumps: apex and airtime: tap, standing | 24.50 px | 23.25 px | 2 px | pass |
| Apex, tap, one old frame | Jumps: a one-frame tap on the old engine | 22.00 px | 23.25 px | 2 px | pass (a tick cannot see half a tick) |
| Apex, hold: standing / walking / running / P-speed | Jumps: apex and airtime: hold, ... | 62.00 / 70.13 / 80.15 / 88.95 px | 62.00 / 70.13 / 80.15 / 88.95 px | 2 px | pass (exact) |
| Airtime: tap / standing / walking / running / P-speed | same tests | 366.7 / 850.0 / 916.7 / 966.7 / 1033.3 ms | 366.7 / 866.7 / 933.3 / 966.7 / 1033.3 ms | 33.3 ms | pass (one tick off at most) |
| Jump distance, running / P-speed | Jumps: horizontal distance | 147.5 / 220.5 px | 150.0 / 224.0 px | 4 px | pass (2.5 and 3.5 off) |
| Max fall speed | Falling...: max fall speed | 255 px/s | 255 px/s | 3% | pass |
| Coyote time | Falling...: coyote time | 50.0 ms | 66.7 ms | 33.3 ms | pass (16.7 ms over; only whole ticks are possible) |
| Jump buffer | Falling...: jump buffer | 66.7 ms | 66.7 ms | 33.3 ms | pass |
| Wall slide speed | Walls: slides down a wall | 60 px/s | 60 px/s | 3% | pass |
| Wall jump apex above the press | Walls: pushes off the wall | 36.00 px | 36.00 px | 2 px | pass |
| Wall jump push-off speed | same test | 120 px/s | 120 px/s | 3% | pass |

## Kid-visible tests (all passing)

Compiles with no diagnostics; validates in a design (plain and with a ledge, wall, and a high start); uses only Scratch blocks and the seven Platformer blocks, with gravity off; opens in the real Blockly editor; is split into the seven My Blocks; shows every tunable as a Build knob with its conversion; costume is 16 x 16 with the old player's 12 x 14 opaque box standing on the floor; stands still; walks right and left; faces the way it walks without changing its box; runs faster when x is held; jumps and lands; jumps higher with space held than with a tap; jumps farther and higher when running; does not jump again while space stays held; gets a late jump and an early jump; stops against a wall and does not tunnel the floor.

## Gaps and findings

1. **Integration at 30 ticks/s is an approximation, not exact.** Largest remaining differences: stopping distance 1.75 px from P-speed (inside 2 px but tight), skid 1.25 px, tap apex 1.25 px, jump distance up to 3.5 px (limit 4), airtime one tick on three jumps. The 30 vs 60 decision is not blocked by any metric, but if the tolerances are tightened, stopping distance and jump distance are the first to fail.
2. **Coyote time is 66.7 ms vs 50 ms** (the old 1.5-tick window cannot be hit with whole ticks; 1 tick would be 33.3 ms, equally far).
3. **Wall slide and wall jump are expressed through the bump hats, with latency.** Wall sensing arrives through `when I bump [left/right] of [anything]`, which starts a script for the next tick, so the Hero learns about a wall 2 ticks after contact and the slide clamp starts 2 ticks later than the old Hero's. The measured steady slide speed and wall jump match; the first ticks of a grab can fall a bit faster. The old Hero also needs the box to sit exactly flush with a tile edge; here any left/right bump counts. Level edges count as walls (they do in the old engine too). The exact block that would remove the latency is a boolean `touching wall [left v]?` (opcode `platformer_touchingwall`, field `SIDE` left/right), true when the box is flush against a solid or level wall on that side this tick. It is not needed for the metrics.
4. **The editor does not persist My Block names.** `core/editor/definitions.ts` defines `procedures_definition` without saving `extraState`, so after any edit in the real editor the seven My Blocks come back as "unnamed" (bodies kept). The Hero's workspace JSON as shipped is correct and compiles, but a kid editing it in the editor would see the names lost. That is an editor-lane issue; I did not touch it. `heroBrick.test.ts` records it and checks the other things survive.
5. **Out of scope, as STEP5 says:** springs, stomps, bounce blocks, corner nudge. Also not modelled: crouch and power-ups, skid dust and sound, riding moving platforms, death and respawn, and `jumpPressed` timing finer than a tick.
6. **Order of the bump hats vs the loop within a tick:** the "hit a wall" meter penalty and the wall note run in the sweep after the loop (hat threads start after it). This matches the old behavior to within a tick and no metric covers it.
7. **Starting the Hero again from the flag:** the Hero's working variables persist when the flag is clicked again (flag keeps values, per H01). Press Play to restart from the saved design; a flag-only restart can keep a stale run meter. Not hit by any test.
8. `createHeroTestDesign(options?)` accepts optional `{ heroY, floorEnd, wall }` for ledge, drop and wall tests; with no arguments it is the plain flat 1920 x 360 level (floor top y = 16, Hero standing at x = 40, y = 24, box 12 x 14 around x = 34..46).
9. The Code Lab level has its own floor at y = 0 (`walls.bottom`), 16 px below the test floor, so a hero walking off the test ledge lands there after about 5 ticks. The late-jump test only looks at the first 100 ms and ignores anything after the first touchdown.
