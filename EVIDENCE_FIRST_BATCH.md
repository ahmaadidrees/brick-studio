# Virtual Legos first execution batch evidence

## Isolation record

Recorded before source implementation on 2026-07-20 at 20:43 PDT.

- Required baseline: `078d3ae076207f52c0df0cf0e6a058298e1643e8` (`Initial Brick Studio MVP`).
- Canonical integration worktree: `/Users/ahmaadidrees/.codex/worktrees/4b9c/Virtual Legos`.
- Canonical integration branch: `codex/virtual-legos-execution`.
- User main checkout (untouched): `/Users/ahmaadidrees/Documents/Virtual Legos`, branch `main`, same baseline commit.
- Lane A worktree/branch: `/Users/ahmaadidrees/.codex/worktrees/virtual-legos-lanes/world`, `codex/virtual-legos-world`.
- Lane B worktree/branch: `/Users/ahmaadidrees/.codex/worktrees/virtual-legos-lanes/mobile`, `codex/virtual-legos-mobile`.
- Lane C worktree/branch: `/Users/ahmaadidrees/.codex/worktrees/virtual-legos-lanes/reliability`, `codex/virtual-legos-reliability`.
- No repository `AGENTS.md` instruction file was present.
- Port 5173 is reserved for the user's server and will not be inspected, stopped, restarted, or reused.
- No remote mutation, deployment, push, or pull request is authorized.

## Baseline verification

- `npm ci`: 185 packages installed from the existing lockfile; 0 vulnerabilities.
- `npm test -- --reporter=verbose`: 2 test files passed, 6 tests passed.
- `npm run build`: TypeScript and Vite production build passed. Vite reported the pre-existing large Rapier chunk warning.

## Integrated verification

### Full-story boundary

The user creates and edits a bounded brick build through mouse, touch, or keyboard controls, frames that exact build, then enters Explore where part-aware physics and an obstruction-safe camera preserve traversal and mode continuity across supported responsive layouts.

### Planned matrix

| Surface | Viewport/configuration | Build checks | Explore checks |
| --- | --- | --- | --- |
| Desktop | 1440 x 900 | keyboard core loop, bounds Frame All, 200-brick store stress | special parts, camera obstruction, rapid mode switching |
| iPad portrait | 820 x 1180 emulation | history reachability, inspector/drawer | controls and return/toast layout |
| iPad landscape | 1180 x 820 emulation | history reachability, orientation reaction | continuity and return/toast layout |
| Phone portrait | 390 x 844 emulation | collapsed toolbar/sheet, keyboard semantics | controls and toast/return separation |
| Phone landscape | 844 x 390 emulation | compact controls and focus | controls, continuity, orientation reaction |

Viewport emulation is browser evidence only and is not real-device verification. Device-class budgets and coarse-pointer interruption behavior were verified deterministically in tests because resizing a desktop browser does not emulate an iPad/phone user agent or touch pointer.

### Results

#### Lane commits and integration review

- Lane A / world and physics: `e20e716b36ebb5c70d373fd312acc34d048ca21c` on `codex/virtual-legos-world`; integrated as `e74c6777f8787da7178b0459ea405e765e69674a`.
- Lane B / mobile and editor UX: `d8cdb95ccc3edd8759cd30f60008d8df9bf4e802` on `codex/virtual-legos-mobile`; integrated as `0234b77` after central conflict resolution.
- Lane C / interaction and reliability: `7ddcda4a3f844bc30dd8d42ed75726c7c6477c49` on `codex/virtual-legos-reliability`; integrated as `1855ae5`.
- The integration owner inspected each lane diff and its tests before cherry-picking. Lane B conflicted with Lane C in `BrickStudioApp.tsx` and `BrickStudioApp.test.tsx`; the central resolution retained the guarded mode command, budgets/history/keyboard semantics, mobile controls, and the combined test coverage. Lane A's scene changes auto-merged with Lane C's bounds camera and were manually reviewed together.
- Central browser-driven fixes added a semantic Place action, reactive short-side renderer quality, non-shrinking 44 px history controls, collision-free responsive headers, and general Explore toast separation. The shared Explore guard was moved out of the React component module so Vite Fast Refresh no longer invalidates the component export boundary.

#### Automated verification

- `npm test -- --run --reporter=verbose`: 8 files passed, 43 tests passed.
- The tests include real Rapier simulations for door and window traversal without jumping, stairs, a continuously rising slope, quarter-turn collider transforms, and camera sphere-cast contraction/recovery.
- Store/component coverage includes invalid and rotated placements, bounded 100-entry delta history, 500 ms nudge batching, exact undo/redo, budget gates and blocked redo, 10 mode switches, semantic brick enumeration, Enter/Space placement, Escape cancel, responsive control presence, every requested touch interruption reset, and a 200-brick desktop-oriented store stress case.
- `npm run build`: TypeScript and Vite production build passed. The generated Rapier chunk is 3,161.28 kB (1,090.43 kB gzip), so Vite's over-500 kB warning remains.
- `git diff --check`: passed.

#### Browser verification

- Iterative browser verification ran on `127.0.0.1:4176`; final clean production-preview verification ran on `127.0.0.1:4177`. Port 5173 was never inspected or reused.
- Desktop Build: the zero-brick `2` shortcut stayed in Build and announced the guard; Enter placed a draft; the semantic placed-brick selector selected a door; rotate, delete, and undo produced the expected live announcements and restored the exact four-part build.
- Bounds-based Frame All visibly changed from the full-plate view to the placed door/window/stair/slope extents with padding.
- Desktop Explore retained the shell during physics entry. Ten rapid Build/Explore round trips all reported the correct mode class without state loss.
- iPad portrait/landscape and phone portrait/landscape were checked in Build and Explore at the matrix sizes. Undo/redo measured 44 x 44 px; count and Rover navigation remained visible; selectors remained reachable; phone selection/placement toolbars collapsed to 44 px; the expanded portrait sheet measured 331 px in an 844 px viewport; no tested header, toast, or Return-to-Build pair overlapped after fixes.
- Phone portrait and landscape showed the joystick and Jump controls. The emulated iPad landscape retained a fine desktop pointer, so its coarse-pointer joystick visibility was not claimed as device proof.
- A fresh production-preview Build-to-Explore run reported zero console errors. Remaining console messages were upstream Three/Rapier deprecation warnings.
- `/rover` loaded Rover Island with its mission, mode navigation, and parts tray, with zero console errors.

#### Captures

Captures are stored outside the repository in `/Users/ahmaadidrees/.codex/visualizations/2026/07/21/019f82c3-853b-7e61-be66-6959a676d44e/virtual-legos-first-batch/`. Key files:

- `desktop-frame-all.png`
- `desktop-explore.png`
- `phone-portrait-build-collapsed.png`
- `phone-portrait-placement-collapsed.png`
- `phone-portrait-properties-expanded.png`
- `phone-portrait-explore.png`
- `phone-landscape-build.png`
- `phone-landscape-explore.png`

#### Known limits and remaining risks

- No real iPad, phone, or Chromebook was exercised. Viewport emulation does not prove touch hardware, device user-agent classification, mobile GPU performance, or browser-specific safe-area behavior.
- The 200-brick release check stresses store/history correctness, not sustained WebGL frame rate. The large Rapier bundle and 200-brick rendering performance need profiling on target hardware.
- Special-part traversal and camera obstruction were exercised in deterministic Rapier tests and an integrated visual Explore scene, but not as an exhaustive manual traversal of every dense player-built arrangement.
- Three.js and Rapier currently emit deprecation warnings. They did not produce runtime errors in the clean production preview.
