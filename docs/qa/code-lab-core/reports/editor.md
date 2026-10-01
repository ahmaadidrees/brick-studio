# Code Lab Core Wave 1 — Editor Lane Report

**Lane:** `editor`  
**Branch:** `grok/core-editor`  
**Worker:** Editor Lane Worker  

---

## 1. What Was Built

The `editor` lane provides the authoring foundation for Code Lab, connecting Blockly 13.3.0 block authoring to the deterministic `BrickProgram` IR defined in `contracts.ts`.

All artifacts are isolated under `src/platformer/lab/core/editor/`:

1. **`context.ts` (Dynamic Editor Context)**:
   - Defined `EditorContext` interface allowing the host UI to supply dynamic dropdown menus for:
     - Variables (`getVariables()`)
     - Lists (`getLists()`)
     - Broadcast messages (`getMessages()`)
     - Other bricks / target sprites (`getBricks()`)
     - Costumes (`getCostumes()`)
     - Sounds (`getSounds()`)
     - Backdrops (`getBackdrops()`)
     - Key options (`getKeys()`)
   - Standard fallback defaults (e.g. `DEFAULT_KEYS`, `DEFAULT_GRAPHIC_EFFECTS`, `DEFAULT_SOUND_EFFECTS`, `DEFAULT_MATH_OPERATORS`, `DEFAULT_CURRENT_MENU`, `DEFAULT_SENSING_OF_PROPERTIES`).
   - Dynamic option resolver functions (`getVariableOptions`, `getListOptions`, `getMessageOptions`, `getTargetOptions`, etc.) and context management via `setEditorContext`.

2. **`definitions.ts` (Blockly 13.3.0 JSON Block Definitions)**:
   - Created full block definitions for all opcodes implemented across the other core lanes (Motion, Looks, Sound, Events, Control, Sensing, Operators, Variables, Lists, Procedures).
   - All 8 `HatOpcode`s (`event_whenflagclicked`, `event_whenkeypressed`, `event_whenthisspriteclicked`, `event_whenstageclicked`, `event_whenbroadcastreceived`, `event_whenbackdropswitchesto`, `event_whengreaterthan`, `control_start_as_clone`) configured with Zelos-compatible hat styling (`nextStatement: null`, no `previousStatement`, `hat: 'cap'`).
   - Standard Scratch 3 category hex colors configured via `CATEGORY_COLORS` (`motion: #4C97FF`, `looks: #9966FF`, `sound: #CF63CF`, `events: #FFBF00`, `control: #FFAB19`, `sensing: #4CBFE6`, `operators: #59C059`, `variables: #FF8C1A`, `lists: #FF661A`, `procedures: #FF6680`).
   - `registerEditorBlocks(context?)` for clean idempotent registration into `Blockly.Blocks`.

3. **`toolbox.ts` (Continuous-Category Toolbox Definition)**:
   - Specification compliant with `@blockly/continuous-toolbox` covering all 9 Scratch categories in standard order.
   - Comprehensive input shadow blocks (`math_number`, `text`, default values).
   - "My Blocks" category configured with `custom: 'PROCEDURE'` for `@blockly/block-shareable-procedures` integration alongside "Make a Block" button callback.
   - `registerToolboxPlugins()` safely initialises `@blockly/continuous-toolbox` and `@blockly/block-shareable-procedures`.

4. **`compile.ts` (Headless Workspace JSON -> BrickProgram IR Compiler)**:
   - Transforms `Blockly.serialization.workspaces.save` JSON into `BrickProgram` (`scripts`, `procedures`, `variables`, `lists`).
   - Resolves connected blocks vs shadow literals (`math_number`, `text`, `colour_picker` -> `{ kind: 'lit', value }`).
   - Resolves reporters and boolean blocks (`{ kind: 'block', opcode, inputs, fields, id }`).
   - Resolves custom block parameter reporters (`argument_reporter_string_number`, `argument_reporter_boolean` -> `{ kind: 'param', name, boolean }`).
   - Maps C-blocks (`SUBSTACK` -> `branches[0]`, `SUBSTACK2` -> `branches[1]`).
   - Supports both Scratch-native procedure definitions (`procedures_definition` / `procedures_prototype`) and Blockly Shareable Procedures (`procedures_defnoreturn` / `procedures_callnoreturn` with workspace-level procedure models).
   - Extracts variable/list definitions from workspace variables and referenced block fields.
   - Collects diagnostic warnings for disconnected blocks, malformed structures, or unrecognized opcodes without throwing.

5. **`index.ts`**:
   - Re-exports all public types and functions.

---

## 2. Test Fixture Coverage Table

As noted in `LANES.md`, §01 runtime semantics fixtures test runtime VM execution (handled by values, scheduler, sprites, and clones-sensing lanes). The `editor` lane validates compilation of hand-written workspace serialization JSON to expected `BrickProgram` IR across all categories and edge cases in headless mode.

