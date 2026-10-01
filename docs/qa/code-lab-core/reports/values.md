# Values Lane Report — Wave 1

Branch: `grok/core-values`  
Lanes: `values` (`src/platformer/lab/core/values.ts`, `operators.ts`, `data.ts` and their respective tests)

## 1. What was built

- **`values.ts`**: Pure functions for Scratch-accurate casting and comparisons.
  - `toNumber`: Casts values via `Number(v)`, mapping `NaN` to `0` while preserving `Infinity` and `-Infinity`.
  - `toBoolean`: Recognizes only `""`, `"0"`, and case-insensitive `"false"` as false strings; numbers and booleans follow standard JS truthiness (so `0`, `-0`, `NaN` are false; `"0.0"`, `" false "`, `" "` are true).
  - `toString`: Coerces runtime values to standard string representations.
  - `isWhiteSpace`: Helper checking for `null` or whitespace-only strings (used by `compare` to prevent numeric coercion of blank strings to `0`).
  - `isInt`: Evaluates written representation per Scratch rules — numbers are checked against integer parsing, strings are checked for absence of `.` (even non-numeric strings and `NaN` count as int; `Infinity` and `"2.0"` do not).
  - `compare`: Three-way comparison implementing Scratch numeric comparison when both operands are numbers, falling back to case-insensitive lexicographical string comparison. Handles same-sign infinities as equal.
  - `toListIndex`: Resolves 1-based list indices floored after `toNumber`. Supports exact lowercase `"last"`, `"random"`, `"any"`, and `"all"` (only when `acceptAll` is enabled). Resolves out-of-range indices to `LIST_INVALID`.

- **`operators.ts`**: Implements `operatorPrimitives: PrimitiveTable` for all Scratch operator opcodes:
  - Arithmetic and logic: `operator_add`, `operator_subtract`, `operator_multiply`, `operator_divide`, `operator_lt`, `operator_equals`, `operator_gt`, `operator_and`, `operator_or`, `operator_not`.
  - `operator_random`: Seeded pseudo-random generation via `runtime.random()`. Correctly differentiates integer vs float range using `isInt(from) && isInt(to)`. Swaps swapped bounds. Avoids random draws entirely when bounds are equal.
  - Strings: `operator_join`, `operator_letter_of` (1-based, fractional bound checking followed by code unit truncation), `operator_length`, `operator_contains` (case-insensitive substring match).
  - Math and trig: `operator_mod` (floored division remainder matching divisor sign), `operator_round` (`Math.round` preserving signed zero), and `operator_mathop` (wrapping `detmath.ts` trig/transcendental functions, with trig rounded to 10 decimal places, plus exact powers of 10 and log10 for integer powers $|n| \le 22$ to avoid float noise).

- **`data.ts`**: Implements `dataPrimitives: PrimitiveTable` for variable and list blocks:
  - Scope resolution: Checks target-local storage first, then falls back to stage target for global variables and lists (`ownerOf` guarded by `hasOwnProperty`).
  - Variables: `data_variable`, `data_setvariableto`, `data_changevariableby` (coercing both target variable and increment to numbers via `toNumber`).
  - Lists: `data_listcontents` (joins without delimiter if every item is a 1-character string, otherwise joins with spaces), `data_addtolist`, `data_deleteoflist`, `data_deletealloflist`, `data_insertatlist`, `data_replaceitemoflist`, `data_itemoflist`, `data_itemnumoflist`, `data_lengthoflist`, `data_listcontainsitem`.
  - Enforces `LIST_ITEM_LIMIT` (200,000 items) on additions and insertions.
  - Show/hide blocks: `data_showvariable`, `data_hidevariable`, `data_showlist`, `data_hidelist` implemented as no-ops.

## 2. Fixture acceptance table

