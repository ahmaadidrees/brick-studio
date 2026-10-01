# Code Lab Wave 2 — Code Editor Lane Report

**Lane:** `code-editor`  
**Branch:** `gemini/w2-code-editor`  
**Worker:** Code Editor Lane Worker  
**Port:** `5281` (`http://localhost:5281/2d/lab/next`)  

---

## 1. What Was Built

The `code-editor` lane delivers the full visual block-coding studio for Code Lab on the new core, replacing the Wave 1 stub with a responsive, kid-friendly Blockly 13.3.0 workspace designed for 1366 × 768 Chromebook screens without horizontal scroll.

All changes are strictly confined to the lane's ownership boundaries (`src/platformer/lab/studio/CodeEditor.tsx`, `src/platformer/lab/studio/code/**`, and `src/platformer/lab/core/editor/**`). No forbidden files (`store.ts`, `StudioApp.tsx`, `studio.css`, `pixels.ts`, `package.json`) were altered.

### Key Components & Modules

1. **`CodeEditor.tsx` (Main Studio Workspace)**:
   - Injects a single Blockly 13.3.0 workspace with Zelos renderer and `@blockly/continuous-toolbox`.
   - Dark theme styling via `CODE_DARK_THEME` (`#1d2029` canvas, `#14161c` toolbox, `#181b22` flyout) matching Brickgineers aesthetic.
   - Clean single-workspace lifecycle: when switching between bricks or the Stage, any pending debounced save is flushed immediately, the old workspace is disposed via `ws.dispose()`, and the container is cleanly remounted.
   - Debounced save (~300ms) with `store.setWorkspace(brickId, json)` that filters out UI-only events (`isUiEvent`, `FINISHED_LOADING`, `VIEWPORT_CHANGE`, `SELECTED`, `CLICK`, drag start).
   - Real-time thread glow during `mode === 'play'`: monitors `store.getState().runtime.threads()` without mutating runtime state, applying `block.setHighlighted(true)` to the active script and running statements of the selected brick, and clears highlights on return to Build.

2. **`context.ts` & `buildEditorContext` (`src/platformer/lab/studio/code/context.ts`)**:
   - `extractBroadcastMessages(workspaces)`: Recursively scans all brick workspaces for broadcast events (`event_whenbroadcastreceived`, `event_broadcast`, `event_broadcastandwait`), providing dynamic broadcast options across all workspaces.
   - `buildEditorContext(store)`: Aggregates current brick variables and lists with Stage global variables, brick names, costumes, sounds, backdrops, and `isStage` status.

3. **Stage-Specific Workspace Filtering**:
   - When the Stage (`STAGE_ID`) is selected, `createContinuousToolbox(context, { isStage: true })` omits the **Motion** category while keeping Looks, Sound, Events, Control, Sensing, Operators, Variables, and My Blocks.
   - Stage variables are always global.

4. **Kid Words Lists (`words.ts`)**:
   - In accordance with the "Kid text" rule (kids pick from curated lists outside class worlds), provides categorized words for:
     - Variables (`score`, `speed`, `health`, `coins`, `timer`, etc.)
     - Lists (`inventory`, `high scores`, `items`, `keys`, etc.)
     - Broadcast messages (`start game`, `game over`, `respawn`, `victory`, etc.)
     - Custom procedure labels (`jump`, `dash`, `flash`, `spin`, etc.)
     - Parameter names (`steps`, `speed`, `power`, etc.) and boolean conditions (`fast?`, `active?`, `ready?`, etc.)

5. **`VariableModal.tsx` ("Make a Variable" & "Make a List")**:
   - Kid-friendly dialog with large touch targets (≥40px), category filter pills, and word selection.
   - Scope selection: "For this brick only" (per-copy independent values) vs "For all bricks (shared)" (global on Stage).
   - "Show in Build" toggle: for brick variables, toggles per-copy adjustable knobs via `store.setVariableKnob(brickId, varId, showInBuild)`.
   - Integrated into both toolbar action buttons and Blockly toolbox button callbacks (`MAKE_A_VARIABLE`, `MAKE_A_LIST`).

6. **`ProcedureModal.tsx` ("Make a Block")**:
   - Scratch-spirited dialog for creating custom blocks with word-picked labels, number/text inputs, boolean condition inputs, and a live block preview.
   - Includes "Run without screen refresh" (warp) checkbox.
   - Appends definition blocks to the workspace and automatically registers caller blocks and parameter reporter blocks (`argument_reporter_string_number`, `argument_reporter_boolean`) under "My Blocks" in the continuous toolbox.

