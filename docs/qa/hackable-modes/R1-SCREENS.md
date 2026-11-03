# R1 screens: the plan — November 2, 2026

The owner said "Yes, start R1" on November 2, after main (group C, See inside, the inside view, teacher fixes) was
merged into this branch (32df4d8). This is the plan for Hackable Racing's screens, from a read-only map of the studio.
Scope is the R1 section of `README.md`. Not in R1: items, coins, Walkers, ramps, race powers on the shelf, racing
classmates, 3D.

**Rules for every lane:**
- Platformer output stays byte-identical: existing Platformer tests and golden saves pass unchanged.
- Never change the Car's numbers (`studio/race/carBrick.ts` feel) or `core/race.ts` laps logic; the feel tests are the gate.
- Edit only the files your lane owns. Commit on your own branch; never push, deploy or merge.
- Write your report to `docs/qa/hackable-modes/r1/<lane>.md`: what changed, tests, what you could not do.

## A. Where the studio assumes a Platformer (file:line at 32df4d8)

**Projects and route**
- `routes2d.ts:43` only knows `/2d/hackable`; add `/2d/hackable-race` → `{kind:'studio', kit:'race'}`.
- `PlatformerApp.tsx:52,55` "Opening the Hackable Platformer…" → the kit's name.
- `StudioApp.tsx:71` `newProject()` always uses `createStarterProject()` and `NEW_PROJECT_NAME` ("My platformer",
  `hackableProjects.ts:17`) → the kit's starter and "My race track". `StudioApp.tsx:125` opens the newest project of
  any kit → filter by kit.
