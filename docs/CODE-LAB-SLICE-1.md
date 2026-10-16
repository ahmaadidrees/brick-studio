# Code Lab Slice 1: the core loop

Spec · 2026-10-15 · Agreed with the owner after the One Medium mock
(https://claude.ai/artifact/9nN1hnA3G9Ck7RV3ABM3FX, "Platformer" tab). Branch `claude/code-lab-slice-1`, made from
`claude/code-lab-core` 2cd8d94. This page wins over older Code Lab docs where they disagree on the builder and
workshop experience; [CODE-LAB-BRICK-MODEL.md](CODE-LAB-BRICK-MODEL.md) still owns the brick model and the runtime
rules.

## Why this slice

Code Lab's runtime and brick model are sound. What students feel today gets in the way:

- See inside opens a full-screen workshop, so the world disappears;
- the Hero's code is a wall of about 80 blocks;
- the choice between this copy and all copies was never designed;
- nothing shows which block is running.

Slice 1 fixes the loop a student goes round over and over: **pick a brick in the world, tune it, look inside, change
it, watch it change.** It covers the platformer, single player only. Rooms, race bricks, 3D, the blank canvas and the
library come later (see "Later").

The ladder this slice serves, from the mock: **Play → Build → Tune → Peek → Mod → Make.** Each step must be reachable
from the one before, without a page change.

## Before you start

- Read, in this order:
  1. the mock's Platformer tab;
  2. `docs/CODE-LAB-BRICK-MODEL.md`;
  3. the three review files in `docs/qa/code-lab-core/explore/` (`builder.md`, `workshop.md`, `copy-and-simplify.md`).
- The studio is at `/2d/lab/next` (`src/platformer/lab/studio/StudioApp.tsx`). Run it locally and click through it
  before changing anything.
- **Rules:**
  - Never push to `main`.
  - Don't change the live 2D builder (`src/platformer/game`, `src/platformer/ui`) or `packages/platformer-core`.
    Code Lab isn't live, and this slice doesn't ship to brickgineers.com.
  - Agents may read Scratch's AGPL source to understand behavior, but must not copy its code.
  - End commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Codex's own trailer is fine
    if the owner prefers it.

## Decisions (made; don't reopen them in this slice)

1. **A brick has one card, with three tabs: Sliders, See inside, Look.**
   - Sliders is what opens first.
   - "Knob" becomes **slider** everywhere students read it, including the variable dialog's "Show as a slider" and the
     toolbar's "N sliders". Code identifiers may keep `knob` and `showInBuild`.
2. **All copies / Just this one** is a two-way switch at the top of the card, for bricks that have per-copy sliders.
   - **All copies:** changing a slider changes the brick's starting value for every copy that hasn't been set on its
     own.
   - **Just this one:** changing a slider sets that copy's own value (today's per-copy knob).
   - A copy with its own value shows a small "own value" mark next to the slider, plus a "Use the brick's value"
     button.
   - The Hero, the Goal and grid bricks have no switch. Their sliders always apply to every copy, as today.
3. **Code opens beside the world.** See inside docks the code editor in a panel to the right of the stage, and the
   stage stays visible and running.
   - The full-screen Workshop stays only for **+ New brick** and for "Test this brick alone" (the existing TestRoom).
   - Phones (narrower than 768px) get Sliders and Look but no See inside, and the tab says "Code needs a bigger
     screen". Tablets and laptops get everything.
4. **Remix by default.** The first change to the *structure* of a built-in brick's code turns it into **"My
   ⟨name⟩"**.
   - Structural changes are adding, removing, moving or replacing a block.
   - The renamed brick keeps `remixOf: <catalog id>`.
   - **Every copy in this level** becomes the remix. The catalog's original is untouched, and other levels and new
     projects still get it.
   - Changing a number or a dropdown inside a block does not remix. Dragging a slider does not remix either.
   - Both remixed and number-edited bricks get **"Back to the original"** in the card's ⋯ menu. It restores the
     catalog definition after an "Are you sure?".
5. **Running blocks glow.** While the level runs, blocks that execute light up in the open editor, like Scratch's
   glow.
   - Only the brick whose code is open glows.
   - The selected copy's threads glow, or any copy's when none is selected.
   - Glow updates at most 10 times a second.
