# Code Lab — wave 2 lanes

Wave 1 built the headless block runtime in `src/platformer/lab/core/` (225 tests; `core/index.ts` exposes `play(design)`). Wave 2 puts a kid-facing page on top of it: **build step 2 of [the spec](../../CODE-LAB-BRICK-MODEL.md), "+ New brick" end to end.** A kid can make a blank brick, draw its costumes, add sounds, write blocks, paint copies into the level, and press Play.

The page is the preview route **`/2d/lab/next`** (`src/platformer/lab/studio/StudioApp.tsx`). The old `/2d/lab` stays untouched.

Integration branch: `claude/code-lab-core`. Each lane works on its own branch and worktree, forked from the wave 2 shell commit.

## Read first (every lane)

1. [`docs/CODE-LAB-BRICK-MODEL.md`](../../CODE-LAB-BRICK-MODEL.md): the product model and the six decisions.
2. `src/platformer/lab/studio/store.ts`: **the shared studio state and every action that changes it.** UI changes state only through `StudioStore` methods. Read state with `useStudio(store, selector)`; selectors must return stable values (primitives or existing objects, never a fresh object or array per call).
3. `src/platformer/lab/studio/StudioApp.tsx` and `studio.css`: the page shell (code on the left; stage, Build/Play and the brick list on the right).
4. `src/platformer/lab/studio/pixels.ts`: **the costume format** (see below).
5. `src/platformer/lab/core/contracts.ts` and `core/index.ts`: the runtime surface.
6. The wave 1 reports in `docs/qa/code-lab-core/reports/`, for the lanes you touch.

## The costume format (every lane relies on it)

- `Costume.asset` is a PNG data URL of exactly `width × height` pixels. One costume pixel is one step at size 100.
- `Costume.mask` marks pixels with alpha > 0, and `opaque` is their bounding box. Pixel touching uses the mask.
- `rotationCenterX/Y` are in costume pixels from the top-left. They default to the image middle.
- Build costumes with `costumeFromImage` / `imageFromRows` from `pixels.ts`; never hand-roll one.
- The world is **y-up with (0, 0) at the level's bottom-left**. The level is `design.bounds` (960 × 360 steps by default). Screens are y-down, so convert in exactly one place (the stage lane's camera).

## Rules (every lane)

- **Own only your files.** Each lane lists its files below. Never edit `store.ts`, `StudioApp.tsx`, `studio.css`, `pixels.ts`, `package.json` or `package-lock.json`. If you need a store or shell change, don't make it: write the request in your report and work around it inside your own files.
- **No new dependencies.** Blockly 13.3.0, `@blockly/continuous-toolbox` and `@blockly/block-shareable-procedures` are installed. React, lucide-react and the repo's existing UI kit (`src/ui`) are available.
- **Kid text.** Outside class worlds, kids pick from word lists; they don't type free text (spec, "Kid text"). Names for bricks, variables, lists, messages, custom blocks and sounds come from picked word lists. Put the lists in your lane's files; a `words.ts` per lane is fine.
- **Kid-first UI.** Big targets (≥ 40 px), plain words, nothing that needs reading a manual. Follow the look of the existing app (dark panels, rounded corners). Every control has an accessible name. The layout works at 1366 × 768 (school Chromebook) without horizontal scroll.
- **Determinism.** Gameplay state lives only in the core `World`. The UI may keep view state (camera, hover, selection), never game state.
- **Clean room.** Don't copy Scratch or scratch-gui code. Blockly is Apache-2.0 and fine to use.
- **Tests.** Vitest, colocated `*.test.ts(x)`. Test logic headlessly (pure functions, the store, compile/save round-trips). Use React Testing Library only where the repo already does.
- **Check it in the browser.** Run `npm run dev -- --port <your port> --strictPort` and open `http://localhost:<port>/2d/lab/next`. Use your lane's port: code-editor 5281, stage 5282, assets 5283, persistence 5284, conformance 5285. Click through your feature before calling it done.
- **Done means:** `npx vitest run src/platformer/lab` passes and `npx tsc --noEmit -p tsconfig.app.json` is clean.
- **Commit** on your lane branch as you go. End messages with `Co-Authored-By: Gemini <noreply@google.com>`. **Don't push, merge, rebase or switch branches. Don't touch other worktrees.**
- **Report.** Write `docs/qa/code-lab-core/reports/wave2-<lane>.md`: what you built, how to try it (clicks), tests, store or shell change requests, known gaps. Commit it.

