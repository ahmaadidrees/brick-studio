# Focused Code Lab UI cleanup

2026-10-15. Local preview: http://127.0.0.1:5280/2d/lab/next

This pass implements the owner's approved cleanup after Slice 1. No production deployment or cloud/document changes.

## What changed

- Building: a compact 300px card displays sliders directly, retains All copies / Just this one and reset, and offers a prominent See inside action. Look is a small appearance action. The card sizes to its content.
- Coding: the drawer, placing strip and building undo cluster unmount completely. The stage occupies 42% of the screen; code defaults to 58%, using full available height. Code resizing has its own preference.
- One compact brick header; a small dismissible remix hint; a single code Undo/Redo/options row. Variable/List/Block creation lives in the corresponding palette category. Tidy/Center/Zoom live in the options menu.
- No permanent My Blocks shelf. Calls still have definition navigation, the palette can open every definition (including unused ones), and drill-in has a Back breadcrumb.
- Code preview shows only Pause/Restart. Changes apply on Restart appears only when the program differs from the active run; live sliders/layout changes do not trigger it. Code Undo returning to the running program clears the note.
- Visible labels are included in fit/Center bounds so the first script label is not clipped.

## Browser evidence: actual 1366 x 768

A dedicated Chrome test tab was set to 1366x768 and `document.documentElement.clientWidth/clientHeight` confirmed those exact values. Both saved JPEG screenshots are also 1366x768 pixels. This avoids the previous in-app browser's 120% zoom/capture mismatch. Temporary viewport overrides were reset after review.

- [Focused code](focused-code-1366x768.jpg): stage 574px wide, code panel 792px wide, both 703px tall below the app header. Actual Blockly area 775x585 with hint dismissed (546px tall with hint visible).
- [Compact sliders](compact-sliders-1366x768.jpg): 300px card with no empty full-height white column.
- [Measured bounds](viewport-metrics.json): no drawer, placing strip or builder history elements exist in the coding screen.

Exercised in the browser: open code; pause/resume; My Blocks palette -> open definition -> Back; Variables palette exposes Make a Variable and Make a List; numeric edit produces pending Restart; code Undo removes it; dismiss hint; options -> Center; return to sliders. The code edit was undone in the QA tab.

## Checks

- Full Code Lab suite: 92 files, 1,225 passing tests plus 25 intentional expected-failure negative controls.
- Final label-fit adjustment: 10 focused affordance tests pass, including the added label-bounds regression. TypeScript and production build pass after the adjustment.
- `git diff --check` passes.
- Existing runtime, save recovery, remix/reset and Restart-flush behavior retained. Runtime/physics files were not changed in this pass.

The next check is the owner's local usability playtest. Real Chromebook performance profiling, cloud saves, rooms, and production integration remain outside this UI pass.
