# Scratch Blocks compatibility spike (2026-09-27)

## Scope

Read-only inspection of `/Users/ahmaadidrees/.codex/worktrees/code-lab-freedom/Virtual Legos` plus an isolated install under `/private/tmp/scratch-blocks-spike.m8pkdB`. No repository files, manifests, lockfiles, or dependencies were changed. This is not a browser/rendering test or migration test.

## Findings

- Current Code Lab uses `blockly@13.3.0` and imports Blockly directly from `blockly/core`. Its workspace JSON is interpreted by the `lab_*` compiler; its Blockly setup registers `lab_*` definitions and uses the Zelos renderer. See `src/platformer/lab/ui/blocklySetup.ts` and `src/platformer/lab/program/compile.ts`.
- The official package is named `scratch-blocks` (current inspected npm release 2.1.19; not `scratch-blocks2`). Its package metadata declares `blockly: ^12.4.1`, plus `@blockly/continuous-toolbox` and `@blockly/field-colour`. A clean isolated install resolved Blockly 12.5.1.
- Headless smoke check: registered custom `lab_when_appear` and `lab_set_speed` blocks against the Scratch package export, created a connected stack and `math_number` input, serialized with Blockly workspace JSON, restored, and serialized again. Types/field value survived and JSON before/after matched. This proves basic custom block definitions and workspace JSON round-trip on the package's Blockly 12.5.1 runtime; it does not prove Blockly 13 compatibility, UI rendering, visual fidelity, or compiler interoperability.
- With both dependencies in the same isolated install, npm retained two runtimes: app `blockly@13.3.0` and nested `scratch-blocks` `blockly@12.5.1`. Their exported `Block` constructors were not identical. This is a concrete integration blocker: blocks/registries/workspaces created through one runtime cannot be assumed to belong to the other, and Scratch's `inject()` operates on the Blockly copy imported inside `scratch-blocks`.
- `scratch-blocks` exports `inject(container, options)` and Scratch-standard blocks/fields/themes. Source shows its `inject()` registers Scratch-specific fields and toolbox/flyout plugins, sets renderer to `scratch_classic` or `scratch_cat_blocks`, and changes Blockly global drag/snap settings. This overlaps with Code Lab's existing Zelos theme, custom category rail, and custom dynamic dropdowns. Even with version alignment, adopting its full injection path means reconciling those choices and testing actual rendering/interaction.

## Reuse opportunities

- Preserve the existing `lab_*` block types, JSON persistence, and compiler boundary. The successful smoke indicates the basic Blockly serialization shape is compatible with Scratch Blocks' Blockly 12 runtime; Scratch visuals do not require changing the domain compiler in principle.
- Borrow Scratch design ideas or selected definitions/fields, but avoid assuming the Scratch package is a drop-in theme. A custom set of lab domain blocks can remain the primary authoring vocabulary.
- An isolated Scratch Blocks surface (separate bundle/iframe) could avoid same-runtime registry collision if both Blockly versions need to coexist, at the cost of an explicit serialized-JSON boundary and more integration work.

## Recommendation for this pass

Keep Blockly 13.3.0 and the existing Zelos/`lab_*` implementation. Do not replace the dependency or call Scratch `inject()` in the current workspace yet. If Scratch's rendered editor becomes a product requirement, first choose a single Blockly runtime strategy (e.g. consciously align the app to Scratch Blocks' supported Blockly 12 line, or pursue a version-compatible Scratch Blocks release/isolated surface), then run browser-level proof on one representative dynamic-dropdown block, toolbox/category flow, theme/layout, workspace save/reopen, and existing lab compilation.

## Primary sources checked

- Scratch Blocks package metadata: https://github.com/scratchfoundation/scratch-blocks/blob/develop/package.json
- Scratch Blocks public API and `inject()` implementation: https://github.com/scratchfoundation/scratch-blocks/blob/develop/src/index.ts
- Official npm package/version overview: https://www.npmjs.com/package/scratch-blocks
