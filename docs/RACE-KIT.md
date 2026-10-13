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
2. **Builder:** "New world" kit picker, the race Bricks panel, laps/items settings, Feel panel, loop status chip.
3. **Multiplayer races:** heading in poses (Worker forwards it), a shared countdown, standings and results.
4. **Items, coins and Walkers:** ? blocks, Turbo, Oil slick, Bouncy ball, Spark, Shield; hits on other players go
   through the room as events.
5. **Two players on one keyboard.**

## Not yet

Code Lab race bricks, scenery beyond trees/flowers/grandstand, more starter tracks, touch controls for driving.
