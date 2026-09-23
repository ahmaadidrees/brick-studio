# Make it yours: painting, the part card, the panel about the robot you touch (kid-UX pass, lane P)

Branch `claude/robotics-kid-paint` from `9f24b4d`, 2026-09-23. What testers hit (Maya 8, Noah 9, Ava, and Sam 8
on an iPad) is the spec; `docs/robotics/KID-UX.md` is the copy guide. Harness: `scripts/qa/robotics-kid-paint.mjs`,
in real Chrome through Playwright, against `npx vite --mode robotics --port 5244 --strictPort --host 127.0.0.1`:

    PATH=/opt/homebrew/opt/node@22/bin:$PATH UI_ORIGIN=http://127.0.0.1:5244 node scripts/qa/robotics-kid-paint.mjs

Every action is a real mouse click, key press or touch tap on what the page shows. Where the pointer goes on
a brick is the studio's own world-to-screen answer (`window.__robotics.project`, dev only), aimed at a stud on
the brick's top that nothing stands on: the aiming a student does by eye. After each step the harness reads
back the document (brick colours, the history) and what the page shows. `results.json` has every check.

## Follow-up after novice round 1 (Ava, 8, at 1024×768)

Four fixes, one commit each, on the same branch after it was merged into `claude/robotics-kid-int`:

| # | What Ava hit | Fix | Commit |
| --- | --- | --- | --- |
| 1 | **Major.** The seat idea's ghost sat low at the front by the sensor; Place dropped it on the ground; nothing ticked, nothing said. | An idea's light, seat and stacked bricks now come **already on the robot's highest free spot where they join it** (nearest the middle; `guide/onRobot.ts` asks the model with the part added). A seat or light from an idea that lands on no robot is **taken off the plate again** (no history left), set back on top, and a line says *The seat goes on Buggy. It is back on top: press Place.* With no room, it is put down and the line says so. Lane W's generic "not on the robot" line and fix are not duplicated. | `3be8422` |
| 2 | **Minor.** A kit stayed picked after it was placed: the strip's Color said *Color all 9 bricks* and painted the tyres; a click on a wheel did nothing until she clicked the floor. | **Nothing stays picked** after a kit lands. The next click picks just the part. Why this rather than "the next click picks one part": that alone would still leave Color painting all nine. The panel still shows the new robot (the newest robot touched), one Undo removes the kit, the Paint row's *Paint all* paints it without its tyres, and a box drawn around the kit picks all of it for Rotate. | `76f67f3` |
| 3 | **Minor.** "Stack bricks on top" ticked after the first brick. | It asks for five and counts: *Stack 5 bricks on top · 2 of 5*. After the first four ideas, *Build it taller · 6 of 10*. | `23082b7` |
| 4 | **Minor.** At 1024×768 the car was drawn about 130 px wide in the 364 px gap between the drawer and the panel. | A placed kit, and the robot on the way back from Drive / Try it / Code, is **framed snug**: same viewing side, the camera closer until its own bricks fill 70 % of the free area (`snugFrameDistance`). Real Chrome, a placed Buggy: **1024×768 206 px of 364** (was 130); 1366×768 353 of 646 (was 229); iPad landscape 292 of 524; iPad portrait 237 of 416; all inside the free area. | `d57b8ea` |

New checks in `robotics-kid-paint.mjs`: **K** (nothing picked after a kit; the first click on a wheel picks the
wheel; Color is for one brick), **S** (the seat's ghost on the robot's top; Place puts it on and the idea ticks;
placed on bare ground it goes back on top with the line; Place then puts it on), **A6.counts** (*2 of 5*),
**C.framed-big** (1024), **D.nothing-picked** (touch). Shots: `1366-00-kit-placed-wheel-picked.png`,
`1366-09b-stack-idea-2-of-5.png`, `1366-16-seat-ghost-on-top.png`, `1366-17-seat-on-the-robot.png`,
`1366-18-seat-back-on-top.png`, and the 1024 and iPad shots of the bigger framing.

## Result: 60 of 60 checks pass (50 before the follow-up)

- **Paint the way kids expect** (1366×768). A Buggy kit, then the Paint row: **one click on red** starts
  painting (the bar at the bottom says *Painting · Red · Tap bricks to paint them · Done*; the command strip
  steps aside), **one click per brick** paints it (one Undo each, nothing gets selected), **Done** stops:
  4 clicks for two bricks. **Paint all of Buggy** paints its plate, hub and motors in one Undo (wheels, axles
  and the sensor keep their colours); **one Undo** puts every brick back. A picked brick and a **drawer
  swatch** paint it (one Undo; it stays picked).
