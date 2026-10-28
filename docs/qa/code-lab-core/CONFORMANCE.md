# Scratch Conformance Matrix

Generated from the tests in `src/platformer/lab/core/conformance/` after the wave 3 conformance-honesty pass. It replaces the wave 2 table, which overstated coverage (see [`CONFORMANCE-AUDIT.md`](CONFORMANCE-AUDIT.md)). Fixture IDs, topics and section headings are copied from `research/code-lab/01-scratch-runtime-semantics.md`. Every row names the tests that back it; a row with no test would not appear.

All tests run the fixture recipe through the real runtime (`createRuntime` with `ALL_PRIMITIVES`, via `conformance/harness.ts`), not through the fake testkit. Time is the injected tick clock and the RNG is stubbed where a fixture needs it (no wall clock, no `Math.random`).

## Status key

- **VERIFIED**: every listed test passes and asserts the fixture's expected result. Sub-cases the tests do not cover are listed under Notes as "Not asserted".
- **KNOWN-DIFF**: Code Lab deliberately differs from Scratch (reason in Notes); the test asserts Code Lab's actual behavior.
- **FAILS-PENDING-FIX**: the correct Scratch behavior is written as an `it.fails(...)` test that currently fails because of a runtime bug the runtime-fixes lane is fixing (or, for the picker, the stage-camera lane). The integrator flips each `it.fails` to `it` after the merge; the row's other tests pass today.

## Summary

| Status | Count |
|:---|---:|
| VERIFIED | 105 |
| KNOWN-DIFF | 3 |
| FAILS-PENDING-FIX | 0 |
| **Total fixtures** | **108** |

Wave 3 fixed the eight fixtures that were FAILS-PENDING-FIX (F02, F05, F08, F11, F14, H04, H05, L06): their `it.fails` tests now pass as ordinary tests. The runtime-fixes lane's regression tests are in `core/conformance/regressions.test.ts`. F08 covers `wait 0` inside warp; a positive `wait` inside warp still yields to the next tick (documented in `reports/wave3-runtime-fixes.md`).

Wave 1 unit tests (`core/*.test.ts`) exist for many of these fixtures too. They are not cited here; only the conformance suite backs a row.

---

## §1.1 · Frame loop, work budget, yielding, and ordering (F01–F16)

