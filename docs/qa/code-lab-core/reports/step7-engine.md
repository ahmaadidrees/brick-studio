# Step 7 report: engine lane

Branch `claude/s7-engine`, forked from 8b12fc1. Commands: `npx vitest run src/platformer/lab/core src/platformer/lab/feel src/platformer/lab/studio/code` (711 passed, 25 expected-fail feel cases unchanged) and `npx tsc --noEmit -p .` (clean).
Test names below are in `src/platformer/lab/core/grid.test.ts` unless a file is named.

## What changed

- **Cells are targets** (`project.ts instantiate/gridTargets`). Per the integrator's late change, cells go BEFORE `design.copies` in `world.targets` (drawn behind every painted copy), rows bottom-up, left to right. Cell centre is `bounds.left/bottom + col/row*16 + 8`; copyId and id are `cell:c:r`; autotile picks costume 2 when the cell above has the same char; brick variable defaults, no knobs. Tests: "a cell is a painted-copy target...", "cells are placed from the level bounds", "cells come before design.copies...", "autotile: ...", "autotile ignores a different brick above...", "every cell starts with the brick's variable defaults...", "instantiate leaves the design alone...", "a character with no grid brick is skipped...".
- **Validation** (`validateDesign`): `grid.char` one char, not '.', not space/control, unique; autotile boolean; grid brick has no `limit`; every non-'.' tiles char must belong to a grid brick; `DESIGN_LIMITS.maxGridCells = 8000` (perf is measured at 4,000). Tests under "grid bricks are validated" (all six).
- **Physics** (`platformer.ts`): all tile-kind rules deleted (tile solidity, semi, qblock to used, bounce, `_tiles_`, `tile:<kind>`, `BOUNCE_*` exports; the numbers survive only as a comment). Solid targets (cells and ordinary copies) are indexed in a uniform 16-step spatial hash rebuilt each tick; solids that themselves move this tick are kept in a live list so their current box is used. Ties between equal-edge solids: most overlap with the mover, then world order (deterministic). Tests: "solid cells act like solid bricks" (all), "ordinary painted copies are solid... moving platform", "a hidden cell is not solid", "a cell can turn its solid off...", "grid levels replay identically".
- **Reciprocal bump**: the stationary solid also gets `when I bump [mover's side] of [mover's brick]` (plus `_any_` variants). Edge bumps give the mover only. Tests: "both sides hear it: ... ? block", "landing on a Bounce-like block...", "a wall bump is two-sided too", "a body spanning three cells bumps only the one under its centre", "equal overlap breaks the tie...", "the level floor still reports _edge_".
- **oneWay**: `platformer_setsolid` has `only on top` (value `top`), sets solid and `body.oneWay`; `on` clears it. A one-way solid stops only a falling body whose bottom was at or above its top; ignored sideways and rising. Tests: "solid [only on top]: one-way platforms" (6 tests), `editor/platformer.test.ts` "solid menu".
- **Blocks**: `platformer_touchingtile`, `tileBlocks.ts` and its test removed; `TILE_BRICK_OPTION` / `TILE_BUMP_OPTIONS` gone from the bump menu and toolbox. An old workspace holding the block compiles with a `block.unknown` warning naming the block (`editor/compile.ts REMOVED_BLOCKS`); the reporter then answers false at run time. Tests: `editor/platformer.test.ts` "Platformer blocks: removed touching tile", "BRICK menu: anything, edge, then every brick name".
- **Plain-Scratch cards** (`studio/code/plainScratch.ts`): touching-tile card removed; solid card explains `only on top` with a second example script; bump card explains the two-sided bump. Tests: `plainScratch.test.ts` "step 7: no touching tile card..." and the existing compile / read-only workspace tests.
- **Touching prefilter** (`sensing.ts`, `geometry.radiusOf`): `touching [brick]?` skips copies whose position is further than the brick's costume radius from the asker's box. Without it, 20 bodies asking "touching Ground?" against 4,000 cells took ~4.1 s per 300 ticks. Exact result unchanged (all sensing tests pass).

## Performance (`perf.test.ts`, best of five runs, isolated machine)

| Check | Target | Measured |
|---|---|---|
| Play start (instantiate + green flag), 4,000 cells + 20 bodies | < 150 ms | 34-40 ms alone; 80-110 ms when the whole suite runs in parallel |
| 4,000 cells + 20 bodies x 300 ticks (each body also asks `touching [Ground]?` every tick) | < 1 s | about 295-320 ms |

The two assertions use best-of-five because other test files share the CPU; under a very heavy parallel run (`vitest run src/platformer`) the 1 s check can still occasionally trip. Replay identity over 300 ticks: "the same level replays identically over 300 ticks".

## Behaviour differences to know

- Cells are separate solids, so a body embedded across two cells can no longer walk out sideways through the neighbouring cell it was never inside of (old tiles treated shared faces as interior). A body inside a single solid still walks out ("a body that starts inside a solid cell is not stuck").
- Bump latency: a Hero script reacting to a bump (e.g. `when I receive bounce` setting y speed) runs the tick after the landing; the launch is still reproduced exactly (heights 18 and 55: "the low bounce rises 18 steps...").
- `world.tiles` is still copied from the design (builder/renderer may read it); physics never reads it.
- `tiles.test.ts` and `tileBlocks.test.ts` were replaced by `grid.test.ts` with the same intents (landing, wall, ceiling, thin row, start-inside, bump hats, one-way, ? block, bounce, validation, save, replay) using grid bricks with `set solid` scripts; `touching tile` tests became `touching [Spikes]?` tests.

## Out-of-lane tests that now fail (not edited)

- `studio/starter.test.ts` (16): validation (tiles chars without grid bricks), every play test, template compile tests (Coin, Empty, Goal, Spring, Walker).
- `studio/hero/heroBrick.test.ts` "compiles with no errors or warnings" (Hero uses `platformer_touchingtile`, now a warning).
- `studio/persist/projectIo.test.ts` (2), `studio/storage.test.ts` (1), `studio/workshop/roomDesign.test.ts` (2): designs with tile chars and no grid bricks fail validation.
- `src/platformer/boundaries.test.ts` "imports no 3D code": `studio/CodeEditor.tsx` imports the store; unrelated to this lane (not caused by these changes).
