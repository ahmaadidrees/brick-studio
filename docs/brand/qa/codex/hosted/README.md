# Independent hosted release verification — 2026-09-15 UTC

Target: staging Worker `https://brick-studio-multiplayer-staging.brick-studio-race-worker.workers.dev`.
Deploying lead reported Worker version `b60d566d` (additive Brickgineers origin policy). These are backend/harness checks,
not certification of a particular frontend build. The root release report must record the final frontend SHA separately.

Ran sequentially under Node 22.23.2 using the existing dedicated QA teacher and newly registered synthetic students.
Fixture credentials were loaded without shell execution and never copied into reports. No existing student/class/world
was used as a mutation target. The tests retain synthetic records with access shut down; they do not delete records.

| Check | Result | Evidence |
| --- | --- | --- |
| `scripts/verify-classroom-provider.mjs` | 11/11, exit 0, cleanup failures 0 | `provider-staging.json`, `.log` |
| `scripts/verify-classroom-live-provider.mjs` | 6/6, zero transport retries, success true | `live-provider-staging.json`, `.log` |
| Separate authoritative cleanup readback | Both new classes closed to enrollment/collaboration; all four synthetic students suspended | `cleanup-readback.json` |

API coverage: class-code registration, private durable world creation, other-student/teacher access denial, concurrent
save winner/conflict, fresh-login document equality, checkpoint restore and stale revision rejection, direct browser-role
database denial, teacher password reset bearer/refresh revocation, forced new password, rename preserving ownership,
and closed enrollment.

Live coverage: two authenticated sockets and stable identities, concurrent edits with authoritative database equality,
password reset revoking active socket and an unexpired ticket, member removal revoking active socket while contributions
remain, class closure revoking remaining socket and shared-world discovery, and reopened class cold-socket equality.

Limits: no rendered-browser interaction, OAuth browser login, Origin/CORS assertions, real students, classroom-NAT load,
physical Chromebook performance, or production traffic tested here. Separate browser/provider/domain verification is
owned by the lead and browser verification lane. Full individual checks and timestamps are in the JSON reports.
