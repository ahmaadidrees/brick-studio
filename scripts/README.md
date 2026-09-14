# Scripts

Everything here runs with the repo's own toolchain — no global installs.

## Running TypeScript scripts

Node runs `.ts` files directly, but two things in this repo need help: `packages/brick-core` uses
extensionless relative imports, and `BrickLayoutIndex` uses a constructor parameter property that
Node's built-in type stripping refuses. `scripts/lib/ts-hooks.mjs` covers both, so any script that
imports brick-core is run as:

```sh
node --import ./scripts/lib/register-ts.mjs scripts/<tool>.ts
```

Node 22.15 or newer. Node 22–25 transform with `module.stripTypeScriptTypes`; Node 26+ ships
strip-only type stripping, so there the hook transforms with rolldown's `transformSync` (rolldown is
Vite 8's bundler, so it is already installed). The `ExperimentalWarning` about
`stripTypeScriptTypes` is expected.

## Performance fixtures (`scripts/perf`)

```sh
node --import ./scripts/lib/register-ts.mjs scripts/perf/generate-fixture.ts
node --import ./scripts/lib/register-ts.mjs scripts/perf/generate-fixture.ts --out /tmp/fixtures --sizes 100,1000
```

Writes `dense-{250,500,1000}` and `mixed-{250,500,1000}.brickstudio.json` to `scripts/perf/fixtures/`
(committed). `dense` is three full layers of 2 × 4 bricks; `mixed` spreads plates with small parts on
top, walls with window/door/arch frames and sloped tops, tall towers, pillars, stairs and loose parts
across the whole plate. Placement is seeded, so re-running reproduces the committed files
byte-for-byte on Node 22 and 26. Every file is read back through `parseBrickStudioDocument` — the
same path as the studio's Import — and the script exits non-zero unless each validates with exactly
the requested brick count. `src/test/perfFixtures.test.ts` re-validates the committed files in CI.
How to use them: docs/PERF-BASELINE.md.

## Brand assets (`scripts/assets`)

```sh
node scripts/assets/build-brand-assets.mjs
```

Regenerates `public/favicon.svg`, the PNG icons (`favicon-32`, `icon-192`, `icon-512`,
`apple-touch-icon`) and the 1200 × 630 `public/og-image.png` link-preview card, plus the card's
vector source `scripts/assets/og-image.svg`. The art is drawn in code in the landing page's
isometric style and contains no text, so a product rename needs no new artwork. Rasterizing uses
`sharp` when it is resolvable from `node_modules` (it arrives with the worker workspace) and
otherwise macOS `qlmanage` + `sips`; if neither exists it writes the SVGs and prints the commands
to run by hand.

## Live World load harness

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

## Classroom verification scripts

`verify-classroom-provider.mjs`, `verify-classroom-live-provider.mjs` and
`verify-classroom-capacity.mjs` exercise a real Supabase-backed deployment with dedicated test
identities; `classroom/capacity-fixture.ts` is the brick layout they place. They require the
`CLASSROOM_TEST_*` variables named at the top of each file and are documented by the reports in
`docs/classroom/`.
