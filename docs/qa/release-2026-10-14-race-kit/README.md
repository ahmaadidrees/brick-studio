# Race kit release (October 14, 2026)

Race tracks in the 2D builder: three starter tracks (Snowy Oval, Brick Speedway, Canyon Twist), building race tracks,
racing alone or together in rooms, items, coins and Walkers, touch driving, and the whole-track build zoom. Spec:
`docs/RACE-KIT.md`. Platformer worlds, rooms and fingerprints are unchanged.

## Deployment

- Product commit `7dad611` on `claude/racing-kit` (production `codex/invites-motion-pipes` 31a171b, plus the stale
  capacity-test fix b8a2f4b, plus the race kit). Production is now this branch, not `codex/invites-motion-pipes`.
- Worker `brick-studio-multiplayer` version `7c4cbb15-ed23-4275-8844-047c762a2b35`, deployed first.
- Website: Vercel deployment `dpl_BbfBrepMvxWv9uxxfMifJTRHKr3A`
  (https://virtual-legos-hdalor4za-ahmaadidrees-projects.vercel.app), serving https://brickgineers.com.
- Built locally with the pulled production settings and deployed with `vercel deploy --prebuilt --prod` (see the
  warning below).

## Checks

- App typecheck and Worker typecheck clean. Worker tests 236/236. App tests 1606/1608: the two failures were timeouts
  in `src/brick/BrickStudioApp.test.tsx` (3D, untouched by this release), and the file passes on its own (63/63).
- Local two-player room race (two game windows, local Worker): shared race start at the same world tick, separate grid
  spots, standings in both windows, an Oil slick dropped by one player appearing in both worlds, the other player
  spinning out on it, and the slick removed for both.
- After deploy, on brickgineers.com: the three race starter cards show; a guest race room ("With friends" on Snowy
  Oval) and a guest platformer room (Workshop Run) both open on the live Worker. No signed-in or student data used.

## Warning for the next release

`vercel build` runs `npm install`. In a worktree whose `node_modules` is made of symlinks into another worktree, npm
followed them and moved that worktree's packages aside (71 scoped packages renamed to hidden `.name-XXXXXXXX` folders,
plus `@typescript/typescript-darwin-arm64`). They were all renamed back and `npm ls` was clean afterwards. Build with
`npm run build` and deploy with `vercel deploy --prebuilt` instead, or use a worktree with its own `node_modules`.

## Rollback

Previous website `dpl_GSv3cWJXMNgxVMRrSnndEhHD2zS9` (https://virtual-legos-3bo8qhzfx-ahmaadidrees-projects.vercel.app),
previous Worker `dacc45a4-2960-41fc-a3be-3df1d00995a1`. Roll back the website first: the new Worker still serves the old
website (race fields are optional). Race tracks saved to accounts would not open on the old website.
