# Step 3 starter lane: platformer starter level

Files: `studio/starter.ts`, `studio/starter.test.ts`, and one line in `studio/storage.test.ts` (brick count 3 to 5; the old test pinned the step 2 starter, so it had to follow).

## Level layout

Level 960 x 360, y-up, (0,0) bottom-left. Copy x/y is the costume center.

| Brick | Costume | Copies |
| --- | --- | --- |
| Ground (128x16) | Grass | 8 copies, y 8, x = 64, 192, 320, 448, 576, 704, 832, 896 (covers 0..960; top at y 16) |
| Platform (64x16) | Stone | (200,56) top 64; (340,104) top 112; (480,152) top 160; (640,104) top 112; plus two low blocks on the ground at (300,24) and (760,24), top 32, which the Walkers bump |
| Jumper (16x16) | Hero | (60,40), above the ground |
| Walker (16x16) | Blob | slow `speed 2` at (560,24); fast `speed 4` at (150,24) |
| Coin (12x12) | Gold | (200,80), (340,128), (480,176), (640,128), (880,32) |

Each step up is 48, a jump rises 66, so every platform is reachable.

## Programs (real Blockly workspace JSON)

- **Ground, Platform**: when flag clicked, solid on.
- **Jumper**: when flag clicked, turn gravity on; forever: set x speed to 0; if key left arrow pressed set x speed to -4; if key right arrow pressed set x speed to 4; if (on ground? and key space pressed) set y speed to 12.
- **Walker** (variable `speed`, showInBuild, default 3): when flag clicked, turn gravity on, set x speed to speed. When I bump [left] of [anything], set x speed to (0 - speed). When I bump [right] of [anything], set x speed to speed.
- **Coin**: when flag clicked, show; forever: if touching Jumper, hide.
- **Stage**: empty.

## Compiler status in this worktree

`platformer_whenbump` is not in `HAT_OPCODES` here (editor lane). The compiler therefore reports the two Walker bump hats as `block.disconnected` warnings (no errors) and drops them from `program.scripts`. The tests allow exactly that warning only while the hat is unregistered; once it is registered they require zero warnings and assert the two compiled bump hats. `createStarterProject()` recompiles at call time, so after merging nothing needs to change.

## Integrator checklist after merging physics + editor

1. Convert the `it.todo` entries in `starter.test.ts` into play tests (they state exact numbers).
2. Jumper lands at y = 24 (ground top 16 + 8) and stays `onGround`. Jump peaks at 24 + 66 = 90 (vy 12, gravity 1, gravity applied before the move: 11+10+...+1).
3. **Wall bump semantics.** The Walkers rely on `left` / `right` hats with BRICK `_any_` also firing for level walls (walking right into the wall = `left` side of the wall, matching the solid rule). If the physics lane records walls with a different side, the fast Walker (x 150) will get stuck at the left wall (and the slow one at x 760 side only needs solids). Adjust the hats or the physics, not both silently.
4. A mover is read as gravity on OR nonzero speed; a body with gravity on and vx = vy = 0 must still fall (the Jumper starts at rest at y 40).
5. Bump hats fire every tick while resting (`top`); the Walker hats use only `left` / `right`, so resting on the ground does not trigger them. Check the Walkers stay at y = 24.
6. Walker is not a solid, so Walkers and Jumper pass through each other; Coin uses Scratch pixel `touching`. Coin hides on the next tick after contact.
7. Open the brick in the editor: the Walker hats should show as Platformer blocks, with no "unknown block" fallback.

## Known gaps

No moving platforms, pushing or riding (step 3 gap). The Walker does not turn at platform edges (it only turns on bumps); the low blocks on the ground are the turn-around points.
