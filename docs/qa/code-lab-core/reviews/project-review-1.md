# Project lane review 1 (grok/core-project @ 0591010)

Reviewer: Claude, 2026-09-30. Scope: `src/platformer/lab/core/project.ts` (984 lines) and `project.test.ts` (532 lines). `save.ts` has not been started.

**Checks run:** `npx vitest run src/platformer/lab/core` passes (2 files, 26 tests). `npx tsc --noEmit -p tsconfig.app.json` fails with 2 errors in this lane, both in `project.ts` (lines 475 and 509). The commit touches only the lane's own files and ends with the `Co-Authored-By: Grok` line.

## 1. Does instantiate() match the brief? Mostly yes.

- OK: the stage target comes from `design.stage`, and its globals come from the stage declarations (`project.ts:697`, `localsFrom` at 816). Globals are never copied onto sprites, which is right for D02.
- OK: there is one non-clone target per copy, in design order (back to front), with `copyId = id` (`:698`, `:754`). Copies do not count toward `cloneCount` (test at `project.test.ts:228`).
- OK: a knob overrides a variable only when that variable is `showInBuild` (`:820`). Values of 0 and false are honored. The brick default stays as it was.
- OK: the RNG is seeded from `seedState(design.seed)` (`:725`). Bounds are copied (`:713`).
- OK: deep copy. Bricks, costumes (including a new `Uint8Array` for each mask), programs and list arrays are copied. Local lists are sliced per target (C11). The mutation tests at `project.test.ts:164` and the H01, C11 and D02 tests cover this well.
- ISSUE (doc does not match code): `:678-682` says it "throws only when the design has no stage, bounds, bricks array, or copies array". It also throws a TypeError on a script with no hat (`:917`), a procedure whose `argumentNames` is not an array (`:928`), a null costume, sound or variable (`:862`, `:889`, `:904`), and an unknown expr kind (`:983`). The function is defensive in some places and not others. Pick one contract. Recommended: instantiate assumes `validateDesign(design)` returned `[]` (or that `save.parse` already ran it), and the doc comment says so.
- ISSUE (minor): an unknown `brickId` keeps a copy whose `brickId` is not in `world.bricks` (`:736`, test `:247`). Other lanes (`geometry.costumeOf`, `findOriginal`, clones) will have to handle a target that has no definition. Under the "validated input" contract above, drop this soft path.
- ISSUE (minor): `nextTargetId` also scans brick ids (`:707`). Brick ids are not target ids, so this does no harm but is unneeded. Agree with the scheduler and clones lanes on how clone ids are formatted. `testkit.makeWorld` uses 100.
- NOTE: the knob guard `isValue` (`:820`) silently drops a knob string longer than 20,000 characters or one containing a control character. That is fine after validation, but it should not happen silently before it.

## 2. validateDesign coverage

Everything the brief asks for is covered: unknown brick (`:602`), duplicate ids across stage, bricks and copies (`:163`, `:597`), bad costume index (`:614-619`, including a brick with zero costumes), and unsafe names and ids (`:101-115`). It also covers bounds, seed, knobs, masks, assets, hats, and the shape of the whole IR.

Bugs and gaps:
- BUG `:384-391`: the procedure statement counter stops checking once it passes `maxStatements` but never pushes a `limit` problem. Scripts do push one (`:375`). Also, scripts and procedures keep separate counters, so the real cap is 2 x 5,000 blocks.
- BUG (affects save.ts): `checkExpr` (`:553`) and `copyExpr` (`:966`) recurse with no depth or count limit, and reporters are not counted toward `maxStatements`. A crafted save with nested reporters, for example 100k `operator_add` levels, overflows the stack in both functions. Count exprs in the same budget and cap the nesting depth.
- GAP: `procedures_call` is not checked against the declared `procedures` (`:508`). Only the shape of the proccode is checked.
- GAP: `fields.VARIABLE` and `fields.LIST` ids are not checked against the declared locals and globals. A dangling id would only fail at runtime.
- GAP: a local variable whose name equals a global's name is not flagged. Scratch prevents that conflict. Variable ids, on the other hand, must be unique across the whole project (`dataIds`, `:133`). That is stricter than Scratch. It is acceptable, but say so in the report.
- GAP: `copy.size` only has to be finite (`:608`), so 0 and negative sizes pass. The stage brick may have zero backdrops (`checkBrick` does not require one).
- NOTE: `maxListItems` is 20,000 (`:50`) but Scratch's `LIST_ITEM_LIMIT` (D08) is 200,000. That works as a cap on what a saved design can hold, but record it in the report as a deliberate difference from Scratch. `maxStringValue` is 20,000 for the same reason.
- NOTE: `checkMask` requires a `Uint8Array` (`:311`). JSON cannot carry one, so `save.ts` has to encode the mask (for example as base64 or RLE) and decode it before validating.

