# 2D levels (`/2d`)

The 2D side of Brickgineers: build a side-scrolling level from blocks, springs, enemies and pipes, then run and jump
through it, alone, with friends in a room, or with the class. It shares the site, the header, the design system,
student and teacher accounts, My worlds and class sharing with the 3D builder. A 3D ⇄ 2D switch sits at the top of
both builders (and on the `/2d` pages), and the landing page offers both ("Two ways to build").

## Routes

All of `/2d/*` is one lazy chunk (`src/platformer/PlatformerApp.tsx`); the 3D studio and the landing page never load
it, and it never loads three.js, Rapier or the 3D studio. `src/platformer/routes2d.ts` picks the page.

| Path | What it is |
|---|---|
| `/2d` | Home: start or continue a level, play a course, your levels (account and this browser), levels from your class, join a room |
| `/2d/build` | The builder, on your latest 2D level (the account's newest when signed in, else this browser's, else a new one) |
| `/2d/build?new=1` | The builder on a new level |
| `/2d/build?world=<id>` | An account level (signed in; someone else's opens for playing only) |
| `/2d/build?draft=<id>` | A level kept in this browser |
| `/2d/play/<course>` | A ready-made course: `workshop`, `caves`, `skies` |
| `/2d/play#l=<code>` | A level carried whole in the link ("Copy a link to this level") |
| `/2d/r/<32 hex>` | A guest room: anyone with the link, up to 16 players |
| `/2d/w/<world id>` | A class level's room: signed-in students and the teacher of the class |

## Where the code lives

- `packages/platformer-core` (`@brick-studio/platformer-core`): shared by the browser and the Worker, no DOM.
  - `engine/`: the deterministic simulation (60 ticks a second, integer math, no randomness), tiles, objects,
    physics, the level format and its validation.
  - `net/`: the room protocol (`protocol.ts`), the room logic the Worker runs (`roomCore.ts`) and the rollback
    timeline both sides use (`timeline.ts`).
  - `document.ts`: the account document, `{ format: 'brickgineers-2d', version: 1, level }`.
  - `levels/`: the courses, written as text (legend in `ascii.ts`).
- `src/platformer`: the `/2d` pages, game session, canvas renderer, sound, keyboard/gamepad/touch input and the
  editor. Styles are `ui/platformer.css`: every class is prefixed `p2d-` and uses the shared tokens.
- `src/shell/DimensionSwitch.tsx`: the 3D ⇄ 2D switch used by both builders and the `/2d` pages.
- Shared with the 3D studio, so both builders look and work the same: the editor header (`AppHeader`, with
  `dimension="2d"`: Scene, People, Build | Play and a ⋯ menu of the level's own), the part drawer
  (`src/shell/PartDrawer.tsx`: docked panel, collapsed toggle, and on compact screens a button and bottom sheet),
  Undo and Redo (`src/shell/HistoryTools.tsx`) and the compact-layout rule (`src/shell/useCompactLayout.ts`). The 2D
  builder's copy of the drawer's styles is in the Building section of `platformer.css`; change it with the 3D studio's.
- `multiplayer/worker/src/platformerRoom.ts`: the `PlatformerRoom` Durable Object, one per live 2D room.
- `multiplayer/worker/src/classroomRoutes.ts`: the HTTP routes below; `classroom/index.ts` knows world formats.

## Looks

Every level has a look, `style` in the level format: **cartoon** (toy bricks, the default for new levels) or **pixel**
(the original pixel art). Levels saved before looks existed have no `style` and open as pixel art, so nothing anyone
made changes by itself. The builder picks the look in Scene, next to the scene (Day or Underground); it is an edit
like the scene (`{ o: 'style' }`), so in a room everyone sees the switch, and it never changes how the game plays.

The renderer (`src/platformer/render/renderer.ts`) walks the world the same way for both looks and asks a skin
(`render/skin.ts`) for pictures by the same art keys, for the background and for the HUD, so the editor, the entities
and the camera never know which look is on:

- `render/pixelSkin.ts` draws the pixel art one pixel per world pixel; the page scales the canvas up, crisp.
- `render/cartoon/` draws at the screen's own resolution: `tiles.ts` (bricks with studs on open tops; ground laid as
  two-wide bricks in a running bond), `builder.ts` (the Classic Builder in a hard hat, as a small rig that swings per
  pose; the shirt is the player's colour), `things.ts` (creatures, power-ups, course pieces, effects), `scenery.ts`
  (sky, hills and brick trees; the cave) and `cartoonSkin.ts` (pictures made on first use at the screen's scale).

All cartoon art is original and drawn in code: there are no image files to license or load. The block drawer and the
Scene previews show blocks and levels in the level's own look.

## Saving

- **Guests**: levels save in the browser (`localStorage`, key `brick-studio.2d.drafts.v1`) a second after each
  edit and on the way out. Nothing is sent anywhere unless the player opens a room.
- **Signed in**: a new level becomes an account world on its first edit (the URL changes to `?world=<id>`), then
  saves 0.8 s after each edit with the world's revision, like the 3D builder. It shows in My worlds with a
  "2D level" chip, next to 3D worlds, and counts toward the same 50-world limit. When the account is full the level
  stays in the browser and the builder says so.
- A 2D level is an ordinary `brick_worlds` row whose document carries `format: 'brickgineers-2d'`, so **no database
  migration** is needed. World lists read the format with `doc_format:document->>format` and return it as
  `format: 'brick' | '2d'`. A save cannot change a world's kind (`400 wrong_world_kind`), the 3D room refuses 2D
  documents (`409 wrong_world_kind`), and every 3D entry point (studio, My worlds, live page, class panel) sends a
  2D level to its `/2d` page.

## Rooms

Every player in a room runs the same simulation. What players do to the world (edit, stomp, grab a coin, hit a
block) is an event; the room orders events and stamps each with a tick, and every game applies it at that tick,
rolling back and replaying when an event arrives late. Players' own movement is not simulated for others: each game
sends its player's pose about 20 times a second and shows the others slightly in the past. Keyframes (every 5 s) and
periodic world hashes let a joining or drifting game catch up.

**Guest rooms** (`/2d/r/<id>`) start from any level with "With friends". The creator gets an owner token (kept in
this browser) that makes them host: they can lock building ("Only I can build"), close the room to new players,
remove players, save and restore the room's level, and bring back coins and enemies. A guest room keeps its level in
Durable Object storage and is forgotten two hours after everyone leaves.

**Class rooms** (`/2d/w/<id>`) are the live room of an account level shared with the class. The Worker checks the
account with the same rules as 3D worlds (`authorizeClassroomWorld`), then issues a short-lived ticket for the
socket (audience `brick-2d-v1`, so 3D and 2D tickets are not interchangeable). Names come from the account; the
teacher and the level's owner are hosts; classmates who may only look can play but not build. The room saves to the
world by itself (1 s after edits, at most 5 s behind, retrying with backoff) using the world's revision. If the
level changes elsewhere (restored from My worlds, edited while nobody was in the room) the room reloads it and says
so. When sharing is turned off or a student is removed, the room hears about it right away and closes their socket;
access is also re-checked every minute, and every 15 s for host actions.

Students share their own level with the class from the builder's menu ("Share with my class") or from My worlds,
the same invite sheet as 3D. Teachers can start a class 2D level from My worlds ("Start a shared world", then
"2D level").

## Worker endpoints

| Route | Purpose |
|---|---|
| `POST /platformer/rooms` | Open a guest room from `{ level }` (at most 400 KB; rate limited per IP like 3D rooms) → `201 { roomId, ownerToken }` |
| `GET /platformer/rooms/:id` | A guest room's name, player count and whether it is full or closed (`404` once forgotten) |
| `GET /platformer/rooms/:id/connect` | The guest room's WebSocket (`?ownerToken=` for the host) |
| `POST /classroom/worlds/:id/platformer-ticket` | Signed in: check access to a 2D account level, prepare its room, return a ticket |
| `GET /platformer/worlds/:id/connect?ticket=` | The class room's WebSocket |

The `PlatformerRoom` class is bound as `PLATFORMER_ROOMS` with Durable Object migration `v4`
(`new_sqlite_classes`) in `multiplayer/worker/wrangler.jsonc`, for production and staging.

## Running it locally

Two terminals, both on Node 22:

```sh
npm install
npm run dev                                            # the site, http://localhost:5173
```

```sh
cd multiplayer/worker && npx wrangler dev --port 8787  # the Worker, http://localhost:8787
```

With no configuration, everything a guest can do works: the landing page, `/2d`, courses, building (saved in the
browser), the 3D ⇄ 2D switch and guest rooms (the site looks for the Worker at `http://localhost:8787` by default).
Signing in, account levels, My worlds and class rooms also need the Worker's Supabase secrets in
`multiplayer/worker/.dev.vars` (see `.dev.vars.example`) and `VITE_CLASSROOM_SERVER_URL=http://localhost:8787` in
`.env.local`.

Checks:

```sh
npm run check                     # includes the platformer-core tests and typecheck
node scripts/qa/platformer-2d.mjs # browser pass over the guest flows (UI_ORIGIN, default http://127.0.0.1:5199)
```

## Deploying

The Worker must go out before the site, because the site calls the new routes. Deploy the Worker to staging first:
the `v4` migration creates the `PlatformerRoom` class, and Durable Object migrations cannot be undone once applied.
Then production, then the site. No database migration and no new secrets are needed.

## Not done yet

- My worlds' "building now" counts only look at 3D rooms, so live 2D class rooms do not show there.
- Account 2D levels have no picture of the level in lists (cards show 2D art; local drafts and courses do show
  their level).
- 2D levels share the 50-world account limit with 3D worlds.
