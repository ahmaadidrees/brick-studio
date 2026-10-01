# Wave 2 Assets Lane Report: Bricks, Costumes, and Sounds

## 1. Overview

The **assets** lane builds step 2 of the Code Lab specification ("+ New brick" end to end) for bricks, costumes, and sounds:
- `src/platformer/lab/studio/BrickList.tsx`: Grid of bricks with costume thumbnails and Stage tile. Click selects a brick and arms the Build brush. Features "+ New brick" with kid-word picking, 32×32 blank costume initial state, auto-opening the Costumes tab, brick rename (picked words), and brick deletion with confirmation modal.
- `src/platformer/lab/studio/CostumeEditor.tsx`: Full pixel art editor and costume management sidebar. Supports adding (picked words), duplicating, deleting (with "keep at least one" constraint), and reordering costumes. Provides drawing tools (pencil, eraser, fill, straight line, rectangle filled/outline), 14 curated kid-friendly palette colors plus custom HTML5 color picker, zoomed grid (with pixel boundary grid lines at zoom ≥ 6), undo/redo history, image resizing (8–128 px per side for bricks), and draggable rotation center handle. When Stage is selected, manages backdrops sized to the level view (480 × 360).
- `src/platformer/lab/studio/SoundPanel.tsx`: Assigned sounds panel for bricks and Stage with instant audio preview (`new Audio()`), sound deletion, and a "+ Add sound" library modal with pre-listening and one-click addition.
- `src/platformer/lab/studio/assets/soundLibrary.ts`: Pure TypeScript 16-bit PCM RIFF WAV generator and synthesized retro sound library. Synthesizes 10 iconic retro game sounds (`jump`, `coin`, `pop`, `boing`, `laser`, `hit`, `win`, `powerup`, `step`, `buzzer`) with exact `durationMs` matching `(numSamples / sampleRate) * 1000`.
- `src/platformer/lab/studio/assets/pixelOps.ts`: Pure TypeScript headless raster drawing and image processing engine. Implements Bresenham lines, outline/filled rectangles, 4-way flood fill, canvas resizing, synchronous PNG decoding for `pixels.ts` uncompressed deflate chunks, undo/redo history management, and mask/opaque bounds synchronization via `costumeFromImage`.
- `src/platformer/lab/studio/assets/words.ts`: Curated kid-friendly word lists for bricks (`BRICK_WORDS`), costumes (`COSTUME_WORDS`), and stage backdrops (`BACKDROP_WORDS`), plus unique name resolver (`chooseUniqueName`).
- `src/platformer/lab/studio/assets/WordPickerModal.tsx` & `ConfirmModal.tsx`: Accessible modal dialogs with touch-friendly targets (≥ 40 px), accessible names (`aria-label`, `role="dialog"`), and keyboard handling (Escape to close, autoFocus).
- `src/platformer/lab/studio/assets/assets.css`: Complete styling matching the dark panels and rounded corners of the existing studio theme, optimized for 1366 × 768 Chromebook screens without horizontal scrolling.

---

## 2. How to Try It (Clicks & Walkthrough)

Run the dev server on the lane's allocated port:
```bash
npm run dev -- --port 5283 --strictPort
```
Open `http://localhost:5283/2d/lab/next` in your browser.

1. **Creating a Brick**:
   - In the bottom-right **Bricks & Stage** panel, click the blue **"+ New brick"** button (or the dashed "New brick" card in the grid).
   - In the modal dialog, click a word (e.g. **"Hero"**).
   - Notice that the brick is created, selected, arms the Build brush, and automatically opens the **Costumes** tab on the left with a 32 × 32 blank costume named "Hero".
2. **Drawing in the Pixel Editor**:
   - In the **Costumes** tab toolbar, select the **Pencil**, **Line**, or **Rectangle** tool.
   - Choose a color swatch from the bottom palette (e.g. Red, Green, Cyan) or click the custom color picker.
   - Click and drag on the canvas to draw.
   - Use the **Fill** bucket to fill enclosed regions.
   - Test **Undo** (`Ctrl+Z` or Undo icon) and **Redo** (`Ctrl+Y` or Redo icon).
   - Test **Zoom**: click Zoom In (+) / Zoom Out (-). At zoom ≥ 6, pixel grid lines appear.
3. **Setting the Rotation Center**:
   - Notice the cyan circular crosshair handle on the canvas.
   - Click and drag the handle to adjust the rotation center.
   - Click the **"Center"** button in the toolbar to snap it back to `(width / 2, height / 2)`.
4. **Managing Costumes**:
   - In the left sidebar, click **"Add"**. A word picker appears with costume words (`idle`, `walk1`, `walk2`, `jump`, etc.). Pick **"walk1"**.
   - Hover over a costume item and click the **Duplicate** icon (creates a copy).
   - Click the **Move Up** / **Move Down** chevrons to reorder costumes.
   - Click the **Delete** icon. Notice the delete button is disabled when only one costume remains ("keep at least one").
