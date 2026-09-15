# Bundle baseline at f8c7ad3 (pre-brand)

`npm run build` (`tsc -b && vite build`, Vite 8.1.5 / rolldown, Node 22.23.2) in worktree `brand-w8` at base `f8c7ad3`; docs commit 9595a52. Sizes are the reporter's minified and gzip figures. Hashes are stripped from names so later builds can be diffed line by line; the ordering is the reporter's (ascending size).

Route attribution follows `src/main.tsx`: `index` is the shared entry (React, router, error boundary); `LandingPage` is the only extra chunk the marketing page needs; the editor pulls `BrickStudioApp`, `events-*.esm` (three.js/fiber) and `rapier` (physics wasm-in-JS); `LiveWorldPage` and `PublishedWorldPage` add on top of the editor; character runtimes (`pip`, `fern`, `nova`, `OriginalAvatar`, `Gltf`) are lazy.

## JavaScript chunks

| Chunk | Minified kB | Gzip kB |
|---|---:|---:|
| `constants.js` | 0.05 | 0.07 |
| `descriptor.js` | 0.17 | 0.15 |
| `descriptor.js` | 0.17 | 0.15 |
| `ScaledEnvironment.js` | 0.19 | 0.17 |
| `nova.js` | 0.32 | 0.24 |
| `pip.js` | 0.32 | 0.24 |
| `fern.js` | 0.32 | 0.24 |
| `descriptors.js` | 0.44 | 0.25 |
| `sparkles.js` | 0.79 | 0.40 |
| `descriptor.js` | 0.90 | 0.57 |
| `TeacherGoogleCallback.js` | 1.05 | 0.59 |
| `users.js` | 1.95 | 1.07 |
| `BufferGeometryUtils.js` | 2.21 | 0.94 |
| `OriginalAvatar.js` | 2.31 | 1.19 |
| `descriptor.js` | 2.70 | 1.24 |
| `avatarMotion.js` | 3.22 | 1.27 |
| `characterController.js` | 3.40 | 1.45 |
| `PublishedWorldPage.js` | 3.71 | 1.69 |
| `ContactShadows.js` | 4.25 | 1.43 |
| `classroom.js` | 4.64 | 1.86 |
| `jsx-runtime.js` | 8.53 | 3.26 |
| `parts.js` | 9.86 | 3.73 |
| `adapter.js` | 11.16 | 4.47 |
| `LandingPage.js` | 16.27 | 4.96 |
| `adapter.js` | 18.03 | 6.25 |
| `adapter.js` | 21.41 | 7.96 |
| `BufferGeometryUtils.js` | 26.00 | 8.33 |
| `adapter.js` | 35.48 | 8.72 |
| `adapter.js` | 35.77 | 12.10 |
| `Lightformer.js` | 51.69 | 18.44 |
| `LiveWorldPage.js` | 67.05 | 21.00 |
| `Gltf.js` | 70.44 | 20.66 |
| `index.js` | 197.75 | 63.07 |
| `BrickStudioApp.js` | 308.03 | 88.22 |
| `events.esm.js` | 878.24 | 233.51 |
| `rapier.js` | 2,236.61 | 842.32 |
| **Total JS (36 chunks)** | **4,025.43** | **1,362.21** |

## CSS

| File | Minified kB | Gzip kB |
|---|---:|---:|
| `classroom.css` | 9.64 | 2.63 |
| `LandingPage.css` | 13.84 | 3.76 |
| `index.css` | 15.81 | 4.59 |
| `LiveWorldPage.css` | 22.02 | 4.59 |
| `BrickStudioApp.css` | 78.69 | 15.29 |

## HTML and binary assets emitted by Vite

| File | kB |
|---|---:|
| `index.html` | 2.23 |
| `fern.glb` | 112.32 |
| `pip.glb` | 116.63 |
| `nova.glb` | 139.49 |
| `nova-preview.png` | 444.15 |
| `fern-preview.png` | 446.86 |
| `pip-preview.png` | 448.64 |
| `brick-hero.glb` | 463.98 |

