# Step 6b, editor lane: code polish and a block smoke test

Branch `claude/s6b-editor`. Files touched: `core/editor/definitions.ts`, `core/editor/toolbox.ts`, `core/editor/procedures.test.ts`, new `core/editor/blockSmoke.test.ts`, `studio/CodeEditor.tsx`, `studio/code/affordances.ts`, `studio/code/EditorToolbar.tsx`, `studio/code/code.css`, new `studio/code/tidy.test.ts`. Nothing else.

Final run: `npx vitest run src/platformer/lab` 76 files, 1006 passed, 26 expected-fail; `npx tsc --noEmit -p tsconfig.app.json` clean.

## What changed

1. **Palette: only Scratch-style My Blocks.** `myBlocksFlyout(ws)` (new, `core/editor/toolbox.ts`) builds the My Blocks flyout: Make a Block, then one call per definition with its argument reporters. The `Blockly.Procedures.flyoutCategory` call that listed "to do something / return / if return" is gone from `CodeEditor.tsx`.
   - Tests: `procedures.test.ts` "My Blocks palette" (items, no `defnoreturn/defreturn/callnoreturn/ifreturn`, empty workspace).
   - **The plugin stays registered, for one reason:** `registerToolboxPlugins` still calls `registerProcedureSerializer()` and defines its blocks so an *old save* that contains a `procedures_defnoreturn` block still loads (Blockly throws on an unknown block type). Test: `procedures.test.ts` "the plugin stays registered only so old saves that hold its blocks still load". Nothing in the UI creates those blocks any more.
   - Browser: on first paint the toolbox drew Blockly's own My Blocks (with the plugin blocks) before our callback existed; My Blocks is now the first category so this showed. Fixed with `toolbox.refreshSelection()` after registering the callback and after the load. Checked in the browser: no "do something" blocks, even right after open.
2. **Inline inputs.** A `procedures_call` is rebuilt from its proccode (`parseProccode` in `definitions.ts`): words and value inputs in one inline row, words in front of the input they precede; boolean slots only accept booleans; the magnifier stays first. Palette calls start with an empty text shadow in number/text slots. The definition (and prototype) reads `define walk at (speed)` / `jump (height) times <fast?>`; the empty pink `custom_block` pill is removed.
   - Tests: `procedures.test.ts` "My Block calls read like Scratch" (walk at, jump times, trailing words, no inputs, saves the same extraState and still compiles args by name, definition label). The older round-trip test's expected definition label changed from `jump ( ) times < >` to `jump (height) times <fast?>`.
   - Browser: Walker's `walk at (speed)` call and the `walk at` palette block render inline; drilled-in definition shows `define walk at (speed)`.
3. **No overlap on open.** `tidyIfOverlapping(ws)` runs once after the first render. If any top-level scripts, counting the label band above each hat, overlap, it arranges them in one column in reading order (labels above stacks). Non-overlapping layouts are not touched. Definitions don't take part (never on screen together with scripts). Moves are recorded without events, saved immediately, and the undo stack is cleared.
   - Tests: `tidy.test.ts` (no overlap left alone, overlap, label-only overlap, touching edges, column result has no overlap and keeps the first stack in place).
   - Browser: forced the Walker's three scripts to overlap in the saved workspace, re-opened it: laid out in a column with labels above, saved positions changed from (20,20),(30,50),(40,80) to (20,20),(20,303),(20,466). The Hero's layout (non-overlapping) was not touched.
4. **Undo / Redo buttons** in the editor toolbar (`EditorToolbar.tsx`, `ws.undo(false/true)`, disabled when the stack is empty via `undoState`). Test: `tidy.test.ts` "undo and redo use Blockly's own stack". Browser: dragged a My Block call in, Undo removed it (calls in the saved workspace 5 -> 4), Redo restored it (5). The builder has its own Undo button; the workshop has two buttons with that name, mine is the second.

## Block smoke test

`core/editor/blockSmoke.test.ts`: all 128 non-My-Blocks blocks of the brick toolbox. For each: load it (with its toolbox defaults and shadows) into Blockly, put it in a `when flag clicked` script (reporters inside `say`, booleans inside `if`; hats stand as their own script), `compileWorkspace`, then assert:
- zero diagnostics;
- the block did not compile to nothing;
- every opcode is in `ALL_PRIMITIVES` or is one the runtime handles itself (control flow, calls, broadcasts), so no unknown opcodes;
- 60 ticks in a small design without throwing.

