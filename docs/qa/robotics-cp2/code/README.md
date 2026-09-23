# Robot Workshop cp2, lane U: the Code view in real Chrome

Harness: `scripts/qa/robotics-cp2-code.mjs`, run against the lane's dev server
(`npx vite --mode robotics --port 5244 --strictPort --host 127.0.0.1`) in headless system Chrome
through Playwright. Result: 51 of 51 checks pass (`results.json`). There were no console errors, and
nothing was fetched from Blockly's media folder.

The rover, the gate and the signal post are built from loose parts with the studio's own placement
actions, the same way `robotics-spike-cp1.mjs` builds them. After that, every step is something a
student does:

- Clicks: the card's name field and its buttons, the panel's **Code** button, the tabs, the **+**
  menu, **Run**, **Stop**, **Reset**, **Test plate** / **My world**, **Someone walks up** and
  **Back to build**.
- Typing into a number field on a block.
- Dragging a block out of the palette.
- **Delete** and **⌘Z** inside the workspace.
- Dragging the on-screen joystick with the mouse.
- The arrow keys.

Parts in the canvas are clicked where the studio's projection puts them (`window.__robotics.project`).
Blocks are clicked where Blockly draws them (`window.__robotics.codeWorkspace`). Both hooks exist only
in the dev build.

## Part 1: screenshot set at 1366×768 and 1024×768

| Shot | What it shows |
|---|---|
| `A1-first-run-{1366,1024}` | The rover opens on its first program, **Stop before the wall**, in the first-run state. There is one script and the palette is collapsed, but the category rail stays visible. The test plate is framed into the stage area, and the goal line is shown. |
| `A2-starters-menu-{1366,1024}` | The **+** menu lists the starters that fit a rover (Stop before the wall, Joystick drive and Blank), each with its goal. |
| `A3-second-program-{1366,1024}` | **Joystick drive** is open as a second tab. The on-screen joystick is shown because this program reads it. |
| `A4-diagnostics-{1366,1024}` | In Build, the left motor was unplugged and the sensor deleted. **Can't run** shows "Front sensor is missing": the dropdown keeps the missing part and the block has a red dashed outline. **Heads up** shows "Left motor is not plugged in", with an amber outline on the drive block. Run is blocked with "Can't run yet: Front sensor is missing". |

## Part 2: journeys at 1366×768

| Shot | Step |
|---|---|
| `C1-rover-first-run` | Code created **Stop before the wall** at revision 0. |
| `C2-rover-running` | While it runs, the block being executed glows. The chips show the sensor distance, the drive pair (power and speed as the creation feels them) and the speed. |
| `C3-rover-stopped-before-wall` | It braked at 3 studs and rests **2.48 studs** from the wall. The sensor never read under 2.48, so it never touched the wall. The chips show the same values the blocks read. |
| `C4-rover-reset` | After Reset, every body is within 0.006 of its built pose, the sensor reads 12 studs and the status is Ready. |
| `C5-changed-while-running` | The 3 was clicked and 6 typed while the rover ran. The edit saved as revision 1 and the stage says **Changed · press Run to use it**. The run kept its revision and still stopped at 2.47. |
| `C6-stops-earlier` | After Reset and Run, it rests **5.47 studs** from the wall. |
| `C7-build-left-motor-port-C` | Back in Build, the construction and cables are exactly as built and the stage is closed. The left motor was selected by a click in the canvas, and the inspector's **C** chip moved it to port C (swapping it with the sensor, which went to A). |
| `C8-code-block-shows-C` | The dragged-in block reads **Left motor · C** and the sensor block reads **Front sensor · A**. Run still stops before the wall. |
| `C9-joystick-drive` | A mouse drag on the stick gives about 40 % and moves the rover forward at 3.4 studs/s. Letting go centres the stick and stops the motors. |
| `C10-keys` | ArrowUp drives the rover and ArrowLeft spins it. The **Keys** pad lights up the arrow being held. |
| `C11-reloaded` | After a cold reload the world still has both programs, the active tab and the construction. Code reopens on **Joystick drive**. |
| `G1-gate-my-world` | The gate defaults to **My world** with **Smart gate** and a **Someone walks up** button. |
| `G2-door-open` | The visitor walks into the beam. The door swings to **90°**, turning about the hinge only (the door's rotation has x = z = 0). |
| `G3-gate-reset` | After Reset the door is back at 0°. A click and a drag on a scenery brick on the stage selects it but does not move it. |
| `S1-signal-red` | **Code this creation** on the card names the signal post and opens Code on **Signal post** in My world. When the visitor arrives, the light chip reads **red**. |

Checks along the way:

- Blockly's Delete and ⌘Z remove the dragged block and bring it back. Both edits are saved, the
  studio sees neither key, no brick moves, and nothing is added to its Undo stack.
- Every Back to build leaves the bricks, cables, device names and creations identical to how they
  were before Code opened, compared with sorted keys.

## Not covered here

- **Touch.** iPad and iOS Simulator runs belong to lane T. The Code view has coarse-pointer sizing
  (every control at least 44 px, text at least 13 px) and no hover-only or pinch-only controls, but
  it has not been driven by touch.
- **The five failures.** They are covered by lane M's controller tests. On the Code view side, the
  unplugged motor and the missing sensor appear in part 1. The reversed motor has its own reading
  (opposite speeds turn the Motors chip red), which is covered by `src/robotics/code/stageReadings.test.ts`.
