# Code Lab copy and simplify audit (code reading, read-only)

Scope: `src/platformer/lab/studio/**` plus the core/editor strings it shows. Paths below are relative to `src/platformer/lab/studio/` unless they start with `src/`. Severity: **B** = blocker for students, **S** = should fix, **P** = polish.

## Top findings

| # | Sev | Finding |
|---|-----|---------|
| 1 | B | Save-failed, storage-full and corrupt-save messages are invisible: they only render inside the "This world" menu, which is closed. |
| 2 | B | Undo history survives Open File / Reset, so Ctrl+Z after loading applies the old world's edits to the new world. |
| 3 | B | The header **Scene** button does nothing (`onOpenWorldSetup={() => {}}`, `Builder.tsx:78`); `onOpenHelp` is also a no-op but unused because the custom world menu replaces the header's menu. |
| 4 | B | Play with no Hero or no Goal gives no message at all, and the Hero and Goal can be removed with one click. |
| 5 | S | Hero's "More tuning (33)" shows physics jargon (p speed, ticks, shed, push) to kids. |
| 6 | S | One concept, many names: copy, clone, cell, block, "this brick"; level, world, project, playground, Stage. |
| 7 | S | Open File replaces the whole world with no confirmation, and import errors are raw validator text. |
| 8 | S | Typed free text is possible in Ask (`Pick or type answer...`) against the "picked words only" rule. |

---

## 1. Kid-visible strings: findings

### 1.1 [B] Storage notices are hidden unless the menu is open
- `persist/ProjectMenu.tsx:121-148` renders the notice banner; the only mount is inside `Menu` in `builder/Builder.tsx:88-98`. `src/ui/Menu.tsx:170` renders children only while `open`.
- So these are never seen: "Your browser's storage is full!…" (`storage.ts:~155`), "Could not save your project…", the corrupt-save and newer-version messages set in `loadProject` (`storage.ts:~120`), and Open File success/error. A kid whose Chromebook storage fills up loses work silently.
- Fix: mount one `<StorageNoticeBar/>` (the banner block only) in `Builder.tsx` and in `Workshop.tsx` above the body, always visible until dismissed. Keep the menu for the buttons. Also give the header save badge a failed state (`saveStatus` is hard-coded `{kind:'local'}` at `Builder.tsx:77`).
- Wording fix: "Your browser's storage is full! Could not auto-save… exporting" becomes "Your world could not be saved: this computer is full. Press This world, then Save File, so you do not lose it." Drop "Try exporting".

### 1.2 [S] Words and tone in notices
- `storage.ts` corrupt text ends "started a fresh playground for you!" and says "kept a safe backup copy" but gives no way to get it back (`getBackupProject` has no UI). Say "We could not open your last world. A fresh one is ready." and either add a "Get my old world back" button or stop promising a backup.
- `ProjectMenu.tsx:50` `Loaded "X" successfully!` becomes `Opened X.`
- `ProjectMenu.tsx:60` `Reset to starter playground.` becomes `Started a new world.`
- Aria `Project storage controls` (`:67`) becomes `This world`.
- Buttons `Save File`, `Open File`, `Reset` (`:83-110`): "Reset" is vague and scary; use `Start over`. Title tooltips say `(.json)` — developer-speak, drop.

### 1.3 [S] Import errors are raw validator output
- `persist/projectIo.ts:~58` joins `problem.message` with `'; '`; catch path is `Could not read file: ${err.message}`. Kids see e.g. schema paths. Fix: map all failures to one sentence: "That file is not a Code Lab world. Pick a file that was saved with Save File." Log details to console only.

### 1.4 [S] Variables, knobs, scope
- `workshop/KnobsCard.tsx:41,45` and `builder/SeeInsideCard.tsx:65` ("This copy's knobs") use "knob". `code/VariableModal.tsx:191` says "Show in Build (per-copy knob)" and `:193` "Adds an adjustable knob to each painted copy when editing the level in Build mode." (grade 9+). `code/EditorToolbar.tsx:~140` "🎛️ 2 Build Knobs".
  - Real builders have no "knob"; the nearest real word is a setting/slider. Recommended single term: **"slider"** for the control, and the checkbox reads `Let me change this in the builder` (hint: `You will get a slider for each one you place.`).
- `VariableModal.tsx:138` "Scope" + radiogroup "Variable scope" + "For this brick only / Each copy placed in the level gets its own value." / "For all bricks (shared) / One global value shared across every brick and the stage." Replace with one question: `Who can use it?` options `Just this brick` / `Every brick`. Remove "global", "copy", "stage".
- Default to "Just this brick" and hide the radio on first use (see 3.1).
- `EditorToolbar.tsx` `Stage` + `Global` tag (`:~55`): see 2.1, unreachable; delete.
- `VariableModal.tsx:86` "Selected name:", `:101` "All Words". Fine but "Selected name" becomes "Name".

