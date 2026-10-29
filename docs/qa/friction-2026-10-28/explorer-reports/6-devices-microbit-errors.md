# Friction: devices, micro:bit, errors

I found 11 friction points across the app. The worst ones are on iPads, on WebGL failure and on Wi-Fi drops during saves. The Remote is also missing from the Hackable Platformer. All of this comes from reading the code. Where I'm guessing about behaviour, I say "(inference)".

**1. iPad Safari tells kids to "use Chrome or Edge on a computer", with no mention of Scrub**
- **Who and when:** every iPad class that opens the Remote in Safari. Without Scrub's bridge, `ConnectRow` falls back to the USB row, so the only path that works on iPad is never mentioned.
- **Evidence:** `src/microbit/ui/MicrobitPanel.tsx:59`, `:107`; `src/microbit/bluetooth.ts:42`
- **Severity:** blocks
- **Fix (S):** when the device is iOS and Scrub's bridge is missing, say "On iPad, open this page in the Scrub app" with a link.

**2. iPads are told to drag a file onto a drive they don't have**
- **Who and when:** the same iPad users. The no-WebUSB message ("Drag it onto the MICROBIT drive") is shown inside the USB row on iPads too.
- **Evidence:** `MicrobitPanel.tsx:121`, `:134-139`
- **Severity:** confuses
- **Fix (S):** hide the install row on iOS and point to the Scratch program page instead.

**3. "Code your micro:bit" probably opens our "We couldn't find that page" screen**
- **Who and when:** anyone pressing that button on a normal deploy.
- **Evidence:** `/micro` isn't in the repo or in `vercel.json`, which sends every path (`/(.*)`) to `index.html`. The app's router has no `/micro` route, so it shows the not-found page (`src/main.tsx:45`). The editor needs a manual copy step (`docs/MICRO-EDITOR.md`, "Deploy"). Button is at `MicrobitPanel.tsx:13`, `:166`. (Inference: depends on whether the manual step was run.)
- **Severity:** blocks
- **Fix (M):** add the route in `vercel.json` or a CI step, or hide the button when `/micro/index.html` is missing.

**4. No WebGL means a crash screen, and Reload brings it straight back**
- **Who and when:** old Chromebooks, or locked-down GPUs, opening `/build`.
- **Evidence:** the main `<Canvas>` has no `fallback` (`src/brick/BrickStudioScene.tsx:1973`). The error goes to `AppErrorBoundary`, which shows the raw message after "What happened:" (`AppErrorBoundary.tsx:178`; `errorLog.ts:18`). Reload repeats it (inference). Only a lost context mid-session is handled (`:1988`).
- **Severity:** blocks
- **Fix (M):** check for WebGL before loading. If it's missing, say "This computer can't show 3D — try the 2D builder" and link `/2d/build`.

**5. A Wi-Fi drop during a class-world save stops autosave for good**
- **Who and when:** students in class worlds when school Wi-Fi drops.
- **Evidence:** in `src/classroom/cloudAutosave.ts`, one failure sets `failed=true` (`:38`). After that, `schedule` never flushes again (`:45`) until someone presses Retry (`:47`). Nothing listens for the `online` event anywhere in `src`. The message joins two sentences into a long, scary one ("Could not connect…" plus "…Download a copy before reloading"), from `client.ts:95` and `cloudAutosave.ts:38`.
- **Severity:** loses work (inference: kids keep building and never press Retry)
- **Fix (M):** retry automatically with backoff and when `online` fires, and use one short message.

**6. A spotty network shows the crash screen when switching modes**
- **Who and when:** slow school Wi-Fi, or a tab left open over a deploy, when moving between modes.
- **Evidence:** every mode is a `lazy()` import (`src/main.tsx:12-24`). There is no `vite:preloadError` handler, so a chunk that fails to load lands on "Oops! The studio tripped over a brick" with "Failed to fetch dynamically imported module…".
- **Severity:** confuses
- **Fix (S):** catch chunk-load errors, reload once, and otherwise show "Check your internet and try again".

**7. The Hackable Platformer has no Remote**
- **Who and when:** kids who used the Remote in the 3D builder or 2D game and then open `/2d/hackable`.
- **Evidence:** no Remote code is imported anywhere under `src/platformer/lab`. The button only appears in `GameScreen.tsx:754` and `BrickStudioApp.tsx:370`.
- **Severity:** confuses (the Remote is meant to work in every mode)
- **Fix (M):** mount `MicrobitButton` and `MicrobitPanel` in `StudioShell`.

**8. In 3D the Remote only appears while exploring, and building closes it**
- **Who and when:** a 3D builder looking for the Remote in Build mode.
- **Evidence:** `BrickStudioApp.tsx:370` sits only in the Explore toolbar; leaving Explore closes the panel (`:738-743`).
- **Severity:** annoys
- **Fix (S):** show a disabled Remote button in Build mode with a tooltip saying "Explore to use your Remote".

**9. When the micro:bit disconnects, nothing shows unless the panel is open**
- **Who and when:** mid-game, when the cable comes loose or Bluetooth stops sending.
- **Evidence:** the errors are set in `link.ts:127`, `:52` and `bluetooth.ts:81`, but they only appear inside the panel (`MicrobitPanel.tsx:90`, `:120`). The header button just loses its dot (`MicrobitButton.tsx:39`).
- **Severity:** confuses (the character just stops)
- **Fix (S):** show a short message over the game, "Your micro:bit disconnected – Reconnect", with a button.

**10. Coding your own micro:bit program removes the Remote program**
- **Who and when:** a kid who uses "Code your micro:bit", flashes their program, then comes back to play.
- **Evidence:** the panel then says "Connected, but the Brickgineers Remote program isn't on it yet" (`MicrobitPanel.tsx:111`). Nothing warns them beforehand (`:167`).
- **Severity:** confuses
- **Fix (S):** add one line to the note saying their program replaces the Remote, and that "Install the remote program" puts it back.

**11. Large first loads on school Wi-Fi**
- **Who and when:** first visit to `/build` or `/2d/hackable` on a slow network.
- **Evidence:** the build has `rapier` at 2.2 MB, `events-*.esm` at 878 KB, `en-*` at 712 KB and `StudioApp` at 470 KB (`dist/assets`). `vite.config.ts` has no `manualChunks` or other chunk settings. Fonts come from Google Fonts through an `@import` (`index.html:10`), and school filters often block them (inference).
- **Severity:** annoys
- **Fix (M):** load physics only when entering Explore, load the block editor's language pack on demand, and host the fonts ourselves.

**Things I checked that look solid:** reduced-motion rules (in 20 CSS/TSX files), the recovery copies in the error boundary, the warnings before leaving with unsaved live-room changes, live-room reconnects, the quota handling in the lab's storage, the phone message "Code needs a bigger screen" (`Inspector.tsx:136`), and 44px touch targets in the Remote panel.