# Wave 2 Persistence Lane Report: Save, Load, Starter Level

## 1. Overview

The **persistence** lane for Code Lab Wave 2 provides end-to-end level serialization, robust browser storage with autosave, corruption recovery, file export/import, and an out-of-the-box starter level demonstrating the step 2 "+ New brick" experience without hero or physics dependencies.

### Owned Files & Responsibilities
- `src/platformer/lab/studio/starter.ts`: Factory for the starter level featuring 3 custom bricks + stage with pixel-art costumes and real Blockly workspace JSON.
- `src/platformer/lab/studio/storage.ts`: Persistence bridge implementing `loadProject()` and `watchAndSave(store)`, quota defense, and recovery.
- `src/platformer/lab/studio/persist/notice.ts`: Reactive kid-friendly notification store for storage events (corrupt recovery, quota full, import errors).
- `src/platformer/lab/studio/persist/projectIo.ts`: Core serialization, file export download triggers, and safe file parsing/importing.
- `src/platformer/lab/studio/persist/ProjectMenu.tsx` & `projectMenu.css`: Kid-first UI component with accessible >= 40px touch targets for Save File, Open File, Start Over, and storage alert notifications.
- `src/platformer/lab/studio/starter.test.ts`: Verification of starter level design validation and clean workspace compilation.
- `src/platformer/lab/studio/storage.test.ts`: Storage roundtrips, corrupt save backup, schema versioning, quota handling, debouncing, and pagehide flush.
- `src/platformer/lab/studio/persist/projectIo.test.ts`: JSON / File serialization roundtrips, mask preservation, and rejection of bad input.
- `src/platformer/lab/studio/persist/ProjectMenu.test.tsx`: User interface actions, accessibility, import file events, reset confirmations, and notice dismissal.

---

## 2. Starter Level Design (Step 2 Demo)

The starter project created by `createStarterProject()` satisfies all step 2 requirements (no Hero, no physics):

1. **Pixel-Art Costumes** (`imageFromRows` + `costumeFromImage`):
   - **Spinner** (`brick_spinner`): 16x16 vibrant 8-pointed yellow/orange star with white glints.
   - **Bouncer** (`brick_bouncer`): 16x16 bouncy slime with expressive eyes.
   - **Blinker** (`brick_blinker`): Two 16x16 costumes (`Blue` sparkle and `Purple` glow) for costume switching.
   - **Stage** (`stage`): 32x16 dusk sky with stars backdrop (`Sunset`).

2. **Open-Block Blockly Workspaces**:
   - Each brick carries a real Blockly workspace JSON in `project.workspaces[brickId]`.
   - **Spinner**:
     - Hat: `event_whenflagclicked`
     - Loop: `control_forever`
     - Action: `motion_turnright` with 15 degrees.
   - **Bouncer**:
     - Variable: Declares `speed` with `value: 8` and `showInBuild: true`.
     - Hat: `event_whenflagclicked`
     - Loop: `control_forever`
     - Action: `motion_movesteps` reading `data_variable` (`speed`), followed by `motion_ifonedgebounce`.
   - **Blinker**:
     - Hat: `event_whenthisspriteclicked`
     - Action: `looks_nextcostume` followed by `looks_sayforsecs` ("Sparkle!", 1 second).

3. **Knob Demonstrations**:
   - The Bouncer brick is painted **twice** with different starting knob overrides:
     - `copy_bouncer_slow`: painted at (320, 200) with `knobs: { speed: 5 }`.
     - `copy_bouncer_fast`: painted at (640, 160) with `knobs: { speed: 12 }`.
   - When instantiated, the runtime world verifies that each copy receives its own independent local `speed` variable.

4. **Validation & Compilation Guarantee**:
   - `validateDesign(starter.design)` returns **0 problems**.
   - `compileWorkspace(ws)` on all starter workspaces compiles with **0 errors**.

---

## 3. Storage, Autosave & Resilience

### Save Format & Workspaces
- Projects are serialized through `core/save.ts` using `SavedProjectEnvelope`.
- The Wave 1 save envelope already natively supports `workspaces?: Record<string, unknown>`. No envelope extension or fork was required.
- Masks are encoded to base64 strings on save and restored to `Uint8Array` on load.

### Load Logic (`loadProject`)
1. Reads `code-lab.project.v1` from `localStorage`.
2. If empty or null: returns `createStarterProject()`.
3. If populated: parses via `parse()`.
4. If valid: returns `{ design: save.design, workspaces: save.workspaces ?? {} }`.
5. If invalid or corrupt:
   - Preserves raw string into `code-lab.project.backup.v1`.
   - Displays a kid-friendly message: *"We had trouble opening your previous save, so we kept a safe backup copy and started a fresh playground for you!"*
   - Falls back safely to `createStarterProject()`.
6. If newer schema version (`schemaVersion > CURRENT_SCHEMA_VERSION`):
   - Preserves raw string into backup key.
   - Displays message: *"This project was saved with a newer version of Code Lab. We kept a safe copy and started a fresh playground for you!"*
   - Falls back safely to `createStarterProject()`.

### Autosave Logic (`watchAndSave`)
- Subscribes to `store.subscribe`.
- Debounces writes on `store.getState().revision` change (default: 500ms).
- Flushes immediately when `pagehide` or `beforeunload` fires.
- Flushes immediately when the unsubscribe callback is invoked.
- **Quota Error Defense**: Wraps storage writes in `try/catch` and checks `isQuotaError`. On quota exhaustion (`QuotaExceededError` / code 22), sets a friendly alert notifying the kid without throwing or crashing the in-memory studio session.

---

## 4. Export / Import & ProjectMenu UI

### Functions (`projectIo.ts`)
- `exportProjectJson(project)`: Deterministically formats the envelope.
- `exportProjectFile(project, filename?)`: Triggers an automatic `.json` browser download named after the level.
- `importProjectJson(text)`: Parses and validates JSON, returning a typed result with error diagnostics.
- `importProjectFile(file)`: Supports browser `file.text()`, `FileReader`, and `Response(file).text()` fallbacks.

### UI Component (`ProjectMenu.tsx`)
- Kid-first design:
  - Button targets >= 40px.
  - Plain, intuitive action names: **Save File**, **Open File**, **Reset**.
  - Accessible `aria-label`s and `role` attributes.
  - Dark panel styling matching the studio theme with CSS transitions.
- Confirmation dialog on Reset to prevent accidental data loss.
- Integrated `useStorageNotice()` banner displaying notifications and dismiss button.

---

## 5. Integrator Request

For the shell/integrator lane:
- Mount `<ProjectMenu store={store} />` from `./persist/ProjectMenu` in the studio top bar / header.
- No changes required to `store.ts` or `contracts.ts`.

---

## 6. Verification & Test Results

- **TypeScript Compilation**:
  `npx tsc --noEmit -p tsconfig.app.json` exited with **0 errors**.
- **Vitest Test Suite**:
  `npx vitest run src/platformer/lab` passed **37 test files, 343 tests** with 0 failures:
  - `src/platformer/lab/studio/starter.test.ts`: 5 passed.
  - `src/platformer/lab/studio/storage.test.ts`: 11 passed.
  - `src/platformer/lab/studio/persist/projectIo.test.ts`: 5 passed.
  - `src/platformer/lab/studio/persist/ProjectMenu.test.tsx`: 6 passed.
  - All existing core and lab test suites: 316 passed.
- **Browser Verification**:
  - Dev server launched on port 5284 (`npm run dev -- --port 5284 --strictPort`).
  - Verified preview running on `http://localhost:5284/2d/lab/next`.
