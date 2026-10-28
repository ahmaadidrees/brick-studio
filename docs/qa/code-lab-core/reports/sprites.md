# Core Primitives: Sprites Lane Report

## 1. What Was Built and Where

The sprites lane implements the core Scratch 3-compatible primitive operations for sprite and stage motion, appearance (looks), and sound within the Code Lab deterministic runtime. All primitives adhere to the y-up coordinate system, deterministic math libraries (`detmath.ts`, `geometry.ts`), and the `contracts.ts` architecture.

### Files Owned and Built:
- `src/platformer/lab/core/motion.ts` (and `src/platformer/lab/core/motion.test.ts`):
  - **17 motion opcodes**: `motion_movesteps`, `motion_turnright`, `motion_turnleft`, `motion_pointindirection`, `motion_pointtowards`, `motion_gotoxy`, `motion_goto`, `motion_glidesecstoxy`, `motion_glideto`, `motion_changexby`, `motion_setx`, `motion_changeyby`, `motion_sety`, `motion_ifonedgebounce`, `motion_setrotationstyle`, `motion_xposition`, `motion_yposition`, `motion_direction`.
  - **Fencing & coordinate management**: Partial-costume fencing (`fencePosition`) preserving at least $\min(15, \lfloor\min(w, h)/2\rfloor)$ pixels inside level boundaries; integer snapping (`reportCoordinate`) for values within $10^{-9}$ of an integer while preserving unquantized internal storage; exact continuous float wrap (`wrapDirection`) mapping angles into $(-180, 180]$.
  - **Clean-room bounce**: Direct y-up vector reflection where $v_x = \sin(d)$ and $v_y = \cos(d)$, inward velocity clamping to minimum magnitude $0.2$, post-bounce interior repositioning, and vector angle conversion via `atan2Deg(vx, vy)`.
  - **Target gating**: Suppression of redraw requests for hidden sprites; drag-lock (`setDragging`, `isDragging`) suppressing programmatic block motion unless forced; ignoring motion blocks targeting the stage.

- `src/platformer/lab/core/looks.ts` (and `src/platformer/lab/core/looks.test.ts`):
  - **17 looks opcodes**: `looks_say`, `looks_think`, `looks_sayforsecs`, `looks_thinkforsecs`, `looks_switchcostumeto`, `looks_nextcostume`, `looks_switchbackdropto`, `looks_switchbackdroptoandwait`, `looks_nextbackdrop`, `looks_changesizeby`, `looks_setsizeto`, `looks_changeeffectby`, `looks_seteffectto`, `looks_cleargraphiceffects`, `looks_show`, `looks_hide`, `looks_gotofrontback`, `looks_goforwardbackwardlayers`, `looks_costumenumbername`, `looks_backdropnumbername`, `looks_size`.
  - **Costume & backdrop classification**: Unified resolution algorithm following L01: numbers are 1-based indices (or 0-based relative deltas); strings check exact case-sensitive name first, followed by relative keywords (`next backdrop`, `previous backdrop`, `random backdrop`), and non-whitespace numeric fallback.
  - **Bubble formatting & concurrency**: `formatBubble` formats numbers to 2 decimal places (`parseFloat(n.toFixed(2))`) up to 330 chars; monotonic bubble IDs prevent stale timed bubbles (`looks_sayforsecs`) from clearing newer active bubbles.
  - **Size and effect clamping**: `clampSize` scales between minimum $5/\max(w, h)$ and maximum $1.5 \times \text{world.bounds}$; graphic effects clamped (`ghost` to $0..100$, `brightness` to $-100..100$, case-insensitive field parsing).
  - **Target gating**: Stage targets ignore sprite costume changes, say/think bubbles, size changes, show/hide, and layer shifting.

- `src/platformer/lab/core/sound.ts` (and `src/platformer/lab/core/sound.test.ts`):
  - **8 sound opcodes**: `sound_play`, `sound_playuntildone`, `sound_stopallsounds`, `sound_changeeffectby`, `sound_seteffectto`, `sound_cleareffects`, `sound_changevolumeby`, `sound_setvolumeto`, `sound_volume`.
  - **Sound resolution**: Follows L01 rules: exact name match first, followed by 1-based wrapped index conversion.
  - **Headless notes & timed execution**: Emits `RuntimeNote` records (`{ kind: 'sound', targetId, sound, volume, pitch, pan }` and `{ kind: 'stopSounds' }`). `sound_playuntildone` yields control across ticks until `nowMs >= startMs + durationMs`.
  - **Clamping**: Sound effects clamped (`pitch` to $[-360, 360]$, `pan` to $[-100, 100]$); volume clamped to $[0, 100]$.
  - **Stage support & lifecycle hooks**: Supports sounds on both sprites and the stage; exports `onGreenFlagSound` and `onStopAllSound`.

---

## 2. Fixture Coverage Table

