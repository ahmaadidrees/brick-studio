# Brick Studio + Rover Lab

A browser-based creative building prototype. Brick Studio is the default experience: build on a large studded plate, then enter the exact creation in third person. The original robotics vertical slice remains preserved as Rover Lab.

## Experiences

- **Brick Studio:** `http://127.0.0.1:5173/`
- **Rover Lab:** `http://127.0.0.1:5173/rover`

## Run locally

```bash
npm install
npm run dev
```

Open the local URL printed by Vite. In Brick Studio:

1. Choose a shape from the brick drawer.
2. Move its translucent preview over the 64×64-stud plate and click or tap Place — the brush stays loaded, so keep clicking to keep placing (Esc parks it).
3. Select placed bricks to recolor, rotate, move, copy, duplicate, or delete them; use the Select tool for marquee multi-select.
4. Drag empty space to orbit, right-drag or Shift-drag to pan, scroll or pinch to zoom, and use the view presets to reorient.
5. Choose **Explore** to walk, jump, climb, and collide with the exact structure.

On iPad and mobile, the brick drawer becomes a touch-friendly bottom sheet. Explore provides a virtual joystick, swipe camera area, jump, and return controls.

## Checks

```bash
npm test
npm run build
```

The detailed scope and acceptance criteria are in [POC_CONTRACT.md](./POC_CONTRACT.md).
