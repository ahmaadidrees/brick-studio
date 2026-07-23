# Brick Studio Builder Experience Alpha — execution evidence

## Candidate and isolation

- Immutable baseline: `9b8da5ab33ad3800b91d5209528be41510edb44f`
- Integration branch/worktree: `codex/virtual-legos-execution` at `/Users/ahmaadidrees/.codex/worktrees/4b9c/Virtual Legos`
- Code candidate before this evidence-only commit: `d58fee97e14b5903584f7d0935c5e4dcbdf5bc96`
- Code range: `9b8da5ab33ad3800b91d5209528be41510edb44f..d58fee97e14b5903584f7d0935c5e4dcbdf5bc96`
- User main remained clean and unchanged at `9b8da5ab33ad3800b91d5209528be41510edb44f`.
- Browser verification used `http://127.0.0.1:4191`; the user-owned port 5173 was not stopped, restarted, or reused.
- No push, deployment, PR, remote mutation, or main merge was performed.

## Reviewed lanes

| Lane | Worker commit | Reviewed integration commit | Result |
| --- | --- | --- | --- |
| Interaction and camera | `5eab18b55fc278bac8c010b1f1b3024bb13629ff` | `3b0908267e0cfe859dd3adc0e8ba7fbe4938dcb5` | Bounds-aware build camera, Frame Build, desktop click placement, touch position-only gestures, drag/multi-pointer cancellation, focused tests |
| Local document system | `ded304ebc616bbfd78be945e996790f49cc6e3d8` | `dcb1440b0bac48de9df4f824ad9f449c270b32f5` | Versioned schema, validation, autosave/restore, import/export, New Build history, focused tests |
| Responsive shell and visuals | `0f02d61892129957b71ed8c5b40128edfedebad0` | `3716df8d0d2e702907f35222f3fa94a684b6ade8` | Unified shell, responsive dock/panels, geometry-derived cached SVG thumbnails, onboarding, Help/overflow actions |
| Central integration | — | `1d5fc82435ecdb213e81ce70654a15140ce65ddd` | Startup restore/autosave and default New/Import/Export command wiring with component tests |
| Responsive acceptance fix | — | `d58fee97e14b5903584f7d0935c5e4dcbdf5bc96` | Guaranteed 44px view actions and removed tablet/landscape control collisions |

Every worker diff was inspected before cherry-pick. Shared `BrickStudioApp.tsx` document wiring and final CSS geometry were reconciled centrally. `git cherry` reported each worker commit as patch-equivalent to its integration commit before cleanup.

## Changed files

- `src/brick/BrickStudioApp.tsx`, `BrickStudioApp.test.tsx`
- `src/brick/BrickStudioScene.tsx`
- `src/brick/OnboardingGuide.tsx`
- `src/brick/PartThumbnail.tsx`
- `src/brick/StudioMenu.tsx`
- `src/brick/brick-studio.css`
- `src/brick/brickDocument.ts`, `brickDocument.test.ts`
- `src/brick/buildCamera.ts`, `buildCamera.test.ts`
- `src/brick/buildInput.ts`, `buildInput.test.ts`
- `src/brick/documentPersistence.ts`, `documentPersistence.test.ts`
- `src/brick/store.ts`, `store.test.ts`
- `src/brick/useBrickStudioDocuments.ts`

## Automated verification

Final code candidate:

- `npm test -- --run` — 19 files, 141 tests passed.
- `npm run build` — passed; includes `tsc -b` and Vite production build.
- `git diff --check` — passed.
- The repository has no separate lint/typecheck script; production build is the declared TypeScript gate.
- Existing build warning remains: the Rapier/Three chunk exceeds Vite's 500 kB advisory threshold.

Focused coverage includes camera bounds/framing, touch gesture classification and cancellation, schema/import validation, storage failures, round-trip persistence, store New Build/history behavior, startup restore, malformed import preservation, and default export wiring.

## Browser and layout evidence

All browser checks below are emulation or headless Chromium, not physical-device proof.

Tested viewports:

- Desktop: 1440×900 in the connected Chrome test tab and 1280×633 in isolated headless Chromium.
- Tablet portrait: 834×1194.
- Tablet landscape: 1194×834.
- Phone portrait: 390×844.
- Phone landscape: 844×390.

Observed behavior:

