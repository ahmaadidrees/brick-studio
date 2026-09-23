# Robot kits from the drawer: evidence (kid-UX pass, lane K)

Branch `claude/robotics-kid-kits`, 2026-09-23. Spec: `docs/robotics/KID-UX.md` §K.
Harness: `scripts/qa/robotics-kid-kits.mjs`, in real Chrome through Playwright, against
`npx vite --mode robotics --port 5251 --strictPort --host 127.0.0.1`:

    PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-kid-kits.mjs

The mouse goes where the studio's own world-to-screen projection (`window.__robotics.project`, dev
only) says a stud is, the aiming a student does by eye. Nothing is placed through the store; the
page is only read. `results.json` has every check.

## Result: 38 of 38 checks pass

- **3 clicks** from the drawer's Robots choice to a placed Buggy (target: 3 or fewer): Robots, the
  Buggy card, the plate. The same at 1024×768.
- **By touch** (portrait tablet, Chrome touch emulation): 5 taps in the run (the (+) Bricks button,
  Robots, the Buggy card, a tap on the plate that moves the whole ghost there, Place); 4 when the kit
  goes where it first appears (the unit test `KitShelf.test.tsx` places it that way).
- The placed Buggy is named **Buggy**, its left motor on port A, right motor on B, sensor on C, and
  `readiness()` (`src/robotics/drive/readiness.ts`) says `{ kind: 'drive', ready: true }`. No creation
  card; one history entry (`Add Buggy`); the kit stays selected and the camera frames it.
- The second Buggy is **Buggy 2**. Held over the first Buggy its ghost stays on the ground, shows
  blocked (red) and a click there places nothing.
- **Gate**: its hinge is free to swing, on port A with the sensor on B; ready to try.
  **Signal light**: sensor on A, light on B; ready to try. **Robot base**: a robot called **My robot**,
  a hub on a plate.
- **One Undo** after the Signal light: none of its bricks, none of its cables, no Signal light robot;
  the document is exactly what it was before it was placed (the same JSON).
- Rotate on the freshly placed (still selected) Buggy turns the whole robot and it still drives.
- No page errors.

## What a student sees and does

| Step | Screenshot |
| --- | --- |
| The drawer, with a Robots choice under the search | `K0-drawer-with-robots-choice.png` |
| Robots: "Start with a kit", four cards, then the robot parts | `K1-drawer-start-with-a-kit.png` |
| The Buggy card: the whole Buggy in hand, "Placing Buggy" | `K2-buggy-armed.png` |
| The ghost follows the mouse, green where it fits | `K3-buggy-ghost-follows-the-mouse.png` |
| One click: "Buggy is ready to drive!", the panel shows Buggy | `K4-buggy-placed-ready.png` |
| Rotate turns the whole Buggy; still ready | `K4b-buggy-rotated-still-ready.png` |
| A second Buggy over the first: red, nothing placed | `K5-second-buggy-blocked-over-the-first.png` |
| Buggy 2 | `K6-buggy-2-placed.png` |
| Gate | `K7-gate-placed.png` |
| Signal light | `K8-signal-light-placed.png` |
| One Undo: the Signal light is gone | `K9-undo-removed-signal-light.png` |
| Robot base ("My robot") | `K10-robot-base-placed.png` |
| Frame: every kit on the plate | `K11-all-kits-framed.png` |
| 1024×768: drawer, ghost, placed | `N1-…`, `N2-…`, `N3-1024-buggy-placed.png` |
| Portrait tablet by touch: sheet, kit in hand, moved by a tap, placed | `T1-…` to `T4-tablet-buggy-placed.png` |

## The kit cards, looked at as a third grader would

Each picture is the kit's own bricks drawn with the studio's own part shapes, from the side that
shows what it does, plus three small picture-only touches: the sensor's eyes are drawn dark (the
part is one colour, so at card size it read as a plain yellow brick), the Gate has a curved arrow
over its red frame and its door a little open, the Signal light's light glows.

- **Buggy**: a little car with two big wheels and a face. Reads at once.
- **Gate**: a red doorway, a yellow bar a little open, an arrow the way it swings. Reads as a gate
  that opens. The first version (grey frame, no arrow) read as a dark box; the frame is now red in
  the kit itself, not only in the picture.
- **Signal light**: a white box with a face and a glowing red light on top. Reads as "it lights up".
  The first version (no glow, no eyes) did not.
- **Robot base**: a hub on a blue plate. Plain, but that is what it is; the name and "Build your own"
  carry it.

## Limits seen in the screenshots (not fixed here)

- At 1024×768 the drawer and the robotics panel leave less than 35 % of the canvas width free, so
  the studio's framing (`src/robotics/scene/framing.ts`, `MIN_FREE_SHARE`) ignores the side panels:
  the new Buggy is framed in the middle of the canvas and its right wheel sits under the panel
  (`N3-1024-buggy-placed.png`). A narrower panel (lane G) would fix it.
- In the touch sheet on a portrait tablet the grid area is short: the four kit pictures show in a
  row but their names are cut at the bottom until the grid is scrolled
  (`T1-tablet-sheet-start-with-a-kit.png`). The sheet's grip expands it.
- Device default names follow the world, not the robot: after Rotate the Buggy's motors are called
  "Back motor" and "Front motor" (`K4b-…`). That naming rule predates the kits.
