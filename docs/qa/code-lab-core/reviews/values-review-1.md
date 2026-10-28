# values lane — review 1 (2026-09-30)

Scope: branch `grok/core-values` at `da47bfc` plus uncommitted `data.ts` / `data.test.ts`.
Reviewer did not edit source, did not commit.

## Checks run

- `npx vitest run src/platformer/lab/core` → 4 files, 41 tests, all pass (includes uncommitted data tests).
- `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep lab/core` → no output (clean).
- `git diff --stat e7a31c7..HEAD` → only `values.ts`, `operators.ts` and their tests. No shared/forbidden files touched. Both commits carry `Co-Authored-By: Grok`.
- Banned calls: none in `values.ts`, `operators.ts`, `data.ts`. (`operators.test.ts:241` uses `Math.sin` as a test oracle only; fine, tests are not core code.)

## 1. Fixtures

| ID | Status | Notes |
| --- | --- | --- |
| O01 | correct + tested | `values.test.ts:9`, `operators.test.ts:54` |
| O02 | correct + tested | `values.test.ts:33`, `operators.test.ts:69` |
| O03 | correct + tested | `values.test.ts:60`, `operators.test.ts:86` |
| O04 | correct + tested | `operators.test.ts:101` |
| O05 | correct + tested | `operators.test.ts:115`, incl. signed-zero cases |
| O06 | correct + tested | `operators.test.ts:131` |
| O07 | correct + tested | `operators.test.ts:143` |
| O08 | correct + tested | `operators.test.ts:156`, verifies no draw / rngState untouched on equal ends |
| O09 | correct + tested | `operators.test.ts:179` |
| O10 | correct + tested | `operators.test.ts:187` |
| O11 | correct + tested | `operators.test.ts:199` |
| O12 | correct + tested | `operators.test.ts:216` |
| O13 | correct + tested | `operators.test.ts:225` (signed-zero nuance below) |
| O14 | correct + tested, but see bug B1 | `operators.test.ts:253` uses `toBeCloseTo` for `log`/`10 ^`, which hides B1 |
| D01 | correct + tested | `data.test.ts:82` (uncommitted) |
| D02 | correct + tested | `data.test.ts:106`; clone hand-built (correct per "don't depend on other lanes") |
| D03 | correct + tested | `data.test.ts:162` |
| D04 | correct + tested | `data.test.ts:190` |
| D05 | correct + tested | `data.test.ts:220` |
| D06 | correct + tested | `data.test.ts:258` |
| D07 | correct + tested | `data.test.ts:282` |
| D08 | correct + tested | `data.test.ts:305` |
| D09 | correct + tested | `data.test.ts:326` (front insert pops tail; insert at 200001 refused) |
| D10 | tested, weak | `data.test.ts:357` only shows data blocks have no flag hook (`dataPrimitives.event_whenflagclicked` undefined). Real flag/clone-removal behavior belongs to scheduler/project/clones lanes; say so in the report rather than claim full coverage. |

No fixture is missing or wrong.

## 2. Correctness vs Scratch

Checked and matching: `toNumber` (NaN→0, Infinity kept, booleans 1/0), `toBoolean` (only `""`, `"0"`, case-insensitive `"false"`), `isWhiteSpace`, `isInt` (written-form rule, NaN true, Infinity/1e21 false), `compare` (Number() not toNumber, whitespace-as-text, same-sign infinities, lowercase string fallback), `toListIndex` (exact lowercase `last`/`random`/`any`, `all` only with acceptAll, floor after cast, draw only when length>0), `mod` (floored), `round` (Math.round, -0 kept), `random` (swap, inclusive int / half-open real, no draw on equal ends), letter_of (fractional bounds check then charAt truncation), contains, length, list contents rule, add/insert limits, item-number/contains (strict fast path then compare), variable lookup target→stage via `hasOwnProperty` (`data.ts:15-23`, also safe against `__proto__` ids).