| Fixture ID | Description | Test Name / Location | Status |
| :--- | :--- | :--- | :--- |
| **M01** | Coordinates & unrounded direction | `motion.test.ts: M01 · coordinates and direction`, `M01 · diagonal move uses unrounded degrees` | PASS |
| **M02** | Negative, fractional & non-numeric steps | `motion.test.ts: M02 · negative and fractional steps, and non-numeric steps` | PASS |
| **M03** | Direction wrapping into `(-180, 180]` | `motion.test.ts: M03 · direction wrapping` | PASS |
| **M04** | Position reporters snap near integers ($10^{-9}$) | `motion.test.ts: M04 · position reporters snap near integers and leave storage raw` | PASS |
| **M05** | Ordinary fencing & bottom-left origin levels | `motion.test.ts: M05 · ordinary fencing`, `M05 · fencing on bottom-left origin level (T1)` | PASS |
| **M06** | Small-costume fence & ceil/floor corrections | `motion.test.ts: M06 · small-costume fence and ceil/floor corrections` | PASS |
| **M07** | Dragging lock & forced moves | `motion.test.ts: M07 · dragging blocks block motion unless forced`, `M07 · glide while dragged leaves position untouched (T2)` | PASS |
| **M08** | Go to menu: mouse, sprite, missing, random | `motion.test.ts: M08 · go to mouse, original sprite, missing sprite, and random`, `M08 · random position is inside a bottom-left level` | PASS |
| **M09** | Point towards: sprite, mouse, random, identical point | `motion.test.ts: M09 · point towards` | PASS |
| **M10** | Glide interpolation & tick clock accuracy | `motion.test.ts: M10 · glide snapshots the endpoint and interpolates`, `M10 · glide secs to x y reaches the end on the tick clock` | PASS |
| **M11** | Nonpositive glide jumps and fences in 1 turn | `motion.test.ts: M11 · nonpositive glide jumps and fences in the same turn` | PASS |
| **M12** | Nearest edge bounce with minimum inward velocity | `motion.test.ts: M12 · bounce reflects off the nearest edge`, `M12 · a near-tangent bounce keeps an inward component, then the costume is pulled inside` | PASS |
| **M13** | Edge contact: flush bounces, past fences | `motion.test.ts: M13 · flush with the edge bounces but is not past it` | PASS |
| **M14** | Rotation style transforms pose, not stored direction | `motion.test.ts: M14 · rotation style changes the picture, not the stored direction` | PASS |
| **L01** | Costume name, numeric & fallback resolution | `looks.test.ts: L01 · costume names, numbers, and fallback resolution` | PASS |
| **L02** | Costume wrapping: next, zero, 4+, float, nonfinite | `looks.test.ts: L02 · costume wrap for next, zero, out of range, fractional, and nonfinite` | PASS |
| **L03** | Costume rotation center switch leaves (x, y) unchanged | `looks.test.ts: L03 · rotation center switch never alters target coordinates` | PASS |
| **L04** | Size clamping against costume & level bounds | `looks.test.ts: L04 · size clamping against costume dimensions and stage bounds` | PASS |
| **L05** | Graphic effects clamps & case normalization | `looks.test.ts: L05 · graphic effects clamps, lowercase normalization, and unknown effects` | PASS |
| **L06** | Ghost effect state storage (transparency flag) | `looks.test.ts: L06 · ghost effect is stored in state (collision/picking owned by clones-sensing)` | PASS |
| **L07** | Show/hide flags & redraw gating | `looks.test.ts: L07 · show and hide visibility toggling and redraw gating` | PASS |
| **L08** | Layer shifting (front, back, forward, backward, clamping) | `looks.test.ts: L08 · layer operations (front, back, forward, backward, clamping, truncation)` | PASS |
| **L09** | Bubble formatting: 2 decimals, empty string clear | `looks.test.ts: L09 · plain say and think formatting and empty string bubble clearing (B1)` | PASS |
| **L10** | Timed bubbles yield until deadline ($\ge 1$ yield for 0s) | `looks.test.ts: L10 · timed say and think yield until deadline` | PASS |
| **L11** | Bubble overwrite concurrency race handling | `looks.test.ts: L11 · bubble overwrite race: older timed bubble does not clear newer bubble` | PASS |
| **L12** | Green flag & stop-all looks hooks | `looks.test.ts: L12 · green flag and stop-all graphic effects and bubble hooks` | PASS |
| **Backdrop** | Backdrop name-first, special strings, notes, hats | `looks.test.ts: Backdrops · switch backdrop, name-first (B3), special strings, notes, and hats` | PASS |
| **S01** | Sound resolution by name, 1-based number, wrap | `sound.test.ts: sound resolution by name, 1-based number, wrap, and non-numeric strings` | PASS |
| **S02** | `sound_play` emits note with volume/pitch/pan | `sound.test.ts: sound_play emits sound note with volume and effects and does not yield or redraw` | PASS |
| **S03** | `sound_playuntildone` yields for durationMs | `sound.test.ts: sound_playuntildone yields until durationMs passes` | PASS |
| **S04** | `sound_stopallsounds` emits `stopSounds` | `sound.test.ts: sound_stopallsounds emits stopSounds note` | PASS |
| **S05** | Sound effects: pitch/pan set, change, clamp, clear | `sound.test.ts: sound effects set, change, clamp, and clear` | PASS |
| **S06** | Sound volume: set, change, clamp, reporter | `sound.test.ts: volume set, change, clamp, and reporter` | PASS |
| **S07** | Stage target sound playback and volume/effects | `sound.test.ts: stage target supports sounds and sound volume/effects` | PASS |
| **S08** | Green flag & stop-all sound hooks | `sound.test.ts: lifecycle hooks onGreenFlagSound and onStopAllSound` | PASS |

