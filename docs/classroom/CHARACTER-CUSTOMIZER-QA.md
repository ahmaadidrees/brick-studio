# Character customizer browser QA

Local guest verification on 2026-09-14, against `http://127.0.0.1:5190/build` in the `brick-product-refinement` worktree. Base HEAD: `ed8af4104263dc7db3b4e9754ec6e6a6a871464d`, with current uncommitted refinement changes. This is local browser evidence, not production or physical Chromebook certification.

## Method

The harness uses a fresh, isolated Chrome browser context, selects cards through their accessible radio roles, operates the real controls, reads browser storage after Apply, reloads the page, and checks the reopened selection. It loads the real WebGL renderer and glTF assets; no avatar, canvas, storage, or runtime mocks are used.

```sh
PLAYWRIGHT_MODULE=/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
node scripts/qa/verify-character-customizer.mjs
```

Optional environment variables: `UI_ORIGIN` (localhost only), `UI_OUTPUT`, `CHROME_PATH`, and `PLAYWRIGHT_MODULE`. Default artifact directory: `/tmp/brick-character-customizer-qa`.

## Result

PASS after the corrections below. The final complete harness run passed with zero browser page errors. Both responsive panels fit exactly within their viewports (390 and 320 pixels wide), no buttons or inputs overflow horizontally, and the footer remains visible. Updated mobile screenshots were visually inspected; the hint/badge overlays are gone.

## Checks

- Pip, Fern, and Nova: real `.glb` responses return 200; each character visibly renders its own distinct geometry and colors. Idle, Walk, Run, and Jump controls select successfully, with separate framebuffer screenshots. Screenshot hashes sample the 3D stage, excluding the changing control labels.
- Each new character: Apply writes the selected ID to `brick-studio.content-preferences.v1`; full page reload preserves that record and reopens with the correct radio selected.
- Toy Figure: Curls, Glasses, Freckles, and Overalls visibly render and survive Apply plus reload. The visible preview shows curly brown hair, round dark glasses, and blue overalls.
- Saved outfit: “Curly Builder QA” saves to `brick-studio.wardrobe.v1`, is marked favorite, survives reload, and restores the toy character, hair, and accessory after choosing Nova.
- Scene tab: switching from the Character shortcut to Scene works after the tab handler correction.
- Mobile layouts: tested at 390 × 844 and 320 × 740 CSS pixels. The panel, footer, and horizontal extents of buttons and inputs must fit inside the viewport; the inner panel scrolls vertically to appearance controls.

## Issues found and corrected during verification

The first browser run exposed a 320-pixel sheet overflow that clipped the close/animation/Apply controls. The parent changed the grid to `minmax(0, 1fr)` and added panel/body minimum-width constraints. The parent also raised the sheet above the placement hint and preview badge, which had overlaid the mobile sheet. The Scene tab previously selected `initialTab` when clicked from the Character shortcut; its handler now selects the environment tab directly.

## Evidence and limits

The machine-readable result is `/tmp/brick-character-customizer-qa/results.json`. Captures include `pip-{idle,walk,run,jump}.png`, corresponding Fern/Nova samples, `toy-curls-glasses.png`, and `mobile-{390,320}-{preview,appearance}.png`. Screenshots were opened and visually inspected, rather than inferring rendering from HTTP responses or DOM state alone.

The responsive-width checks use desktop Chrome viewport emulation; they do not certify physical phone touch behavior or Chromebook frame rate. Verification covers browser-local guest persistence, not account sync or multiplayer propagation. No deployment or production state was changed by this harness.
