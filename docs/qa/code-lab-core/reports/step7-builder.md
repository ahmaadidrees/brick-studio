# Step 7 builder lane: paint grid bricks, See inside any cell, convert old saves

Branch `claude/s7-builder` (forked from 8b12fc1). Files owned: `studio/builder/**`, `studio/stage/**`, `studio/Stage.tsx`,
`studio/storage.ts`, `studio/workshop/roomDesign.ts` and their tests, plus new `studio/legacySave.ts`.

**Test double.** `gridBrickTemplate` throws until the bricks lane merges, so every test that needs it mocks it with
`studio/builder/testGridBricks.ts` (`fakeGridTemplate`: same keys, chars, names, categories and hints; plain 16x16 costumes
(Ground has two: `autotile`), no scripts). That file is test-only. The real bricks are not exercised here. The engine lane is
not merged either, so cells are not targets on Play in this branch (see "Not verified").

Every claim below names a test (`vitest`, under `src/platformer/lab/studio/`) or a click path.

## What changed

**Bricks panel** (`builder/catalog.ts`, `BuildPanels.tsx`). The fixed tile entries are gone.
- Terrain lists Ground, Hard block, Spikes, Lava, One-way platform and Blocks lists Brick, ? block, Bounce block, even when the
  level has none of them: `logic.test.ts` "has no fixed tiles ...", `Builder.test.tsx` "lists the standard grid bricks ...".
- Picking one the level lacks calls `store.addBrickFrom(template.brick, template.workspace)` and arms it; picking it again adds
  nothing: `Builder.test.tsx` "choosing a grid brick the level lacks adds it ... arms it to paint".
- A kid's own grid brick is under My bricks, other bricks sort by name as before: `logic.test.ts` "a standard grid brick the
  level has is that brick ...".
- Arming = `brushBrickId` is the grid brick; the Stage derives the char from `grid.char` (`store.brushTile` is no longer used).
- Click path: open /2d/lab/next, the drawer shows Ground ... Bounce block, Hero, Walker ... (browser check below).

