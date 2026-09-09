# Bounded identity and classroom reuse

The first reusable boundary is provider identity plus explicit product membership.
The dependency-free `packages/classroom-contracts` fixture projects the current
Brick and ClassChat models into a common access summary. It contains no credentials,
network requests, enrollment, password reset, or database writes. An isolated
ClassChat consumer now imports a source copy of this contract and has passed real
cookie/API/Postgres verification. Neither production deployment imports it yet.
This proves bounded identity reuse, not shared enrollment or password recovery.

## Current sources inspected

- Brick: `src/classroom/contracts.ts`, `multiplayer/worker/src/classroom/index.ts`,
  and `supabase/migrations/202609090001_brick_classroom.sql`.
- ClassChat (read-only checkout): `src/lib/auth/session.ts`,
  `src/app/api/chat/route.ts`, and
  `supabase/migrations/202603080001_init_classchat_v2.sql`.
- ClassChat `AGENTS.md` and `NOTEPAD.md` require preserving verified-provider auth
  followed by explicit server-side product ownership checks.

## What can be reused

Use the provider issuer plus immutable Auth UUID as identity. Usernames, names,
codes, and email addresses are labels or login inputs, never account-link keys.
Product class IDs remain separate until an explicit mapping is introduced. A
matching Auth UUID does not create membership or grant teacher status elsewhere.

Brick is class-bound and uses a session allowlist/auth version. ClassChat has
teacher approval, independent membership suspension/reset flags, student lockout,
and chat/thread/bot permissions. Those remain product policy. The adapter's
`canParticipate` is only a coarse class gate, never complete permission to edit a
world or send a chat message. Call each product's authoritative operation-specific
authorization after provider and session verification.

Passwords belong to the provider. A future shared account means a password change
affects all products using that identity. Before adding shared student enrollment,
both products must enforce a common reset/revocation policy; otherwise a teacher
reset in one product could leave an old session usable in another. Do not equate
Brick's reset flag with ClassChat's membership flag without implementing that rule.

## Completed bounded ClassChat consumer pilot

Authoritative pilot inspected at commit
`1a7848c61f5b443630303f1aaf6b6bd29c887b18`, branch
`codex/classroom-identity-pilot`, base `7861a83`. Worktree:
`/Users/ahmaadidrees/.codex/worktrees/classchat-identity-pilot`.
The original ClassChat checkout and production deployment were not changed.

The consumer is `src/app/api/classroom-identity/route.ts` in that worktree.
`GET /api/classroom-identity?classId=<uuid>` is disabled unless
`CLASSROOM_IDENTITY_PILOT=true`. It uses ClassChat's existing verified cookie session
and explicit profile approval, class ownership and membership reads. It returns
only a coarse access projection. It never enrolls or approves users automatically,
never replaces operation-specific chat permissions, and does not accept Brick
membership as ClassChat permission. The dependency-free contract is copied into
`src/lib/classroom/identity-contract.ts`; it has not been published as a package.

Evidence artifacts in the pilot worktree:

- `classroom-identity-proof.json`: real provider/API/Postgres results recorded
  September 9, 2026 at16:15:34UTC.
- `tools/verify-classroom-identity.mjs`: exact dedicated-fixture verifier; requires
  explicit fixture authorization and refuses to overwrite an existing profile.
- `docs/architecture/classroom-identity-pilot.md`: implementation/proof boundaries.
- `tests/classroom-identity.test.ts`: local policy contract tests. The complete
  ClassChat local suite passed14 tests; Next route generation and TypeScript passed.

Real verification first denied the shared-provider QA identity without a ClassChat
profile (401). Explicit setup of a new QA-only approved profile and owned class
then produced a200 projection matching authoritative Postgres ownership. A guessed
unrelated class returned404. Suspending the QA approval returned403 with the same
provider session. These are actual authenticated HTTP cookie/API/database checks,
not mocked endpoint responses.

Fixture manifest: Auth UUID `9f0c5437-6f61-4206-99c7-cadaa206e1d3`; new ClassChat class
`6526c9c7-fc51-44a9-8554-215b93d1f5b3`. The recorded cleanup suspended the QA teacher
profile and closed the class with enrollment disabled. No existing teacher or
student records were modified. This is the recorded run state, not a claim that
provider state was queried again during this documentation update.

## Limits and subsequent adoption work

The guest endpoint was checked in an actual browser; screenshot:
`/tmp/classchat-identity-pilot-guest.png`. The positive path used real HTTP cookies,
not a positive browser UI journey. The pilot is not deployed and its feature flag
remains off by default. It establishes a real bounded consumer beyond the original
fixture, while preserving product-specific permissions.

Shared student provisioning, synchronized class membership and cross-product
password/session revocation are not delivered by this read-only pilot. Before
adopting shared student accounts, test a dedicated student across both products:
login/cold refresh, suspension/reset, old bearer and refresh replay, class closure,
and existing ClassChat thread/bot rules. Require actual browser/API/database proof
before claiming shared account recovery. A production consumer should import one
versioned contract rather than maintain independent source copies.

## Local contract verification

`npx vitest run packages/classroom-contracts/src/index.test.ts`

This fixture deliberately has no runtime import into the shipping app, avoiding
an unneeded account-model migration on the critical path to student testing.
