# W2 landing QA evidence

Script: `landing-qa.mjs` (run from the worktree root with the lane's Vite server on port 5192):

```
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
PLAYWRIGHT_MODULE=/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs \
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
UI_ORIGIN=http://127.0.0.1:5192 node docs/brand/qa/w2/landing-qa.mjs
```

It writes the screenshots below plus `report.json` (42 checks, all passing on 2026-09-14, headless Chrome).

## What it checks

- Six-viewport matrix (1366×768, 1024×768, 768×1024, 390×844, 320×740, 844×390): no horizontal overflow of the
  document or the `.brick-landing` scroll container; the primary CTA is visible on load; Sign in lives in the header
  above 760 px and inside the hero on phones (board 16).
- Anchor navigation: header links, "See classroom tools", footer Privacy/Help all scroll their target into view and set
  the hash; fresh-load deep links `/#teachers`, `/#help`, `/#how-it-works` land on their section (the page is a lazy
  chunk, so it resolves the hash after mount and again after web fonts swap in) and stay on `/`.
- Keyboard: tab order is skip link → header links → hero CTAs; every focused control shows a ≥ 3 px outline; the skip
  link becomes visible on focus and targets `<main>`.
- Mobile menu at 390 px: toggle has `aria-expanded`/`aria-controls`, nav hidden until opened, all nav/CTA targets
  ≥ 44 px tall, Escape closes and returns focus; hero order is headline → art → buttons → Sign in.
- Reduced motion: drift animation off, scroll behavior instant.
- 200 % zoom (683×384 CSS px at DPR 2): no horizontal overflow.
- Continue building: first visit shows Start building (×3); a real `brick-studio.current-project.v1` draft switches all
  three to Continue building; the landing never writes or removes storage keys.
- Route weight: the landing route loads no three/BrickStudio/physics/GLB chunks.
- Media budget checks run but are only meaningful once `public/brand/media/*` exists; on the dev server the missing
  files resolve to the SPA fallback HTML (the `media` numbers in `report.json` are that fallback, not images) and the
  page keeps its vector art.

## Files

| File | Board |
|---|---|
| `landing-1366x768.png`, `landing-1366x768-full.png` | 01 landing (desktop, viewport and full page) |
| `landing-390x844.png`, `landing-390x844-full.png`, `landing-390x844-menu-open.png` | 16 mobile landing panel, menu open |
| `board-02-how-it-works-{1366x768,390x844}.png`, `board-02-teachers-{1366x768,390x844}.png` | 02 how it works / teachers |
| `landing-1024x768.png`, `landing-768x1024.png`, `landing-320x740.png`, `landing-844x390.png` | responsive matrix |
| `landing-zoom-200.png` | 200 % zoom |
