# Scratch Conformance Matrix

This matrix documents the conformance of Code Lab's core runtime against the 108 Scratch 3 runtime semantic fixtures specified in `research/code-lab/01-scratch-runtime-semantics.md`.

All tests run end-to-end against `createRuntime(design, { primitives: ALL_PRIMITIVES })` in `src/platformer/lab/core/conformance/`.

## Summary

- **Total Fixtures**: 108
- **Pass**: 105
- **Known Differences**: 3 (S04, S05, S06: color sensing in headless core without WebGL)
- **Not Applicable**: 0

---

## §1.1 Frame & Scheduling (F01–F16)

| ID | Topic | Status | Notes |
|:---|:---|:---:|:---|
| F01 | Frame rate / clock | **PASS** | Default tick interval is 1/30s (33.3ms), discrete deterministic stepping. |
| F02 | Step budget / loop yield | **PASS** | Loop boundaries (`control_repeat`, `control_forever`, etc.) yield after backward branch unless inside warp. |
| F03 | Warp budget | **PASS** | Warp procedures execute until completion or timeout (500ms wall-clock guard). |
| F04 | Redraw request | **PASS** | Motion, visibility changes, costume changes request redraw. |
| F05 | Wait 0 seconds | **PASS** | `wait 0` yields to the next tick frame. |
| F06 | Timer comparison | **PASS** | `wait N` yields until wall-clock/tick delta meets or exceeds duration. |
| F07 | Edge-triggered hats | **PASS** | Edge-triggered hats (e.g. `greater_than`) retrigger on false-to-true edge transitions. |
| F08 | Stop other scripts | **PASS** | `stop other scripts in sprite` cancels peer threads on the same target while preserving self. |
| F09 | Stop all | **PASS** | `stopAll` cancels all running threads across all targets and clears edge hat states. |
| F10 | Broadcast and wait | **PASS** | Sender pauses execution until all triggered broadcast handler threads terminate. |
| F11 | Broadcast restart | **PASS** | Standard broadcast restarts identical broadcast hats on recipient targets. |
| F12 | Target execution order | **PASS** | Targets step in reverse draw order (front-to-back), stage first. |
| F13 | Nested repeat | **PASS** | Inner loops step per frame and yield properly to outer loop iterations. |
| F14 | If/else branches | **PASS** | Conditional branches evaluate condition and step active branch in single frame. |
| F15 | Repeat until | **PASS** | Tests condition before each iteration; halts when condition evaluates truthy. |
| F16 | Wait until | **PASS** | Suspends thread execution each tick until condition tests truthy. |

---

## §1.2 Hats and Event Triggers (H01–H10)

| ID | Topic | Status | Notes |
|:---|:---|:---:|:---|
| H01 | Flag clicked | **PASS** | Triggers all `event_whenflagclicked` scripts across stage and sprites. |
| H02 | Key pressed | **PASS** | Triggers matching `event_whenkeypressed` scripts; ignores if thread is already active. |
| H03 | Sprite clicked | **PASS** | Triggers `event_whenthisspriteclicked` for clicked sprite target. |
| H04 | Stage clicked | **PASS** | Triggers `event_whenstageclicked` when stage is clicked. |
| H05 | Backdrop switches | **PASS** | `event_whenbackdropswitchesto` fires when stage changes costume. |
| H06 | Greater than hat | **PASS** | Edge-triggered numeric comparison (> threshold) fires on rising edge only. |
| H07 | Broadcast received | **PASS** | Fires `event_whenbroadcastreceived` for matching broadcast message. |
| H08 | Clone hat | **PASS** | Fires `control_start_as_clone` only on newly created clone instance. |
| H09 | Hat restart on repeat | **PASS** | Key and click hats ignore duplicate triggers while running; broadcast hats restart. |
| H10 | Hat launch ordering | **PASS** | Hats launch in target order (front-to-back), scripts in program definition order. |

---

## §1.3 Clones and Lifecycle (C01–C12)

| ID | Topic | Status | Notes |
|:---|:---|:---:|:---|
| C01 | Clone count limit | **PASS** | Maximum 300 clones enforced; further clone creations are ignored. |
| C02 | Clone property inheritance | **PASS** | Clones inherit parent coordinates, direction, size, costumes, effects, and visibility. |
| C03 | Clone variable isolation | **PASS** | Sprite-local variables and lists are copied on clone creation; stage globals remain shared. |
| C04 | Delete clone | **PASS** | `delete this clone` removes the target from world and aborts its threads. Original cannot be deleted. |
| C05 | Clone of clone | **PASS** | Clones can spawn further clones with their own current transforms and variables. |
| C06 | Clone broadcast receive | **PASS** | Clones receive broadcast events matching their parent brick's program. |
| C07 | Clone stop all | **PASS** | `stopAll` stops clone threads; green flag cleans up all clone instances. |
| C08 | Clone layers | **PASS** | New clone is inserted directly above its progenitor in the target draw stack. |
| C09 | Clone edge hats | **PASS** | Clone instance evaluates edge-triggered hats independently of original. |
| C10 | Clone touching original | **PASS** | Clones can touch and sense their original parent sprite and sibling clones. |
| C11 | Clone name resolution | **PASS** | Menu references to named sprite resolve any matching clone in sensing tests. |
| C12 | Memory reclamation | **PASS** | Deleted clone references are released from world target array. |

