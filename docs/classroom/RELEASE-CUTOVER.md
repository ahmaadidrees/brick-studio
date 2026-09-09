# Classroom release — deployed September 9, 2026

The public release is live at **https://virtual-legos.vercel.app**. `PRODUCTION-RELEASE.json` records the exact identities and proof boundaries.

## Current release

- Application source: **49821fa**, branch `codex/classroom-release`, pushed to GitHub.
- Frontend deployment: **dpl_Fuz3vcfibrTWT5hubY5QYkGA3SW6**.
- Immutable frontend: https://virtual-legos-g6gwe9kda-ahmaadidrees-projects.vercel.app.
- Production Worker: **a1c904e1-3709-41f8-a4de-5ac03dc5c3cd** at https://brick-studio-multiplayer.brick-studio-race-worker.workers.dev.
- Public alias was re-inspected after promotion and resolves to that frontend.
- Public Google teacher sign-in passed and preserved the existing eight-brick guest draft.
- Production provider checks passed11/11; live checks passed6/6. Independent two-browser editing, PostgreSQL persistence, cold reload and group removal passed on the same immutable artifact.
- The classroom-sized staging test passed31 clients and60 durable edits, with all clients converged. This is not actual Chromebook/student evidence.

The two public backend variables are persisted in Vercel: production targets the production Worker; preview targets staging. The promoted artifact was also built with explicit matching values. Production has a distinct ticket-signing secret.

## Prior release and recovery

Previous frontend: **dpl_Hndb9jJ7XS6GnZmfG1HJk2LWiX8S**, https://virtual-legos-qd9i5i2fm-ahmaadidrees-projects.vercel.app. Previous Worker: **f4d8fab8-8441-4e84-95f1-dff34548bbfd**. Original source: **c278ebe**, also preserved in the pushed `codex/rover-lab-archive` branch.

Prefer a forward fix for classroom issues. The old Worker serves anonymous multiplayer and does not enforce the new classroom model; do not blindly restore it while assuming new classroom rooms remain protected. Any rollback must explicitly address both frontend/backend compatibility and the access policy for new classroom rooms. Preserve PostgreSQL saves, additive migrations and Durable Object namespaces; never delete them as part of rollback.

## Remaining acceptance

Actual student and school-device observations remain required. Use `TEACHER-PILOT.md`. The goal stays active until that feedback and any resulting required fixes are handled. One earlier automated production group-close observation timed out; an unchanged-source rerun and independent browser removal both passed. Keep that observation with the test-runner transport limitations rather than claiming an application fix that was not made.