- **The part card, simple first.** A motor says *Turns the left wheel · plugged in ✓* with a picture, its
  name (text with a pencil) and big **Turn** and **Remove**; no port letters, no code line, no Unplug or
  Move to port until its own **More**, which has them all.
- **Placed once.** "Add a light on top." arms a light; placed, nothing is left armed (the strip says *Pick a
  brick from the drawer*) and the light flashes.
- **The drawer remembers Robots** across a reload.
- **The panel follows the robot you touch.** A Gate and a Signal light: a motor test on the Gate (*Swing
  open*), then a click on the Signal light's hub: the title, the steps, the hub's card and **Code** are the
  Signal light's, and the Gate's test stops. With nothing picked, the robot touched last (the Gate) stays,
  not the newest. **Back from Try it** the panel is the Gate's and the Gate is framed clear of the drawer,
  the panel and the strip (11 of 11 bricks inside the free area); **back from Drive** the same for a Buggy.
- **The Color popover is never hidden behind the panel**: at 1366×768, 1024×768, iPad portrait 820×1094 and
  iPad landscape 1180×820 their boxes do not overlap and the popover is fully on screen.
- **iPad portrait by touch** (Sam's layout): the Buggy is framed beside the panel; nothing is picked after the
  kit lands; orange, then a tap on the hub paints it; every control on the part's card is at least 44 px (Turn
  and Remove 130 × 52); the name stays read-only after a tap on it.
- No console errors, no page errors.

## Painting two bricks

| # | The student | What happens |
| --- | --- | --- |
| 1 | clicks **red** in the Paint row | painting starts: the bar says *Painting · Red*, the Paint row says *Tap bricks to paint them red.* and offers **Paint all of Buggy** |
| 2 | clicks the hub | the hub is red (one Undo, *Paint brick red*) |
| 3 | clicks the left motor | it is red (one Undo) |
| 4 | clicks **Done** (or presses Esc) | painting stops; the command strip is back |

## What a student sees

| State | 1366×768 | 1024×768 / iPad |
| --- | --- | --- |
| A kit just placed, then a click on a wheel: just the wheel, Color for one brick | `1366-00-kit-placed-wheel-picked.png` | |
| A Buggy and its Paint row | `1366-01-buggy-paint-row.png` | `1024-01-buggy-paint-row.png` |
| Painting: the bar and the Paint row | `1366-02-painting-red.png` | `1024-02-painting.png`, `ipad-820-02-painting-by-touch.png` |
| Two bricks painted | `1366-03-two-bricks-painted.png` | |
| Paint all of Buggy (green) | `1366-04-paint-all-green.png` | |
| One Undo | `1366-05-undo-paint-all.png` | |
| A picked brick and a drawer swatch | `1366-06-picked-and-drawer-swatch.png` | |
| A motor's card, simple first | `1366-07-motor-card.png` | `1024-03-motor-card.png`, `ipad-820-03-motor-card-by-touch.png` |
| Its More | `1366-08-motor-more.png` | `1024-04-motor-more.png` |
| An idea placed once, flashing | `1366-09-idea-placed-once.png` | |
| The stack idea counting: 2 of 5 | `1366-09b-stack-idea-2-of-5.png` | |
| The seat idea: its ghost on the robot's top; placed on; back on top after a click on bare ground | `1366-16-seat-ghost-on-top.png`, `1366-17-seat-on-the-robot.png`, `1366-18-seat-back-on-top.png` | |
| The Gate's motor test | `1366-10-gate-motor-test.png` | |
| Then the Signal light's hub picked | `1366-11-signal-light-hub-picked.png` | |
| Try it on the Gate, back to build (framed) | `1366-12-gate-try-it.png`, `1366-13-back-from-try-it-framed.png` | |
| Back from Drive (framed) | `1366-14-back-from-drive-framed.png` | |
| The Color popover beside the panel | `1366-15-color-popover.png` | `1024-05-color-popover.png`, `ipad-820-color-popover.png`, `ipad-1180-color-popover.png` |
| The Buggy by touch, beside the panel | | `ipad-820-01-buggy-by-touch.png`, `ipad-1180-01-buggy-by-touch.png` |

## What changed, and why

