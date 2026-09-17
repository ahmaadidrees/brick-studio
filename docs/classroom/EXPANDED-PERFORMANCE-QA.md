# Expanded-world local performance and physics rehearsal

Local-only Chrome rehearsal, 2026-09-14 UTC, against Vite at http://127.0.0.1:5190. Harness: `scripts/qa/verify-expanded-performance.mjs`. Browser viewport1366×768, headless system Chrome, host hardware; no Chromebook, production, or release certification implied. Artifacts: `/tmp/brick-expanded-performance/results.json` and per-environment screenshots.

## Geometry and validation

Maximum custom solid brick64×64×192 on128 plate, measured through Vite modules. All three stud configurations passed shared-core validation.

| Configuration | Triangles | Attribute/index bytes | Cold generation | Validation |
|---|---:|---:|---:|---:|
| No studs |12|840|0.2ms|0.8ms|
| Auto studs, revised8 radial segments |131,084|8,389,520|35–43ms|0.5–0.6ms|
| Full studs, revised8 radial segments |131,084|8,389,520|34–36ms|0.2–0.3ms|

Before the8-segment refinement, full studs produced262,156 triangles and16,253,840 buffer bytes, taking54–60ms. The change substantially reduces cost while retaining stud positions. These are geometry buffer sizes, not total process or GPU memory.24 distinct maximum-size studded geometries alone could occupy~201MB of these buffers; that is an arithmetic bound, not a measured24-part workload. One cold geometry still approaches/exceeds a frame budget. Cache behavior, many unique maximum-size parts, and Chromebook memory/frame performance remain unverified.

## Rendered128 worlds

Fixture: one maximum custom brick occupying x/z0–64 on a128 plate; scene choice applied through the actual loaded Zustand module, then Explore entered. All three environments reached `ready`, spawn(0,0.39,5), and stayed supported while moving beyond the old64-plate edge(x19.84 world units). No page errors in the complete initial run.

| Environment | RAF p95 | Render triangles | Draw calls | Position after6sec travel |
|---|---:|---:|---:|---|
| Toy Room |16.7ms|923,622|103|(27.11,0.385,5.00)|
| Sky Island |16.7ms|281,240|42|(31.75,0.385,4.99)|
| Brick Valley |16.7ms|1,013,958|43|(31.85,0.385,5.00)|

RAF timing measures browser presentation cadence; it is not GPU elapsed time. Three renderer counters may include shadow/multiple passes. Results are one maximum brick on this host, not a1000-brick or24-custom-part stress certification.

## Extended terrain path

A12-second Toy Room pass reached(49.63,0.205,5.00), beyond the128-plate edge at39.68. The lower standing height agrees with the authored scenery floor at−0.18, demonstrating actual avatar support from scaled scenery outside the plate. The first extended run was interrupted by a Vite restart after `.env.local` changed; the interrupted run is not counted as an all-environment pass.

The final stable extended run completed successfully for all three environments (see below). The diagonal return leg does not prove collision against the maximum brick wall. The harness does not claim wall, stair, jump-clearance, every terrain obstacle, or all authored collision shapes are verified.

## Final stable extended run

Timestamp: 2026-09-14T06:22:49.120Z. All three Explore spawns ready; no page errors.12-second outward travel and3-second return leg completed.

| Environment | Outward position(x,y,z) | RAF p95 | Status |
|---|---|---:|---|
|toy-room|52.776, 0.204, 4.962|16.8ms|ready|
|sky-island|47.122, 0.205, 3.818|16.7ms|ready|
|brick-valley|63.138, 0.084, 4.991|16.7ms|ready|

All outward positions exceed expanded plate edge39.68, demonstrating actual scaled environment collision support. Height differs across terrain. Screenshot for Sky Island visually inspected: avatar visible on plate after return leg, environment rendered without an error overlay.

Precision limitation: Brick Valley's sampled body-center height~0.084 differs from~0.205 in the other scenery paths. Its screenshot shows the avatar on grass without obvious sinking, but this run did not isolate whether collision/contact tolerance, terrain detail, or another factor explains the difference. Exact surface-height agreement remains a follow-up check; this report establishes support, not perfect visual/physical congruence.
