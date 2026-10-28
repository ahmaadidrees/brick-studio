# Code Lab — step 6b: fix pass after the owner's first try

The owner tried step 6 at `/2d/lab/next` and reported:
1. Blocks and parts don't behave the same as the real `/2d/build`. The likely cause is tiles: ? blocks don't pop coins, lava doesn't hurt, and one-way and bounce blocks are missing.
2. The Hero shows an overwhelming list of tuning sliders (32).
3. The Hero has no See inside, and you can place many Heroes.

Also from the integrator's browser check:
- plugin "to do something / return" blocks clutter the My Blocks palette;
- a label overlaps a script;
- a My Block call's input sits on its own row;
- the sunset backdrop isn't the Brickgineers sky;
- undo misses knob edits.

Integration branch `claude/code-lab-core`. Each lane works on its own branch and worktree, forked from the step 6b contract commit. The [`STEP6.md`](STEP6.md) and [`WAVE2.md`](WAVE2.md) rules still apply. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Reports go in `docs/qa/code-lab-core/reports/step6b-<lane>.md`; every claim names a test or a click path.

## Contract (already committed — don't change it)

- **New tile kinds** in `core/contracts.ts`: `semi` (one-way platform, `-`), `bounce` (bounce block, `O`) and `used` (a ? block after it's been hit, `U`).
  - `SOLID_TILES` now includes `bounce` and `used`.
  - `semi` is special: it stops a body only when the body is falling onto its top from above.
- **`BrickDef.limit?: number`.** It's 1 for the Hero and the Goal (one per level). Missing means no limit.

## Lanes

### tiles: tile behaviors like `/2d/build`, tile art, and the sky
Files: `core/**` except `core/editor/**` (but including `core/editor/tileBlocks.ts`), `studio/stage/**`, `studio/builder/catalog.ts`, `studio/builder/tileArt.tsx`.

Read the real engine first and copy its *behavior* (not its code structure): `packages/platformer-core/src/engine/tiles.ts`, `player.ts`, `world.ts`, `events.ts`.

- **semi (one-way platform):** a body moving up passes through it; a body falling onto its top lands, with `onGround` true.
- **qblock:** when a body moving up hits its bottom, it turns into `used` (an engine tile change, saved only in the world, never the design) and the bump is reported.
  - The renderer shows a short coin-pop above it (view-only animation).
  - Counting the coin is the *code's* job, in the Hero, via the bump hat below. The engine has no hidden score.
- **bounce:** match the old bounce block's behavior and numbers (`feel.ts` `bounceLow`/`bounceHigh` and how `player.ts` applies them). Convert from 60 Hz px/frame to the 30 Hz steps/tick the Platformer uses. Write the conversion next to the code.
- **brick:** in the old game it only breaks when the player is big, and there's no "big" here, so it's a plain solid you can bump. Write that down.
- **Bump matching:** every tile bump also matches `BRICK = "tile:<kind>"` (for example `tile:qblock`), in addition to `_tiles_` and `_any_`.
  - Export `TILE_BUMP_OPTIONS: [label, value][]` from `core/editor/tileBlocks.ts` (for example `["? block", "tile:qblock"]`) for the integrator to add to the bump menu.
- **Lava:** a non-solid tile, sensed with `touching tile [lava]?`, the same as spikes. The Hero's code handles it (hero lane).
- **Art:** draw `semi`, `bounce` and `used` in the real builder's tile look (`tileArt.tsx` / `stage/tiles.ts`). Add One-way platform and Bounce block to the Bricks panel's Terrain and Blocks categories (`catalog.ts`).
- **Sky:** when the stage has no backdrop costume, draw the Brickgineers day sky (the real builder's sky and hills: see how `src/platformer/render` draws its background) instead of a flat color.
- **Tests, kid-visible:**
  - jump up through a one-way platform and land on it;
  - hit a ? block from below and it becomes used, firing the bump with `tile:qblock` once;
  - bounce height matches the converted old numbers;
  - old saves still load;
  - replay is identical.

### hero: one Hero, a See inside for it, friendly knobs
Files: `studio/hero/**`, `studio/starter.ts`, `studio/starter.test.ts`, `studio/templates.ts`, `studio/workshop/**`, `studio/builder/**` except `catalog.ts` and `tileArt.tsx`.

- **One per level.** Set `limit: 1` on the Hero and Goal bricks (starter and templates).
  - The builder enforces it: placing a limited brick when one already exists **moves** the existing copy (like Start in `/2d/build`), and the Placing strip says "Moves your Hero".
  - The Bricks panel labels the Hero "Hero", not "Start".
- **See inside for the Hero.** Clicking the Hero in Build selects it and shows the card with **🔍 See inside**. Find out why it was missing (picking order, a hidden Hero, a card rule) and fix it, with a test.
- **No per-copy knobs** on the card for bricks with `limit: 1`. Their knobs live in the workshop.
- **Hero knobs:**
  - Only 4 Hero variables are `showInBuild`: walk speed, run speed, jump power, gravity.
  - Every other tuning variable stays a normal variable in the code.
  - The workshop's Knobs card shows the 4, then a collapsed **"More tuning (N)"** section grouped as Walking / Running / Jumping / Falling / Walls (export the grouping from `studio/hero/heroBrick.ts`). Expanding it shows those variables as sliders too.
  - Other bricks: Knobs shows their `showInBuild` variables, the same as today.
- **Starter:**
  - The Hero handles lava like spikes (back to the start).
  - `when I bump [bottom] of [tile:qblock] → change coins by 1` (a labeled script).
  - Add a one-way platform and a bounce block to the level.
  - Remove the sunset backdrop so the default sky shows.
  - Update the starter play tests. Where a test needs the tiles lane's physics (one-way, ? block, bounce), write it as `it.todo` with exact expectations, and the integrator flips it.
- **Undo** in the builder covers per-copy knob edits (`builder/history.ts`).
- Browser-check on port 5321.

### editor: code polish and a block smoke test
Files: `studio/code/**`, `studio/CodeEditor.tsx`, `core/editor/**` except `tileBlocks.ts`.

- **Palette:** only Scratch-style My Blocks. Remove the `@blockly/block-shareable-procedures` blocks ("to do something", "return", if-return) from the My Blocks category. **Make a Block** must keep working. Keep the plugin registered only if something still needs it, and say what.
- **Inline inputs:** My Block calls render their inputs **inline**, between the words of the proccode ("walk at ( )", "jump ( ) times < >"), as Scratch does. The same goes for the definition's prototype.
- **No overlap on open:** when a workspace opens with top-level scripts or their labels overlapping, arrange them (Scratch's "Clean up": a column, labels above their stacks). Don't rewrite a layout the kid has arranged unless it overlaps.
- **Undo/Redo buttons** in the code editor toolbar, wired to Blockly's own undo stack.
- **Block smoke test** (the owner said "not all of the blocks seem to be working the same"):
  - for **every block in the toolbox**, build a tiny workspace that uses it in a `when ⚑ clicked` script with its default inputs;
  - compile it (zero errors, no unknown opcodes) and run 60 ticks in a small design (no thrown errors);
  - for each Scratch block with a §01 fixture, link the fixture test name in the report;
  - list any block that compiles to nothing, or is a no-op at runtime, as a finding.
- Browser-check on port 5323.
