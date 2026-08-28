# Brick Studio multiplayer worker

Cloudflare Durable Objects provide two independent room types plus a creation
limiter:

- `RaceRoom` preserves the released, frozen-world `/rooms` race protocol.
- `WorldRoom` provides authoritative collaborative `/worlds` with persisted
  documents, revisions, owner-controlled Build/Explore mode, profiles, poses,
  reconnect replay deduplication, and lock-aware admission.
- `WorldCreationLimiter` caps `/worlds` creation at 60 attempts per Cloudflare
  connecting IP per hour. A shared classroom egress IP can still create a full
  class set of worlds; excess requests receive JSON `429` plus `Retry-After`.

Both room objects use the WebSocket Hibernation API and alarms. There is no
server tick loop. World rooms expire two hours after their last activity, with
a bounded 90-second deletion grace covering the at-most-60-second expiry
persistence interval.

## Local checks

```sh
npm install
npm test
npm run typecheck
npm run dry-run
npx wrangler deploy --dry-run --env staging
```

Worker tests run in Cloudflare's Workers runtime through
`@cloudflare/vitest-plugin`. WebSocket tests use one non-isolated worker, as
required by the plugin, and cover live Durable Object storage and hibernation.

## Live World HTTP API

Create a validated world:

```sh
curl -X POST http://localhost:8787/worlds \
  -H 'content-type: application/json' \
  -d '{
    "title":"My shared world",
    "document":{
      "schemaVersion":2,
      "partLibraryVersion":1,
      "environmentId":"classic",
      "customParts":[],
      "bricks":[]
    },
    "profile":{"displayName":"Teacher"}
  }'
```

The response is `{ "roomId", "ownerToken" }`. The Worker stores only the
SHA-256 verifier for the owner capability.

- `GET /worlds/<roomId>` returns the canonical public snapshot.
- `GET /worlds/<roomId>/connect?playerId=<id>` upgrades a new guest WebSocket.
- Add `&ownerToken=<capability>` to authenticate the owner connection.
- A new guest receives `welcome.reconnectToken` once. Persist it for that room
  and player id, then add `&reconnectToken=<capability>` on every reconnect.
  Only a SHA-256 verifier is stored; the token never enters player broadcasts.

The wire contract lives in `@brick-studio/core/protocol`. Accepted
`replaceDocument` broadcasts a `snapshot` carrying its optional `opId`,
allowing reconnect replay to be acknowledged without a second mutation.
`welcome.operationHighWater`, when present, is a decimal string the client must
use as the floor for its next per-player operation sequence. The durable
high-water prevents old operations from mutating after detailed outcomes age
out of the bounded replay cache.

Locking prevents new guests from joining. The owner and previously admitted
participants with a valid reconnect capability may reconnect while locked.
Owner-only messages are `setMode`,
`setLocked`, and `replaceDocument`. Brick command batches are accepted from
any connected participant only while the room is in Build mode. `move`,
`rotate`, and `recolor` update only their named fields on the current
authoritative brick; `update` is the explicit full-brick replacement command.

## Race API compatibility

Create a frozen race room:

```sh
curl -X POST http://localhost:8787/rooms \
  -H 'content-type: application/json' \
  -d '{"title":"My course","document":{"bricks":[]}}'
```

Connect to `ws://localhost:8787/rooms/<roomId>/connect?playerId=<id>`. Add the
returned `hostToken` query parameter to the host connection only.

Race messages remain `pose`, `ready`, `finish`, and host-only `start`,
`reset`, and `lock`. Server messages remain `welcome`, `players`, `pose`,
`raceStart`, `raceReset`, `raceFinish`, `locked`, and `error`.

## Staging

Wrangler environment `staging` uses the distinct script name
`brick-studio-multiplayer-staging`, with separate `RaceRoom`, `WorldRoom`, and
`WorldCreationLimiter` Durable Object namespaces. This branch only configures
staging; it does not deploy it.

Production and preview browser access is restricted to the Brick Studio
Vercel domains. Localhost origins are accepted for development.
