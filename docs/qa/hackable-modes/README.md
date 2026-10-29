# Hackable Racing and Hackable 3D: scoping proposal — October 29, 2026

**Status:** the owner's decisions came back on October 29.
- Slice K landed (`K.md`).
- R1's engine parts landed (`R1-engine.md`): the Car, laps, the Racing blocks, the beginner track and racers, and a
  performance check.
- R1's screens wait for the class notes.
- **Branch:** `claude/hackable-modes-proposal`, from main `e4d4930`, which matches production. It is not pushed.
- **Mocks:** linked at the end.
- **The rule this follows:** no code, pushes, deploys or migrations until the owner agrees on scope.

## In short

Both modes should be **new kits on the Hackable Platformer's runtime and studio, not new apps**. That runtime is the
scheduler, the blocks, the editor, powers, the shelf and saving. Both modes work the way the Platformer does: Build ·
Code · Play, bricks with open code, sliders, powers, + New brick, save, reopen and remix.

The two modes are not the same size:

- **Racing is small.** A top-down track is a Hackable level with gravity off, and every brick on it rotates with its
  heading. The car is a brick whose open code drives it, as the Hero's open code makes it walk and jump. The runtime's
  world model, collision, renderer and studio already fit. Racing adds about five blocks and a starter track.
- **3D is bigger.** It shares the scheduler, language, editor, powers, shelf and saving, but it needs a 3D world
  inside the studio. That means positions with a z, a 3D stage in the Code column and the 3D builder as Build. It
  also needs a way for code-moved bricks and the Explore character (Rapier) to collide.

**Recommendation:** do Racing first, with one shared "kits" seam that 3D then reuses. Each mode's first playtest slice
is solo. Racing classmates and building together come later, because Hackable projects don't have live rooms yet.

## What I read, and what it means for these modes

1. **The core runtime is already kit-neutral at its seams** (`src/platformer/lab/core`).
   - It imports nothing outside `core/`.
   - `Runtime` takes a primitive table and lifecycle hooks (`greenFlag`, `stopAll`, `afterTick`, `afterGreenFlag`).
   - The Platformer is already an extension that plugs in that way: `platformerPrimitives`, `selfMovePrimitives`, and
     `physicsStep` in `afterTick` (`core/index.ts`).
   - A Racing extension and a 3D extension can plug in the same way. The runtime needs no rewrite.
2. **The world model is 2D Scratch.**
   - `Target` has x, y and direction, with costumes and pixel masks. `Body` has vx, vy and onGround. Motion, Looks
     and pixel touching are 2D (`core/contracts.ts`).
   - Racing fits this as it is: heading is `direction`, and gravity is off.
   - 3D needs a `z` and its own motion, looks and collision blocks. Values, operators, data, control, events,
     procedures, clones, detmath and the seeded RNG all carry over unchanged.
3. **Some of the Platformer's own code can already drive a car.**
   - The self-move blocks (`move [x/y] by (n) until I hit something`, `hit something?`, `tell what I hit`) work with
     gravity off.
   - The body's x and y speeds with Scratch's `sin` and `cos` (detmath) can express a car's speed, grip and drift.
   - So the car's "drive and bounce off barriers" can be a readable My Block, as the Hero's "move and collide" is.
4. **The studio is shared, with Platformer specifics in known places.**
   - **Shared:** the shell (Build · Code · Play), the inspector, the Code column, layers and On/Off switches, the
     PowersBar, My projects and the cloud saver.
   - **Platformer-specific:** grid bricks and the starter, the Hero, the 2D canvas renderer and camera, the touch
     d-pad, and copy that says "Hackable Platformer". The Worker's error messages say it too
     (`classroom/index.ts`: "This is a Hackable Platformer. Open it there.").
5. **Power files don't say which game they are for.**
   - The format is `brickgineers-power` v1 with `fits: 'brick' | 'stage'`.
   - The shelf's `kind` allows only `'power'`, and the Worker checks that.
   - So a Double jump snapped onto a 3D brick would load, but its Platformer blocks would mean nothing there.
   - Powers need a `game` (or kit) field, read as `platformer` when it's missing.
6. **Account documents.**
   - A Hackable project is saved as `{ format: 'brickgineers-hackable', version: 1, save }`.
   - The Worker checks only the outline, so a `kit` inside the design needs no Worker change to save.
   - It does need one for kit-specific copy and for listing a project's kind on My projects and the class page.
