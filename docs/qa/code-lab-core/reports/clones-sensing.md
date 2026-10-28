# Clones & Sensing Lane Report (Wave 1)

## 1. Overview & Deliverables
- **Lane**: `clones-sensing`
- **Branch**: `grok/core-clones-sensing`
- **Engine Core Files Owned**:
  - `src/platformer/lab/core/clones.ts`: Clone creation, defaults-for-brick fallback, snapshotting, and clone deletion.
  - `src/platformer/lab/core/clones.test.ts`: Unit test suite for clone behavior (C01–C07, C09, C11, C12, edge cases, menus).
  - `src/platformer/lab/core/touching.ts`: Pixel-accurate costume collision, transformed bounds checking, and level-boundary edge detection.
  - `src/platformer/lab/core/touching.test.ts`: Pixel mask hit testing, transformed costume overlaps, edge bounding box, and ghost transparency.
  - `src/platformer/lab/core/sensing.ts`: Sensing block primitives, ask/answer queuing handshake, deterministic host clock, key parsing, and distance/attribute reporters.
  - `src/platformer/lab/core/sensing.test.ts`: Unit test suite for sensing primitives (S01–S03, S07–S13, M13, shadow menus, multi-world isolation).
  - `docs/qa/code-lab-core/reviews/clones-sensing-review-1.md`: Previous worker review record.
  - `docs/qa/code-lab-core/reports/clones-sensing.md`: This report.

---

## 2. Fixture Coverage Table

| Fixture | Description | Status | Test Name / Location | Notes |
| :--- | :--- | :--- | :--- | :--- |
| **C01** | State snapshot | Pass | `clones.test.ts` > `C01 · state snapshot` | Copies x, y, direction, draggable, visible, size, costumeIndex, rotationStyle, effects, local variables, edgeHatState. |
| **C02** | Running stack isolation | Pass | `clones.test.ts` > `C02 · clone does not copy a bubble or a running stack` | Say/think bubble reset to `null`; call stack/promises not copied. |
| **C03** | Event trigger timing | Pass | `clones.test.ts` > `C03 · create clone starts only the new clone hat` | Invokes `runtime.addClone(clone, source)` which starts `control_start_as_clone` only on the new clone. |
| **C04** | Layering | Pass | `clones.test.ts` > `C04 · layer` | Clone is inserted immediately behind the source target. |
| **C05** | Global limit | Pass | `clones.test.ts` > `C05 · global limit` | Enforces `CLONE_LIMIT = 300` across all sprites; deletes free slots. |
| **C06** | Delete original ignored | Pass | `clones.test.ts` > `C06 · delete original` | `control_delete_this_clone` is a no-op on non-clone originals. |
| **C07** | Delete runtime clone | Pass | `clones.test.ts` > `C07 · delete runtime clone` | Clones are removed from `world.targets`, decrementing `cloneCount`. |
| **C08** | Broadcast to clones | Skipped | N/A (Scheduler / Events responsibility) | Clones reside in `world.targets`; event dispatch iterating `world.targets` will reach clones. |
| **C09** | Clone of clone | Pass | `clones.test.ts` > `C09 · clone of clone` | Cloning `_myself_` copies the clone's pose; cloning by name snapshots the brick's original. |
| **C10** | Stop other scripts in sprite | Skipped | N/A (Scheduler / Threads responsibility) | Handled by thread termination logic in scheduler. |
| **C11** | Local list cloning | Pass | `clones.test.ts` > `C11 · local lists` | Local lists are shallow-copied (`slice()`); stage/global lists are shared. |
| **C12** | Uninherited assumptions | Pass | `clones.test.ts` > `C12 · uninherited bubble, volume, and sound effects` | Bubble is cleared; volume defaults to 100; sound effects reset to 0; pending asks/calls not cloned. |
| **S01** | Sprite touching follows opaque pixels | Pass | `touching.test.ts` > `S01 · ...`, `sensing.test.ts` > `S01 · ...` | Broad-phase AABB overlap followed by narrow-phase sampling of step centers `(ix + 0.5, iy + 0.5)`. |
| **S02** | Dragged sprite asymmetry | Pass | `sensing.test.ts` > `S02 · named sprite includes clones and skips a dragged candidate` | Dragged target can sense others; others ignore the dragged target. |
| **S03** | Hidden sprite asymmetry | Pass | `sensing.test.ts` > `S03 · hidden asymmetry`, `touching.test.ts` > `S03 · ...` | Hidden target cannot touch other sprites, but can touch mouse pointer and level edge. |
| **S04** | Touching color | Pass (Stub) | `sensing.test.ts` > `reads the host clock, mouse...` | Color sampling deferred to wave 2; stub returns `false` deterministically. |
| **S05** | Color touching color | Pass (Stub) | `sensing.test.ts` > `reads the host clock, mouse...` | Stub returns `false` deterministically. |
| **S06** | Color sampling on stage/pen | Pass (Stub) | `sensing.test.ts` > `reads the host clock, mouse...` | Stub returns `false` deterministically. |
| **S07** | Distance to sprite / mouse | Pass | `sensing.test.ts` > `S07 · distance` | Euclidean distance; stage or nonexistent target returns 10000; named sprite targets original. |
| **S08** | Attribute of (`sensing_of`) | Pass | `sensing.test.ts` > `S08 · attribute of` | Inspects position, direction, costume #/name, size, volume, variables; stage inspects backdrop #/name, background #, volume, globals. |
| **S09** | Timer | Pass | `sensing.test.ts` > `S09 · timer` | Deterministic exact tick math `(world.tick - world.timerStartTick) / TICKS_PER_SECOND`. |
| **S10** | Key pressed | Pass | `sensing.test.ts` > `S10 · key names` | Supports named specials (`space`, `enter`, arrows), ASCII keycodes, single character case-insensitivity, and `'any'`. |
| **S11** | Mouse down / mouse x / y | Pass | `sensing.test.ts` > `reads the host clock, mouse...` | Direct deterministic reads from `world.mouse`. |
| **S12** | Ask and wait queue | Pass | `sensing.test.ts` > `S12 · ask queue` | Enqueues prompt, yields thread, emits `ask` runtime note, resolves on `submitAnswer`. |
| **S13** | Shared answer and reset | Pass | `sensing.test.ts` > `S13 · shared answer and reset` | Answer shared in `world.answer`; `resetAnswer` clears answer; `clearQuestions` / `clearTargetQuestions` manage queue. |
| **M13** | Touching edge | Pass | `touching.test.ts` > `M13 · ...`, `sensing.test.ts` > `M13 · ...` | Strict past `world.bounds`; sits on boundary is false; hidden sprite still touches edge. |
| **L06** | Ghost effect touching | Pass | `touching.test.ts` > `L06 · ghost does not stop sprite touching` | Ghost effect does not reject pixel collisions. |

