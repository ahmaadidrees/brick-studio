# Block editor at brickgineers.com/micro

2026-10-21 · A self-hosted copy of MakeCode for micro:bit (`microsoft/pxt-microbit` `v9.0.12`, MIT), so students
get every MakeCode block at a school whose network blocks MakeCode's own domains. It may be temporary; the plan for
our own editor is in [MICROBIT-EDITOR.md](MICROBIT-EDITOR.md).

## Why it helps on school networks

makecode.microbit.org loads from several domains: the editor from `makecode.microbit.org`, scripts from
`cdn.makecode.com`, and the simulator from `trg-microbit.userpxt.io`. A filter that blocks one of them gives an
editor without a simulator, or no editor at all. The static copy serves the editor, the simulator
(`/micro/simulator.html`), the compiler and the precompiled micro:bit runtimes (`/micro/hexcache`) from
brickgineers.com.

## Build

```bash
node scripts/build-micro-editor.mjs <work-dir>
```

Clones the pinned release into `<work-dir>/pxt-microbit`, installs it, runs `pxt staticpkg --route micro`, and
removes Microsoft's usage telemetry (Application Insights) and feedback widget (Usabilla) from every page. The editor
still calls `window.appInsights`, so it gets a stand-in that does nothing. Output: about 250 MB and 3,600 files in
`<work-dir>/pxt-microbit/built/packaged/micro`, mostly docs. It's not committed.

Checked locally on 2026-10-21 (Chrome, `python3 -m http.server`):
- The home page, a new project, and the Blocks and JavaScript views all load. Projects are saved in the browser.
- The simulator runs from our origin: button A showed the heart.
- Download compiles in the browser to a combined V1/V2 `.hex` with no network calls. It offers WebUSB Pair or
  Download as File.
- Network: only our origin, plus one YouTube thumbnail on the home page.

Not yet checked: flashing a real micro:bit from `/micro`, sharing (needs MakeCode's cloud, so expect it not to
work), and GitHub extensions (same).

## Deploy

Copy the output into the prebuilt site next to the app (`.vercel/output/static/micro`) and add these routes to
`.vercel/output/config.json`, after `{"handle": "filesystem"}` and before the app's `index.html` fallback:

```json
{ "src": "^/micro/?$", "dest": "/micro/index.html" },
{ "src": "^/static/(.*)$", "dest": "/micro/docs/static/$1", "check": true },
{ "src": "^/docs/static/(.*)$", "dest": "/micro/docs/static/$1", "check": true },
```

A few home-page and tutorial images use root paths (`/static/…`, `/docs/static/…`); the last two routes send them
to the editor's copies. The app itself uses neither path.

## Names

The code is MIT, but "Microsoft MakeCode" and "micro:bit" are trademarks. Link to it as the "Block editor",
"works with the BBC micro:bit", and don't present it as Microsoft's official site.