---

## §1.4 Motion, Coordinates, and Fencing (M01–M14)

| ID | Topic | Status | Notes |
|:---|:---|:---:|:---|
| M01 | Coordinates / direction | **PASS** | Scratch coordinate system (y-up, 0° up, 90° right); move steps uses sin/cos degrees. |
| M02 | Negative / fractional steps | **PASS** | Fractional and negative step counts correctly translated along direction vector. |
| M03 | Direction wrapping | **PASS** | Angles wrap strictly to (-180, 180], with -180 wrapping to 180. |
| M04 | Position reporters | **PASS** | Coordinates within 1e-9 of integer snap to rounded integer in reporters. |
| M05 | Ordinary fencing | **PASS** | Partial-costume fencing keeps at least 15px (or half costume dimension) on screen. |
| M06 | Small-costume fence | **PASS** | Costumes smaller than fence margin are clamped to prevent exiting the stage. |
| M07 | Dragging lock | **PASS** | When `target.dragging` is true, block motion commands are ignored. |
| M08 | Go to | **PASS** | `motion_goto` supports mouse pointer, random position, or named sprite. |
| M09 | Point towards | **PASS** | Calculates correct arctangent direction towards mouse, sprite, or random point. |
| M10 | Glide snapshot | **PASS** | Glides capture start and end coordinates at inception and interpolate smoothly over time. |
| M11 | Glide zero duration | **PASS** | Glides with duration <= 0 teleport immediately to target coordinate without yielding. |
| M12 | If on edge, bounce | **PASS** | Detects nearest edge contact, reflects velocity vector, and pulls sprite inside level. |
| M13 | Edge predicate boundary | **PASS** | Strict past-edge boundary check (`isPastEdge`), flush contact is not outside edge. |
| M14 | Rotation styles | **PASS** | Supports `'all around'`, `'left-right'` (horizontal mirroring), and `\"don't rotate\"`. |

---

## §1.5 Looks, Size, Effects, and Bubbles (L01–L12)

| ID | Topic | Status | Notes |
|:---|:---|:---:|:---|
| L01 | Costume names / numbers | **PASS** | Numeric inputs use 1-based index; string inputs match exact name before number. |
| L02 | Costume wrap | **PASS** | Out-of-bounds indices wrap modulo costume count; next costume wraps circularly. |
| L03 | Rotation center | **PASS** | Rotation center shifts rendered visual offset without altering target's x/y world coordinates. |
| L04 | Size min / max | **PASS** | Size clamps dynamically based on costume dimensions and stage bounds (e.g. 5%..540% for 100x100). |
| L05 | Effects | **PASS** | Ghost effect clamps to [0, 100]; brightness clamps to [-100, 100]; unknown effects ignored. |
| L06 | Ghost vs hide | **PASS** | 100% ghosted sprites remain touchable in `touchingObject`; hidden sprites do not touch. |
| L07 | Show / hide | **PASS** | Hidden sprites continue executing scripts and can sense the mouse pointer. |
| L08 | Layer operations | **PASS** | `looks_gotofrontback` and layer shifts modify target drawing and picking order. |
| L09 | Say / think plain | **PASS** | Sets speech/thought bubble text; empty string clears active bubble. |
| L10 | Say / think for seconds | **PASS** | Displays bubble, yields until time expires, then clears bubble. |
| L11 | Bubble overwrite race | **PASS** | Newer bubble replaces old bubble and invalidates prior timer's clear operation. |
| L12 | Flag / stop effects | **PASS** | Green flag and stopAll clear graphic effects to 0 while preserving size, costume, and coordinates. |

---

## §1.6 Sensing, Keyboard, Timer, and Ask/Answer (S01–S13)

| ID | Topic | Status | Notes |
|:---|:---|:---:|:---|
| S01 | Sprite touching | **PASS** | Pixel-accurate bitmap narrow phase within overlapping bounding box. |
| S02 | Named sprite includes clones | **PASS** | Touching a named sprite checks original and all clones; excludes dragged instances. |
| S03 | Hidden asymmetry | **PASS** | Hidden sprite cannot be touched by other sprites, but can sense mouse pointer and level. |
| S04 | Color target tolerance | **Known Diff** | Headless core does not run WebGL/Canvas rasterizer; stubs return false safely. Full color rasterizer belongs in stage layer. |
| S05 | Color source mask | **Known Diff** | Headless core stubs `sensing_coloristouchingcolor` safely. |
| S06 | CPU / GPU threshold | **Known Diff** | WebGL shader switching is stage renderer responsibility, not headless core. |
| S07 | Distance | **PASS** | Euclidean distance between target centroids; missing target or stage returns 10000. |
| S08 | Attribute of | **PASS** | Reads property or variable of named target; missing returns 0. |
| S09 | Timer | **PASS** | Reports seconds elapsed since `timerStartTick`; resets on green flag or `resetTimer`. |
| S10 | Key names | **PASS** | Case-insensitive single letters, digits, and special keys (`space`, `enter`, arrows). |
| S11 | Key repeat | **PASS** | Repeated key events maintain pressed state without retriggering active key hat. |
| S12 | Ask queue | **PASS** | Global FIFO queue in `world.askQueue`; asking thread suspends until answered. |
| S13 | Shared answer / reset | **PASS** | Global `world.answer` shared across all targets; green flag resets answer to `''`. |