---

## 3. Deliberate Differences from Scratch

1. **Step-Center Pixel Sampling vs. Integer Grid Points**:
   - *Behavior*: In `touching.ts`, narrow-phase collision samples the center of every 1x1 world step `(ix + 0.5, iy + 0.5)` contained in the intersection of the two targets' bounding boxes.
   - *Rationale*: Scratch's SVG/bitmap renderer rasterizes on half-open pixel bounds; sampling integer boundary edges causes false-positive hits along adjacent non-overlapping tiles. Sampling step centers matches standard rasterization and avoids zero-area boundary collisions.

2. **Transformed Costume Bounds from Rectangle Corners**:
   - *Behavior*: `geometry.ts:targetBounds` computes bounding boxes by transforming the four corners of the costume's `opaqueRect`.
   - *Rationale*: Calculating exact pixel-hull bounding boxes on every rotation is computationally prohibitive. Corner-based bounding boxes are fast, conservative, deterministic, and tight enough for the broad-phase filter.

3. **Fallback Clone Origin (`defaultsFor`)**:
   - *Behavior*: When creating a clone of a named brick that has no painted original instance in `world.targets`, the clone defaults to `(world.bounds.left, world.bounds.bottom)`.
   - *Rationale*: Code Lab's world coordinate system defines `(0, 0)` as the bottom-left corner of the level (`world.bounds.left, world.bounds.bottom`), unlike Scratch's centered `(0, 0)` canvas. Placing uninstantiated brick clones at the level origin aligns with Code Lab level conventions.

4. **Uninherited Sound Volume and Effects**:
   - *Behavior*: `makeClone` resets `volume: 100` and `soundEffects: { pitch: 0, pan: 0 }`.
   - *Rationale*: In Scratch core, `Target` cloning does not duplicate audio extension state. Extension listeners in Scratch hook into target creation to duplicate sound effects, but Code Lab core audio blocks treat clones as fresh sound targets unless explicitly modified by script.

5. **Color Sampling Stubs**:
   - *Behavior*: `sensing_touchingcolor` and `sensing_coloristouchingcolor` return `false`.
   - *Rationale*: Wave 1 platformer core does not include offscreen framebuffer rasterization or stage/pen pixel readback. Returning `false` prevents non-deterministic failures.

6. **Deterministic Time and Hardware Stubs**:
   - *Behavior*: Core forbids `Date` and `navigator/mediaDevices`. `sensing_current` reads a deterministic `HostClock` injected via `setHostClock(world, clock)` (returning 0 if unset). `sensing_dayssince2000` is 0; `sensing_loudness` is 0; `sensing_loud` is false; `sensing_username` and `sensing_userid` are `''`.
   - *Rationale*: Ensures full determinism for replay and lockstep simulation.

