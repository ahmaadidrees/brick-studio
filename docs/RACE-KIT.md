# Race kit

Spec · 2026-10-13 · Agreed with the owner after the race kit mocks (v2:
https://claude.ai/artifact/VhbMK6yFMPud6Q57nPxNSd) and the landing kit picker mock. Branch `claude/racing-kit`,
forked from production (`codex/invites-motion-pipes` 31a171b), not from `main` (stale) or Code Lab.

## What it is

A second kit for 2D worlds: a top-down race track you paint, then race alone or with classmates in the same room,
Mario Kart style. Same rooms, invites, saving, Build and Play as the platformer. Feel comes first; turning the race
bricks into Code Lab bricks comes later, the way the platformer did.

## Decisions

- **A level's kit is chosen once.** `LevelDesign.kit` is `'race'` or absent (a platformer). Saved levels without
  it are platformers, so nothing anyone made changes. `kit` and `race` are written only for race levels.
- **Each kit has its own tile ids.** Tiles are stored as letters A–Z (26 ids). The platformer uses 14, the race kit
  19 (`engine/raceTiles.ts`), so a level's kit says what its bytes mean. Grass is 0 in the race kit, like empty in
  the platformer. Race levels have no ? block contents.
- **Race settings live on the level:** `race: { laps 1–9, startDir, finishDir, items }`, saved as
  `[laps, startDir, finishDir, items]`, changed by an edit op `{ o: 'race' }` so rooms share it.
- **No checkpoint brick.** The finish line has a direction. `computeLoop` follows the track from the line's arrow
  side back round to it and numbers every tile; three hidden gates sit at ¼, ½ and ¾. A lap counts only when you
  cross the line the arrow's way after all three. The builder can say why laps don't count: no finish line, the
  road doesn't loop, or the line misses part of the road.
- **Cars are local, like the platformer's player.** Each game drives its own car and sends where it is; only edits
  (and later item boxes and hits) are shared world events. So the car uses floats, in pixels per frame at 60 fps.
  Default feel is the mock's "Kart" preset; every number is a Feel slider.
- **Room compatibility.** Platformer fingerprints are unchanged (the hash mixes kit data only for race levels).
  Platformer-only events (stomp, kick, bump, coin, take, spark) are refused in race rooms. The Worker must be
  deployed before or with the app: an older Worker cannot read race levels.

## Milestones

1. **Engine** (`packages/platformer-core`): kit and race settings in the level format and edits; race tiles; car
   physics (`engine/car.ts`); lap gates (`engine/laps.ts`); a computer driver for any looping track
   (`engine/raceAutopilot.ts`); the starter track Brick Speedway (`levels/raceCourses.ts`). Then solo racing in the
   app: `/2d/play/speedway`, top-down drawing, camera, HUD, countdown, results.
2. **Builder** (done): the 2D builder is kit-aware rather than a second builder, so saving, undo, rooms and sharing
   are shared. Race tracks draw top-down in the same camera and world pixels (`race/raceView.ts`, chunk-cached), so
   the editor and pointer code are unchanged; the editor knows the race kit (paints under the grid, keeps the grid,
   R turns boost pads, the grid and the finish line; race settings are an undoable `{ o: 'race' }` edit; pipe logic
   stays off race tracks because boost pads reuse pipe tile numbers). Play runs `race/raceRun.ts` (shared race
   rules, used for every race). Kit picker on "New world" (home and the builder menu):
   `/2d/build?new=1&kit=race-starter|race-empty`. "Laps work" chip, laps in the strip, race Feel panel.
   Not yet: "Build together"/"With friends" on race tracks (milestone 3), a zoomed-out build view, items.
3. **Multiplayer races** (done): each game still drives its own car; poses carry heading, jump height, laps,
   distance round the lap, gates, which race and the finish time (`hd lf rl rp rg ra rf`, forwarded by the room).
   A shared `{ t: 'race' }` event sets `world.raceAt`, so everyone's lights start at the same world tick
   (snapshots carry it as `ra`; platformer worlds and fingerprints are unchanged). Before a race the room practises;
   newcomers join a race under way (or practise if it started over 10 minutes ago). Each player gets their own grid
   slot and their room colour. The host can start or restart any time; anyone else once 75 seconds have passed since
   the last start (`race_busy`). Standings mix your laps with everyone's reported ones. Rooms and "With friends"
   are on for race tracks again. Checked end to end with a local Worker (`wrangler dev`) and two browser tabs.
4. **Items, coins and Walkers** (done): new bricks ? block, Coin (Items) and Walker (Critters, R turns it across or
   along the road), and an "Items on/off" track setting. ? blocks and coins are each game's own: driving through one
   takes it for you, and it comes back for you (3 s, 6 s). Items roll by weight: Turbo 30, Oil slick 24, Bouncy ball
   20, Spark 14, Shield 12; Space uses yours. Turbo and Shield act on your own car (a shielded car spins whoever it
   touches, rooms included via pose `sh`). Coins add 1.2% top speed each, up to 10; spinning out drops 3, water 2.
   Balls, sparks and oil slicks are shared world state (`{ t: 'item', k, x, y, vx, vy, o }`, entities
   `RACE_BALL/SPARK/SLICK`, whole sub-pixel numbers), so everyone sees the same ones; balls bounce, sparks burst on
   walls, slicks dry up after 25 s. The car that runs into one says so with `{ t: 'hit', id }`, which uses it up for
   everyone (the victim decides, so no one is hit by a ball they never saw). Walkers are world entities too (pace
   2.5 tiles each way, turn at walls and water); touching one spins you out, a ball or spark knocks it flat for 6 s.
   Limits: 8 live thrown things per player, 48 per track; race tracks hold only a grid and Walkers. Engine:
   `engine/raceItems.ts` plus the race section of `engine/world.ts`. Brick Speedway gained the mock's ? blocks,
   coins and two Walkers. Computer racers pick up and use items too.
5. ~~Two players on one keyboard~~: dropped by the owner (2026-10-13). Multiplayer is rooms only, the same as the
   platformer (milestone 3).

6. **Parity with the platformer** (done): touch driving (`race/RaceTouchControls.tsx`: a steering pad, Gas, Brake
   and the item button, pressing the same actions as the keys, so a game controller's d-pad and A button work too);
   zooming the build view out to the whole track (`race/RaceZoom.tsx`; −/+/0 keys, trackpad pinch, two-finger
   pinch; the renderer shows `zoom` times more world in the same canvas, race tracks only, building only); three
   starter tracks (Snowy Oval for beginners, Brick Speedway, Canyon Twist for experts), each tested for laps, a clean
   grid and a computer driver finishing three laps; "With friends" on race starter cards.

## Not yet

Code Lab race bricks, scenery beyond trees/flowers/grandstand, choosing which starter track "New world" copies.