| ID | Topic | Test Name / Location | Status | Notes |
| --- | --- | --- | --- | --- |
| O01 | Numeric cast | `values.test.ts` (`O01 · numeric cast`), `operators.test.ts` (`O01 · numeric cast`) | Passing | NaN -> 0, Infinity preserved, blank/non-numeric text -> 0. |
| O02 | Boolean cast | `values.test.ts` (`O02 · boolean cast`), `operators.test.ts` (`O02 · boolean cast`) | Passing | Only `""`, `"0"`, `"false"` (case-insensitive) are false strings; `"0.0"`, `" "`, `" false "` are true. |
| O03 | Numeric comparison | `values.test.ts` (`O03 · numeric comparison`), `operators.test.ts` (`O03 · numeric comparison`) | Passing | Numeric when both convertible (excluding whitespace-as-zero); case-insensitive string compare otherwise. |
| O04 | Infinity/NaN | `operators.test.ts` (`O04 · Infinity/NaN`) | Passing | Same-sign infinities equal; NaN preserved in reporter output until cast by next block. |
| O05 | Negative mod | `operators.test.ts` (`O05 · negative mod`) | Passing | Floored remainder; sign matches modulus divisor; signed zeros preserved. |
| O06 | Round | `operators.test.ts` (`O06 · round`) | Passing | `Math.round` semantics; halfway rounds towards +Infinity; preserves -0. |
| O07 | Random integer rule | `operators.test.ts` (`O07 · random integer rule`) | Passing | Distinguishes written representation via `isInt`: `"1.0"` forces real range, `1` allows integer range. |
| O08 | Random bounds | `operators.test.ts` (`O08 · random bounds`) | Passing | Swaps reversed endpoints; equal endpoints return directly without drawing random float. |
| O09 | Join | `operators.test.ts` (`O09 · join`) | Passing | Concatenates cast strings without separator. |
| O10 | Letter | `operators.test.ts` (`O10 · letter`) | Passing | 1-based indexing; out-of-range yields `""`; fractional indices truncated. |
| O11 | Length/Unicode | `operators.test.ts` (`O11 · length/Unicode`) | Passing | Operates on UTF-16 code units (surrogate pairs count as length 2). |
| O12 | Contains | `operators.test.ts` (`O12 · contains`) | Passing | Case-insensitive substring search; empty string is contained in any string. |
| O13 | Trig | `operators.test.ts` (`O13 · trig`) | Passing | Sin/cos/tan round to 10 decimal places; inverse trig unrounded in degrees. |
| O14 | Math operations | `operators.test.ts` (`O14 · math operations`) | Passing | Exact integer powers of 10 and log10 for $|n| \le 22$; square root, natural log, exp via `detmath.ts`. |
| D01 | Set vs change | `data.test.ts` (`D01 · set vs change`) | Passing | `set` retains raw type; `change` coerces existing value and delta to number. |
| D02 | Scope | `data.test.ts` (`D02 · scope`) | Passing | Target local state takes priority over stage global state; distinct IDs do not collide. |
| D03 | Indexing | `data.test.ts` (`D03 · indexing`) | Passing | 1-based floored indexing; invalid index reads return `""`, invalid mutations are no-ops. |
| D04 | Special index names | `data.test.ts` (`D04 · special index names`) | Passing | Exact lowercase `"last"`, `"random"`, `"any"`, `"all"` (delete only). |
| D05 | Empty list | `data.test.ts` (`D05 · empty list`) | Passing | Reads on empty list return `""`; insert at `"last"` or `"random"` into empty list inserts at position 1. |
| D06 | Search/coercion | `data.test.ts` (`D06 · search/coercion`) | Passing | `itemnum` returns 1-based index or 0; `contains` uses strict match then `compare`. |
| D07 | List reporter | `data.test.ts` (`D07 · list reporter`) | Passing | Unseparated join if every element is 1 code unit string; space-separated join otherwise. |
| D08 | Capacity | `data.test.ts` (`D08 · capacity`) | Passing | Capped at `LIST_ITEM_LIMIT = 200_000`; additions at limit are ignored. |
| D09 | Insert at capacity | `data.test.ts` (`D09 · insert at capacity`) | Passing | Insertion at valid index pops tail if capacity exceeded; insert at limit+1 refused. |
| D10 | Mutations do not reset on flag | `data.test.ts` (`D10 · mutations do not reset on flag`) | Partially covered by lane / Passing | Verified that `dataPrimitives` contains no green-flag reset handler and retains state across invocations. Full green flag reset orchestration belongs to scheduler/project lanes, and clone lifecycle cleanup belongs to clones-sensing lane. |

