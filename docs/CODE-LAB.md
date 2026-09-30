# Code Lab (`/2d/lab`) — proof of concept

Everything in a lab level is a program a kid can open, change and extend: every brick with behavior (Walker,
Spring, ? Block, moving platform, coins, the goal…) and the player's own moves. Single player; nothing here touches
the live `/2d` pages, rooms or the network code.

## Run it

```sh
npm install
npm run dev          # then open http://localhost:5173/2d/lab
```

- **Layout:** code on the left, the stage on the right, and under it the watched thing's live values and
  **In this level** (you first, then each brick with a count; **See inside** opens its code). **+ Add** is the brick
  library. **Build | Play** in the header; **I want to…** opens the examples. Over the code, **Blocks |
  JavaScript | Python** shows the same code as text to read.
- **Keys** (click the stage first; clicks in the code give the keys back to the code): ← → move, space jumps (hold
  for higher), X runs, and Z, ↑, ↓ are free for your own code.
- The lab is saved in this browser only (`localStorage`, `brick-studio.2d.lab.v1`). **Start the lab over** (under
  the list) clears it.

## Starter examples ("I want to…")

Each one is made only of the primitives below; opening it puts the code where it belongs and opens it.

| I want to… | Where the code goes | Try it |
|---|---|---|
| jump again in the air | your moves | Walk left from the start to the lava gap: one jump can't cross it, a double jump can |
| throw a ball | your moves | Z. The ball starts at your hand, flies the way you face, bounces, knocks out Walkers; 0.4 s cooldown |
| build a car you can ride | a new *Car* brick, placed next to you | Walk next to it and press ↑ to board; arrows drive; ↓ exits beside it. Open its code to see the variable, key checks and position blocks |
| draw and animate a character | your moves | Draw two costume frames, press Play, then click the character to speak and step to its next frame |
| ride a shortcut car | a new *Car* brick, placed next to you | The original example stays available: ↑ gets in, ← → drive (it knocks out Walkers), ↓ gets out |
| ride a rocket | a new *Rocket* brick, placed next to you | ↑ gets on, hold space to thrust; the fuel meter runs down, refills when it lands; ← → steer |
| make Walkers turn at ledges | your copy of the built-in Walker | Watch the Walkers on the two ledges right of the start |

Recordings of all five: `scripts/demo/record-lab.mjs` (see *Checks* below); stills are in
`docs/qa/code-lab-2026-09-27/`.

Three more examples extend the same language: [a returning ball, a broadcast-controlled vehicle, and a reusable
patrol block](CODE-LAB-FREEDOM.md). The **Make it yours** sheet walks through drawing an animated character and
inspecting the car built from general blocks. [Short tutorials](CODE-LAB-TUTORIALS.md) explain variables, reusable
blocks, and reopening authored programs.

## Primitives (the blocks)

| Asked for | Blocks |
|---|---|
| make a thing (spawn at a spot) | `make a [brick] at [my hand / my feet / above me / where I am / the start]` (then **it** is the new thing) · `remove [me/it/them]` |
| push it | `set / change [my/its/their/the player's] speed [forward/backward/up/down/right/left] to/by N` · `launch [who] at A° power P` (0° = the way *I* face, 90° = up) · `stop [who] moving` · `turn around` · `face …` · `move [who] to [spot]` |
| body settings | `set my [gravity/bounce/friction] to N %` · `make me [solid / a platform / not solid]` |
| when touching | `when I touch [the player / anything / the ground or a wall / spikes / lava / a <brick>] [anywhere / on my top / bottom / side]` (in it, **them** is what I touched) · `touching […]?` |
| ride / take control | `let [them/the player/it] ride me` · `drop my rider` · `someone is riding me?` · `I am riding something?` — a rider's own keys stop moving it; the vehicle's code reads the keys |
| memory | `set / change [my / the player's] [fuel/jumps/cooldown/coins/…] …` · `[my] [fuel]` (names are picked from a list: they show in the game) |
| look | `switch costume to […]` · `set my color to […]` · `set my size to N %` · `say [picked phrase] for N seconds` · `show [my fuel] above me` · `play sound […]` |
| draw and animate | draw costume frames in the appearance editor · `switch to frame N` · `next frame` · `play frames at N per second` · `stop frames` · `when clicked` · `say [your words] for N seconds` |
| take control | `turn [my/player/it/them] controls and physics on/off` · `show/hide [my/player/it/them]` · position reporters and `move to x/y` |
| timers | `wait N seconds` · `wait until …` · `every N seconds` (hat) · `seconds since I appeared` |
| events | `when I appear` · `when [key] pressed` · `when I get stomped` · plus `when I land`, `when I get hurt` / `hurt [who]` |
| (the player) | `run and jump with the keys` / `stop running with the keys` · `set my [jump power / run speed] to N %` |

Also: `repeat`, `forever`, `if / else`, `stop this script`, compare / and / or / not, + − × ÷, `pick random`,
`key held?`, `on the ground?`, `my speed …`, `distance to …`, and one look-around block (below).

### What didn't fit the list (new primitives, not special cases)

- **Looking ahead** — `is there [ground / a wall / spikes / lava / a thing / the player] [ahead / ahead and down / below me / above me / behind me]?`.
  The ledge-turning Walker needs to see the ground end before it steps off; nothing in the list could.
