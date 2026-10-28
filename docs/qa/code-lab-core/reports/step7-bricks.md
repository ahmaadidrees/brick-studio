# Step 7, bricks lane

Branch `claude/s7-bricks` (from 8b12fc1). Files: `studio/gridBricks.ts` (filled in), `studio/gridBricks.test.ts` (new), `studio/blockBuilder.ts` (new, the Blocks builder moved out of `starter.ts` so both can use it), `studio/starter.ts` + test, `studio/templates.ts`, `studio/hero/heroBrick.ts` + test (scripts and labels only). Test names below are in `gridBricks.test.ts` (G), `starter.test.ts` (S) or `heroBrick.test.ts` (H).

## What was built

- **Eight real bricks** from `gridBrickTemplate(key)`: Ground (G, autotile), Hard block (H), Spikes (S), Lava (L), One-way platform (-), Brick (B), ? block (Q), Bounce block (O). Names and chars: G "names and grid chars...". Chars match `LEGACY_TILE_BRICKS`: G "each char is the key LEGACY_TILE_BRICKS maps...".
- **Costumes are the real tile art** (`render/art/tiles.ts`, pure bitmaps cut to 16x16 with mask and opaque box). G "are 16 x 16 pixel costumes...", G "are the Brickgineers tile art itself" (Hard, Spikes, Brick, ?, used, Bounce, Lava frame 1 identical pixel for pixel), G "Ground: costume 1 is the grass top..., costume 2 is dirt", G "? block has costumes ?, used and coin; Lava has four bubbling frames; Bounce has bounce and squashed; One-way plate is top-aligned". The "coin" costume is the first spin frame of the real coin; "squashed" is the Bounce tile with three coil rows dropped.
- **Code**, each top script labelled, My Blocks where it reads better (G "every top script has a one-line label...", G "every workspace compiles with zero diagnostics...", G "uses only real Scratch blocks and the existing Platformer blocks"):
  - Ground / Hard block: `when flag clicked -> set solid [on]` (G "Ground, Hard block and Bounce block start with...").
  - Spikes: solid + `when I bump [any] of [Hero] -> broadcast hero hurt` (G "Spikes: solid, and...").
  - Lava: not solid; `forever: bubble, burn the Hero` (G "Lava: not solid..."). Choice: the touching check runs every tick with no wait (a wait would let the Hero stand in lava for several ticks; one sensing check per cell per tick is cheap). Bubbling is a frame counter: next costume every 6th tick, so all cells animate together.
  - One-way platform: `set solid [top]` (see below).
  - Brick: `when I bump [top] of [Hero] -> hop` (up 2+2, down 2+2, then `set y to home`, so a re-bump mid-hop cannot leave it displaced). Breaking when big is not built (later). G "Brick: bump [top] of [Hero]...".
  - ? block: `when I bump [top] of [Hero] -> give a coin`. My Block `give a coin`: if `used` = 0: set used 1, switch costume used, `change coins by 1` (the Stage's global), create clone of myself. `when I start as a clone -> rise and vanish`: costume coin, `set solid [off]`, 6 x change y by 5, delete this clone. G "? block: bump [top] of [Hero]...".
  - Bounce block: `when I bump [bottom] of [Hero] -> broadcast bounce, squash` (squash: costume squashed, wait 0.1, costume bounce). G "Bounce block: bump [bottom] of [Hero]...".
  - SIDE follows the contract (the SIDE is the Hero's side that touched: top into a ? block or Brick from below, bottom when landing on a Bounce block).
- **Hero**: lava, spikes and `tile:qblock` handlers removed; new `when I receive bounce` (y speed 11 with space held, else 6.5). Keeps hero hurt, boing, stomped. H "has no lava, spikes or ? block code of its own any more...", H "on bounce the Hero is launched: y speed 11 with space held, 6.5 without" (real run), H "opens in the real Blockly editor and saves back to the same program" (14 top blocks).
- **Starter**: same layout; `design.bricks` = Hero, Walker, Coin, Spring, Goal + the eight grid bricks (ids `brick_ground`... `brick_bounce`), workspaces stored for all; the tiles layer uses their chars (`STARTER_CHAR`, read from the bricks). S "has Hero, Walker, Coin, Spring, Goal and the eight standard grid bricks...", S "every grid brick in the level is a standard one...", S "uses only the standard grid bricks' characters...", S "Hero keeps its program and answers boing, stomped, hero hurt and bounce...", S "compiles every starter workspace...", S "validates with validateDesign with zero problems".
- **Template** "Block (snaps to grid)": `createBlockBrick(name, char = '1')` in gridBricks.ts, exposed as `BRICK_TEMPLATES` entry `block`; `make(id, name, options?: { char })` (the builder should pass a free char). S "offers Walker, Coin, Spring, Goal, Block (snaps to grid) and Empty", S "Block ... make() gives a fresh valid brick...", G "Block (snaps to grid): is a solid grid brick with a kid-picked char...".

## What is proven now vs after the engine merges

Proven now (G "the bricks run their own code"): the engine lane isn't merged, so each brick is placed as an ordinary painted copy and its bump hat is swapped for `when I receive poke`. That exercises every body: solid at start (all but Lava), ? block gives one coin / used / one rising coin clone (costume coin, solid off, peak +30, deleted) / second poke gives nothing / two pokes in one tick give one coin, Brick hops +4 and returns to its y (also when re-poked mid-hop), Spikes hurt once, Bounce broadcasts once and squashes then springs back, Lava hurts a Hero standing in it every tick, does nothing when the Hero is away, and cycles costumes 0,1,2,3,0,1.

Not proven (needs engine): the arrival of the bump (two-sided hat), cells becoming targets, `only on top`.

## it.todo to flip after the engine merges

In `starter.test.ts` (play tests through the bricks' own code):
1. spikes: Hero at x 736, y 100 over the pit; 20 more ticks -> Hero at [60, 24].
2. lava: lava painted at col 10 row 5; Hero set to x 168, y 88; 20 ticks -> [60, 24].
3. ? block: Hero at x 200 jumps (space 30 ticks) into cell:12:3 -> costumeIndex 1, `coins` 1; second jump leaves both unchanged; 30 ticks later no clone remains (the 7 painted ? cells are the only brick_qblock targets).
4. Brick hop: Hero at x 184 jumps into cell:11:3 (y 56) -> cell peaks at y 60, back at 56 after 10 ticks.
5. Bounce with space held: Hero dropped on cell:18:1 launches at vy 11; released, 6.5; block shows costume squashed for ~3 ticks.
6. Ground cells: one target per non-'.' char, copyId `cell:<col>:<row>`, `brick_ground`, costumeIndex 0.

In `gridBricks.test.ts` ("after the engine merges (todo)"): two-sided bump on cell:12:3; One-way `body.oneWay` true and jump through cols 33-36 row 3 from x 560, landing bottom 64; Ground autotile (stacked G gets costume 2); Bounce vy 11 vs 6.5; Spikes from the side -> [60, 24].

Two existing play tests (one-way platform, bounce block, in S) pass today on the old tile rules and must keep passing on the bricks' code once the engine drops them.

## Needs the engine lane

- **"Only on top" value**: I used the field value `top` for `platformer_setsolid` (`SOLID` field, `core/editor/definitions.ts` line ~1542, options currently `on`/`off`). Proposed menu entry: `['only on top', 'top']`. Until it lands the compiler accepts `top` (any value but `off` means solid on), and G "...the One-way platform sets solid [top]" asserts it.
- Clones inherit their source's `copyId` (core/clones.ts), so the ? block's coin clone has copyId `cell:12:3` like its cell. The reciprocal-bump, spatial-hash and `selectCopy` code should treat `isClone` targets as not the cell (the clone is non-solid after its first tick, but it exists with the used costume for one tick before its script runs).
- The Hero's own bump handlers for walls are `_any_`; with reciprocal bumps each cell also hears them. No effect (cells have no `_any_` of Hero scripts except the ones above).

## Notes for other lanes

- **Builder**: `studio/storage.test.ts` "returns starter project when storage is empty" expects 5 bricks and now sees 13 (the starter holds the eight grid bricks). Builder lane / integrator: change to 13. I did not edit that file. Old Hero code with `platformer_touchingtile` is not re-created by the starter any more.
- `studio/blockBuilder.ts` is new shared code (moved verbatim from `starter.ts` plus `startAsClone`, `switchCostume`, `setSolid`, `repeat`, `cloneMyself`, `eq`, `mod`, `setYTo`, a brick parameter on `bump`). `starter.ts` imports `gridBricks.ts`, which imports the Brickgineers tile art (`render/art`), a pure module (no canvas).
- Variable ids inside templates are fixed (`qblock_used`, `brick_home`, `lava_frame`); they are per-brick locals, so two copies of a brick in a level don't clash. The ? block needs the Stage's global `coins`; a level without it counts into nothing (starter has it).

## Pre-existing failures (not from this lane)

`src/platformer/boundaries.test.ts` ("imports no 3D code", `CodeEditor.tsx` imports `./store`) fails on the base commit too. `code/tidy.test.ts` undo test is flaky under full-suite load, passes alone.

## Run

`npx vitest run src/platformer/lab/studio`: 29 files pass, 339 tests pass, 11 todo, 1 fail (`storage.test.ts`, builder lane, see above). `npx tsc --noEmit -p .`: clean.
