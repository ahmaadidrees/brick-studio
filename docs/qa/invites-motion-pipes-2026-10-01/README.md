# Production release: invites, motion and pipes

Released on 2026-10-01 with the user's authorization to ship the current feature set and defer heavy QA to manual classroom testing.

## Deploy result

- URL: https://brickgineers.com/2d/build
- Target: production
- Status: READY; the public domain resolves to the deployment below.
- Product commit: `26f0395c9758746a9ccc4254852f0a49d1780671` on `codex/invites-motion-pipes`.
- Framework: React + Vite; prebuilt production output, built with freshly pulled production environment settings.
- Build duration: not captured end to end; build completed successfully.
- Vercel deployment: `dpl_78WPM4JAeMUvutKTaCGpkpGTTaj2`, https://virtual-legos-happvytt1-ahmaadidrees-projects.vercel.app.
- Cloudflare Worker version: `f6e8b083-d629-4fc9-a404-6f87c573e297` at https://brick-studio-multiplayer.brick-studio-race-worker.workers.dev.
- Migration: `202610010001_brick_invitation_state.sql` applied to the live provider before Worker and website cutover. The additive invitation columns/indexes preserve memberships and authorization. Post-migration aggregate inspection found 420 memberships, 420 distinct invite IDs, zero missing required invitation metadata, RLS enabled and zero browser-role table privileges. Counts are a point-in-time observation, not an expected invariant.

## Behavior released

One invitation panel with visible-tab polling and focus/online refresh, persistent recipient acknowledgement, explicit targeted resend, and correct 2D/3D destinations. Paired 2D pipes retain links through saves and room serialization and support deliberate entry, exit, and remote-player presentation. The current cosmetic movement changes remain in this release; generated full-body sprite experiments are separate local artifacts.

The reported People removal/reinvite bug was caused by a durable 2D room ban surviving an explicit invitation. A trusted invitation change now removes only the invited account's ban after checking current classroom membership. Other bans and room building/entry locks remain intact. Reinviting an existing member and removing/re-adding membership both follow this path.

Existing students should save and refresh once: the room protocol is now version 4. Invitation acknowledgement means the join action was tapped; it does not assert that the student entered the room successfully.

## Verification and limits

- Production frontend build and frontend/Worker typechecks passed; Wrangler dry run retained the existing Durable Object migration lineage.
- Focused invite, navigation, editor, serialization, motion and pipe tests passed during implementation. The reinvite regression includes a restored persisted ban, valid targeted reinvite, retained bans for other players, invalid/stale membership denial, and retained room locks.
- Browser smoke: the public 2D editor rendered the Pipe checkbox and Connect pipes controls; no browser console errors were captured for that tab. See `production-pipe-controls.png`.
- Live Worker smoke: a disposable synthetic guest room accepted a protocol-4 WebSocket hello and preserved both linked pipe records in its welcome state. No real classroom account or world was touched. See `pipe-smoke-receipt.json`.
- Vercel error-log scan for this deployment over the previous hour returned no logs. This is a static frontend; that result does not cover Cloudflare runtime errors. Log-drain and external monitoring configuration were not audited.
- Production authenticated removal/reinvite, two-student gameplay, touch devices and full classroom workflows were not manually rehearsed. The user will test those. The successful source regression is not represented as production student-flow proof.

Local testing remains at http://127.0.0.1:5185; see `../../LOCAL-INVITES-MOTION-PIPES.md`. Full-body animation comparison remains at http://127.0.0.1:5186. The new generated walk sheet still repeats the leading limb; it is not recommended for integration yet. The pipe source-selector simplification is a follow-up, not part of this cutover.

## Recovery references

Previous website: `dpl_5H5z4gQ2HiLi173jSXKieome3hwr`, https://virtual-legos-rhef9bji0-ahmaadidrees-projects.vercel.app. Previous Worker: `72650bf3-5ddd-4764-b35c-67cfd1cbb91d`. The additive database columns can remain when rolling back code. Coordinate website and Worker rollback because the room protocol changed; do not roll the Durable Object migration lineage back across v3.

The release archive and private CLI logs are outside the repository at `/Users/ahmaadidrees/.codex/releases/brickgineers-20261001-26f0395`. Production credentials and owner tokens are not included in this evidence directory.