## 3. Deliberate differences from Scratch

1. **Undeclared variable/list IDs are not created**:
   - In Scratch VM, `lookupOrCreateVariable` / `lookupOrCreateList` falls back to search by variable name and auto-creates a target-local entry if missing.
   - In Code Lab core, brick and stage variables are declared statically in `BrickProgram`. Undeclared IDs safely read as `0` / `""` / empty list and writes are ignored. This keeps runtime state tightly aligned with compiler declarations.
2. **In-place array clearing for `delete all of list`**:
   - `data_deletealloflist` and `delete "all"` truncate the list array via `items.length = 0` rather than instantiating a new array `[]`.
   - This maintains existing array references across targets sharing global lists (clones lane copies lists shallowly per C11 upon creation).
3. **Exact integer powers of 10 and log10 (B1 resolution)**:
   - Scratch uses JavaScript host `Math.pow(10, n)` and `Math.log(n) / Math.LN10`. In `detmath.ts`, `pow10` and `log10` use polynomial series which produce float noise on integer inputs (e.g. `10 ^ 2` -> `100.00000000000009`).
   - `operators.ts` uses an exact lookup table for integer exponents $|n| \le 22$ (yielding exact `100`, `1`, `2`, `0.01`), delegating general inputs to `detmath.ts`.
4. **Trig signed-zero normalization (B2)**:
   - Scratch's `parseFloat(x.toFixed(10))` produces `-0` for angles like `sin(-180)`, `sin(360)`, and `cos(270)`.
   - `detmath.ts` normalizes quadrant results with `s + 0`, returning exact `+0`. The only observable divergence is `1 / sin(360)` yielding `Infinity` rather than `-Infinity`.
5. **Transcendental bit-level differences (B3 / O14)**:
   - Polynomial approximations in `detmath.ts` (such as `exp(1)` -> `2.7182818284590446` vs JS host `2.718281828459045`) differ in the least significant bit. This complies with fixture O14.
6. **Unknown `operator_mathop` fallback**:
   - Operators not matching the known mathop operations return `0` (matching Scratch default behavior).

## 4. Clean-room compliance

- Code was written based directly on behavioral specifications in `research/code-lab/01-scratch-runtime-semantics.md` (§1.7 and §1.8).
- The random number distribution calculation was restated from any AST artifacts in Scratch VM (`scratch3_operators.js`) to standard canonical forms (`low + Math.floor(draw * (high - low + 1))` and `low + draw * (high - low)`).
- All casting rules (`toNumber`, `toBoolean`, `compare`, `toListIndex`) derive strictly from fixture test definitions.

## 5. Contract / detmath change requests

- **`detmath.ts`**: Recommend adding exact integer power handling to `pow10` and power-of-10 recognition to `log10` directly inside `detmath.ts`. Currently `pow10` is implemented as `exp(x * 2.302585092994046)` which introduces transcendental rounding noise for exact integer powers. Moving the exact table into `detmath.ts` will allow all lanes to benefit from noise-free powers.

## 6. Open questions

- For legacy Scratch project imports in future waves, will the compiler synthesize variable/list declarations for all referenced IDs, or will runtime name-fallback resolution ever be required? (For Wave 1, static ID lookup without dynamic fallback is verified and complete).
