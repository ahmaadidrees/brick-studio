# Brickgineers Remote (micro:bit) release — October 20, 2026

Product commit: `2385967` on `claude/microbit-remote` (pushed), branched from the previous production commit
`f093826` on `claude/projects-home`. Frontend only: no Worker deploy, no database migrations.

Shipped the Remote panel in the platformer, race and 3D Explore:
- a virtual micro:bit that students can press and tilt;
- per-mode assignments of inputs to game actions, saved in the browser;
- reactions back to the micro:bit (coin, hurt, lap, finish and more; 2D modes only);
- a live monitor of the messages both ways;
- a USB serial link (Web Serial);
- "Install the remote program", which flashes `public/microbit/brickgineers-remote.hex` over WebUSB using
  `@microbit/microbit-connection` 1.0.0, with download-and-drag as the fallback.

## Deployments

- Website: `dpl_2NNv4SghWb56qkhAgQsoFsYGQcmi`, https://virtual-legos-qcfgjt829-ahmaadidrees-projects.vercel.app,
  aliased to https://brickgineers.com.
- `vercel deploy --prebuilt --prod` ran twice by mistake, which also created the identical
  `virtual-legos-bxfreayj9` deployment a few seconds earlier. The later deployment is the aliased one. They are the
  same build.
- Built locally with the production environment from `vercel pull` (`npm run build`). The output was assembled in
  `.vercel/output` with the same `config.json` routes as the 2026-10-15 release.
- Worker unchanged: `bf95772d-3342-41e0-b528-9203444f70ad`.

## Checks and limits

- `npm run check`: app suite 1,655 passing; Worker suite 241 passing; brick-core, platformer-core and Worker
  typechecks passed; production build passed.
- brickgineers.com serves the new `index-BFUkEyGi.js`, the same file name as the local build.
- `/microbit/brickgineers-remote.hex` is served with HTTP 200, and its SHA-256 (`7c2ff9d0…49ffb3`) matches the
  repository file.
- The live 2D builder opens the Remote panel with the Connect and Install buttons, with no console errors.
- The owner tested the USB link with a real micro:bit V2 on the local build before release: assignments and game
  control worked.
- **Not tested on real hardware:** the WebUSB Install button, which was only checked with unit tests and in the
  browser without a device. Also not tested: school Chromebooks, where an admin policy may block WebUSB or Web
  Serial.
- No signed-in or classroom journeys were exercised. This release doesn't touch them.

## Rollback

Previous website: `dpl_nrUsrQoxbD28PXaY9Y6jCNBdXcGr` (`vercel promote` it, or roll back in the Vercel dashboard).
No Worker or database changes to undo.
