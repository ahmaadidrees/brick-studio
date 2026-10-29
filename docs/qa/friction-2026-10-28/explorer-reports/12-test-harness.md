# Pass 2: 12-test-harness

Everything you asked about already exists, with one blocker for parallel lanes: the shared local launcher uses fixed ports, so only one lane can run it at a time. Nothing was run except quick listings. Full paths are under `/Users/ahmaadidrees/.codex/worktrees/microbit-editor-plan/`, shortened below.

## 1. Test infrastructure

- **Unit and component tests:** vitest 4 with jsdom (`vite.config.ts`). It uses React Testing Library and jest-dom, with setup in `src/test/setup.ts`. There are 265 test files and the last release had 1,666 tests passing. `src/classroom/mockClient.ts` is an in-memory classroom client used by tests.
- **Worker tests:** `@cloudflare/vitest-plugin` running in the real Workers runtime, single worker, not isolated (`multiplayer/worker/vitest.config.ts`). About 241 tests in `multiplayer/worker/test/`.
- **Browser automation:** plain Node scripts in `scripts/qa/*.mjs` and `scripts/demo/*.mjs`. Playwright is not a devDependency.
  - `scripts/qa/lib/env.mjs` loads Playwright 1.61.1 from a hardcoded npx-cache path, which exists on this Mac. It drives system Chrome. You can override both with `PLAYWRIGHT_MODULE` and `CHROME_PATH`.
  - Shared helpers: `scripts/qa/lib/ui.mjs`, `surfaces.mjs` (viewports plus overflow, 44px touch-target and focus checks) and `locators.json`.
  - You run each script by hand with `UI_ORIGIN=… node scripts/qa/<x>.mjs`.
- **Socket-only probes:** `scripts/live-world-load.mjs` (30 clients plus a rejected 31st, built-in WebSocket) and `scripts/qa/live-latency.mjs`. live-latency **defaults to the staging Worker**, so always set `QA_API`.
- **Local stack:** `scripts/local/start.mjs` starts three things:
  - a fake Supabase provider (`scripts/local/fixture-server.mjs`);
  - the real Worker via `wrangler dev --local`, using a generated config in tmpdir with dummy secrets;
  - Vite.

  It never reads `.dev.vars`, and there is no `.dev.vars` in this checkout, only `.dev.vars.example` with five variable names. Ports are fixed: 5185, 8798, 8799 and 9235.
- **CI:** runs `npm run check` (tests, Worker tests, typechecks, build). No browser tests run in CI.

## 2. The acceptance journeys

