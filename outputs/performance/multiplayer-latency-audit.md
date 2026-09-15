# Multiplayer latency audit — 2026-09-15

Inspected source baseline: `7e4713ae9d62c83d86e048cabe782137b987f97f`. No production load, provider changes, live student data reads or deployment. This is source-path evidence, not measured production latency. A bounded stop-pose correction was subsequently authorized; validation is recorded below.

## Conclusions

Several worthwhile optimizations already exist. Local edits are optimistic and send immediately; transient avatar traffic bypasses durable classroom edit queues; unchanged/hidden-tab poses are suppressed; movement subscriptions are split from editor UI; ordinary edits broadcast deltas rather than whole worlds. The app nevertheless adds deliberate smoothing and send cadence, and classroom confirmation includes serialized database work. It is not defensible to say remaining lag is only network or device limitations.

### 1. Concrete defect: immediate stop can be discarded (corrected locally)

Client `src/brick/efficientPoseSender.ts:113-120` sends final movement stop immediately. Client defaults in `src/brick/liveRoomClient.ts:27-28` are 75ms movement cadence and 1500ms idle heartbeat. Baseline Worker `multiplayer/worker/src/worldRoom.ts:1002` discards every pose arriving within 45ms of its predecessor, including stops. Thus a normal final stop 10ms after movement is lost and its target/animation state may only reach peers on the next idle heartbeat. This source path directly explains possible lingering movement; it is not evidence that a particular student's incident followed it.

Bounded correction: remember last accepted moving-or-jumping state in the socket attachment. Admit exactly its transition to idle despite the pose interval, after full pose validation. Update last-pose time/state on acceptance. Repeated idle and rapid restart packets remain throttled; all incoming frames still count toward the 30/sec budget and persistent violations still close the socket. The optional attachment field safely defaults old attachments to the normal throttle until a movement is accepted. No document protocol or persistence changes.

### 2. High-value next measurement: serialized classroom edit confirmation

`worldRoom.ts:642-650` routes poses outside the mutation queue; classroom non-pose messages enter `withSerializedAdmission`. `processSocketMessage:658-660` awaits `reauthorizeSocket` before commands. `classroom/index.ts:487-492` makes an `authorize_world` RPC. `handleCommands:751-764` then awaits `acceptDocument`, persists the DO record, and broadcasts. `acceptDocument:903-928` calls `commitClassroomWorld`; `classroom/index.ts:519-527` sends the entire validated document to `commit_world`, whose response includes the world. Therefore each ordinary classroom edit waits for authorization RPC + full-document durable-save RPC + DO persistence, with concurrent edits queueing behind prior edits.

These are proven structural costs; their milliseconds and contribution to observed lag are unmeasured. The SQL commit function also checks session, suspension/reset, classroom and membership (`supabase/migrations/202609090002_brick_session_authorization.sql:30-64`). A carefully reviewed combined authorize-and-commit path could remove one RPC for mutations, but **do not simply remove reauthorization**: preserve all current permission semantics, teacher allowlisting, attachment/profile refresh, revocation behavior, atomic revision checks, and durable acknowledgments. Avoid fire-and-forget saves or broadcasting unconfirmed edits as saved. Treat this as its own correctness-sensitive follow-up after measurement.

### 3. Bounded client CPU improvement candidate: command application complexity

`liveRoomClient.ts:203-220` scans whole before/after arrays to build deltas. `applyLiveCommands:222-246` clones all bricks, then repeatedly finds and maps/filters the full array per command, giving O(bricks × commands) work for large multi-select edits. On each received own/remote apply (`725-747`), canonical application is followed by `rebasePending` and `applyDisplayedDocument` (`498-531`), with additional whole-document clones and replay of pending operations. These are avoidable allocation/CPU candidates on large worlds and busy rooms, not measured bottlenecks yet.

A Map/index-based command pass preserving exact command ordering, insertion behavior and field-specific merge semantics is a bounded future optimization. Benchmark representative large multi-select moves before replacing; existing liveRoomClient merge/rebase/recovery tests are essential. Do not replace field-specific merges with whole-brick overwrites or skip acknowledgement rebase casually.

### 4. Avatar responsiveness is deliberately filtered

`RemoteAvatar.tsx:34-43` follows latest position with exponential smoothing `1-exp(-14*delta)` and no velocity extrapolation. Its response time constant is about 71ms (mathematical property, not a measured total delay), on top of a client cadence up to 75ms, network transit and rendering. This improves smoothness but intrinsically trails movement even on excellent networks. Keep it until a controlled visual comparison supports tuning; naive extrapolation can move characters through obstacles or overshoot stops. At 75ms each active player produces about 13.3 poses/sec, each broadcast to other room members; e.g. 30 active players imply roughly 11,600 delivered peer pose messages/sec room-wide, before headers (arithmetic capacity scenario, not observed traffic).

### 5. Measurement gaps / practical acceptance plan

Current `live/liveDiagnostics.ts:10-43,90-102` records privacy-safe connection/sync counters and merges consecutive sync records, not per-operation timings. `scripts/live-world-load.mjs:476-483` has useful create/connect, pose burst and edit-broadcast timings, but a synthetic socket test cannot show input-to-render delay on a Chromebook or certify classroom database throughput.

Next instrument bounded, content-free local aggregates:
- Client input/optimistic apply duration; enqueue-to-own-ack p50/p95; pending count high-water; WebSocket buffered bytes.
- Worker queue wait, authorization RPC, commit RPC, DO persist and broadcast durations separately; document/command byte counts. No names, IDs, tokens or world content in exported evidence.
- Receiving client packet-to-apply and next-frame timing; long tasks and frame percentiles while peers move/edit.
- Separate guest vs classroom rooms, two users vs realistic class groups, small vs large builds, simultaneous edits vs Explore, fast vs throttled network and actual Chromebook/tablet.

Use local/staging synthetic fixtures with cleanup first. Do not run production class-sized load without a separately approved window. Compare to the same-device solo baseline. Only after profiling can we attribute the residual to transport, backend, CPU/GPU, or intentional smoothing.

## Existing strengths to preserve

- Immediate optimistic store edits + immediate `enqueue` send (`liveRoomClient.ts:952-987,611-624`), no edit debounce introduced by transport.
- Pending operation replay/deduplication, revision gap resync, 5s stuck-sync watchdog, 15s connection watchdog, capped reconnect backoff (`liveRoomClient.ts:26-30,573-633,725-747`). These are recovery controls, not normal per-edit waiting periods.
- Poses bypass classroom durable mutation queue (`worldRoom.ts:642-650`), covered by slow durable-write test in `worldRoom.test.ts`.
- One serialization per broadcast (`worldRoom.ts:1266-1272` baseline).
- Metadata and membership invalidation are already targeted; metadata does not close the whole class (`worldRoom.ts:387-408`).
- UI/pose subscription split (`live/liveRoomViewStore.ts:17-64`) prevents pose-only updates changing the general room snapshot.

## Local correction validation

Worker regression covers immediate stop, repeated idle suppression, rapid toggle suppression, jump-to-idle, invalid stop validation, and persistent frame-flood closure. `npm --prefix multiplayer/worker test -- test/worldRoom.test.ts`: **33/33 passed**, 8.57s. `npm --prefix multiplayer/worker run typecheck`: **passed** (Worker and test TypeScript). Both used Node 22. No backend release has occurred.
