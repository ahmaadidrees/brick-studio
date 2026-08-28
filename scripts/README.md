# Live World load harness

This uses Node's built-in `fetch` and `WebSocket` APIs; no extra dependency is required.

Run this only against an explicitly supplied local or staging WorldRoom server:

```sh
LIVE_SERVER_URL=http://127.0.0.1:8787 node scripts/live-world-load.mjs
```

The harness creates a disposable small world, connects 30 clients, verifies all
welcomes and 30-player presence, sends three rate-bounded poses per client,
broadcasts one edit, and verifies that client 31 is rejected without displacing
an existing participant. It prints JSON latency, message, byte, and error
counters and closes every socket in a `finally` block.

Optional bounded controls:

```sh
LOAD_POSES_PER_CLIENT=5 LOAD_TIMEOUT_MS=30000 \
  LIVE_SERVER_URL=https://staging-live.example \
  node scripts/live-world-load.mjs
```

Production Virtual Legos origins are refused by default. `ALLOW_PRODUCTION_LOAD=1`
is the only bypass and should be used only after explicit production-load
approval. The harness never reads or stores credentials and does not deploy.

Run its pure safety/option tests with:

```sh
node --test scripts/test-live-world-load.mjs
```