6. **Long bricks open folded.** A brick whose scripts hold more than about 30 blocks opens with its My Block
   definitions collapsed. The Hero's main script then reads as about four named calls (walk and run, jump, land, wall
   jump), and the view auto-fits. Opening a collapsed definition uses the existing drill-in and breadcrumb
   (`LayerBar.tsx`).
7. **The level is the test room.** Inside See inside, the stage runs the real level. A small bar over the stage holds
   **Play / Pause** and **Restart**, the same controls as Play mode. Editing code applies at the next Restart, or at
   once for slider changes; don't hot-swap running threads in this slice.

## Scope

Each item lists what "done" means. File names are where the work most likely lands; follow the code if it says
otherwise.

### 1. The brick card (`builder/SeeInsideCard.tsx`, `builder/knobs.ts`, `workshop/KnobsCard.tsx`)
- Clicking a placed copy selects it and opens the card, docked on the right in the same panel slot the code will use.
  The panel never covers the stage or the ground row.
- **Header:**
  - the brick's picture, its name, and "N in this level · copy K selected";
  - a "built in" or "remix of X" badge;
  - a ⋯ menu with Back to the original (when it applies), Remove this copy, and "Test this brick alone".
- **Tabs** are Sliders (the default), See inside and Look. Look shows the costumes, read-only, plus an "Edit
  costumes" button that opens the existing costume editor.
- The All copies / Just this one switch follows decision 2.
- Esc closes the card. Clicking empty ground closes it. Picking another brick from the drawer closes it.
- Hero, Goal and grid bricks keep their protections: no Remove on the Hero or the Goal.

### 2. Code beside the world (`StudioApp.tsx`, `CodeEditor.tsx`, `builder/Builder.tsx`)
- See inside replaces the card's body with the code editor, in the same right-hand panel.
  - The panel's width can be dragged between 380px and 60% of the window. The default is 440px, remembered per
    browser.
- The stage stays visible on the left and runs per decision 7. The Hero can be driven with the keyboard while the
  stage has focus.
- **Toolbar:** keep Variable, List, Block, Undo/Redo, Tidy and Center.
  - Keep one zoom pair.
  - Remove the 🔍 icon from zoom: 🔍 means only See inside, everywhere.
