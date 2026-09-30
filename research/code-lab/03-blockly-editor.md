# 3 · Blockly for a Scratch-like editor

[← Index](INDEX.md) · **P1** · Research snapshot: **2026-09-30**

Evidence cells apply to the factual claims in their row. “Proposed” means a Brickgineers design or test recommendation, not an observed product capability. Unknowns are not negative capability claims.

## Version ledger and conflicts

| Item | Verified snapshot | What not to infer | Evidence |
| --- | --- | --- | --- |
| Blockly core | 13.3.0, released 2026-09-10; tag resolves to bf35c82fce034a7728d07c7827a513b2a3073a1b. | Do not use latest at build time. Lock the package and plugins together. | [BREL](https://github.com/RaspberryPiFoundation/blockly/releases/tag/blockly-v13.3.0) · official docs · 13.3.0, 2026-09-10 · **high** |
| 13.3 highlights | Navigation shortcuts, workspace-search accessibility/UI work, nested-tree performance, Zelos geometry fixes, undo/drag/focus fixes. | A release note is not a Chromebook benchmark or a complete accessibility certification. | [BREL](https://github.com/RaspberryPiFoundation/blockly/releases/tag/blockly-v13.3.0) · official docs · 13.3.0, 2026-09-10 · **high** |
| Keyboard docs conflict | Documentation still contains wording that v13 will arrive in June 2026. | Published September release wins for availability; validate API names against installed types/tests. | [BKEY](https://docs.blockly.com/guides/configure/keyboard-nav/) · official docs · rolling page checked 2026-09-30; contains stale v13-future wording · **medium**<br>[BREL](https://github.com/RaspberryPiFoundation/blockly/releases/tag/blockly-v13.3.0) · official docs · 13.3.0, 2026-09-10 · **medium** |
| Plugins ledger | Pinned blockly-samples commit d27a96788fc971899659de249a906b807755420e from 2026-09-10. | README API support is not proof every plugin combination works with core13.3. | [BCONT](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/continuous-toolbox/README.md#L1-L73) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **high**<br>[BPROC](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/block-shareable-procedures/README.md#L1-L34) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **high** |
| scratch-blocks context | Package2.1.24 declares Blockly ^12.4.1 and continuous-toolbox ^7.0.8; Apache-2.0. | It is no longer accurately characterized only as an ancient frozen fork. No integration recommendation to abandon your own Blockly editor follows. | [SBPKG](https://github.com/scratchfoundation/scratch-blocks/blob/8d6b18f6d05bb97d39bec2bb3c85e65a95d451bd/package.json#L1-L65) · source code at pinned commit · 8d6b18f6d05bb97d39bec2bb3c85e65a95d451bd; develop snapshot checked 2026-09-30 · **high** |


## Scratch-like surface: renderer, theme, custom blocks

| Need | Supported mechanism | Implementation boundary / test | Evidence |
| --- | --- | --- | --- |
| Rounded Scratch-like blocks | Zelos is based on Scratch 3’s renderer; choose a renderer at injection. | Zelos does not implement Scratch execution semantics, opcodes, costume UI or My Blocks UX. | [BRENDER](https://docs.blockly.com/guides/create-custom-blocks/renderers/overview/) · official docs · updated 2026-04-08 · **high** |
| Category and block colors | Theme block styles specify primary/secondary/tertiary colors and hat behavior; categories and components also have theme settings. | Style by semantic categories; test contrast and selection/disabled states. Rendering colors are not trademark permission. | [BTHEME](https://docs.blockly.com/guides/configure/appearance/themes/) · official docs · updated 2026-08-24 · **high** |
| Shape customization | Renderer controls block geometry; theme controls appearance attributes. | Do not expect a theme alone to reproduce all Scratch connectors, statement inputs and reporter shapes. | [BRENDER](https://docs.blockly.com/guides/create-custom-blocks/renderers/overview/) · official docs · updated 2026-04-08 · **high**<br>[BTHEME](https://docs.blockly.com/guides/configure/appearance/themes/) · official docs · updated 2026-08-24 · **high** |
| Custom block language | Define Brickgineers blocks and compile them to your own program model. | Proposed architecture: keep opcodes independent of labels/translations and attach a Scratch conformance-test ID to compatible blocks. [Semantics](01-scratch-runtime-semantics.md). | [BRENDER](https://docs.blockly.com/guides/create-custom-blocks/renderers/overview/) · official docs · updated 2026-04-08 · **medium** |
| Runtime highlights | Block IDs can be used as editor/runtime correlation keys in your own integration. | Proposal: keep tracing read-only; batch glow updates rather than triggering a render per executed instruction. Performance remains to be measured. | [BSER](https://docs.blockly.com/guides/configure/serialization/) · official docs · updated 2026-09-09 · **medium** |


## Plugin lookup table

| Feature / package | What is verified | Pitfalls / integration test | Evidence |
| --- | --- | --- | --- |
| Continuous palette · @blockly/continuous-toolbox | Always-open vertical flyout combines categories; click a category to jump or scroll. LTR and RTL. registerContinuousToolbox before injection; ContinuousFlyout, ContinuousMetrics, ContinuousToolbox. | Requires APIs introduced in v12; avoid collapsible categories. Test dynamic variables/My Blocks after switching brick definitions. | [BCONT](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/continuous-toolbox/README.md#L1-L73) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **high** |
| Recycling in continuous palette | Eligible blocks are moved/reused instead of reconstructed. Dynamic dropdowns, variables and mutations are excluded by default; custom recycling policy is possible. | Published35→25ms example is not device-specific evidence. Do not recycle stateful custom fields without reinitialization tests. | [BCONT](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/continuous-toolbox/README.md#L1-L73) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **high** |
| My Blocks foundation · @blockly/block-shareable-procedures | Explicit backing procedure models; sharing between workspaces; uses same block names as built-in procedure blocks. | Own Scratch signature builder, argument bubbles, warp flag and runtime call behavior still needed. Sharing a model accidentally across unrelated brick definitions is a scoping bug. | [BPROC](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/block-shareable-procedures/README.md#L1-L34) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **high** |
| Keyboard / accessibility | Core navigation supports cursor movement, insertion/move workflows and toolbox access; optional navigation shortcuts can be registered. | Test all custom fields, flyout, modals and menus using keyboard and screen reader. Do not assume plugin installation makes the whole game accessible. | [BKEY](https://docs.blockly.com/guides/configure/keyboard-nav/) · official docs · rolling page checked 2026-09-30; contains stale v13-future wording · **high**<br>[BREL](https://github.com/RaspberryPiFoundation/blockly/releases/tag/blockly-v13.3.0) · official docs · 13.3.0, 2026-09-10 · **high** |
| Workspace search · @blockly/plugin-workspace-search | WorkspaceSearch(workspace).init(); Ctrl/Cmd-F, Escape, previous/next/highlight, disposal and custom action controls. | Browser find shortcut collision; reset search after changing the edited brick; ensure focus returns correctly. | [BSEARCH](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/workspace-search/README.md#L1-L95) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **high** |
| Zoom to fit · @blockly/zoom-to-fit | ZoomToFitControl(workspace).init(); dispose/position/bounding-rectangle API. | A fit button can shrink large programs beyond legibility; retain reset-to-readable-scale and selected-stack focus as proposed UX. | [BZOOM](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/zoom-to-fit/README.md#L1-L50) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **high** |


## My Blocks: separate three layers

| Layer | Proposed responsibility | Evidence / rationale |
| --- | --- | --- |
| Signature authoring | Child chooses labels and number/text/Boolean arguments; editor builds definition and calls. | Shareable procedures provide backing models, not proof of Scratch’s exact signature UX. [BPROC](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/block-shareable-procedures/README.md#L1-L34) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **medium** |
| Program representation | Stable procedure ID, ordered parameter IDs, display names, defaults and warp flag; calls reference ID. | Proposed independent IR. Avoid making display text the only identity and preserve migrations. [BSER](https://docs.blockly.com/guides/configure/serialization/) · official docs · updated 2026-09-09 · **medium** |
| Execution | Evaluate arguments once, create call frame, respect Scratch parameter scope, recursion yields and stop-this-script return behavior. | Use [P01–P07 fixtures](01-scratch-runtime-semantics.md), not Blockly’s standard JavaScript/Python procedure semantics. |
| Copy/paste/import | Copy definition+calls together or explicitly resolve a shared definition; no silent reference to another brick’s private procedure. | Backing models make cross-workspace sharing possible, so namespace isolation is your responsibility. [BPROC](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/block-shareable-procedures/README.md#L1-L34) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **medium** |


## JSON persistence and upgrades

| Question | Verified answer / proposed safeguard | Evidence |
| --- | --- | --- |
| Which serialization? | Blockly recommends JSON; XML is iceboxed rather than the recommended extensible path. | [BSER](https://docs.blockly.com/guides/configure/serialization/) · official docs · updated 2026-09-09 · **high** |
| Load order | Serializers restore dependencies such as variables and procedures before blocks; block-extra-state and custom serializers participate. Top-level block order is not a portable execution-order contract. | [BSER](https://docs.blockly.com/guides/configure/serialization/) · official docs · updated 2026-09-09 · **high** |
| Stable forever? | No unconditional all-future-version JSON compatibility promise was verified. Custom fields, mutations and plugins add their own state obligations. | [BSER](https://docs.blockly.com/guides/configure/serialization/) · official docs · updated 2026-09-09 · **medium** |
| Durable project format | Proposal: outer schemaVersion, engineSemanticsVersion, editorVersion, pluginVersions, definition IDs, placements, assets and an independent IR; retain original saved payload before migrations. | Design inference; JSON’s extensibility does not replace application migrations. [BSER](https://docs.blockly.com/guides/configure/serialization/) · official docs · updated 2026-09-09 · **medium** |
| Upgrade acceptance test | Proposal: golden corpus saved under prior versions → migrate → reopen → reserialize → compare normalized program/IDs and execution traces; test undo and round-trip text too. | No measured compatibility rate is claimed. [BSER](https://docs.blockly.com/guides/configure/serialization/) · official docs · updated 2026-09-09 · **medium** |
| Unknown blocks | Proposal: keep opaque original payload, show unsupported-block marker, prevent destructive save, offer recovery/export. | This is a Brickgineers policy, not a claim of automatic Blockly recovery. |


## Large workspaces and school-device test matrix

**No controlled benchmark for Blockly13.3 on the user’s school Chromebook fleet was found or run.** Do not turn “SVG gets slow” into an invented maximum block count. The following sizes are proposed test points, not supported capacity ratings.

| Scenario | Proposed measurements / controls | Basis |
| --- | --- | --- |
| 50 / 250 / 1,000 / 3,000 blocks | Load/serialize time, first-interaction delay, drag-frame p50/p95/p99, memory after repeated brick switches. Include deeply nested and many independent stacks. | Test design; release notes mention performance work but no fleet guarantee. [BREL](https://github.com/RaspberryPiFoundation/blockly/releases/tag/blockly-v13.3.0) · official docs · 13.3.0, 2026-09-10 · **medium** |
| Small vs full continuous palette | Measure open/switch/scroll cost with static, variable, procedure and costume fields; compare recycling on/off. | Plugin optimization and exclusions are documented. [BCONT](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/continuous-toolbox/README.md#L1-L73) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **high** |
| Editor and game together | Measure runtime step + editor drag + render; compare paused game, live preview, undocked full-screen play. | Proposed benchmark, not a measured recommendation for an engine. |
| One active workspace | Proposal: mount one editor for the selected brick, not one SVG workspace per painted instance; preserve programs offscreen as data. | Architectural inference; measure switch cost before adopting caching. |
| Touch / iPad | Verify long-press menus, drag-vs-scroll, pinch zoom, soft-keyboard viewport, text fields, orientation, Pencil, two-finger gestures and accidental page scrolling. | Current browser/device support matrix was not fully verified. Passing desktop mouse tests is insufficient. |
| Accessibility | Keyboard-only create/edit/connect/delete/undo; screen-reader names/state; focus restoration; no color-only feedback. | Core support is a starting point, not a product-level audit. [BKEY](https://docs.blockly.com/guides/configure/keyboard-nav/) · official docs · rolling page checked 2026-09-30; contains stale v13-future wording · **high** |


## Known implementation traps

| Trap | Preventive rule (proposed) | Evidence |
| --- | --- | --- |
| Two Blockly copies in bundle | Resolve one core instance and compatible peer ranges; plugin registrations must target that instance. | Integration check, not a reproduced bug in this build. |
| Re-registering blocks/plugins on each UI render | Initialize once, dispose workspace/plugin resources on unmount, preserve identity across selection changes. | Plugins expose initialization/disposal hooks. [BSEARCH](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/workspace-search/README.md#L1-L95) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **high**<br>[BZOOM](https://github.com/RaspberryPiFoundation/blockly-samples/blob/d27a96788fc971899659de249a906b807755420e/plugins/zoom-to-fit/README.md#L1-L50) · source code/documentation at pinned commit · d27a96788fc971899659de249a906b807755420e; 2026-09-10 · **high** |
| Saving only generated text | Persist authoritative IR and editor metadata; text generation is a view unless the supported parser succeeds. | [Blocks ⇄ text](06-blocks-text.md); serialization is an editor-state facility. [BSER](https://docs.blockly.com/guides/configure/serialization/) · official docs · updated 2026-09-09 · **medium** |
| Conflating renderer with semantics | Rounded blocks and matching colors do not establish Scratch coercion, concurrency or clone behavior. | [Scratch fixtures](01-scratch-runtime-semantics.md). |
| Hidden instance scope | Editor title should say whether code is shared; variable inspector should distinguish definition defaults from this copy’s current values. | Proposed safeguard from [object model precedents](02-object-instance-models.md). |


## Unresolved

| Unknown | How to verify |
| --- | --- |
| Core13.3 + all pinned plugin compatibility | Install exact versions with a lockfile; inspect peerDependencies and run combined browser tests. No tested package combination is supplied here. |
| Exact scratch-blocks historical fork base and migration date | Inspect old tags and migration PRs; current package proves modern dependency usage but not its full ancestry. |
| Full supported browser/iPad matrix | Use current Blockly support policy and test your managed ChromeOS/Safari versions; retain device and browser build IDs. |
| Screen-reader completeness and touch parity | Run assistive-technology tests on the final custom renderer, fields, toolbox and surrounding UI, not only Blockly demos. |
| Cross-version persistence and real-device capacity | Run the golden-corpus migration suite and the proposed performance matrix. No numerical capacity claim has been verified. |