- `hackableHref` (`hackableProjects.ts:317-321`) hard-codes `/2d/hackable` → the kit's route.
- Copy: `StudioApp.tsx:155,163`, `projects.ts:178`, `hackableCloud.ts:18,63`, `projectIo.ts:79,93`.
- `HackableEntry` (`hackableProjects.ts:25`) has no kit; `projects.ts:39-43,66-67` and `ProjectKind`/`PROJECT_KIND_LABEL`
  (`projectFile.ts:31,33`) call every one "Hackable Platformer" → add `kit` to the entry and a `'hackable-race'` kind
  (local: the entry's kit; account: `world.kit`, which the Worker already reports).
- `NewProjectSheet.tsx:18,66-84` needs a second card.

**Build**
- `BuildDrawer.tsx:41` uses `drawerEntries` (`catalog.ts:92`), which lists the 8 Platformer grid bricks and matches by
  character. **Bug:** the Platformer's Brick and the race Boost pad are both `'B'`.
- `remix.ts:11-17`: the catalog is only the Platformer starter, so race bricks count as "My bricks", aren't Built-in,
  have no "Back to the original" and never remix into "My Car". Fix: a catalog holding both starters (ids don't collide).
- `Inspector.tsx:112` → `KnobsCard`; `workshop/knobs.ts:50,64,81` only knows the Hero (no "More sliders" for the Car,
  and `knobStart` falls back to the current value so ranges grow while dragging).
- `placement.ts:14,76`: lifting out of the ground is Hero-only. Race: keep the Car out of Barriers, face along the track.
- One-per-level limits are already generic (`BrickDef.limit`).

**Code**
- `sections.ts:22` (keyed by brick id, remix-aware): add `brick_car` → "How I drive", labels read from
  `createCarWorkspace` like `heroBrick.ts:652`. `CodeEditor.tsx:337`, `ScriptList`, `LayerBar` and the trail are generic.
- `CodeEditor.tsx:223` builds the palette with no kit; `toolbox.ts:366-397` has no Racing category.
- `CodeColumn.tsx:20` starting points include Walker/Coin/Spring/Goal (a Walker turns gravity on).
- `CodeColumn.tsx:48`: built-in powers are Platformer-only, so race would show an empty "+ Power".
- `store.ts:191`: Code opens on `brick_hero`. `layers.ts:139` `plainLabel` misses the Car's "each tick".

**Play**
- `StudioShell.tsx:133` Play needs a Hero ("Place your Hero first").
- `StudioShell.tsx:236` `PlayFeedback`: "Space jumps", `NO_GOAL_NOTE`. `StudioShell.tsx:237` `PlayTouchControls` d-pad →
  race uses `RaceTouchControls` (items off) with the same keys adapter (loosen its prop to `Pick<Input,'setTouch'>`,
  `RaceTouchControls.tsx:6`; its CSS already loads via `platformer.css`).
- Camera: `Stage.tsx:210` finds the Hero by name/id; `followCamera` (`camera.ts:168`) follows any point.
- Rotation already works (`renderer.ts:142`, `248-251`). **Bug:** `renderer.ts:241` blends directions linearly, so
  179 → -179 spins the car for a frame.
- `renderer.ts:103` draws sky and hills when the Stage has no backdrop → race needs grass.
- `StageControls.tsx:46-51` "Follow the Hero". "Just this brick" (`StudioShell.tsx:315`, `roomDesign.ts:72`) builds a
  Platformer room with a helper Hero → hidden in race for R1.
- `firstRunTips.ts:5` one storage key for all kits; `StudioHelp.tsx` copy is Platformer-only.

## B. The contract (lands first, on `claude/hackable-modes-proposal`)

1. `studio/kitScreens.ts`, plain data, no React (store.ts imports it):
   ```ts
   export interface KitCopy { projectName: string; player: string /* 'Hero' | 'Car' */; noPlayer: string; controlsHint: string;
     followLabel: string; tipsKey: string; tips: { build: string; code: string; play: string }; helpPlay: string }
   export interface KitScreens {
     kit: 'platformer' | 'race'
     starter(): StudioProject
     playerBrickId: string                  // camera follow, the Play gate, Code's default brick (remix-aware)
     drawer: { categories: { id: string; label: string }[]; entries(b: readonly BrickDef[]): DrawerEntry[]; hint(b: BrickDef): string | undefined }
     codeStarts: readonly string[]          // BRICK_TEMPLATES ids
     powers: boolean; testRoom: boolean
     toolbox: { racing: boolean; hide: readonly string[] }
     background: 'sky' | 'grass'; followViewWidth?: number
     copy: KitCopy
   }
   export const KIT_SCREENS: Record<'platformer' | 'race', KitScreens>
   export const screensFor = (d: Pick<LevelDesign, 'kit'>) => KitScreens
   export function isPlayerBrick(d: LevelDesign, brickId: string): boolean
   ```
2. `studio/screen/kitParts.tsx`: React slots `{ PlayHud, TouchControls, BuildChip? }` per kit. Race's are stubs that
   render nothing: `race/screens/RaceHud.tsx`, `race/screens/RaceTouch.tsx`, `race/screens/LapsChip.tsx`, plus
   `race/raceCopy.ts` and `race/raceDrawer.ts`.
3. Engine exports: `race/raceProject.ts` `createRaceStarterProject()` (beginner track plus workspaces); export
   `trackWorkspace` and the Starter's workspace from `raceTrack.ts`; `store.setFinishDirection(brickId, dir)`.
4. Wire every reader to the descriptor: `store.ts:191`; `StudioShell.tsx:133,236-238,315`, tips copy and key, a Build
   chip slot; `Stage.tsx:210` and follow width; a label prop on `StageControls`; the joint catalog in `remix.ts:11`;
   `BuildDrawer.tsx:41,104`; `toolbox.ts` takes `opts.kit` (no change yet) and `CodeEditor.tsx:223` passes it;
   `CodeColumn.tsx:20,48`; the background switch at `renderer.ts:103` (flat green for now); a brick-keyed
   `BRICK_KNOB_SPECS` registry in `knobs.ts` with the Hero behind it.
5. Contract test `kitScreens.test.ts`: the race starter validates, every race brick counts as built-in, the Car is found
   (remixed copies too).

## C. Lanes (after the contract, `StudioShell.tsx` and `store.ts` belong to the integrator only)

| Lane | Owns | Done when | Tests |
|---|---|---|---|
| 1 Projects and words | `routes2d.ts`, `PlatformerApp.tsx`, `StudioApp.tsx`, `persist/*`, `src/projects/*`, `pages/worlds/worldsData.ts`, `pages/class/classPageData.ts`, `race/raceCopy.ts`, `StudioHelp.tsx`, `firstRunTips.ts`, `kits.ts`, `kits.test.ts` | The card opens "My race track" on the beginner track; kept with its kit locally and in the account; My projects shows "Hackable Racing" and the race address; Make my own copy keeps the kit; newest project chosen by kit; Help and tips say racing things; `ready` flips last | routes2d, StudioApp.new (new/keep/reopen/copy for race), hackableProjects (old entry without kit = Platformer), projects, NewProjectSheet, kits, tips key per kit |
| 2 Build | `builder/catalog.ts`, `race/raceDrawer.ts`, `BuildDrawer.tsx`, `Inspector.tsx`, `workshop/knobs.ts`, `KnobsCard.tsx`, `builder/placement.ts`, `race/carPresets.ts`, `race/screens/LapsChip.tsx` | Drawer groups Track / Racers / Start / My bricks; Car card: 4 sliders, Kart / Drifty / On rails, grouped "More sliders"; chip says "Laps work" or one of `RACE_LOOP_REASON_TEXT`; Car kept out of Barriers, faces along the track; finish line direction control | race catalog incl. the `'B'` regression; Kart = `CAR_KNOBS` exactly, Drifty / On rails follow `CAR_FEEL_PRESETS` (`car.ts:76`) with ×2/×4; chip reasons; placement |
| 3 Code | `core/editor/toolbox.ts`, `code/sections.ts`, `code/layers.ts`, `race/carBrick.ts` (labels and a `carDrivingLabels` export only, no numbers), `CodeColumn.tsx`, `PowersBar.tsx`, `code/plainScratch.ts` | Racing category with the 5 blocks in race; landing/gravity blocks hidden; Platformer palette identical; Car's code: "When I finish my last lap", kid scripts, "How I drive · N"; no "+ Power" and no Platformer starting points in race | Platformer toolbox snapshot + race contents; sections (fold count = labels, kid script stays on top, remixed Car folds); CodeEditor.sections with the Car; carBrick and race feel tests green |
| 4 Play | `Stage.tsx` (after the contract), `stage/renderer.ts`, `stage/sky.ts`, `StageControls.tsx`, `race/screens/RaceHud.tsx`, `race/screens/RaceTouch.tsx`, `src/platformer/race/RaceTouchControls.tsx`, `core/race.ts` (export `racePlace` only) | Camera follows the Car; keys and Steer / Gas / Brake drive it; HUD: countdown (mirrors the Starter), "Lap x/N", place; results card with Race again and Keep building; grass; turns take the short way | 179 → -179 blend; camera follows a remixed Car; HUD vs `createBeginnerRace`; Gas presses up and releases on unmount; `racePlace` = `race_myplace` |

## D. Risks

- **No upgrade path for the Car.** The fold matches saved labels, so later label changes drop old Cars out of "How I
  drive". Freeze `carBrick.ts` before release and pin its fingerprint as the first `EARLIER_CAR_FINGERPRINTS`. Fix the
  colon-less label "Split my speed…" first (`splitLabel` would show all 68 characters).
- Platformer-only behaviour to swap: `playRules`' Hero gate and `NO_GOAL_NOTE`; `PlayFeedback`'s coins and jump hint;
  the shared tips key; TestRoom's helper Hero (hide "Just this brick" in race).
- `legacySave.ts` rewrites old grid characters (`'U'`): skip saves that have a kit.
- Gravity is off per brick (`carBrick.ts:220-222`), not per kit: filter starting points by kit.
- Engine gaps: the finish direction is per brick (first finish brick, `race.ts:69-71`) and no brick shows an arrow;
  place is private (`race.ts:215`); `raceDesign` returns no workspaces; presets not yet converted; cars drive through
  each other; the Starter can be off camera, so the HUD carries the countdown.
- `kits.test` asserts race can't run; update when `ready` flips. The 30-project per-browser limit is shared across kits.
- "Hackable Platformer" copy also lives in `classroom/contracts.ts`, `InviteSheet.tsx`, `ShelfTab.tsx`, `HelpPage.tsx`
  (left for later).
