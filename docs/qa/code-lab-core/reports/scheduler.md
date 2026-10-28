# Scheduler Lane Report: Code Lab Core (Wave 1)

## 1. What Was Built

The scheduler lane owns the core runtime execution engine, thread sequencer, control flow, hat triggers, broadcast dispatching, and custom procedure execution.

### Key Implementations
- **`Runtime` class** (`src/platformer/lab/core/runtime.ts`):
  - Implements the complete `RuntimeApi` contract (`step`, `greenFlag`, `pressKey`, `releaseKey`, `clickTarget`, `broadcast`, `startStack`, `startHats`, `addClone`, `removeClone`, `stopTarget`, `stopAll`, `stop`, `nowMs`, `random`, `requestRedraw`, `threads`, `emit`, `findOriginal`).
  - **Thread Sequencer & Sweeps**: Implements the multi-sweep scheduling model of Scratch 3. Evaluates runnable threads per sweep, resetting `STATUS_YIELD` between sweeps within the op budget, and halts subsequent sweeps if a redraw was requested (`requestRedraw()`) unless `turbo` mode is enabled.
  - **Deterministic Op Budgeting**: Governed by `opBudget` (default `DEFAULT_TICK_OP_BUDGET = 20_000` ops/tick) and `WARP_OP_LIMIT = 200_000` ops/warp invocation. When a warp script exceeds `WARP_OP_LIMIT`, it requests a redraw and yields.
  - **Yield Tick**: Implements `YIELD_TICK`, allowing primitives to yield for the remainder of the tick rather than resuming on subsequent sweeps of the same tick (F07).
  - **Hat Launch Ordering & Retriggers**:
    - Enumerates targets in reverse executable order (`[...targets].reverse().concat([stage])`) and scripts in forward declaration order (F13).
    - Respects distinct retrigger policies: green flag stops all and resets state; key press does not restart active threads (`restartExistingThreads = false`); sprite/stage clicks and broadcasts restart active threads; clone starts do not restart; edge-triggered hats (`event_whengreaterthan`) fire on strictly `false -> true` transitions without restarting active scripts (H01–H09).
    - Stack clicks created via `startStack` run independently without interference from `startHats` (H10).
  - **Broadcasts**:
    - Fire-and-forget `event_broadcast` starts matching receiver hats (case-insensitive) and executes new work appended in the current sweep (F15).
    - `event_broadcastandwait` yields the sender thread until all initiated receiver threads finish execution (H06).
  - **Control Flow**:
    - In-engine handling for `control_if`, `control_if_else`, `control_repeat`, `control_forever`, `control_repeat_until`, `control_while`, `control_wait`, `control_wait_until`, and `control_stop`.
  - **Procedures (Custom Blocks)**:
    - Snapshot parameter evaluation at call site (P01).
    - Parameter lookup bounded strictly to the nearest procedure call frame (P02).
    - Missing procedure definitions act as no-ops; orphan or missing parameters evaluate to default empty string or `0` (P03).
    - Bounded recursion detection in normal mode triggers a screen-refresh yield (P04).
    - Warp mode inheritance across nested calls (P05).
    - Stack unwinding on `control_stop 'this script'` inside procedures to the caller site (P06), or thread termination when called at top level (P07).
  - **Scratch Type Casting Utilities**:
    - `toNumber`, `toBoolean`, `toString` with Scratch-compatible whitespace trimming, numeric parsing, case-insensitive boolean conversions, and `-0` handling.

---

## 2. Fixture Coverage Table

Every fixture assigned to the scheduler lane in `LANES.md` (§1.1, §1.2, §1.9) is covered by a passing test in `src/platformer/lab/core/runtime.test.ts`:

