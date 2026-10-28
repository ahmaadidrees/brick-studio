# 10 · Browser performance on school Chromebooks

[← Index](INDEX.md) · **P3** · Research snapshot: **2026-09-30**

Evidence cells apply to the factual claims in their row. “Proposed” means a Brickgineers design or test recommendation, not an observed product capability. Unknowns are not negative capability claims.

**No device benchmark was run for this library.** Numbers below are manufacturer specifications, source constants, arithmetic or explicitly proposed test loads—not measured Code Lab capacity.

## Hardware baseline: example, not a fleet census

| Dimension | Verified example: Lenovo 100e Chromebook Gen 3 | Evidence |
| --- | --- | --- |
| CPU | Celeron N4500: 2 cores / 2 threads; N5100 option: 4 cores / 4 threads. | [CHROMEHW](https://psref.lenovo.com/syspool/Sys/PDF/Lenovo/Lenovo_100e_Chromebook_Gen_3/Lenovo_100e_Chromebook_Gen_3_Spec.pdf#page=2) · official docs (manufacturer PDF, tables visually checked) · 2025-09-02 specification; pp.2–3 · **high** |
| Memory / GPU | 4GB or 8GB soldered memory; integrated Intel UHD graphics with shared memory. | [CHROMEHW](https://psref.lenovo.com/syspool/Sys/PDF/Lenovo/Lenovo_100e_Chromebook_Gen_3/Lenovo_100e_Chromebook_Gen_3_Spec.pdf#page=2) · official docs (manufacturer PDF, tables visually checked) · 2025-09-02 specification; pp.2–3 · **high** |
| Storage | 32GB or 64GB eMMC 5.1. | [CHROMEHW](https://psref.lenovo.com/syspool/Sys/PDF/Lenovo/Lenovo_100e_Chromebook_Gen_3/Lenovo_100e_Chromebook_Gen_3_Spec.pdf#page=2) · official docs (manufacturer PDF, tables visually checked) · 2025-09-02 specification; pp.2–3 · **high** |
| Display / input | 11.6-inch 1366×768 non-touch display in this spec. Do not assume school Chromebooks are touch-enabled. | [CHROMEHW](https://psref.lenovo.com/syspool/Sys/PDF/Lenovo/Lenovo_100e_Chromebook_Gen_3/Lenovo_100e_Chromebook_Gen_3_Spec.pdf#page=2) · official docs (manufacturer PDF, tables visually checked) · 2025-09-02 specification; pp.2–3 · **high** |
| Meaning for testing | A 4GB N4500-class device is a defensible low-end test specimen. The national “typical” school fleet distribution was not verified. | Inference from [CHROMEHW](https://psref.lenovo.com/syspool/Sys/PDF/Lenovo/Lenovo_100e_Chromebook_Gen_3/Lenovo_100e_Chromebook_Gen_3_Spec.pdf#page=2) · official docs (manufacturer PDF, tables visually checked) · 2025-09-02 specification; pp.2–3 · **medium** |


## Canvas2D versus WebGL: what is established

| Question | Source-backed fact | Decision rule (proposal) | Evidence |
| --- | --- | --- | --- |
| Does WebGL always win for 2D? | No cited benchmark here establishes that across school devices and workloads. | Benchmark identical scenes and assets; compare upload, draw, collision and UI cost separately. | Unverified universal claim; methodology informed by [WEBGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) · official docs (MDN browser guidance) · rolling guide checked 2026-09-30 · **medium**<br>[CANVAS](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) · official docs (MDN browser guidance) · rolling guide checked 2026-09-30 · **medium** |
| Canvas2D optimization | MDN recommends caching repeated work, avoiding needless scaling and using layers for content with different update rates. | Pre-render reusable tiles and backgrounds; compare drawImage batching cost to a sprite renderer. | [CANVAS](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API/Tutorial/Optimizing_canvas) · official docs (MDN browser guidance) · rolling guide checked 2026-09-30 · **high** |
| WebGL batching | MDN recommends batching draw calls and avoiding unnecessary synchronous queries/readbacks. | Use atlases/batches; do not turn each brick or effect into an avoidable state change. | [WEBGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) · official docs (MDN browser guidance) · rolling guide checked 2026-09-30 · **high** |
| Pixel readback | CPU readPixels can force completion and a round-trip; async readback is possible in WebGL2. | Do not read the entire canvas each sensing call. Latency of async readback also must fit semantics. | [WEBGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) · official docs (MDN browser guidance) · rolling guide checked 2026-09-30 · **high** |
| Memory | WebGL offers no portable “total VRAM” query; MDN recommends per-pixel budgeting. | Cap texture dimensions, reuse costumes, and measure restoration after context loss. | [WEBGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) · official docs (MDN browser guidance) · rolling guide checked 2026-09-30 · **high** |
| Animation timing | requestAnimationFrame follows display refresh and commonly pauses in background tabs/hidden iframes. | Keep simulation ticks distinct from draws; implement a pause/resume policy rather than an unbounded catch-up loop. | [RAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) · official docs (MDN browser reference) · updated 2026-08-21; checked 2026-09-30 · **high** |


## Frame-budget worksheet

| Quantity | Value / formula | Status |
| --- | --- | --- |
| 30 simulation ticks/s | 1000/30 = 33.333… ms per tick. | Arithmetic; high confidence. |
| 60 displayed frames/s | 1000/60 = 16.666… ms per frame, including browser work—not all available to scripts. | Arithmetic; scheduling context: [RAF](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame) · official docs (MDN browser reference) · updated 2026-08-21; checked 2026-09-30 · **high** |
| Scratch compatibility work loop | §1 describes a soft 75% of tick interval budget: 25 ms at 30Hz. This is not a recommended Code Lab render budget. | [§1 frame loop](01-scratch-runtime-semantics.md) · pinned source + arithmetic · 2026-09-30 · **high** |
| Proposed 60Hz profiling envelope | Try 3 ms simulation + 3 ms collision + 4 ms draw submission + 2 ms UI; leave ~4.67 ms unallocated. | Illustrative allocation only; not measured, not a shipping guarantee. Revise from traces. |
| Rollback | A correction replaying r ticks costs roughly r × measured simulation cost, plus snapshot/restore and the normal tick. | Derived cost model; see [§5](05-browser-javascript-determinism.md). Rendering each replayed tick is unnecessary. |


## Pixel-perfect collision cost and optimization boundaries

| Operation | Cost model / risk | Proposed mitigation |
| --- | --- | --- |
| All-pairs candidates | N(N−1)/2 unordered pairs: N=300 gives 44,850. Arithmetic only; many games do not need all pairs. | Spatial grid/broad phase by bounds and collision groups before pixel masks. |
| Mask scan | A straightforward overlapping-region test is proportional to overlap area until a hit is found; repeated queries multiply work. | Cache occupancy per costume/transform where semantics permit; instrument sampled pixels and early exits. |
| Binary vs RGBA storage | For W×H pixels, packed binary occupancy requires ceil(W×H/8) bytes; RGBA8 requires 4WH bytes, excluding overhead. | An occupancy mask cannot answer arbitrary color sensing; keep distinct caches. |
| High pixel ratio | A 1366×768 RGBA8 buffer is 4,196,352 bytes; doubling both dimensions multiplies pixel storage/work by four. | Cap render resolution independently of world coordinates; sensing oracle must keep its documented native resolution. |
| Costume effects | Deformation/ghost/color semantics can change which cache or sample result is valid. | Do not optimize by treating all effects as visual-only. Use §1 fixtures as correctness gates. |
| Scratch color sensing | Renderer uses CPU/GPU paths and tolerance rules; a generic box or exact-RGB test is not equivalent. | Keep platformer body collision cheap and explicit; use Scratch-style sensing only where the program requests it. |


Cost formulas are algorithmic derivations, not timings. Scratch renderer evidence and tolerances: [§1 sensing](01-scratch-runtime-semantics.md); GPU readback constraint: [WEBGL](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) · official docs (MDN browser guidance) · rolling guide checked 2026-09-30 · **high**.

## Blockly workspace profiling

| Concern | Established fact / proposed action | Evidence |
| --- | --- | --- |
| Large continuous palette | The official continuous-toolbox plugin recycles eligible blocks to reduce repeated DOM creation. Dynamic blocks may be excluded. | [§3 plugin references](03-blockly-editor.md) · pinned source README · 2026-09-10 · **high** |
| Published plugin timing | Its illustrative timing is not a low-end Chromebook benchmark. Do not use it as a capacity claim. | [§3](03-blockly-editor.md) · pinned README applicability limit · **high** |
| Workspace scaling | Measure load, drag, scroll, zoom, mutator edits, search and save independently. A responsive game with a sluggish editor still fails classroom use. | Proposed profiling plan · 2026-09-30 · **medium** |
| Instance count vs block count | Render one selected brick’s workspace; do not instantiate a Blockly workspace for every painted copy. Keep shared code/data separate from UI. | Architecture proposal following user’s template/copy design · **medium** |
| Serialization | Debounce persistence and separate canonical program data from per-frame runtime state; test full restoration after tab eviction/reload. | Proposal; official serialization contract is in [§3](03-blockly-editor.md). |


## Reproducible school-device benchmark matrix — proposed

| Axis | Test points / procedure | Record |
| --- | --- | --- |
| Devices | At least one actual managed 4GB low-end Chromebook and one school iPad if supported; record CPU/RAM/model/OS/browser/management policies. | Exact configuration; do not substitute desktop CPU throttling as the sole evidence. |
| Workspace load | 100 / 500 / 1,000 blocks; shallow independent scripts versus deep expressions, procedures and dynamic fields. | First usable time, long tasks, p50/p95/p99 drag and search latency. Counts are stress fixtures, not promised limits. |
| Level load | 100 / 300 / 1,000 painted copies; static versus animated/scripted; sparse versus dense overlap. | Active threads, opcodes/tick, broad-phase candidates, sampled pixels, memory. Counts are proposed test loads. |
| Worst scripts | Broadcast fan-out, clone creation/deletion, warp loops, list growth and repeated color sensing. | Stop-button response, fairness, quotas, recoverability, determinism hashes. |
| Assets | Small atlas versus unique large costumes; transparent padding, effects, costume swaps and sound starts. | Decode/upload spikes, cache misses, retained bytes, audio interruptions. |
| Whole classroom workflow | Run game beside open Blockly, save, open another brick, resize and reopen after backgrounding. | End-to-end input response, failed saves, visible frame stalls and memory growth. |
| Sustained / rollback | Repeat an identical warm-up and timed trace; replay injected late inputs; record full procedure. | Median and tail results across runs; maximum rollback burst and recovery time. |


## Unresolved

| Gap | How to resolve |
| --- | --- |
| Typical school fleet prevalence | Obtain the schools’ inventory and browser policy; manufacturer examples do not establish population statistics. |
| Canvas2D/WebGL winner | Build equivalent renderer benchmarks with representative student art and sensing scripts; measure on managed hardware. |
| Maximum supported copies/blocks | Set limits only after p95/p99 interaction and memory tests, including pathological student scripts; document active versus total counts. |
| Pixel-perfect performance | Profile exact costume/effect/color implementations; broad-phase and query frequency matter more than a single sprite count. |
| Accessible performance | Measure keyboard and touch workflows alongside dragging; a fast canvas does not validate Blockly accessibility. |

