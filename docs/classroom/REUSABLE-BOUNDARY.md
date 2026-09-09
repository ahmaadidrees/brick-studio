# Bounded identity and classroom reuse

The first reusable boundary is provider identity plus explicit product membership.
The dependency-free `packages/classroom-contracts` fixture projects the current
Brick and ClassChat models into a common access summary. It contains no credentials,
network requests, enrollment, password reset, or database writes. Neither product
imports it in production yet. Its tests prove adapter behavior, not an integrated
login experience or live membership synchronization.

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

## Next real pilot after Brick is stable

1. Use a dedicated synthetic student and teacher-owned test class, never migrate
   an existing classroom for proof. Record the exact candidate SHAs and provider.
2. Add a server-only ClassChat adapter in an isolated ClassChat branch. Resolve the
   verified provider user, then existing ClassChat profile/membership. No implicit
   teacher approval or auto-enrollment based on Brick membership.
3. Normalize both products' authoritative results using this contract, compare
   immutable user ID/provider, and retain separate class IDs and access decisions.
4. Verify approved teacher versus pending teacher, unrelated student, suspended
   membership, locked account, forced reset, closed class, and cross-class guessed
   identifiers. Confirm ClassChat thread/bot rules still run after the common gate.
5. Browser login in each product, cold refresh, sign-out, then provider password
   reset and old-session replay. Verify revocation on both products before claiming
   shared account recovery. No copy of bearer tokens into URLs or local fixtures.
6. Only then wire a feature-flagged ClassChat consumer and record actual DB/API/
   browser evidence. This is the outstanding bounded integration proof in the goal;
   running the fixture alone does not finish it.

## Local contract verification

`npx vitest run packages/classroom-contracts/src/index.test.ts`

This fixture deliberately has no runtime import into the shipping app, avoiding
an unneeded account-model migration on the critical path to student testing.
