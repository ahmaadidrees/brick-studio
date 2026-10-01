# World capacity release

Released October 1, 2026 with user authorization. Only capacity limits changed: 2,000 placed bricks and 64 custom designs per 3D world. Custom-design deletion remains deferred. Generated animation experiments were not included.

- Product commit: `c2c24fc7db38dfa661065500989586e64d35dbc3`.
- Production: https://brickgineers.com/build, React/Vite prebuilt output, status READY.
- Vercel deployment: `dpl_DUFupDYZgxAHRHQK93dSqkYzopvG`, https://virtual-legos-emd7hm4gs-ahmaadidrees-projects.vercel.app.
- Worker version: `13806073-2294-4f31-bf30-1b77530d8065`.
- Fresh production settings pulled before build; isolated archive at `/Users/ahmaadidrees/.codex/releases/brickgineers-20261001-c2c24fc`. Build succeeded; duration not captured.
- Worker deployed before frontend. No schema, protocol, database or Durable Object migration changes.

## Focused verification

53 frontend tests passed, including 2,000-brick validation, rejection above capacity, 64-design save/load round trip, rejection of a 65th design, and device budgets. App and Worker typechecks passed. Existing stacked fixture widened to eight columns so it stays below the unchanged height limit at 2,000 bricks.

A disposable production guest room accepted 2,000 bricks and 64 custom designs. Two fresh WebSocket connections returned the exact input document (213,509 bytes). No classroom account or world touched. See `capacity-smoke-receipt.json`.

Public 3D editor displayed “4 / 2000” and captured zero browser console errors; see `production-capacity.png`. Vercel error scan for the prior hour returned no logs. Static frontend logs do not prove Worker runtime behavior. Log-drain configuration and classroom-device performance were not audited. Heavy QA deferred to user manual testing.

Save and refresh to receive the new frontend. Older open clients retain their previous client limit until refreshed.

## Recovery

Previous website: `dpl_78WPM4JAeMUvutKTaCGpkpGTTaj2`. Previous Worker: `f6e8b083-d629-4fc9-a404-6f87c573e297`. Worlds exceeding old limits must be considered before rollback; older validators reject them. No rollback executed.
