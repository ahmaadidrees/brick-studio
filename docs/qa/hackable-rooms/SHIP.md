# Hackable rooms: ready to ship, November 3, 2026

This lane takes rooms M1 (`M1.md`) from "built in the studio" to "a teacher can use it": play together from My
projects, the class page and the invite sheet; host controls; players who drop keep their Hero; presence counts for
every room kind; and the audit's quick fixes. Build-together (M2) is not part of it.

**Branch:** `claude/ship-rooms-868d57`, on top of `claude/hackable-rooms` (M0 + M1) and the parity audit. Committed
locally; nothing pushed or deployed.

## What changed

| Area | Change | Where |
|---|---|---|
| **My projects** | A shared Hackable project of yours: **Play together** opens it in the studio with its room already open (`?together=1`). Open alone stays in ⋯. A classmate's: **Play together** (its class room) and **Look inside** (the studio, look only, with Make my own copy). Chips say "play together" / "N playing now". Invites say "invited you to play", button **Play together**. | `pages/worlds/worldsData.ts` (`liveHref`, `ownRoomHref`, `invitedHref`, `canPlayTogether`), `WorldsPage.tsx`, `WorldCard.tsx`, `InviteBanner.tsx`, `classroom/StudentInvites.tsx` |
| **Class page** | A student's shared Hackable project: **Play together** (the teacher hosts its room) and **Look inside**. Chip "Play together". | `pages/class/WorldOpenButtons.tsx`, `classPageData.ts` (`worldRoomHref`, `worldLookHref`), `StudentsTab.tsx`, `WorldsTab.tsx` |
| **Invite sheet** | For Hackable: "Who do you want to play with?", no look-only switch, "Invite Ben K. and play". Sharing stays `canEdit: false` (classmates play; only the owner changes the project), then the owner is taken into the room like 2D/3D builds. | `classroom/InviteSheet.tsx`, `WorldsPage.tsx` `invite` |
| **Studio** | `?together=1` on the owner's account project opens its room at once and tidies the address. | `routes2d.ts`, `studio/StudioApp.tsx`, `persist/hackableProjects.ts` (`hackableHref.together`) |
| **Host controls** | The room bar's **Room** menu (host only): Remove a player (also one who is reconnecting), Close to new players / Let new players join, Let removed players back in (N). A "Closed to new players" chip for everyone. The hint "Your changes go to everyone" shows only in the studio; on the join page the host sees "Restart starts everyone again" (the stage's Restart, host only, was already there from M1). | `rooms/RoomBar.tsx`, `rooms/session.ts` (`removePlayer`, `setClosed`, `letRemovedBack`, `view.banned`) |
| **Reconnect** | A player whose connection drops keeps their slot and Hero for **30 s** (`RECONNECT_GRACE_MS`). The room lets go of their held keys at once (room events stamped `by` that player, so every game agrees) and sends the `leave` only if they are not back. Coming back with the same identity (browser key in guest rooms, account in class rooms) reuses the player number: no `join`, same Hero, where it stood. Removed or refused players leave at once. The room checks for expired players whenever it hears anything (pings come every 2 s). | `rooms/roomCore.ts` (`away`, `sweep`, `disconnect(sock, gone)`), `protocol.ts` (`PlayerInfo.away`) |
| **Presence** | "N building now" asked only the 3D rooms, so classic 2D and Hackable rooms always counted 0. Each world now asks all three room kinds (`roomPresence`). | `multiplayer/worker/src/classroomRoutes.ts` |
| **Quick fixes** | Help: Hackable Racing and "Playing a Hackable game together"; the "can't be played together yet" line is gone. The shelf's race rule note no longer says Hackable can't race. `/2d/lab` (the first Code Lab) goes to `/2d/hackable`. Stale "no live rooms" comments. | `pages/help/HelpPage.tsx`, `pages/class/ShelfTab.tsx`, `routes2d.ts`, `PlatformerApp.tsx` |
| **Dev demo data** | `/class?demo=everyday` includes a shared Hackable Racing project; `/worlds?demo=hackable` shows Hackable cards. Dev only. | `pages/class/demoData.ts`, `WorldsPage.tsx` |

## How it was checked

- **Unit tests, new or changed:**
  - `rooms/room.test.ts`: a dropped player's Car waits, shows as away, and goes after the grace time; a player who
    drops while holding a key and comes back (a reload, same browser) keeps player 2 and the Hero's spot, moves again,
    and every game's fingerprint agrees with no resyncs; the host removes an away player, who can't come back; a closed
    room turns a newcomer away; Let removed players back in.
  - Worker `hackableRoom.test.ts` (the real Durable Object): a dropped guest's two held keys come up (`by: 2`), the
    players list shows them away, and the host's kick sends the leave and counts one removed.
  - Worker `classroomRoutes.test.ts`: the class count and the per-world presence include 2D and Hackable rooms.
  - Invite sheet, My projects (invite takes the owner to `?together=1`; card buttons), class page buttons, href helpers,
    Help, ShelfTab, `/2d/lab` route.
