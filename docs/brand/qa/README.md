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
The default `node` on this host is broken (a Homebrew `simdutf` dylib is missing); always put Node 22 first on `PATH`.

## Integrated-candidate run book

Ordered commands for the lead on the integration worktree (`/Users/ahmaadidrees/.codex/worktrees/brand-integration`).
Every browser step needs one server; start each in its own terminal from the integration worktree and reuse it for
the rest of the run. Only one headless browser at a time: the steps below are sequential. Set `QA_COMMIT` so every
`results.json`/`captures.json` records the candidate SHA.

```sh
cd /Users/ahmaadidrees/.codex/worktrees/brand-integration
export PATH=/opt/homebrew/opt/node@22/bin:$PATH
export QA_COMMIT=$(git rev-parse --short HEAD)
OUT=docs/brand/qa/integrated
mkdir -p $OUT
```

0. **Servers** (check `lsof -nP -iTCP:<port> -sTCP:LISTEN` first; never kill a process you did not start).

   ```sh
   # A — dev server for the UI harnesses
   npx vite --port 5190 --strictPort --host 127.0.0.1
   # B — local worker for guest rooms (no secrets, local Durable Objects)
   cd multiplayer/worker && WRANGLER_SEND_METRICS=false npx wrangler dev --port 8787 --ip 127.0.0.1
   # C — dev server pointed at the local worker (for the two-client run and board 11)
   VITE_LIVE_SERVER_URL=http://127.0.0.1:8787 npx vite --port 5189 --strictPort --host 127.0.0.1
   # D — production preview for transfer sizes (after step 1's build)
   npx vite preview --port 4173 --strictPort --host 127.0.0.1
   ```

   Address the worker as `127.0.0.1`, not `localhost`: another worktree's Node server may listen on `[::1]:8787`.

1. **Unit, worker, typecheck, build** — must be green before any browser step.

   ```sh
   npm run check 2>&1 | tee $OUT/npm-check.log
   npx tsc -p tsconfig.app.json --noEmit
   ```

2. **Six-viewport surface matrix, strict** (24 surfaces × 6 viewports + 200 % zoom + reduced motion ≈ 12 min).

   ```sh
   STRICT_TOUCH_TARGETS=1 STRICT_FOCUS=1 INCLUDE_PENDING=1 SCREENSHOT_FORMAT=jpeg \
     UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=$OUT/surfaces node scripts/qa/brand-surfaces.mjs 2>&1 | tee $OUT/surfaces.log
   ```

   Compare with the pre-brand baseline: `docs/brand/qa/baseline/RESULTS.md` lists every failure at the base with its
   owner lane; anything not on that list is a regression. `results.json` → `runs[].failures`/`notes`.

3. **Header/toolbar bounds and Home → Continue** (six viewports).

   ```sh
   UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=$OUT/refinement-ui node scripts/qa/verify-refinement-ui.mjs
   ```

4. **Character customizer** (real WebGL previews, Apply → reload, outfit restore, 390/320 fit).

   ```sh
   UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=$OUT/character-customizer node scripts/qa/verify-character-customizer.mjs
   ```

5. **Schema 2/3 round trip and Home → Continue → reload document equality.**

   ```sh
   UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=$OUT/schema-roundtrip node scripts/qa/schema-roundtrip.mjs
   npx vitest run src/brick/brickDocument.test.ts packages/brick-core
   ```

6. **Per-board captures** (all 16 boards at 1366×768 and 390×844 through the CONTRACTS.md header/menu names; use
   server C so board 11 can create a guest room on the local worker).

   ```sh
   UI_ORIGIN=http://127.0.0.1:5189 UI_OUTPUT=$OUT/boards node scripts/qa/board-captures.mjs 2>&1 | tee $OUT/boards.log
   ```

   Boards 05, 13, 14 (and the password-reset state of 04) report `needs-fixture` unless `SESSION_STORAGE_FILE`
   points at a JSON object of `sessionStorage` entries for a signed-in classroom/teacher session and the dev server
   talks to a worker with the classroom secrets. `captures.json` records, per capture, which header controls were
   visible (`header`), so the header spec can be checked without opening the images.