7. **The race kit lives in the older 2D engine.** That is `packages/platformer-core` and the non-Hackable builder.
   - **The car** (`engine/car.ts`) uses floats, in px per frame at 60 fps, with 11 Feel numbers and 3 presets (Kart,
     Drifty, On rails).
   - **Laps** (`engine/laps.ts`) use hidden gates computed from a finish line with a direction.
   - **The tracks** are 64×40 to 80×48 tiles.
   - Also there: the computer driver (`raceAutopilot.ts`), items and Walkers, multiplayer races in rooms, and touch
     driving.
   - The Hackable Platformer never touched any of it. Moving the Hero into blocks followed the same path: port the
     feel, then prove it with feel tests (27 measurements, still matching).
8. **The 3D builder** (`src/brick`, `packages/brick-core`):
   - **The grid:** bricks sit on studs and plates (x and z in studs, y in plates, `STUD` 0.62 and `PLATE_HEIGHT` 0.18
     world units, 4 rotations, up to 2,000 bricks). It is y-up, like Hackable.
   - **The parts:** 11 part kinds, plus custom parts made from templates with a size.
   - **Physics:** Rapier through `@react-three/rapier`. Bricks are fixed colliders.
   - **The character controller** runs at 60 Hz: walk 3.5, run 5.4, jump 5.25, gravity −16, one air jump, coyote
     time and a jump buffer.
   - **No brick has any behaviour.**
   - Live rooms let each person pick Build or Explore.
9. **Earlier thinking this builds on.**
   - **The 3D code mock (2026-10-13):** bricks get code first (Bounce pad, Mover, Spinner, Vanishing, Lava, Button +
     Door, Coin, Checkpoint, Goal). The character gets sliders now and code last.
   - **The "one medium" mock (2026-10-14):** the same card for a Walker, a race boost pad and a 3D bounce pad.
   - **Robot Workshop v2.2** (`docs/robotics/CONTRACT.md`): blocks that drive 3D motors. It is unmerged and has its
     own runtime under `src/robotics`. The recommendation then was one runtime with an extension per kit.

## The kid-facing experience

### Hackable Racing

A top-down race track where you can change how everything drives.

- **Build** is the same drawer and inspector as the Platformer.
  - **Track bricks to paint:** Road, Dirt, Ice, Water and Barrier, plus a Boost pad and a Finish line that R turns.
    Grass is the empty background.
  - **Bricks to place:** the **Car** (one per track, like the Hero), up to three **Computer racers**, and later
    Coins, ? blocks and Walkers.
  - **The "Laps work" chip** is the race kit's: "Add a finish line", "The road doesn't loop".
  - **The Car's sliders** are the race kit's Feel numbers: top speed, acceleration, steering, grip.
- **Code** is the same editor, opened on the selected brick.
  - **The Car** reads as basics plus feel scripts, like the Hero:
    - the basics: read the keys, gas, brake, steer, and drive and bounce off barriers;
    - the feel scripts: grip and drift, and slowing down off the road.
    - Each feel script can be switched off, and the car still drives.
  - **Track bricks are ordinary bricks with short code:**
    - a Boost pad is "when a car drives over me → set its speed to (top speed × 1.6)";
    - Ice is "set grip to (0.04)" while you're on it;
    - Dirt slows you to 75%.
  - **The Stage** holds the countdown ("3, 2, 1, Go!" with say and wait) and "when someone finishes 3 laps → show
    the results".
    - So a kid can make the countdown faster, or make it 5 laps.
  - **Computer racers** run a three-block script: `point in direction (direction along the track)`, then gas.
    - A kid can make them slower, wobblier or sneakier.
- **Play:** the countdown, the laps, a lap counter and places, then results. On touch screens it uses the race kit's
  steering pad, Gas and Brake. Like the Hero's buttons, they press keys the Car's code reads.
- **Powers:** the same + Power button. The built-in ones would be Turbo button, Drift boost and Hop (a jump over
  water). They only fit race bricks.
- **First things to try in class:**
  - make ice less slippery;
  - make boost pads stronger;
  - slow the computer racers down;
  - add a Turbo power;
  - make your own brick: a mud puddle that slows you down, or a pad that spins you round.

### Hackable 3D

