# Code Lab brick model

Spec · 2026-09-30 · Decided with the owner after the mock rounds and the POC review. Evidence lives in [`research/code-lab/`](../research/code-lab/INDEX.md), cited as §01–§10. This page wins over older Code Lab docs where they disagree.

## What Code Lab is

A platformer maker where every brick is a program. You paint levels the Mario Maker way. Any brick opens into a Scratch-style editor: costumes, sounds and blocks. Kids can edit the built-in bricks or make new ones from nothing. It uses our own runtime, not scratch-vm, and a block that shares a Scratch block's name behaves the way Scratch's does. The editor is blocks-first; JS/Python views come later ([§06](../research/code-lab/06-blocks-text.md)).

## The model

| Code Lab | Scratch equivalent | Rules |
| --- | --- | --- |
| **Brick** | Sprite | Costumes, sounds, local variables, scripts. Built-in bricks (Walker, Coin, Spring…) are ordinary bricks with open code. There is no separate "behaviors" layer. |
| **Copy** | *(no direct equivalent)* | A brick placed with the Build brush. It's saved in the level design. On Play, each copy runs the brick's `when ⚑ clicked` scripts with its own local variables ([§01](../research/code-lab/01-scratch-runtime-semantics.md) C11). Copies do not count toward the clone limit. That's our design choice, not vanilla Scratch (INDEX fact 5). |
| **Clone** | Clone | Made by `create clone of`. Starts from its source's current state, not its running scripts (C01). Runs `when I start as a clone`. Removed on Stop or restart. Limit: 300 clones across the whole world, not per brick. |
| **Level** | Stage | Holds the world's variables and scripts, plus the backdrop. The Stage's size is the level's size (decision 2). |
| **Hero** | Sprite | The player brick. Its movement stays on the current engine until the last build step. |
| **Platformer** extension | Extension category | This is the only way to get physics, and it's visible in the palette like Pen or Music. Everything else is plain Scratch. |

**Per-copy knobs.** A brick's local variable can be marked "show in Build". Each painted copy then has a knob for it, and the knob sets that copy's starting value. Example: a Walker's `speed`.

**Units.** y points up. Direction 90 is right. 1 step = 1 art pixel. The view is about 480 steps wide.

## Six research-driven decisions

1. **Play reloads, then starts the flag.** Play restores the saved level design: copies, positions, variables. Then it fires `when ⚑ clicked`. During a session, Scratch's rules apply: the flag doesn't reset positions or variables, clones die on stop, timers reset (H01). This way kids get Mario Maker's "every run starts fresh" and Scratch's behavior inside a run.
2. **The level is the stage.** Motion blocks fence to the level bounds, not the camera, using Scratch's partial-costume fence (M05–M06). `touching edge?`, `if on edge, bounce` and `random position` refer to the level too. The camera is a separate thing.
3. **30 script ticks per second, drawn at 60.** Scripts step at Scratch's configured 30 TPS (F01), so `repeat 30` still means about one second. Rendering interpolates between ticks. The Hero's feel is measured against today's 60 Hz engine before this becomes final; see [§04](../research/code-lab/04-platformer-feel-collision.md).
4. **Scratch's scheduler, with a budget we can replay.** We keep the sweep/redraw model:
   - a thread runs until it yields;
   - loops yield at the end of each iteration;
   - a thread can run again in the same tick unless something asked for a redraw (F03–F07).

   Scratch cuts off work with a wall clock (75% of the tick). We cut off after a fixed number of operations instead. That keeps ticks deterministic and replayable ([§05](../research/code-lab/05-browser-javascript-determinism.md)). This is a documented difference from Scratch, with its own tests.
5. **Deterministic math from day one.** The simulation uses our own `sin`, `cos`, `atan`, `sqrt` and a seeded RNG, never `Math.sin` and friends. Engines may return different results for those (INDEX fact 16). Scratch's value rules apply too: cast/compare, floored `mod`, 1-based lists (§01 operators/data).
6. **Clean room and naming.** Contributors, including agents, may *read* Scratch's AGPL source to write specs and tests. They must not copy its code ([§08](../research/code-lab/08-licensing-trademark-brand.md)). "Scratch" never appears in a product or feature name. Once the compatibility guide and tests exist, public copy follows §08's pattern: *"Selected blocks follow documented Scratch behavior; see our compatibility guide. Independently developed; not affiliated with or endorsed by the Scratch Foundation."*

