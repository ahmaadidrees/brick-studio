# Robotics: classroom policy, collaboration authority, and persistence

Research date: 2026-09-14. Read-only source inspection of `/Users/ahmaadidrees/.codex/worktrees/brand-integration`, HEAD `8fd02590eae9f4073e1007e8dbe183f3ff7de138`. This is a design recommendation grounded in current source and primary documentation, not a deployed-behavior certification. No implementation, deployment, account, or live student state was changed.

## Recommendation

Add one activity-level **Robot controls** selector, defaulting to **Student programs**, and one teacher **Stop all robots** button. Keep existing class access, account recovery, and group membership controls. Do not make teachers manage a matrix of per-student robotics switches.

| Activity setting | Autonomous saved programs | Student-programmed live controls | Built-in free drive |
| --- | --- | --- | --- |
| Autonomous only | Yes | No | No |
| Student programs — default | Yes | Yes | No |
| Free drive + programs | Yes | Yes | Yes |

“Student programs” must include meaningful live interaction: a student can map steering, change a speed variable with a button, trigger an arm routine, or use a simulated distance sensor to override unsafe forward motion. Merely disabling all keyboard input would defeat this learning mode. A short correct controller program is legitimate; block count, line count, program length, AI detection, or superficial edits are not evidence of learning.

Run/Stop are execution controls, distinct from robot operator inputs. Authorized students can start an allowed saved revision and stop it in all three settings. Changing the selector does not erase code or builds. Teacher Stop all is a separate, persistent stop latch; each affected room invalidates its current runs and control leases when it applies the stop. The teacher sees which rooms acknowledged it. Clearing the latch permits a new explicit Run; it never restarts robots automatically.

The enforceable promise is: **these rules govern robots and results inside this managed activity**. A public guest builder remains accessible in another tab. A normal web application cannot prevent that, nor should this feature quietly remove existing guest use. Device-wide browsing restrictions would be a separate school-managed deployment requirement.

## What the current checkout actually provides

| Source evidence | Consequence for robotics |
| --- | --- |
| `multiplayer/worker/src/classroom/index.ts:113` distinguishes personal, class, and group worlds; non-teachers require open collaboration and group membership. Personal worlds have no classroom ID and cannot join classroom live collaboration. | An activity must have an explicit server-owned class/world binding. A personal copy is not an activity submission merely because its content resembles one. |
| `classroomRoutes.ts:245` identifies guest versus classroom DO records; authenticated classroom access requires a bearer session or verified live ticket. `classroomTickets.ts:55` issues a signed ticket lasting 60 seconds. Caller-supplied trusted routing headers are stripped at `classroomRoutes.ts:114`. | Direct links and old guest capabilities cannot be accepted as robotics authorization. Preserve these server routing boundaries for every new endpoint. |
| `worldRoom.ts:658` reauthorizes privileged classroom messages. `classroom/index.ts:513` commits with expected revision and identity; SQL `202609090002_brick_session_authorization.sql` checks permission inside the CAS transaction. `worldRoom.ts:919` withholds edit acknowledgement until the classroom save succeeds. | Retain durable-before-ack semantics for student program saves and robot configuration. New Run and control operations need explicit authorization; existing edit authorization does not automatically cover them. |
| `worldRoom.ts:495` treats a teacher or world owner as live-room owner; replacement, mode, and lock controls use that owner status. | Do not reuse `isOwner` as permission to change activity policy. Only the owning classroom teacher may change teaching rules; group ownership should not confer teacher authority. |
| `worldRoom.ts:642` handles avatar `pose` before the privileged-action reauthorization path; idle classroom sockets reauthorize approximately every 60 seconds at `worldRoom.ts:706`. | Avatar poses are presence, not verified robot movement. Never implement robotics by relabeling this message or trusting a client’s supplied robot transform. A minute-long fallback is also unsuitable as the sole robotics stop mechanism. |
| `worldRoom.ts:566` uses `acceptWebSocket`; constructor loads durable state; socket attachments survive hibernation. Wrangler declares SQLite-backed WorldRoom. Guest rooms expire after roughly two hours of inactivity, while classroom documents commit to Postgres. | Reuse connection infrastructure, but do not equate an expiring guest room with saved student work or serialize high-frequency robot motion through whole-world saves. |
| `packages/brick-core/src/protocol.ts` has only Build/Explore, brick commands, profile, lock, and avatar pose messages. `brickDocument.ts:29` has no robot/program fields; validation reconstructs the document at `brickDocument.ts:241`. | Robotics requires a versioned protocol and validated persistence contract. Ad hoc robot or program fields can disappear during current normalization. |
| `src/classroom/cloudAutosave.ts` uses revision-bound saves, a 700 ms debounce, and recovery records; `useClassroomWorld.ts:64` supplies `sessionStorage`. | Useful save UX exists. Current draft recovery is tab-session storage, so it does not establish durable recovery after closing the tab. |

