# 8 · Licensing, trademark and brand

[← Index](INDEX.md) · **P3** · Research snapshot: **2026-09-30**

Evidence cells apply to the factual claims in their row. “Proposed” means a Brickgineers design or test recommendation, not an observed product capability. Unknowns are not negative capability claims.

**Engineering/legal reference, not a legal opinion.** Review actual distributed files, dependencies, assets and deployment with counsel before release.

## Current component license lookup

| Component | Verified license / version | Evidence |
| --- | --- | --- |
| scratch-vm | Current monorepo package @scratch/scratch-vm 15.2.0: AGPL-3.0-only. | [LVM](https://github.com/scratchfoundation/scratch-editor/blob/7a3e55ee9b2aa70c513619494c590c878c8a2e8f/packages/scratch-vm/package.json#L1-L15) · source code at commit hash · 7a3e55ee9b2aa70c513619494c590c878c8a2e8f; package 15.2.0; 2026-09-30 · **high**<br>[LROOT](https://github.com/scratchfoundation/scratch-editor/blob/7a3e55ee9b2aa70c513619494c590c878c8a2e8f/LICENSE#L1-L35) · source code at commit hash · 7a3e55ee9b2aa70c513619494c590c878c8a2e8f; AGPL v3 text · **high** |
| scratch-gui | Current monorepo package @scratch/scratch-gui 15.2.0: AGPL-3.0-only. | [LGUI](https://github.com/scratchfoundation/scratch-editor/blob/7a3e55ee9b2aa70c513619494c590c878c8a2e8f/packages/scratch-gui/package.json#L1-L15) · source code at commit hash · 7a3e55ee9b2aa70c513619494c590c878c8a2e8f; package 15.2.0; 2026-09-30 · **high** |
| scratch-render | Current monorepo package @scratch/scratch-render 15.2.0: AGPL-3.0-only. | [LRENDER](https://github.com/scratchfoundation/scratch-editor/blob/7a3e55ee9b2aa70c513619494c590c878c8a2e8f/packages/scratch-render/package.json#L1-L15) · source code at commit hash · 7a3e55ee9b2aa70c513619494c590c878c8a2e8f; package 15.2.0; 2026-09-30 · **high** |
| scratch-blocks | Separate package 2.1.24 declares Apache-2.0; do not infer its license from the editor monorepo. | [LSB](https://github.com/scratchfoundation/scratch-blocks/blob/8d6b18f6d05bb97d39bec2bb3c85e65a95d451bd/package.json#L1-L10) · source code at commit hash · 8d6b18f6d05bb97d39bec2bb3c85e65a95d451bd; package 2.1.24; checked 2026-09-30 · **high** |
| Blockly | 13.3.0 license file: Apache License 2.0. | [LBL](https://github.com/RaspberryPiFoundation/blockly/blob/bf35c82fce034a7728d07c7827a513b2a3073a1b/LICENSE#L1-L25) · source code at commit hash · Blockly 13.3.0, 2026-09-10; bf35c82fce034a7728d07c7827a513b2a3073a1b · **high** |


## License-change chronology

| Component | Verified repository change | Qualification | Evidence |
| --- | --- | --- | --- |
| VM | 2024-11-25: commit explicitly changes license to AGPL-3.0-only. | Its immediately preceding LICENSE is the BSD three-condition text. A historical checkout is not permission to take later changes under the old license. | [LVMCHANGE](https://github.com/scratchfoundation/scratch-vm/commit/1076712c3f35cfb666dfd452d036907a4164741f) · source code at commit hash · 2024-11-25T16:13:04Z · **high**<br>[OLDVM](https://github.com/scratchfoundation/scratch-vm/blob/a63f3899bfbded7c9b1c9a7ce840bafb08957482/LICENSE#L1-L12) · source code at commit hash · parent of 2024-11-25 license-change commit · **high** |
| GUI | 2024-11-25: explicit AGPL-3.0-only change. | Exact first npm release carrying the change was not verified. | [LGUICHANGE](https://github.com/scratchfoundation/scratch-gui/commit/3de24da0f9e46307903a74695a6183d4a6035d9c) · source code at commit hash · 2024-11-25T16:16:18Z · **high** |
| Renderer | 2024-11-25: explicit AGPL-3.0-only change. | Exact first npm release carrying the change was not verified. | [LRENDERCHANGE](https://github.com/scratchfoundation/scratch-render/commit/27efa6029e8f60e10f4dc8b4f164861d95b6656a) · source code at commit hash · 2024-11-25T16:08:08Z · **high** |
| Blocks / Blockly | Current files remain Apache-2.0. | No recent license change was established for these two; that is not an exhaustive audit of all history. | [LSB](https://github.com/scratchfoundation/scratch-blocks/blob/8d6b18f6d05bb97d39bec2bb3c85e65a95d451bd/package.json#L1-L10) · source code at commit hash · 8d6b18f6d05bb97d39bec2bb3c85e65a95d451bd; package 2.1.24; checked 2026-09-30 · **high**<br>[LBL](https://github.com/RaspberryPiFoundation/blockly/blob/bf35c82fce034a7728d07c7827a513b2a3073a1b/LICENSE#L1-L25) · source code at commit hash · Blockly 13.3.0, 2026-09-10; bf35c82fce034a7728d07c7827a513b2a3073a1b · **high** |


## What the September 2026 trademark guidance says

| Use | Guideline / boundary | Evidence |
| --- | --- | --- |
| Product, company, domain or account name | Do not put Scratch marks in these names without a specific license. Keep Brickgineers / Code Lab as the product identity. | [BRAND](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000232107-scratch-trademark-guidelines) · official docs · updated 2026-09-14 · **high** |
| Descriptive reference | Truthful reference is permitted without implying affiliation; “works with Scratch” must actually be true. The guidance expressly rejects misleading compatibility claims. | [BRAND](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000232107-scratch-trademark-guidelines) · official docs · updated 2026-09-14 · **high** |
| Disclaimer | The guidance recommends a clear statement of non-affiliation and non-endorsement. | [BRAND](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000232107-scratch-trademark-guidelines) · official docs · 2026-09-14 · **high** |
| Scratch Cat, logo and character marks | The list includes Scratch/ScratchJr wordmarks, logos, Cat/Kitten and named character graphics. Do not use them as Code Lab branding. | [MARKLIST](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000232108) · official docs · updated 2026-09-14 · **high**<br>[MARK](https://github.com/scratchfoundation/scratch-editor/blob/7a3e55ee9b2aa70c513619494c590c878c8a2e8f/packages/scratch-vm/TRADEMARK#L1) · source code at commit hash · 7a3e55ee9b2aa70c513619494c590c878c8a2e8f · **high** |
| Block colors and shapes | The illustrative trademarks list does not specifically enumerate every block shape/color. Absence is not a legal clearance or permission to clone overall trade dress. | Scope observation / unresolved legal application · [MARKLIST](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000232108) · official docs · updated 2026-09-14 · **medium** |
| “Scratch-like” wording | No exact blanket approval for this phrase was verified. Use accurate descriptive language and avoid implying file/runtime compatibility beyond tested support. | Application requires review · [BRAND](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000232107-scratch-trademark-guidelines) · official docs · updated 2026-09-14 · **medium** |
| Conflicting older terms | The September guidelines say they govern trademark-use conflicts with Terms of Service. For software licensing, inspect the component license rather than infer everything from marketing text. | [BRAND](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000232107-scratch-trademark-guidelines) · official docs · updated 2026-09-14 · **high**<br>[STOS](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000219182-scratch-terms-of-service) · official docs · updated 2026-01-22; §7 and §8 · **high** |


## Own runtime versus code reuse

| Situation | Action / implication | Evidence |
| --- | --- | --- |
| Behavior research | Use §1 as a specification and test oracle; retain source provenance. Whether particular copied implementation or test code creates a derivative-work obligation is a legal question, not solved by renaming files. | Proposed process; license boundary in [LROOT](https://github.com/scratchfoundation/scratch-editor/blob/7a3e55ee9b2aa70c513619494c590c878c8a2e8f/LICENSE#L1-L35) · source code at commit hash · 7a3e55ee9b2aa70c513619494c590c878c8a2e8f; AGPL v3 text · **high** |
| Copying current VM / renderer implementation | Do not treat current Scratch internals as permissively licensed snippets merely because an old blog says “BSD.” | Engineering implication of [LVM](https://github.com/scratchfoundation/scratch-editor/blob/7a3e55ee9b2aa70c513619494c590c878c8a2e8f/packages/scratch-vm/package.json#L1-L15) · source code at commit hash · 7a3e55ee9b2aa70c513619494c590c878c8a2e8f; package 15.2.0; 2026-09-30 · **high**<br>[LRENDER](https://github.com/scratchfoundation/scratch-editor/blob/7a3e55ee9b2aa70c513619494c590c878c8a2e8f/packages/scratch-render/package.json#L1-L15) · source code at commit hash · 7a3e55ee9b2aa70c513619494c590c878c8a2e8f; package 15.2.0; 2026-09-30 · **high**<br>[LVMCHANGE](https://github.com/scratchfoundation/scratch-vm/commit/1076712c3f35cfb666dfd452d036907a4164741f) · source code at commit hash · 2024-11-25T16:13:04Z · **high** |
| Modified official editor exposed over a network | Foundation guidance describes an obligation to offer modified full source; AGPL terms, not this summary, govern the precise scope. | [BRAND](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000232107-scratch-trademark-guidelines) · official docs · updated 2026-09-14 · **high** |
| Blockly plus independently implemented runtime | Blockly’s Apache license is distinct from Scratch VM’s AGPL. Audit every added plugin/dependency; do not infer an application-wide license from one package. | Proposed compliance practice; [LBL](https://github.com/RaspberryPiFoundation/blockly/blob/bf35c82fce034a7728d07c7827a513b2a3073a1b/LICENSE#L1-L25) · source code at commit hash · Blockly 13.3.0, 2026-09-10; bf35c82fce034a7728d07c7827a513b2a3073a1b · **high**<br>[LSB](https://github.com/scratchfoundation/scratch-blocks/blob/8d6b18f6d05bb97d39bec2bb3c85e65a95d451bd/package.json#L1-L10) · source code at commit hash · 8d6b18f6d05bb97d39bec2bb3c85e65a95d451bd; package 2.1.24; checked 2026-09-30 · **high** |
| Costumes, sounds, example projects | Current Terms §7.2 says applicable asset licenses govern support materials. Do not assume every current asset or user project is universally reusable under one historical license. | [STOS](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000219182-scratch-terms-of-service) · official docs · updated 2026-01-22; §7 and §8 · **high** |


## Compatibility language: observed examples and a proposed Code Lab pattern

| Product / context | Evidence-backed description | Suggested lesson | Evidence |
| --- | --- | --- | --- |
| TurboWarp | Its documentation positions it as a Scratch mod and documents differences/settings. | Separate affiliation, compatibility and optional extensions; link an explicit differences page. | [TWABOUT](https://docs.turbowarp.org/) · official docs · rolling docs checked 2026-09-30 · **medium** |
| Blockly Zelos | An editor renderer can resemble Scratch without supplying Scratch’s runtime. | Do not equate visual similarity with behavior or .sb3 import/export support. | [§3 Blockly](03-blockly-editor.md) · primary documentation synthesis · 2026-09-30 · **high** |
| Code Lab — proposed copy | “A block-based platformer maker. Selected blocks follow documented Scratch behavior; supported blocks and exceptions are listed in our compatibility guide. Independently developed; not affiliated with or endorsed by the Scratch Foundation.” | Use only after publishing the supported subset and running the tests. Do not claim “fully Scratch-compatible” yet. | Proposed wording, not legal clearance; [BRAND](https://mitscratch.freshdesk.com/en/support/solutions/articles/4000232107-scratch-trademark-guidelines) · official docs · updated 2026-09-14 · **medium** |


## Unresolved

| Gap | How to resolve |
| --- | --- |
| Precise legal boundary of clean-room behavior implementation | Have counsel review implementation provenance, copied expressions, tests and assets. This library is not a clean-room legal certification. |
| Full block-shape/color trade-dress clearance | Send representative screenshots and proposed copy to Foundation trademark contact and counsel; do not infer permission from the illustrative list. |
| First release dates for 2024 license changes | Inspect release tags/npm tarballs around the three pinned commits; record LICENSE and package metadata for each distributed dependency. |
| Other forks’ exact compatibility claims | TurboWarp is an inspected example; broader comparative marketing-language audit was not completed. |
| Asset redistribution | Create a per-asset manifest with creator, source, license version, attribution and permission scope before bundling any Scratch-origin art/audio. |

