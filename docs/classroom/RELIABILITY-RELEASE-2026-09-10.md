# Classroom polish and multiplayer reliability release

Branch: `codex/classroom-polish-today`. This candidate includes the earlier guest collaboration hotfix and the previously prepared UI/performance polish. Deployed and publicly verified at https://virtual-legos.vercel.app. Application source `3e4c886`; frontend `dpl_6EivCt87xvNyiZUy1pP9gx6PrD5g`; immutable https://virtual-legos-3rbja2ec9-ahmaadidrees-projects.vercel.app. Worker remains `68ede359-0bbe-44db-a8d7-5e38a32c567d`. The exact source passed GitHub CI run 34548058052.

## Resulting behavior

- Building alone and guest link-based collaboration remain available without an account. Account worlds and classroom collaboration retain their existing access checks.
- A second tab using the same room identity pauses the first instead of causing a reconnect loop. Explicit rejoin transfers control. Unconfirmed edits with ambiguous operation IDs are preserved as recovery copies instead of silently discarded or replayed against another tab's operation.
- Stalled socket opening/welcome has a deadline. Temporary classroom ticket failures remain retryable; genuine authorization failures remove editing while keeping already-held drafts exportable.
- Unrelated peer edits preserve local Undo/Redo. Any remotely touched brick invalidates its entire overlapping history entry, including groups. Snapshots/rejoining still clear history; this is conservative undo protection, not a general collaborative history engine.
- Remote avatars interpolate toward network positions instead of snapping on each packet. The existing polish isolates avatar subscriptions from editor renders and limits thumbnail generation to visible cards with a bounded cache.
- Account save failures retain the draft and login during temporary token-renewal outages. Reload opens the unsaved draft with saving paused; explicit retry uses its original revision. Newer server saves remain protected from stale recovery.
- Guest-room lifetime, current-draft exports, local-build replacement, pending changes and recovery controls are clearer. Diagnostics are opt-in copied text: bounded in-memory lifecycle/error/count events without names, identifiers, credentials, URLs or world content.
- The prepared signup, teacher management, My Worlds navigation and scene/character customization improvements are included. See `POLISH-2026-09-10.md` for their earlier evidence.

## Verification

- Complete final Node 22 check: 743 frontend tests and 64 Worker tests (807 total), both type checks and the production build passed. A rendering-test readiness race was corrected by waiting for the real subscriptions; deterministic pre-subscription update tests also pass. The original 60-pose/zero-extra-editor-render assertions remain intact.
- Real account browser → failed save → same-tab reload → explicit retry → authoritative PostgreSQL content/revision passed. Independent fresh-browser login and actual UI export matched the database. A second-client revision advance correctly rejected stale recovery while preserving its export. See `SAVE-RECOVERY-2026-09-10.md`.
- Compiled staging frontend: simultaneous UI edits, conservative Undo, exact full-document export comparisons, duplicate-tab pause/manual rejoin, copied diagnostics, and a sustained session with network interruption/recovery. See `MULTIPLAYER-RELIABILITY-QA-2026-09-10.md` for exact duration and proof boundaries.
- Staging backend capacity sample: 32 clients welcomed, presence converged, every client received final peer positions and an owner edit, no unexpected socket/server errors. Welcome p95 was about 500 ms and the shared edit reached all clients in about 147 ms in this sample. The overflow WebSocket did not connect; this transport observation alone does not identify its HTTP rejection reason.
- The capacity harness now reads the protocol's 32-person limit. It verifies final peer positions rather than requiring delivery of every intermediate pose, which the service intentionally coalesces. The old harness's pose-count timeout is retained as a test-assumption failure, not reported as an application fix.
- Rendering measurements on an Apple M5 Max showed roughly 60 fps for sampled 1,000-brick scenes. Explore used over 1,000 draw calls; actual Chromebook performance remains unverified. See `RENDERING-RELIABILITY-2026-09-10.md`.

## Release boundaries

- Frontend release only. No Worker source changes, database migrations, provider configuration changes or real student data edits.
- Guest rooms remain temporary, expiring after about two hours without activity. An invite is not permanent storage.
- Account recovery uses existing tab session storage; live recovery is held in tab memory until exported. Closing the tab/browser or clearing storage is not a durable backup. The UI provides recovery downloads and leave warnings.
- No new scenes, branding changes, infrastructure migration, broad graphics rewrite or expanded teacher feature set.
- Retain the prior frontend deployment for rollback. The current Worker is compatible with the old guest-hotfix frontend; do not roll back to the older pre-classroom backend.

## Hosted cutover verification

The immutable candidate passed anonymous two-browser creation/join, concurrent edits and conservative Undo with exact exported-document equality, duplicate-tab pause/manual rejoin, and cold guest reload against the production Worker. Student login and private-world UI export matched authoritative PostgreSQL; unsigned private-world and classroom summary/socket requests returned401 without documents. No browser page exceptions were reported in the completed hosted flows.

The public alias was promoted and re-inspected to the candidate deployment. A fresh signed-out public browser loaded the studio and the updated guest creation form with temporary-room guidance. Vercel reported no runtime errors in the sampled 15-minute window; that static-frontend log check does not establish Cloudflare health. QA guest rooms were locked and clients disconnected; the dedicated account QA class was closed and its student suspended, retaining evidence worlds.

Rollback: promote the prior frontend `dpl_8VAdrBVKCPdwaLvGymQv8oBaBjDY`; keep the current Worker and data unchanged. Full identities/history are preserved in `PRODUCTION-RELEASE.json`.