7. **Local two-client guest room** (server C + worker B).

   ```sh
   QA_ORIGIN=http://127.0.0.1:5189 QA_API=http://127.0.0.1:8787 QA_OUTPUT=$OUT/multiplayer-local \
     node scripts/qa/verify-refinement-multiplayer.mjs
   ```

8. **Per-route transfer** (server D, after `npm run check` built `dist/`).

   ```sh
   UI_ORIGIN=http://127.0.0.1:4173 UI_OUTPUT=$OUT/route-transfer node scripts/qa/route-transfer.mjs
   npx vite build 2>&1 | tee $OUT/build.log     # reporter sizes for a BUNDLE.md diff against the baseline
   ```

   Gate: landing loads no editor chunk; `/build` compressed transfer within 10 % of the baseline 1,242.8 KB
   (`docs/brand/qa/baseline/BUNDLE.md`); hero ≤ 250 KB, initial marketing media ≤ 600 KB.

9. **Expanded performance — last, on a quiet host** (`uptime` load average below the CPU count, no other browser
   sessions, no other lanes building).

   ```sh
   uptime
   UI_ORIGIN=http://127.0.0.1:5190 UI_OUTPUT=$OUT/expanded-performance node scripts/qa/verify-expanded-performance.mjs
   ```

   `results.json` records `hostBefore`/`hostAfter`; repeat if the load rose during the run. Compare against the
   baseline row once it is captured on the same quiet host (see `baseline/RESULTS.md`, performance is a placeholder
   until then).

10. **Record**: copy the strict matrix summary line, the per-board table (`$OUT/boards/README.md`), the schema and
    multiplayer summaries and the transfer table into `docs/brand/qa/integrated/RESULTS.md`; list every failure with
    its owner lane; commit `docs/brand/qa/integrated/`.

## Start the app under test (lane use)

W8's assigned port is 5198. Use `--strictPort` so a busy port fails loudly instead of silently moving:

```sh
cd /Users/ahmaadidrees/.codex/worktrees/brand-w8
npx vite --port 5198 --strictPort --host 127.0.0.1
```

If the port is taken by another lane's process (it was during the baseline: a Codex `python -m http.server 5198`),
pick a free one and pass it as `UI_ORIGIN`; never kill another lane's process. The baseline used
`http://127.0.0.1:5208` (dev), `5209` (preview) and `5211` (dev with `VITE_LIVE_SERVER_URL=http://127.0.0.1:8787`).

For transfer measurements build first and serve the production bundle:

```sh
npm run build
npx vite preview --port 5209 --strictPort --host 127.0.0.1
```

## Harnesses

All harnesses write `results.json` (with a `host` block: load average, CPU, memory, Node) plus screenshots into
their output directory and exit non-zero on a hard failure. Shared helpers: `scripts/qa/lib/env.mjs` (browser,
origins, output dirs, host snapshot) and `scripts/qa/lib/ui.mjs` (locator map, step runner, guest-storage seeding,
import/export through the studio menu).

