# Explore: the Code Lab builder (`/2d/lab/next`), 1366x768

Read-only pass. Method: Browser pane at 1366x768, starter level, then side by side with `/2d/build` on the same dev server. Console is clean apart from Blockly registry warnings (`Unable to find [category][flyoutinflater]`, `procedures_*` redefinitions). No overflow: page is exactly 1366x768, no scroll.

Caveat: the Browser pane is not composited, so `requestAnimationFrame` ran at about 3 fps and Play ran in slow motion. I could confirm that the arrows and Space work (the Hero jumped a Hard block) but I could not judge feel, or watch a death or a win. Death and win notes below come from reading `starter.ts` and `hero/heroBrick.ts`, and are marked as such.

## What already works well (do not churn)

- Header, Bricks drawer (search, category filter, collapse), Undo/Redo cluster, Placing strip and Erase button are visibly the same family as `/2d/build`. Same classes and layout.
- Drag-painting grid bricks (Ground) works, including a drag stroke; right-click erases one thing; drag-erase with the Erase tool works; `E` toggles the eraser; Ctrl+Z restores (also after a Play round trip).
- Placing a 2nd Hero MOVES the Hero (strip says "Moves your Hero · only one per level"). Good rule, clear words.
- Selection card is compact: picture, name, "N in this level", See inside, Remove. Per-copy knob (Walker "speed") is a plain slider with a live number. Walker card said speed 4, the Workshop's Knobs said 3 and "Changes apply to every copy", so the per-copy vs per-brick split is at least labelled.
- Selection survives See inside then Done; you land back on the same card.
- "Follow brick" camera in Play is a good size for a kid (the sprites are big and readable); Zoom/Fit buttons are 44px.
- + New brick: two short steps (template, then a name picked from a word list) with no free typing; nothing to misspell or moderate.
- Project menu has a confirm before Reset.
- Hit targets in the chrome are all 38-44px; drawer tiles are 77x78.

## Findings

### 1. BLOCKER: opening a Walker with See inside, then Done, makes the save unloadable; reload silently resets the whole level
- Path: clear `code-lab.project.v1`, reload, click a Walker, See inside, Done (change nothing), wait 1s, reload. Everything the kid built is gone and the starter is back, with no message anywhere.
- Evidence: after Done, `parse()` of the saved text fails with `unsafe-name` at `bricks[1].program.procedures[0].body[3].inputs.SPEED.inputs.NUM2.name` ("Name is empty..."). Painting alone saves a valid project (616,835 chars, ok). `loadProject` then writes the bad text to `code-lab.project.backup.v1` and returns the starter. The kid-friendly notice (`setStorageNotice`) is only rendered inside the "This world" menu (`ProjectMenu.tsx`), which is closed, so nobody sees it.
- Why it matters: this is the classroom scenario (build, peek inside a Walker, come back tomorrow). The student loses all work and is not told why.
- Fix: (a) find why the Workshop writes an empty-name input for the Walker's `walk at [speed]` procedure on close (probably an unnamed variable-reporter field in the serialized workspace; the Workshop owner should look); (b) make autosave refuse to write text that `parse()` rejects (keep the last good save and show the notice); (c) show the "we couldn't load your last save" notice as a toast in the builder, not only in the menu.

### 2. BLOCKER for students: Play has no instructions, no coin count, no pause, and no message when the Hero is gone or dies
- Play (click Play, no flag needed, it starts by itself) shows only a flag glyph, "Whole level / Follow brick", and zoom. Nothing says "arrows move, Space jumps". `/2d/build` Play shows a banner "move · Space jumps (hold to go higher) · hold Shift to run", a coin counter "x00", a timer and a pause button.
- Coins: the Stage brick counts a variable `coins` but nothing draws it (`renderer.ts` passes `variables: {}`). A kid collects coins and sees them vanish with no score.
- Death: from `hero/heroBrick.ts` ("hero hurt" = go to start), the Hero silently reappears at the start. No flash, sound, or text.
- Win: Goal says "Course clear!" in a speech bubble then `stop all`. The game freezes; there is no "play again" except the small ⚑.
- Hero removable: select the Hero, Remove (the card offers it), Play. The level runs with no Hero; arrows do nothing; no message. Undo fixes it but a kid will not think of that.
- Fix (simplest): reuse the `/2d/build` play HUD for the controls banner and coin counter (read the `coins` variable if present, hide otherwise). Do not offer Remove on the Hero card (it can still be moved). If there is no Hero on Play, show one line: "Place your Hero first" and stay in Build.

