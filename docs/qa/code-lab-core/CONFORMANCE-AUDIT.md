# Conformance suite audit — 2026-10-01

Scope: the 108 fixtures in `research/code-lab/01-scratch-runtime-semantics.md` (the oracle), checked against `src/platformer/lab/core/conformance/*.test.ts` (the conformance suite), the wave-1 unit tests in `src/platformer/lab/core/*.test.ts`, and the claim in `docs/qa/code-lab-core/CONFORMANCE.md` that 105/108 pass.

Branch `claude/code-lab-core` @ `127d9e0`. `npx vitest run src/platformer/lab/core` passes: **27 files, 334 tests**. No source or test files were changed. The reproductions below came from a temporary test file that was deleted after the run.

## Verdict

"105/108 PASS" overstates coverage. The suite is green. Only **76** fixtures are verified by a conformance test that runs the research recipe through `createRuntime` with `ALL_PRIMITIVES` and asserts the expected result. Three groups of problems:

1. **`CONFORMANCE.md` labels topics wrongly.** In its §1.1–§1.3 tables, the topic column for most F, H and C rows doesn't match the research. For example, F03 is listed as "Warp budget", F10 as "Broadcast and wait", and C05 as "Clone of clone". The notes describe things that don't exist: F03 claims a "500ms wall-clock guard", but the runtime uses an op count (`WARP_OP_LIMIT = 200_000`). The F and H test files use the correct research topics. The doc does not describe them. The §1.4–§1.9 section tables in the doc are empty, because all 108 rows were placed under §1.3.
2. **`conformance/clones.test.ts` uses the wrong numbers.** Its C01–C12 names match neither the research nor the doc. Only C01 tests its own fixture. Several real fixtures are tested under a different ID, and C10 is tested nowhere.
3. **Many tests check only part of a fixture.** These tests are on the right topic, but they skip the case that makes the fixture worth having. Examples: M05 checks `240 < x < 1000` instead of `275`, S01 uses solid squares, so pixel touching and box touching give the same answer, and F14 never changes layers.

Behavior bugs are fewer than the labeling problems suggest. Running the untested parts of each recipe found **3 real divergences** (see the last section). Everything else that was reproduced matched the research.

## Summary counts

| Class | Count | Meaning |
|---|---:|---|
| VERIFIED | 76 | A conformance test runs the research recipe through the real runtime and asserts the expected result. Some miss minor sub-cases, listed in the notes. |
| UNIT-ONLY | 16 | The conformance test is weak or mislabeled, but a wave-1 unit test covers the real fixture. Wave-1 tests use either the real `Runtime` scheduler with stub primitives (`runtime.test.ts`) or real primitives on `testkit.fakeRuntime`. |
| MISLABELED | 5 | The conformance test with this ID tests something else. C06† is the exception: its real fixture is verified under the C07 label. |
| WEAK | 7 | The test is on the right topic, but its assertions don't check the fixture's distinctive result. |
| KNOWN-DIFF | 4 | S04, S05 and S06 are color-sensing stubs. F02 uses an op-count budget instead of 75% of step time. |
| MISSING | 0 | — |

Wave-1 test paths in the table are relative to `src/platformer/lab/core/`. A bare `file:line` such as `frame:21` means `conformance/frame.test.ts:21`.

## Per-fixture table

### §1.1 Frame loop (F)

