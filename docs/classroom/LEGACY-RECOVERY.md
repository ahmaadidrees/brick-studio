# Legacy published build recovery

Existing `/world#...` links remain readable, including original base64 JSON and gzip v2 snapshots. Their size limits and full document validation remain enforced. The reader has no race creation action.

Remix writes a guest draft only after explicit replacement confirmation when a saved draft exists. Cancel preserves the draft. A storage read failure is treated as a failure, never an empty draft. A failed write leaves the published viewer available. Existing persistence quarantines malformed prior content before overwriting it; valid draft replacement is explicitly disclosed with instructions to export first.

Source retirement boundary: `RaceWorldPage.tsx`, `raceClient.ts`, and the obsolete client tests were removed after the main route and all other importers were removed. New published snapshot encoding was removed; reader tests construct historical-format fixtures independently. The live editor uses race-named avatar/rendering types and styles; these are shared and must remain. `publishedWorlds.ts` must keep its decoder and snapshot validation even after new publishing entry points disappear. Rover source remains in Git and is excluded through application routing rather than destructive removal.

Focused verification: `npx vitest run src/brick/PublishedWorldPage.test.tsx src/brick/publishedWorlds.test.ts` exercises legacy decoding, limits, invalid data, draft confirmation/cancellation, explicit replacement and blocked storage. Browser rendering and actual production legacy URLs remain part of release integration verification.
