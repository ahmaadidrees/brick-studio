# Multiplayer Spike — Local-First Command Sync

Two browser tabs co-building the same Brick Studio plate through a tiny local
relay, with **zero cloud dependencies**. This document is the protocol design,
the demo script, and the productionization path.

**Status: experiment.** The feature is opt-in via a `?room=CODE` URL parameter
and is completely inert without it: no socket is constructed, no store
subscription changes behavior, no UI is added, and the entire existing test
suite runs unchanged (`npm test`, 164 tests, no relay running).

## What was built

| Piece | Where | What it does |
| --- | --- | --- |
| Relay server | `experiments/multiplayer/server/` | Node + `ws` (its only dependency). Rooms keyed by code, authoritative brick document per room, command validation, snapshot on join, rebroadcast of accepted batches. `npm start` / `npm test` (Node's built-in test runner). |
| Client sync module | `src/brick/multiplayerSync.ts` | Opt-in via `?room=CODE`. Derives commands by diffing the store's `bricks` array, applies remote commands via `store.setState` behind an echo guard, reconnects with backoff, exposes a status hook. |
| Room badge | `src/brick/BrickStudioApp.tsx` (`MultiplayerBadge`) | Small status pill (room code, connection, builder count). Mounts only when a room is active. |
| Autosave guard | `src/brick/useBrickStudioDocuments.ts` | While a room is active, localStorage autosave is suspended so the shared build never overwrites a kid's saved solo project. |
| Tests | `src/brick/multiplayerSync.test.ts` (vitest, fake socket) and `experiments/multiplayer/server/test.mjs` (node:test, real sockets) | 18 client tests + 7 relay end-to-end tests. |

## Demo (exact steps)

```bash
# Terminal 1 — the relay (installs only `ws`)
cd experiments/multiplayer/server
npm install
npm start           # -> Brick Studio relay listening on ws://localhost:8787

# Terminal 2 — the app, from the repo root
npm run dev         # -> http://localhost:5173
```

1. Open **tab 1** at `http://localhost:5173/?room=ABC`. The badge under the
   header shows `Room ABC — Just you so far`. If you already had a saved solo
   build, it seeds the empty room ("Your build is now shared in room ABC").
2. Open **tab 2** at the same URL `http://localhost:5173/?room=ABC`. Both tabs
   show `2 builders together`, and tab 2 receives the room snapshot.
3. Place, move, rotate, recolor, and delete bricks in either tab — the other
   tab follows in real time. Undo/redo and paste also propagate (they are just
   more brick diffs).
4. Try a conflict: have both tabs aim at the same spot. The relay accepts
   whichever arrives first; the loser's tab rolls back to the shared version
   with a friendly toast ("A friend built there first…").
5. Kill the relay (`Ctrl-C`) and restart it: tabs show "Reconnecting…", then
   rejoin. The first tab back seeds the fresh room with its build.

Room codes are 1–12 letters/digits, case-insensitive (`?room=abc` = `ABC`).
Relay end-to-end tests: `cd experiments/multiplayer/server && npm test`.

## Protocol

JSON text frames over one WebSocket per client. `v: 1` on every message.

### Wire command schema

The unit of change is one brick; the unit of transfer is an **atomic batch**
(one store transition = one batch = all-or-nothing on the server).

```jsonc
// commands (client -> server), rebroadcast inside apply (server -> clients)
{ "op": "place",   "brick": { "id", "partId", "x", "y", "z", "rotation", "color" } }
{ "op": "move",    "brick": { ...full brick after the change } }
{ "op": "rotate",  "brick": { ... } }
{ "op": "recolor", "brick": { ... } }
{ "op": "update",  "brick": { ... } }   // multi-field change (e.g. undo of move+recolor)
{ "op": "delete",  "id": "brick-..." }
```

The relay treats `move`/`rotate`/`recolor`/`update` identically (validated
full-brick replace); the distinct op names exist for wire readability and
debugging. A batch may touch each brick id at most once, which the diff
guarantees by construction.

### Messages

| Direction | Message | Purpose |
| --- | --- | --- |
| C→S | `{ type: "hello", room, clientId }` | Join (and lazily create) a room. Must be first. |
| C→S | `{ type: "commands", commands: [...] }` | One atomic batch. |
| C→S | `{ type: "resync" }` | Ask for a fresh snapshot (revision gap detected). |
| S→C | `{ type: "welcome", room, revision, snapshot, peers }` | Join ack: full authoritative document. |
| S→C | `{ type: "apply", from, revision, commands }` | Accepted batch, broadcast to the whole room (sender included). |
| S→C | `{ type: "reject", code, message, revision, snapshot }` | Sender-only: batch refused; snapshot is the rollback. |
| S→C | `{ type: "snapshot", revision, snapshot }` | Resync reply. |
| S→C | `{ type: "peers", peers }` | Room population changed. |
| S→C | `{ type: "error", code, message }` | Protocol violation; connection is closed. |

### Authority model

The relay is **authoritative**. It keeps the only document that matters
(`bricks[]` + a monotonically increasing `revision` per room) and re-validates
every batch with rules ported from the client:

- structural brick validity (known part id, integer coords, rotation 0–3,
  hex color, id ≤ 128 chars) — port of `brickDocument.ts#validateBrick`
- plate bounds and AABB overlap — port of `store.ts#draftIsValid`
- room cap of 250 bricks (`BRICK_STUDIO_MAX_BRICKS`)
- batch hygiene: ≤ 500 commands, one command per brick id, `place` needs a
  fresh id, edits need an existing id, `delete` is idempotent (racing deletes
  never reject)

Batches are applied with *staging*: deleted and replaced bricks are removed
before collision-checking the incoming ones, so a batch that rearranges bricks
(import, group undo, a two-brick swap) validates as a whole. Everything else
(a light per-connection message-rate cap, 1 MB frame cap, empty-room GC after
10 minutes) is robustness plumbing.

Clients are **optimistic**: a local change applies to the local store
immediately (that already happened — sync just observes it), is sent as a
batch, and is confirmed when its own `apply` echo returns.

### Conflict policy: server-order-wins

Concurrency is resolved by relay arrival order, nothing fancier:

1. Amy and Ben both target the same cells. Both apply locally (optimistic).
2. Amy's batch arrives first: accepted, `revision++`, broadcast to everyone.
3. Ben's batch now overlaps: rejected. Ben — and only Ben — receives
   `reject` with the current snapshot and resets his store to it (his
   optimistic brick vanishes, toast explains kindly).
4. Every client converges on the same document at the same revision.

Editing a brick someone else already deleted rejects with `unknown-brick` and
heals the same way. There is no merge, no CRDT, no timestamps — for a brick
grid where cell occupancy is binary, last-writer-loses-visibly is both simple
and legible to kids.

### Revisions, resync, reconnection

- Every accepted batch increments the room `revision`; `apply` carries it.
- A client that sees `revision !== local + 1` (dropped frame, suspended tab)
  sends `resync`, ignores further applies, and adopts the next `snapshot`.
- On disconnect the client retries with backoff (1s → 2s → 4s → 8s → 10s cap)
  and rejoins with `hello`; `welcome` always carries a full snapshot, which
  replaces local state (server-order-wins again). Snapshots are the whole
  document — at ≤ 250 bricks (~25 KB of JSON) there is nothing to page.
- **Seeding:** if `welcome` shows an empty room at revision 0 and the client
  has local bricks (a restored solo build), the client seeds the room with one
  big `place` batch. That makes "share your build" equal "share the link". If
  two seeds race, the second one loses by the normal conflict rules.

### Echo-loop prevention

Two independent layers:

1. Every client generates an **ephemeral random clientId** per page load
   (`builder-<uuid>`). The relay stamps each broadcast `apply` with the
   sender's id; a client ignores its own echoes (but still advances the
   revision from them).
