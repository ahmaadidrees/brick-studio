# Step 6b, hero lane report

Branch `claude/s6b-hero`. Files: `studio/hero/heroBrick.ts` (+ test), `studio/starter.ts` (+ test), `studio/builder/{Builder,BuildPanels,SeeInsideCard}.tsx`, `builder/{history,limits}.ts`, `builder/builder.css`, `builder/Builder.test.tsx`, `builder/history.test.ts`, `studio/workshop/{KnobsCard.tsx,knobs.ts,workshop.css,KnobsCard.test.tsx}`. No core, store, Stage, catalog or tileArt edits.

Checks: `npx vitest run src/platformer/lab` (75 files, 881 passed, 25 expected fail, 3 todo), `npx tsc --noEmit -p tsconfig.app.json` clean, `npx vitest run src/platformer/lab/feel` passes (Hero feel math and default values untouched).

## Why the Hero had no See inside (root cause)

The Hero's logic was never broken: `pickCopy` on the starter hits the Hero at (60, 40) (checked with a throwaway test and now `Builder.test.tsx` "clicking the Hero in the starter selects it..."). Two things hid it in the real app:
1. **The floating Bricks drawer sat on top of the Hero.** The stage canvas fills the whole screen and fits the 960-wide level to it, so the level's left edge (where the Hero starts, x 60) is under the 264 px drawer (screen x 12..276 at 1366 wide; the drawer covers world x 0..~194). The pointer press went to the drawer, never to the canvas. Seen in the browser before the fix: the Hero was not visible at all.
2. If a click did reach the Hero, the card listed 32 knob sliders in a card anchored above the Placing strip, tall enough to push the head (the See inside button) off the top.

Fixes: the stage is inset by the drawer while it is open (`.builder-drawer-open .builder-stage { left: 288px }` in `builder.css`, class set in `Builder.tsx`), so the level is fitted to what you can see; the card has `max-height` with scroll; and limit-1 bricks show no per-copy knobs. Browser check below.

## What changed

- **limit 1.** Hero (`createHeroBrick`) and Goal (`createGoalBrick`, so the Goal template too) have `limit: 1`. `builder/limits.ts` `limitedStore` wraps the store the Builder gives the Stage: its `addCopy` moves the existing copy when the limit is reached (and records a move on the undo history), returns `''` so the Stage records no add. Chosen because `Stage.tsx` calls `store.addCopy` and is not mine. Test: "placing the Hero again moves the one you have; the strip says so; Undo moves it back", "the Goal is one per level too, but the Walker is not". Undo of a removed Hero does not add a second one if another was placed: "Undo of a removed Hero does not bring back a second one...".
- **Strip / drawer wording.** The strip says "Moves your Hero · only one per level" (or "Click to place your Hero · only one per level" when none is placed). The drawer item is "Hero" (`Builder.test.tsx` "the Bricks drawer calls it Hero, not Start"). The category title "Start and goal" is in `catalog.ts` (tiles lane), unchanged.
- **Card.** Limit-1 bricks show "One per level" and no knob sliders; the Walker still has its `speed` slider (test "the Hero card stays small...").
- **Hero knobs.** Only `walk_top` (walk top speed), `run_top` (run top speed), `jump_stand` (jump standing, as "jump power") and `fall_gravity` (fall gravity) are `showInBuild`. Exports from `heroBrick.ts`: `HERO_BUILD_KNOB_IDS`, `HERO_KNOB_GROUPS` (Walking 5, Running 6, Jumping 10, Falling 1, Walls 6 = 28), `HERO_MORE_TUNING_COUNT`. Tests in `heroBrick.test.ts` "shows only four Hero knobs...". Values and names unchanged. Choice to review: "jump power" is the standing jump; the walking/running/p-speed jumps are under Jumping, because I may not change the feel math.
- **Workshop Knobs card.** Four sliders, then a collapsed "More tuning (28)" button with grouped sliders (`KnobsCard.test.tsx`). Those sliders change the variable but keep `showInBuild` off. Hero slider ranges are built from the built-in value so they do not double as you drag (`sliderRange`, test "a Hero slider range comes from the built-in value").
- **Starter.** Hero: `when flag clicked, forever: if touching tile [spikes] or touching tile [lava] then broadcast hero hurt`; new labeled script `when I bump [bottom] of [tile:qblock] -> change coins by 1` (`coins` is the Stage's global; the Hero does not declare it). Tiles: one-way platform `----` at cols 33-36 row 3 (top y 64) and a bounce block `O` at col 18 row 1; `STARTER_ONE_WAY`, `STARTER_BOUNCE` exported. The Stage has no backdrop costume (the sunset art was deleted). Tests in `starter.test.ts` ("one-way platform ... and a bounce block", "only the Hero and the Goal are one per level", "has no backdrop costume", Hero handlers).
- **Undo of knob edits.** `knobEdit` in `history.ts`; the card pushes one per slider change; edits to the same copy and knob within 800 ms fold into one step (a drag is one undo). Tests: `history.test.ts` "knob edits in the undo history" (3), `Builder.test.tsx` knob test now does Undo then Redo.

## Tests waiting on the tiles lane (`it.todo` in `starter.test.ts`, with expectations)
- One-way platform: the Hero jumping up at x 560 passes through it and lands on top, box bottom exactly 64, onGround true.
- ? block: the Hero jumping into the ? block at col 12 row 3 from below turns it into `U` once and `coins` becomes 1; a second jump gives no coin. (Needs the tile lane's `tile:qblock` bump plus the editor menu option.)
- Bounce block: landing on col 18 row 1 (top y 32) reaches the converted old `bounceHigh` apex; walking onto it gives the low bounce (the tiles lane test pins the number).

A real lava test is in (`lava sends the Hero back to the start, like spikes`: a lava tile painted in mid-air; the Hero goes to (60, 24)).

## Browser check (port 5321, 1366 x 768, my own tab, localStorage key cleared; server stopped after)
Verified: the new starter loads; the Hero is visible at the left of the level, clear of the drawer; clicking it selects it and shows "Hero / One per level / See inside / Remove" with no sliders; the strip reads "Moves your Hero - only one per level"; clicking empty sky with the Hero armed moves the single Hero; Undo puts it back; See inside opens the workshop showing four Knobs and "More tuning (28)", which expands into Walking etc. with sliders; Done returns with the card still up; `scrollWidth` is 1366.
Not verified: Play (the one-way platform and bounce block have no art or physics until the tiles lane merges; they are not drawn yet), the sunset-less sky (the tiles lane draws the Brickgineers sky; the stage shows a plain blue field here), narrow layout, and the Hero's lava in the browser (covered by the headless test).

## For the integrator
- `TILE_BUMP_OPTIONS` must be added to the bump menu in `definitions.ts`: until `tile:qblock` is an option, the Blockly dropdown for the Hero's new bump hat falls back to its first option when the workspace is opened in the editor (the compiled program from the starter is fine; the round-trip test ignores the field).
- The Hero's `change coins by 1` relies on the editor offering the Stage's variables in other bricks' variable menus (it does in `buildEditorContext`) and on `compileWorkspace` not creating a local `coins` when a kid edits the Hero: `workspace.variables` only lists the brick's own, so this holds. Worth one check after the editor lane merges.
- Old saved projects still hold the old starter; clear `code-lab.project.v1` to see the new one.
