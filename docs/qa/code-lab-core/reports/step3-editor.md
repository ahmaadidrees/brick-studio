# Code Lab step 3: editor lane report (Platformer category)

Branch `claude/s3-editor`. Files touched: `core/editor/definitions.ts`, `core/editor/toolbox.ts`, `core/editor/platformer.test.ts` (new), `core/editor/toolbox.test.ts`, `studio/code/code.css`, `studio/code/editor.test.ts`. `studio/CodeEditor.tsx` was NOT changed: the category shows through the existing toolbox and `registerEditorBlocks(ctx)` wiring.

## What was built
- Seven block definitions worded exactly as the STEP3 table, category `platformer`, color `#2BB3A3` (shared with no Scratch category).
- `platformer_whenbump` added to `HAT_OPCODES`, so the existing compiler turns it into a script hat with `fields.SIDE` / `fields.BRICK`. No compiler change was needed; fields and inputs are generic.
- Menus: SIDE = any side (`_any_`), top, bottom, left, right. BRICK = anything (`_any_`), edge (`_edge_`), then every name from `EditorContext.getBricks`.
- Toolbox category **Platformer**, last (right after My Blocks), with the `code-extension-category` class (separator style in `code.css`) and a "Platformer extension" label as header. Speed shadows default to 5 (set) and 1 (change).
- Decision: the Stage toolbox omits Platformer (like Motion); the Stage has no body. Brick toolbox now has 10 categories, Stage 8.

## Tests (all in `core/editor/platformer.test.ts` unless noted)
- Wording and set: "has exactly the seven Platformer blocks, worded as the STEP3 table"
- No text collision with Scratch: "no Platformer block text equals any Scratch block text"
- Own color: "the Platformer color is not shared with a Scratch category"
- Registered, kinds, hat: "registers in Blockly with a bump hat and kinds as the table says"
- Menus: "SIDE menu: ...", "BRICK menu: anything, edge, then every brick name from the context"
- IR: "turn gravity [on] and solid [off] keep their fields", "set / change speed carry AXIS and a SPEED input", "[x] speed and on ground? compile as reporter and boolean inside an if", "when I bump [top] of [Spikes] is a script hat with SIDE and BRICK", "bump hat defaults round-trip (_any_ / _edge_)"
- Toolbox: "appears after My Blocks, last, with an extension header and all seven blocks", "the Stage toolbox has no Platformer category"; updated "contains the 9 Scratch categories in order, then Platformer" (`toolbox.test.ts`) and "omits Motion and Platformer categories when isStage is true" (`studio/code/editor.test.ts`).

Result: `npx vitest run src/platformer/lab` 60 files / 595 tests pass; `npx tsc --noEmit -p tsconfig.app.json` clean.

## Browser check
Driven with the Browser pane on port 5302 (`/2d/lab/next`): toolbox lists Motion ... My Blocks, Platformer; clicking Platformer shows the extension header and all seven blocks in teal; the BRICK dropdown showed anything, edge, Spinner, Bouncer, Blinker. Not checked: dragging the blocks into a script, and playing (the physics lane is not merged here). Server stopped.

## Known gaps
- Blocks do nothing at runtime until the physics lane's primitives merge.
- A hat whose BRICK names a deleted brick keeps the old value (same as other brick menus).
