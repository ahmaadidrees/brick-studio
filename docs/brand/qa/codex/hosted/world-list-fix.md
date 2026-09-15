# Teacher world-list release blocker

Browser verification found a real staging failure for the dedicated QA teacher: sign-in and `/classroom/classes`
succeeded, but `/classroom/worlds` returned HTTP 500 `internal_error`. The teacher had 24 fixture classes.
The old implementation loaded every class enrollment code through `service.me`, then fetched worlds separately for
every class. With authentication and fixed queries, this exceeded 50 provider subrequests in one Worker invocation.

The fix is limited to `multiplayer/worker/src/classroom/index.ts` and adds regression coverage in
`multiplayer/worker/test/classroomLists.test.ts`:

- `classesFor` scopes classes to the authenticated teacher ID or enrolled student class ID.
- `me` batches enrollment-code reads only for authorized teacher classes; students receive no enrollment codes.
- `listWorlds` loads personal worlds with an owner filter, then shared worlds for authorized class IDs without loading
  enrollment codes. Closed classes remain invisible to students; group membership remains required for students.
- Class IDs are batched in groups of 50 to bound URL length. Internal provider-page reads avoid losing worlds at the
  default 1,000-row response limit. No public API or schema changes.

Regression checks: 60 classes require three data reads for `me` and four for `listWorlds` (plus authentication).
Tests cover foreign classes/private-owner exclusion, student assigned groups, closed collaboration, enrollment-code
privacy, and the 1,000-row boundary.

2026-09-15 UTC local verification: focused 27/27 tests passed; full Worker suite 8 files / 126 tests passed;
Worker and Worker-test TypeScript checks passed; `git diff --check` passed. Root owns deployment and final source SHA.
Hosted post-deployment readback is recorded separately once the root deploys the fix to staging.

## Hosted confirmation

Root deployed staging Worker `01b230d6-11c1-4a9b-a0ab-3b7828db83e9` from `dfe3496`.
At 2026-09-15T01:19:57Z, the same dedicated teacher had 24 classes and 18 accessible worlds.
Teacher login returned 200 (639 ms), classes returned 200 (216 ms), and worlds returned 200 (168 ms).
World IDs exactly matched authoritative owner/class-scoped Supabase rows. A known synthetic student's personal world
returned 404 to the teacher. All requests carried Origin https://brickgineers.com and received matching CORS.
The verification teacher session was logged out. No new classes or old fixture access changes were needed.
See `world-list-staging-recheck.json` for structured evidence. A Python urllib attempt was rejected before usable JSON;
the successful proof used the same Node22 fetch transport as the established hosted harnesses.
