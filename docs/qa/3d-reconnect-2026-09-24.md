# 3D classroom reconnect repair — 2026-09-24

Base: `a2ca4ba` on `codex/2d-characters`. Implemented locally with three GPT-6 Sol lanes and integration review. No production data, configuration, dependencies, migrations, or deployments changed.

## Behavior

- Temporary ticket failures retry automatically with jitter and Retry-After pacing. Network/visibility wakeups cannot bypass that pacing or reclaim a superseded tab.
- Ticket-to-welcome attempts have a 30-second deadline, socket opening retains its 15-second deadline, and account/world HTTP reads have 20-second deadlines through response-body consumption. Superseded ticket results are ignored.
- Initial world lookup and classroom preflight retry transient failures while mounted, with interruption guidance. Real authentication/access refusals remain blocking.
- Rooms advertise heartbeat support; clients only ping advertised rooms. Cloudflare automatic WebSocket responses avoid waking the room for each ping. Silent connections are replaced.
- Permission lookup outages disconnect affected sockets retryably, without continuing protected broadcasts using stale access. Actual revocation remains terminal.
- Admission close codes: 4001 session replaced; 4003 access denied; 4004 room full; 4005 refresh required; 4006 temporary service failure; 4007 room locked. A 101 upgrade followed by denial is not room admission: no document or welcome is sent.
- Building stays paused during reconnect. Existing pending-edit recovery behavior remains in place.

## Validation

- 179 focused application tests passed across the live client, page, gateway, connector, diagnostics, HUD, classroom client, and teacher authentication.
- 130 Worker tests passed covering 3D rooms, classroom routing, classroom service, and 2D room isolation. The cross-format ticket test now verifies terminal close 4003 and zero messages instead of expecting HTTP 401 from a WebSocket upgrade.
- App production build and Worker typechecks passed. Existing Vite large-chunk warning remains.
- Local browser rehearsal against Vite 5411 and Worker 8791: created a disposable guest room, placed one brick, stopped the Worker, observed paused editing and automatic reconnect guidance, restarted the Worker, and observed the same open page return to shared-world mode without retry or reload. Backend read confirmed the original brick and revision 1.
- A second browser tab opened the invite while the Worker was down. It showed interruption/retry guidance and automatically reached the normal name/join form after service returned, without a Retry click.

## Limits / release

Classroom ticket failures, revoked access, and backend permission outages were checked using fixtures, not live student accounts. No Chromebook/iPad poor-Wi-Fi rehearsal was performed. The local browser run covered an actual service interruption, not every packet-loss pattern.

Deploy the Worker before the frontend so clients see heartbeat-capable rooms and readable refusal codes. There is no new storage migration. The earlier pilot's v4 rollback limitation still applies. These changes are local until explicitly released.

## Production release — 2026-09-25

User authorized production deployment. Released product commit `79977d4` from a clean Git archive; Worker first, then a Vercel prebuilt production build using freshly pulled production settings.

- Worker version: `72650bf3-5ddd-4764-b35c-67cfd1cbb91d`.
- Website: `dpl_5H5z4gQ2HiLi173jSXKieome3hwr`, https://virtual-legos-rhef9bji0-ahmaadidrees-projects.vercel.app; production alias https://brickgineers.com verified.
- Prior website: `dpl_9kn847sUuDtxx7ao1uQyYtG3Rbuw`, https://virtual-legos-jatcoqfh1-ahmaadidrees-projects.vercel.app.
- Prior Worker: `f1efb0f3-2418-45a9-8394-b5f2be63ace2` (same v4 storage migration).
- Production smoke: disposable guest room creation, WebSocket welcome advertising heartbeat, and ping/pong passed. Browser opened its production invite and joined. No student accounts or worlds changed. Real classroom authentication recovery under poor Wi-Fi remains a classroom validation item.
- Students with the old website open should save their work and refresh once.
