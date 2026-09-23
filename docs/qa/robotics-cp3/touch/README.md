# Robot Workshop spike, checkpoint 3, lane T: touch in iPadOS Safari on the iOS Simulator

Discovery pass, 2026-09-23. Branch `claude/robotics-cp3-touch`, off `e7f7abd`. Behind `VITE_ROBOTICS_PROTOTYPE=1`
(`--mode robotics`). No app code changed. This pass adds a harness and evidence, and lists what it found for the lanes
that own the files.

- Harness: `scripts/qa/robotics-cp3-touch.mjs`. The driver helper, reusable by other lanes: `scripts/qa/lib/safari-ios.mjs`.
- Evidence: `portrait/` (14 screenshots of the whole simulated screen plus `portrait/results.json`, which holds every check,
  finding, per-stage layout, small targets, small text and on-screen stud sizes).
- Result: **45 of 46 checks pass.** You can build the checkpoint-1 rover, drive it and reset it using touch alone. The one
  failing check is a layout problem. While the rover drives, it goes under the creation panel.

## Method

Safari 26.5 runs on a simulated **iPad Air 11-inch (M4)** (iOS 26.5, UDID `F219AEB2-…`). The harness drives it through
`safaridriver`'s W3C WebDriver HTTP API, using plain `fetch` with no new dependency.

1. `safaridriver -p 4471`. The helper starts it if nothing answers on that port. The simulator needed no `--enable`, no
   password and no Remote Automation toggle.
2. `POST /session` with `{ browserName: 'Safari', platformName: 'iOS', 'safari:useSimulator': true, 'safari:deviceUDID': <udid> }`.
   Safari opens an automation window on the device.
3. Every tap, double tap and drag is a W3C `pointer` action with `pointerType: 'touch'`. WebKit delivers real touch
   input: `touchstart`/`touchend`, and `pointerdown`/`pointerup` with `pointerType: "touch"`. The page reports
   `(pointer: coarse)`, `(hover: none)` and `maxTouchPoints: 5`.
4. The harness uses `execute/async` only to read state: the brick and robotics stores, the dev hook
   `window.__robotics.project(worldPoint)` (where a spot is on screen, as a student aims by eye), element rects and
   `elementFromPoint` hit tests.
5. `xcrun simctl io <udid> screenshot` captures what a student sees, including Safari's bars and system overlays. The
   harness downsizes each capture to 820×1180 JPEG (1 px per CSS px).

Driver quirks. The helper handles each of these, and each is documented in `safari-ios.mjs`:

- **The lift arrives late.** The last event of an actions command (the finger lifting) only reaches the page when the next
  pointer command arrives. Every gesture therefore ends with a 16 ms pause on the same finger to flush it.
  `DELETE /actions` is not a substitute: it delivers the lift at (0, 0) and can add a phantom `touchstart`.
- **A double tap must be two separate commands.** If one chain holds both taps, WebKit delivers one long touch. Two tap
  commands land about 115 ms apart, lift to lift, which fits inside the studio's 350 ms double-tap window.
- **Never drag over a region that scrolls natively** (an `overflow: auto` list). The gesture returns, but every command
  after it times out until Safari is quit. Canvas drags are safe because the studio root has `touch-action: none`. The
  harness therefore scrolls a list into view with `scrollIntoView` and records that a scroll was needed. After an abort,
  it quits Safari (`simctl terminate … com.apple.mobilesafari`) so the next session can pair.
- **Typing inserts no text.** WebDriver key input (Element Send Keys or key actions) fires `keydown`/`keypress`/`keyup`
  but no `beforeinput`/`input`, even after a real tap has focused the field. The harness enters the creation's name
  through a script-dispatched `input` event, and says so in the results.
- **Only one finger arrives.** An action with two touch sources delivers one finger, so pinch and two-finger pan cannot be
  driven.

Setup writes, which are not student actions: the onboarding is marked as dismissed, the guest project is cleared,
`newBuild()` and `requestView('home')` run, and the name is typed as described above. Everything else is a touch.

The rover here is the checkpoint-1 pointer journey's rover moved 8 studs along x (`ROVER_OFFSET_X`). At the pointer
journey's own spot, the first tap lands inside the plate's initial ghost and is swallowed; finding 2 covers this, and step 1
records it as evidence.

Run it: `npx vite --mode robotics --port 5245 --strictPort --host 127.0.0.1`, then
`PATH=/opt/homebrew/opt/node@22/bin:$PATH node scripts/qa/robotics-cp3-touch.mjs`. It takes about 2.5 minutes. Output goes
to `docs/qa/robotics-cp3/touch/<portrait|landscape>/`, chosen from the page's own width and height.

