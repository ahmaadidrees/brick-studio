# Classroom traffic and cost model

Code inspection on 2026-09-09; these are request counts and illustrative traffic
estimates, not measured provider bills, latency, device benchmarks, or pricing.
Sources: `classroomRoutes.ts`, `classroom/index.ts`, `worldRoom.ts`,
`liveRoomClient.ts`, `efficientPoseSender.ts`, and the three classroom SQL migrations.
Counts change when those implementations change. A PostgREST RPC counts as one
HTTP request here but executes several SQL statements and may write multiple rows.

## Current request paths

Counts below are for students with valid sessions and successful operations.

| Operation | Class world PG HTTP requests | Group world PG HTTP requests | Other work |
|---|---:|---:|---|
| Issue live ticket | 5 | 6 | 1 Supabase Auth user verification; DO init call |
| WebSocket connect after ticket | 10 | 12 | DO admission/persist and snapshot |
| Accepted document command batch | 5 | 6 | 1 full DO record persist; command broadcast |
| Periodic idle reauthorization per socket/minute | 4 | 5 | Socket attachment update |
| Pose packet itself | 0 | 0 | Broadcast to every other connected participant |

Ticket includes student+session+world+class reads (plus group membership), then
`ensureRoom` loads the full world again. Connect revalidates at outer routing and
again inside serialized DO admission; both ensureRoom and admission load the world.
These checks are not interchangeable: admission must close the authorization race.
An existing DO returns409 from init without writing, so repeated ensureRoom does
not repeatedly create worlds, but does repeatedly download and serialize documents.
An additional metadata GET made by the UI is another5/6 PG requests plus Auth.

Accepted edits perform4/5 authorization reads followed by the atomic commit RPC.
That RPC rechecks authorization, applies a100-saves/10-second per-user limit,
row-locks/CAS-checks the world, writes the document and periodically checkpoints.
Failed commits may add one reload. Invalid/replayed command messages currently pay
pre-authorization reads even when no commit occurs. Modes/profile/resync also pay
those reads; mode changes may commit separately. Full-world replacement broadcasts
a snapshot rather than the normal compact command delta.

Every open socket is rechecked each60seconds. A room with no sockets clears its
alarm. Pose activity calls touch, which persists the DO full record at most once
per minute in the absence of other writes; poses do not write Postgres individually.

## Thirty-student illustration

Assume30 students, one classroom world,45minutes, each averages one accepted edit
batch every5seconds, no errors/reconnects, and document sizeD remains approximately
constant. This is a workload assumption, not observed student behavior.

- 6 batches/second →16,200 commits; current authorization+commit path makes81,000
  PG HTTP requests (97,200 for a group world).
- Idle checks add about5,400 reads (6,750 for group). Join ticket+connect adds450
  reads (540 group), excluding optional UI fetches, login, and teacher activity.
- Each edit currently reads the full document for authorization, sends it to the
  commit RPC, and receives it back: approximately3D transferred between Worker and
  PG, excluding headers/compression/other rows. At D=100KB, that is roughly4.86GB
  aggregate traffic per lesson, of which about3.24GB is PG-to-Worker. This is not
  billable-egress accounting. At D=500KB it scales fivefold.
- Serialized room edits require sustained processing faster than167ms/batch at
  that arrival rate to avoid a growing queue. Actual cross-provider latency must
  be measured; multiple sequential network checks make this an important gate.

Pose defaults are75ms while changing/moving and1.5seconds when stationary/visible.
Thirty stationary clients produce about20 inbound and580 outbound pose messages/s.
Thirty continuously moving clients can approach400 inbound and11,600 outbound/s
(29 recipients each). Assuming200bytes/frame yields about2.32MB/s outbound before
framing/compression. Hidden tabs suspend pose sending. Smaller groups reduce
fanout substantially; six groups of five yield1,600 outbound/s at the same movement
rate rather than11,600. Rendering/interpolation costs are separate from server cost.

## Existing limits and low-risk next steps

Limits are currently code/SQL constants, not teacher settings:30 live participants,
30 messages/s/socket, minimum45ms accepted pose interval,500 commands/64KiB batch,
800,000-byte live document,150 students/class,50 saved worlds/owner,2MB PG document,
30 checkpoints and8MB checkpoint budget/world. Change centrally and retest if tuning;
the PG document cap being higher does not promise an equally large world can go live.
Thirty participants includes the teacher, so30 students plus teacher needs groups
or a deliberate capacity change and performance verification.

First optimize redundant document transfer: metadata-only authorization reads,
and initialize only when the DO reports absent rather than loading full PG state
for every ticket. Keep admission's authoritative revision/permission refresh.
For edit throughput, the atomic commit already enforces revocation/session/class/
membership; consider relying on that single RPC for document mutations instead of
also doing4/5 preliminary network reads. Retain checks for controls that do not
commit, and retain periodic/access-change invalidation. Add race/revocation tests
before removing checks. Never acknowledge an edit before durable commit.

Measure accepted-edit latency p50/p95, queued batches, document bytes, PG request
count, reconnects and pose fanout on the actual hosted candidate before describing
it as scalable or cheap. No migration is warranted merely from this estimate.

## Downstream edit payload check

Source rechecked after integration: normal accepted brick commands broadcast
`type:apply` with normalized operation deltas, not a full document. The client
subscribes to changed bricks and computes `diffBricksToLiveCommands`. A single
place/move/update sends one complete affected brick; delete sends an ID. The room
broadcast includes the sender as its acknowledgment, so30 connected clients means
30 outbound copies of each apply message.

Measured locally with `Buffer.byteLength(JSON.stringify(...))`, a synthetic1000-brick
fixture using UUIDs, integer grid positions, `brick-2x4`, and six-digit colors produced:

| Serialized JSON | Bytes |
|---|---:|
| Full document |117,196|
| Snapshot envelope |117,264|
| Single-place apply envelope |265|
| Single-place apply to30 recipients |7,950|
| Snapshot to30 recipients |3,517,920|

At the illustrative6 accepted edits/second, normal apply traffic is47,700bytes/s
aggregate (~1,590bytes/s per client), excluding poses, profiles, framing, compression
and retries. Broadcasting a full snapshot at that rate would instead be about
21.1MB/s, roughly443times more. The implementation does not do that on the normal
path. These are measured fixture serialization sizes, not measured network traffic;
long IDs/coordinates, command batch size and custom-part metadata change them.

Snapshots still occur for deliberate full-document replacement, commit-conflict
reload/broadcast, revision mismatch during admission, and explicit resync/replay
fallback. Some target one client; conflict/replacement broadcasts target the room.
Repeated conflicts/reconnects could turn otherwise compact editing into expensive
snapshot traffic, so measure snapshot count/bytes alongside edit latency and queue
length. No normal-broadcast payload fix is needed from this review.
