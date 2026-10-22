# 3D live rooms: each person picks Build or Explore — October 22, 2026

Branch `claude/3d-per-person-mode`, from the `/micro` release (`b161a0d`). Product commits are `7c8e308` and
`fe47276`.

In 3D live rooms, Build and Explore used to be one setting for the whole room. The owner switched it for everyone,
and the Worker refused edits while the room explored. Now each person switches on their own, like 2D's build and
play:

- **Client:**
  - The client ignores the room's old shared mode (`welcome`, `snapshot` and `modeChanged` still carry it for older
    tabs), and the room always counts as Build.
  - Guests switch with the header switch, `1`/`2`, and "Back to building".
  - Only a person's own Build mode sends edits.
- **Worker:** stops refusing `commands`, `replaceDocument` and `addCustomPart` with `explore_mode`. `setMode` remains,
  owner-only, for older tabs.
- **Presence:**
  - Builders now see explorers' characters (`RemoteAvatars` in the Build scene).
  - A character disappears 5 s after its poses stop, for example when its player goes back to Build or hides the tab
    (`LIVE_POSE_STALE_MS` in `liveRoomConnector.ts`). Explorers send a pose at least every 1.5 s.
- **Not done:** explorers don't see builders. 3D has no build cursors like 2D's.

## Deployments

- **Worker:** `ebf601fb-7afc-48e9-8f08-e2a78db381be`, deployed first. Rollback: `bf95772d-3342-41e0-b528-9203444f70ad`
  (`wrangler rollback`). The Worker code before this change was the same as `bf95772d`'s source.
- **Website preview:** `dpl_ETVXifhgdqqbFjN9ji3nDDvDVkjQ`, checked against the production Worker.
- **Website production:** `dpl_5dbV4541kSdf5sFe6yVjwWiuw9Ax`
  (https://virtual-legos-eyc8647va-ahmaadidrees-projects.vercel.app), aliased to https://brickgineers.com.
  - Deployed once.
  - Same `.vercel/output` layout as the `/micro` release: the app plus `micro/`, with the three extra routes.
- **Website rollback:** `dpl_9wrT2crkzxabakvrDSn3LEE8Wnfx` (the `/micro` release). Rolling back the website alone is
  safe, because older clients work with the new Worker.

## Checks

**Automated:**
- App tests, by file: all pass.
- Full `npm test` runs: 1 to 4 different tests timed out on each run, all at the 5 s test timeout. The failing files
  passed when rerun on their own (88/88 and 73/73).
  - The Mac was heavily loaded at the time: unrelated headless Chromium processes, load average about 51.
  - The 3D scene is mocked in those test files.
- Worker suite: 241 passing.
- `brick-core`, `platformer-core` and Worker typechecks, and the production build (`tsc -b`): passed.
  - The first build caught a leftover `onMode` in a test harness; fixed in `fe47276`.

**Local, with `wrangler dev` and a scripted second and third player:**
- A guest can explore while the owner builds.
- The owner sees a scripted explorer's character in Build. It disappears about 5 s after its poses stop, while still
  connected.
- A scripted builder's brick reaches the owner while the owner explores.

**Production Worker:**
- After an owner socket sent `setMode: explore` (as an older tab would), a guest's `commands` came back `apply`. The
  old Worker answered `explore_mode`.

**Preview against the production Worker:**
- A new shared world shows a scripted explorer's character in the owner's Build view.
- The character disappears after the explorer stops sending poses.
- A scripted guest's brick arrives while the owner explores.

**Production:**
- brickgineers.com serves `index-CBj4bDzz.js`, the same as the local build.
- `/micro/`, `/build`, `/2d/build`, `/class` and the remote `.hex` return 200.

## Not tested

- Two real people on two devices, and classroom (signed-in) rooms. Guest rooms were tested; classroom rooms use the
  same Worker room code with a ticket.
- An older open tab that switches the room after this release. Expected: its own players follow the old switch until
  they reload; new tabs ignore it.
