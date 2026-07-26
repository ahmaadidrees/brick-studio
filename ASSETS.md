# Assets

Every asset shipped with Brick Studio is listed here, with its source and licence.

## Third-party assets

**None.** Nothing is vendored into `public/`, and the app makes no asset requests
at runtime — it is entirely same-origin and works offline.

CC0 model packs (Quaternius, Kenney, poly.pizza) were considered for the explore
diorama and deliberately not used. The props are read at minifig scale next to
the game's own bricks, so the silhouettes have to share the bricks' proportions
and bevel language exactly; downloaded props at a different stylisation would
have read as borrowed. Building them from primitives also keeps the added
payload at zero bytes and lets the layout, the colliders and the tests share one
source of truth (`src/brick/toyRoom.ts`).

If a future lane does vendor a model, add a row here with the download URL, the
author, and the licence line.

## Generated at runtime

Explore mode's "toy room" builds all of its surface detail procedurally in the
browser at mount time — no images are bundled or fetched:

| Texture | Generator | Used by |
| --- | --- | --- |
| Table woodgrain | `createWoodTexture` | play-table top |
| Wallpaper | `createWallpaperTexture` | bedroom walls |
| Cut page edges | `createPageTexture` | book stack |
| Alphabet-block faces | `createLetterTexture` | wooden A/B blocks |
| Die pips | `createDieTexture` | dice |
| Dust sprite | `createDustTexture` | motes in the lamp beam |
| Beam alpha ramp | `createBeamAlphaTexture` | lamp light cone |
| Coffee ring | `createCoffeeRingTexture` | stain beside the mug |
| Floorboards | `createFloorTexture` | bedroom floor far below |

All live in `src/brick/toyRoomTextures.ts`. Each generator falls back to a flat
fill when a 2D canvas context is unavailable (jsdom, locked-down browsers), so
tests and hardened environments never throw.

Prop geometry is procedural three.js primitives in `src/brick/ToyRoomWorld.tsx`.
The oversized loose bricks reuse the game's own `createBrickGeometry`, so they
are literally the same part meshes at 4–6× scale.
