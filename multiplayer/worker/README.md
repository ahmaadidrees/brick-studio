# Brick Studio multiplayer worker

Ephemeral race rooms backed by one Cloudflare Durable Object per room. The room
document is frozen at creation; only player presence, poses, and race state are
synchronized.

## Local development

```sh
npm install
npm run typecheck
npm run dev
```

Create a room:

```sh
curl -X POST http://localhost:8787/rooms \
  -H 'content-type: application/json' \
  -d '{"title":"My course","document":{"bricks":[]}}'
```

Connect to `ws://localhost:8787/rooms/<roomId>/connect?playerId=<id>`. Add the
returned `hostToken` query parameter to the host connection only.

## Client protocol

Client messages:

- `{ "type":"pose", "x":0, "y":1, "z":0, "yaw":0, "moving":true, "jumping":false }`
- `{ "type":"ready", "ready":true }`
- `{ "type":"finish" }`
- Host only: `{ "type":"start", "countdownMs":3000 }`
- Host only: `{ "type":"reset" }`
- Host only: `{ "type":"lock", "locked":true }`

Server messages include `welcome`, `players`, `pose`, `raceStart`, `raceReset`,
`raceFinish`, `locked`, and `error`. Rooms expire two hours after their last
activity. Production browser access is restricted to `virtual-legos.vercel.app`;
localhost origins are accepted for development.

