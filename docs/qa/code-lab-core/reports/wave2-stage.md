# Wave 2 Lane Report: Stage (Build and Play)

## 1. What Was Built and Where

The **stage** lane implements the visual stage viewport, the fixed-step simulation loop, Build and Play interaction modes, camera mathematics, copy authoring tools, and audio playback for Code Lab Wave 2. All components adhere strictly to the clean-room specification, the y-up coordinate system, deterministic fixed-step tick constraints, and the `contracts.ts` architecture.

### Files Owned and Built:

- `src/platformer/lab/studio/Stage.tsx`:
  - Complete Stage React component housing the Canvas2D surface, `ResizeObserver` viewport tracking, `requestAnimationFrame` render/tick loop, toolbar controls, pointer events, keyboard routing, and modal overlays.
  - In **Build mode**: renders design bounds, grid lines, painted copies, selection handles, and brush placement ghost preview. Handles copy selection, dragging, keyboard nudging with arrow keys (1 or 8 steps), and deletion via Backspace/Delete.
  - In **Play mode**: executes fixed-step accumulator updates at 30 TPS, emits runtime steps, routes Web Audio sound notes, updates mouse coordinates and clicks topmost targets, displays say/think bubbles, and renders question prompts.

- `src/platformer/lab/studio/stage/camera.ts` (and `camera.test.ts`):
  - **Single camera abstraction**: View width defaults to 480 steps (matching spec "Units" where level bounds are 960 × 360).
  - **Screen ⇄ World transformations**: Converts between screen coordinates (y-down) and world coordinates (y-up, origin at level bottom-left) with verified exact round-trip reversibility.
  - **Anchor-invariant zooming & panning**: `zoomCameraAt` zooms around an arbitrary screen coordinate anchor (e.g. mouse cursor) without jumping. `panCamera` translates world views with viewport clamping.
  - **Grid snapping**: `snapToGrid` snaps coordinates to 8-step increments for tidy tile placement.

- `src/platformer/lab/studio/stage/accumulator.ts` (and `accumulator.test.ts`):
  - **Fixed-step 30 TPS accumulator**: Manages exact 33.333ms ticks independently of browser display refresh rates (60Hz, 120Hz, 144Hz, or variable).
  - **Lag spike & pause protection**: Clamps frame deltas to at most 3 ticks (`maxDeltaMs = 100ms`). Supports `pause()` and `resume()` (connected to document `visibilitychange`), preventing catch-up bursts when returning to the tab.
  - **Pose interpolation**: Calculates normalized sub-tick fraction `alpha` in $[0, 1)$ for smooth sprite movement without simulation jitter.

- `src/platformer/lab/studio/stage/picking.ts` (and `picking.test.ts`):
  - **Top-to-bottom hit testing**: Iterates reverse draw order (`world.targets` in Play, `design.copies` in Build) to test topmost sprites first.
  - **Pixel-accurate masks**: Uses `opaqueAt` / `touchingPoint` from `geometry.ts` to test actual costume pixel occupancy. Transparent pixels fall through to lower sprites.
  - **Stage fallback**: Returns `world.stage` in Play mode when empty space is clicked.

- `src/platformer/lab/studio/stage/renderer.ts`:
  - **Image caching**: `ImageCache` decodes and caches `HTMLImageElement` instances per asset URL with change subscriptions.
  - **Build renderer**: Renders stage background, 16-step grid lines, level boundary rectangle with coordinate annotations, painted copies with selection dashed bounding box and handle grips, and semi-transparent brush preview.
  - **Play renderer**: Renders backdrop, live targets with sprite rotation styles (`all around`, `left-right`, `don't rotate`), ghost opacity (`globalAlpha`), brightness filters, previous-to-current tick pose interpolation, and comic say/think bubbles with tail pointers.

- `src/platformer/lab/studio/stage/keys.ts` (and `keys.test.ts`):
  - Maps browser `KeyboardEvent.key` values (`ArrowLeft`, `ArrowRight`, `ArrowUp`, `ArrowDown`, `Space`, `Enter`, letters `a-z`, digits `0-9`) to Scratch key names (`left arrow`, `space`, etc.) for `runtime.pressKey` and `runtime.releaseKey`.

- `src/platformer/lab/studio/stage/words.ts`:
  - Curated, kid-friendly picked word list (animals, colors, objects, actions) for prompt answer chips.