5. **Adding and Previewing Sounds**:
   - In the top tab bar, click the **"Sounds"** tab.
   - Click **"+ Add sound"**. The Sound Library modal opens with 10 synthesized retro sounds.
   - Click the Play icon next to any sound (e.g. `jump`, `coin`, `win`) to listen to it.
   - Click **"Add"** next to `jump` and `coin`.
   - The sounds appear in the brick's sound list with exact durations (e.g. `0.18s`, `0.32s`). Click **Play** to preview or **Remove** to delete.
6. **Editing the Stage**:
   - In the **Bricks & Stage** panel, click the **"Stage"** tile.
   - In the **Costumes** tab, notice the sidebar title changes to **"Backdrops"** and the backdrop canvas is sized to the level view (**480 × 360**). The rotation center is hidden (since the stage has no motion/rotation in Scratch/Code Lab).
   - In the **Sounds** tab, notice the heading updates to **"Stage Sounds"**.
7. **Renaming & Deleting Bricks**:
   - In the **Bricks & Stage** panel, hover over the "Hero" brick.
   - Click the **Pencil** icon: the word picker opens with brick words. Pick a new name (e.g. "Player").
   - Click the **Trash** icon: a confirmation dialog appears stating all copies will be removed. Click **Delete**.
   - The brick and all its copies are removed, and the active selection falls back cleanly to the Stage.

---

## 3. Test Coverage

All tests pass cleanly:
```bash
npx vitest run src/platformer/lab
# Test Files  38 passed (38)
# Tests       339 passed (339)

npx tsc --noEmit -p tsconfig.app.json
# Clean (0 errors)
```

### Assets Lane Test Suites:
1. `src/platformer/lab/studio/assets/soundLibrary.test.ts`:
   - Validates RIFF 16-bit PCM mono WAV header format: "RIFF", file size, "WAVE", "fmt ", subchunk1 size (16), audio format (1 = PCM), channels (1 = mono), sample rate (22050), byte rate, block align (2), bits per sample (16), "data", and data chunk size.
   - Validates duration calculation formula: `Math.round((numSamples / sampleRate) * 1000)`.
   - Validates that all library sounds (`jump`, `coin`, `pop`, `boing`, `laser`, `hit`, `win`, `powerup`, `step`, `buzzer`) produce valid base64 audio data URLs with exact durations > 0.
2. `src/platformer/lab/studio/assets/pixelOps.test.ts`:
   - Verifies pixel manipulation: `getPixel`, `setPixel`, `cloneImage`.
   - Verifies color conversions: `hexToRgba`, `rgbaToHex`, `colorsEqual`.
   - Verifies drawing tools: Bresenham `drawLine`, filled and outline `drawRect`, 4-way queue `floodFill`.
   - Verifies canvas resizing (8–128 px) preserving existing pixel content.
   - Verifies synchronous PNG decoding: byte-level roundtrip between `encodePng`/`pngDataUrl` from `pixels.ts` and `decodePngSync`.
   - Verifies mask and opaque bounding box synchronization via `savePixelImageToCostume` (`costumeFromImage`), including edge cases like completely empty/transparent images.
   - Verifies undo and redo stack behavior, clearing redo stack on new actions.
3. `src/platformer/lab/studio/assets/brickList.test.ts`:
   - Unique name resolution for duplicate brick words (`Hero` -> `Hero 2` -> `Hero 3`).
   - Store actions: `addBrick` creates brick with blank costume, selects brick, and arms brush.
   - `renameBrick` updates brick name.
   - `deleteBrick` removes brick, its copies, and cleans up active selection.
   - Stage tile selection updates `selectedBrickId` and clears `brushBrickId`.
4. `src/platformer/lab/studio/assets/costumeEditor.test.ts`:
   - Costume addition, duplication, reordering, and deletion constraints (keeps at least one).
   - Stage backdrop sizing to level view (480 × 360) and center coordinates (240, 180).
   - Drag to set rotation center coordinates.
   - Image resizing within 8–128 px bounds.
5. `src/platformer/lab/studio/assets/soundPanel.test.ts`:
   - Adding and removing sounds on bricks through `store.setSounds`.
   - Adding sounds to the Stage.

---

## 4. Store and Shell Requests

Per the lane rules, no shared shell files (`store.ts`, `StudioApp.tsx`, `studio.css`, `pixels.ts`) were modified. The following observations are noted for the integrator:
1. `store.addBrick(name, costume)`: Currently defaults to `editorTab: 'code'`. The Wave 2 spec specifies that creating a new brick "+ New brick starts with a blank costume of a sensible size (e.g. 32 × 32) and opens the Costumes tab." In the assets lane, we worked around this by calling `store.setEditorTab('costumes')` immediately after `store.addBrick`. The integrator may optionally change `store.addBrick` to set `editorTab: 'costumes'` directly.
2. Initial Stage Costumes: In `emptyProject()`, `stage.costumes` is initialized as `[]`. In `CostumeEditor`, we safely detect when `stage.costumes.length === 0` and provide a default backdrop ("Sky", 480 × 360) so kids immediately have a backdrop to paint on.

---

## 5. Known Gaps

None. The full step 2 specification for the assets lane has been implemented, tested headlessly, and verified in the browser on port 5283.