### 1.5 [S] Block-jargon in the Workshop
- `code/ProcedureModal.tsx:133,178` "Block Preview", "Block Parts"; `:172` "⚡ warp"; `:305` "Run without screen refresh (warp speed)" + "Executes all blocks in this custom block instantly within a single frame." This is Scratch-expert jargon. Remove the warp checkbox (see 3.1) or reword `Run all at once, without waiting` (hint: `Use this for blocks that repeat many times.`).
- `code/words.ts:~230` category "Label Connectors"; `words.ts` procedure inputs "Number / Text", `Boolean condition input` (`ProcedureModal.tsx:166`). Use `Number or word` and `True or false`.
- Toolbox: `core/editor/toolbox.ts:370` label `Platformer extension`. "Extension" is jargon; use `Platformer blocks` or drop the label.
- Plain-Scratch card: `code/PlainScratchCard.tsx:~60,69`: "How <block> works in plain Scratch", "Read only: these are ordinary Scratch blocks". Two problems: (a) "plain" is odd, (b) CODE-LAB-BRICK-MODEL decision 6 says "Scratch" must never appear in a feature name; this is a titled feature. Suggest `How <block> works` and footer `You can look but not change these blocks.` Magnifier tooltip `'How this works in plain Scratch'` (`code/affordances.ts:85`) becomes `See how this works`.
- `code/plainScratch.ts` explanations are grade 8-10. Examples: "Gravity is a number added to your y speed every tick" (`:~118`), "In Scratch that touching is by pixels; the Platformer blocks use the brick's box, so landing and wall stops are exact." (`:~143`), "solid [only on top]… second script." Words to remove: tick, y speed, reporter ("The speed reporter hands you…" `:~172`), hat ("This hat runs…" `:~211`), broadcast, pixels, box. Rewrite each to two short sentences, e.g. gravity: `Gravity pulls a brick down a little more each moment. Scratch has no gravity block, so you use a number called y speed and keep changing it.` The cards also say "bricks land on it when they fall onto it, but jump up through it or walk through its side."

