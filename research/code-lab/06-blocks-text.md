# 6 · Blocks ⇄ text

[← Index](INDEX.md) · **P2** · Research snapshot: **2026-09-30**

Evidence cells apply to the factual claims in their row. “Proposed” means a Brickgineers design or test recommendation, not an observed product capability. Unknowns are not negative capability claims.

## System comparison

| System | Representation / transition | Round-trip boundary | Evidence |
| --- | --- | --- | --- |
| MakeCode | Blocks and Static Python lower to Static TypeScript, then compilation. | A restricted language system, not arbitrary JS or CPython. Do not assume its runtime matches Scratch. | [MCLANG](https://makecode.com/language) · official docs · rolling docs checked 2026-09-30; compiler version on page may be stale · **high**<br>[MCPY](https://makecode.com/python) · official docs · rolling docs checked 2026-09-30 · **high** |
| MakeCode grey blocks | Unsupported JavaScript is retained as grey blocks, movable/copyable/deletable and preserved when returning to text. | Text inside them is not editable in blocks. Pattern recognition determines reconstructible blocks. | [MCGREY](https://arcade.makecode.com/blocks/javascript-blocks) · official docs · rolling docs checked 2026-09-30 · **high** |
| Droplet / Pencil Code | Text-backed editor parses code into manipulable visual structures and animates transitions. | Support is language-specific. The project page describes JS, CoffeeScript, HTML and C uses; full Python/current release status not verified. | [DROP](https://droplet-editor.github.io/) · official docs · project page checked 2026-09-30; current release not verified · **high** |
| BlockPy | Python learning environment with blocks, text or both, state exploration and guided feedback. | Search-index project description verified; arbitrary Python preservation/round-trip and current release not established. | [BLOCKPY](https://think.cs.vt.edu/) · official docs · project search-index description checked 2026-09-30; direct fetch timed out · **medium** |
| EduBlocks | Python/HTML-oriented blocks with visible corresponding code; Classrooms supports assignments. | One-line-style blocks and live text display do not establish arbitrary text→blocks conversion. | [EDUB](https://edublocks.org/) · official docs · Anaconda product page checked 2026-09-30 · **high** |


## MakeCode: exact lessons worth copying

| Lookup | What documentation establishes | Implication (proposed) | Evidence |
| --- | --- | --- | --- |
| TypeScript name | MakeCode deliberately limits language features. Its language page names an old TypeScript compiler version; current compiler identity was not independently verified. | Publish a Code Lab language version and accepted syntax, rather than promising all JavaScript. | [MCLANG](https://makecode.com/language) · official docs · rolling docs checked 2026-09-30; compiler version on page may be stale · **high** |
| Python name | MakeCode Python is a supported subset integrated into its compiler model. | Call your future view a documented subset unless actual Python semantics are supplied. | [MCPY](https://makecode.com/python) · official docs · rolling docs checked 2026-09-30 · **high** |
| Decompiler patterns | A recognized counted-for form can become blocks; a nonmatching form such as for(;;) may become grey code. | Round-trippability is a property of syntax plus supported constructs, not merely whether code runs. | [MCGREY](https://arcade.makecode.com/blocks/javascript-blocks) · official docs · rolling docs checked 2026-09-30 · **high** |
| Loss avoidance | Grey code preserves unsupported text instead of silently deleting it. | Keep original source and show a clear non-round-trippable marker; no silent rewrite. | [MCGREY](https://arcade.makecode.com/blocks/javascript-blocks) · official docs · rolling docs checked 2026-09-30 · **high** |


## What the blocks-to-text evidence actually says

| Study | Design and finding | Limits / design use | Evidence |
| --- | --- | --- | --- |
| Weintrop & Wilensky (2019) | Five weeks of isomorphic blocks/text instruction followed by ten weeks of Java. Initial block-based advantages faded; no final Java-outcome/practice/attitude differences were reported in the inspected abstract. | High-school setting, not grade-school Code Lab. It does not prove automatic transfer, permanent block superiority or that side-by-side text alone teaches syntax. | [WEINTROP](https://doi.org/10.1016/j.compedu.2019.103646) · peer-reviewed · Computers & Education 142 (2019), 103646; publisher abstract inspected · **medium** |
| What was verified | Bibliographic identity and publisher abstract; full article methods/effect-size extraction was not completed. | Treat “medium” as evidence-access limitation, not dismissal of the peer-reviewed study. | [WEINTROP](https://doi.org/10.1016/j.compedu.2019.103646) · peer-reviewed · Computers & Education 142 (2019), 103646; publisher abstract inspected · **medium** |


## Recommended architecture: one program, multiple surfaces (proposal)

**Not an existing Brickgineers implementation.** Keep a typed, versioned intermediate representation (IR) as the runtime contract. Blockly serialization is editor state; printed JavaScript/Python is a view or accepted-language import. This recommendation is informed by MakeCode’s restricted translation pipeline and the distinct Scratch behaviors in [§1](01-scratch-runtime-semantics.md), not a claim that Blockly supplies reversible generators. [MCLANG](https://makecode.com/language) · official docs · rolling docs checked 2026-09-30; compiler version on page may be stale · **high**

| Layer | Responsibility | Required invariant |
| --- | --- | --- |
| IR | Stable IDs, opcodes, literal types, symbol IDs/scopes, procedures, hats and source mappings. | Same program identity across blocks and text; no accidental variable-name collisions. |
| Blockly adapter | Map editor nodes to/from IR, retaining IDs and comments/layout separately. | Dragging a block changes program structure without reformatting unrelated code. |
| Read-only text | Print explicit runtime operations with highlighted source mappings. | Visible text accurately describes the operations actually run, including waits and event handlers. |
| Editable restricted text | Parse and type-check supported syntax into IR; preserve comments and unsaved invalid drafts. | Switching views cannot discard an invalid draft or alter semantics silently. |
| Unsupported syntax | Either reject with actionable diagnostics or retain an opaque text node with explicit limitations. | Do not execute opaque code as unrestricted same-origin JS. |
| Runtime | Execute IR/sandboxed bytecode under the same scheduler for both surfaces. | Text does not bypass block quotas, privacy boundaries or deterministic input rules. |


## Scratch semantics that ordinary text syntax would conceal

| Construct | Trap | Proposed visible representation / test | Evidence |
| --- | --- | --- | --- |
| Equality | Scratch compares numeric-looking operands numerically and other strings case-insensitively; JS === does not. | Print scratch.equals(a,b) or clearly teach a dedicated language operator; differential-test it. | [§1 operators](01-scratch-runtime-semantics.md) · pinned source behavior · 2026-09-30 · **high** |
| Modulo | Scratch negative-modulus behavior is not identical to naïvely adopting all host-language remainder conventions. | Use the same helper as blocks, including negative operands and divisor zero. | [§1 operators](01-scratch-runtime-semantics.md) · pinned source behavior · 2026-09-30 · **high** |
| Letters / lists | Scratch is one-based; its string operations follow JavaScript UTF-16 behavior. | Do not display Python indexing as identical; expose explicit Scratch operations or document divergence. | [§1 data](01-scratch-runtime-semantics.md) · pinned source behavior · 2026-09-30 · **high** |
| Wait / loops | The scheduler yields according to block semantics; a synchronous JS while loop does not. | Lower loops to VM instructions; never imply native for/while timing is the conformance oracle. | [§1 frame loop](01-scratch-runtime-semantics.md) · pinned source behavior · 2026-09-30 · **high** |
| My Blocks stop | Stop-this-script inside a definition can return from that procedure. | Use explicit runtime stop semantics and test nested definitions rather than substituting thread termination. | [§1 My Blocks](01-scratch-runtime-semantics.md) · pinned source behavior · 2026-09-30 · **high** |
| Runtime clones | Clones share a definition but have copied local data and distinct event lifecycle. | Preserve instance context in callbacks; do not print a misleading ordinary object shallow copy. | [§1 clones](01-scratch-runtime-semantics.md) · pinned source behavior · 2026-09-30 · **high** |


## Transition supports to evaluate, not claim as established outcomes

| Proposed support | Student task | What to measure |
| --- | --- | --- |
| Bidirectional highlighting | Click a motion block and locate its printed operation; select text and find its block. | Correct mapping before introducing syntax edits. |
| Predict → run → explain | Predict value/position, run, explain the trace, then modify one expression. | Explanation quality rather than only task completion. |
| Gradual editable islands | Edit a number/name/expression before opening whole scripts. | Syntax-error rate, recovery time and willingness to experiment. |
| Same task, two representations | Recreate a familiar coin/door interaction in text. | Transfer without copying the visible solution. |
| Explicit runtime vocabulary | Teach sprite/copy, event, local/global variable and waiting using traces. | Correct explanations of concurrent scripts and clone state. |
| Preserve creative choice | Offer different goals with the same target concept. | Completion, engagement and concept transfer separately. |


These are testable design proposals. The inspected transition study does not establish this exact intervention bundle as effective. [WEINTROP](https://doi.org/10.1016/j.compedu.2019.103646) · peer-reviewed · Computers & Education 142 (2019), 103646; publisher abstract inspected · **medium**

## Round-trip release tests — proposed

| Case | Pass condition |
| --- | --- |
| Blocks→text→IR→blocks | Semantic IR and stable symbol IDs unchanged; layout changes are separately tracked. |
| Rename local variable across templates/copies | Only intended scope changes; same-spelled globals unaffected. |
| Comments and whitespace | Comments survive or migration explicitly warns; no invisible semantic changes. |
| Syntax error in editable text | Draft retained; last valid runnable program identified; no destructive blocks switch. |
| Unsupported nested syntax | Preserved opaque region or explicit rejection, never silent deletion. |
| Unicode names/string literals | Escaping, normalization and one-based letter semantics preserved. |
| Procedures/recursion/event registration | Same runtime trace from both views. |
| Malicious host API use | DOM, network and storage not reachable except through allowed capabilities. |


## Unresolved

| Gap | How to verify |
| --- | --- |
| Weintrop/Wilensky full methods and other transition studies | Read authorized full articles; extract age, assignment, sample, measures and effect sizes before asserting classroom benefit. |
| Droplet, BlockPy and EduBlocks current maintenance/round-trip limits | Pin repositories/releases, load a shared Python/JS corpus, edit both ways and record preserved/rejected constructs. |
| Python semantics choice | Specify whether the view is explanatory syntax, a restricted DSL or actual Python; test division, booleans, Unicode and event scheduling. |
| Age-appropriate transition timing | Pilot with the actual grades; block fluency does not by itself establish text readiness. |

