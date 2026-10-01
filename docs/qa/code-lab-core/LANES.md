# Code Lab core — wave 1 lanes

Build step 2 of [the brick model spec](../../CODE-LAB-BRICK-MODEL.md): a new block runtime that behaves like Scratch, headless and fully tested, in `src/platformer/lab/core/`. The existing lab (`src/platformer/lab/*` outside `core/`) keeps working untouched; wiring the new core into the UI is wave 2.

Integration branch: `claude/code-lab-core`. Each lane works on its own branch and worktree, forked from the contracts commit.

## Read first (every lane)

1. [`docs/CODE-LAB-BRICK-MODEL.md`](../../CODE-LAB-BRICK-MODEL.md) — the product model and the six decisions.
2. [`src/platformer/lab/core/contracts.ts`](../../../src/platformer/lab/core/contracts.ts) — the shared types. Build against them exactly.
3. [`research/code-lab/01-scratch-runtime-semantics.md`](../../../research/code-lab/01-scratch-runtime-semantics.md) — the behavior fixtures for your lane (IDs listed below). These are the acceptance tests.
4. Already written and shared: `detmath.ts` (deterministic trig/exp/log), `rng.ts` (seeded RNG), `geometry.ts` (costume ↔ world transforms, bounds), `testkit.ts` (fake runtime, `callPrimitive` for yielding blocks).

## Rules (every lane)

- **Own only your files.** Create and edit only the files your lane lists. Never edit `contracts.ts`, `detmath.ts`, `rng.ts`, `geometry.ts`, `testkit.ts`, `package.json`, `package-lock.json`, or anything outside `src/platformer/lab/core/` and your report. If you need a contract change, do not make it — write the request in your report and work around it locally.
- **No new dependencies.**
- **Deterministic.** In core code never call `Math.sin/cos/tan/asin/acos/atan/atan2/exp/log/log10/pow/random`, `Date`, `performance`, or timers. Use `detmath.ts`, `rng.ts` (`runtime.random()`), and `runtime.nowMs()`. `Math.sqrt/floor/ceil/round/abs/min/max/trunc/sign` are fine.
- **Clean room.** You may read Scratch's source (scratch-vm / scratch-editor, AGPL) to understand behavior. Never copy or closely paraphrase its code. Write your own implementation from the fixture descriptions.
- **Scratch names, Scratch behavior.** Primitives are keyed by Scratch opcode names (`motion_movesteps`, `operator_add`, ...). A primitive with a Scratch name must match the fixture behavior. If something cannot match, say so in your report rather than shipping a near-miss silently.
- **Units.** y up, 1 step = 1 art pixel, `(0, 0)` = bottom-left of the level, level bounds = `world.bounds` (the "stage"). Direction 90 = right.
- **Tests.** Vitest, colocated `*.test.ts` next to your source. Name each fixture test with its ID, e.g. `it('M05 · ordinary fencing', ...)`. Use plain values and `testkit.ts`; do not depend on another lane's unfinished files.
- **Done means:** `npx vitest run src/platformer/lab/core` passes and `npx tsc --noEmit -p tsconfig.app.json` shows no errors in your files.
- **Commit** on your lane branch (several commits are fine). End each message with `Co-Authored-By: Grok <noreply@x.ai>`. **Do not push. Do not merge. Do not touch other worktrees or branches.**
- **Report.** Write `docs/qa/code-lab-core/reports/<lane>.md`: what you built, a fixture table (ID → test name, or "not covered" + why), every deliberate difference from Scratch, contract change requests, and open questions. Commit it.

## Lanes