### 1.6 [S] Diagnostics
- `code/DiagnosticsList.tsx:13-40`:
  - `block.disconnected`: "Block isn't connected / Snap this block under a hat block like 'when ⚑ clicked' to make it run!" Good except "hat block". Use `a "when" block`.
  - `block.no_type`: "Unrecognized block… from the block menu" fine but vague. Offer `Delete it` hint.
  - `workspace.invalid*`: "Could not load blocks / Something went wrong loading this workspace." Says "workspace" and is a dead end. A kid's brick will look empty. Use `This brick's blocks could not be opened. Press Undo, or start the brick again from a template.` and actually wire a button.
  - Fallback "Block needs attention" shows `diagnostic.message` raw. `core/editor/compile.ts:479` `Disconnected block "${type}" ignored` would show opcodes like `motion_movesteps`; `:118` the removed-block text mentions "brick" and "touching tile". Map every code to kid words; never print `type`.
- Counts: `⚠️ 2 Notices` (`EditorToolbar.tsx:160`), title `2 block notices`, region `Block diagnostics`, drawer `2 blocks need attention`. Use one word, "notices" is fine, but title/aria should match: `2 blocks need a look`.
- `🛑` for error vs `⚠️` for warning relies on emoji colour/shape only; text severity is not spoken (add `aria-label="Error"`/`"Warning"` to `.code-diagnostic-badge`).
- Diagnostic panel title attribute `Click to highlight and jump to this block` and tag `Jump to block ➔`: ok, but `title` is the only affordance on a button; fine.

### 1.7 [S] Starter and template labels
These show above scripts and in the Workshop; mostly good. Issues:
- Mixed person: starter labels say "When I run into something on my right" while the Hero ones say "When I run into something on my left". `starter.ts:240-241` vs `hero/heroBrick.ts:488-493` (hat `SIDE:'left'` is labelled "on my right", hat `SIDE:'right'` "on my left"). The hat says `when I bump [left] of [any]` so the label contradicts what the dropdown shows. Needs a decision on what `SIDE` means (side of me or side of the other brick) and one rule. Same for `gridBricks.ts:214,240,284`: label "from below" but the block shows `bump [top] of [Hero]`; kids will read this as a bug. Recommend the hat read `when [Hero] bumps my [bottom]` or labels say "from below (the top of the Hero)". At minimum, confirm in the browser.
- `starter.ts:333` "When a Coin is collected: count it" vs broadcast text `coin collected`; `hero/heroBrick.ts:503-509` broadcast `hero hurt`, `boing`, `stomped`, `bounce`. Label "When a Spring says boing" implies speech; fine for kids. Keep.
- `templates.ts:~25` `Block (snaps to grid)` and `empty` "a blank brick: you write the blocks" and `NewBrickPicker.tsx:60`: "Blank brick / an empty brick to draw and code" — "Empty" vs "Blank" for the same card. Pick `Blank`. The fallback card and `Starter bricks are not ready yet…` (`:44`) is a dev state; `BRICK_TEMPLATES` is never empty now, so delete the fallback and `'blank'` branch (see 2).
- `hero/heroBrick.ts` "gravity: light while holding space" ok.
- Hero tuning names (`hero/heroBrick.ts:95-131`): `p speed`, `p jump`, `meter slack`, `late jump ticks`, `early jump ticks`, `wall shed`, `wall late ticks`, `wall lock ticks`, `air push`, `walk push`, `skid`. See finding 3.2.
- Hero's 23 state variables (`:166-184`: `cap`, `way`, `steer`, `arrow`, `excess`, `limit`…) appear in the Variables palette beside real variables, plus 33 knob variables: kids who open Hero see ~55 variables. Hide them: give them a `hidden`/`internal` flag that the toolbox skips, or collapse under "Hero's own numbers".

### 1.8 [P] Word lists
- `assets/words.ts` BRICK_WORDS: `Sword`, `Weapons` (`code/words.ts` LIST `weapons`), `Spike`, `Lava`, `boss fight`, `explode`, `attack`, `ammo`, `shield`, `Dungeon`. For a school: drop or soften weapons/violence (`weapons`→`tools` already there, `Sword`, `ammo`, `explode`, `attack`→`hit`, `boss fight`, `Dungeon`). Teacher may keep; flag for decision.
- `Hero` and `Player` both in BRICK_WORDS: a new brick named "Hero" becomes "Hero 2" and `categoryForBrick` (`builder/catalog.ts:35`) puts "Hero 2" in "Start and goal". Remove `Hero`, `Walker`, `Coin`, `Spring`, `Flag` from `BRICK_WORDS` (they are built-ins) or make duplicate names a hard rule.
- Variable words with jargon: `velocity`, `opacity`, `phase`, `thrust`, `drift`, `combo`, `streak`, `target`, `radius`, `pitch`, `cooldown`. And `level` collides with the "level" concept. Trim to words a grade-4 reader knows.
- Costume words `walk1/run2/spin1…` look like code; fine for a pixel animation, but `idle`, `climb`, `duck` are OK; maybe drop `open/closed/on/off/flat/active`.
- Ask answers (`stage/words.ts`) fine.
- Sound names (`assets/soundLibrary.ts`): `jump coin pop boing laser hit win powerup step buzzer` fine. Description text: `SoundPanel.tsx:81` "Add synthesized retro sounds from the library!" ("synthesized", "retro") becomes "Pick a sound from the library."

### 1.9 [S] Placing strip and cards
- `builder/BuildPanels.tsx:148` `Click to place a copy · click a copy to select it · right-click erases`: "copy" x2. Real builder: `Click or drag to place · right-click erases` (`src/platformer/ui/BuildShell.tsx:93`). Use the real string for all placeable bricks.
- `BuildPanels.tsx:141` `Moves your Hero · only one per level` and `:144` `Click to place your Hero · only one per level` are clear. Keep. Real builder says `Start`, `Goal` and `Checkpoint`; Code Lab says `Hero` in "Start and goal" drawer category (`catalog.ts:19`). Real term for the player's starting point is "Start"; Code Lab's Hero is also the playable thing. Acceptable but note: kids will look for "Start". `BY_NAME` already maps `start`; add a **Start** brick? Not needed: rename category `Start and goal` → `Hero and goal`.
- `builder/SeeInsideCard.tsx:52`: `title='Remove this copy'`, aria `Remove this ${brick.name}` (good), `:35` section aria `${brick.name} copy`, `:65` "This copy's knobs". Replace "copy" with the brick name or "one".
- `SeeInsideCard.tsx:41-42`: `3 in this level` ok. Workshop header `3 in My world` (`workshop/Workshop.tsx:40`) uses hard-coded "My world" while the design is named `My level` (`store.ts:282`) and the menu is `This world`. Use `3 in this world`.
- `workshop/Workshop.tsx:42` `Changes apply to every copy` becomes `Changes apply to all your <Name>s` or `Every one of these changes too`.
- `Workshop.tsx:34` `✓ Done` with `aria-label="Done: back to the builder"`: aria text differs from visible text (WCAG 2.5.3 label in name). Make aria `Done` or `Done, back to the builder`.
- `StageControls.tsx`: `Green flag (start scripts)` becomes `Start over` or keep `Green flag` (Scratch word) but drop `(start scripts)`. `Whole level / Follow brick`: "brick" here means the selected brick (Hero)? In Play nothing is selected (`store.play` clears selection), so "Follow brick" follows what? Rename `Follow Hero` and check behaviour. Zoom `+ / − / Fit`: fine. "Level Stage" aria on the canvas wrapper (`Stage.tsx:640`) becomes `World`.
- `TestRoom.tsx:~95` `The Stage has no test room. Pick a brick to see it run.` (only reachable for the Stage; dead, see 2.1). `Test room` is a good name; `↻ Restart` ok. Hint "A helper Hero is in the room. Click it and use the arrow keys to touch your brick." — "Click it" is ambiguous (click the Hero? the room?). Use `Click the room, then use the arrow keys to walk the helper Hero into your brick.`
- `Test room view` and `Test room` same aria on two elements.

### 1.10 [P] Costume and sound editors
- `CostumeEditor.tsx:646-660` `Size:` 16 24 32 48 64 with aria `32 by 32 pixels`; `:634-686` `Center rotation point`, `Reset rotation center to image middle`, `Rotation center handle`, `Drag to set rotation center`. "Rotation center" is a Scratch expert concept: remove from the kid UI (centre it automatically) or rename `Middle`. `Pixel art canvas` ok; `Fill bucket tool` ok.
- `Color #ff00aa` aria labels on 16 swatches (`:705`): kids using a screen reader hear hex; name them (`Red`, `Blue`).
- `SoundPanel.tsx:49` `Stage Sounds`, `CostumeEditor.tsx:416` `Backdrops list`: dead branches (2.1).
- `SoundPanel.tsx:156` `Click Play to preview, or Add to attach to your brick:` becomes `Press Play to hear a sound. Press Add to give it to your brick.`
- `assets/WordPickerModal.tsx:35` `Choose a word:` fine.

