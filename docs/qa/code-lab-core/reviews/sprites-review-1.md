# Sprites lane — review 1 (2026-09-30)

Branch `grok/core-sprites` @ 58bb018 (motion committed) + uncommitted `looks.ts`. `sound.ts`, looks tests and the lane report do not exist yet.
Checks: `npx vitest run src/platformer/lab/core` → 2 files, 25 tests pass. `tsc -p tsconfig.app.json | grep lab/core` → no errors (looks.ts included via `"include": ["src"]`).
Commit scope: 58bb018 touches only `motion.ts` + `motion.test.ts`; trailer present. No banned Math/Date/timer calls in motion.ts or looks.ts.

## 1. Fixture status

| ID | Status | Notes |
| --- | --- | --- |
| M01 | pass, tested | motion.test.ts:38, :53 |
| M02 | pass, tested | :61 |
| M03 | pass, tested | :71. Fractional edge, see B2 |
| M04 | pass, tested | :90 (sensing "of" raw value belongs to clones-sensing) |
| M05 | pass, tested | :103. Only the centered ±240 stage is tested, see T1 |
| M06 | pass, tested | :116 (20×20 → 240, 100×100 → 275, 21×21 ceil/floor) |
| M07 | pass, tested | :131. Drag state is a module WeakSet, see C2 |
| M08 | pass, tested | :149 original-not-clone, missing no-op, mouse, random=.5; :181 bottom-left random |
| M09 | pass, tested | :196 incl. (+0,+0) → 90, missing no-op |
| M10 | pass, tested | :233 snapshot + 250 ms → 25; :263 30 ticks on nowMs |
| M11 | pass, tested | :272 zero and negative secs, fenced, 0 ticks |
| M12 | pass, tested | :284 right → -90, left/top tie → left, :302 0.2 minimum + keep-inside |
| M13 | pass, tested | :315 (`isPastEdge` flush false, 240.1 true) |
| M14 | pass, tested | :327 |
| L01 | implemented, untested | looks.ts:76-109 name-first for strings, number = 1-based |
| L02 | implemented, untested | looks.ts:49-54 round + wrap, non-finite → 0 |
| L03 | nothing to implement, untested | costume switch never writes x/y; add asymmetric-center test |
| L04 | implemented, untested | looks.ts:173-182; deviation for big levels, see B4 |
| L05 | implemented, untested | looks.ts:190-203, :298-311 |
| L06 | not this file | ghost stored only; collision/picking is clones-sensing. Say so in report |
| L07 | partial, untested | flag only (looks.ts:318-327); "hidden keeps running" is scheduler |
| L08 | implemented, untested | looks.ts:228-237 reorders `world.targets` |
| L09 | **BUG**, untested | numeric formatting wrong, see B1 |
| L10 | implemented, untested | looks.ts:160-170 YIELD until `nowMs()` ≥ deadline, ≥1 yield even for 0 s |
| L11 | implemented, untested | usage id per target (looks.ts:23, :139-143, :169) |
| L12 | implemented, not wired, untested | hooks exported (looks.ts:210-221) but nothing calls them, see C1 |

## 2. Correctness bugs

- **B1 (L09) looks.ts:132-137 `formatBubble`.** `say 1.5` shows `"1.50"`; `say 0.005` shows `"0.005"`; the `>= 0.01` / `% 1` guard is invented. Fixture behavior is "round to 2 decimals, then show the number": `String(parseFloat(n.toFixed(2)))` → `"1.5"`, `"0.01"`, `1.234 → "1.23"`, `3 → "3"`.
- **B2 (M03) motion.ts:16-21 `wrapDirection`.** Integer-range wrap: `-179.5 → 180.5`, `180.5` stays `180.5`, both outside the contract's `(-180, 180]` (contracts.ts:9). Either wrap fractional values properly (`d - 360*ceil((d-180)/360)`) or, if matching Scratch's quirk on purpose, document it as a deliberate difference and test it. Decide; do not leave silent.
- **B3 looks.ts:122-126 backdrop resolution order.** `'random backdrop'` is checked before the exact-name lookup, so a backdrop literally named "random backdrop" is never selected by name. L01's rule is name first, then special strings. Move the random check after `indexByName`.
- **B4 (L04) looks.ts:177-180 `clampSize`.** Max scale uses `world.bounds`, so a 4800-wide level allows 7200/W. Defensible under decision 2, but it is a deliberate difference from the 480×360 fixture: put it in the report (or clamp to a fixed 480×360 view).
- **B5 looks.ts:209-215 green flag.** Comment says bubbles stay on green flag. In Scratch the flag runs stop-all first, which clears bubbles. Fine if the scheduler calls `onStopAllLooks` before `onGreenFlagLooks`; state that ordering in the report and fix the comment.
- **B6 looks.ts:263-265 / :271-288.** `looks_switchcostumeto` on the stage changes the backdrop without the `backdrop` note or hats. Return early for `target.isStage` (Scratch has no such block on the stage).
- **Minor, motion.ts:72-75.** Fence math is correct for y-up and any `world.bounds` (checked by hand: bounds {0..480} with a 100×100 costume → setx 1000 gives 515). Untested, see T1.
- **Checked and OK:** move/turn/point use `sinCosDeg`/`atan2Deg`; glide snapshots start/end/t0 in `frame`, yields on start, interpolates on `nowMs()`, fences each step, `!(ms > 0)` covers NaN; bounce ties (strict `<`), 0.2 minimum, whole-bounds keep-inside then partial fence; rotation style rejects unknown strings; every motion/looks mutation gates `requestRedraw` on `visible` (show always redraws; hide and layer moves do not, which matches Scratch); layers clamp ±Infinity and truncate fractions; L11 id race handled; timed say clears only its own bubble.

