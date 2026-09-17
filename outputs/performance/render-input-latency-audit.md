# Rendering and input latency audit

2026-09-15. Read-only source inspection of the current classroom release worktree. No production load, provider edits, source changes, or fresh physical Chromebook measurements were performed. Character Studio implementation may be changing concurrently; references below describe the inspected baseline.

## Conclusion

There are useful existing optimizations, but evidence does **not** support saying all remaining latency is network speed or minor device limitations. Explore rendering, repeated instancing uploads during edits, and selection collision checks expose avoidable application work. Prior performance evidence is explicitly narrow: one maximum-size brick, not a large multiplayer world.

## Already good

- Build uses one instanced group per part and keeps selected/recently placed bricks interactive (`BrickStudioScene.tsx:1290`, `buildRenderGroups.ts:25`). Geometry is cached per part (`geometry.ts:44`), so repeated bricks do not each construct unique geometry.
- Main renderer caps DPR at 1.1/1.25, and compact layouts disable shadows (`BrickStudioScene.tsx:1905`).
- Character preview uses one canvas, no physics, and visibility/reduced-motion/paused demand rendering (`characters/CharacterPreview.tsx:137`). Preserve this in the redesign; thumbnail cards should not create canvases.
- Draft coordinate updates bail out when the snapped position is unchanged (`store.ts:596`). Most React store subscriptions select individual values rather than the whole store.
- Remote avatar motion uses mutable refs and frame interpolation instead of moving React state every frame (`RemoteAvatar.tsx:35`). Physics has fixed timestep and interpolation (`BrickStudioScene.tsx:1742`).

## Highest-value follow-ups

### 1. Instance Explore brick visuals separately from colliders

`ExploreScene` maps every brick to `BrickCollider`; that component mounts a fixed rigid body and `BrickObject` (`BrickStudioScene.tsx:1363,1753`). Each `BrickObject` mounts its own mesh/material, several editor-state subscriptions, and a frame callback that immediately exits when no placement animation exists (`:305–341`). Geometry is cached, but draw calls and per-object overhead still scale with brick count. Build already demonstrates the needed grouping strategy.

Bounded fix: render all static Explore brick visuals in per-part instanced groups without editor event handlers; retain exact existing collider shapes and avatar physics. Do not simultaneously merge colliders or change collision semantics. Validate slopes, windows, stairs, colors, bounds, live edits while exploring, and a large mixed-part world. Expect draw-call improvement; measure actual frame-time improvement before claiming it.

### 2. Avoid all-group instance-buffer rebuilds for unrelated single-brick changes

`partitionBuildBricks` allocates new group arrays each invocation. Its inputs include document changes and selection/recent placement changes. `InstancedBrickGroup` responds to every new `group.bricks` identity by rewriting every transform/color and recomputing bounds (`BrickStudioScene.tsx:429–446`). A single edit or remote operation can therefore upload groups that were unchanged.

Bounded fix: preserve group identity for unchanged brick references, or memoize a narrowly defined comparison at the group boundary. Start with unchanged groups; avoid a complicated mutable GPU slot allocator. Test selection promotion/demotion, recolor, delete, changing custom definitions, hover reset, and plate-size changes. Measure update time and number of groups rewritten during one-brick edits in large worlds.

### 3. Budget the obscured main scene while Character Studio is open

`BrickStudioApp.tsx:1467` keeps the main scene mounted while the sheet is open. Main Canvas has no conditional frameloop (`BrickStudioScene.tsx:1905`), so character customization can render both the animated environment and preview continuously. Preview visibility handling does not pause the background world.

Bounded option: render the fully obscured main canvas less frequently or on demand in Build mode while the sheet is open; continue receiving network state. Do not reuse `graphicsPaused` blindly: it represents a context failure and blocks actions. Explore requires an explicit policy for simulation, avatar presence, input, and resuming safely; do not freeze physics as an incidental UI optimization. With a translucent sheet, verify the visual cost/benefit first.

