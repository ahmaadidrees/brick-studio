# Wave 3 report: conformance-honesty

Branch `gemini/w3-conformance-honesty` (name is historical). Edited only `src/platformer/lab/core/conformance/**` (not `regressions.test.ts`) and `docs/qa/code-lab-core/CONFORMANCE.md`. No non-test core file changed.

## Result

- `npx vitest run src/platformer/lab`: 58 files, 533 passed, 8 expected-fail (`it.fails`), 0 failed.
- `npx vitest run src/platformer/lab/core/conformance`: 9 files, 124 passed, 8 expected-fail.
- `npx tsc --noEmit -p tsconfig.app.json`: clean.
- `CONFORMANCE.md`, regenerated from the test names: **97 VERIFIED, 3 KNOWN-DIFF, 8 FAILS-PENDING-FIX = 108**.
- Each of the 8 `it.fails` tests was also run as a plain `it` (temporary copy, since deleted) and fails on the intended assertion, not on a thrown error. Reasons seen: F02/F05 sibling log `[]` instead of `['B']`; F08 `['A1']` instead of `['A1','A2']`; F11 sibling logged 1 time, wanted at least 4; F14 `['C1','K1','K2','C1']` instead of `['C1','K1','C1','K2']`; H05 `['R1','K1','K2','R1']` instead of `['R1','K1','R1','K2']`; H04 and L06 the picker returned the ghosted sprite.

## Changes, by audit finding

Mislabeled (all in `clones.test.ts`, rewritten to the research IDs; the 13 tests are C01-C12 plus `extra · the Stage cannot be cloned`):
- C02 "C02 · Shared definition, separate execution": clone does not resume mid-loop and never runs the flag script.
- C03 "C03 · Which hats run": two clones plus broadcast, flag leaves only originals.
- C04 "C04 · Layer": create clone of B in [A,B,C] gives [A, clone, B, C]; hat order C, B, clone, A.
- C05 "C05 · Global limit": 300 across two bricks, 301st refused, delete one (through the real `control_delete_this_clone` block), one more allowed.
- C06 "C06 · Delete original": no-op, next block runs.
- C07 "C07 · Delete runtime clone": no `impossible` log, sibling survives.
- C08 "C08 · Stop all": uses the `stop all` block; original v7, clone gone, 60 later ticks log nothing.
- C09 "C09 · Clone of clone": grandchild HP 3, named-original child HP 10.
- C10 "C10 · Other scripts in sprite" (was missing): clone A's counter stops, clone B's keeps running.
- C11 "C11 · Local lists", C12 "C12 · Uninherited assumptions" (bubble, pending ask, call stack not copied).
- H04: the hat-restart test is now "H04 · Stage clicked (hat restart)"; picking fixtures added as "H04 · picking: ..." (call `studio/stage/picking.ts` `pickTarget`).

Strengthened UNIT-ONLY/WEAK tests: F05 "F05 · Redraw" (B takes its turn, exactly one sweep per tick), F11 "F11 · Warp safety (KNOWN-DIFF: ...)" (thread alive after one tick, finishes later), F13 "F13 · Hat launch order" (B, A, Stage; reversing the script array reverses order), F14 "F14 · Running thread order" (B actually moves layers; queue unchanged; fresh hats follow new layers), H06 "H06 · Broadcast-and-wait" (0.2 s and 0.4 s receivers), H08 "H08 · Timer/loudness threshold" (0.9/1.0/1.1/1.2 samples, re-arm), H09 "H09 · Backdrop changes" (real `looks_switchbackdropto`, current-backdrop case, costume switch does not fire), M05 "M05 · Ordinary fencing" (exact 275/-275/215/-215), M08 "M08 · Go to" (original not nearest clone, missing no-op, mouse, random 0.5), M13 "M13 · Edge predicate boundary" (right = 240 false, 240.1 true), L08 "L08 · Layer operations" (picking, touching, launch order), L09 "L09 · Say/think plain" (1.23, exact string, empty), S01 "S01 · Sprite touching" (hollow rings, plus a solid-box control), S10 "S10 · Key names", S11 "S11 · Key repeat" (two key events, one down entry, hat ignores repeat), S12 "S12 · Ask queue" (via `submitAnswer`, FIFO), S13 "S13 · Shared answer/reset".

Also added: F06 visible-vs-hidden control, F08 warp case, F09 true-condition case, F10 "F10 · Warp ask-and-wait stays suspended until an answer", F12 non-turbo control and ask-under-turbo, H01 timer restart, L06 ghost-click `it.fails`, and sub-cases O01 (NaN+1), O06 (round -0.5 is -0), O08 (RNG near 1 gives 3), O09 (true+"!"), D04 (item "all"), D09 (insert at 200001), D10 (clone-local list), P03 (free argument is 0), P07 (nested f to g stop), M03 (Infinity), M09 (same point gives 90).

`harness.ts`: `Math.random` replaced by a counter for default script ids; added `extraBrick` and `stepN` helpers. `grep -rn Math.random src/platformer/lab/core/conformance` returns nothing.

## `it.fails` tests (FAILS-PENDING-FIX)

Name the bug each waits on; the integrator flips them after the runtime-fixes and stage-camera merges.
- F02 "an overrun thread does not starve later threads in the same sweep", F05 "a heavy redrawing thread still lets the next thread take its turn", F11 "a heavy warp render loop does not starve a sibling script": runtime-fixes bug 1 (warp starvation).
- F14 "a restarted hat thread keeps its place in the queue", H05 "a restarted receiver keeps its place in the thread order": runtime-fixes bug 2 (restart order).
- H04 "picking: a fully ghosted front sprite is not picked", L06 "a fully ghosted sprite is not clickable through the normal picker": ghost-click bug (stage-camera lane edits `picking.ts`).
- F08 "wait zero inside a warp procedure is revisited in the same tick": audit item 4. If runtime-fixes documents it as a known difference instead of fixing it, this test stays failing and the doc row should become KNOWN-DIFF.

## Not covered (honest gaps)

- Sub-cases listed as "Not asserted" in `CONFORMANCE.md` Notes (M04, M07, M10, M12, M14, S08, S09, D02, P04, L01, L05). I did not re-audit every VERIFIED row for further minor sub-cases beyond those the audit named, so a VERIFIED row means "the listed tests pass and cover the fixture's main recipe", not exhaustive.
- H08's re-trigger-while-handler-runs case: the research marks it unresolved, so there is no oracle to assert against.
- S04, S05, S06 remain headless stubs (KNOWN-DIFF).
- Only the conformance suite backs `CONFORMANCE.md`; wave-1 unit tests are not cited.
- The H04/L06 picking tests import `studio/stage/picking.ts` from the core conformance folder; they will need updating if the stage-camera lane changes the `pickTarget` signature.