A 3D world where some bricks have code, and you play it as the character in Explore.

- **Two kinds of brick.**
  - Ordinary building bricks stay as they are: cheap, solid, no code. Most of a build is these.
  - **Bricks with code** are in their own drawer section: Bounce pad, Mover, Spinner, Coin and Goal first, then
    Vanishing, Lava, Button + Door and Checkpoint. Each is a brick type with a look, sliders, code and sounds, and
    each placed copy runs it, the way Walkers do in 2D.
- **Build** is today's 3D builder: the camera, placing, rotating and colours.
  - It adds the "With code" drawer section and the same inspector: Sliders · Look · Open its code.
  - For example, a Mover has "how far" and "how fast", and a Bounce pad has "how high".
- **Code** is the same Code column. The stage at the top right becomes a small 3D view that orbits, with "Whole world
  / Just this brick".
  - **3D Motion:** move up / down / forward by (n) studs, glide to x y z, change [x/y/z] by, turn, point toward the
    character.
  - **Looks:** show/hide, set colour, set size, say.
  - **3D blocks** (an extension, as Platformer is):
    - when the character touches me;
    - when the character stands on me;
    - launch the character up (n);
    - the character's x, y, z;
    - distance to the character.
  - **Plus everything Scratch-shaped**: events, control, operators, variables, broadcasts and My Blocks.
- **Play** is Explore: walk the character with today's controller while the bricks run their code. The character has
  sliders (walk, run, jump, gravity, air jumps) in the first slice. Its movement as open code comes last and needs
  feel tests, as the Hero did.
- **+ New brick:** the first slice picks a part and a colour as its look. Later, the look is a small build from
  several parts, made on a little plate in the brick's Look tab.
- **Powers:** Bob up and down, Spin, Disappear when touched, Bounce the character. They fit 3D bricks only.
- **First things to try in class:**
  - build a parkour course with bounce pads, a moving platform and a goal;
  - make the Mover go further;
  - make a coin that respawns;
  - make your own brick that launches you sideways.

## What can be shared

| Piece | Racing | 3D | Notes |
| --- | --- | --- | --- |
| Scheduler, threads, hats, My Blocks, warp, op budget (`core/runtime.ts`) | as is | as is | Already pluggable |
| Values, operators, variables and lists, control, events, broadcasts, clones | as is | as is | |
| detmath, seeded RNG, 30 ticks a second drawn at 60 | as is | as is | Keeps replays and future rooms possible |
| Motion, Looks, pixel touching (2D Scratch) | as is | **new 3D versions** | 3D adds `z` to `Target`. The same `Target` with an optional `z` keeps `Runtime` unchanged |
| Sound, keys, timer, ask | as is | as is | |
| Platformer extension | gravity off. Self-move blocks reused for the car | not used | |
| Kit extension | **Racing**: about 5 new blocks | **3D**: about 8 new blocks, plus a bridge to Rapier | |
| Blockly editor, definitions, compile, Code column, layers, On/Off, My Blocks | as is | as is | The toolbox gets the kit's categories |
| Studio shell (Build · Code · Play), inspector, drawer, PowersBar | as is, with race drawer and touch controls | shell, inspector and Code column. **Build is the 3D builder** | |
| Stage renderer | today's 2D canvas, with race art as costumes | **three.js / r3f from `src/brick`** | One canvas that stays mounted, as 2D's Stage does |
| Costume editor and Sound panel | as is | Sounds as is. Looks are parts and colours | |
| Save envelope, projects in this browser, account saver, My projects, files, Make my own copy | as is, plus `kit: 'race'` | as is, plus `kit: '3d'` | One format, `brickgineers-hackable` |
| Powers: snap, take off, credits, make a power | as is, plus `game` | as is, plus `game` | |
| Class shelf | as is, filtered by `game` | as is, filtered by `game` | `game` can live in the payload, so no migration is needed |

**What "one common engine" means here.** This plan does not rewrite anything. It adds one seam:

1. **A kit** is an object with its primitive table, lifecycle hooks, toolbox categories, starter, Build drawer, touch
   controls and Stage component.
2. **`LevelDesign.kit`** is `'race'` or `'3d'`. When it is missing, the project is a Platformer, so every saved project
   opens unchanged.
3. **Power files get `game`.** When it is missing, the power is a Platformer power.

