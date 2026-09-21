# Release 2026-09-21 — flows v2 and the owner's follow-ups

Deployed by the Claude lead session with the owner's authorization (manual verification by the owner; fast-follow policy).

| Release | Product commit | Frontend | Worker |
|---|---|---|---|
| Flows v2 (PR #8) | `a032480` | `virtual-legos-il3dvwwrm` | `8633c78e-ff17-4dfb-af65-486f2a4e752c` |
| Follow-up (PR #9) | `9d067ec` | `virtual-legos-dttdd6ces` | unchanged |

Migrations `202609190001_brick_class_sharing.sql` and `202609190002_brick_teacher_edit_alignment.sql` were applied to
the shared Supabase project (ref wfrvgbnmyenidlpmimhl) before the Worker deploy and verified (columns, functions).

## Changes
Real `/join`, `/worlds`, `/class`, `/class/projector` pages; shared header with the account chip, plain world title
with rename, ⋯ "This build" menu, Build|Explore switch; class sharing of personal worlds (look only / build with me,
teacher hide, students-can-share switch, copy); editor command strip, camera and history clusters; username-only
sign-in with roster picker (from the 09-17 release) now on the pages. Follow-up: My class button and class-page
links on `/worlds`, remembered teacher class (`brickgineers.teacher-class.v1`), visible New build (`/build?new=1`),
signed-in fresh builds auto-create an account world on the first brick.

## Verification
`npm run check` at `cb6eba2` / `3aae304`: 122→124 files, 1,246→1,272 frontend tests, 171 worker tests, typechecks,
build. Fable merge-gate review (no authorization holes; all findings fixed). W7 QA: strict matrix 209/209, editor
re-runs 44/44 and 7/7, e2e 22 steps (mocked classroom backend + real guest rooms), schema 3/3, multiplayer 9/9.
Owner walkthrough on a local build against the real database. Production smoke after each deploy.

## Rollback
Frontend: `vercel promote virtual-legos-20s6vv5yh-ahmaadidrees-projects.vercel.app` (pre-flows). Worker:
`wrangler rollback c45477bd-df82-43f3-a0a7-bc0f841bba3b`. Migrations are additive; existing worlds stay private.

# Release 2026-09-21 (third) — classmate invites and the /join brand panel

Product commit `638e226` (PR #11). Frontend `virtual-legos-91jfexooc`. Worker `114ecbd5-07fe-41e0-b9b4-3318c94c8e57`.
Migration `202609210001_brick_world_invites.sql` applied to the shared project before the Worker deploy (constraint now
allows 'members'; authorize/commit RPCs admit listed members). Checks: 124 files / 1,279 frontend tests, 183 worker
tests, typechecks, build. Rollback: frontend `virtual-legos-dttdd6ces`, Worker `8633c78e`; the migration is additive.

## Fourth release — Build together (PR #13, main 80d967c)

One verb, one sheet, same room. Mock: https://claude.ai/artifact/L5VxMHMxqAdf7f7g5AucWt

- Frontend: `virtual-legos-1xymf8s4y` (Ready, production). Rollback: `vercel promote virtual-legos-91jfexooc-ahmaadidrees-projects.vercel.app`.
- Worker: `30d085ab-c546-4bfd-a1c3-720cb8144a1d`. Rollback: `npx wrangler rollback 3f5718b5-0c82-4175-9f45-51164bfdfaf6`.
- No migration. `GET /worlds?presence=1` is additive (per-world `buildingNow` / `buildingNames`, bounded by PRESENCE_ROOM_LIMIT and the per-caller presence rate).
- Verified on production: InviteSheet / WorldsPage chunks carry the new copy; presence route answers 401 unauthenticated.
- Walked on the QA mock before merge: owner invite → `/live/<id>?invited=1`; friend badge + banner + Join and build; editor Build together opens the sheet on an account world and reopens with picks preloaded.

Watch for: students who reach the live room and expect their solo editor (the card's ⋯ menu has "Open alone"); a class-shared room shows "Building with" but no "Waiting for" (no roster for whole-class shares).
