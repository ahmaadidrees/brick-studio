# 3D character size release

Source: `5a1da84` on `codex/2d-characters`.

- Character picker offers Small (75%), Regular (100%, default), Large (125%).
- Size persists in normalized appearance and travels through existing world profiles; unknown values use Regular. Older clients need a refresh to render size.
- Runtime avatar, capsule, spawn clearance and camera target share the scale. Size changes remount the explorer and revalidate a supported spawn before showing it. Speed and jump settings stay unchanged.
- Preview feet stay on the preview floor; saved outfits include size.
- 28 focused client tests pass, including low-ceiling physical clearance and remote scale. 36 world-room tests pass, including a size-bearing profile broadcast. App build and worker typecheck pass.
- Local browser: applied Large, entered Explore, then applied Small during Explore; both rendered grounded with adjusted camera framing.

Production website: `dpl_CQHbySLr8pfmGHfKo82GF2hEMYqM`, https://virtual-legos-eimsvsir0-ahmaadidrees-projects.vercel.app, promoted to brickgineers.com.
Worker: `5d183aa5-a35a-49a5-bbf0-e332b8393153`. No new migration.

Previous pilot website rollback target: https://virtual-legos-7bebwsbj8-ahmaadidrees-projects.vercel.app.
Main is not merged; keep this branch when making subsequent production releases.