### values — casting, operators, variables, lists
Files: `values.ts`, `operators.ts`, `data.ts` (+ tests).
- `values.ts`: Scratch casting and comparison (`toNumber`, `toBoolean`, `toString`, `compare`, `isWhiteSpace`, `isInt`, list index parsing with `last`/`random`/`all`). Plain exports, used by every other lane.
- `operators.ts`: `operatorPrimitives: PrimitiveTable` for every `operator_*` opcode (add, subtract, multiply, divide, random, gt, lt, equals, and, or, not, join, letter_of, length, contains, mod, round, mathop). `mathop` uses `detmath.ts` and Scratch's rounding rules for trig. `random` uses `runtime.random()` with Scratch's integer-vs-decimal rule.
- `data.ts`: `dataPrimitives` for `data_variable`, `data_setvariableto`, `data_changevariableby`, `data_listcontents`, `data_addtolist`, `data_deleteoflist`, `data_deletealloflist`, `data_insertatlist`, `data_replaceitemoflist`, `data_itemoflist`, `data_itemnumoflist`, `data_lengthoflist`, `data_listcontainsitem`. Variable/list fields hold the id (`fields.VARIABLE`, `fields.LIST`); look up on the target first, then the stage (globals). Show/hide variable blocks are no-ops for now. Respect list length limit from the fixtures.
- Fixtures: §1.7 and §1.8 (all O* and D* IDs).

### scheduler — threads, control, events, custom blocks
Files: `runtime.ts`, `runtime.test.ts`, optionally `events.ts`/`control.ts` (+ tests).
- `class Runtime implements RuntimeApi`, constructed with `(world: World, primitives: PrimitiveTable)`. `step()` runs one tick. Also `pressKey(key)`, `releaseKey(key)`, `clickTarget(target)`, `greenFlag()`, `stop()`, and `threads()` for inspection.
- Evaluates `Expr` trees: literals, `param` from the current procedure frame, reporters/booleans through the primitive table. Each executed block costs one op.
- Owns control flow itself: `control_if`, `control_if_else`, `control_repeat`, `control_forever`, `control_repeat_until`, `control_while`, `control_wait`, `control_wait_until`, `control_stop` (all / this script / other scripts in sprite), `procedures_call` (+ warp), `event_broadcast`, `event_broadcastandwait`. Unknown opcodes in the table are called as primitives with YIELD support (re-run same block, `frame` kept).
- Scheduling: Scratch's sweep/redraw model (F03–F07) with an op-count budget per tick (`DEFAULT_TICK_OP_BUDGET`) instead of wall-clock, warp capped by `WARP_OP_LIMIT` (decision 4). Thread order, hat order, retrigger policy per hat (H02–H06), green flag behavior (H01), edge-triggered `event_whengreaterthan` with `edgeHatState`.
- Procedures: parameter scope, recursion, `stop this script` inside a define returns to the caller (P06–P07).
- Fixtures: §1.1, §1.2, §1.9 (all F*, H*, P* IDs). Write tests with tiny programs built from the IR types directly, plus a few fake primitives (e.g. a `test_log` primitive that appends to an array).

### sprites — motion, looks, sound
Files: `motion.ts`, `looks.ts`, `sound.ts` (+ tests).
- `motionPrimitives` for every `motion_*` opcode: move steps, turn right/left, point in direction, point towards (mouse/sprite), go to x/y, go to (random/mouse/sprite), glide secs to x/y, glide to (random/mouse/sprite), change/set x/y, if on edge bounce, set rotation style, x position, y position, direction. Fencing to `world.bounds` with Scratch's partial-costume rule using `geometry.ts` (M05–M06). Random position = inside the level bounds. Use `runtime.findOriginal` for sprite menus. Call `runtime.requestRedraw()` when a visible target changes.
- `looksPrimitives` for `looks_*`: say/think (timed versions wait), switch/next costume, switch/next backdrop (+ emit backdrop note and start `event_whenbackdropswitchesto` hats), change/set size, change/set/clear effects, show/hide, go to front/back, go forward/backward layers (reorder `world.targets`), costume number/name, backdrop number/name, size.
- `soundPrimitives`: play sound (+ until done, waits `durationMs`), stop all sounds, change/set pitch/pan effect, clear effects, change/set volume, volume. Emit `RuntimeNote`s; no audio.
- Fixtures: §1.4 and §1.5 (all M* and L* IDs).

