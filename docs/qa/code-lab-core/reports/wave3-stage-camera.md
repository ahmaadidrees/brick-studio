# Wave 3 report: stage-camera

Files changed: `studio/Stage.tsx`, `studio/stage/camera.ts`, `picking.ts`, `StageControls.tsx`, and tests `camera.test.ts`, `picking.test.ts`, `Stage.test.tsx`. No store, shell, CSS or core changes.

## Results (all from `npx vitest run src/platformer/lab`: 58 files, 550 tests pass; `npx tsc --noEmit -p tsconfig.app.json` clean)

| Item | What changed | Test that proves it |
| --- | --- | --- |
| Ghost 100 picking (H04/L06) | `pickTarget` skips targets with `effects.ghost >= 100`. The tests were committed failing first (2 failed), then the fix. | `picking.test.ts`: "ghost 100 target is not clickable: the target beneath is picked", "ghost 100 alone falls through to the stage", "ghost 99 is still clickable" |
| Fit shows whole level, letterboxed | `fitCamera`/`fitZoom` in `camera.ts`; Stage auto-fits until the kid moves the view; the Fit button refits. Tested for 4 level sizes x 5 canvas sizes: whole level inside canvas, tighter axis touches edges, centered. | `camera.test.ts`: "fit shows the whole level inside WxH for <level>" (20 cases), "fit on the default level in a wide stage shows all 960 steps (x = 480..960 visible)" |
| Play camera default | `defaultPlayCameraMode`: whole level if fit scale >= 0.5 px/step, else follow. | "readable threshold: whole level at 570 px wide ... is readable, 300 px is not" |
| "Camera follows" choice | "Whole level" / "Follow brick" buttons in Play (follows the first non-clone copy of the selected brick; falls back to level center). Clamped at level edges. View state is UI-only. | `camera.test.ts` "follow clamping" (5 tests: middle, left edge, right edge, vertical, axis larger than level); `Stage.test.tsx` "Play shows a 'camera follows' choice: whole level by default, switchable to follow brick" |
| Zoom keeps center steady | +/- call `zoomCameraAt` with the view center as anchor (that function already did this; Stage now uses it in both modes). | "zoom around the view center keeps the center world point steady", "zoom around center is steady for an off-center camera too" |
| Drag-to-scroll | Build: select tool dragging empty space, Alt/middle-drag in any tool, wheel. Play: dragging empty stage scrolls, Alt/middle-drag, wheel. Scrolling is clamped to level + 200 margin (`clampCamera`). | No automated test for the pointer drag itself (jsdom has no canvas); `panCamera` math is covered by existing `camera.test.ts` pan tests. Browser check below. |

## Behavior notes and limits

- In Play, a plain click on empty stage now fires the stage click on release, not on press, so a drag can scroll instead. Clicks on sprites still fire on press. This is a small timing change for the stage only.
- Brush tool drag in Build paints (unchanged), so scrolling with the brush needs Alt or middle-drag, or the wheel.
- Hand-scrolling or zooming in Play switches to a free camera (neither choice highlighted); pressing a choice or Fit returns to it.
- No test covers the Stage component's drag-scroll or the follow camera rendering in a real canvas.

## Browser check (port 5293)

I ran the dev server and drove `http://localhost:5293/2d/lab/next` in the in-app browser. Observed:
- Build: the whole 960 x 360 level is visible, letterboxed in the stage panel.
- Play on the narrow stage (below 0.5 px/step) defaulted to follow; "Whole level" showed the whole level; dragging on empty stage scrolled the view and left both camera buttons unpressed (aria-pressed false, false); clicking "Whole level" again set it pressed.
- Not checked in the browser: Follow-brick clamp at the right edge, wheel zoom, Alt-drag, and Build-mode drag-to-scroll. The dev server was stopped afterward.
