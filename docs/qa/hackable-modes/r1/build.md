# R1 lane 2: Build — November 2, 2026

Branch `claude/racing-r1-build`, from a202bb8 (the contract). Plan: `docs/qa/hackable-modes/R1-SCREENS.md`, section C row 2.
Nothing outside this lane's files was changed. The Car's numbers (`race/carBrick.ts`) and the laps logic (`core/race.ts`)
are untouched.

## What changed

**Bricks drawer** (`race/raceDrawer.ts`)
- Groups: Track (Road, Dirt, Ice, Barrier, Boost pad, Finish line), Racers (Car, Computer racer), Start (Starter),
  then My bricks (remixes such as "My Car", and the kid's own bricks). Built-in bricks keep this fixed order; anything
  else follows in the level's order.
- Short hints (the paint strip shows them while painting a track brick): "Cars go fastest on road", "Bumpy: cars slow
  down on it", "Slippery: cars slide on it", "Cars bounce off it", "Shoots cars forward", "Laps count here. Paint it
  right across the road". The Car, the racer and the Starter have hints on their entries too.
- **The 'B' clash.** Race entries, hints and the armed entry all go by brick id, never by grid character. Also, the
  Platformer catalog (`builder/catalog.ts`) no longer takes another kit's built-in brick for one of its standard
  grid bricks: `standardKeyOf` and `drawerEntries` skip a brick whose catalog original is a different brick (the Boost
  pad is `brick_boost`, not `brick_brick`). Platformer bricks, remixed ones, and old saves with no catalog id match as
  before.
- `BuildDrawer.tsx` needed no change: race entries are all `brick:` entries, so it never reaches the Platformer's
  `standardTemplate`.

**The Car's card** (`race/carPresets.ts`, `workshop/knobs.ts`, `workshop/KnobsCard.tsx`)
- The four Build sliders up front (top speed, acceleration, steering, grip). Above them sit three buttons: **Kart**,
  **Drifty**, **On rails** ("How it drives"). The pressed one shows its one-line hint. After a slider moves, no button
  is pressed and the line says "Your own mix of numbers."
- Kart is exactly `CAR_KNOBS`. Drifty and On rails are `CAR_FEEL_PRESETS` (`car.ts:76`) converted the same way:
  speeds x 2, accelerations x 4, steering x 2, grip and ice grip `1 - (1 - k)^2`. Shares stay as they are. A preset sets
  only those ten numbers.
- "More sliders (15)" holds the rest, grouped: Speed, Steering, Grass dirt and ice, Boost pads. Each one has a plain
  hint. The Car's "boost ticks" shows as "boost time" ("30 is one second"). The hint does not name the code variable
  (new `quietOldNames` spec option).
- **Fixed ranges.** Spec knobs can now carry `min`, `max` and `step` (`BrickKnobSpec`). The Car's ranges are the race
  kit's Feel panel ranges, converted the same way, so every preset fits. A range only stretches to hold a saved value
  outside it. Dragging can't grow it.
- `BRICK_KNOB_SPECS` has `brick_car` and `brick_racer` (`racer_*` ids, its own top speed 5.8, no presets).

**Computer racers** (`screen/Inspector.tsx`)
- A racer's sliders (top speed, acceleration, steering, grip, "Every Computer racer / Just this one") use the spec's
  fixed ranges, for example top speed 3 to 12. Other bricks' sliders behave as before.

**Finish line arrow** (`screen/Inspector.tsx`, `race/raceBuild.css`)
- Selecting a finish cell shows "Cars cross it going right", an arrow and a Turn button. Each press turns it a
  quarter clockwise through `store.setFinishDirection`, and each turn is one undo step. Below it: "Laps count when cars
  cross the line this way." The empty "No sliders yet" note is hidden for the finish line.

**Laps chip** (`race/screens/LapsChip.tsx`, `race/screens/race.css`)
- It shows "Laps work" (green tick) or one of `RACE_LOOP_REASON_TEXT`'s three lines, word for word (amber). It is
  computed with `computeRaceLoop` on the saved tiles and bricks, so it updates as the kid paints, erases or turns the
  arrow. It sits top left over the level (on phones, above the bottom bar) and is a polite live region.

**Placement** (`builder/placement.ts`)
- New `landingPose(design, pose, x, y, step)` returns `{ x, y, direction? }`. For a race car (the Car, a racer, or a
  remix of either, only in a race level), the car moves to the nearest grid spot within about 6 cells where its box
  touches no Barrier (any grid brick whose code makes it solid). It also gets the track's direction there. Every other
  brick, and every Platformer brick, lands exactly as `landingSpot` places it (`landingSpot` is unchanged).
- New `trackFacing(design, x, y)` reads the engine's own lap numbering (`computeRaceLoop`) near the nearest road cell
  and points from the road a little behind to the road a little ahead. Within 30 degrees of a straight direction it
  snaps to that direction; otherwise it uses the nearest 45. This keeps a car at the road's edge, or on the grass, square
  to the road. On the beginner track it gives right, up, left and down on the four sides. It is undefined when laps
  can't count or no road is near. I did not use the `direction along the track` block: it aims at the middle of the
  road ahead, so a car at the edge would face diagonally.

## Tests (all new unless noted)

- `race/raceDrawer.test.ts`: groups and order, plain hints (no engine words), remixed Car and own bricks under My
  bricks. **'B' regression**: the race drawer names, hints and arms the Boost pad as itself with no `grid:` entries.
  The Platformer catalog never takes the Boost pad for its Brick. The Platformer's own Brick, remixed Brick and an
  old-save Brick still match.
- `race/carPresets.test.ts`: Kart equals `CAR_KNOBS` exactly (`toBe`). Drifty and On rails follow the conversion,
  with hand spot checks. Every preset fits its sliders. Every non-Build knob is in exactly one group. The racer spec is
  covered.
- `race/screens/LapsChip.test.tsx`: "Laps work". Painting produces each of the three reasons in the engine's exact
  words: a gap in the line, no finish line, the top straight cut. Changing the finish arrow updates the chip.
- `screen/Inspector.race.test.tsx`: the Car card (4 sliders, presets with Kart pressed, "More sliders (15)" with 4
  groups, no engine words). Presets set the numbers, and Kart restores them exactly. Ranges stay fixed while dragging.
  Racer sliders and their ranges are checked. The finish arrow turns 90, 180, -90, 0, 90, undoes, and the laps chip
  follows it. Other track bricks have no arrow.
- `builder/placement.test.ts` (added a describe block): race car detection, facing on all four sides and a corner,
  undefined off-road and without a finish line, a Car dropped on a Barrier clears it on the grid facing right, a racer
  on the road stays put facing up, and other bricks and Platformer bricks are unchanged.

Gate, under heavy load from other lanes: `npx tsc -b` is clean. `npx vitest run src/platformer src/projects src/pages`
ran 2199 passing tests and the 25 expected fails, with 6 failures across 5 files. Four of those files pass when run
alone: `race/carBrick.test.ts` 9/9, `CodeEditor.loadFailure` 4/4, `persist/fileRoundTrip` 6/6, `core/perf` 4/4.
`CodeEditor.sections` times out at 60 s even when run alone; it is one of the known load-sensitive suites. All 93
tests in this lane's files pass.

## Integrator requests

1. **`studio/Stage.tsx`, placing a brick** (`placeCopy`, around line 455). Use the pose so cars land clear of Barriers
   and face along the track:
   ```ts
   const at = landingPose(store.getState().project.design, { brickId }, x, y, GRID)
   const id = store.addCopy(brickId, at.x, at.y)
   if (at.direction !== undefined) store.updateCopy(id, { direction: at.direction })
   const copy = store.getState().project.design.copies.find((c) => c.id === id)
   if (copy && history) history.push(addCopyEdit(history, copy))
   ```
   (import `landingPose` from `./builder/placement`; Platformer bricks never get `direction`, so nothing changes there).
2. **`studio/Stage.tsx`, dropping a moved copy** (`finishStroke`, around line 474). Use `landingPose(design, copy,
   copy.x, copy.y, GRID)` too and also update `direction` when it is set and differs. Undo then needs the old direction:
   either extend `moveCopyEdit` with an optional direction, or keep moves position-only (simpler, and the car keeps
   the way it faced). My preference: re-face on drop, with undo.
3. **Lane 4 / renderer**: the finish line has no arrow on the level itself (R1-SCREENS D, engine gaps). The inspector
   arrow is the only place that shows it today.

## What I couldn't do / left

- No in-browser check: the machine was loaded with other lanes' suites, and the chip and placement need the
  integrator's Stage wiring to be visible end to end. The chip's position (top left, under the first-run tips) should be
  looked at on a real screen next to the view tools.
- The race drawer lists the level's bricks only. A built-in race brick missing from a level is not offered (kids can't
  delete built-in bricks today, so every race level has them). Re-adding one would need `store.addBrickFrom` to accept
  a preferred id, so it comes back as the built-in brick rather than as a new "My brick".
- Presets are only for the Car. Racers get fixed-range sliders but no presets.
