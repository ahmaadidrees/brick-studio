# Independent hosted classroom browser evidence

Captured 2026-09-15 01:16 UTC against local candidate UI at `http://127.0.0.1:5215` and the real staging classroom worker. These are actual hosted API interactions, not mocked account responses. No production accounts or student data were changed.

## Verified

- Teacher email/password sign-in in browser and dedicated synthetic class creation/student enrollment (early attempt evidence).
- A nonempty schema-3, 128-stud build imported through the editor and saved through student UI.
- Personal-world Manage opens real checkpoint recovery without requesting unsupported personal membership.
- A fresh browser context signs in, opens, and downloads a document exactly equal to its authoritative Supabase document, revision, and owner.
- Actual teacher roster, class-access, and manage-student screens. Teacher changes the synthetic username and sets a temporary password through UI.
- Temporary sign-in requires choosing a new password. The saved world remains owned by the same student and its document is unchanged after recovery.
- Nine final scoped checks passed. The synthetic student was suspended and its class enrollment/collaboration closed afterward.

## Scope and open finding

The teacher's GET `/classroom/worlds` returned 500 at 24 classes. Root delegated a worker batching fix. `results.json` records the failure alongside the successful scoped checks; this evidence **does not certify that endpoint or release readiness**. The frontend now retains successfully loaded class controls while explicitly showing the world error (commit `fe02a1b`, 73 ClassroomPanel tests passed). Teacher captures can include this genuine error state. Fresh healthy captures should supersede those once the worker fix is deployed to staging.

Earlier attempt reports preserve harness corrections (native option attachment and import confirmation) and the endpoint failure discovery. The first empty synthetic class was explicitly closed by its unique name; all other created synthetic classes are also closed and any synthetic students suspended.

Passwords and class codes are masked in captures. Session material stays in a private mode-0600 file under `/tmp`, outside this repository. No tokens or credentials are included here. Google OAuth and physical Chromebook testing were not exercised.