| Test ID / Suite | File | Test Description | Status |
| :--- | :--- | :--- | :--- |
| **ED-CTX-01** | `context.test.ts` | Default fallback menus when context is empty or default | **PASSED** |
| **ED-CTX-02** | `context.test.ts` | Reflects custom context entries across all dynamic menus | **PASSED** |
| **ED-CTX-03** | `context.test.ts` | Manages active context via `setEditorContext` and restore cleanup | **PASSED** |
| **ED-DEF-01** | `definitions.test.ts` | Covers every `HatOpcode` in `contracts.ts` with `isHatOpcode` | **PASSED** |
| **ED-DEF-02** | `definitions.test.ts` | Block definitions for all 9 categories with exact Scratch category colors | **PASSED** |
| **ED-DEF-03** | `definitions.test.ts` | Registers all definitions into `Blockly.Blocks` without error | **PASSED** |
| **ED-DEF-04** | `definitions.test.ts` | Re-registers cleanly when called repeatedly with updated context | **PASSED** |
| **ED-TBX-01** | `toolbox.test.ts` | Contains exactly the 9 Scratch categories in order with matching colors | **PASSED** |
| **ED-TBX-02** | `toolbox.test.ts` | Configures shadow blocks for inputs across toolboxes | **PASSED** |
| **ED-TBX-03** | `toolbox.test.ts` | Configures custom procedure category for My Blocks | **PASSED** |
| **ED-TBX-04** | `toolbox.test.ts` | Registers continuous toolbox and procedure serializer plugins idempotently | **PASSED** |
| **ED-CMP-01** | `compile.test.ts` | Compiles Motion blocks, numeric shadow literals, and fields | **PASSED** |
| **ED-CMP-02** | `compile.test.ts` | Compiles Looks blocks, text shadows, and graphic effect fields | **PASSED** |
| **ED-CMP-03** | `compile.test.ts` | Compiles Sound blocks and fields | **PASSED** |
| **ED-CMP-04** | `compile.test.ts` | Compiles event hats with inputs & fields, and broadcast blocks | **PASSED** |
| **ED-CMP-05** | `compile.test.ts` | Compiles C-blocks (`repeat`, `if`, `if_else`, `forever`) into statement `branches` | **PASSED** |
| **ED-CMP-06** | `compile.test.ts` | Compiles sensing reporters and ask/answer statement sequences | **PASSED** |
| **ED-CMP-07** | `compile.test.ts` | Compiles nested arithmetic and logical operators into nested `Expr` trees | **PASSED** |
| **ED-CMP-08** | `compile.test.ts` | Extracts variable/list declarations and compiles variable statements | **PASSED** |
| **ED-CMP-09** | `compile.test.ts` | Compiles Scratch-style `procedures_definition` with argument reporters and calls | **PASSED** |
| **ED-CMP-10** | `compile.test.ts` | Compiles Shareable Procedures plugin serialization into `Procedure` IR | **PASSED** |
| **ED-CMP-11** | `compile.test.ts` | Reports disconnected top-level blocks as diagnostics without throwing | **PASSED** |
| **ED-CMP-12** | `compile.test.ts` | Handles corrupted or non-object workspace input gracefully | **PASSED** |
| **ED-CMP-13** | `compile.test.ts` | Handles top blocks with missing type without throwing | **PASSED** |

Total: **24 passing tests** across 4 test suites under `src/platformer/lab/core/editor/` (alongside existing core math tests, 29/29 total tests pass).

---

## 3. Deliberate Differences from Scratch

1. **Headless IR Compilation**:
   Scratch's VM loads projects from an internal `sb3` JSON format (with `inputs`, `fields`, `mutation`). Our compiler translates directly from standard Blockly workspace serialization JSON (`Blockly.serialization.workspaces.save` output) into the `BrickProgram` IR. This decouples the compiler from live SVG/DOM instances and enables instant compilation in Node and headless workers.

2. **Disconnected Block Handling**:
   In Scratch, disconnected blocks remain on the workspace canvas and may be clicked to run interactively, but they never run from green flag or event broadcasts. Our compiler treats disconnected non-hat, non-procedure top blocks by skipping them in the compiled script output while generating structured diagnostic warnings (`block.disconnected`) so that authors receive clear feedback.

3. **Dual Custom Block Serialization**:
   We support both Scratch 3 `procedures_definition` / `procedures_prototype` / `procedures_call` formats and Blockly's `@blockly/block-shareable-procedures` format (`procedures_defnoreturn` / `procedures_callnoreturn` with workspace-level procedure maps).

---

## 4. Contract Change Requests

None. The IR contracts (`BrickProgram`, `Script`, `Procedure`, `Stmt`, `Expr`, `VariableDecl`, `ListDecl`, `HatOpcode`) in `src/platformer/lab/core/contracts.ts` were sufficient and expressive for all opcodes, hats, and procedures.

---

## 5. Open Questions for Wave 2

1. **Reactive Dynamic Dropdowns in UI**:
   In Wave 2 UI wiring, should dynamic dropdown options update on workspace change events (e.g. when a new brick is created or a costume added), or should Blockly's flyout recreate them on open?
2. **Procedure Editor Modal vs Inline Mutator**:
   Blockly standard shareable procedures use a mutator bubble by default, whereas Scratch uses a modal dialog ("Make a Block") to configure block name, inputs, and the "Run without screen refresh" warp flag. The UI layer in Wave 2 can wire the "Make a Block" button callback from `CONTINUOUS_TOOLBOX` directly to the custom block authoring modal.
