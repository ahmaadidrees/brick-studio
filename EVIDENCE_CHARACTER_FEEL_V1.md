# Character Feel V1 evidence

## Isolation and accepted baseline

Recorded on 2026-07-21 before implementation.

- Accepted baseline: `768cdf80928ed70ecfd2bf9fae79e867eefb9342`.
- Canonical execution worktree/branch: `/Users/ahmaadidrees/.codex/worktrees/4b9c/Virtual Legos`, `codex/virtual-legos-execution`.
- User main checkout: `/Users/ahmaadidrees/Documents/Virtual Legos`, clean `main` at the same accepted commit; it is out of implementation scope.
- Controller/camera lane: `/Users/ahmaadidrees/.codex/worktrees/virtual-legos-character-lanes/controller`, `codex/virtual-legos-character-controller`.
- Avatar/animator lane: `/Users/ahmaadidrees/.codex/worktrees/virtual-legos-character-lanes/avatar`, `codex/virtual-legos-character-avatar`.
- Touch/reduced-motion lane: `/Users/ahmaadidrees/.codex/worktrees/virtual-legos-character-lanes/touch`, `codex/virtual-legos-character-touch`.
- Port 5173, remote state, deployment, main integration, Blender, and external animation assets remain out of scope.

## Installed physics capability check

- `@dimforge/rapier3d-compat` is `0.19.2`; `@react-three/rapier` is `2.2.0`.
- The installed API exposes `World.createCharacterController`, autostep, ground snap, slope limits, `computedGrounded`, collision inspection, and `RigidBody.setNextKinematicTranslation`.
- React Three Rapier exposes fixed numeric timesteps and before/after physics hooks.
- The requested kinematic controller is supported by the installed packages; no fallback was needed.

## Full-story boundary

The user builds a brick world, enters Explore, moves camera-relative with walk/run and responsive single/double jumps, sees procedural block-character motion that never rotates the physics body or camera, traverses normal and special bricks, and returns to Build without losing state across desktop and emulated mobile layouts.

## Verification results

### Integrated commits

- Lane A, controller/camera foundation: `c93a858785636716e3fb66140693cf0f54099935` on `codex/virtual-legos-character-controller`; cherry-picked as `462bbbc`.
- Lane B, block avatar/animator: `c525e18fefc3a579465e6244694bc6078d40bdc5` on `codex/virtual-legos-character-avatar`; cherry-picked as `39cbfb9`.
- Lane C, touch/reduced-motion: `45adc605a997c2a1349451c6c844c5c3483639a5` on `codex/virtual-legos-character-touch`; cherry-picked as `c6193e6`.
- Cherry-picks were conflict-free. Central integration owns `BrickStudioScene.tsx` and reconciled Lane C's temporary pitch range to Lane A's stable orbit range (`0.16..1.08`).

### Automated

- `npm test -- --run --reporter=verbose`: **13 test files, 79 tests passed**.
- New focused coverage includes camera-relative input at cardinal/intermediate yaw, fixed-step/delta bounds, acceleration/braking/facing, jump buffer, coyote time, one-air-jump reset, real Rapier wall/ground/autostep behavior, orbit damping/pitch, animator state/flip isolation/landing cancellation/reduced motion, touch normalization/auto-run, and responsive controls.
- Existing coverage remained green for special-part traversal/rotation, camera obstruction, budgets/history, the 200-brick store stress case, keyboard construction, mode continuity, and Rover domain behavior.
- `npm run build`: typecheck and production bundle passed. Existing Rapier chunk warning remains (`3,160.27 kB`, gzip `1,090.10 kB`).
- `git diff --check`: passed.
- React review: no per-frame React state, all controller/animator/camera vectors and poses are reused, geometry/material assets are stable and disposed, listener/controller cleanup is present, and the flip wrapper has no physics-body access.

### Browser verification

Local Vite server: `http://127.0.0.1:4183/brick-studio` (port 5173 untouched). Browser/device state was reset after the run.

Tested viewports:

- Desktop: `1440 × 900`, normal pointer, desktop budget `250`.
- iPad portrait/landscape emulation: `820 × 1180` and `1180 × 820`, touch/coarse-pointer emulation, tablet budget `150`.
- Phone portrait/landscape emulation: `390 × 844` and `844 × 390`, iPhone UA/platform plus touch emulation, phone budget `75`.

Observed passes:

- Build to Explore to Build retained brick data and responsive controls; 10 rapid keyboard mode transitions ended in Explore with the same brick count and no errors.
- Held W moved away from the camera toward the centered brick; the capsule stopped at the normal brick. Shift-run and rapid A/D reversals ran without runtime errors.
- Mouse/touch look changed yaw and clamped pitch without roll. The existing sphere-cast pulled the camera inside a tall-frame obstruction and recovered smoothly once clear.
- Single and double jump worked from keyboard and touch. The second jump showed the visual-only front flip while the camera stayed upright; the avatar returned upright on landing.
- Reduced-motion emulation applied `brick-reduced-motion`; jump controls remained responsive and the double jump stayed visually upright.
- A centered Door Frame was traversed without jumping. Separately centered, rotated stairs were climbed to the top without jumping, and the slope was crossed without jumping.
- Touch stick-up moved forward; a deliberately retained drag was cleared by a window-blur interruption and the stick knob returned to center. Unit/component tests cover pointerup, pointercancel, lostpointercapture, visibility loss, unmount, and Build return.
- Phone portrait and landscape showed the joystick, jump button, Return to Build, and non-overlapping Explore toast/hint. Phone Build showed the compact inspector control plus reachable Undo/Redo and the 75-brick count.
- `/rover` loaded the Rover Island shell with its mission, project modes, and parts tray.
- Final console error checks were empty in both Brick Studio and Rover. Development-only warnings were limited to existing Three/Rapier deprecations.

Key screenshots are in `/Users/ahmaadidrees/.codex/visualizations/2026/07/21/019f82c3-853b-7e61-be66-6959a676d44e/character-feel-v1/`, including:

- `desktop-forward.png`, `desktop-double-jump.png`, `desktop-landed.png`, `desktop-orbit.png`
- `ipad-portrait-build.png`, `ipad-portrait-explore.png`, `ipad-touch-blur-reset.png`, `ipad-touch-double-jump.png`
- `phone-portrait-build.png`, `phone-portrait-explore.png`, `phone-landscape-build.png`, `phone-landscape-explore.png`, `phone-reduced-motion-double-jump.png`
- `door-traversal-clear.png`, `stairs-traversal.png`, `slope-traversal.png`

### Limits and remaining risks

- Tablet/phone checks are browser emulation, **not physical-device proof**. Real iPad/iPhone/Android touch latency, safe areas, thermal behavior, and interruption delivery remain for independent QA.
- The browser driver did not emit a trustworthy pointerup at the end of its touch drag; movement and blur recovery were observed live, while all required release/cancel paths are component-tested. Independent QA should explicitly exercise real pointerup/pointercancel/lost-capture.
- Flip cancellation on a forced early landing is deterministic-unit-tested but was not independently forced in the browser; ordinary post-flip landing was observed.
- A tall object directly behind the avatar can temporarily pull the obstruction camera very close before smooth recovery. It behaved as designed during door traversal, but comfort/tuning merits adversarial QA.
- The large Rapier chunk warning is unchanged. No production deployment, remote mutation, or real-device performance claim was made.
