# Original explorer characters

Created in Blender from original procedural geometry, without downloaded meshes, textures, or character IP. All delivery meshes use solid PBR materials. The PNGs are studio previews; GLBs contain only each character.

| Character | Design | GLB bytes | Triangles | Meshes | Materials |
| --- | --- | ---: | ---: | ---: | ---: |
| Pip | Solar-powered pocket robot, luminous eyes and beacon | 116,632 | 2,444 | 20 | 5 |
| Fern | Woodland pathfinder with fox-ear cap, scarf, and field pack | 112,320 | 2,824 | 21 | 6 |
| Nova | Curious comet creature with glowing antenna tips | 139,492 | 5,260 | 24 | 7 |

## Loading and animation

Use `GLTFLoader` to load `pip.glb`, `fern.glb`, or `nova.glb`; add the loaded `gltf.scene` to the character's placement group. All glTF files use **Y up, +Z forward, X horizontal**. Height is 1 world unit, ground is Y=0, and the scene origin is centered between the feet. Keep the authored root scale/offset intact; set desired world height on an outer placement group. Blender sources use Z up and -Y forward.

Each asset has a named root (`Pip_Root`, `Fern_Root`, `Nova_Root`) plus named pivot groups: `<Name>_Head`, `<Name>_Arm_L`, `<Name>_Arm_R`, `<Name>_Leg_L`, `<Name>_Leg_R`. Names L/R refer to the model's negative/positive X sides. Arms and legs pivot at the shoulder and hip. Procedural walking can rotate the limb groups about their local X axis, with opposite arm/leg phases. Head local Z is its up axis after glTF conversion; preserve the imported quaternion and compose local rotations rather than replacing it. There are no skeletal skins or baked animation clips. Features and backpacks remain separate mesh nodes for recoloring.

The material and mesh counts suit a handful of visible avatars; merge static same-material pieces or reduce distant characters for crowded multiplayer scenes. No textures or external resource files are needed.

## Source, previews, and verification

- `original-characters.blend`: editable studio scene, all three characters and lights.
- `contact-sheet.png`: full studio lineup.
- `pip-preview.png`, `fern-preview.png`, `nova-preview.png`: individual square cards.
- `verification.json`: counts, actual reimported bounds, full node names. Bounds are in Blender coordinates after GLB reimport; map `(x,y,z)` to glTF `(x,z,-y)`.
- `../../scripts/art/build_characters.py`: deterministic authoring, export, rendering, and independent GLB reimport verification.

Rebuild from the repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender --background --python scripts/art/build_characters.py
```

Verified by successful Blender 5.2 GLB reimport. Heights are exactly 1 and lowest vertices lie at ground within floating-point tolerance. The contact sheet was visually inspected for silhouette, feet, face visibility, and material readability. Runtime integration and actual-device performance are separate checks.
