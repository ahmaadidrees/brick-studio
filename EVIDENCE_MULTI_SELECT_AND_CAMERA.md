# Brick Studio — Multi-Selection and Explore Camera Evidence

Execution branch: `codex/virtual-legos-execution`

Isolation baseline: `0dddf021ed298815bc32e0668eb5574bf1881e63`

User checkout and server boundaries: `/Users/ahmaadidrees/Documents/Virtual Legos` was not edited; its `127.0.0.1:5173` listener was not stopped, restarted, or reused. Execution preview used `127.0.0.1:4187`.

## Commit 1 — Drag/marquee multi-selection and atomic bulk actions

Commit: `f117f373ddd21209e4ee6ed337215a9e5f504b4d`

### Automated verification

- `npm test -- --run`: 14 files, 93 tests passed.
- `npm run build`: TypeScript and Vite production build passed.
- `git diff --check`: passed.
- Focused coverage includes ordered replace/toggle/clear selection, primary-selection compatibility, projected rotated/special-part bounds at multiple camera orientations, drag threshold and selection-capture intent, group clipboard relative transforms and metadata, all-or-nothing collision/bounds/budget gates for 75/150/250, atomic delete/paste/duplicate undo/redo, Explore selection clearing, multi-selection UI, Select/Done semantics, and the pre-existing 200-brick bounded-history stress check.

### Browser verification

Local Vite preview: `http://127.0.0.1:4187/`.

- Desktop `1280 × 720`: placed a normal 2×4 brick, rotated-shape slope, and door frame; Select mode marquee selected the projected group; desktop Shift-marquee selected six placed/pasted parts; Cmd-click toggled one member; all selected parts showed outlines and the inspector showed the exact selection count.
- Bulk workflow: copy `3 → paste to 6 → duplicate to 9 → delete to 6`; one Undo restored `9`, and one Redo returned to `6`.
- Unmodified primary drag still panned the Build camera while preserving the six-brick selection. Captured Shift/select gestures did not place bricks.
- Phone portrait viewport `390 × 844`: Select/Done remained reachable as a 44×44 target. Measured layout showed no overlap: selection control `202..246 × 116..160`, view controls `10..134 × 116..164`, inspector bottom `656`, drawer top `666`.
- Runtime console: no application errors. Only existing upstream Three/Rapier deprecation warnings were observed.

### Evidence boundaries

- Touch/mobile results are browser viewport/input emulation, not physical iPad/phone proof.
- The automated 200-brick check exercises store/history/budget behavior; browser checks used a smaller mixed-part scene and are not a sustained GPU-frame-rate benchmark.

## Commit 2 — Explore Camera Controls V1

Implementation is layered directly on Commit 1 and intentionally reconciles the shared pointer/store paths in a separate reviewable change.

### Automated verification

- `npm test -- --run`: 15 files, 102 tests passed.
- `npm run build`: TypeScript and Vite production build passed.
- `git diff --check`: passed.
- Focused coverage includes yaw/pitch/distance clamping, default recenter values, line/page/pixel wheel normalization, drag threshold, pinch-distance zoom, pointer cancellation, lost capture, resize/orientation resets, visible desktop/touch help, control hit isolation, and the idempotent marquee reset used during Build/Explore transitions.

### Browser verification

Local Vite preview: `http://127.0.0.1:4187/` (stopped after verification).

- Desktop `1280 × 720`: primary drag rotated the camera from unobstructed left, center, and right viewport regions; the released orientation remained stable after 1.2 seconds; wheel/trackpad input visibly zoomed both directions; Recenter restored default yaw, pitch, and boom distance.
- Camera continuity: the avatar remained the follow target, obstruction shortening/recovery remained active in a dense scene, and no roll or automatic yaw snap was observed.
- Responsive emulation measured the full look surface and control separation at phone portrait `390 × 844`, phone landscape `844 × 390`, tablet portrait `820 × 1180`, and tablet landscape `1180 × 820`. Return, Recenter, joystick, Jump, and help text remained reachable without overlap.
- Touch-emulated one-finger look worked at phone and tablet viewports. Reduced-motion emulation retained responsive look/zoom controls while the existing reduced-motion class remained active.
- Ten rapid Build/Explore switches ended in Build with one canvas and no console errors. A second clean pass repeated the ten switches after final pointer-capture cleanup with the same result.
- Stress smoke: duplicated to 50 desktop bricks, entered Explore, orbited and zoomed through the dense scene, and observed one canvas and no application errors. `/rover` loaded its existing mission UI without errors.
- Runtime console: no application errors after the final fix. Only existing upstream Three/Rapier deprecation warnings were observed.

### Shared-input reconciliation

- Build marquee handling remains a capture-phase canvas listener so unmodified OrbitControls behavior is preserved while marquee gestures can suppress their trailing click.
- Explore has one coherent yaw/pitch/distance source in the store. The visual camera continues to apply its existing damped orbit and collision boom logic; the input layer only changes desired values.
- Browser mode-switch testing exposed a recursive `setMarquee(null)` subscription when leaving Build. The reset is now idempotent in both the listener and store, with a regression test; ten rapid switches were then repeated successfully.

### Evidence boundaries

- Phone/tablet checks are browser touch and viewport emulation, not physical-device certification.
- The in-app browser could not dispatch raw two-finger CDP touch events. Pinch is covered through pure gesture tests and component pointer tests, but still needs physical-device adversarial QA.
- The browser harness could not maintain a reliable held-key input after an orbit. Camera-relative movement remains covered by existing multi-yaw controller/math tests, but sustained keyboard movement after manual rotation should be retested by QA.
- The 50-brick browser smoke and automated 200-brick store/history check are not a GPU performance certification.