7. **`DiagnosticsList.tsx` (Kid-Friendly Diagnostics)**:
   - Translates technical compiler diagnostics (`state.diagnostics[brickId]`) into plain encouragement:
     - `block.disconnected`: *"Block isn't connected — Snap this block under a hat block like 'when ⚑ clicked' to make it run!"*
     - `block.no_type`: *"Unrecognized block — Try replacing it from the block menu."*
     - `workspace.invalid_json`: *"Could not load blocks — Something went wrong loading this workspace."*
   - Clicking a diagnostic card highlights and scrolls the workspace directly to the problematic block (`block.select()`, `scrollBoundsIntoView`).
   - Also sets visual warning icons directly on blocks in the Blockly workspace (`block.setWarningText`).

8. **`EditorToolbar.tsx`**:
   - Responsive header toolbar featuring:
     - Target badge (`🌍 Stage` or `🧱 [Brick Name]`)
     - Large action buttons (`+ Variable`, `+ List`, `+ Block`)
     - Workspace view helpers (`🧹 Tidy`, `🔍+`, `🔍−`, `🎯 Center`)
     - Build knobs count pill (`🎛️ N Build Knobs`)
     - Diagnostics alert badge (`⚠️ N Notices`)

---

## 2. Test Fixture Coverage Table

All 34 test files across the platformer lab suite (330 tests total) pass cleanly.

| Suite | File | Test Description | Status |
| :--- | :--- | :--- | :--- |
| **CE-WRD-01** | `editor.test.ts` | Curated non-empty lists of kid-friendly words for variables, lists, broadcasts, procedures | **PASSED** |
| **CE-WRD-02** | `editor.test.ts` | Categorized variables and lists with valid category IDs and words | **PASSED** |
| **CE-MSG-01** | `editor.test.ts` | Recursively extracts broadcast messages from nested workspace JSON | **PASSED** |
| **CE-MSG-02** | `editor.test.ts` | Aggregates broadcast messages across all workspaces in store | **PASSED** |
| **CE-CTX-01** | `editor.test.ts` | Builds EditorContext aggregating brick variables + stage globals and build knob flags | **PASSED** |
| **CE-CTX-02** | `editor.test.ts` | Accurately identifies Stage vs Brick in context (`isStage`) | **PASSED** |
| **CE-TBX-01** | `editor.test.ts` | Omits Motion category when isStage is true (8 categories vs 9) | **PASSED** |
| **CE-TBX-02** | `editor.test.ts` | Includes buttons for Make a Variable and Make a List in toolbox | **PASSED** |
| **CE-TBX-03** | `editor.test.ts` | Configures My Blocks with custom PROCEDURE callback and Make a Block button | **PASSED** |
| **CE-DIA-01** | `editor.test.ts` | Translates disconnected blocks into plain kid encouragement | **PASSED** |
| **CE-DIA-02** | `editor.test.ts` | Translates unrecognized blocks into plain words | **PASSED** |
| **CE-DIA-03** | `editor.test.ts` | Handles corrupted workspace error gracefully in kid words | **PASSED** |
| **CE-KNB-01** | `editor.test.ts` | Toggles per-copy knob via `store.setVariableKnob` | **PASSED** |
| **CE-STO-01** | `editor.test.ts` | Updates project workspace in store on `setWorkspace` | **PASSED** |
| **CE-STO-02** | `editor.test.ts` | Maintains store diagnostics record per brick | **PASSED** |

---

## 3. Browser Verification on Port 5281

Tested live at `http://localhost:5281/2d/lab/next` using MCP preview automation:

1. **Initial Mount**:
   - Blockly workspace rendered without errors (`hasBlockly: true`, `hasToolbar: true`).
   - Default selected target displayed as `Stage` with the `Global` badge.
   - Toolbox successfully displayed all 8 stage categories with Motion filtered out.
2. **Make a Variable Modal**:
   - Clicked `📊+ Variable` button in toolbar; modal opened with title "Make a Variable".
   - Category filter pills ("All Words", "Game & Score", "Motion & Physics", "Stats & State") correctly filtered words.
   - Selected `coins` from the word list; chip updated preview to `coins`.
   - Clicked "Create Variable"; modal closed, variable registered, and workspace updated.
3. **Make a Block Modal**:
   - Clicked `🧱+ Block` button; modal opened with live block preview `define jump`.
   - Clicked `+ Add an input (number or text)`; parameter added.
   - Toggled "Run without screen refresh" (warp); preview updated to `define jump (steps) ⚡ warp`.
   - Clicked "Create Block"; modal closed and `procedures_definition` block was placed on the workspace canvas.
4. **Workspace View Controls**:
   - Verified `🧹 Tidy`, `🔍+` (zoom in), `🔍−` (zoom out), and `🎯 Center` buttons operate smoothly without throwing.
5. **Chromebook 1366 × 768 Layout**:
   - All interactive controls have accessible names and ≥40px touch targets.
   - Studio layout conforms to dark theme and maintains vertical proportions without horizontal overflow.

---

## 4. Verification Commands

```bash
# 1. Type check
npx tsc --noEmit -p tsconfig.app.json

# 2. Run all platformer lab tests
npx vitest run src/platformer/lab

# 3. Check browser on lane port
npm run dev -- --port 5281 --strictPort
```