2. Remote changes are written with `store.setState` inside an
   `applyingRemote` guard, so the store subscription that derives outgoing
   commands never re-diffs a remote change into fresh traffic.

### Privacy

No accounts, no names, no persistent identifiers. The wire carries a room
code, an ephemeral random client id (regenerated per page load), and brick
geometry. The relay holds rooms only in memory and forgets empty rooms after
ten minutes.

## Store-action → wire-command mapping

Commands are **derived, not recorded**: the module subscribes to
`useBrickStore` and diffs each `bricks` transition (previous vs next, keyed by
id) into a batch — deletes, then in-place changes, then placements.

*Tradeoff, deliberately chosen:* wrapping each store action would preserve
intent (`nudge` vs `undo-of-nudge`) but every new or forgotten action becomes
a sync hole. Diffing the one array that every mutation flows through covers
place/move/rotate/recolor/delete **and** paste, duplicate, undo/redo, import,
and New Build with a single code path, at the cost of inferring op names and
flattening bulk operations into per-brick commands. For a brick-granular
protocol, the inference is lossless where it matters (the resulting document),
and the op names below are inferred for readability only.

| Store action | Bricks transition | Wire batch |
| --- | --- | --- |
| `placeDraft` (new) | one added | `[place]` |
| `placeDraft` (while moving) | one changed (x/y/z) | `[move]` |
| `nudge` | one changed (x/y/z) | `[move]` |
| `rotate` (selected brick) | one changed (rotation) | `[rotate]` |
| `setActiveColor` (selected brick) | one changed (color) | `[recolor]` |
| `deleteSelected` | n removed | `[delete × n]` |
| `paste` / `duplicate` | n added | `[place × n]` |
| `newBuild` | all removed | `[delete × n]` |
| `importDocument` | replace | `[delete × a, update/…, place × b]` (by id overlap) |
| `undo` / `redo` | inverse of the above | inverse batch (e.g. undo place → `[delete]`) |
| multi-field change in one step | one changed (several fields) | `[update]` |
| draft/selection/camera/toast changes | `bricks` untouched | nothing on the wire |

