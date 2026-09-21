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
