# Code Lab redesign — October 28, 2026

What changed in `/2d/lab/next`, following the agreed direction in `docs/qa/code-lab-on-main/UX-AUDIT.md` and the mock
boards (https://claude.ai/artifact/KG4VNmSi1dQyEHUGtuajJM). This is not deployed, and students are not linked to it.

## The shell

- **Build · Code · Play** at the top center (keys 1 2 3), with a sliding highlight. The header's own Build | Play
  switch is replaced through a new `modeSwitch` slot on `AppHeader`.
- **One shell** (`studio/screen/StudioShell.tsx`). The level is a single Stage that stays mounted in every screen.
  The columns around it slide, and the level resizes with them (240 ms).
  - **Build:** the Bricks drawer, the level at its full height (it used to sit small in the middle), and an
    inspector on the right while something is selected.
  - **Code:** the palette and scripts; the level at the top right with Pause, Restart and "Whole level / Just this
    brick"; "In this level" below it.
  - **Play:** the level fills the screen, and the keys hint sits at the bottom, clear of the controls.

## Build

- **Select is the default tool.** Picking a brick arms painting, and Select, Done, Esc or picking it again goes
  back. The paint strip shows only while painting or erasing.
- **The inspector** (`Inspector.tsx`, which replaces the old card):
  - real Sliders · Look tabs;
  - "Every Walker / Just this one";
  - "2 in this level";
  - values rounded for display (8.125 shows as 8.1);
  - "Open its code".
- Double-clicking a selected brick opens its code.
- The selection outline is gold and pulses once.

## Code

- **One editor.** The Workshop, its separate toolbar and its Test room are gone. "Just this brick" runs the old test
  room inside Code's level preview.
- **A light editor:** a light Blockly theme (`CODE_LIGHT_THEME`) plus `code/light.css`, and light Costumes and Sounds
  (`assets/light.css`, scoped to Code mode).
- **The brick's name sits at the top** with a quiet chip instead of the remix banner:
  - "Built-in · change a block to make it yours";
  - "Your own Walker" after a remix.
- **"Restart to try your changes"** shows only for real code changes. The editor's automatic tidy on open no longer
  counts as one.

## New brick

- **One step.** + New brick (in the drawer or in "In this level") makes "My brick 1" and opens it in Code. The name
  is already selected, so typing replaces it. There are no modals and no word list.
- **"Start from…" chips** (Walker, Coin, Spring, Goal) sit in the empty script area. They copy blocks and costumes,
  and the brick keeps its name.
- **Names must stay unique,** because code finds bricks by name and the save check rejects duplicates.
  - A taken name becomes "Walker 2".
  - The hint says so while typing.
- Renaming means clicking the name. Built-in bricks keep their names.
- **Note:** this replaces the old rule of picked word lists only, with no typed names. A name is limited to 24
  characters.

## Tablet and phone

- **Tablet (768–1180 px):** narrower columns, and the mode switch sits beside the tools.
- **Phone:**
  - Build and Play only; Code says "Code needs a bigger screen".
  - Bricks opens as a bottom sheet.
  - The inspector is a bottom sheet.
  - The header is one row.

## Motion

- Every animation runs 150–250 ms, ease-out:
  - columns slide;
  - panels fade and rise;
  - Code eases in;
  - tabs slide their underline;
  - selection pulses once;
  - running blocks glow (unchanged).
- Everything is off under reduced motion.

## Checked

- `npx vitest run`: 260 files, 2,894 tests passed. The new tests are `screen/StudioShell.test.tsx` (ported from the
  Builder tests) and `screen/Inspector.test.tsx`.
- `tsc` passes for the app, platformer-core and brick-core. `npm run build` passes.
- In the browser at 1440×900, 1024×768 and 375×812:
  - selecting, the inspector and Open its code;
  - Code on the Hero, Walker and Coin;
  - Just this brick;
  - a new brick, renaming it, and Start from Coin;
  - painting, the strip, and Esc back to Select;
  - double-clicking to open code;
  - Play;
  - the phone sheets.
- No console errors.

## Known

- During dev hot reloads, "Restart to try your changes" twice showed with no change. It did not happen from a clean
  load, on a fresh starter, or on the saved playtest project.
- A new brick also shows the Restart note, because the running level does not have it yet.

## Screenshots

`01-build-inspector.jpg`, `02-code.jpg` and `03-new-brick.jpg` were taken at 1440×900;
`05-phone-inspector.jpg` and `06-phone-bricks.jpg` at 375×812.
