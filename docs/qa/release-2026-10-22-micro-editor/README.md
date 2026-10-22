# Block editor at /micro and the race racers fix — October 22, 2026

Product commits on `claude/microbit-remote`, on top of the 2026-10-20 Remote release (`68c7a59`):
- `e51918f`: Race. The "Computer racers" menu stayed open for only an instant. The race strip handed focus back to
  the game after every click, which closed the native select as it opened.
- `331faa8`: Block editor at `/micro`, a self-hosted MakeCode for micro:bit (`pxt-microbit` `v9.0.12`, MIT), built by
  `scripts/build-micro-editor.mjs` with Microsoft's telemetry and feedback widget removed (see
  [docs/MICRO-EDITOR.md](../../MICRO-EDITOR.md)). The Remote panel links to it as "Code your micro:bit" in a new tab,
  with a note that only one tab can use the micro:bit at a time.

Frontend only: no Worker deploy, no database migrations.

## Deployments

- Preview: `dpl_72qftReMYvbi9Rc3YPZKtgBCEVys` (https://virtual-legos-n4b9u8pho-ahmaadidrees-projects.vercel.app),
  checked first.
- Production: `dpl_9wrT2crkzxabakvrDSn3LEE8Wnfx`, https://virtual-legos-8qb7hmnm6-ahmaadidrees-projects.vercel.app,
  aliased to https://brickgineers.com. Deployed once, from the same `.vercel/output` as the preview.
- Built locally with the production environment from `vercel pull` (`npm run build`). `.vercel/output/static` holds
  `dist` plus the editor in `micro/` (3,851 files, 275 MB). `config.json` keeps the 2026-10-15 routes and adds three
  after `filesystem`: `/micro` → `/micro/index.html`, and `/static/*` and `/docs/static/*` → `/micro/docs/static/*`
  (MakeCode images that use root paths).
- Worker unchanged: `bf95772d-3342-41e0-b528-9203444f70ad`.

## Checks

- `npm run check`: app suite 1,657 passing; Worker suite 241 passing; typechecks and production build passed.
- Locally and on the preview:
  - The editor's home page and a new project load.
  - The simulator is served from our origin (`/micro/simulator.html`), and button A ran a program.
  - Download compiled a combined V1/V2 `.hex` in the browser.
  - The only network hosts were our origin and one YouTube thumbnail; the preview also adds Vercel's `vercel.live`
    toolbar.
  - The Remote panel link opens `/micro/` in a new tab.
  - The racers menu stays focused when clicked, and picking a number restarts with that many cars.
- Production (brickgineers.com):
  - `/`, `/micro`, `/micro/`, `/micro/simulator.html`, both image routes, `/microbit/brickgineers-remote.hex`,
    `/2d/build` and `/class` return 200.
  - The site serves `index-6fRo5ieV.js`, the same as the local build.
  - `/micro` loads in the browser using only brickgineers.com, plus the YouTube thumbnail.
  - The telemetry stand-in is present.

## Not tested

- Flashing a real micro:bit from `/micro`: WebUSB Pair, and Download → drag.
- School Chromebooks on the school network.
- MakeCode share links and GitHub extensions. They need MakeCode's cloud, so expect them not to work.

## Rollback

Previous website: `dpl_2NNv4SghWb56qkhAgQsoFsYGQcmi` (`vercel promote` it, or roll back in the Vercel dashboard).
No Worker or database changes to undo.