## Lanes

### code-editor: the Code tab
Files: `studio/CodeEditor.tsx`, everything under `studio/code/`, and `core/editor/**` (block definitions, toolbox and compiler; you may fix or extend them).
- Mount a Blockly 13.3 workspace for `selectedBrickId`. Use the Zelos renderer, the continuous-category toolbox (`@blockly/continuous-toolbox`) and custom blocks via `@blockly/block-shareable-procedures`. Use `core/editor` definitions and toolbox with an `EditorContext` built from the store:
  - this brick's variables and lists, plus the stage's (globals);
  - broadcast messages found in every brick's workspace;
  - brick names, this brick's costumes and sounds, stage backdrops.
- Load `project.workspaces[brickId]` when the selection changes. Save with `store.setWorkspace` on change, debounced about 300 ms, skipping UI-only events. Dispose the workspace cleanly. There's one workspace at a time, never one per copy.
- Show compile diagnostics from `state.diagnostics[brickId]` in kid words. Clicking one selects the block.
- **Make a Variable / Make a List**: name from a picked word list; scope "for this brick only" / "for all bricks" (stage). For brick-only variables, a "show in Build" toggle calls `store.setVariableKnob`.
- **Make a Block**: a dialog in Scratch's spirit. Label words, number/text and boolean inputs, all from picked word lists, plus a "run without screen refresh" checkbox.
- While playing, glow the blocks of running threads if you can get that from the runtime cheaply (read only; don't change core scheduling).
- Stage selected: show the stage's workspace (stage blocks only: no motion).

### stage: Build and Play
Files: `studio/Stage.tsx`, everything under `studio/stage/`.
- **Renderer** (Canvas2D): draw the level from `project.design` in Build and from `runtime.world` in Play.
  - y-up world to screen, one camera, scrolling across the 960-step level, with the view about 480 steps wide (spec "Units").
  - Costumes from `Costume.asset` (cache decoded images per asset string), rotation style, size, ghost and brightness at least. Draw order is `world.targets`.
  - Say/think bubbles; level bounds shown in Build.
- **Play loop**:
  - `store.play()` creates the runtime. Step it at exactly 30 ticks/s with a fixed-step accumulator; draw at display rate, interpolating positions between ticks (decision 3).
  - Pause when the tab is hidden; don't catch up in a burst.
  - Keyboard maps to Scratch key names (`runtime.pressKey/releaseKey`). The mouse sets `world.mouse`. A click picks the topmost visible target under the pointer, then calls `runtime.clickTarget`; the stage gets clicked when no sprite is hit.
  - Sound notes play the sound asset; ask prompts use picked answers (`sensing.ts` `activeQuestion`/`submitAnswer`).
  - Play/Stop buttons and a green flag.
- **Build tools**:
  - Brush paints a copy of `brushBrickId` where you click, with optional 8-step grid snap.
  - Select-and-drag moves copies; Delete removes; an arrow-key nudge.
  - A knob panel edits the selected copy's `showInBuild` variables (`store.setKnob`).
  - The camera scrolls with a drag or the scroll wheel.
- Tests: camera math (world ⇄ screen round trip, y flip), the fixed-step accumulator (30 ticks in 1 s of uneven frames, no burst after a pause), hit-picking order.

### assets: bricks, costumes, sounds
Files: `studio/BrickList.tsx`, `studio/CostumeEditor.tsx`, `studio/SoundPanel.tsx`, everything under `studio/assets/`.
- **BrickList**:
  - A grid of bricks with costume thumbnails and a Stage tile. Click selects a brick for editing (`selectBrick`) and arms the Build brush (`setBrush`).
  - "**+ New brick**": the name comes from a picked word list; the brick starts with a blank costume of a sensible size (e.g. 32 × 32) and opens the Costumes tab.
  - Rename (picked words) and delete (with confirm).
- **CostumeEditor**:
  - Costume list: add, duplicate, delete (keep at least one), reorder.
  - Pixel editor: pencil, eraser, fill, line or rectangle, color palette plus custom color, zoomed grid, undo/redo, image size (8–128 px per side), and drag to set the rotation center.
  - Saves through `costumeFromImage` and `store.setCostumes`. Costume names come from picked words.
  - Stage selected: backdrops sized to the level view.
- **SoundPanel**:
  - A built-in sound library generated in code (WAV data URLs synthesized in TS: jump, coin, pop, boing, laser, hit, win, …), with `durationMs` set exactly.
  - Add, remove, preview. Names come from the library.
- Tests: costume edits keep mask/opaque in sync, undo/redo, the WAV generator (header and duration), brick add/rename/delete through the store.

### persistence: save, load, starter level
Files: `studio/storage.ts`, everything under `studio/persist/`, and `studio/starter.ts`.
- `loadProject()`: the saved project from `localStorage`, falling back to the starter project. `watchAndSave(store)`: debounced save on `revision` change, and a save on `pagehide`.
  - Use `core/save.ts` (`serialize`/`parse`, envelope with per-brick workspaces). If the existing envelope doesn't carry workspaces, extend `save.ts` *only via a request in your report* and store them alongside it inside your own format version.
  - Handle a corrupt save (keep a copy and start fresh, telling the kid), quota errors and a newer schema version.
- `starter.ts`: a small level that shows off step 2.
  - Three or four bricks with pixel-art costumes (`imageFromRows`) and open-block programs as real Blockly workspace JSON, so they open in the editor. For example a spinner (`forever turn 15`), a bouncer (`move` + `if on edge, bounce`), and a blinker that switches costumes and says something when clicked. One brick has a `showInBuild` knob (e.g. speed), painted twice with different knob values.
  - No Hero and no physics: that's step 3.
- Export/import of a project file (`.json`, through `serialize`/`parse`) as functions plus tiny buttons in a component you own (`studio/persist/ProjectMenu.tsx`). The integrator mounts it.
- Tests: save/load round trip including workspaces, corrupt-save recovery, the starter project validates (`validateDesign` returns no problems) and every starter workspace compiles with no errors.

### conformance: Scratch fixture suite and core fixes
Files: everything under `src/platformer/lab/core/` **except** `core/editor/**` and `core/index.ts`. You're the only lane allowed to edit `contracts.ts`.
- Build `core/conformance/`: run the §01 fixtures (`research/code-lab/01-scratch-runtime-semantics.md`) **end to end through the real runtime** (`createRuntime` + `ALL_PRIMITIVES`), not through the fake testkit. One test per fixture ID, table-driven where possible.
  - Generate `docs/qa/code-lab-core/CONFORMANCE.md` with each fixture ID marked pass / known difference (with the reason) / not applicable.
- Fix the core bugs the suite finds, in the lane files where they belong.
- Follow-ups from wave 1:
  - Move the ask queue and host clock out of module-level WeakMaps into `World` (contract change), so snapshots capture them.
  - Remove `project.ts`'s duplicate `wrapDirection` (use `motion.ts`'s).
  - Add a test that a whole run's world state can be snapshotted with `structuredClone` and resumed to the same result.
- **Don't change public signatures** the studio uses: `play`, `createRuntime`, `Runtime` methods (`step`, `greenFlag`, `stopAll`, `pressKey`, `releaseKey`, `clickTarget`), `compileWorkspace`, `save.ts` `serialize`/`parse`, `sensing.ts` `activeQuestion`/`submitAnswer`, `touching.ts` exports, `geometry.ts`.
