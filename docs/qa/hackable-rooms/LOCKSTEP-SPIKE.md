# Lockstep sync test: November 3, 2026

The owner said "Yes, start both" (the rooms design doc and this test). The question was whether every player's
browser can run the same Hackable game and stay identical, so that a room only has to share key presses and edits.
Safari matters most, because iPads run it.

**Answer: yes for the game itself. Late joiners don't work yet.**
- Node, Chrome 156 and WebKit 26.5 (Safari's engine) produce the same game on every one of 1,800 ticks, in both games.
  That held through a live code edit, a knob edit and two restarts.
- A copy saved halfway and loaded into a fresh runtime goes wrong on the very next tick. Some game state lives outside
  the saved world, so that has to be fixed before late joiners or rewind can work.

- **Branch:** `claude/hackable-rooms`, from c70d457. Nothing in the product changed.
- **Run it:** `node scripts/qa/lockstep/run.mjs [--ticks 1800] [--out dir] [--strict-rejoin]`. It takes about 2
  minutes and exits 1 when engines disagree. `--strict-rejoin` also fails on the late joiner, for once M0 fixes it.
- **Results:** `lockstep/summary.json`.

## What the test does

`scripts/qa/lockstep/harness.ts` runs inside each engine; `run.mjs` bundles it once with esbuild, so every engine runs
the same code.

1. **The project:** each starter project (`createStarterProject`, `createRaceStarterProject`) is saved with
   `exportProjectJson` and opened with `importProjectJson`. Every engine starts from the same saved text, the way a
   room would send it.
2. **The timeline,** 1,800 ticks (60 seconds):
   - **A kid's key presses** from a seed: about 640 presses and releases. Platformer: arrows, Space and X. Racing: the
     four arrows.
   - **Tick 300, a code edit, "Coin now worth 5":** the Stage's "change coins by 1" becomes "by 5". The running world's
     brick is replaced, so scripts started from then on run the new blocks. The race Stage has no such block, so Racing
     skips this edit.
   - **Tick 750, a knob edit:** the Hero's "jump power" or the Car's "top speed" × 1.3, on the live copy and in the
     project.
   - **Ticks 600 and 1200, "Play again":** a fresh runtime from the project as edited so far, as the studio's Play does.
     The Hero reaches the flag in about 20 seconds, so without restarts the rest of the run sat still.
3. **The fingerprint, every tick:** every target, with position, direction, costume, variables, lists, body, bubble and
   effects. Also the random-number state, the clock, the keys held, and every running script's place in its blocks.
   - Numbers are written with `String()`. Two numbers give the same text only if they are equal to the last bit, so one
     bit of drift shows.
   - The whole text is hashed to 64 bits.
4. **Engines:**
   - Node 22 twice;
   - system Chrome through the QA Playwright module;
   - WebKit through Playwright. The Playwright module wants WebKit build 2311, which isn't installed, so `run.mjs` falls
     back to the newest build in the Playwright cache (2359, which is WebKit 26.5). `WEBKIT_PATH` overrides it.
5. **The late joiner:** the same timeline, but at tick 900 the world, minus its bricks, is turned into JSON, as a room
   would send it. A fresh `createRuntime(project)` then `restoreWorld(parsed)` and plays on. It should match the copy
   that never stopped.

## Results

| | Platformer | Racing |
|---|---|---|
| Node, Node again, Chrome 156, WebKit 26.5 | Same on all 1,800 ticks | Same on all 1,800 ticks |
| One tick, step only (Chrome / WebKit / Node, over three runs) | 0.08–0.10 / 0.09 / 0.10–0.20 ms | 0.16–0.30 / 0.20–0.38 / 0.25–0.68 ms |
| Late joiner at tick 900 | Differs from tick 900 | Differs from tick 900 |
| Saved world (JSON, without bricks), raw / gzip | about 46–104 KB / 2 KB | about 433–541 KB / 13 KB |
| The project itself, raw / gzip | 596 KB / 37 KB | 542 KB / 32 KB |
| Copying the world once (Node, Apple Silicon) | 0.9 ms | 3.4 ms |

Racing's world is large because each of its 1,076 track cells is a live target. They almost never change.

### Why the engines agree

The core avoids everything that can differ between browsers:
- Trig and powers go through `detmath.ts`, which uses only + − × ÷ and `sqrt`.
- Random numbers come from the project's seed (`rng.ts`).
- Time is counted in ticks, never the wall clock.
- Runaway scripts are stopped by counting operations, not milliseconds.
- The only other transcendental call in the core is `Math.hypot` in `geometry.ts` `radiusOf`. It is a conservative
  pre-check for touching, so a last-bit difference there can't change a result. It is still worth swapping for
  `Math.sqrt(x*x + y*y)`.

### Why the late joiner breaks: game state outside the world

`World` is meant to be the whole game, but some modules keep state in their own `WeakMap`s keyed by the runtime or a
target. A fresh runtime never sees it:

| State | Where | Effect on a restored copy |
|---|---|---|
| Which runtimes run "every tick" scripts | `platformer.ts` `ticking` (a WeakSet filled by the green flag) | **No "every tick" script runs again.** The Hero's moves and every racer stop at once: the first difference. |
| Next thread id | `Runtime._nextThreadId` (restored only as the highest live id + 1) | New scripts get different ids. Harmless to play, but it changes the fingerprint. |
| A self-moving brick's last hit, the bumps told this tick, and whether it was on the ground | `platformer.ts` `lastHit`, `toldBumps`, `selfGround` | Landing, leaving the ground and "tell me what I hit" go wrong for a tick. |
| Laps, gates passed, distance round the track, lap times | `race.ts` `laps` | **Every racer's laps restart at 0.** |
| Say-bubble ids | `looks.ts` `bubbleIds` | A "say for 2 seconds" can clear a newer bubble. |

These are only caches, and fine as they are: `frameIndex`, `loops`, `aims`, `groundNames`, `radiusCache`.

**The fix (M0):** move that state into `World`, or onto `Target`, as plain data. Give `World` a `nextThreadId`. Then
add one test: save to JSON at any tick, restore, and the fingerprints match to the end. `run.mjs --strict-rejoin`
already checks this and will go green when it holds.

## What this means for rooms

- **The approach works.** Rooms can share only key presses and edits, and every computer runs the game itself, as
  classic rooms already do for their world.
- **Edits are cheap.** A code edit is one brick's program, applied at a tick. The test applied it identically in all
  three engines.
- **The traffic is tiny.** About 11 key changes a second per player, against 46–540 KB for a full state.
- **Rewind is affordable:** a copy plus ten ticks costs about 2 ms for the Platformer and about 5 ms for Racing. That
  is the step that hides other players' lag (see README). Racing's copy should skip the track cells that never
  changed.

## Not covered

- **More than one player.** The runtime has one set of keys and one Hero, so this was one player's keys. Per-player
  input is M0 work (README).
- **Firefox:** not installed for Playwright. Real iPads and Chromebooks were not tried.
  - iPad Safari uses the same JavaScriptCore as WebKit on a Mac.
  - The + − × ÷ and `sqrt` that the core relies on give the same answers on every CPU.
  - So this is low risk, but it hasn't been tried.
- **Longer runs, clones and lists.** This was 60 seconds of the two starters. Kids' own projects with clones, lists,
  "pick random" and ask/answer weren't run. The fingerprint covers them, so a test on real class projects is the next
  step.
- **Rewind with a late event.** Not tried, because the late-joiner state gap blocks it.
