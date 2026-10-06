# Code Lab — step 6: Brickgineers builder + Brick Workshop

The owner approved this direction from the mocks:
- Builder + workshop: https://claude.ai/artifact/1Brn1cJpC15A6ypAYeTARo
- Builder look: https://claude.ai/artifact/QrAyBLL7bZBo2RSXXtj7YQ, Build mode only

**The model**
- **The builder looks and works like the real `/2d/build`**: app header with 3D/2D and Build/Play; the floating **Bricks** panel with categories; undo/redo; the **Placing** strip; painted tiles.
- Code is not on the builder screen. Click a placed brick for **🔍 See inside**, or use **+ New brick** (start from a brick that works). Either opens the **Brick Workshop**, full screen, and **✓ Done** returns to the builder exactly where you were.
- The workshop is a Scratch-style editor (Code / Costumes / Sounds), with a **test room** where the brick runs on its own and a **Knobs** card (the brick's `showInBuild` variables as sliders).
- **Code reads in layers, all real Scratch:**
  1. Scripts are a few short stacks made of **My Blocks**, each stack with a one-line label.
  2. **🔍 on a My Block call** opens its definition, with a breadcrumb and Back.
  3. **🔍 on a Platformer block** opens a card: "how this works in plain Scratch".
- No invented high-level blocks: logic must stay portable to regular Scratch.

Route stays `/2d/lab/next`. Swapping it in for the real `/2d/build` (converting old levels to the new engine) is the **next** step, not this one.

Integration branch `claude/code-lab-core`. Each lane works on its own branch and worktree, forked from the step 6 contract commit.

## Contract (already committed — don't change it)

- **Tiles.** `core/contracts.ts`: `LevelDesign.tiles?: TileLayer`, `World.tiles?`, `TileKind`, `TILE_KINDS`, `SOLID_TILES`, `TILE_CHAR`, `TILE_SIZE = 16`.
  - Row 0 is the **bottom** row (y up). `data[r]` is a string of `cols` characters from `TILE_CHAR`, with `'.'` for empty.
  - Solid kinds (ground, brick, hard, qblock) stop Platformer bodies. Spikes and lava are not solid; they're sensed.
- **Store.** `studio/store.ts`:
  - `workshopBrickId`, `openWorkshop(id)`, `closeWorkshop()`;
  - `brushTile` and `setTileBrush(ch)` (null means painting bricks);
  - `setTile(col, row, ch)`;
  - `addBrickFrom(brick, workspace)` adds a brick from a template, selects it, and returns its id.
- **Shell.** `StudioApp.tsx` shows `<Builder>` or, when `workshopBrickId` is set, `<Workshop>`. Lanes don't edit `StudioApp.tsx` or `store.ts`; ask in the report instead.
- **Templates.** `studio/templates.ts`: the `BrickTemplate` interface and `BRICK_TEMPLATES` (starter lane fills it in, builder lane uses it).

## Lanes

### tiles: the tile layer in the core
Files: `core/**` except `core/editor/**`, plus a new `core/editor/tileBlocks.ts`.
- `instantiate` copies `design.tiles` into the world.
- `physicsStep`:
  - solid tiles block bodies exactly like solid bricks (same push-back, `onGround`, bump sides);
  - a bump against a tile reports BRICK `_tiles_` and also matches `_any_`;
  - use a grid lookup, not a scan of every tile.
- **New Platformer boolean** `platformer_touchingtile`, worded `touching tile [spikes ▾]?` with `fields.TILE` = a `TileKind`. It's true when the target's box overlaps a cell of that kind.
- `validateDesign`/save:
  - tiles must be well formed: rows × cols, allowed characters, and size caps (≤ 400 cols, ≤ 60 rows);
  - round-trip through `serialize`/`parse`;
  - old saves without tiles keep loading.
- `core/editor/tileBlocks.ts` exports the new block's Blockly JSON definition plus the toolbox entry, and the extra `BRICK` menu option `["a tile", "_tiles_"]`. The integrator wires them in (the editor files belong to another lane).
- Tests, kid-visible:
  - lands on a ground tile;
  - stops at a brick-tile wall;
  - head-bumps a tile ceiling;
  - `touching tile [spikes]?` is true on spikes and false beside them;
  - bump hats with `_tiles_` fire;
  - 1,000 tiles plus 20 bodies run 300 ticks in under a second (record the number);
  - replays identically.

### builder: the Brickgineers 2D builder look
Files: `studio/builder/**`, `studio/Stage.tsx`, `studio/stage/**`, `studio/BrickList.tsx` (retire or reuse), `studio/persist/ProjectMenu.tsx` (placement only).
- **Match `/2d/build`**:
  - Read `src/platformer/ui/BuildShell.tsx`, `src/platformer/ui/platformer.css`, `src/shell/AppHeader.tsx`, `src/shell/PartDrawer.tsx` and `src/styles.css` tokens, and reuse those components and classes where you can instead of restyling from scratch.
  - Header: brand, 3D/2D switch (linking to the 3D builder), world name, save status, ⚒ Build / ▶ Play, ⋯ with the project menu.
  - Floating **Bricks** panel with search and categories: **Terrain** tiles (Ground, Hard block, Spikes, Lava), **Blocks** (Brick and ? block as tiles; the Spring brick), **Items** (Coin), **Critters** (Walker), **Start and goal** (Hero/Start, Goal), and **My bricks** (bricks you made, then a **+ New brick** tile).
  - Undo/redo cluster (wire it to a simple history in your files if the store has none; note that in the report).
  - **Placing** strip with Erase.
- **Painting.** Tiles paint with click-drag (`setTileBrush`, `setTile`). Bricks place as copies. Right-click erases.
- **Stage.** Draw tiles in the Brickgineers Lego look (green studded ground over dirt, orange bricks, yellow ? blocks, grey spikes, lava). Keep the existing Play loop, camera and keyboard behavior.
  - Remove the Stage's own Brush/Select toolbar: the builder chrome replaces it.
  - In Build, clicking an existing copy selects it (`store.selectCopy`) instead of painting over it.
- **See inside.** When a copy is selected, show a small card in the builder style above the Placing strip: brick icon and name, "N in this level", **🔍 See inside** (`store.openWorkshop(brickId)`), Remove, and that copy's knobs (`setKnob`).
- **+ New brick** opens a "Make a new brick" picker from `BRICK_TEMPLATES`. Choosing one calls `addBrickFrom`, then `openWorkshop`. Name it from a picked word list.
- Must work at 1366 × 768 with no horizontal scroll. Browser-check on port 5311.

### workshop: the Brick Workshop screen
Files: `studio/workshop/**`.
- Full screen:
  - **Header:** ✓ Done (`closeWorkshop`), the brick icon and name, "N in My world", and "Changes apply to every copy".
- **Left:** Code / Costumes / Sounds tabs hosting the existing `CodeEditor`, `CostumeEditor` and `SoundPanel`. They already follow `selectedBrickId`, which `openWorkshop` sets. Give the code editor the room it needs.
- **Right, Test room:** a small sandbox design with the brick running on its own, rendered with the existing stage renderer functions.
  - Room: about 320 × 160 steps, with a tile floor and walls. Level walls and floor already stop bodies, so it works before the tiles lane merges.
  - Bricks other than the Hero get a helper Hero, to touch coins, land on springs and reach goals.
  - If the brick is the Hero, the room is playable with the keyboard.
  - Restart when the brick's code or knobs change (watch `revision`, debounced). There's also a Restart button.
- **Right, Knobs card:** each `showInBuild` variable as a slider with its variable name shown. Changing one sets the variable's default (`setVariableKnob(brick, id, true, value)`) and restarts the room.
  - Pick slider ranges from the value: 0 to 2× the default, step 1 for integers and 0.05 otherwise, unless the lane finds a better rule.
- Must work at 1366 × 768. Browser-check on port 5312. Test the room design builder headlessly.

### myblocks: layered code in the editor
Files: `studio/code/**`, `studio/CodeEditor.tsx`, `core/editor/**` except `tileBlocks.ts`.
- **Top-level view.** Show the brick's scripts, with My Block **definitions** kept out of the way. For example, collapse them onto a "My Blocks" shelf area, or keep them off-canvas.
- **🔍 on My Block calls.** Each `procedures_call` gets a 🔍 (a clickable Blockly field or icon). Clicking it **drills into** that definition: show it expanded and centered, with the other scripts dimmed or hidden, a breadcrumb ("Walker's scripts › walk at") and **← Back**. Editing inside the definition must save normally.
- **Labels.** Each top script's hat shows its one-line label, as a block comment or a label attached to the hat. Keep the label in the saved workspace JSON so the starter can author it.
- **🔍 on Platformer blocks** opens a card, "How *turn gravity on* works in plain Scratch": a short explanation plus the equivalent plain-Scratch blocks, rendered read-only (a small read-only Blockly workspace is ideal). Cover every Platformer opcode. Put the content in `studio/code/plainScratch.ts`.
- **Palette.** The My Blocks category comes first.
- Tests:
  - the drill-in and back state machine;
  - plain-Scratch card content exists for every Platformer opcode;
  - the plain-Scratch block JSON compiles with zero errors;
  - labels survive a Blockly save/load round trip.
- Browser-check on port 5313.

### starter: bricks written with My Blocks, a tile level, templates
Files: `studio/starter.ts`, `studio/starter.test.ts`, `studio/templates.ts`, `studio/hero/**` (only to add scripts or labels to the Hero, never to change its feel math).
- Rewrite the starter so the **ground and platforms are tiles**, not bricks: a ground row, a few floating brick and ? platforms, one spike pit, one gap.
- Bricks, each as a few labeled scripts made of My Blocks (real `procedures_definition`/`procedures_call` with extraState `{ proccode, argumentNames, warp }`, as in `studio/hero/heroBrick.ts`):
  - **Walker:**
    - `when ⚑ clicked → walk at (speed) → forever: check for stomp`
    - `when I bump [left/right] of [anything] → turn around`
    - definitions: `walk at (speed)` (gravity on, set x speed), `turn around` (negate x speed, flip direction) and `check for stomp` (touching Hero: if the Hero is above, broadcast stomped and hide; else broadcast hero hurt).
  - **Coin:** `spin` and `check for Hero`.
  - **Spring:** `launch the Hero` (broadcast boing). The Hero answers `when I receive boing → set y speed to 14`.
  - **Goal:** `check for the Hero` (broadcast course clear and stop all).
  - **Hero:** keep its program. Add labels and the handlers for `boing`, `hero hurt` (go back to the start) and `touching tile [spikes]?` (go back to the start).
  - Two Walkers with different `speed` knobs.
- `templates.ts`: fill in `BRICK_TEMPLATES` with Walker, Coin, Spring, Goal and Empty.
- Tests:
  - the starter validates and every workspace compiles with zero errors (unknown-opcode warnings for `platformer_touchingtile` are allowed until the tiles lane merges; say so);
  - templates produce valid bricks;
  - the play expectations are written as `it.todo` with exact numbers: Hero lands on the ground tile, Walker turns at a tile wall, spikes send the Hero to the start, the spring launches, the coin counts.

## Rules

[`WAVE2.md`](WAVE2.md)'s rules apply:
- own only your files;
- keep the core deterministic;
- clean room;
- tests;
- browser-check your own feature;
- no new dependencies;
- no push, merge or branch switching;
- write a report at `docs/qa/code-lab-core/reports/step6-<lane>.md`, where every claim names a test you ran, or a click path you checked in the browser.

Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
