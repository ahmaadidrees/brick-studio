# Third-party assets

## Current inventory: none

Brick Studio ships **zero vendored third-party art assets**. Nothing has been
added to `public/`, and the added payload of the Brick Valley explore world is
**0 bytes** — every prop is generated at runtime from `three` primitives.

| Asset | Source | License | Path | Size |
| --- | --- | --- | --- | --- |
| _(none)_ | — | — | — | 0 B |

## Why the Brick Valley world is procedural

The explore-mode diorama (`src/brick/brickValley.ts`) was scoped to allow CC0
models from Quaternius / Kenney / poly.pizza. It deliberately uses none, because
the fantasy is *"the whole world is built from giant toy bricks"* and that only
holds if every silhouette obeys the brick vocabulary — right angles, stud grids,
moulded-plastic sheen. A CC0 low-poly tree or rock, however well made, is the one
thing in frame that was not built out of bricks, and it reads as an import.

Two brick primitives (`createBrickSlab`, `createRoundBrick`) generate the entire
landscape at different scales:

- **hills / horizon massifs** — stacked studded slabs, giant stud pitch
- **trees** — round bricks: a trunk stack plus tapering canopy discs with studs
  on every exposed shoulder
- **clouds** — clusters of studded slabs
- **ground** — a field of giant plates with seams between them
- **pond rim, stair ramp, loose bricks, flowers** — the same two builders

Everything static merges into three geometries (one per distance band), so the
whole valley costs three draw calls and no network requests. It is fully
offline-friendly by construction.

## If assets are added later

Append a row to the table above with: what it is, the exact source URL, the
license line as published, the vendored path under `public/`, and the file size.
Keep the cumulative added payload under ~2.5 MB.
