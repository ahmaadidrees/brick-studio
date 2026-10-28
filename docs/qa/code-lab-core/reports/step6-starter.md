# Step 6, starter lane report

Branch `claude/s6-starter`. Verified with `npx vitest run src/platformer/lab` (741 passed, 12 todo) and `npx tsc --noEmit -p tsconfig.app.json` (clean). Not browser-checked (no UI in this lane). The starter was run headless for 120 ticks with `play()` before tiles exist: no throw (the unknown `platformer_touchingtile` just evaluates falsy).

## Level layout (`studio/starter.ts`, tests in `starter.test.ts` "tiles")
Level 960 x 360; tiles 60 cols x 22 rows, row 0 = bottom (tile (c, r) covers x c*16.., y r*16..).
- Row 0: ground (`G`) everywhere except a **gap** at cols 20-22 (x 320..368; falls to the level floor, jump out) and a **spike pit** of `S` at cols 44-46 (x 704..752). Ground top is y 16.
- Platforms (B brick, Q ? block): row 3 cols 11-14 `BQBB` (top 64); row 6 cols 21-24 `BQQB` (top 112, over the gap); row 9 cols 28-31 `BBQB` (top 160); row 6 cols 40-43 `BQBB` (top 112, before the pit); row 4 cols 50-53 `BQQB` (top 80, near the Spring).
- Hard blocks (`H`) on the ground, row 1, at cols 6, 15, 31, 39 (the Walkers' walls).
- Copies: Hero (60, 40); Walker fast (170, 24, speed 4) between cols 6 and 15; Walker slow (560, 24, speed 2) between cols 31 and 39; five Coins at (208,80) (368,128) (480,176) (672,128) (736,72, over the pit); Spring (776, 22); Goal (920, 32).

## Bricks (scripts, one label each; My Blocks are real `procedures_definition`/`procedures_call` with extraState `{ proccode, argumentNames, warp }`)
- **Walker** (variables `<id>_speed` knob, `<id>_way` = +1/-1): `when flag clicked -> walk at (speed), forever: check for stomp`; `when I bump left of anything -> turn around`; `when I bump right of anything -> turn around`. My Blocks: `walk at %s` (gravity on, left-right rotation, point in direction way*90, x speed = way * speed); `turn around` (way = 0 - way, flip direction, x speed = way * speed; a bump already zeroed the speed, so it re-sets it instead of negating it); `check for stomp` (touching Hero: if Hero y > my y + 6 then broadcast stomped and hide, else broadcast hero hurt).
- **Coin**: `when flag clicked -> show, forever: spin, check for Hero`. `spin` (turn 15 degrees); `check for Hero` (touching Hero: broadcast coin collected, hide, stop this script). **Deviation:** the Coin broadcasts `coin collected` and the **Stage** has `when I receive coin collected -> change coins by 1` (global `coins`, set to 0 on flag), so the Coin template works in any project.
- **Spring**: `when flag clicked -> forever: launch the Hero`; `launch the Hero` (touching Hero: broadcast boing).
- **Goal**: `when flag clicked -> forever: check for the Hero`; `check for the Hero` (touching Hero: say "Course clear!", broadcast course clear, stop all).
- **Hero**: program and feel math unchanged. Added labels on every script plus: `when I receive boing -> set y speed to 14`; `when I receive stomped -> set y speed to 8` (extra, a stomp bounce); `when I receive hero hurt -> go to x 60 y 24, x speed 0, y speed 0`; `when flag clicked -> forever: if touching tile [spikes]? then broadcast hero hurt`.
- Templates (`templates.ts`): Walker, Coin, Spring, Goal, Empty. `make(id, name)` returns a fresh brick plus workspace from the same builders as the starter (`createWalkerBrick` etc., exported from `starter.ts`). Variable ids are prefixed with the brick id, since ids must be unique across the design (validateDesign).

## Label JSON shape
A Blockly 13 block comment on each top hat / definition block: `"icons": { "comment": { "text": "...", "pinned": false, "height": 60, "width": 200 } }`. Helper: `withLabel` in `studio/hero/heroBrick.ts`. The myblocks lane should read `block.icons.comment.text`; the integrator should align if it chooses a different shape. Test: "every top script has a one-line label".

## Other files touched (to keep things green)
- `studio/hero/heroBrick.test.ts`: opcode allow-list gained the new opcodes; top-block count 10 -> 14; the Blockly load test registers a stand-in `platformer_touchingtile` block when the real one isn't registered yet.
- `studio/code/editor.test.ts`: its test knob `speed` collided with the Hero's existing `speed` variable now that the Hero is the first brick; renamed to `bounce`.
- `feel/jumperStandIn.ts` (not a test): it filtered `brick_ground` out of the starter. It now builds its own Ground bricks from legacy exports kept in `starter.ts` (`createGroundWorkspace`, `createJumperWorkspace`, `STARTER_GROUND_XS`, `groundCostume`, `jumperCostume`) and drops `design.tiles`.
- Old play tests in `starter.test.ts` are replaced by `it.todo` entries with exact numbers (they need tile physics).

## Integrator checklist after the tiles lane merges
1. Register `platformer_touchingtile` (tileBlocks.ts) in the editor; the Hero's stand-in stub in `heroBrick.test.ts` can then go.
2. Turn the 12 `it.todo` in `starter.test.ts` into real tests; check the numbers (Walker turn x = 119 / 233 and 519 / 617 assume the Walker's opaque box is 14 wide; verify the exact tile-bump positions).
3. Check `instantiate` copies `design.tiles` and `validateDesign` accepts the 60 x 22 layer; check save round-trip of the starter.
4. Check the Hero falls from y 40 and lands on tile ground at box bottom 16; the Walkers' bump hats fire on `_tiles_` (hard blocks) and `_edge_`; spikes at cols 44-46 trigger `hero hurt`; the gap floor.
5. Spring exact apex is unmeasured (boing sets y speed 14, the Hero's own gravity is 1.5 per tick); measure it and pin it.
6. Walker "turn around" when it bumps the Hero's side: it also turns (bump `_any_`); confirm that is acceptable.
7. Old saved projects (localStorage) still hold the old starter; the lanes should decide whether to migrate (not handled here).