Moving `core/` to a neutral package (`packages/hackable-core`) can happen whenever it is convenient. It stays a move,
not a change.

## Plan, in slices

The order is **K → R1 (playtest) → D1 (playtest) → R2 / D2**, and later R3 / D3.

### K. The kits seam (no change kids can see)

- **The kit registry:**
  - `LevelDesign.kit` and the envelope;
  - the Platformer as the first kit;
  - `game` on power files, and filtering in "+ Power" and the shelf picker.
- **Kid-facing copy** that names the kit, in the app and in the Worker's error messages.
- **Done when:**
  - the Platformer's feel tests, the side-by-side self-move test, the golden saves and the powers tests all pass
    unchanged;
  - a design with `kit: 'race'` validates, saves and reopens.

### R1. Hackable Racing, solo: the first playtest slice

- **The track:** one beginner track, the size of Snowy Oval. It is painted with grid bricks: Road, Dirt, Ice, Barrier,
  Boost pad and Finish line. Grass is the empty background.
- **The Car:** open code, the basics plus feel scripts, and four sliders.
  - The car's code is checked against `engine/car.ts` with **feel tests**: time to top speed, stopping distance, turn
    circle, the grass and dirt caps, the boost pad, and drift on ice.
  - The method is the same as the Hero's: 60 fps numbers are converted to 30 ticks a second (speed ×2,
    acceleration ×4).
- **Two Computer racers**, a Stage with the countdown, and the results.
- **The Racing extension** has about five blocks. It is "built in, like touching":
  - `ground under me`: the grid brick under the car's centre;
  - `direction along the track`;
  - `laps done`;
  - `when I finish a lap`;
  - `my place`.
  - The laps logic is `laps.ts` adapted to grid bricks, and the Build chip says why laps don't count.
- **Projects:**
  - a "Hackable Race Track" card under New project;
  - My projects, account saving and Make my own copy, all through the existing Hackable paths.
- **Touch:** the race kit's steering pad, Gas and Brake.
- **Not in R1:** items, coins, Walkers, jump ramps, powers on the shelf, racing classmates.
- **Under the hood, done October 29** (`R1-engine.md`):
  - The Car's feel matches car.ts on all 11 feel tests (`RACE_FEEL.md`).
  - Laps match `laps.ts` cell for cell, and a full race runs headless.
  - **Performance:** the beginner track has 1,080 targets. With the CPU slowed 6× in headless Chrome, a tick takes
    p95 1.8 ms and a draw p95 3.8 ms. The worst frame's JS is 15 ms, and no frame is late at 60 fps. At 4×, those
    numbers are 1.3, 2.4 and 8.4 ms. This was not measured on real Chromebook hardware.
- **Playtest questions:**
  - Can a student paint a track that laps?
  - Can they make ice less slippery, or slow the computer racers?
  - Do they make a brick of their own?

### D1. Hackable 3D, solo: the second playtest slice

- **Done first, with no kid-facing change:** headless tests for 3D targets (`z`, 3D motion, 3D bounds) in the shared
  scheduler.
- **The starter world:** a short obstacle course built in the 3D builder. It has five bricks with code (Bounce pad,
  Mover, Spinner, Coin, Goal) and a Stage that counts coins.
- **Build:** the existing 3D builder, with the "With code" drawer section and the inspector.
- **Code:** the Code column with a small 3D preview, using the blocks listed above.
- **Play:** Explore, with the character's sliders.
- **Collision:**
  - Bricks moved by code become kinematic bodies.
  - The runtime owns their positions, and Rapier reads them each frame.
  - A character standing on a moving brick is carried by our own code, because Rapier's character controller doesn't
    do it. Tests cover this.
  - "Touching the character" uses the character's pose, given to the runtime as an input each tick, so it stays
    deterministic.
- **+ New brick:** pick a part and a colour, then write code.
- **Projects:** the same Hackable project paths, with `kit: '3d'`. Opening one in the 3D builder or a 3D room is
  refused, as Hackable worlds are today.
- **Not in D1:**
  - looks built from several parts;
  - the character as code;
  - rooms;
  - robotics parts.

### Later

- **R2:**
  - race powers (Turbo, Drift boost, Hop) on the class shelf;
  - "Start from Boost pad / Mud / Ramp";
  - coins and ? block items as bricks with code;
  - Walkers.
