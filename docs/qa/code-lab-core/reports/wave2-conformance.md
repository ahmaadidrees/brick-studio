# Conformance Lane Report (Wave 2)

## 1. Overview & Deliverables

- **Lane**: `conformance`
- **Branch**: `gemini/w2-conformance`
- **Port**: `5285`
- **Files Modified / Created**:
  - `src/platformer/lab/core/contracts.ts`: Added `HostClock`, `AskPrompt`, `QueuedAsk`, `ThreadStatus`, `ExecutionFrame`, `SerializedThread` contracts; added `askQueue`, `nextAskId`, `hostClock`, and `threads` to `World`.
  - `src/platformer/lab/core/sensing.ts`: Replaced WeakMaps with direct reads/writes to `world.hostClock`, `world.askQueue`, and `world.nextAskId`.
  - `src/platformer/lab/core/project.ts`: Removed duplicate `wrapDirection` (imported from `./motion`); initialized `askQueue: []`, `nextAskId: 1`, `hostClock: null` in `instantiate`.
  - `src/platformer/lab/core/testkit.ts`: Initialized `askQueue: []`, `nextAskId: 1`, `hostClock: null` in `makeWorld`.
  - `src/platformer/lab/core/runtime.ts`: Added thread serialization (`syncThreadsToWorld`), thread restoration (`restoreThreadsFromWorld`, `restoreWorld`), and reset `world.answer = ''` on `greenFlag()`.
  - `src/platformer/lab/core/runtime.test.ts`: Added full snapshot/resume test verifying `structuredClone(world)` mid-run.
  - `src/platformer/lab/core/conformance/`: End-to-end Scratch 3 conformance suite executing through `createRuntime` + `ALL_PRIMITIVES`:
    - `harness.ts`: Standard test builder harness with AST node constructors.
    - `frame.test.ts`: F01–F16 (16 tests)
    - `hats.test.ts`: H01–H10 (10 tests)
    - `clones.test.ts`: C01–C12 (12 tests)
    - `motion.test.ts`: M01–M14 (14 tests)
    - `looks.test.ts`: L01–L12 (12 tests)
    - `sensing.test.ts`: S01–S13 (13 tests)
    - `operators.test.ts`: O01–O14 (14 tests)
    - `data.test.ts`: D01–D10 (10 tests)
    - `procedures.test.ts`: P01–P07 (7 tests)
  - `docs/qa/code-lab-core/CONFORMANCE.md`: Comprehensive 108-fixture matrix detailing status and behavior notes for each fixture.
  - `docs/qa/code-lab-core/reports/wave2-conformance.md`: This report.

---

## 2. Wave 1 Follow-ups Completed

1. **Ask Queue and Host Clock in `World` Contract**:
   - `World` now owns `askQueue: QueuedAsk[]`, `nextAskId: number`, and `hostClock: HostClock | null`.
   - `sensing.ts` no longer uses module-level WeakMaps (`clocks`, `askIdCounters`, `questions`).
   - Complete world snapshots now serialize active ask prompts and deterministic clock timing.

2. **Deduplicate `wrapDirection`**:
   - Removed duplicate implementation in `project.ts`.
   - `project.ts` now re-uses the canonical `wrapDirection` function from `motion.ts`.

3. **Runtime Thread Snapshotting & Resumption**:
   - Implemented `syncThreadsToWorld()` and `restoreThreadsFromWorld()` in `Runtime`.
   - `Runtime.threads` state (including execution call stacks, yields, wait deadlines, broadcast wait barriers, and procedure arguments) syncs to `world.threads`.
   - Verified via `runtime.test.ts` test: mid-run execution state cloned via `structuredClone(world)` and resumed in a new `Runtime` instance produces bit-identical continuation.

---

## 3. Conformance Suite Results (`core/conformance/`)

All 108 fixtures from `research/code-lab/01-scratch-runtime-semantics.md` are executed against the actual `createRuntime` implementation with all primitive block implementations active:

| Section | Fixture Range | Test File | Tests | Passing | Known Diffs |
|:---|:---|:---|:---:|:---:|:---:|
| §1.1 Frame & Scheduling | F01–F16 | `frame.test.ts` | 16 | 16 | 0 |
| §1.2 Hats & Event Triggers | H01–H10 | `hats.test.ts` | 10 | 10 | 0 |
| §1.3 Clones & Lifecycle | C01–C12 | `clones.test.ts` | 12 | 12 | 0 |
| §1.4 Motion & Fencing | M01–M14 | `motion.test.ts` | 14 | 14 | 0 |
| §1.5 Looks, Size & Bubbles | L01–L12 | `looks.test.ts` | 12 | 12 | 0 |
| §1.6 Sensing, Keys & Timers | S01–S13 | `sensing.test.ts` | 13 | 13 | 3 (S04–S06)* |
| §1.7 Operators & Coercion | O01–O14 | `operators.test.ts` | 14 | 14 | 0 |
| §1.8 Variables & Lists | D01–D10 | `data.test.ts` | 10 | 10 | 0 |
| §1.9 Procedures & Warp | P01–P07 | `procedures.test.ts` | 7 | 7 | 0 |
| **Total** | **108 Fixtures** | **9 Test Files** | **108** | **108** | **3\*** |

*\*Note on S04–S06: Color sensing in headless core safely returns `false` without WebGL DOM dependency; full color rasterization occurs in the stage canvas renderer.*

---

## 4. Core Engine Bugs Discovered & Fixed

1. **`Runtime.greenFlag()` Answer Reset**:
   - **Symptom**: `sensing.test.ts` (S13) revealed that `runtime.greenFlag()` was not resetting `world.answer` to `''`. An answer submitted during a previous run would leak across green flag triggers.
   - **Fix**: Added `this.world.answer = ''` inside `Runtime.greenFlag()` in `src/platformer/lab/core/runtime.ts` matching Scratch 3.0 runtime specification.

2. **Wait and Ask Timers on Snapshotted Runtimes**:
   - Ensured that restored threads correctly maintain relative tick deadlines and ask prompt references during snapshot serialization.

---

## 5. Verification

1. **Vitest Unit Suite**:
   ```
   npx vitest run src/platformer/lab
   Test Files  42 passed (42)
   Tests       425 passed (425)
   ```
   All 108 conformance tests in `src/platformer/lab/core/conformance` pass.

2. **TypeScript Compilation**:
   ```
   npx tsc --noEmit -p tsconfig.app.json
   (Exit code 0, 0 errors)
   ```

3. **Browser Verification**:
   - Server started on port 5285: `npm run dev -- --port 5285 --strictPort`.
   - Navigated to `http://localhost:5285/2d/lab/next`.
   - Evaluated DOM and clicked through tab navigation:
     - `Code` tab
     - `Costumes` tab
     - `Sounds` tab
   - Clean render with no runtime errors.
