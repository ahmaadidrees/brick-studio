# Release 2026-09-17 — merge-gate fixes and pre-class quick wins

Deployed by the Claude lead session (owner authorized while Codex was unavailable).

Product commit: `39c41c2` (main; PR #3 + PR #4).
Frontend: `https://virtual-legos-bzisyf9gq-ahmaadidrees-projects.vercel.app` (Vercel production, aliased to
brickgineers.com and virtual-legos.vercel.app). Worker: version `13d499ef-cfba-452d-91d8-0d10cb494507`
(`brick-studio-multiplayer`).

## Changes
- Merge-gate fixes: Brick Valley keeps its far plane in Build mode; invite classCode consumed from the URL;
  provider password-policy rejections surface as `invalid_password`; Character Studio test assertions restored; docs.
- Pre-class quick wins: projector view for the class code and QR; teachers land on the expanded invite; roomier
  teacher dialog on desktop; `/join` route; signed-in name in the editor header; click on empty space deselects;
  Esc hint on the desktop shortcut line.

## Verification
- `npm run check` at `39c41c2`: 111 files / 1,113 frontend tests, 8 files / 135 worker tests, typechecks, build.
- Worker tests re-run from the release worktree before `wrangler deploy` (135 passed).
- Production smoke: `brickgineers.com/join` redirects to `/build?classroom=join` with the enrollment form open; guest
  header shows "Sign in"; served editor bundle contains the projector, deselect and Esc-hint strings; Worker
  `/classroom/me` answers 401 unauthenticated. No teacher session was exercised in production.

## Rollback
- Frontend: promote `https://virtual-legos-9ji2h3yto-ahmaadidrees-projects.vercel.app` (`47929b9`).
- Worker: `wrangler rollback 01203a37-cf07-4db0-bff8-6aa79351b4c5` (additive change only; safe either way).

# Release 2026-09-17 (second) — username-only sign-in and class roster

Product commit: `4848f44` (main; PR #6). Frontend `https://virtual-legos-20s6vv5yh-ahmaadidrees-projects.vercel.app`
(production alias). Worker version `c45477bd-df82-43f3-a0a7-bc0f841bba3b`.

## Changes
Username + password sign-in without a class code; "I have a class code" reveals the code and a tap-your-name roster
(teacher switch "Show names on the join screen", default on); global unique usernames with `username_taken`
suggestions. Contract shared with Portalblaster (it calls the same Worker endpoints).

## Migration status
`supabase/migrations/202609170001_brick_global_usernames.sql` is **not applied** to the shared project yet (owner
go pending). Verified before deploy: 171 students, 171 distinct usernames, 0 cross-class duplicates. The Worker
tolerates the missing column (names on for every class; a duplicate username would return `class_code_required`).

## Verification
- `npm run check` at `4848f44`: 111 files / 1,124 frontend tests, 8 files / 147 worker tests, typechecks, build.
- Worker tests re-run from the release checkout (147) before `wrangler deploy`.
- Production smoke: `/build?classroom=signin` shows Username, Password, "I have a class code", "Create account";
  Worker `auth/roster` unknown code → 404 `class_not_found`; code-less login with unknown user → 401
  `invalid_credentials`. Note: a malformed code also returns 404 `class_not_found` (contract said 400
  `invalid_input`); Portalblaster maps both to a user message, so left as is.

## Rollback
- Frontend: promote `https://virtual-legos-bzisyf9gq-ahmaadidrees-projects.vercel.app` (`39c41c2`).
- Worker: `wrangler rollback 13d499ef-cfba-452d-91d8-0d10cb494507`. Portalblaster would then need its class code
  again; tell that session first.
