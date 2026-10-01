# Wave 3 report: runtime-fixes lane

Branch `gemini/w3-runtime-fixes`. Files changed: `core/runtime.ts`, new `core/conformance/regressions.test.ts`. All tests below are in `regressions.test.ts` (describe "wave 3 runtime regressions"). Each failing test was committed first (it failed against the old `runtime.ts`); R1a/R1b were then adjusted in the fix commit (the sibling logs with no `wait`, since with a `wait 0` loop and an op-count budget the sibling legitimately iterates every second tick). I re-ran all five with the old `runtime.ts` restored and confirmed they fail, and pass with the fix.

| Bug | Test(s) | Result |
|---|---|---|
| 1. Warp thread starves siblings (F02/F05/F11) | `R1a` (audit example: `forever { call render }`, `render` a 25,000-op warp repeat; sibling `forever { log B }`, 10 ticks, B logs 10 times), `R1b` (warp `forever` procedure, B logs once per tick over 6 ticks), `R1c` (warp thread still yields at `WARP_OP_LIMIT`; passed before and after) | Fixed. The op budget is checked only between sweeps (the mid-sweep `break` was removed). |
| 2. Restarted hat loses its place (H05/F14) | `R2` (R then K started, rebroadcast, next tick logs `[R, K]`; old behavior was `[K, R]`) | Fixed. `startHats` replaces the old thread in the same array slot and returns the new thread. `R2` sets `opBudget = 1` for one sweep per tick, so it also relies on fix 1. |
| 3a. `wait` in warp (F08/F11) | `R3a` (warp proc `log A; wait 0; log B`, sibling logs X: one tick gives `[A, B, X]`), `R3b` | Fixed for `wait 0` (a wait already due continues in the same turn, as Scratch does). **KNOWN-DIFF** for positive waits: Scratch spins in warp until its wall clock passes; our simulated clock is frozen within a tick, so a positive wait in warp yields to the next tick. `R3b` asserts this (B absent after tick 1, present after 41 ticks). |
| 3b. Edge hat state while handler runs (H08) | `R3c` (handler `log; reset timer; wait 1`: one trigger in 100 ticks; old runtime gave 3), `R3d` (retrigger after timer observed below threshold again: 2 triggers; passed before and after) | Fixed. The hat is no longer evaluated while its handler is alive, matching Scratch's `startHats` early return. Note: the audit described this as a "dropped retrigger"; reading Scratch's behavior it is the reverse. Our old code over-triggered, because it recorded a false-then-true transition during the handler that Scratch never sees. |

## Final counts

- `npx vitest run src/platformer/lab`: 59 files, 525 tests, all passing (baseline before the lane: 517, plus 8 new).
- `npx tsc --noEmit -p tsconfig.app.json`: clean.

## Notes and remaining differences

- Within one tick a warp thread can still run up to `WARP_OP_LIMIT` (200,000) ops in its turn; siblings now run after it, not instead of it. Not verified against Scratch's 500 ms timer beyond `R1c` and `R1a`/`R1b`.
- `wait_until` in warp still yields to the next sweep (unchanged; not tested here).
- `R1a`: a `wait 0` loop sibling logs every second tick while a heavy warp sibling exceeds the budget each tick. This follows from budget checks between sweeps and is not tested.
- No public API changed. No browser check (not needed for this lane).
