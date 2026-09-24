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

## Jointed walking and running artwork

The three `*-rig-v1.png` files were generated with the built-in imagegen tool using the original sheets as character references. Each is an unmodified transparent 1536 × 1024 PNG, in a 3 × 2 layout: body, arm, thigh, shin, foot, assembled reference. The game uses only the first five parts. Measured source rectangles and joint transforms live in `src/platformer/characters/locomotion.ts`.

| File | SHA-256 |
| --- | --- |
| `builder-rig-v1.png` | `9b4ed4726957f9867a649bb620fea584bf519ab837f97bdb78d1a8c3207f0df1` |
| `bolt-bot-rig-v1.png` | `f6434df0ffd82ea6216b2eec0c5ee2bf896d342414039cc99395391c03099648` |
| `brick-fox-rig-v1.png` | `cd95ca70848c691c432e68793886c0aafbffb2460bfcbfefeb0aecb565377e89` |

The exact successful prompts are saved in `docs/qa/character-gait-prompts-2026-09-23.json`. Two earlier full-body walk/run generations repeated a forward-kicking pose and were rejected; those files are not shipped. The new parts retain the character designs while allowing continuous, alternating, joint-controlled strides. Idle and special actions still use the original sheets. Both assets for a selected character are cached; the new rig adds about 1.4–1.5 MB per character, loaded when that character first appears.