### 1.11 [P] Developer-speak that leaks
- `CodeEditor.tsx` toolbar aria `Code Editor Toolbar` (`code/EditorToolbar.tsx:~47`). Use `Code tools`.
- Toolbar title `Make a new variable (number or text)`, `Tidy up blocks into neat columns`, `Reset zoom and center view` (US spelling `centre`/`center` is consistent: keep `center`). `🔍+`/`🔍−` glyph buttons have aria-labels; ok.
- Magnifier glyph `🔍` is used for both "open My Block" and "How this works" (same icon on the same blocks, `code/affordances.ts:29`) and for `See inside` in the builder (lucide `Search`). Three meanings. Keep 🔍 only on `See inside`; use `ℹ️`/`?` for "how this works".
- `store.ts:282` name `My level`; header title shows it and it cannot be renamed (the header passes no `onRenameWorld`). Real builders let you rename. Either add rename (cheap, `onRenameWorld` -> `store.rename`) or accept `My world`.
- `"workshop" ` word: file/class names only; UI says `Done`, good. Docs say "See inside" opens the "Brick Workshop"; the kid never sees "Workshop". Good.

---

## 2. Dead, duplicate and vestigial

### 2.1 [S] Stage branch is unreachable from the UI
Nothing calls `openWorkshop(STAGE_ID)` (only `store.openWorkshop(brick.id)` in `builder/SeeInsideCard.tsx:46`, and `BuildPanels` never lists the Stage). Yet the Stage is a first-class thing in:
- `CodeEditor.tsx` `isStage` branches, `handleCreateVariable`/`handleCreateList` 40-line stage-workspace JSON patching (`:451-516`, duplicated twice), `code/EditorToolbar.tsx:~52-58` Stage badge + `Global`, `SoundPanel.tsx:53` `Stage Sounds`, `CostumeEditor.tsx` backdrop mode + `BACKDROP_WORDS`, `workshop/Workshop.tsx:40` "The Stage", `workshop/TestRoom.tsx:97` empty state, `workshop/KnobsCard.tsx` (stage id check), `VariableModal.tsx` `isStage` hint.
- The starter does ship a Stage script (the coin counter, `starter.ts:515-544`, `Stage` script "no coins yet"/"count it"), which a kid can therefore never see or fix. If the Stage must stay, give it one door: a `World` entry in the Bricks drawer's My bricks or an `Edit world code` link in the This-world menu, and call it **World** everywhere ("World code, World sounds, World backdrops"). If it should not be kid-visible this release, delete the Stage UI branches and keep the global-variable scope only.
- Related: `VariableModal` "For all bricks (shared)" is the only kid door into Stage variables (they are created on the Stage workspace); kids can create a global they can never find in a list. Recommend removing the scope choice (3.1) for this release and offering only brick variables.

### 2.2 [S] Step-6 tile remnants after step 7
- `builder/tilePaint.ts`, `builder/ensureTiles.ts`, `store.setTile` (`store.ts:129`) keep the "tile" name for what step 7 calls a grid brick; `builder/tileArt.tsx` only exports `CostumeThumb`; `builder/testGridBricks.ts` and `builder/testTemplates.ts` are "test double / Not shipped code" files sitting in the production folder (`builder/testGridBricks.ts:5` says the real one throws until a lane merges, which is stale now). Move to `__fixtures__/` or delete the stub text; check imports from non-test code (none found).
- `studio.css:1-12` the old two-pane shell (`.studio`, `.studio-left`, `.studio-tabs`, `.studio-editor`, `.studio-right`, `.studio-stub`, `.studio-project-menu`) has no JSX users (grep shows 0). Delete. Keep only `.studio-screen`.
- `assets/brickList.test.ts` describes "BrickList" which no longer exists; rename or delete.
- `legacySave.ts` still runs on every load and import; needed for old saves. Keep, but add a sunset note.
- Two knob modules: `builder/knobs.ts` (`knobRange(start,value)`) and `workshop/knobs.ts` (`knobRange(value)`); same name, different signature, two sliders UIs (`builder-knob` vs `ws-knob`). Merge into one `knobs.ts` and one `<KnobSlider>`.