1. **Paint.** A Paint row in the robot panel (twelve 44 px chips, in the studio's colours with kid names).
   A chip starts paint mode; the colour is the studio's brush (`activeColor`), so the drawer's swatches
   change it too and the next part armed comes in it. While painting, a tap on a brick is taken from the
   studio before it would select it (`src/robotics/scene/brickTap.ts`, asked by the scene's click, touch-tap
   and box paths; nothing registered, nothing taken, so the studio without the flag is unchanged), a held
   finger paints instead of grabbing, and a box paints every brick in it. Arming a part, selecting, leaving
   Build, opening Drive, Try it or Code, **Done** or **Esc** stops it. Each tap is one Undo that selects
   nothing, so Undo never picks a brick while painting.
   **"Paint all of \<name\>" (a better idea than plain bricks only):** it paints the robot's plain bricks and
   plates **and its hub, motors, hinge motor and seat**, and keeps the parts whose colour says what they do
   (black tyres, gray axles, the sensor's yellow eyes, the light, the button). A Buggy kit's only plain
   brick is the plate under it, so "plain bricks only" would have repainted nothing a student notices;
   Maya and Ava painted the hub and the motors one by one to get a red car. The same rule applies when a
   Paint chip or a drawer swatch finds several bricks picked (a whole kit is picked right after it is
   placed): one brick picked is painted as it is.
2. **The part card.** A picture of the part in its own colour, its name (text until its pencil is tapped,
   or a mouse click on it: a low tap on an iPad never opens the keyboard), one line in a third grader's
   words (*Turns the right wheel · plugged in ✓*, *The robot's eyes: it sees what is in front*, *Swings the
   gate open*, *Lights up in a color*, *Not on a robot yet*), **Plug it in** when it is not, big **Turn**
   and **Remove** (Sam's ask; the command strip keeps Rotate, Color and Delete too). Everything else is
   behind the part's own **More**, unchanged: the plugged-in state and port chips, the stale-port note,
   *Right now*, the wiring hint ("The name follows the device, not the port"), the code line and Unplug /
   Move to port / Plug into port. The hub is *The robot's brain* and names what is plugged in (*Plugged in:
   Left motor, Right motor and Front sensor*); its ports list moved to More and the "Cables route
   themselves…" hint is gone. Each part starts with More shut.
3. **The panel follows the robot you touch** (`src/robotics/ui/robotFocus.ts`). The robot of the selected
   brick wins, even while another robot's motor test runs (that test stops: its bodies would otherwise stay
   swung while the panel is about another robot); placing a part on a robot, a new robot (a kit, a card),
   starting a test and opening Drive, Try it or Code focus it too; with nothing selected the robot focused
   last stays. Cause confirmed: the old `useFocusedCreation` let a running test win over the selection and
   fell back to the newest robot.
4. **Placed once** (`src/robotics/guide/oneShot.ts`). Every part armed from a next step, a choice or an idea
   (hubs, motors, axles, wheels, sensors, lights, seats) is put down once it lands and flashes twice (a
   glow drawn over it, `scene/PlacedFlash.tsx`). Rows that ask for several (*Stack bricks on top*, *Build it
   taller*) keep the brush, like the drawer. `guide/actions.ts` gains two lines for it.
5. **The Color popover** slides left until it clears any panel marked `data-popover-avoid` (the robot panel
   and card mark themselves); only where it cannot (a panel across the screen) the strip rises over the
   panel. Nothing is marked without the flag, so the studio's popover never moves there.
6. **Back to build frames the robot** in the part of the canvas the drawer, the panel and the strip leave
   free (the scene measures the panels a frame after they are back). Since follow-up 4 it is framed snug,
   as a placed kit is: its own bricks fill 70 % of that area.
7. **More ideas.** Once a rover's first four are done they give way to *You did all 4 ideas!* and **More
   ideas**: *Paint it your colors.* (starts painting), *Give it a name of your own.* (the cursor in the name
   field), *Build it taller · 6 of 10* (counted, follow-up 3), *Make it stop at a wall. Try it in Code.* (opens Code on
   the Stop before the wall starter, made once). A gate and a signal light, which had no ideas, get paint,
   name and their own Code idea (*Change how far it opens*, *Pick the light's color*). These stay tappable
   once done (a tick in front), so the list never ends empty-handed. Only ideas that work today: no
   "4 wheels" (a Buggy's plate has no room for two more motors) and no blinking light (there is no such
   starter yet).
8. **The drawer remembers its category** for this viewer (localStorage, in try/catch; My bricks is not
   remembered, another world may have none). Flag on only.
9. **Kid words in More**: *Where it runs: Test plate / My world*; *Plug in by itself: On / Off* (was
   "Wiring assisted / manual", also in the Code view's header, with its toast and Undo label); the motor
   tests say *Drive forward / Drive back*, *Spin / Spin back*, *Swing open / Swing the other way / Shut*
   (same powers and angles as before, no % or °); a swinging arm's row says *open* or *shut*, not degrees.
   A part picked scrolls the panel to its top; done painting, the panel goes back to its top.

## The other harnesses (run against this branch after the follow-up; outputs kept out of their evidence folders)

| Harness | Result | Changed for this lane (intended) |
| --- | --- | --- |
| `robotics-kid-guide.mjs` | 116/116 | More's toggle is *Plug in by itself*, *Drive forward*; Unplug is behind the part's More; the four ideas done give way to *You did all 4 ideas!* and more ideas (it stacks five bricks, follow-up 3); the panel's folds found by test id |
| `robotics-kid-kits.mjs` | 39/39 | follow-up 2: nothing is picked after a kit lands (A.focused), a new A.box-picks-kit draws a box around it before Rotate; follow-up 4: A.framed expects a snug frame |
| `robotics-cp2-wiring.mjs` | 55/55 | opens the part's More before reading ports, the cable and the code line; *Plug in by itself: On / Off* and its toast and label; *Spin*; two new checks for the simple-first hub and motor cards |
| `robotics-kid-drive.mjs` | 71/71 | none |
| `robotics-spike-cp1.mjs` | 49/49 | *Drive forward*, *Spin*, *Swing open*, *Shut*; the arm's row says *open* |
| `robotics-spike-cp1-pointer.mjs` | 78/78 | *Drive forward*, *Spin*, *Swing open* |
| `robotics-cp2-failures.mjs` | 70/70 | opens the part's More before reading it; renames from the pencil |
| `robotics-cp2-code.mjs` | 51/51 | opens the part's More before Unplug, the hub's ports and a port chip |

## Unit tests

Follow-up: `src/robotics/guide/onRobot.test.ts` (the seat's spot on a Buggy's hub, on a tower's top, a light,
membership); `oneShot.test.tsx` (the seat armed on top; placed on bare ground it comes back; Place puts it on
and the idea ticks); `kitPlacement.test.ts` (nothing picked after placing; picked again, Rotate turns it whole;
a snug frame request); `nextSteps.test.ts` (the counted texts); `framing.test.ts` (`brickBox`, `snugFrameDistance`
at 1024 × 768 beside a drawer and a panel); `robotFocus.test.tsx` (back to build asks for a snug frame).

`src/robotics/paint/paint.test.tsx` (what "Paint all" paints, looks-painted, colour names; a chip starts
painting, taps paint one Undo each with nothing selected, Paint all in one Undo, a picked brick painted by a
chip, Done / Esc / arming / selecting / Code stop it, painting a brick focuses its robot),
`src/robotics/paint/studioPaint.test.tsx` (flag on: a drawer swatch paints the picked brick, several picked
keep the wheel's colour, the category is remembered and blocked storage starts at All, the popover slides
clear of a marked panel and says when it cannot), `src/robotics/ui/robotFocus.test.tsx` (the pure pick; a
motor test on the Gate, then the Signal light's hub; nothing selected keeps the last robot; back from
Drive / Code focuses and frames; Drive from Code frames nothing on the way), `src/robotics/guide/oneShot.test.tsx`
(placed once and flashing, repeat rows, choosing another part; idea rows; More ideas; done ideas stay
tappable), plus updated `nextSteps.test.ts` (more ideas, gate and signal ideas, done states),
`DeviceInspector.test.tsx` (simple first, More, Plug it in, what each part does, the pencil, Turn and
Remove, the hub's card), `RoboticsPanel.test.tsx` and `wiring/actions.test.ts` (kid words).

## Not done here (for the lead)

- The wiring line after a device is placed still says *Light connected to port D* (port letters in a kid
  line; `state/roboticsStore.ts`, checked word for word by the wiring harness). Suggest *Light plugged in ✓*.
- A picked wheel, axle or seat (lane W's `SelectedPart` lines) has no Turn / Remove in the panel; the
  command strip's Rotate and Delete work for them.
- At 1024×768 the command strip wraps to two rows and its top meets the panel's bottom (as before this lane).
- `src/robotics/kits/KitShelf.test.tsx` waits the default 1 s for its lazy Robots chunk in its first test.
  Under load it can time out: three times in about fifteen runs here (twice in `vitest run src/robotics`
  while harnesses ran, once in a full run). This lane does not slow it (alone it takes 1.20 s at `9f24b4d`
  and 1.22 s here; six alternating full runs, three at each, all green), but four more test files add load.
  A `{ timeout: 10_000 }` on that `findByRole` would settle it; left alone here, as it is lane K's file.