Result: all 128 pass. No block compiles to nothing, none has an unknown opcode, none throws.

### Findings for the integrator (core/**, not touched)

1. **An empty `forever` freezes the page** (real bug). `when flag clicked > forever` with nothing inside never ends a tick: in `Runtime.step`, the loop frame yields, the sweep loop turns the yield back into running, and an empty body charges no op and requests no redraw, so neither the op budget nor the redraw check stops it. A kid will do this. The smoke test compiles `control_forever` but does not run it (`FREEZES_WHEN_RUN_EMPTY`), and a second test runs a `forever` with one block inside. Fix idea: charge one op per loop iteration (or break the sweep when every runnable thread has only yielded loops).
2. **`repeat until <cond>` with an empty body doesn't wait** (Scratch parity). `runtime.ts` pushes a loop frame only when the body has blocks, so it checks the condition once and moves on; Scratch waits one tick per check until it is true. Test: `blockSmoke.test.ts` `it.fails` "repeat until <cond> with an empty body keeps waiting...". Flip it when core is fixed.
3. **No-ops with default inputs.** I compared the world before and after 60 ticks for each block. These did not change it, because the default input equals the starting state (`set x to 0` at x 0, `show` when visible, `switch costume to costume1`, `volume 100`, empty lists...) or because the block only reports/hats: motion_pointindirection, pointtowards, gotoxy, glidesecstoxy, setx, sety, ifonedgebounce; looks_switchcostumeto, nextcostume, switchbackdropto, nextbackdrop, setsizeto, seteffectto, cleargraphiceffects, show, gotofrontback, goforwardbackwardlayers; sound_* (no sound state in the world); event_* hats and broadcast blocks with no receiver; control_wait/repeat/if/if_else/wait_until/repeat_until/stop/start_as_clone/delete_this_clone; sensing_* and operator_* reporters used alone; data_setvariableto (to 0), show/hide variable/list, list reads/deletes on an empty list; platformer_whenbump, onground, touchingtile. None of these is a missing implementation: every opcode has a primitive or runtime handler, and the §01 fixtures check their real effects. It is a list of "nothing visible happens until the kid changes an input", useful for the kid copy but not a bug.
4. **Sound blocks and the stage.** `sound_*` blocks leave no trace in `World`, so the smoke test can't see them play. `StudioApp`/Stage play them. Not browser-checked.

### Scratch blocks and their §01 fixture tests

Matched by the opcode appearing in a conformance test (`core/conformance/*.test.ts`, test titles are `<ID> · ...`); hats built through the harness helpers (`clickScript`, `broadcastScript`...) are matched by hand. "no §01 fixture" means no conformance test names the opcode; those rely on the wave 1 unit tests (`core/*.test.ts`) and the smoke test above. The five `platformer_*` blocks have their own tests in `core/platformer.test.ts` and `core/editor/platformer.test.ts`, not in §01.

