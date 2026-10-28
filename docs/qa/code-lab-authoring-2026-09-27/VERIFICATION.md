# Code Lab authoring pass — 2026-09-27

Local worktree: `codex/code-lab-freedom`. Preview: http://127.0.0.1:5192/2d/lab . No deployment or merge performed.

## Verified

- All 89 lab tests across 14 files pass. Production `npm run build` passes; existing bundle-size warnings remain.
- Chrome browser: painted a character frame, renamed it, duplicated it, reset code, reloaded, and confirmed both named frames remained. Created `lapCount` through Make a Variable and `boost(speed)` through Make a Block; changed tabs and reloaded, then confirmed both in their palettes and the definition in the workspace.
- Opened Try a project → Start car, confirmed the editable program exposes key sensing, state, controls, physics and positioning blocks.
- Viewed production preview in the in-app browser, including character artwork and Code / Costumes / Sounds tabs. Screenshot: `costume-editor.png`.
- Fixed narrow-screen editor/stage overlap found during browser testing.
- Car runtime tests cover boarding, driving, wall collision, rider alignment, exiting, and two-car ownership. Car driving was verified in the runtime harness, not a complete browser keyboard rehearsal.
- Costume regression tests cover a stroke beginning on an unchanged pixel. Code reset now preserves painted artwork.

## Scope limits

This is the isolated local Code Lab, with browser-local persistence. It does not prove signed-in save/share, classroom collaboration, or iPad behavior. Costumes support pixel editing and individual frames; external sprite-sheet import, animation groups, and a full Scratch-compatible runtime are not implemented. Sounds currently previews the built-in sound library.
