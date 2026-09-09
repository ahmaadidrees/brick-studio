# Classroom release restart checkpoint — 2026-09-09

Goal remains ACTIVE; release is not yet integrated or hosted-verified. User authorized implementation and aggressive parallel workers, aiming for student testing today.

## Workspace and ownership
Release worktree: /Users/ahmaadidrees/.codex/worktrees/brick-classroom-release
Branch: codex/classroom-release, production base c278ebe. Uncommitted changes are intentional shared agent work; preserve them. Original experiment and production checkout remain separate.

- classroom_backend: completed backend src/classroom index, SQL migration, shared contracts, API.md. 13 tests and worker TypeScript pass. Available for followup.
- document_integrity: completed document integrity/store/persistence and WorldRoom/client protocol edits. 86 integrity tests, 19 room tests, 25 client tests and TypeScript passed in lane. Available for followup.
- classroom_ui: actively integrating BrickStudioApp.tsx, LiveWorldPage.tsx, main.tsx and classroom panel/cloud autosave. See UI-HANDOFF.md when available. Do not overwrite active edits.
- Root owns outer Worker index.ts/routing/tickets, credentials, deployment, full integration validation. Outer routing NOT implemented yet.

## Next implementation
Wire handleClassroomRequest and authenticated cloud world live-ticket routing in Worker index. Backend exports authorizeClassroomWorld, loadClassroomWorld, commitClassroomWorld, listClassroomWorldIds. Consult docs/classroom/API.md and source for exact types. DO init requires classroomWorldId UUID and revision plus original room fields. Trusted x-classroom-access JSON must be stripped from external requests and injected only by authenticated outer Worker. Internal POST /internal/classroom-invalidate closes matching sockets; never expose publicly. Authoritative DB CAS before broadcasting is in DO. Ensure restore ordering, session expiry, revocation and private/cloud save synchronization. Use separate random ticket signing secret; never put long-lived access tokens in WebSocket URLs.

Guest building stays free/accountless. Class-code username/password signup, teacher roster name, durable My Worlds, minimal teacher controls. Shared worlds require accounts. Retire new Publish/Race and Rover main route while preserving existing build recovery and code history.

## Services
Supabase existing ClassChat project wfrvgbnmyenidlpmimhl; credentials read securely from /Users/ahmaadidrees/Desktop/classchat-v2/.env.local. Do not print secrets. Existing teacher Auth UUID f3303fe5-de0d-4f8b-ad27-64b1bab0e4f3 is trusted by config. NEVER reset existing teacher password. Additive brick_* SQL only, no ClassChat data changes. Admin Auth read verified; management PAT access absent. Supabase CLI login needs --agent no --output-format text to avoid JSON interactive error. Migration NOT applied.

Vercel CLI authenticated as ahmaadidrees. Existing virtual-legos project .vercel/project.json in /Users/ahmaadidrees/Documents/Virtual Legos. Copy ignored project link for release. Preview then verify before exact-artifact promotion.

Wrangler OAuth expired. Pending scoped login process session23955 may not survive restart; restart if needed with npx wrangler login --browser=false --use-keyring --scopes account:read user:read workers:write workers_scripts:write workers_routes:write workers_tail:read. Browser selection initialized but OAuth page not opened yet. No deploy or secret setup completed.

No dev server started. npm ci completed. Use browser-verification skill immediately after dev server startup. Full-suite and real Supabase/browser/two-client authorization/persistence proofs remain. Actual student/device proof must be separately reported.

## Codex settings
/Users/ahmaadidrees/.codex/config.toml now has [agents] max_concurrent_threads_per_session = 8, validated with all other parsed settings unchanged and backup made. Current runtime still declares four total slots until config is reloaded. After restart inspect available concurrency; do not assume hot reload. Allocate independent security audit, outer route tests, browser QA, persistence/recovery QA, and reusable-boundary review with explicit ownership, keeping integration sequential where required.
