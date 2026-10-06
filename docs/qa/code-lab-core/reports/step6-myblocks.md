# Step 6, myblocks lane: layered code in the editor

## Label JSON shape (for the starter lane)

A script's one-line label is the `data` string on its **hat block** in the Blockly workspace JSON, with the prefix `label:`:

```json
{ "type": "event_whenflagclicked", "id": "walker_1", "x": 20, "y": 20,
  "data": "label:Walk back and forth",
  "next": { "block": { "...": "..." } } }
```

- Only top-level hats take a label (`isHatOpcode`, including `platformer_whenbump`). `procedures_definition` blocks don't; a My Block is named by its proccode.
- Blockly saves and loads `data` itself, and `compileWorkspace` ignores it (`WorkspaceBlockJson.data` was added to the type; nothing else in the compiler changed).
- Helpers: `labelData(text)` and `readLabel(data)` in `studio/code/layers.ts`.
- Tests: `affordances.test.ts` "labels survive a Blockly save/load round trip", "editing a label saves the new text...", "the compiler ignores labels".

## What was built

- **Layered view** (`studio/code/layers.ts` state machine, `affordances.ts` Blockly side, `LayerBar.tsx`, wired in `studio/CodeEditor.tsx`).
  - Top view: only scripts are shown. My Block definitions are hidden by `display:none` on their SVG, so nothing is moved or saved. A "My Blocks" shelf of chips (one per definition) sits above the workspace.
  - 🔍 on every `procedures_call` (a clickable field added by `attachAffordances`, never saved) drills into that definition: it is centred (or top-aligned when taller than the view), other stacks are hidden, the bar shows `Hero's scripts › walk` and **← Back**. Breadcrumb parts are clickable. Edits inside save through the normal debounced `store.setWorkspace`.
  - Make a Block now opens the new definition. A diagnostic click on a block inside a hidden definition shows that layer first. Deleting the open definition drops the view back out.
- **Labels**: drawn as text above each top hat (`renderLabels`), not editable by kids yet (see gaps).
- **Plain Scratch cards** (`studio/code/plainScratch.ts`, `PlainScratchCard.tsx`): 🔍 on every `platformer_*` block opens "How *turn gravity on* works in plain Scratch": explanation plus read-only plain-Scratch blocks (small Blockly workspace, shrunk to fit). Cards: setgravity, setsolid, setspeed, changespeed, speed, onground, whenbump, and touchingtile (the tiles lane's block; its card is ready, and the magnifier attaches to any `platformer_*` block registered before `attachAffordances()`).
- **Palette**: My Blocks is the first category (`core/editor/toolbox.ts`). Platformer is last.
- `studio/code/context.ts`: `withCardContext` lets the card's own variable, brick and message names load into dropdowns without leaking into the real editor.

## Tests (all run: `npx vitest run src/platformer/lab` 67 files, 752 passed, 25 expected-fail; `npx tsc --noEmit -p tsconfig.app.json` clean)

- `studio/code/layers.test.ts`: drill-in and back state machine, nested drills, self-call loop, breadcrumb jumps, deleted definition, breadcrumb text, label helpers.
- `studio/code/plainScratch.test.ts`: a card exists for every `platformer_*` opcode defined in the editor plus `platformer_touchingtile`; no Platformer block inside a card; every card JSON compiles with zero diagnostics (errors or warnings); every card loads into Blockly without dropping a block and keeps its menu values.
- `studio/code/affordances.test.ts`: labels round trip, magnifier on calls and Platformer blocks and never saved, magnifier click calls the drill/explain handlers, top view hides definitions and drilled view shows only that one.
- `core/editor/toolbox.test.ts`, `platformer.test.ts`: updated for My Blocks first.

## Browser check (port 5313, scratch harness `studio/code/harness.html` + `harness.tsx`, which mounts `CodeEditor` on the starter Hero with labels added; open `/src/platformer/lab/studio/code/harness.html`)

Clicked through, in a 1366 x 768 emulated viewport:
- Top view shows scripts with labels ("Run the Hero every tick", "Feel a wall") and a shelf of 7 My Block chips; definitions not on the canvas.
- Click 🔍 on `walk` in the forever loop: breadcrumb `Hero's scripts › walk`, ← Back, definition shown (top-aligned, tall). Chip "hit a wall": short definition, centred.
- Edited a number inside `hit a wall`: the store's saved workspace contained the edit, still had all 7 definitions and the labels.
- ← Back returned to the top view (shelf and labels back).
- 🔍 on `on ground?` and `turn gravity`: card opened with the right title, explanation and read-only blocks; Close works.

Not browser-checked: Make a Block auto-drill, diagnostic click into a hidden definition, deleting an open definition (all covered only by reasoning; the pure state machine part is unit tested), cards for `solid`, `speed`, `when I bump`, `touching tile` (loaded headlessly in tests, not seen on screen), and keyboard-only use.

## Known gaps and requests

- Kids can't edit a label in the UI (labels are authored in JSON). A word-list picker could set `block.data` via `setLabel`.
- Hidden definitions still count in the workspace's scroll area and in "Tidy up" / "delete N blocks".
- `StudioApp.tsx` is not touched. The Workshop lane hosts `CodeEditor`; it needs the editor to have about 720 x 500 px for the card.
- The tiles lane's `platformer_touchingtile` definition only gets its 🔍 if it is registered (Blockly.Blocks) before `attachAffordances()` runs (it runs right after `registerEditorBlocks` in `CodeEditor`).
- Magnifier fields are not in the flyout palette or the read-only cards, by design.
