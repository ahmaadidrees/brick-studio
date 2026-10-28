# Step 6, tiles lane

Branch `claude/s6-tiles`. Files: `core/platformer.ts`, `core/project.ts`, `core/editor/tileBlocks.ts` (new), `core/tiles.test.ts` (new), `core/tileBlocks.test.ts` (new). `contracts.ts` untouched. `save.ts` needed no change (tiles ride along in `design`).

All tests: `npx vitest run src/platformer/lab` is 762 passed, 25 expected-fail (pre-existing); `npx tsc --noEmit -p tsconfig.app.json` is clean. New tests: 28 in `tiles.test.ts`, 3 in `tileBlocks.test.ts`.

## What it does, and the test that shows it

- **Instantiate copies tiles.** `tiles are copied into the world > Play copies design.tiles ...` (deep copy, later design edits don't leak) and `a level without tiles has no tiles in the world`.
- **Lands on a ground tile**, exact y and stable `onGround` for 30 ticks: `lands on a ground tile at exactly its top ...`. Walks off a ledge where tiles end: `walks off a ledge ...`.
- **Stops at a brick-tile wall** (moving right and left): `stops at a brick-tile wall ...`, `walking left stops against a wall tile ...`.
- **Head-bumps a tile ceiling**, vy becomes 0, falls back: `head-bumps a tile ceiling ...`.
- **Which kinds are solid:** ground, brick, hard, qblock stop a faller; spikes and lava don't: `all four solid kinds stop a faller, and spikes and lava do not`.
- **No tunnelling** through a thin tile row at max fall speed: `a thin tile row is not tunnelled ...`.
- **Embedded body can walk out**; **cells outside the grid are empty**: `a body that starts inside a solid tile is not stuck ...`, `tiles outside the grid are empty ...`.
- **`platformer_touchingtile`** (`fields.TILE` = a TileKind): true on spikes, false beside; faces that only touch don't count; ground vs spikes asked separately; false with no tiles, for an unknown kind: the `touching tile [kind]?` describe (5 tests, including walking through spikes).
- **Bump hats:** landing on a tile fires BRICK `_tiles_` and `_any_`, once per tick while resting, never `_edge_` or a brick name: `landing on a tile fires BRICK _tiles_ ...`; left wall: `running into a brick-tile wall fires ...`; ceiling: `bumping a tile ceiling fires bottom of tiles`; the level floor stays `_edge_`: `the level floor still reports _edge_, not _tiles_`.
- **Validation:** rows x cols, characters, non-string rows, caps of 400 cols and 60 rows (exact limits allowed, 401/61 give `limit`): the `tiles are validated` describe. New `DESIGN_LIMITS.maxTileCols/maxTileRows`.
- **Save:** serialize/parse round trip and byte-identical re-serialize, malformed tiles refused by `parse`, old save (`__fixtures__/minimal.json`) still loads and plays with no tiles: the `tiles are saved` describe.
- **Performance:** 1,000 tiles + 20 bodies x 300 ticks (test `1,000 tiles and 20 bodies run 300 ticks in under a second`): **about 14 to 16 ms** (three runs: 15.6, 15.0, 14.3 ms).
- **Replays identically** over 300 ticks: `the same level replays identically over 300 ticks`.
- **Editor definition** (`core/editor/tileBlocks.ts`): `tileBlocks.test.ts` checks wording `touching tile %1?`, the TILE dropdown has every kind, the toolbox entry, the `["a tile", "_tiles_"]` option, and that a workspace using the block compiles to the expected IR with zero errors (the compiler is opcode-generic).

## Design notes

- Grid lookup: each move only looks at the columns (x moves) or rows (y moves) whose faces the move crossed, and the cells across the box's span. No scan of all tiles.
- Only a tile's **outer** faces block: a face between two solid tiles is inside the wall and skipped. This makes a body embedded in tiles able to walk out (same rule as bricks) and avoids snagging on internal seams.
- A tie between a brick and a tile at the same face goes to the brick (strict `better`).
- A tile bump has `other: null` plus an internal `tile: true` flag in `platformer.ts`; the hat matching adds `_tiles_` and not `_edge_`.

## For the integrator

1. In `core/editor/definitions.ts`, add `...TILE_BLOCK_DEFINITIONS` to the platformer block list.
2. In `core/editor/toolbox.ts`, add `TILE_TOOLBOX_ENTRY` to the Platformer category after `platformer_onground`.
3. In `definitions.ts` `bumpBrickOptions`, add `TILE_BRICK_OPTION` after "edge".
4. Add `platformer_touchingtile: 'touching tile %1?'` to the wording table in `core/editor/platformer.test.ts` (that test currently asserts exactly seven Platformer blocks and will need updating once definitions are wired).
5. Stage-side tile drawing is the builder lane's job.

## Known gaps

- Tiles are static (no breakable bricks or ? block hits yet); qblock is just solid.
- Spikes and lava only act through `touching tile`; no built-in damage.
- Faces-only-touching never counts as `touching tile`, so standing on spikes' top face is false (use the box overlapping the spike cell).
