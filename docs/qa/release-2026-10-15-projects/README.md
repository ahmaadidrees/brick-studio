# Login, saving and My projects release — October 15, 2026

Product commit: `89dcb6a` on `claude/projects-home`, including the previously shipped racing release.

Shipped unified My projects, account/local save status, cross-tab sign-in, project file import/export, and Recently deleted. Fixes: all tabs follow an account switch, requests started under the old identity are invalidated, and pending 2D cloud saves cannot run under a different account. Creation and restoration share the same database advisory lock and 50-active-project limit; restore quota failures return `world_limit`.

## Applied migrations

`202610150001_brick_world_trash.sql` and `202610150002_brick_world_restore_quota.sql` applied together in a transaction through the authenticated Supabase Management API. Before applying, the target's `brick_worlds` lacked deleted_at and its quota trigger was insert-only. Afterward verified column, active-owner index, trigger/function and both migration-history entries. Only these two reviewed migrations were applied, not the repository's entire historical migration set.

Before applying, rehearsed both migrations and quota behavior in one rolled-back database transaction using a synthetic auth user and world fixtures: 50 creations allowed; 51st rejected; deletion frees space; replacement succeeds; restore when full rejected; freeing a slot allows restore; updating an already-active project remains allowed. All rehearsal records and DDL rolled back. `quota-rehearsal.sql` is the body to wrap in BEGIN/ROLLBACK, not a standalone persistent seeding script. This proves sequential SQL behavior, not a simultaneous production race test.

## Deployments

- Worker: `brick-studio-multiplayer`, version `bf95772d-3342-41e0-b528-9203444f70ad`, deployed after migrations.
- Website: `dpl_nrUsrQoxbD28PXaY9Y6jCNBdXcGr`, https://virtual-legos-9mdu5amp9-ahmaadidrees-projects.vercel.app; promoted to https://brickgineers.com.
- Built with production settings using this worktree's independent node_modules. Reverted npm's incidental package-lock peer-flag removals.

## Checks and limits

- Full app suite: 1,631 passing before final 2D account-save guard; after that guard, 24 focused account/recovery tests passed, including two new 2D guard tests.
- Full Worker suite: 241 passing. Worker typecheck and production frontend build passed.
- Public /projects, /build, /2d/build HTML and four main app bundles match local build bytes.
- Browser observed the live guest My projects page, local 3D project card, six platformer/race starters, and New project's 3D/platformer/race choices.
- Immutable deployment URL redirects to Vercel Authentication for unauthenticated HTTP checks. The shell continued to promotion after that failed byte comparison; subsequent public-domain checks verified actual release bytes. Do not treat the protected-page HTTP 200 as app verification.
- No real signed-in browser save/reopen, cross-tab account-switch or delete/restore journey performed in this release. Those remain manual verification; no student accounts or work used.

## Rollback

Previous website: `dpl_BbfBrepMvxWv9uxxfMifJTRHKr3A`.
Previous Worker: `7c4cbb15-ed23-4275-8844-047c762a2b35`.
Roll website back first, then Worker if needed. Keep the additive database changes; do not drop deleted_at or purge deleted project rows as rollback. The old Worker does not hide soft-deleted rows, so a Worker rollback may expose them again until fixed forward. Durable Object classes/tags unchanged.
