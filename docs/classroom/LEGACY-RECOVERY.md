# Legacy published build recovery

Existing `/world#...` links remain readable, including original base64 JSON and gzip v2 snapshots. Their size limits and full document validation remain enforced. The reader has no race creation action.

Remix writes a guest draft only after explicit replacement confirmation when a saved draft exists. Cancel preserves the draft. A storage read failure is treated as a failure, never an empty draft. A failed write leaves the published viewer available. Existing persistence quarantines malformed prior content before overwriting it; valid draft replacement is explicitly disclosed with instructions to export first.

Source retirement boundary: `RaceWorldPage.tsx`, `raceClient.ts`, and the obsolete client tests were removed after the main route and all other importers were removed. New published snapshot encoding was removed; reader tests construct historical-format fixtures independently. The live editor uses race-named avatar/rendering types and styles; these are shared and must remain. `publishedWorlds.ts` must keep its decoder and snapshot validation even after new publishing entry points disappear. Rover source remains in Git and is excluded through application routing rather than destructive removal.

Focused verification: `npx vitest run src/brick/PublishedWorldPage.test.tsx src/brick/publishedWorlds.test.ts` exercises legacy decoding, limits, invalid data, draft confirmation/cancellation, explicit replacement and blocked storage. Browser rendering and actual production legacy URLs remain part of release integration verification.

## Older live owner links

An existing `/live/<32-hex-room-id>#owner=<owner-token>` link can recover a **private copy** into an authenticated account when its old room record still survives. Open the original owner link, sign in (and complete a required password change), then choose **Save older world to My Worlds** when the recovery screen appears. The editor opens the imported personal world after the save succeeds. Recovery does not restart anonymous collaboration or preserve the old group membership. Invitees without the owner capability cannot import the room.

The Worker accepts `POST /classroom/legacy-worlds/:roomId/import` with a valid account bearer token and JSON `{ "ownerToken": "<64 lowercase hex characters>" }`. It applies a per-account limit of 10 attempts per 60 seconds, verifies the owner capability against the surviving legacy Durable Object, and creates a personal cloud world through the normal authenticated creation path (including document validation and world quota). The internal export route is not publicly exposed. Wrong credentials, deleted records and classroom records cannot be exported through this path. Repeating a successful request creates another personal copy; it is not an idempotent migration.

**Expiration is a real recovery limit.** Legacy live rooms used a two-hour lifetime renewed by activity, with a 90-second deletion grace. Once the expiration alarm deletes the record, an owner link cannot reconstruct it. This importer can only copy records that still exist; it does not restore deleted rooms, old race-room state, or make expired room recovery reliable. An encoded `/world#...` link contains its own snapshot and is independent of this legacy live-room lifetime. A previously exported project file remains another recovery source. New account worlds use durable cloud storage instead of the legacy room TTL.

The import implementation and UI were inspected in `classroomRoutes.ts`, `worldRoom.ts`, and `LiveWorldPage.tsx`. This documentation alone is not browser or hosted proof; record any legacy-import browser/provider result in the release acceptance record when that exercise completes.
