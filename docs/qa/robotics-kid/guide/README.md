# Next steps and a simpler robot panel: evidence (kid-UX pass, lane G)

Branch `claude/robotics-kid-guide`, 2026-09-23, with lanes M2, K, D and S merged in (`claude/robotics-spike`
at `75a1328`). Spec: `docs/robotics/KID-UX.md` §G. Harness: `scripts/qa/robotics-kid-guide.mjs`, in real
Chrome through Playwright, against `npx vite --mode robotics --port 5253 --strictPort --host 127.0.0.1`:

    PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-kid-guide.mjs

The mouse goes where the studio's own world-to-screen projection (`window.__robotics.project`, dev only)
says a stud or a socket is, the aiming a student does by eye. After the plate and the hub that start the
robot (from the drawer: before them there is no robot and so no next steps), every part comes from a click
on the step the robot panel highlights. `results.json` has every check and the journey.

## Result: 116 of 116 checks pass

- **A rover from separate parts using only the next steps** (1366×768): plate and hub from the drawer,
  "Keep building" on the card, then six next-steps rows (Make it move → Put a motor on the other side →
  Put an axle in Right motor → Put an axle in Left motor → Put a wheel on Right motor's axle → Put a wheel
  on Left motor's axle), each followed by one click where the part goes. After every placement the
  highlighted step is the next one; the last placement leaves **"Ready to drive!"** highlighted and the big
  **Drive** button on (green); Drive opens the Drive view for the robot.
- Each row arms its part **already turned the way this robot needs it**: the second motor comes facing the
  other way from the first; axles and wheels line up with their motor.
- Unplugging a motor in its inspector turns Drive off and highlights **"Plug Left motor into the hub."**;
  one tap on it plugs it back in and the robot is ready again.
- Every state, at 1366×768 and 1024×768 (the card, a hub alone, not ready, ready, a gate not ready, stuck
  and ready, a signal light not ready and ready): **no developer words** ("creation", "nudge",
  "reversed", "assisted"…) and **no port letters** in the panel (outside the wiring inspector), **every
  target at least 44 × 44 px**, **all text 14 px or larger**.
- The ideas tick off as a student makes the robot theirs (a sensor at the front, a light, a seat, a brick
  on top) and it still drives.
- No page errors.

## The journey

| # | The student clicks | It armed | Clicked where it goes | The panel then highlights |
| --- | --- | --- | --- | --- |
| 0 | Drawer: 6 × 8 Plate, then Hub | | the baseplate, the plate | the card "You started a robot!" (named Buggy, Keep building) |
| 1 | **Make it move** (a hub alone offers it and "Make it see and light up") | Motor, facing right | the plate's right side | Put a motor on the other side. |
| 2 | **Put a motor on the other side.** | Motor, facing left | the plate's left side (from the Top view: from the home angle that spot is behind the first motor) | Put an axle in Right motor. |
| 3 | **Put an axle in Right motor.** | Short axle | the right motor (it snaps into the socket) | Put an axle in Left motor. |
| 4 | **Put an axle in Left motor.** | Short axle | the left motor | Put a wheel on Right motor's axle. |
| 5 | **Put a wheel on Right motor's axle.** | Wheel | the right axle (it snaps onto the end) | Put a wheel on Left motor's axle. |
| 6 | **Put a wheel on Left motor's axle.** | Wheel | the left axle | **Ready to drive!** (Drive on) |

Plugging in happened by itself (assisted wiring), so "Plug the motors into the hub." was already checked.

## What a student sees

| State | 1366×768 | 1024×768 |
| --- | --- | --- |
| The card: "You started a robot!", a name, Keep building, a small "?" | `1366-01-card.png` | `1024-01-card.png` |
| The "?" open | `1366-02-card-why.png` | `1024-02-card-why.png` |
| A hub alone: two ways to go | `1366-03-hub-only-choices.png` | `1024-03-hub-only-choices.png` |
| One motor: Drive off (dashed), the next step highlighted | `1366-04-one-motor.png` | `1024-04-one-motor.png` |
| Two motors: an axle next | `1366-05-two-motors-axle-next.png` | `1024-05-not-ready.png` |
| One axle in | `1366-06-one-axle.png` | |
| Axles in: a wheel next | `1366-07-axles-wheel-next.png` | |
| One wheel on | `1366-08-one-wheel.png` | |
| Ready: green Drive, "Ready to drive!", "Make it yours" | `1366-09-ready-to-drive.png` | `1024-09-ready-to-drive.png` |
| More open: runs on, wiring, test the motors | `1366-10-more-open.png` | `1024-10-more-open.png` |
| Parts open: the rows, "Left side: … · Right side: …" | `1366-11-parts-open.png` | |
| A motor picked: the one step that matters, then its inspector | `1366-12-part-picked.png` | |
| A motor unplugged: "Plug Left motor into the hub." | `1366-13-plug-step.png` | |
| Made it mine: sensor, light, seat, a brick on top, all ticked | `1366-14-made-it-mine.png` | `1024-14-made-it-mine.png` |
| A gate's card ("Gate") | | `1024-15-gate-card.png` |
| A gate without a sensor: Try it off | `1366-16-gate-not-ready.png` | `1024-16-gate-not-ready.png` |
| A gate stuck to its frame: the fix row picks the brick | `1366-17-gate-stuck.png` | `1024-17-gate-stuck.png` |
| A gate ready to try | `1366-18-gate-ready.png` | `1024-18-gate-ready.png` |
| A signal light without its light | `1366-19-signal-not-ready.png` | `1024-19-signal-not-ready.png` |
| A signal light ready to try | `1366-20-signal-ready.png` | `1024-20-signal-ready.png` |

## Looked at as a third grader would

Short words, one obvious next thing, nothing developer-facing in view. What changed after looking:

- The first ready panel kept all six checked steps, a "Built and plugged in" line and the four ideas:
  More fell below the fold. Once a robot is ready the checked steps give way to "Ready to drive!" and the
  ideas ("Make it yours").
- At 1024×768 a 360 px panel left the robot under it (the studio's framing gives up on side panels when
  less than 35 % of the width is free). The card and the panel are 300 px wide up to 1180 px, and the
  robot now frames between the drawer and the panel.
- "NEXT STEPS" and the hub's port chips were 13 px and 12 px: now 14 px. The wiring inspector's small
  labels are raised to 14 px inside the panel (15 px on touch).
- A hub alone said "Next step" over a checked row: it says "Next steps" unless one open row is shown.
- On a portrait tablet the studio's toast ("Buggy is ready to drive!") sat over the Drive button: with the
  robot panel open it now sits on the left.
- The copy: "robot" in guidance, the student's name for it, "faces the other way" (never "reversed"),
  "Test the motors" (never "Nudge"), "Stopped" (never "Built pose"), no port letters outside the
  inspector; sentences of about eight words, a verb first.

## Limits seen (not changed here)

- The assisted-wiring line over the canvas says "Left motor connected to port B": a port letter outside
  the inspector. It is the store's text (`roboticsStore.handlePlacement`, shared with lane S) and several
  harnesses match it exactly.
- The wiring inspector (a picked device) is still dense for a third grader ("The cable and port B are lit
  on the hub. The name follows the device, not the port.", "IN CODE run Left motor · B at 40 %"). It is
  the wiring lane's component; the panel only sizes its text.
- A robot started on the bare ground (a hub with no plate) is told "Put a plate down. Then move the hub
  onto it.": moving a placed brick is a drag or the command strip's Move, harder than placing one. Kits
  (Robot base) and a plate first avoid it.
- From the home camera the far side of the plate is behind the first motor; the journey aims the second
  motor from the Top view, as a student would have to (lane S's snapping to plate edges helps).

## Harnesses updated for this panel (run against this server)

Every harness below was run against this branch's dev server (`UI_ORIGIN=http://127.0.0.1:5253`) after
all four other lanes were merged in; their `results.json` files are copied to `harnesses/`.

| Harness | Result | What changed in it (meaning kept) |
| --- | --- | --- |
| `robotics-kid-guide.mjs` (new) | 116 / 116 | This page. |
| `robotics-spike-cp1.mjs` | 49 / 49 | The card is checked for "You started a robot!" and its default names ("Robot", "Gate"); it is closed with **Keep building**; Code is opened with the panel's Code button (the card has none); the default name is "Robot"; the name field is "Robot name"; the motor tests are reached by opening **More**; the tests' status reads "Stopped" (was "Built pose"); the drive line is read in **Parts** and says "Right motor faces the other way". |
| `robotics-spike-cp1-pointer.mjs` | 78 / 78 | The same card and More changes. The right motor is aimed at (33.3, 1, 32.4) instead of (32.5, 1, 32.5): with lane S merged, a motor at the plate's corner keeps the edge it already faces and turned to the back edge. |
| `robotics-cp2-wiring.mjs` | 53 / 53 | Keep building; the "Wiring: assisted / manual" check reads the panel's More (the short card has no toggle; `W0.more-has-wiring-toggle`, shot `W0-more-wiring-toggle`); Parts is opened for the part rows; "Stopped". |
| `robotics-cp2-run.mjs` | 18 / 18 | Unchanged (it names robots through the store). |
| `robotics-cp2-code.mjs` | 51 / 51 | "Robot name" and Keep building on the card; the signal light is named on the card and opened in Code with the panel's Code button (was the card's "Code this creation"). Lane M2's chip wording is kept. |
| `robotics-cp2-failures.mjs` | 70 / 70 | Keep building; the part rows and lines are read after opening Parts; where it read the model's ready line it reads the panel's highlighted next step ("Put a wheel on Left motor's axle.", "The arm is stuck to the frame. Take off the brick that joins them.", "Ready to try!", "Ready to drive!"); the drive line is "Left side: Left motor · Right side: Right motor" plus "Right motor faces the other way"; the hinge row says "arm stuck to the frame". Lane M2's chip wording is kept. |
| `robotics-cp4-explore.mjs` | 24 / 24 | Unchanged. |
| `robotics-kid-kits.mjs` | 38 / 38 | Unchanged. |
| `robotics-kid-drive.mjs` | 71 / 71 | Unchanged. |
| `robotics-kid-snap.mjs` | 96 / 96 | Unchanged (the panel's "Hide" it presses at 1024×768 is kept). |

Not run here (they need the iPadOS simulator); the selectors this panel changes in them:

- `robotics-cp3-touch.mjs`: the card's name field is `input[aria-label="Robot name"]` (was "Creation name"; also
  the focus check `focused === 'Creation name'`); the card's button is **Keep building** (was "Not now"); "Drive
  forward 40%" and `robotics-reset` are inside the panel's **More**, folded by default (tap the "More" toggle
  first); `robotics-sim-status` reads "Stopped" (was "Built pose"); the fonts probe's `.robotics-chip` and
  `.robotics-nudge-row .studio-button` exist only while More is open.
- `robotics-cp3-ipad-code.mjs`: the card's name field `input[aria-label="Robot name"]` and **Keep building**;
  `[data-testid="robotics-panel"] .robotics-lines li` (the long-press target) is inside the folded **Parts**
  (open it, or press a row of `[data-testid="robotics-next-steps"]` instead); `robotics-code-button` is
  unchanged; the panel's first input is the "Robot name" field.