---

## 4. Ask Handshake Protocol

The `sensing_askandwait` block coordinates asynchronous host interaction with synchronous core execution via the following protocol:

1. **Ask Initiation**:
   - A thread executes `sensing_askandwait`.
   - If `ctx.frame.askId` is undefined, the question is enqueued in the world's ask queue:
     ```ts
     interface QueuedAsk {
       id: number
       targetId: string
       question: string
       visible: boolean
       isStage: boolean
       state: 'waiting' | 'answered'
     }
     ```
   - If this is the only waiting question in the queue, an `ask` note is immediately emitted to the host:
     ```ts
     runtime.emit({ kind: 'ask', targetId: item.targetId, question: item.question })
     ```
   - The thread saves `frame.askId = item.id` and yields (`return YIELD`).
2. **Subsequent Thread Steps**:
   - On subsequent execution steps of the thread, `askAndWait` inspects the state of its queued item.
   - While `item.state === 'waiting'`, `askAndWait` returns `YIELD`, keeping the thread paused.
3. **Host Answering (`submitAnswer`)**:
   - When the user submits an answer, the host calls `submitAnswer(runtime, answerText)`.
   - `submitAnswer` writes `world.answer = answerText` and transitions the oldest waiting question to `'answered'`.
   - If further questions remain queued, `submitAnswer` emits an `ask` note for the next waiting question.
4. **Thread Resumption**:
   - On the next scheduler step, the thread sees `item.state === 'answered'`.
   - It removes the item from the queue and returns without yielding (`return undefined`), allowing the script to continue.
5. **Reset & Cancellation Lifecycle**:
   - `resetAnswer(world)`: Sets `world.answer = ''` on green flag without discarding queued questions.
   - `clearQuestions(runtime)`: Drops all queued questions on stop-all.
   - `clearTargetQuestions(runtime, target)`: Drops questions owned by a terminated target or deleted clone. If the removed question was actively displayed, emits an `ask` note for the new head of the queue.
   - `activeQuestion(world)`: Allows host/UI renderers to query the active prompt, including `visible` and `isStage` flags for speech bubble vs. bottom input bar placement.

---

## 5. Contract Change Requests

Because contracts cannot be edited in wave 1, the following state is currently stored locally in module-level `WeakMap` / `WeakSet` instances:
- `dragged: WeakSet<Target>`: Tracks transient dragging status for S02 collision filtering.
- `clocks: WeakMap<World, HostClock>`: Stores deterministic date/time input for `sensing_current`.
- `questions: WeakMap<World, QueuedAsk[]>`: Stores per-world ask queues for S12/S13.
- `askIdCounters: WeakMap<World, number>`: Generates sequential ask IDs per world.

### Proposed Additions for Wave 2 / Shared Contracts:
1. **`World.questions?: QueuedAsk[]`**:
   - Storing the question queue directly on `World` ensures serialization, snapshot rollback, and replay fidelity.
2. **`World.hostClock?: HostClock`**:
   - Moving host clock injection onto `World` avoids external weak maps and standardizes time mock injection for all lanes.
3. **`Target.dragging?: boolean`**:
   - Adding a boolean `dragging` field to `Target` makes dragging state explicit and persistent across clones/targets.

---

## 6. Open Questions & Integration Requirements

1. **Shadow Menu Opcodes**:
   - Menus for `sensing_touchingobjectmenu`, `sensing_distancetomenu`, `sensing_keyoptions`, `sensing_of_object_menu`, `sensing_currentmenu`, and `control_create_clone_of_menu` are implemented as primitives returning `ctx.field(...) || ctx.arg(...)`.
   - *Confirmation*: Confirm whether compiler emits them as AST block calls or inline field arguments. Both are supported.
2. **Ask Bubble Display**:
   - When a visible sprite asks a question, Scratch renders a say bubble above the sprite and clears it once answered.
   - Currently, `activeQuestion(world)` exposes `{ visible, isStage }` so host renderers can display either a speech bubble or an on-screen dialog. If core should mutate `target.bubble` directly, this should be standardized with the Looks lane.
3. **Scheduler Lifecycle Hooks**:
   - The scheduler must call:
     - `resetAnswer(world)` and `clearQuestions(runtime)` on green flag / restart.
     - `clearQuestions(runtime)` on stop all.
     - `clearTargetQuestions(runtime, target)` when stopping an individual sprite or deleting a clone (`control_delete_this_clone`).
4. **Synthetic Clone Layering**:
   - When `createCloneOf` is called for a brick that has no painted instance in `world.targets`, a synthetic source target is passed to `runtime.addClone(clone, source)`. In `fakeRuntime`, `indexOf(source) === -1` results in prepending the clone to index 0 (bottom layer). Runtime implementations should follow this convention.