## Rules that keep it honest

- **Same name, same behavior.** Every block named like a Scratch block must pass its §01 fixtures (108 fixtures, from source; none have been run yet). If a block can't match, it gets a different name. Examples: platformer movement is `walk`, not `move`; text for two seconds that doesn't wait isn't called `say … for … seconds`.
- **Two kinds of touching.** Scratch `touching` is pixel-based: ghost is not the same as hidden (fact 9). Platformer body collision is box-based and lives only in Platformer blocks. The two never share a block name.
- **Editor stack.** Blockly **13.3.0** (already pinned in `package.json`) with the Zelos renderer. Add `@blockly/continuous-toolbox` and `@blockly/block-shareable-procedures` at exact versions, all pinned together ([§03](../research/code-lab/03-blockly-editor.md)). There is one workspace, for the selected brick. There is never one workspace per copy.
- **Save format.** Blockly JSON goes inside our own envelope. It carries `schemaVersion`, `engineSemanticsVersion`, `editorVersion`, the plugin versions, brick definition IDs, placements, assets, and the compiled IR. The original payload is kept before any migration. A golden corpus of old saves must reopen and replay identically (§03).
- **Kid text.** Outside class worlds, kids choose from picked phrases. Typed text is allowed only in class worlds ([§09](../research/code-lab/09-school-privacy-moderation.md)).
- **Physics is never mixed with other changes.** An earlier broad pass changed physics and UI together, the game stopped feeling right, and it had to be reverted.

## Current lab vs this spec

The baseline (`claude/code-lab-baseline`) is the starting point. These are its known differences, and each gets fixed or renamed in the build steps below:

| Current lab | Spec | Action |
| --- | --- | --- |
| y points down; positions are the bottom-center; blocks work in 16 px tiles (`TILE = 16`) | y up, 1 step = 1 art px, Scratch direction | Fix in step 2. Old saves need a versioned migration. |
| `say … for N seconds` shows the bubble and continues right away (`sayUntil`, no yield) | Timed say waits (§01 looks) | Fix (make it yield) |
| `make a [brick] at …` sets "it" to the new thing | `create clone of`, plus `when I start as a clone` | Replace with clone semantics; "it" goes away |
| `when I appear` means both "level start" and "new instance" | `when ⚑ clicked` (copies) and `when I start as a clone` (clones) are separate | Split |
| Key hat ignores a retrigger while its script runs | Same as Scratch (H02–H06) | Keep. Click and message hats must *restart* instead |
| 60 Hz script steps | 30 TPS scripts (decision 3) | Change with feel measurements |

## Build order

1. ✅ Baseline commit, research library and this spec.
2. **"+ New brick" end to end.** Make a blank brick, draw costumes, add sounds, write Scratch blocks, paint copies, press Play. Start with Motion, Looks, Events, Control and Variables, each block tested against its §01 fixtures, then add the clone blocks.
3. **Platformer extension, about 5 blocks, first cut** (to be settled in that step): `turn gravity [on/off]`, `set [x/y] speed to ()`, `solid [on/off]`, `on ground?`, `when I bump [side] of [brick]`. Each block gets tests for what kids can see ([§04](../research/code-lab/04-platformer-feel-collision.md)); no hidden engine defaults.
4. **Rebuild the Walker in open blocks.** It's the proof that a built-in brick is just Scratch + Platformer blocks.
5. **The Hero, last.** Its movement moves into open blocks only behind feel tests. These use the `autoplay.ts` bot and the 31 feel params, replaying the same inputs to get the same result. This is its own change, never bundled with UI work.

## Open questions

- **This copy / All copies, and "Make unique".** How does editing one copy's code differ from editing the brick? Should one copy be able to fork its code? Construct's templates are the closest precedent ([§02](../research/code-lab/02-object-instance-models.md)). Undo and propagation need a design.
- **Where is (0, 0)?** Scratch uses the center of the stage. For a scrolling level, the leaning is the bottom-left corner of the level, so y-up coordinates stay positive. Decide in step 2.
- **Pixel touching cost on Chromebooks.** Nothing has been measured yet. Run the [§10](../research/code-lab/10-chromebook-performance.md) matrix on a real 4 GB device before setting limits.
- **Multiplayer.** Out of scope for now. Decisions 4 and 5 keep the door open (§05 snapshot contract).