| Journey | Closest existing | Cheap to extend? | Missing / backend needed |
|---|---|---|---|
| Guest 3D New build + reload | `src/brick/BrickStudioApp.test.tsx:1118`, `src/brick/store.test.ts:698`, `src/projects/projects.test.ts`; browser: `scripts/qa/schema-roundtrip.mjs` (reload, then Home → Continue) | Yes | No test lists several drafts. No Worker needed. |
| Guest room closed → continue your copy | 3D: `src/brick/live/liveRoomViewStore.test.ts`, `LiveWorldHud.test.tsx`; browser `scripts/qa/verify-refinement-multiplayer.mjs`. 2D: `src/platformer/net/roomLink.test.ts`; browser `scripts/qa/platformer-2d.mjs` | Unit tests: yes | 3D guest rooms only expire 2h + 90s after last activity (`multiplayer/worker/src/worldRoom.ts:137,464`), so you can't wait for it in a browser. Simulate by mocking the gateway, or by opening an unknown room id. Browser runs need the local Worker; guest rooms work without secrets. |
| Class autosave recovers after offline | `src/classroom/cloudAutosave.test.ts` (fake timers, mocked fetch), `src/classroom/useClassroomWorld.test.tsx:125` | Yes | Test at line 31 asserts a 409 conflict is never retried silently. Lane B must keep that and only auto-retry network failures. No browser script exists; use the local stack plus Playwright `context.setOffline()`. |
| Code box → tap your name / I'm new / Not me | `src/pages/join/JoinPage.test.tsx:154,166`, `src/brick/landing/LandingPage.test.tsx:53`, `joinQuery.test.ts`; browser `scripts/qa/flows-e2e.mjs` | Yes | "Not me" case is new. Classroom mock or local stack is enough; no Worker rooms. |
| Teacher password reset readable | `src/classroom/RosterView.test.tsx:51`, `ClassroomPanel.test.tsx`; dev page `/class?demo=everyday` | Yes | `src/pages/class/ClassPage.test.tsx` has **no** password tests. No backend needed. |
| 17th client sees "full" in 2D room | Server side is already covered: `packages/platformer-core/src/net/roomCore.test.ts:81` (16 players). Client: `roomLink.test.ts`, which fakes sockets | Yes | Add a `full` case to `roomLink.test.ts` for the retry loop at `src/platformer/net/roomLink.ts:298`. For a scripted run, adapt `live-world-load.mjs` to 16 2D bots plus a browser as the 17th. A class room needs `start.mjs` for tickets; a guest 2D room uses the same room logic. |
| Hackable slider undo + place new brick | `src/platformer/lab/studio/workshop/KnobsCard.test.tsx`, `store.slice1.test.ts`, `screen/StudioShell.test.tsx`; `setKnob` at `store.ts:457`; browser `scripts/demo/lib/studio.mjs` | Yes | No undo test for sliders yet. No Worker needed. |
| Layouts 1366×768, 768×1024, 1024×768 touch, Duo | `scripts/qa/lib/surfaces.mjs` (viewport list), `flows-surfaces.mjs`, `brand-surfaces.mjs`, `verify-touch-layout.mjs` | Partly | All three sizes are listed but with touch off; 1024×768 needs touch on. No Duo preset exists, and Playwright doesn't emulate the fold; only CSS comments mention Duo (`src/platformer/lab/studio/screen/screen.css:234`). |

## 3. Signed-in classroom journeys without production accounts

Yes, three ways:
- **Full local stack:** `node scripts/local/start.mjs` (docs: `docs/LOCAL-INVITES-MOTION-PIPES.md`). Fake accounts are written to `accounts.json` in tmpdir and the password is a constant in `fixture-server.mjs`. It runs the real Worker's invites, tickets and rooms. It does not prove database row-level security or Google sign-in.
- **Lighter mock:** `scripts/qa/lib/classroom-mock-server.mjs` with seed and session control routes.
- **Unit and dev demo:** `src/classroom/mockClient.ts` for vitest and `/class?demo=first-run|everyday` in dev builds.

**Likely stale (inference, not run):** `scripts/qa/flows-e2e.mjs` reads the session token from sessionStorage under the old `brick-studio.classroom-session.v1` key. The app now migrates that key to v2 in localStorage (`src/classroom/sessionStore.ts:21,89`), so seeding a session still works but reading the token back will return null.

## 4. Flaky or slow areas

- Full `npm test` runs have hit 1–4 tests timing out at 5s when the Mac is under load. `src/brick/BrickStudioApp.test.tsx` is the usual one; failing files pass when rerun alone. Six lanes running at once will cause this.
- `src/platformer/lab/studio/code/tidy.test.ts` has an undo test that is flaky under full-suite load (`docs/qa/code-lab-core/reports/step7-bricks.md:56`).
- Default `node` is v26.8.2 while `engines` says 22.x. The docs say to run `start.mjs` with `/opt/homebrew/opt/node@22/bin` first in `PATH`.
- New worktrees have no `node_modules`; each lane needs `npm ci` (includes wrangler).

## 5. Recommendation

- **Each lane:**
  - targeted vitest, e.g. `npx vitest run <files> --maxWorkers=2 --testTimeout=15000`;
  - its typecheck and build;
  - `npm run test:worker` only if it touches `packages/platformer-core` (no lane should touch the Worker);
  - leave full `npm test` and browser journeys to the morning merge.
- **Before lanes start, one small helper:** let `start.mjs` read its ports from an environment variable (e.g. `LOCAL_PORT_BASE`). Without it only one lane can run the local stack at a time.
- **Optional:**
  - a 1024×768 touch entry and an approximate Duo viewport in `surfaces.mjs`;
  - updating the session key in `flows-e2e.mjs`.

  These can wait for the morning merge.