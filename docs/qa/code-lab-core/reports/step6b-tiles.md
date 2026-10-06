# Step 6b, tiles lane

Branch `claude/s6b-tiles`. `npx vitest run src/platformer/lab`: 882 passed, 25 expected-fail (pre-existing). `npx tsc --noEmit -p tsconfig.app.json`: clean.

Files: `core/platformer.ts`, `core/editor/tileBlocks.ts`, `core/tiles.test.ts`, `core/tileBlocks.test.ts`, `studio/stage/tiles.ts`, `studio/stage/renderer.ts`, `studio/stage/tiles.test.ts` (new), `studio/builder/catalog.ts`. One edit outside the lane: two expected lists in `studio/builder/logic.test.ts` (the drawer now has One-way platform and Bounce block). The hero lane may touch that file, so expect a trivial merge.

## Behaviors, and the test for each
- **One-way (`-`)**: `one-way platforms (semi) > jumps up through it ... lands on top ... onGround true`; side walk passes through; falling onto it fires `tile:semi`.
- **? block**: `? blocks > hit from below it turns into a used block ... once, design unchanged` (bump `tile:qblock` fires exactly once); a used block stays solid and fires `tile:used`; solid from above. Change is only in `world.tiles`; `a ? block hit in play never changes the saved world`.
- **Bounce**: constants in `core/platformer.ts` with the conversion written beside them. Old 60 Hz px/frame to 30 Hz steps/tick is x2 (tile is 16 in both, so 1 px = 1 step).
  - `bounceLow` 3.25 -> **6.5**; `bounceHigh` 5.5 -> **11** (jump held = space or up arrow in `keysDown`); underside push 2 -> **4** (vy = -4).
  - Tests: `the old numbers, converted`, launch speeds 6.5 and 11, peak heights 18 and 55 above landing, underside push -4.
- **Brick**: plain solid, documented in the test comment; `bumping a brick from below leaves it in place and fires tile:brick`.
- **Bumps**: every tile bump matches `_any_`, `_tiles_` and `tile:<kind>`. `TILE_BUMP_OPTIONS` exported from `tileBlocks.ts` (test in `tileBlocks.test.ts`; spikes and lava are left out as they are never bumped).
- **Lava**: not solid; `lava is sensed, not solid` (falls through, `touching tile [lava]?` true).
- **Old saves / replay**: existing save tests still pass; new chars round-trip through `parse`/`serialize`; `replays identically: ? block, bounce and one-way together over 300 ticks`. Perf test unchanged (14 to 100 ms depending on machine load, limit 1 s).
- **Art**: the real builder art already existed for `semi`/`bounce`/`used`; the stage's char map now includes them. Bricks panel gains One-way platform (Terrain) and Bounce block (Blocks); `used` is not paintable.
- **Coin pop**: `trackCoinPops` in `stage/tiles.ts` watches Q turning U (first frame only records), 500 ms rise and fade; tests in `stage/tiles.test.ts`. Picture only; no score.
- **Sky**: `drawSky` (sky blue, clouds, studded hills with parallax) when the stage has no backdrop picture, in Build and Play. Tested for the fill only.

## Browser check (port 5322, 1366x768)
Seen: `/2d/lab/next` loads and the Bricks panel shows One-way platform and Bounce block with their art. Not verified in the browser: the day sky (the starter still has its sunset backdrop until the hero lane removes it), the coin pop, and play-mode bounce/one-way/? behavior. Those are covered by unit tests only.

## Known gaps
- After a bounce the old player gets float-jump gravity; here the Hero's code decides how it falls.
- Lava animation is frame 0 (static).