| ID | Research topic | Class | Evidence | Note |
|---|---|---|---|---|
| F01 | 30 vs 60 | VERIFIED | frame:21 | 30 TPS / 33⅓ ms asserted. The 60 TPS default doesn't exist in Code Lab, by design. |
| F02 | Work budget | KNOWN-DIFF | frame:32 | Uses an op count (`DEFAULT_TICK_OP_BUDGET = 20_000`), not 75% of step time. The budget is also checked mid-sweep, which causes starvation (bug 1). |
| F03 | Straight-line scripts | VERIFIED | frame:54 | x=3 after the first step. |
| F04 | Loop iteration yields | VERIFIED | frame:72 | |
| F05 | Redraw | UNIT-ONLY | frame:90 (weak); runtime.test.ts:216 | The conformance test never checks "no second sweep". runtime.test.ts:216 does. |
| F06 | Hidden motion | VERIFIED | frame:122 | Hidden case only. No comparison with a visible sprite. |
| F07 | Ordinary yield vs yield-tick | VERIFIED | frame:147 | |
| F08 | Wait zero | VERIFIED | frame:181 | The warp sub-case is untested. Inside warp, Code Lab yields to the next tick, while Scratch may revisit immediately. |
| F09 | Wait-until | VERIFIED | frame:207 | The "wait until true runs in the current turn" case is not asserted. |
| F10 | Warp | VERIFIED | frame:231 | Asks inside warp are not in the suite. A reproduction passed. |
| F11 | Warp safety | WEAK | frame:259; runtime.test.ts:533 | Asserts only "status still running after 1 tick", which would pass even if warp never ran. Uses an op limit rather than elapsed time. Linked to bug 1. |
| F12 | Turbo | VERIFIED | frame:289 | No non-turbo control case. The "unresolved ask still suspends" part is untested. |
| F13 | Hat launch order | UNIT-ONLY | frame:309 (1 sprite + stage); runtime.test.ts:617 | Conformance can't tell B,A apart. Wave-1 asserts [B,A,Stage]. Reversing the script array is untested. |
| F14 | Running thread order | WEAK | frame:333; runtime.test.ts:658 | Neither test changes layers. Wave-1 asserts only `log.length > 0`. Restarts reorder threads (bug 2). |
| F15 | Same-frame new work | VERIFIED | frame:357 | |
| F16 | Reporter evaluation | VERIFIED | frame:382 | |

### §1.2 Hats (H)

| ID | Research topic | Class | Evidence | Note |
|---|---|---|---|---|
| H01 | Green flag | VERIFIED | hats:21; runtime.test.ts:811 | Clone gone, x and v kept, effects cleared. Timer restart is asserted only in wave-1. |
| H02 | Key pressed | VERIFIED | hats:66 | |
| H03 | Sprite clicked | VERIFIED | hats:99 | |
| H04 | Stage clicked (pick front-most opaque; hidden/ghosted not picked) | MISLABELED | hats:128 | Tests restarting the stage-click hat. Picking lives in `studio/stage/picking.ts`. `picking.test.ts` covers topmost and hidden sprites, not ghosted ones. **The ghost case fails (bug 3).** |
| H05 | Broadcast | VERIFIED | hats:153 | "Sender continues immediately" is not asserted. |
| H06 | Broadcast-and-wait | WEAK | hats:180; runtime.test.ts:969 | Uses one receiver, so "continues only after both the 0.2s and 0.4s receivers finish" is untested. The no-receiver case is tested. |
| H07 | Clone-start | VERIFIED | hats:222 | |
| H08 | Timer/loudness threshold | UNIT-ONLY | hats:245 (weak); runtime.test.ts:1058 | Conformance skips the equality boundary (1.0 must not fire) and the re-arm. Wave-1 checks exactly 0.9/1.0/1.1/1.2 plus the re-arm. |
| H09 | Backdrop changes | WEAK | hats:274; runtime.test.ts:1109 | Both tests set `costumeIndex` and call `rt.startHats` by hand, never `looks_switchbackdropto`. "Switching to the current backdrop fires" and "sprite costume does not fire" are untested. A reproduction passed. |
| H10 | Stack clicks | VERIFIED | hats:297 | |

### §1.3 Clones (C)

