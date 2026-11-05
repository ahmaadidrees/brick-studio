# Release: wave 2 batch 1 on brickgineers.com, November 4, 2026

Shipped on the owner's word, relayed by the orchestration thread: "Ship without it". The owner chose to ship without
the class-room check after its test teacher login was refused.

This release puts four lanes live:

- rooms M2 ("hack together": per-player rules and building together);
- Parity B (classic bricks as Hackable bricks);
- Blank 2D ("Start from nothing");
- Hackable 3D D1.

It also carries the cross-lane fixes. What was merged, fixed and tested before the release is in
[`docs/qa/wave2-int/README.md`](../wave2-int/README.md).

| | |
|---|---|
| Branch | `claude/wave2-int-d16a14`, pushed. [PR #29](https://github.com/ahmaadidrees/brick-studio/pull/29) into main |
| Product commit | `6b2925ca` (this record is the commit after it) |
| **Worker** `brick-studio-multiplayer` | **`e9d84b4b-c1a4-4305-a5cb-9857585b1631`**, deployed from this branch after `npm run test:worker` (267 passed). **Rollback: `c0b06a58-f37b-4ffb-9b5d-cf8712b744f9`** |
| Worker, staging | `49a6eed8-2828-4b42-b6b4-98417967b105` (the same Worker code) |
| **Website** (Vercel `virtual-legos`) | **`dpl_2TCbqcDjDE4eqKoYMRKQZG4bjSAK`**, Ready, serving `brickgineers.com` and `virtual-legos.vercel.app` (bundle `index-CqIUy9uE.js`). **Rollback: `dpl_AC6ubz7CKB3ZREfBBL1kGPKGNhpE`** |
| Database | **No migrations.** The Blank and 3D kits are stored inside the project document; the shelf's game list is Worker code. |

## How it was deployed

1. **The Worker first.** In `multiplayer/worker`: `npm run test:worker` (14 files, 267 passed), then `npx wrangler
   deploy`. It has the same bindings as before, and no new Durable Object class or migration.
2. **Then the site:**
   - **Release worktree:** `~/.codex/worktrees/hackable-rooms-release`, the previous release's worktree. It has its own
     real `node_modules` from `npm ci`, and the dependencies were unchanged since then. It was detached at `6b2925ca`.
   - **Build:**
     - `vercel pull --yes --environment=production`;
     - load `.vercel/.env.production.local` (the `VITE_CLASSROOM_SERVER_URL`, `VITE_LIVE_SERVER_URL` and
       `VITE_RACE_SERVER_URL` values; not printed);
     - `npm run build`, which runs `tsc -b`. It passes now; it would not have before `fce5b428`.
   - **Output:**
     - `dist` was copied into `.vercel/output/static`;
     - `micro/` and `config.json` came from the previous output, with its 3 `micro` routes;
     - the previous static output was moved aside, not deleted.
   - **Deploy:** `vercel deploy --prebuilt --prod --yes` ran once. As before, it printed only the JSON hint;
     `vercel inspect brickgineers.com` confirmed `dpl_2TCbqcDjDE4eqKoYMRKQZG4bjSAK` as the production deployment, Ready.

## Smoke test on brickgineers.com

The test is `scripts/qa/wave2-prod-smoke.mjs`: guests only, UI only (production has no dev hooks), in headless Chrome
with each person in their own browser context. Every step passed:

| Check | Result |
|---|---|
| The landing page | Platformer and Racing cards, "Start from nothing" (`/2d/hackable-blank?new=1`), and "Start building in 3D" (`/build`) |
| **The Make a game picker:** all seven buttons | Platformer Start → `/2d/build?new=1`; code inside → `/2d/hackable?new=1`. Racing Start → `/2d/build?new=1&kit=race-starter`; code inside → `/2d/hackable-race?new=1`. 3D Start → `/build`; code inside → `/3d/hackable?new=1`. From nothing → `/2d/hackable-blank?new=1`. Each opened its builder. |
| **Room (section 9):** Ana opens a Hackable Platformer → This project → Play together; Ben and Cy join from the link | Joined |
| Ben places a Coin from the drawer | In Ana's Changes: "Ben placed Coin" |
| Ana's Room menu → Let Ben change code; Ben presses Code at once | Code was closed before. **Nothing was sent** (Changes still had 1 item): the RoomBuilder fix, live. |
| Ben switches the Walker's script off in Code | Cy's room bar: "Ben changed Walker's code…" |
| **A game from nothing in a room:** Ana makes Zip (the Blob picture), places it, and plays together; Ben joins; Ana lets Ben code; Ben taps Zip → Player → Walks around | Ana's Changes: "Ben2 changed Zip's code, made Zip the player". This is the new `game` edit, live, accepted by the production Worker. |
| `/3d/hackable` plays | Play, then the arrow keys changed the picture. No Play together in This project. |
| Classic `/2d/build?new=1` | Opens |
| Console errors | None, in all 9 browsers |
| Serving | `/micro/` 200; `virtual-legos.vercel.app` serves the same bundle; the Worker answers (`POST /hackable/rooms` with no body gives its normal 400) |

The rooms were guest rooms on the production Worker. They are forgotten about two hours after everyone leaves.

**About the screenshots** (`shots/`):

- the landing page;
- Ana's room after Ben built;
- Cy's code notice;
- Ben giving Zip a job;
- 3D Play;
- classic `/2d/build`.

`report.json` holds the last run, which was the game-from-nothing section on its own. The first run's helper had the
wrong clicks for drawing Zip; the run above used the same flow as `blank-2d.mjs`. All the other sections passed in the
first run.

## Not tested: class rooms with real sign-ins

The class-room check (wave 2 README, section 6) did not run. The owner's test teacher login
(`.env.classroom-qa.local`, git-ignored) is refused with 401 `invalid_credentials` by both the staging and the
production Worker. Nothing was created.

**What is untested on production as a result:**

- M2's write-behind saving of a class room to the class project, with its retries;
- recovery copies (`GET /classroom/worlds/<id>/hackable-recovery`);
- the owner's studio pausing its own saves in the class room and resuming after;
- roles in a class room with real identities.

The Worker test covers these with the real Durable Object and the classroom fixture. The owner accepted the gap.

**To close it:** with a working teacher login, run `scripts/qa/wave2-classroom.mjs setup`, then `run`, then
`cleanup`, against staging (or production, with the owner's go).

## Rolling back

Roll back the site first, then the Worker:

1. **The site:** `vercel promote dpl_AC6ubz7CKB3ZREfBBL1kGPKGNhpE` (or Instant Rollback in the dashboard).
2. **The Worker:** `npx wrangler rollback c0b06a58-f37b-4ffb-9b5d-cf8712b744f9` in `multiplayer/worker`.

The old site works with the new Worker, so rolling back only the site is safe. The new site needs the new Worker:
otherwise `edit` events are refused, and the studio would keep going back to the room's project.
