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