### 3. SHOULD FIX: the Play camera defaults to "Whole level", where the Hero is about 12px tall
- First Play: sprites are tiny; the Hero is hard to find. "Follow brick" (the good view) is one click away but its name is jargon: the tooltip is "Camera follows the selected brick" and it follows the selected thing, not "the Hero".
- Fix: default to following the Hero; rename the two buttons "Close up" and "Whole level" (or drop the toggle; Fit already exists), remove "Follow brick".

### 4. SHOULD FIX: the first click on the canvas moves the Hero (Hero is the armed brush on load)
- On load the strip says "Placing Hero · Moves your Hero". A kid who just clicks the level to see what happens relocates the Hero. `/2d/build` starts with Ground armed.
- Worse: clicks outside the level (the cream band above it, e.g. at 500,100 in the 800-wide frame) place the Hero out of bounds. In Build it floats above the level; in Play it falls into the sky from above the visible top. I did not find a clamp.
- Fix: start with Ground armed (consistent with `/2d/build`); clamp or ignore clicks outside the level.

### 5. SHOULD FIX: the selection card stays when you pick something else, and it covers the ground row
- Select a Hard block, then pick Coin in the drawer: the card still says "Hard block / 4 in this level" while the strip says "Placing Coin". Two things named at once. There is no way to dismiss the card: Escape does nothing, there is no close X, clicking blank sky with a brush armed places something.
- The card is centred at the bottom, exactly on the ground row (y about 340-400 of 800x449 frame). I selected a Walker, then clicked ground at x=470 to select a ground cell, and instead clicked "See inside" under the card and was thrown into the Workshop. Ground and low bricks under the card are unselectable while it is up.
- Fix: clear the selection when a drawer brick is chosen or Erase is toggled; Escape deselects; move the card up next to the selected thing, or to the top-centre, so it never sits over the ground.

### 6. SHOULD FIX: "My bricks" is empty after you make a brick
- + New brick, Coin template, name "Coin": a brick "Coin 2" is made and appears in the All and Items lists but not under My bricks (My bricks only shows "+ New brick"). Evidence: the drawer lists per category from the DOM.
- The kid picked the word "Coin" and silently got "Coin 2", sitting beside the original "Coin" with an identical picture. It is not clear which is which. A made brick is also not offered as "your own" anywhere.
- Fix: any brick created from + New brick goes in My bricks (and still All). Do not let the name list offer a name already in the level, or auto-suffix with something kid-readable ("My Coin"), and badge the thumbnail.

### 7. SHOULD FIX: terminology differs from `/2d/build` and inside the lab itself
- "copy" (strip: "Click to place a copy · click a copy to select it"; aria "Coin copy"; menu "Remove this copy") is jargon. `/2d/build` says "Click or drag to place". Say "Click to place" / "click one to select it" and drop "copy" everywhere a kid can see it.
- "level" vs "world": card says "7 in this level", strip says "only one per level", while the header menu is "This world" and the Workshop says "3 in My world". Pick one. `/2d/build` says "world" ("My world", "This world").
- "Block (snaps to grid)" template, "Empty: a blank brick, you write the blocks": "block" now means three things (a ? block, a Scratch block, the template). Say "Solid brick" and "Blank".
- "Remove" on a Ground card under "64 in this level": a kid fears it removes all 64. It removes one cell (tooltip says "Remove this block", not visible without hovering). Hide the count for grid bricks, or label "Remove this one".
- "Placing / Erasing" strip, with the chip reading "Eraser": "ERASING / Eraser". Say "Erasing" once.
- "Reset" in the project menu: the confirm says "Start over with the fresh starter playground?" ("playground" is also a new word). Say what is lost: "Start over? Your changes will be lost."
- Play flag: aria label "Green flag (start scripts)" (a Scratch idea), visible text is a ⚑ glyph. Either hide it (Play already starts) or label it "Restart".