These are source-confirmed contracts and limitations, not newly reproduced failures. The existing 32-person protocol capacity is not a robotics performance benchmark.

## Policy scope and precedence

Use a small server-owned activity record: `activityId`, `classId`, authorized `worldIds`, `drivePolicy`, `policyRevision`, and `stopEpoch`/stop latch. A group world has at most one active robotics activity binding in the first version. Content files contain robot/program data; they do not decide classroom permissions.

The class supplies a default copied into a newly created activity. Once created, the activity owns its explicit setting, so later default changes do not unexpectedly alter a lesson underway. “Apply to this activity” covers its group worlds. If needed, a distinct “Stop robots in this class” action fans out across all active activities. The UI must name the scope.

Effective permission requires all of: valid session, existing classroom/world membership, existing class access, activity policy, an unexpired execution/control lease, and no stop latch. Denial at any stage wins. Keep existing student suspension as an access restriction; do not add permanent individual drive-mode overrides initially. A teacher demonstration can use a visibly teacher-owned run or briefly change the activity mode; avoid hidden teacher-only bypasses that make student instructions misleading.

Allowing a personal/guest copy preserves experimentation but removes managed-activity status. Importing a project into an activity adopts the destination activity’s policy. Copy/export must exclude live tickets, control leases, stop state, and server-issued permissions. Copying cannot grant access to another group; reconnecting through a direct link must obtain the same current policy as joining through My Class.