**B1 — `10 ^` and `log` give kid-visible float noise Scratch doesn't (operators.ts:134-139).** `pow10` (detmath.ts:202) is `exp(x * ln10)`, so:
`10 ^ 1` → 10.000000000000002, `10 ^ 2` → 100.00000000000009, `10 ^ 3` → 1000.0000000000005, `10 ^ -2` → 0.009999999999999992.
`log 10` → 0.9999999999999998, `log 100` → 1.9999999999999996.
Scratch (`Math.pow(10, n)`, `Math.log(n) / Math.LN10`) gives exactly 10, 100, 1000, 0.01, 1, 2. A kid typing `10 ^ 2` sees `100.00000000000009` in a say bubble. O14 says bit-identical transcendental results are not assumed, but these are integer cases a kid will hit. Fix inside `operators.ts` (detmath is not lane-owned): for integer `n` with `|n| <= 22`, build 10^n by repeated `*10` (and `1 / 10^|n|` for negatives — both exact/correctly rounded); for `log`, return the exact integer when `n` is exactly a power of ten from that table. Tighten the O14 tests to `toBe(100)`, `toBe(1)`, `toBe(2)`. Also file a detmath request in the report (`pow10`/`log10` exact at integer powers) since other lanes may use them.

**B2 (minor, document) — signed zero from rounded trig.** Scratch's `parseFloat(x.toFixed(10))` turns tiny negatives into -0: `sin(-180)`, `sin(360)`, `cos(270)` report -0 in Scratch; here detmath returns exact `+0` (`s + 0`, detmath.ts:57). Only observable as `1 / sin(360)` → Infinity here vs -Infinity in Scratch. Recommend: list as a deliberate difference, no code change.

**B3 (minor, document) — `e ^ 1`** → 2.7182818284590446 vs Scratch 2.718281828459045 (last digit). Covered by O14's "not bit-identical"; note it.

**Deliberate differences that are correct for this lane but must be in the report:**
- Missing variable/list id is never created (`data.ts:19-41`). Scratch's `lookupOrCreateVariable/List` falls back to lookup by *name* and then creates a local. Here reads give `0` / `''` / empty and writes are dropped (tested at `data.test.ts:382`). Fine if the compiler guarantees declared ids; say so.
- `delete all` empties in place (`items.length = 0`, `data.ts:107,115`); Scratch assigns a fresh `[]`. Equivalent as long as the clones lane copies list arrays (C11), which it must anyway.
- `mathop` with an unknown operator returns 0 (matches Scratch's default).

## 3. Rule violations

- Ownership, dependencies, determinism: clean.
- **Clean room — medium risk, fix cheaply.** Several bodies track Scratch's source token-for-token rather than the fixture text:
  - `operators.ts:64` `low + Math.floor(draw * ((high + 1) - low))` and `:65` `draw * (high - low) + low` reproduce Scratch's exact (redundant) parenthesisation in `scratch3_operators.js`.
  - `operators.ts:94-96` (mod) and `values.ts:66-84` (compare, incl. `n === 0 && isWhiteSpace`) and `values.ts:100-111` (toListIndex branch order) mirror `cast.js` line by line.
  - `data.ts:118-127` (insert: limit check → splice → pop) follows `scratch3_data.js` order exactly.
  Much of this is forced by how literally the §1.7/§1.8 fixtures describe the algorithm, so it is not a correctness problem. But the `((high + 1) - low)` fingerprint is not forced. Ask the next worker to restate `random` in its own form (e.g. `low + Math.floor(draw * (high - low + 1))`, same results) and, in the report, state that the remaining shapes are dictated by the fixture text.

## 4. Remaining to finish the lane

1. Fix B1 in `operators.ts` and tighten the O14 assertions.
2. Restate `random` (clean-room note above); re-run O07/O08.
3. Commit `data.ts` + `data.test.ts` (currently untracked) with `Co-Authored-By: Grok <noreply@x.ai>`.
4. Write and commit `docs/qa/code-lab-core/reports/values.md` (does not exist yet; `docs/qa/code-lab-core/reports/` is missing): what was built, fixture table (above, with D10's partial coverage explained), deliberate differences (no auto-create/name fallback, in-place delete-all, detmath non-bit-identical results incl. B2/B3, any residual B1 cases), contract/detmath change request for exact `pow10`/`log10`, open questions.
5. Re-run `npx vitest run src/platformer/lab/core` and the tsc grep. Do not push or merge.
