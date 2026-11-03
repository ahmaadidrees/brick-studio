# Hackable UX fix pass, 2026-10-31: Code lane

Branch `claude/hackable-ux-code`, from `origin/main` e4d4930. Covers the Code tab: the block editor, its palette, the
powers panels and variables. Checked in headless Chrome against Vite on port 5193, in guest mode.

| # | Item | Status |
|---|------|--------|
| 1 | [1·2] Swiping up the palette on touch drops a block | Fixed |
| 2 | [3·3] A variable pulled out of a slot leaves a dead slot; the Hero stops jumping | Fixed |
| 3 | [3·2, 2·7] "+ Power" and "Make a power" open under the block categories | Fixed (one rule in `screen.css`) |
| 4 | [3·1] Clicking the Code preview goes back to Build; keys can't be tested | **Not committed**: the fix belongs in `Stage.tsx` (touch lane). A tested patch is below. |
| 5 | [3·4, 3·5, 3·16] Variables: show at once, rename, delete, typed names, no duplicates | Fixed |

## 1. Palette swipe on touch
- **Cause:** Blockly 13 starts a block drag for any drag that begins on a palette block. Its old "toward the workspace"
  angle check is gone.
- **Change:** `studio/code/touchFlyout.ts` patches `Blockly.Gesture` once per page. With a finger or pen, a palette drag
  takes a block out only when it is mostly sideways, or after a 400 ms long press. Otherwise it scrolls the palette. The
  mouse is unchanged.
- **Verified:**
  - iPad portrait (768×1024) and Duo spanned (1114×720), touch emulation via CDP. A vertical or slanted swipe on Motion or
    Looks now scrolls the palette (by 123–200), adds no blocks and causes no remix. Before the fix, every swipe added a block.
  - A sideways drag still takes a block out, and so does a long press followed by a drag up.
- **Tests:** `touchFlyout.test.ts`.

## 2. Slots keep a number
- **Change:** `studio/code/slotShadows.ts`.
  - When a reporter leaves a number or text slot that has nothing underneath, the slot gets the palette's shadow, in the
    same undo step. If the reporter was a variable holding a number, the slot starts at that number. For example, pulling
    `jump walking` out of `set jump now` leaves 8.625, so the Hero jumps the same until the kid types a new number.
  - Projects already saved with an empty slot get the shadow when the code opens. This is not recorded, so opening does
    not save or remix. On a fresh project no brick gets an extra shadow (checked for every brick).
  - Yes/no slots stay empty, as in Scratch.
  - A reporter that is *deleted* (rather than dragged out) leaves the palette default (0).
- **Runtime:** unchanged. An empty slot still reads as an empty value (Scratch semantics). Since slots now always hold a
  shadow, this case shouldn't come up any more.
- **Verified:** drag-out in Chrome gave a `math_number` shadow of 8.625, and the compiled program reads `lit 8.625`.
  Undo and redo work, the slot takes typing, and it survives a reload.
- **Tests:** `slotShadows.test.ts`.

## 3. Powers panels on top
- **Change:** `.cl-powers { z-index: 80 }`, a new line in `studio/screen/screen.css` after `.cl-power-panel`. It is the
  only change to a layout-lane file.
- **Verified:** at 1366×768, `elementFromPoint` reaches every power, the Sign in link, Open a power file, Make a power,
  the checkboxes, the fields and both buttons.

## 4. Code preview click
- **Not committed:** the brief kept `studio/Stage.tsx` for the touch lane.
- **Cause:** `handlePointerDown` treats a click on the running preview as a Build click (`mode === 'build'` is also true
  in Code), so it runs `closeCard()` or `selectCopy()` and leaves Code.
- **Fix, tested here then reverted:**
  ```diff
       if (sceneActive && runtime) {
  -      if (mode === 'build') {
  +      // Code's preview: a click goes to the game and the level keeps the keys; it never leaves Code.
  +      if (mode === 'build' && !codeView) {
  ```
- **Result with the patch:**
  - Clicking the sky keeps `card=code`, keeps the run going and focuses `stage-container`.
  - Space then jumps the Hero (rise 48) in Code.
  - Clicks reach the game (mouse and "when this sprite clicked").
- **Patch file:** `item4-stage-click.patch` in the coordinator scratchpad's `code-lane` folder.
- **Still open:** after pressing Restart, the Restart button keeps focus, so Space presses it again. That button is in
  `CodeStageBar` (`StudioShell.tsx`, layout lane), and fixing it means moving focus to the stage after a restart.

## 5. Variables
- **Change:**
  - `studio/code/context.ts`: variable and list menus are read when they open. The open workspace's own variable map
    comes first, followed by the saved project, so a new variable (local, or shared from the Stage) is in every menu at
    once.
  - `core/editor/context.ts` and `definitions.ts`: when the editor supplies `onVariableMenu`, every variable menu ends
    with "Rename variable" and "Delete the "x" variable", as in Scratch. These entries work on touch, because the
    Hackable editor has no right-click menu. A field validator keeps the block's variable.
  - `studio/code/VariableDialogs.tsx`: the app's own Rename dialog (no `window.prompt`) and ask/tell dialogs.
  - Rename:
    - Renames in the open workspace, or in the Stage's saved code when the variable is shared.
    - Redraws every menu.
    - `compile.ts` now takes the name from the workspace, so the program and Build slider labels follow. Value and
      slider settings are kept.
  - Delete:
    - Asks when blocks use the variable, then removes those blocks and the variable in one undo step.
    - A shared variable can only be deleted from the Stage, and only once no brick uses it. Otherwise a dialog says
      which bricks still use it.
  - Make a Variable / Make a List:
    - The name is typed, and the word grid fills it in.
    - A name already in scope is refused with "There's already a variable called "coins". Try another name." The check
      ignores case, and a shared name is also checked against every brick's own names.
    - Names are capped at 24 letters.
- **Verified in Chrome:**
  - A new "lives" appears at once in the palette and workspace menus.
  - A duplicate "coins" is refused, with Create disabled.
  - Renaming via the real dropdown click updates the Stage's and the ? block's menus, the program and a reload.
  - Deleting an unused variable needs no confirm, and Delete on a shared variable from a brick is refused.
  - On the Walker, deleting "way" asks (6 uses), then removes it, and Undo code brings everything back.
- **Tests:** `CodeEditor.variables.test.tsx` and `variables.test.ts`.

## Checks
- `npx tsc -b`: clean.
- `npx vitest run src/platformer/lab/core/editor src/platformer/lab/studio`: 68 files and 792 tests pass. One run had a
  5-second timeout in `persist/fileRoundTrip.test.ts` (the 3.5 MB case) while other lanes loaded the machine. It
  passes on its own and in the earlier full run, and this lane didn't touch it.
- Saved projects: a guest project with a renamed variable and a refilled slot reloads and runs in Play.

## Not verified
- Real iPad or Duo hardware: touch was checked with CDP emulation only.
- The palette-scroll patch relies on Blockly 13's internal Gesture method names (`updateIsDragging`, `doStart`). If they
  are missing it does nothing; check it again after a Blockly upgrade.
