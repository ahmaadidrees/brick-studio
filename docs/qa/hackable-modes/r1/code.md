# R1 lane 3: Code (November 2, 2026)

This lane is on `claude/racing-r1-code`, starting from a202bb8. The code is in commit f9100a3. Nothing was pushed, merged or deployed.

## What changed

- **The palette (`core/editor/toolbox.ts`).**
  - `createContinuousToolbox` now takes the kit (`kit`) or a palette (`palette: { racing, hide }`), which is the same shape as `KitScreens.toolbox`. A palette passed in wins over the kit.
  - Race projects get a **Racing** category, placed just before Platformer.
    - It is drawn in `CATEGORY_COLORS.race` with the extension-style header.
    - It starts with a "Racing blocks" label, then: when I finish a lap, then laps done and my place, then ground under me and direction along the track.
  - Some Platformer blocks are hidden in a race (`RACE_PALETTE.hide`). They only mean something with gravity and a floor, and a car seen from above never lands or stands on anything:
    - `platformer_whenland`
    - `platformer_whenleaveground`
    - `platformer_setgravity`
    - `platformer_onground`
    - `platformer_setonground`
  - Separators left stranded by the hidden blocks are tidied away.
  - Scripts that already use a hidden block keep it. For example, the Car's own "no gravity" still works; the block just isn't offered in the palette.
  - Kept on purpose: over and over, when I bump, solid, the speed blocks, and the self-move blocks. The Car uses all of them.
  - The Stage gets no Racing category, just as it gets no Motion or Platformer.
  - The Platformer palette and the Platformer Stage palette are byte-identical to a202bb8, and a test pins them.
- **The Car's Code (`code/sections.ts`).**
  - `brick_car` opens like the Hero, with one entry: "How I drive · 10 scripts". It folds the Car's 10 "over and over" scripts.
  - The top view keeps:
    - When the race starts
    - When the countdown says go
    - When I finish my last lap
    - the "Drive and bounce off barriers" My Block, hidden like the Hero's
    - any script the kid made
  - The trail reads e.g. "Car's scripts › How I drive › Steer". A remixed Car shows "My Car's scripts".
  - A remix, or a copy of one under its own id, still folds because the fold is matched through `remixOf`.
  - `brick_racer` folds the same way: its 9 scripts, including "Drive along the track".
- **`race/carBrick.ts` (labels only).**
  - "Split my speed into forward…" is now "Split my speed: forward (the way I point) and sideways (sliding)", so the list shows "Split my speed".
  - New: `CAR_DRIVING_HATS` and `carDrivingLabels()`, read from `createCarWorkspace`. I also added `racerDrivingLabels()`.
  - No numbers or blocks changed: the blocks fingerprint is still `f3157bf8`.
- **`code/layers.ts`.** `plainLabel` now draws "each tick" as **"each moment"**, not "over and over", because "stop some of a slide over and over" reads wrong. It is display-only, like the Hero's. No Car or racer label shows "tick" any more.
- **"+ Power" (`CodeColumn.tsx`, `PowersBar.tsx`).**
  - `PowersBar` takes `canAdd`. In a race (`screens.powers` false) there is no "+ Power".
  - A power that a brick already has, for example from a file, still shows so it can be switched off or taken off.
  - Race has no starting points, as the contract's `codeStarts: []` already set up. A test now covers it.

## Tests

| Area | What they check |
|---|---|
| `toolbox.test.ts` (+5) | The Platformer pin (JSON length + FNV, for the kit, no kit, 3D and the Stage); the race's Racing contents and colour; hidden blocks and the Platformer category's exact items; the race Stage; `KIT_SCREENS.*.toolbox` equals `RACE_PALETTE` / `PLATFORMER_PALETTE` |
| `sections.test.ts` (+6) | Fold count = labels; top-view scripts; kid scripts stay on top; short names; remixed Car; racer |
| `CodeEditor.carSections.test.tsx` (new) | Entry, list, trail, Back; "My Car" folds and keeps the kid's script on top |
| `carBrick.test.ts` (+2) | **Pins the Car**: fingerprint `f3157bf8`, racer `3f8004eb`, and all 14 labels in order (`CAR_LABELS_R1`) |
| `layers.test.ts` (+1) | The Car's plain words |
| `CodeColumn.test.tsx` (new) | Race: no "+ Power", no starting points, an existing power still shows. Platformer: unchanged |

- **Gate:** `tsc -b` is clean.
- `vitest run src/platformer src/projects src/pages` gave 1934 passed and 25 expected fails, plus 9 failures. All 9 were timeouts under load, except one "How I move" lookup in `CodeEditor.sections`.
- Rerun alone, every failing file passes: `CodeEditor.sections`, `carSections`, `CodeColumn`, `loadFailure`, `perf` and `fileRoundTrip`.
- The carBrick, kitScreens and `carFeel` (RACE_FEEL) tests are green.

## Integrator requests

1. **`CodeEditor.tsx:224`:** pass the descriptor's palette.
   ```ts
   createContinuousToolbox(ctx, { isStage, kit: designKit(design), palette: screensFor(design).toolbox })
   ```
   This is optional: the kit alone already gives the same palette, and a test keeps the two equal.
2. **`kitScreens.ts` race `toolbox`:** use `RACE_PALETTE` from `core/editor/toolbox` so the list lives in one place. Keep the literal if kitScreens must not import Blockly code (`toolbox.ts` imports Blockly).
3. **`remix.ts`:** before release, add `EARLIER_CAR_FINGERPRINTS: string[] = []`, with a comment pointing at the pin in `carBrick.test.ts`.
   - The fingerprint ignores labels, so a future Car upgrade must also compare labels (the pinned list) to catch label-only changes.

## Not done

- **No race starting point.** "Start from Boost pad" or "Start from Barrier" could make sense, but those are grid bricks that paint. A brick that would make sense is "Start from Computer racer" (follows the track). Not in R1.
- **No `plainScratch` cards for the Racing blocks,** so they show no "?" yet.
- The knob variable "boost ticks" still says "ticks". It is a variable name in `CAR_KNOBS`, shared with lane 2's sliders, so I left it.
- Not checked in a browser.
