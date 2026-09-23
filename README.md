# Brickgineers

Brickgineers (formerly Brick Studio) is a browser-based building toy made for classrooms. Build with toy bricks on a
64 × 64-stud plate, then step inside the exact creation and explore it in third person — on your
own, with friends in a live room, or as a class with a teacher in charge. It runs in a plain browser
tab with nothing to install, including on school Chromebooks.

Live: **https://virtual-legos.vercel.app** (landing page at [/welcome](https://virtual-legos.vercel.app/welcome)).

Brickgineers is an independent project and is not affiliated with, sponsored by, or endorsed by the
LEGO Group. LEGO® is a trademark of the LEGO Group.

## What you can do

Without an account (nothing is sent anywhere unless you choose to):

- Build: 23 stock parts plus custom bricks up to 32 × 32 studs and 96 plates tall; recolor (palette
  or custom color), move, rotate, duplicate, box-select groups and drag them, raise a selection with
  the height handle, undo.
- Explore: walk, jump and climb inside the build with one of three characters (Classic Builder, Toy
  Figure, Robot Hero) in one of four scenes (Classic Studio, Toy Room, Brick Valley, Sky Island).
- Keep work: the draft survives reloads in the browser; Import / Export `.brickstudio.json` files.
- **Build together**: start a temporary live room (up to 32 builders) and share its invite link.
  Guests pick a builder name; the owner controls Build/Explore mode and can close the room to new
  people. From the room's Share panel the owner can **Publish snapshot** — a read-only `/world` link
  that carries the whole build, which anyone can open and remix into their own draft. Rooms expire
  about two hours after the last activity, so export to keep the build.

- **2D worlds** (`/2d`): build a side-scrolling world from bricks, springs and critters, run and jump through it,
  try three starter worlds, or open a room for up to 16 players who build and play in one world. The 3D / 2D
  switch at the top of either builder goes straight to the other. See [docs/PLATFORMER.md](docs/PLATFORMER.md).

With a class account:

- **My Worlds**: save builds to the account and reopen them on any device, with checkpoints.
- **My Class**: teachers sign in with Google (or email/password), create a class, hand out its
  enrollment code, manage the roster (usernames, temporary passwords, suspension), and create
  whole-class or group worlds that students join from My Class — no email addresses needed.

## Routes (src/main.tsx)

| Path | What it is |
|---|---|
| `/` | The studio: build and explore, guest by default; ⋯ menu for Import/Export, Scene & character, Build together, My Worlds, My Class |
| `/welcome` | Landing page |
| `/live/:roomId` | A live Build together room (owner view, or guest view via the invite link) |
| `/world#…` | Read-only reader for a shared build; the snapshot is compressed into the URL fragment; Remix copies it into your local draft |
| `/auth/teacher-callback` | Return leg of the teacher Google sign-in (PKCE) |
| `/2d/*` | 2D worlds: home, builder, starter worlds, guest rooms and class rooms ([docs/PLATFORMER.md](docs/PLATFORMER.md)) |

## Quick start

Requires **Node 22**, pinned by `.nvmrc` and the `engines` field and matching CI.

```sh
npm install
npm run dev
```

Open the URL Vite prints. With no environment variables set, guest building, local drafts, Import /
Export and Share links all work; Build together, My Worlds and My Class need the Worker below.

```sh
npm run check         # unit tests + Worker tests + typechecks + production build (what CI runs)
npm test              # frontend + brick-core tests (vitest)
npm run test:worker   # Cloudflare Worker tests in the workerd runtime
```

## Environment variables

Frontend (`.env.local` for development — see `.env.example`; set in Vercel for deployments):

| Name | Purpose |
|---|---|
| `VITE_CLASSROOM_SERVER_URL` | Origin of the Worker serving the classroom API (`/classroom/*`): accounts, My Worlds, My Class |
| `VITE_LIVE_SERVER_URL` | Origin of the Worker hosting live rooms (`/worlds/*`); usually the same Worker |
| `VITE_PUBLIC_ORIGIN` | Absolute public origin for link-preview URLs in `index.html`; the committed default lives in `.env.production` |

Worker secrets (`multiplayer/worker/.dev.vars` locally — see `.dev.vars.example`; `wrangler secret put` in production):

| Name | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only key for the `brick_*` tables and RPCs (never reaches the browser) |
| `SUPABASE_ANON_KEY` | Public key used for Supabase Auth flows |
| `BRICK_TEACHER_IDS` | Comma-separated Supabase user UUIDs allowed to hold a teacher session |
| `CLASSROOM_TICKET_SECRET` | Signing key (32+ characters) for short-lived live-room tickets |

## Architecture

```
Browser — Vite SPA (React 19, three.js / react-three-fiber, Rapier physics), hosted on Vercel
   │  /classroom/*  JSON API with bearer tokens        │  /worlds/*  WebSocket rooms
   ▼                                                    ▼
Cloudflare Worker (multiplayer/worker) — Durable Objects: WorldRoom (one per live room,
   │  hibernating, authoritative document), PlatformerRoom (one per live 2D room), WorldCreationLimiter
   ▼  service-role queries
Supabase Postgres + Auth — brick_* tables with RLS, checkpoints (supabase/migrations)
```

`packages/brick-core` holds the document format, part catalog, layout validator and live-room
protocol shared by the browser and the Worker; `packages/platformer-core` does the same for 2D levels (simulation,
level format, room protocol). `vercel.json` serves `public/` assets and rewrites
everything else to `index.html`.

Deeper docs:

- [docs/classroom/API.md](docs/classroom/API.md) — classroom API, auth model, limits
- [docs/LIVE_WORLD_PROTOCOL.md](docs/LIVE_WORLD_PROTOCOL.md) — live-room wire contract
- [docs/PLATFORMER.md](docs/PLATFORMER.md) — 2D worlds: routes, saving, rooms, running locally, deploying
- [docs/classroom/TEACHER-PILOT.md](docs/classroom/TEACHER-PILOT.md) — running the first class
- [docs/PERF-BASELINE.md](docs/PERF-BASELINE.md) and [docs/CHROMEBOOK-CHECKLIST.md](docs/CHROMEBOOK-CHECKLIST.md) — device measurements
- [scripts/README.md](scripts/README.md) — fixtures, brand assets, load harness

## License

Not yet chosen — all rights reserved until a license file is added.
