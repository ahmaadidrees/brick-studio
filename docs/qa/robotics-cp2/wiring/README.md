# Robot Workshop checkpoint 2, lane W: wiring in Build

Harness: `scripts/qa/robotics-cp2-wiring.mjs`. It ran in real Chrome (headless, Playwright) at 1366×768 against
`npx vite --mode robotics --port 5243 --strictPort --host 127.0.0.1` on 2026-09-23. **53 of 53 checks passed.**
The console had no errors. `results.json` has every check and a read-back after each step: the section's cables,
device names and wiring mode, plus what the scene drew (from `window.__robotics.cables`, which is dev only).

The rover is built with the store's placement actions, the same way `robotics-spike-cp1.mjs` builds it.
`robotics-spike-cp1-pointer.mjs` already proves pointer placement. Assisted wiring connects the left motor to A,
the right motor to B and the front sensor to C. The harness then does all the wiring with real clicks:

- It selects parts by clicking them in the canvas. It aims with `window.__robotics.project`.
- It makes every wiring change through the inspector's port chips and buttons, the hub's port list, the Wiring
  toggle or the name field.

| Step | What was done by hand | What the app showed and stored | Shots |
|---|---|---|---|
| W0 | Hub placed | The creation card carries **Wiring: assisted / manual**. Three cables drawn, none lit. Each cable arcs above both of its ends. | `W0-card-wiring-toggle`, `W1-rover-cables(-closeup)` |
| W1 | Clicked the hub, then **Port C: Front sensor** in its port list, then chip **D** | The hub lists A Left motor, B Right motor, C Front sensor, D free. Clicking a port selects its device. The sensor moved to D. Toast: *Front sensor moved to port D. Port C is free again.* | `W2-hub-inspector` |
| W2 | Clicked the left motor, then chip **C** | The inspector showed Port A with chips `A:this B:used C:free D:used`. Right now: *Stopped*. Block: `run Left motor · A`. After the click, the lit cable runs to C. Toast: *Left motor moved to port C. Port A is free again.* History label: `Move Left motor to port C`. | `W3-left-motor-port-A(-closeup)`, `W4-moved-to-C(-closeup)` |
| W3 | **Unplug** | The inspector shows *Unplugged* and *No power*. The block has a **Not plugged in** pill. The panel row says *Not plugged in*. The scene draws a loose cable with a red plug. | `W5-unplugged(-closeup)` |
| W4 | **Plug into port A** | Back on A. Toast: *Left motor connected to port A.* | none |
| W5 | Chip **B**, which is used by Right motor | The two ports swap in one edit. Toast: *Swapped ports. Left motor is on port B, Right motor is on port A.* | `W6-swapped(-closeup)` |
| W6 | Typed *Big wheel* in the name field, then Enter | `devices[left].name = "Big wheel"`. The block reads `Big wheel · B` and the panel row follows. History label: `Rename Left motor to Big wheel` | `W7-renamed` |
| W7 | Nudge **Run 40%**, then **Move to port C** | While the nudge runs, Right now reads *40 % · output at 148°*. The wiring edit ends the nudge and the studio returns to the built pose. | `W8-live-reading` |
| W8 | Toggle **manual**, then a light placed | The mode is stored and undoable. The light gets no cable. Line: *Light placed · plug it into a port in its panel*. Loose end drawn. Clicking the light shows *Unplugged*. | `W9-manual-light-unplugged(-closeup)` |
| W9 | Clicked the right motor, **Delete**, clicked the hub, **⌘Z** | The cable stays in the document but is not drawn. The hub shows *Port A · free (was Right motor)*. Undo restores the motor, and the section matches its state before the delete exactly. The cable is drawn again and lit. | `W10-deleted-port-free-was(-closeup)`, `W11-undo-cable-back(-closeup)` |
| W10 | Waited for autosave, then reloaded | Cables, names and the manual mode round-trip. Three cables and the light's loose end are drawn. | `W12-reloaded` |
| W11 | Zoomed with the mouse wheel, then clicked Big wheel | Close view of the lit cable: a ring where it leaves the motor's top, and the port C label enlarged and tinted. | `W13-zoomed-selected-cable` |

The `-closeup` images are crops of the same frame at the studio's usual zoom. They are not zoomed.

## Notes

- **Cable anchors.** The motor and the distance sensor send their cables from the top face, toward the back. In
  the rover the motors are built back to back and the sensor sits against the hub, so a back-face anchor there
  would be buried. The hinge motor uses the back of its housing, the light its back, and the button its back.
- **Toast overlap (layout, not wiring).** At 1366 px the studio toast is centred at `50% + 138px` with a maximum
  width of 420 px (`desktop-layout.css`). It covers the left edge of the robotics panel for 3.3 s, which is where
  the inspector's icon and name sit. You can see it in several shots. It is the studio's toast position, so it
  belongs to the layout lane.
