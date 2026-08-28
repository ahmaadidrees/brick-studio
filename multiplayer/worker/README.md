# Brick Studio multiplayer worker

Cloudflare Durable Objects provide two independent room types:

- `RaceRoom` preserves the released, frozen-world `/rooms` race protocol.
- `WorldRoom` provides authoritative collaborative `/worlds` with persisted
  documents, revisions, owner-controlled Build/Explore mode, profiles, poses,
  reconnect replay deduplication, and lock-aware admission.

Both objects use the WebSocket Hibernation API and alarms. There is no server
tick loop. Rooms expire two hours after their last activity.

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
- `GET /worlds/<roomId>/connect?playerId=<id>` upgrades a guest WebSocket.
- Add `&ownerToken=<capability>` to authenticate the owner connection.

The wire contract lives in `@brick-studio/core/protocol`. Accepted
`replaceDocument` broadcasts a `snapshot` carrying its optional `opId`,
allowing reconnect replay to be acknowledged without a second mutation.

Locking prevents new guests from joining. The owner and previously admitted
player ids may reconnect while locked. Owner-only messages are `setMode`,
`setLocked`, and `replaceDocument`. Brick command batches are accepted from
any connected participant only while the room is in Build mode.

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
`brick-studio-multiplayer-staging`, with separate `RaceRoom` and `WorldRoom`
Durable Object namespaces. This branch only configures staging; it does not
deploy it.

Production and preview browser access is restricted to the Brick Studio
Vercel domains. Localhost origins are accepted for development.