### clones-sensing — clones, sensing, pixel touching
Files: `clones.ts`, `sensing.ts`, `touching.ts` (+ tests).
- `clones.ts`: `makeClone(world, source): Target` (copies exactly what C01 lists, local lists shallow-copied, C11), `clonePrimitives` for `control_create_clone_of` (`_myself_` or brick name; source = the named brick's original via `runtime.findOriginal`; if none exists, start from that brick's defaults at the level origin — note this in your report), `control_delete_this_clone`. Uses `runtime.addClone/removeClone`, respects `CLONE_LIMIT`.
- `touching.ts`: pixel-accurate touching between two targets and against the level edge, using costume masks (`Costume.mask`; fall back to the opaque rectangle) and `geometry.ts`. Sample at world integer step centers inside the bounds overlap. Ghost effect does not stop touching; hidden does (fact 9). Broad phase by bounds first.
- `sensingPrimitives`: touching (sprite / `_edge_` / `_mouse_`), distance to, key pressed, mouse down/x/y, timer, reset timer, `of` (x position, y position, direction, costume #/name, size, volume, local variables; stage backdrop and globals), current (year/month/... read from a host-provided fixed clock — return 0 if none; document), username (''), ask and wait / answer (emit `ask` note; wait until `world.answer` is set by host — define the handshake in your report), loudness (0). Touching color: not in this wave; add the opcodes as returning false with a report note.
- Fixtures: §1.3 and §1.6 (all C* and S* IDs).

### editor — blocks, toolbox, compiler
Files: everything under `src/platformer/lab/core/editor/` (+ tests).
- Blockly 13.3.0 JSON block definitions for every opcode the other lanes implement, written by us, worded like Scratch's blocks, Zelos-friendly, Scratch category colors. Hat blocks for the `HatOpcode` list. Dynamic menus (variables, lists, messages, bricks, costumes, sounds, backdrops, keys) read from a `EditorContext` interface you define (the UI provides it later).
- Toolbox: continuous-category toolbox definition for `@blockly/continuous-toolbox` (Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables, My Blocks). Custom blocks via `@blockly/block-shareable-procedures`. Both plugins are already installed and pinned.
- `compile.ts`: Blockly workspace JSON (`Blockly.serialization.workspaces.save` output) → `BrickProgram` IR from `contracts.ts`. Shadow/literal handling, nested reporters, C-block branches, procedures (definition, call, argument reporters, warp), variable/list ids. Unknown or disconnected blocks are reported as diagnostics, never thrown.
- Tests: compile fixtures as JSON (hand-written workspace JSON → expected IR), one per category plus procedures and edge cases. Headless only: do not mount a Blockly workspace in tests unless jsdom handles it cleanly.
- Fixtures: none from §01 directly; read §03 (`research/code-lab/03-blockly-editor.md`) for Blockly 13 pitfalls.

### project — level design, Play lifecycle, save format
Files: `project.ts`, `save.ts` (+ tests).
- `project.ts`: `instantiate(design: LevelDesign): World` — stage target from the stage brick (global variables/lists from its declarations), one non-clone target per painted copy in order (knob values override showInBuild variable defaults, everything else from brick defaults), RNG seeded from `design.seed`, bounds from the design. Must deep-copy so playing never mutates the design (decision 1: every Play starts from the saved design). Also `validateDesign(design)` → list of problems (unknown brick ids, duplicate ids, bad costume indices, unsafe names).
- `save.ts`: the versioned envelope from the spec ("Save format"): `schemaVersion`, `engineSemanticsVersion`, `editorVersion`, `pluginVersions`, design payload, per-brick Blockly workspace JSON, compiled IR. `serialize`, `parse` (untrusted input: size caps, type checks, safe identifiers, never `eval`), a migration registry keyed by schema version that keeps the original payload, and a golden-corpus test pattern (a couple of saved fixtures under `core/__fixtures__/` that must load and re-serialize identically).
- Fixtures: H01 (green flag does not reset — Play does), C11/D02 (local state per copy).
