# Guest Build together restored — September 10, 2026

The user asked to retain account-free, link-based multiplayer while classroom accounts are polished. This is a focused follow-up to the September 9 classroom release. The broader UI/performance pass remains separate on `codex/classroom-polish-today` (98e5cad), not included here.

## Release identity

- Application and Worker source: `00a90ff` on `codex/guest-build-together-hotfix`.
- Frontend: `dpl_8VAdrBVKCPdwaLvGymQv8oBaBjDY`, immutable https://virtual-legos-e1j2m3cin-ahmaadidrees-projects.vercel.app.
- Production Worker: `68ede359-0bbe-44db-a8d7-5e38a32c567d`.
- Staging Worker: `15de2174-9290-43e1-8903-8344db540d12`.
- Previous frontend: `dpl_3heqnPcAsVum67TfYfdqDzc7xDYk`; previous production Worker: `a1c904e1-3709-41f8-a4de-5ac03dc5c3cd`.

## Behavior

Studio → Build together → room name and builder name → Create. The current build is carried into a separate guest room. Account-world saves must flush successfully before navigation. Invite links omit the owner's capability; retain the owner URL to manage the room. Guests join by builder name, without an account. Owners control Build/Explore and close admission to new participants. Existing guests can rejoin a locked room.

Guest rooms retain the existing temporary-room expiry behavior: activity extends their two-hour lifetime, with a short expiry grace period. Export a copy for long-term retention. Account-owned My Worlds and class/group worlds remain durable and require their existing account permissions. The retired race routes and old snapshot-publishing creation were not restored.

The stored room type selects guest versus classroom routing. Guest capabilities cannot authorize classroom records; external internal-access headers are stripped, and classroom summary/socket requests retain their checks. Missing live-room state can still initialize an authorized classroom world from its database record.

## Verification

- Exact-source Node 22 check: 642 frontend tests + 64 Worker tests, all types and production build passed.
- GitHub CI passed: https://github.com/ahmaadidrees/brick-studio/actions/runs/34498619214.
- Staging real two-browser UI: current-build seed, creation, clean invite payload, name-only join, concurrent edits, matching full documents, owner Explore/lock, existing-guest reload/rejoin, and new-guest denial when locked passed.
- Production immutable frontend plus production Worker: unsigned UI creation, second-browser join, owner/guest edits, identical full exported two-brick documents, Explore propagation, and cold-reload/rejoin passed. Both browsers reported no page errors in the sampled flow.
- Unsigned production browser fetches to protected classroom summary, socket, and private-world endpoints returned JSON `401 sign_in_required` with no document.
- Initial direct Python probes received an edge `403/1010`; these were not used as application authorization proof. Browser probes above supply that proof.

No database migrations, destructive data changes, or real student record modifications were made. Actual classroom/Chromebook performance is still unverified.

Public alias promotion was verified: https://virtual-legos.vercel.app resolves to the frontend above, and a fresh unsigned browser opened the guest creation form on `/live/new`.
