# Robot Workshop spike, checkpoint 3: the Code view by touch in iPadOS Safari

iPad QA lane, 2026-09-23. Branch `claude/robotics-qa-ipad-code`, off `78fca7d` (lane U's Code view merged). Behind
`VITE_ROBOTICS_PROTOTYPE=1` (`--mode robotics`).

- Harness: `scripts/qa/robotics-cp3-ipad-code.mjs`. It drives the simulator through `scripts/qa/lib/safari-ios.mjs`,
  the same way `robotics-cp3-touch.mjs` does. `../touch/README.md` explains the driver and its quirks.
- Evidence: 16 screenshots of the whole simulated screen (`01`–`16`), `results.json` (every check, finding, measurement
  and per-stage layout audit) and `before-fix-keys-hold-selects-label.jpg`.
- Result: **34 of 36 checks pass** after the fixes below. Both failures are portrait layout problems that are not fixed
  here (findings 1 and 2). Every step of the journey works by touch. Desktop Chrome still passes 51 of 51 with the fixes
  (`robotics-cp2-code.mjs` against this branch). `npx vitest run` passes 1667 of 1667.

Run it: `npx vite --mode robotics --port 5248 --strictPort --host 127.0.0.1`, then
`PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-cp3-ipad-code.mjs` (about 3 minutes).

## Method

Safari 26.5 runs on the iPad Air 11-inch (M4) simulator, iOS 26.5, in portrait. The Safari viewport is 820×1094 CSS px;
Safari's bars take 86 px of the 1180 px screen. The page sees `(pointer: coarse)`, `(hover: none)` and 5 touch points.

Setup through the store: the rover is placed part by part with `choosePart → rotate → setDraftPosition → placeDraft`,
the same way `robotics-cp2-code.mjs` builds it. The card's name field is focused by a tap and filled with a
script-dispatched `input` event, because WebDriver typing inserts no text in Safari 26.5. "Not now" is then tapped.

From the **Code** button on, every input is a W3C touch action: taps, one-finger drags on the Blockly canvas, and holds on
the joystick and the Keys pad. Blocks and fields are aimed at through `window.__robotics.codeWorkspace()`, the rover and
the wall through `window.__robotics.project`. The one other script write is the 6 in Blockly's "Change value" prompt,
entered the same way as the name. During every drag and hold, a 100 ms in-page sampler records the page's scroll, the
visual viewport's scale and offset, the text selection, the joystick's axes and the run.

## Journey, step by step (portrait 820×1094)

| # | Step | Result | Shot |
|---|---|---|---|
| 0 | Build the rover (store), tap the card's name field, name it, tap **Not now** | Pass: "Mars buggy", 9 bricks | 01 |
| 1 | Tap **Code** in the creation panel | Pass: the button is 61×44 after fix 7 (it was 59×32). First-run state: 1 script, palette collapsed, 9 rail rows, goal line shown | 02 |
| 1a | Everything a finger needs is on screen and on top | Pass: Back, tab, +, Run, Stop, Reset, Test plate, My world, Frame, zoom ×3 and More blocks are all at least 44 px. The rail's nine 64×58 rows end at y 730. Nothing is outside the viewport and nothing is under Safari's bars | 02 |
| 1b | The 3 the goal names is on screen | **Fail: finding 1.** The 3 is at x 502, past the 480 px editor | 02 |
| 1c | The test plate's wall is framed on the stage | **Fail: finding 2.** The wall runs to x 933 on an 820 px screen | 02 |
| 2 | Tap **Run** | Pass: 3.34 studs/s top speed. It rests 2.47 studs from the wall and never gets closer. The Front sensor chip goes through 16 values (12.0 → 2.5 studs) and matches the observation. Status "Running · 4.0 s" | 03, 04 |
| 2a | The stage bar stays still while running | Pass after fix 4. Before it, "Running · 1.0 s" pushed **Reset** onto a second row and the switch onto a third, a 50 px jump | 03 |
| 2b | Tap **Reset** | Pass: every body back within 0.006, sensor 12 studs, "Ready" | — |
| 3a | Drag the scripts with one finger to reach the 3 | Pass: they move 71 px; the page does not scroll or zoom | 05 |
| 3b | Tap the 3 | Pass: Blockly opens its own modal **Change value** `<dialog>`, not an in-place editor, because touch devices get the prompt. Input and OK/Cancel are 44 px tall after fix 3 (they were 33 and 29) | 06 |
| 3c | Enter 6 and tap **OK** | Pass. Typing inserted nothing, so the value was set by script (harness note). Saved as revision 1. **Run** again: it rests 5.48 studs from the wall | 07 |
| 3d | Tap **Motion** on the rail | Pass after fix 1: a 281 px palette opens over the scripts. The scripts area stays 407 px and the script does not move | 08 |
| 3e | Tap **Motion** again | Pass after fix 2: the palette closes. Before the fix it closed and reopened straight away | — |
| 3f | Drag "stop Left motor · A" from the palette under "stop motors" | Pass: it snaps and saves. The palette goes back in as the drag begins. The page does not scroll or zoom | 09 |
| 3g | Drag that block onto the rail | Pass: the block is deleted and the change saved | 10 |
| 3h | Tap "forward ▾", then tap "backward" | Pass. The menu items are 103×31 | 11 |
| 3i | Double tap the program tab | Pass: the rename field opens with focus and the page does not zoom. A tap on the scripts closes it and keeps the name | — |
| 4 | Open **Motion**, tap **+**, tap **Joystick drive** | Pass: a second tab opens and is active. After fix 1 the new script sits at x 108–243 inside the scripts area; before it, the script sat at x 389–525, mostly off the editor | 12, 13 |
| 4a | Tap **Run**, then put a finger on the knob, push it 14 px up, hold 0.5 s and lift | Pass: while held it reads "up 9" → "up 29" → "up 41". The rover reaches 3.39 studs/s and moves 3.4 studs (wall 12.0 → 8.6). Lifting centres the stick and stops the motors. The page does not scroll or zoom | 13 |
| 4b | Tap **Keys**, hold **↑** for 0.45 s | Pass after fix 5: 8.8 studs/s and the motors stop on lift. Before the fix, the hold selected the "↑" label and opened iPadOS's Copy / Find Selection / Look Up / Translate callout over the Joystick/Keys switch. The harness's next tap landed on **Translate** and opened Apple's translation privacy sheet | 14, before-fix |
| 5 | Tap **My world**, then **Test plate** | Pass: the stage switches both times; the run space is saved | 15 |
| 5a | Tap **Back to build** | Pass: the Code view and the stage close and the creation panel returns. Bricks, cables, device names and the creation are exactly as built. Both programs are kept. No page errors | 16 |

## What touch can and cannot do in Blockly 13 on iPadOS Safari

Works with one finger:

- Dragging the workspace background scrolls the scripts.
- A tap on the rail opens a category.
- Dragging a block out of the palette. The first move has to be sideways, because a vertical drag in a vertical palette
  scrolls the palette instead.
- Snapping a block under another.
- Dragging a block onto the rail deletes it.
- A tap on a dropdown opens Blockly's menu, and a tap on an item picks it.
- A tap on a number opens the prompt.
- The page never scrolled or zoomed during any drag (the studio root is `touch-action: none`).
- One exploratory drag that started on a script block scrolled the workspace instead of moving the block. It did not
  happen again in three full harness runs, where the harness hit-tests the block before grabbing it.

With caveats:

- **Numbers are edited in a modal `<dialog>`, not in place.** That is Blockly's touch behaviour when `modalInputs` is on,
  which is the default. The input is `type="text"` with no `inputmode`, so a real iPad shows the full keyboard rather than
  a number pad. Typing could not be driven here.
- **The tap targets inside blocks are small at the start scale of 0.78.** Number ovals are 31–33×25 px, dropdowns are
  28 px tall, menu items 31 px. Block text renders at 12.5 px.

Not tested:

- Pinch-zoom on the workspace (`zoom.pinch: true`), because the driver delivers one finger only.
- Long-press context menus on blocks.
- The software keyboard.
- Landscape. There is no non-interactive way to rotate the simulator: safaridriver has no orientation endpoint and simctl
  has no rotate command.

## Product changes (all in `src/robotics/**`)

1. **The palette floats over narrow scripts areas** (`BlocklyWorkspace.tsx`: `paletteFloats`, `fitPalette`, the inject
   line, the resize observer). Below `PALETTE_OPEN_MIN_WIDTH` (720 px), which covers every iPad, the flyout is
   `autoClose`: it opens over the scripts and goes back in when a block is dragged out or the scripts are tapped. Wide
   editors (1366×768) keep the pinned palette.

   Before this change, in portrait, opening Motion left 126 px of scripts beside the palette, and opening Sensing (438 px)
   left −31 px, so no block from it could be dropped. Blockly keeps a pinned flyout's width reserved after it hides:
   `flyout.getWidth()` stays at 281 and the metrics add it whenever `!autoClose`. So the dead band stayed after the palette
   closed, and every later `placeScripts` pushed the script off the editor.
2. **A tap on the open rail row closes the palette** (`blocklySetup.ts`: `RailToolbox`, `RailCategory.onNodeFocus`,
   `plugins.toolbox`). iPadOS Safari focuses a tapped row after the finger lifts, together with the click. Blockly's
   pointer guard (`mouseDown`) is already off by then, and focusing a category selects it. The palette therefore closed at
   pointerdown and reopened at focus. Focus that comes within 1 s of a press on the rail is now ignored; keyboard focus
   still selects.
3. **Blockly's "Change value" prompt on touch** (`code.css`, `(any-pointer: coarse)` block). The input is 44 px tall at
   18 px text; OK and Cancel are 88×44 and rounded; the font is Nunito.
4. **The stage bar stays still in portrait** (`code.css`, `@media (max-width: 900px)`). Run, Stop and Reset keep row 1.
   The status moves beside Test plate / My world with `flex: 1 1 0`, so it shrinks instead of wrapping.
5. **No text selection or callout in the Code view** (`code.css`, `.robo-code-editor, .robo-code-stage`):
   `-webkit-user-select: none; -webkit-touch-callout: none`. The rename field is `-webkit-user-select: text`. Safari 26.5
   does not support unprefixed `user-select` (`CSS.supports('user-select', 'none')` is false), so the studio's
   `.brick-studio { user-select: none }` does nothing there.
6. **Zoom above the palette** (`code.css`, `.robo-zoom { z-index: 75 }`). An open palette covered **Zoom out**.
7. **Touch sizes** (`robotics.css`: `.robotics-code-button { min-height: 44px; font-size: 13px }` in the coarse block;
   `code.css`: the code head's "Wiring" label and the Keys pad's "space" go to 13 px).

Tests: `BlocklyWorkspace.test.tsx` adds two tests. One checks that the palette floats on a narrow scripts area and is
pinned on a wide one. The other checks that a press on the open row closes it, that a focus arriving afterwards does not
reopen it, and that a later focus with no press does select. Temporarily removing the guard makes the second test fail.
`src/robotics/codex-qa-20260922.test.ts` is unchanged.

## Findings not fixed, most severe first

1. **Portrait: the first-run script is wider than the scripts area, so the 3 the goal names is off screen.** The editor is
   `clamp(480px, 58vw, 900px)`, which is 480 px, leaving 407 px of scripts. "wait until … sees something closer than 3
   studs" runs to about x 582 at scale 0.78 (474 px wide), and the 3 sits at x 502–510, under the stage. A student must know to drag the
   scripts sideways.
   *Proposed fix:* in portrait (`orientation: portrait` and a width of 900 px or less), stack the Code view: editor full
   width on top at about 55%, stage below. `measureCanvasInsets` would need to read the editor as a top inset. The 3 then
   has about 740 px of room at scale 0.78, and the blocks could start at scale 1.0 for fingers. A smaller alternative is a
   starter whose wait block breaks onto two rows (`inputsInline: false` for `robo_wait_until`). Files:
   `src/robotics/code/code.css`, `src/robotics/scene/framing.ts`, `src/robotics/program/catalog/blocks.ts`.
2. **Portrait: the stage is framed about 1.46× too large, so the wall (and a rover that reaches it) runs off the right
   edge.** The stage keeps a 340 px column. Recomputed in the page, `framePoseInFreeArea` plans a camera 93.3 units away,
   which puts the rover and wall box at x 502–798. The real camera draws that box at x 544–977. The reason: BrickStudioScene's
   `OrbitControls maxDistance` is `max(64, 2 × frameDistance)` of the build bounds (`getBuildCameraLimits`), so the pose is
   pulled in to 64.
   *Proposed fix:* while a stage is open, let the frame request raise the orbit's max distance to at least
   `pose.distance × 1.1` (`BrickStudioScene.tsx` / `buildCamera.ts`). Alternatively, frame with
   `camera.setViewOffset` into the free rectangle instead of sliding the camera, which needs a smaller distance
   (`RoboticsBuildLayer.tsx` `CreationFraming`). Finding 1's stacked layout also removes most of the need.
3. **Studio-wide: `user-select: none` does nothing in iPadOS Safari.** A long press on any studio or robotics-panel text
   selects it and raises the Copy / Look Up / Translate callout. Fix 5 covers the Code view only.
   *Proposed fix:* `.brick-studio { -webkit-user-select: none; -webkit-touch-callout: none; }` in
   `src/brick/brick-studio.css`, with `-webkit-user-select: text` wherever `user-select: text` is set. This is outside
   robotics, so it is not changed here.
4. **Numbers open a text keyboard.** Blockly's prompt input is `type="text"` with no `inputmode`.
   *Proposed fix:* install a prompt through `Blockly.dialog.setPrompt` that renders the same dialog with
   `inputmode="decimal"`, or turn `modalInputs: false` so numbers edit in place. The in-place editor would need a check on
   a real iPad keyboard. File: `blocklySetup.ts`.
5. **Blockly targets are under 44 px at the start scale 0.78.** Number ovals are 31–33×25, dropdowns 28 px tall, the
   dropdown menu items 103×31. Block text renders at 12.5 px.
   *Proposed fix:* on coarse pointers, start at scale 1.0 or more once the scripts area has room (finding 1), and add
   `.blocklyDropDownDiv .blocklyMenuItem { min-height: 44px }` in the coarse block of `code.css`.
6. **Desktop only, pinned palette: a closed palette still reserves its width.** At 1366×768, closing the palette (a click
   on its rail row) should leave a blank band the width of the palette. That is the same Blockly code path fix 1 removes
   on narrow screens, and it was measured on the iPad before fix 1. It was not driven on desktop.
   *Proposed fix:* a `Blockly.MetricsManager` subclass (`plugins.metricsManager`) whose `getFlyoutMetrics` returns 0×0
   while the flyout is hidden, plus `workspace.scroll(workspace.scrollX, workspace.scrollY)` on `TOOLBOX_ITEM_SELECT` to
   re-translate.
7. **Portrait: the reading chips reflow while running.** The Motors chip widens ("40 · 40 %", "speed 33 · 35 %") and
   Speed wraps to a second row, so the readings grow from 94 to 155 px over the stage and shrink back on Reset.
   *Proposed fix:* fixed chip widths or `flex: 1 1 0` chips with no wrapping in the `max-width: 900px` block (`code.css`).
8. **Panel text under 13 px on touch** (creation panel, Build view): port chips "A"–"D" are 11 px; "Runs", "Wiring",
   "Nudge", "Left motor" and "Right motor" are 12 px; "mechanics only · no code yet" and "Built pose" are 11 px.
   *Proposed fix:* add these to the `(any-pointer: coarse)` block of `src/robotics/ui/robotics.css`. They are not changed
   here to keep this lane off the panel's styles.
9. **Info.** **More blocks** sits 12 px and the zoom cluster 18 px above the bottom edge, which is the home-indicator
   gesture zone on a real iPad. Taps work, but a short swipe could leave Safari. The starters menu (276 px wide from
   x 228) overlaps the stage's readings; that is harmless.

## Human steps

- **Landscape.** Rotate the simulator by hand (Simulator › Device › Rotate Left, ⌘←) and re-run with
  `UI_OUTPUT=docs/qa/robotics-cp3/ipad-code/landscape`. The checks assume portrait only in `env:touch-portrait`. In
  landscape the editor is `clamp(520px, 60vw, 900px)`, which is 708 px, so the palette also floats there.
- **The software keyboard and the number prompt on a real iPad.** Check which keyboard appears and whether the dialog
  stays above it.
- **"Hidden Windows" pill.** Automation sessions leave hidden Safari windows. Some screenshots show iPadOS's "N Hidden
  Windows" pill over the bottom centre, where it covers the zoom cluster. WebDriver touches pass under it; a finger would
  not. This comes from the automation, not the app.