- Desktop click-to-place built mixed normal, slope, and door-frame parts. Reload visibly restored the exact committed count and placed-brick list.
- Touch-position harness: a touch tap left the brick count unchanged, suppressed the trailing click, and exposed the explicit Place bar; Place then committed exactly one brick.
- Touch-drag harness: an 80×50 px drag suppressed its trailing click and did not commit.
- Ten phone-emulated touch-position gestures each showed Place, each trailing click was suppressed, and ten explicit Place confirmations advanced the count exactly from 0 to 10.
- Frame Build recovered a deliberately zoomed/panned view and visibly framed all four mixed parts.
- Desktop keyboard duplication changed 4→5 bricks; one Undo changed 5→4; one Redo changed 4→5.
- Ten Build→Explore→Build cycles completed with one canvas retained and the final mode back in Build.
- Reduced-motion emulation set both the media query and `brick-reduced-motion`.
- `/rover` loaded its mission, parts tray, and four modes with no page errors.

Measured responsive geometry:

- Phone header actions and mode actions: 44 px high.
- Phone touch placement actions: Cancel 95×50, Rotate 95×50, Place 158×50.
- Phone Select: 44×44.
- Phone Frame Build/Top/Front: 44×44 even when the emulator reports a fine pointer.
- Tablet portrait: Frame Build group ends at x=240; Select starts at x=248 (8 px gap). Controls end at y=1008; expanded drawer starts at y=1016 (8 px gap).
- Tablet collapsed: 8 px between controls and drawer, 10 px between drawer and viewport bottom.
- Phone landscape: 12 px from drawer to view controls and 4 px from view controls to Select; no rectangle overlap.

Document flow:

- Browser download produced a 939-byte `.brickstudio.json` file with schema version 1, part-library version 1, and five bricks.
- New Build confirmation changed 5→0; one Undo restored 0→5.
- Export→New Build→Import confirmation restored 0→5 and displayed `Imported 5 bricks.`
- Malformed/incompatible imports and storage read/write exceptions are covered by automated tests and preserve the live build; OS quota exhaustion was not induced manually.

Console/runtime:

- Clean Build/Explore, rapid-switch, reduced-motion, responsive, and Rover sessions reported zero page errors.
- Upstream warnings remain for deprecated `THREE.Clock`, `PCFSoftShadowMap`, and Rapier initialization parameters.
- Synthetic untrusted touch events can make Drei log `releasePointerCapture` errors because no native pointer capture exists in that harness. The same candidate reported zero errors in clean native-mouse/keyboard sessions; this is recorded as a harness limitation, not physical-touch proof.

Selected screenshots were captured under `/tmp/brick-alpha-*.png`, including desktop, tablet/phone portrait and landscape, displaced/recovered camera views, Explore, and the ten-brick touch run. They were intentionally not added to Git.

## Cleanup

- Removed only the three sprint worktrees under `/Users/ahmaadidrees/.codex/worktrees/virtual-legos-builder-alpha/`.
- Deleted only the three patch-equivalent sprint branches after their reviewed integration commits were confirmed.
- Preserved the execution worktree and all historic character/first-batch worktrees.
- Post-cleanup `git worktree list` shows main at `9b8da5a`, this integration worktree at `d58fee9` before the evidence-only commit, and only the historic unrelated worktrees.

## Remaining gates and recommendations

- Physical iPad/phone gesture comfort, Safari pointer capture, safe-area behavior, and real two-finger pan/zoom remain a planning/user device gate.
- Viewport emulation is not device certification. Chromium UA emulation did not expose a coarse-pointer media query, so the responsive CSS now guarantees 44px view actions by width as well.
- The export download and round-trip were manually exercised; malformed/corrupt imports and storage exceptions were exercised automatically rather than by exhausting real browser storage.
- The existing large Rapier bundle warning is a release-performance follow-up, not a new regression.
- React quality review found cleanup on new subscriptions/timers, a memoized/cached thumbnail path, no per-card live canvases, and no new per-frame React state.

The candidate is ready for independent adversarial QA, with real-device certification explicitly outstanding.

## Surgical P2 closure pass — 2026-07-22

This section supersedes the earlier candidate pointer for the targeted responsive-inspector retest only.

### Candidate and scope

- QA-reviewed starting candidate: `55c278ed82763a3a844b5e8ac594c3a57e58299e`.
- P2 closure runtime candidate: `af67e1ce9b8b25740e3904dfadfb00ecaafa019e`.
- Exact closure range: `55c278ed82763a3a844b5e8ac594c3a57e58299e..af67e1ce9b8b25740e3904dfadfb00ecaafa019e`.
- Exact combined range from immutable main baseline: `9b8da5ab33ad3800b91d5209528be41510edb44f..af67e1ce9b8b25740e3904dfadfb00ecaafa019e`.
- The closure changed only `BrickStudioApp.tsx`, `BrickStudioApp.test.tsx`, `brick-studio.css`, and the pointer-neutral initial toast in `store.ts`.
- Main remained clean at `9b8da5ab33ad3800b91d5209528be41510edb44f`. No deployment, push, PR, remote mutation, or main merge occurred.

