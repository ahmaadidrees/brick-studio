# Third-party assets

Every file vendored into `public/` is listed here with its source and license.
Assets are copied into the repo (not hot-linked) so the app stays same-origin and
works offline.

## `public/models/brick-hero.glb` — Explore hero character

- **Title:** RobotExpressive
- **Author:** Tomás Laulhé — <https://quaternius.com> / <https://www.patreon.com/quaternius>
- **Modifications:** Don McCurdy — <https://donmccurdy.com> (three facial expression
  morph targets, FBX2GLTF conversion, de-duplicated materials, reduced metalness)
- **Obtained from:** the three.js sample models directory,
  <https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/RobotExpressive/RobotExpressive.glb>
  (license note: <https://github.com/mrdoob/three.js/blob/dev/examples/models/gltf/RobotExpressive/README.md>)
- **License:** CC0 1.0 Universal (Public Domain Dedication) —
  <https://creativecommons.org/publicdomain/zero/1.0/>. No attribution is required;
  it is recorded here anyway, and supporting the creator's Patreon is encouraged.
- **Downloaded:** 2026-07-25
- **Size:** 463,988 bytes (453 KB), 3,237 triangles, 19 primitives, no textures
- **Animation clips shipped:** Dance, Death, Idle, Jump, No, Punch, Running,
  Sitting, Standing, ThumbsUp, Walking, WalkJump, Wave, Yes

### What Brick Studio does with it

- Vendored byte-for-byte; only the filename changed. **No clips were stripped** —
  the whole animation payload is ~94 KB of the 453 KB file, so removing the unused
  clips would have saved about 10% for a real risk of breaking the export. The full
  file is well inside the budget, so it ships intact.
- `src/brick/HeroAvatar.tsx` loads it, clones the scene per mount, and **repaints
  the three source materials at runtime** into the studio palette (warm orange
  shell, cream panels/gloves, navy boots and visor). The `.glb` on disk keeps the
  original grey/tan/black colours.
- Only `Idle`, `Walking`, `Running`, `Jump` (plus a renamed clone of `Jump` used as
  a frozen airborne pose) and — on non-compact renderers — `Wave`, `ThumbsUp` and
  `Dance` are turned into mixer actions. The rest are never instantiated.
