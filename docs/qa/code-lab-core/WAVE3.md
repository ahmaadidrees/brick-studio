# Code Lab — wave 3 lanes (cleanup)

Wave 2 shipped `/2d/lab/next` on the new core. An independent audit ([`CONFORMANCE-AUDIT.md`](CONFORMANCE-AUDIT.md)) found that the fixture suite overclaims (76 of 108 verified, not 105) and reproduced three runtime bugs. Wave 3 fixes those and the camera. No new features.

Integration branch: `claude/code-lab-core`. Each lane has its own branch and worktree, forked from the wave 3 brief commit.

## Rules (every lane)

The rules in [`WAVE2.md`](WAVE2.md) still apply: own only your files, no new dependencies, deterministic core, clean room, Vitest tests, browser check on your port, commit on your branch with `Co-Authored-By: Gemini <noreply@google.com>`, never push/merge/rebase/switch branches, and write a report.

Two more:

- **Prove every bug with a failing test first.** Commit the test, then the fix.
- **Report honestly.** Every claim in your report must point to a test name you ran. The audit will be rerun on your work, and overclaiming counts as a failure.

Done means `npx vitest run src/platformer/lab` passes and `npx tsc --noEmit -p tsconfig.app.json` is clean. Report at `docs/qa/code-lab-core/reports/wave3-<lane>.md`.

Ports: runtime-fixes 5291, conformance-honesty 5292, stage-camera 5293.

## Lanes

### runtime-fixes: scheduler bugs
Files: `core/runtime.ts`, `core/runtime.test.ts`, and a new `core/conformance/regressions.test.ts`.

Read the audit's "Runtime behavior likely wrong" section and fix, with a failing test first for each:

1. **A warp script starves its siblings.** Today a warp ("run without screen refresh") thread can spend the whole tick budget mid-sweep, so other threads get no turn for ticks on end.
   - Match Scratch's structure: check the tick budget **between sweeps**, not in the middle of one. Every active thread gets its turn in each sweep, as Scratch does.
   - A warp thread still yields when it hits `WARP_OP_LIMIT`.
   - Keep everything deterministic: op counts, never time.
   - Test it with the audit's example: `forever { call render }`, where `render` is a 25,000-op warp procedure, plus a sibling script that must run every tick.
2. **A restarted hat thread loses its place.** When a broadcast or click restarts a running hat script, the restarted thread keeps its original position in the thread order instead of moving to the end (H05/F14).
3. The two divergences the audit found by reading the code:
   - `wait` inside a warp procedure should not force a yield to the next tick when Scratch wouldn't.
   - The `event_whengreaterthan` edge state must not update in a way that drops a retrigger while its handler is running.

   Confirm each with a test against the fixture text in `research/code-lab/01-scratch-runtime-semantics.md`. Fix it, or document it as a known difference with the reason.
- Don't change the public API (`step`, `greenFlag`, `stopAll`, `pressKey`, `releaseKey`, `clickTarget`, `startHats`, `broadcast`, constructor).

### conformance-honesty: make the suite and its report true
Files: `core/conformance/**` except `regressions.test.ts`, plus `docs/qa/code-lab-core/CONFORMANCE.md`. Don't edit any non-test core file.

- Go through the audit's per-fixture table and its "Recommended doc/test fixes":
  - Relabel the mislabeled tests (`conformance/clones.test.ts` especially).
  - Add the missing coverage (C10 per-clone stop, and every fixture the audit classes UNIT-ONLY).
  - Strengthen the WEAK tests so they assert each fixture's exact expected result: M05 asserts the exact fenced x, F14 actually changes layers, and so on.
- Remove `Math.random` from `harness.ts` (use a counter).
- Some fixtures fail only because of the three bugs the runtime-fixes lane is fixing (F02, F05, F11, H05, F14, H04 ghost click). For those, write the correct test with `it.fails(...)` and a comment naming the bug. The integrator flips them after the merge.
- Regenerate `CONFORMANCE.md` from the tests:
  - The right topic for every ID, copied from the research file.
  - Status VERIFIED / KNOWN-DIFF / FAILS-PENDING-FIX, each with the test name.
  - Correct section headings and a summary that adds up.
  - No claim without a test.

### stage-camera: see the whole level, and ghost clicks
Files: `studio/stage/**` and `studio/Stage.tsx`.

- **Fit** shows the whole level (all 960 × 360 steps) inside the stage canvas, letterboxed. The level was wider than the view, so sprites past x = 480 went off-screen.
- **Play camera:** default to showing the whole level when it fits at a readable scale; otherwise follow, keeping the action in view. Use a "camera follows" choice in the stage controls: whole level, or follow the selected brick's first copy. The view state stays in the UI, never in `World`.
- Zoom (+ / −) keeps the point under the view center steady; drag-to-scroll works in both Build and Play.
- **Ghost 100:** `picking.ts` must skip targets whose ghost effect is ≥ 100 when choosing what a click hits. Scratch doesn't let you click a fully transparent sprite (audit H04/L06). Add a test.
- Tests: fit math for several level sizes and canvas aspect ratios, zoom-around-center, follow clamping at the level edges, ghost picking.
