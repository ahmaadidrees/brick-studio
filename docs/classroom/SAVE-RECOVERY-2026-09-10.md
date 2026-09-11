# Save and recovery reliability pass — September 10, 2026

This is local candidate evidence. This pass did not deploy or modify accounts, databases, or student worlds.

## Changes

- A temporary connection failure, rate limit, or account-service failure during token renewal keeps the current login and editor attached for retry. A rejected or revoked refresh session still removes account access.
- Opening an account world with a valid unsaved draft from the same tab restores that draft into the editor. Autosave pauses until **Retry save**; the draft keeps its original expected revision, so retrying cannot silently overwrite another device's newer save.
- Editing a recovered draft and downloading recovery uses the latest content. A successful acknowledged save clears recovery. **Reload saved world** explicitly confirms replacing the unsaved draft with the account version.
- A slow resume or reload cannot replace a subsequently opened world. Reload also stops if the student edited while its request was in flight.
- Reading a recovery copy still works when writing optional resume metadata fails because storage is full.
- Revocation keeps pending recovery under its original account/world key; another account cannot open it through the account-world controller.

## Verification

Five new hook regressions were observed failing against the prior implementation before their fixes: recovery document selection, a stale automatic resume, a stale explicit reload, editing during reload, and explicit replacement clearing recovery. The fixed tests pass.

Node 22 validation:

- `npx vitest run src/classroom src/brick/BrickStudioApp.test.tsx src/brick/useBrickStudioDocuments.test.tsx`: 92 tests passed before the final storage-full regression was added.
- `npx vitest run src/classroom/useClassroomWorld.test.tsx`: all 11 tests passed, including the final storage-full case.
- `npx tsc -b --pretty false`: passed.

These tests exercise the real client, hook, store, serialization, and recovery coordination with mocked network responses. They do not certify a hosted browser-to-database flow.

## Remaining proof and policy limits

- Integrated browser QA now passed against the staging API and real PostgreSQL, using a dedicated QA class/account: sign in and open a two-brick Toy Room world; abort its browser save request after choosing Sky Island; verify PostgreSQL remains unchanged; reload the same tab; verify the recovered draft opens with saving paused; explicitly retry; verify the exact two-brick Sky Island document at revision 2. An independent fresh browser signed in, reopened the world, and its actual UI export exactly matched PostgreSQL.
- Conflict recovery also passed: abort a local Brick Valley save, advance the same QA world's remote revision with a Classic scene, reload the original tab, and retry its old revision. The newer server version remained unchanged; the recovery download contained the latest local Brick Valley draft. A screenshot confirmed the visible save-attention and recovery actions. No browser page errors were reported in the completed scenario.
- These are real browser/client/API/database checks with browser-level save-network fault injection; they do not simulate a physical school Wi-Fi failure. Raw fixture credentials and exports remain private under `/tmp`. An initial automation export locator targeted a button instead of the actual menuitem; that incomplete step was corrected and repeated without resetting the already-verified save.
- Recovery uses existing `sessionStorage`. It survives reload in that tab, but closing the tab/browser, clearing site data, or exhausting storage is not durable backup. Download remains the escape hatch when online saving is unavailable.
- A conflict is intentionally not auto-merged. Download the recovered draft or save it as a separate account world, then explicitly load the desired saved version.
- Guest-room lifetime and guest export UX are handled by the separate live-experience lane. This pass changes neither room lifetime nor guest local-save semantics.