### 4. Give slower laptops a graphics choice independent of viewport

`rendererQuality.ts:1` defines compact rendering solely as minimum viewport dimension below 600. A low-end 1366×768 Chromebook therefore receives full shadows and the larger DPR budget. Screen size is not a hardware benchmark.

Simple follow-up: an explicit Performance/Balanced quality preference controlling DPR, shadows, and optional scenery detail. Prefer this to speculative GPU fingerprinting or a complex adaptive controller. Keep navigation and gameplay identical. A sustained measured frame-budget fallback can be considered after baseline data exists.

## Secondary hotspots to measure, not immediately redesign

- Group drag validation (`store.ts:308–341`) repeatedly finds originals, clones remaining bricks, and validates each staged piece. Large multi-selection drag can grow much faster than one-brick drag. Profile first; cache unchanged document-side work per drag and coalesce pointer updates once per frame before introducing a spatial index.
- Native pointer helpers raycast recursively through `scene.children` (`BrickStudioScene.tsx:743,995`), including decorative scene objects before filtering usable hits. Maintain explicit pickable brick/baseplate targets if traces show this is expensive; preserve interior/roof picking correctness.
- Explore publishes yaw/facing changes into Zustand during frames (`BrickStudioScene.tsx:1625`). Selectors usually prevent React rerenders, but all subscription callbacks still run. Profile subscription cost before separating presentation refs from durable/UI state.
- Remote interpolation intentionally adds visual trailing: coefficient 14 has approximately 71 ms time constant and 164 ms to close 90% of a stationary step at normal cadence (`RemoteAvatar.tsx:43`). This is smoothing latency, not network latency. Do not simply remove it; compare jitter and responsiveness on real packet timings. This is not a measurement of total movement latency.
- `docs/classroom/EXPANDED-PERFORMANCE-QA.md` notes a cold maximum-size custom geometry can approach/exceed a frame budget, and diverse huge custom geometries remain unverified. Existing `scripts/qa/verify-expanded-performance.mjs` is a useful starting harness, but only samples short RAF cadence with one large brick.

## Practical measurement plan

1. Use an actual school Chromebook, plugged in, Chrome version/device/RAM recorded. Also run a modern laptop as control. Browser CPU throttling is diagnostic, not hardware certification.
2. Test 100, 500, and current-supported-budget brick worlds: repeated simple parts, diverse parts, dense interior structure, and several large custom parts. Do not increase app limits for the test. Compare Toy Room and the lightest scene.
3. Run Build idle/orbit, continuous placement, 1/20/100-brick selection drag, Explore traversal, Character Studio open/close, and two-client multiplayer editing/exploring. Use synthetic worlds on local/staging, never student worlds or production load tests.
4. Record 30-second settled samples: frame p50/p95/p99 and >50 ms frames, main-thread long tasks, draw calls/triangles/geometries/textures, memory growth across 10 modal cycles, local input-to-next-render and remote receipt-to-render. Capture cold-load separately from warm interaction.
5. Separate timestamps for input, local optimistic state, send, server handling, remote receive, and remote render. Cross-client clocks require synchronization or round-trip accounting; subtracting arbitrary client wall clocks is invalid.
6. Compare same-device solo vs multiplayer and normal vs intentionally delayed staging transport. This distinguishes render cost, app buffering, authoritative reconciliation, smoothing, and network contribution.
7. Aim for a measured consistent 30 fps baseline on school hardware (p95 frame interval around 33 ms), 60 fps where possible, and no repeated >100 ms interaction stalls. These are proposed targets, not current claims or guarantees. Preserve correctness and saved work over benchmark scores.

Ship the Character Studio with its existing one-preview-canvas safeguards, then prioritize Explore instancing and unchanged-group preservation as separately reviewable performance changes. Capture before/after evidence on the same fixture/device rather than claiming optimization completeness.
