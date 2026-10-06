# Code Lab step 7: every painted block is a brick with code

The owner asked to see how coins, ? blocks and the other blocks work, and pointed out that in Scratch even the ground
is a sprite with code. Decision: **drop "tiles" as something kids see.** Everything you paint is a brick you can open
with 🔍 See inside. Ground-like bricks are **grid bricks**: they snap to 16-step cells and are stored compactly
(`LevelDesign.tiles`, one char per cell), but on Play each cell is an ordinary painted-copy target running the brick's
own scripts. **The engine has no rule for any particular brick any more.**

Integration branch `claude/code-lab-core`. Each lane gets its own branch and worktree, forked from the step 7 contract
commit. The rules in [`STEP6.md`](STEP6.md) and [`WAVE2.md`](WAVE2.md) still apply. Commit trailer:
`Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Each lane writes a report at
`docs/qa/code-lab-core/reports/step7-<lane>.md`, and every claim in it names a test or a click path.

## Contract (already committed, don't change it)

- **`core/contracts.ts`:**
  - `BrickDef.grid?: GridSpec { char, autotile? }`;
  - `gridCopyId(col, row)` returns `cell:<col>:<row>`, and `parseGridCopyId` reads it back;
  - `Body.oneWay?`;
  - the old `TileKind`, `TILE_CHAR` and `SOLID_TILES` are marked LEGACY (kept only for converting old saves).
  - Read the GridSpec doc comment: it fixes where cells become targets, their copyId, the autotile costume rule, and
    "no per-cell knobs".
- **`studio/gridBricks.ts`:**
  - `GridBrickTemplate`, `GRID_BRICK_KEYS`, `LEGACY_TILE_BRICKS` and `gridBrickTemplate(key)` (a stub the bricks lane
    fills in);
  - each standard brick's `grid.char` is its old tile character (G H S L - B Q O).
- **Bump hats on both sides.** When a moving body is stopped by a solid target `other`:
  - the mover gets `when I bump [SIDE] of [BRICK]`, as today: SIDE is the side of `other` that was hit, and BRICK is
    `other`'s brick name;
  - **new:** `other` also gets one, with SIDE = the mover's side that touched and BRICK = the mover's brick name.
  - Example: the Hero jumps into a ? block from below. The Hero gets `bump [bottom] of [? block]` and the ? block gets
    `bump [top] of [Hero]`. When the Hero lands on a Bounce block, the block gets `bump [bottom] of [Hero]`.
  - Edge bumps are unchanged.

## Lanes

### engine: grid cells as targets, no built-in tile rules
**Files:** `core/**` (including `core/editor/**`), `studio/code/plainScratch.ts` and its test.

- **`instantiate`** turns grid cells into targets exactly as GridSpec says. They come after `design.copies` in draw
  order, row by row from the bottom.
- **`validateDesign`:**
  - `grid.char` is one character, not '.', and unique;
  - every non-'.' tiles character must belong to a grid brick;
  - a grid brick has no `limit`;
  - add `DESIGN_LIMITS.maxGridCells` (pick it from the performance test, at least 4,000).
- **Physics:** delete every tile-kind rule: tile solidity, semi, qblock→used, bounce, `_tiles_`, `tile:<kind>`.
  - Solid targets go in a uniform spatial hash rebuilt each tick, so many solid cells stay fast, for any brick (cells
    and normal copies alike).
  - Add the reciprocal bump.
  - `oneWay`: stops only a body whose bottom was at or above its top before the move and is falling.
  - The Hero's feel tests (`src/platformer/lab/feel`) must still pass 25/25.
- **Blocks:**
  - `platformer_setsolid` gets a third option, `only on top` (sets solid and oneWay).
  - Remove `platformer_touchingtile` and its toolbox entry; `touching [Spikes ▾]?` (plain Scratch) replaces it. Old
    workspaces that still contain it must compile with a clear unknown-block diagnostic, not crash.
  - Remove `TILE_BRICK_OPTION` and `TILE_BUMP_OPTIONS` from the bump menu.
  - Update the plain-Scratch cards (remove touching tile; explain `only on top` and the two-sided bump).
- **Performance tests:**
  - 4,000 grid cells (ground with `when ⚑ clicked → set solid [on]`) plus 20 moving bodies run 300 ticks;
  - Play start (instantiate plus the green flag) on the same level;
  - record both numbers. Targets: under 1 s and under 150 ms.
  - If `sensing_touchingobject` against a brick with thousands of copies is slow, add a bounding-box prefilter.
- **Tests:**
  - a cell's target position, copyId and autotile costume;
  - the ? block case's two-sided bump;
  - one-way (jump up through it, land on it);
  - replays are identical;
  - validation errors.

### bricks: the standard grid bricks, a slimmer Hero, the starter
**Files:** `studio/gridBricks.ts` and a new `gridBricks.test.ts`, `studio/starter.ts` and its test,
`studio/templates.ts`, `studio/hero/**` (scripts and labels only, never the feel math).

- **Fill in `gridBrickTemplate`** for all 8 bricks. Each is a real brick:
  - **Costumes** are pixel costumes made with `studio/pixels.ts` (16×16, drawn to match the real builder's tile art:
    look at `studio/builder/tileArt.tsx` and `studio/stage/tiles.ts`).
  - **Code** is a few labeled scripts made of My Blocks where that helps, in the same style as the Walker. The bump hat
    SIDE follows the contract above.

| Brick | Behavior |
|---|---|
| **Ground** | `autotile`. Costumes: grass top, dirt. `when ⚑ clicked → set solid [on]`. |
| **Hard block** | Solid. |
| **Spikes** | Solid. `when I bump [any] of [Hero] → broadcast hero hurt`. |
| **Lava** | Not solid. A bubbling costume loop, and `forever: if touching [Hero]? → broadcast hero hurt`. Keep it cheap: wait between checks if the feel allows, and say what you chose. |
| **One-way platform** | `set solid [only on top]`. |
| **Brick** | Solid. Bumped from below by the Hero, it hops (up 4, back down). Note: breaking when big comes later. |
| **? block** | Costumes: ?, used, coin. Bumped from below by the Hero and not used yet: switch to *used*, `change [coins] by 1` (the global), and `create clone of myself`. The clone does: costume coin, `set solid [off]`, rise, then `delete this clone`. |
| **Bounce block** | Bumped on top by the Hero: `broadcast bounce` plus a squash. |

- **The Hero:**
  - remove its lava, spikes and `tile:qblock` handlers;
  - add `when I receive bounce`: set y speed to 11 if the jump key is held, else 6.5. These are the old numbers; see
    the comment in `core/platformer.ts`.
  - It keeps `hero hurt`, `boing` and `stomped`.
- **The starter:**
  - the level's grid bricks are the standard bricks;
  - the tiles layer uses their chars;
  - the same layout as today.
  - Every play test in `starter.test.ts` must pass **through the bricks' own code**: ground, walls, spikes (via
    `hero hurt`), lava, one-way, ? block (coins 1, used, a second hit gives nothing, the coin clone is deleted),
    bounce, brick hop, spring, stomp, goal.
- **`templates.ts`:** add a **"Block (snaps to grid)"** template: a solid grid brick with a kid-picked char, made with
  `when ⚑ clicked → set solid [on]` and `when I bump [top] of [Hero]` as an example.
- **Until the engine lane merges,** cells aren't targets yet. Write tests that need them as `it.todo` with exact
  expectations; the integrator turns them on.

### builder: paint grid bricks, See inside any cell, convert old saves
**Files:** `studio/builder/**`, `studio/stage/**`, `studio/Stage.tsx`, `studio/storage.ts` and its test,
`studio/workshop/roomDesign.ts` and its test.

- **Bricks panel:** the fixed tile entries go away.
  - Terrain and Blocks list the level's grid bricks by `GridBrickTemplate.category`; a kid's own grid bricks go under
    My bricks.
  - Picking a grid brick arms the brush to paint its char: drag to paint cells; right-click or Erase clears them.
  - Picking a standard grid brick the level doesn't have yet adds it first, with `store.addBrickFrom`, from
    `gridBrickTemplate`.
- **Build mode drawing** draws each filled cell with its brick's costume, using GridSpec's autotile rule. Play mode
  draws cells as the normal targets they are.
  - Remove the tile-kind drawing and the coin-pop view animation: the ? block's clone is now the pop.
  - Keep the sky.
- **Selecting a cell:** clicking a painted cell in Build selects it (`selectCopy(gridCopyId(col, row))`).
  - The card shows the brick's icon and name, "N in this level", **🔍 See inside**, and Remove (clears the cell). It has
    no knobs.
  - Clicking a Hero standing in front of a cell still selects the Hero.
- **Old saves:** in `storage.ts` load, a design whose tiles use characters with no grid brick gets the standard grid
  bricks from `LEGACY_TILE_BRICKS`, and 'U' cells are rewritten to 'Q'.
  - Test it with a real step 6b save fixture.
  - Old Hero code that uses `platformer_touchingtile` keeps loading. Note this in the report; the starter
    replacement is the bricks lane's job.
- **Test room:**
  - for a grid brick, the room is a small floor of Ground cells plus a few cells of the brick, set where the helper
    Hero will touch them;
  - the Ground floor uses the standard Ground brick.
- Until the bricks lane merges, `gridBrickTemplate` throws. Use a local test double in tests, and say so in the report.
- Browser-check on port 5331 at 1366×768:
  - paint a row of ? blocks;
  - click one, then See inside;
  - press Done;
  - Play.
