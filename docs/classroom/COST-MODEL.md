# Classroom traffic and cost model

Code inspection on 2026-09-09, including permission RPC source `49821fa`; these are request counts and illustrative traffic
estimates, not measured provider bills, latency, device benchmarks, or pricing.
Sources: `classroomRoutes.ts`, `classroom/index.ts`, `worldRoom.ts`,
`liveRoomClient.ts`, `efficientPoseSender.ts`, and the classroom SQL migrations (including permission RPCs).
Counts change when those implementations change. A PostgREST RPC counts as one
HTTP request here but executes several SQL statements and may write multiple rows.

## Current request paths

Counts below are for students with valid sessions and successful operations.

| Operation | Class world PG HTTP requests | Group world PG HTTP requests | Other work |
|---|---:|---:|---|
| Issue live ticket | 5 | 6 | 1 Supabase Auth user verification; DO init call |
| WebSocket connect after ticket | 4 | 4 | DO admission/persist and snapshot |
| Accepted document command batch | 2 | 2 | 1 full DO record persist; command broadcast |
| Periodic idle reauthorization per occupied room/minute | 1 | 1 | One batched permission RPC; each socket updated |
| Pose packet itself | 0 | 0 | Broadcast to every other connected participant |

Ticket includes student+session+world+class reads (plus group membership), then
`ensureRoom` loads the full world again. Connect revalidates at outer routing and
again inside serialized DO admission; both ensureRoom and admission load the world.
These checks are not interchangeable: admission must close the authorization race.
An existing DO returns409 from init without writing, so repeated ensureRoom does
not repeatedly create worlds, but does repeatedly download and serialize documents.
An additional metadata GET made by the UI is another5/6 PG requests plus Auth.

Accepted edits now perform one `brick_authorize_world` permission RPC followed by
one atomic `brick_commit_world` RPC. The permission response contains access metadata,
not the full document. The commit rechecks authorization, applies a100-saves/10-second
per-user limit, row-locks/CAS-checks the world, writes the document and periodically
checkpoints. Failed commits may add one reload. Invalid/replayed commands still pay
one pre-authorization RPC even without a commit. Modes/profile/resync also pay that
RPC; mode changes may commit separately. Full-world replacement broadcasts a snapshot
rather than the normal compact command delta.

Outer connection and serialized DO admission each perform one permission RPC;
ensureRoom and admission each load the world, totaling4 PG HTTP requests. Admission
still closes the authorization race. Ticket authorization retains its existing
student/session/world/class reads, but its world permission read selects metadata.

The alarm now invokes one `brick_authorize_world_batch` RPC for all open sockets in
an occupied room each60seconds, rather than4/5 HTTP reads per socket. It still checks
each identity inside Postgres; fewer round trips do not mean only one SQL row read.
A room with no sockets clears its alarm. Pose activity calls touch, which persists
the DO full record at most once per minute without other writes; poses do not write
Postgres individually.

## Thirty-student illustration

Assume30 students, one classroom world,45minutes, each averages one accepted edit
batch every5seconds, no errors/reconnects, and document sizeD remains approximately
constant. This is a workload assumption, not observed student behavior.

- 6 batches/second →16,200 commits; current authorization+commit path makes32,400
  PG HTTP requests for either class or group worlds (previous source81,000/97,200).
- One occupied room adds about45 batched idle RPCs over45minutes, replacing the
  previous5,400/6,750 HTTP reads. These batches still authorize every socket.
- Thirty ticket+connect flows add270 class-world or300 group-world PG requests,
  excluding optional UI fetches, login, teacher activity and retries.
- Each edit sends the full document to the commit RPC and receives it back;
  permission checks no longer return it. That is approximately2D transferred between
  Worker and PG, excluding headers/compression/metadata. At D=100KB, roughly3.24GB
  aggregate traffic per lesson, about1.62GB PG-to-Worker. This is not billable-egress
  accounting. At D=500KB it scales fivefold. The earlier3D estimate is superseded.
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

Limits are currently code/SQL constants, not teacher settings:32 live participants,
30 messages/s/socket, minimum45ms accepted pose interval,500 commands/64KiB batch,
800,000-byte live document,150 students/class,50 saved worlds/owner,2MB PG document,
30 checkpoints and8MB checkpoint budget/world. Change centrally and retest if tuning;
the PG document cap being higher does not promise an equally large world can go live.
The32-participant cap includes the teacher, admitting30 students plus a teacher at
the protocol level. A raised cap does not itself prove acceptable performance.

The first optimization has landed: metadata-only/compact permission responses,
one current-rights RPC per privileged action and one batch RPC per idle room check.
`ensureRoom` still loads the full world for each ticket/connect; initializing only
when absent could remove redundant transfer while retaining admission refresh.
Never acknowledge an edit before durable commit or remove revocation checks merely
to improve a benchmark.

## Hosted baseline and retest boundary

`CAPACITY-STAGING-BASELINE-REPORT.json` records a failed hosted baseline with30
students plus a teacher connected: connection p95 about5.43seconds, only12 accepted
edits, and edit acknowledgment p95 about23.85seconds. This is evidence of an
unacceptable baseline, not capacity certification. Permission RPC changes address
an observed source of round-trip overhead. The final hosted retest passed with31 clients and60/60 edits, authoritative
PostgreSQL persistence and all-client convergence: median acknowledgment562.46ms,
p95 926.19ms, with30 pose senders at2Hz. See
`CAPACITY-STAGING-RETEST-REPORT.json`. This short workload does not certify
sustained lesson traffic or real device rendering. Do not infer
improved latency, billing, Chromebook rendering or classroom readiness from lower
source-level request counts alone.

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
