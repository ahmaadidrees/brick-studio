# Live World protocol contract

This contract is the shared boundary for the browser client and Cloudflare `WorldRoom`. The existing `RaceRoom` protocol remains frozen.

## Compatibility

- Document schema v2 adds `environmentId` and `customParts` to v1.
- Readers accept schema v1 forever and normalize it to v2 with `environmentId: "classic"` and `customParts: []`.
- `partLibraryVersion` values from `1` through the current version are accepted. Unknown future versions are rejected.
- The wire protocol is versioned independently from the document schema.

The executable types, limits, and validation rules live in `packages/brick-core`. It has zero runtime dependencies and is typechecked without DOM libraries.

## Authority and identity

- Room links use an unguessable room id. Accounts are not required for the classroom pilot.
- Room creation returns a separate owner capability. Guest links never contain that capability.
- Only the owner may change Build/Explore mode, lock the room, replace the complete document, or end the room.
- Any connected participant may edit while the authoritative room mode is Build. No edits are accepted during Explore.
- Profiles are guest metadata. The worker validates their size and character set but does not hardcode character catalog membership.

## Edit ordering

- The server validates each command batch against its current authoritative document.
- There is no `baseRevision` compare-and-swap and no per-field `before` precondition.
- Valid commands apply in server arrival order. Same-property edits therefore converge last-writer-wins.
- Structural conflicts, including overlap or editing a deleted brick, reject with the canonical document.
- Every batch carries `opId = clientId#sequence`. The server deduplicates reconnect/replay attempts per client.
- Accepted batches increment the room revision. Revisions detect missed broadcasts; a gap causes a snapshot resync.

## Message budgets

- `commands`: at most 64 KiB serialized, at most 500 commands, and at most one command per brick id. The batch is atomic.
- `replaceDocument`: owner-only, at most 800,000 bytes and 250 bricks, fully validated before replacement.
- `pose`: at most 2 KiB. Stationary clients send only a slow heartbeat.
- Oversize or malformed frames receive typed errors and never partially apply.

## Persistence and lifecycle

- Durable Object storage contains the canonical document, revision, room mode, owner-token verifier, profiles, and expiry.
- The room remains message-driven and uses the WebSocket Hibernation API. It must not run a server tick loop.
- The pilot provides an explicit persistence exit: the owner can publish the current room through the existing share-link format, and any participant can remix that published snapshot.

## Release gates

1. Worker tests and CI pass against a staging Durable Object namespace.
2. Two real browsers co-build, reconnect, resync, and follow owner mode changes.
3. Thirty synthetic clients pass the load budget; client 31 is rejected cleanly.
4. A real Chromebook-heavy classroom session validates the production behavior.
