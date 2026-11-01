# Costume lane: Hackable UX fix pass (2026-10-31)

Branch `claude/hackable-ux-costume`, files: `studio/CostumeEditor.tsx`, `studio/assets/assets.css`,
`studio/assets/CostumeEditor.test.tsx`.

## [4·2] Undo never works in the costume editor: fixed

- **Why it was broken (two bugs):**
  - Saving a stroke changed the costume's `asset`. That re-ran the load effect, which cleared the history.
  - The history stored each picture *after* its edit, so the first Undo brought back the picture already on screen.
  - There was also no key binding.
- **Change:**
  - The editor reloads only when another costume is picked, or when this costume changes outside the editor. It
    remembers the asset it last saved.
  - Every edit pushes the picture from before it: strokes, erases, fills, lines, rectangles, resizes, rotation-point
    drags and Center.
  - Clicks that change nothing are not recorded.
  - A picture refused as too big no longer wipes the history.
  - Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo. Keys are ignored while typing, in a dialog or mid-stroke.
  - The editor has no "clear" action, so there is nothing to wire up for clears.
- **Verified:**
  - Unit tests cover the buttons (stroke, fill and erase, each undone and redone), the keys, and resize undo.
  - In headless Chrome at 1366×768 with the mouse, the Undo and Redo buttons, Ctrl+Z, Ctrl+Shift+Z, Cmd+Z and Ctrl+Y
    each restore or reapply the exact picture (compared at pixel centres).
  - Fill and erase undo and redo correctly.
  - The edited costume is the same after a reload.

## [1·10] A costume pinch draws a line and does not zoom: fixed

- **Change:**
  - Pointers are tracked on the viewport, and one pointer draws.
  - When a second finger lands, the stroke is cancelled with no mark and no save, and the touch becomes pinch-zoom and
    pan around the fingers (zoom 1–32).
  - The zoom and scroll update once per animation frame, because fingers report their moves one at a time.
  - One finger beside the picture pans.
  - `onPointerCancel` drops the stroke, and the rotation handle also handles cancel.
  - Fill applies when the finger lifts, so a pinch never fills.
  - A second touch anywhere on the page cancels the stroke and joins the pinch. On a portrait iPad the editor is only
    about 210 px wide, so the second finger often lands outside it.
- **CSS:**
  - The viewport has `touch-action: none`.
  - The canvas is centred with `margin: auto`, so a zoomed picture can be scrolled to every edge. Flex centring used
    to clip the left and top.
- **Verified:**
  - Unit tests cover the second-finger cancel, a second finger outside the editor, pinch zoom and pointercancel.
  - CDP touch was run at iPad landscape (1024×768), iPad portrait (768×1024) and Duo spanned (1114×720). In each:
    - a one-finger stroke paints;
    - a pinch-out leaves the picture unchanged (no line) and zooms from 14× to 32×;
    - a two-finger pan scrolls the view;
    - a pinch-in zooms from 32× to 8× without changing the picture.

## Pale sky after painting a Stage backdrop: diagnosed, not in costume code (not changed)

- **Where:** `studio/stage/renderer.ts`, in the Build renderer (about lines 97–110) and the Play renderer (about lines
  209–221).
- **What happens:** once `stage.costumes[0].asset` exists, the renderer fills the level with the flat `SKY = '#cfe8f7'`.
  That is the reported rgb(207, 232, 247). It then skips `drawSky()` (the day sky, hills and clouds) and stretches the
  mostly transparent 480×360 backdrop over the whole level.
- **Suggested fix for the Stage/renderer owner:** call `drawSky()` before drawing the backdrop, so painted pixels sit
  on top of the day sky.
- **Product decision:** whether a painted backdrop should replace the scenery or sit on top of it.
