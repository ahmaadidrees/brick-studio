# Hackable Racing R1: November 3, 2026

Branch `claude/hackable-modes-proposal` (PR #27) at 28919f0, which has main bce7b67 (production until now) merged in.
The owner said "Deploy for class".

It adds Hackable Racing at `/2d/hackable-race`: a race project card, the race Build drawer and Car presets, the
Car's code ("How I drive"), and Play with a countdown, place, laps, results and touch driving. The full record is
`docs/qa/hackable-modes/r1/README.md`.

**Worker:** `3842d41c-aeca-4f29-b05b-3c3ebcd54952`, deployed first because the class shelf now accepts Racing powers.
- Rollback: `512ffc8a-79d6-4d73-8660-13cdc8099eb7`.
- `npm run test:worker`: 256 of 256.

**Website:** `dpl_Fi22yqRw489wJzBZi6jpgXAg36Bo` on https://brickgineers.com, serving `index-CO3G2f22.js`.
- Rollback: `dpl_2nPvkRBea8z219tUqn1XFNCahzyn` (group C, 2026-11-02). To roll back, run
  `vercel promote dpl_2nPvkRBea8z219tUqn1XFNCahzyn`, then `npx wrangler rollback 512ffc8a-79d6-4d73-8660-13cdc8099eb7`
  in `multiplayer/worker`. Race projects saved meanwhile stay saved, but the older site will not open them.
- **How it was built:**
  1. Copied `.vercel/project.json` from `groupc/int`, then ran `vercel pull` for production and `npm run build`.
  2. Carried `micro/` and `config.json` over from `groupc/int`'s output.
  3. Ran `vercel deploy --prebuilt --prod` once, and confirmed the result with `vercel inspect brickgineers.com`.

**No migration.**

**Checks before:**
- `tsc -b` is clean and the build is OK.
- The full vitest run timed out in 7 files under another project's load; each passes alone (see the R1 record).
- **CI on PR #27:** the push run passed. The pull-request run failed one test of 3,581: "says Couldn’t save when the
  browser refuses the write" in `StudioApp.new.test.tsx`, which waits 1 second for the "Saved on this computer" chip.
  - Locally it failed 2 times in about 27 runs, only when the test before it ran first; alone it passed 8 of 8.
  - The first save takes about 40 ms on both this branch and main, so it is a test-timing flake, not a slower save.
  - Main's copy of the same test passed 6 of 6. Worth giving that wait more time.

**Checks after** (headless Chrome, signed out):
- `/`, `/help`, `/join`, `/projects`, `/class`, `/2d/hackable`, `/2d/hackable-race`, `/2d/build` and `/micro/` all
  return 200.
- **Racing, 1366x768:** `?new=1` opens "My race track · Hackable Racing". Build shows Laps work, Track, Racers and Start.
  Code shows "How I drive" and the Racing section. Play shows "3rd" and "Lap 1/3", and the arrows drive
  (`prod-driving.png`).
- **Racing, 540x720 touch:** Play shows the place and lap.
- **The Platformer:** "My platformer · Hackable Platformer" opens, and Code shows "How I move".
- `/join?classCode=` with a made-up code: the new Worker answers 404.
- No console errors.

**Not checked:**
- A full three-lap finish and the results card in a browser.
- Signed-in saving of a race project, and a race power on the class shelf, against the live Worker.
- Real devices (Duo, iPad, Chromebook) and Safari.

**For the class test:** the cars are small on screen; the finish line's direction shows only in its card; cars drive
through each other; a few pages still say "Hackable Platformer" (invites, the Shelf tab, Help, the landing page).
