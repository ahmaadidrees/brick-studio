# Hackable Platformer UX fixes, groups A and B (2026-10-31)

Branch `claude/hackable-ux-int`, from `main` e4d4930 (= production). It fixes groups A and B of the 2026-10-31 UX explore
(the combined report is kept in the session scratchpad; each lane record below quotes the items it took).

| Lane | Record | Items |
|---|---|---|
| Touch (Build stage input) | `touch.md` | Pinch-zoom and two-finger pan in every tool, one-finger scroll with a brick armed, double-tap, Fit floor, selection kept in view, Ctrl+wheel, level bounds |
| Layout (shell, Duo, Play) | `layout.md` | Small-screen Bricks/Erase/Undo bar, Duo hinge, Play controls strip, Code from 540 px, touch laptops, Play camera locked to the Hero |
| Code tab | `code.md` | Palette swipe on touch, slot numbers kept, "+ Power" on top, preview click stays in Code, variables create/rename/delete |
| Saving | `save.md` | 2,000-brick cap at placement, compact local saves, two-tab safety, account retries + Try again, idempotent first save (Worker accepts an app-chosen id), titles win on open |
| Costume editor | `costume.md` | Undo/Redo, pinch without a stroke |

Integration commits on top of the lane merges:
- The Code preview click (`Stage.tsx`, the code lane's patch) and Restart/Pause not keeping keyboard focus.
- A test that waited a fixed 20 ms now waits for the save.
- A short palette (fits without scrolling) swallowed vertical swipes into block drags at 820×1180.
- Costumes at 540–767 px had a 48 px picture; the level steps aside and the list becomes a row.

Checks: `tsc -b`; full vitest 3,262 passed + 25 expected-fail (one timing flake fixed); Worker 253/253; `npm run build`.
A separate browser pass on the merged branch (guest mode, own Vite) checked pinch/pan/tap at 540×720 and 820×1180 in
four tools, the Duo tool bar and hinge, Play camera and controls, the Code tab items, the costume editor at three sizes,
guest saving (reload, two tabs, 2,000 cap), and console errors. Account saving was verified only against mocks and a
Worker stub. Nothing was tried on real devices or Safari.

Deploying needs the Worker first (the id-based create is backward-compatible), then the site. No migration.