### 2.3 [S] Dev affordances
- `workshop/devOpen.ts` is "imported nowhere in production" but is a file in the shipped folder (tree-shaken, not visible to kids). Move to `scripts/` or delete.
- `code/harness.html` / `harness.tsx` "Code editor harness (scratch, not shipped)": same; move out of `src/`.
- `window.__wsStore` set in `devOpen.ts`; nothing else. Fine if not imported.
- `Builder.tsx:78,84` `onOpenWorldSetup={() => {}}` and `onOpenHelp={() => {}}`; see 4.1.
- `NewBrickPicker.tsx:43-50` "Starter bricks are not ready yet" fallback and `'blank'` mode, plus `createBlankBrick` in `builder/newBrick.ts` are dead since `BRICK_TEMPLATES` has six entries; delete along with the `templates` prop (tests only).
- `catalog.ts` header comment mentions "gridBrickTemplate throws until the lane merges": stale.

### 2.4 [P] Duplicate controls
- Toolbar `+ Variable`, `+ List`, `+ Block` (`code/EditorToolbar.tsx:69-95`) duplicate the toolbox buttons `Make a Variable`, `Make a List`, `Make a Block` (`core/editor/toolbox.ts:80,326,337,405`). Two names for each (`+ Block` vs `Make a Block`). Keep the Scratch-standard ones in the palette and remove the toolbar trio.
- Toolbar `Undo/Redo` (`:105-122`): Blockly has Ctrl+Z and the trashcan; keep Undo/Redo (kids on trackpads) but drop `Tidy` + `Center` + `🔍+` + `🔍−` (right-click "Clean up blocks" and wheel zoom exist; `Center` is just reset). That cuts the toolbar from 9 controls to Undo/Redo. Tidy auto-runs when overlapping (`CodeEditor.tsx` `tidyIfOverlapping`).
- Header has `AccountChip` (sign-in) with no `onSaveToAccount`: check what it shows to a kid on a school Chromebook; it may offer "Save to account" that does nothing. Verify in browser (not auditable from source).
- `Done` (workshop) and Play/Build mode switch are separate paths back; fine.

### 2.5 [P] Settings nobody needs
- Costume `Size` picker with five sizes; kids resizing a 16x16 grid brick costume would break autotile (`gridBricks` = 16x16). Hide Size for grid bricks; for others keep 16/32 only (see 3.1).
- Costume rectangle filled/outline toggle, line tool, custom colour (`CostumeEditor.tsx:559-575,711-722`): keep pencil, eraser, fill, colours; line/rectangle are nice-to-have. Candidate to remove for launch if the toolbar is crowded.

---

## 3. Simplification candidates

### 3.1 Choices a default could make
1. **Variable scope + "Show in Build"** (`VariableModal.tsx:136-197`): default `Just this brick`, hide the radio; show the checkbox as `Let me change this in the builder` only when it is a number. Result: modal = word grid + Create. Removes 3 concepts (scope, global, knob).
2. **My Block "warp"** (`ProcedureModal.tsx:296-310`): remove; default off. `Block Parts` editor (number/text/true-false parts, `Remove part N`) should start with a small set of picked words (already) but also drop `x`/`y`/`direction` jargon from `PROCEDURE_INPUT_WORDS`.
3. **Variable word categories** (3 pills + All) and list categories: show one grid, no pills (16+12+12 words). Pills add a step; the "Selected name" preview then also goes.
4. **Name picker** after template (`NewBrickPicker.tsx`): picking template then 59 names. Default name = template name (`Walker 2`) with a "Rename" later; or show 12 words, not 59 (`BRICK_WORDS` is 47 words in 3 comment groups with no headings). Today kids scroll a wall of 47 buttons; the comment groups ("Characters & Creatures" etc.) never appear as headings.
5. **Hero tuning** (`KnobsCard.tsx:53-66`, `workshop/knobs.ts`, `HERO_KNOB_GROUPS`): 33 more sliders in 5 groups for a brick whose four main knobs are enough. Hide "More tuning" entirely for this release, or label only: `Walking: speed up`, `Jumping: float`, etc. The slider's range logic (`knobRange`, `knobStart`) is the biggest pile of un-kid-friendly maths; removing "More tuning" deletes `knobStart`, `HERO_KNOB_GROUPS`, `moreCount`, `moreOpen`.
6. **Zoom/Fit and camera choice** in Play (`StageControls.tsx`: Whole level / Follow brick / + − Fit): default `Follow Hero`, remove the toggle; keep `+ − Fit` only in Build. Two camera modes in Play plus free pan is three states (`playFree`, `playChoice`) for a kid to be confused by.
7. **Green flag button in Play**: Play already starts the flag (`store.play` → greenFlag). A second `⚑` button restarts scripts without resetting the level (CODE-LAB-BRICK-MODEL decision 1: flag does NOT reset positions). Kids will press it expecting restart. Replace with `Start over` (= Build then Play) or remove.
8. **Erase**: `Erase` button + `E` key + right-click erase + Delete key + `Remove` button on the card = 5 ways. Keep Erase tool and right-click; keep `Remove` (it is on the selected-thing card); fine.
9. **Costume sizes** (see 2.5), **sound library** (`Browse library` + `+ Add sound` do the same job: `SoundPanel.tsx:59-62` and `:86-89` both open the library). Delete the empty-state duplicate button or the header one.
10. **Ask dialog** (`stage/AskDialog.tsx`): 21 answer chips each submit immediately AND a text box + ✓. Choose one: chips only (matches "no free text" rule) and remove the input.

