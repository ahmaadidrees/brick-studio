# Robot Workshop cp2, lane M: the stage in real Chrome

Harness: `scripts/qa/robotics-cp2-run.mjs`. It ran against the lane's dev server
(`npx vite --mode robotics --port 5242 --strictPort --host 127.0.0.1`) in headless system Chrome
through Playwright at 1366×768. Result: 18 of 18 checks pass (`results.json`), with no console errors.

The creations are built from loose parts through the studio's own placement actions, the same way
`robotics-spike-cp1.mjs` builds them, so assisted wiring and the creation card run for real. The
stage is driven through `window.__robotics.stageStore`, the seam the Code view will call:
`openStage`, then `runOnStage` with a plain-object runtime that implements `tick`, then
`triggerVisitor`, `resetStage` and `closeStage`. The scene advances the run controller from its own
frame loop with real frame time.

| Shot | What it shows |
|---|---|
| `A1-world-before-stage.png` | The rover among five loose "my world" bricks, before the stage opens. |
| `A2-stage-open-world-hidden-wall-beam.png` | The stage on the test plate. All 14 studio bricks are hidden. The rover is drawn at its simulated pose, with a brick wall 12 studs ahead. The front sensor's beam is coral because it already sees the wall at 12 studs. |
| `A3-rover-driving.png` | 1.5 s after Run: 3.33 studs/s, with the sensor reading about 8 studs. |
| `A4-rover-stopped-before-wall.png` | Stopped. The program braked at 2.99 studs, and the rover rests 2.47 studs short of the wall. |
| `A5-rover-reset.png` | After Reset, the rover is back at its built pose and the program is stopped. |
| `B1-gate-my-world-waiting.png` | The gate in My world. The studio hides only the gate's 11 bricks, and the 4 scenery bricks stay in the studio. The visitor waits at the side. The idle beam is yellow and reads 40 studs, which means nothing is seen. |
| `B2-gate-visitor-door-open.png` | The visitor has walked up to 3 studs in front of the sensor. The beam turns coral, and the door has swung to 90° about the hinge. |
| `B3-gate-visitor-door-open-orbit.png` | The same moment after a real right-button orbit, so you can see the visitor, the beam and the open door together. |
| `C1-signal-post-red.png` | The signal post in My world. The visitor arrives and the light turns red. |

Measured in this run:

- **Rover:** the sensor readings every 0.25 s were 12 → 11.67 → … → 3.58 → 2.78 → 2.49 → 2.47. It braked at 2.99 studs and rests 2.47 studs short of the wall, with speed 0 and no contact.
- **Program time vs wall time:** program time since Run matched wall time (4.03 s against 4.03 s), and no stall time was dropped.
- **Gate:** the arm reached 90°. The door's rotation quaternion had x = z = 0.0000, so it turned about the vertical hinge axis only. Reset brought it back to 0°.
- **Document:** it was byte-identical (compared with sorted keys) after every open, run, reset and close.

## Not covered here

- The five failures are covered by the Node tests in `src/robotics/run/controller.test.ts`, not in Chrome.
- There is no Code view yet, so the Code view's controls (blocks, Run/Stop buttons, readings panel) are not exercised. Lane U owns them.
- The build panel's Nudge section is still on screen. The stage does not replace it.
- Keyboard and joystick input on the stage are not driven here. They are covered by the sampler and controller unit tests.
