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

4. **On/Off switches.** Every script's label in Code starts with an On/Off switch. Off is Blockly's own disabled
   state: the script stays in place, greyed, and doesn't run. It is one undo step. On a built-in brick this is
   tuning, not a remix, and Back to the original turns it on again.
5. **Power bricks** (`studio/powers/`).
   - **A power is a file:** a name, credits (maker first, then remixers), one line on what it does, what it fits
     (a placed brick or the Stage), its scripts and its own variables.
   - **"+ Power" in Code** snaps one on from three places: Code Lab's own (Double jump, Dash, Hop), My powers (kept
     in this browser), or a power file.
   - **Snapping copies its scripts in with fresh ids.** Its variables get ids of their own, and a clashing name gets
     "(Double jump)" or a number added. The brick records which blocks and variables came from which power.
   - **The Powers row** shows each power with who made it, an On/Off switch for all its scripts, and Take off,
     which removes exactly what it added.
   - **"Make a power from this brick…"** turns chosen scripts (and the My Blocks they call) into a power. It keeps
     the variables they use, with their values, and credits whoever made the scripts' power first. It can be saved
     as a file to hand to a classmate.
   - Painted grid bricks don't take powers.

6. **The class shelf.**
   - **Database:** migration `supabase/migrations/202610280001_brick_class_shelf.sql` adds `brick_shelf_items`
     (at most 64 KB each, 100 per class) and two class settings: `shelf_needs_review` (on by default) and
     `race_heroes` (`builtin`, `shelf` or `any`). Like every product table, only the Worker can reach it.
   - **Worker routes** (`/classroom/classes/:id/shelf`) list, fetch, share, review (teacher only), remove (the maker
     or the teacher) and count uses.
     - A student's share waits for the teacher while the class checks first, and waiting or hidden items don't exist
       for classmates.
     - Makers show as first name and last initial. The class's "students can share" switch and rate limits apply.
     - The server checks the power file again rather than trusting the browser.
   - **In Code Lab** (signed in): "+ Power" lists the class shelf, and "Share with my class" follows "Make a power".
   - **On the class page:** a Shelf tab with the review queue and both settings.
   - **Races:** Code Lab levels can't race yet, and the race kit's Heroes aren't Code Lab bricks. The race setting is
     stored and shown but not enforced.

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
- **Powers** (`powers/powers.test.ts`, `screen/PowersBar.test.tsx`):
  - Double jump really takes the Hero higher, and a single press is still one normal jump.
  - Taking a power off leaves the brick exactly as before.
  - Switching it off restores the plain jump exactly.
  - Hop makes a Walker hop.
  - Snapping the same power twice gives clean names.
  - Credits chain correctly, files round-trip, and junk files are refused.
- **Full suite:** 2,932 tests pass; two timed out under full-suite load and pass alone. The performance test's
  timings match the commit before this work. `tsc` and `npm run build` pass.

## Known

- "Every tick" scripts run in the order they were made. A kid's new script that changes one of the "normal numbers"
  runs after the basics have used them, so it only takes effect if placed earlier. Showing or changing the order is
  not built yet.
- A solid that a script moves without speeds (go to, change y) is seen by a self-moving brick where it was at the
  first move that tick.

- Power scripts run after the brick's own scripts, so a power that changes one of the Hero's "normal numbers" has no
  effect. Code Lab's own powers act directly: they set speeds and keep their own memory.
- **Making a power copies, it doesn't link:** a power made from scripts that use the Hero's own variables (like
  "late jump ticks") carries copies of them.

## Deploying the shelf

1. Apply `202610280001_brick_class_shelf.sql` to the production Supabase.
2. Deploy the Worker.
3. Deploy the site.

The Worker's shelf routes fail without the table. The site works with an older Worker, but its shelf calls do
nothing.

## Not built yet

- Enforcing the race setting, once Code Lab levels can race.
- Exporting and importing a whole brick (place and Hero bricks). Powers already travel as files.