### 3.2 [S] "More tuning (33)"
Already covered above; for the Hero card also note the number formats (`formatKnob` shows `0.0547` style values): `walk push 0.219` means nothing to a kid. If tuning stays, show it as `less … more` sliders without numbers.

### 3.3 [P] Flows with extra steps
- New brick = open picker → pick template → pick name → workshop opens, and the new brick is NOT placed/armed in the builder. After `Done` the kid must find it in My bricks. Arm the brush with it on Done (`store.setBrush(newId)`), or place one automatically.
- See inside → Done returns, but `Builder` state is kept (good).
- Template choices include `Goal`, `Walker`, `Coin`, `Spring`: the drawer already offers these; "make a new Walker" is a duplicate of "copy built-in and edit". Fine; this is how kids "start from a brick that works".

---

## 4. Error and empty states

| Situation | What the kid sees today (source) | Verdict / fix |
|---|---|---|
| Code has a diagnostic | `DiagnosticsList` drawer in Workshop only; `block.setWarningText` badge on block (`CodeEditor.tsx:~330`). Builder/Stage show nothing. | OK in Workshop. In Play a brick with a broken script just does nothing silently. Add a small `⚠ Walker has a block that needs a look. See inside` on the card. |
| Save fails / storage full | Nothing visible (1.1). | **Blocker.** |
| Corrupt save at load | Hidden notice; fresh starter appears; old world is gone from view (backup unreachable). | **Blocker** (data loss feel). Show banner + button to get the backup. |
| Import bad file | Menu banner with validator text (1.3), only if menu still open (it is, the dialog sits in the menu; the file picker closes the menu? `Menu` may close on item click) | S. |
| Import good file | Silently replaces world, banner only if menu open; Undo stack stale (find 2). | **Blocker.** `builder/Builder.tsx` creates history once via `builderSession(store)`; `store.load` (`store.ts:259`) never clears it. Fix: `store.subscribe` on `load`, or `History.clear()` in the menu handlers; also ask `Replace this world?` first. |
| Reset | Confirm dialog `Start over with the fresh starter playground?` (good) but no Undo after. | S: reword `Start a new world? Your current world will be lost unless you saved it.` |
| Brick has no costume | `ws-icon` renders an empty tile (`workshop/Workshop.tsx:33`), `CostumeThumb` empty, Stage skips drawing: the copy is invisible on the canvas with no clue. CostumeEditor creates one on open (`CostumeEditor.tsx:101`) and refuses deleting the last one (`:396`, but button just disabled with no tooltip). | S: when `costumes.length===0` draw a `?` placeholder on the stage and say so in the Placing strip ("Walker has no costume yet: See inside → Costumes"). Add `title="A brick needs at least one costume"` to the disabled Delete. |
| Level has no Hero | Play runs; nothing moves, no message. Hero can be Removed via the card (`SeeInsideCard.tsx:48-56`) and erased. | **Blocker for a class.** On Play, if no copy of `brick_hero`, show a toast/banner `Place the Hero first` and stay in Build (or highlight the Hero in the drawer). |
| Level has no Goal | Play runs, never ends, no message. | S: on Play show a soft hint `This world has no Goal yet, so it cannot be won`; allow Play. |
| Hero or Goal deleted | One click, no confirm; undoable. | OK because undo exists; reword to say `Remove (Undo brings it back)`? Optional. |
| Workspace JSON fails to load | `console.error('Failed to load workspace:')` only (`CodeEditor.tsx:214`); empty editor, and the next autosave overwrites the brick's code with the empty workspace. | **Blocker-ish (data loss).** Show the `Could not load blocks` diagnostic *and* do not save over it until the kid edits; keep the last good JSON. |
| Append custom block fails | `console.error` only (`:551`). | S: show a notice. |
| Test room runtime error | `createRuntime/step` unguarded in `TestRoom.tsx`; a throw leaves a blank canvas, may unmount the Workshop (no error boundary found in studio). | S: add an error boundary around `Workshop`, `Builder`, and `TestRoom` with `Something went wrong. Your world is saved. Press Reload.` |
| Audio blocked / not supported | `audio.ts` swallows errors (`:23,89,101,122`). | OK. |
| Limit reached (300 clones, one Hero) | Strip text only. No message for the clone limit. | P. |
| New-brick fallback (no templates) | "Starter bricks are not ready yet…" | Dead; delete. |