| Script | What it proves | Variables (defaults) | Output default |
|---|---|---|---|
| `brand-surfaces.mjs` | Every guest-reachable board surface at six viewports + 200% zoom + reduced motion (see below) | `UI_ORIGIN` (`http://127.0.0.1:5198`, localhost only), `UI_OUTPUT`, `SURFACES`, `VIEWPORTS`, `VARIANTS`, `SCREENSHOT_FORMAT`, `STRICT_TOUCH_TARGETS`, `STRICT_FOCUS`, `INCLUDE_PENDING` | `/tmp/brick-brand-surfaces` |
| `board-captures.mjs` | One PNG per approved board and state at 1366×768 and 390×844 through CONTRACTS header/menu locators; `captures.json` + `README.md` table; header-control probe; needs-fixture reasons for account boards | `UI_ORIGIN` (`http://127.0.0.1:5198`), `UI_OUTPUT`, `BOARDS`, `VIEWPORTS`, `SESSION_STORAGE_FILE`, `LIVE_ROOM`, `QA_COMMIT` | `docs/brand/qa/integrated/boards` |
| `schema-roundtrip.mjs` | Import → Export equality for schema 2, schema 3 (128 plate) and legacy schema 1 (normalized to 2) files, after import, after reload and after Home → Continue building → reload; download name ends with `.brickstudio.json` | `UI_ORIGIN` (`http://127.0.0.1:5198`), `UI_OUTPUT`, `CASES` | `/tmp/brick-schema-roundtrip` |
| `verify-refinement-ui.mjs` | Six-viewport header/toolbar bounds and overlap, Character shortcut opens the Character tab, Settings fits, world menu entries, Escape restores focus, no recovery screen, Place → Home → Continue → identical guest document | `UI_ORIGIN` (`http://127.0.0.1:5190`, localhost only), `UI_OUTPUT` | `/tmp/brick-refinement-ui` |
| `verify-character-customizer.mjs` | Real WebGL character previews (Pip/Fern/Nova GLB 200, four distinct animation frames each), Apply → reload persistence, Toy Figure appearance, saved outfit + favorite restore, 390/320 sheet fit | `UI_ORIGIN` (`http://127.0.0.1:5190`, localhost only), `UI_OUTPUT` | `/tmp/brick-character-customizer-qa` |
| `verify-expanded-performance.mjs` | 64×64×192 custom-part geometry/validation timing, 128-plate Explore in Toy Room / Sky Island / Brick Valley: spawn ready, RAF p50/p95, render counters, 12 s travel beyond the plate edge | `UI_ORIGIN` (`http://127.0.0.1:5190`, localhost only), `UI_OUTPUT`; records `hostBefore`/`hostAfter` load | `/tmp/brick-expanded-performance` |
| `verify-refinement-multiplayer.mjs` | Two isolated browsers through the real UI: create room, copy invite (no owner fragment), peer join, 96/128 resize propagation, edge brick, profile propagation, export == authoritative `GET /worlds/:id`, cold rejoin equality | `QA_ORIGIN` (staging Vercel), `QA_API` (staging worker), `QA_OUTPUT`, `VERCEL_SHARE`, `QA_LOCK_ROOM=1` | `/tmp/brick-refinement-multiplayer` |
| `route-transfer.mjs` | Compressed bytes per route by type (JS/CSS/image/model/font), which editor chunks a route loads, DOMContentLoaded/load | `UI_ORIGIN` (`http://127.0.0.1:4173`), `UI_OUTPUT`, `ROUTES`, `SETTLE_MS` | `/tmp/brick-route-transfer` |

Exact invocations used for the baseline:

```sh
UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=docs/brand/qa/baseline/refinement-ui node scripts/qa/verify-refinement-ui.mjs
UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=docs/brand/qa/baseline/character-customizer node scripts/qa/verify-character-customizer.mjs
SCREENSHOT_FORMAT=jpeg UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=<scratch>/surfaces-full node scripts/qa/brand-surfaces.mjs
UI_ORIGIN=http://127.0.0.1:5209 UI_OUTPUT=docs/brand/qa/baseline/route-transfer node scripts/qa/route-transfer.mjs
QA_ORIGIN=http://127.0.0.1:5211 QA_API=http://127.0.0.1:8787 QA_OUTPUT=docs/brand/qa/baseline/multiplayer-local node scripts/qa/verify-refinement-multiplayer.mjs
UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=<scratch>/schema-roundtrip node scripts/qa/schema-roundtrip.mjs
UI_ORIGIN=http://127.0.0.1:5211 UI_OUTPUT=<scratch>/boards node scripts/qa/board-captures.mjs
# not run at the base (busy host) — placeholder row in baseline/RESULTS.md:
UI_ORIGIN=http://127.0.0.1:5208 UI_OUTPUT=docs/brand/qa/baseline/expanded-performance node scripts/qa/verify-expanded-performance.mjs
```

Run the performance harness alone on a quiet host (`uptime` load average under the CPU count, no other
browser sessions); it records the load before and after so a noisy run can be recognised and repeated.

### `brand-surfaces.mjs`

