# Race kit: test before it goes to students

About 20 minutes with two people (or two computers). Local setup: the app at http://localhost:5340/2d and the local
room server on port 8787 (the "racing-kit" and "racing-worker" dev servers). Tick each line; note anything odd next to
it.

## Alone (one computer)

- [ ] Home shows three race starter cards: Snowy Oval, Brick Speedway, Canyon Twist. Each has Race and With friends.
- [ ] Race each starter track once with 3 computer racers. Lights count down, laps count, results card appears.
- [ ] Drive through a ? block: the item shows top left. Space uses it. Try to get each of the five:
  - [ ] Turbo (burst of speed) · [ ] Shield (bubble round the car) · [ ] Oil slick (drops behind)
  - [ ] Bouncy ball (fires ahead, bounces off walls) · [ ] Spark (fires ahead, bursts on a wall)
- [ ] Drive into a Walker: you spin and lose coins. Hit a Walker with a ball: it goes flat for a few seconds.
- [ ] Coins: the counter goes up; the coin comes back a few seconds later.
- [ ] Fall in the water on Brick Speedway or Canyon Twist: you come back before the jump.
- [ ] The Feel panel (the ` key) changes how the car drives; Kart / Drifty / On rails presets.

## Building

- [ ] New world, Race track (starter and empty).
- [ ] Paint road, dirt, ice, water, barrier; boost pad turned with R; ramp; finish line turned with R.
- [ ] The "Laps work" chip goes red when the finish line is missing or the road doesn't loop, and says why.
- [ ] ? block, Coin, Walker (R turns it across or along). Walkers can't go on walls or water.
- [ ] Items on/off: with items off, ? blocks look faded and give nothing.
- [ ] Zoom: −/+ buttons, Whole track, the − = 0 keys, trackpad pinch. Painting still lands where you click when zoomed.
- [ ] Undo and redo; leave and reopen the draft; it comes back the same.

## Together (two computers or two browsers)

- [ ] Person A: Build together (or With friends on a starter card). Person B opens the link.
- [ ] Both see each other's cursors while building, and each other's edits.
- [ ] Practice: both drive around; you see each other's cars with name tags.
- [ ] Start race: both line up on different grid spots in different colours; lights start together.
- [ ] Standings agree on both screens. Finish: results list both names.
- [ ] Items between players: A throws a ball or drops oil, B runs into it and spins; it disappears for both.
- [ ] Shield: A with a shield bumps B; B spins.
- [ ] B (not the host) presses Start race mid-race: refused with a friendly message. The host can restart.
- [ ] Person C joins mid-race: they slot into the running race.

## Tablet (if students use one)

- [ ] Steering pad (left), Gas and Brake (right), item button above them. Two thumbs at once work.
- [ ] Building: pinch zooms, two fingers pan, one finger paints.

## Before shipping

- [ ] Deploy the room server first (it must understand race tracks), then the website.
- [ ] After deploy: a platformer room still works as before (no change expected).
