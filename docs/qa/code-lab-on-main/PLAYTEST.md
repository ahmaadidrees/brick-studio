# Code Lab Slice 1 playtest (owner)

2026-10-27 · Code Lab is on `main` (`4f31352`) at **`/2d/lab/next`**. No student page links to it, and it isn't on
brickgineers.com yet: production is still `claude/microbit-scrub`.

- **Run it on this Mac:**
  1. In the worktree (or the main checkout after `npm install`), run `npm run dev -- --port 5179`.
  2. Open http://localhost:5179/2d/lab/next.
- **Saving:** projects save in this browser only, apart from My projects. Cloud saving is for a later slice.
- **What it covers:** the platformer, single player. Rooms, race bricks, 3D and the library come later. The spec is
  `docs/CODE-LAB-SLICE-1.md`.

## The loop to try (about 15 minutes)

Do each step as a student would, and note anything confusing, slow or ugly.

1. **Play first.** Press Play and run the level with the arrows and Space. Does the Hero feel right?
2. **Pick a brick.** In Build, press Esc to put the brush down, then click a Walker in the world.
   - Its card opens to **Sliders**.
3. **Change all copies or one.**
   - With **All copies**, move speed. Every Walker changes.
   - Switch to **Just this one** and change it again. Only that Walker changes, and it gets an "own value" mark.
   - Press **Use the brick's value** to undo it.
4. **See inside.** The Walker's code opens beside the world, and the world keeps running.
   - Pause and Restart sit over the stage.
   - While it runs, the blocks that execute glow.
5. **Number edit compared with real edit.**
   - Change a number in a block. The brick keeps its name.
   - Drag in a new block. It becomes **My Walker**, a remix, for every Walker in this level only.
   - Press Restart to see the change.
6. **Back to the original.** Use the card's ⋯ menu → Back to the original → confirm.
7. **The Hero.**
   - Its Sliders show four main values.
   - See inside opens folded as four named steps: read keys and walls, walk and run, jump, fall and land.
   - Open "jump" and use the breadcrumb to come back.
8. **Make a brick.** Use + New brick → Empty, give it a name, add a "when flag clicked" script, and choose Done. It
   appears under My bricks, ready to place.
9. **On a Chromebook**, if you can: is the stage plus code panel smooth? This hasn't been measured on student
   hardware.

## What to send back

For each step: worked or didn't, and what a student would trip on. Also say which words read wrong, for example
slider, remix, or See inside. Those notes decide the polish list before Slice 2 (shared code in rooms) and Slice 3
(Code Lab becomes `/2d/build`).