| Block | §01 fixtures (file) |
|:---|:---|
| `control_create_clone_of` | D02 (data), D10 (data), H07 (hats), M08 (motion) |
| `control_delete_this_clone` | C05 (clones), C06 (clones), C07 (clones) |
| `control_forever` | C10 (clones), F05 (frame), F11 (frame), M09 (motion), R1a (regressions), R1b (regressions), R2 (regressions) |
| `control_if` | C02 (clones), C07 (clones), C10 (clones), P04 (procedures) |
| `control_if_else` | no §01 fixture |
| `control_repeat` | C02 (clones), C05 (clones), F02 (frame), F04 (frame), F06 (frame), F10 (frame), F12 (frame), P05 (procedures), R1a (regressions), R1c (regressions) |
| `control_repeat_until` | no §01 fixture |
| `control_start_as_clone` | C05 (clones), C09 (clones), D02 (data), D10 (data), M08 (motion) |
| `control_stop` | C08 (clones), C10 (clones), P06 (procedures), P07 (procedures) |
| `control_wait` | C02 (clones), C03 (clones), C07 (clones), C08 (clones), C10 (clones), F08 (frame), F11 (frame), F14 (frame), H02 (hats), H03 (hats), H04 (hats), H05 (hats), H06 (hats), H10 (hats), L11 (looks), R3a (regressions), R3b (regressions), R3c (regressions), R3d (regressions), S09 (sensing), S11 (sensing) |
| `control_wait_until` | F09 (frame) |
| `data_addtolist` | D08 (data), D10 (data), F07 (frame), F08 (frame), H02 (hats), H03 (hats), H07 (hats), H10 (hats), L08 (looks), P01 (procedures), P02 (procedures), P03 (procedures), P04 (procedures), P06 (procedures), P07 (procedures), S11 (sensing) |
| `data_changevariableby` | C02 (clones), C10 (clones), D01 (data), D02 (data), F02 (frame), F04 (frame), F05 (frame), F06 (frame), H01 (hats), L07 (looks) |
| `data_deletealloflist` | D04 (data) |
| `data_deleteoflist` | no §01 fixture |
| `data_hidelist` | no §01 fixture |
| `data_hidevariable` | no §01 fixture |
| `data_insertatlist` | D05 (data), D09 (data) |
| `data_itemnumoflist` | D06 (data) |
| `data_itemoflist` | D03 (data), D04 (data), D05 (data) |
| `data_lengthoflist` | no §01 fixture |
| `data_listcontainsitem` | D06 (data) |
| `data_listcontents` | D07 (data) |
| `data_replaceitemoflist` | D03 (data) |
| `data_setvariableto` | D01 (data), D03 (data), D04 (data), D05 (data), D06 (data), D07 (data), F11 (frame), F12 (frame), F16 (frame), L06 (looks), L07 (looks), L08 (looks), M04 (motion), M05 (motion), M11 (motion), M13 (motion), O01 (operators), O02 (operators), O03 (operators), O04 (operators), O05 (operators), O06 (operators), O07 (operators), O08 (operators), O09 (operators), O10 (operators), O11 (operators), O12 (operators), O13 (operators), O14 (operators), P01 (procedures), P03 (procedures), S01 (sensing), S02 (sensing), S03 (sensing), S04 (sensing), S05 (sensing), S07 (sensing), S08 (sensing), S09 (sensing), S10 (sensing), S12 (sensing), S13 (sensing) |
| `data_showlist` | no §01 fixture |
| `data_showvariable` | no §01 fixture |
| `data_variable` | C02 (clones), C07 (clones), C10 (clones), F09 (frame), O01 (operators), P01 (procedures) |
| `event_broadcast` | C03 (clones), F15 (frame), H05 (hats) |
| `event_broadcastandwait` | H06 (hats) |
| `event_whenbackdropswitchesto` | H09 (hats) |
| `event_whenbroadcastreceived` | H05 (hats) |
| `event_whenflagclicked` | F14 (frame), H10 (hats) |
| `event_whengreaterthan` | H08 (hats) |
| `event_whenkeypressed` | S11 (sensing) |
| `event_whenstageclicked` | H04 (hats) |
| `event_whenthisspriteclicked` | H03 (hats) |
| `looks_backdropnumbername` | no §01 fixture |
| `looks_changeeffectby` | no §01 fixture |
| `looks_changesizeby` | no §01 fixture |
| `looks_cleargraphiceffects` | no §01 fixture |
| `looks_costumenumbername` | no §01 fixture |
| `looks_goforwardbackwardlayers` | no §01 fixture |
| `looks_gotofrontback` | F14 (frame), L08 (looks) |
| `looks_hide` | L06 (looks) |
| `looks_nextbackdrop` | no §01 fixture |
| `looks_nextcostume` | L02 (looks) |
| `looks_say` | C01 (clones), C12 (clones), L09 (looks), L11 (looks) |
| `looks_sayforsecs` | L10 (looks), L11 (looks) |
| `looks_seteffectto` | L05 (looks), L06 (looks) |
| `looks_setsizeto` | L04 (looks) |
| `looks_show` | no §01 fixture |
| `looks_size` | no §01 fixture |
| `looks_switchbackdropto` | H09 (hats) |
| `looks_switchcostumeto` | H09 (hats), L01 (looks), L02 (looks), L03 (looks) |
| `looks_think` | L09 (looks) |
| `looks_thinkforsecs` | no §01 fixture |
| `motion_changexby` | F03 (frame), F06 (frame), F10 (frame), P05 (procedures), R1a (regressions), R1b (regressions), R1c (regressions) |
| `motion_changeyby` | no §01 fixture |
| `motion_direction` | no §01 fixture |
| `motion_glidesecstoxy` | M10 (motion), M11 (motion) |
| `motion_glideto` | no §01 fixture |
| `motion_goto` | M08 (motion) |
| `motion_gotoxy` | M07 (motion) |
| `motion_ifonedgebounce` | M12 (motion) |
| `motion_movesteps` | F05 (frame), F12 (frame), M01 (motion), M02 (motion), M12 (motion), M14 (motion) |
| `motion_pointindirection` | M03 (motion) |
| `motion_pointtowards` | M09 (motion) |
| `motion_setrotationstyle` | M14 (motion) |
| `motion_setx` | F03 (frame), M05 (motion), M06 (motion), M13 (motion) |
| `motion_sety` | M05 (motion) |
| `motion_turnleft` | no §01 fixture |
| `motion_turnright` | no §01 fixture |
| `motion_xposition` | M04 (motion), M05 (motion) |
| `motion_yposition` | M04 (motion), M05 (motion) |
| `operator_add` | O01 (operators), O04 (operators), O14 (operators) |
| `operator_and` | F16 (frame) |
| `operator_contains` | O12 (operators) |
| `operator_divide` | O01 (operators), O04 (operators) |
| `operator_equals` | C02 (clones), C07 (clones), C10 (clones), O03 (operators) |
| `operator_gt` | P04 (procedures) |
| `operator_join` | O09 (operators) |
| `operator_length` | O11 (operators) |
| `operator_letter_of` | O10 (operators) |
| `operator_lt` | O03 (operators) |
| `operator_mathop` | O13 (operators), O14 (operators) |
| `operator_mod` | O05 (operators) |
| `operator_multiply` | no §01 fixture |
| `operator_not` | O02 (operators) |
| `operator_or` | no §01 fixture |
| `operator_random` | O07 (operators), O08 (operators) |
| `operator_round` | O06 (operators) |
| `operator_subtract` | P04 (procedures) |
| `platformer_changespeed` | no §01 fixture |
| `platformer_onground` | no §01 fixture |
| `platformer_setgravity` | no §01 fixture |
| `platformer_setsolid` | no §01 fixture |
| `platformer_setspeed` | no §01 fixture |
| `platformer_speed` | no §01 fixture |
| `platformer_whenbump` | no §01 fixture |
| `sensing_answer` | S12 (sensing), S13 (sensing) |
| `sensing_askandwait` | C12 (clones), F10 (frame), F12 (frame), S12 (sensing) |
| `sensing_coloristouchingcolor` | S05 (sensing), S06 (sensing) |
| `sensing_current` | no §01 fixture |
| `sensing_dayssince2000` | no §01 fixture |
| `sensing_distanceto` | S07 (sensing) |
| `sensing_keypressed` | S10 (sensing) |
| `sensing_loudness` | no §01 fixture |
| `sensing_mousedown` | no §01 fixture |
| `sensing_mousex` | no §01 fixture |
| `sensing_mousey` | no §01 fixture |
| `sensing_of` | S08 (sensing) |
| `sensing_resettimer` | R3c (regressions), R3d (regressions) |
| `sensing_setdragmode` | no §01 fixture |
| `sensing_timer` | S09 (sensing) |
| `sensing_touchingcolor` | S04 (sensing), S06 (sensing) |
| `sensing_touchingobject` | L06 (looks), L07 (looks), L08 (looks), M13 (motion), S01 (sensing), S02 (sensing), S03 (sensing) |
| `sensing_username` | no §01 fixture |
| `sound_changeeffectby` | no §01 fixture |
| `sound_changevolumeby` | no §01 fixture |
| `sound_cleareffects` | no §01 fixture |
| `sound_play` | no §01 fixture |
| `sound_playuntildone` | no §01 fixture |
| `sound_seteffectto` | no §01 fixture |
| `sound_setvolumeto` | no §01 fixture |
| `sound_stopallsounds` | no §01 fixture |
| `sound_volume` | no §01 fixture |

## Browser check (port 5323, stopped afterwards)

Opened the Workshop with the dev hook `openDevWorkshop('brick_walker' / 'brick_hero')` at 1366x768. Verified, by screenshot or by reading state: palette without plugin blocks, inline calls and definition, drill into a definition and back, tidy of overlapping scripts and its saved result, Undo/Redo. Not verified: Make a Block dialog end to end (its code path only builds the same `extraState`; palette refresh is covered headlessly), keyboard Ctrl+Z, a Chromebook-size toolbar (the toolbar now has two more buttons; it fit at 1366 wide, with the wrapped status badges unchanged), `Stage` selection.

## Known gaps

- Hidden definitions still sit in the saved workspace at their old positions; Tidy (the toolbar button) still lays out everything including them.
- The definition prototype shows argument names as plain text `(speed)`, not draggable argument pills as in Scratch; dragging the pill into the body is done from the My Blocks palette's reporters.
