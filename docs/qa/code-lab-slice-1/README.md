# Code Lab Slice 1 — local handoff

Date: 2026-10-15. Branch: `claude/code-lab-slice-1`, based on spec commit `cab94f2` and runtime `2cd8d94`.

Implementation commit: `3604efe` (runtime `c946161`, remix/state `4c6132b`).

Preview: http://127.0.0.1:5280/2d/lab/next

Start again from this worktree with `npm run dev -- --host 127.0.0.1 --port 5280 --strictPort`.

## Delivered

- One docked brick card: Sliders / See inside / Look, explicit All copies / Just this one, own-value markers/reset, costume previews, protected Hero/Goal actions and original-restoration confirmation.
- Resizable code panel (380px–60vw, default 440px, remembered), real-level preview, focus-scoped keyboard controls, Pause / Restart and visible editor status. Closing code returns to Sliders.
- Structural changes remix the level's definition, retaining stable brick/copy IDs and `remixOf`. Numeric/dropdown/layout edits do not remix. Catalog originals remain untouched; reset preserves compatible copy values.
- Exact executed-block tracing, selected-copy attribution (including same-tick deleted clones), capped 10Hz glow and no glow while paused. Determinism tested with/without observers.
- Pending editor changes flush before Play/Restart. Same-ID restoration discards stale editor saves. Target-name references survive remix/reset and stale editor serialization. Removing/hiding sliders removes invalid overrides.
- Long procedures open folded. Hero loop has four grouped calls without changing movement math.
- Ground is the first brush, out-of-bounds input is ignored, Follow the Hero is default, obsolete stage labels/flag removed, Empty starts with a hat/hint, custom bricks appear under My bricks, duplicate names are disabled, ? block exposes times left, drawer art is enlarged and naming lists cleaned.
- Under 768px: Sliders and Look remain available; code states that a bigger screen is needed.

## Verification

- `npx vitest run src/platformer/lab`: 90 files; 1,217 passing tests plus 25 intentional expected-failure negative controls. The negative controls are the existing deliberately poor movement stand-in, not unresolved product failures.
- `npm run build`: passed, including TypeScript. Existing large-chunk warnings remain.
- `git diff --check`: passed.
- Browser checks and screenshots: [WALKTHROUGH.md](WALKTHROUGH.md). Actual number edit, palette drag/remix, restart, reset, copy override/cold reopen, Hero drill-in, pause/glow and new-brick flow were exercised.

## Implementation decisions and limits

- The dock uses Blockly's standard categorized, auto-closing flyout. The full-screen Workshop keeps the existing continuous palette. The continuous flyout consumed almost the entire default 440px dock in the first browser pass.
- Toolbar and My Blocks shelf are compact in the dock. Auto-fit retains a readable minimum scale; larger scripts scroll.
- Hero names are truthful to the existing logic: read keys and walls / walk and run / jump (hold to go higher) / fall and land. Wall-jump logic remains inside the existing jump procedure; no new squash or physics behavior was invented merely to match illustrative names in the spec.
- Parameter/literal/procedure-header nodes do not all carry individual IR IDs; executable parent/call/body blocks trace. No runtime semantics changed.
- Existing saved per-copy overrides stay intact. Fresh starter Walkers inherit the same speed, making All copies immediately demonstrable.
- The real Chromebook / 4x-CPU stage-plus-editor FPS target has not been measured. This handoff is ready for the owner's local playtest, not a performance certification.
- Cloud account saving, rooms, racing bricks, 3D and the library remain later slices. This local browser's save is separate from production projects.
- No changes to the live builder or platformer-core, no migration, push, merge or deployment. Integrate with the current production branch deliberately before any future release; this lab branch does not include the newer racing/login/projects release.

## Next

Owner playtest of the eight-step flow, keyboard control/feel and dock ergonomics. Resolve concrete feedback here before implementing shared-code rooms and production document compatibility.
