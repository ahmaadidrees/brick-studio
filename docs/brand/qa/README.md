# Brand QA harnesses (W8)

Independent verification for the Brickgineers brand pass. Everything here runs against a local Vite dev server
(or `vite preview` for transfer sizes) with an isolated headless Chrome; nothing deploys, nothing touches hosted
data. Node 22 only.

```sh
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
export PLAYWRIGHT_MODULE=/Users/ahmaadidrees/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs   # v1.61.1
export CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

Both variables have these values as defaults (`scripts/qa/lib/env.mjs`), so they can be omitted on this host.

## Start the app under test

W8's assigned port is 5198. Use `--strictPort` so a busy port fails loudly instead of silently moving:

```sh
cd /Users/ahmaadidrees/.codex/worktrees/brand-w8
npx vite --port 5198 --strictPort --host 127.0.0.1
```

If the port is taken by another lane's process (it was during the baseline: a Codex `python -m http.server 5198`),
pick a free one and pass it as `UI_ORIGIN`; never kill another lane's process. The baseline used
`http://127.0.0.1:5208`.

For transfer measurements build first and serve the production bundle:

```sh
npm run build
npx vite preview --port 5209 --strictPort --host 127.0.0.1
```

## Harnesses

All harnesses write `results.json` (with a `host` block: load average, CPU, memory, Node) plus screenshots into
their output directory and exit non-zero on a hard failure.

| Script | What it proves | Variables (defaults) | Output default |
|---|---|---|---|
| `verify-refinement-ui.mjs` | Six-viewport header/toolbar bounds and overlap, Character shortcut opens the Character tab, Settings fits, world menu entries, Escape restores focus, no recovery screen, Place → Home → Continue → identical guest document | `UI_ORIGIN` (`http://127.0.0.1:5190`, localhost only), `UI_OUTPUT` | `/tmp/brick-refinement-ui` |
| `verify-character-customizer.mjs` | Real WebGL character previews (Pip/Fern/Nova GLB 200, four distinct animation frames each), Apply → reload persistence, Toy Figure appearance, saved outfit + favorite restore, 390/320 sheet fit | `UI_ORIGIN` (`http://127.0.0.1:5190`, localhost only), `UI_OUTPUT` | `/tmp/brick-character-customizer-qa` |
| `verify-expanded-performance.mjs` | 64×64×192 custom-part geometry/validation timing, 128-plate Explore in Toy Room / Sky Island / Brick Valley: spawn ready, RAF p50/p95, render counters, 12 s travel beyond the plate edge | `UI_ORIGIN` (`http://127.0.0.1:5190`, localhost only), `UI_OUTPUT`; records `hostBefore`/`hostAfter` load | `/tmp/brick-expanded-performance` |
| `verify-refinement-multiplayer.mjs` | Two isolated browsers through the real UI: create room, copy invite (no owner fragment), peer join, 96/128 resize propagation, edge brick, profile propagation, export == authoritative `GET /worlds/:id`, cold rejoin equality | `QA_ORIGIN` (staging Vercel), `QA_API` (staging worker), `QA_OUTPUT`, `VERCEL_SHARE`, `QA_LOCK_ROOM=1` | `/tmp/brick-refinement-multiplayer` |
| `brand-surfaces.mjs` | Every guest-reachable board surface at six viewports + 200% zoom + reduced motion (see below) | `UI_ORIGIN` (`http://127.0.0.1:5198`, localhost only), `UI_OUTPUT`, `SURFACES`, `VIEWPORTS`, `VARIANTS`, `SCREENSHOT_FORMAT`, `STRICT_TOUCH_TARGETS`, `STRICT_FOCUS`, `INCLUDE_PENDING` | `/tmp/brick-brand-surfaces` |
| `route-transfer.mjs` | Compressed bytes per route by type (JS/CSS/image/model/font), which editor chunks a route loads, DOMContentLoaded/load | `UI_ORIGIN` (`http://127.0.0.1:4173`), `UI_OUTPUT`, `ROUTES`, `SETTLE_MS` | `/tmp/brick-route-transfer` |

Exact invocations used for the baseline (replace the port if 5198 is free for you):

```sh
UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=docs/brand/qa/baseline/refinement-ui node scripts/qa/verify-refinement-ui.mjs
UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=docs/brand/qa/baseline/character-customizer node scripts/qa/verify-character-customizer.mjs
UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=/tmp/brick-brand-surfaces node scripts/qa/brand-surfaces.mjs
UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=docs/brand/qa/baseline/expanded-performance node scripts/qa/verify-expanded-performance.mjs
UI_ORIGIN=http://127.0.0.1:5209 UI_OUTPUT=docs/brand/qa/baseline/route-transfer node scripts/qa/route-transfer.mjs
```

