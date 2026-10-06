# Step 6, builder lane report

Branch `claude/s6-builder`. Files touched: `studio/builder/**`, `studio/Stage.tsx`, `studio/stage/**`, `studio/persist/ProjectMenu.tsx` (not edited; only placed), and `studio/BrickList.tsx` (retired: deleted, nothing imported it). `store.ts`, `StudioApp.tsx`, `core/**`, `templates.ts`, `starter.ts` untouched.

Checks: `npx vitest run src/platformer/lab` and `npx tsc --noEmit -p tsconfig.app.json`. Tests below are named by file. Browser checks were done by driving a real browser pane at 1366 x 768 against `npm run dev -- --port 5311 --strictPort` (stopped afterwards). The browser pane is shared with the other lanes, so I used my own tab.

## What it looks like and how to try it

Open `/2d/lab/next`.
- **Header** is the real `AppHeader` (editor variant, 2D): brand, 3D/2D switch (3D leaves for `/build`), world name, local save status, Build / Play, account chip, and a ⋯ menu that holds the existing project menu (Save File, Open File, Reset). Scene and People are hidden by CSS because they belong to the old builder. Checked: header screenshot at 1366 x 768; ⋯ click opens the menu.
- **Bricks drawer** is the shared `DrawerPanel` / `PartPicker` with the real builder's classes. Categories: All, Terrain (Ground, Hard block, Spikes, Lava), Blocks (Brick, ? block as tiles, plus a brick named Spring), Items (Coin), Critters (Walker), Start and goal (Hero, Goal), My bricks (anything else, then **+ New brick**). Tile pictures are the real builder's art. Bricks are sorted by name (`catalog.ts` `categoryForBrick`). Tests: `builder/logic.test.ts` "drawer catalog", `builder/Builder.test.tsx` "lists the tiles and the level's bricks, and categories filter them" and "choosing a tile arms it...".
- **Undo / Redo** cluster (`HistoryTools`), Cmd/Ctrl+Z, Shift+Cmd+Z or Ctrl+Y.
- **Placing strip** with Erase (key E). Right-click erases too.
- **Stage**: the old Brush / Select / Snap toolbar is gone. A small floating panel (top right) keeps zoom, Fit and, in Play, the green flag and Whole level / Follow brick. Play loop, camera, keys, mouse, ask dialog and audio are unchanged. Test: `stage/Stage.test.tsx` (no toolbar in Build; flag and camera choice in Play; Delete and arrow-key nudge).
- **Look**: the level is a sky-blue field on cream; tiles use the real builder's art through the engine's own `tileKey`, so ground joins up (green studded top over dirt) and ? blocks, spikes, lava and orange bricks look the same. Click path checked: pick Ground, drag across the level, pick Lava, drag, pick ? block, drag; all drew in the Brickgineers look (screenshots).

## Painting, selecting, erasing

- Press logic is the pure `decidePress` (`builder/tilePaint.ts`). A drag fills the straight line between cells, so fast drags leave no gaps (`cellsOnLine`).
- Row 0 is the bottom row: `tilePaint.test.ts` "worldToCell: row 0 is the bottom row" (world y 0 is row 0, going up goes up, top row is rows - 1, outside is null) and `Builder.test.tsx` "a tile click paints the cell under it (row 0 is the bottom)" which clicks the canvas at world (40, 5) and (40, 100) and reads `design.tiles.data`.
- Selection vs painting: `tilePaint.test.ts` "decidePress: selecting vs painting" and `Builder.test.tsx` "clicking an existing copy selects it (and shows See inside) instead of painting" (tiles unchanged, copy count unchanged). Placing a brick copy does not select it, so painting several copies does not keep popping the card up (`Builder.test.tsx` "a brick click places one copy, snapped to the 8-step grid, and does not select it").
- Right-click and the Erase tool: `tilePaint.test.ts` "right-click and the Erase tool remove a copy first, otherwise clear the tile"; `Builder.test.tsx` "right-click erases a tile".
- Dragging a selected copy still moves it (snaps to 8), arrow keys nudge it by 8 (Shift: 1). Both are undoable.