| ID | Research topic | Class | Evidence | Note |
|---|---|---|---|---|
| C01 | State snapshot | VERIFIED | clones:16; clones.test.ts:12 | HP isolation after a change is asserted only in wave-1. |
| C02 | Shared definition, separate execution | MISLABELED | clones:67 (tests layer insertion); clones.test.ts:58 (partial) | "Clone does not begin halfway through the loop" is untested. A reproduction passed. |
| C03 | Which hats run | MISLABELED | clones:93 (tests the clone limit) | Partly covered by tests labeled C05 (clones:147: original + 1 clone receive the broadcast) and C09 (flag clears clones). The two-clone recipe is not run. |
| C04 | Layer | UNIT-ONLY | clones:115 (tests clone-of-clone count); clones.test.ts:89 | The test labeled C02 (clones:67) is close, but it calls `rt.addClone` with a hand-built target and never uses the primitive. |
| C05 | Global limit | UNIT-ONLY | clones:147 (tests broadcast); clones.test.ts:107 | The 300 cap is asserted under the C03 label. "Delete one → one more allowed" appears only in wave-1. |
| C06 | Delete original | MISLABELED† | clones:170 (deletes a clone) | †The real fixture is verified by the test labeled **C07** (clones:194). |
| C07 | Delete runtime clone | UNIT-ONLY | clones:194 (deletes the original); clones.test.ts:145 | Wave-1 checks that the sibling survives. "No log after delete" is untested anywhere. A reproduction passed. |
| C08 | Stop all | WEAK | clones:212 | Checks only that the clone is removed. Original v7, clone v9, and "no queued continuation" are not asserted. A reproduction passed. |
| C09 | Clone of clone | UNIT-ONLY | clones:230 (flag clears clones); clones.test.ts:160 | The conformance clone-of-clone test (labeled C04) counts clones but never checks HP inheritance. |
| C10 | Stop other scripts in sprite (per clone) | MISLABELED | clones:247 (tests that the stage cannot clone) | Not covered anywhere. A reproduction passed: per-clone scope is correct. |
| C11 | Local lists | UNIT-ONLY | clones:262 (local *variable*); clones.test.ts:188; project.test.ts:315 | The conformance test checks a variable, which is half of D02, not lists. |
| C12 | Uninherited assumptions | UNIT-ONLY | clones:287 (named clone resolution); clones.test.ts:204 | The bubble is reset under the C01 label. The pending-ask and call-stack parts are untested everywhere. |

### §1.4 Motion (M)

| ID | Research topic | Class | Evidence | Note |
|---|---|---|---|---|
| M01 | Coordinates/direction | VERIFIED | motion:12 | |
| M02 | Negative/fractional steps | VERIFIED | motion:43 | |
| M03 | Direction wrapping | VERIFIED | motion:62; motion.test.ts:71 | Infinity → keep direction is asserted only in wave-1. A reproduction passed. |
| M04 | Position reporters | VERIFIED | motion:99 | The raw `x position of` reporter is untested. |
| M05 | Ordinary fencing | UNIT-ONLY | motion:123 (asserts `240 < x < 1000`); motion.test.ts:107 | Wave-1 asserts exactly 275/−275. |
| M06 | Small-costume fence | VERIFIED | motion:143 | 20×20 → 240. |
| M07 | Dragging | VERIFIED | motion:160 | Forced editor move is untested. |
| M08 | Go to | UNIT-ONLY | motion:181 (mouse only); motion.test.ts:178 | "Original, not nearest clone" and random 0.5 → (0,0) appear only in wave-1. A reproduction passed. |
| M09 | Point towards | VERIFIED | motion:201 | Same point → 90 is untested. A reproduction passed. |
| M10 | Glide snapshot | VERIFIED | motion:229; motion.test.ts:262 | Interpolation is asserted at ±0.5. "Endpoint not retargeted" is only in wave-1. |
| M11 | Glide zero | VERIFIED | motion:252 | |
| M12 | Bounce | VERIFIED | motion:273; motion.test.ts:313,331 | The left/top tie and near-tangent cases are only in wave-1. |
| M13 | Edge predicate boundary | UNIT-ONLY | motion:292 (x=0 vs 1000); touching.test.ts:126 | Only wave-1 tests the flush-with-edge boundary. |
| M14 | Rotation styles | VERIFIED | motion:319 | The left-right flip is untested. |

### §1.5 Looks (L)

| ID | Research topic | Class | Evidence | Note |
|---|---|---|---|---|
| L01 | Costume names/numbers | VERIFIED | looks:12 | Missing name → no change is untested. |
| L02 | Costume wrap | VERIFIED | looks:41 | |
| L03 | Rotation center | VERIFIED | looks:79 | |
| L04 | Size min/max | VERIFIED | looks:103 | |
| L05 | Effects | VERIFIED | looks:129 | Unknown effect is untested. |
| L06 | Ghost vs hide | VERIFIED | looks:158 | The touching half is verified. "Not clickable when ghost=100" fails (bug 3). |
| L07 | Show/hide | VERIFIED | looks:201 | |
| L08 | Layer operations | WEAK | looks:227; looks.test.ts:269 | Checks the targets-array order only. Picking, touching and "next broadcast follows the new layer order" are not asserted. A reproduction passed. |
| L09 | Say/think plain | UNIT-ONLY | looks:260 (strings only); looks.test.ts:302 | Number 1.234 → "1.23" appears only in wave-1. |
| L10 | Say/think for seconds | VERIFIED | looks:283 | |
| L11 | Bubble overwrite race | VERIFIED | looks:306 | |
| L12 | Flag/stop effects | VERIFIED | looks:333 | |

