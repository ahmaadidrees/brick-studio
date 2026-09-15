# Character Studio polish — September 15, 2026

Local implementation on `codex/character-studio-polish`, based on production evidence HEAD `7e4713a`. Released after local verification; see release record below.

## Changes

- Characters / Customize / My looks separate focused views with one mounted preview.
- Lightweight illustrated appearance choices for supported existing models; Head / Outfit / Colors / Extras.
- Head/body camera framing, model-specific controls, keep locks and reversible Mix.
- Character Studio heading and Use this look footer; draft Cancel, Scene navigation, legacy looks and device-local wardrobe preserved.
- Bounded Worker fix accepts a final moving-to-idle transition inside the normal pose interval while retaining repeated-packet and flood protection.

## Verification

- Frontend: 110 files, 1,087 tests passed. Worker: 8 files, 130 tests passed.
- Core and Worker typechecks passed; final TypeScript/Vite build passed.
- Real WebGL local browser harness: all six existing character animations; Pip/Fern/Nova and customized Toy Figure apply/cold reload; favorite wardrobe restoration; keep-lock shuffle and undo; private draft cancel; responsive viewport bounds. See `local/results.json` and screenshots.
- Browser emulation is not physical Chromebook/tablet certification. Local verification did not use production student data or classroom load tests.

## Performance findings

Reports: `outputs/performance/multiplayer-latency-audit.md` and `outputs/performance/render-input-latency-audit.md`. The dropped stop update has a tested local fix. Explore per-brick rendering, Build buffer rebuilding, and serialized classroom database confirmation remain measurement/follow-up candidates. These findings do not establish that remaining lag is primarily network or hardware.

## References

Approved concepts: `outputs/branding/character-studio-concepts/`. This pass uses the existing roster; pictured aspirational garments and characters require separate asset work. Saved looks remain device-local.

## Production release

- Product commit: `4c635f4`, branch `codex/character-studio-polish` pushed.
- Frontend: `dpl_DhGkhjicqb3so4QMmpvJSDcd1Fou`, https://virtual-legos-n6xdlwekl-ahmaadidrees-projects.vercel.app
- Promoted to brickgineers.com and virtual-legos.vercel.app; both public aliases verified to serve `/assets/index-3oVlksXB.js`.
- Worker: `82b03692-0bff-4850-91b6-7026ea6d8ed6`.
- Hosted candidate and public browser smoke passed: Character Studio opens, customization applies, cold reload preserves appearance, no page errors on tested flow. Screenshots and JSON in `release/`.
- Rollback frontend: `dpl_HKsy8HmmEjaFkckeDFdfBVz8Eg1i` (virtual-legos-fr5412g7f-ahmaadidrees-projects.vercel.app). Worker previous: `25338c36-785e-4ae8-b874-a8d1b747a1da`.
- No new live classroom load test or physical device certification. Backend behavior verified by the 130 Worker tests, including the stop-pose regression; production upload/version confirmed.