---

## 3. Deliberate Differences from Scratch

1. **Continuous Float Direction Wrap (B2)**:
   - *Scratch VM*: In certain historical versions and edge blocks, direction is cast or rounded before wrapping or clamping.
   - *Code Lab*: Uses exact continuous float wrapping into the half-open interval $(-180, 180]$ via `d - 360 * Math.ceil((d - 180) / 360)`. This preserves sub-degree trajectory determinism for physics-heavy platformer calculations.
2. **Level Dimensions as Stage Bounds for Size Clamping (B4)**:
   - *Scratch VM*: Size scaling is hardcoded to a $480 \times 360$ canvas, clamping maximum scale to $\min(1.5 \times 480 / w, 1.5 \times 360 / h)$.
   - *Code Lab*: Under Decision 2 ("the level is the stage"), `clampSize` computes `maxScale` relative to `world.bounds` (the level width and height). This enables large bosses and terrain sprites to scale appropriately on sprawling levels.
3. **Bounding Rectangle Bounding**:
   - *Scratch VM*: Uses rasterized canvas skin bounding hulls with alpha threshold testing.
   - *Code Lab*: In core primitives, bounding is computed deterministically from costume dimensions and rotation centers (`targetBounds`), avoiding rasterizer canvas dependencies in headless execution.
4. **Headless Sound Notes**:
   - *Scratch VM*: Instantiates Web Audio / AudioContext nodes and audio buffers.
   - *Code Lab*: Emits `RuntimeNote` records (`{ kind: 'sound', ... }` and `{ kind: 'stopSounds' }`) allowing headless server simulation, determinism, and decoupled frontend audio synthesis.

---

## 4. Contract Change Requests

### C1: Formal Lifecycle Hooks on `RuntimeApi` or Event Loop
Currently, primitive modules export lifecycle cleanup functions (`onGreenFlagLooks`, `onStopAllLooks`, `onGreenFlagSound`, `onStopAllSound`). The scheduler should have a standard registration mechanism for lifecycle events.

**Suggested diff in `src/platformer/lab/core/contracts.ts`**:
```diff
--- a/src/platformer/lab/core/contracts.ts
+++ b/src/platformer/lab/core/contracts.ts
@@ -102,6 +102,8 @@ export interface RuntimeApi {
   emit(note: RuntimeNote): void
   requestRedraw(): void
   random(): number // deterministic seeded float in [0, 1)
+  onGreenFlag(fn: (runtime: RuntimeApi) => void): void
+  onStopAll(fn: (runtime: RuntimeApi) => void): void
 }
```

### C2: First-Class `isDragging` State on `Target`
Currently, `motion.ts` tracks dragging targets using a module-scoped `WeakSet<Target>`. Moving `isDragging` directly into `Target` allows complete serialization of the world state during snapshots and replays.

**Suggested diff in `src/platformer/lab/core/contracts.ts`**:
```diff
--- a/src/platformer/lab/core/contracts.ts
+++ b/src/platformer/lab/core/contracts.ts
@@ -62,6 +62,7 @@ export interface Target {
   visible: boolean
   size: number // percent, 100 = nominal costume size
   rotationStyle: 'all around' | 'left-right' | "don't rotate"
+  isDragging?: boolean
   effects: Record<EffectName, number>
   bubble: Bubble | null
   volume: number // volume in percent (0..100)
```

---

## 5. Open Questions for Wave 2

1. **Active Sound Tracking**: Should `Target` track currently active sound handles so that stopping sounds for a single sprite (or deleting a clone) can cancel only that target's playback rather than issuing a global `stopSounds` note?
2. **Rich Text / Dialogue Styling**: Will speech/thought bubbles eventually support formatted text (e.g. character portrait tags or color highlights) in the platformer UI?
3. **Camera vs World Bounds**: If Wave 2 introduces a dynamic camera that decouples the view frustum from world boundaries, should fencing continue to use `world.bounds`, or should certain objects fence against the active camera viewport?
