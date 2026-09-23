# Robot Workshop kid-UX, novice round 1 (2026-09-23)

Five testers role-played 8–9-year-olds against the kid-UX build (`claude/robotics-spike` at `9f24b4d`,
`vite --mode robotics` on http://127.0.0.1:5232). Each acted only through screenshots and plain page text on a
remote-controlled browser (`scripts/qa/remote-browser.mjs`) or the iPad simulator (`scripts/qa/remote-ipad.mjs`),
never through code or dev hooks, apart from one logged `measure` at the end.

| Tester | Device | Task | Reached the goal | Actions |
|---|---|---|---|---|
| Maya, 8 | Chrome 1366×768 | Kit to driving, paint it, seat, ride in Explore | Yes (driving after 6 actions) | 58 |
| Leo, 9 | Chrome 1366×768 | A car from separate parts, no kit | Yes, after being stuck for 26 actions | 90 |
| Noah, 9 | Chrome 1366×768 | A gate that opens when someone walks up, then a signal light | Yes, but the first Try failed | 120 |
| Ava, 8 | Chrome 1024×768 | Customize a car (colours, 5+ bricks, light, seat), still drives, ride it | Yes, with two majors | 77 |
| Sam, 8 | iPad Air 11" Safari, touch only | Kit to driving, then a car from parts | Yes | 143 |

## What they hit, and who fixes it

| Severity | Finding | Tester | Lane |
|---|---|---|---|
| Blocker | Riding again after "left the plate" crashed the studio (a removed Rapier body touched) | Maya | R (fixed) |
| Blocker | No room for the second motor on a small plate; nothing said why | Leo | W |
| Blocker | The gate's first "Someone walks up" stopped outside the sensor's beam; nothing said why | Noah | Y |
| Major | The car drives off an edge the child cannot see in Explore, and the child is thrown out | Maya | R (fixed: a curb, back to the start still seated) |
| Major | Loose wheels look like a finished car; "Ready to drive!" hides them | Leo | W |
| Major | Advice to "Add a hub" for a robot that has one; "Stack it on Speedy" | Leo | W |
| Major | A motor could be placed on the hub and the checklist ticked it; a green spot gave a backwards motor; Rotate renamed motors | Sam | W |
| Major | The brush palette doesn't paint; painting takes 3 clicks per brick | Maya, Noah | P (fixed: paint mode, Paint all) |
| Major | The panel showed the wrong robot after a motor test or Back | Noah | P (fixed) |
| Major | In Code, "Someone walks up" did nothing unless the program was running | Noah | Y |
| Major | The first seat landed loose; the Ride button only showed mid-jump; camera close-ups beside the car | Ava | P, W, R (follow-ups) |
| Major | A moved part floats; where you grab decides whether a drag works | Leo | M |
| Minor | Part card full of ports, code and cable words | Maya, Sam | P (fixed: simple card, More) |
| Minor | A step's part stays "in hand" after it is placed | Maya, Sam, Ava | P (fixed: placed once) |
| Minor | Wordy quick start; a brick already armed at start; slow wheel zoom; far-away drops at the view edge | Maya, Leo, Sam, Noah | M |
| Minor | The light never looks on; it switches off while someone is still there | Noah, Ava | Y, then drive extras |
| Minor | "connected to port D", "not saved", "studs", "°" | all | R, P, Y, integration |

## Test-rig findings

- The iPad remote squashed Safari's whole-web-view screenshot (1640×2360, reaching under the toolbar) into the
  820×1094 viewport, so coordinates read off it missed by up to 75 px near the top. Fixed in `3c3d982` (element
  screenshot of the root element; verified with fixed probes and a tap on the top bar's menu).
- Two tester agents stalled (their remote browsers ended with them); both were resumed and finished.
- Native `<select>` lists don't appear in Playwright screenshots; round 2's brief tells testers to read them with `text`.

## Screenshots

`maya-ride-again-crash.png`, `maya-palette-selects-not-paints.png`, `leo-no-room-second-motor.png`,
`leo-wrong-hub-advice.png`, `noah-walker-misses-sensor.png`, `sam-motor-on-hub.png` (taken with the drifting rig),
`ava-seat-not-attached.png`, `ava-ride-button-gone.png`.