## 3. Rule / contract issues

- **C1 L12 wiring.** `onGreenFlagLooks` / `onStopAllLooks` (and sound effect reset later) have no contract hook; `RuntimeApi` has no lifecycle callbacks. Write a contract change request in the report (e.g. `PrimitiveTable` lifecycle hooks or a `resetLooks(world)` the runtime calls).
- **C2 motion.ts:40-50 drag lock.** Module-level `WeakSet`, invisible to the scheduler/host unless they import motion.ts; not on `Target`. Request a `dragging` field (or host API) in the report.
- **C3 clean room, medium risk.** Three spots read as close paraphrases of scratch-vm, not fixture-derived code:
  - motion.ts:16-21 `min=-179, max=180, range=max-min+1` is Scratch's wrapClamp shape.
  - motion.ts:178-216 + :80-95 bounce: same distance list, `0 - max(0.2, |d|)`, flipped-y vector + `atan2+90`, then keepInFence's `dx +=` accumulation.
  - looks.ts:76-130 `resolveCostume(... zeroIndex)` + `randomExcept` mirror `_setCostume/_setBackdrop(optZeroIndex)` and the random-backdrop pick.
  Behavior is required by fixtures, but rewrite in our own form (e.g. bounce via a y-up reflection with an inward minimum; costume resolution as a small classifier) before merge.
- **C4 duplicate ownership.** `isPastEdge` (motion.ts:33) is the touching-edge predicate that clones-sensing owns in `touching.ts`. Keep it as an internal helper or note the overlap in the report.
- **C5 menu shadows.** No `motion_goto_menu`, `motion_glideto_menu`, `motion_pointtowards_menu`, `looks_costume`, `looks_backdrops`. If the editor compiles shadow menus to `block` exprs these opcodes are unknown at runtime. Open question for the report (editor lane should emit literals).
- No files outside the lane were changed. No new dependencies.

## 4. Test gaps (motion)

- **T1** Add an M05/M06 case on a bottom-left level (`{0,480,0,360}`): setx 1000 → 515, setx -1000 → -35, sety 1000 → 395.
- **T2** Hidden-target: setDirection / glide / bounce make no redraw; glide while dragged leaves position.

## 5. What remains

1. **looks.test.ts**: one `it('Lxx · ...')` per L01-L12 (L06 and L07 can be scoped notes + flag checks). Must cover: L01 costume named "2" at pos 1 with numeric 2 vs string "2", missing name; L02 3-costume next/0/4/fractional/NaN/Infinity; L04 100×100 → 5 and 540 on a 480×360 world plus tiny/wide/empty; L05 all five clamps + unknown name + uppercase name; L08 front/back/±N/fractional; L09 `1.234`, `"1.234"`, `""`, `1.5` (after B1); L10 via `callPrimitive` (1 s = 30 ticks, 0 s = 1 yield); L11 two frames interleaved; L12 hooks; backdrop note + `event_whenbackdropswitchesto` field; redraw gating on hidden.
2. Fix B1, B3, B6; decide B2/B4/B5 and document.
3. **sound.ts + sound.test.ts**: `sound_play`, `sound_playuntildone` (YIELD until `nowMs` ≥ start + `durationMs`), `sound_stopallsounds` (`stopSounds` note), `sound_changeeffectby`/`sound_seteffectto` (PITCH/PAN, lowercase field), `sound_cleareffects`, `sound_changevolumeby`/`sound_setvolumeto` (clamp 0..100), `sound_volume`. Sound lookup by name then 1-based number (same rule as L01). Emit `{kind:'sound', volume, pitch, pan}`. Stop-all/flag reset of `soundEffects` belongs in C1's hook request.
4. Commit looks.ts (+tests) and sound.ts separately with the Grok trailer.
5. **Report** `docs/qa/code-lab-core/reports/sprites.md`: fixture table, deliberate differences (B2, B4, opaque-rect bounds from geometry.ts, size max), contract requests (C1, C2), open questions (C5, L06/L07 scope, hide/layer redraw).
