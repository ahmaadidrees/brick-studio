# Project Lane Report: Code Lab Core (Wave 1)

## 1. Overview

The **project** lane delivers the core level model, lifecycle instantiation, secure serialization/deserialization, and schema migration for Code Lab wave 1:
- `src/platformer/lab/core/project.ts`: Validates untrusted `LevelDesign` structures against system resource limits and safety constraints (`validateDesign`) and instantiates fresh runtime simulation worlds (`instantiate`).
- `src/platformer/lab/core/save.ts`: Implements the versioned save envelope (`SavedProjectEnvelope`), deterministic JSON serialization with base64 mask encoding (`serialize`), untrusted input parsing with security hardening (`parse`), and schema migration registry.
- `src/platformer/lab/core/__fixtures__/minimal.json`: Golden fixture for a minimal valid level design envelope.
- `src/platformer/lab/core/__fixtures__/complex.json`: Golden fixture with knobs, local/global lists, procedures, scripts, sounds, and base64 mask.
- `src/platformer/lab/core/project.test.ts` & `src/platformer/lab/core/save.test.ts`: Complete unit test coverage for validation, instantiation, serialization, untrusted input defense, migrations, and byte-identical fixture roundtrips.

## 2. Fixture Table

| Fixture ID | Status | Test Name / Location | Notes |
|------------|--------|----------------------|-------|
| **H01** | PASS | `H01 · Play reloads the saved design` (`project.test.ts:251`) | Play discards runtime session state and rebuilds fresh targets and variables from the design. Green flag retaining variables during an active session is tested in the scheduler lane. |
| **C11** | PASS | `C11 · painted copies keep independent local lists` (`project.test.ts:293`) | Each painted copy receives independent sliced copies of local lists; stage global lists remain shared on the stage target. |
| **D02** | PASS | `D02 · locals are per copy and globals stay on the stage` (`project.test.ts:317`) | Local variables resolve on the target first; global variables resolve on the stage; mutating a copy's variable does not affect siblings or stage. |

## 3. Review Findings & Fixes Addressed

All findings from `docs/qa/code-lab-core/reviews/project-review-1.md` have been fixed:
1. **TypeScript Errors Fixed**: Annotated `max: number = DESIGN_LIMITS.maxName` in `isSafeName` and `checkName` to resolve `TS2345`.
2. **Procedure Statement Limit Bug Fixed**: Procedure statements and reporter blocks now share the unified brick block budget (`DESIGN_LIMITS.maxStatements = 5000`) instead of having an unchecked or disjoint counter.
3. **Expression Recursion & Depth Limit Fixed**: Added `maxExprDepth = 64` check to `checkExpr` to prevent stack overflow on deeply nested expression ASTs. Reporter block expressions are counted towards the block budget.
4. **Deep Copy Refactor**: Replaced error-prone manual object copying with native `structuredClone`, ensuring `Uint8Array` mask buffers and nested arrays/objects are cleanly separated without shared memory across sessions.
5. **Instantiate Contract Clarified**: `instantiate(design)` enforces that the design is valid and creates the runtime world; callers running untrusted data first check `validateDesign(design)`.

## 4. Save Format, Security Hardening & Golden Corpus

### Envelope Structure
- `schemaVersion`: Envelope format version (current `1`).
- `engineSemanticsVersion`: Semantics rules version (current `1`).
- `editorVersion`: Pinned Blockly editor version (`13.3.0`).
- `pluginVersions`: Pinned versions of `@blockly/block-shareable-procedures` and `@blockly/continuous-toolbox`.
- `design`: The `LevelDesign` payload.
- `workspaces`: Per-brick Blockly workspace JSON (defaults to `{}`).
- `ir`: Per-brick compiled IR / `BrickProgram` (defaults to `{}`).
- `originalPayload`: Unmodified payload preserved when migrating from older schemas.

### Security Guarantees
- **Size Capped**: Capped at `MAX_SAVE_BYTES` (5 MB) before parsing.
- **Depth Capped**: Bracket nesting depth capped at `MAX_PARSE_DEPTH` (128) via pre-scan before `JSON.parse`.
- **Prototype Pollution Defense**: Rejects inputs with forbidden keys (`__proto__`, `constructor`, `prototype`).
- **No `eval()`**: Safe JSON parsing only.
- **Future Version Rejection**: Rejects files where `schemaVersion > CURRENT_SCHEMA_VERSION`.
- **Never Throws**: Always returns `{ ok: true, save, ... }` or `{ ok: false, problems }`.

### Golden Corpus
- `minimal.json` and `complex.json` pass deterministic byte-identical roundtripping (`serialize(parse(text).save) === text`).
- Both fixtures instantiate cleanly to expected runtime `World` structures.

## 5. Deliberate Differences from Scratch

1. **Painted Copies**: Code Lab introduces painted copy placements (`CopyPlacement`) that share a brick definition but own independent local variables, lists, and pose defaults.
2. **Knob Overrides**: Painted copies can override initial values of brick variables marked with `showInBuild: true`.
3. **Costume Occupancy Masks**: Costumes carry 1-bit occupancy masks (`Uint8Array` in memory, base64 in save files) for pixel-accurate collision detection.
4. **Deterministic Coordinates and Bounds**: Levels define bounding boxes (`bounds`) with bounded coordinates to keep physics deterministic.

## 6. Contract Change Requests

None. The core contracts in `contracts.ts` were sufficient to implement all required features and behaviors.

## 7. Open Questions

None. All wave 1 requirements for the project lane are satisfied and passing all repository test suites.