| Fixture ID | Topic | Test Name in `runtime.test.ts` | Status |
| --- | --- | --- | --- |
| **F01** | 30 vs 60 | `F01 · 30 vs 60` | Passed |
| **F02** | Work budget | `F02 · Work budget` | Passed |
| **F03** | Straight-line scripts | `F03 · Straight-line scripts` | Passed |
| **F04** | Loop iteration yields | `F04 · Loop iteration yields` | Passed |
| **F05** | Redraw | `F05 · Redraw` | Passed |
| **F06** | Hidden motion | `F06 · Hidden motion` | Passed |
| **F07** | Ordinary yield vs yield-tick | `F07 · Ordinary yield vs yield-tick` | Passed |
| **F08** | Wait zero | `F08 · Wait zero` | Passed |
| **F09** | Wait-until | `F09 · Wait-until` | Passed |
| **F10** | Warp | `F10 · Warp` | Passed |
| **F11** | Warp safety | `F11 · Warp safety` | Passed |
| **F12** | Turbo | `F12 · Turbo` | Passed |
| **F13** | Hat launch order | `F13 · Hat launch order` | Passed |
| **F14** | Running thread order | `F14 · Running thread order` | Passed |
| **F15** | Same-frame new work | `F15 · Same-frame new work` | Passed |
| **F16** | Reporter evaluation | `F16 · Reporter evaluation` | Passed |
| **H01** | Green flag | `H01 · Green flag` | Passed |
| **H02** | Key pressed | `H02 · Key pressed` | Passed |
| **H03** | Sprite clicked | `H03 · Sprite clicked` | Passed |
| **H04** | Stage clicked | `H04 · Stage clicked` | Passed |
| **H05** | Broadcast | `H05 · Broadcast` | Passed |
| **H06** | Broadcast-and-wait | `H06 · Broadcast-and-wait` | Passed |
| **H07** | Clone-start | `H07 · Clone-start` | Passed |
| **H08** | Timer/loudness threshold | `H08 · Timer/loudness threshold` | Passed |
| **H09** | Backdrop changes | `H09 · Backdrop changes` | Passed |
| **H10** | Stack clicks | `H10 · Stack clicks` | Passed |
| **P01** | Arguments | `P01 · Arguments` | Passed |
| **P02** | Nearest call only | `P02 · Nearest call only` | Passed |
| **P03** | Defaults/missing define | `P03 · Defaults/missing define` | Passed |
| **P04** | Recursion | `P04 · Recursion` | Passed |
| **P05** | Warp inheritance | `P05 · Warp inheritance` | Passed |
| **P06** | Stop inside define | `P06 · Stop inside define` | Passed |
| **P07** | Stop at top level | `P07 · Stop at top level` | Passed |

---

## 3. Deliberate Differences from Scratch

1. **Instruction-Budget Scheduling Instead of Real Wall-Clock Deadlines**:
   - In vanilla Scratch, the sequencer stops outer sweeps after `WORK_TIME` (~25 ms) of wall-clock time (`Date.now()`), and warp procedures yield after 500 ms wall-clock time.
   - In Code Lab Core, execution is budgeted strictly by op count (`opBudget` default 20,000 ops, `WARP_OP_LIMIT` 200,000 ops). This ensures 100% deterministic simulation, replayability, and consistent headless test execution independent of CPU speed or system load.
2. **Deterministic Discrete Step Time**:
   - `nowMs()` is strictly `world.tick * TICK_MS` (at 30 TPS, exactly 33⅓ ms per tick).
   - Timers advance deterministically on tick boundaries rather than tracking continuous hardware clock drift.
3. **Exact Timer Edge-Detection**:
   - Edge-triggered hats evaluating `TIMER > VALUE` compute timer seconds as `(world.tick - world.timerStartTick) / TICKS_PER_SECOND` to prevent IEEE 754 precision drift on exact second boundaries.
4. **Synchronous Cooperative Primitives**:
   - Rather than arbitrary unmanaged JS Promises or microtask queues, asynchronous primitive operations yield cooperatively using `YIELD` (yield for current sweep) or `YIELD_TICK` (yield until next tick).

---

## 4. Contract Change Requests

- **Add `YIELD_TICK` to `contracts.ts`**:
  - `contracts.ts` currently defines `export const YIELD: unique symbol = Symbol('core.yield')` and `export type PrimitiveResult = Value | void | typeof YIELD`.
  - Fixture `F07` specifies distinguishing ordinary yields from yield-tick (`STATUS_YIELD` vs `STATUS_YIELD_TICK`).
  - Request: Add `export const YIELD_TICK: unique symbol = Symbol('core.yieldTick')` and update `export type PrimitiveResult = Value | void | typeof YIELD | typeof YIELD_TICK` in `src/platformer/lab/core/contracts.ts` so primitives can yield for the full tick without type assertions.

---

## 5. Open Questions

1. **Audio / Loudness Sensor**:
   - In `event_whengreaterthan` with `WHENGREATERTHANMENU === 'LOUDNESS'`, current implementation returns 0 because audio input is not present in the headless core world state. When microphone/audio input is integrated in a later wave, a sensor field in `world` should supply the current loudness level.
2. **Clone Scope for `stop other scripts in sprite`**:
   - Currently, `control_stop` with option `'other scripts in sprite'` stops only the other scripts belonging to the exact `Target` instance running the block, which corresponds to Scratch's sprite instance model. If design requires stopping sibling clones instantiated from the same `brickId`, that policy can be extended via a configurable flag.