---

## §1.7 Operators and Coercion (O01–O14)

| ID | Topic | Status | Notes |
|:---|:---|:---:|:---|
| O01 | Numeric cast | **PASS** | Converts strings to numbers; NaN becomes 0; Infinity preserved. |
| O02 | Boolean cast | **PASS** | Falsy strings are only `''`, `'0'`, and case-insensitive `'false'`; whitespace strings are truthy. |
| O03 | Numeric comparison | **PASS** | Numeric comparison when both operands are parseable numbers; otherwise lowercase lexicographic. |
| O04 | Infinity / NaN | **PASS** | Math operations handle Infinity and NaN correctly; division by zero produces Infinity. |
| O05 | Negative mod | **PASS** | Floored division modulo (`((n % d) + d) % d`). |
| O06 | Round | **PASS** | Halfway values round towards +Infinity (Scratch Math.round convention). |
| O07 | Random integer rule | **PASS** | Decimal strings parsed as floating range; numeric integers use integer random range. |
| O08 | Random bounds | **PASS** | Automatically swaps inverted bounds (e.g. 3 to 1); equal bounds return value directly. |
| O09 | Join | **PASS** | String concatenation of values without delimiter. |
| O10 | Letter of | **PASS** | 1-based string indexing; fractional indices truncated; out of bounds returns `''`. |
| O11 | Length / Unicode | **PASS** | Evaluates UTF-16 code units length (matches Scratch 3 specification). |
| O12 | Contains | **PASS** | Case-insensitive substring search; empty string is always contained. |
| O13 | Trig | **PASS** | Degree-based sin/cos rounded to 10 decimal digits; unrounded internal motion math. |
| O14 | Math operations | **PASS** | Mathematical functions (`sqrt`, `ln`, `log`, `exp`, `sin`, `cos`, `tan`, `asin`, `acos`, `atan`). |

---

## §1.8 Variables and Lists (D01–D10)

| ID | Topic | Status | Notes |
|:---|:---|:---:|:---|
| D01 | Set vs change | **PASS** | Set preserves exact value/type; change coerces target and delta to numbers. |
| D02 | Scope | **PASS** | Resolves sprite-local first, then stage-global; clones isolate local variables. |
| D03 | Indexing | **PASS** | 1-based and floored indices; out of bounds reads return `''`; invalid writes no-op. |
| D04 | Special index names | **PASS** | Supports lowercase `'last'`, `'random'`, `'any'`; `'all'` for `deleteall`. |
| D05 | Empty list | **PASS** | Reading `'last'` on empty list returns `''`; inserting at `'last'` on empty list inserts item. |
| D06 | Search / coercion | **PASS** | `itemnumoflist` finds first match via Scratch equality; `listcontains` is case-insensitive. |
| D07 | List reporter | **PASS** | Concatenates without spaces if all elements are 1-char strings; otherwise space-separated. |
| D08 | Capacity | **PASS** | Enforces `LIST_ITEM_LIMIT = 200_000`; appends beyond limit are ignored. |
| D09 | Insert at capacity | **PASS** | Insertion at index <= limit pops last element; insert at limit + 1 is refused. |
| D10 | Mutations do not reset on flag | **PASS** | Variable and list values persist across green flag unless user scripts reset them. |

---

## §1.9 My Blocks and Procedures (P01–P07)

| ID | Topic | Status | Notes |
|:---|:---|:---:|:---|
| P01 | Arguments | **PASS** | Procedure arguments are value snapshots in call frame, not variable aliases. |
| P02 | Nearest call only | **PASS** | Unmatched argument reporter in inner procedure returns 0, never outer caller's param. |
| P03 | Defaults / missing define | **PASS** | Missing arguments use defaults; calling undefined procedure is a safe no-op. |
| P04 | Recursion | **PASS** | Stack frame isolation per recursive invocation; normal mode yields on loop/recursion. |
| P05 | Warp inheritance | **PASS** | Warp execution mode propagates to all downstream procedure calls in the call tree. |
| P06 | Stop inside define | **PASS** | `stop this script` inside a procedure acts as `return` to the calling site. |
| P07 | Stop at top level | **PASS** | `stop this script` at top level halts the thread and clears its execution stack. |