- **`when I land`** — resetting air jumps needs "I came down on something". It is a narrow case of touching from
  above, but "when I touch the ground on my bottom" also fires for landing on things, so it got its own hat.
- **Hurting as a message** — `hurt [them]` starts their `when I get hurt`. Damage is not built in: your moves decide
  what hurt means (the default goes back to the start), and deleting that script makes you lava-proof.
- **Pronouns** — *me, it (what I made last), them (who touched/stomped/hurt me), the player, my rider*: blocks act on
  other things through these, not through ids.

## What is real and what is faked

**Real**
- Block programs all the way down: Blockly workspace JSON → typed IR (`program/compile.ts`, never `eval`, no
  generated JavaScript) → a fiber interpreter (`runtime/`) adapted from `claude/robotics-kid-int`
  (`src/robotics/program`, `src/robotics/runtime`, `src/robotics/code`; the 3D parts were not taken).
- **Bounded:** each thing may spend 1,500 ops a frame (shared by its scripts), the level 40,000; a script that runs
  out pauses and continues next frame, so a runaway `repeat` spreads out instead of freezing the game. Programs are
  capped at 600 blocks, 24 scripts, 24 levels of nesting; the level at 300 things, 6 makes per thing per frame.
- **Plain data:** the world, every running script (as statement-list keys and positions) and every memory are plain
  data: tests round-trip a running world through JSON and keep it in lockstep, and two runs with the same keys give
  the same world.
- **Live edits:** code edited while playing is swapped into running things: loop bodies change in place (memories
  kept), a change to what a script already did starts that script again, a new `when I appear` script runs at once.
- **Copy-on-write:** changing a built-in makes the lab's own copy (every thing of that brick runs it; *Back to the
  original* drops it). *Save as a new brick* gives it a picked name ("Smart Walker"); the level's things switch to it,
  and it still counts as "a Walker" for anything looking for Walkers.
- **Glow and live values:** the blocks the watched thing ran in the last ~⅙ s glow (a `turn around` flashes when the
  Walker turns); the panel shows its speeds, whether it is on the ground, its rider and its memories, each of which
  can be shown over it on the stage.
- **Kid text:** every word the game can show is picked (memory names, brick names from adjectives, speech phrases);
  there are no text fields in blocks (numbers only) and Blockly comments are off.

**Faked or simplified**
- The lab runs **its own small world** (`src/platformer/lab/sim`), not the engine's `World`: the engine's creatures
  and items are hard-coded, and changing that would have touched the determinism-tested, room-synced engine. The lab
  reuses the engine's tile collision, tile flags, feel numbers and the `/2d` renderer and cartoon art;
  `packages/platformer-core` is unchanged. Lab levels and `/2d` levels do not convert into each other.
- **"Run and jump with the keys"** is one block wrapping a port of the engine player's movement (walk/run speeds,
  speed-based jump heights, hold-to-jump-higher, coyote time, jump buffer). No crouch, run meter, wall jumps or
  power-ups. A script's upward push on it counts as a jump you can hold.
- Two solid things moving into each other do not push; platforms carry what stands on them but don't shove sideways.
- Build tools are basic: pick/move, paint six tile kinds, erase, move the start. No undo for level edits (Blockly's
  own undo works in the code).
- Keyboard only (no on-screen touch controls for playing). No account saving, sharing or rooms.
- The **JavaScript and Python views are read-only**, printed from the compiled IR (`program/text.ts`), so they always
  say what runs; editing text (a parser back to blocks) was out of scope.

## Where the code is

```
src/platformer/lab/
  LabApp.tsx, lab.css        the page (lazy chunk; Blockly loads only here)
  session.ts                 world + keys + camera + sound + build tools; the page talks to this
  book.ts                    compiles each brick's code (cached) and swaps edits into running things
  program/                   block catalog + toolbox, compiler, IR types and limits
  runtime/                   fiber interpreter, bounded evaluation
  sim/                       world, bodies and the player's controls, touches
  bricks/                    built-in bricks and the examples, written as block programs (dsl.ts)
  level/                     the starter level, the lab document (copies, new bricks, recipes), browser storage
  render/, ui/               costumes and stage overlay; Blockly panel, lists and sheets
```

Routing: `/2d/lab` in `src/platformer/routes2d.ts`, rendered lazily by `PlatformerApp.tsx`. Dependency added:
`blockly` 13.3.0 (same version and lockfile change as the robotics branch).

## Checks

```sh
npx vitest run src/platformer/lab          # compiler, runtime, physics, recovery, editor, and ten examples
npm run check                              # everything, including the engine's determinism tests
PLAYWRIGHT_MODULE=… DEMO_OUT=demo-out node scripts/demo/record-lab.mjs   # the five recordings (dev site on :5199)
```

The acceptance tests (`bricks/recipes.test.ts`) drive the keyboard frame by frame on the starter level: every
timing of a single jump fails to cross the gap and the double jump crosses it; the ball starts at your hand, flies
the way you face, bounces, respects the cooldown and knocks out a Walker; the car takes you in, out-runs you and
lets you out; the rocket climbs while fuel lasts, falls, refills on landing and lifts you onto a cliff no jump
reaches; the edited Walker never leaves its ledge, and the original does.

`bricks/freedom.test.ts` also steps the returning ball, signal-controlled car and parameterized patrol frame by
frame. These examples run in this single-player lab and save in this browser's local storage. The JavaScript and
Python panes remain read-only views of the blocks.