Surfaces are declared at the top of the script; every control it touches is looked up through
`scripts/qa/locators.json` by role/label (`{ "role": "button", "name": "Settings" }`, `{ "label": "Room name" }`,
regex names as `{ "regex": "..." }`). When the brand pass renames a control, edit the JSON entry, not the script.
Locators already carry the CONTRACTS.md names: brand home link `Brickgineers` (`brandHome`), `People` (`people`,
regex `^People`), `Build together`, `Settings`, `Scene`, `Character`, `Explore` (`exploreMode`, regex
`^Explore( mode)?$` so the pre-brand label still matches), `Back to building`, the world title menu (`worldMenu`,
still `World menu` — W4 must update this entry if the trigger's accessible name changes), save status
(`saveStatus`, `role=status` named `Save status…`).

Viewports: 1366×768, 1024×768, 768×1024, 390×844 (touch), 320×740 (touch), 844×390 (touch landscape).
Variants: `default`; `zoom200` = Chrome 200% zoom emulated as half the CSS viewport at deviceScaleFactor 2 (desktop
and tablet viewports); `reduced-motion` = `prefers-reduced-motion: reduce` at 1366×768 and 390×844.

Hard checks per run: expected element visible, no `pageerror`, no horizontal page overflow, no visible control
outside the viewport (vertical position is ignored on scrollable pages and inside scrollable regions, on either
axis), every open modal dialog fits the viewport, Escape closes sheets that declare `escape`, seeded guest document
unchanged for `documentUnchanged` surfaces (corrupt import, remix confirmation), `expectPressed` toggles carry
`aria-pressed="true"`. Soft checks are recorded in `notes`: touch targets under 44 px on touch viewports
(`STRICT_TOUCH_TARGETS=1` makes them hard), dialog contains focus and focus returns to the trigger after Escape
(`STRICT_FOCUS=1`), animations still running under reduced motion, console errors. The brand contracts require 44 px
targets and focus handling, so the integrated candidate is run with both strict flags.

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

### `board-captures.mjs`

One entry per board state (`BOARDS` at the top of the script): route, optional seeded draft, steps through the
locator map, the element that must be visible, and for editor boards a header probe. Files are named
`NN-<board>[-<state>]-<viewport>.png`; `captures.json` holds status, reason, notes and the header probe per capture;
`README.md` in the output directory is the table to paste into the integrated results. Statuses: `captured`,
`needs-fixture` (account/teacher boards without `SESSION_STORAGE_FILE`, or board 11's in-room state when the worker
cannot be reached), `failed` (anything else — exit code 1). Board 16 is captured at 390×844 only; every other board
at both viewports.

### `schema-roundtrip.mjs`

Fixtures: `scripts/perf/fixtures/mixed-250.brickstudio.json` (schema 2, 250 bricks),
`scripts/qa/fixtures/expanded-128.brickstudio.json` (schema 3, 128-stud plate with an edge brick — the export of the
local two-client baseline run) and `scripts/qa/fixtures/legacy-v1.brickstudio.json` (schema 1: the 250 bricks without
`environmentId`/`customParts`, expected back as schema 2 with `environmentId: "classic"`, `customParts: []`). Each case
imports through the hidden "Choose Brick Studio project file" input, exports through the studio menu, reloads, then
Home → Continue building → reload, comparing the exported JSON (key order ignored) each time; the exports are saved next
to `results.json`.

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
falls back to `http://localhost:8787`, but set it explicitly so the harness's origin check matches, and use
`127.0.0.1` because `localhost` may resolve to `[::1]`, where an unrelated worktree's server was listening during the
baseline. Proven at the base: see `baseline/RESULTS.md` (9/9 steps, export == authoritative document).

## Baseline

`docs/brand/qa/baseline/` holds the pre-brand evidence (results, screenshots, `BUNDLE.md`, `RESULTS.md` with the
exact base SHA per artifact and the pre-brand defect list). `docs/brand/qa/ACCEPTANCE-MATRIX.md` maps every board
and extra-coverage item to a reach path, an assertion, a harness and an owner.
