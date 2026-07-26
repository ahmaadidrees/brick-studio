# Assets

Ledger of third-party art shipped in this repository, and of the art that is
generated instead of shipped.

## Third-party assets

**None.** No files have been vendored into `public/` and no new npm packages
were added. Total added binary payload: **0 bytes**.

CC0 model packs (Quaternius, Kenney, poly.pizza) were evaluated for the Explore
sky-island diorama and deliberately not used. Two reasons:

1. The look target is stylised toy plastic under one flat-shaded lighting rig.
   Downloaded props arrive with their own baked palettes and shading
   assumptions, which fight that rig; authoring the props procedurally kept
   every colour on the same palette (`SKY_PALETTE` in `src/brick/skyIsland.ts`).
2. Procedural props merge into a single vertex-coloured buffer at load time, so
   the whole set of ~31 pieces of dressing costs one draw call and 0 bytes of
   download, versus a GLB plus per-model draw calls.

If a future lane does vendor CC0 assets, append them here with source URL,
author, licence line, and file size.

## Generated (procedural) art

All Explore-mode world art is generated in-process at mount time. Nothing is
fetched, so the scene is offline-friendly and same-origin by construction.

| Module | Produces |
| --- | --- |
| `src/brick/skyIsland.ts` | Palette, island outline maths, authored prop/waterfall/island layout, cloud fields, quality ladder |
| `src/brick/skyIslandMesh.ts` | Island mass, trees, rocks, pier, ruin, fences, flags, campfire, signpost, plate apron, grass tufts, waterfall ribbons, cloud puff buffers, distant islands, birds |
| `src/brick/SkyIslandWorld.tsx` | Sky dome / cloud / waterfall shaders, lighting rig, colliders |

Geometry generated per session (measured from the builders):

| Tier | Added triangles | Cloud quads | Dressing pieces | Prop colliders |
| --- | --- | --- | --- | --- |
| Desktop | ~15,200 | 324 | 31 | 25 |
| Compact (phone) | ~8,400 | 96 | 20 | 20 |

## Fonts, textures, audio

No new fonts, image textures or audio were added. The cloud, water and sky
shaders are analytic — there are no sprite sheets or noise textures to load.