## What this proves, and what it does not

It proves that the journey works in real WebKit with real touch events: Safari's own event order, `click` semantics,
media queries, `touch-action`, and layout at the iPad's true Safari viewport. That viewport is **820×1094** CSS px in
portrait, because Safari's bars take 86 pt of the 1180 pt screen. An 820×1180 emulation overstates the canvas.

It does not prove what a physical iPad would show:

- **Finger precision.** Simulated taps land on the exact pixel, while a fingertip covers about 44 pt.
- **The software keyboard.** The simulator has a hardware keyboard connected, so no on-screen keyboard appeared.
- **Real-device performance, palm rejection and Apple Pencil.**
- **Landscape.** Rotation could not be scripted; see the human steps below.
- **Pinch and two-finger pan**, which the driver cannot send.
- **Long-press grab.**
- **iPad with a trackpad or mouse.** That setup reports `any-pointer: fine`.

## Journey, step by step (portrait 820×1094)

| # | Step | Result | Shot |
|---|---|---|---|
| 0 | One-finger drag on open canvas | Orbits; page scale 1, no scroll | — |
| 1 | Open the drawer, tap **Plates**, tap **6 × 8 Plate** | Arms; the sheet closes itself | 02 |
| 1a | Tap inside the plate's first ghost (the checkpoint-1 spot) | Nothing happens: swallowed as a ghost grab | 03 |
| 1b | Tap open baseplate, then **Place** | Ghost goes to the tapped cell (36,0,26); placed | 04 |
| 2 | **Robotics**, **Hub**, tap the plate, **Place** | Placed; the card opens and frames the pair left of the card | 05, 06 |
| 2a | Tap the card's name field; name it; **Not now** | Focused by the tap (no zoom); named "Touch buggy"; the card closes | 07 |
| 3 | **Motor**, tap the plate, **Place** | "Right motor connected to port A"; the card stays closed | — |
| 3a | **Motor**, **Rotate** ×2, tap its spot in the 3D view | The spot is behind the first motor: the ghost goes on top of it (red) | 08 |
| 3b | **Top view**, tap the spot, **Place**, **3D view** | Placed at 36,1,31 r2; "Left motor connected to port B" | 09 |
| 4 | **Short axle**, tap each motor, **Place** | Each ghost snaps into its socket (34,0,32 and 42,0,32); both motors report an axle | 10 |
| 5 | **Wheel**, tap the left axle end, **Place** | Snaps onto the end (33,0,31) | — |
| 5a | **Wheel**, **double tap** the right axle end | Snaps and places in one gesture (44,0,31); page scale stays 1 | 11 |
| 6 | **Top view**, **Distance sensor**, tap, **Place**, **3D view**, **Cancel** | Placed facing forward, port C. One creation, 9 bricks, 3 bodies, "Axles and wheels on both motors, so it can roll" | 12 |
| 7 | Panel **Drive forward 40%** | Rolls 4.89 forward (about 8 studs), −0.02 sideways, yaw −0.2°, 2.59 s simulated in 2.6 s. **Fails:** it ends under the panel | 13 |
| 7a | Panel **Reset** | "Built pose"; the run is gone; the document is byte-identical | 14 |

On screen, one stud measures 22–25 px at the camera the card frames (plate, hub, first motor). It measures 41–50 px after
the Top or 3D view presets (axles, wheels, sensor). That is half a fingertip at best, so snapping is doing the precision
work.

## Findings, most severe first

Each finding names the file its fix belongs in. Other lanes own most of those files.

1. **The rover drives under the creation panel.** After Drive forward, the chassis is at (564, 517), under the panel's
   Nudge section. Only one wheel shows at the panel's edge (shot 13). In portrait the panel is 300 px wide and up to
   686 px tall. It covers 23% of the canvas, right where "forward" points from the home and 3D cameras, and the camera
   does not follow the rover. The 3D and Top view presets also ignore the panel inset: in shot 09 the hub is partly
   under the panel. Only opening the card or `requestFrame` frames into the free area.
   *Fix:* frame the creation's start pose plus its travel direction inside the free rectangle when a run starts (reuse
   `measureCanvasInsets`), and make the camera presets use the same insets. At compact widths, collapse the panel while
   running, to its head plus Stop/Reset. *Files:* `src/robotics/scene/framing.ts`, `roboticsStore.ts` (on run start),
   `RoboticsPanel.tsx`/`robotics.css` (compact running state), and the preset handling in `BrickStudioScene.tsx`.

