# Parity B: which classic bricks kids use, November 4, 2026

The owner approved one read-only count on the production database to order bucket B (decisions of 2026-11-04). This
page is that count. It holds counts only: no ids, names, titles or level content left the database, and no rows were
stored.

## How it was counted

- **Where classic levels live.** Saved classic Platformer and Racing levels are account worlds: `public.brick_worlds`
  rows in the shared Supabase project whose `document->>'format'` is `brickgineers-2d`
  (`packages/platformer-core/src/document.ts`). Race tracks carry `level.kit = 'race'`. Class rooms write back to the
  class project, so those are included.
- **Not counted.** Browser drafts (`localStorage`), downloaded files and `#l=` share links never reach the database.
  Deleted projects (`deleted_at` set) were left out.
- **The query.** One statement, run on 2026-11-04 through the Supabase Management API
  (`POST /v1/projects/wfrvgbnmyenidlpmimhl/database/query`) as `begin; set transaction read only; select …; commit;`.
  - It decodes each level's run-length `tiles` and `contents` strings and its `objects` list inside Postgres.
  - It returns, per kit and brick: how many projects use it, how many different owners (kids) use it, and how many
    were placed in total.
  - Before it ran on production, it was checked in a local Postgres (PGlite) against the 6 built-in courses: all 53
    tile, content and object totals matched a count made in TypeScript with the game's own decoder.
- **Read with care.**
  - New classic projects can start from a built-in course, so a project that is a barely changed course counts all of
    that course's bricks. "Owners" softens this a little (one kid with many copies counts once).
  - "Placed" counts cells for tiles. A pipe is 2 cells wide and usually 2–4 tall.

## Platformer: 566 projects by 356 owners

Missing in Hackable are in **bold**.

| Brick | Projects | Owners | Placed |
|---|---:|---:|---:|
| Ground | 558 | 354 | 194,474 |
| Goal | 525 | 339 | 525 |
| Start | 465 | 306 | 465 |
| Lava | 385 | 261 | 24,625 |
| Spikes | 317 | 215 | 7,369 |
| Spring | 302 | 209 | 2,055 |
| Brick | 289 | 198 | 9,248 |
| Walker | 277 | 195 | 4,489 |
| Coin | 273 | 204 | 8,284 |
| ? block | 271 | 198 | 1,807 |
| **Moving platform** (side to side) | 268 | 183 | 1,061 |
| ? block or brick holding a coin (Hackable ? blocks give coins) | 255 | 193 | 1,713 |
| **Checkpoint** | 245 | 165 | 720 |
| **Pipe** | 238 | 182 | about 2,090 cells |
| Bounce block | 233 | 172 | 3,207 |
| **Shellbug** | 215 | 152 | 3,214 |
| **Flyer** | 211 | 143 | 3,052 |
| Hard block | 208 | 133 | 9,770 |
| **Spiky** | 201 | 136 | 3,156 |
| One-way platform | 197 | 134 | 3,727 |
| **Grow power-up** (placed) | 177 | 133 | 1,908 |
| **Up-down platform** | 154 | 120 | 644 |
| **Spark power-up** (placed) | 150 | 109 | 1,109 |
| **? block or brick holding Grow** | 82 | 53 | 152 |
| **Pipes linked to another pipe** | 65 | 49 | 65 levels |
| **? block or brick holding Spark** | 50 | 40 | 107 |

Level settings:

| Setting | Projects | Owners |
|---|---:|---:|
| **Cartoon look** | 500 | 322 |
| **Underground theme** | 126 | 87 |
| **Longer than 120 tiles** (the classic default is 160) | 566 | 356 |

## Racing: 127 projects by 94 owners

| Brick | Projects | Owners | Placed |
|---|---:|---:|---:|
| Barrier | 125 | 93 | 38,054 |
| Grass | 125 | 94 | 219,655 |
| **Items on** (a track setting) | 125 | 93 | 125 tracks |
| Road | 122 | 93 | 84,946 |
| **Tree** | 111 | 89 | 3,251 |
| Finish line | 109 | 86 | 654 |
| **Grandstand** | 108 | 88 | 5,735 |
| **? block** | 107 | 85 | 1,810 |
| **Coin** | 106 | 85 | 1,060 |
| **Water** | 104 | 80 | 9,314 |
| **Walker** (any way) | 102 | 79 | 967 across, 243 along |
| **Tire stack** | 100 | 81 | 6,475 |
| **Flowers** | 97 | 80 | 1,852 |
| **Jump ramp** | 95 | 78 | 1,079 |
| Dirt | 94 | 73 | 8,626 |
| Ice | 94 | 79 | 14,920 |
| Boost pad (any way) | 94 | 78 | 5,157 |
| **Bumper** | 92 | 74 | 772 |

## What it says

- **Nothing can be dropped.** Every missing classic brick is in at least 150 Platformer projects (27%), or 92 Racing
  projects (72%). The audit hoped usage might halve bucket B; it doesn't.
- **Platformer, most used first:** moving platforms (268, plus 154 with up-down), checkpoints (245), pipes (238), then the three critters (about 200 each), then Grow (177) and Spark (150).
- **Two settings touch almost every level:** the cartoon look (500 of 566) and the classic length of 160 tiles (all
  566). Hackable levels are shorter and drawn in one look.
- **Racing is flat:** every missing brick is in 92–111 of 127 tracks. Almost every track has items on (125), so ? blocks
  and items matter more than their own count suggests.
