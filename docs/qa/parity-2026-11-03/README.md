# Classic vs Hackable parity audit, November 3, 2026

The owner wants to keep the classic 2D builders (a hit with students) until the Hackable versions "feel identical",
and asked for this audit. It compares production code (plus the unshipped Hackable rooms M0/M1 on
`claude/hackable-rooms`). Method:
- three read-only code audits: the Platformer, Racing, and everything around the game;
- a look at both builders on brickgineers.com;
- spot checks of the most surprising claims.

Nothing was played on a real device; feel numbers come from the existing feel harnesses.

## Verdict

**The engines match; the games don't yet.**
- **The cores already feel the same.**
  - The Hackable Hero passes all 25 feel numbers against the classic engine (`docs/qa/code-lab-core/FEEL.md`).
  - The Hackable Car's 11 driving numbers are within tolerance (`docs/qa/hackable-modes/RACE_FEEL.md`).
  - Lap counting is a cell-for-cell port.
- **Around the core, Hackable has about a third of classic.**
  - **Bricks:** the Platformer palette has 13 bricks against classic's 23, and Racing has 9 against classic's 19.
  - **Platformer:** no deaths in pits, no power-ups, one critter, no sound, no characters, and short levels.
  - **Racing:** no items, no car bumping, no water or jumps, and tiny cars.
- **Around the game,** there is no build-together, no share link, no micro:bit, no teacher edits, and no way to open
  an old classic level.

So retiring classic now would take away things kids use every day. The good news: the gaps are a finite list, and the
hardest part (feel) is done.

## Scorecard

| Area | Same or better | Partly there | Missing |
|---|---|---|---|
| **Platformer play** | movement and feel; ground, spikes, lava, one-way, bounce, hard block; select/move/nudge; undo; zoom | goal, ? blocks (coins only), springs, Walker (3× too fast), HUD (coins only), camera (no look-ahead), wall slide (90 vs 60 px/s) | falling death, hurt and safe time, checkpoints, Grow/Spark power-ups, big Hero, crouch, throwing, brick breaking, Shellbug, Spiky, Flyer, moving platforms, pipes, characters and animation, cartoon and underground looks, sound and music, timer and best time, play-from-here, level length (60 vs 160 tiles) and resize, 3 courses |
| **Racing** | driving feel; road, dirt, ice; laps and gates; painting, erase, undo; whole-track zoom; touch driving | boost pad (no arrow, any direction), barrier bounce, countdown, finish arrow (card only), results (places, no times), computer racers (turn instantly), keys (arrows only) | car-to-car bumping, ? blocks and all items (Turbo, Oil, Ball, Spark, Shield), coins, Walkers, water, jump ramps, tire stacks, bumpers, scenery, studded look, race timer and best lap, live standings, laps in Build, starters (only one), "back on road" |
| **Around the game** | My projects, import/export, offline, conflicts (better), remix (better) | play together (built, not live), invite sheet (look only), class page (opens the studio, not the room), browser storage (about 8 projects fit), version history (about 14 versions fit) | build-together, room host controls, room saving and recovery copies, share link and play page, teacher editing a student's project, teacher starting a shared Hackable world, micro:bit Remote and gamepad, opening classic levels, a Chromebook performance check |

**Hackable is already ahead on:**
- every brick being open code, powers, per-brick sliders, and making your own bricks;
- costume and sound editors, select/move/nudge, real zoom, a computer racer brick, and car presets;
- the class shelf, and a conflict copy instead of lost work.

## The gaps, in four buckets

Cost: S under half a day, M 1–2 days, L more than 2 days. "Notice" is how likely a student is to notice.

### A. Rules and feel: cheap, and they make Hackable feel right (about 1 week)

| Gap | Notice | Cost |
|---|---|---|
| Falling into a pit kills (the level floor is solid by default: `lab/core/contracts.ts:416`) | high | S |
| Classic keys: Space/X/K jump, Shift/Z/J run, WASD (Hackable runs on x: `studio/hero/heroBrick.ts:99`; classic `src/platformer/input/input.ts:12-30`) | high | S |
| Hurt: safe time, a death pop-up, then respawn at the last checkpoint | high | M |
| Walker at classic speed (30 px/s, not 90), coming back after being stomped | med | S |
| Spring: hold jump to go higher | med | S |
| Camera: look-ahead and smoothing (Platformer); classic-size cars and look-ahead (Racing; the short side is fixed at 360 steps, `studio/Stage.tsx:63-76`) | high | S |
| HUD: timer and best time (Platformer); race timer, best lap, live standings, times on results (Racing) | high | S |
| Racing: laps −/+ in Build, an arrow on boost pads and the finish line, steering computer racers | med | S |
| Cars bump each other (`studio/race/carBrick.ts:308-311`) | high | M |
| Wall slide 60 px/s; corner nudge on ceilings | med | S–M |

### B. Content, built as bricks with code (about 3–4 weeks for both games)

These should be bricks kids can open, not engine rules. That's slower than porting, but it's the product.