2. **A tap on the armed ghost does nothing.** A touch that starts within the ghost's projected box plus 24 px of slop
   becomes a ghost grab, not a position. The 6 × 8 plate's first ghost covers 246×131 px at the home camera, and a tap
   inside it did nothing (shot 03). The only ways to move the ghost from there are to drag it (it rides 44 px above the
   finger) or to tap elsewhere first. Reading the code, a second tap within 350 ms counts as a double tap and **places the
   ghost where it already is**: the opposite of a student's "try again". This matters most for robot parts, where the
   next target is usually right beside the last one.
   *Fix:* a ghost touch that ends with less than 8 px of travel and is not the second tap of a double tap should become a
   position at the tap point. Only a drag or a hold should grab. *Files:* `src/brick/BrickStudioScene.tsx` (ghost-grab
   `pointerDown`/`pointerUp` in the build input effect), `src/brick/buildInput.ts`.

3. **A spot hidden behind another part is not reachable from the 3D view.** From the framed 3D camera, the second motor's
   spot is behind the first motor. A tap there lands on the first motor, and the ghost stacks on top of it, red, with the
   message "That placement overlaps…" (shot 08). The sensor's spot behind the hub has the same problem; the pointer
   harness also used the top view for it. A student has to know to switch to Top view.
   *Fix:* either use a higher default elevation when framing a creation for building, or, when a tap's first hit gives a
   blocked ghost and the next hit below is the plate or stud surface, use that. *Files:* `src/robotics/scene/framing.ts`
   (elevation) or `BrickStudioScene.tsx` `supportedDraftFromPoint`.

4. **The wiring line covers the panel's name row for the whole build.** At 820 px, the centred wiring line overlaps the
   top of the right-docked panel by 116–122 × 42 px. The creation's name field is hidden from the first motor onward
   (shots 08–14). The line stays until dismissed, and its × is 19×22 px.
   *Fix:* in the compact layout, show the line inside the panel or above the command strip, and let it fade after a few
   seconds (Undo stays in history). *Files:* `src/robotics/ui/robotics.css` (`.robotics-wiring-line`), `RoboticsPanel.tsx`.

5. **Several font declarations are invalid, so the text falls back to the wrong size.** `font: 900 15px/1.2 inherit` is
   an invalid shorthand (`inherit` cannot stand in for the family), so the browser drops the whole declaration. Computed
   sizes: the card's name field 10.5 px (15 px intended), the panel's name field 12 px at weight 400 (900 15 px intended),
   chips 12 px, link buttons 12 px at weight 800. Chrome drops the declaration as well. On touch it matters more: a field
   under 16 px makes iPhone Safari zoom on focus (iPadOS did not zoom here).
   *Fix:* `font: inherit; font-size: 16px; font-weight: 900; line-height: 1.2` or equivalent, for `.robotics-field input`,
   `.robotics-name`, `.robotics-chip` and `.robotics-link-button`. *File:* `src/robotics/ui/robotics.css`.

6. **Touch targets under 44 px, the studio's own coarse-pointer minimum.**
   - Panel: the Nudge buttons are 30 px tall (Drive forward 40% 124×30, Back 40%, Run ±40%, Stop, Stop all, Reset 51×30).
     The run-space chips are 30 px (116×30, 90×30), the name field is 225×34 and **Hide** is 37×20.
   - Card: the name field is 270×40; **Not now** and **Code this creation** are 40 px tall.
   - Wiring line: **Undo** is 42×22 and **×** is 19×22.

   Every tap landed here, but simulated taps are exact.
   *Fix:* a `(pointer: coarse)` block raising these to `min-height: 44px`, with padding or a `::after` hit area on the
   link buttons. *File:* `src/robotics/ui/robotics.css`.