Defer timed unlock for the first release unless it directly saves this teacher effort. If added, keep it to an activity-level “Allow free drive for 5 minutes”: persist the previous policy and a server timestamp, show remaining time, and stop built-in free drive at expiry while preserving student code. The server evaluates expiry on input and Run as well as through a scheduled wakeup. Closing the teacher tab must not extend it. Cloudflare alarms can retry, so expiration handlers must be idempotent; an alarm alone is not the permission check. [Cloudflare Alarms](https://developers.cloudflare.com/durable-objects/api/alarms/) (accessed 2026-09-14).

## All input surfaces must obey the same rule

Define the operator-input capability once and apply it to keyboard, gamepad, joystick, touch buttons, pointer/drag steering, accessibility controls, controller-remapping UI, remote teammate input, and any API that changes a running program’s parameters. A hidden WASD pad is not enforcement.

Distinguish simulated physical sensing—bumper contact, range, color, wheel rotation, orientation, elapsed simulation time—from operator channels. In Autonomous only, do not deliver operator events and reject programs requiring the operator-input capability. A validated restricted AST/bytecode may declare and check this capability, including called functions. That is capability validation, not a grade. The runtime must still enforce it; a client-supplied `autonomous: true` or `source: program` flag proves nothing.

In Student programs, deliver operator events only to the selected, saved controller program. The platform’s built-in drive mapping must have a separate privileged route that is unavailable in this setting. Example: pressing a student-selected button sets `slowMode`; an event loop computes wheel speeds from the joystick and clamps forward drive when a simulated bumper is pressed. That is real programming even when the robot is driven live.

In Autonomous only, freeze run parameters and the physical scenario at Run so sliders, movable obstacles, scene editing, or camera position do not become accidental live steering channels. Camera navigation and code editing may remain available, but they must not alter the active simulation. Explicit Run/Stop remains available as authorized, even though students can choose when to run a test; this is a teaching restriction on operator control, not proof that no human influenced a trial.

## Collaboration authority: one controller, clear handoff

Start with one shared active robot per group. Several students can design and save programs, but one visible controller operates the active run. This reduces conflicting input and makes turn-taking understandable. More robots require an explicit expansion of the same ownership and simulation contracts.

Separate three roles in implementation: program author/editor, current operator, and simulation authority. They may coincide in a cheap prototype but are not interchangeable permissions.

| Action | Minimal authority |
| --- | --- |
| Edit a program | Its authorized author, or current editor of an explicitly shared program. |
| Start the group robot | Current operator, after selecting a server-confirmed program revision and passing activity checks. Teacher may take control. |
| Send live input | The current operator’s current connection under a short, renewable lease; only when the active program/policy permits it. |
| Stop this robot | Any authorized group member, plus teacher. This enables a teammate to halt a bad run without taking control. Record who stopped it; repeated misuse uses existing group controls. |
| Hand control to another student | Current operator releases, recipient explicitly takes control; teacher can revoke/take control. Stop and neutralize inputs first. |
| Change policy / clear teacher stop latch | Owning classroom teacher. |

Use `runId`, immutable `programRevision`, `worldRevision`/configuration hash, `controllerConnectionId`, lease generation, `policyRevision`, `stopEpoch`, monotonic input sequence, and server deadline. Reject expired, duplicate, old-generation, wrong-run, wrong-robot, or unauthorized input. Reconnecting creates a new connection and requires explicit control acquisition. Replaying an old input must not move a robot or restart a run.

Do not use last-write-wins whole-program replacement when two students edit together. The minimal version is separate student drafts plus explicit loading of a saved revision. If a group shares one editable program, use a visible single-editor lease and preserve an interrupted editor’s local draft; others can copy or propose changes. A CRDT is a later product choice, not required for the first classroom activity. Independent code edits may continue while the robot runs; label them “Next run.” Changes to robot parts or physical world require stopping the run and creating a new baseline.

On controller disconnect, lease expiry, authority-host exit, or backgrounding of the browser that owns a client simulation, stop and freeze the shared run. On returning, synchronize state and policy, neutralize every input, and require an explicit new Run/take-control action. Do not hot-transfer a partly executed controller loop to the first peer that joins. A backgrounded viewer should not stop everybody; a backgrounded operator or browser simulation host should relinquish its role. Use server deadlines as well as visibility/blur handlers because hidden or suspended browsers may not send their final release message. Lease intervals and stop-latency targets need Chromebook/network measurement; suggested short intervals are design targets, not current guarantees.

## What “enforced” can honestly mean

| Model | What the server can enforce | Remaining trust / cost |
| --- | --- | --- |
| Cooperative browser simulation, server-coordinated room | Membership, selected program identity, single operator, accepted message types, lease expiry, authoritative room stop/run state, and rate bounds. | A compromised simulation host can invent positions, ignore code, or fabricate sensor/results. Honest clients follow the server; local hostile display is uncontrollable. Low server compute, greater client/host lifecycle complexity. Good for an explicitly cooperative demo. |
| Server executes a bounded robot language and owns simulation state | Operator-channel policy, actual code-to-motor execution, shared motion, simulated sensors, timing, stop state, and result calculation. | Requires a deterministic/bounded interpreter, supported robot/physics model, input validation, execution budgets, and an audited control plane. More engineering and active server duration; a constrained kinematic robot can be much smaller than arbitrary rigid-body physics. |

The first model can reject an explicit forbidden free-drive request, but it cannot prove that a pose marked “program output” came from a student program. A hash or signed run permission identifies allowed code; it does not prove that untrusted code actually ran. If classroom policy must withstand tampered clients, the second model is required for the claimed motion/results, or a separately verified trusted execution design.

Do not execute arbitrary student JavaScript directly inside the classroom coordination object. A bounded VM/DSL must yield and have instruction, time, memory, motor-output, and message budgets so a loop cannot starve Stop all. Keep high-priority stop handling independent of expensive rendering and long-running user computation. A full authoritative simulator is not automatically “security-grade”; that claim requires the complete execution and authorization path to be designed and tested.

**Recommended sequence:** agree on the supported robotics language/physics model first. For a low-cost first release, implement the control and persistence contracts now and either use a bounded authoritative subset or explicitly call the hosted-browser path cooperative. Do not ship a trusted score/assessment claim on the cooperative path. Neither path requires running a server physics loop when no robot is active.

## Revocation, stale policy, and emergency stop

Use the existing classroom invalidation route as a starting point, adding robotics policy/run invalidation rather than assuming avatar pose handling covers it. Revalidate on every new Run and lease acquisition; high-frequency input consults current DO policy and a bounded authorization lease. Do not query Postgres for every wheel sample.

Persist a policy change/stop epoch before reporting it saved. Fan out to every affected active world; each room invalidates old leases and returns an acknowledgement after committing its stop/policy state. New joins read the persisted current policy, including worlds whose DOs have not yet initialized. Short authorization/policy freshness deadlines bound stale connected rooms if fanout fails. Renewal failure denies new motion; failure does not silently extend permission. A future activity coordinator could reduce repeated database reads, but it adds a state owner and should follow measurement.

Cross-room fanout is not atomic. The teacher UI must distinguish “Stop requested,” “Stopped in 8 of 9 groups,” and a missing group acknowledgement. Once an unreachable room’s freshness lease expires, the server must deny further accepted execution. No implementation can promise zero-latency delivery through a network partition. A cooperative host may also continue rendering locally; do not represent that as a remotely verified stop.

Reconnect sends current program/save status, policy revision, stop epoch, run status, and canonical simulation snapshot. Old pending **edits** remain recoverable; old **drive/start** messages are discarded. These queues must never share replay semantics. Permission loss closes/restricts the managed session but preserves local unsaved work for recovery. Offline editing is allowed as a local draft; offline activity execution/submission is not treated as current authorized classroom work. Teacher stop release never replays queued input or resumes a run.

## Persist student work, not every simulation frame

Keep Postgres as the existing account/class/world catalog and durable project authority. Keep the WorldRoom as the live coordination owner. Avoid an infrastructure migration solely for robotics.

Persist three different things with separate semantics:

1. **Project content:** robot assembly/part bindings, motor/sensor configuration, source or blocks, stable program IDs, program language/runtime version, and immutable program revisions. Save with expected revision and idempotent operation identity. The run references a confirmed version; “Saved” only follows durable acknowledgement. Keep a named or immutable run-start revision so autosave edits cannot rewrite the program being evaluated.
2. **Local draft recovery:** author/world/program IDs, base revision, latest draft, and outstanding save identity in durable browser storage such as IndexedDB. A failure leaves the previous server revision intact and offers retry or export. Handle quota/private-session restrictions honestly; browser storage is not an unlimited backup. Never overwrite another student’s newer revision during automatic recovery. Include programs/configuration in download, import, restore, and checkpoint round trips.
3. **Execution record:** run ID, pinned revisions, policy/stop generations, operator, initial state/seed, runtime version, start/end times, terminal reason, and bounded result summary. Keep current pose/sensor frames transient; optionally persist coarse checkpoints for reconnect. After process loss, mark a formerly running execution interrupted unless a deliberately designed authoritative resume exists. Preserve the program, not the illusion of uninterrupted motion.

Choose explicitly between extending the main document schema and a companion robotics schema. A companion reduces brick-document churn but still requires a versioned export bundle and transactionally consistent world/program revision references. Appending fields to the existing document is insufficient because current validation reconstructs and drops unknown content. Existing world checkpoints currently capture world JSON, so separately stored programs need explicit checkpoint/version linkage and retention.

Cloudflare’s hibernation API preserves live connections while discarding in-memory state; attachments survive only for the socket lifetime. Therefore durable project/run identity belongs in storage, not solely an attachment or class field. Incoming activity wakes the object, and active timers prevent hibernation. Use hibernation for idle coordination, then bounded active execution only while a run exists. [Cloudflare WebSockets](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) (updated 2026-06-19; accessed 2026-09-14).

Use atomic storage transactions for a room’s run/lease/stop transition. A Cloudflare transaction does not include the remote Postgres database: define which side owns each record, and use idempotent retry/reconciliation for cross-store transitions. [Cloudflare SQLite storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/) (accessed 2026-09-14).

## Cost illustration and limits

Cloudflare currently includes 1 million DO requests and 400,000 GB-s monthly on Paid; overages are $0.15/million requests and $12.50/million GB-s, rounded up by billing unit. Incoming WebSocket frames use a 20:1 request ratio; outgoing frames have no request charge. Duration uses 128 MB per active object. SQLite includes 50 million row writes/month; free limits are hard ceilings. [Cloudflare pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/) (updated 2026-08-25; accessed 2026-09-14).

Illustration: 45 minutes/day, 20 days/month, 20 aggregate inbound frames/second per room, continuously active simulation:

| Group rooms | Inbound frames/month | Billed-equivalent message requests | Duration | Approximate DO overage plus $5 plan minimum |
| --- | --- | --- | --- | --- |
| 15 | 16.2 million | 810,000 | 103,680 GB-s | $5 |
| 150 | 162 million | 8.1 million | 1,036,800 GB-s | $18.70 |

These are calculations, not quotes or measured bills. Exclude other app usage, Worker requests/CPU, connections, storage overages, Supabase, and observability; shared allocations may already be consumed. Include avatar/presence traffic in measured totals. Classroom-scale server coordination can be inexpensive; implementation and latency are the larger uncertainties. Billing details above come from the same [pricing page](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Do not send every robot frame through current `commitClassroomWorld`: it reauthorizes and rewrites a full document through Postgres and revision/checkpoint machinery. Save code after editing pauses; send bounded input/state batches independently. Stop input when neutral and stop loops when no run is active. Rate caps must cover aggregate room traffic and bytes, not only individual clients. A 32-seat world with everyone broadcasting at robotics rates is a different workload from one operator and several viewers.

## Primary educational patterns

- VEX explicitly teaches custom controller code, including controller movement, button customization, and conditionals. Its activity asks students to alternate driving and coding, explain choices, and provide evidence from observed behavior. This directly supports recognizing student-programmed live controls as programming rather than forcing every lesson to be autonomous. [VEX AIM Custom Controls](https://education.vex.com/stemlabs/aim/aim-intro-course/controlling-decisions/lesson-3-custom-controls) and [VEX EXP Custom Controller Code](https://kb.vex.com/hc/en-us/articles/17751967909524-Custom-Controller-Code-in-VEXcode-EXP) (accessed 2026-09-14).
- Minecraft Education documents a teacher command that pauses a shared world, including progression of simulation time, and describes separate classroom instances for different group worlds. This supports a clearly scoped shared stop; it does not demonstrate how Brickgineers should implement distributed stopping or provide a performance guarantee. [Minecraft Classroom Mode](https://edusupport.minecraft.net/hc/en-us/articles/360047116652-Get-Started-with-Classroom-Mode) (updated 2023-12-04; accessed 2026-09-14).
- micro:bit classroom separates temporary browser session saving from a permanent downloaded session file and encourages students to keep their own projects for continuing outside the classroom session. Borrow the explicit recovery/export semantics, while using existing Brickgineers accounts for durable cloud saves. [micro:bit classroom](https://microbit.org/get-started/user-guide/microbit-classroom/) (accessed 2026-09-14).

## Dependencies and acceptance gates

Before implementation, resolve: supported program language and capabilities; authoritative versus cooperative simulation; activity creation/binding lifecycle; document versus companion persistence schema; execution-state ownership; maximum robots/participants and latency budget; program/history retention; whether copy/export has any classroom-specific policy. Default copy behavior should preserve existing openness rather than invent restrictions.

Required rehearsal cases include:

- Each policy against keyboard, gamepad, touch, remote input, runtime sliders, and a forged client message; physical sensors continue to work in Autonomous only.
- Teacher Stop all during an infinite-loop attempt, slow save, authority-host exit, a hidden tab, and a disconnected group; truthful partial acknowledgement and no automatic restart.
- Two students compete for control; old operator replays input after handoff; duplicate tabs reconnect; a removed group member follows an old direct link.
- Class closure, suspension, policy tightening, and timer expiry while code runs; unknown or unavailable policy fails closed without deleting drafts.
- Save/run race: a robot runs revision N while revision N+1 is edited; refresh, failed save, restore, and schema downgrade never discard source/configuration.
- Program export/import and cold reopen on another device; durable server readback matches selected revisions; local recovery survives the failures it claims to survive.
- Real Chromebook group rehearsal with background/sleep, realistic Wi-Fi loss, representative worlds, and measured server/client cost. Existing brick editing tests and passing HTTP responses are not evidence that this robotics flow works.

Historical memory informed only the preference for minimal teacher controls, guest preservation, and explicit save/recovery contracts (`MEMORY.md:869`, `MEMORY.md:883`). All current-contract claims above were checked against this checkout; no historical release status was reused as current proof.