- **D2:**
  - looks built from several parts;
  - 3D powers on the shelf;
  - Vanishing, Lava, Button + Door and Checkpoint.
- **R3, racing classmates:** this needs live rooms for Hackable projects, which don't exist for any kit yet.
  - A cheaper first step is a class best-lap board, or racing a classmate's ghost.
  - This is also where the class `race_heroes` setting (already stored) finally applies.
- **D3:**
  - the character's movement as open code, behind feel tests;
  - 3D rooms for Hackable worlds;
  - Robot Workshop's motors as a 3D kit extension.

R1 is roughly half the size of D1. Most of D1 is the 3D Stage inside the studio and the Rapier bridge.

## Risks

- **Race feel at 30 ticks a second.**
  - The car uses trigonometry, so its code must use our `sin` and `cos` (detmath), never the browser's.
  - The Hero shows that the conversion works. The feel tests are the gate, and physics changes never ride along
    with UI work.
- **Cell counts.**
  - Every painted cell is a target. The beginner tracks have about 1,000 to 3,000 non-grass cells.
  - The performance test covers 4,000. The grass background costs nothing.
  - Nobody has measured this on a Chromebook yet, for either kit.
- **Two race implementations.**
  - The race kit stays as it is: rooms, items and tested feel.
  - Hackable Racing is its own project kind, as the Hackable Platformer sits beside the 2D builder today.
  - Whether to merge them later is a separate decision.
- **3D on school hardware.**
  - The builder, a Code column and a 3D preview at once. One WebGL canvas has to move between the columns, never two
    canvases.
  - Mitigation: code-moved bricks are few, and scenery stays fixed colliders.
- **Moving platforms carrying the character.** This is the hardest 3D detail. It needs its own tests before any
  classroom use.
- **Overlap with Robot Workshop.** Two block runtimes for 3D would split the "one medium" promise.

## Open questions for the owner

1. **Order:** Racing first (R1), then 3D (D1)? Or 3D first because students ask for it?
2. **Names and addresses:**
   - "Hackable Racing" or "Hackable Race Track"? "Hackable 3D" or something else?
   - One page that knows its kit (`/2d/hackable?new=1&kit=race`), or separate addresses (`/2d/hackable-race`,
     `/3d/hackable`)?
3. **Solo first:** is solo racing against two computer racers enough for the first class test? Or must classmates
   race each other from day one? That means live rooms for Hackable projects, which is a bigger job.
4. **Existing race tracks:** should a race-kit track open as a Hackable Race Track ("Make it hackable"), with its
   tiles mapped to grid bricks? It's cheap, and it gives kids their own tracks to hack.
5. **Which 3D bricks get code:**
   - Only bricks from the "With code" section? This is the recommendation. It keeps big builds fast.
   - Or can any building brick get "Add code"?
6. **3D units:** studs for x and z and plates for y, matching the builder? Or studs on every axis, so "change y by 1"
   is a stud?
7. **The 3D character:** sliders only in D1, with movement as code last? This is the recommendation, the same path
   as the Hero.
8. **Robot Workshop:** fold its motors into Hackable 3D as an extension after D1 (recommended)? Or keep it separate?
9. **Powers across kits:** should a power show only for its own game? This is the recommendation. Or should the shelf
   show everything with a tag?
10. **Timing:** wait for notes from today's class test of the Hackable Platformer before R1's UI details? Anything
    students trip on in the shell would be inherited by both new modes.

## Mocks

The mock board is private: https://claude.ai/artifact/VZBV1sxR4CrucxfCLeHFbx. It has two boards for each mode:

- **Racing · Build:** the Car selected, its four sliders and the Kart / Drifty / On rails presets, and the "Laps work"
  chip.
- **Racing · Code:** the Car as basics plus feel scripts, one feel script switched off, the "drive and bounce off
  barriers" My Block, the laps hat, and a Turbo power from the shelf.
- **3D · Build:** the "With code" drawer section above the building bricks, a Mover selected with "Every Mover / Just
  this one", and a Mover's path.
- **3D · Code:** a remixed Bounce pad. It has a "super bounce every third time" script, the Bob up and down power,
  and the 3D blocks.

In the mocks, the block wording is a first suggestion. Blocks named like Scratch blocks keep Scratch's meaning. The new
ones (3D Motion, the 3D and Racing extensions) get their final names in K and R1.