**Platformer, about 2–3 weeks:**
- **checkpoints** (M);
- **Grow and Spark power-ups**, plus big Hero, crouch, throwing and breaking bricks (L, likely as powers);
- **? block contents** (M);
- **Shellbug, Spiky and Flyer** (L);
- **moving platforms** (M, needs riding);
- **pipes** (L);
- **sound effects and music** on the starter bricks (M);
- **characters with walk and run poses** (L);
- **the cartoon look and underground theme** (L);
- **longer levels with resize** (M);
- **the 3 classic courses** rebuilt (M).

**Racing, about 1.5–2 weeks:**
- **? blocks and items** (L);
- **coins** (M);
- **Walkers** (M);
- **water and jump ramps** (M);
- **tire stacks and bumpers** (S);
- **scenery and the studded track look** (M);
- **Snowy Oval, Brick Speedway, Canyon Twist and Empty field** (M; Speedway needs the items and ramps).

### C. Around the game (about 2 weeks)

| Gap | Notice | Cost |
|---|---|---|
| Play together live: deploy M1, test on devices and in Firefox | high | S–M |
| Build-together (rooms M2: roles, live edits by others, write-behind saving to the class project, recovery copies) | high | L |
| Room host controls: remove, close, lock, Restart for a teacher | high (teachers) | M |
| Share link and play-only page (Hackable saves are too big for `#l=` links: needs a stored link) | high | M–L |
| A teacher can edit or fix a student's Hackable project; a teacher can start a shared Hackable class world | high (teachers) | M |
| micro:bit Remote and gamepad in Hackable | med–high | M |
| Load weight: Hackable pages load about 2.6× classic (about 590 KB gz vs 228 KB). The 2D page always loads the classic builder too. Plus a Chromebook pass | med | M |
| Browser storage: about 8 Hackable projects fit (550 KB each) | med | M |

### D. Migration before anything retires (about 1 week)

- A converter from classic levels to Hackable projects: tiles become grid bricks, objects become bricks, Start becomes
  the Hero's spot, and race kit fields carry over.
- Old saves must open: account worlds, browser drafts, downloaded files and old `/2d/play#l=` links. Each opens as a
  Hackable project or at least stays playable.
- Recovery copies kept by class rooms are exported first.
- `/2d/build` and `/2d/play` links keep working.

**Full parity, end to end: roughly 7–9 weeks of focused work.**

## Recommendation

1. **Don't retire anything yet.** Keep the classic builders as the default for Platformer and Racing.
2. **Do bucket A first (about 1 week).** It's cheap, it fixes the things kids feel in the first minute (pits, keys,
   camera, tiny cars, timers), and it makes the Hackable versions worth choosing.
3. **Let real use decide bucket B.** Count which classic bricks actually appear in students' saved levels: power-ups,
   pipes, critters, items, water. Build those first, and drop the ones nobody places. This needs one read-only query
   on the production database (the owner's OK first). It could easily halve bucket B.
4. **Ship rooms M1 now, and M2 next.** Play-together is the gap that matters most for a "Better with friends" product,
   and it's built.
5. **Merge each game when it passes a checklist:** this audit's rows for that game, the feel harness, and a blind
   side-by-side with students. Then the migration (bucket D), then the classic engine goes quietly.

## Quick fixes found along the way (all S)

- **"Building now" is always 0 for 2D rooms.** The live presence count only asks the 3D rooms
  (`multiplayer/worker/src/classroomRoutes.ts:105-140`). This affects classic 2D today, not just Hackable.
- **Hackable Racing's card is wrong.** The New project card shows a Speedway picture, but opens the beginner oval
  (`src/projects/NewProjectSheet.tsx:88`).
- **Help has no Hackable Racing.** Help and the class shelf still say "Hackable Platformers can't race yet"
  (`src/pages/help/HelpPage.tsx`, `src/pages/class/ShelfTab.tsx:253`).
- **The old Code Lab is still reachable.** `/2d/lab` can be opened by typing the address.

## Sources

The three audit reports were produced in the session that wrote this page and are summarized above, with file:line
evidence in the tables. The live palettes were read from brickgineers.com on 2026-11-03:
- **Classic Platformer, 23 bricks:** Ground, Hard block, One-way platform, Pipe, Spikes, Lava, Brick, ? block, Bounce
  block, Spring, Coin, Grow power-up, Spark power-up, Walker, Shellbug, Spiky, Flyer, Moving platform, Up-down
  platform, Start, Checkpoint, Goal, plus the Character, Scene, Remote and Build together buttons.
- **Hackable Platformer, 13 bricks:** Ground, Hard block, Spikes, Lava, One-way platform, Brick, ? block, Bounce block,
  Hero, Walker, Coin, Spring, Goal, plus New brick.
- **Classic Racing, 19 bricks:** Road, Dirt, Grass, Ice, Water, Barrier, Tire stack, Bumper, Boost pad, Jump ramp, ?
  block, Coin, Walker, Starting grid, Finish line, Tree, Flowers, Grandstand, plus laps −/+ and Items on.
- **Hackable Racing, 9 bricks:** Road, Dirt, Ice, Barrier, Boost pad, Finish line, Car, Computer racer, Starter, plus
  New brick.
