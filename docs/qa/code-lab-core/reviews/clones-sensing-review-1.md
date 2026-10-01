# clones-sensing lane — review 1

Branch `grok/core-clones-sensing` at `e7a31c7` (contracts commit) plus uncommitted `clones.ts`, `sensing.ts`, `touching.ts` and their tests. Reviewed 2026-09-30 by Claude. Read only: no source edits.

Commands:
- `npx vitest run src/platformer/lab/core`: 36 pass, 4 fail (all in `sensing.test.ts`: S01, S09, S10, S13).
- `npx tsc --noEmit -p tsconfig.app.json`: no output, so no type errors anywhere, including lab/core.

## 1. Fixture status

| ID | Status | Where |
| --- | --- | --- |
| C01 | OK. Copies exactly the C01 list plus `copyId`; effects/vars/edgeHatState are fresh objects | clones.ts:27-54, clones.test.ts:12 |
| C02 | OK (bubble not copied, only clone hat started) | clones.test.ts:58 |
| C03 | Partial. Only checks that the clone hat starts. "Existing clones receive broadcasts/flag deletes clones" is scheduler work, so it can't be tested here | clones.test.ts:75 |
| C04 | OK, relies on `addClone` inserting behind the source | clones.test.ts:89 |
| C05 | OK. Global 300, delete one and you can create one more | clones.ts:121, clones.test.ts:107 |
| C06 / C07 | OK. Delete only affects clones, through `removeClone`. Thread stop is the runtime's job | clones.ts:127-129 |
| C08 | Not covered (stop all disposes clones: scheduler). Needs a note in the report | — |
| C09 | OK (myself = current clone; named = original) | clones.test.ts:160 |
| C10 | Not covered (stop other scripts: scheduler). Needs a note in the report | — |
| C11 | OK. `slice()` per local list; globals stay on the stage | clones.ts:29, clones.test.ts:188 |
| C12 | Tested, but the test asserts unverified behavior. See 3e | clones.test.ts:204 |
| S01 | Code OK. `sensing.test.ts` S01 is wrong (2). `touching.test.ts` S01 ×3 pass | touching.ts:52-69 |
| S02 | OK (clones included, dragged candidate skipped, dragged sprite still senses) | sensing.ts:183-187, sensing.test.ts:87 |
| S03 | OK for sprite and mouse. Color stays a stub that returns false (allowed this wave) | sensing.ts:178-180 |
| S04–S06 | Not in this wave. Both color opcodes return `false`; needs a note in the report | sensing.ts:319-320 |
| S07 | OK | sensing.ts:191-208 |
| S08 | OK (raw x/y, stage props, local scalar by name, missing → 0) | sensing.ts:231-252 |
| S09 | Code has a float bug (2). "Flag resets the timer, stopAll doesn't" isn't covered (project/scheduler) | sensing.ts:308-311 |
| S10 | Code OK. Test is wrong (2) | sensing.ts:98-123 |
| S11 | Not covered. Key-down events belong to the scheduler (`pressKey`) | — |
| S12 | OK | sensing.ts:277-306, sensing.test.ts:287 |
| S13 | Code OK. Test is wrong twice (2) | sensing.test.ts:321 |
| M13 / L06 | Extra, passing (edge strictness, ghost doesn't stop touching) | touching.test.ts:87,126 |

## 2. The four failing tests

1. **S01 (sensing.test.ts:82): the test is wrong.** The `column` mask is opaque on costume column 3 in all 4 rows. At `b.x = -2` that column covers world x ∈ [-1, 0], which is A's costume column 1. Column 1 is opaque in A's rows 0 and 3 (the ring's top and bottom border), so `true` is correct. Fix: make the inner shape fit inside the hole, e.g. a 1×2 or 2×2 dot covering only rows 1-2. That also matches the fixture's wording (two rings with overlapping AABBs but disjoint pixels).
2. **S09 (sensing.test.ts:241): the code is wrong.** `(15 * TICK_MS) / 1000` = `0.5000000000000001` (sensing.ts:310). A kid would see that in a reporter bubble. Fix: `(world.tick - world.timerStartTick) / TICKS_PER_SECOND`, which is exact for 15/30. It means the same thing as the contract formula. Keep the test.
3. **S10 (sensing.test.ts:271): the test is wrong.** `'Space'` (capital S) is not a special name, so Scratch uses its first char → `S`. The test added `'s'` to `keysDown` at line 265, so `true` is correct (lines 264-266 already rely on the same rule for `'Shift'`). Fix the assertion to `true`, or check `'Space'` before line 265. Note: the S10 text "Modifier event Shift ignored" is about host key events, not about the reporter argument.
4. **S13 (sensing.test.ts:337): the test is wrong.** `submitAnswer(rt, 'y')` at line 332 already resolved `'two'`, so `activeQuestion` is correctly `null`. To test "reset keeps the queue", queue a third ask before `resetAnswer`. **Line 351 is also wrong** and will fail next: B's `'next'` was removed at line 347, so clearing A emits nothing. The last note is still `'keep'`, and the comment at line 352 contradicts the assertion. Expect no new note instead.

## 3. Correctness findings

a. **touching only finds a brick through a painted original.** `sensing.ts:181` uses `findOriginal`. A brick that has clones but no painted copy (possible through the `defaultsFor` path, clones.ts:114-118) can never be touched by name. Resolve the brick by name and then scan `world.targets` by `brickId`. distance/of correctly stay on the original.
b. **Per-sample transform cost.** `opaqueAt` (touching.ts:40-46) calls `costumeOf` + `transformOf` (a `sinCosDeg` call) for every sample, for both targets. Two 480×360 overlaps cost about 170k samples × 2 transforms, and `touchingObject` runs that for every clone of the brick (up to 300). Hoist the transform/costume out of the loop in `targetsTouch`. Consider a sample cap or a coarse mask early-out.
c. **Module-level state outside `World`** (sensing.ts:21 `dragged`, :44 `clocks`, :64-65 `nextAskId`/`questions`). It's deterministic, but it isn't part of World. Snapshot/rollback/replay and `instantiate` can't see it, and `nextAskId` is shared across worlds. This should be a contract change request (`World.questions`, `World.hostClock`, `Target.dragging`) rather than ship silently.
d. **`defaultsFor` origin** (clones.ts:67-68) uses `bounds.left/bottom`. LANES says "level origin", and the contract says (0, 0) is bottom-left. These match only when the bounds start at 0. Pick one and document it. Also, the synthetic source isn't in `world.targets`, so "insert behind source" is undefined for the real `addClone`. The fake puts it at index 0 (clones.test.ts:275 depends on that). The report should state the expected layer.
e. **C12 test hard-codes volume=100 and soundEffects reset** (clones.ts:47-48, clones.test.ts:213-214). The fixture says volume/effect inheritance is *unresolved* and needs sound-package tests. Scratch's sound extension appears to copy its per-target effect state to new clones in its target-created hook. Check this against the clean-room reading before treating it as Scratch behavior. Otherwise list it as a deliberate difference.
f. **Menu shadow opcodes are missing.** If the editor lane compiles menus as blocks (`sensing_touchingobjectmenu`, `sensing_distancetomenu`, `sensing_keyoptions`, `sensing_of_object_menu`, `control_create_clone_of_menu`), there are no primitives for them. The arg-then-field fallback (sensing.ts:83-93, clones.ts:98-104) only helps if shadows become literals or fields. Agree this with the editor lane and write it in the report.
g. **Ask bubble.** For a visible, non-stage asker, Scratch shows the question as a say bubble and clears it on answer. `askAndWait` never sets or clears `target.bubble`. The `visible` flag only reaches the host through `activeQuestion`, not the `ask` note. Document this as host-side, or set the bubble.
h. Minor: `clearQuestions` lets an orphaned asker finish with `undefined` (sensing.ts:296-303). That's fine if stop always kills the thread too. The scheduler must call `clearTargetQuestions` on stop/delete-clone, and `resetAnswer` + `clearQuestions` on flag. Write these down as integration requirements.
i. Checked and fine: clone limit is checked before `makeClone`, so no id gets burned (clones.ts:121). The stage is never cloned (:120). Delete is a no-op on originals. Edge test is strict against `world.bounds` with hidden still counting (touching.ts:72-77). Ghost is ignored and hidden blocks touching. The mouse ignores tester visibility. Key mapping: 48–90 → char, 32/37–40 → specials, other numbers → first char of text, uppercase fallback. Timer reads `world.tick` only. The answer is shared, and an empty answer still resolves the ask.

## 4. Rule violations

- Determinism: none. Only `Math.floor/ceil/min/max/sqrt` are used. "Date" appears only in a comment (sensing.ts:14).
- File ownership: clean. Only the six lane files are new; no shared files were modified (`git status`).
- Clean room: no verbatim Scratch code found. The key-mapping and `sensing_of` property order follow Scratch behavior closely, which is expected and not copied text.
- Process: nothing is committed, and the required report `docs/qa/code-lab-core/reports/clones-sensing.md` doesn't exist.

## 5. What remains

1. Fix the S09 code (2.2). Fix the S01, S10 and S13 tests, including S13 line 351 (2.1, 2.3, 2.4).
2. Fix 3a (touch a brick by name) and 3b (hoist the transform). Decide 3d and 3e.
3. Write the lane report: fixture table (C03 partial, C08/C10/S04–S06/S11 not covered and why), the deliberate differences (step-center sampling vs Scratch's integer points, rectangle-corner bounds, color stubs, `current` from a host clock, `dayssince2000` = 0, defaults origin, C12 volume), the ask handshake (`submitAnswer` / `resetAnswer` / `clearQuestions` / `clearTargetQuestions` / `activeQuestion`), contract requests (3c), and open questions (3f, 3g, 3h).
4. Commit on the lane branch with the `Co-Authored-By: Grok` trailer. Do not push.