## See inside card

Above the Placing strip when a copy is selected: brick picture and name, "N in this level", **See inside** (`store.openWorkshop(brickId)`), **Remove**, and this copy's knobs as sliders (`store.setKnob`). Range rule in `builder/knobs.ts` (0 to twice the start, step 1 for whole numbers else 0.05; stretches to hold the current value). Tests: `logic.test.ts` "knob slider range"; `Builder.test.tsx` "shows the brick, how many copies, and opens the workshop" and "edits this copy's knob with a slider, and Remove deletes the copy (undoable)". Click path checked: click the Walker in the level, the card appears with a `speed` slider, See inside opens the workshop (the lane stub), Done returns with the card, Undo and the drawer as they were.

## + New brick

Tile in My bricks opens "Make a new brick" (`NewBrickPicker.tsx`) built from `BRICK_TEMPLATES`; choosing a card opens a word picker (from `assets/words.ts` `BRICK_WORDS`; kids don't type), then `addBrickFrom` and `openWorkshop`. Name is made unique ("Robot 2"). `BRICK_TEMPLATES` is still empty here, so with no templates the picker says "Starter bricks are not ready yet" and offers a **Blank brick** (one blank 32 x 32 costume, same word picker, opens the workshop) so a kid can still start. Tests with a fake template (`builder/testTemplates.ts`): `Builder.test.tsx` "pick a template, pick a name, and the new brick is added, selected and opened in the workshop", "with no templates it says so and offers a blank brick", "Cancel makes nothing"; `logic.test.ts` "+ New brick" (workspace saved, ids fresh per make, names unique). Click path checked in the browser with the empty list: + New brick, Blank brick, word list shown (I did not finish naming it in the browser; the naming step is covered by the tests above).

## Undo / redo (no history in the store)

The store has none, so `builder/history.ts` keeps a stack of tile strokes and copy add / remove / move and replays them through `setTile`, `addCopy`, `deleteCopy`, `updateCopy`. A removed copy that returns under a new id is remapped in older entries; a stroke only touches cells that still hold what it expects. Knob, code and costume changes are not in it (they happen elsewhere). Capped at 200. Tests: `history.test.ts` (stroke, stale cell, redo cleared, add, remove with knobs plus earlier move, cap).

Done returns "exactly where you were": `StudioApp` unmounts the builder, so `builder/session.ts` keeps the history, Erase, drawer state and camera per store. Checked in the browser (Undo still enabled after See inside then Done, same view).

## Older saves have no tiles

`store.setTile` ignores a project without a tile layer. `builder/ensureTiles.ts` gives such a project an empty layer on mount (via `store.load`, restoring selection and brush). Tests: `logic.test.ts` "tile layer for older saves"; `Builder.test.tsx` "upgrades a save without tiles so painting works". The current starter has no tiles until the starter lane merges.

## Known gaps, honest notes

- **Play does not show tiles yet in the real app**: the renderer draws `world.tiles`, but core `instantiate` does not copy them until the tiles lane merges. I saw this in the browser (Build shows painted tiles, Play does not). There is no unit test for tile drawing in Play, because jsdom has no canvas; the Build drawing was verified by eye only.
- No test covers canvas drawing at all (jsdom); the look was checked by screenshots at 1366 x 768 only. Narrow / compact layout (drawer as bottom sheet) uses the shared components but I did not browser-check it.
- No horizontal scroll at 1366 x 768 (`scrollWidth` = 1366, checked with script).
- Header buttons for Help and the world menu items beyond the project menu do nothing (no help screen for the lab). Rename is not offered (free text).
- Full lab suite: all pass; `bricks/recipes.test.ts "double jump" timed out once in a first full run while the dev server and the other lanes loaded the machine; it passed alone and the final full run was clean (68 files, 775 passed, 25 expected fail).
- Store request (optional): a store `undo` or `setTiles` action would remove the need for `ensureTiles` using `load`.
