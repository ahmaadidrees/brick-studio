# Rendering reliability and local performance check — September 10, 2026

This pass changes the local classroom release candidate. It does not deploy production or change any student room.

## Remote avatar fix

`RemoteAvatar` now initializes its rendered position once. Incoming packets update an interpolation target rather than also setting the Three group's position through JSX. Previously, R3F applied each packet's `position` prop before the frame callback, defeating the interpolation and making remote movement snap.

Position damping remains frame-based. A gap longer than 0.5 seconds catches up to the latest target on resume. An idle avatar settles exactly at its last target once less than 1 mm away. Character animators retain their existing shortest-arc yaw damping. The component is extracted from `BrickStudioScene.tsx` into `RemoteAvatar.tsx` so these behaviors can be tested against the actual R3F reconciler.

Four new tests exercise real React/R3F updates, real Three objects, and the real Classic Builder animation. Only GPU drawing is stubbed:

- Two consecutive network positions do not reset the current rendered position; intervening frames advance smoothly.
- Idle position settles and stays unchanged through profile/color updates.
- A suspended frame catches up, then subsequent packets interpolate normally.
- Turning across the ±π boundary follows the short arc.

`tsc -b` passed. `RemoteAvatar.test.tsx`, `avatarMotion.test.ts`, and `remoteAvatarSource.test.tsx` passed: **14 tests**. The existing separate pose-subscription architecture is preserved.

## Local GPU measurements

Measured on an **Apple M5 Max**, Chromium/ANGLE Metal, a **1280 × 633 canvas**, Classic environment, desktop quality. The actual local studio ran through Vite with HMR disabled on port 5196 so concurrent workers' source changes could not reload an in-progress sample. Each row is a five-second settled sample, after asset/physics warmup, with 300 frame intervals observed. This is a short rendering sample, not a sustained classroom session.

The fixture contains five stock part types (`brick_1x1`, `brick_1x2`, `brick_2x2`, `round_1x1`, `cone_1x1`), six colors, and a 20 × 20 arrangement with up to three layers, within the 64 × 64 build plate. The 1,000-brick fixture was accepted by the normal document validator. The Explore camera used its regular spawn position; visible geometry differs from Build, so triangle counts are not an apples-to-apples comparison between modes.

| Scenario | Median draw calls/frame | Frame interval p95 | CPU render-call duration p95 | Frames >33.4 ms |
|---|---:|---:|---:|---:|
| Empty Build | 4 | 16.7 ms | 0.3 ms | 0 |
| Build, 300 bricks | 14 | 16.8 ms | 0.2 ms | 0 |
| Build, 1,000 bricks | 14 | 16.7 ms | 0.4 ms | 0 |
| Explore, 1,000 bricks | 1,063 | 16.8 ms | 2.4 ms | 0 |
| Explore, 1,000 bricks + 8 moving avatars | 1,206 | 16.7 ms | 2.4 ms | 0 |

Frame intervals come from `requestAnimationFrame`; CPU render-call duration wraps the actual `WebGLRenderer.render` call and **does not measure GPU completion or all frame work**. Draw calls come from Three's renderer counters. Heap snapshots varied with garbage collection and were not treated as leak evidence.

The eight-avatar sample injects the actual `RemoteAvatar` component with fresh positions/yaws at 10 Hz into the actual scene. This measures local rendering under incoming-pose activity. It **does not exercise WebSockets, remote devices, room identity, or collaboration correctness**; those belong to the separate multiplayer QA lane.

## Conclusion and limits

Build's existing instancing keeps draw calls constant from 300 to 1,000 bricks for this five-part fixture. Explore's per-brick rendering is the clearest measured scaling concern: 1,063 calls at the same brick count, and 1,004 frame subscribers before adding the remote avatars. The M5 Max still kept these settled samples at approximately 60 frames per second. That is not evidence that a school Chromebook will do the same.

No speculative renderer overhaul was added to this reliability fix. A measured Chromebook Explore check should determine whether a later pass needs instancing or lower quality settings. Broader scene variety, camera movement under load, imported/custom geometry, sustained memory use, mobile browsers, and real school hardware remain outside this bounded benchmark.

Temporary browser/server resources were closed after the measurements. Evidence snapshots were written locally to `/tmp/brick-render-build-results-20260910.json`, `/tmp/brick-render-explore-results-20260910.json`, `/tmp/brick-render-preflight-20260910.png`, and `/tmp/brick-1000-explore-20260910.png`.
