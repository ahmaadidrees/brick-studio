# S8 student blockers (branch claude/s8-blockers, from d466fce)

Tests: `npx vitest run src/platformer` = 100 files, 1255 passed, 25 expected-fail (unchanged). `npx tsc --noEmit -p tsconfig.app.json` clean.
Browser check: 1366x768, own tab, dev server on 5341 (stopped afterwards), console clean.

## 1. Walker See inside, Done corrupted the save (root cause)
- Root cause: `argument_reporter_string_number` and `argument_reporter_boolean` (core/editor/definitions.ts) stored the parameter's name in a plain `field_label`. Blockly never serialises label fields, so every save from the editor dropped `fields.VALUE`. The compiler then produced `{kind:'param', name:''}` and `validateDesign` rejected the project ("unsafe-name" at `bricks[1].program.procedures[0].body[3].inputs.SPEED.inputs.NUM2.name`). Any kid-made custom block with an input hit the same bug.
- Fix: both reporters use `field_label_serializable`. Defence in depth: the compiler turns a nameless parameter reporter into an empty literal plus a warning (`block.nameless_input`, kid text in DiagnosticsList) so an old damaged workspace can never make the project invalid. Saving now also refuses invalid text (see 3).
- Tests (studio/workspaceRoundTrip.test.ts, 22 tests): every starter brick plus the Stage and every New-brick template goes through Blockly `workspaces.load` then `save` (headless Workspace, the same serialisation CodeEditor uses), `store.setWorkspace`, `validateDesign`, `serialize` and `parse`, and the compiled program must be unchanged; "a parameter reporter keeps its name"; "a workspace saved with the old bug is caught by the compiler". Checked red first: the stripped-reporter case fails with the exact path from the explore report.
- Click path: starter, select Walker on the level, See inside, Done, wait 1s, reload: the Hero I had moved next to the Walker was still there, no notice, no backup key; saved workspace holds `"fields":{"VALUE":"speed"}`.

## 2. Empty workspace overwrite
- CodeEditor.tsx: if `Blockly.serialization.workspaces.load` throws, `loadBlockedRef` blocks flushSave, saveWorkspaceNow and the debounced save for that brick, and a visible alert ("We could not open this brick's blocks. They are safe...") shows over the code area.
- Test: studio/code/CodeEditor.loadFailure.test.tsx mounts the real CodeEditor with an unloadable workspace, fires a block-create event, waits past the debounce, unmounts; the saved workspace and compiled program are untouched. Negative control (guard removed) fails. Second test: a normal brick shows no alert.

## 3. Hidden save errors
- New `persist/StorageNoticeBar.tsx`, mounted under the header in Builder and in the Workshop; removed from the closed menu. Problems stay until dismissed or chosen; success/info fade after 6s. Click path: set `code-lab.project.v1` to garbage, reload: yellow banner with two buttons appears at once.
- Unreadable save: `loadProject` keeps the text in `code-lab.project.backup.v1`, starts a fresh world and HOLDS autosave (`isSaveHeld`). Nothing overwrites the bad save until the kid presses "Start with this new world" (releases the hold, saves) or opens a file / starts over (also releases). "Save my old world to a file" downloads the original text. Browser: after reload, main key and backup both still the garbage text 1.5s later; after "Start with this new world" a valid 616,835 char save was written and the backup stayed.
- `saveProject` now `parse`s what it is about to write and refuses invalid text (keeps last good save, notice "earlier save is safe"). Quota and save-error messages reworded for kids.
- Tests (storage.test.ts, 3 new): hold keeps the bad text through autosave, pagehide/unmount flush and keeps the backup; release saves; invalid project is refused. ProjectMenu tests moved to the bar (notice is visible with the menu closed). Existing autosave tests used a nonexistent brick id (`brick_spinner`); changed to `brick_coin` because validation now refuses dangling copies.

## 4. Undo across worlds
- `StudioStore.onLoad` fires after every `load`; `History` clears itself on it. Open File now asks in the menu first ("Open X? The world you are working on will be replaced." Cancel / Open it); Reset already confirmed (text now says what is lost).
- Tests: history.test.ts "opening a file, starting over or any load clears undo and redo"; ProjectMenu.test.tsx "imports a project when file is picked" asserts nothing loads before "Open it".

## 5. Play feedback (reuses /2d/build classes: p2d-hint, p2d-toast, p2d-overlay/p2d-card/p2d-clear)
- Controls hint on every Play start for 7s: arrows, Space, hold X (the Hero reads X, not Shift: heroBrick.ts "read keys").
- Coin counter: pill top-left reading the Stage variable named "coins" (any project; hidden if none).
- Win: dialog "You made it!" with coins, Play again, Keep building, when the Goal broadcasts `course clear` (case-insensitive). Hurt: toast "Ouch! Back to the start. Try again!" on `hero hurt`.
- Engine stays rule-free: one passive `Runtime.onBroadcast(listener)` observer in core/runtime.ts; word list in builder/playRules.ts.
- No Hero: Play does not start; kind toast "Place your Hero first..." (Builder.tsx `requestMode`). No Goal: Play starts and the hint adds "There is no Goal yet...".
- Tests (builder/PlayFeedback.test.tsx, 10): hint and coin counter follow the variable, no counter without coins, hurt toast appears and disappears, win dialog with Play again (fresh runtime) and Keep building, no-Hero, no-Goal, plus tests that Goal/Walker/Spikes really broadcast these words, and real-engine runs where a Hero on the Goal triggers `course clear` and a Walker on the Hero triggers `hero hurt`.
- Browser: Hero next to Goal, Play, hold Right: "You made it!" dialog; Hero next to Spikes: toast text read from the DOM; hint and `x 00` pill screenshots; Hero erased then Play: stays in Build with the message.
- Not tried by hand: collecting a real coin (the pane runs about 3 fps); covered by the variable test.

## 6. Hero and Goal Remove
- Chose: hide Remove for `limit: 1` bricks; the card says "One per level" and "Place it again to move it". Why: simplest, no dialog, and a level cannot be played without them. Walker and other bricks keep Remove. Eraser tool and right-click still remove one deliberately (then Play says "Place your Hero first").
- Tests: Builder.test.tsx "the Hero and the Goal have no Remove on their card ...; the Walker does". Browser: Hero card shows only See inside.

## 7. Scene button
- `onOpenWorldSetup` was already invisible: builder.css `.builder-header .app-header-tools { display: none }` (checked in browser: Scene is 0x0, display none, not focusable). The dead handler is now a named no-op with a comment; AppHeader is shared so I did not change it.
- In /2d/build, Scene opens SceneSheet (src/platformer/ui/SceneSheet.tsx): the level's look (Cartoon or Pixel) and scene (Day or Underground). Code Lab has neither.

## Not done / notes
- No automated test for Done in a real browser (Playwright is not in the repo); covered by the round-trip test plus the manual path above.
- The notice bar can cover the Undo/Redo cluster while shown. Out of scope: other explore findings (Hero armed on load, out-of-bounds placement, camera default, copy wording).
- A damaged workspace saved earlier by the old bug cannot be repaired (the name is gone); it now compiles with a warning instead of invalidating the project.
