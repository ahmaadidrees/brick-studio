# Layered bricks — October 28, 2026

The first steps toward bricks with layers you can open, and power bricks (mocks:
https://claude.ai/artifact/FYUW9cJRMxiz6XdSrWuMH1). This lives on branch `claude/code-lab-on-main`; it is not deployed
and not linked for students.

## What's built

1. **Hook hats** (Platformer):
   - **"every tick"** runs a script exactly once per tick, in program order. A `forever` loop can run several times in
     a tick when nothing redraws.
   - **"when I land"** and **"when I leave the ground"**.
   - A script turned off in the editor no longer runs.
2. **The Hero as basics plus feel scripts:** 19 "every tick" scripts instead of nine My Blocks.
   - **The basics:** read the keys; start each tick with the normal numbers; walk; jump; gravity; top fall speed;
     move.
   - **The feel scripts:** run with x, skid, run meter, coyote time, jump buffer, faster jumps go higher, hold to jump
     higher, wall slide, wall jump.
   - Each feel script runs just before the basic it changes and adjusts one number. With every one on, the
     arithmetic is the old Hero's; with one off, the Hero still works.
3. **Collision kids can open.**
   - **New blocks:**
     - "move me with [my own blocks]" takes a brick out of the physics step;
     - "move [x] by (n) until I hit something";
     - "hit something?";
     - "tell what I hit";
     - "set on ground? to [yes/no]".
   - The search for what's in the way is the engine's own sweep, reused, so it stays built in, like Scratch's
     "touching".
   - The Hero moves itself: its last script calls **"move and collide"**, a My Block of about a dozen readable blocks.
     It is read-only until a kid changes a block.
   - Every other brick is still moved by the engine.

## How it's checked

- **The feel tests:** all 27 measurements still match the original engine (speeds, times to top speed, stopping and
  skid distances, jump heights and airtimes, jump distances, fall speed, coyote time, jump buffer, walls).
- **Side by side** (`core/selfmove.test.ts`): five 600-tick levels run once moved by the engine and once by the
  blocks. Positions, speeds, "on ground", bumps on every side and landings must be identical on every tick.
- **Interactions with the real Hero:** spikes, lava, a ? block hit from below, both Bounce block heights, the Spring,
  stomping a Walker, walking into one, and reaching the Goal.
- **Saved projects:** a Hero whose blocks are exactly an earlier built-in Hero (recognised by fingerprint) loads as
  the new one and keeps tuned slider values. Any other Hero is left alone, because older saves predate "My Hero" and
  may hold a kid's edits. The previous Hero is kept as a fixture for this test.
- **The editor's tidy** keeps columns, so the basics and the feel scripts stay side by side.
- `npx vitest run`: 2,919 tests pass. `tsc` and `npm run build` pass.

## Known

- "Every tick" scripts run in the order they were made. A kid's new script that changes one of the "normal numbers"
  runs after the basics have used them, so it only takes effect if placed earlier. Showing or changing the order is
  not built yet.
- A solid that a script moves without speeds (go to, change y) is seen by a self-moving brick where it was at the
  first move that tick.

## Not built yet

- On/Off switches for feel scripts in Code.
- Power bricks: snapping on, combining and credit.
- Single-brick export and import, and the class shelf.
