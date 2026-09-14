# W7 evidence — playable Toy Room and coherent media

All evidence was produced against this worktree's own Vite dev server (`http://127.0.0.1:5207`) with headless Chrome
through Playwright (`PLAYWRIGHT_MODULE` / `CHROME_PATH` as in the shared brief). Nothing here is hand-edited.

## Screenshots — `screenshots.mjs`

    UI_ORIGIN=http://127.0.0.1:5207 node docs/brand/qa/w7/screenshots.mjs

Loads `/build`, restores the marketing seed castle (`scripts/art/media-seed.mjs`, 59 catalog bricks on the default 64
plate, `environmentId: 'toy-room'`) through the real store, enters Explore with `setMode('explore')`, waits for
`exploreSpawnStatus === 'ready'`, then captures two frames per viewport:

| File | Viewport | What it shows |
|---|---|---|
| `toy-room-explore-desktop-1366x768-spawn.png` | 1366×768 | What the player sees on spawn: castle ahead, HUD as shipped |
| `toy-room-explore-desktop-1366x768-room.png` | 1366×768 | Camera turned toward the lamp, pitch levelled: walls, lamp, books, plate |
| `toy-room-explore-phone-390x844-spawn.png` | 390×844 (touch) | Same spawn frame with the touch HUD (joystick, jump) |
| `toy-room-explore-phone-390x844-room.png` | 390×844 (touch) | Same room view on the phone layout |

`screenshots-report.json` records the store state behind every frame (mode, spawn status, environment, brick count,
camera yaw/pitch/distance) and any `pageerror` — the run used for the committed PNGs reported none.

## Media — `scripts/art/media-capture.mjs` + `scripts/art/media-optimize.mjs`

    UI_ORIGIN=http://127.0.0.1:5207 OUT_DIR=/tmp/brickgineers-media-captures node scripts/art/media-capture.mjs
    MASTERS_DIR=/tmp/brickgineers-media-captures node scripts/art/media-optimize.mjs

Capture writes one master PNG per contract family (hero 1600×960, scene 1600×1000, character 800×800) from the real
runtime composition with every non-canvas element hidden (`visibility`, not cropping). Optimize resizes with `sharp`
(already in `node_modules`), encodes WebP (sharp) and AVIF (`avifenc`, host tool) walking down in quality until each
file fits its cap, writes 256-colour palette PNG fallbacks, then rewrites `public/brand/media/manifest.json` and
`public/brand/media/MEDIA.md` with measured sizes, bytes, sha256 prefixes, budgets and provenance. The masters
themselves are not committed (they are reproducible from the scripts at the recorded commit).

Result of the committed run: hero delivered 54.4 KB (avif) / 88.2 KB (webp) against a 250 KB cap; initial marketing set
164.6 KB (avif) / 244.8 KB (webp) against a 600 KB cap; 45 files, all at the first quality step (AVIF q62, WebP q84).

## Perf harness — `perf-harness.mjs` (not run in this lane)

    UI_ORIGIN=http://127.0.0.1:5207 OUT_DIR=/tmp/brick-w7-performance node docs/brand/qa/w7/perf-harness.mjs

A copy of `scripts/qa/verify-expanded-performance.mjs` (W8-owned) parameterised by `UI_ORIGIN` and `OUT_DIR`. Same
fixture (one 64×64×192 custom brick on a 128 plate), enters Explore in toy-room / sky-island / brick-valley through the
store, samples 120 RAF frames (p50 / p95 / max) plus `gl.info` render and memory counters after spawn and after a
12 s travel leg, and writes `results.json` + one PNG per scene to `OUT_DIR`. The lead runs it before/after on a quiet
host at integration; the shared host was busy with other lanes, so no numbers are claimed here.
