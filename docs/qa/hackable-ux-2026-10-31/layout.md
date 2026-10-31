# Layout lane (2026-10-31)

Branch `claude/hackable-ux-layout`. Files: `studio/screen/StudioShell.tsx`, `studio/screen/screen.css`, one guarded
line in `studio/Stage.tsx` (item 7, its own commit), tests in `studio/screen/StudioShell.test.tsx`.

Checked in headless Chrome (Vite 5192, guest) at Duo single 540×720, Duo spanned 1114×720 (with and without a
CDP-emulated hinge at x 540–574), Duo spanned portrait 720×1114, iPad 810×1080 / 1080×810, phone 390×844 and 844×390,
Chromebook 1366×768 and desktop 1440×900. Scripts and shots: the lane's scratchpad `layout/` folder.

| Item | Status | What changed | How verified |
|---|---|---|---|
| 1 [1·4] Undo/Erase hidden on Duo single and phones | fixed | Phone layouts (≤767 px) get a bar under the level: Bricks · Erase · Undo, outside the inert sheet. | Unit test; Duo single: Erase → tap a coin (10→9 copies) → bar Undo (→10). |
| 2 [1·7 button] Bricks button over the Hero's start | fixed | The bar sits below the level (the stage ends 64 px higher), so nothing floats over the level. | Duo single: Hero at y 590, bar 666–712; phone and spanned portrait likewise. |
| 3 [1·5] Duo spanned ignores the hinge | fixed (landscape span) | `@media (horizontal-viewport-segments: 2)` with `env(viewport-segment-*)` (fallback 50vw): drawer, inspector and Code on the left screen, the level on the right; toasts, hints and the win card centered on the right screen. | Hinge emulated via CDP `displayFeature`: Code column 12–528, Costumes tab 361–446, stage 586–1102; Play's Pause 687–759. A vertical-segments (portrait span) layout is not done. |
| 4 [1·6] Landscape d-pad on the Hero | fixed | On touch, Play always reserves a dark strip under the level for the buttons (152 px sideways, 160/212 upright as before); short sideways screens (<560 px tall) put the buttons either side instead. | Spanned: Hero 139,512, pad 578–702; iPad landscape: Hero 135,604, pad 668+; phone 844×390: level 224–620, pad and buttons beside it. |
| 5 [1·13] Code off on Duo single and spanned portrait | fixed | Code's gate is now width < 540 px (phones only). 540–767 px stack the small level and "In this level" over the palette and scripts. | Unit test; screenshots at 540×720 and 720×1114 show Code with blocks, tabs and the level. |
| 6 [1·14] Touchscreen laptop gets no Play buttons | fixed | Touch buttons show on `(any-pointer: coarse)` or after the first `pointerType: 'touch'` press; CSS keys off `.cl-touch`, not `(pointer: coarse)`. | Unit tests; 1366×768 with fine pointer: no buttons, then a touch pointerdown → d-pad and Jump appear and the level shrinks above them. |
| 7 [4·10, 1·12] Play camera unhooks after a click or slip | fixed | `Stage.updateView` ignores drags, wheel and zoom in Play (Code's small preview keeps its pan); Play hides the Zoom group (Whole level / Follow the Hero remain). | Unit test (fails without the change); spanned touch slip and a wheel keep Follow pressed and the Hero in view; Build's camera unchanged. |

Notes
- Item 7 touches `Stage.tsx` (touch lane) in one guarded line at the top of `updateView`, in its own commit, so it can
  be dropped or re-applied if it conflicts with the touch lane's pointer rewrite.
- Desktop: Build and Code measure the same as before; Play loses + / − / Fit (follow or whole level only).
- Not changed: while painting or erasing on a phone, the paint strip still sits over the bottom of the level (as before).
- Real devices not tested: the Duo hinge is CDP emulation; a touchscreen Chromebook was simulated with a fine pointer
  plus a touch pointer event.