| ID | Topic | Status | Tests | Notes |
|:---|:---|:---:|:---|:---|
| F01 | 30 vs 60 | **VERIFIED** | `frame.test.ts` "F01 · 30 vs 60" | 30 ticks per second only; Scratch's 60 default interval is not modeled (by design). |
| F02 | Work budget | **VERIFIED** | `frame.test.ts` "F02 · Work budget (KNOWN-DIFF: an op-count budget, not 75% of step time)"<br>`frame.test.ts` "F02 · an overrun thread does not starve later threads in the same sweep" (`it.fails`) | Also a KNOWN-DIFF: the budget is an op count (`DEFAULT_TICK_OP_BUDGET`), not 75% of step time. The it.fails test is runtime-fixes bug 1 (budget checked mid-sweep starves later threads). |
| F03 | Straight-line scripts | **VERIFIED** | `frame.test.ts` "F03 · Straight-line scripts" |  |
| F04 | Loop iteration yields | **VERIFIED** | `frame.test.ts` "F04 · Loop iteration yields" |  |
| F05 | Redraw | **VERIFIED** | `frame.test.ts` "F05 · Redraw"<br>`frame.test.ts` "F05 · a heavy redrawing thread still lets the next thread take its turn" (`it.fails`) | it.fails: runtime-fixes bug 1 (a heavy thread that burns the tick budget starves the next thread in the sweep). |
| F06 | Hidden motion | **VERIFIED** | `frame.test.ts` "F06 · Hidden motion" |  |
| F07 | Ordinary yield vs yield-tick | **VERIFIED** | `frame.test.ts` "F07 · Ordinary yield vs yield-tick" |  |
| F08 | Wait zero | **VERIFIED** | `frame.test.ts` "F08 · Wait zero"<br>`frame.test.ts` "F08 · wait zero inside a warp procedure is revisited in the same tick" (`it.fails`)<br>`frame.test.ts` "F08 · wait zero inside a warp procedure still completes, in order, within two ticks" | The non-warp case is verified. it.fails (audit item 4): inside a warp procedure Scratch revisits `wait 0` in the same tick, Code Lab yields to the next tick. If runtime-fixes keeps this, flip the status to KNOWN-DIFF. |
| F09 | Wait-until | **VERIFIED** | `frame.test.ts` "F09 · Wait-until" |  |
| F10 | Warp | **VERIFIED** | `frame.test.ts` "F10 · Warp"<br>`frame.test.ts` "F10 · Warp ask-and-wait stays suspended until an answer" |  |
| F11 | Warp safety | **VERIFIED** | `frame.test.ts` "F11 · Warp safety (KNOWN-DIFF: an op limit, not 500 ms)"<br>`frame.test.ts` "F11 · a heavy warp render loop does not starve a sibling script" (`it.fails`) | Also a KNOWN-DIFF: the cutoff is `WARP_OP_LIMIT` ops, not 500 ms. it.fails: runtime-fixes bug 1 (the audit's `forever { call render }` starves a sibling script). |
| F12 | Turbo | **VERIFIED** | `frame.test.ts` "F12 · Turbo" |  |
| F13 | Hat launch order | **VERIFIED** | `frame.test.ts` "F13 · Hat launch order" |  |
| F14 | Running thread order | **VERIFIED** | `frame.test.ts` "F14 · Running thread order"<br>`frame.test.ts` "F14 · a restarted hat thread keeps its place in the queue" (`it.fails`) | The layer-change half is verified. it.fails: runtime-fixes bug 2 (a restarted hat is moved to the end of the thread queue). |
| F15 | Same-frame new work | **VERIFIED** | `frame.test.ts` "F15 · Same-frame new work" |  |
| F16 | Reporter evaluation | **VERIFIED** | `frame.test.ts` "F16 · Reporter evaluation" |  |

## §1.2 · Hats, retriggers, and broadcasts (H01–H10)

| ID | Topic | Status | Tests | Notes |
|:---|:---|:---:|:---|:---|
| H01 | Green flag | **VERIFIED** | `hats.test.ts` "H01 · Green flag" |  |
| H02 | Key pressed | **VERIFIED** | `hats.test.ts` "H02 · Key pressed" |  |
| H03 | Sprite clicked | **VERIFIED** | `hats.test.ts` "H03 · Sprite clicked" |  |
| H04 | Stage clicked | **VERIFIED** | `hats.test.ts` "H04 · Stage clicked (hat restart)"<br>`hats.test.ts` "H04 · picking: the front-most opaque sprite is picked, and only it"<br>`hats.test.ts` "H04 · picking: a hidden front sprite is not picked"<br>`hats.test.ts` "H04 · picking: a fully ghosted front sprite is not picked" (`it.fails`) | Hat restart and picking (front-most opaque, hidden skipped) are verified; the picking tests call `studio/stage/picking.ts` `pickTarget`. it.fails: a fully ghosted sprite is still picked (runtime-fixes bug 3 / stage-camera lane). |
| H05 | Broadcast | **VERIFIED** | `hats.test.ts` "H05 · Broadcast"<br>`hats.test.ts` "H05 · a restarted receiver keeps its place in the thread order" (`it.fails`) | it.fails: runtime-fixes bug 2 (a restarted receiver is moved to the end of the thread queue). |
| H06 | Broadcast-and-wait | **VERIFIED** | `hats.test.ts` "H06 · Broadcast-and-wait" |  |
| H07 | Clone-start | **VERIFIED** | `hats.test.ts` "H07 · Clone-start" |  |
| H08 | Timer/loudness threshold | **VERIFIED** | `hats.test.ts` "H08 · Timer/loudness threshold" | Not asserted: a re-trigger while the handler is still running (research lists it as unresolved). |
| H09 | Backdrop changes | **VERIFIED** | `hats.test.ts` "H09 · Backdrop changes" |  |
| H10 | Stack clicks | **VERIFIED** | `hats.test.ts` "H10 · Stack clicks" |  |

## §1.3 · Clone inheritance and lifecycle (C01–C12)

| ID | Topic | Status | Tests | Notes |
|:---|:---|:---:|:---|:---|
| C01 | State snapshot | **VERIFIED** | `clones.test.ts` "C01 · State snapshot" |  |
| C02 | Shared definition, separate execution | **VERIFIED** | `clones.test.ts` "C02 · Shared definition, separate execution" |  |
| C03 | Which hats run | **VERIFIED** | `clones.test.ts` "C03 · Which hats run" |  |
| C04 | Layer | **VERIFIED** | `clones.test.ts` "C04 · Layer" |  |
| C05 | Global limit | **VERIFIED** | `clones.test.ts` "C05 · Global limit" |  |
| C06 | Delete original | **VERIFIED** | `clones.test.ts` "C06 · Delete original" |  |
| C07 | Delete runtime clone | **VERIFIED** | `clones.test.ts` "C07 · Delete runtime clone" |  |
| C08 | Stop all | **VERIFIED** | `clones.test.ts` "C08 · Stop all" |  |
| C09 | Clone of clone | **VERIFIED** | `clones.test.ts` "C09 · Clone of clone" |  |
| C10 | Other scripts in sprite | **VERIFIED** | `clones.test.ts` "C10 · Other scripts in sprite" |  |
| C11 | Local lists | **VERIFIED** | `clones.test.ts` "C11 · Local lists" |  |
| C12 | Uninherited assumptions | **VERIFIED** | `clones.test.ts` "C12 · Uninherited assumptions" |  |

## §1.4 · Motion, coordinates, fencing, and bounce (M01–M14)

| ID | Topic | Status | Tests | Notes |
|:---|:---|:---:|:---|:---|
| M01 | Coordinates/direction | **VERIFIED** | `motion.test.ts` "M01 · Coordinates/direction" |  |
| M02 | Negative/fractional steps | **VERIFIED** | `motion.test.ts` "M02 · Negative/fractional steps" |  |
| M03 | Direction wrapping | **VERIFIED** | `motion.test.ts` "M03 · Direction wrapping"<br>`motion.test.ts` "M03 · Direction wrapping (Infinity keeps the prior direction)" |  |
| M04 | Position reporters | **VERIFIED** | `motion.test.ts` "M04 · Position reporters" | Not asserted: the `x position of` (sensing_of) reporter returning the raw number. |
| M05 | Ordinary fencing | **VERIFIED** | `motion.test.ts` "M05 · Ordinary fencing" |  |
| M06 | Small-costume fence | **VERIFIED** | `motion.test.ts` "M06 · Small-costume fence" |  |
| M07 | Dragging | **VERIFIED** | `motion.test.ts` "M07 · Dragging" | Not asserted: a forced editor move while dragging. |
| M08 | Go to | **VERIFIED** | `motion.test.ts` "M08 · Go to" |  |
| M09 | Point towards | **VERIFIED** | `motion.test.ts` "M09 · Point towards"<br>`motion.test.ts` "M09 · Point towards (towards the same point gives 90)" |  |
| M10 | Glide snapshot | **VERIFIED** | `motion.test.ts` "M10 · Glide snapshot" | Not asserted: the glide endpoint is not retargeted when the destination sprite moves. |
| M11 | Glide zero | **VERIFIED** | `motion.test.ts` "M11 · Glide zero" |  |
| M12 | Bounce | **VERIFIED** | `motion.test.ts` "M12 · Bounce" | Not asserted here: the left/top tie and near-tangent cases. |
| M13 | Edge predicate boundary | **VERIFIED** | `motion.test.ts` "M13 · Edge predicate boundary" |  |
| M14 | Rotation styles | **VERIFIED** | `motion.test.ts` "M14 · Rotation styles" | Not asserted: the left-right image flip (renderer concern); only direction, rotation style and movement are checked. |

## §1.5 · Looks, size, effects, layers, and timed bubbles (L01–L12)

| ID | Topic | Status | Tests | Notes |
|:---|:---|:---:|:---|:---|
| L01 | Costume names/numbers | **VERIFIED** | `looks.test.ts` "L01 · Costume names/numbers" | Not asserted: a missing costume name leaves the costume unchanged. |
| L02 | Costume wrap | **VERIFIED** | `looks.test.ts` "L02 · Costume wrap" |  |
| L03 | Rotation center | **VERIFIED** | `looks.test.ts` "L03 · Rotation center" |  |
| L04 | Size min/max | **VERIFIED** | `looks.test.ts` "L04 · Size min/max" |  |
| L05 | Effects | **VERIFIED** | `looks.test.ts` "L05 · Effects" | Not asserted: an unknown effect name is ignored. |
| L06 | Ghost vs hide | **VERIFIED** | `looks.test.ts` "L06 · Ghost vs hide"<br>`looks.test.ts` "L06 · a fully ghosted sprite is not clickable through the normal picker" (`it.fails`) | The touching half is verified. it.fails: a ghost = 100 sprite is still clickable (runtime-fixes bug 3 / stage-camera lane). |
| L07 | Show/hide | **VERIFIED** | `looks.test.ts` "L07 · Show/hide" |  |
| L08 | Layer operations | **VERIFIED** | `looks.test.ts` "L08 · Layer operations" |  |
| L09 | Say/think plain | **VERIFIED** | `looks.test.ts` "L09 · Say/think plain" |  |
| L10 | Say/think for seconds | **VERIFIED** | `looks.test.ts` "L10 · Say/think for seconds" |  |
| L11 | Bubble overwrite race | **VERIFIED** | `looks.test.ts` "L11 · Bubble overwrite race" |  |
| L12 | Flag/stop effects | **VERIFIED** | `looks.test.ts` "L12 · Flag/stop effects" |  |

## §1.6 · Sensing, keyboard, timer, and ask/answer (S01–S13)

| ID | Topic | Status | Tests | Notes |
|:---|:---|:---:|:---|:---|
| S01 | Sprite touching | **VERIFIED** | `sensing.test.ts` "S01 · Sprite touching" |  |
| S02 | Named sprite includes clones | **VERIFIED** | `sensing.test.ts` "S02 · Named sprite includes clones" |  |
| S03 | Hidden asymmetry | **VERIFIED** | `sensing.test.ts` "S03 · Hidden asymmetry" | The touching-color half is not applicable (no renderer). |
| S04 | Color target tolerance | **KNOWN-DIFF** | `sensing.test.ts` "S04 · Color target tolerance (KNOWN-DIFF: headless stub always false)" | KNOWN-DIFF: the headless core has no compositor, so `sensing_touchingcolor` is a stub that returns false. |
| S05 | Color source mask | **KNOWN-DIFF** | `sensing.test.ts` "S05 · Color source mask (KNOWN-DIFF: headless stub always false)" | KNOWN-DIFF: `sensing_coloristouchingcolor` is a stub that returns false. |
| S06 | CPU/GPU threshold | **KNOWN-DIFF** | `sensing.test.ts` "S06 · CPU/GPU threshold (KNOWN-DIFF: no renderer, primitives only defined)" | KNOWN-DIFF: there is no CPU/GPU split; the test only asserts the primitives exist. |
| S07 | Distance | **VERIFIED** | `sensing.test.ts` "S07 · Distance" |  |
| S08 | Attribute of | **VERIFIED** | `sensing.test.ts` "S08 · Attribute of" | Not asserted: a clone's HP change leaving the named original's reading alone. |
| S09 | Timer | **VERIFIED** | `sensing.test.ts` "S09 · Timer" | Not asserted: "advance 1000 ms after reset reads exactly 1" (checked only as > 0). |
| S10 | Key names | **VERIFIED** | `sensing.test.ts` "S10 · Key names" | A modifier event such as Shift being ignored is a host concern, covered in `studio/stage/keys.test.ts` ("returns null for unhandled keys"), not here. |
| S11 | Key repeat | **VERIFIED** | `sensing.test.ts` "S11 · Key repeat" |  |
| S12 | Ask queue | **VERIFIED** | `sensing.test.ts` "S12 · Ask queue" |  |
| S13 | Shared answer/reset | **VERIFIED** | `sensing.test.ts` "S13 · Shared answer/reset" |  |

## §1.7 · Operators, coercion, string behavior, and random (O01–O14)

| ID | Topic | Status | Tests | Notes |
|:---|:---|:---:|:---|:---|
| O01 | Numeric cast | **VERIFIED** | `operators.test.ts` "O01 · Numeric cast"<br>`operators.test.ts` "O01 · Numeric cast (a NaN reporter + 1)" |  |
| O02 | Boolean cast | **VERIFIED** | `operators.test.ts` "O02 · Boolean cast" |  |
| O03 | Numeric comparison | **VERIFIED** | `operators.test.ts` "O03 · Numeric comparison" |  |
| O04 | Infinity/NaN | **VERIFIED** | `operators.test.ts` "O04 · Infinity/NaN" |  |
| O05 | Negative mod | **VERIFIED** | `operators.test.ts` "O05 · Negative mod" |  |
| O06 | Round | **VERIFIED** | `operators.test.ts` "O06 · Round"<br>`operators.test.ts` "O06 · Round (round -0.5 is negative zero)" |  |
| O07 | Random integer rule | **VERIFIED** | `operators.test.ts` "O07 · Random integer rule" |  |
| O08 | Random bounds | **VERIFIED** | `operators.test.ts` "O08 · Random bounds"<br>`operators.test.ts` "O08 · Random bounds (RNG near 1 gives the inclusive upper integer)" |  |
| O09 | Join | **VERIFIED** | `operators.test.ts` "O09 · Join"<br>`operators.test.ts` "O09 · Join (a boolean joins as its text)" |  |
| O10 | Letter | **VERIFIED** | `operators.test.ts` "O10 · Letter" |  |
| O11 | Length/Unicode | **VERIFIED** | `operators.test.ts` "O11 · Length/Unicode" |  |
| O12 | Contains | **VERIFIED** | `operators.test.ts` "O12 · Contains" |  |
| O13 | Trig | **VERIFIED** | `operators.test.ts` "O13 · Trig" |  |
| O14 | Math operations | **VERIFIED** | `operators.test.ts` "O14 · Math operations" |  |

## §1.8 · Variables and list boundaries (D01–D10)

| ID | Topic | Status | Tests | Notes |
|:---|:---|:---:|:---|:---|
| D01 | Set vs change | **VERIFIED** | `data.test.ts` "D01 · Set vs change" |  |
| D02 | Scope | **VERIFIED** | `data.test.ts` "D02 · Scope" | Not asserted: same-name variables with distinct IDs. |
| D03 | Indexing | **VERIFIED** | `data.test.ts` "D03 · Indexing" |  |
| D04 | Special index names | **VERIFIED** | `data.test.ts` "D04 · Special index names"<br>`data.test.ts` "D04 · Special index names (item "all" reads as empty)" |  |
| D05 | Empty list | **VERIFIED** | `data.test.ts` "D05 · Empty list" |  |
| D06 | Search/coercion | **VERIFIED** | `data.test.ts` "D06 · Search/coercion" |  |
| D07 | List reporter | **VERIFIED** | `data.test.ts` "D07 · List reporter" |  |
| D08 | Capacity | **VERIFIED** | `data.test.ts` "D08 · Capacity" |  |
| D09 | Insert at capacity | **VERIFIED** | `data.test.ts` "D09 · Insert at capacity"<br>`data.test.ts` "D09 · Insert at capacity (insert at limit + 1 is refused)" |  |
| D10 | Mutations do not reset on flag | **VERIFIED** | `data.test.ts` "D10 · Mutations do not reset on flag"<br>`data.test.ts` "D10 · Mutations do not reset on flag (a clone-local list disappears with the clone)" |  |

## §1.9 · My Blocks, parameter scope, recursion, and stop (P01–P07)

| ID | Topic | Status | Tests | Notes |
|:---|:---|:---:|:---|:---|
| P01 | Arguments | **VERIFIED** | `procedures.test.ts` "P01 · Arguments" |  |
| P02 | Nearest call only | **VERIFIED** | `procedures.test.ts` "P02 · Nearest call only" |  |
| P03 | Defaults/missing define | **VERIFIED** | `procedures.test.ts` "P03 · Defaults/missing define"<br>`procedures.test.ts` "P03 · Defaults/missing define (a free argument reporter reports 0)" |  |
| P04 | Recursion | **VERIFIED** | `procedures.test.ts` "P04 · Recursion" | Not asserted: mutual recursion. |
| P05 | Warp inheritance | **VERIFIED** | `procedures.test.ts` "P05 · Warp inheritance" |  |
| P06 | Stop inside define | **VERIFIED** | `procedures.test.ts` "P06 · Stop inside define" |  |
| P07 | Stop at top level | **VERIFIED** | `procedures.test.ts` "P07 · Stop at top level"<br>`procedures.test.ts` "P07 · Stop at top level (a nested f -> g stop returns to f, not to the flag script)" |  |
