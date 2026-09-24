# Supervised 2D classroom pilot — live 2026-09-24

Student entry: https://brickgineers.com/2d

The user explicitly prioritized immediate supervised student use, accepted possible work loss, and chose to defer broad verification and the larger preservation redesign. They separately approved the one-time v4 backend update after being informed that a normal backend rollback to v3 would no longer be possible.

## Release identity

- Source commit: `e3a2e296f01319a416800b583000c7607f0d6f19`.
- Source branch: `codex/2d-characters`, pushed to origin. **Main was not merged; integrate this branch before a future main-based production deployment so the 2D pilot is not accidentally replaced.**
- Vercel deployment: `dpl_EtQvYpBJPjbxJKYRjko6JCPWeJci`.
- Immutable site: https://virtual-legos-7bebwsbj8-ahmaadidrees-projects.vercel.app
- Verified `brickgineers.com` points to that READY deployment after promotion.
- Production Worker: `brick-studio-multiplayer`, version `6b985610-ef51-4f4f-b3b4-78211ffb393c`.
- Verified backend migration `v4`; exported classes include PlatformerRoom, RaceRoom, WorldRoom and WorldCreationLimiter.

The site was built with the existing production project settings and production Worker URLs in an isolated temporary release export. Original worktree environment/configuration files were not edited. Backend was deployed before the website was promoted. No database schema migration was performed.

## Final pilot changes

Three GPT-6 Luna workers handled separate files: upright walking, bounded connection recovery, and persistent-world sharing. Lead reviewed/integrated and deployed.

- WALK hips are higher, stride/foot lift/bob smaller; RUN settings remain unchanged.
- 10-second watchdog covers stalled ticket requests, incomplete handshakes and silent joined sockets. Generation checks fence stale callbacks; full/rate errors retry, permanent refusal closes. Timer cleanup prevents duplicate retries.
- People on an already-shared saved world opens that same persistent room after flushing saves. A private student-owned world opens the existing explicit sharing sheet; it no longer silently creates a guest copy. Unsaved/guest worlds retain guest rooms.
- 2D background music defaults **off**, sound effects default **on**. Explicit saved music preferences remain respected; rooms continue to start without music.

## Focused evidence

- 17 focused tests passed across walking, connection recovery and GameScreen save/sharing behavior.
- TypeScript and production build passed. A missing typed test-fixture field caught by the first build was corrected before release.
- Worker dry-run and actual production deployment succeeded.
- Visually inspected the upright walk in the local comparison.
- Live browser: Workshop Run loaded; menu offered “Turn sound off” and “Turn music on”, confirming effects enabled and music disabled.
- Live browser: created a synthetic guest room, joined and observed “Shared world” / “People, 1 here”. Renamed it to “Pilot smoke check”; reloaded, saw the persisted new title, and rejoined successfully.
- No Brickgineers browser errors were observed in that smoke check. One earlier Vercel-login FedCM error belonged to the protected immutable preview login page, not the live app.
- No real student data was modified. The synthetic guest room can expire normally.

Broad suites, real-account classroom save/re-entry, two-student staging, Chromebook/poor-Wi-Fi load rehearsal, and physical-device tests were deliberately not repeated for this accelerated release. The larger unacknowledged-edit preservation gap, dedicated wake handling and artwork payload optimization remain follow-up work. This is a supervised pilot, not a completed classroom reliability certification.

## Website rollback

Previous live deployment: `dpl_3ZKW4cb7fs7hMJo4DLG5oJRwGmR3`, https://virtual-legos-ld74zcg27-ahmaadidrees-projects.vercel.app

```sh
vercel rollback https://virtual-legos-ld74zcg27-ahmaadidrees-projects.vercel.app --scope ahmaadidrees-projects
```

Then inspect `https://brickgineers.com` and confirm the previous deployment is live. Website rollback removes the new 2D entry points; it does not reverse backend state or recover unsaved work.

Previous backend version: `ac8b8696-9336-4d9a-951c-a4f9678b269b`, migration `v3`. **Do not attempt a normal rollback across v4.** Any corrective backend deploy must retain PlatformerRoom, its binding and the applied migration history. [Cloudflare rollback limitations](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).

Local evidence: `test-results/pilot-build.log`, `test-results/vercel-pilot-build.log`, `test-results/pilot-worker-deploy.log`; release upload/promotion logs in `/tmp/brickgineers-pilot-deploy-final.log` and `/tmp/brickgineers-pilot-promote.log`.
