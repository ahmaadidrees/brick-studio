# 5 · Determinism in browser JavaScript

[← Index](INDEX.md) · **P2** · Research snapshot: **2026-09-30**

Evidence cells apply to the factual claims in their row. “Proposed” means a Brickgineers design or test recommendation, not an observed product capability. Unknowns are not negative capability claims.

## Direct answer / specification guarantees

| Question | Answer | Evidence |
| --- | --- | --- |
| Are sin/cos/atan2/exp bit-identical across V8, SpiderMonkey and JavaScriptCore? | No cross-engine identity guarantee. ECMAScript permits implementation-approximated results outside specified special cases. A matching test sample is not a general guarantee. | [ESM](https://tc39.es/ecma262/2026/multipage/numbers-and-dates.html) · official docs (normative specification) · ECMAScript 2026 · **high** |
| What about Math.pow / **? | Number exponentiation also has implementation-approximated general results after specified special cases. Do not treat pow as universally reproducible. | [ESN](https://tc39.es/ecma262/2026/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-exponentiate) · official docs (normative specification) · ECMAScript 2026 · **high** |
| Does all floating point become unsafe? | No. Number arithmetic has specified binary64 behavior, including special-value rules. Preserve operation order; distinguish basic arithmetic from transcendental library approximations. | [ESN](https://tc39.es/ecma262/2026/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-exponentiate) · official docs (normative specification) · ECMAScript 2026 · **high** |
| Does Math.fround fix trig? | It specifies rounding to binary32, not a replacement algorithm for the preceding transcendental operation. | [ESM](https://tc39.es/ecma262/2026/multipage/numbers-and-dates.html) · official docs (normative specification) · ECMAScript 2026 · **high** |
| Does Math.imul help? | It specifies low-32-bit multiplication with signed interpretation; useful for explicitly defined integer arithmetic/PRNGs, not arbitrary fixed-point products without overflow analysis. | [ESM](https://tc39.es/ecma262/2026/multipage/numbers-and-dates.html) · official docs (normative specification) · ECMAScript 2026 · **high** |
| Is ordinary Math.random a shared seed? | Its algorithm/seed are implementation-defined; ECMAScript provides no seed parameter for synchronization. | [ESM](https://tc39.es/ecma262/2026/multipage/numbers-and-dates.html) · official docs (normative specification) · ECMAScript 2026 · **high** |
| A concrete deterministic browser-physics precedent? | Rapier’s JS guide promises cross-platform determinism for the same version/initial conditions, and warns against initializing state with platform-dependent Math.sin/cos. | [RAPIER](https://rapier.rs/docs/user_guides/javascript/determinism/) · official docs · JavaScript guide 0.21; checked 2026-09-30 · **high** |


## Implementation choices and precise limits

| Choice | Use / limitation | Evidence and status |
| --- | --- | --- |
| Integer/fixed-point physics | Proposed: represent positions in integer subpixels, define rounding, overflow and division explicitly. Example scale 256 is a design candidate, not a sourced optimal value. Ordinary JS multiplication is exact only while integer products remain within the safe exact range. | Derived engineering proposal; numeric constraints [ESN](https://tc39.es/ecma262/2026/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-exponentiate) · official docs (normative specification) · ECMAScript 2026 · **high** |
| Checked-in trig tables | Proposed: build once using a defined offline algorithm, store integer outputs and hash the asset; specify interpolation and angle wrap. Never generate tables independently with browser Math.sin at startup. | Inference from [ESM](https://tc39.es/ecma262/2026/multipage/numbers-and-dates.html) · official docs (normative specification) · ECMAScript 2026 · **high**<br>[RAPIER](https://rapier.rs/docs/user_guides/javascript/determinism/) · official docs · JavaScript guide 0.21; checked 2026-09-30 · **high** |
| Deterministic math implementation | Proposed: use a pinned algorithm/library for every relevant transcendental operation. One deterministic sin does not cover atan2, pow, exp or SVG rasterization. | Inference from [ESM](https://tc39.es/ecma262/2026/multipage/numbers-and-dates.html) · official docs (normative specification) · ECMAScript 2026 · **high**<br>[ESN](https://tc39.es/ecma262/2026/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-exponentiate) · official docs (normative specification) · ECMAScript 2026 · **high** |
| WASM core | Rapier is evidence this is achievable, not proof every WASM program is deterministic or an instruction to adopt its engine. Audit imports, RNG and initialization. | Boundary based on [RAPIER](https://rapier.rs/docs/user_guides/javascript/determinism/) · official docs · JavaScript guide 0.21; checked 2026-09-30 · **high** |
| Keep Number semantics for Scratch operators | Proposed: separate compatibility numbers from fixed-point collision geometry. Converting every Scratch variable to fixed-point would alter documented arithmetic/coercion behavior. | Compatibility comparison with [§1](01-scratch-runtime-semantics.md); see its Cast/operator fixtures. |
| Quantization after native trig | Proposed only as an empirical risk reduction; a rounding boundary can still separate two nearly equal native results. It is not a proof of determinism. | Logical counterexample derived from permitted approximation; [ESM](https://tc39.es/ecma262/2026/multipage/numbers-and-dates.html) · official docs (normative specification) · ECMAScript 2026 · **high** |


## Rollback and browser precedents

| Reference | Verified behavior / status | Evidence |
| --- | --- | --- |
| GGPO | Predict missing input, simulate immediately, then restore and replay from divergence. Requires save/load state and frame execution without rendering. | [GGPO](https://www.ggpo.net/) · official docs · current site checked 2026-09-30; technique introduced 2009 · **high** |
| Delay-only lockstep | Wait for all inputs for tick n. Input bandwidth need not grow with world entity count, but local simulation work still does. | [GAFFER](https://gafferongames.com/post/deterministic_lockstep/) · blog (primary technical author) · Glenn Fiedler, 2014-11-29 · **high** |
| NetplayJS | Browser/WebRTC project with RollbackWrapper and LockstepWrapper; README example 0.4.1 and static-hosted demos. Latest retrieved commit is 2024-10-10; not evidence of 2026 active maintenance. | [NETPLAY](https://github.com/rameshvarun/netplayjs/blob/c6f888a65d49b8a2f09d0654b29becde25ec060f/README.md#L1-L125) · source code at commit hash (README) · c6f888a65d49b8a2f09d0654b29becde25ec060f, 2024-10-10; README example 0.4.1 · **high** |
| “No server hosting” caveat | NetplayJS includes a matchmaking/signaling server and permits using its public service. This is not literally no server infrastructure and not a guarantee of school firewall access. | [NETPLAY](https://github.com/rameshvarun/netplayjs/blob/c6f888a65d49b8a2f09d0654b29becde25ec060f/README.md#L1-L125) · source code at commit hash (README) · c6f888a65d49b8a2f09d0654b29becde25ec060f, 2024-10-10; README example 0.4.1 · **high** |
| Scratch network projects | Cloud-variable multiplayer is a known approach, but no pinned, independently validated Scratch lockstep/rollback engine was established by this investigation. Do not label any shared cloud variable project GGPO-style. | Unverified in this pass; [Scratch cloud-variable help lead](https://scratch.mit.edu/faq#clouddata) · official docs lead · checked 2026-09-30 · **low** |


## What must be in a snapshot — proposed runtime contract

| State | Why it belongs / replay rule |
| --- | --- |
| Instances | Persistent painted IDs, dynamic clone IDs, parent/template IDs, creation/deletion order, variable/list state, costume/effects, layer order and collision body. |
| Interpreter | Thread order, program counter, call/loop stacks, procedure arguments, warp state, pending broadcasts and broadcast-and-wait join sets. |
| Logical time | Simulation tick, project-timer baseline, wait/glide endpoints and elapsed logical duration. Do not serialize live JS Promise objects or DOM timers. |
| Input | Per-player held buttons plus explicitly ordered transitions, queued answers, pointer coordinates in world units; never consult unrecorded DOM state on replay. |
| Randomness | PRNG state and stream ownership; clone creation/replay must consume the same sequence. |
| Physics | Subpixel remainders, contact/support IDs, jump buffer/coyote counters, lift momentum and transient ignore-platform state. |
| External side effects | Emit stable event IDs for audio, speech, analytics and network messages; deduplicate or commit only confirmed events. Replaying must not send the same action again. |
| Immutable assets/program | Hash program IR, extension version, costume collision masks, level and math tables. Mismatches reject joining, rather than silently attempting to synchronize different rules. |


This checklist is an original engineering proposal, not a claim that GGPO/NetplayJS serializes these Scratch-specific fields. It follows their save/load/replay requirement and the state-bearing semantics in [§1](01-scratch-runtime-semantics.md). [GGPO](https://www.ggpo.net/) · official docs · current site checked 2026-09-30; technique introduced 2009 · **high**<br>[NETPLAY](https://github.com/rameshvarun/netplayjs/blob/c6f888a65d49b8a2f09d0654b29becde25ec060f/README.md#L1-L125) · source code at commit hash (README) · c6f888a65d49b8a2f09d0654b29becde25ec060f, 2024-10-10; README example 0.4.1 · **high**

## Cost model: scripting matters more than packet size

**Derived model, not a benchmark.** Let `C(N,T,B)` be one simulation tick’s cost with N entities, T active threads and B executed blocks; `r` the number of replayed ticks; `S` snapshot bytes; `W` retained history length. A correction costs approximately `restore(S) + r·C + save(S)`, plus the normal tick/render. Raw full-snapshot memory is approximately `(W+1)·S` before indexing/allocator overhead. Copy-on-write/deltas change this model and require measurement. The replay premise is documented by [GGPO](https://www.ggpo.net/) · official docs · current site checked 2026-09-30; technique introduced 2009 · **high**.

| Proposed synthetic scenario | Arithmetic / interpretation |
| --- | --- |
| Tick cost measured at 2 ms; replay depth 6 | Six replayed ticks alone require about 12 ms, before the normal tick, rendering, serialization and browser work. 2 ms is an illustrative assumption, not a measured Chromebook result. |
| 100 simultaneous sprites each start 10 scripts | 1,000 active threads may dominate even when most sprites draw one small quad; measure the actual script workload rather than cap sprites alone. |
| Broadcast fan-out | A message may restart/start many receivers; snapshot and CPU cost follow resulting threads, not message-byte count. |
| Many pixel collision pairs | A naive all-pairs pass has N(N−1)/2 candidates; spatial rejection reduces actual candidates but clustered worst cases still matter. |
| Long rollback tail | Cap history and define resync/disconnect behavior; never “catch up” indefinitely while increasing lag. |


## Strong evidence against assuming Scratch scheduling is already lockstep-safe

The Scratch oracle uses a wall-clock work budget, real timer paths and host asynchronous completions ([§1 frame/timing tables](01-scratch-runtime-semantics.md)). **Inference:** equal inputs on unequal-speed machines do not by themselves guarantee equal thread progress per logical frame. A deterministic mode must define scheduling/input/completion rules, not just replace Math.random. Keep a versioned compatibility profile; where deterministic timing intentionally differs, disclose and test it rather than claim identical vanilla timing. Supporting normative constraint: [ESM](https://tc39.es/ecma262/2026/multipage/numbers-and-dates.html) · official docs (normative specification) · ECMAScript 2026 · **high**; replay requirement: [GGPO](https://www.ggpo.net/) · official docs · current site checked 2026-09-30; technique introduced 2009 · **high**.


## Cross-engine release gate — proposed tests

| ID | Test | Pass criterion |
| --- | --- | --- |
| D01 | Run identical tick/input logs in Chrome, Firefox and Safari across available CPU architectures | Byte-identical canonical state each tick; report first differing field. |
| D02 | Trig/pow/exp stress corpus including near-boundary and extreme inputs | Deterministic wrapper outputs identical; native Math differences are recorded, not dismissed by epsilon. |
| D03 | Replay random clone/broadcast/list workloads | Same IDs, stack states, random sequence and list values. |
| D04 | Inject delayed/out-of-order inputs and duplicate packets | Prediction corrected to reference state; no duplicate audio or game effects. |
| D05 | Change rendering resolution, GPU and background-tab visibility | Renderer does not change simulation state; suspension follows explicit rejoin/pause policy. |
| D06 | Edit costume while a game is running | Asset revision changes only on a scheduled, authoritative tick or restart; no partial client updates. |
| D07 | Force instruction limit in a warp loop | Every peer yields/terminates at the same logical boundary; no wall-time dependent split. |
| D08 | School network test | Measure connection establishment and fallback on managed networks; WebRTC availability is not assumed. |


## Unresolved

| Gap | Resolution |
| --- | --- |
| Concrete deterministic JS fixed-point/trig library audited at commit | No particular library was fully audited; pin one and review arithmetic/overflow/tests before adopting. The checked-in-table approach here is a proposal. |
| Current V8/SpiderMonkey/JSC discrepancy corpus | No engines were executed. Build exact-bit corpus; do not turn the specification’s permission into a fabricated observed mismatch. |
| Scratch rollback implementation | Locate source/demo, pin commit and verify rewind under clones, broadcasts and lists; cloud state alone is insufficient evidence. |
| School-machine rollback budget | Measure p50/p95/p99 tick, save/load and correction costs on actual managed devices; see §10. |
| Exact Scratch compatibility vs deterministic scheduling | Decide which observable differences require extension names/profile labels; execute differential tests before shipping. |

