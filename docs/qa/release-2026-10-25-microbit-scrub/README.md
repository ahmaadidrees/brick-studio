# Remote over Bluetooth on iPads (Scrub) — October 25, 2026

Branch `claude/microbit-scrub` (`4e7d70e`), from production `claude/3d-per-person-mode` (`8fb357f`). This release
changes the website only; the Worker is unchanged (`ebf601fb`).

## What it does

[Scrub](https://apps.apple.com/us/app/scrub-web-browser/id1569777095) is an iPad browser for Scratch with Scratch's
Bluetooth bridge (Scratch Link) built in.

- **The marker.** In its App Store build, Scrub only opens its listed Scratch sites, local files, and pages that carry
  `<script id="scratch-link-extension-script">`. Scrub checks this in `WebView.swift` and `ScratchWebViewController.swift`.
  `index.html` now carries that marker. Scrub then opens brickgineers.com and gives it
  `Scratch.ScratchLinkSafariSocket`.
- **The Remote panel inside Scrub.** It shows "Find micro:bits" in place of USB:
  1. It discovers micro:bits running **Scratch's micro:bit program** (service `0xf005`).
  2. It lists each one by the name it scrolls.
  3. It connects and subscribes to notifications.
- **What carries over.** Tilt, A, B, the pins and shake feed the same Remote store as the USB link, so assignments work
  in all three modes. Reactions show on the LEDs as pictures, numbers or text.
- **What doesn't.** Sounds don't play, and the logo isn't reported.
- **Elsewhere nothing changes.** In other browsers `Scratch.ScratchLinkSafariSocket` doesn't exist, so the USB panel
  is unchanged; this was checked on the preview in Chrome.

Code:
- `src/microbit/scratchLink.ts`: the JSON-RPC BLE session.
- `src/microbit/bluetooth.ts`: the Scratch micro:bit protocol and the session.
- `src/microbit/ui/MicrobitPanel.tsx`: `BluetoothRow`.

The protocol follows scratch-vm's `extensions/scratch3_microbit` and `io/ble.js`.

## Deployments

- Preview: `dpl_4JUJWfYSZGNV8w92vYsm5WpF7szg`. The first upload attempt returned "Not authorized" and created nothing;
  the retry worked.
- Production: `dpl_5HjM9wQgXoxwDWGQXn69zJHGEETY`, aliased to https://brickgineers.com. It serves `index-B0ghFWCw.js`
  and the marker. Deployed once.
- Rollback: `dpl_5dbV4541kSdf5sFe6yVjwWiuw9Ax`.

## Checks

- `npm test` passed with 1,666 tests, all in one run. The Worker suite passed 241. The typechecks and the production
  build passed.
- A fake Scrub bridge, in unit tests and in the browser, covered:
  - discover → list → connect → read;
  - packets becoming button, tilt and shake state;
  - heart → LED bytes;
  - disconnecting 4.5 s after packets stop.
- **Not tested:** a real iPad, Scrub, or a real micro:bit over Bluetooth. That is tomorrow's test.

## Tomorrow's test (about 10 minutes, one iPad and one micro:bit)

**Before you leave:** put Scratch's micro:bit program on the boards from your laptop. Go to scratch.mit.edu/microbit,
download the "Scratch micro:bit HEX" (a .zip; unzip it), and drag the `.hex` onto each MICROBIT drive. A board running
it scrolls a five-letter name.

1. **First, check the board.** In Scrub, open Scratch itself, add the micro:bit extension, and connect.
   - If that fails, the board or Bluetooth is the problem, not Brickgineers.
   - Check iPad Settings → Scrub → Bluetooth is on.
2. **Open Brickgineers in Scrub.** Type `brickgineers.com/2d/build` in Scrub's address bar.
   - If Scrub says it only supports Scratch, tell me the exact message. That means the marker check didn't pass.
3. **Find the board.** Open the **Remote** panel → **Find micro:bits** → tap the name the board is scrolling.
   - It should say **Connected over Bluetooth**.
4. **Press A, then B.** The on-screen board should light up, and the character should jump or run.
5. **Tilt left and right.** The lean slider should follow and the character should walk.
   - Also try the race kit (`?kit=race-starter`): tilt steers, A is gas.
6. **Test the LEDs.** Under "When the game says…", press **Try it**. The board should show the picture, for example the
   heart.
7. **Test the dropout.** Turn the board off. Within about 5 s the panel should say "The micro:bit stopped answering".

What to tell me if something's off (each is a quick fix):
- **Nothing found:**
  - Is the board scrolling its name?
  - Is another iPad already connected to it? Only one connection is allowed at a time.
- **Connects, then drops after about 5 s:** the button and tilt notifications aren't arriving.
  - Open **Live monitor** in the panel. Does anything come in?
- **Tilt goes the wrong way:** say which mode and which direction.
- **Pictures are mirrored or upside down:** say how.