### 8. SHOULD FIX: dragging a non-grid brick does not paint a row
- Coin armed, drag across the sky: one coin at the start and a ghost at the end. Strip says "Click to place". `/2d/build` says "Click or drag to place" for the same bricks. A kid will drag expecting a line of coins.
- Fix: drag-place at grid spacing for any brick except the singletons (Hero, Goal), or at least make the hint honest. (Consistency with `/2d/build` favours drag-place.)

### 9. SHOULD FIX: drawer thumbnails are 16px pixel art in a 77px tile
- The real drawer uses big illustrated bricks; here the 16x16 (Coin 12x12) pixel sprites float small in a large tile and are hard to tell apart (Hard block vs Bounce block vs Hero are grey-blue blobs). Evidence: `builder-costume-thumb` is 16x16 at 54,210; the strip swatch is the same.
- Fix: scale the thumbnails up 2x to 3x with `image-rendering: pixelated` (box 40 is already requested, the sprite just is not scaled to fill it).

### 10. POLISH: first-contact language and stale metadata on the stage
- The canvas draws "960 x 380" in the top right and a "(0, 0)" corner label (`renderer.ts`). Meaningless to a 10-year-old and not in `/2d/build`. Remove both.
- Returning from the Workshop flashes the stage for a frame at a larger scale (a "960 x 360" label seen at 2x). Cosmetic, but every return shows it.
- The project name "Starter Platformer" cannot be renamed (no pencil); `/2d/build` has "My world" with a rename pencil. Students will want to name the level.
- "This browser only" is shown, but there is no "Saved" confirmation or error. `saveLabDoc`'s quota failure is surfaced only in the menu notice (same hidden-notice problem as finding 1).
- Storage: the save is 617 KB, the backup key holds another full copy, so about 1.2 MB of the roughly 5 MB origin quota, with 14 bricks. Each new brick with costumes and workspaces adds more; a class that makes many bricks could hit the quota. Worth a measurement.
- The Project menu popover opens over the Zoom/Fit buttons (it overlaps them while open). Minor.

### 11. POLISH: drawer has 7 filters for 14 bricks
- All, Terrain, Blocks, Items, Critters, Start and goal, My bricks. For this many items the category dropdown is clutter, though `/2d/build` has the same (with Gizmos). Consider showing the dropdown only past about 20 bricks (and keep search).

## Consistency with `/2d/build` (divergences)

| Area | `/2d/build` | `/2d/lab/next` |
|---|---|---|
| Header title | "My world" with a rename pencil | "Starter Platformer", read-only |
| Header links | Scene, Character, People | none (Scene is in the DOM at 0x0) |
| Armed on load | Ground | Hero (first click moves it) |
| Brick art | large illustrated Lego-style bricks, 3-wide grid, tall list with Pipe, power-ups, enemies, gizmos, Checkpoint | 16px pixel sprites, 14 bricks; fewer bricks (no Pipe, Checkpoint, Shellbug, Flyer, Spiky, Moving platforms, power-ups) |
| Level look | zoomed-in scenic world (sun, painted hills) with grid lines | whole-level pixel-art strip, level size text and (0,0) label, cream band above and below |
| Strip hint | "Click or drag to place · right-click erases" (plus a one-time banner under it) | "Click to place a copy · click a copy to select it · right-click erases" |
| Select a placed thing | clicking a placed coin did not open any card | card with See inside, Remove, knobs (new feature; fine, but it is the only thing that differs in what a click does) |
| Drag-place | yes | grid bricks only |
| Play HUD | coin counter, timer, pause, controls banner, power meter | only flag, camera toggle, zoom |
| Play camera | follows the character, close | whole level by default |
| Start of level | "Start" brick | the Hero brick; "Goal" matches |
| Project menu | World/Scene menu items | Save File / Open File / Reset |
| Terminology | world, brick, "Start" | level, copy, grid, block, Hero |

## Top simplifications (removals, not additions)

1. Remove the "960 x 380" and "(0, 0)" labels.
2. Remove "Follow brick" / "Whole level" toggle; follow the Hero by default, keep Fit.
3. Remove the card's Remove for the Hero and Goal (move them instead).
4. Remove "copy" from every visible string.
5. Hide the "N in this level" count on grid bricks and singletons.
6. Hide the ⚑ button in Play.
7. Drop the category dropdown until the drawer has more than about 20 bricks.