### Closed P2 findings

- Phone properties now keep Rotate, Move, Duplicate, Focus, Copy, and Delete above the fold in an actions-first layout. The remaining color/coordinate properties use a focusable, visibly scrollable region with a plain-language scroll cue.
- Phone bulk action labels remain visible instead of reducing the controls to unexplained icons. Quick actions remain 44×44 px; inspector action buttons are at least 50 px high.
- The palette derives its selected state from the actual draft or sole selected brick and exposes `aria-pressed`. Recolor remains one undoable history command.
- The keyboard/mouse shortcut bar is reactively omitted for `(pointer: coarse)` even at wide tablet dimensions and remains present for a fine-pointer desktop.
- Initial placement status is pointer-neutral: `Pick a brick, position it over the plate, then place it.`

### Automated verification

- Focused: `npm test -- --run src/brick/BrickStudioApp.test.tsx src/brick/store.test.ts` — 2 files, 56 tests passed.
- Full: `npm test -- --run` — 19 files, 145 tests passed.
- `npm run build` — passed, including `tsc -b`; only the pre-existing Rapier chunk-size advisory remains.
- `git diff --check` — passed.
- Added regression coverage for selected/restored palette state and recolor history, phone properties in both drawer states, wide coarse-pointer guidance, fine-pointer keyboard guidance, and pointer-neutral status text.

### Browser verification and measured geometry

The dedicated preview remained `http://127.0.0.1:4191/`, served from the execution worktree at the closure runtime candidate. Port 5173 was not used. Coarse-pointer checks used Chromium DevTools touch emulation plus explicit viewports and verified `(pointer: coarse) === true`; they remain emulation, not physical-device proof.

Pre-fix reproduction at coarse 390×844 with the drawer collapsed:

- Inspector: x=8, y=508, 374×264, bottom=772.
- Duplicate/Focus/Copy began at y=750 and Delete began at y=800; the actions extended outside the inspector and into the drawer region.

Post-fix coarse 390×844 with properties expanded:

- Drawer collapsed: inspector x=8, y=508, 374×264; drawer y=778, 374×58; 6 px separation.
- Drawer expanded: inspector x=8, y=402, 374×264; drawer y=672, 374×164; 6 px separation.
- Rotate, Move, and disclosure are 44×44. Duplicate/Focus/Copy are 112.7×50; Delete is 112.7×50.
- Collapsed drawer: quick actions y=517–561, first action row y=573–623, Delete y=629–679; every action is inside the inspector ending at y=772.
- Expanded drawer: quick actions y=411–455, first action row y=467–517, Delete y=523–573; every action is inside the inspector ending at y=666.
- The scroll region was 202 px high with 333 px scroll content, `overflow-y: auto`, an 8 px scrollbar, keyboard focus styling, and the visible cue `Editing actions are first. Scroll for color and position.`

Post-fix coarse 844×390 landscape:

- Expanded drawer: inspector x=544, y=68, 292×314; drawer x=8, y=244, 300×138; rectangle overlap area 0.
- Collapsed drawer: drawer x=8, y=324, 300×58; rectangle overlap area 0.
- Quick actions are 44×44; Duplicate/Focus/Copy are 85.3×50 and Delete is 85.3×50. All seven controls are within the inspector; Delete ends at y=239 versus inspector bottom y=382.

Modality and palette:

- Coarse 1194×834 reported coarse=true/fine=false and rendered zero keyboard/mouse shortcut notes.
- Fine 1440×900 reported coarse=false/fine=true and rendered one visible keyboard/mouse shortcut note.
- A selected brick was recolored red, autosaved, reloaded, and selected again. Red restored with `aria-pressed="true"` while stale global blue was `false`; the browser test build was then returned to blue.

Regression smoke:

- Desktop 1440×900 Build→Explore→Recenter→Build retained six bricks and returned Build to active state.
- Reload restored the exact six-brick local build.
- `/rover` loaded the mission, parts tray, and four project modes.
- Final Brick Studio and Rover sessions reported zero error-level console entries and zero Vite error overlays.

### Remaining gate

Physical iPad/phone testing, Safari scrollbar/pointer behavior, notch safe-area geometry, and actual browser-chrome effects remain a planning/user device gate. No result above is presented as real-device certification.

The P2 closure runtime candidate is ready for the targeted independent QA retest.
