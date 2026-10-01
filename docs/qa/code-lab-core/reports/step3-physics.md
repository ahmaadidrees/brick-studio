# Step 3 physics lane report

Branch `claude/s3-physics`. Files: `core/platformer.ts` (new), `core/platformer.test.ts` (new, 31 tests), plus small edits to `core/index.ts`, `core/clones.ts`, `core/project.ts`. Checks: `npx vitest run src/platformer/lab` is 613 passing; `npx tsc --noEmit -p tsconfig.app.json` is clean.

## What was built
- Six block primitives: `platformer_setgravity`, `_setsolid`, `_setspeed`, `_changespeed`, `_speed`, `_onground`. The seventh opcode, the `platformer_whenbump` hat, is started by physics. `bodyOf(target)` creates the body on first write.
- `physicsStep(runtime)` registered as `createRuntime`'s `afterTick`: gravity, move x, move y, then bump hats.
- `clones.ts`: `makeClone` copies `body` (a fresh object, only when the source has one). `project.ts`: copies already start with no body; the only change needed was adding `platformer_whenbump` to `HAT_OPCODES`, otherwise `validateDesign` rejected the new hat.
- No trig, random or clock in core.

## Exact numbers the tests assert
- Faller lands on a platform (top y 60, 20 tall faller) at exactly y 70, `onGround` true and `vy` 0 on each of 30 following ticks. Floor landing is y 10.
- Thin 4-high platform at y 100 (top 102): a faller from y 340 reaches speed -16 (maxFall) and still lands at exactly y 112.
- Wall stops: right level wall at x 470 (20 wide, bounds right 480); left wall x 10; solid at x 190..210: right-mover stops at x 180, left-mover at x 220.
- Ceiling (bottom 100): body stops at y 90 with `vy` 0. With gravity on and `set y speed 12`, it rises 11, 10, 9, 8 (y 88) then clamps at y 90 and falls back to y 10.
- Jump (`set y speed to 12` while on ground): first tick moves 11 (y 10 to 21); apex is exactly y 76 (10 + 66); lands back at y 10 with `onGround` true 23 ticks after the press tick. (Rise is 11+10+...+1 = 66, fall is 1..11 = 66, then the next tick's 12 snaps flush.)
- A 300-tick replay (jump and right-arrow presses on a schedule, two platforms) produces identical traces of x, y, vx, vy, onGround.

## Ambiguities resolved
1. **Mover definition.** STEP3 reads "gravity is on, `vx` not 0 or `vy` not 0". I read it as gravity on OR any speed, because a body with gravity at rest must still fall. A body with gravity off and zero speed does nothing.
2. **Collision is swept, not discrete overlap.** A face blocks when the mover was on its near side (touching counts) before the move and past it after. This gives the same results as the written overlap-and-push-back for ordinary moves, but a 16-per-tick faller cannot tunnel through a thin platform. A body that starts inside a solid is not blocked by it (it can leave), instead of being stuck. Faces that only touch are not an overlap.
3. **Several faces in one move:** the nearest one wins (smallest left face moving right, highest top moving down, and so on); walls compete equally with solids.
4. **Bump side for walls.** The "other thing" is the wall, so moving right into the right wall is side `left`, moving left into the left wall is `right`, landing on the floor is `top`; BRICK is `_edge_` (also matches `_any_`). The top of the level is open and never bumps.
5. **Hat matching.** `Runtime.startHats` matches hat fields by exact equality, and I may not edit it. So for each bump physics calls `startHats` once per combination of (`_any_` or the side) x (`_any_`, `_edge_` for walls, or the other's brick name). A script matches exactly one combination, so there are no duplicates. A hat missing a SIDE or BRICK field matches nothing.
6. **One bump per (side, other target) per mover per tick**, deduplicated across the x and y moves. Restart rules are `startHats` defaults (an already-running bump script is not restarted).
7. **Bump hats start for the next tick's sweeps** because physics runs after them. Bump brick names come from `world.bricks[other.brickId].name`, so painted copies and clones both match.
8. **Reporters.** `speed` and `on ground?` on a target with no body return 0 / false and do not create a body. The stage ignores all Platformer blocks. Non-finite speeds are ignored; a `change` that would overflow to non-finite is ignored too.
9. **Resting.** Gravity pulls the body 1 down each tick and the floor/solid snaps it back with zero change, so `onGround` stays true and stable; no special case needed.
10. `requestRedraw` is called when a mover's position changed.

## Fires-while-touching (documented behavior)
A body resting on a platform bumps `top` of that platform every tick, so `when I bump top of Platform` runs once per tick while standing there. A runner stopped by a wall bumps once, because the bump zeroes `vx` and nothing pushes again until a script sets speed again. Kids who want "just landed" should watch `on ground?` change.

## Known gaps
- Solids do not move other bodies: no pushing, no riding, no moving platforms. A target moved by Scratch blocks (`go to`, `change x by`) is not collided at all; only Platformer speed is, so a script can teleport a body into or through a solid.
- Boxes are rotated bounding boxes (geometry.ts), not the pixel shape; size and flip are honored via `targetBounds`.
- A script loop that never yields (`forever` with no wait) runs many iterations per tick until the op budget, which matters for `change x speed by`. Starter/editor guidance should use `wait` or `set` blocks.
- Hat wildcard handling lives in physics because `runtime.ts` matches exact fields; a future runtime change could move it there.

## Claims tied to tests (all in `core/platformer.test.ts`)
- Lands and stays, exact y 70, 30 stable ticks: "lands on a platform at exactly platformTop + half its height...".
- Floor and open bottom: "falls onto the floor when walls.bottom is on...".
- maxFall and no tunneling: "never falls faster than maxFall...".
- Slides off an edge: "a faller slides off the platform edge...".
- Level walls: "stops at the level wall...", "stops at the left level wall too".
- Solid sides: "stops at a solid's left face and at its right face...".
- Ceiling: "hits its head on a ceiling...", "with gravity on, a head-bump turns the jump into a fall...".
- Jump numbers and no air jump: "jumps to a predictable height (66 steps)...", "cannot jump in the air...".
- Pass-through: "passes through bricks that are not solid", "passes through a platform once it turns solid off", "hidden solids do not block", "a hidden body does not move", "copies of a solid brick are all solid", "a body does not ride or push".
- Bump hats: "fires with the right side and brick...", "fires once per tick while resting...", "the floor counts as an edge...", "running into a solid fires its left side once...", "when I bump right of edge...", "bumping the head fires bottom of ...", "a bump hat matches clones of the brick by name".
- Clones: "a clone keeps its body...", "a clone of a solid brick is solid", "a target without a body clones without one".
- Replay: "the same inputs give the same positions for 300 ticks".
- Blocks and validation: "a level using the Platformer blocks and the bump hat passes validateDesign", "set / change / report speed...", "reading speed never creates a body".
