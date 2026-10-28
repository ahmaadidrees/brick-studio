# Step 6 report: workshop lane

Branch `claude/s6-workshop`. Files: `src/platformer/lab/studio/workshop/**` only.

## Built
- `Workshop.tsx`: header (✓ Done -> `closeWorkshop`, brick icon, name, "N in My world", "Changes apply to every copy"), Code / Costumes / Sounds tabs (`setEditorTab`) hosting `CodeEditor`, `CostumeEditor`, `SoundPanel`; right column holds the Test room and Knobs card. `workshop.css` for layout (grid `1fr 380px`).
- `roomDesign.ts`: `buildTestRoom(brick, stage, {knobs?, hero?})`, a pure 320 x 160 LevelDesign with a tile floor and tile wall columns plus the core's level walls; a helper Hero for non-Hero bricks (project's Hero if given, else built-in); stage keeps variables/lists only.
- `TestRoom.tsx`: runs the room with `createRuntime`/`greenFlag`, `FixedStepAccumulator`, `fitCamera`, `renderPlayMode`, `browserKeyToScratchKey` (all imported, none edited). Restarts 350 ms after the brick, helper Hero or stage object changes (code or knob edits), and on the Restart button. Click the room to focus it, then keys go to the runtime.
- `KnobsCard.tsx` + `knobs.ts`: each `showInBuild` numeric variable is a slider labelled with its variable name; change calls `setVariableKnob(brick, id, true, value)`, which restarts the room via the brick change. Range rule: 0 to 2x the value (mirrored if negative, 0..10 for 0); step 1 for whole numbers, 0.05 for decimals >= 1, a tenth of the leading digit for smaller decimals.
- `devOpen.ts`: dev-only, imported nowhere. Console: `(await import('/src/platformer/lab/studio/workshop/devOpen.ts')).openDevWorkshop('brick_hero')`.

## Tests (all green)
- `roomDesign.test.ts` (16 tests): valid design (`validateDesign` empty); contains the brick once; helper Hero rules (added for non-Hero, none for Hero, project Hero used); tile floor/walls; knob values applied to the copy without touching defaults; stage scripts dropped; brick stays in the room for 90 ticks; Hero moves right with right arrow held for 30 ticks (headless keyboard); knob range rule cases and formatting.
- `npx vitest run src/platformer/lab`: 65 files, 746 passed, 25 expected fail (pre-existing). `npx tsc --noEmit -p tsconfig.app.json`: clean.

## Browser check (port 5312, 1366 x 768 emulated, via devOpen.ts)
Verified:
- Hero Workshop renders: header, Code tab with the Blockly editor, Test room with the Hero sprite drawn, Knobs card listing 32 Hero knobs with names and values (screenshot).
- Moving the "walk top speed" slider to 5 set the Hero's variable to 5 in the store and the label read 5.
- Switching to the Walker via `openWorkshop('brick_walker')`: header "Walker / 2 in My world", helper-Hero hint, Knobs "speed 3"; `scrollWidth` 1366 = viewport, so no horizontal scroll.

Could NOT verify live: the preview pane's page reports `document.hidden = true`, so `requestAnimationFrame` is throttled and the accumulator pauses; I could not watch the room animate, press keys against the live loop, or see the debounced restart fire. Screenshots after the first one were stale for the same reason. Keyboard play and stepping are covered only by the headless test above. The tab buttons (Costumes/Sounds) were switched through the store, not clicked.

## Requests / known gaps
- Tiles are not drawn: `renderPlayMode` has no tile pass yet, so the room's floor is invisible until the builder lane adds tile rendering to the renderer (bodies still stop at the level edges). Check the tile floor and the 16-step floor height after merge. Until the tiles lane merges, `world.tiles` is ignored by physics; the level bottom (y = 0) stops bodies, so with tiles live they will rest at y = 16.
- Hero has 32 knobs, so its Knobs card scrolls; no grouping (could group in a later pass).
- Sound notes from the room are discarded (the room is silent).
- No store/shell change needed.