- **Two browsers' worth of tabs** (local Worker `wrangler dev --local` on 8787, Vite on 5262), a guest room:
  - Host and a guest (owner token hidden, its own browser key). The guest sees no Room menu, no hint.
  - **Reconnect:** the guest held right arrow and their socket was closed. The host saw "Sam · reconnecting", Sam's key
    released and his Hero standing at x = 90. Sam's link reconnected by itself as player 2, Hero still at 90;
    fingerprints identical in both tabs at tick 1620; no resyncs.
  - **Close:** the room info said `closed: true`; the guest saw "Closed to new players".
  - **Remove:** the confirm, then Sam's Hero gone for everyone, `banned: 1`, Sam's bar "The host removed you from this
    room." Let back in + reopen, and Sam rejoined.
  - **Join-page host** (a third tab with the owner token): Room menu and "Restart starts everyone again", no edit hint.
    Its Restart rebuilt every game; three tabs identical at tick 6960, again at 10140; no resyncs.
  - **Grace expiry in the real Worker:** a guest tab re-mounted under a new identity left its old player away; 33 s later
    that player and Hero were gone.
  - No console errors.
- **Full runs:** see "Results" at the end.

Screenshots: `ship/class-page.png`, `ship/my-projects.jpg`, `ship/invite-sheet.jpg`, `ship/room-bar-host-controls.png`.

## Decisions taken here (worth a look)

- **The owner hosts from the studio, classmates from the join page.** After inviting, the owner lands in the studio with
  the room open, so their edits go live. The class page and classmates' cards go to the join page.
- **Hackable sharing is always `canEdit: false`.** Classmates play; only the owner (and the teacher) host. The invite
  sheet has no look-only switch for Hackable.
- **30 s grace,** with keys released at once. A player who drops looks frozen rather than vanishing. If the last
  connected player drops, the room still forgets the game (as in M1).
- **Presence asks three rooms per world.** No registry says which kind a world's room is. Up to `PRESENCE_ROOM_LIMIT`
  (150) worlds now means up to 450 internal fetches per listing, under the paid plan's 1,000 subrequests. Passing each
  world's format to the presence helper would bring it back to one fetch each; not done here.

## What's left

- **The studio has no invite sheet.** "Play together" in the studio opens the class room, but an unshared account
  project's room admits only the owner and the teacher. Classmates are invited from My projects. Adding the sheet to
  the studio's room bar would close that gap.
- **Teacher-started Hackable class worlds** don't exist yet (the class page's "Start a shared world" makes 3D/2D only).
- **Not tried:** real devices, real network lag, Firefox, a deployed Worker, class rooms with real sign-ins (the class
  routes are covered by the Worker tests; the browser check used a guest room).
- From M1, still open: Racing keyframes (~600 KB), per-player blocks, the HUD showing only the first player.
- `scripts/demo/record-lab.mjs` records the old `/2d/lab`, which now redirects.
- **Worktree note:** this worktree resolves `@classroom/identity-contracts` from the main checkout, whose invite
  `format` type lacks `'hackable'`. A local `node_modules/@classroom` link (ignored by git) makes `tsc` see this
  branch's copy.

## Deploy order

1. **Worker first:** `multiplayer/worker`, `wrangler deploy` (staging, then production). It adds the `HackableRoom`
   Durable Object (`HACKABLE_ROOMS`) with migration **`v5`** in `wrangler.jsonc`. It is backward compatible: the
   current site never calls the new routes, and presence only gains counts.
2. **Then the site** (Vercel). The site's Play together links need the Worker's `/hackable/*` routes.
3. After deploying, a smoke test: open a Hackable project's room in two browsers, check the room bar's Room menu, and
   look at "N building now" on the class page while someone is in a 2D or Hackable room.

No database migrations.

## Results

- **App `vitest run`:** 328 files; 3,582 passed, 25 expected to fail, 2 failed outside this lane:
  - `feel/race/carFeel.test.ts` "writes RACE_FEEL.md" opens `new URL(import.meta.url).pathname`, which keeps `%20` and
    fails in any folder whose path has a space (this worktree's does). Not touched here.
  - `CodeEditor.sections.test.tsx` timed out at 60 s while the lockstep run shared the machine; it passes on its own.
- **Worker `npm test`:** 14 files, 263 passed.
- **`tsc`:** clean for the app (`tsconfig.app.json`) and the Worker.
- **`scripts/qa/lockstep/run.mjs --strict-rejoin`:** identical on every tick in Node, Chrome 156 and WebKit 26.5, late
  joiners included (the game itself is unchanged in this lane; the room and the screen side changed).
