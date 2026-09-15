# Character Studio polish — September 15, 2026

Local implementation on `codex/character-studio-polish`, based on production evidence HEAD `7e4713a`. Not deployed by this pass.

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
- Browser emulation is not physical Chromebook/tablet certification. No production student data, classroom load test, provider changes or deployment.

## Performance findings

Reports: `outputs/performance/multiplayer-latency-audit.md` and `outputs/performance/render-input-latency-audit.md`. The dropped stop update has a tested local fix. Explore per-brick rendering, Build buffer rebuilding, and serialized classroom database confirmation remain measurement/follow-up candidates. These findings do not establish that remaining lag is primarily network or hardware.

## References

Approved concepts: `outputs/branding/character-studio-concepts/`. This pass uses the existing roster; pictured aspirational garments and characters require separate asset work. Saved looks remain device-local.