## Public files copied as-is

| File | kB |
|---|---:|
| `apple-touch-icon.png` | 5.89 |
| `favicon-32.png` | 1.07 |
| `favicon.svg` | 1.08 |
| `icon-192.png` | 6.15 |
| `icon-512.png` | 22.89 |
| `manifest.webmanifest` | 0.59 |
| `og-image.png` | 97.37 |
| `robots.txt` | 0.02 |

Total `dist/` on disk: 6.3 MB.

## Measured per-route transfer (production preview)

`scripts/qa/route-transfer.mjs` against `npx vite preview --port 5209` of the same `dist/` (preview serves gzip, so
"transfer" is compressed bytes on the wire; PerformanceResourceTiming, 1366×768, 4 s settle after `load`). Raw data:
`docs/brand/qa/baseline/route-transfer/results.json`.

| Route | Total transfer KB | JS KB (files) | CSS KB | Images KB | Models KB | Fonts KB | Fetch/other KB | DOMContentLoaded ms | load ms | Editor chunks on route |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| landing | 87.7 | 76.1 (6) | 8.7 (2) | 0.6 (1) | 0 | 0 | 1.1 | 340 | 340 | none |
| build | 1242.8 | 1217 (18) | 22.8 (3) | 0.6 (1) | 0 | 0 | 1.1 | 240 | 241 | BrickStudioApp-B_yV5E6S.js, events-b389eeca.esm-C_oOfuYP.js, rapier-DJ-fG79w.js, BrickStudioApp-BdetjO_Q.css |
| build-character-sheet | 2551.9 | 1217 (18) | 22.8 (3) | 1309.8 (4) | 0 | 0 | 1.1 | 247 | 248 | BrickStudioApp-B_yV5E6S.js, events-b389eeca.esm-C_oOfuYP.js, rapier-DJ-fG79w.js, BrickStudioApp-BdetjO_Q.css |
| live-create | 1269.3 | 1238.8 (20) | 27.6 (4) | 0.6 (1) | 0 | 0 | 1.1 | 270 | 270 | BrickStudioApp-B_yV5E6S.js, events-b389eeca.esm-C_oOfuYP.js, rapier-DJ-fG79w.js, BrickStudioApp-BdetjO_Q.css |
| published-viewer | 1244.7 | 1219 (19) | 22.8 (3) | 0.6 (1) | 0 | 0 | 1.1 | 198 | 199 | BrickStudioApp-B_yV5E6S.js, events-b389eeca.esm-C_oOfuYP.js, rapier-DJ-fG79w.js, BrickStudioApp-BdetjO_Q.css |

Observations to carry into the brand pass:

- Landing `/` at f8c7ad3 is 87.7 KB total (76.1 KB JS across `index`, `jsx-runtime`, `LandingPage` and helpers) and loads
  none of `BrickStudioApp`, `events-*` (three) or `rapier`. This is the number the W2 landing must not regress into
  the editor; media added by W7 is budgeted separately (hero <= 250 KB, initial marketing media <= 600 KB).
- Editor `/build` is 1,242.8 KB on the wire, dominated by `rapier` (842 KB gzip) and `events-*.esm` (three.js, 234 KB).
  Plan section 8 flags any >10% compressed increase of this figure for review.
- Opening the Character sheet fetches 1,309.8 KB of PNG previews (`pip-preview`, `fern-preview`, `nova-preview`, about
  436 KB each; the fourth image is the 0.6 KB favicon) — the pre-brand character tiles are the single heaviest asset
  group on any route and a candidate for W6 optimisation (AVIF/WebP at intrinsic size). The `.glb` runtimes
  (110–136 KB each) are lazy and were not requested before a character was selected.
- `/live/new` (guest room gate) already loads the full editor bundle (1,269 KB) before a room exists because
  `LiveWorldPage` imports `BrickStudioApp` statically; not a regression, but worth knowing when comparing.

The reporter warning "Some chunks are larger than 500 kB after minification" is pre-existing (`events-*.esm` and
`rapier`).
