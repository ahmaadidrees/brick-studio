# Fluent First Build — closure evidence

Sprint scope: one conflict-free input grammar, loaded brush, world-first
feedback, predictable height + right-sized framing, leveled editing verbs
(work orders WO-1..WO-13; WO-14 is this closeout). Baseline `1a5e009`,
146 tests. Closing state: **171 tests across 20 files, tsc clean,
production build green.**

## Shipped behavior

- **Drag guard (WO-1):** mouse clicks that travelled > 5 px never place or
  select — `event.delta` guards on Baseplate/BrickObject clicks, a
  pointer-travel tracker guards `onPointerMissed` (r3f's raw MouseEvent has
  no delta). Touch keeps its existing 8 px classifier.
- **Mapping flip (WO-2):** left-drag orbits, right-drag and Shift-drag pan
  (capture-phase modifier swap ahead of OrbitControls), marquee belongs to
  the Select tool only, ghost freezes during camera gestures via
  OrbitControls onStart/onEnd.
- **Loaded brush (WO-3):** placeDraft keeps part + color armed, re-arms the
  ghost stacked on the placed brick, no longer steals selection; history
  stores empty selections so redo cannot re-select; the brush survives
  undo/redo and Explore round-trips; Esc disarms.
- **Feedback (WO-5/6/7/9):** hover glow (per-brick emissive), place pop +
  soft WebAudio click (shared lazily-resumed context), blocked shake keyed
  off a discrete blockedNonce, success toasts retired in favor of a
  visually-hidden aria-live announcer (errors/budget/guidance/undo keep the
  visible banner).
- **Center-pivot rotation (WO-8):** footprint center fixed via trunc
  compensation (Math.round drifts odd-size parts — proven by four-turn
  no-drift tests for 2×3 and 1×4), clamped to the plate before validation.
- **Height + framing (WO-10/11/12):** ghost height = highest support under
  the whole footprint (`supportHeightForFootprint`, 7 new tests); empty
  plate frames a ~16-stud working area (home distance 46.4 → 13.6 world
  units); the ghost spawns at the published camera focus on real support.
- **Group recolor (WO-13):** one undo entry, same-color bricks skipped,
  palette in the multi-selection inspector.
- **Copy alignment (WO-9):** shortcut bar, onboarding, README, and contract
  all describe the shipped grammar.

## Live verification (dev server, desktop viewport)

1. Armed ghost + left-drag on empty plate → camera orbited, brick count
   unchanged (2/250), no toast. Repeated on the merged build. The original
   pan-places-a-brick misfire is dead.
2. Hover + click × 2 with no drawer trips → 2 bricks, tile still active,
   inspector still "Placing", ghost re-armed stacked (X/Y/Z readout).
3. Empty plate on fresh load → 16-stud working-area framing; the first
   ghost is screen-legible (previously a ~20 px speck at full-plate zoom).
4. Onboarding, shortcut bar, and placing card show the new copy.
5. Esc parks the brush; placed-brick list and `[`/`]` selection intact.

## Accepted notes

- PageUp/PageDown height override is still clobbered by the next
  pointer-move (pre-existing; explicitly accepted this sprint).
- `placeFeedback` is never cleared; a brick remount replays one silent
  scale-pop (accepted as harmless; click sound cannot replay).
- Two QA items verified at unit level only (hover glow render, shake
  animation) — covered by store/scene tests; visual spot-check on next
  device pass.

Commits: 90fd9e1 (spine WO-1..4), 0d93571 (CI), 42e397c (WO-9),
b8ad1b9 (WO-13), 117af21+1181492 (WO-8), 1c7257e+1b6df54 (WO-5/6/7),
fa5ce7b (WO-10), 1026d6f (WO-11), 93d5daa (WO-12).
