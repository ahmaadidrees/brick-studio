# Product refinement execution

Goal: retain the current Brick Studio design while making controls clearer, building less constrained, and character customization a flagship feature.

Working branch: `codex/product-refinement`, based on Claude recovery integration `20859d1`. Production is not changed until candidate verification.

## Delivery checklist

- [ ] Landing at `/`, editor at `/build`, compatible `/welcome` and classroom callback/return links; continue existing guest draft.
- [ ] World-title menu and save status; clear Explore/Back; compact editing toolbar; visible Scene/Character; collaboration and classroom reachable at compact sizes.
- [ ] Wider Build and Explore zoom with clipping/interior checks.
- [ ] Persisted 64/96/128 world plate size; legacy documents default 64, safe shrinking, stable placement, scene framing, authority validation, save/reload and multiplayer convergence.
- [ ] Custom brick bounds 64x64 studs / 192 plates subject to footprint and render checks; keep brick count budget separate.
- [ ] Dedicated character customizer: live rotatable preview, motion previews, face/hair/outfit/accessories/colors, apply/cancel, controlled randomization, saved outfits/favorites for guests.
- [ ] Cohesive starter looks and new original characters using compatible geometry/animation; appearance persists and converges in multiplayer without draft broadcasts.
- [ ] Focused tests, full checks on Node 22, desktop/compact browser review, authoritative persistence and two-client verification, hosted candidate, production release evidence.

## Sequencing and constraints

Start with navigation/routing/zoom, then world-size schema and consumers, then customization and content. Keep these changes reviewable in separate commits. Preserve Claude's error boundaries, active-world recovery, graphics pause, and targeted invalidation. Guest building and guest link collaboration remain available. Preserve all existing saved builds and links. Do not change auth or classroom policy as part of this goal.

No fixed claim about physical Chromebook performance: browser emulation is evidence about layout and interaction only. Proposed larger limits must be checked against collision, studs, scene extent, and spawn costs before release.

## Checkpoint 1 — routing and zoom implementation

Landing/editor route separation and known classroom/room return links implemented. `/welcome` canonicalizes to `/`; shared `/world` and `/live/:id` routes are preserved. Expanded camera range: Build 1.2 minimum with a wider bounds-derived maximum; Explore 1.8–24, retaining obstruction handling and the original default distance.

Node 22.23.2: 24 routing/landing/classroom tests and 68 camera/editor tests passed; TypeScript and production build passed. Browser navigation, persistence/reopen, camera clipping and visual review remain pending. No deployment performed. Next: header/tool grouping, dedicated Scene/Character entries, landing Continue building, then world-size schema and consumers.

## Checkpoint 2 — navigation and toolbar

World-title menu, visible Scene/Character entries, independent save status, consolidated editing toolbar and narrower header groups implemented in the current style. Character entry opens its tab. Home saves before navigating; landing offers Continue building for existing local work. Older room recovery now returns to `/build`. Menu keyboard/Escape handling preserves active placement. Duplicated empty-world hints no longer overlap.

Final Node 22 frontend run: **866 tests across 90 files passed**. TypeScript/build and diff check passed. Six real-browser viewport/modality cases passed with no header/toolbar overlaps, offscreen controls or page exceptions. UI placement -> Home -> Continue building preserved the complete stored document. See `docs/classroom/REFINEMENT-NAVIGATION-QA.md` and `scripts/qa/verify-refinement-ui.mjs`.

No deployment yet. Next work is persisted world plate dimensions and their placement/scene/authority consumers, followed by the dedicated character customizer and content. The goal remains full scope; existing unchecked delivery items require integration/hosted proof before release.