Remote batches come back through the same vocabulary and are applied as
upserts/deletes, plus a small hygiene patch: selections pointing at vanished
bricks are pruned, and an in-flight move whose brick a friend deleted is
canceled with a toast.

## Zero impact when disabled

- No `?room=` → `useMultiplayerSync` returns before creating anything: no
  WebSocket, no store subscription, no badge DOM, no autosave change.
- All pre-existing tests pass without a relay anywhere in sight; the new
  client tests use an injected fake socket (network-free), and the relay's own
  test suite lives outside the root vitest run (`experiments/**` excluded).
- No new npm dependencies in the app; the relay's `ws` dependency is isolated
  in `experiments/multiplayer/server/package.json`.
- Performance ladder untouched: sync adds no rendering work, so there is
  nothing to gate on `usesCompactRenderer`/budget profiles. The one bit of
  added motion (the badge's connecting pulse) is disabled under the store's
  `reducedMotion` class and `prefers-reduced-motion`.

## Known spike limitations (accepted)

- **Undo history vs remote edits:** remote changes are not undoable locally
  (standard collab UX), but local history entries survive snapshot resets, so
  an undo can resurrect a brick a friend deleted — it then rejoins the room as
  a normal `place` (or rejects if the space is taken). Production wants
  history rebasing or per-user history scoping.
- **Offline edits are not journaled:** changes made while disconnected are
  replaced by the room snapshot on rejoin (unless the room is empty, where
  seeding applies). A production client would queue and replay.
- **Ported validator can drift:** part footprints and collision math are
  duplicated in `experiments/multiplayer/server/validator.js`. Production
  extracts one shared rules module consumed by both bundles.
- **No presence:** ghost drafts/cursors of other builders are out of scope;
  `peers` count only.
- **Relay trusts its own snapshots:** clients apply server documents without
  re-validating. Fine for a localhost relay; a hosted deployment should keep
  server-side validation (it has it) and add transport auth (room key in the
  hello).

## Productionization path

**Runtime fit.** The relay is deliberately shaped like a
[Cloudflare Durable Object](https://developers.cloudflare.com/durable-objects/)
or [PartyKit](https://www.partykit.io/) room: one room = one small
single-threaded authority owning `{bricks, revision, clients}`, addressed by
room code. The `relay.js` logic (hello/commands/resync + validate + broadcast)
ports almost line-for-line into a DO's `webSocketMessage` handler with
WebSocket Hibernation; `validator.js` runs unchanged. PartyKit gives the same
model with less wiring (`onConnect`/`onMessage` per room) and DOs underneath.
Add `wss://` and an environment-driven relay URL (the client already isolates
it in `MULTIPLAYER_RELAY_URL`).

**Classroom flow (K-8, no accounts, minimal COPPA surface).** A teacher
clicks "Start a room" and gets a short generated code (e.g. `TIGER42`) to put
on the projector; students open the app and type/scan it. No sign-in, no
names, no chat, ephemeral client ids, rooms expire after class. Because the
service never collects personal information, COPPA exposure stays minimal
(consult counsel before shipping regardless — "no accounts, no PII, no
free-text" is the design constraint that keeps it that way). Optional
teacher-side controls that fit the model cheaply: freeze room (relay refuses
batches), room-size cap (already trivial), export the shared build as a
normal `.brickstudio.json`.

**Durability.** In-memory rooms are enough for a class period; DO storage
(`state.storage.put('doc', …)` on accept, throttled) makes rooms survive
hibernation/evictions for multi-day builds.

**Cost.** A classroom room is ~30 connections sending a few messages per
second at ~200 bytes each. Cloudflare Workers paid tier ($5/mo) comfortably
covers a school's worth of rooms (hibernation makes idle rooms ~free;
requests/duration for this volume land in the low dollars). PartyKit-on-
Cloudflare prices similarly. A $4–6 VPS running this exact Node relay is the
same money with more ops. Realistic budget: **$0 for the local/LAN spike,
~$5/mo hosted.**

**Scale ceiling to design for:** one room never needs to scale (≤ 250 bricks,
≤ ~35 clients); the platform handles many rooms by sharding on room code,
which both DO and PartyKit give for free.