### §1.6 Sensing (S)

| ID | Research topic | Class | Evidence | Note |
|---|---|---|---|---|
| S01 | Sprite touching (pixel, not AABB) | UNIT-ONLY | sensing:12 (solid squares); touching.test.ts:35 | Conformance can't tell pixel touching from box touching. |
| S02 | Named sprite includes clones | VERIFIED | sensing:54 | Reuses the clone object after the flag. Hacky but valid. |
| S03 | Hidden asymmetry | VERIFIED | sensing:104 | Color part is N/A. |
| S04 | Color target tolerance | KNOWN-DIFF | sensing:146 | The stub returns false. |
| S05 | Color source mask | KNOWN-DIFF | sensing:164 | The stub returns false. |
| S06 | CPU/GPU threshold | KNOWN-DIFF | sensing:181 | Asserts only that the primitives are defined. |
| S07 | Distance | VERIFIED | sensing:188 | |
| S08 | Attribute of | VERIFIED | sensing:232 | "Clone HP doesn't change the original's reading" is untested. |
| S09 | Timer | VERIFIED | sensing:282 | stopAll/flag semantics are asserted. "1000 ms → exactly 1" is only checked as `> 0`. |
| S10 | Key names | UNIT-ONLY | sensing:315 (queries 'a' after pressing 'a'); sensing.test.ts:276 | 65, "apple" and Shift appear only in wave-1. |
| S11 | Key repeat | WEAK | sensing:346 | Re-tests H02. "Only one down-state entry" is not asserted. |
| S12 | Ask queue | UNIT-ONLY | sensing:373; sensing.test.ts:309 | Conformance uses one question and sets `askQueue[0].state` directly, skipping `submitAnswer`. Wave-1 covers FIFO order. |
| S13 | Shared answer/reset | VERIFIED | sensing:402 | Flag reset is asserted. "All targets read the latest answer" is untested. |

### §1.7 Operators (O)

| ID | Research topic | Class | Evidence | Note |
|---|---|---|---|---|
| O01 | Numeric cast | VERIFIED | operators:11 | NaN+1 is untested. A reproduction passed. |
| O02 | Boolean cast | VERIFIED | operators:37 | |
| O03 | Numeric comparison | VERIFIED | operators:66 | |
| O04 | Infinity/NaN | VERIFIED | operators:92 | |
| O05 | Negative mod | VERIFIED | operators:126 | |
| O06 | Round | VERIFIED | operators:166 | round(−0.5) → −0 is untested. A reproduction passed. |
| O07 | Random integer rule | VERIFIED | operators:191 | |
| O08 | Random bounds | VERIFIED | operators:220 | "RNG near 1 → 3" is untested. |
| O09 | Join | VERIFIED | operators:250 | true+"!" is untested. A reproduction passed. |
| O10 | Letter | VERIFIED | operators:268 | |
| O11 | Length/Unicode | VERIFIED | operators:295 | |
| O12 | Contains | VERIFIED | operators:313 | |
| O13 | Trig | VERIFIED | operators:338 | |
| O14 | Math operations | VERIFIED | operators:364 | |

### §1.8 Data (D)

| ID | Research topic | Class | Evidence | Note |
|---|---|---|---|---|
| D01 | Set vs change | VERIFIED | data:12 | |
| D02 | Scope | VERIFIED | data:37 | Same name with distinct IDs is untested. |
| D03 | Indexing | VERIFIED | data:72 | |
| D04 | Special index names | VERIFIED | data:110 | item "all" → "" is untested. A reproduction passed. |
| D05 | Empty list | VERIFIED | data:139 | |
| D06 | Search/coercion | VERIFIED | data:161 | |
| D07 | List reporter | VERIFIED | data:193 | |
| D08 | Capacity | VERIFIED | data:220 | |
| D09 | Insert at capacity | VERIFIED | data:242 | Insert at 200001 is untested. A reproduction passed. |
| D10 | No reset on flag | VERIFIED | data:263 | "Clone-local list disappears with the clone" is untested. |

### §1.9 Procedures (P)