7. **Small text.** The panel and card body are 12 px, with secondary lines at 10.5–11.5 px ("Name it", "mechanics only ·
   no code yet", "Built pose"). In the studio: drawer part labels are 10 px, camera cluster labels 10 px, the command
   strip's "Placing" 9 px, and "Bricks" 11 px. Children read this at arm's length.
   *Fix:* 13–14 px for robotics text under `(pointer: coarse)` (`robotics.css`). The studio labels are out of this lane's
   scope (`brick-studio.css`).

8. **The port glyphs read as letters.** "Hub · ports A○ B○ C○ D○" renders as "AO BO CO DO" at 11.5–12 px (shot 06).
   *Fix:* one small chip per port, or the word "free" or "used". *File:* `RoboticsPanel.tsx`.

9. **Risk that only WebKit shows: a tap's `click` has `pointerType: "mouse"`.** Chrome's touch emulation reports `"touch"`.
   The studio's mesh `onClick` handlers (Baseplate, BrickObject, instanced bricks) call
   `isConfirmationPlacementPointer(click.pointerType)` to ignore touch taps. In Safari that call sees a mouse, so only
   the canvas-level touch click guard (450 ms after a touch `pointerup`) keeps a first tap from placing. The guard held for
   every tap in this run.
   *Fix:* decide touch versus mouse from the pointer that started the gesture (the last `pointerdown`'s type per pointer
   id), not from the `click`. *File:* `src/brick/BrickStudioScene.tsx`.

10. **Info.** iPadOS Safari sends a Macintosh user agent. The studio correctly relies on media queries and `maxTouchPoints`.
    The compact layout applies at 820 px, where the drawer is a bottom sheet covering 49–55% of the screen, and choosing a
    part closes the sheet. The Robotics category's second row (Button, Hinge motor, Seat) sits below the 162 px part
    grid's fold and needs a scroll.

**Still unverified, and a likely finding for landscape.** In landscape the canvas is about 360 px shorter. That is an
estimate: an 820 pt screen, minus Safari's bars and the studio header. At that height the panel's cap of
`100% − header − 150px` comes to about 520 px, against 686 px of content, so Drive and Reset fall below the fold and the
panel must scroll. The studio
root has `touch-action: none`. The drawer sheet explicitly re-allows `pan-y`; the panel and card do not. A capped-panel
drag wedged the driver in the same way the drawer grid does, and the canvas never does. That is indirect evidence that
native scrolling started, so the panel probably does scroll by touch. A human should confirm it in landscape.

## Human steps

- **Landscape.** Rotation is not scriptable here. safaridriver has no orientation endpoint, and `simctl` has no rotate
  command. Driving the Simulator menu through System Events needs Automation and Accessibility permission for the
  terminal. To get landscape evidence, rotate the simulator by hand (Simulator › Device › Rotate Left, ⌘←) and re-run the
  harness; it writes to `landscape/` by itself.
- One `osascript … System Events` probe hung, waiting on a macOS permission prompt, and was killed. If a dialog saying
  the terminal "wants access to control System Events" is still on screen, dismiss it.
- **The "1 Hidden Window" pill.** When a session starts while Safari still has its own window, iPadOS shows this pill at
  the bottom centre, over the studio's **Bricks** button, in some of the screenshots. WebDriver touches go straight to
  the web view and pass under it; a real finger would hit the pill. It is an artifact of the automation window, not of
  the app. Hidden windows build up across sessions: by the end of this pass there were four (shot 09). A human can clear
  them from Show All Windows, and they do not affect the page.

## After the lead's fixes (2026-09-23, integration branch `d4ed33b`)

Same harness, same simulator (iPad Air 11-inch M4, iPadOS Safari 26.5, portrait), against the integration branch:
**46/46 checks**, evidence in `portrait-after-fixes/`. The rover now rolls 5.3 studs forward in open canvas (the nudge
frames nine studs ahead and behind inside the free area); the wiring line sits under the history cluster; hub ports are
chips; robotics controls are at least 44 px on touch. One minor note remains: in portrait the Nudge section's Reset needs a
scroll inside the panel (the panel's Hide collapses it).

Fixed in the robotics layer (`d4ed33b`): findings 1 (rover under the panel, presets ignoring the panel), 4 (wiring line
over the name row), 5 (invalid font shorthands), 6 (targets under 44 px), 7 for robotics text, 8 (port markers).

Left for the studio on `main`, not changed in this spike because they are studio-wide input behaviour, not robotics:
- Finding 2: a tap inside the armed ghost's own area (plus 24 px slop) starts a ghost drag and does nothing on release;
  a large ghost (a 6×8 plate) makes it hard to nudge by tapping. Dragging the ghost works, as the onboarding says.
- Finding 3: a spot hidden behind another part in the 3D view is not tappable (the hit lands on the part in front); the
  Top view reaches it, and the harness uses it.
- Finding 9: Safari reports a tap's `click` with `pointerType: "mouse"`; the studio's 450 ms touch-click guard is what
  stops a first tap from placing, and it held on every tap. Deciding touch vs mouse from `pointerdown` would be sturdier.
- Landscape could not be scripted (no rotate command in safaridriver or simctl); it needs a person to rotate the
  simulator (⌘←) and re-run the harness, which writes to `landscape/`.