**Painting.** Drag with a grid brick armed paints its char, one undo step (`Builder.test.tsx` "dragging with ? block armed paints
a row ... as one undo step"). Right-click or Erase clears a cell (`Builder.test.tsx` "with a normal brick armed ... right-click
still erases it"; `tilePaint.test.ts` "a copy in front of a cell wins, and erasing a cell paints '.'"). A different grid brick
paints over a cell (`Builder.test.tsx` "painting a different grid brick over a cell replaces it").

**Build drawing** (`stage/renderer.ts` `drawGridCells`, `stage/gridCells.ts`). Each filled cell is drawn with its brick's costume;
autotile = costume 2 when the cell above (row + 1) is the same char: `gridCells.test.ts` "autotile costume rule" and "draws one
image per filled cell on screen, grass on top and dirt under it". Off-screen cells are skipped (`gridCells.test.ts` "cells off
screen are not drawn"). The sky is kept (`sky.test.ts` "paints the level rectangle in the Brickgineers sky blue"). Tile-kind
drawing, `engineGrid`, `tileArtKey`, the coin-pop view animation and `TileArt` are removed (`stage/tiles.ts` became `stage/sky.ts`).
Cells are still drawn behind placed copies in Build, so a Hero in front of a cell is drawn and picked first.

**Play drawing.** The renderer no longer draws `world.tiles`; cells are drawn as the ordinary targets they become (engine lane).
Performance work for thousands of sprites: `drawSprite` has a fast path (upright, no effects: one `drawImage`, no save/restore) and
skips sprites outside the view. `gridCells.test.ts` "draws only the sprites on screen ... whatever the level size" (4,000 targets,
about 830 draws) and "4,000 sprites render in well under a frame budget": **1.0 ms per frame for 4,000 sprites all on screen**
(fake canvas, so it measures our loop, not the browser's blit; the real number has to be taken after the engine merges).
Costume images are cached by the existing `ImageCache` (one `Image` per asset string).

**Selecting a cell** (`builder/cells.ts`, `tilePaint.ts` `decidePress`, `Stage.tsx`, `SeeInsideCard.tsx`).
- Press on a painted cell with no grid brick armed, a normal brick armed, or the cell's own brick armed -> `selectCopy('cell:<col>:<row>')`
  (`tilePaint.test.ts` "decidePress: painted grid cells"; `Builder.test.tsx` "clicking a painted cell selects it as cell:<col>:<row> ...").
  With a grid brick armed the same press also starts a paint stroke, so a drag can go on painting.
- Card: icon, name, "N in this level" (cell count), See inside, Remove, no knobs (`Builder.test.tsx` same test: no slider, no knobs group).
- See inside opens the workshop on the brick; Done returns with the cell still selected (`Builder.test.tsx` "See inside opens the workshop
  on the ? block brick, and Done brings the builder back with the cell still selected").
- Remove clears just that cell, undoable (`Builder.test.tsx` "Remove clears just that cell"). Delete key does the same; arrows do not nudge
  a cell; `store.deleteCopy('cell:..')` does not throw (`Builder.test.tsx` "the Delete key removes the selected cell too ...").
- A copy in front of a cell still wins the click (`Builder.test.tsx` "a Hero standing in front of a cell still wins the click"; `decidePress` test).
- Every builder path that reads `selectedCopyId` copes with `cell:` ids: Stage keyboard (Delete/arrows), the move drag (only started for copies),
  the card, the renderer's outline (a dashed outline on the selected cell, a faint one on hover). The store is untouched.

**Old saves** (`studio/legacySave.ts`, called from `storage.ts` `loadProject`). A save whose tiles use characters no grid brick owns gets the
standard bricks from `LEGACY_TILE_BRICKS` (plus their workspaces) and 'U' becomes 'Q'. It works on the JSON text before `parse`, because after
the engine lane validation rejects tile chars without a brick. Tests in `storage.legacy.test.ts`, against `__fixtures__/step6b-save.json`
(a real 6b save: `exportProjectJson(createStarterProject())` from this branch's 6b starter, one ? block turned into 'U', Hero code with
`platformer_touchingtile`):
- "the fixture really is a step 6b save" (chars `- B G H O Q S U`, no grid bricks, `platformer_touchingtile` present);
- "adds the standard grid bricks for every character in use, with their workspaces, and rewrites U to Q";
- "keeps everything else ... and the Hero code with platformer_touchingtile" (Hero workspace and program byte-identical, only U -> Q differs in tiles);
- "converted bricks come back from JSON as real bricks (masks decoded) and the design validates";
- "a second save and load changes nothing (idempotent)"; "lava is converted too, and a new brick id never collides"; "a save that already has
  the grid brick ... is not given a second one"; "a level with no tiles, plain text, or damaged JSON passes through untouched".
If a standard brick cannot be built (today's stub), the save loads as it was.
**Old Hero code:** workspace JSON is never edited, so a Hero using `platformer_touchingtile` still loads (that test). Replacing it in the starter
is the bricks lane's job; once the engine removes the block, the compiler must show its unknown-block diagnostic (engine lane).

**Test room** (`workshop/roomDesign.ts`). The room always has the standard Ground brick (`room_ground`, from `gridBrickTemplate('ground')`) for its
floor and wall columns, or the brick itself when it is Ground. A grid brick gets no copy: three of its cells on the floor in the helper's path
(cols 8-10) and three floating two tiles up (cols 12-14, row 3) to jump into from below or land on. `roomDesign.test.ts`: "has a floor and wall
columns of the standard Ground brick", "a grid brick (? block) gets Ground cells for a floor plus its own cells ... and no copy", "the Ground brick
itself is its own floor"; the existing plain-brick tests still pass (brick order is now `[brick, helper, ground]`).

## Browser check (port 5331, 1366x768, `code-lab.project.v1` cleared)

With `gridBrickTemplate` temporarily stubbed locally by the test double (reverted, never committed):
1. Drawer showed Ground, Hard block, Spikes, Lava, One-way platform, Brick, ? block, Bounce block, Hero, Walker, Coin, Spring, Goal, + New brick.
2. Clicked ? block (added to the level), dragged across the stage: a row of 9 ? blocks (row 10 in the saved tiles), plus the starter's own `Q` cells
   now drew as ? blocks. Autosave held `? block:Q` and the row.
3. Clicked a painted block: dashed outline on that cell and the card "? block / 19 in this level / See inside / Remove".
4. See inside opened the workshop on `? block`; Done returned to the builder with the card still showing.
5. Play: the level ran, but the cells are gone: expected until the engine lane merges (nothing draws `world.tiles` any more and cells are not targets yet).
Note: the browser tool's screenshot lagged one action behind, so some steps were confirmed from the DOM instead.
Dev server stopped; `gridBricks.ts` restored.

## Needs from the store, other lanes, and the integrator

- **Workshop header (not mine):** the workshop says "0 in My world" for a grid brick: it counts `design.copies`. It should count cells, e.g.
  `cellCount(design, brick.grid.char)` from `studio/builder/cells.ts`.
- **`persist/projectIo.ts` `importProjectJson` (not mine):** it calls `parse` directly, so an imported old save is not converted and, once the engine
  validates tile chars, would be rejected. Wrap the text: `parse(upgradeLegacySaveText(text))` (`studio/legacySave.ts`; `storage.ts` imports it so
  `projectIo` can't import `storage` without a cycle, import `legacySave` directly).
- **Store:** `deleteBrick` leaves that brick's chars in `design.tiles` (and cells have no copies to remove): after the engine's "every tiles char must
  belong to a grid brick" rule that makes an invalid design. Nothing calls `deleteBrick` today, so I did not work around it; the store should also clear the
  brick's cells. `brushTile` / `setTileBrush` are now unused by the builder (kept in the store; ensureTiles still restores them).
- **Starter (bricks lane):** a fresh starter (no storage) still has tile chars with no bricks in this branch, so they don't draw in Build until the bricks lane gives
  the starter grid bricks. `loadProject` only converts saved projects.
- **Draw order:** Build draws cells behind copies (so a Hero stands in front and wins the click); the contract puts Play cells after `design.copies`. A copy
  placed over a cell will draw over it in Build but under it in Play. Integrator's call whether that matters.
- **Typecheck:** `npx tsc --noEmit -p .` checks nothing (the root tsconfig has `"files": []`); I ran `npx tsc --noEmit -p tsconfig.app.json` (clean).

## Not verified here

Play of grid cells, ? block coin clones and everything that depends on the bricks' own code (engine and bricks lanes), real-canvas frame time with
thousands of sprites, and the real Ground/costume art in the drawer (thumbnails are 16 px native: the costumes' own size).