- Closing the code ("Done", or the card's ✕) returns to the card's Sliders tab, not to a separate screen.
- Saving is unchanged: code changes autosave as today.

### 3. Remix by default (`StudioApp.tsx` or wherever brick definitions are edited; catalog in `builder/catalog.ts`)
- Detect the first structural change to a built-in brick's workspace, per decision 4. Rename the brick to "My
  ⟨name⟩", set `remixOf`, and keep every copy pointing at it.
- Show a one-line toast: "You changed a block, so this is now My Walker. The original Walker is untouched."
- Before the first remix, the code panel shows a callout: "This is the Walker every level starts with. Change a block
  and it becomes My Walker."
- **Back to the original** restores the catalog's scripts, variables, costumes and name. Copies' own slider values
  stay where they still apply.
- **Save format:** add `remixOf?: string` to the brick definition. Older saves without it load unchanged.

### 4. Running blocks glow (runtime: `src/platformer/lab/core`; editor: `CodeEditor.tsx`)
- Add a read-only hook to the runtime. After each tick it reports, for each target, the ids of the blocks that
  executed. Map compiled IR back to Blockly block ids; `editor/compile.ts` already knows both.
- The hook must not change execution order, the operation budget or determinism. Add a conformance test that runs the
  same project with and without the hook and gets identical world state.
- The editor glows those blocks (Blockly's `highlightBlock` / `glowStack` or an equivalent class), per decision 5.
  Turn the glow off when the level is paused.

### 5. Long bricks open folded (`hero/heroBrick.ts`, `CodeEditor.tsx`)
- When a workspace loads with more than about 30 blocks, collapse its procedure definitions and zoom to fit the
  remaining top-level scripts.
- The Hero's procedures must have clear names. Rename them if needed: "walk and run", "jump (hold to go higher)",
  "land and squash", "wall jump".
- The Hero's card opens on Sliders. Its "More tuning (33)" group stays collapsed, with a plain heading: "More sliders
  for the Hero".

### 6. Fixes from the Code Lab review (`docs/qa/code-lab-core/explore/*`)
Do these with this slice, because they sit in the same loop:
- The page no longer opens with the Hero as the selected brush, so a first click on the stage never moves the Hero.
  The first brush is Ground.
- Clicks outside the level bounds do nothing.
- Play opens on "Follow" (the camera on the Hero), not "Whole level". Rename the toggle to "Follow the Hero / Whole
  level".
- **+ New brick:**
  - the new brick appears under My bricks;
  - it becomes the selected brush;
  - choosing a template named like an existing brick asks for a name instead of silently making "Coin 2".
- The Empty template starts with a `when ⚑ clicked` hat, never a blank black canvas. Add the hint: "Drag blocks under
  this hat."
- The ? block's hidden once-only guard becomes visible: a "times left" variable with a slider, starting at 1. Two
  `give a coin` blocks then visibly need "times left" of 2.
- Drawer thumbnails show the brick's art at least 48px.
- Remove the "960 x 380" and "(0, 0)" labels from the stage.
- Remove the ⚑ button from Play mode. Play is the flag.
- Make focus rings visible on every control in the card and the code toolbar.
- Word banks: remove violent words (Sword, ammo and similar) from the naming lists.

## Not in this slice
- Rooms, multiplayer and syncing brick code: that's Slice 2.
- Moving Code Lab into the live 2D builder at `/2d/build`: Slice 3.
- Race bricks, 3D bricks, the blank canvas, one per player, and the brick library.
- Hot-swapping code while it runs.
- New blocks, except the runtime hook in item 4.
- Visual redesign beyond what these items need. Keep the current studio styles and tokens.

## How to check it

**Tests:**
- Unit tests for each decision:
  - the switch semantics;
  - remix detection (structural vs value changes);
  - Back to the original;
  - the glow hook's determinism test;
  - folding;
  - card closing.
- Keep every existing Code Lab test green: conformance, feel, integration and the studio tests.

**The student walk-through.** Run it in a real browser and record it in
`docs/qa/code-lab-slice-1/WALKTHROUGH.md`, with a screenshot for each step:
1. Open the studio. Click the ground: nothing moves. Press Play; the camera follows the Hero.
2. Back in Build, click a Walker. The card opens on Sliders. Drag Speed: every Walker changes. Switch to Just this
   one and drag again: only that Walker changes, and it shows "own value".
3. See inside: the code docks beside the level, which keeps running. The Walker's move block glows as it walks.
4. Change a number in a block: no rename. Drag in a new block: it becomes My Walker, with the toast. Restart: the
   change shows.
5. ⋯ → Back to the original: it's the Walker again, after the confirm.
6. Click the Hero: Sliders first. See inside shows about four named calls; open "jump" through the drill-in and come
   back through the breadcrumb.
7. + New brick → Empty: it shows a hat and the hint, and it's the brush and under My bricks.
8. At phone width: the card shows Sliders and Look, and See inside says it needs a bigger screen.

**Performance:** with the code panel open and glowing, the stage holds 60 fps drawing (30 ticks) on a mid-range
Chromebook profile. Use Chrome's CPU 4× slowdown as a stand-in, and record the numbers.

## Hand-off

- Commit in small steps on `claude/code-lab-slice-1` with clear messages. Ask before pushing.
- Finish with a short `docs/qa/code-lab-slice-1/README.md`:
  - what changed;
  - the walk-through;
  - known gaps;
  - the open questions you hit.
- If a decision above turns out to be impossible or clearly wrong once built, don't quietly change it. Write it down
  in the README with what you did instead, and why.

## Later (for orientation only)
- **Slice 2: shared code in rooms.**
  - Brick code becomes part of the level, so edits sync.
  - A brick's code is locked while someone has it open.
  - Prove the runtime is identical on two computers in one room.
  - Then add one per player and the Players blocks, from the mock's Blank canvas tab.
- **Slice 3:** Code Lab becomes `/2d/build`, so every platformer is a Code Lab level.
- **Then:**
  - race bricks as open bricks, with the car's driving last, behind feel tests;
  - 3D code bricks;
  - the blank canvas;
  - the backpack and the class library.