---

## 5. Accessibility basics

- **Keyboard cannot build.** The Stage is pointer-only: arrow keys/Enter do not move a ghost cursor or place the armed brick (`Stage.tsx:540-600` handles Delete/nudge of a selected copy only). Painting and selecting need a mouse or touch. A class with trackpad-less Chromebooks still has touchpads, so not a launch blocker, but note it. Cheap fix: `Enter` places the armed brick at the view centre; arrow keys nudge a selected copy by one cell (selected copy nudge exists? line 564+ shows only Delete in the part I read).
- **Focus rings**: present on builder buttons (`builder.css:30`), stage view buttons (`stage.css:76`), workshop room/toggle, layer bar and plain card. Missing: `.ws-done`, `.ws-tabs button`, `.ws-btn`, `.tool-btn`, `.color-swatch`, `.code-*` toolbar buttons, `.code-word-btn`, `.project-menu-btn` (no `:focus-visible` rules found in `workshop.css`, `assets.css`, `projectMenu.css`; the code toolbar relies on the browser default, which is faint on dark panels). `stage.css:12,24` and `workshop.css:26` set `outline:none` on the wrapper, fine because `:focus-visible` is restored for children and `.ws-room-view`; check `.stage-container` (`tabIndex=0`, outline none, no replacement ring): the canvas has no visible focus.
- **Hit targets**: good in most places (`.asset-btn` 40px, `.tool-btn` 40px, `.color-swatch` 36px, `.ws-btn` 40px, `.ws-done` 44px, `.ws-tabs` 40px). Small ones: `.brick-icon-btn` 24x24 (`assets/assets.css:243`, duplicate/delete/move up/down on each costume row, 4 buttons tightly packed on a Chromebook touch screen), `.code-knob-checkbox` 22px (has a label wrapper so the whole row clicks), `.code-picker-done-btn` 32px, `.builder-knob input[type=range]` 32px ok, `.ws-knob` range 28px. Raise `.brick-icon-btn` to 36px minimum.
- **Contrast of small text**: `#687082` on `#1d212b` at 0.85rem (`SoundPanel.tsx:79`, ~3.4:1, fails AA), `#838b9e` on `#1d212b` ~5:1 ok, `.code-stage-tag` 10px (`code.css:56`), `font-size: 11px` helper text in `code.css:313,569,653,702,732` (colour `#94a3b8` on `#222938`, ~6:1, OK in colour but too small for 10-year-olds: raise to 13px), `#8d95a5` 0.8rem labels in CostumeEditor fine. Light chrome text `#5b6b7b` on `#fff` is 5.3:1 ok.
- **Colour-only meaning**: diagnostic severity (🛑 vs ⚠️, 1.6); selected word in word grids shows ✓ (good); the Erase tool uses `aria-pressed` + colour (add the existing text `Erasing` kicker — already there, good); category tabs; palette swatches named by hex only; running-block glow (`setHighlighted`) in Play is colour/glow only (fine, decorative). Costume tool buttons have `active` colour plus `aria-pressed`? check `tool-btn` (aria-pressed not seen): add.
- **Roles**: `ws-tabs` use `role="tablist"` and `role="tab"` but no `tabpanel` and no arrow-key support. Either use real tabs or drop the roles (plain buttons with `aria-pressed`).
- **Dialogs**: `AskDialog` role `dialog` without `aria-modal` or focus move; `ProjectMenu` confirm `role="dialog"` inside a menu (focus not trapped). The builder's key handler ignores shortcuts while `[role="dialog"][aria-modal="true"]` is open (good) but AskDialog/confirm are not aria-modal, so Undo/E fires while they are open.
- **Emoji as icons**: `📊 📋 🧱 🧹 🔍 🎯 🎛️ ⚠️ 🛑 🌍 💬 ⚡` in toolbar/modals render inconsistently on Chromebook (ChromeOS Noto vs Android) and clash with the lucide icons used by the real builders. Replace with lucide for consistency (the builder already does).
- **Reduced motion / audio**: nothing required.

---

## 6. Old lab vs new studio