- `src/platformer/lab/studio/stage/audio.ts`:
  - `AudioManager` handling core runtime notes (`sound`, `stopSounds`).
  - Web Audio API `AudioContext` with `AudioBuffer` caching and HTMLAudioElement fallback. Applies volume scaling ($0..100$) and Scratch pitch shifting ($2^{\text{pitch}/120}$).

- `src/platformer/lab/studio/stage/KnobPanel.tsx`:
  - Floating card over selected copy in Build mode.
  - Displays brick title, delete button, and steppers ($\ge 40\text{px}$ touch targets for kids) or boolean toggle pills for variables declared with `showInBuild: true`. Calls `store.setKnob()`.

- `src/platformer/lab/studio/stage/AskDialog.tsx` (and `AskDialog.test.tsx`):
  - Modal prompt overlay displaying active questions from `sensing.ts` (`activeQuestion`).
  - Kid-friendly picked answer chips for quick selection, text input for custom answers, and submit action invoking `submitAnswer(runtime, answer)`.

- `src/platformer/lab/studio/stage/StageControls.tsx`:
  - Control bar with Green Flag (⚑), Play/Stop toggle, Mode badge (BUILD / PLAY), Brush tool, Select tool, 8-step Grid Snap toggle, Zoom in/out, and Fit reset.

- `src/platformer/lab/studio/stage/stage.css`:
  - Polished dark-mode UI styling matching Code Lab design standards, with accessible focus states, responsive overlays, and kid-friendly button dimensions ($\ge 40\text{px}$).

---

## 2. Test Coverage & Verification

### Unit & Integration Tests

| Test Suite | File | Tests | Status |
| :--- | :--- | :--- | :--- |
| **Camera math** | `stage/camera.test.ts` | 9 | PASS |
| **Fixed-step accumulator** | `stage/accumulator.test.ts` | 4 | PASS |
| **Hit picking & transparency** | `stage/picking.test.ts` | 5 | PASS |
| **Keyboard mappings** | `stage/keys.test.ts` | 3 | PASS |
| **Ask dialog & answers** | `stage/AskDialog.test.tsx` | 2 | PASS |
| **Stage component & tools** | `stage/Stage.test.tsx` | 4 | PASS |
| **All core & studio tests** | Entire `src/platformer/lab` (39 files) | 343 | PASS |

### TypeScript Compilation
- `npx tsc --noEmit -p tsconfig.app.json`: **0 errors**.

### Browser Verification (Port 5282)
- Dev server launched on port `5282` via `npm run dev -- --port 5282 --strictPort`.
- Opened `http://localhost:5282/2d/lab/next` using automated preview tools.
- Verified:
  1. Canvas mounted and auto-sized to container ($570 \times 723$).
  2. Stage toolbar controls rendered (Green Flag, Play, Brush, Select, Snap 8, Zoom +, Zoom -, Fit).
  3. Clicking "Play" transitioned mode badge from `BUILD` to `PLAY` and replaced Play button with `Stop`.
  4. Clicking canvas in Play mode tracked mouse coordinates and executed clickTarget.
  5. Clicking "Stop" transitioned mode badge back to `BUILD`.
  6. Clicking "Select" tool activated select mode.
  7. Zoom In, Zoom Out, and Fit buttons adjusted camera zoom and position without distortion.
  8. Green Flag (⚑) started execution in Play mode.
  9. Console error log was verified clean (0 runtime errors).

---

## 3. Key Design Decisions

1. **Separation of Viewport and World Space**:
   World coordinates are strictly y-up with $(0, 0)$ at the bottom-left of the level bounds. Canvas2D coordinates are y-down with $(0, 0)$ at the top-left of the canvas element. All conversion happens strictly inside `camera.ts` (`worldToScreen` and `screenToWorld`).

2. **Fixed-Step Simulation vs. Render Rate**:
   The physics and block simulation run at exactly 30 TPS via `FixedStepAccumulator`. The display loop runs via `requestAnimationFrame` at the monitor's native refresh rate. Sub-tick fraction $\alpha$ is passed to the renderer to interpolate target positions, ensuring fluid motion without compromising deterministic game logic.

3. **Background Tab Safety**:
   When the browser tab is hidden (`visibilitychange`), the accumulator pauses. Upon resuming, accumulated lag is reset so the simulation does not spiral into a hundreds-of-ticks catch-up loop.

4. **Kid-Friendly Interaction**:
   All interactive control elements (zoom, play/stop, tool toggles, knob steppers, answer chips) have minimum touch/click dimensions of $40\text{px} \times 40\text{px}$, high-contrast typography, and clear visual state badges.
