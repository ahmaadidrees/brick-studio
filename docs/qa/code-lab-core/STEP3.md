# Code Lab — step 3: the Platformer extension

Build step 3 of [the spec](../../CODE-LAB-BRICK-MODEL.md). Physics arrives only through a visible **Platformer** block category, like an extension (Pen, Music). Everything else stays plain Scratch.

The spec's hard rules for this step:
- **Same name, same behavior.** No Platformer block may share a name with a Scratch block (`walk`, not `move`).
- **Two kinds of touching.** Platformer collision is box-based and lives only in Platformer blocks. Scratch `touching` stays pixel-based.
- **No hidden engine defaults.** Every number is visible in `DEFAULT_PHYSICS` or a block.
- **Tests a kid could check by watching.** Write them as "it lands on the platform", "it stops at the wall", "the bump hat fires once".
- **The Hero is not part of this step** (step 5). Don't touch `packages/platformer-core` or the old `/2d/lab`.

Integration branch `claude/code-lab-core`. Each lane works on its own branch and worktree, forked from the step 3 contract commit.

## The contract (already committed; don't change it)

In `core/contracts.ts`:
- `Target.body?: Body` holds `{ gravity, solid, vx, vy, onGround }`. It's created when a Platformer block first touches a target, with defaults `false, false, 0, 0, false`.
- `World.physics?: PhysicsSettings`. A missing value means `DEFAULT_PHYSICS`: `{ gravity: 1, maxFall: 16, walls: { left, right, bottom: true } }`, in steps and ticks at 30 ticks/s.
- The new hat is `platformer_whenbump`, with `fields.SIDE` (`_any_` | `top` | `bottom` | `left` | `right`) and `fields.BRICK` (`_any_` | `_edge_` | a brick name).
- `Runtime` has a new lifecycle hook, `afterTick`. It runs once per tick after all script sweeps, before `world.tick` advances. That's where physics runs.

## The blocks (opcodes are fixed)

| Opcode | Block text | Kind | Fields / inputs |
| --- | --- | --- | --- |
| `platformer_setgravity` | turn gravity [on ▾] | stack | `fields.GRAVITY`: `on` / `off` |
| `platformer_setsolid` | solid [on ▾] | stack | `fields.SOLID`: `on` / `off` |
| `platformer_setspeed` | set [x ▾] speed to (5) | stack | `fields.AXIS`: `x` / `y`; `inputs.SPEED` |
| `platformer_changespeed` | change [x ▾] speed by (1) | stack | `fields.AXIS`; `inputs.SPEED` |
| `platformer_speed` | [x ▾] speed | reporter | `fields.AXIS` |
| `platformer_onground` | on ground? | boolean | — |
| `platformer_whenbump` | when I bump [any side ▾] of [anything ▾] | hat | `fields.SIDE`, `fields.BRICK` |

`SIDE` names the side of the **other** thing: `top` means I landed on it, `bottom` means I hit it from below with my head, and `left` / `right` mean I ran into its side. `BRICK` is `_any_` (any solid target or level wall), `_edge_` (a level wall or the floor), or a brick name, which matches copies and clones of that brick.

Speeds cast with Scratch's `toNumber`. A non-finite result is ignored.

## The physics step (exact; runs in `afterTick`)

Let `P = world.physics ?? DEFAULT_PHYSICS`. A **mover** is a non-stage, visible target with a body where `gravity` is on, `vx ≠ 0` or `vy ≠ 0`. A **solid** is a visible non-stage target with `body.solid`, other than the mover itself. Boxes are `geometry.targetBounds(world, target)`, the opaque rectangle after rotation, size and flip.

For each mover, in `world.targets` order:
1. If `gravity`: `vy = max(vy - P.gravity, -P.maxFall)`.
2. Set `onGround = false`.
3. **Move along x** by `vx`. If the mover's box now overlaps a solid's box, or crosses an enabled left/right wall:
   - push it back to touch that face exactly (no gap, no overlap);
   - set `vx = 0`;
   - record a bump: `left` when it was moving right into the solid's left face, `right` when it was moving left into the solid's right face, `_edge_` for walls.