- **No code imports from the old lab** (`lab/{bricks,sim,level,program,render,runtime,costumes,feel,ui}`): verified by grep. Art comes from `src/platformer/render/*` (the real 2D builder's own art, `gridBricks.ts:18-34`, `stage/sky.ts:5`), not `lab/render`. Good.
- **Both labs are routed**: `/2d/lab` (old `LabApp`) and `/2d/lab/next` (new). `routes2d.ts:10` documents `/2d/lab/next` as "preview". Nothing in the studio links to the old one and the old one has its own storage (`session.ts`), so a kid who types the wrong URL gets a completely different UI called the same thing. Before class: give the kids one URL; consider redirecting `/2d/lab` to `/2d/lab/next` or hiding the old route behind a flag.
- Key `code-lab.project.v1` (`storage.ts:~28`): fine. Check the old lab does not write the same key (grep found none).
- Docs/comments still say "step 6/6b/7" in kid-reachable strings: none found in JSX; only code comments.
- `README`-level naming: the page `<title>` for the route is whatever `PlatformerApp` sets; `harness.html` title is dev-only.

---

## 7. Glossary (concept → terms now used → recommended)

| Concept | Terms in the source today | Recommended |
|---|---|---|
| The thing you drop in the level | brick, part (docs only), block ("Remove this block", `Block (snaps to grid)`, Hard block, ? block, Bounce block), cell, tile | **brick** for any piece; keep **block** only for Scratch code blocks. Rename template `Block (snaps to grid)` → `Grid brick`; "Remove this block" → "Remove". |
| One placed instance | copy ("Remove this copy", "Changes apply to every copy", "each painted copy", "per-copy knob", "Click to place a copy"), "N in this level", clone, cell, instance (code) | **"one"**: "3 in this world", "Click to place one", "Changes apply to all of them". Say **clone** only in the Scratch clone blocks. |
| The whole thing you make | level (`My level`, "level start", "Whole level", "Fit the whole level"), world (`This world`, `My world`), project (`Project storage controls`, `Save project to file`), playground (`starter playground`, `fresh playground`), Level Stage, course | **world** (matches real builders: "Build a 2D world", "This world"). Reserve "level" only for "level" as in game stage if the Goal says so; change "Whole level" → "Whole world", "When the level starts" → "When the game starts" (label text in starter/hero/grid bricks, ~25 strings) |
| The global scripts holder | Stage, The Stage, Level Stage, backdrop, Global, "stage's variables" | **World** (if exposed at all; else remove, 2.1) |
| Per-brick adjustable number | knob, Build Knob, slider, tuning, "show in Build", "variable knob" | **slider** (control) and "Let me change this in the builder" (checkbox) |
| Named stored value | variable, knob, note ("solid note", "on ground note"), speed, "number" | **variable** (it is the Scratch word; kids will meet it in the palette) |
| Own block you define | My Block, custom block, procedure (code, `ProcedureModal`), `Make a Block`, `+ Block`, "Block Parts" | **My Block** (Scratch term) everywhere; `Make a Block` button; "Parts" → "Inputs" |
| Open the brick's code | See inside, Brick Workshop (docs), Workshop (code), Edit | **See inside** (kid) – fine. |
| Leave the workshop | Done, `✓ Done`, "Done: back to the builder" | **Done** |
| Level start/play | Play, Explore (header internal), green flag, ⚑, Start, "When the level starts" | **Play** and **green flag**; do not say "Explore". |
| Player brick | Hero, Player (BRICK_WORDS), Start (real builder) | **Hero** |
| Finish | Goal, flag, course clear (broadcast `course clear`), "level complete" word | **Goal**; broadcast text `goal reached`. |
| Collision event | when I bump, touching, bumps me from below, "stomped" | **bump** for the hat; "touching" for the sensor. Resolve the SIDE wording (1.7). |
| Pre-made starting points | template, "Start from <name>", "a brick that works", starter brick, starter playground | **starter** ("Pick a starter") |
| Code undo/redo | Undo/Redo, ↩ ↪ | **Undo**, **Redo** |
| Errors in code | Notices, diagnostics (code), "needs attention", warnings | **notices** ("2 blocks need a look") |
| Per-script caption | label (code), "label connectors", comment | **caption** or show nothing; "label" is internal only. |
| Picked words | word list, picked answers, "Pick a word", "Choose a word" | **Pick a name** / **Pick a word** |
| Saving | auto-save (none shown), Save File, Open File, Reset, "export", "save project to file" | **Save a copy** (file), **Open a file**, **Start over**; show auto-save status in header: `Saved` |
| Test sandbox | Test room, helper Hero | **Test room** |

---

## 8. Quick order of work

1. Show storage notices always (1.1), clear Undo on load + confirm Open File (4), wire or hide Scene/Help (4.1/2.3), no Hero/no Goal message (4), stop overwriting a failed-to-load workspace (4).
2. One vocabulary pass: copy → one, level/playground/project → world, knob → slider (7). ~60 string edits, no logic.
3. Delete: Stage UI branches or give the Stage one door (2.1), toolbar duplicates (2.4), `More tuning` (3.2), warp checkbox, variable scope step, `Size` row for grid bricks, `studio.css` old shell, `devOpen.ts`, `harness.*`, `NewBrickPicker` blank fallback.
4. Rewrite plain-Scratch card text at grade 4-5 and drop "Scratch" from the title (1.5).
5. Add focus rings to workshop/asset buttons, raise `.brick-icon-btn` to 36px, raise 10-11px helper text to 13px, fix `#687082` contrast, replace emoji icons with lucide.