Run the performance harness alone on a quiet host (`uptime` load average under the CPU count, no other
browser sessions); it records the load before and after so a noisy run can be recognised and repeated.

### `brand-surfaces.mjs`

Surfaces are declared at the top of the script; every control it touches is looked up through
`scripts/qa/locators.json` by role/label (`{ "role": "button", "name": "Settings" }`, `{ "label": "Room name" }`,
regex names as `{ "regex": "..." }`). When the brand pass renames a control, edit the JSON entry, not the script.

Viewports: 1366×768, 1024×768, 768×1024, 390×844 (touch), 320×740 (touch), 844×390 (touch landscape).
Variants: `default`; `zoom200` = Chrome 200% zoom emulated as half the CSS viewport at deviceScaleFactor 2 (desktop
and tablet viewports); `reduced-motion` = `prefers-reduced-motion: reduce` at 1366×768 and 390×844.

Hard checks per run: expected element visible, no `pageerror`, no horizontal page overflow, no visible control
outside the viewport (vertical position is ignored on scrollable pages and inside scrollable regions), every open
modal dialog fits the viewport, Escape closes sheets that declare `escape`, seeded guest document unchanged for
`documentUnchanged` surfaces (corrupt import, remix confirmation). Soft checks are recorded in `notes`: touch
targets under 44 px on touch viewports (`STRICT_TOUCH_TARGETS=1` makes them hard), dialog contains focus and focus
returns to the trigger after Escape (`STRICT_FOCUS=1`), animations still running under reduced motion, console
errors. The brand contracts require 44 px targets and focus handling, so the integrated candidate should be run
with both strict flags.

The `classroom=join|signin|teacher` entry intents (Wave 0, present since the W0+W1 foundation merge) are active
surfaces: each one asserts the matching nav button carries `aria-pressed="true"` (`expectPressed`) and that the
mode-only field is visible (Enrollment code / Sign-in code / Email). A surface can still be declared `pending: '<reason>'`
to be skipped and listed under `skipped`; `INCLUDE_PENDING=1` runs those too (none are pending right now).

State seeding: the onboarding guide is pre-dismissed except on `quick-start`; `seed: 'fixture'` stores
`scripts/perf/fixtures/mixed-250.brickstudio.json` as the guest draft (Explore, published remix, graphics pause,
corrupt import). Graphics pause is triggered with a real `WEBGL_lose_context.loseContext()` on the scene canvas.
The published viewer uses a base64url snapshot of the same fixture in the URL hash.

Useful subsets:

```sh
SURFACES=landing,build VIEWPORTS=1366x768,390x844 VARIANTS=default node scripts/qa/brand-surfaces.mjs
STRICT_TOUCH_TARGETS=1 STRICT_FOCUS=1 node scripts/qa/brand-surfaces.mjs          # integration gate
```

## Local two-client multiplayer (no hosted access)

The worker's guest routes (`POST /worlds`, `GET /worlds/:id`, `/connect`) do not touch Supabase; `wrangler dev`
serves them with local Durable Objects and no `.dev.vars`. Classroom routes need the secrets and are out of scope
for guest verification.

```sh
# terminal 1 — worker (local Durable Objects, no secrets; .wrangler/ state is git-ignored)
cd multiplayer/worker && WRANGLER_SEND_METRICS=false npx wrangler dev --port 8787 --ip 127.0.0.1

# terminal 2 — frontend pointed at the local worker for this process only (no .env edits)
VITE_LIVE_SERVER_URL=http://127.0.0.1:8787 npx vite --port 5211 --strictPort --host 127.0.0.1

# terminal 3 — harness
QA_ORIGIN=http://127.0.0.1:5211 QA_API=http://127.0.0.1:8787 QA_OUTPUT=docs/brand/qa/baseline/multiplayer-local \
  node scripts/qa/verify-refinement-multiplayer.mjs
```

The socket assertion accepts `ws://` for an `http://` API. Without `VITE_LIVE_SERVER_URL` the frontend already
falls back to `http://localhost:8787`, but set it explicitly so the harness's origin check matches.

## Baseline

`docs/brand/qa/baseline/` holds the pre-brand evidence at `f8c7ad3` (results, screenshots, `BUNDLE.md`,
`RESULTS.md`). `docs/brand/qa/ACCEPTANCE-MATRIX.md` maps every board and extra-coverage item to a reach path, an
assertion, a harness and an owner.