4. **Move along y** by `vy`, the same way:
   - **moving down** and stopped by a solid's top face, or by the floor when `walls.bottom`: snap to it, `vy = 0`, `onGround = true`, bump side `top`;
   - **moving up** and stopped by a solid's bottom face: snap to it, `vy = 0`, bump side `bottom`;
   - the top of the level is open.
5. **Resting:** a body with gravity standing exactly on a solid top stays `onGround = true` every tick. It doesn't jitter between ticks or alternate true/false.
6. Moving a mover requests a redraw. Movement never goes through Scratch's fencing (the walls above are the Platformer's own).
7. **Bumps:** for each bump recorded this tick, start `platformer_whenbump` hats on the mover whose `SIDE` and `BRICK` match, with `startHats`'s usual restart rules. These start for the **next** tick's sweeps, because physics runs after the sweeps. One contact fires one bump per tick per (side, other target), even when you're resting on something.
   - A body resting on a platform keeps bumping `top` every tick it's pushed down by gravity. That's fine as long as it's **one per tick, not one per sub-step**. Kids write `when I bump top of Spikes`; document the "fires while touching" behavior in the report.

Solids don't move each other: there's no pushing or riding in this step. Write that down as a known gap. Moving platforms come later.

Exact results must be deterministic and integer-friendly. A body falling onto a platform lands at **exactly** `platformTop + (distance from its origin to its box bottom)`.

## Lanes

### physics: the core
Files: new `core/platformer.ts` and `core/platformer.test.ts`, plus `core/clones.ts` (clones copy `body` per C01) and `core/project.ts` (a copy's body starts absent). Also `core/index.ts`: register the primitives in `ALL_PRIMITIVES` and the physics step in `createRuntime`'s `afterTick`. Don't edit `contracts.ts`, `runtime.ts` or `core/editor/**`.
- Implement every block above as primitives, plus `physicsStep(runtime)`.
- **Kid-visible tests**, each a tiny design run through `play()` for N ticks:
  - lands on a platform and stays (exact y, `onGround` true and stable for 30 ticks);
  - falls onto the floor when `walls.bottom`;
  - stops at a wall and at a solid's side;
  - hits its head on a ceiling (`vy` becomes 0);
  - a jump script (`if on ground? and key space pressed then set y speed to 12`) jumps to a predictable height and lands at the same y;
  - non-solid bricks are passed through;
  - hidden solids don't block;
  - bump hats fire with the right side and brick, once per tick;
  - clones keep their body;
  - the same inputs replay to the same positions over 300 ticks.

### editor: the Platformer category
Files: `core/editor/**` and `studio/code/**`.
- Block definitions for the seven opcodes, worded exactly as in the table. The category is named **Platformer**, with its own color and an extension-style header, placed after My Blocks.
- `BRICK` menu: anything, edge, plus every brick name (from `EditorContext.getBricks`). `SIDE` menu: any side, top, bottom, left, right.
- Compile support for the hat and its fields, plus tests:
  - the hand-written workspace JSON for each block compiles to the expected IR;
  - the Platformer category appears in the toolbox;
  - no Platformer block text matches a Scratch block's text.

### starter: a platformer starter level
Files: `studio/starter.ts`, `studio/starter.test.ts`.
- Replace the step 2 starter with a small platformer level that uses only Scratch blocks plus the Platformer blocks, as real Blockly workspace JSON:
  - **Ground** and **Platform** bricks (solid on);
  - a **Jumper** brick (gravity on; left/right arrows set x speed; space jumps when on ground);
  - a **Walker** brick that walks back and forth and turns around when it bumps a side, with a "speed" knob painted twice with different values (spec step 4, early proof);
  - a **Coin** that hides when the Jumper touches it (Scratch `touching`).
- Tests: the starter validates; every workspace compiles with no errors; and, once the physics lane merges, the integrator adds a play test. Write the play test now as `it.todo` with the exact expectations.