| ID | Research topic | Class | Evidence | Note |
|---|---|---|---|---|
| P01 | Arguments | VERIFIED | procedures:13 | |
| P02 | Nearest call only | VERIFIED | procedures:46 | |
| P03 | Defaults/missing define | VERIFIED | procedures:83 | Free argument reporter → 0 is untested. A reproduction passed. |
| P04 | Recursion | VERIFIED | procedures:101 | Mutual recursion is untested. |
| P05 | Warp inheritance | VERIFIED | procedures:144 | |
| P06 | Stop inside define | VERIFIED | procedures:182 | Returns `[inside, after]`, which is correct. |
| P07 | Stop at top level | VERIFIED | procedures:213 | The nested f→g stop is untested. A reproduction passed: it returns to f. |

## Runtime behavior likely wrong (prioritized)

These come from reading the code and were confirmed with a throwaway vitest file built on `conformance/harness.ts`, which was then deleted.

1. **A heavy warp thread starves every thread after it (F02/F05/F11). CONFIRMED.** In `runtime.ts` `step()`, the inner sweep loop breaks as soon as `_tickOps >= opBudget`. Threads later in the list then get no turn that tick. A warp thread may run up to `WARP_OP_LIMIT = 200_000` ops, far more than the `20_000` tick budget, so the same front thread uses up the budget every tick. Scratch checks its time budget only *between* sweeps, so every thread gets its turn.
   - Reproduction: thread A runs `forever { call render }`, where `render` is a warp `repeat 25000 { change x by 0 }`. Thread B runs `forever { log B; wait 0 }`. Over 10 ticks, B logs **once**. With a warp `forever`, B never runs at all.
   - This is a common Scratch game pattern (a "run without screen refresh" render loop).
   - Fix: check the budget only between sweeps. Also make sure `WARP_OP_LIMIT` is no larger than the tick budget, or treat the end of a warp turn as the end of the tick.
2. **A restarted hat thread moves to the back of the queue (H03/H04/H05/H09, F14). CONFIRMED.** `startHats` removes the old thread with `splice` and `push`es the new one. Scratch's `_restartThread` replaces the thread at the same index.
   - Reproduction: start a broadcast receiver R (`forever log R`), then a key-hat K (`forever log K`), then broadcast again. The next tick logs `[K, R]`. Scratch logs `[R, K]`.
   - Effect: execution order changes after every re-broadcast or re-click.
3. **A fully ghosted sprite is still clickable (H04/L06). CONFIRMED.** `studio/stage/picking.ts:70` `pickTarget` skips only `!visible`. `touchingPoint` ignores ghost by design (that is correct for touching).
   - Reproduction: a sprite with `ghost=100` at the click point is picked instead of the stage.
   - Fix: in the picker, skip targets with `effects.ghost >= 100`.
4. **Inside warp, wait and ordinary yields move to the next tick (F08/F11). Code reading only.** `control_wait` always calls `requestRedraw` and yields. Scratch's warp loop revisits ordinary yields immediately, until its 500 ms timer runs out. This difference is probably acceptable for kids' games, but `CONFORMANCE.md` should list it as a KNOWN-DIFF rather than claim a "500ms wall-clock guard".
5. **Edge-hat state updates while its handler is still running (H08). Code reading only, low priority.** `checkEdgeHats` writes `edgeHatState` every tick even when a handler thread is alive. Scratch skips evaluating the hat while its thread runs. This can drop a re-trigger if the value falls and rises again during a long handler.

**Checked and correct:** these fixtures were reproduced through the real runtime and match the research. Green flag (H01), key and click retrigger (H02/H03), broadcast restart (H05), clone limit and re-allow (C05), stop inside define and nested stop (P06/P07), C02, C07, C08, C10, ask FIFO order via `submitAnswer` (S12), warp ask-and-wait (F10), M03 Infinity, M05 275, M08, M09, L09 "1.23", switching to the current backdrop (H09), F14 fresh-hat layer order, and the O01/O06/O09/D04/D09/P03 sub-cases.

## Recommended doc/test fixes

- Rewrite the Topic and Notes columns of the §1.1–§1.3 rows in `CONFORMANCE.md` from the research file, and put the M–P rows in their own sections.
- Renumber `conformance/clones.test.ts` to match the research. Add tests for C10 (stop other scripts per clone) and C02 (no mid-loop resume).
- Make the WEAK tests assert the distinctive result: F11, F14, H06, H09, C08, L08, S11. Also bring the UNIT-ONLY recipes into conformance, for example M05 = 275 and S01 with hollow rings.
- Add regression tests for bugs 1–3 before fixing them. The reproductions above can serve as those tests.