## 3. Size: is 984 lines justified?

Partly. About 560 lines are validation (`:41-674`) and about 310 are instantiation and copying (`:676-984`). The brief asked validateDesign for four problem kinds. The worker instead wrote a full schema validator for untrusted input, which is really the `save.parse` job ("size caps, type checks, safe identifiers"). That is worth keeping only if `save.ts` reuses it instead of writing a second one. Say this in the report.

What to cut:
- `:849-984` (about 135 lines): replace `copyBrick`, `copyCostume`, `copySound`, `copyProgram`, `copyVariable`, `copyList`, `copyScript`, `copyProcedure`, `copyStmt`, `copyInputs`, `copyFields` and `copyExpr` with `structuredClone(design.stage)` and `structuredClone(design.bricks)`. It is available with ES2022 + DOM in Node and in browsers, and it copies `Uint8Array`. Reserved keys are already flagged by validation. This also removes the `copyExpr` recursion bug.
- `:731-733` `stageLocals`, `:758-772` `targetFromBrick` and `:774-808` `baseTarget` (about 50 lines): these are thin wrappers. A single `newTarget(...)` would be enough.
- `:684-728`, `:735-756`: drop the `finite(...)` and `typeof` fallbacks once instantiate requires validated input (about 25 lines).
- `:110-113` duplicates `hasControlChar` (`:668`).
- `:837-843` `wrapDirection` duplicates the M03 rule that the sprites lane owns. Keep it local for now and note it in the report so the integrator can dedupe.

Estimate: about 750 lines with no loss of coverage.

## 4. The tsc errors (`:475`, `:509`)

Cause: `DESIGN_LIMITS` is declared `as const` (`:61`), so `max = DESIGN_LIMITS.maxName` in `isSafeName` (`:106`) and `checkName` (`:195`) gives `max` the literal type `80`. Passing `DESIGN_LIMITS.maxProccode` (the literal `200`) then fails. Fix: annotate the parameter.
```ts
export function isSafeName(name: unknown, max: number = DESIGN_LIMITS.maxName): name is string
function checkName(name: unknown, path: string, push: Push, max: number = DESIGN_LIMITS.maxName)
```
Vitest does not type-check, which is why the tests still passed.

## 5. Rule violations

- No forbidden APIs were found. The only `Math` use is `Math.abs`. There is no `Date`, `performance`, timers or `Math.random`. Nothing outside the lane's files changed, and no dependencies were added.
- Violation: "Done means" is not met, because tsc reports errors in a lane file (section 4).
- Violation: the lane report `docs/qa/code-lab-core/reports/project.md` is missing.
- The test names do carry their fixture IDs (H01, C11, D02).
- Weak test: the H01 test (`project.test.ts:261`) only shows that a second `instantiate` ignores changes made to the first world. That is the right claim for this lane. It should say in a comment that the green-flag half of H01 is tested in the scheduler lane.

## 6. What remains

1. Fix tsc (section 4) and the procedure-limit bug and the expr recursion bug (section 2).
2. Decide the instantiate contract (validated input only) and trim it (section 3).
3. `save.ts` + `save.test.ts`:
   - The envelope: `schemaVersion`, `engineSemanticsVersion`, `editorVersion`, `pluginVersions`, `design`, per-brick Blockly workspace JSON, and per-brick compiled IR.
   - `serialize` must be deterministic (stable key order) and must encode masks.
   - `parse(text)` handles untrusted input. It caps the byte size before `JSON.parse`, caps depth, never uses `eval`, rejects reserved keys, decodes masks, and runs `validateDesign`. It returns a result object and does not throw.
   - A migration registry keyed by `schemaVersion` that keeps the original payload (the spec's "original payload is kept"). It needs at least a v0 to v1 test.
   - It refuses a future `schemaVersion`.
4. Golden corpus: add at least two files under `src/platformer/lab/core/__fixtures__/`, a minimal level and one that uses knobs, a mask, lists and a procedure. Test that each one parses, re-serializes byte-identically, and instantiates to the same world.
5. Report `docs/qa/code-lab-core/reports/project.md`. Include:
   - the fixture table (H01, C11, D02)
   - the deliberate differences (list and string caps; project-wide unique data ids; Play-vs-flag)
   - a contract request: `World` and `Target` have no field for the engine semantics version
   - the open question on clone id format
