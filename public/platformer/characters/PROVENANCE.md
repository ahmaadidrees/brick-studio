# 2D character sheets

These three PNGs were generated for the Brickgineers 2D character experiment on 2026-09-23 and copied byte-for-byte from the approved Builder, Bolt Bot and Brick Fox sprite-sheet drafts.

| File | SHA-256 |
| --- | --- |
| `builder-v1.png` | `ae549c8c3ab83474d0050c27ea71fdefdcdb52155ae14982b62bf5b01e8fc854` |
| `bolt-bot-v1.png` | `c9363d6cc06f0fc1cf487b04dea9e566f19b14124327a321d1615d467f62116e` |
| `brick-fox-v1.png` | `d260cd881ce715085bb44c5345954d5a603a742ea3366e81975d98ddf2224440` |

Each transparent PNG is 1536 × 1024, arranged as six 256 × 256 cells across four rows: idle, run, jump/fall, landing. The underlying RGB contains a colored backdrop even where alpha is zero; browsers honor the alpha channel.

The artwork is a draft. Some generated frames shift horizontally or touch cell edges, so the game uses measured per-frame crop bounds and a curated subset in `src/platformer/characters/atlas.ts`. It keeps each character's original colors. The source files have not been edited. A few special gameplay poses reuse a nearby run, jump, or landing drawing, and the art has no separate spark costume; the renderer adds a small spark badge. The classic procedural character remains available and is the fallback if an image cannot load.

`classic-preview.svg` is a hand-authored selector icon for that procedural character; it is not part of the generated sheets.
