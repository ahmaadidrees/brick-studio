# Classroom release checkpoint — 2026-09-09

Goal remains ACTIVE. Production has NOT been promoted. Actual classroom/student/device verification remains outstanding. The bounded ClassChat read-only identity pilot has passed real API/session/PostgreSQL checks in its isolated worktree; it is not a full shared-login rollout.

## Authoritative workspace

Use `/Users/ahmaadidrees/.codex/worktrees/brick-classroom-release`, branch `codex/classroom-release`. Initial implementation commit3d21fa2; legacy cleanup9ddf605. Preserve newer concurrent QA changes. Root desktop task directory is still an older experiment; do not edit that by accident.

## Completed

- Account/class/world backend, guest-safe cloud UI, authenticated live rooms, teacher controls, legacy creation retirement and recovery implemented.
- All three additive migrations actually applied to ClassChat V2 Supabase project wfrvgbnmyenidlpmimhl. NEVER rerun them blindly. MIGRATION-RECEIPT.json records hashes and actual hosted RLS/direct SELECT denial on all11tables.
- Hosted Worker version5203a563-b4c6-4df8-945b-349d1818954f at https://brick-studio-multiplayer-staging.brick-studio-race-worker.workers.dev has configured secrets and passed real HTTP and two-socket PostgreSQL verification. See PROVIDER-STAGING-REPORT.json and LIVE-PROVIDER-STAGING-REPORT.json.
- Revoked JWT cannot directly change password through GoTrue after teacher reset; provider returned403session_not_found.
- Combined check passed636frontendtests+52Workertests+typechecks+build before the subsequent teacher-oversight regression and unused legacy deletion, whose focused tests passed.
- Guest browser building/customparts/reload/export/import/legacyremix verified. Integrated UI QA remains underway in release_qa agent; student signup/cloudsave/reload already passed.

## Access and local services

Supabase CLI and Vercel CLI authenticated. Wrangler authenticated after unavailable keychain storage; CLI uses its normal local config. Credentials are ignored private files; NEVER print their values or commit them. `.classroom-test.local` holds a dedicated QAteacher; Worker `.dev.vars` includes configured actualteacher+QAteacher IDs. Never reset the actualteacher account.

Local Vite5182 process56890 (release_qa), Worker8788 (classroom_backend). Verify live process handles after restart. Frontend `.env.local` points to local8788.

Preview dpl_7VEjiJjuPBKVix8JSvubYahKuTzE (virtual-legos-bekfi4wh8-ahmaadidrees-projects.vercel.app) is an early candidate before the last UI/cleanup edits. Newer tested preview dpl_EDmqQRX7GxC89YcJjaTkBb9F87bj at https://virtual-legos-gyfsc793o-ahmaadidrees-projects.vercel.app is READY and passed hosted teacher login and classroom-world rendering; it precedes the latest cleanup and legacy-owner recovery edits. Preview is Vercel SSO-protected. Authorized `vercel curl` supports automatic protection bypass; root acquired scoped `_vercel_jwt` cookie in `/tmp/brick-preview-headers.local`, private. Do not expose cookie/token in output. Browser automation can use the cookie for owner-authorized verification.

## Remaining critical steps

Finish actual browser teacher/student/cloud/group/reset flows; fix any failures. Build an exact committed final candidate and verify hosted frontend plus backend. Preserve current production until candidate release checks pass, then perform the user-authorized cutover. No additional approval requirement was established in the accepted discussion. Check actualteacher login usability and obtain actualstudent/device observations. Deploy production backend and promote exact frontend artifact with intentional backend identity; retire old anonymous endpoints as part of cutover, not accidentally midway through oldproduction use. Record immutable version/SHA/alias/rollback separately.

ClassChat bounded pilot is committed as1a7848c in /Users/ahmaadidrees/.codex/worktrees/classchat-identity-pilot (codex/classroom-identity-pilot). It proves default-disabled read-only identity projection with14tests and5actual API/session/PostgreSQL checks. It does not establish full student SSO or shared password reset. Original ClassChat checkout and production remain untouched. Cost-model estimates are not device/billing measurements.

## Workers

Eight workers plus root are supported now. Use collaboration.list_agents and resume existing agents with followup_task as needed. Pending_init after restart needs explicit followup, not merely send_message. Owners: classroom_ui app/hook/panel; release_qa browser/client/autosave tests; document_integrity live/store; classroom_backend auth/SQL; security_review providerlive/security; outer_routes outerWorker; legacy_cleanup retiredfrontend; reuse_boundary contracts/verifiers/costreview.

## Latest live findings

Teacher Google sign-in passed actual personal Chrome -> Supabase -> local callback -> My Class, plus authoritative teacher session registration and cold reload (GOOGLE-LOCAL-REPORT.json). Full Google candidate check passed638frontend/59Worker tests plus types/build.

Representative31client staging load FAILED after12/60edits: medianack2.8s andp95~24s with rate-limit disconnects. CAPACITY-STAGING-REPORT.json preserves failure; allfixturesdisabled. Backend and integrity workers are diagnosing permission-check serialization/pose bursts. This is a real release issue, not a target-device proof claim. Do not promote until fixed and rerun. Legacy owner recovery meanwhile passed browser -> survivingDO -> realPG -> coldreload with exactcustomdocument match; QA teacher username/reset/groupremoval controls also passed actualbrowser.
